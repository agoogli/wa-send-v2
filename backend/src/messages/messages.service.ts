import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageStatus } from '@prisma/client';
import * as cheerio from 'cheerio';

export interface ParsedMessage {
  recipient: string;
  content: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Parse an HTML file containing a table with messages.
   * Expected format: <table> with rows where:
   *   - Column 1: phone number (recipient)
   *   - Column 2: message content
   */
  parseHtml(html: string): ParsedMessage[] {
    const $ = cheerio.load(html);
    const messages: ParsedMessage[] = [];

    $('table tr').each((_index, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const recipient = $(cells[0]).text().trim();
        const content = $(cells[1]).text().trim();
        if (recipient && content) {
          messages.push({ recipient, content });
        }
      }
    });

    this.logger.log(`Parsed ${messages.length} messages from HTML`);
    return messages;
  }

  /**
   * Upload and parse HTML, then save messages to the database.
   */
  async uploadAndParse(html: string) {
    const parsed = this.parseHtml(html);

    // Clear old messages before importing new ones
    await this.prisma.message.deleteMany();

    const created = await this.prisma.message.createMany({
      data: parsed.map((m) => ({
        recipient: m.recipient,
        content: m.content,
        status: MessageStatus.PENDING,
      })),
    });

    return {
      imported: created.count,
      messages: await this.prisma.message.findMany({
        orderBy: { id: 'asc' },
      }),
    };
  }

  /**
   * Retrieve all messages from the database.
   */
  async findAll() {
    return this.prisma.message.findMany({ orderBy: { id: 'asc' } });
  }

  /**
   * Send all pending messages via WhatsApp.
   */
  async sendAll() {
    const pending = await this.prisma.message.findMany({
      where: { status: MessageStatus.PENDING },
    });

    const results = [];

    for (const msg of pending) {
      const result = await this.whatsapp.sendMessage(msg.recipient, msg.content);

      await this.prisma.message.update({
        where: { id: msg.id },
        data: {
          status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
          error: result.error || null,
        },
      });

      results.push({
        id: msg.id,
        recipient: msg.recipient,
        status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
        error: result.error,
      });
    }

    return results;
  }
}
