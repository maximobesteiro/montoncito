import { ApplyResult, GameEvent, GameState } from "../state/types";
import { getActivePlayer } from "../state/selectors";

export function drawToHand(state: GameState): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];
  const active = getActivePlayer(s);
  const target = s.rules.handSize;

  if (active.hand.cards.length >= target) {
    return {
      state: s,
      events: [
        { type: "InvalidMove", payload: { reason: "Hand already full" } },
      ],
    };
  }

  const byId = { ...s.byId };
  const hand = active.hand.cards.slice();
  const deck = s.deck.drawPile.slice();
  let drew = 0;

  while (hand.length < target) {
    const c = deck.shift();
    if (!c) break;
    hand.push(c);
    drew++;
  }

  byId[active.id] = { ...active, hand: { cards: hand } };
  s = { ...s, byId, deck: { ...s.deck, drawPile: deck } };
  events.push({
    type: "DrewToHand",
    payload: { player: active.id, count: drew },
  });
  return { state: s, events };
}
