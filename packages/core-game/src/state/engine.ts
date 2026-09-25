import { ApplyResult, GameState, Move } from "./types";
import { rejectMove } from "./reject";
import { validateMove } from "../validate";
import { applyMoveByKind } from "../moves";
import { checkGameOver } from "../rules/win";

export function applyMove(state: GameState, move: Move): ApplyResult {
  const err = validateMove(state, move);
  if (err) {
    return rejectMove(state, err);
  }

  const result = applyMoveByKind(state, move);
  if (!result.accepted) return result;
  let { state: s, events } = result;

  const winner = checkGameOver(s);
  if (winner) {
    s = { ...s, phase: "gameover", winner };
    events = events.concat({ type: "GameOver", payload: { winner } });
  }

  return { accepted: true, state: s, events };
}
