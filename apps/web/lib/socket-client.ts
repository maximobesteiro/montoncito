import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";
import {
  appendChatMessage,
  isChatMessage,
  readChatHistory,
  reconcileChatHistory,
} from "./room-chat";

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
  private liveSinceRequest: ChatMessage[] = [];
  private awaitingChatHistory = false;

  connect(token: string) {
    // Namespace is /ws (see server WebSocketGateway config)
    this.socket = io(`${getServerUrl()}/ws`, {
      transports: ["websocket"],
      auth: { token },
    });

    this.socket.on("connect_error", (err) => {
      console.error("Socket.IO connect_error:", err);
    });

    this.socket.on("connect", () => {
      this.liveSinceRequest = [];
      this.awaitingChatHistory = true;
      this.socket?.emit("chat.history.request");
    });

    this.socket.on("chat.history", (payload: unknown) => {
      const history = readChatHistory(payload);
      if (!history) return;
      this.emit({
        type: "CHAT_HISTORY",
        messages: reconcileChatHistory(history, this.liveSinceRequest),
      });
      this.liveSinceRequest = [];
      this.awaitingChatHistory = false;
    });

    this.socket.on("event", (payload: unknown) => {
      // Trust server contract; runtime validation can be added later.
      if (
        typeof payload === "object" &&
        payload !== null &&
        "type" in payload
      ) {
        if (this.awaitingChatHistory && isChatMessage(payload)) {
          this.liveSinceRequest = appendChatMessage(
            this.liveSinceRequest,
            payload,
          );
        }
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
    this.liveSinceRequest = [];
    this.awaitingChatHistory = false;
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
