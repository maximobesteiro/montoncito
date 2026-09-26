"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState } from "@mont/core-game";
import {
  GAME_ROOM_PROTOCOL_VERSION,
  ActionSubmissionSchema,
  ProtocolFailureSchema,
  createGameRoomSession,
  failGameRoomSession,
  markGameRoomConnected,
  receiveGameRoomSnapshot,
  receiveGameRoomUpdate,
  receiveGameRoomActionAccepted,
  receiveGameRoomActionRejected,
  setPendingGameRoomAction,
  type PlayerAction,
  type ActionSubmission,
  type ActionAccepted,
  type ActionRejected,
  type ProtocolFailure,
  type GameRoomSession,
} from "@mont/game-room";
import { apiFetch, getOrCreateClientId, getServerUrl } from "./api";

export type GameRoomConnectionStatus =
  | "connecting"
  | "synchronizing"
  | "connected"
  | "failed";

export type GameRoomView = {
  state: GameState | null;
  seq: number | null;
  currentPlayerId: string | null;
  connectionStatus: GameRoomConnectionStatus;
  problem: string | null;
  pendingAction: ActionSubmission | null;
  lastActionResult: ActionAccepted | ActionRejected | null;
  submitAction: (action: PlayerAction) => boolean;
};

export function useGameRoom(roomId: string): GameRoomView {
  const [session, setSession] = useState<GameRoomSession>(
    createGameRoomSession,
  );
  const [connectionStatus, setConnectionStatus] =
    useState<GameRoomConnectionStatus>("connecting");
  const [connectionProblem, setConnectionProblem] = useState<string | null>(
    null,
  );
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pendingActionRef = useRef<ActionSubmission | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const submitAction = useCallback(
    (action: PlayerAction): boolean => {
      const activeSocket = socketRef.current;
      if (
        !activeSocket?.connected ||
        pendingActionRef.current ||
        !crypto.randomUUID
      ) {
        return false;
      }
      const currentSession = sessionRef.current;
      if (currentSession.status !== "synchronized") return false;
      const pending: ActionSubmission = {
        version: GAME_ROOM_PROTOCOL_VERSION,
        actionId: crypto.randomUUID(),
        baseSeq: currentSession.seq,
        action,
      };
      try {
        window.sessionStorage.setItem(
          pendingStorageKey(roomId),
          JSON.stringify(pending),
        );
      } catch {
        return false;
      }
      pendingActionRef.current = pending;
      setSession((previous) => setPendingGameRoomAction(previous, pending));
      activeSocket.emit("room.action.submit", pending);
      return true;
    },
    [roomId],
  );

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    setSession(createGameRoomSession());
    setConnectionStatus("connecting");
    setConnectionProblem(null);
    socketRef.current = null;
    pendingActionRef.current = null;

    const connect = async () => {
      try {
        const clientId = getOrCreateClientId();
        setCurrentPlayerId(clientId);
        const { wsJoinToken } = await apiFetch<{ wsJoinToken: string }>(
          `/rooms/${encodeURIComponent(roomId)}/socket-token`,
          { method: "POST", clientId },
        );
        if (disposed) return;

        socket = io(`${getServerUrl()}/ws`, {
          transports: ["websocket"],
          auth: { token: wsJoinToken },
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setSession((previous) => markGameRoomConnected(previous));
          setConnectionStatus("synchronizing");
          setConnectionProblem(null);
          socket?.emit("room.sync.request", {
            version: GAME_ROOM_PROTOCOL_VERSION,
          });
        });
        socket.on("room.sync.snapshot", (payload: unknown) => {
          const restored = readPendingAction(roomId);
          if (restored) {
            pendingActionRef.current = restored;
          }
          setSession((previous) => {
            const synchronized = receiveGameRoomSnapshot(previous, payload);
            return restored
              ? setPendingGameRoomAction(synchronized, restored)
              : synchronized;
          });
          setConnectionStatus("connected");
          if (restored) socket?.emit("room.action.submit", restored);
        });
        socket.on("room.state", (payload: unknown) => {
          setSession((previous) => receiveGameRoomUpdate(previous, payload));
        });
        socket.on("room.action.accepted", (payload: unknown) => {
          clearMatchingPendingAction(roomId, payload, pendingActionRef);
          setSession((previous) =>
            receiveGameRoomActionAccepted(previous, payload),
          );
        });
        socket.on("room.action.rejected", (payload: unknown) => {
          clearMatchingPendingAction(roomId, payload, pendingActionRef);
          setSession((previous) =>
            receiveGameRoomActionRejected(previous, payload),
          );
        });
        socket.on("protocol.error", (payload: unknown) => {
          const parsed = ProtocolFailureSchema.safeParse(payload);
          const failure: ProtocolFailure = parsed.success
            ? parsed.data
            : {
                version: GAME_ROOM_PROTOCOL_VERSION,
                code: "MALFORMED_MESSAGE",
                message: "The server returned an invalid protocol failure",
              };
          setSession((previous) => failGameRoomSession(previous, failure));
          setConnectionStatus("failed");
        });
        socket.on("connect_error", (error: Error) => {
          setConnectionStatus("failed");
          setConnectionProblem(
            error.message || "Unable to connect to the Game room",
          );
        });
        socket.on("disconnect", (reason) => {
          if (!disposed && reason !== "io client disconnect") {
            setConnectionStatus("connecting");
          }
        });
      } catch (error) {
        if (disposed) return;
        setConnectionStatus("failed");
        setConnectionProblem(
          error instanceof Error
            ? error.message
            : "Unable to connect to the Game room",
        );
      }
    };

    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [roomId]);

  return {
    state: session.status === "synchronized" ? session.state : null,
    seq: session.status === "synchronized" ? session.seq : null,
    currentPlayerId,
    connectionStatus: session.status === "failed" ? "failed" : connectionStatus,
    problem:
      session.status === "failed" ? session.problem.message : connectionProblem,
    pendingAction:
      session.status === "synchronized"
        ? (session.pendingAction ?? null)
        : null,
    lastActionResult:
      session.status === "synchronized"
        ? (session.lastActionResult ?? null)
        : null,
    submitAction,
  };
}

const pendingStorageKey = (roomId: string) =>
  `montoncito:${roomId}:pending-action`;

function readPendingAction(roomId: string): ActionSubmission | null {
  try {
    const stored = window.sessionStorage.getItem(pendingStorageKey(roomId));
    if (!stored) return null;
    const result = ActionSubmissionSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function clearPendingAction(roomId: string): void {
  try {
    window.sessionStorage.removeItem(pendingStorageKey(roomId));
  } catch {
    // Keep transport outcome handling independent of browser storage availability.
  }
}

function clearMatchingPendingAction(
  roomId: string,
  payload: unknown,
  pendingActionRef: { current: ActionSubmission | null },
): void {
  const actionId = getActionId(payload);
  if (!actionId || pendingActionRef.current?.actionId !== actionId) return;
  clearPendingAction(roomId);
  pendingActionRef.current = null;
}

function getActionId(payload: unknown): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("actionId" in payload)
  ) {
    return null;
  }
  return typeof payload.actionId === "string" ? payload.actionId : null;
}
