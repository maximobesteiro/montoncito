import type { ChatMessage } from "./socket-client";
import { ChatHistorySchema } from "@mont/game-room";

export function isChatMessage(
  payload: unknown,
): payload is ChatMessage & { type: "CHAT_MESSAGE" } {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("type" in payload) ||
    payload.type !== "CHAT_MESSAGE"
  )
    return false;
  const message = payload as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.playerId === "string" &&
    typeof message.playerName === "string" &&
    typeof message.text === "string" &&
    typeof message.timestamp === "number"
  );
}

export function readChatHistory(payload: unknown): ChatMessage[] | null {
  const parsed = ChatHistorySchema.safeParse(payload);
  return parsed.success ? parsed.data.messages : null;
}

export function appendChatMessage(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  if (messages.some(({ id }) => id === message.id)) return messages;
  return [...messages, message].slice(-100);
}

// The server sends history in delivery order. Live frames received while the
// request is in flight may also be present in that history; IDs resolve overlap.
export function reconcileChatHistory(
  history: ChatMessage[],
  liveSinceRequest: ChatMessage[],
): ChatMessage[] {
  return liveSinceRequest.reduce(appendChatMessage, history);
}

export function createChatRecovery() {
  let liveSinceRequest: ChatMessage[] = [];
  let awaitingHistory = false;
  return {
    begin() {
      liveSinceRequest = [];
      awaitingHistory = true;
    },
    receiveLive(message: ChatMessage) {
      if (awaitingHistory)
        liveSinceRequest = appendChatMessage(liveSinceRequest, message);
    },
    receiveHistory(payload: unknown): ChatMessage[] | null {
      const history = readChatHistory(payload);
      if (!history) return null;
      const messages = reconcileChatHistory(history, liveSinceRequest);
      liveSinceRequest = [];
      awaitingHistory = false;
      return messages;
    },
  };
}
