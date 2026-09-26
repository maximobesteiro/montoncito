import type {
  GameState,
  PlayerId,
  Rank,
  Card,
  BuildPile,
  BuildPileTarget,
} from "@mont/core-game";
import { isWild } from "@mont/core-game";

/**
 * Check if a card matches the required rank for a build pile
 */
function matchesRequired(
  card: Card,
  required: Rank | null,
): boolean {
  if (required === null) return false; // pile just completed
  if (isWild(card)) return true;
  if (card.kind !== "standard") return false;
  return card.rank === required;
}

function canStartBuildPile(card: Card): boolean {
  return (card.kind === "standard" && card.rank === 1) || isWild(card);
}

/**
 * Get all valid moves for the current player
 */
export function getValidMoves(
  gameState: GameState,
  playerId: PlayerId,
): {
  handToBuild: Array<{ cardId: string; buildId: BuildPileTarget }>;
  stockToBuild: Array<{ buildId: BuildPileTarget }>;
  discardToBuild: Array<{ pileIndex: number; buildId: BuildPileTarget }>;
  canDiscard: Array<{ cardId: string; pileIndex: number }>;
} {
  const result = {
    handToBuild: [] as Array<{ cardId: string; buildId: BuildPileTarget }>,
    stockToBuild: [] as Array<{ buildId: BuildPileTarget }>,
    discardToBuild: [] as Array<{
      pileIndex: number;
      buildId: BuildPileTarget;
    }>,
    canDiscard: [] as Array<{ cardId: string; pileIndex: number }>,
  };

  // Only active player can make moves
  if (gameState.phase !== "turn" || gameState.turn.activePlayer !== playerId) {
    return result;
  }

  const player = gameState.byId[playerId];
  if (!player) return result;

  // Check hand cards to build piles
  for (const card of player.hand.cards) {
    if (canStartBuildPile(card)) {
      result.handToBuild.push({ cardId: card.id, buildId: "new" });
    }
    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue; // completed pile
      if (matchesRequired(card, pile.nextRank)) {
        result.handToBuild.push({ cardId: card.id, buildId: pile.id });
      }
    }
  }

  // Check stock top card
  const stockTop = player.stock.faceDown[player.stock.faceDown.length - 1];
  if (stockTop) {
    if (canStartBuildPile(stockTop)) {
      result.stockToBuild.push({ buildId: "new" });
    }
    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue;
      if (matchesRequired(stockTop, pile.nextRank)) {
        result.stockToBuild.push({ buildId: pile.id });
      }
    }
  }

  // Check discard piles
  for (let i = 0; i < player.discards.length; i++) {
    const discardPile = player.discards[i];
    if (!discardPile || discardPile.length === 0) continue;
    const topCard = discardPile[discardPile.length - 1];
    if (!topCard) continue;

    if (canStartBuildPile(topCard)) {
      result.discardToBuild.push({ pileIndex: i, buildId: "new" });
    }

    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue;
      if (matchesRequired(topCard, pile.nextRank)) {
        result.discardToBuild.push({ pileIndex: i, buildId: pile.id });
      }
    }
  }

  // Only ordinary Hand cards can be discarded to a Discard pile.
  for (const card of player.hand.cards) {
    if (isWild(card)) continue;
    for (let i = 0; i < gameState.rules.discardPiles; i++) {
      result.canDiscard.push({ cardId: card.id, pileIndex: i });
    }
  }

  return result;
}
