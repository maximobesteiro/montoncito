"use client";

import type { Stock } from "@mont/core-game";
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

  return (
    <Pile
      cards={stock.faceDown}
      size={size}
      label={`Stock (${remainingCount})`}
      onClick={onTopCardClick}
      isPlayable={isPlayable}
      isSelected={isSelected}
      dragSource={onTopCardClick && isPlayable ? "stock" : undefined}
      cardAriaLabel={
        remainingCount > 0
          ? `Stock top ${formatCardName(stock.faceDown[remainingCount - 1]!)}`
          : undefined
      }
      faceUp={true}
    />
  );
}
