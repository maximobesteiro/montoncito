"use client";

import type { GameState, PlayerId } from "@mont/core-game";
import { getValidMoves } from "@/lib/game-actions";

interface ActionPanelProps {
  gameState: GameState;
  currentPlayerId: PlayerId;
}

export function ActionPanel({
  gameState,
  currentPlayerId,
}: ActionPanelProps) {
  const isMyTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;

  if (!isMyTurn) {
    return (
      <div className="brutal-border p-4 bg-gray-100 brutal-shadow">
        <h3 className="text-xl font-bold mb-2">Actions</h3>
        <p className="text-gray-600 font-semibold">Wait for your turn</p>
      </div>
    );
  }

  const validMoves = getValidMoves(gameState, currentPlayerId);
  const hasAnyMoves =
    validMoves.handToBuild.length > 0 ||
    validMoves.stockToBuild.length > 0 ||
    validMoves.discardToBuild.length > 0;

  return (
    <div className="brutal-border p-4 bg-white brutal-shadow">
      <h3 className="text-xl font-bold mb-4">Available Moves</h3>

      {!hasAnyMoves && (
        <div className="text-gray-600 font-semibold mb-4">
          No valid plays. You must discard a card to end your turn.
        </div>
      )}

      {validMoves.handToBuild.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold mb-2">Play from Hand:</h4>
          <div className="text-sm text-gray-700">
            {validMoves.handToBuild.length} card(s) can be played
          </div>
        </div>
      )}

      {validMoves.stockToBuild.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold mb-2">Play from Stock:</h4>
          <div className="text-sm text-gray-700">
            Stock top can be played to {validMoves.stockToBuild.length} pile(s)
          </div>
        </div>
      )}

      {validMoves.discardToBuild.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold mb-2">Play from Discards:</h4>
          <div className="text-sm text-gray-700">
            {validMoves.discardToBuild.length} discard pile(s) can be played
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 brutal-border-t">
        <h4 className="font-bold mb-2">Discard Options:</h4>
        <div className="text-sm text-gray-700">
          You can discard any card from your hand to any discard pile
        </div>
      </div>
    </div>
  );
}


