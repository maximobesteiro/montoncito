"use client";

import type { Hand as GameHand } from "@mont/core-game";
import { Card, cardDimensions, type CardSize } from "./Card";
import { formatCardName } from "@/lib/format-card-name";

const handCardSize: CardSize = "sm";

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
    <div
      className="own-hand-cards"
      style={
        {
          "--hand-count": Math.max(1, hand.cards.length),
          "--hand-card-width": `${cardDimensions[handCardSize].width}px`,
          "--hand-card-height": `${cardDimensions[handCardSize].height}px`,
        } as React.CSSProperties
      }
    >
      {hand.cards.length === 0 && (
        <span className="empty-hand text-sm text-text-muted">Empty Hand</span>
      )}
      {hand.cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          size={handCardSize}
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
