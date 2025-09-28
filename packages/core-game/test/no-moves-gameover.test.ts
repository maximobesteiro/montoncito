import { describe, it, expect } from "vitest";
import { applyMove, createInitialState, Card, RulesConfig } from "../src";

// Helper to build standard cards quickly
function mkStd(id: string, rank: number): Card {
  return { kind: "standard", id, rank: rank as any, suit: "Hearts" };
}

describe("game over when deck is empty and no placements are available", () => {
  it("declares winner by fewest stock cards; tie breaks by turn order", () => {
    const rules: Partial<RulesConfig> = {
      handSize: 2,
      stockSize: 2,
      buildPiles: 2,
      discardPiles: 3,
      maxBuildRank: 13,
      kingsAreWild: false, // keep it simple: no wilds so we can control "no moves"
      useJokers: false,
      autoClearCompleteBuild: true,
    };

    // We want:
    // - Deck to run out quickly (after dealing stock + initial draws), and
    // - No player can place onto B1/B2 (both require rank 1 at start).
    //
    // Construction:
    // - First 4 cards → two stock cards per player (round-robin).
    // - Next few cards → draws for P1 to fill hand (ranks that are NOT 1).
    // - No rank 1 anywhere; no jokers; no kings-as-wild.
    // - Deck should end up empty after the first draw by P1.
    const deck: Card[] = [
      // stock (round-robin): P1,S7 ; P2,S8 ; P1,S9 ; P2,S10
      mkStd("S7", 7),
      mkStd("S8", 8),
      mkStd("S9", 9),
      mkStd("S10", 10),
      // cards for drawing (P1 draws up to handSize=2 at START_GAME):
      mkStd("H5", 5),
      mkStd("H6", 6),
      // no more cards => draw pile will be empty
    ];

    const players = [{ id: "P1" }, { id: "P2" }];

    // Create and start the game
    let s = createInitialState(players, deck, { ...rules, seed: 1 });
    let r = applyMove(s, { kind: "START_GAME" });
    s = r.state;

    // After START_GAME:
    // - Stocks dealt (each player has 2 stock cards)
    // - P1 draws to hand (2 cards), exhausts draw pile
    expect(s.deck.drawPile.length).toBe(0);

    // No rank 1 in any hand/stock/discards; no wilds → nobody can play.
    // checkGameOver should detect deck empty + no placements and pick winner by fewest stock.
    //
    // Currently both players have equal stock (2). Tie-breaker is turn order:
    // P1 appears first, so P1 should win.
    //
    // We trigger the check by attempting any move; DRAW_TO_HAND will be invalid (hand full),
    // but the engine calls checkGameOver after each apply.
    r = applyMove(s, { kind: "DRAW_TO_HAND" });
    s = r.state;

    expect(s.phase).toBe("gameover");
    expect(s.winner).toBe("P1"); // tie-breaker by order
  });
});
