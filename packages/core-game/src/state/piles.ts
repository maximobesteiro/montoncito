import type { Card } from "./types";

// Build, Stock, Discard and Draw piles all use bottom-to-top arrays.

/** Select the last card of a bottom-to-top pile. No gameplay validation. */
export function peekTopCard(pile: readonly Card[]): Card | undefined {
  return pile[pile.length - 1];
}

/** Place any card on top. Build rank requirements belong to gameplay rules. */
export function placeTopCard(pile: readonly Card[], card: Card): Card[] {
  return [...pile, card];
}

export function removeTopCard(pile: Card[]): {
  card: Card | undefined;
  pile: Card[];
};
export function removeTopCard(pile: readonly Card[]): {
  card: Card | undefined;
  pile: readonly Card[];
};
/** Remove a top card without mutating cards or the pile; empty piles retain identity. */
export function removeTopCard(pile: readonly Card[]): {
  card: Card | undefined;
  pile: readonly Card[];
} {
  return {
    card: peekTopCard(pile),
    pile: pile.length === 0 ? pile : pile.slice(0, -1),
  };
}
