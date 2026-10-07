"use client";

import {
  topBuildCard,
  type BuildPile,
  type BuildPileTarget,
} from "@mont/core-game";
import { cardDimensions, type CardSize } from "./Card";
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
  const dimensions = cardDimensions[size];
  const NewSlot = onPileClick ? "button" : "div";
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
                        buildId: pile.id,
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
          <NewSlot
            aria-label="New Build pile"
            className={`brutal-border border-dashed bg-surface flex items-center justify-center ${playablePiles.has("new") ? "outline outline-4 outline-btn-primary outline-offset-2" : ""}`}
            style={{ width: dimensions.width, height: dimensions.height }}
            {...(onPileClick
              ? {
                  type: "button" as const,
                  disabled: !playablePiles.has("new"),
                  "data-drop-build": "new",
                  "data-legal-target": playablePiles.has("new"),
                  onClick: () => onPileClick("new"),
                }
              : {})}
          >
            <span aria-hidden="true">+</span>
          </NewSlot>
          {pendingTarget === "new" && (
            <span className="text-xs font-bold">Pending</span>
          )}
        </div>
      </div>
    </section>
  );
}
