import type { Card, GameState, Rank, Suit } from "@mont/core-game";

function createCard(
  id: string,
  rank: Rank,
  suit: Suit,
  baseWild?: boolean
): Card {
  return { kind: "standard", id, rank, suit, baseWild };
}

function createJoker(id: string): Card {
  return { kind: "joker", id };
}

export function createMockGameState(): GameState {
  // Create a realistic deck with cards
  const suits: Suit[] = ["Clubs", "Diamonds", "Hearts", "Spades"];
  const allCards: Card[] = [];

  // Add standard cards (1-12, 4 suits each)
  for (let rank = 1; rank <= 12; rank++) {
    for (const suit of suits) {
      allCards.push(createCard(`card-${rank}-${suit}`, rank as Rank, suit));
    }
  }

  // Add some jokers
  allCards.push(createJoker("joker-1"));
  allCards.push(createJoker("joker-2"));

  // Create player hands
  const player1Hand: Card[] = [
    createCard("p1-hand-1", 3, "Hearts"),
    createCard("p1-hand-2", 5, "Clubs"),
    createCard("p1-hand-3", 1, "Spades"),
    createCard("p1-hand-4", 12, "Diamonds"),
    createCard("p1-hand-5", 9, "Hearts"),
  ];

  const player2Hand: Card[] = [
    createCard("p2-hand-1", 7, "Clubs"),
    createCard("p2-hand-2", 2, "Spades"),
    createCard("p2-hand-3", 8, "Diamonds"),
    createCard("p2-hand-4", 4, "Hearts"),
    createCard("p2-hand-5", 11, "Clubs"),
  ];

  // Create stock piles (top card is last element)
  const player1Stock: Card[] = [
    createCard("p1-stock-1", 6, "Spades"),
    createCard("p1-stock-2", 2, "Hearts"),
    createCard("p1-stock-3", 10, "Clubs"),
    ...Array.from({ length: 17 }, (_, i) =>
      createCard(`p1-stock-${i + 4}`, ((i % 12) + 1) as Rank, suits[i % 4])
    ),
  ];

  const player2Stock: Card[] = [
    createCard("p2-stock-1", 4, "Diamonds"),
    createCard("p2-stock-2", 8, "Spades"),
    createCard("p2-stock-3", 1, "Clubs"),
    ...Array.from({ length: 17 }, (_, i) =>
      createCard(`p2-stock-${i + 4}`, ((i % 12) + 1) as Rank, suits[i % 4])
    ),
  ];

  // Create discard piles
  const player1Discards: Card[][] = [
    [createCard("p1-discard-1-1", 7, "Diamonds")],
    [createCard("p1-discard-2-1", 11, "Spades")],
    [],
    [],
  ];

  const player2Discards: Card[][] = [
    [createCard("p2-discard-1-1", 3, "Clubs")],
    [],
    [createCard("p2-discard-3-1", 9, "Hearts")],
    [],
  ];

  // Create build piles with some progress
  const buildPiles = [
    {
      id: "B1",
      cards: [
        createCard("build-1-1", 1, "Clubs"),
        createCard("build-1-2", 2, "Diamonds"),
        createCard("build-1-3", 3, "Hearts"),
      ],
      nextRank: 4 as Rank,
    },
    {
      id: "B2",
      cards: [
        createCard("build-2-1", 1, "Spades"),
        createCard("build-2-2", 2, "Clubs"),
      ],
      nextRank: 3 as Rank,
    },
    {
      id: "B3",
      cards: [],
      nextRank: 1 as Rank,
    },
    {
      id: "B4",
      cards: [
        createCard("build-4-1", 1, "Hearts"),
        createCard("build-4-2", 2, "Spades"),
        createCard("build-4-3", 3, "Diamonds"),
        createCard("build-4-4", 4, "Clubs"),
        createCard("build-4-5", 5, "Hearts"),
      ],
      nextRank: 6 as Rank,
    },
  ];

  return {
    version: 1,
    id: "mock-game-1",
    phase: "turn",
    turn: {
      number: 3,
      activePlayer: "P1",
      hasDiscarded: false,
    },
    players: ["P1", "P2"],
    byId: {
      P1: {
        id: "P1",
        name: "Player One",
        hand: { cards: player1Hand },
        discards: player1Discards,
        stock: { faceDown: player1Stock },
      },
      P2: {
        id: "P2",
        name: "Player Two",
        hand: { cards: player2Hand },
        discards: player2Discards,
        stock: { faceDown: player2Stock },
      },
    },
    deck: {
      drawPile: allCards.filter(
        (c) =>
          !player1Hand.includes(c) &&
          !player2Hand.includes(c) &&
          !player1Stock.includes(c) &&
          !player2Stock.includes(c) &&
          !buildPiles.some((bp) => bp.cards.includes(c)) &&
          !player1Discards.flat().includes(c) &&
          !player2Discards.flat().includes(c)
      ),
      discard: [],
    },
    center: { buildPiles },
    winner: null,
    rngSeed: 123456789,
    rules: {
      handSize: 5,
      stockSize: 20,
      buildPiles: 4,
      maxBuildRank: 13,
      discardPiles: 4,
      useJokers: true,
      jokersAreWild: true,
      kingsAreWild: false,
      additionalWildRanks: [],
      enableCardWildFlag: true,
      autoClearCompleteBuild: true,
    },
    data: {},
  };
}


