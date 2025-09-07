import { ApplyResult, GameEvent, GameState } from "../state/types";
import { firstPlayerId } from "../state/selectors";

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

function drawToHandUpTo(
  s: GameState,
  pid: string
): { state: GameState; drew: number } {
  const byId = { ...s.byId };
  const ps = byId[pid];
  if (!ps) return { state: s, drew: 0 };

  let deck = s.deck.drawPile.slice();
  const target = s.rules.handSize;
  const hand = ps.hand.cards.slice();
  let drew = 0;

  while (hand.length < target) {
    const c = deck.shift();
    if (!c) break;
    hand.push(c);
    drew++;
  }

  byId[pid] = { ...ps, hand: { cards: hand } };
  return { state: { ...s, byId, deck: { ...s.deck, drawPile: deck } }, drew };
}

export function startGame(state: GameState): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];

  // Initialize center build piles if not already
  if (s.center.buildPiles.length === 0) {
    s = {
      ...s,
      center: {
        buildPiles: Array.from({ length: s.rules.buildPiles }, (_, i) => ({
          id: `B${i + 1}`,
          cards: [],
          nextRank: 1,
        })),
      },
    };
  }

  // Deal stock piles
  s = dealStockRoundRobin(s);

  // Enter turn phase and set first active player
  s = {
    ...s,
    phase: "turn",
    turn: { number: 1, activePlayer: firstPlayerId(s), hasDiscarded: false },
  };

  // Draw initial hand for active player
  const { state: s2, drew } = drawToHandUpTo(s, s.turn.activePlayer);
  s = s2;

  events.push({ type: "GameStarted" });
  if (drew > 0)
    events.push({
      type: "DrewToHand",
      payload: { player: s.turn.activePlayer, count: drew },
    });

  return { state: s, events };
}
