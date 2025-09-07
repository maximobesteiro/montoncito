import type { Card } from "../state/types";
import type { RulesConfig } from "../state/types";

export function isWild(card: Card, rules: RulesConfig): boolean {
  // Card-level override
  if (rules.enableCardWildFlag && card.baseWild) return true;

  // Joker policy
  if (card.kind === "joker") {
    if (rules.useJokers && rules.jokersAreWild !== false) return true;
    return false;
  }

  // Rank-based policy (standard cards)
  if (rules.kingsAreWild && card.rank === 13) return true;
  if (rules.additionalWildRanks?.includes(card.rank)) return true;

  return false;
}
