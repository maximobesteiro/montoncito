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

  if (gameState.phase === "gameover") {
    const winner = gameState.winner;
    return (
      <div
        role="status"
        className="p-4 brutal-border brutal-shadow bg-active-bg text-center break-words"
      >
        <p className="text-base font-semibold">Game Over</p>
        <h2 className="mt-1 text-3xl sm:text-4xl font-bold">
          {winner
            ? `${gameState.byId[winner]?.name || winner} wins!`
            : "No winner"}
          {winner && winner === currentPlayerId && " (You)"}
        </h2>
        <p className="mt-2 font-semibold">
          Final board is read-only. You can still chat while connected.
        </p>
      </div>
    );
  }

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
        {`Turn ${gameState.turn.number}`}
      </div>
      <div className="text-base font-semibold mt-1">
        <span>
          Active: {activePlayer?.name || gameState.turn.activePlayer}
          {isMyTurn && " (Your Turn)"}
        </span>
      </div>
    </div>
  );
}
