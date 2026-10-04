import { Module, forwardRef } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [forwardRef(() => RoomsModule), forwardRef(() => WsModule)],
  providers: [ProfilesService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
