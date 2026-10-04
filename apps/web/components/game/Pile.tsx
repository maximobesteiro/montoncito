"use client";

import type { Card as GameCard } from "@mont/core-game";
import { peekTopCard, removeTopCard } from "@mont/core-game";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Card, cardDimensions, type CardSize } from "./Card";

const pileSizeConfig: Record<
  CardSize,
  { overlapOffset: number; stackOffset: number }
> = {
  xs: { overlapOffset: 18, stackOffset: 3 },
  sm: { overlapOffset: 18, stackOffset: 3 },
  md: { overlapOffset: 20, stackOffset: 4 },
};

type PilePresentation =
  | { kind: "top" }
  | { kind: "stacked"; coveredFaceUp: boolean }
  | {
      kind: "overlapping";
      collapsedVisibleCount: number;
      expandable: boolean;
    };

interface PileProps {
  cards: readonly GameCard[];
  presentation: PilePresentation;
  size?: CardSize;
  label?: ReactNode;
  onClick?: () => void;
  isPlayable?: boolean;
  cardAriaLabel?: string;
  isSelected?: boolean;
  dragSource?: string;
  faceUp?: boolean;
  className?: string;
  coveredCardAriaLabel?: (card: GameCard) => string;
  emptyLabel?: string;
  emptyAriaLabel?: string;
  onEmptyClick?: () => void;
}

export function Pile({
  cards,
  presentation,
  size = "md",
  label,
  onClick,
  isPlayable = false,
  cardAriaLabel,
  isSelected = false,
  dragSource,
  faceUp = true,
  className = "",
  coveredCardAriaLabel,
  emptyLabel = "—",
  emptyAriaLabel,
  onEmptyClick,
}: PileProps) {
  const config = cardDimensions[size];
  const topCard = peekTopCard(cards);

  const EmptyElement = onEmptyClick ? "button" : "div";
  const top = topCard ? (
    <Card
      card={topCard}
      faceUp={faceUp}
      size={size}
      onClick={onClick}
      isPlayable={isPlayable}
      ariaLabel={cardAriaLabel}
      isSelected={isSelected}
      dragSource={dragSource}
    />
  ) : (
    <EmptyElement
      {...(onEmptyClick
        ? { type: "button" as const, onClick: onEmptyClick }
        : {})}
      aria-label={emptyAriaLabel}
      className={`brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-xs ${onEmptyClick ? "border-btn-primary" : ""}`}
      style={{ width: config.width, height: config.height }}
    >
      {emptyLabel}
    </EmptyElement>
  );

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {label && (
        <div className="text-xs font-bold brutal-border px-1 py-0.5 bg-card">
          {label}
        </div>
      )}
      {presentation.kind === "overlapping" ? (
        <OverlappingLayout
          cards={cards}
          size={size}
          presentation={presentation}
          coveredCardAriaLabel={coveredCardAriaLabel}
          faceUp={faceUp}
          top={top}
        />
      ) : presentation.kind === "stacked" ? (
        <StackedLayout
          cards={cards}
          size={size}
          coveredFaceUp={presentation.coveredFaceUp}
          coveredCardAriaLabel={coveredCardAriaLabel}
          top={top}
        />
      ) : (
        top
      )}
    </div>
  );
}

interface StackedLayoutProps {
  cards: readonly GameCard[];
  size: CardSize;
  coveredFaceUp: boolean;
  coveredCardAriaLabel?: (card: GameCard) => string;
  top: ReactNode;
}

function StackedLayout({
  cards,
  size,
  coveredFaceUp,
  coveredCardAriaLabel,
  top,
}: StackedLayoutProps) {
  const covered = removeTopCard(cards).pile.slice(-2);
  const config = cardDimensions[size];
  const offset = pileSizeConfig[size].stackOffset;
  const topOffset = covered.length * offset;

  return (
    <div
      className="relative"
      style={{
        width: config.width + topOffset,
        height: config.height + topOffset,
      }}
    >
      {covered.map((card, index) => (
        <CoveredCard
          key={card.id}
          card={card}
          size={size}
          faceUp={coveredFaceUp}
          ariaLabel={coveredCardAriaLabel?.(card)}
          style={{
            position: "absolute",
            left: index * offset,
            top: index * offset,
          }}
        />
      ))}
      <div style={{ position: "absolute", left: topOffset, top: topOffset }}>
        {top}
      </div>
    </div>
  );
}

function CoveredCard({
  card,
  size,
  faceUp,
  ariaLabel,
  style,
}: {
  card: GameCard;
  size: CardSize;
  faceUp: boolean;
  ariaLabel?: string;
  style: CSSProperties;
}) {
  return (
    <div
      data-covered-card
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      <Card card={card} size={size} faceUp={faceUp} ariaLabel={ariaLabel} />
    </div>
  );
}

interface OverlappingLayoutProps {
  cards: readonly GameCard[];
  size: CardSize;
  presentation: Extract<PilePresentation, { kind: "overlapping" }>;
  coveredCardAriaLabel?: (card: GameCard) => string;
  faceUp: boolean;
  top: ReactNode;
}

function OverlappingLayout({
  cards,
  size,
  presentation,
  coveredCardAriaLabel,
  faceUp,
  top,
}: OverlappingLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const canExpand = presentation.expandable && cards.length > 1;
  // Reset before rendering so a later growing pile cannot reopen old inspection.
  if (!canExpand && expanded) setExpanded(false);
  const showHistory = canExpand && expanded;
  const visibleCards = showHistory
    ? cards
    : cards.slice(-Math.max(1, presentation.collapsedVisibleCount));
  const config = cardDimensions[size];
  const offset = showHistory
    ? config.height + 8
    : pileSizeConfig[size].overlapOffset;

  return (
    <>
      <div
        id={id}
        className="relative"
        style={{
          width: config.width,
          height: config.height + Math.max(0, visibleCards.length - 1) * offset,
        }}
      >
        {removeTopCard(visibleCards).pile.map((card, index) => (
          <CoveredCard
            key={card.id}
            card={card}
            size={size}
            faceUp={faceUp}
            ariaLabel={coveredCardAriaLabel?.(card)}
            style={{ position: "absolute", top: index * offset }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: Math.max(0, visibleCards.length - 1) * offset,
          }}
        >
          {top}
        </div>
      </div>
      {showHistory && <span className="text-xs font-bold">Top</span>}
      {canExpand && (
        <>
          <div className="text-xs font-bold text-text-muted">
            {cards.length} cards
          </div>
          <button
            type="button"
            className="brutal-button text-xs"
            aria-expanded={showHistory}
            aria-controls={id}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((previous) => !previous);
            }}
          >
            {showHistory ? "Close" : "View all"}
          </button>
        </>
      )}
    </>
  );
}

export type { CardSize };
