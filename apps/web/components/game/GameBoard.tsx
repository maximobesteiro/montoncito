"use client";

import type { BuildPileTarget, GameState, PlayerId } from "@mont/core-game";
import type { ReactNode } from "react";
import type { PlayerAction } from "@mont/game-room";
import { BuildPiles } from "./BuildPiles";
import { PlayerArea } from "./PlayerArea";
import { OpponentArea } from "./OpponentArea";
import { TurnIndicator } from "./TurnIndicator";

interface GameBoardProps {
  chat?: ReactNode;
  gameState: GameState;
  currentPlayerId: PlayerId;
  onHandCardClick?: (cardId: string) => void;
  onStockClick?: () => void;
  onDiscardClick?: (pileIndex: number) => void;
  onBuildPileClick?: (buildId: BuildPileTarget) => void;
  playableHandCards?: Set<string>;
  isStockPlayable?: boolean;
  isStockSelected?: boolean;
  playableDiscardPiles?: Set<number>;
  playableBuildPiles?: Set<BuildPileTarget>;
  selectedHandCard?: string | null;
  selectedDiscardPile?: number | null;
  handDiscardTargets?: Set<number>;
  handDiscardOnlyTargets?: Set<number>;
  onHandDiscardClick?: (pileIndex: number) => void;
  pendingAction?: PlayerAction;
  collapsedDiscardDestinations?: Set<number>;
}

export function GameBoard({
  chat,
  gameState,
  currentPlayerId,
  onHandCardClick,
  onStockClick,
  onDiscardClick,
  onBuildPileClick,
  playableHandCards = new Set(),
  isStockPlayable = false,
  isStockSelected = false,
  playableDiscardPiles = new Set(),
  playableBuildPiles = new Set(),
  selectedHandCard,
  selectedDiscardPile,
  handDiscardTargets,
  handDiscardOnlyTargets,
  onHandDiscardClick,
  pendingAction,
  collapsedDiscardDestinations,
}: GameBoardProps) {
  const currentPlayer = gameState.byId[currentPlayerId];
  const opponents = gameState.players
    .filter((id) => id !== currentPlayerId)
    .map((id) => gameState.byId[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-muted">
      <TurnIndicator gameState={gameState} currentPlayerId={currentPlayerId} />

      <div className="flex flex-wrap justify-center gap-4 text-sm font-semibold">
        <span>Draw pile: {gameState.deck.drawPile.length} cards</span>
        <span>Recycle pile: {gameState.deck.recyclePile.length} cards</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="min-w-0 flex flex-col gap-4">
          <BuildPiles
            buildPiles={gameState.center.buildPiles}
            onPileClick={onBuildPileClick}
            playablePiles={playableBuildPiles}
            pendingTarget={
              pendingAction && "target" in pendingAction
                ? pendingAction.target
                : undefined
            }
          />
          {currentPlayer && (
            <PlayerArea
              player={currentPlayer}
              isCurrentPlayer={true}
              onHandCardClick={onHandCardClick}
              onStockClick={onStockClick}
              onDiscardClick={onDiscardClick}
              playableHandCards={playableHandCards}
              selectedHandCard={selectedHandCard}
              isStockPlayable={isStockPlayable}
              isStockSelected={isStockSelected}
              playableDiscardPiles={playableDiscardPiles}
              selectedDiscardPile={selectedDiscardPile}
              handDiscardTargets={handDiscardTargets}
              handDiscardOnlyTargets={handDiscardOnlyTargets}
              onHandDiscardClick={onHandDiscardClick}
              pendingAction={pendingAction}
              collapsedDiscardDestinations={collapsedDiscardDestinations}
            />
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-4">
          {chat}
          <aside aria-label="Opponents" className="min-w-0 flex flex-col gap-4">
            {opponents.map((opponent) => (
              <OpponentArea
                key={opponent.id}
                player={opponent}
                isActive={
                  gameState.phase === "turn" &&
                  gameState.turn.activePlayer === opponent.id
                }
              />
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
