import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  getStatus() {
    return {
      status: this.whatsappService.getStatus(),
      qrCode: this.whatsappService.getQrCode(),
    };
  }

  @Post('connect')
  async connect() {
    await this.whatsappService.connect();
    return { message: 'Connection initiated' };
  }

  @Post('disconnect')
  async disconnect() {
    await this.whatsappService.disconnect();
    return { message: 'Disconnected' };
  }
}
