import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const RoomEnvSchema = z.object({
  ROOM_DEFAULT_VISIBILITY: z.enum(['public', 'private']).default('public'),
  ROOM_DEFAULT_MAX_PLAYERS: z.coerce.number().int().min(2).max(16).default(2),
  ROOM_HARD_MAX_PLAYERS: z.coerce.number().int().min(2).max(16).default(8),
  ROOM_SLUG_LENGTH: z.coerce.number().int().min(6).max(21).default(10),
});

export type RoomEnv = z.infer<typeof RoomEnvSchema>;

export type RoomDefaults = {
  defaultVisibility: 'public' | 'private';
  defaultMaxPlayers: number;
  hardMaxPlayers: number;
  slugLength: number;
};

export function loadRoomDefaults(config: ConfigService): RoomDefaults {
  // Pull raw values from process.env through ConfigService
  const raw = {
    ROOM_DEFAULT_VISIBILITY: config.get<string>('ROOM_DEFAULT_VISIBILITY'),
    ROOM_DEFAULT_MAX_PLAYERS: config.get<string>('ROOM_DEFAULT_MAX_PLAYERS'),
    ROOM_HARD_MAX_PLAYERS: config.get<string>('ROOM_HARD_MAX_PLAYERS'),
    ROOM_SLUG_LENGTH: config.get<string>('ROOM_SLUG_LENGTH'),
  };
  const parsed = RoomEnvSchema.parse(raw);
  return {
    defaultVisibility: parsed.ROOM_DEFAULT_VISIBILITY,
    defaultMaxPlayers: Math.min(
      parsed.ROOM_DEFAULT_MAX_PLAYERS,
      parsed.ROOM_HARD_MAX_PLAYERS,
    ),
    hardMaxPlayers: parsed.ROOM_HARD_MAX_PLAYERS,
    slugLength: parsed.ROOM_SLUG_LENGTH,
  };
}
