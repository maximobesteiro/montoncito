import { ApplyResult, BuildPile, BuildPileTarget, Card, GameEvent, GameState, Rank } from "../state/types";
import { getActivePlayer, getBuildPile, computeNextRankAfterPlace } from "../state/selectors";
import { isWild } from "../utils/isWild";
import { rejectMove } from "../state/reject";

function newBuildId(state: GameState): string {
  let suffix = state.center.buildPiles.length + 1;
  const ids = new Set(state.center.buildPiles.map(({ id }) => id));
  while (ids.has(`B${suffix}`)) suffix += 1;
  return `B${suffix}`;
}

function placeOnBuild(state: GameState, target: BuildPileTarget, card: Card): { state: GameState; events: GameEvent[]; buildId: string } | ApplyResult {
  let pile: BuildPile;
  let buildId: string;
  let piles = state.center.buildPiles;
  const created = target === "new";

  if (created) {
    const canStart = card.kind === "standard" && card.rank === 1 || isWild(card, state.rules);
    if (!canStart) return rejectMove(state, "Card does not match build requirement");
    buildId = newBuildId(state);
    pile = { id: buildId, cards: [], nextRank: 1 };
    piles = [...piles, pile];
  } else {
    buildId = target;
    try {
      pile = getBuildPile(state, buildId);
    } catch {
      return rejectMove(state, "Card does not match build requirement");
    }
  }

  if (pile.nextRank === null || (!isWild(card, state.rules) && (card.kind !== "standard" || card.rank !== pile.nextRank))) {
    return rejectMove(state, "Card does not match build requirement");
  }

  const rankOrNull: Rank | null = isWild(card, state.rules) ? pile.nextRank : (card as Extract<Card, { kind: "standard" }>).rank;
  const updated: BuildPile = {
    ...pile,
    cards: [card, ...pile.cards],
    nextRank: computeNextRankAfterPlace(pile.nextRank, rankOrNull, state.rules.maxBuildRank),
  };
  const events: GameEvent[] = [];
  if (updated.nextRank === null) {
    events.push({ type: "BuildCompleted", payload: { buildId } });
    if (state.rules.autoClearCompleteBuild) {
      updated.cards = [];
      updated.nextRank = 1;
      events.push({ type: "BuildCleared", payload: { buildId } });
    }
  }
  const index = piles.findIndex(({ id }) => id === buildId);
  const nextPiles = piles.slice();
  nextPiles[index] = updated;
  return { state: { ...state, center: { buildPiles: nextPiles } }, events, buildId };
}

type Source = "hand" | "stock" | "discard";
function playFrom(state: GameState, source: Source, target: BuildPileTarget, cardId?: string, pileIndex?: number): ApplyResult {
  const active = getActivePlayer(state);
  let card: Card | undefined;
  let byId = state.byId;
  if (source === "hand") {
    const index = active.hand.cards.findIndex(({ id }) => id === cardId);
    if (index < 0) return rejectMove(state, "Card not in hand");
    card = active.hand.cards[index];
    const hand = active.hand.cards.slice();
    hand.splice(index, 1);
    byId = { ...byId, [active.id]: { ...active, hand: { cards: hand } } };
  } else if (source === "stock") {
    card = active.stock.faceDown[active.stock.faceDown.length - 1];
    if (!card) return rejectMove(state, "No stock card to play");
  } else {
    const discard = active.discards[pileIndex!];
    card = discard?.[discard.length - 1];
    if (!card) return rejectMove(state, "Discard pile is empty");
  }
  const placed = placeOnBuild(state, target, card!);
  if ("accepted" in placed) return placed;
  if (source === "stock") {
    byId = { ...byId, [active.id]: { ...active, stock: { faceDown: active.stock.faceDown.slice(0, -1) } } };
  } else if (source === "discard") {
    const discards = active.discards.slice();
    discards[pileIndex!] = discards[pileIndex!].slice(0, -1);
    byId = { ...byId, [active.id]: { ...active, discards } };
  }
  const finalState = { ...placed.state, byId };
  const events: GameEvent[] = [{ type: "PlayedToBuild", payload: { player: active.id, from: source, cardId: card!.id, buildId: placed.buildId } }, ...placed.events];
  return { accepted: true, state: finalState, events };
}

export const playHandToBuild = (state: GameState, cardId: string, target: BuildPileTarget): ApplyResult => playFrom(state, "hand", target, cardId);
export const playStockToBuild = (state: GameState, target: BuildPileTarget): ApplyResult => playFrom(state, "stock", target);
export const playDiscardToBuild = (state: GameState, pileIndex: number, target: BuildPileTarget): ApplyResult => playFrom(state, "discard", target, undefined, pileIndex);
