import { ApplyResult, GameState, Move } from "../state/types";
import { rejectMove } from "../state/reject";
import { startGame } from "./startGame";
import { drawToHand } from "./draw";
import { discardFromHand } from "./discard";
import { playHandToBuild, playStockToBuild, playDiscardToBuild } from "./play";

export function applyMoveByKind(state: GameState, move: Move): ApplyResult {
  switch (move.kind) {
    case "START_GAME":
      return startGame(state);
    case "DRAW_TO_HAND":
      return drawToHand(state);
    case "PLAY_HAND_TO_BUILD":
      return playHandToBuild(state, move.cardId, move.target);
    case "PLAY_STOCK_TO_BUILD":
      return playStockToBuild(state, move.target);
    case "PLAY_DISCARD_TO_BUILD":
      return playDiscardToBuild(state, move.pileIndex, move.target);
    case "DISCARD_FROM_HAND":
      return discardFromHand(state, move.cardId, move.pileIndex);
    default: {
      const exhaustive: never = move;
      return rejectMove(state, "Unknown move");
    }
  }
}
