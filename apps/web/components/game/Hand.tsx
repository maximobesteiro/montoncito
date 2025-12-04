"use client";

import type { Hand as GameHand } from "@mont/core-game";
import { Card } from "./Card";

interface HandProps {
  hand: GameHand;
  onCardClick?: (cardId: string) => void;
  playableCards?: Set<string>;
}

export function Hand({
  hand,
  onCardClick,
  playableCards = new Set(),
}: HandProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {hand.cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          faceUp={true}
          onClick={onCardClick ? () => onCardClick(card.id) : undefined}
          isPlayable={playableCards.has(card.id)}
        />
      ))}
    </div>
  );
}


