import type { GameState, Move, Rank } from "@mont/core-game";
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
  deck: z.object({
    drawPile: z.array(CardSchema),
    recyclePile: z.array(CardSchema),
  }),
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

export const PlayerActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("PLAY_HAND_TO_BUILD"),
      cardId: z.string().min(1),
      target: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("PLAY_STOCK_TO_BUILD"),
      target: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("PLAY_DISCARD_TO_BUILD"),
      pileIndex: z.number().int().nonnegative(),
      target: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("DISCARD_FROM_HAND"),
      cardId: z.string().min(1),
      pileIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal("END_TURN") }).strict(),
]) satisfies z.ZodType<Exclude<Move, { kind: "START_GAME" | "DRAW_TO_HAND" }>>;

export const ActionSubmissionSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    actionId: z.string().uuid(),
    baseSeq: z.number().int().nonnegative(),
    action: PlayerActionSchema,
  })
  .strict();

export const ActionAcceptedSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    actionId: z.string().uuid(),
    seq: z.number().int().nonnegative(),
    acceptedSeq: z.number().int().nonnegative().optional(),
    state: AuthoritativeStateSchema,
  })
  .strict();

export const ActionRejectedSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    actionId: z.string().uuid(),
    code: z.enum([
      "STALE_BASE_SEQ",
      "ACTION_ID_CONFLICT",
      "NOT_YOUR_TURN",
      "ILLEGAL_ACTION",
      "GAME_FINISHED",
    ]),
    seq: z.number().int().nonnegative(),
    state: AuthoritativeStateSchema,
    message: z.string().min(1).optional(),
  })
  .strict();

const VersionedAuthoritativeStateSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    seq: z.number().int().nonnegative(),
    state: AuthoritativeStateSchema,
  })
  .strict();

export const SyncSnapshotSchema = VersionedAuthoritativeStateSchema;
export const RoomStateUpdateSchema = VersionedAuthoritativeStateSchema;

export const ProtocolFailureCodeSchema = z.enum([
  "UNSUPPORTED_VERSION",
  "MALFORMED_MESSAGE",
  "NOT_A_MEMBER",
  "GAME_NOT_STARTED",
  "SEQUENCE_CONFLICT",
]);

export const ProtocolFailureSchema = z
  .object({
    version: z.literal(GAME_ROOM_PROTOCOL_VERSION),
    code: ProtocolFailureCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type PlayerAction = z.infer<typeof PlayerActionSchema>;
export type ActionSubmission = z.infer<typeof ActionSubmissionSchema>;
export type ActionAccepted = z.infer<typeof ActionAcceptedSchema>;
export type ActionRejected = z.infer<typeof ActionRejectedSchema>;
export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>;
export type ProtocolFailure = z.infer<typeof ProtocolFailureSchema>;
