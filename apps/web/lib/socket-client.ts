import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";
import { GAME_ROOM_PROTOCOL_VERSION } from "@mont/game-room";
import { createChatRecovery, isChatMessage } from "./room-chat";

export type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
};

export type ServerEvent =
  | { type: "PLAYER_JOINED"; playerId: string }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "GAME_STARTED"; roomId: string }
  | { type: "ROOM_UPDATED"; room: unknown }
  | { type: "KICKED" }
  | ({ type: "CHAT_MESSAGE" } & ChatMessage)
  | { type: "CHAT_HISTORY"; messages: ChatMessage[] }
  | { type: "PONG"; ts: number };

export type ServerEventHandler = (event: ServerEvent) => void;

class SocketClient {
  private socket: Socket | null = null;
  private handlers = new Set<ServerEventHandler>();
  private chatRecovery = createChatRecovery();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  connect(token: string, renewToken?: () => Promise<string>) {
    // Namespace is /ws (see server WebSocketGateway config)
    this.socket = io(`${getServerUrl()}/ws`, {
      transports: ["websocket"],
      auth: { token },
      reconnection: !renewToken,
    });
    const socket = this.socket;
    let recoveryInFlight = false;
    const recover = async () => {
      if (!renewToken || recoveryInFlight || this.socket !== socket) return;
      recoveryInFlight = true;
      try {
        const refreshed = await renewToken();
        if (this.socket !== socket) return;
        socket.auth = { token: refreshed };
        socket.connect();
      } catch {
        if (this.socket !== socket) return;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void recover();
        }, 1000);
      } finally {
        recoveryInFlight = false;
      }
    };

    this.socket.on("connect_error", (err) => {
      console.error("Socket.IO connect_error:", err);
      void recover();
    });

    this.socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") void recover();
    });

    this.socket.on("connect", () => {
      this.chatRecovery.begin();
      this.socket?.emit("chat.history.request", {
        version: GAME_ROOM_PROTOCOL_VERSION,
      });
    });

    this.socket.on("chat.history", (payload: unknown) => {
      const messages = this.chatRecovery.receiveHistory(payload);
      if (!messages) return;
      this.emit({
        type: "CHAT_HISTORY",
        messages,
      });
    });

    this.socket.on("event", (payload: unknown) => {
      // Trust server contract; runtime validation can be added later.
      if (
        typeof payload === "object" &&
        payload !== null &&
        "type" in payload
      ) {
        if (isChatMessage(payload)) this.chatRecovery.receiveLive(payload);
        this.emit(payload as ServerEvent);
      }
    });
  }

  on(handler: ServerEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.disconnect();
    this.socket = null;
    this.handlers.clear();
    this.chatRecovery = createChatRecovery();
  }

  get isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  sendChat(text: string) {
    if (!this.socket?.connected) {
      console.error("Cannot send chat: socket not connected");
      return;
    }
    this.socket.emit("chat", { text });
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
