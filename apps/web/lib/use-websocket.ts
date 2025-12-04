"use client";

import { useEffect, useRef } from "react";
import { getWebSocketClient } from "./ws-client";
import { useGameStore } from "@/stores/game-store";
import type { GameState, Move, PlayerId } from "@mont/core-game";

interface UseWebSocketOptions {
  roomId: string | null;
  token: string | null;
  currentPlayerId: PlayerId | null;
}

export function useWebSocket({ roomId, token, currentPlayerId }: UseWebSocketOptions) {
  const {
    setGameState,
    setConnectionStatus,
    setLastSeq,
    lastSeq,
    pendingActions,
    removePendingAction,
  } = useGameStore();

  const wsClientRef = useRef<ReturnType<typeof getWebSocketClient> | null>(null);

  useEffect(() => {
    if (!roomId || !token) {
      setConnectionStatus("disconnected");
      return;
    }

    setConnectionStatus("connecting");
    const client = getWebSocketClient();
    wsClientRef.current = client;

    const unsubscribe = client.on((event) => {
      switch (event.type) {
        case "room.state":
          setGameState(event.payload.state);
          setLastSeq(event.payload.seq);
          break;

        case "room.actions":
          // Handle action stream updates
          // In a real implementation, you'd apply these actions to the state
          setLastSeq(event.payload.fromSeq + event.payload.actions.length);
          break;

        case "room.system":
          console.log("System message:", event.payload.message);
          break;

        case "error":
          console.error("WebSocket error:", event.payload.message);
          setConnectionStatus("error");
          break;
      }
    });

    client
      .connect(token, roomId)
      .then(() => {
        setConnectionStatus("connected");
        client.joinRoom(roomId);
      })
      .catch((error) => {
        console.error("Failed to connect WebSocket:", error);
        setConnectionStatus("error");
      });

    // Presence ping interval
    const presenceInterval = setInterval(() => {
      if (client.isConnected) {
        client.sendPresencePing(roomId);
      }
    }, 30000); // Every 30 seconds

    return () => {
      unsubscribe();
      clearInterval(presenceInterval);
      if (roomId) {
        client.leaveRoom(roomId);
      }
      // Don't disconnect here - let it reconnect if needed
    };
  }, [roomId, token, setGameState, setConnectionStatus, setLastSeq]);

  const sendAction = (move: Move, actionId: string) => {
    if (!roomId || !currentPlayerId || !wsClientRef.current) {
      console.error("Cannot send action: missing roomId, playerId, or WebSocket");
      return;
    }

    wsClientRef.current.sendAction(roomId, currentPlayerId, actionId, move);
  };

  const sendChat = (text: string) => {
    if (!roomId || !wsClientRef.current) {
      console.error("Cannot send chat: missing roomId or WebSocket");
      return;
    }

    wsClientRef.current.sendChat(roomId, text);
  };

  return {
    sendAction,
    sendChat,
    isConnected: wsClientRef.current?.isConnected ?? false,
  };
}


