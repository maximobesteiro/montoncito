"use client";

import {
  peekTopCard,
  type DiscardPile as GameDiscardPile,
} from "@mont/core-game";
import { formatCardName } from "@/lib/format-card-name";
import { Pile } from "./Pile";

interface DiscardPileProps {
  pile: GameDiscardPile;
  pileIndex: number;
  playerName: string;
  isOpponent?: boolean;
  onCardClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
  isHandDiscardTarget?: boolean;
  isPending?: boolean;
  temporarilyCollapsed?: boolean;
}

export function DiscardPile({
  pile,
  pileIndex,
  playerName,
  isOpponent = false,
  onCardClick,
  isPlayable = false,
  isSelected = false,
  isHandDiscardTarget = false,
  isPending = false,
  temporarilyCollapsed = false,
}: DiscardPileProps) {
  const topCard = peekTopCard(pile);
  const topClick = isPlayable ? onCardClick : undefined;
  const number = pileIndex + 1;

  return (
    <div
      role="group"
      aria-label={`${playerName} Discard pile ${number}`}
      className={`flex flex-col items-center gap-1 ${isPending ? "outline outline-4 outline-dashed" : ""}`}
    >
      {isPending && <span className="text-xs font-bold">Pending</span>}
      <Pile
        cards={pile}
        presentation={{
          kind: "overlapping",
          collapsedVisibleCount: isOpponent ? 1 : 3,
          expandable: true,
          temporarilyCollapsed,
        }}
        label={pile.length > 1 ? `Discard ${number}` : undefined}
        onClick={topClick}
        isPlayable={isPlayable}
        isSelected={isSelected}
        dragSource={topCard && topClick ? `discard:${pileIndex}` : undefined}
        cardAriaLabel={
          topCard
            ? `Discard pile ${number}, ${formatCardName(topCard)}`
            : undefined
        }
        coveredCardAriaLabel={(card) =>
          `Covered Discard pile ${number}, ${formatCardName(card)}`
        }
        emptyLabel="Empty"
        emptyAriaLabel={`Discard pile ${number}, empty`}
        onEmptyClick={topClick}
        destination={
          isHandDiscardTarget && onCardClick
            ? {
                label: topCard
                  ? `Discard Hand to pile ${number}`
                  : `Discard pile ${number}, empty`,
                legal: true,
                identity: { kind: "discard", discardIndex: pileIndex },
                onActivate: onCardClick,
              }
            : undefined
        }
      />
    </div>
  );
}
