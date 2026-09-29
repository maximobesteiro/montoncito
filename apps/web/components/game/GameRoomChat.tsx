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
  onMobileOpenChange,
}: {
  roomId: string;
  messages: ChatMessage[];
  liveChatCount: number;
  currentPlayerId: string | null;
  canSend: boolean;
  onSendMessage: (text: string) => boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const visible = narrow ? mobileOpen : expanded;
  const [unread, setUnread] = useState(0);
  const lastLiveCount = useRef(liveChatCount);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setNarrow(media.matches);
      setMobileOpen(false);
      onMobileOpenChange(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [onMobileOpenChange]);

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    panel.close();
    if (!narrow) panel.show();
    else if (mobileOpen) panel.showModal();
  }, [narrow, mobileOpen]);

  useEffect(() => {
    if (visible) setUnread(0);
  }, [visible]);

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
    if (!visible && arrivals > 0) setUnread((count) => count + arrivals);
  }, [liveChatCount, visible]);

  const changeMobileOpen = (open: boolean) => {
    onMobileOpenChange(open);
    setMobileOpen(open);
    if (open) setUnread(0);
  };

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

  return (
    <section
      className="game-room-chat min-w-0"
      aria-label="Room conversation"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="game-room-chat"
        hidden={narrow === true}
        className="chat-desktop-toggle brutal-border brutal-shadow flex w-full items-center justify-between bg-card p-3 font-bold"
      >
        <span>{expanded ? "Collapse chat" : "Expand chat"}</span>
        {!expanded && unread > 0 && (
          <span aria-live="polite">{unread} unread</span>
        )}
      </button>
      <button
        type="button"
        hidden={narrow === false || mobileOpen}
        className="chat-mobile-entry brutal-border bg-card p-3 font-bold"
        aria-expanded={mobileOpen}
        aria-controls="game-room-chat"
        onClick={() => changeMobileOpen(true)}
      >
        Open chat
        {unread > 0 && <span aria-live="polite"> · {unread} unread</span>}
      </button>
      <dialog
        ref={dialog}
        id="game-room-chat"
        open={narrow !== true}
        role={narrow ? "dialog" : "region"}
        aria-label="Game room chat"
        aria-modal={narrow && mobileOpen ? true : undefined}
        className="chat-container"
        onCancel={(event) => {
          event.preventDefault();
          changeMobileOpen(false);
        }}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          backdropPress.current =
            event.target === event.currentTarget &&
            (event.clientX < bounds.left ||
              event.clientX >= bounds.right ||
              event.clientY < bounds.top ||
              event.clientY >= bounds.bottom);
        }}
        onClick={(event) => {
          if (
            narrow &&
            backdropPress.current &&
            event.target === event.currentTarget
          )
            changeMobileOpen(false);
          backdropPress.current = false;
        }}
      >
        <div className="chat-content" hidden={!visible}>
          <button
            type="button"
            hidden={!narrow}
            className="brutal-button mb-3 self-end bg-card"
            onClick={() => changeMobileOpen(false)}
          >
            Close chat
          </button>
          <RoomChat
            className="game-chat-composer"
            isVisible={visible}
            messages={messages}
            currentPlayerId={currentPlayerId}
            canSend={canSend}
            onSendMessage={onSendMessage}
          />
        </div>
      </dialog>
    </section>
  );
}
