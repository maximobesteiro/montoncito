import type { Card } from "../state/types";

export function isWild(card: Card): boolean {
  return card.kind === "joker" || card.rank === 13;
}
