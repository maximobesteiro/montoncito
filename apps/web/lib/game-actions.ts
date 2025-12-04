import type {
  GameState,
  Move,
  PlayerId,
  Rank,
  Card,
  BuildPile,
} from "@mont/core-game";
import { validateMove } from "@mont/core-game";
import { getActivePlayer, getBuildPile } from "@mont/core-game";
import { isWild } from "@mont/core-game";

/**
 * Check if a card matches the required rank for a build pile
 */
function matchesRequired(
  card: Card,
  required: Rank | null,
  maxRank: Rank,
  rules: GameState["rules"]
): boolean {
  if (required === null) return false; // pile just completed
  if (isWild(card, rules)) return true;
  return card.rank === required;
}

/**
 * Get all valid moves for the current player
 */
export function getValidMoves(
  gameState: GameState,
  playerId: PlayerId
): {
  handToBuild: Array<{ cardId: string; buildId: string }>;
  stockToBuild: Array<{ buildId: string }>;
  discardToBuild: Array<{ pileIndex: number; buildId: string }>;
  canDiscard: Array<{ cardId: string; pileIndex: number }>;
} {
  const result = {
    handToBuild: [] as Array<{ cardId: string; buildId: string }>,
    stockToBuild: [] as Array<{ buildId: string }>,
    discardToBuild: [] as Array<{ pileIndex: number; buildId: string }>,
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
    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue; // completed pile
      if (
        matchesRequired(
          card,
          pile.nextRank,
          gameState.rules.maxBuildRank,
          gameState.rules
        )
      ) {
        result.handToBuild.push({ cardId: card.id, buildId: pile.id });
      }
    }
  }

  // Check stock top card
  const stockTop = player.stock.faceDown[player.stock.faceDown.length - 1];
  if (stockTop) {
    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue;
      if (
        matchesRequired(
          stockTop,
          pile.nextRank,
          gameState.rules.maxBuildRank,
          gameState.rules
        )
      ) {
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

    for (const pile of gameState.center.buildPiles) {
      if (pile.nextRank === null) continue;
      if (
        matchesRequired(
          topCard,
          pile.nextRank,
          gameState.rules.maxBuildRank,
          gameState.rules
        )
      ) {
        result.discardToBuild.push({ pileIndex: i, buildId: pile.id });
      }
    }
  }

  // All hand cards can be discarded to any discard pile
  for (const card of player.hand.cards) {
    for (let i = 0; i < gameState.rules.discardPiles; i++) {
      result.canDiscard.push({ cardId: card.id, pileIndex: i });
    }
  }

  return result;
}

/**
 * Get set of playable hand card IDs
 */
export function getPlayableHandCards(
  gameState: GameState,
  playerId: PlayerId
): Set<string> {
  const moves = getValidMoves(gameState, playerId);
  return new Set(moves.handToBuild.map((m) => m.cardId));
}

/**
 * Get set of playable discard pile indices
 */
export function getPlayableDiscardPiles(
  gameState: GameState,
  playerId: PlayerId
): Set<number> {
  const moves = getValidMoves(gameState, playerId);
  return new Set(moves.discardToBuild.map((m) => m.pileIndex));
}

/**
 * Check if stock top card is playable
 */
export function isStockPlayable(
  gameState: GameState,
  playerId: PlayerId
): boolean {
  const moves = getValidMoves(gameState, playerId);
  return moves.stockToBuild.length > 0;
}

/**
 * Get set of playable build pile IDs
 */
export function getPlayableBuildPiles(
  gameState: GameState,
  playerId: PlayerId
): Set<string> {
  const moves = getValidMoves(gameState, playerId);
  const buildPileIds = new Set<string>();
  moves.handToBuild.forEach((m) => buildPileIds.add(m.buildId));
  moves.stockToBuild.forEach((m) => buildPileIds.add(m.buildId));
  moves.discardToBuild.forEach((m) => buildPileIds.add(m.buildId));
  return buildPileIds;
}

/**
 * Create a move from user action
 */
export function createMove(
  gameState: GameState,
  playerId: PlayerId,
  action: {
    type: "play-hand" | "play-stock" | "play-discard" | "discard";
    cardId?: string;
    pileIndex?: number;
    buildId?: string;
  }
): Move | null {
  if (gameState.phase !== "turn" || gameState.turn.activePlayer !== playerId) {
    return null;
  }

  switch (action.type) {
    case "play-hand":
      if (!action.cardId || !action.buildId) return null;
      return {
        kind: "PLAY_HAND_TO_BUILD",
        cardId: action.cardId,
        buildId: action.buildId,
      };

    case "play-stock":
      if (!action.buildId) return null;
      return {
        kind: "PLAY_STOCK_TO_BUILD",
        buildId: action.buildId,
      };

    case "play-discard":
      if (action.pileIndex === undefined || !action.buildId) return null;
      return {
        kind: "PLAY_DISCARD_TO_BUILD",
        pileIndex: action.pileIndex,
        buildId: action.buildId,
      };

    case "discard":
      if (!action.cardId || action.pileIndex === undefined) return null;
      return {
        kind: "DISCARD_FROM_HAND",
        cardId: action.cardId,
        pileIndex: action.pileIndex,
      };

    default:
      return null;
  }
}

/**
 * Validate a move before sending to server
 */
export function isValidMove(gameState: GameState, move: Move): boolean {
  const error = validateMove(gameState, move);
  return error === null;
}


