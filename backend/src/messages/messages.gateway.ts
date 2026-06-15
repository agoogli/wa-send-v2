import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { RigaMessaggio } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessagesGateway {
  @WebSocketServer()
  server!: Server;

  emitMessageUpdate(message: RigaMessaggio) {
    if (this.server) {
      this.server.emit('messageUpdated', message);
    }
  }
}
