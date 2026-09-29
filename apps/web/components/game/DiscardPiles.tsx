"use client";

import type { DiscardArea } from "@mont/core-game";
import { formatCardName } from "@/lib/format-card-name";
import { Card } from "./Card";

interface DiscardPilesProps {
  discards: DiscardArea;
  onCardClick?: (pileIndex: number) => void;
  playablePiles?: Set<number>;
  selectedPile?: number | null;
  handDiscardTargets?: Set<number>;
  handDiscardOnlyTargets?: Set<number>;
  onHandDiscardClick?: (pileIndex: number) => void;
}

export function DiscardPiles({
  discards,
  onCardClick,
  playablePiles = new Set(),
  selectedPile,
  handDiscardTargets = new Set(),
  handDiscardOnlyTargets = new Set(),
  onHandDiscardClick,
}: DiscardPilesProps) {
  return (
    <div className="flex gap-2">
      {discards.map((pile, index) => {
        // Top card is the last element
        const topCard = pile[pile.length - 1];
        return (
          <div
            key={index}
            className="flex flex-col items-center gap-1"
            data-drop-discard={
              handDiscardOnlyTargets.has(index) || handDiscardTargets.has(index)
                ? index
                : undefined
            }
          >
            <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
              Discard {index + 1}
            </div>
            {topCard ? (
              <Card
                card={topCard}
                faceUp={true}
                onClick={
                  onCardClick && playablePiles.has(index)
                    ? () => onCardClick(index)
                    : undefined
                }
                isPlayable={playablePiles.has(index)}
                isSelected={selectedPile === index}
                dragSource={
                  onCardClick && playablePiles.has(index) && topCard
                    ? `discard:${index}`
                    : undefined
                }
                ariaLabel={
                  handDiscardOnlyTargets.has(index)
                    ? `Discard Hand to pile ${index + 1}, over ${formatCardName(topCard)}`
                    : `Discard pile ${index + 1}, ${formatCardName(topCard)}`
                }
              />
            ) : playablePiles.has(index) && onCardClick ? (
              <button
                type="button"
                aria-label={`Discard pile ${index + 1}, empty`}
                onClick={() => onCardClick(index)}
                className="w-16 h-24 brutal-border border-dashed border-btn-primary bg-surface flex items-center justify-center text-text-subtle text-xs"
              >
                Empty
              </button>
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
            {handDiscardTargets.has(index) && onHandDiscardClick && (
              <button
                type="button"
                className="brutal-button text-xs"
                onClick={() => onHandDiscardClick(index)}
              >
                Discard Hand to pile {index + 1}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
