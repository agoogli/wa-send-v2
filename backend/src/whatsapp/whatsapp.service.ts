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

      const rawLink = (link || '').trim();

      // Testo reale del messaggio recapitato (sostituisce {{Nominativo}} / {{1}})
      const fullText = templatePattern
        .replace(/\{\{Nominativo\}\}/gi, param1)
        .replace(/\{\{1\}\}/g, param1);

      // 5. Pulisce il numero di telefono (solo cifre, senza +)
      const cleanPhone = recipient.replace(/[^\d]/g, '');

      // 6. Costruisce i componenti del template Meta (Body + Dynamic URL Button)
      const components: any[] = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: param1 },
          ],
        },
      ];

      // Se è presente il codice alfanumerico del link, mappa il parametro {{1}} del pulsante URL (index: 0)
      if (rawLink) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: rawLink },
          ],
        });
      }

      // 7. Prepara il payload per l'endpoint SendApp Meta Template
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
          components: components,
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

  /**
   * Effettua una chiamata alle Meta Graph API (conversation_analytics)
   * per recuperare il numero di messaggi consegnati e i costi stimati
   * per la categoria 'UTILITY' nel periodo specificato.
   */
  async getMetaUtilityAnalytics(startDateStr?: string, endDateStr?: string) {
    const wabaId = process.env.META_WABA_ID;
    const token = process.env.META_SYSTEM_USER_TOKEN || process.env.META_ACCESS_TOKEN;

    if (!wabaId || !token || wabaId === 'YOUR_META_WABA_ID' || token === 'YOUR_META_SYSTEM_USER_TOKEN') {
      return {
        configured: false,
        message: 'Variabili META_WABA_ID o META_SYSTEM_USER_TOKEN non configurate nel file .env',
        cost: 0,
        count: 0,
      };
    }

    try {
      const now = new Date();
      const start = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = endDateStr ? new Date(endDateStr) : new Date();

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const startUnix = Math.floor(start.getTime() / 1000);
      const endUnix = Math.floor(end.getTime() / 1000);

      const url = `https://graph.facebook.com/v20.0/${wabaId}/conversation_analytics` +
        `?start=${startUnix}&end=${endUnix}&granularity=DAILY` +
        `&dimensions=["CONVERSATION_CATEGORY"]` +
        `&metric_types=["COST","CONVERSATION_COUNT"]`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = resData.error?.message || `Errore HTTP ${response.status}`;
        this.logger.error(`Chiamata Analytics Meta fallita: ${errorMsg}`);
        return {
          configured: true,
          error: errorMsg,
          cost: 0,
          count: 0,
        };
      }

      let totalCost = 0;
      let totalCount = 0;

      if (resData.data && Array.isArray(resData.data)) {
        for (const entry of resData.data) {
          if (entry.data_points && Array.isArray(entry.data_points)) {
            for (const dp of entry.data_points) {
              if (dp.conversation_category === 'UTILITY') {
                if (typeof dp.cost === 'number') {
                  totalCost += dp.cost;
                }
                if (typeof dp.conversation_count === 'number') {
                  totalCount += dp.conversation_count;
                }
              }
            }
          }
        }
      }

      return {
        configured: true,
        cost: Math.round(totalCost * 100) / 100,
        count: totalCount,
      };
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Eccezione durante chiamata Analytics Meta: ${errorMsg}`);
      return {
        configured: true,
        error: errorMsg,
        cost: 0,
        count: 0,
      };
    }
  }
}

