"use client";

import type { PlayerState } from "@mont/core-game";
import { StockPile } from "./StockPile";
import { DiscardPiles } from "./DiscardPiles";

interface OpponentAreaProps {
  player: PlayerState;
}

export function OpponentArea({ player }: OpponentAreaProps) {
  // Opponents can only see stock top and discard tops, not hand
  return (
    <div className="p-4 brutal-border bg-surface flex flex-col gap-4 brutal-shadow">
      <h3 className="text-2xl font-bold brutal-border px-3 py-1 bg-card inline-block">
        {player.name || player.id}
      </h3>

      <div className="flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Stock</h4>
          <StockPile stock={player.stock} />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Discards</h4>
          <DiscardPiles discards={player.discards} />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Hand</h4>
          <div className="flex gap-2">
            {Array.from({ length: player.hand.cards.length }).map((_, i) => (
              <div
                key={i}
                className="w-16 h-24 brutal-border bg-card-back flex items-center justify-center brutal-shadow-sm"
              >
                <div className="text-text-on-dark text-2xl font-bold">?</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
