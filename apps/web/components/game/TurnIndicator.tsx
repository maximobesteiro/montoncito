"use client";

import type { GameState } from "@mont/core-game";

interface TurnIndicatorProps {
  gameState: GameState;
  currentPlayerId?: string;
}

export function TurnIndicator({
  gameState,
  currentPlayerId,
}: TurnIndicatorProps) {
  const activePlayer = gameState.byId[gameState.turn.activePlayer];
  const isMyTurn = currentPlayerId === gameState.turn.activePlayer;

  return (
    <div
      className={`
        p-4 brutal-border
        ${isMyTurn ? "bg-active-bg" : "bg-inactive-bg"}
        text-center
        brutal-shadow
      `}
    >
      <div className="text-2xl font-bold">
        {gameState.phase === "gameover"
          ? "Game Over"
          : `Turn ${gameState.turn.number}`}
      </div>
      <div className="text-base font-semibold mt-1">
        {gameState.phase === "gameover" ? (
          gameState.winner ? (
            <span>
              Winner:{" "}
              {gameState.byId[gameState.winner]?.name || gameState.winner}
            </span>
          ) : (
            <span>No winner</span>
          )
        ) : (
          <span>
            Active: {activePlayer?.name || gameState.turn.activePlayer}
            {isMyTurn && " (Your Turn)"}
          </span>
        )}
      </div>
    </div>
  );
}
