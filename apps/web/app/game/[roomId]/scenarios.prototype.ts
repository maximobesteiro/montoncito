// THROWAWAY visual fixtures, not replayed or guaranteed reachable game states.
import type { Card, Rank } from "@mont/core-game";
import { denseBoardState } from "./dense-board.fixture";

export const layoutScenarios = {
  normal: { name: "Habitual", hand: 5, builds: 3, discards: 3, players: 2 },
  partial: {
    name: "Mano de 2 cartas",
    hand: 2,
    builds: 3,
    discards: 3,
    players: 2,
  },
  single: {
    name: "Última carta en mano",
    hand: 1,
    builds: 3,
    discards: 3,
    players: 2,
  },
  empty: {
    name: "Mano vacía, sin robo",
    hand: 0,
    builds: 3,
    discards: 3,
    players: 2,
  },
  start: {
    name: "Sin Build piles",
    hand: 5,
    builds: 0,
    discards: 3,
    players: 2,
  },
  builds: {
    name: "6 Build piles",
    hand: 5,
    builds: 6,
    discards: 3,
    players: 2,
  },
  discards: {
    name: "4 descartes",
    hand: 5,
    builds: 3,
    discards: 4,
    players: 2,
  },
  players: { name: "4 jugadores", hand: 5, builds: 3, discards: 3, players: 4 },
  combined: {
    name: "Combinado: 6 builds, 4 descartes y jugadores",
    hand: 2,
    builds: 6,
    discards: 4,
    players: 4,
  },
  dense: {
    name: "Estrés: 18 Build piles",
    hand: 5,
    builds: 18,
    discards: 4,
    players: 4,
  },
} as const;

export type LayoutScenario = keyof typeof layoutScenarios;

export function parseLayoutScenario(value: string | null): LayoutScenario {
  return value && Object.hasOwn(layoutScenarios, value)
    ? (value as LayoutScenario)
    : "normal";
}

export function layoutScenarioState(scenario: LayoutScenario, myTurn: boolean) {
  const config = layoutScenarios[scenario];
  const fixture = denseBoardState(config.discards);
  fixture.players = fixture.players.slice(0, config.players);
  fixture.byId["player-1"]!.name = "Vos";
  const hand: Card[] = [
    { kind: "standard", id: "demo-ace", rank: 1, suit: "Diamonds" },
    { kind: "standard", id: "demo-eight", rank: 8, suit: "Clubs" },
    { kind: "standard", id: "demo-king", rank: 13, suit: "Hearts" },
    { kind: "standard", id: "demo-jack", rank: 11, suit: "Spades" },
    { kind: "joker", id: "demo-joker" },
  ];
  fixture.byId["player-1"]!.hand.cards = hand.slice(0, config.hand);
  fixture.turn.number = 17;
  fixture.turn.activePlayer = myTurn ? "player-1" : "player-2";
  fixture.center.buildPiles = Array.from(
    { length: config.builds },
    (_, index) => {
      const top = [2, 7, 10, 4, 11, 1][index % 6]!;
      return {
        id: `build-${index + 1}`,
        nextRank: (top + 1) as Rank,
        cards: Array.from(
          { length: top },
          (_, depth): Card => ({
            kind: "standard",
            id: `scenario-build-${index}-${depth}`,
            rank: (depth + 1) as Rank,
            suit: "Clubs",
          }),
        ),
      };
    },
  );
  if (scenario === "start") {
    fixture.players.forEach((id) => {
      fixture.byId[id]!.discards = Array.from(
        { length: config.discards },
        () => [],
      );
    });
  }
  if (scenario === "empty") {
    fixture.deck.drawPile = [];
    fixture.deck.recyclePile = [];
  }
  return fixture;
}
