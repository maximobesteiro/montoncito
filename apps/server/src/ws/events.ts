import { z } from 'zod';
import { RoomViewSchema } from '../rooms/rooms.dto';

/** If you have proper zod schemas for these, use them instead of z.any() */
export const GameMeta = z.any();
export const GameState = z.any();
export const RoomView = RoomViewSchema;

/** --- Server -> Client events --- */
export const PlayerJoined = z.object({
  type: z.literal('PLAYER_JOINED'),
  playerId: z.string().min(1),
});

export const PlayerLeft = z.object({
  type: z.literal('PLAYER_LEFT'),
  playerId: z.string().min(1),
});

export const StateUpdate = z.object({
  type: z.literal('STATE_UPDATE'),
  meta: GameMeta.optional(),
  state: GameState,
});

export const GameStarted = z.object({
  type: z.literal('GAME_STARTED'),
  meta: GameMeta,
  state: GameState,
});

export const RoomUpdated = z.object({
  type: z.literal('ROOM_UPDATED'),
  room: RoomView,
});

export const Kicked = z.object({
  type: z.literal('KICKED'),
});

/** Optional utility events */
export const Pong = z.object({
  type: z.literal('PONG'),
  ts: z.number().int().nonnegative(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  PlayerJoined,
  PlayerLeft,
  StateUpdate,
  GameStarted,
  RoomUpdated,
  Kicked,
  Pong,
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;

/** Helper: validate before emitting (can be no-op in prod if you wish) */
export function assertServerEvent(ev: unknown): asserts ev is ServerEvent {
  const parsed = ServerEventSchema.safeParse(ev);
  if (!parsed.success) {
    // You could throw or log; throwing helps catch mistakes in dev
    throw new Error('Invalid server event: ' + parsed.error.message);
  }
}
