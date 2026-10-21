"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/socket-client";

interface RoomChatProps {
  messages: ChatMessage[];
  currentPlayerId: string | null;
  onSendMessage: (text: string) => boolean | void;
  canSend?: boolean;
  className?: string;
  isVisible?: boolean;
  onClose?: () => void;
  headerAction?: ReactNode;
  unreadCount?: number;
}

export function RoomChat({
  messages,
  currentPlayerId,
  onSendMessage,
  canSend = true,
  className = "",
  isVisible = true,
  onClose,
  headerAction,
  unreadCount = 0,
}: RoomChatProps) {
  const [input, setInput] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  };

  useEffect(() => {
    if (!isVisible) return;
    // The mobile dialog must enter the top layer before its log can be measured.
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isVisible]);

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
      hidden={!isVisible && !headerAction}
      data-collapsed={!isVisible}
      className={`brutal-border p-6 bg-card brutal-shadow flex flex-col h-full min-w-0 min-h-[300px] ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-3 ${isVisible ? "mb-3" : ""}`}
      >
        <h2 className="flex items-center text-2xl font-bold">
          Chat
          {!isVisible && unreadCount > 0 && (
            <span
              aria-live="polite"
              className="pl-1 text-base font-medium text-text-muted"
            >
              {" "}({unreadCount} unread)
            </span>
          )}
        </h2>
        {headerAction}
        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-2xl font-bold hover:bg-surface"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      <div
        ref={messagesContainerRef}
        hidden={!isVisible}
        role="log"
        aria-label="Chat messages"
        className={`${isVisible ? "" : "hidden"} flex-1 overflow-y-auto brutal-border bg-muted p-3 space-y-2 min-h-0`}
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
      </div>

      <div
        hidden={!isVisible}
        className={isVisible ? "mt-3 flex gap-2" : "hidden"}
      >
        <input
          type="text"
          aria-label="Chat message"
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
