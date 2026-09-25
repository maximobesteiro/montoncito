import {
  RoomStateUpdateSchema,
  SyncSnapshotSchema,
  type ProtocolFailure,
  type SyncSnapshot,
} from "./protocol.js";

export type GameRoomSession =
  | { status: "connecting" }
  | { status: "awaiting_snapshot" }
  | { status: "synchronized"; seq: number; state: SyncSnapshot["state"] }
  | { status: "failed"; problem: ProtocolFailure };

export function createGameRoomSession(): GameRoomSession {
  return { status: "connecting" };
}

export function markGameRoomConnected(
  session: GameRoomSession,
): GameRoomSession {
  if (session.status === "synchronized" || session.status === "failed") {
    return session;
  }
  return { status: "awaiting_snapshot" };
}

export function receiveGameRoomSnapshot(
  session: GameRoomSession,
  input: unknown,
): GameRoomSession {
  if (session.status === "failed") return session;
  const result = SyncSnapshotSchema.safeParse(input);
  if (!result.success) {
    return failMalformedMessage(
      session,
      "Received an invalid synchronization snapshot",
    );
  }
  return applyAuthoritativeState(session, result.data);
}

export function receiveGameRoomUpdate(
  session: GameRoomSession,
  input: unknown,
): GameRoomSession {
  if (session.status === "failed") return session;
  const result = RoomStateUpdateSchema.safeParse(input);
  if (!result.success) {
    return failMalformedMessage(
      session,
      "Received an invalid Game room state update",
    );
  }
  return applyAuthoritativeState(session, result.data);
}

export function failGameRoomSession(
  _session: GameRoomSession,
  problem: ProtocolFailure,
): GameRoomSession {
  return { status: "failed", problem };
}

function failMalformedMessage(
  session: GameRoomSession,
  message: string,
): GameRoomSession {
  return failGameRoomSession(session, {
    version: 1,
    code: "MALFORMED_MESSAGE",
    message,
  });
}

function applyAuthoritativeState(
  session: GameRoomSession,
  update: SyncSnapshot,
): GameRoomSession {
  if (session.status === "synchronized") {
    if (update.seq < session.seq) return session;
    if (update.seq === session.seq) {
      if (haveSameJsonValue(update.state, session.state)) return session;
      return failGameRoomSession(session, {
        version: 1,
        code: "SEQUENCE_CONFLICT",
        message: "Game room states conflict at the same sequence number",
      });
    }
  }
  return { status: "synchronized", seq: update.seq, state: update.state };
}

function haveSameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || left === null) return false;
  if (typeof right !== "object" || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => haveSameJsonValue(value, right[index]))
    );
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        haveSameJsonValue(leftRecord[key], rightRecord[key]),
    )
  );
}
