"use client";

import type { Card } from "@mont/core-game";

interface FannedDiscardPileProps {
  pile: Card[];
  pileIndex: number;
}

export function FannedDiscardPile({ pile, pileIndex }: FannedDiscardPileProps) {
  const visibleCards = pile.slice(-4); // Show last 4 cards

  if (pile.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
          Discard {pileIndex + 1}
        </div>
        <div className="w-16 h-24 brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-xs">
          Empty
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
        Discard {pileIndex + 1} ({pile.length})
      </div>
      <div
        className="relative"
        style={{ width: 64, height: 96 + (visibleCards.length - 1) * 12 }}
      >
        {visibleCards.map((card, idx) => (
          <div
            key={card.id}
            className="w-16 h-24 brutal-border bg-card flex items-center justify-center text-sm font-bold absolute brutal-shadow-sm"
            style={{
              top: idx * 12,
              left: 0,
              zIndex: idx,
            }}
          >
            {card.kind === "joker" ? "🃏" : `${card.rank} ${card.suit[0]}`}
          </div>
        ))}
      </div>
    </div>
  );
}
