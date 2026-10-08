"use client";

import type { Card as GameCard } from "@mont/core-game";
import { peekTopCard, removeTopCard } from "@mont/core-game";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Card, cardDimensions, type CardSize } from "./Card";
import { useDroppable } from "@dnd-kit/core";

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
      temporarilyCollapsed?: boolean;
    };

export interface PileDestination {
  label: string;
  legal: boolean;
  buildId?: string;
  discardIndex?: number;
  onActivate: () => void;
}

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
  destination?: PileDestination;
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
  destination,
}: PileProps) {
  const config = cardDimensions[size];
  const topCard = peekTopCard(cards);

  const EmptyElement = onEmptyClick && !destination ? "button" : "div";
  const top = topCard ? (
    <Card
      card={topCard}
      faceUp={faceUp}
      size={size}
      onClick={destination ? undefined : onClick}
      isPlayable={destination ? false : isPlayable}
      ariaLabel={cardAriaLabel}
      isSelected={isSelected}
      dragSource={destination ? undefined : dragSource}
    />
  ) : (
    <EmptyElement
      {...(onEmptyClick && !destination
        ? { type: "button" as const, onClick: onEmptyClick }
        : {})}
      aria-label={destination ? undefined : emptyAriaLabel}
      className={`brutal-border border-dashed bg-surface flex items-center justify-center text-text-subtle text-xs ${onEmptyClick ? "border-btn-primary" : ""}`}
      style={{ width: config.width, height: config.height }}
    >
      {emptyLabel}
    </EmptyElement>
  );

  return (
    <div
      data-pile-inspection
      className={`flex flex-col items-center gap-1 ${className}`}
    >
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
          destination={destination}
        />
      ) : presentation.kind === "stacked" ? (
        <StackedLayout
          cards={cards}
          size={size}
          coveredFaceUp={presentation.coveredFaceUp}
          coveredCardAriaLabel={coveredCardAriaLabel}
          top={top}
          destination={destination}
        />
      ) : (
        <PileFootprint destination={destination}>{top}</PileFootprint>
      )}
    </div>
  );
}

export function PileFootprint({
  destination,
  children,
  style,
  id,
  className = "",
  ariaLabel,
}: {
  destination?: PileDestination;
  children: ReactNode;
  style?: CSSProperties;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const fallbackId = useId();
  const { setNodeRef, isOver } = useDroppable({
    id:
      destination?.buildId !== undefined
        ? `build:${destination.buildId}`
        : destination?.discardIndex !== undefined
          ? `discard:${destination.discardIndex}`
          : fallbackId,
    disabled: !destination?.legal,
    data: {
      buildId: destination?.buildId,
      discardIndex: destination?.discardIndex,
      label: destination?.label,
    },
  });
  const Element = destination ? "button" : "div";
  return (
    <Element
      id={id}
      ref={setNodeRef}
      {...(!destination ? { "aria-label": ariaLabel } : {})}
      data-drop-hovered={destination?.legal && isOver}
      style={style}
      className={`relative block shrink-0 p-0 ${destination?.legal ? "outline outline-4 outline-btn-primary outline-offset-2 cursor-pointer" : ""} ${destination?.legal && isOver ? "ring-4 ring-foreground ring-offset-4 bg-btn-primary" : ""} ${className}`}
      {...(destination
        ? {
            type: "button" as const,
            "aria-label": destination.label,
            disabled: !destination.legal,
            "data-legal-target": destination.legal,
            "data-drop-build": destination.buildId,
            "data-drop-discard": destination.discardIndex,
            onClick: destination.onActivate,
          }
        : {})}
    >
      {children}
      {destination?.legal && isOver && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-btn-primary/15"
        />
      )}
    </Element>
  );
}

interface StackedLayoutProps {
  cards: readonly GameCard[];
  size: CardSize;
  coveredFaceUp: boolean;
  coveredCardAriaLabel?: (card: GameCard) => string;
  top: ReactNode;
  destination?: PileDestination;
}

function StackedLayout({
  cards,
  size,
  coveredFaceUp,
  coveredCardAriaLabel,
  top,
  destination,
}: StackedLayoutProps) {
  const covered = removeTopCard(cards).pile.slice(-2);
  const config = cardDimensions[size];
  const offset = pileSizeConfig[size].stackOffset;
  const topOffset = covered.length * offset;

  return (
    <PileFootprint
      destination={destination}
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
    </PileFootprint>
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
      onClick={(event) => {
        if (!(event.target as Element).closest('[data-legal-target="true"]'))
          event.stopPropagation();
      }}
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
  destination?: PileDestination;
}

function OverlappingLayout({
  cards,
  size,
  presentation,
  coveredCardAriaLabel,
  faceUp,
  top,
  destination,
}: OverlappingLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const canExpand = presentation.expandable && cards.length > 1;
  // Reset before rendering so a later growing pile cannot reopen old inspection.
  if (!canExpand && expanded) setExpanded(false);
  const showHistory =
    canExpand && expanded && !presentation.temporarilyCollapsed;
  const visibleCards = showHistory
    ? cards
    : cards.slice(-Math.max(1, presentation.collapsedVisibleCount));
  const config = cardDimensions[size];
  const offset = showHistory
    ? config.height + 8
    : pileSizeConfig[size].overlapOffset;

  return (
    <>
      <PileFootprint
        destination={destination}
        id={id}
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
      </PileFootprint>
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
            disabled={presentation.temporarilyCollapsed}
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
