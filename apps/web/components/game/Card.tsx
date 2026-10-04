"use client";

import type { Card as GameCard } from "@mont/core-game";

export type CardSize = "xs" | "sm" | "md";

interface CardProps {
  card: GameCard;
  faceUp?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  size?: CardSize;
  ariaLabel?: string;
  isSelected?: boolean;
  dragSource?: string;
  isPending?: boolean;
}

const sizeStyles: Record<
  CardSize,
  {
    container: string;
    value: string;
    suit: string;
    cornerValue: string;
    backIcon: string;
  }
> = {
  xs: {
    container: "w-12 h-16",
    value: "text-xs",
    suit: "text-[10px]",
    cornerValue: "text-[9px]",
    backIcon: "text-sm",
  },
  sm: {
    container: "w-14 h-20",
    value: "text-sm",
    suit: "text-xs",
    cornerValue: "text-[10px]",
    backIcon: "text-base",
  },
  md: {
    container: "w-18 h-26",
    value: "text-2xl",
    suit: "text-xl",
    cornerValue: "text-xs",
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
  ariaLabel,
  isSelected = false,
  dragSource,
  isPending = false,
}: CardProps) {
  const displayValue = () => {
    if (card.kind === "joker") {
      return "J";
    }
    const rankLabels: Record<number, string> = {
      1: "A",
      11: "J",
      12: "Q",
      13: "K",
    };
    return rankLabels[card.rank] ?? card.rank.toString();
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
    shrink-0 relative flex flex-col items-center justify-center
    brutal-border
    bg-card
    text-foreground
    font-bold
    ${onClick ? "cursor-pointer hover:scale-105" : ""}
    ${dragSource ? "touch-none" : ""}
    ${isPlayable ? "ring-4 ring-btn-primary ring-offset-2" : ""}
    ${isPending ? "outline outline-4 outline-dashed outline-foreground" : ""}
    transition-all
  `;

  const interactiveProps = onClick
    ? {
        type: "button" as const,
        onClick,
        "aria-pressed": isSelected,
      }
    : {};
  const Element = onClick ? "button" : "div";

  if (!faceUp) {
    return (
      <Element
        className={`${baseStyles} bg-card-back text-text-on-dark ${className}`}
        {...interactiveProps}
        aria-label={ariaLabel}
        data-drag-source={dragSource}
        style={style}
      >
        <div className={sizes.backIcon}>🂠</div>
      </Element>
    );
  }

  return (
    <Element
      className={`${baseStyles} ${className}`}
      {...interactiveProps}
      aria-label={ariaLabel}
      data-drag-source={dragSource}
      style={style}
    >
      {isPending && (
        <span className="absolute bottom-0 bg-card px-1 text-xs">Pending</span>
      )}
      <div
        className={`absolute left-1 top-1 leading-none text-center ${sizes.cornerValue}`}
      >
        {displayValue()}
        <br />
        {displaySuit()}
      </div>
      <div
        className={`absolute bottom-1 right-1 leading-none text-center rotate-180 ${sizes.cornerValue}`}
      >
        {displayValue()}
        <br />
        {displaySuit()}
      </div>
      <div className={`${sizes.value} text-center leading-none`}>
        {displayValue()}
        <br />
        {displaySuit()}
      </div>
    </Element>
  );
}
