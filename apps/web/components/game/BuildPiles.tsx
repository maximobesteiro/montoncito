"use client";

import {
  topBuildCard,
  type BuildPile,
  type BuildPileTarget,
} from "@mont/core-game";
import { cardDimensions, type CardSize } from "./Card";
import { Pile, PileFootprint } from "./Pile";
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
  const dimensions = cardDimensions[size];
  return (
    <section aria-label="Build piles" className="min-w-0 flex flex-col gap-2">
      <h3 className="text-lg font-bold">Build piles</h3>
      <div
        className="flex gap-4 flex-wrap items-start"
        style={{ minHeight: dimensions.height }}
      >
        {buildPiles.map((pile) => {
          const top = topBuildCard(pile);
          return (
            <div key={pile.id} className="flex flex-col items-center gap-1">
              <Pile
                cards={pile.cards}
                size={size}
                presentation={{ kind: "stacked", coveredFaceUp: true }}
                label={`${pile.id} ${pile.nextRank ? `→ ${pile.nextRank}` : "(Complete)"}`}
                coveredCardAriaLabel={(card) =>
                  `Covered Build ${formatCardName(card)}`
                }
                cardAriaLabel={
                  top ? `Build top ${formatCardName(top)}` : undefined
                }
                destination={
                  onPileClick
                    ? {
                        label: `Build pile ${pile.id}, next ${pile.nextRank ?? "complete"}`,
                        legal: playablePiles.has(pile.id),
                        identity: { kind: "build", buildId: pile.id },
                        onActivate: () => onPileClick(pile.id),
                      }
                    : undefined
                }
              />
              {pendingTarget === pile.id && (
                <span className="text-xs font-bold">Pending</span>
              )}
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold">New Build pile</span>
          <PileFootprint
            ariaLabel="New Build pile"
            className="brutal-border border-dashed bg-surface flex items-center justify-center"
            style={{ width: dimensions.width, height: dimensions.height }}
            destination={
              onPileClick
                ? {
                    label: "New Build pile",
                    legal: playablePiles.has("new"),
                    identity: { kind: "build", buildId: "new" },
                    onActivate: () => onPileClick("new"),
                  }
                : undefined
            }
          >
            <span aria-hidden="true">+</span>
          </PileFootprint>
          {pendingTarget === "new" && (
            <span className="text-xs font-bold">Pending</span>
          )}
        </div>
      </div>
    </section>
  );
}
