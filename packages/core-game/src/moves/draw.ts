import { ApplyResult, GameEvent, GameState } from "../state/types";
import { getActivePlayer } from "../state/selectors";
import { rejectMove } from "../state/reject";
import { shuffleWithRngState } from "../utils/random";

export function drawToHandUpTo(
  state: GameState,
  pid: string,
): { state: GameState; drew: number } {
  const player = state.byId[pid];
  if (!player) return { state, drew: 0 };

  const hand = player.hand.cards.slice();
  let drawPile = state.deck.drawPile.slice();
  let recyclePile = state.deck.recyclePile.slice();
  let rng = state.rng;
  let drew = 0;

  while (hand.length < state.rules.handSize) {
    if (drawPile.length === 0 && recyclePile.length > 0) {
      const shuffled = shuffleWithRngState(recyclePile, rng);
      drawPile = shuffled.cards;
      recyclePile = [];
      rng = shuffled.rng;
    }
    const card = drawPile.shift();
    if (!card) break;
    hand.push(card);
    drew++;
  }

  return {
    state: {
      ...state,
      byId: { ...state.byId, [pid]: { ...player, hand: { cards: hand } } },
      deck: { drawPile, recyclePile },
      rng,
    },
    drew,
  };
}

export function drawToHand(state: GameState): ApplyResult {
  const events: GameEvent[] = [];
  const active = getActivePlayer(state);
  const target = state.rules.handSize;

  if (active.hand.cards.length >= target) {
    return rejectMove(state, "Hand already full");
  }

  const { state: s, drew } = drawToHandUpTo(state, active.id);
  events.push({
    type: "DrewToHand",
    payload: { player: active.id, count: drew },
  });
  return { accepted: true, state: s, events };
}
