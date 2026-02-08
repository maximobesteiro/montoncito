"use client";

import type { PlayerState } from "@mont/core-game";
import { Pile } from "@/components/game/Pile";
import { FannedDiscardPile } from "@/components/game/FannedDiscardPile";

interface PlayerRowProps {
  player: PlayerState;
  isActive: boolean;
}

export function PlayerRow({ player, isActive }: PlayerRowProps) {
  const stockCount = player.stock.faceDown.length;

  return (
    <div
      className={`
        brutal-border p-3 brutal-shadow-sm transition-all
        ${isActive ? "bg-highlight-bg border-btn-primary border-2" : "bg-surface"}
      `}
    >
      {/* Player name + active indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-sm">{player.name || player.id}</span>
        {isActive && (
          <span className="text-xs brutal-border px-2 py-0.5 bg-btn-primary text-text-on-dark font-bold">
            TURN
          </span>
        )}
      </div>

      {/* Stock: top card + count */}
      <div className="flex items-start gap-3">
        <Pile
          cards={player.stock.faceDown}
          size="sm"
          label={`Stock (${stockCount})`}
        />

        {/* Discard piles */}
        <div className="flex-1">
          <span className="text-xs font-semibold mb-1 block">Discards</span>
          <div className="flex gap-1 flex-wrap">
            {player.discards.map((pile, idx) => (
              <FannedDiscardPile
                key={idx}
                pile={pile}
                pileIndex={idx}
                size="xs"
                showLabel={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
