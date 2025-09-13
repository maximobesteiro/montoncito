import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { loadRoomDefaults, RoomDefaults } from './rooms.config';
import { GameModule } from '../game/game.module';

@Module({
  imports: [ConfigModule, ProfilesModule, GameModule], // ConfigModule is global already, but import is harmless
  controllers: [RoomsController],
  providers: [
    RoomsService,
    {
      provide: 'ROOM_DEFAULTS',
      useFactory: (config: ConfigService): RoomDefaults =>
        loadRoomDefaults(config),
      inject: [ConfigService],
    },
  ],
  exports: [RoomsService],
})
export class RoomsModule {}
