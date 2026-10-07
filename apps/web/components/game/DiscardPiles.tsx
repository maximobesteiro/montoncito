"use client";

import type { DiscardPile as GameDiscardPile } from "@mont/core-game";
import { DiscardPile } from "./DiscardPile";

interface DiscardPilesProps {
  discardPiles: GameDiscardPile[];
  playerName: string;
  isOpponent?: boolean;
  onCardClick?: (pileIndex: number) => void;
  playablePiles?: Set<number>;
  selectedPile?: number | null;
  handDiscardTargets?: Set<number>;
  handDiscardOnlyTargets?: Set<number>;
  onHandDiscardClick?: (pileIndex: number) => void;
  pendingPile?: number;
  collapsedDestinations?: Set<number>;
}

export function DiscardPiles({
  discardPiles,
  playerName,
  isOpponent = false,
  onCardClick,
  playablePiles = new Set(),
  selectedPile,
  handDiscardTargets = new Set(),
  handDiscardOnlyTargets = new Set(),
  onHandDiscardClick,
  pendingPile,
  collapsedDestinations = new Set(),
}: DiscardPilesProps) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {discardPiles.map((pile, index) => (
        <DiscardPile
          key={index}
          pile={pile}
          pileIndex={index}
          playerName={playerName}
          isOpponent={isOpponent}
          onCardClick={onCardClick ? () => onCardClick(index) : undefined}
          isPlayable={playablePiles.has(index)}
          isSelected={selectedPile === index}
          isHandDiscardTarget={handDiscardTargets.has(index)}
          isHandDiscardOnlyTarget={handDiscardOnlyTargets.has(index)}
          onHandDiscardClick={
            onHandDiscardClick ? () => onHandDiscardClick(index) : undefined
          }
          isPending={pendingPile === index}
          temporarilyCollapsed={collapsedDestinations.has(index)}
        />
      ))}
    </div>
  );
}
