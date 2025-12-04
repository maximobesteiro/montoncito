import type { GameState, Move, PlayerId } from "@mont/core-game";

export type WSEvent =
  | { type: "room.state"; payload: { seq: number; state: GameState } }
  | { type: "room.actions"; payload: { fromSeq: number; actions: unknown[] } }
  | { type: "presence.update"; payload: { players: unknown[] } }
  | { type: "chat.message"; payload: { message: unknown } }
  | { type: "room.system"; payload: { type: string; message: string } }
  | { type: "error"; payload: { message: string } };

export type WSEventHandler = (event: WSEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private handlers: Set<WSEventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = true;

  constructor(url: string) {
    this.url = url;
  }

  connect(token: string, roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.token = token;
      this.shouldReconnect = true;

      try {
        const wsUrl = new URL(this.url);
        wsUrl.searchParams.set("token", token);
        wsUrl.searchParams.set("roomId", roomId);

        this.ws = new WebSocket(wsUrl.toString());

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.emit({ type: "room.state", payload: { seq: 0, state: null as any } });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
            this.emit({
              type: "error",
              payload: { message: "Failed to parse message" },
            });
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.emit({
            type: "error",
            payload: { message: "WebSocket connection error" },
          });
          reject(error);
        };

        this.ws.onclose = () => {
          this.ws = null;
          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              if (this.token && roomId) {
                this.connect(this.token, roomId).catch(console.error);
              }
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: unknown) {
    // Handle different message types from server
    if (typeof data === "object" && data !== null) {
      const msg = data as Record<string, unknown>;
      if (msg.type === "room.state") {
        this.emit({
          type: "room.state",
          payload: msg.payload as { seq: number; state: GameState },
        });
      } else if (msg.type === "room.actions") {
        this.emit({
          type: "room.actions",
          payload: msg.payload as { fromSeq: number; actions: unknown[] },
        });
      } else if (msg.type === "presence.update") {
        this.emit({
          type: "presence.update",
          payload: msg.payload as { players: unknown[] },
        });
      } else if (msg.type === "chat.message") {
        this.emit({
          type: "chat.message",
          payload: msg.payload as { message: unknown },
        });
      } else if (msg.type === "room.system") {
        this.emit({
          type: "room.system",
          payload: msg.payload as { type: string; message: string },
        });
      }
    }
  }

  sendAction(roomId: string, actorId: PlayerId, actionId: string, move: Move) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "action.play",
        payload: {
          roomId,
          actionId,
          actorId,
          move,
        },
      })
    );
  }

  sendChat(roomId: string, text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "chat.post",
        payload: {
          roomId,
          text,
        },
      })
    );
  }

  sendPresencePing(roomId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "presence.ping",
        payload: {
          roomId,
        },
      })
    );
  }

  joinRoom(roomId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "room.join",
        payload: {
          roomId,
        },
      })
    );
  }

  leaveRoom(roomId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "room.leave",
        payload: {
          roomId,
        },
      })
    );
  }

  on(eventHandler: WSEventHandler) {
    this.handlers.add(eventHandler);
    return () => {
      this.handlers.delete(eventHandler);
    };
  }

  private emit(event: WSEvent) {
    this.handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("Error in WebSocket event handler:", error);
      }
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsClientInstance: WebSocketClient | null = null;

export function getWebSocketClient(wsUrl?: string): WebSocketClient {
  if (!wsClientInstance) {
    const url = wsUrl || process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    wsClientInstance = new WebSocketClient(url);
  }
  return wsClientInstance;
}


