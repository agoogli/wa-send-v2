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
  ): Promise<{ success: boolean; error?: string }> {
    const apiToken = process.env.SENDAPP_API_TOKEN || process.env.SENDAPP_API_KEY;
    const apiUrl = process.env.SENDAPP_API_URL || 'https://official.sendapp.cloud/api';
    const templateName = process.env.SENDAPP_TEMPLATE_NAME || 'avviso_libri_prenotati';
    const languageCode = process.env.SENDAPP_LANGUAGE_CODE || 'it';
    const apiEndpoint = process.env.SENDAPP_API_ENDPOINT || '/send/template';

    if (!apiToken || apiToken === 'YOUR_SENDAPP_API_TOKEN_HERE') {
      const errMsg = 'SENDAPP_API_TOKEN non configurato nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    try {
      // 1. Parametro {{1}} = Nominativo cliente
      const param1 = (nominativo || '').trim();

      // 2. Recupera l'URL base dalla tabella Configurazione (chiave URL_LYBRO_APP)
      const configRow = await this.prisma.configurazione.findUnique({
        where: { chiave: 'URL_LYBRO_APP' },
      });
      const baseUrl = configRow?.valore || 'https://smslnk.it/pl/?t=';

      // 3. Parametro {{2}} = URL completo concatenando il codice alfanumerico
      const rawLink = (link || '').trim();
      const param2 = rawLink ? `${baseUrl}${rawLink}` : '';

      // 4. Pulisce il numero di telefono (solo cifre, senza +)
      const cleanPhone = recipient.replace(/[^\d]/g, '');

      // 5. Prepara il payload per il template Meta tramite SendApp con 2 parametri posizionali
      const payload = {
        phone: cleanPhone,
        template: {
          name: templateName,
          language: languageCode,
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
        show_in_chat: true,
      };

      const normalizedEndpoint = apiEndpoint.startsWith('/') ? apiEndpoint : `/${apiEndpoint}`;
      const url = `${apiUrl.replace(/\/$/, '')}${normalizedEndpoint}`;
      this.logger.log(`Invio messaggio template a ${cleanPhone} tramite SendApp...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
          'X-API-Key': apiToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.message || `Errore HTTP ${response.status}`;
        this.logger.error(`Invio a ${cleanPhone} fallito: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      this.logger.log(`Messaggio template inviato con successo a ${cleanPhone}`);
      return { success: true };
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Invio fallito a ${recipient}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}

