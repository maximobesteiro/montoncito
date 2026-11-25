"use client";

import type { PlayerState } from "@mont/core-game";
import { StockPile } from "./StockPile";
import { DiscardPile } from "./DiscardPile";

interface OpponentAreaProps {
  player: PlayerState;
  isActive?: boolean;
}

export function OpponentArea({ player, isActive = false }: OpponentAreaProps) {
  const name = player.name || player.id;
  const handCount = player.hand.cards.length;
  return (
    <section
      aria-label={name}
      className={`board-surface player-surface opponent-area min-w-0 flex flex-col gap-3${isActive ? " active-turn-frame" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0">
        <h3 className="min-w-0 text-lg font-bold break-words">{name}</h3>
        <span
          aria-hidden={!isActive}
          className={`text-sm font-bold${isActive ? "" : " invisible"}`}
        >
          Turn
        </span>
        <p className="text-sm font-semibold">
          Hand: {handCount} concealed {handCount === 1 ? "card" : "cards"}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <StockPile stock={player.stock} size="xs" />
        {player.discards.map((pile, index) => (
          <DiscardPile
            key={index}
            pile={pile}
            pileIndex={index}
            playerName={name}
            isOpponent
          />
        ))}
      </div>
    </section>
  );
}
