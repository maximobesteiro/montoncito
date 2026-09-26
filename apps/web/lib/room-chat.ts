import type { ChatMessage } from "./socket-client";

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
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("messages" in payload) ||
    !Array.isArray(payload.messages) ||
    payload.messages.length > 100 ||
    !payload.messages.every(isChatMessage)
  )
    return null;
  return payload.messages;
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
