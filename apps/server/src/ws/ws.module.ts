import { Module, forwardRef } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';
import { RoomsModule } from '../rooms/rooms.module';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [forwardRef(() => RoomsModule), ProfilesModule],
  providers: [RoomsGateway],
  exports: [RoomsGateway], // so controllers/services can inject it
})
export class WsModule {}
