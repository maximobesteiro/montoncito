import { Card, GameState, PlayerId, Rank } from "../state/types";
import { isWild } from "../utils/isWild";
import { hasRefillSource } from "../state/selectors";

/**
 * Returns true if `card` can satisfy the `required` rank for a build pile
 * under the current wildness rules.
 */
function cardMatchesRequired(
  card: Card,
  required: Rank | null,
  rules: GameState["rules"],
): boolean {
  if (required === null) return false; // pile already completed and should be cleared/reset
  if (isWild(card, rules)) return true;
  return card.kind === "standard" && card.rank === required;
}

/**
 * Returns true if the given player has ANY legal play onto ANY build pile,
 * considering hand, stock-top, and each discard-top. Drawing is not considered here.
 */
export function playerHasAnyPlacement(state: GameState, pid: PlayerId): boolean {
  const ps = state.byId[pid];
  if (!ps) return false;

  // Collect candidate cards: all cards in hand, top of stock, tops of discards.
  const candidates: Card[] = [];

  // Hand (unordered)
  for (const c of ps.hand.cards) candidates.push(c);

  // Stock top (top is last element)
  const stockTop = ps.stock.faceDown[ps.stock.faceDown.length - 1];
  if (stockTop) candidates.push(stockTop);

  // Each discard top (top is last element)
  for (let i = 0; i < ps.discards.length; i++) {
    const d = ps.discards[i];
    if (!d) continue; // strict mode: skip if index not present
    const top = d[d.length - 1];
    if (top) candidates.push(top);
  }

  if (candidates.length === 0) return false;

  if (
    candidates.some(
      (card) =>
        (card.kind === "standard" && card.rank === 1) ||
        isWild(card, state.rules),
    )
  )
    return true;

  // Check each center build pile requirement
  for (const pile of state.center.buildPiles) {
    const req = pile.nextRank;
    if (req === null) continue; // completed and (possibly) awaiting clear
    for (const card of candidates) {
      if (cardMatchesRequired(card, req, state.rules)) return true;
    }
  }

  return false;
}

/**
 * Determine winner by fewest Stock pile cards, then Hand cards, then Discard
 * pile cards. Remaining ties use the seeded player order deterministically.
 */
function winnerByFewestCardsThenTurnOrder(state: GameState): PlayerId | null {
  let best: {
    pid: PlayerId;
    stock: number;
    hand: number;
    discards: number;
    order: number;
  } | null = null;

  for (let i = 0; i < state.players.length; i++) {
    const maybePid = state.players[i];
    if (!maybePid) continue; // strict mode: skip if missing
    const pid = maybePid as PlayerId;

    const ps = state.byId[pid];
    if (!ps) continue;
    const stock = ps.stock.faceDown.length;
    const hand = ps.hand.cards.length;
    const discards = ps.discards.reduce(
      (count, pile) => count + pile.length,
      0,
    );

    if (
      !best ||
      stock < best.stock ||
      (stock === best.stock && hand < best.hand) ||
      (stock === best.stock &&
        hand === best.hand &&
        discards < best.discards) ||
      (stock === best.stock &&
        hand === best.hand &&
        discards === best.discards &&
        i < best.order)
    ) {
      best = { pid, stock, hand, discards, order: i };
    }
  }

  return best ? best.pid : null;
}

/**
 * Game-over rules:
 * 1) Immediate win if any player's Stock pile is empty.
 * 2) If both shared draw sources are empty and no player has a legal placement,
 *    compare Stock pile size, Hand size, Discard pile size, then player order.
 */
export function checkGameOver(state: GameState): string | null {
  // Rule 1: immediate win on empty stock
  for (let i = 0; i < state.players.length; i++) {
    const maybePid = state.players[i];
    if (!maybePid) continue; // strict mode: skip if missing
    const pid = maybePid as PlayerId;

    const ps = state.byId[pid];
    if (ps && ps.stock.faceDown.length === 0) return pid;
  }

  // Rule 2: no cards left to draw or recycle + no legal moves for anyone
  if (!hasRefillSource(state)) {
    let anyCanPlay = false;

    for (let i = 0; i < state.players.length; i++) {
      const maybePid = state.players[i];
      if (!maybePid) continue; // strict mode: skip if missing
      const pid = maybePid as PlayerId;

      if (playerHasAnyPlacement(state, pid)) {
        anyCanPlay = true;
        break;
      }
    }

    if (!anyCanPlay) {
      return winnerByFewestCardsThenTurnOrder(state);
    }
  }

  return null;
}
