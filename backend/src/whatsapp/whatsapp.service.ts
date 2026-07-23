import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ConnectionStatus = 'disconnected' | 'connected';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly status: ConnectionStatus = 'connected'; // Always connected for SendApp official API

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Inizializzato WhatsappService in modalità SendApp API Ufficiale');
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return null; // QR Code no longer needed for official API
  }

  async connect(): Promise<void> {
    this.logger.log('Tentativo di connessione (SendApp API è sempre pronta)');
  }

  async disconnect(): Promise<void> {
    this.logger.log('Disconnessione (No-op per SendApp API)');
  }

  /**
   * Invia un messaggio tramite le API di SendApp utilizzando i template ufficiali di Meta.
   *
   * Formato del Template raccomandato per Meta:
   * "Gentile cliente, la informiamo che sono disponibili nuovi libri da Lei prenotati per {{1}}. Maggiori dettagli al link > {{2}}. Cordiali saluti."
   *
   * - {{1}} = Nominativo cliente (es. "MANGIANTE ANGELO")
   * - {{2}} = URL completo generato dal valore URL_LYBRO_APP + codice alfanumerico (es. "https://smslnk.it/pl/?t=qO16IHZ")
   */
  async sendMessage(
    recipient: string,
    content: string,
    nominativo?: string,
    link?: string,
  ): Promise<{ success: boolean; error?: string; fullText?: string }> {
    const apiKey = process.env.SENDAPP_API_KEY;
    if (!apiKey) {
      const errMsg = 'Valore SENDAPP_API_KEY mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    const accountToken = process.env.SENDAPP_ACCOUNT_TOKEN;
    if (!accountToken) {
      const errMsg = 'Valore SENDAPP_ACCOUNT_TOKEN mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    const apiUrl = process.env.SENDAPP_API_URL;
    if (!apiUrl) {
      const errMsg = 'Valore SENDAPP_API_URL mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    const templateName = process.env.SENDAPP_TEMPLATE_NAME;
    if (!templateName) {
      const errMsg = 'Valore SENDAPP_TEMPLATE_NAME mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    const languageCode = process.env.SENDAPP_LANGUAGE_CODE;
    if (!languageCode) {
      const errMsg = 'Valore SENDAPP_LANGUAGE_CODE mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    const apiEndpoint = process.env.SENDAPP_API_ENDPOINT;
    if (!apiEndpoint) {
      const errMsg = 'Valore SENDAPP_API_ENDPOINT mancante nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    try {
      // 1. Parametro {{1}} = Nominativo cliente
      const param1 = (nominativo || '').trim();

      // 2. Recupera l'URL base dalla tabella Configurazione (chiave URL_LYBRO_APP)
      const configUrlRow = await this.prisma.configurazione.findUnique({
        where: { chiave: 'URL_LYBRO_APP' },
      });

      if (!configUrlRow || !configUrlRow.valore) {
        const errMsg = "Valore 'URL_LYBRO_APP' mancante nella tabella configurazioni";
        this.logger.error(errMsg);
        return { success: false, error: errMsg };
      }

      const baseUrl = configUrlRow.valore;

      // 3. Recupera il pattern del template dalla tabella Configurazione (chiave TEMPLATE_AVVISO_LIBRI_PRENOTATI)
      const configTplRow = await this.prisma.configurazione.findUnique({
        where: { chiave: 'TEMPLATE_AVVISO_LIBRI_PRENOTATI' },
      });

      if (!configTplRow || !configTplRow.valore) {
        const errMsg = "Valore 'TEMPLATE_AVVISO_LIBRI_PRENOTATI' mancante nella tabella configurazioni";
        this.logger.error(errMsg);
        return { success: false, error: errMsg };
      }

      const templatePattern = configTplRow.valore;

      // 4. Parametro {{2}} = URL completo concatenando il codice alfanumerico
      const rawLink = (link || '').trim();
      const param2 = rawLink ? `${baseUrl}${rawLink}` : '';

      // Testo reale completo del messaggio recapitato
      const fullText = templatePattern
        .replace('{{1}}', param1)
        .replace('{{2}}', param2);

      // 5. Pulisce il numero di telefono (solo cifre, senza +)
      const cleanPhone = recipient.replace(/[^\d]/g, '');

      // 6. Prepara il payload per l'endpoint SendApp Meta Template
      const payload = {
        apikey: apiKey,
        token: accountToken,
        number: cleanPhone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: param1 },
                { type: 'text', text: param2 },
              ],
            },
          ],
        },
      };

      const normalizedEndpoint = apiEndpoint.startsWith('/') ? apiEndpoint : `/${apiEndpoint}`;
      const url = `${apiUrl.replace(/\/$/, '')}${normalizedEndpoint}`;
      this.logger.log(`Invio messaggio template a ${cleanPhone} tramite SendApp Meta API...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.status === 'error') {
        const errorMsg = data.message || `Errore HTTP ${response.status}`;
        this.logger.error(`Invio a ${cleanPhone} fallito: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      this.logger.log(`Messaggio template inviato con successo a ${cleanPhone} (ID: ${data.message_id || 'N/A'})`);
      return { success: true, fullText };
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Invio fallito a ${recipient}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}

