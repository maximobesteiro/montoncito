"use client";

import type { BuildPile } from "@mont/core-game";
import { Card } from "./Card";

interface BuildPilesProps {
  buildPiles: BuildPile[];
  onPileClick?: (buildId: string) => void;
  playablePiles?: Set<string>;
}

export function BuildPiles({
  buildPiles,
  onPileClick,
  playablePiles = new Set(),
}: BuildPilesProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-3xl font-bold text-center brutal-border px-4 py-2 bg-white inline-block mx-auto">Build Piles</h2>
      <div className="flex gap-4 flex-wrap justify-center">
        {buildPiles.map((pile) => {
          const topCard = pile.cards[0];
          const isPlayable = playablePiles.has(pile.id);
          const nextRank = pile.nextRank;

          return (
            <div
              key={pile.id}
              className="flex flex-col items-center gap-2"
              onClick={onPileClick ? () => onPileClick(pile.id) : undefined}
            >
              <div className="text-sm font-bold brutal-border px-2 py-1 bg-white">
                {pile.id} {nextRank ? `→ ${nextRank}` : "(Complete)"}
              </div>
              <div
                className={`
                  min-w-20 min-h-28
                  brutal-border ${isPlayable ? "border-blue-500" : ""}
                  bg-gray-100
                  p-2
                  flex flex-col gap-1
                  brutal-shadow-sm
                  ${onPileClick ? "cursor-pointer hover:scale-105" : ""}
                  transition-transform
                `}
              >
                {pile.cards.length > 0 ? (
                  <>
                    {topCard && (
                      <Card
                        card={topCard}
                        faceUp={true}
                        isPlayable={isPlayable}
                      />
                    )}
                    {pile.cards.length > 1 && (
                      <div className="text-xs font-bold text-gray-700 text-center">
                        +{pile.cards.length - 1} more
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

