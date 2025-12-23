"use client";

import type { GameState } from "@mont/core-game";

interface PresenceIndicatorProps {
  gameState: GameState;
  currentPlayerId: string;
}

export function PresenceIndicator({
  gameState,
  currentPlayerId,
}: PresenceIndicatorProps) {
  const players = gameState.players
    .map((id) => gameState.byId[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="brutal-border p-3 bg-card brutal-shadow">
      <h4 className="font-bold mb-2 text-sm">Players</h4>
      <div className="space-y-1">
        {players.map((player) => {
          const isActive = gameState.turn.activePlayer === player.id;
          const isCurrent = player.id === currentPlayerId;
          return (
            <div
              key={player.id}
              className={`text-xs flex items-center gap-2 ${
                isActive ? "font-bold" : ""
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isActive ? "bg-btn-success" : "bg-inactive-bg"
                }`}
              />
              <span>
                {player.name || player.id}
                {isCurrent && " (You)"}
                {isActive && " - Active"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
