import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import 'multer';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'Nessun file fornito' };
    }

    const html = file.buffer.toString('utf-8');
    return this.messagesService.uploadAndParse(html);
  }

  @Get()
  async findAll(@Query('importId') importId?: string) {
    const id = importId ? parseInt(importId, 10) : undefined;
    return this.messagesService.findAll(id);
  }

  @Get('imports')
  async findAllImports() {
    return this.messagesService.findAllImports();
  }

  @Post('send')
  async sendAll(
    @Query('importId') importId?: string,
    @Body('messageIds') messageIds?: number[],
  ) {
    const id = importId ? parseInt(importId, 10) : undefined;
    return this.messagesService.sendAll(id, messageIds);
  }

  @Delete(':id')
  async deleteImport(@Param('id') id: string) {
    const importId = parseInt(id, 10);
    try {
      await this.messagesService.deleteImport(importId);
      return { success: true, message: 'Import eliminato con successo' };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
