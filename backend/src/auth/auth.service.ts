import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates if the input password matches the SHA-512 hashed password
   * stored in the Configurazione table under the key 'PASSWORD'.
   */
  async validatePassword(password: string): Promise<boolean> {
    const config = await this.prisma.configurazione.findUnique({
      where: { chiave: 'PASSWORD' },
    });

    if (!config) {
      this.logger.error("Chiave 'PASSWORD' non trovata nella tabella 'configurazioni'.");
      throw new UnauthorizedException('Autenticazione non configurata nel database. Inserire una chiave "PASSWORD" con valore hash SHA-512.');
    }

    const hashedInput = crypto.createHash('sha512').update(password).digest('hex');
    return config.valore.trim().toLowerCase() === hashedInput.toLowerCase();
  }
}
