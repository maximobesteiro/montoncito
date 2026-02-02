"use client";

import type { Stock } from "@mont/core-game";
import type { CardSize } from "./Card";
import { Pile } from "./Pile";

interface StockPileProps {
  stock: Stock;
  size?: CardSize;
  onTopCardClick?: () => void;
  isPlayable?: boolean;
}

export function StockPile({
  stock,
  size = "md",
  onTopCardClick,
  isPlayable = false,
}: StockPileProps) {
  const remainingCount = stock.faceDown.length;

  return (
    <Pile
      cards={stock.faceDown}
      size={size}
      label={`Stock (${remainingCount})`}
      onClick={onTopCardClick}
      isPlayable={isPlayable}
      faceUp={true}
    />
  );
}
