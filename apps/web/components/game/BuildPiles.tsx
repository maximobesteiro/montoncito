"use client";

import type { BuildPile } from "@mont/core-game";
import type { CardSize } from "./Card";
import { Pile } from "./Pile";

interface BuildPilesProps {
  buildPiles: BuildPile[];
  size?: CardSize;
  onPileClick?: (buildId: string) => void;
  playablePiles?: Set<string>;
}

export function BuildPiles({
  buildPiles,
  size = "md",
  onPileClick,
  playablePiles = new Set(),
}: BuildPilesProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 flex-wrap justify-center">
        {buildPiles.map((pile) => {
          const isPlayable = playablePiles.has(pile.id);
          const nextRank = pile.nextRank;
          const label = `${pile.id} ${nextRank ? `→ ${nextRank}` : "(Complete)"}`;

          return (
            <div
              key={pile.id}
              className={`
                brutal-border
                ${isPlayable ? "border-btn-primary" : ""}
                bg-surface
                p-2
                brutal-shadow-sm
                ${onPileClick ? "cursor-pointer hover:scale-105" : ""}
                transition-transform
              `}
              onClick={onPileClick ? () => onPileClick(pile.id) : undefined}
            >
              <Pile
                cards={pile.cards}
                size={size}
                label={label}
                isPlayable={isPlayable}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
