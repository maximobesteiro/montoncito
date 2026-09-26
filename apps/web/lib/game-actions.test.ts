import { describe, expect, it } from "vitest";
import { createInitialState, applyMove, type Card } from "@mont/core-game";
import { getValidMoves } from "./game-actions";

describe("available moves", () => {
  it("offers wild Build pile plays but only ordinary Hand discards", () => {
    const deck: Card[] = [
      { kind: "standard", id: "stock-1", rank: 8, suit: "Hearts" },
      { kind: "standard", id: "stock-2", rank: 9, suit: "Hearts" },
      { kind: "standard", id: "king", rank: 13, suit: "Hearts" },
      { kind: "joker", id: "joker" },
      { kind: "standard", id: "ordinary", rank: 7, suit: "Hearts" },
    ];
    const state = applyMove(
      createInitialState([{ id: "P1" }, { id: "P2" }], deck, {
        id: "available-moves",
        seed: 1,
        stockSize: 1,
        handSize: 3,
      }),
      { kind: "START_GAME" },
    ).state;

    const moves = getValidMoves(state, "P1");
    expect(moves.handToBuild).toEqual([
      { cardId: "king", buildId: "new" },
      { cardId: "joker", buildId: "new" },
    ]);
    expect(moves.canDiscard).toEqual(
      [0, 1, 2].map((pileIndex) => ({ cardId: "ordinary", pileIndex })),
    );
  });
});
