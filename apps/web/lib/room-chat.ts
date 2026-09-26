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
  // A room serializes the snapshot and broadcasts on one Socket.IO connection.
  // Replacing earlier live frames with this bounded snapshot preserves delivery order.
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
