import {
  createStartedGame,
  type Card,
  type GameState,
  type Rank,
} from "@mont/core-game";

export function denseBoardState(discardPiles: 1 | 2 | 3 | 4): GameState {
  const state = createStartedGame({
    players: ["player-1", "player-2", "player-3", "player-4"],
    seed: 62,
    discardPiles,
  });
  const card = (id: string, rank: Rank): Card => ({
    kind: "standard",
    id,
    rank,
    suit: "Clubs",
  });
  state.turn.activePlayer = "player-1";
  state.players.forEach((id, index) => {
    const player = state.byId[id]!;
    player.name = ["Alice", "Bob", "Carol", "Dave"][index]!;
    player.stock.faceDown = [
      card(`${id}-stock-covered`, 8),
      card(`${id}-stock-top`, 3),
    ];
    player.hand.cards = ([1, 2, 3, 4, 5] as const).map((rank) =>
      card(`${id}-hand-${rank}`, rank),
    );
    player.discards = Array.from({ length: discardPiles }, (_, pile) =>
      ([6, 7, 8, 9, 3] as const).map((rank, depth) =>
        card(`${id}-discard-${pile}-${depth}`, rank),
      ),
    );
  });
  state.center.buildPiles = Array.from({ length: 18 }, (_, index) => ({
    id: `build-${index + 1}`,
    nextRank: 3,
    cards: [card(`build-${index}-ace`, 1), card(`build-${index}-two`, 2)],
  }));
  return state;
}
