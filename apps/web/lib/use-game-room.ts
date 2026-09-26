"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState } from "@mont/core-game";
import {
  GAME_ROOM_PROTOCOL_VERSION,
  ActionAcceptedSchema,
  ActionRejectedSchema,
  ActionSubmissionSchema,
  ProtocolFailureSchema,
  createGameRoomSession,
  failGameRoomSession,
  markGameRoomConnected,
  receiveGameRoomSnapshot,
  receiveGameRoomUpdate,
  receiveGameRoomActionAccepted,
  receiveGameRoomActionRejected,
  removeGameRoomSession,
  setPendingGameRoomAction,
  type PlayerAction,
  type ActionSubmission,
  type ActionAccepted,
  type ActionRejected,
  type ProtocolFailure,
  type GameRoomSession,
  type SyncSnapshot,
} from "@mont/game-room";
import {
  apiFetch,
  ApiHttpError,
  getOrCreateClientId,
  getServerUrl,
} from "./api";

export type GameRoomConnectionStatus =
  | "connecting"
  | "synchronizing"
  | "connected"
  | "failed"
  | "removed";

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
      if (currentSession.state.phase === "gameover") return false;
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
      updateGameRoomSession(sessionRef, setSession, (previous) =>
        setPendingGameRoomAction(previous, pending),
      );
      activeSocket.emit("room.action.submit", pending);
      return true;
    },
    [roomId],
  );

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let renewalInFlight = false;
    let renewalAttempt = 0;
    let requestedFreshSnapshot = false;
    updateGameRoomSession(sessionRef, setSession, createGameRoomSession);
    setConnectionStatus("connecting");
    socketRef.current = null;
    pendingActionRef.current = null;

    const isRemovedError = (error: unknown) =>
      error instanceof ApiHttpError &&
      (error.status === 403 || error.status === 404);

    const markRemoved = () => {
      if (disposed) return;
      if (retryTimer) clearTimeout(retryTimer);
      clearPendingAction(roomId);
      pendingActionRef.current = null;
      socket?.disconnect();
      updateGameRoomSession(sessionRef, setSession, removeGameRoomSession);
      setConnectionStatus("removed");
    };

    const scheduleRenewal = () => {
      if (disposed || renewalInFlight || retryTimer) return;
      renewalInFlight = true;
      const renew = async () => {
        try {
          const clientId = getOrCreateClientId();
          const { wsJoinToken } = await apiFetch<{ wsJoinToken: string }>(
            `/rooms/${encodeURIComponent(roomId)}/socket-token`,
            { method: "POST", clientId },
          );
          if (disposed || !socket) return;
          renewalAttempt = 0;
          renewalInFlight = false;
          socket.auth = { token: wsJoinToken };
          if (!socket.connected) socket.connect();
        } catch (error) {
          renewalInFlight = false;
          if (isRemovedError(error)) {
            markRemoved();
            return;
          }
          if (disposed) return;
          setConnectionStatus("connecting");
          const delay = Math.min(1000 * 2 ** renewalAttempt, 15000);
          renewalAttempt += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            scheduleRenewal();
          }, delay);
        }
      };
      void renew();
    };

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
          autoConnect: false,
          reconnection: false,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          requestedFreshSnapshot = false;
          updateGameRoomSession(sessionRef, setSession, markGameRoomConnected);
          setConnectionStatus("synchronizing");
          socket?.emit("room.sync.request", {
            version: GAME_ROOM_PROTOCOL_VERSION,
          });
        });
        socket.on("room.sync.snapshot", (payload: unknown) => {
          const currentSession = sessionRef.current;
          const synchronized = receiveGameRoomSnapshot(currentSession, payload);
          if (synchronized.status !== "synchronized") {
            sessionRef.current = synchronized;
            setSession(synchronized);
            setConnectionStatus("failed");
            return;
          }
          if (
            currentSession.status === "synchronized" &&
            synchronized === currentSession &&
            (payload as SyncSnapshot).seq < currentSession.seq
          ) {
            setConnectionStatus("synchronizing");
            if (!requestedFreshSnapshot) {
              requestedFreshSnapshot = true;
              socket?.emit("room.sync.request", {
                version: GAME_ROOM_PROTOCOL_VERSION,
              });
            }
            return;
          }

          requestedFreshSnapshot = false;
          const restored = readPendingAction(roomId);
          if (restored) {
            pendingActionRef.current = restored;
          }
          const recovered = restored
            ? setPendingGameRoomAction(synchronized, restored)
            : synchronized;
          sessionRef.current = recovered;
          setSession(recovered);
          setConnectionStatus("connected");
          if (restored) socket?.emit("room.action.submit", restored);
        });
        socket.on("room.state", (payload: unknown) => {
          updateGameRoomSession(sessionRef, setSession, (previous) =>
            receiveGameRoomUpdate(previous, payload),
          );
        });
        socket.on("room.action.accepted", (payload: unknown) => {
          const result = ActionAcceptedSchema.safeParse(payload);
          if (result.success) {
            clearMatchingPendingAction(roomId, result.data, pendingActionRef);
          }
          updateGameRoomSession(sessionRef, setSession, (previous) =>
            receiveGameRoomActionAccepted(previous, payload),
          );
        });
        socket.on("room.action.rejected", (payload: unknown) => {
          const result = ActionRejectedSchema.safeParse(payload);
          if (result.success) {
            clearMatchingPendingAction(roomId, result.data, pendingActionRef);
          }
          updateGameRoomSession(sessionRef, setSession, (previous) =>
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
          if (failure.code === "NOT_A_MEMBER") {
            markRemoved();
            return;
          }
          updateGameRoomSession(sessionRef, setSession, (previous) =>
            failGameRoomSession(previous, failure),
          );
          setConnectionStatus("failed");
        });
        socket.on("event", (payload: unknown) => {
          if (
            typeof payload === "object" &&
            payload !== null &&
            "type" in payload &&
            payload.type === "KICKED"
          ) {
            markRemoved();
          }
        });
        socket.on("connect_error", () => {
          setConnectionStatus("connecting");
          scheduleRenewal();
        });
        socket.on("disconnect", (reason) => {
          if (!disposed && reason !== "io client disconnect") {
            setConnectionStatus("connecting");
            scheduleRenewal();
          }
        });
        socket.connect();
      } catch (error) {
        if (disposed) return;
        if (isRemovedError(error)) {
          markRemoved();
        } else {
          setConnectionStatus("connecting");
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void connect();
          }, 1000);
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [roomId]);

  return {
    state: session.status === "synchronized" ? session.state : null,
    seq: session.status === "synchronized" ? session.seq : null,
    currentPlayerId,
    connectionStatus:
      session.status === "failed"
        ? "failed"
        : session.status === "removed"
          ? "removed"
          : connectionStatus,
    problem:
      session.status === "failed"
        ? session.problem.message
        : session.status === "removed"
          ? "You are no longer a member of this Game room"
          : null,
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

function updateGameRoomSession(
  sessionRef: { current: GameRoomSession },
  setSession: (session: GameRoomSession) => void,
  transition: (session: GameRoomSession) => GameRoomSession,
): GameRoomSession {
  const updated = transition(sessionRef.current);
  sessionRef.current = updated;
  setSession(updated);
  return updated;
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
