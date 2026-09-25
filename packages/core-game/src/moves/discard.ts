import { ApplyResult, GameEvent, GameState } from "../state/types";
import { getActivePlayer } from "../state/selectors";
import { must } from "../utils/guards";
import { rejectMove } from "../state/reject";
import { endTurn } from "./endTurn";

export function discardFromHand(
  state: GameState,
  cardId: string,
  pileIndex: number,
): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];

  const active = getActivePlayer(s);

  if (pileIndex < 0 || pileIndex >= s.rules.discardPiles) {
    return rejectMove(state, "Invalid discard pile index");
  }

  const idx = active.hand.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) {
    return rejectMove(state, "Card not in hand");
  }

  // remove from hand
  const card = must(active.hand.cards[idx], "Card not found at expected index");
  const nextHand = active.hand.cards.slice();
  nextHand.splice(idx, 1);

  // push onto chosen discard stack (top = last element)
  const discards = active.discards.slice();
  const stack = must(discards[pileIndex], "Discard pile missing").slice();
  stack.push(card);
  discards[pileIndex] = stack;

  // write back player
  const byId = {
    ...s.byId,
    [active.id]: { ...active, hand: { cards: nextHand }, discards },
  };

  s = { ...s, byId };
  events.push({
    type: "Discarded",
    payload: { player: active.id, cardId: card.id, pileIndex },
  });

  const turnEnd = endTurn(s);
  events.push(...turnEnd.events);

  return { accepted: true, state: turnEnd.state, events };
}
