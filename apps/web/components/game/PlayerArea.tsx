"use client";

import type { PlayerState } from "@mont/core-game";
import type { PlayerAction } from "@mont/game-room";
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
  handDiscardTargets?: Set<number>;
  handDiscardOnlyTargets?: Set<number>;
  onHandDiscardClick?: (pileIndex: number) => void;
  pendingAction?: PlayerAction;
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
  handDiscardTargets,
  handDiscardOnlyTargets,
  onHandDiscardClick,
  pendingAction,
}: PlayerAreaProps) {
  return (
    <div
      className={`
        p-4 brutal-border
        ${isCurrentPlayer ? "bg-highlight-bg" : "bg-muted"}
        min-w-0 flex flex-col gap-4
        brutal-shadow
      `}
    >
      <h3 className="text-2xl font-bold brutal-border px-3 py-1 bg-card inline-block break-words">
        {player.name || player.id}
        {isCurrentPlayer && " (You)"}
      </h3>

      <div className="player-cards">
        <div className="player-stock-hand">
          <div
            role="group"
            aria-label="Your Stock"
            className={
              pendingAction?.kind === "PLAY_STOCK_TO_BUILD"
                ? "outline outline-4 outline-dashed"
                : ""
            }
          >
            <h4 className="text-sm font-semibold mb-2">Stock</h4>
            {pendingAction?.kind === "PLAY_STOCK_TO_BUILD" && (
              <span className="text-xs font-bold">Pending</span>
            )}
            <StockPile
              stock={player.stock}
              onTopCardClick={onStockClick}
              isPlayable={isStockPlayable}
              isSelected={isStockSelected}
            />
          </div>
          <div role="group" aria-label="Your Hand" className="min-w-0">
            <h4 className="text-sm font-semibold mb-2">Hand</h4>
            <Hand
              hand={player.hand}
              onCardClick={onHandCardClick}
              playableCards={playableHandCards}
              selectedCardId={selectedHandCard}
              pendingCardId={
                pendingAction && "cardId" in pendingAction
                  ? pendingAction.cardId
                  : undefined
              }
            />
          </div>
        </div>

        <div role="group" aria-label="Your Discard piles">
          <h4 className="text-sm font-semibold mb-2">Discard piles</h4>
          <DiscardPiles
            discards={player.discards}
            playerName={player.name || player.id}
            onCardClick={onDiscardClick}
            playablePiles={playableDiscardPiles}
            selectedPile={selectedDiscardPile}
            handDiscardTargets={handDiscardTargets}
            handDiscardOnlyTargets={handDiscardOnlyTargets}
            onHandDiscardClick={onHandDiscardClick}
            pendingPile={
              pendingAction && "pileIndex" in pendingAction
                ? pendingAction.pileIndex
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
