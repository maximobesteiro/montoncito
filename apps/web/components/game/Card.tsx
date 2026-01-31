"use client";

import type { Card as GameCard } from "@mont/core-game";

type CardSize = "xs" | "sm" | "md";

interface CardProps {
  card: GameCard;
  faceUp?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  size?: CardSize;
}

const sizeStyles: Record<
  CardSize,
  { container: string; value: string; suit: string; backIcon: string }
> = {
  xs: {
    container: "w-8 h-11",
    value: "text-xs",
    suit: "text-[10px]",
    backIcon: "text-sm",
  },
  sm: {
    container: "w-10 h-14",
    value: "text-sm",
    suit: "text-xs",
    backIcon: "text-base",
  },
  md: {
    container: "w-16 h-24",
    value: "text-2xl",
    suit: "text-xl",
    backIcon: "text-2xl",
  },
};

export function Card({
  card,
  faceUp = true,
  onClick,
  isPlayable = false,
  className = "",
  style,
  size = "md",
}: CardProps) {
  const displayValue = () => {
    if (card.kind === "joker") {
      return "J";
    }
    return card.rank.toString();
  };

  const displaySuit = () => {
    if (card.kind === "joker") {
      return "🃏";
    }
    const suitSymbols: Record<string, string> = {
      Clubs: "♣",
      Diamonds: "♦",
      Hearts: "♥",
      Spades: "♠",
    };
    return suitSymbols[card.suit] || "";
  };

  const sizes = sizeStyles[size];

  const baseStyles = `
    ${sizes.container}
    flex flex-col items-center justify-center
    brutal-border
    bg-card
    text-foreground
    font-bold
    ${onClick ? "cursor-pointer hover:scale-105" : ""}
    ${isPlayable ? "ring-4 ring-btn-primary ring-offset-2" : ""}
    transition-all
  `;

  if (!faceUp) {
    return (
      <div
        className={`${baseStyles} bg-card-back text-text-on-dark ${className}`}
        onClick={onClick}
        style={style}
      >
        <div className={sizes.backIcon}>🂠</div>
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={style}
    >
      <div className={sizes.value}>{displayValue()}</div>
      <div className={sizes.suit}>{displaySuit()}</div>
    </div>
  );
}
