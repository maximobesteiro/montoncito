import { z } from 'zod';
import { RoomViewSchema } from '../rooms/rooms.dto';

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

export const GameStarted = z.object({
  type: z.literal('GAME_STARTED'),
  roomId: z.string().min(1),
});

export const RoomUpdated = z.object({
  type: z.literal('ROOM_UPDATED'),
  room: RoomView,
});

export const Kicked = z.object({
  type: z.literal('KICKED'),
});

export const ChatMessage = z.object({
  type: z.literal('CHAT_MESSAGE'),
  id: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  text: z.string().min(1).max(500),
  timestamp: z.number().int().nonnegative(),
});

/** Optional utility events */
export const Pong = z.object({
  type: z.literal('PONG'),
  ts: z.number().int().nonnegative(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  PlayerJoined,
  PlayerLeft,
  GameStarted,
  RoomUpdated,
  Kicked,
  ChatMessage,
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
