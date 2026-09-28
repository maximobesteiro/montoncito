"use client";

import type { BuildPile, BuildPileTarget } from "@mont/core-game";
import type { CardSize } from "./Card";
import { Pile } from "./Pile";

interface BuildPilesProps {
  buildPiles: BuildPile[];
  size?: CardSize;
  onPileClick?: (buildId: BuildPileTarget) => void;
  playablePiles?: Set<BuildPileTarget>;
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

          const content = (
            <Pile
              cards={[...pile.cards].reverse()}
              size={size}
              label={label}
              isPlayable={isPlayable}
            />
          );
          return onPileClick ? (
            <button
              type="button"
              key={pile.id}
              className={`
                brutal-border
                ${isPlayable ? "border-btn-primary" : ""}
                bg-surface
                p-2
                brutal-shadow-sm
                ${isPlayable ? "cursor-pointer hover:scale-105" : ""}
                transition-transform
              `}
              aria-label={`Build pile ${pile.id}, next ${nextRank ?? "complete"}`}
              data-legal-target={isPlayable}
              disabled={!isPlayable}
              onClick={isPlayable ? () => onPileClick?.(pile.id) : undefined}
            >
              {content}
            </button>
          ) : (
            <div
              key={pile.id}
              className="brutal-border bg-surface p-2 brutal-shadow-sm"
            >
              {content}
            </div>
          );
        })}
        {onPileClick ? (
          <button
            type="button"
            className={`
            brutal-border bg-surface p-2 brutal-shadow-sm transition-transform
            ${playablePiles.has("new") ? "border-btn-primary" : ""}
            ${playablePiles.has("new") ? "cursor-pointer hover:scale-105" : ""}
          `}
            disabled={!playablePiles.has("new")}
            onClick={
              playablePiles.has("new") ? () => onPileClick("new") : undefined
            }
          >
            New Build pile
          </button>
        ) : (
          <div className="brutal-border bg-surface p-2 brutal-shadow-sm">
            New Build pile
          </div>
        )}
      </div>
    </div>
  );
}
