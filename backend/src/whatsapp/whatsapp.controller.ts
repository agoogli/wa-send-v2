import { Controller, Get, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
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
