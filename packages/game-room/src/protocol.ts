import type { GameState, Rank } from "@mont/core-game";
import { z } from "zod";

export const GAME_ROOM_PROTOCOL_VERSION = 1 as const;

const RankSchema = z.number().int().min(1).max(13) as z.ZodType<Rank>;
const CardSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("standard"),
    id: z.string().min(1),
    rank: RankSchema,
    suit: z.enum(["Clubs", "Diamonds", "Hearts", "Spades"]),
    baseWild: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("joker"),
    id: z.string().min(1),
    baseWild: z.boolean().optional(),
  }),
]);

const RulesConfigSchema = z.object({
  handSize: z.number().int().positive(),
  stockSize: z.number().int().positive(),
  discardPiles: z.number().int().min(1).max(4),
  useJokers: z.boolean().optional(),
  jokersAreWild: z.boolean().optional(),
  kingsAreWild: z.boolean().optional(),
  additionalWildRanks: z.array(RankSchema).optional(),
  enableCardWildFlag: z.boolean().optional(),
});

const PlayerStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  hand: z.object({ cards: z.array(CardSchema) }),
  discards: z.array(z.array(CardSchema)),
  stock: z.object({ faceDown: z.array(CardSchema) }),
});

export const AuthoritativeStateSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  phase: z.enum(["lobby", "turn", "gameover"]),
  turn: z.object({
    number: z.number().int().nonnegative(),
    activePlayer: z.string().min(1),
    hasDiscarded: z.boolean(),
  }),
  players: z.array(z.string().min(1)),
  byId: z.record(z.string(), PlayerStateSchema),
  deck: z.object({ drawPile: z.array(CardSchema), recyclePile: z.array(CardSchema) }),
  center: z.object({
    buildPiles: z.array(
      z.object({
        id: z.string().min(1),
        cards: z.array(CardSchema),
        nextRank: RankSchema.nullable(),
      }),
    ),
  }),
  nextBuildPileId: z.number().int().nonnegative(),
  winner: z.string().nullable().optional(),
  rng: z.object({
    algorithm: z.literal("mulberry32-v1"),
    seed: z.number().int().nonnegative(),
    cursor: z.number().int().nonnegative(),
  }),
  rules: RulesConfigSchema,
  data: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<GameState>;

export const SyncRequestSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
  })
  .strict();

export const SyncRequestMessageSchema = z
  .object({
    type: z.literal("room.sync.request"),
    payload: z.unknown(),
  })
  .strict();

const VersionedAuthoritativeStateSchema = z.object({
  version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
  seq: z.number().int().nonnegative(),
  state: AuthoritativeStateSchema,
}).strict();

export const SyncSnapshotSchema = VersionedAuthoritativeStateSchema;
export const RoomStateUpdateSchema = VersionedAuthoritativeStateSchema;

export const SyncSnapshotMessageSchema = z
  .object({
    type: z.literal("room.sync.snapshot"),
    payload: SyncSnapshotSchema,
  })
  .strict();

export const ProtocolFailureCodeSchema = z.enum([
  "UNSUPPORTED_VERSION",
  "MALFORMED_MESSAGE",
  "NOT_A_MEMBER",
  "GAME_NOT_STARTED",
]);

export const ProtocolFailureSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    code: ProtocolFailureCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export const ProtocolFailureMessageSchema = z
  .object({
    type: z.literal("protocol.error"),
    payload: ProtocolFailureSchema,
  })
  .strict();

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>;
export type ProtocolFailure = z.infer<typeof ProtocolFailureSchema>;
