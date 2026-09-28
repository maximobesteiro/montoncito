"use client";

import type { PlayerState } from "@mont/core-game";
import { Hand } from "./Hand";
import { StockPile } from "./StockPile";
import { DiscardPiles } from "./DiscardPiles";

interface PlayerAreaProps {
  player: PlayerState;
  isCurrentPlayer?: boolean;
  onHandCardClick?: (cardId: string) => void;
  onStockClick?: () => void;
  onDiscardClick?: (pileIndex: number) => void;
  playableHandCards?: Set<string>;
  selectedHandCard?: string | null;
  isStockPlayable?: boolean;
  isStockSelected?: boolean;
  playableDiscardPiles?: Set<number>;
  selectedDiscardPile?: number | null;
}

export function PlayerArea({
  player,
  isCurrentPlayer = false,
  onHandCardClick,
  onStockClick,
  onDiscardClick,
  playableHandCards = new Set(),
  selectedHandCard,
  isStockPlayable = false,
  isStockSelected = false,
  playableDiscardPiles = new Set(),
  selectedDiscardPile,
}: PlayerAreaProps) {
  return (
    <div
      className={`
        p-4 brutal-border
        ${isCurrentPlayer ? "bg-highlight-bg" : "bg-muted"}
        flex flex-col gap-4
        brutal-shadow
      `}
    >
      <h3 className="text-2xl font-bold brutal-border px-3 py-1 bg-card inline-block">
        {player.name || player.id}
        {isCurrentPlayer && " (You)"}
      </h3>

      <div className="flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Hand</h4>
          <Hand
            hand={player.hand}
            onCardClick={onHandCardClick}
            playableCards={playableHandCards}
            selectedCardId={selectedHandCard}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Stock</h4>
          <StockPile
            stock={player.stock}
            onTopCardClick={onStockClick}
            isPlayable={isStockPlayable}
            isSelected={isStockSelected}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Discard piles</h4>
          <DiscardPiles
            discards={player.discards}
            onCardClick={onDiscardClick}
            playablePiles={playableDiscardPiles}
            selectedPile={selectedDiscardPile}
          />
        </div>
      </div>
    </div>
  );
}
