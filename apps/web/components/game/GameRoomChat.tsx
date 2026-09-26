"use client";

import { useEffect, useRef, useState } from "react";
import { RoomChat } from "@/components/RoomChat";
import type { ChatMessage } from "@/lib/socket-client";

export function GameRoomChat({
  roomId,
  messages,
  liveChatCount,
  currentPlayerId,
  canSend,
  onSendMessage,
}: {
  roomId: string;
  messages: ChatMessage[];
  liveChatCount: number;
  currentPlayerId: string | null;
  canSend: boolean;
  onSendMessage: (text: string) => boolean;
}) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(0);
  const lastLiveCount = useRef(liveChatCount);

  useEffect(() => {
    try {
      setExpanded(
        window.sessionStorage.getItem(`montoncito:${roomId}:chat-expanded`) !==
          "false",
      );
    } catch {
      // Browser storage may be unavailable; keep the default expanded state.
      setExpanded(true);
    }
  }, [roomId]);

  useEffect(() => {
    const arrivals = liveChatCount - lastLiveCount.current;
    lastLiveCount.current = liveChatCount;
    if (!expanded && arrivals > 0) setUnread((count) => count + arrivals);
  }, [liveChatCount, expanded]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) setUnread(0);
    try {
      window.sessionStorage.setItem(
        `montoncito:${roomId}:chat-expanded`,
        String(next),
      );
    } catch {
      // The panel remains usable even if storage is disabled.
    }
  };

  if (expanded === null) return null;

  return (
    <section className="min-w-0 lg:col-span-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="game-room-chat"
        className="brutal-border brutal-shadow flex w-full items-center justify-between bg-card p-3 font-bold"
      >
        <span>{expanded ? "Collapse chat" : "Expand chat"}</span>
        {!expanded && unread > 0 && (
          <span aria-live="polite">{unread} unread</span>
        )}
      </button>
      <div id="game-room-chat" className="mt-3" hidden={!expanded}>
        <RoomChat
          className="max-h-[400px]"
          messages={messages}
          currentPlayerId={currentPlayerId}
          canSend={canSend}
          onSendMessage={onSendMessage}
        />
      </div>
    </section>
  );
}
