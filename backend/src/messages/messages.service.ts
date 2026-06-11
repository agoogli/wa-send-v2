import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
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
   * Parsa un file HTML contenente una tabella con i messaggi.
   * Formato atteso: <table> con righe dove le colonne sono:
   *   1: nominativo, 2: cellulare, 3: testo, 4: link (opz),
   *   5: codice (opz), 6: idApp (opz)
   */
  parseHtml(html: string): ParsedMessage[] {
    const $ = cheerio.load(html);
    const messages: ParsedMessage[] = [];

    $('table tr').each((_index, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 3) {
        const nominativo = $(cells[0]).text().trim();
        const cellulare = $(cells[1]).text().trim();
        const testo = $(cells[2]).text().trim();
        const link = cells.length > 3 ? $(cells[3]).text().trim() : '';
        const codice = cells.length > 4 ? $(cells[4]).text().trim() : '';
        const idApp = cells.length > 5 ? $(cells[5]).text().trim() : '';

        if (cellulare && testo) {
          messages.push({ testo, nominativo, cellulare, link, codice, idApp });
        }
      }
    });

    this.logger.log(`Parsati ${messages.length} messaggi dal file HTML`);
    return messages;
  }

  /**
   * Upload e parsing HTML, poi salva i messaggi nel database
   * creando un nuovo ImportMessaggio con le sue RigheMessaggio.
   */
  async uploadAndParse(html: string) {
    const parsed = this.parseHtml(html);

    const importRecord = await this.prisma.importMessaggio.create({
      data: {
        righe: {
          create: parsed.map((m) => ({
            testo: m.testo,
            nominativo: m.nominativo,
            cellulare: m.cellulare,
            link: m.link,
            codice: m.codice,
            idApp: m.idApp,
            stato: 'PENDING',
          })),
        },
      },
      include: {
        righe: true,
      },
    });

    return {
      imported: importRecord.righe.length,
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
   * Invia tutti i messaggi PENDING di un determinato import via WhatsApp.
   */
  async sendAll(importId?: number) {
    const where: Record<string, unknown> = { stato: 'PENDING' };
    if (importId) {
      where.idImportMessaggio = importId;
    }

    const pending = await this.prisma.rigaMessaggio.findMany({ where });

    const results = [];

    for (const msg of pending) {
      const result = await this.whatsapp.sendMessage(msg.cellulare, msg.testo);

      const newStato = result.success ? 'SENT' : 'FAILED';

      await this.prisma.rigaMessaggio.update({
        where: { id: msg.id },
        data: { stato: newStato },
      });

      results.push({
        id: msg.id,
        cellulare: msg.cellulare,
        stato: newStato,
        error: result.error,
      });
    }

    return results;
  }
}
