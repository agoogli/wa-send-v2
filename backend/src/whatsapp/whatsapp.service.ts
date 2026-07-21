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
   * Pulisce ed estrae il titolo del libro dal messaggio originale.
   */
  private extractBookTitle(content: string, nominativo?: string, link?: string): string {
    let clean = content;

    // Rimuove il saluto e i prefissi del tipo "Buongiorno e' arrivato l'unico libro prenotato "
    clean = clean.replace(
      /^buongiorno[\s,']*(?:e['\s]*arrivato|sono\s+arrivati)?\s*(?:l'unico|i|il|i\s+libri|il\s+libro)?\s*libr[oi]\s*prenotat[oi]\s*/i,
      ''
    );

    // Rimuove il nominativo se presente
    if (nominativo) {
      const nameEscaped = nominativo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const nameRegex = new RegExp(`\\.?\\s*\\.?\\s*${nameEscaped}.*`, 'i');
      clean = clean.replace(nameRegex, '');
    }

    // Rimuove il link se presente (preceduto da >)
    if (link) {
      const linkEscaped = link.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const linkRegex = new RegExp(`>\\s*${linkEscaped}.*`, 'i');
      clean = clean.replace(linkRegex, '');
    }

    // Rimuove frecce, punti e spazi residui
    clean = clean.replace(/\.?\s*>\s*$/, '');
    clean = clean.replace(/^\s*\.?\s*\.?\s*/, '');
    clean = clean.trim();

    return clean;
  }

  /**
   * Invia un messaggio tramite le API di SendApp utilizzando i template ufficiali di Meta.
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
      // 1. Determina singolare o plurale
      const isPlural = content.toLowerCase().includes('arrivati') || content.toLowerCase().includes('libri');
      const verbPrefix = isPlural 
        ? 'sono arrivati i libri da Lei prenotati:' 
        : 'è arrivato il libro da Lei prenotato:';

      // 2. Estrae il titolo/titoli del libro
      const bookTitle = this.extractBookTitle(content, nominativo, link);

      // 3. Pulisce il numero di telefono (solo cifre, senza +)
      const cleanPhone = recipient.replace(/[^\d]/g, '');

      // 4. Prepara il payload per il template Meta tramite SendApp
      // I parametri sono posizionali e corrispondono a {{1}}, {{2}}, {{3}}, {{4}} nel template
      const payload = {
        phone: cleanPhone,
        template: {
          name: templateName,
          language: languageCode,
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: verbPrefix },
                { type: 'text', text: bookTitle },
                { type: 'text', text: nominativo || '' },
                { type: 'text', text: link || '' },
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
