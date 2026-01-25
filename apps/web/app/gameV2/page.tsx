"use client";

import { useState } from "react";
import { createMockGameState } from "@/lib/mock-game-state";
import { BuildPiles } from "@/components/game/BuildPiles";
import { StockPile } from "@/components/game/StockPile";
import { FannedDiscardPile } from "@/components/game/FannedDiscardPile";
import { Hand } from "@/components/game/Hand";
import { GameChatPanel } from "./GameChatPanel";
import { PlayerRow } from "./PlayerRow";
import type { GameState } from "@mont/core-game";

export default function GameV2Page() {
  const [gameState] = useState<GameState>(createMockGameState());
  const currentPlayerId = "P1";

  const currentPlayer = gameState.byId[currentPlayerId];
  const opponents = gameState.players
    .filter((id) => id !== currentPlayerId)
    .map((id) => gameState.byId[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const activePlayerId = gameState.turn.activePlayer;

  return (
    <div className="min-h-screen bg-muted p-4 flex flex-col lg:flex-row gap-4">
      {/* ========== MAIN GAME AREA (left, ~70-75%) ========== */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* A) Build Piles (top, centered) */}
        <section className="brutal-border bg-surface p-4 brutal-shadow">
          <BuildPiles buildPiles={gameState.center.buildPiles} />
        </section>

        {/* B) Player Area (bottom) */}
        <section className="brutal-border bg-card p-4 brutal-shadow flex-1 flex flex-col">
          <h3 className="text-xl font-bold brutal-border px-3 py-1 bg-highlight-bg inline-block mb-4 self-start">
            {currentPlayer?.name || currentPlayerId} (You)
          </h3>

          {/* Stock + Discard Piles row */}
          <div className="flex gap-6 mb-6">
            {/* B1) Player Stock (bottom-left) - the "Montoncito" */}
            <div className="flex flex-col items-center">
              <h4 className="text-sm font-semibold mb-2">Montoncito</h4>
              {currentPlayer && <StockPile stock={currentPlayer.stock} />}
            </div>

            {/* B2) Player Discard Piles (to the right of stock) */}
            <div className="flex-1">
              <h4 className="text-sm font-semibold mb-2">Discard Piles</h4>
              <div className="flex gap-3 flex-wrap">
                {currentPlayer?.discards.map((pile, idx) => (
                  <FannedDiscardPile key={idx} pile={pile} pileIndex={idx} />
                ))}
              </div>
            </div>
          </div>

          {/* B3) Player Hand (at the very bottom) */}
          <div className="mt-auto">
            <h4 className="text-sm font-semibold mb-2">Hand</h4>
            {currentPlayer && <Hand hand={currentPlayer.hand} />}
          </div>
        </section>
      </div>

      {/* ========== SIDE PANEL (right, ~25-30% / fixed width) ========== */}
      <aside className="w-full lg:w-80 flex flex-col gap-4 lg:shrink-0">
        {/* C) Chat Panel (top of side panel) */}
        <GameChatPanel />

        {/* D) Players List (below chat) */}
        <div className="brutal-border bg-card brutal-shadow flex-1 flex flex-col overflow-hidden">
          <div className="p-3 brutal-border-b bg-surface">
            <h3 className="font-bold text-lg">Players</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {opponents.map((opponent) => (
              <PlayerRow
                key={opponent.id}
                player={opponent}
                isActive={opponent.id === activePlayerId}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
