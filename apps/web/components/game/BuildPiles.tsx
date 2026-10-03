"use client";

import {
  topBuildCard,
  type BuildPile,
  type BuildPileTarget,
} from "@mont/core-game";
import type { CardSize } from "./Card";
import { Pile } from "./Pile";
import { formatCardName } from "@/lib/format-card-name";

interface BuildPilesProps {
  buildPiles: BuildPile[];
  size?: CardSize;
  onPileClick?: (buildId: BuildPileTarget) => void;
  playablePiles?: Set<BuildPileTarget>;
  pendingTarget?: BuildPileTarget;
}

export function BuildPiles({
  buildPiles,
  size = "md",
  onPileClick,
  playablePiles = new Set(),
  pendingTarget,
}: BuildPilesProps) {
  return (
    <section aria-label="Build piles" className="min-w-0 flex flex-col gap-2">
      <h3 className="text-lg font-bold">Build piles</h3>
      <div className="flex gap-4 flex-wrap items-start">
        {buildPiles.map((pile) => {
          // Build ordering belongs to the core, unlike Stock and Discard ordering.
          const topCard = topBuildCard(pile);
          const isPlayable = playablePiles.has(pile.id);
          const nextRank = pile.nextRank;
          const label = `${pile.id} ${nextRank ? `→ ${nextRank}` : "(Complete)"}`;

          const content = (
            <Pile
              cards={pile.cards}
              topCard={topCard}
              cardAriaLabel={
                topCard ? `Build top ${formatCardName(topCard)}` : undefined
              }
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
              data-drop-build={pile.id}
              disabled={!isPlayable}
              onClick={isPlayable ? () => onPileClick?.(pile.id) : undefined}
            >
              {content}
            </button>
          ) : (
            <div
              key={pile.id}
              className={`brutal-border bg-surface p-2 brutal-shadow-sm ${pendingTarget === pile.id ? "outline outline-4 outline-dashed" : ""}`}
            >
              {content}
              {pendingTarget === pile.id && (
                <span className="text-xs font-bold">Pending</span>
              )}
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
            data-drop-build="new"
            onClick={
              playablePiles.has("new") ? () => onPileClick("new") : undefined
            }
          >
            New Build pile
          </button>
        ) : (
          <div
            className={`brutal-border bg-surface p-2 brutal-shadow-sm ${pendingTarget === "new" ? "outline outline-4 outline-dashed" : ""}`}
          >
            New Build pile
            {pendingTarget === "new" && (
              <span className="block text-xs font-bold">Pending</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
