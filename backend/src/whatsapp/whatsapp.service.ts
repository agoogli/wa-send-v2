import { Injectable, Logger } from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import * as path from 'path';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private socket: WASocket | null = null;
  private qrDataUrl: string | null = null;
  private status: ConnectionStatus = 'disconnected';

  async onModuleInit() {
    await this.connect();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return this.qrDataUrl;
  }

  async connect(): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') {
      return;
    }

    this.status = 'connecting';
    const authDir = path.join(process.cwd(), 'auth_info');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

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
        this.logger.log('QR code generated — scan with your phone');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.logger.warn(
          `Connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`,
        );
        this.status = 'disconnected';
        this.qrDataUrl = null;
        this.socket = null;

        if (shouldReconnect) {
          setTimeout(() => this.connect(), 3000);
        }
      }

      if (connection === 'open') {
        this.logger.log('✅ WhatsApp connected!');
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
      return { success: false, error: 'WhatsApp is not connected' };
    }

    try {
      // Normalize phone number: ensure it ends with @s.whatsapp.net
      const jid = recipient.includes('@')
        ? recipient
        : `${recipient.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

      await this.socket.sendMessage(jid, { text: content });
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send message to ${recipient}: ${message}`);
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
