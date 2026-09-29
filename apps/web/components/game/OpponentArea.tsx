"use client";

import type { PlayerState } from "@mont/core-game";
import { StockPile } from "./StockPile";
import { DiscardPiles } from "./DiscardPiles";

interface OpponentAreaProps {
  player: PlayerState;
  isActive?: boolean;
}

export function OpponentArea({ player, isActive = false }: OpponentAreaProps) {
  const name = player.name || player.id;
  const handCount = player.hand.cards.length;
  return (
    <section
      aria-label={name}
      className="min-w-0 p-3 brutal-border bg-surface flex flex-col gap-3 brutal-shadow"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-lg font-bold break-words">{name}</h3>
        {isActive && (
          <span className="brutal-border bg-active-bg px-2 text-sm font-bold">
            Turn
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StockPile stock={player.stock} />
        <p className="text-sm font-semibold">
          Hand: {handCount} concealed {handCount === 1 ? "card" : "cards"}
        </p>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Discard piles</h4>
        <DiscardPiles discards={player.discards} playerName={name} isOpponent />
      </div>
    </section>
  );
}
