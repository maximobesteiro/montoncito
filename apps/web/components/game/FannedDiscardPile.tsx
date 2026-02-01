"use client";

import type { Card as GameCard } from "@mont/core-game";
import { Card } from "./Card";

type CardSize = "xs" | "sm" | "md";

const sizeConfig: Record<
  CardSize,
  { width: number; height: number; offsetY: number; offsetX: number }
> = {
  xs: { width: 32, height: 44, offsetY: 4, offsetX: 3 },
  sm: { width: 40, height: 56, offsetY: 6, offsetX: 4 },
  md: { width: 64, height: 96, offsetY: 12, offsetX: 8 },
};

interface FannedDiscardPileProps {
  pile: GameCard[];
  pileIndex: number;
  size?: CardSize;
  showLabel?: boolean;
  visibleCount?: number;
}

export function FannedDiscardPile({
  pile,
  pileIndex,
  size = "md",
  showLabel = true,
  visibleCount = 4,
}: FannedDiscardPileProps) {
  const visibleCards = pile.slice(-visibleCount);
  const config = sizeConfig[size];

  if (pile.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1">
        {showLabel && (
          <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
            Discard {pileIndex + 1}
          </div>
        )}
        <div
          className="brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-[10px]"
          style={{ width: config.width, height: config.height }}
        >
          —
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {showLabel && (
        <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
          Discard {pileIndex + 1} ({pile.length})
        </div>
      )}
      <div
        className="relative"
        style={{
          width: config.width + (visibleCards.length - 1) * config.offsetX,
          height: config.height + (visibleCards.length - 1) * config.offsetY,
        }}
      >
        {visibleCards.map((card, idx) => (
          <Card
            key={card.id}
            card={card}
            faceUp={true}
            size={size}
            className="absolute"
            style={{
              top: idx * config.offsetY,
              left: idx * config.offsetX,
              zIndex: idx,
            }}
          />
        ))}
      </div>
    </div>
  );
}
