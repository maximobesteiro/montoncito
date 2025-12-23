import { z } from 'zod';

export const UpdateRoomSchema = z
  .object({
    visibility: z.enum(['public', 'private']).optional(),
    maxPlayers: z.coerce.number().int().min(2).max(16).optional(),
    gameConfig: z
      .object({
        discardPiles: z.coerce.number().int().min(1).max(8).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ListRoomsQuerySchema = z.object({
  visibility: z.enum(['public']).default('public'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const MoveSchema = z
  .object({
    type: z.string().min(1),
    payload: z.unknown().optional(),
  })
  .strict();

export const SetReadySchema = z
  .object({
    ready: z.boolean(),
  })
  .strict();

export const RoomViewSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  visibility: z.enum(['public', 'private']),
  status: z.enum(['open', 'in_progress', 'finished']),
  maxPlayers: z.number().int().min(2),
  ownerId: z.string().min(1),
  players: z.array(
    z.object({
      id: z.string().min(1),
      displayName: z.string().min(1),
      isOwner: z.boolean(),
      isReady: z.boolean(),
    }),
  ),
  createdAt: z.string().min(1),
  gameId: z.string().min(1).optional(),
  gameConfig: z.object({
    discardPiles: z.number().int().min(1).max(8),
  }),
});

export type ListRoomsQuery = z.infer<typeof ListRoomsQuerySchema>;
export type UpdateRoomDto = z.infer<typeof UpdateRoomSchema>;
export type MoveDto = z.infer<typeof MoveSchema>;
export type SetReadyDto = z.infer<typeof SetReadySchema>;
export type RoomView = z.infer<typeof RoomViewSchema>;
