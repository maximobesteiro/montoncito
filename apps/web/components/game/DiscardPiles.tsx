"use client";

import type { DiscardArea } from "@mont/core-game";
import { peekTopCard } from "@mont/core-game";
import { useId, useState } from "react";
import { formatCardName } from "@/lib/format-card-name";
import { Card, pileSizeConfig } from "./Card";

interface DiscardPilesProps {
  discards: DiscardArea;
  playerName: string;
  isOpponent?: boolean;
  onCardClick?: (pileIndex: number) => void;
  playablePiles?: Set<number>;
  selectedPile?: number | null;
  handDiscardTargets?: Set<number>;
  handDiscardOnlyTargets?: Set<number>;
  onHandDiscardClick?: (pileIndex: number) => void;
  pendingPile?: number;
}

export function DiscardPiles({
  discards,
  playerName,
  isOpponent = false,
  onCardClick,
  playablePiles = new Set(),
  selectedPile,
  handDiscardTargets = new Set(),
  handDiscardOnlyTargets = new Set(),
  onHandDiscardClick,
  pendingPile,
}: DiscardPilesProps) {
  const [expandedPiles, setExpandedPiles] = useState<Set<number>>(new Set());
  const id = useId();
  return (
    <div className="flex flex-wrap items-start gap-2">
      {discards.map((pile, index) => {
        const topCard = peekTopCard(pile);
        const isHandDiscardTarget =
          handDiscardOnlyTargets.has(index) || handDiscardTargets.has(index);
        const expanded = pile.length > 1 && expandedPiles.has(index);
        const visibleCards = expanded ? pile : pile.slice(isOpponent ? -1 : -3);
        const offset = expanded
          ? pileSizeConfig.md.height + 8
          : pileSizeConfig.md.offsetY;
        return (
          <div
            key={index}
            role="group"
            aria-label={`${playerName} Discard pile ${index + 1}`}
            onClick={(event) => {
              // Top-card buttons and history controls handle their own taps.
              if ((event.target as Element).closest("button")) return;
              if (isHandDiscardTarget) onHandDiscardClick?.(index);
            }}
            className={`flex flex-col items-center gap-1 ${pendingPile === index ? "outline outline-4 outline-dashed" : ""}`}
            data-drop-discard={isHandDiscardTarget ? index : undefined}
          >
            {pendingPile === index && (
              <span className="text-xs font-bold">Pending</span>
            )}
            {pile.length > 1 && (
              <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
                Discard {index + 1}
              </div>
            )}
            <div
              id={`${id}-${index}`}
              className="relative"
              style={{
                height: topCard
                  ? pileSizeConfig.md.height +
                    (visibleCards.length - 1) * offset
                  : undefined,
                width: pileSizeConfig.md.width,
              }}
            >
              {visibleCards.slice(0, -1).map((card, cardIndex) => (
                <Card
                  key={card.id}
                  card={card}
                  ariaLabel={`Covered Discard pile ${index + 1}, ${formatCardName(card)}`}
                  style={{ position: "absolute", top: cardIndex * offset }}
                />
              ))}
              {topCard ? (
                <Card
                  style={{
                    position: "absolute",
                    top: (visibleCards.length - 1) * offset,
                  }}
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
            </div>
            {expanded && <span className="text-xs font-bold">Top</span>}
            {pile.length > 1 && (
              <>
                <div className="text-xs font-bold text-text-muted">
                  {pile.length} cards
                </div>
                <button
                  type="button"
                  className="brutal-button text-xs"
                  aria-expanded={expanded}
                  aria-controls={`${id}-${index}`}
                  onClick={() =>
                    setExpandedPiles((previous) => {
                      const next = new Set(previous);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                >
                  {expanded ? "Close" : "View all"}
                </button>
              </>
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
