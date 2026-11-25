"use client";

import type { PlayerState } from "@mont/core-game";
import type { PlayerAction } from "@mont/game-room";
import { Hand } from "./Hand";
import { StockPile } from "./StockPile";
import { DiscardPiles } from "./DiscardPiles";

interface PlayerAreaProps {
  player: PlayerState;
  isActive: boolean;
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
  pendingAction?: PlayerAction;
  collapsedDiscardDestinations?: Set<number>;
}

export function PlayerArea({
  player,
  isActive,
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
  pendingAction,
  collapsedDiscardDestinations,
}: PlayerAreaProps) {
  return (
    <section
      aria-label="Your play area"
      className={`board-surface player-surface player-cards min-w-0${isActive ? " active-turn-frame" : ""}`}
    >
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
          <h4 className="text-sm font-semibold mb-2">Your Stock</h4>
          {pendingAction?.kind === "PLAY_STOCK_TO_BUILD" && (
            <span className="text-xs font-bold">Pending</span>
          )}
          <StockPile
            size="sm"
            stock={player.stock}
            onTopCardClick={onStockClick}
            isPlayable={isStockPlayable}
            isSelected={isStockSelected}
          />
        </div>
        <div role="group" aria-label="Your Hand" className="player-hand">
          <h4 className="text-sm font-semibold mb-2">Your Hand</h4>
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
        <h4 className="text-sm font-semibold mb-2">Your Discard piles</h4>
        <DiscardPiles
          discardPiles={player.discards}
          playerName={player.name || player.id}
          onCardClick={onDiscardClick}
          playablePiles={playableDiscardPiles}
          selectedPile={selectedDiscardPile}
          handDiscardTargets={handDiscardTargets}
          pendingPile={
            pendingAction && "pileIndex" in pendingAction
              ? pendingAction.pileIndex
              : undefined
          }
          collapsedDestinations={collapsedDiscardDestinations}
        />
      </div>
    </section>
  );
}
