import { describe, it, expect } from "vitest";
import { applyMove, createInitialState, Card, RulesConfig } from "../src";

const rules: Partial<RulesConfig> = {
  handSize: 5,
  stockSize: 3,
  buildPiles: 2,
  discardPiles: 3,
  maxBuildRank: 13,
  kingsAreWild: true,
  useJokers: false,
};

function mkStd(id: string, rank: number): Card {
  return { kind: "standard", id, rank: rank as any, suit: "Hearts" };
}

describe("game flow (start → draw → discard auto-ends turn)", () => {
  it("starts the game, draws, discards (which ends the turn automatically)", () => {
    const rules: Partial<RulesConfig> = {
      handSize: 5,
      stockSize: 3,
      buildPiles: 2,
      discardPiles: 3,
      maxBuildRank: 13,
      kingsAreWild: true,
      useJokers: false,
    };

    // Enough cards for stock + some draws
    // Need: 2 players * 3 stockSize = 6 cards for stock
    // Plus: 5 handSize for initial draw
    // Plus: some extra cards for the game to continue
    const deck: Card[] = [
      mkStd("S1", 1),
      mkStd("S2", 2), // stock to P1, P2
      mkStd("S3", 3),
      mkStd("S4", 4), // stock to P1, P2 (if stockSize > 1)
      mkStd("S5", 5),
      mkStd("S6", 6), // stock to P1, P2 (if stockSize > 2)
      mkStd("H7", 7),
      mkStd("H8", 8),
      mkStd("H9", 9),
      mkStd("H10", 10),
      mkStd("H11", 11),
      mkStd("H12", 12),
      mkStd("H13", 13),
      mkStd("C1", 1),
      mkStd("C2", 2),
      mkStd("C3", 3),
    ];

    const players = [{ id: "P1" }, { id: "P2" }];

    let s = createInitialState(players, deck, { ...rules, seed: 42 });

    // Start game (deals stock, initializes build piles, draws to P1 hand)
    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;
    expect(s.phase).toBe("turn");
    expect(s.turn.activePlayer).toBe("P1");

    // Ensure P1 can draw up to full hand (if not already)
    r = applyMove(s, { kind: "DRAW_TO_HAND" });
    s = r.state;

    // Discard one from hand to pile 0 -> should auto-end turn
    const cardId = s.byId["P1"].hand.cards[0]?.id!;
    r = applyMove(s, { kind: "DISCARD_FROM_HAND", cardId, pileIndex: 0 });
    s = r.state;

    // Turn advanced automatically
    expect(s.turn.activePlayer).toBe("P2");
    expect(s.turn.number).toBe(2);
    expect(s.byId["P1"].discards[0].length).toBe(1);

    // Optional: check that TurnEnded event was emitted
    expect(r.events.some((e) => e.type === "TurnEnded")).toBe(true);
  });
});

describe("play to build flow (hand, wild king, stock)", () => {
  it("places 1, 2, K(wild) from hand, then 4 from stock onto B1 and ends game", () => {
    // Rules: keep it simple and enable King as wild
    const rules: Partial<RulesConfig> = {
      handSize: 5,
      stockSize: 1, // each player gets 1 stock card
      buildPiles: 2, // B1, B2
      discardPiles: 3,
      maxBuildRank: 13,
      kingsAreWild: true,
      useJokers: false,
      autoClearCompleteBuild: true,
    };

    // Deck order matters:
    // - First 2 cards are dealt to stocks round-robin: P1 stock, P2 stock
    // - Then P1 draws up to handSize from the FRONT of the deck.
    //
    // We want:
    //   P1 stock top = 4  (so later we can place it when pile requires 4)
    //   P1 hand contains 1, 2, 13(K) among the first few draws
    //
    // Dealing path:
    //   deal to P1 stock: S4
    //   deal to P2 stock: X9
    //   draw for P1 hand: 1, 2, 13, 7, 8 ...
    const deck: Card[] = [
      mkStd("S4", 4), // -> P1 stock (top = last element of their stock array, but only one card)
      mkStd("X9", 9), // -> P2 stock
      mkStd("H1", 1), // -> P1 hand
      mkStd("H2", 2), // -> P1 hand
      mkStd("HK", 13), // -> P1 hand (King acts as wild)
      mkStd("H7", 7), // -> filler
      mkStd("H8", 8), // -> filler
    ];

    const players = [{ id: "P1" }, { id: "P2" }];

    // Build initial state (deck already in the desired order; no shuffle here)
    let s = createInitialState(players, deck, { ...rules, seed: 42 });

    // Start game: deals stock, creates build piles, draws to P1 hand
    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;

    expect(s.phase).toBe("turn");
    expect(s.turn.activePlayer).toBe("P1");
    expect(s.center.buildPiles.find((b) => b.id === "B1")?.nextRank).toBe(1);

    // Sanity: P1 should have drawn (up to handSize) and stock should have exactly one card
    expect(s.byId["P1"].hand.cards.length).toBeGreaterThanOrEqual(3);
    expect(s.byId["P1"].stock.faceDown.length).toBe(1);

    // Find the specific hand cards by rank
    const hand = s.byId["P1"].hand.cards;
    const c1 = hand.find((c) => c.kind === "standard" && c.rank === 1)!;
    const c2 = hand.find((c) => c.kind === "standard" && c.rank === 2)!;
    const ck = hand.find((c) => c.kind === "standard" && c.rank === 13)!; // King (wild)

    // Play 1 -> B1
    r = applyMove(s, {
      kind: "PLAY_HAND_TO_BUILD",
      cardId: c1.id,
      buildId: "B1",
    });
    s = r.state;
    expect(s.center.buildPiles.find((b) => b.id === "B1")?.nextRank).toBe(2);

    // Play 2 -> B1
    r = applyMove(s, {
      kind: "PLAY_HAND_TO_BUILD",
      cardId: c2.id,
      buildId: "B1",
    });
    s = r.state;
    expect(s.center.buildPiles.find((b) => b.id === "B1")?.nextRank).toBe(3);

    // Play King (wild) -> B1 (should count as required rank=3)
    r = applyMove(s, {
      kind: "PLAY_HAND_TO_BUILD",
      cardId: ck.id,
      buildId: "B1",
    });
    s = r.state;
    expect(s.center.buildPiles.find((b) => b.id === "B1")?.nextRank).toBe(4);

    // Now play from STOCK: P1 stock top is rank 4; should match nextRank=4
    r = applyMove(s, { kind: "PLAY_STOCK_TO_BUILD", buildId: "B1" });
    s = r.state;
    expect(s.center.buildPiles.find((b) => b.id === "B1")?.nextRank).toBe(5);

    // Pile should have 4 cards placed so far (1,2,K,4). We store top at index 0.
    const b1 = s.center.buildPiles.find((b) => b.id === "B1")!;
    expect(b1.cards.length).toBe(4);

    // Stock should now be empty for P1
    expect(s.byId["P1"].stock.faceDown.length).toBe(0);

    // Game over should trigger immediately when P1's stock becomes empty
    expect(s.phase).toBe("gameover");
    expect(s.winner).toBe("P1");

    // Also assert the event was emitted
    expect(r.events.some((e) => e.type === "GameOver")).toBe(true);
  });
});
