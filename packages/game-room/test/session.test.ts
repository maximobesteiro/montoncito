import { describe, expect, it } from "vitest";
import { createStartedGame } from "@mont/core-game";
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
import { ActionSubmissionSchema } from "../src/protocol.js";

const snapshot = {
  version: 1,
  seq: 0,
  state: createStartedGame({ players: ["P1", "P2"], seed: 1, id: "game-1" }),
};

describe("Game room session transitions", () => {
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
