import { describe, expect, it } from "vitest";
import {
  applyMove,
  createInitialState,
  createStartedGame,
  topBuildCard,
  type Card,
  type GameState,
  type Move,
  type Rank,
} from "../src";

// Project behavior, not serialized pile orientation. Do not use the new pile
// operations here: these vectors were captured from the version-1 engine.
function behavior(state: GameState) {
  return {
    order: state.players,
    turn: state.turn,
    phase: state.phase,
    winner: state.winner ?? null,
    rng: state.rng,
    players: state.players.map((id) => {
      const player = state.byId[id]!;
      return {
        id,
        hand: player.hand.cards.map((card) => card.id).sort(),
        stock: [
          player.stock.faceDown.length,
          player.stock.faceDown.at(-1)?.id ?? null,
        ],
        discards: player.discards.map((pile) => [
          pile.length,
          pile.at(-1)?.id ?? null,
        ]),
      };
    }),
    builds: state.center.buildPiles.map((pile) => ({
      id: pile.id,
      count: pile.cards.length,
      top: topBuildCard(pile)?.id ?? null,
      nextRank: pile.nextRank,
    })),
    drawCount: state.deck.drawPile.length,
    recycleCount: state.deck.recyclePile.length,
  };
}

function recorder(initial: GameState) {
  let state = initial;
  const trace = [JSON.stringify({ initial: behavior(state) })];
  function step(move: Move) {
    const before = state;
    const result = applyMove(before, move);
    expect(result.accepted, JSON.stringify(move)).toBe(true);
    state = result.state;
    const draws = state.players.flatMap((id) => {
      const held = new Set(before.byId[id]!.hand.cards.map((card) => card.id));
      const cards = state.byId[id]!.hand.cards.filter(
        (card) => !held.has(card.id),
      ).map((card) => card.id);
      return cards.length ? [{ player: id, cards }] : [];
    });
    trace.push(
      JSON.stringify({
        move,
        accepted: result.accepted,
        events: result.events,
        draws,
        state: behavior(state),
      }),
    );
    return result;
  }
  return { step, trace, state: () => state };
}

const standard = (id: string, rank: Rank): Card => ({
  kind: "standard",
  id,
  rank,
  suit: "Hearts",
});

describe("pre-normalization gameplay golden vectors", () => {
  it.each([
    {
      count: 2,
      discardPiles: 1,
      seed: 7,
      discards: ["P2-Hearts-11", "P2-Hearts-10", "P2-Hearts-2", "P1-Spades-2"],
    },
    {
      count: 3,
      discardPiles: 2,
      seed: 42,
      discards: [
        "P3-Spades-4",
        "P3-Clubs-9",
        "P3-Hearts-12",
        "P3-Diamonds-5",
        "P2-Hearts-2",
        "P3-Diamonds-2",
      ],
    },
    {
      count: 4,
      discardPiles: 3,
      seed: 11,
      discards: [
        "P2-Spades-11",
        "P1-Clubs-1",
        "P1-Spades-8",
        "P4-Hearts-7",
        "P1-Clubs-9",
        "P2-Spades-5",
        "P3-Diamonds-2",
        "P4-Hearts-5",
      ],
    },
    {
      count: 2,
      discardPiles: 4,
      seed: 2026,
      discards: ["P1-Spades-11", "P2-Diamonds-7", "P1-Clubs-8", "P2-Hearts-10"],
    },
  ])(
    "preserves setup and later deals for $count players, $discardPiles Discard piles, seed $seed",
    ({ count, discardPiles, seed, discards }) => {
      const replay = recorder(
        createStartedGame({
          players: Array.from({ length: count }, (_, index) => `P${index + 1}`),
          seed,
          discardPiles,
          id: "golden",
        }),
      );
      // Fixed pre-change Actions keep replay independent of Hand array ordering.
      discards.forEach((cardId, index) => {
        replay.step({
          kind: "DISCARD_FROM_HAND",
          cardId,
          pileIndex: index % discardPiles,
        });
      });
      expect(replay.trace.join("\n")).toMatchSnapshot();
    },
  );

  it("preserves a completed Build, Draw exhaustion, and every draw from its Recycle reshuffle", () => {
    const replay = recorder(
      createInitialState(
        [{ id: "P1" }, { id: "P2" }],
        [
          standard("stock-bottom-1", 9),
          standard("stock-bottom-2", 8),
          standard("starter", 1),
          standard("stock-top-2", 7),
          ...Array.from({ length: 11 }, (_, index) =>
            index === 3
              ? standard("king", 13)
              : index === 8
                ? { kind: "joker" as const, id: "joker" }
                : standard(`rank-${index + 2}`, (index + 2) as Rank),
          ),
          standard("held", 7),
          standard("last-draw", 8),
        ],
        {
          id: "recycle-golden",
          seed: 42,
          stockSize: 2,
          handSize: 2,
          discardPiles: 3,
        },
      ),
    );
    replay.step({ kind: "START_GAME" });
    replay.step({ kind: "PLAY_STOCK_TO_BUILD", target: "new" });
    for (const cardId of [
      "rank-2",
      "rank-3",
      "rank-4",
      "king",
      "rank-6",
      "rank-7",
      "rank-8",
      "rank-9",
      "joker",
      "rank-11",
      "rank-12",
    ]) {
      replay.step({ kind: "PLAY_HAND_TO_BUILD", cardId, target: "B1" });
    }
    expect(replay.state().center.buildPiles).toEqual([]);
    expect(replay.state().deck.recyclePile).toHaveLength(12);
    expect(replay.state().deck.drawPile).toHaveLength(1);
    const reshuffle = replay.step({
      kind: "DISCARD_FROM_HAND",
      cardId: "held",
      pileIndex: 0,
    });
    expect(reshuffle.state.deck.recyclePile).toEqual([]);
    expect(reshuffle.state.rng.cursor).toBe(11);
    // Frozen Actions from the pre-change run consume the complete shuffled stream.
    replay.step({
      kind: "DISCARD_FROM_HAND",
      cardId: "last-draw",
      pileIndex: 1,
    });
    replay.step({ kind: "DISCARD_FROM_HAND", cardId: "rank-12", pileIndex: 1 });
    replay.step({ kind: "PLAY_HAND_TO_BUILD", cardId: "joker", target: "new" });
    for (const cardId of [
      "rank-2",
      "rank-7",
      "starter",
      "rank-3",
      "rank-9",
      "rank-11",
      "rank-6",
    ]) {
      replay.step({ kind: "DISCARD_FROM_HAND", cardId, pileIndex: 1 });
    }
    expect(replay.state().deck.drawPile).toEqual([]);
    expect(replay.state().rng).toEqual({
      algorithm: "mulberry32-v1",
      seed: 42,
      cursor: 11,
    });
    expect(replay.trace.join("\n")).toMatchSnapshot();
  });
});
