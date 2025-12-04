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
  isStockPlayable?: boolean;
  playableDiscardPiles?: Set<number>;
}

export function PlayerArea({
  player,
  isCurrentPlayer = false,
  onHandCardClick,
  onStockClick,
  onDiscardClick,
  playableHandCards = new Set(),
  isStockPlayable = false,
  playableDiscardPiles = new Set(),
}: PlayerAreaProps) {
  return (
    <div
      className={`
        p-4 brutal-border
        ${isCurrentPlayer ? "bg-blue-50" : "bg-gray-50"}
        flex flex-col gap-4
        brutal-shadow
      `}
    >
      <h3 className="text-2xl font-bold brutal-border px-3 py-1 bg-white inline-block">
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
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Stock</h4>
          <StockPile
            stock={player.stock}
            onTopCardClick={onStockClick}
            isPlayable={isStockPlayable}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Discards</h4>
          <DiscardPiles
            discards={player.discards}
            onCardClick={onDiscardClick}
            playablePiles={playableDiscardPiles}
          />
        </div>
      </div>
    </div>
  );
}

