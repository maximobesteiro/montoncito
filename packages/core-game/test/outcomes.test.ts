import { describe, expect, expectTypeOf, it } from "vitest";
import {
  applyMove,
  createInitialState,
  type ApplyResult,
  type Card,
  type GameState,
  type Move,
  type Rank,
  type RuleReason,
} from "../src";

const ace = (id: string): Card => ({
  kind: "standard",
  id,
  rank: 1,
  suit: "Hearts",
});

function lobby(): GameState {
  return createInitialState(
    [{ id: "P1" }, { id: "P2" }],
    [ace("S1"), ace("S2"), ace("H1"), ace("H2"), ace("D1")],
    { id: "game", seed: 1, stockSize: 1, handSize: 2 },
  );
}

function turn(): GameState {
  const state = applyMove(lobby(), { kind: "START_GAME" }).state;
  state.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });
  state.nextBuildPileId = 2;
  return state;
}

function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe("explicit core outcomes", () => {
  const acceptedCases: {
    name: string;
    setup: () => GameState;
    move: Move;
    event: string;
  }[] = [
    {
      name: "start",
      setup: lobby,
      move: { kind: "START_GAME" },
      event: "GameStarted",
    },
    {
      name: "hand play",
      setup: turn,
      move: { kind: "PLAY_HAND_TO_BUILD", cardId: "H1", target: "B1" },
      event: "PlayedToBuild",
    },
    {
      name: "winning stock play",
      setup: turn,
      move: { kind: "PLAY_STOCK_TO_BUILD", target: "B1" },
      event: "GameOver",
    },
    {
      name: "discard",
      setup: turn,
      move: { kind: "DISCARD_FROM_HAND", cardId: "H1", pileIndex: 0 },
      event: "TurnEnded",
    },
    {
      name: "draw",
      setup: () =>
        applyMove(turn(), {
          kind: "DISCARD_FROM_HAND",
          cardId: "H1",
          pileIndex: 0,
        }).state,
      move: { kind: "DRAW_TO_HAND" },
      event: "DrewToHand",
    },
    {
      name: "discard pile play",
      setup: () => {
        const state = turn();
        state.byId.P1!.discards[0] = [ace("discard")];
        return state;
      },
      move: { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, target: "B1" },
      event: "PlayedToBuild",
    },
  ];

  it.each(acceptedCases)(
    "accepts $name immutably and deterministically",
    ({ setup, move, event }) => {
      const state = setup();
      const before = structuredClone(state);
      freeze(state);
      const result = applyMove(state, move);
      expect(result.accepted).toBe(true);
      expect(result.state).not.toBe(state);
      expect(result.events.map((e) => e.type)).toContain(event);
      expect(result.events.map((e) => e.type)).not.toContain("InvalidMove");
      expect(state).toEqual(before);
      expect(applyMove(state, move)).toEqual(result);
    },
  );

  it("accepts a zero-card draw even when the state is structurally unchanged", () => {
    const state = turn();
    state.deck.drawPile = [];
    state.byId.P1!.hand.cards = [ace("H1")];
    const result = applyMove(state, { kind: "DRAW_TO_HAND" });
    expect(result.accepted).toBe(true);
    expect(result.state).toEqual(state);
    expect(result.events).toEqual([
      { type: "DrewToHand", payload: { player: "P1", count: 0 } },
    ]);
  });

  it.each([
    ["hand", (state: GameState) => ({ kind: "PLAY_HAND_TO_BUILD" as const, cardId: "H1", target: "new" as const })],
    ["stock", (_state: GameState) => ({ kind: "PLAY_STOCK_TO_BUILD" as const, target: "new" as const })],
    ["discard", (state: GameState) => {
      state.byId.P1!.discards[0] = [ace("discard")];
      return { kind: "PLAY_DISCARD_TO_BUILD" as const, pileIndex: 0, target: "new" as const };
    }],
  ])("starts a deterministic Build pile from %s", (_source, makeMove) => {
    const state = turn();
    const move = makeMove(state);
    const before = structuredClone(state);
    freeze(state);
    const first = applyMove(state, move);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.state.center.buildPiles.at(-1)).toMatchObject({ id: "B2", nextRank: 2 });
    expect(applyMove(state, move)).toEqual(first);
    expect(state).toEqual(before);
  });

  it("rejects a non-starter card targeting a new Build pile", () => {
    const state = turn();
    state.byId.P1!.hand.cards = [{ kind: "standard", id: "H2", rank: 2, suit: "Hearts" }];
    const result = applyMove(state, { kind: "PLAY_HAND_TO_BUILD", cardId: "H2", target: "new" });
    expect(result.accepted).toBe(false);
    expect(state.center.buildPiles).toHaveLength(1);
  });

  it("progresses through wild ranks, then recycles and removes a completed Build pile", () => {
    let state = turn();
    state.center.buildPiles = [];
    state.nextBuildPileId = 1;
    state.rules.useJokers = true;
    state.byId.P1!.hand.cards = Array.from({ length: 12 }, (_, index) =>
      index === 4
        ? { kind: "standard" as const, id: "king", rank: 13 as Rank, suit: "Hearts" as const }
        : index === 9
          ? { kind: "joker" as const, id: "joker" }
          : { kind: "standard" as const, id: `rank-${index + 1}`, rank: (index + 1) as Rank, suit: "Hearts" },
    );
    // Kings and Jokers each represent the next required rank.
    let result = applyMove(state, { kind: "PLAY_HAND_TO_BUILD", cardId: "rank-1", target: "new" });
    expect(result.accepted).toBe(true);
    state = result.state;
    const buildId = state.center.buildPiles[0]!.id;
    for (const id of ["rank-2", "rank-3", "rank-4", "king", "rank-6", "rank-7", "rank-8", "rank-9", "joker", "rank-11", "rank-12"]) {
      result = applyMove(state, { kind: "PLAY_HAND_TO_BUILD", cardId: id, target: buildId });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.center.buildPiles).toEqual([]);
    expect(state.deck.recyclePile.map(({ id }) => id)).toHaveLength(12);
    expect(result.events.map(({ type }) => type)).toContain("BuildCompleted");
    expect(result.events.map(({ type }) => type)).toContain("BuildCleared");

    state.byId.P1!.hand.cards = [ace("next-build")];
    result = applyMove(state, { kind: "PLAY_HAND_TO_BUILD", cardId: "next-build", target: "new" });
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.state.center.buildPiles[0]?.id).toBe("B2");
  });

  it("rejects without evaluating a winner or mutating the input", () => {
    const state = lobby();
    freeze(state);
    const result = applyMove(state, { kind: "DRAW_TO_HAND" });
    expect(result.accepted).toBe(false);
    if (result.accepted) throw new Error("Expected rejection");
    expectTypeOf(result.reason).toEqualTypeOf<RuleReason>();
    expect(result.reason).toBe("Not your turn");
    expect(result.state).toBe(state);
    expect(result.state.winner).toBeNull();
    expect(applyMove(state, { kind: "DRAW_TO_HAND" })).toEqual(result);
  });

  it("exposes an exhaustive result union", () => {
    function outcome(result: ApplyResult): boolean {
      switch (result.accepted) {
        case true:
          return true;
        case false:
          return false;
        default: {
          expectTypeOf(result).toEqualTypeOf<never>();
          return result;
        }
      }
    }
    expect(outcome(applyMove(lobby(), { kind: "START_GAME" }))).toBe(true);
  });
});
