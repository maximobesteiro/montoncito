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
    <div className="grid min-w-0 grid-cols-1 break-words text-right text-sm font-semibold">
      {gameState.players.map((id) => {
        const label =
          id === currentPlayerId
            ? "Your Turn"
            : `Turn: ${gameState.byId[id]?.name || id}`;
        // Size the header for all Match Nicknames so long ones can wrap without
        // shifting the Build slots when the Turn changes.
        return id === gameState.turn.activePlayer ? (
          <p key={id} className="col-start-1 row-start-1 self-center">
            {label}
          </p>
        ) : (
          <span
            key={id}
            aria-hidden="true"
            data-turn-label={label}
            className="invisible col-start-1 row-start-1 before:content-[attr(data-turn-label)]"
          />
        );
      })}
    </div>
  );
}
