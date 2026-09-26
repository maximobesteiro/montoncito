import type { Card } from "@mont/core-game";

const rankNames: Partial<Record<number, string>> = {
  1: "Ace",
  11: "Jack",
  12: "Queen",
  13: "King",
};

export function formatCardName(card: Card): string {
  if (card.kind === "joker") return "Joker";
  return `${rankNames[card.rank] ?? card.rank} of ${card.suit}`;
}
