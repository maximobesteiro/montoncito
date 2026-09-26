import {
  BuildPile,
  Card,
  GameState,
  PlayerId,
  PlayerState,
  RulesConfig,
} from "./types";

export function createInitialState(
  players: { id: PlayerId; name?: string }[],
  deck: Card[],
  opts?: Partial<RulesConfig> & { seed?: number; id?: string },
): GameState {
  const rules: RulesConfig = {
    handSize: opts?.handSize ?? 5,
    stockSize: opts?.stockSize ?? 20,
    discardPiles: opts?.discardPiles ?? 3,
  };

  const seed = (opts?.seed ?? 123456789) >>> 0;

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
    rulesetVersion: 1,
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
    nextBuildPileId: 1,
    winner: null,
    rng: { algorithm: "mulberry32-v1", seed, cursor: 0 },
    rules,
    data: {},
  };
}
