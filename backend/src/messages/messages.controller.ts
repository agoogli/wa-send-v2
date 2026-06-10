import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'No file provided' };
    }

    const html = file.buffer.toString('utf-8');
    return this.messagesService.uploadAndParse(html);
  }

  @Get()
  async findAll() {
    return this.messagesService.findAll();
  }

  @Post('send')
  async sendAll() {
    return this.messagesService.sendAll();
  }
}
