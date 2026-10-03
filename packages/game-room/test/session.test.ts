import { describe, expect, it } from "vitest";
import { applyMove, createStartedGame, topBuildCard } from "@mont/core-game";
import {
  createGameRoomSession,
  failGameRoomSession,
  removeGameRoomSession,
  markGameRoomConnected,
  receiveGameRoomUpdate,
  receiveGameRoomSnapshot,
  receiveGameRoomActionAccepted,
  receiveGameRoomActionRejected,
  setPendingGameRoomAction,
} from "../src/session.js";
import {
  ActionAcceptedSchema,
  ActionRejectedSchema,
  ActionSubmissionSchema,
  RoomStateUpdateSchema,
  SyncSnapshotSchema,
} from "../src/protocol.js";

const snapshot = {
  version: 1,
  seq: 0,
  state: createStartedGame({ players: ["P1", "P2"], seed: 1, id: "game-1" }),
};

describe("Game room session transitions", () => {
  it("keeps the authoritative Build top while pending and restores it after reconnect", () => {
    const initial = createStartedGame({ players: ["P1", "P2"], seed: 1 });
    initial.byId[initial.turn.activePlayer]!.hand.cards = [
      { kind: "standard", id: "ace", rank: 1, suit: "Hearts" },
      { kind: "standard", id: "two", rank: 2, suit: "Clubs" },
      { kind: "standard", id: "held", rank: 7, suit: "Spades" },
    ];
    const ace = applyMove(initial, {
      kind: "PLAY_HAND_TO_BUILD", cardId: "ace", target: "new",
    });
    expect(ace.accepted).toBe(true);
    const buildId = ace.state.center.buildPiles[0]!.id;
    const synchronized = receiveGameRoomSnapshot(createGameRoomSession(), {
      version: 1, seq: 1, state: ace.state,
    });
    const action = {
      kind: "PLAY_HAND_TO_BUILD" as const, cardId: "two", target: buildId,
    };
    const pending = setPendingGameRoomAction(synchronized, {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440000",
      baseSeq: 1,
      action,
    });
    if (synchronized.status !== "synchronized" || pending.status !== "synchronized")
      throw new Error("Expected synchronized sessions");
    expect(pending.state).toBe(synchronized.state);
    expect(topBuildCard(pending.state.center.buildPiles[0]!)?.id).toBe("ace");
    const two = applyMove(ace.state, action);
    expect(two.accepted).toBe(true);
    const restored = receiveGameRoomSnapshot(markGameRoomConnected(pending), {
      version: 1, seq: 2, state: two.state,
    });
    expect(restored.status).toBe("synchronized");
    if (restored.status !== "synchronized")
      throw new Error("Expected recovered session");
    expect(topBuildCard(restored.state.center.buildPiles[0]!)?.id).toBe("two");
    expect(restored.state.center.buildPiles[0]!.cards.map((card) => card.id)).toEqual([
      "ace", "two",
    ]);
  });
  it.each([
    { name: "sync", schema: SyncSnapshotSchema, extras: {} },
    { name: "update", schema: RoomStateUpdateSchema, extras: {} },
    {
      name: "acceptance", schema: ActionAcceptedSchema,
      extras: { actionId: "550e8400-e29b-41d4-a716-446655440000" },
    },
    {
      name: "rejection", schema: ActionRejectedSchema,
      extras: {
        actionId: "550e8400-e29b-41d4-a716-446655440000",
        code: "ILLEGAL_ACTION",
      },
    },
  ])("requires state version 2 in protocol-1 $name frames", ({ schema, extras }) => {
    const input = { ...snapshot, ...extras };
    expect(schema.safeParse(input).success).toBe(true);
    for (const version of [1, 3]) {
      expect(schema.safeParse({
        ...input, state: { ...input.state, version },
      }).success).toBe(false);
    }
    expect(schema.safeParse({ ...input, version: 2 }).success).toBe(false);
  });
  it("retains a rejection across broadcasts and unrelated acceptance until the next submission", () => {
    const rejected = receiveGameRoomActionRejected(
      receiveGameRoomSnapshot(createGameRoomSession(), snapshot),
      {
        ...snapshot,
        actionId: "550e8400-e29b-41d4-a716-446655440000",
        code: "NOT_YOUR_TURN",
      },
    );
    const update = {
      ...snapshot,
      seq: 1,
      state: { ...snapshot.state, turn: { ...snapshot.state.turn, number: 2 } },
    };
    const broadcast = receiveGameRoomUpdate(rejected, update);
    expect(broadcast).toMatchObject({
      lastActionResult: { code: "NOT_YOUR_TURN" },
    });
    const accepted = receiveGameRoomActionAccepted(broadcast, {
      ...update,
      actionId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(accepted).toMatchObject({
      lastActionResult: { code: "NOT_YOUR_TURN" },
    });
    const pending = setPendingGameRoomAction(accepted, {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440002",
      baseSeq: 1,
      action: { kind: "END_TURN" },
    });
    expect(pending).not.toHaveProperty("lastActionResult");
  });

  it("cannot recover a terminal failure through an Action result", () => {
    const failed = failGameRoomSession(createGameRoomSession(), {
      version: 1,
      code: "SEQUENCE_CONFLICT",
      message: "Conflicting state",
    });
    expect(
      receiveGameRoomActionAccepted(failed, {
        ...snapshot,
        actionId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toBe(failed);
  });
  it("parses the fixed ruleset version in a Game room snapshot", () => {
    expect(SyncSnapshotSchema.parse(snapshot).state.rulesetVersion).toBe(1);
    expect(
      SyncSnapshotSchema.safeParse({
        ...snapshot,
        state: { ...snapshot.state, rulesetVersion: 2 },
      }).success,
    ).toBe(false);
    expect(
      SyncSnapshotSchema.safeParse({
        ...snapshot,
        state: {
          ...snapshot.state,
          rules: { ...snapshot.state.rules, kingsAreWild: false },
        },
      }).success,
    ).toBe(false);
    expect(
      SyncSnapshotSchema.safeParse({
        ...snapshot,
        state: {
          ...snapshot.state,
          deck: {
            ...snapshot.state.deck,
            drawPile: [{ kind: "joker", id: "flagged", baseWild: false }],
          },
        },
      }).success,
    ).toBe(false);
  });

  it("accepts protocol-v1 player actions without room or player identity", () => {
    expect(
      ActionSubmissionSchema.safeParse({
        version: 1,
        actionId: "550e8400-e29b-41d4-a716-446655440000",
        baseSeq: 0,
        action: { kind: "PLAY_STOCK_TO_BUILD", target: "new" },
      }).success,
    ).toBe(true);
    expect(
      ActionSubmissionSchema.safeParse({
        version: 1,
        actionId: "550e8400-e29b-41d4-a716-446655440000",
        baseSeq: 0,
        roomId: "room-1",
        playerId: "P1",
        action: { kind: "END_TURN" },
      }).success,
    ).toBe(false);
  });

  it("keeps authoritative state unchanged while one Action is pending and clears it on acceptance", () => {
    const synchronized = receiveGameRoomSnapshot(
      markGameRoomConnected(createGameRoomSession()),
      snapshot,
    );
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440000",
      baseSeq: 0,
      action: { kind: "END_TURN" as const },
    };
    const pending = setPendingGameRoomAction(synchronized, pendingAction);
    expect(
      setPendingGameRoomAction(pending, {
        ...pendingAction,
        actionId: "550e8400-e29b-41d4-a716-446655440003",
      }),
    ).toBe(pending);
    const stateAfterAction = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 1 },
    };
    const accepted = receiveGameRoomActionAccepted(pending, {
      version: 1,
      actionId: pendingAction.actionId,
      seq: 1,
      state: stateAfterAction,
    });

    expect(pending).toMatchObject({ state: snapshot.state, pendingAction });
    expect(accepted).toMatchObject({
      status: "synchronized",
      seq: 1,
      state: stateAfterAction,
    });
    expect(accepted).not.toHaveProperty("pendingAction");
  });

  it("clears a matching rejected Action while applying the returned current state", () => {
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440002",
      baseSeq: 0,
      action: { kind: "END_TURN" as const },
    };
    const pending = setPendingGameRoomAction(
      receiveGameRoomSnapshot(
        markGameRoomConnected(createGameRoomSession()),
        snapshot,
      ),
      pendingAction,
    );
    const rejected = receiveGameRoomActionRejected(pending, {
      version: 1,
      actionId: pendingAction.actionId,
      code: "ILLEGAL_ACTION",
      seq: 0,
      state: snapshot.state,
    });

    expect(rejected).toMatchObject({
      status: "synchronized",
      seq: 0,
      state: snapshot.state,
    });
    expect(rejected).not.toHaveProperty("pendingAction");
    expect(rejected).toMatchObject({
      lastActionResult: { code: "ILLEGAL_ACTION" },
    });
  });

  it("keeps a Pending Action when a result belongs to a different player Action", () => {
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440004",
      baseSeq: 0,
      action: { kind: "END_TURN" as const },
    };
    const pending = setPendingGameRoomAction(
      receiveGameRoomSnapshot(
        markGameRoomConnected(createGameRoomSession()),
        snapshot,
      ),
      pendingAction,
    );
    const nextState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 1 },
    };
    const updated = receiveGameRoomActionAccepted(pending, {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440005",
      seq: 1,
      state: nextState,
    });

    expect(updated).toMatchObject({ seq: 1, state: nextState, pendingAction });
  });

  it("keeps a Pending Action across a newer broadcast until its matching result arrives", () => {
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440030",
      baseSeq: 0,
      action: { kind: "END_TURN" as const },
    };
    const pending = setPendingGameRoomAction(
      receiveGameRoomSnapshot(
        markGameRoomConnected(createGameRoomSession()),
        snapshot,
      ),
      pendingAction,
    );
    const nextState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 2 },
    };
    const broadcast = receiveGameRoomUpdate(pending, {
      version: 1,
      seq: 1,
      state: nextState,
    });
    expect(broadcast).toMatchObject({
      seq: 1,
      state: nextState,
      pendingAction,
    });
    expect(
      setPendingGameRoomAction(broadcast, {
        ...pendingAction,
        actionId: "550e8400-e29b-41d4-a716-446655440031",
      }),
    ).toBe(broadcast);

    const accepted = receiveGameRoomActionAccepted(broadcast, {
      version: 1,
      actionId: pendingAction.actionId,
      seq: 1,
      state: nextState,
    });
    expect(accepted).not.toHaveProperty("pendingAction");
    expect(accepted).toMatchObject({ seq: 1, state: nextState });
  });

  it("moves from connecting to synchronized on a valid full snapshot", () => {
    const session = markGameRoomConnected(createGameRoomSession());

    expect(receiveGameRoomSnapshot(session, snapshot)).toEqual({
      status: "synchronized",
      seq: 0,
      state: snapshot.state,
    });
  });

  it("retains a terminal protocol problem", () => {
    expect(
      failGameRoomSession(createGameRoomSession(), {
        version: 1,
        code: "UNSUPPORTED_VERSION",
        message: "Unsupported protocol version",
      }),
    ).toMatchObject({
      status: "failed",
      problem: { code: "UNSUPPORTED_VERSION" },
    });
  });

  it("clears Authoritative state and Pending Action for removed membership", () => {
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440006",
      baseSeq: 0,
      action: { kind: "END_TURN" as const },
    };
    const synchronized = setPendingGameRoomAction(
      receiveGameRoomSnapshot(
        markGameRoomConnected(createGameRoomSession()),
        snapshot,
      ),
      pendingAction,
    );

    const removed = removeGameRoomSession(synchronized);

    expect(removed).toEqual({ status: "removed" });
    expect(markGameRoomConnected(removed)).toBe(removed);
    expect(receiveGameRoomSnapshot(removed, snapshot)).toBe(removed);
  });

  it("fails closed for malformed synchronization snapshots", () => {
    const session = markGameRoomConnected(createGameRoomSession());

    expect(
      receiveGameRoomSnapshot(session, { version: 2, seq: -1 }),
    ).toMatchObject({
      status: "failed",
      problem: { code: "MALFORMED_MESSAGE" },
    });
  });

  it("applies newer authoritative state broadcasts to a synchronized session", () => {
    const session = receiveGameRoomSnapshot(
      markGameRoomConnected(createGameRoomSession()),
      snapshot,
    );
    const updatedState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 2 },
    };

    expect(
      receiveGameRoomUpdate(session, {
        version: 1,
        seq: 1,
        state: updatedState,
      }),
    ).toEqual({ status: "synchronized", seq: 1, state: updatedState });
  });

  it("ignores an older snapshot without replacing newer Authoritative state", () => {
    const newerState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 2 },
    };
    const synchronized = receiveGameRoomUpdate(
      receiveGameRoomSnapshot(
        markGameRoomConnected(createGameRoomSession()),
        snapshot,
      ),
      { version: 1, seq: 2, state: newerState },
    );

    expect(receiveGameRoomSnapshot(synchronized, snapshot)).toEqual({
      status: "synchronized",
      seq: 2,
      state: newerState,
    });
  });

  it("restores a persisted Pending Action only after installing a full snapshot", () => {
    const pendingAction = {
      version: 1 as const,
      actionId: "550e8400-e29b-41d4-a716-446655440007",
      baseSeq: 4,
      action: { kind: "END_TURN" as const },
    };
    const awaitingSnapshot = markGameRoomConnected(createGameRoomSession());

    expect(setPendingGameRoomAction(awaitingSnapshot, pendingAction)).toBe(
      awaitingSnapshot,
    );

    const restored = setPendingGameRoomAction(
      receiveGameRoomSnapshot(awaitingSnapshot, {
        ...snapshot,
        seq: 4,
      }),
      pendingAction,
    );

    expect(restored).toMatchObject({
      status: "synchronized",
      seq: 4,
      state: snapshot.state,
      pendingAction,
    });
  });

  it("fails when the same sequence number carries different state", () => {
    const session = receiveGameRoomSnapshot(
      markGameRoomConnected(createGameRoomSession()),
      snapshot,
    );
    const conflictingState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 2 },
    };

    expect(
      receiveGameRoomUpdate(session, {
        version: 1,
        seq: 0,
        state: conflictingState,
      }),
    ).toMatchObject({
      status: "failed",
      problem: { code: "SEQUENCE_CONFLICT" },
    });
  });
});
