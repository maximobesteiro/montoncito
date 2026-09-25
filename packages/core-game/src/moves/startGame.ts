import { ApplyResult, GameEvent, GameState } from "../state/types";
import { firstPlayerId } from "../state/selectors";
import { refillHand } from "./draw";

function dealStockRoundRobin(s: GameState): GameState {
  const per = s.rules.stockSize;
  const order = s.players;
  const byId = { ...s.byId };
  const deck = s.deck.drawPile.slice();

  // Deal one card at a time to each player's stock until stockSize reached (or deck runs out)
  for (let k = 0; k < per; k++) {
    for (const pid of order) {
      const card = deck.shift();
      if (!card) break;
      const ps = byId[pid];
      const next = ps
        ? { ...ps }
        : {
            id: pid,
            hand: { cards: [] },
            discards: Array.from({ length: s.rules.discardPiles }, () => []),
            stock: { faceDown: [] },
          };
      next.stock = { faceDown: [...next.stock.faceDown, card] };
      byId[pid] = next;
    }
  }

  return { ...s, byId, deck: { ...s.deck, drawPile: deck } };
}

export function startGame(state: GameState): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];

  // Deal stock piles
  s = dealStockRoundRobin(s);

  // Enter turn phase and set first active player
  s = {
    ...s,
    phase: "turn",
    turn: { number: 1, activePlayer: firstPlayerId(s), hasDiscarded: false },
  };

  // Draw initial hand for active player
  const refill = refillHand(s, s.turn.activePlayer);
  s = refill.state;

  events.push({ type: "GameStarted" });
  if (refill.drew > 0) events.push(refill.event);

  return { accepted: true, state: s, events };
}
