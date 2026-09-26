import { describe, it, expect } from "vitest";
import {
  applyMove,
  createInitialState,
  Card,
  RulesConfig,
  ApplyResult,
  GameState,
  RuleReason,
  Rank,
} from "../src";

// helper: make a standard card with rank
function mkStd(id: string, rank: Rank): Card {
  return { kind: "standard", id, rank, suit: "Hearts" };
}

function expectRejected(
  result: ApplyResult,
  state: GameState,
  reason: RuleReason,
) {
  expect(result.accepted).toBe(false);
  if (result.accepted) throw new Error("Expected rejection");
  expect(result.reason).toBe(reason);
  expect(result.state).toBe(state);
}

const baseRules: Partial<RulesConfig> = {
  handSize: 2,
  stockSize: 1, // <-- avoid immediate gameover
  discardPiles: 3,
};

const players = [{ id: "P1" }, { id: "P2" }];

describe("invalid moves validations", () => {
  it("DRAW_TO_HAND when not your turn (phase = lobby)", () => {
    const deck: Card[] = [mkStd("A1", 1)];
    const s0 = createInitialState(players, deck, { ...baseRules, seed: 1 });

    const r = applyMove(s0, { kind: "DRAW_TO_HAND" });
    expectRejected(r, s0, "Not your turn");
    expect(r.state.phase).toBe("lobby");
  });

  it("START_GAME twice (second start is invalid)", () => {
    // Need enough cards for: stocks (2 players * 1) + some for drawing
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2),
      mkStd("H3", 3),
      mkStd("H4", 4),
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });
    expect(s.phase).toBe("turn"); // no immediate gameover now

    r = applyMove(s, { kind: "START_GAME" });
    expectRejected(r, s, "Game already started");
  });

  it("DRAW_TO_HAND when hand already full", () => {
    // Ensure P1 can fill hand at start (handSize=2)
    // Stock to P1 = S1, stock to P2 = S2, then P1 draws H3 and H4
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2),
      mkStd("H3", 3),
      mkStd("H4", 4),
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });
    // Hand should be full already
    r = applyMove(s, { kind: "DRAW_TO_HAND" });
    expectRejected(r, s, "Hand already full");
  });

  it("PLAY_HAND_TO_BUILD with a card not in hand", () => {
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2),
      mkStd("H3", 3),
      mkStd("H4", 4),
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });

    r = applyMove(s, {
      kind: "PLAY_HAND_TO_BUILD",
      cardId: "NOPE",
      target: "B1",
    });
    expectRejected(r, s, "Card not in hand");
  });

  it("PLAY_HAND_TO_BUILD that does not match build requirement", () => {
    // B1 requires rank 1; give P1 hand cards 5 & 6 (illegal play)
    // But also give P1 a card that CAN be played (rank 1) to prevent immediate game over
    const deck: Card[] = [
      mkStd("S9", 9), // P1 stock
      mkStd("S8", 8), // P2 stock
      mkStd("H5", 5), // P1 hand
      mkStd("H6", 6), // P1 hand
      mkStd("H1", 1), // P1 hand - this can be played legally
      mkStd("H2", 2), // extra card to keep deck from being empty
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });

    // Find a card that doesn't match the build requirement (rank 5 or 6)
    const bad = s.byId["P1"].hand.cards.find(
      (c) => c.kind === "standard" && (c.rank === 5 || c.rank === 6),
    )!;
    r = applyMove(s, {
      kind: "PLAY_HAND_TO_BUILD",
      cardId: bad.id,
      target: "B1",
    });
    expectRejected(r, s, "Card does not match build requirement");
  });

  it("PLAY_STOCK_TO_BUILD with no stock card (game already over)", () => {
    const rules: Partial<RulesConfig> = { ...baseRules, stockSize: 0 };
    const deck: Card[] = [mkStd("H1", 1), mkStd("H2", 2)];
    let s = createInitialState(players, deck, { ...rules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });
    expect(s.phase).toBe("gameover"); // immediate win on empty stock

    r = applyMove(s, { kind: "PLAY_STOCK_TO_BUILD", target: "B1" });
    expectRejected(r, s, "Not your turn");
  });

  it("PLAY_STOCK_TO_BUILD where stock top does not match requirement", () => {
    // P1 stock top = 5; B1 requires 1 initially → invalid
    // But give P1 a hand card that CAN be played to prevent immediate game over
    const rules: Partial<RulesConfig> = { ...baseRules, stockSize: 1 };
    const deck: Card[] = [
      mkStd("S5", 5), // P1 stock
      mkStd("S9", 9), // P2 stock
      mkStd("H1", 1), // P1 hand - this can be played legally
      mkStd("H2", 2), // P1 hand
      mkStd("H7", 7), // extra card to keep deck from being empty
      mkStd("H8", 8), // extra card
    ];
    let s = createInitialState(players, deck, { ...rules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    s.center.buildPiles.push({ id: "B1", cards: [], nextRank: 1 });

    r = applyMove(s, { kind: "PLAY_STOCK_TO_BUILD", target: "B1" });
    expectRejected(r, s, "Stock card does not match build requirement");
  });

  it("PLAY_DISCARD_TO_BUILD with invalid discard pile index", () => {
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2),
      mkStd("H1", 1),
      mkStd("H2", 2),
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;

    r = applyMove(s, {
      kind: "PLAY_DISCARD_TO_BUILD",
      pileIndex: 99,
      target: "B1",
    });
    expectRejected(r, s, "Invalid discard pile index");
  });

  it("PLAY_DISCARD_TO_BUILD from an empty discard pile", () => {
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2),
      mkStd("H3", 3),
      mkStd("H4", 4),
    ];
    let s = createInitialState(players, deck, { ...baseRules, seed: 1 });

    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;

    r = applyMove(s, {
      kind: "PLAY_DISCARD_TO_BUILD",
      pileIndex: 0,
      target: "B1",
    });
    expectRejected(r, s, "Discard pile is empty");
  });
});
