import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";

export type ServerEvent =
  | { type: "PLAYER_JOINED"; playerId: string }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "STATE_UPDATE"; meta?: unknown; state: unknown }
  | { type: "GAME_STARTED"; meta: unknown; state: unknown }
  | { type: "ROOM_UPDATED"; room: unknown }
  | { type: "KICKED" }
  | { type: "PONG"; ts: number };

export type ServerEventHandler = (event: ServerEvent) => void;

class SocketClient {
  private socket: Socket | null = null;
  private handlers = new Set<ServerEventHandler>();

  connect(token: string) {
    // Namespace is /ws (see server WebSocketGateway config)
    this.socket = io(`${getServerUrl()}/ws`, {
      transports: ["websocket"],
      auth: { token },
    });

    this.socket.on("connect_error", (err) => {
      console.error("Socket.IO connect_error:", err);
    });

    this.socket.on("event", (payload: unknown) => {
      // Trust server contract; runtime validation can be added later.
      if (
        typeof payload === "object" &&
        payload !== null &&
        "type" in payload
      ) {
        this.emit(payload as ServerEvent);
      }
    });
  }

  on(handler: ServerEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.handlers.clear();
  }

  get isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  private emit(ev: ServerEvent) {
    for (const h of this.handlers) {
      try {
        h(ev);
      } catch (e) {
        console.error("Error in ServerEventHandler:", e);
      }
    }
  }
}

let instance: SocketClient | null = null;

export function getSocketClient(): SocketClient {
  if (!instance) instance = new SocketClient();
  return instance;
}
