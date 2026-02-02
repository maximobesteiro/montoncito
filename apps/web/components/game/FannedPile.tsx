"use client";

import type { Card as GameCard } from "@mont/core-game";
import type { ReactNode } from "react";
import { Card, type CardSize, pileSizeConfig } from "./Card";
import { Pile } from "./Pile";

interface FannedPileProps {
  cards: GameCard[];
  size?: CardSize;
  visibleCount?: number;
  label?: ReactNode;
  faceUp?: boolean;
  className?: string;
}

export function FannedPile({
  cards,
  size = "md",
  visibleCount = 4,
  label,
  faceUp = true,
  className = "",
}: FannedPileProps) {
  const visibleCards = cards.slice(-visibleCount);
  const config = pileSizeConfig[size];

  // When empty, let Pile handle the empty state
  if (cards.length === 0) {
    return (
      <Pile cards={cards} size={size} label={label} className={className} />
    );
  }

  // When cards exist, provide custom fanned rendering
  return (
    <Pile cards={cards} size={size} label={label} className={className}>
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
            faceUp={faceUp}
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
    </Pile>
  );
}

export type { CardSize };
