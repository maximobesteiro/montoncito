"use client";

import type { GameState, PlayerId } from "@mont/core-game";
import Link from "next/link";

interface EndGameScreenProps {
  gameState: GameState;
  currentPlayerId: PlayerId;
}

export function EndGameScreen({
  gameState,
  currentPlayerId,
}: EndGameScreenProps) {
  if (gameState.phase !== "gameover" || !gameState.winner) {
    return null;
  }

  const winner = gameState.byId[gameState.winner];
  const isWinner = gameState.winner === currentPlayerId;

  // Calculate stats
  const playerStats = gameState.players.map((playerId) => {
    const player = gameState.byId[playerId];
    if (!player) return null;
    return {
      id: playerId,
      name: player.name || playerId,
      stockCount: player.stock.faceDown.length,
      handCount: player.hand.cards.length,
      discardCount: player.discards.reduce((sum, pile) => sum + pile.length, 0),
    };
  }).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="brutal-border bg-white brutal-shadow p-8 max-w-2xl w-full mx-4">
        <h2 className="text-4xl font-bold mb-4 text-center">
          {isWinner ? "🎉 You Win! 🎉" : "Game Over"}
        </h2>

        <div className="mb-6 text-center">
          <p className="text-2xl font-bold">
            Winner: {winner?.name || gameState.winner}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-bold mb-3">Final Stats</h3>
          <div className="space-y-2">
            {playerStats.map((stat) => (
              <div
                key={stat.id}
                className={`brutal-border p-3 ${
                  stat.id === gameState.winner
                    ? "bg-green-100"
                    : "bg-gray-50"
                }`}
              >
                <div className="font-bold">{stat.name}</div>
                <div className="text-sm text-gray-600">
                  Stock: {stat.stockCount} | Hand: {stat.handCount} | Discards:{" "}
                  {stat.discardCount}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/lobby"
            className="brutal-button bg-blue-500 text-white hover:bg-blue-600"
          >
            Return to Lobby
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="brutal-button bg-green-500 text-white hover:bg-green-600"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}


