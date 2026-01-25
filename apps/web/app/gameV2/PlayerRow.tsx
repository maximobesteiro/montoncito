"use client";

import type { PlayerState } from "@mont/core-game";
import { Card } from "@/components/game/Card";

interface PlayerRowProps {
  player: PlayerState;
  isActive: boolean;
}

export function PlayerRow({ player, isActive }: PlayerRowProps) {
  const topStockCard = player.stock.faceDown[player.stock.faceDown.length - 1];
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
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold mb-1">Stock</span>
          {topStockCard ? (
            <Card card={topStockCard} faceUp={true} size="sm" />
          ) : (
            <div className="w-10 h-14 brutal-border border-dashed bg-surface flex items-center justify-center text-xs text-text-muted">
              —
            </div>
          )}
          <span className="text-xs mt-1 font-bold">{stockCount}</span>
        </div>

        {/* Discard piles */}
        <div className="flex-1">
          <span className="text-xs font-semibold mb-1 block">Discards</span>
          <div className="flex gap-1 flex-wrap">
            {player.discards.map((pile, idx) => {
              const topCard = pile[pile.length - 1];

              if (isActive) {
                // Expanded: show fanned/offset stack
                return (
                  <div key={idx} className="relative" style={{ width: 36 }}>
                    {pile.slice(-3).map((card, cardIdx) => (
                      <Card
                        key={card.id}
                        card={card}
                        faceUp={true}
                        size="xs"
                        className="absolute"
                        style={{
                          top: cardIdx * 4,
                          left: 0,
                          zIndex: cardIdx,
                        }}
                      />
                    ))}
                    {pile.length === 0 && (
                      <div className="w-8 h-11 brutal-border border-dashed bg-surface flex items-center justify-center text-[10px] text-text-muted">
                        —
                      </div>
                    )}
                    {/* Spacer for stacked cards */}
                    <div
                      style={{
                        height: 11 + Math.min(pile.length - 1, 2) * 4 + 8,
                      }}
                    />
                  </div>
                );
              }

              // Collapsed: show only top card thumbnail
              if (topCard) {
                return <Card key={idx} card={topCard} faceUp={true} size="xs" />;
              }

              return (
                <div
                  key={idx}
                  className="w-8 h-11 brutal-border border-dashed bg-surface flex items-center justify-center text-[10px] text-text-muted"
                >
                  —
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
