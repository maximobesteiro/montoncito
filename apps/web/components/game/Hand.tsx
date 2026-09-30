"use client";

import type { Hand as GameHand } from "@mont/core-game";
import { Card } from "./Card";
import { formatCardName } from "@/lib/format-card-name";

interface HandProps {
  hand: GameHand;
  onCardClick?: (cardId: string) => void;
  playableCards?: Set<string>;
  selectedCardId?: string | null;
  pendingCardId?: string;
}

export function Hand({
  hand,
  onCardClick,
  playableCards = new Set(),
  selectedCardId,
  pendingCardId,
}: HandProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {hand.cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          faceUp={true}
          onClick={
            onCardClick && playableCards.has(card.id)
              ? () => onCardClick(card.id)
              : undefined
          }
          isPlayable={selectedCardId === card.id}
          className={
            playableCards.has(card.id) && selectedCardId !== card.id
              ? "outline outline-2 outline-btn-primary"
              : ""
          }
          ariaLabel={`Hand ${formatCardName(card)}`}
          isSelected={selectedCardId === card.id}
          isPending={pendingCardId === card.id}
          dragSource={
            onCardClick && playableCards.has(card.id)
              ? `hand:${card.id}`
              : undefined
          }
        />
      ))}
    </div>
  );
}
