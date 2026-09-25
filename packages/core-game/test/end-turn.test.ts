import { describe, expect, it } from "vitest";
import { applyMove, Card, createInitialState } from "../src";

function card(id: string, rank: 1 | 2 | 7): Card {
  return { kind: "standard", id, rank, suit: "Hearts" };
}

function blockedState() {
  const initial = createInitialState(
    [{ id: "P1" }, { id: "P2" }],
    [],
    { handSize: 2, stockSize: 1, discardPiles: 1, kingsAreWild: false },
  );
  return {
    ...initial,
    phase: "turn" as const,
    turn: { number: 3, activePlayer: "P1", hasDiscarded: false },
    byId: {
      P1: {
        ...initial.byId.P1!,
        hand: { cards: [] },
        stock: { faceDown: [card("stock-1", 7)] },
        discards: [[]],
      },
      P2: {
        ...initial.byId.P2!,
        hand: { cards: [] },
        stock: { faceDown: [card("stock-2", 7)] },
        discards: [[]],
      },
    },
    center: { buildPiles: [{ id: "B1", cards: [], nextRank: 1 as const }] },
  };
}

describe("END_TURN", () => {
  it("advances an exhausted blocked Turn and resolves the seeded-order tie", () => {
    const state = blockedState();

    const result = applyMove(state, { kind: "END_TURN" });

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.turn).toEqual({
      number: 4,
      activePlayer: "P2",
      hasDiscarded: false,
    });
    expect(result.state.phase).toBe("gameover");
    expect(result.state.winner).toBe("P1");
    expect(result.events.map((event) => event.type)).toContain("TurnEnded");
    expect(result.events).toContainEqual({
      type: "DrewToHand",
      payload: { player: "P2", count: 0 },
    });
  });

  it("rejects ending while the Hand is not empty", () => {
    const state = {
      ...blockedState(),
      byId: {
        ...blockedState().byId,
        P1: {
          ...blockedState().byId.P1!,
          hand: { cards: [card("hand-1", 2)] },
        },
      },
    };

    const result = applyMove(state, { kind: "END_TURN" });

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("Hand is not empty");
    expect(result.state).toBe(state);
  });

  it("rejects ending when a refill source remains", () => {
    const state = {
      ...blockedState(),
      deck: { drawPile: [card("draw-1", 2)], recyclePile: [] },
    };

    const result = applyMove(state, { kind: "END_TURN" });

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("Hand can still be refilled");
  });

  it("rejects ending when a legal placement remains", () => {
    const state = {
      ...blockedState(),
      byId: {
        ...blockedState().byId,
        P1: {
          ...blockedState().byId.P1!,
          stock: { faceDown: [card("stock-1", 1)] },
        },
      },
    };

    const result = applyMove(state, { kind: "END_TURN" });

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("A legal placement remains");
  });

  it("uses Stock pile size, Hand size, and Discard pile size as winner tiebreakers", () => {
    const state = blockedState();
    const p2 = state.byId.P2!;
    const cases = [
      {
        name: "Stock pile size",
        players: {
          ...state.byId,
          P2: { ...p2, stock: { faceDown: [card("p2-stock-1", 7), card("p2-stock-2", 2)] } },
        },
        winner: "P1",
      },
      {
        name: "Hand size",
        players: {
          ...state.byId,
          P2: { ...p2, hand: { cards: [card("p2-hand-1", 2)] } },
        },
        winner: "P1",
      },
      {
        name: "Discard pile size",
        players: {
          ...state.byId,
          P2: { ...p2, discards: [[card("p2-discard-1", 2)]] },
        },
        winner: "P1",
      },
    ];

    for (const winnerCase of cases) {
      const result = applyMove(
        { ...state, byId: winnerCase.players },
        { kind: "END_TURN" },
      );
      expect(result.accepted, winnerCase.name).toBe(true);
      expect(result.state.winner, winnerCase.name).toBe(winnerCase.winner);
    }
  });
});
