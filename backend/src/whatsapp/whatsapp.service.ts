import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import makeWASocket, {
  DisconnectReason,
  WASocket,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private socket: WASocket | null = null;
  private qrDataUrl: string | null = null;
  private status: ConnectionStatus = 'disconnected';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.connect();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return this.qrDataUrl;
  }

  /**
   * Crea un AuthenticationState che legge/scrive le credenziali
   * e le chiavi Signal direttamente sulla tabella `sessioni` del DB.
   */
  private async useDbAuthState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    // Leggi creds dal DB oppure inizializza nuove credenziali
    const credsRow = await this.prisma.sessione.findUnique({
      where: { id: 'creds' },
    });

    const creds = credsRow
      ? JSON.parse(credsRow.data, BufferJSON.reviver)
      : initAuthCreds();

    const saveCreds = async () => {
      await this.prisma.sessione.upsert({
        where: { id: 'creds' },
        update: { data: JSON.stringify(creds, BufferJSON.replacer) },
        create: {
          id: 'creds',
          data: JSON.stringify(creds, BufferJSON.replacer),
        },
      });
    };

    const keys = {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const row = await this.prisma.sessione.findUnique({
            where: { id: `${type}-${id}` },
          });
          if (row) {
            let parsed = JSON.parse(row.data, BufferJSON.reviver);
            if (type === 'app-state-sync-key' && parsed) {
              parsed =
                proto.Message.AppStateSyncKeyData.fromObject(parsed);
            }
            result[id] = parsed;
          }
        }
        return result;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const dbKey = `${category}-${id}`;
            if (value) {
              await this.prisma.sessione.upsert({
                where: { id: dbKey },
                update: {
                  data: JSON.stringify(value, BufferJSON.replacer),
                },
                create: {
                  id: dbKey,
                  data: JSON.stringify(value, BufferJSON.replacer),
                },
              });
            } else {
              await this.prisma.sessione
                .delete({ where: { id: dbKey } })
                .catch(() => {
                  // chiave non esistente, ignora
                });
            }
          }
        }
      },
    };

    return {
      state: { creds, keys },
      saveCreds,
    };
  }

  async connect(): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') {
      return;
    }

    this.status = 'connecting';
    const { state, saveCreds } = await this.useDbAuthState();

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrDataUrl = await QRCode.toDataURL(qr);
        this.status = 'connecting';
        this.logger.log('QR code generato — scansiona col telefono');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.logger.warn(
          `Connessione chiusa (status: ${statusCode}). Riconnessione: ${shouldReconnect}`,
        );
        this.status = 'disconnected';
        this.qrDataUrl = null;
        this.socket = null;

        if (shouldReconnect) {
          setTimeout(() => this.connect(), 3000);
        }
      }

      if (connection === 'open') {
        this.logger.log('✅ WhatsApp connesso!');
        this.status = 'connected';
        this.qrDataUrl = null;
      }
    });
  }

  async sendMessage(
    recipient: string,
    content: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.socket || this.status !== 'connected') {
      return { success: false, error: 'WhatsApp non connesso' };
    }

    try {
      const jid = recipient.includes('@')
        ? recipient
        : `${recipient.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

      await this.socket.sendMessage(jid, { text: content });
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore sconosciuto';
      this.logger.error(`Invio fallito a ${recipient}: ${message}`);
      return { success: false, error: message };
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.status = 'disconnected';
      this.qrDataUrl = null;
    }
  }
}
