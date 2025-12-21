import { Module, forwardRef } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [forwardRef(() => RoomsModule)],
  providers: [RoomsGateway],
  exports: [RoomsGateway], // so controllers/services can inject it
})
export class WsModule {}
