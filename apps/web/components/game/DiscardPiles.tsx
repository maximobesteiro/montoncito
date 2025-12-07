"use client";

import type { DiscardArea } from "@mont/core-game";
import { Card } from "./Card";

interface DiscardPilesProps {
  discards: DiscardArea;
  onCardClick?: (pileIndex: number) => void;
  playablePiles?: Set<number>;
}

export function DiscardPiles({
  discards,
  onCardClick,
  playablePiles = new Set(),
}: DiscardPilesProps) {
  return (
    <div className="flex gap-2">
      {discards.map((pile, index) => {
        // Top card is the last element
        const topCard = pile[pile.length - 1];
        return (
          <div key={index} className="flex flex-col items-center gap-1">
            <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
              Discard {index + 1}
            </div>
            {topCard ? (
              <Card
                card={topCard}
                faceUp={true}
                onClick={onCardClick ? () => onCardClick(index) : undefined}
                isPlayable={playablePiles.has(index)}
              />
            ) : (
              <div className="w-16 h-24 brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-xs">
                Empty
              </div>
            )}
            {pile.length > 1 && (
              <div className="text-xs font-bold text-text-muted">
                +{pile.length - 1}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
