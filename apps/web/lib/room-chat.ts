import type { ChatMessage } from "./socket-client";
import { ChatHistorySchema, ChatMessageSchema } from "@mont/game-room";

export function isChatMessage(
  payload: unknown,
): payload is ChatMessage & { type: "CHAT_MESSAGE" } {
  return ChatMessageSchema.safeParse(payload).success;
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
