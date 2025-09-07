import { ApplyResult, GameEvent, GameState, Rank } from "../state/types";
import {
  getActivePlayer,
  getBuildPile,
  computeNextRankAfterPlace,
} from "../state/selectors";
import { isWild } from "../utils/isWild";
import { must } from "src/utils/guards";

function placeOnBuild(
  s: GameState,
  buildId: string,
  rankOrNull: Rank | null
): { state: GameState; events: GameEvent[] } {
  const pile = getBuildPile(s, buildId);
  const buildIndex = s.center.buildPiles.findIndex((b) => b.id === buildId);

  const piles = s.center.buildPiles.slice();
  const copy = { ...pile };

  // Update nextRank based on placement result
  copy.nextRank = computeNextRankAfterPlace(
    pile.nextRank,
    rankOrNull,
    s.rules.maxBuildRank
  );

  // If pile completed
  const events: GameEvent[] = [];
  if (copy.nextRank === null) {
    events.push({ type: "BuildCompleted", payload: { buildId } });
    if (s.rules.autoClearCompleteBuild) {
      copy.cards = [];
      copy.nextRank = 1;
      events.push({ type: "BuildCleared", payload: { buildId } });
    }
  }

  piles[buildIndex] = copy;
  const state = { ...s, center: { buildPiles: piles } };
  return { state, events };
}

export function playHandToBuild(
  state: GameState,
  cardId: string,
  buildId: string
): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];
  const active = getActivePlayer(s);

  const idx = active.hand.cards.findIndex((c) => c.id === cardId);
  if (idx < 0)
    return {
      state: s,
      events: [
        { type: "InvalidMove", payload: { reason: "Card not in hand" } },
      ],
    };

  const card = must(active.hand.cards[idx]);
  const pile = getBuildPile(s, buildId);

  // Remove from hand
  const nextHand = active.hand.cards.slice();
  nextHand.splice(idx, 1);

  // Add to build pile (top = index 0)
  const piles = s.center.buildPiles.slice();
  const buildIndex = piles.findIndex((b) => b.id === buildId);
  const updated = { ...pile, cards: [card, ...pile.cards] };
  piles[buildIndex] = updated;

  s = {
    ...s,
    byId: { ...s.byId, [active.id]: { ...active, hand: { cards: nextHand } } },
    center: { buildPiles: piles },
  };

  // Determine rank contribution (wilds count as current required)
  const rankOrNull: Rank | null =
    card.kind === "standard" && !isWild(card, s.rules)
      ? card.rank
      : pile.nextRank;
  const placed = placeOnBuild(s, buildId, rankOrNull);
  s = placed.state;
  events.push(
    {
      type: "PlayedToBuild",
      payload: { player: active.id, from: "hand", cardId, buildId },
    },
    ...placed.events
  );

  return { state: s, events };
}

export function playStockToBuild(
  state: GameState,
  buildId: string
): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];
  const active = getActivePlayer(s);
  const top = active.stock.faceDown[active.stock.faceDown.length - 1];
  if (!top)
    return {
      state: s,
      events: [{ type: "InvalidMove", payload: { reason: "No stock card" } }],
    };

  // Pop from stock
  const nextStock = active.stock.faceDown.slice(0, -1);

  // Add to build
  const pile = getBuildPile(s, buildId);
  const piles = s.center.buildPiles.slice();
  const buildIndex = piles.findIndex((b) => b.id === buildId);
  const updated = { ...pile, cards: [top, ...pile.cards] };
  piles[buildIndex] = updated;

  s = {
    ...s,
    byId: {
      ...s.byId,
      [active.id]: { ...active, stock: { faceDown: nextStock } },
    },
    center: { buildPiles: piles },
  };

  const rankOrNull: Rank | null =
    top.kind === "standard" && !isWild(top, s.rules) ? top.rank : pile.nextRank;
  const placed = placeOnBuild(s, buildId, rankOrNull);
  s = placed.state;
  events.push(
    {
      type: "PlayedToBuild",
      payload: { player: active.id, from: "stock", cardId: top.id, buildId },
    },
    ...placed.events
  );

  return { state: s, events };
}

export function playDiscardToBuild(
  state: GameState,
  pileIndex: number,
  buildId: string
): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];
  const active = getActivePlayer(s);

  if (pileIndex < 0 || pileIndex >= s.rules.discardPiles) {
    return {
      state: s,
      events: [
        {
          type: "InvalidMove",
          payload: { reason: "Invalid discard pile index" },
        },
      ],
    };
  }

  const source = must(active.discards[pileIndex]);
  const top = source[source.length - 1];
  if (!top)
    return {
      state: s,
      events: [
        { type: "InvalidMove", payload: { reason: "Discard pile empty" } },
      ],
    };

  // Pop from discard
  const nextSource = source.slice(0, -1);
  const nextDiscards = active.discards.slice();
  nextDiscards[pileIndex] = nextSource;

  // Add to build
  const pile = getBuildPile(s, buildId);
  const piles = s.center.buildPiles.slice();
  const buildIndex = piles.findIndex((b) => b.id === buildId);
  const updated = { ...pile, cards: [top, ...pile.cards] };
  piles[buildIndex] = updated;

  s = {
    ...s,
    byId: { ...s.byId, [active.id]: { ...active, discards: nextDiscards } },
    center: { buildPiles: piles },
  };

  const rankOrNull: Rank | null =
    top.kind === "standard" && !isWild(top, s.rules) ? top.rank : pile.nextRank;
  const placed = placeOnBuild(s, buildId, rankOrNull);
  s = placed.state;
  events.push(
    {
      type: "PlayedToBuild",
      payload: { player: active.id, from: "discard", cardId: top.id, buildId },
    },
    ...placed.events
  );

  return { state: s, events };
}
