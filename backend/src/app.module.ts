import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { MessagesModule } from './messages/messages.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, WhatsappModule, MessagesModule, AuthModule],
})
export class AppModule {}
