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
  pendingAction,
  collapsedDiscardDestinations,
}: GameBoardProps) {
  const currentPlayer = gameState.byId[currentPlayerId];
  const activePlayerId =
    gameState.phase === "turn" ? gameState.turn.activePlayer : undefined;
  const turnIndicator = (
    <TurnIndicator gameState={gameState} currentPlayerId={currentPlayerId} />
  );
  const opponents = gameState.players
    .filter((id) => id !== currentPlayerId)
    .map((id) => gameState.byId[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-muted">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="min-w-0 flex flex-col gap-4">
          <BuildPiles
            size="sm"
            turnIndicator={
              gameState.phase === "turn" ? turnIndicator : undefined
            }
            gameOverStatus={
              gameState.phase === "gameover" ? turnIndicator : undefined
            }
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
              isActive={activePlayerId === currentPlayer.id}
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
                isActive={activePlayerId === opponent.id}
              />
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
