import { describe, expect, it } from "vitest";
import { applyMove, createStartedGame } from "../src";

describe("createStartedGame", () => {
  it("creates a playable game with a complete card pack per player", () => {
    const state = createStartedGame({
      players: ["P1", "P2"],
      seed: 42,
      id: "game-1",
    });

    expect(state.phase).toBe("turn");
    expect(state.rulesetVersion).toBe(1);
    expect(state.turn.number).toBe(1);
    expect(state.players).toEqual(["P1", "P2"]);
    expect(state.players).toContain(state.turn.activePlayer);
    expect(state.rules).toEqual({
      handSize: 5,
      stockSize: 20,
      discardPiles: 3,
    });
    expect(state.rng).toMatchObject({ algorithm: "mulberry32-v1", seed: 42 });
    expect(state.rng.cursor).toBeGreaterThan(0);

    for (const playerId of state.players) {
      expect(state.byId[playerId]?.stock.faceDown).toHaveLength(20);
      expect(state.byId[playerId]?.hand.cards).toHaveLength(5);
      expect(state.byId[playerId]?.discards).toHaveLength(3);
    }

    const dealtCards = state.players.flatMap((playerId) => [
      ...state.byId[playerId]!.stock.faceDown,
      ...state.byId[playerId]!.hand.cards,
    ]);
    expect(dealtCards).toHaveLength(50);
    expect(new Set(dealtCards.map((card) => card.id)).size).toBe(50);
    expect(state.deck.drawPile).toHaveLength(58);
    expect(state.deck.recyclePile).toEqual([]);

    const completePack = [...dealtCards, ...state.deck.drawPile];
    expect(completePack.every((card) => !("baseWild" in card))).toBe(true);
    expect(completePack.filter((card) => card.kind === "standard")).toHaveLength(
      104,
    );
    expect(completePack.filter((card) => card.kind === "joker")).toHaveLength(4);
    for (const playerId of state.players) {
      expect(
        completePack.filter((card) => card.id.startsWith(`${playerId}-`)),
      ).toHaveLength(54);
    }
  });

  it("plays Kings and Jokers from either Card pack as wild throughout a match", () => {
    const started = createStartedGame({
      players: ["P1", "P2"],
      seed: 42,
      discardPiles: 1,
    });
    const active = started.turn.activePlayer;
    const cards = [
      ...started.deck.drawPile,
      ...started.players.flatMap((id) => [
        ...started.byId[id]!.hand.cards,
        ...started.byId[id]!.stock.faceDown,
      ]),
    ];
    const wildCards = cards.filter(
      (card) => card.kind === "joker" || (card.kind === "standard" && card.rank === 13),
    );
    let state = {
      ...started,
      byId: {
        ...started.byId,
        [active]: { ...started.byId[active]!, hand: { cards: wildCards } },
      },
    };

    expect(state.byId[active]!.discards).toHaveLength(1);
    expect(wildCards).toHaveLength(12);
    for (const card of wildCards) {
      const result = applyMove(state, {
        kind: "PLAY_HAND_TO_BUILD",
        cardId: card.id,
        target: "new",
      });
      expect(result.accepted, card.id).toBe(true);
      state = result.state;
      expect(state.rulesetVersion).toBe(1);
      expect(state.center.buildPiles.at(-1)?.nextRank).toBe(2);
    }
  });

  it("returns the same complete state for a known seed", () => {
    const first = createStartedGame({
      players: ["P1", "P2"],
      seed: 7,
      id: "game-7",
    });
    const second = createStartedGame({
      players: ["P1", "P2"],
      seed: 7,
      id: "game-7",
    });

    expect(first).toEqual(second);
    expect({
      activePlayer: first.turn.activePlayer,
      cursor: first.rng.cursor,
      stockP1: first.byId.P1?.stock.faceDown.map((card) => card.id),
      handP1: first.byId.P1?.hand.cards.map((card) => card.id),
      drawStart: first.deck.drawPile.slice(0, 5).map((card) => card.id),
    }).toEqual({
      activePlayer: "P1",
      cursor: 108,
      stockP1: [
        "P2-Diamonds-3",
        "P2-Diamonds-4",
        "P1-Clubs-4",
        "P2-Diamonds-1",
        "P2-Diamonds-10",
        "P2-Hearts-1",
        "P1-Clubs-9",
        "P1-Hearts-3",
        "P2-Hearts-3",
        "P2-Spades-7",
        "P1-Spades-13",
        "P1-Spades-9",
        "P2-Hearts-5",
        "P2-Clubs-4",
        "P1-Hearts-11",
        "P2-Spades-5",
        "P2-Clubs-10",
        "P2-Hearts-8",
        "P1-Diamonds-9",
        "P1-Hearts-12",
      ],
      handP1: [
        "P2-Hearts-11",
        "P2-Clubs-13",
        "P2-Hearts-2",
        "P2-Spades-6",
        "P1-Hearts-8",
      ],
      drawStart: [
        "P1-Joker-2",
        "P1-Hearts-7",
        "P1-Clubs-11",
        "P1-Diamonds-5",
        "P2-Clubs-12",
      ],
    });
  });

  it("rejects unsupported player counts and discard pile counts", () => {
    expect(() => createStartedGame({ players: ["P1"], seed: 1 })).toThrow(
      "Game requires between two and four players",
    );
    expect(() =>
      createStartedGame({ players: ["P1", "P2"], seed: 1, discardPiles: 5 }),
    ).toThrow("Discard piles must be between one and four");
  });

  it("supports the four-player limit", () => {
    const state = createStartedGame({
      players: ["P1", "P2", "P3", "P4"],
      seed: 11,
    });

    expect(state.players).toHaveLength(4);
    for (const playerId of state.players) {
      expect(state.byId[playerId]?.stock.faceDown).toHaveLength(20);
      expect(state.byId[playerId]?.hand.cards).toHaveLength(5);
    }
    expect(state.deck.drawPile).toHaveLength(116);
  });
});
