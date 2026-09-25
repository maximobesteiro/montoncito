"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState } from "@mont/core-game";
import {
  GAME_ROOM_PROTOCOL_VERSION,
  ProtocolFailureSchema,
  SyncSnapshotSchema,
  type ProtocolFailure,
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
  const [view, setView] = useState<GameRoomView>({
    state: null,
    seq: null,
    connectionStatus: "connecting",
    problem: null,
  });

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    setView({ state: null, seq: null, connectionStatus: "connecting", problem: null });

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
          setView((previous) => ({
            ...previous,
            connectionStatus: "synchronizing",
            problem: null,
          }));
          socket?.emit("room.sync.request", { version: GAME_ROOM_PROTOCOL_VERSION });
        });
        socket.on("room.sync.snapshot", (payload: unknown) => {
          const parsed = SyncSnapshotSchema.safeParse(payload);
          if (!parsed.success) {
            setView((previous) => ({
              ...previous,
              connectionStatus: "failed",
              problem: "Received an invalid synchronization snapshot",
            }));
            return;
          }
          setView({
            state: parsed.data.state,
            seq: parsed.data.seq,
            connectionStatus: "connected",
            problem: null,
          });
        });
        socket.on("protocol.error", (payload: unknown) => {
          const parsed = ProtocolFailureSchema.safeParse(payload);
          setView((previous) => ({
            ...previous,
            connectionStatus: "failed",
            problem: parsed.success
              ? formatProtocolProblem(parsed.data)
              : "The server returned an invalid protocol failure",
          }));
        });
        socket.on("connect_error", (error: Error) => {
          setView((previous) => ({
            ...previous,
            connectionStatus: "failed",
            problem: error.message || "Unable to connect to the Game room",
          }));
        });
        socket.on("disconnect", (reason) => {
          if (!disposed && reason !== "io client disconnect") {
            setView((previous) => ({
              ...previous,
              connectionStatus: "connecting",
            }));
          }
        });
      } catch (error) {
        if (disposed) return;
        setView((previous) => ({
          ...previous,
          connectionStatus: "failed",
          problem:
            error instanceof Error ? error.message : "Unable to connect to the Game room",
        }));
      }
    };

    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [roomId]);

  return view;
}

function formatProtocolProblem(problem: ProtocolFailure): string {
  return problem.message;
}
