import { describe, expect, expectTypeOf, it } from "vitest";
import {
  applyMove,
  createInitialState,
  type ApplyResult,
  type Card,
  type GameState,
  type Move,
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
  return applyMove(lobby(), { kind: "START_GAME" }).state;
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
      move: { kind: "PLAY_HAND_TO_BUILD", cardId: "H1", buildId: "B1" },
      event: "PlayedToBuild",
    },
    {
      name: "winning stock play",
      setup: turn,
      move: { kind: "PLAY_STOCK_TO_BUILD", buildId: "B1" },
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
      move: { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, buildId: "B1" },
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
