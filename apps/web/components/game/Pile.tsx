"use client";

import type { Card as GameCard } from "@mont/core-game";
import type { ReactNode } from "react";
import { Card, type CardSize, pileSizeConfig } from "./Card";

interface PileProps {
  cards: GameCard[];
  size?: CardSize;
  label?: ReactNode;
  onClick?: () => void;
  isPlayable?: boolean;
  faceUp?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Pile({
  cards,
  size = "md",
  label,
  onClick,
  isPlayable = false,
  faceUp = true,
  className = "",
  children,
}: PileProps) {
  const topCard = cards[cards.length - 1];
  const config = pileSizeConfig[size];

  const defaultCardContent = topCard ? (
    <Card
      card={topCard}
      faceUp={faceUp}
      size={size}
      onClick={onClick}
      isPlayable={isPlayable}
    />
  ) : (
    <div
      className="brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-[10px]"
      style={{ width: config.width, height: config.height }}
    >
      —
    </div>
  );

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {label && (
        <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
          {label}
        </div>
      )}
      {children ?? defaultCardContent}
    </div>
  );
}

export type { CardSize };
