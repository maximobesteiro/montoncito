import { Card, GameState, Move, Rank } from "./state/types";
import { getActivePlayer, getBuildPile } from "./state/selectors";
import { isWild } from "./utils/isWild";
import { must } from "./utils/guards";

function matchesRequired(
  card: Card,
  required: Rank | null,
  maxRank: Rank,
  rules: GameState["rules"]
): boolean {
  if (required === null) return false; // pile just completed; should be cleared before receiving more
  if (isWild(card, rules)) return true;
  if (card.kind === "standard") {
    return card.rank === required;
  }
  return false;
}

export function validateMove(state: GameState, move: Move): string | null {
  switch (move.kind) {
    case "START_GAME":
      if (state.phase !== "lobby") return "Game already started";
      if (state.players.length < 2) return "Need at least two players";
      return null;

    case "DRAW_TO_HAND": {
      if (state.phase !== "turn") return "Not your turn";
      const active = getActivePlayer(state);
      if (active.hand.cards.length >= state.rules.handSize)
        return "Hand already full";
      return null;
    }

    case "PLAY_HAND_TO_BUILD": {
      if (state.phase !== "turn") return "Not your turn";
      const active = getActivePlayer(state);
      const card = active.hand.cards.find((c) => c.id === move.cardId);
      if (!card) return "Card not in hand";
      const pile = getBuildPile(state, move.buildId);
      if (
        !matchesRequired(
          card,
          pile.nextRank,
          state.rules.maxBuildRank,
          state.rules
        )
      ) {
        return "Card does not match build requirement";
      }
      return null;
    }

    case "PLAY_STOCK_TO_BUILD": {
      if (state.phase !== "turn") return "Not your turn";
      const active = getActivePlayer(state);
      const top = active.stock.faceDown[active.stock.faceDown.length - 1];
      if (!top) return "No stock card to play";
      const pile = getBuildPile(state, move.buildId);
      if (
        !matchesRequired(
          top,
          pile.nextRank,
          state.rules.maxBuildRank,
          state.rules
        )
      ) {
        return "Stock card does not match build requirement";
      }
      return null;
    }

    case "PLAY_DISCARD_TO_BUILD": {
      if (state.phase !== "turn") return "Not your turn";
      const active = getActivePlayer(state);
      const pi = move.pileIndex;
      if (pi < 0 || pi >= state.rules.discardPiles)
        return "Invalid discard pile index";

      // Assert the pile exists (strict-mode friendly)
      const source = must(active.discards[pi], "Discard pile missing");
      const top = source[source.length - 1];
      if (!top) return "Discard pile is empty";

      const pile = getBuildPile(state, move.buildId);
      if (
        !matchesRequired(
          top,
          pile.nextRank,
          state.rules.maxBuildRank,
          state.rules
        )
      ) {
        return "Discard card does not match build requirement";
      }
      return null;
    }

    case "DISCARD_FROM_HAND": {
      if (state.phase !== "turn") return "Not your turn";
      const active = getActivePlayer(state);
      const pi = move.pileIndex;
      if (pi < 0 || pi >= state.rules.discardPiles)
        return "Invalid discard pile index";
      const card = active.hand.cards.find((c) => c.id === move.cardId);
      if (!card) return "Card not in hand";
      return null; // discard is always allowed; ends turn via hasDiscarded flag
    }
  }
}
