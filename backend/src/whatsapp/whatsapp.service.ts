import { Injectable, Logger } from '@nestjs/common';

export type ConnectionStatus = 'disconnected' | 'connected';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly status: ConnectionStatus = 'connected'; // Always connected for SendApp official API

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
   * - {{2}} = URL completo (es. "https://smslnk.it/pl/?t=qO16IHZ")
   */
  async sendMessage(
    recipient: string,
    content: string,
    nominativo?: string,
    link?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const apiToken = process.env.SENDAPP_API_TOKEN;
    const apiUrl = process.env.SENDAPP_API_URL || 'https://official.sendapp.cloud/api';
    const templateName = process.env.SENDAPP_TEMPLATE_NAME || 'avviso_ritiro_libri';
    const languageCode = process.env.SENDAPP_LANGUAGE_CODE || 'it';

    if (!apiToken || apiToken === 'YOUR_SENDAPP_API_TOKEN_HERE') {
      const errMsg = 'SENDAPP_API_TOKEN non configurato nel file .env';
      this.logger.error(errMsg);
      return { success: false, error: errMsg };
    }

    try {
      // 1. Parametro {{1}} = Nominativo cliente
      const param1 = (nominativo || '').trim();

      // 2. Parametro {{2}} = URL completo generato concatenando il codice dalla colonna "Link" (es. "https://smslnk.it/pl/?t=qO16IHZ")
      const rawLink = (link || '').trim();
      const param2 = rawLink
        ? (rawLink.startsWith('http://') || rawLink.startsWith('https://')
            ? rawLink
            : `https://smslnk.it/pl/?t=${rawLink}`)
        : '';

      // 3. Pulisce il numero di telefono (solo cifre, senza +)
      const cleanPhone = recipient.replace(/[^\d]/g, '');

      // 4. Prepara il payload per il template Meta tramite SendApp con 2 parametri posizionali
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

      const url = `${apiUrl.replace(/\/$/, '')}/send/template`;
      this.logger.log(`Invio messaggio template a ${cleanPhone} tramite SendApp...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
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
