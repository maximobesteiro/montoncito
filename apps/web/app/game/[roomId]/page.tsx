"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useGameRoom } from "@/lib/use-game-room";
import { GameRoomBoard } from "@/components/game/GameRoomBoard";
import { GameRoomChat } from "@/components/game/GameRoomChat";
import type { ActionRejected } from "@mont/game-room";

const rejectionReasons: Record<ActionRejected["code"], string> = {
  STALE_BASE_SEQ:
    "The board changed before your Action arrived. Review the latest board and try again.",
  ACTION_ID_CONFLICT:
    "This Action ID was already used for a different Action. Try again.",
  NOT_YOUR_TURN: "It is not your Turn. Wait for your Turn to play.",
  ILLEGAL_ACTION:
    "That Action is not allowed. Choose a legal source and destination.",
  GAME_FINISHED: "The game has finished. No more gameplay Actions are allowed.",
};

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const {
    state,
    seq,
    currentPlayerId,
    connectionStatus,
    problem,
    submissionError,
    pendingAction,
    lastActionResult,
    dismissActionResult,
    submitAction,
    chatMessages,
    liveChatCount,
    sendChat,
  } = useGameRoom(roomId);

  if (problem) {
    return (
      <main className="min-h-screen bg-muted p-6">
        <section className="brutal-border brutal-shadow mx-auto max-w-3xl bg-card p-6">
          <h1 className="text-2xl font-bold">Game room unavailable</h1>
          <p className="mt-2" role="alert">
            {problem}
          </p>
          <Link href="/" className="brutal-button mt-4 inline-block">
            Return to Lobby
          </Link>
        </section>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-muted p-6">
        <p role="status" className="mx-auto max-w-3xl font-bold">
          {connectionStatus === "synchronizing"
            ? "Synchronizing Game room…"
            : "Connecting to Game room…"}
        </p>
      </main>
    );
  }

  return (
    <main className="game-room-page min-h-screen space-y-4 bg-muted p-4 sm:p-6">
      <header className="brutal-border brutal-shadow mx-auto flex max-w-6xl items-center justify-between bg-card p-4">
        <div>
          <h1 className="text-2xl font-bold">Game room</h1>
          <p className="font-mono text-sm">{roomId}</p>
          {connectionStatus === "connecting" && (
            <p role="status" className="text-sm font-semibold">
              Reconnecting to the Game room… Board is stale and read-only.
            </p>
          )}
          {connectionStatus === "synchronizing" && (
            <p role="status" className="text-sm font-semibold">
              Synchronizing Game room… Board is stale and read-only.
            </p>
          )}
        </div>
        <p className="font-mono text-sm">Sequence {seq}</p>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[2fr_1fr]">
        {currentPlayerId && (
          <div className="lg:col-span-2">
            {lastActionResult && "code" in lastActionResult && (
              <section className="brutal-border mb-4 bg-card p-4">
                <p
                  key={lastActionResult.actionId}
                  className="font-semibold"
                  role="alert"
                >
                  Action rejected.{" "}
                  {lastActionResult.message ??
                    rejectionReasons[lastActionResult.code]}
                </p>
                <button
                  type="button"
                  className="brutal-button mt-2"
                  onClick={dismissActionResult}
                >
                  Dismiss
                </button>
              </section>
            )}
            <GameRoomBoard
              key={`${roomId}:${currentPlayerId}`}
              seq={seq}
              gameState={state}
              currentPlayerId={currentPlayerId}
              pendingAction={pendingAction}
              canSubmit={connectionStatus === "connected"}
              submitAction={submitAction}
              chatOpen={mobileChatOpen}
              chat={
                <GameRoomChat
                  key={roomId}
                  roomId={roomId}
                  messages={chatMessages}
                  liveChatCount={liveChatCount}
                  currentPlayerId={currentPlayerId}
                  canSend={connectionStatus === "connected"}
                  onSendMessage={sendChat}
                  onMobileOpenChange={setMobileChatOpen}
                />
              }
            />
            {submissionError && (
              <p className="mt-2 font-semibold" role="alert">
                {submissionError}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
