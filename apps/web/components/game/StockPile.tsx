"use client";

import { peekTopCard, type Stock } from "@mont/core-game";
import { formatCardName } from "@/lib/format-card-name";
import type { CardSize } from "./Card";
import { Pile } from "./Pile";

interface StockPileProps {
  stock: Stock;
  size?: CardSize;
  onTopCardClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
}

export function StockPile({
  stock,
  size = "md",
  onTopCardClick,
  isPlayable = false,
  isSelected = false,
}: StockPileProps) {
  const remainingCount = stock.faceDown.length;
  const topCard = peekTopCard(stock.faceDown);

  return (
    <Pile
      cards={stock.faceDown}
      presentation={{ kind: "stacked", coveredFaceUp: false }}
      size={size}
      label={`Stock (${remainingCount})`}
      onClick={onTopCardClick}
      isPlayable={isPlayable}
      isSelected={isSelected}
      dragSource={onTopCardClick && isPlayable ? "stock" : undefined}
      cardAriaLabel={
        topCard ? `Stock top ${formatCardName(topCard)}` : undefined
      }
      faceUp={true}
      coveredCardAriaLabel={() => "Covered Stock card"}
    />
  );
}
