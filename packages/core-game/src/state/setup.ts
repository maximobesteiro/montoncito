import { createInitialState } from "./initial";
import { Card, GameState, PlayerId, Rank, RulesConfig, Suit } from "./types";
import { nextRandom, shuffleWithRngState } from "../utils/random";

const suits: Suit[] = ["Clubs", "Diamonds", "Hearts", "Spades"];

function createCardPack(playerId: PlayerId): Card[] {
  const standardCards: Card[] = suits.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => ({
      kind: "standard" as const,
      id: `${playerId}-${suit}-${index + 1}`,
      rank: (index + 1) as Rank,
      suit,
    })),
  );

  return standardCards.concat(
    { kind: "joker", id: `${playerId}-Joker-1` },
    { kind: "joker", id: `${playerId}-Joker-2` },
  );
}

export type StartedGameOptions = {
  players: PlayerId[];
  seed: number;
  id?: string;
  discardPiles?: number;
};

/** Create the deterministic, fully-dealt state stored when a Game room starts. */
export function createStartedGame(options: StartedGameOptions): GameState {
  if (options.players.length < 2 || options.players.length > 4) {
    throw new Error("Game requires between two and four players");
  }
  if (new Set(options.players).size !== options.players.length) {
    throw new Error("Game players must have unique IDs");
  }

  const discardPiles = options.discardPiles ?? 3;
  if (!Number.isInteger(discardPiles) || discardPiles < 1 || discardPiles > 4) {
    throw new Error("Discard piles must be between one and four");
  }

  const initial = createInitialState(
    options.players.map((id) => ({ id })),
    [],
    {
      id: options.id,
      seed: options.seed,
      handSize: 5,
      stockSize: 20,
      discardPiles,
    } satisfies Partial<RulesConfig> & { seed?: number; id?: string },
  );

  const selected = nextRandom(initial.rng);
  const activePlayer = options.players[
    Math.floor(selected.value * options.players.length)
  ]!;
  const shuffled = shuffleWithRngState(
    options.players.flatMap(createCardPack),
    selected.rng,
  );
  const byId = { ...initial.byId };
  let cardIndex = 0;

  for (let cardNumber = 0; cardNumber < initial.rules.stockSize; cardNumber += 1) {
    for (const playerId of options.players) {
      const card = shuffled.cards[cardIndex++];
      if (card) {
        byId[playerId] = {
          ...byId[playerId]!,
          stock: { faceDown: [...byId[playerId]!.stock.faceDown, card] },
        };
      }
    }
  }

  for (let cardNumber = 0; cardNumber < initial.rules.handSize; cardNumber += 1) {
    for (const playerId of options.players) {
      const card = shuffled.cards[cardIndex++];
      if (card) {
        byId[playerId] = {
          ...byId[playerId]!,
          hand: { cards: [...byId[playerId]!.hand.cards, card] },
        };
      }
    }
  }

  return {
    ...initial,
    phase: "turn",
    turn: { number: 1, activePlayer, hasDiscarded: false },
    byId,
    deck: { drawPile: shuffled.cards.slice(cardIndex), recyclePile: [] },
    rng: shuffled.rng,
  };
}
