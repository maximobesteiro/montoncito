import { Module } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';

@Module({
  providers: [RoomsGateway],
  exports: [RoomsGateway], // so controllers/services can inject it
})
export class WsModule {}
