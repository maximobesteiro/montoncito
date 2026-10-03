import { describe, expect, it } from "vitest";
import { peekTopCard, placeTopCard, removeTopCard, type Card } from "../src";

describe("bottom-to-top pile operations", () => {
  it("returns no card from an empty pile and preserves it on removal", () => {
    const pile: Card[] = [];
    Object.freeze(pile);
    expect(peekTopCard(pile)).toBeUndefined();
    const removed = removeTopCard(pile);
    expect(removed.card).toBeUndefined();
    expect(removed.pile).toBe(pile);
  });

  it("removes the last card and exposes the preceding card without mutating either", () => {
    const ace: Card = Object.freeze({
      kind: "standard",
      id: "ace",
      rank: 1,
      suit: "Hearts",
    });
    const joker: Card = Object.freeze({ kind: "joker", id: "joker" });
    const pile = [ace, joker];
    Object.freeze(pile);

    expect(peekTopCard(pile)).toBe(joker);
    const removed = removeTopCard(pile);
    expect(removed.card).toBe(joker);
    expect(removed.pile).toEqual([ace]);
    expect(peekTopCard(removed.pile)).toBe(ace);
    const last = removeTopCard(removed.pile);
    expect(last.card).toBe(ace);
    expect(peekTopCard(last.pile)).toBeUndefined();
    expect(pile).toEqual([ace, joker]);
    expect(ace).toEqual({
      kind: "standard",
      id: "ace",
      rank: 1,
      suit: "Hearts",
    });
    expect(joker).toEqual({ kind: "joker", id: "joker" });
  });

  it("places any card on top without enforcing Build rules or mutating inputs", () => {
    const ace: Card = Object.freeze({
      kind: "standard",
      id: "ace",
      rank: 1,
      suit: "Hearts",
    });
    const nine: Card = Object.freeze({
      kind: "standard",
      id: "nine",
      rank: 9,
      suit: "Clubs",
    });
    const pile = Object.freeze([ace]);
    const placed = placeTopCard(pile, nine);
    expect(placed).toEqual([ace, nine]);
    expect(peekTopCard(placed)).toBe(nine);
    expect(removeTopCard(placed).pile).toEqual([ace]);
    expect(placeTopCard([], nine)).toEqual([nine]);
    expect(pile).toEqual([ace]);
    expect(nine).toEqual({
      kind: "standard",
      id: "nine",
      rank: 9,
      suit: "Clubs",
    });
  });
});
