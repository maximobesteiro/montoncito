"use client";

import type { Card as GameCard } from "@mont/core-game";

interface CardProps {
  card: GameCard;
  faceUp?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  className?: string;
}

export function Card({
  card,
  faceUp = true,
  onClick,
  isPlayable = false,
  className = "",
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

  const baseStyles = `
    w-16 h-24
    flex flex-col items-center justify-center
    brutal-border
    bg-card
    text-foreground
    font-bold text-xl
    brutal-shadow-sm
    ${onClick ? "cursor-pointer hover:scale-105" : ""}
    ${isPlayable ? "ring-4 ring-btn-primary ring-offset-2" : ""}
    transition-all
  `;

  if (!faceUp) {
    return (
      <div
        className={`${baseStyles} bg-card-back text-text-on-dark ${className}`}
        onClick={onClick}
      >
        <div className="text-2xl">🂠</div>
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="text-2xl">{displayValue()}</div>
      <div className="text-xl">{displaySuit()}</div>
    </div>
  );
}
