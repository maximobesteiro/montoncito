import {
  BuildPile,
  Card,
  GameState,
  PlayerId,
  PlayerState,
  RulesConfig,
} from "./types";
import { makeRng } from "../utils/random";

export function createInitialState(
  players: { id: PlayerId; name?: string }[],
  deck: Card[],
  opts?: Partial<RulesConfig> & { seed?: number; id?: string }
): GameState {
  const rules: RulesConfig = {
    handSize: opts?.handSize ?? 5,
    stockSize: opts?.stockSize ?? 20,
    buildPiles: opts?.buildPiles ?? 4,
    maxBuildRank: opts?.maxBuildRank ?? 13,
    discardPiles: opts?.discardPiles ?? 3,
    useJokers: opts?.useJokers ?? false,
    jokersAreWild: opts?.jokersAreWild ?? true,
    kingsAreWild: opts?.kingsAreWild ?? true,
    additionalWildRanks: opts?.additionalWildRanks ?? [],
    enableCardWildFlag: opts?.enableCardWildFlag ?? true,
    autoClearCompleteBuild: opts?.autoClearCompleteBuild ?? true,
  };

  const rngSeed = opts?.seed ?? 123456789;
  // Note: we expect deck to already be shuffled by caller if desired.
  // rng is here for future use if you later move shuffling inside.
  makeRng(rngSeed);

  const byId: Record<PlayerId, PlayerState> = {};
  for (const p of players) {
    byId[p.id] = {
      id: p.id,
      name: p.name,
      hand: { cards: [] },
      discards: Array.from({ length: rules.discardPiles }, () => []),
      stock: { faceDown: [] },
    };
  }

  const buildPiles: BuildPile[] = Array.from(
    { length: rules.buildPiles },
    (_, i) => ({
      id: `B${i + 1}`,
      cards: [],
      nextRank: 1,
    })
  );

  return {
    version: 1,
    id: opts?.id ?? "match",
    phase: "lobby",
    turn: {
      number: 0,
      activePlayer: players[0]?.id ?? "P1",
      hasDiscarded: false,
    },
    players: players.map((p) => p.id),
    byId,
    deck: { drawPile: deck.slice(), discard: [] },
    center: { buildPiles },
    winner: null,
    rngSeed,
    rules,
    data: {},
  };
}
