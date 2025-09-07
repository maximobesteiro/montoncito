import { ApplyResult, GameEvent, GameState, Move } from "./types";
import { validateMove } from "../validate";
import { applyMoveByKind } from "../moves";
import { checkGameOver } from "../rules/win";

export function applyMove(state: GameState, move: Move): ApplyResult {
  const err = validateMove(state, move);
  if (err) {
    const events: GameEvent[] = [
      { type: "InvalidMove", payload: { reason: err } },
    ];
    return { state, events };
  }

  let { state: s, events } = applyMoveByKind(state, move);

  const winner = checkGameOver(s);
  if (winner) {
    s = { ...s, phase: "gameover", winner };
    events = events.concat({ type: "GameOver", payload: { winner } });
  }

  return { state: s, events };
}
