"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/socket-client";

interface WaitingRoomChatProps {
  messages: ChatMessage[];
  currentPlayerId: string | null;
  onSendMessage: (text: string) => boolean | void;
  canSend?: boolean;
  className?: string;
}

export function WaitingRoomChat({
  messages,
  currentPlayerId,
  onSendMessage,
  canSend = true,
  className = "",
}: WaitingRoomChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !canSend) return;

    if (onSendMessage(text) !== false) setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`brutal-border p-6 bg-card brutal-shadow flex flex-col h-full min-w-0 min-h-[300px] ${className}`}
    >
      <h2 className="text-2xl font-bold mb-3">Chat</h2>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto brutal-border bg-muted p-3 space-y-2 min-h-0"
      >
        {messages.length === 0 ? (
          <p className="text-text-muted font-semibold text-sm">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm wrap-break-word">
              <span
                className={`font-bold ${
                  msg.playerId === currentPlayerId
                    ? "text-btn-primary"
                    : "text-text-primary"
                }`}
              >
                {msg.playerName}
                {msg.playerId === currentPlayerId ? " (you)" : ""}:
              </span>{" "}
              <span className="text-text-primary">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          maxLength={500}
          className="min-w-0 flex-1 brutal-border px-3 py-2 bg-card text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!canSend || !input.trim()}
          className={`brutal-button text-text-on-dark text-sm ${
            canSend && input.trim()
              ? "bg-btn-primary hover:bg-btn-primary-hover"
              : "bg-btn-disabled cursor-not-allowed"
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
