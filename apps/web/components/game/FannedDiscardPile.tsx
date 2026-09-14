"use client";

import type { Card as GameCard } from "@mont/core-game";
import type { CardSize } from "./Card";
import { FannedPile } from "./FannedPile";

interface FannedDiscardPileProps {
  pile: GameCard[];
  pileIndex: number;
  size?: CardSize;
  showLabel?: boolean;
  visibleCount?: number;
}

export function FannedDiscardPile({
  pile,
  pileIndex,
  size = "md",
  showLabel = true,
  visibleCount = 4,
}: FannedDiscardPileProps) {
  const label = showLabel
    ? pile.length > 0
      ? `Discard ${pileIndex + 1} (${pile.length})`
      : `Discard ${pileIndex + 1}`
    : undefined;

  return (
    <FannedPile
      cards={pile}
      size={size}
      visibleCount={visibleCount}
      label={label}
    />
  );
}
