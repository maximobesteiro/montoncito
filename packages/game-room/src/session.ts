import { SyncSnapshotSchema, type ProtocolFailure, type SyncSnapshot } from "./protocol.js";

export type GameRoomSession =
  | { status: "connecting" }
  | { status: "awaiting_snapshot" }
  | { status: "synchronized"; seq: number; state: SyncSnapshot["state"] }
  | { status: "failed"; problem: ProtocolFailure };

export function createGameRoomSession(): GameRoomSession {
  return { status: "connecting" };
}

export function markGameRoomConnected(_session: GameRoomSession): GameRoomSession {
  return { status: "awaiting_snapshot" };
}

export function receiveGameRoomSnapshot(
  session: GameRoomSession,
  input: unknown,
): GameRoomSession {
  if (session.status === "failed") return session;
  const result = SyncSnapshotSchema.safeParse(input);
  if (!result.success) {
    return failGameRoomSession(session, {
      version: 1,
      code: "MALFORMED_MESSAGE",
      message: "Received an invalid synchronization snapshot",
    });
  }
  return { status: "synchronized", seq: result.data.seq, state: result.data.state };
}

export function failGameRoomSession(
  _session: GameRoomSession,
  problem: ProtocolFailure,
): GameRoomSession {
  return { status: "failed", problem };
}
