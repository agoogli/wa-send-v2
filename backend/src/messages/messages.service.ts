import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { StatoMessaggio } from '@prisma/client';
import * as cheerio from 'cheerio';

export interface ParsedMessage {
  testo: string;
  nominativo: string;
  cellulare: string;
  link: string;
  codice: string;
  idApp: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

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

    const righeData = parsed.map((m) => {
      const val = this.validateMessage(m);
      return {
        testo: m.testo,
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
   * Recupera tutti gli import.
   */
  async findAllImports() {
    return this.prisma.importMessaggio.findMany({
      orderBy: { id: 'desc' },
      include: {
        _count: { select: { righe: true } },
      },
    });
  }

  /**
   * Invia tutti i messaggi IMPORTATO di un determinato import via WhatsApp.
   */
  async sendAll(importId?: number) {
    const where: Record<string, unknown> = { stato: StatoMessaggio.IMPORTATO };
    if (importId) {
      where.idImportMessaggio = importId;
    }

    const pending = await this.prisma.rigaMessaggio.findMany({ where });

    const results = [];

    for (const msg of pending) {
      // Segna come PENDING (invio in corso)
      await this.prisma.rigaMessaggio.update({
        where: { id: msg.id },
        data: { stato: StatoMessaggio.PENDING },
      });

      const result = await this.whatsapp.sendMessage(msg.cellulare, msg.testo);

      const newStato = result.success
        ? StatoMessaggio.INVIATO
        : StatoMessaggio.ERRORE;

      await this.prisma.rigaMessaggio.update({
        where: { id: msg.id },
        data: {
          stato: newStato,
          errore: result.error || null,
        },
      });

      results.push({
        id: msg.id,
        cellulare: msg.cellulare,
        stato: newStato,
        errore: result.error,
      });
    }

    return results;
  }
}
