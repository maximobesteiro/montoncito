import {
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
    discardPiles: opts?.discardPiles ?? 3,
    useJokers: opts?.useJokers ?? false,
    jokersAreWild: opts?.jokersAreWild ?? true,
    kingsAreWild: opts?.kingsAreWild ?? true,
    additionalWildRanks: opts?.additionalWildRanks ?? [],
    enableCardWildFlag: opts?.enableCardWildFlag ?? true,
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

  const buildPiles: BuildPile[] = [];

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
    deck: { drawPile: deck.slice(), recyclePile: [] },
    center: { buildPiles },
    winner: null,
    rngSeed,
    rules,
    data: {},
  };
}
