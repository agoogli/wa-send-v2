import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { StatoMessaggio } from '@prisma/client';
import * as cheerio from 'cheerio';
import { MessagesGateway } from './messages.gateway';

export interface ParsedMessage {
  testo: string;
  nominativo: string;
  cellulare: string;
  link: string;
  codice: string;
  idApp: string;
}

@Injectable()
export class MessagesService implements OnModuleInit {
  private readonly logger = new Logger(MessagesService.name);
  private queue: { id: number; cellulare: string; testo: string; nominativo?: string; link?: string }[] = [];
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly gateway: MessagesGateway,
  ) {}

  async onModuleInit() {
    // Reset all PENDING messages back to IMPORTATO on startup
    const updated = await this.prisma.rigaMessaggio.updateMany({
      where: { stato: StatoMessaggio.PENDING },
      data: { stato: StatoMessaggio.IMPORTATO },
    });
    if (updated.count > 0) {
      this.logger.log(`Resettati ${updated.count} messaggi da PENDING a IMPORTATO all'avvio`);
    }
  }

  /**
   * Parsa un file HTML (formato SMS.html) contenente una tabella con i messaggi.
   * Ordine colonne nel file:
   *   0: Messaggio    → testo
   *   1: Cliente      → nominativo
   *   2: Codice       → codice
   *   3: Da pagare     (ignorata)
   *   4: Scuola        (ignorata)
   *   5: Corso/Classe  (ignorata)
   *   6: Classe/Sezione(ignorata)
   *   7: Cellulare    → cellulare
   *   8: Indirizzo     (ignorata)
   *   9: Città         (ignorata)
   *  10: Provincia     (ignorata)
   *  11: Link         → link
   *  12: ID-APP       → idApp
   *  13: Risposta      (ignorata)
   */
  parseHtml(html: string): ParsedMessage[] {
    const $ = cheerio.load(html);
    const messages: ParsedMessage[] = [];

    $('table tr').each((index, row) => {
      // Salta l'intestazione
      if (index === 0) return;

      const cells = $(row).find('td');
      if (cells.length >= 8) { // Almeno fino al cellulare (indice 7)
        const testo = $(cells[0]).text().trim();
        const nominativo = $(cells[1]).text().trim();
        const codice = $(cells[2]).text().trim();
        const cellulare = $(cells[7]).text().trim();
        const link = cells.length > 11 ? $(cells[11]).text().trim() : '';
        const idApp = cells.length > 12 ? $(cells[12]).text().trim() : '';

        // Includiamo la riga se c'è almeno un dato per poter effettuare la validazione
        if (testo || nominativo || cellulare) {
          messages.push({ testo, nominativo, cellulare, link, codice, idApp });
        }
      }
    });

    this.logger.log(`Parsati ${messages.length} messaggi dal file HTML`);
    return messages;
  }

  /**
   * Valida i dati di un messaggio importato.
   */
  validateMessage(m: ParsedMessage): { isValid: boolean; error?: string; cleanedCellulare?: string } {
    if (!m.testo) {
      return { isValid: false, error: 'Testo del messaggio vuoto' };
    }
    if (!m.nominativo) {
      return { isValid: false, error: 'Nominativo cliente mancante' };
    }
    if (!m.cellulare) {
      return { isValid: false, error: 'Numero cellulare mancante' };
    }

    // Pulisce il numero: tiene solo cifre e il '+' iniziale
    let clean = m.cellulare.replace(/[^\d+]/g, '');

    // Normalizza numeri italiani
    if (clean.startsWith('+39')) {
      clean = clean.substring(1);
    }
    if (clean.startsWith('0039')) {
      clean = '39' + clean.substring(4);
    }

    // Se inizia con 3 ed è lungo 9 o 10 cifre (tipico cellulare italiano senza prefisso int.), aggiunge il prefisso 39
    if (/^3\d{8,9}$/.test(clean)) {
      clean = '39' + clean;
    }

    // Verifica formato: deve essere composto solo da cifre (8-15 cifre)
    if (!/^\d{8,15}$/.test(clean)) {
      return { isValid: false, error: `Numero cellulare non valido: "${m.cellulare}"` };
    }

    return { isValid: true, cleanedCellulare: clean };
  }

  /**
   * Upload e parsing HTML, poi salva i messaggi nel database
   * creando un nuovo ImportMessaggio con le sue RigheMessaggio.
   */
  async uploadAndParse(html: string) {
    const parsed = this.parseHtml(html);

    // Recupera l'URL base e il pattern del template da Configurazione per formattare il testo iniziale nel DB
    const configUrlRow = await this.prisma.configurazione.findUnique({
      where: { chiave: 'URL_LYBRO_APP' },
    });
    const baseUrl = configUrlRow?.valore || '';

    const configTplRow = await this.prisma.configurazione.findUnique({
      where: { chiave: 'TEMPLATE_AVVISO_LIBRI_PRENOTATI' },
    });
    const templatePattern = configTplRow?.valore || 'Gentile cliente, la informiamo che sono disponibili nuovi libri da Lei prenotati per {{1}}. Maggiori dettagli al link > {{2}}. Cordiali saluti.';

    const righeData = parsed.map((m) => {
      const val = this.validateMessage(m);
      const fullUrl = m.link && baseUrl ? `${baseUrl}${m.link.trim()}` : m.link;
      const formattedTesto = m.nominativo
        ? templatePattern.replace('{{1}}', m.nominativo).replace('{{2}}', fullUrl)
        : m.testo;

      return {
        testo: formattedTesto,
        nominativo: m.nominativo,
        cellulare: val.cleanedCellulare || m.cellulare,
        link: m.link,
        codice: m.codice,
        idApp: m.idApp,
        stato: val.isValid ? StatoMessaggio.IMPORTATO : StatoMessaggio.ERRORE,
        errore: val.error || null,
      };
    });

    const importRecord = await this.prisma.importMessaggio.create({
      data: {
        righe: {
          create: righeData,
        },
      },
      include: {
        righe: true,
      },
    });

    return {
      imported: importRecord.righe.filter((r) => r.stato === StatoMessaggio.IMPORTATO).length,
      errors: importRecord.righe.filter((r) => r.stato === StatoMessaggio.ERRORE).length,
      importId: importRecord.id,
      messages: importRecord.righe,
    };
  }

  /**
   * Recupera tutte le righe messaggio, opzionalmente filtrate per import.
   */
  async findAll(importId?: number) {
    const where = importId ? { idImportMessaggio: importId } : {};
    return this.prisma.rigaMessaggio.findMany({
      where,
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Recupera gli ultimi 10 import con le relative righe.
   */
  async findAllImports() {
    return this.prisma.importMessaggio.findMany({
      take: 10,
      orderBy: { id: 'desc' },
      include: {
        righe: {
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  /**
   * Elimina un import e tutte le sue righe associate (cascata).
   * È possibile eliminare l'import solo se non ci sono messaggi inviati o in corso di invio.
   */
  async deleteImport(importId: number) {
    const hasSent = await this.prisma.rigaMessaggio.findFirst({
      where: {
        idImportMessaggio: importId,
        stato: {
          in: [StatoMessaggio.INVIATO, StatoMessaggio.PENDING],
        },
      },
    });

    if (hasSent) {
      throw new Error('Impossibile eliminare un import che contiene messaggi inviati o in corso di invio');
    }

    return this.prisma.importMessaggio.delete({
      where: { id: importId },
    });
  }

  /**
   * Invia tutti i messaggi IMPORTATO di un determinato import via WhatsApp.
   */
  async sendAll(importId: number, messageIds?: number[]) {
    if (!importId) {
      throw new Error('ID Importazione obbligatorio per l\'invio dei messaggi');
    }

    const where: Record<string, any> = {
      stato: StatoMessaggio.IMPORTATO,
      idImportMessaggio: importId,
    };
    if (messageIds && messageIds.length > 0) {
      where.id = { in: messageIds };
    }

    const pending = await this.prisma.rigaMessaggio.findMany({ where });

    if (pending.length === 0) {
      return { success: true, count: 0 };
    }

    // Update all matching messages to PENDING in database
    await this.prisma.rigaMessaggio.updateMany({
      where: {
        id: { in: pending.map((m) => m.id) },
      },
      data: { stato: StatoMessaggio.PENDING },
    });

    // Queue messages in-memory
    const jobs = pending.map((m) => ({
      id: m.id,
      cellulare: m.cellulare,
      testo: m.testo,
      nominativo: m.nominativo,
      link: m.link,
    }));
    this.queue.push(...jobs);

    // Start processing queue in the background
    this.processQueue();

    return { success: true, count: pending.length };
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) continue;

        // Pausa minima configurabile per l'invio via API ufficiale (default 100ms)
        const delayMs = parseInt(process.env.SEND_DELAY_MS || '100', 10);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // Check if message still exists and is PENDING in DB
        const msg = await this.prisma.rigaMessaggio.findUnique({
          where: { id: job.id },
        });

        if (!msg || msg.stato !== StatoMessaggio.PENDING) {
          continue;
        }

        const result = await this.whatsapp.sendMessage(
          job.cellulare,
          job.testo,
          job.nominativo,
          job.link,
        );

        const newStato = result.success
          ? StatoMessaggio.INVIATO
          : StatoMessaggio.ERRORE;

        const updated = await this.prisma.rigaMessaggio.update({
          where: { id: job.id },
          data: {
            stato: newStato,
            testo: result.fullText || msg.testo,
            errore: result.error || null,
            inviato: new Date(),
          },
        });

        // Notify client
        this.gateway.emitMessageUpdate(updated);
      }
    } catch (error) {
      this.logger.error('Errore durante l\'invio dei messaggi in background', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
