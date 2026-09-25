"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState } from "@mont/core-game";
import {
  GAME_ROOM_PROTOCOL_VERSION,
  ProtocolFailureSchema,
  createGameRoomSession,
  failGameRoomSession,
  markGameRoomConnected,
  receiveGameRoomSnapshot,
  receiveGameRoomUpdate,
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
  connectionStatus: GameRoomConnectionStatus;
  problem: string | null;
};

export function useGameRoom(roomId: string): GameRoomView {
  const [session, setSession] = useState<GameRoomSession>(createGameRoomSession);
  const [connectionStatus, setConnectionStatus] =
    useState<GameRoomConnectionStatus>("connecting");
  const [connectionProblem, setConnectionProblem] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    setSession(createGameRoomSession());
    setConnectionStatus("connecting");
    setConnectionProblem(null);

    const connect = async () => {
      try {
        const clientId = getOrCreateClientId();
        const { wsJoinToken } = await apiFetch<{ wsJoinToken: string }>(
          `/rooms/${encodeURIComponent(roomId)}/socket-token`,
          { method: "POST", clientId },
        );
        if (disposed) return;

        socket = io(`${getServerUrl()}/ws`, {
          transports: ["websocket"],
          auth: { token: wsJoinToken },
        });
        socket.on("connect", () => {
          setSession((previous) => markGameRoomConnected(previous));
          setConnectionStatus("synchronizing");
          setConnectionProblem(null);
          socket?.emit("room.sync.request", { version: GAME_ROOM_PROTOCOL_VERSION });
        });
        socket.on("room.sync.snapshot", (payload: unknown) => {
          setSession((previous) => receiveGameRoomSnapshot(previous, payload));
          setConnectionStatus("connected");
        });
        socket.on("room.state", (payload: unknown) => {
          setSession((previous) => receiveGameRoomUpdate(previous, payload));
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
          setConnectionProblem(error.message || "Unable to connect to the Game room");
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
    };
  }, [roomId]);

  return {
    state: session.status === "synchronized" ? session.state : null,
    seq: session.status === "synchronized" ? session.seq : null,
    connectionStatus:
      session.status === "failed" ? "failed" : connectionStatus,
    problem:
      session.status === "failed"
        ? formatProtocolProblem(session.problem)
        : connectionProblem,
  };
}

function formatProtocolProblem(problem: ProtocolFailure): string {
  return problem.message;
}
