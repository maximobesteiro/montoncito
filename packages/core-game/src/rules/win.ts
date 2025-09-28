import { Card, GameState, PlayerId, Rank } from "../state/types";
import { isWild } from "../utils/isWild";

/**
 * Returns true if `card` can satisfy the `required` rank for a build pile
 * under the current wildness rules.
 */
function cardMatchesRequired(
  card: Card,
  required: Rank | null,
  rules: GameState["rules"]
): boolean {
  if (required === null) return false; // pile already completed and should be cleared/reset
  if (isWild(card, rules)) return true;
  return card.kind === "standard" && card.rank === required;
}

/**
 * Returns true if the given player has ANY legal play onto ANY build pile,
 * considering hand, stock-top, and each discard-top. Drawing is not considered here.
 */
function playerHasAnyPlacement(state: GameState, pid: PlayerId): boolean {
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
 * Determine winner by fewest stock cards. Ties are broken by earliest
 * appearance in `players` turn order to keep the outcome deterministic.
 */
function winnerByFewestStock(state: GameState): PlayerId | null {
  let best: { pid: PlayerId; stock: number; order: number } | null = null;

  for (let i = 0; i < state.players.length; i++) {
    const maybePid = state.players[i];
    if (!maybePid) continue; // strict mode: skip if missing
    const pid = maybePid as PlayerId;

    const ps = state.byId[pid];
    if (!ps) continue;
    const stock = ps.stock.faceDown.length;

    if (
      !best ||
      stock < best.stock ||
      (stock === best.stock && i < best.order)
    ) {
      best = { pid, stock, order: i };
    }
  }

  return best ? best.pid : null;
}

/**
 * Game-over rules:
 * 1) Immediate win if any player's stock (goal pile) is empty.
 * 2) If draw pile is empty AND no player has any legal placement onto center
 *    build piles, end the game and declare winner by fewest stock cards
 *    (tie-breaker: earliest in turn order).
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

  // Rule 2: deck empty + no legal moves for anyone
  if (state.deck.drawPile.length === 0) {
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
      return winnerByFewestStock(state);
    }
  }

  return null;
}
