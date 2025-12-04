"use client";

import type { Stock } from "@mont/core-game";
import { Card } from "./Card";

interface StockPileProps {
  stock: Stock;
  onTopCardClick?: () => void;
  isPlayable?: boolean;
}

export function StockPile({
  stock,
  onTopCardClick,
  isPlayable = false,
}: StockPileProps) {
  // Top card is the last element in faceDown array
  const topCard = stock.faceDown[stock.faceDown.length - 1];
  const remainingCount = stock.faceDown.length;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm font-bold brutal-border px-2 py-1 bg-white">Stock ({remainingCount})</div>
      {topCard ? (
        <Card
          card={topCard}
          faceUp={true}
          onClick={onTopCardClick}
          isPlayable={isPlayable}
        />
      ) : (
        <div className="w-16 h-24 brutal-border border-dashed bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
          Empty
        </div>
      )}
      {remainingCount > 1 && (
        <div className="w-16 h-24 brutal-border bg-gray-700 flex items-center justify-center text-white text-xs brutal-shadow-sm">
          {remainingCount - 1}
        </div>
      )}
    </div>
  );
}

