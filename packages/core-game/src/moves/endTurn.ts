import { ApplyResult, GameEvent, GameState } from "../state/types";
import { nextPlayerId } from "../state/selectors";
import { refillHand } from "./draw";

export function endTurn(
  state: GameState,
): Extract<ApplyResult, { accepted: true }> {
  const nextId = nextPlayerId(state);
  const nextTurn = state.turn.number + 1;
  const advanced: GameState = {
    ...state,
    turn: {
      number: nextTurn,
      activePlayer: nextId,
      hasDiscarded: false,
    },
  };
  const refill = refillHand(advanced, nextId);
  const events: GameEvent[] = [
    { type: "TurnEnded", payload: { turn: nextTurn } },
    refill.event,
  ];

  return { accepted: true, state: refill.state, events };
}
