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
        className="min-w-0 max-w-full p-4 brutal-border brutal-shadow bg-active-bg text-center break-words"
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
    <p
      className={`min-w-0 break-words px-2 py-1 text-sm font-semibold ${isMyTurn ? "bg-active-bg" : "bg-inactive-bg"}`}
    >
      {isMyTurn
        ? "Your Turn"
        : `Turn: ${activePlayer?.name || gameState.turn.activePlayer}`}
    </p>
  );
}
