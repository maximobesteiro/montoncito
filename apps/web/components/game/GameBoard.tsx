"use client";

import type { GameState, PlayerId } from "@mont/core-game";
import { BuildPiles } from "./BuildPiles";
import { PlayerArea } from "./PlayerArea";
import { OpponentArea } from "./OpponentArea";
import { TurnIndicator } from "./TurnIndicator";

interface GameBoardProps {
  gameState: GameState;
  currentPlayerId: PlayerId;
  onHandCardClick?: (cardId: string) => void;
  onStockClick?: () => void;
  onDiscardClick?: (pileIndex: number) => void;
  onBuildPileClick?: (buildId: string) => void;
  playableHandCards?: Set<string>;
  isStockPlayable?: boolean;
  playableDiscardPiles?: Set<number>;
  playableBuildPiles?: Set<string>;
}

export function GameBoard({
  gameState,
  currentPlayerId,
  onHandCardClick,
  onStockClick,
  onDiscardClick,
  onBuildPileClick,
  playableHandCards = new Set(),
  isStockPlayable = false,
  playableDiscardPiles = new Set(),
  playableBuildPiles = new Set(),
}: GameBoardProps) {
  const currentPlayer = gameState.byId[currentPlayerId];
  const opponents = gameState.players
    .filter((id) => id !== currentPlayerId)
    .map((id) => gameState.byId[id])
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 min-h-screen bg-gray-50">
      <TurnIndicator gameState={gameState} currentPlayerId={currentPlayerId} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 auto-rows-min">
        {/* Opponents on left (desktop), top (mobile) */}
        <div className="flex flex-col gap-4 order-2 lg:order-1">
          {opponents.map((opponent) => (
            <OpponentArea key={opponent.id} player={opponent} />
          ))}
        </div>

        {/* Build piles in center */}
        <div className="order-1 lg:order-2">
          <BuildPiles
            buildPiles={gameState.center.buildPiles}
            onPileClick={onBuildPileClick}
            playablePiles={playableBuildPiles}
          />
        </div>

        {/* Current player on right (desktop), bottom (mobile) */}
        <div className="order-3">
          {currentPlayer && (
            <PlayerArea
              player={currentPlayer}
              isCurrentPlayer={true}
              onHandCardClick={onHandCardClick}
              onStockClick={onStockClick}
              onDiscardClick={onDiscardClick}
              playableHandCards={playableHandCards}
              isStockPlayable={isStockPlayable}
              playableDiscardPiles={playableDiscardPiles}
            />
          )}
        </div>
      </div>
    </div>
  );
}

