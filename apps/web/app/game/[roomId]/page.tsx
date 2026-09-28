"use client";

import { useParams } from "next/navigation";
import { useGameRoom } from "@/lib/use-game-room";
import { GameRoomBoard } from "@/components/game/GameRoomBoard";
import { GameRoomChat } from "@/components/game/GameRoomChat";

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const {
    state,
    seq,
    currentPlayerId,
    connectionStatus,
    problem,
    submissionError,
    pendingAction,
    lastActionResult,
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
    <main className="min-h-screen space-y-4 bg-muted p-4 sm:p-6">
      <header className="brutal-border brutal-shadow mx-auto flex max-w-6xl items-center justify-between bg-card p-4">
        <div>
          <h1 className="text-2xl font-bold">Game room</h1>
          <p className="font-mono text-sm">{roomId}</p>
          {connectionStatus === "connecting" && (
            <p role="status" className="text-sm font-semibold">
              Reconnecting to the Game room…
            </p>
          )}
          {connectionStatus === "synchronizing" && (
            <p role="status" className="text-sm font-semibold">
              Synchronizing Game room…
            </p>
          )}
        </div>
        <p className="font-mono text-sm" aria-live="polite">
          Sequence {seq}
        </p>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[2fr_1fr]">
        {currentPlayerId && (
          <div className="lg:col-span-2">
            <GameRoomBoard
              key={`${roomId}:${seq}`}
              gameState={state}
              currentPlayerId={currentPlayerId}
              pendingAction={pendingAction}
              canSubmit={connectionStatus === "connected"}
              submitAction={submitAction}
            />
            {submissionError && (
              <p className="mt-2 font-semibold" role="alert">
                {submissionError}
              </p>
            )}
            {lastActionResult && "code" in lastActionResult && (
              <p className="mt-2 font-semibold" role="alert">
                Action rejected: {lastActionResult.code}
                {lastActionResult.message
                  ? ` — ${lastActionResult.message}`
                  : ""}
              </p>
            )}
          </div>
        )}
        <GameRoomChat
          key={roomId}
          roomId={roomId}
          messages={chatMessages}
          liveChatCount={liveChatCount}
          currentPlayerId={currentPlayerId}
          canSend={connectionStatus === "connected"}
          onSendMessage={sendChat}
        />
      </div>
    </main>
  );
}
