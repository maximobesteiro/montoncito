"use client";

import { useParams } from "next/navigation";
import type { Card } from "@mont/core-game";
import { useGameRoom } from "@/lib/use-game-room";

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { state, seq, connectionStatus, problem } = useGameRoom(roomId);

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
        </div>
        <p className="font-mono text-sm" aria-live="polite">
          Sequence {seq}
        </p>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="brutal-border brutal-shadow bg-card p-4">
          <h2 className="mb-3 text-xl font-bold">Build piles</h2>
          {state.center.buildPiles.length === 0 ? (
            <p className="text-text-muted">No active Build piles</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {state.center.buildPiles.map((pile) => (
                <div
                  key={pile.id}
                  className="brutal-border min-w-24 bg-surface p-3"
                >
                  <p className="font-mono text-sm">Pile {pile.id}</p>
                  <p className="text-lg font-bold">Next: {pile.nextRank ?? "complete"}</p>
                  <p className="text-xs">{pile.cards.length} cards</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="brutal-border brutal-shadow bg-card p-4">
          <h2 className="mb-3 text-xl font-bold">Players</h2>
          <ul className="space-y-2">
            {state.players.map((playerId) => {
              const player = state.byId[playerId];
              return (
                <li key={playerId} className="brutal-border bg-surface p-3">
                  <p className="font-bold">{player?.name ?? playerId}</p>
                  <p className="text-sm">
                    Stock: {player?.stock.faceDown.length ?? 0} cards
                  </p>
                  <p className="text-sm">
                    Hand: {player?.hand.cards.length ?? 0} cards
                  </p>
                  <p className="text-sm">
                    Discards:{" "}
                    {player?.discards.map(describeDiscard).join(" · ") ??
                      "unavailable"}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-text-muted">
            {state.turn.activePlayer}&apos;s turn · read-only view
          </p>
        </section>
      </div>
    </main>
  );
}

function describeDiscard(pile: Card[], index: number): string {
  const topCard = pile.at(-1);
  const value = !topCard
    ? "empty"
    : topCard.kind === "joker"
      ? "Joker"
      : topCard.rank;
  return `${index + 1}: ${value}`;
}
