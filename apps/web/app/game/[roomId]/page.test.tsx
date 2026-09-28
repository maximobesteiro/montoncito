// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStartedGame, type GameState } from "@mont/core-game";

const gameRoom = vi.hoisted(() => ({
  view: {} as Record<string, unknown>,
  roomId: "room-1",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: gameRoom.roomId }),
}));
vi.mock("@/lib/use-game-room", () => ({ useGameRoom: () => gameRoom.view }));

import GameRoomPage from "./page";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.sessionStorage.clear();
  gameRoom.roomId = "room-1";
});
afterEach(cleanup);

function showGameRoom(liveChatCount = 0) {
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    sendChat: vi.fn(),
    chatMessages: [],
    liveChatCount,
  };
}

function boardState(): GameState {
  const state = createStartedGame({
    players: ["player-1", "player-2"],
    seed: 1,
  });
  state.turn.activePlayer = "player-1";
  state.rules.discardPiles = 2;
  state.byId["player-1"]!.name = "Alice";
  state.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "ace", rank: 1, suit: "Hearts" },
    { kind: "standard", id: "two", rank: 2, suit: "Clubs" },
    { kind: "standard", id: "nine", rank: 9, suit: "Spades" },
    { kind: "standard", id: "king", rank: 13, suit: "Diamonds" },
    { kind: "joker", id: "joker" },
  ];
  state.byId["player-1"]!.discards = [[], []];
  state.byId["player-2"]!.name = "Bob";
  state.byId["player-2"]!.hand.cards = [
    { kind: "standard", id: "secret", rank: 8, suit: "Hearts" },
  ];
  state.byId["player-2"]!.discards = [[], []];
  state.center.buildPiles = [
    {
      id: "build-1",
      nextRank: 2,
      cards: [{ kind: "standard", id: "built-ace", rank: 1, suit: "Spades" }],
    },
  ];
  return state;
}

it("plays a legal Hand card to Build on server update", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  expect(screen.queryByText("Available moves")).toBeNull();
  expect(screen.getByText("Active: Alice (Your Turn)")).toBeTruthy();
  expect(screen.getAllByText("Stock (20)")).toHaveLength(2);
  expect(screen.getAllByText("Discard 2")).toHaveLength(2);
  expect(screen.getByText("Bob")).toBeTruthy();
  expect(screen.queryByText("8 of Hearts")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  const newBuildPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newBuildPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  });
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();

  gameRoom.view = {
    ...gameRoom.view,
    pendingAction: {
      actionId: "pending",
      action: { kind: "PLAY_HAND_TO_BUILD" },
    },
  };
  rerender(<GameRoomPage />);
  expect(screen.getByRole("status").textContent).toContain("Action pending");
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Build pile build-1/ }),
  ).toBeNull();

  const accepted = structuredClone(state);
  const hand = accepted.byId["player-1"]!.hand;
  hand.cards = hand.cards.filter((c) => c.id !== "two");
  accepted.center.buildPiles[0]!.cards.unshift({
    kind: "standard",
    id: "two",
    rank: 2,
    suit: "Clubs",
  });
  accepted.center.buildPiles[0]!.nextRank = 3;
  gameRoom.view = {
    ...gameRoom.view,
    state: accepted,
    seq: 1,
    pendingAction: null,
  };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "Hand 2 of Clubs" })).toBeNull();
  expect(screen.getByText("build-1 → 3")).toBeTruthy();
});

it("discards a non-wild Hand card and follows the next Turn", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[1] = [
    { kind: "standard", id: "old", rank: 7, suit: "Clubs" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  expect(
    screen.getByRole("button", { name: "Discard pile 1, empty" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Discard Hand to pile 2, over 7 of Clubs",
    }),
  ).toBeTruthy();
  const buildPile = screen.getByRole("button", { name: /Build pile build-1/ });
  expect(buildPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Discard Hand to pile 2, over 7 of Clubs",
    }),
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 1,
  });
  expect(screen.getByLabelText("Hand 9 of Spades")).toBeTruthy();

  const accepted = structuredClone(state);
  const hand = accepted.byId["player-1"]!.hand;
  hand.cards = hand.cards.filter((c) => c.id !== "nine");
  accepted.byId["player-1"]!.discards[1]!.push({
    kind: "standard",
    id: "nine",
    rank: 9,
    suit: "Spades",
  });
  accepted.turn.activePlayer = "player-2";
  accepted.turn.number = 2;
  gameRoom.view = { ...gameRoom.view, state: accepted, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Active: Bob")).toBeTruthy();
  expect(screen.queryByLabelText("Hand 9 of Spades")).toBeNull();
  expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
});

it("plays a wild Hand card to a new Build pile without Discard targets", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);

  fireEvent.click(
    screen.getByRole("button", { name: "Hand King of Diamonds" }),
  );
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
  const newBuildPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newBuildPile.hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "king",
    target: "new",
  });
});

it("selects the legal Stock top, switches sources, and follows accepted Stock progress", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "covered-stock", rank: 7, suit: "Clubs" },
    { kind: "standard", id: "stock-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  const stock = screen.getByRole("button", { name: "Stock top 2 of Hearts" });
  fireEvent.click(stock);
  expect(stock.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  fireEvent.click(stock);
  expect(stock.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Hearts" }));
  fireEvent.click(stock);
  expect(
    screen
      .getByRole("button", { name: "Hand Ace of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_STOCK_TO_BUILD",
    target: "build-1",
  });

  const accepted = structuredClone(state);
  accepted.byId["player-1"]!.stock.faceDown.pop();
  accepted.center.buildPiles[0]!.nextRank = 3;
  gameRoom.view = { ...gameRoom.view, state: accepted, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Stock (1)")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Stock top 7 of Clubs" }),
  ).toBeNull();
  expect(screen.getByText("build-1 → 3")).toBeTruthy();
});

it("plays only the top of an own Discard pile and clears selection on Build completion", () => {
  showGameRoom();
  const state = boardState();
  state.center.buildPiles[0]!.nextRank = 12;
  state.byId["player-1"]!.discards = [
    [
      { kind: "standard", id: "covered-ace", rank: 1, suit: "Hearts" },
      { kind: "standard", id: "queen", rank: 12, suit: "Spades" },
    ],
    [{ kind: "joker", id: "discard-joker" }],
  ];
  state.byId["player-2"]!.discards = [
    [{ kind: "standard", id: "opponent-ace", rank: 1, suit: "Clubs" }],
    [],
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  expect(
    screen.queryByRole("button", { name: "Discard pile 1, Ace of Hearts" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Discard pile 1, Ace of Clubs" }),
  ).toBeNull();
  const queen = screen.getByRole("button", {
    name: "Discard pile 1, Queen of Spades",
  });
  fireEvent.click(queen);
  expect(queen.getAttribute("aria-pressed")).toBe("true");
  const newPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(newPile);
  expect(submitAction).not.toHaveBeenCalled();
  expect(queen.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "build-1",
  });

  const accepted = structuredClone(state);
  accepted.byId["player-1"]!.discards[0]!.pop();
  accepted.center.buildPiles = [];
  accepted.deck.recyclePile.push({
    kind: "standard",
    id: "queen",
    rank: 12,
    suit: "Spades",
  });
  gameRoom.view = { ...gameRoom.view, state: accepted, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Recycle pile: 1 cards")).toBeTruthy();
  expect(screen.queryByText("build-1 → 12")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, Ace of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("starts a new Build pile from a wild Discard top without rank selection", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "joker", id: "discard-joker" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, Joker" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "new",
  });
});

it("does not select blocked Stock, covered Discard cards, or opponent cards", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "blocked", rank: 8, suit: "Spades" },
  ];
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "covered-ace", rank: 1, suit: "Hearts" },
    { kind: "standard", id: "blocked-discard", rank: 8, suit: "Clubs" },
  ];
  state.byId["player-2"]!.discards[0] = [
    { kind: "standard", id: "opponent-two", rank: 2, suit: "Diamonds" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: /Stock top/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Hand 2 of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("offers new Build destinations to an Ace Stock top and a King Discard top", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "stock-ace", rank: 1, suit: "Clubs" },
  ];
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "discard-king", rank: 13, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);

  fireEvent.click(
    screen.getByRole("button", { name: "Stock top Ace of Clubs" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, King of Hearts" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Stock top Ace of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, King of Hearts" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, King of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(
    screen.getByRole("button", { name: "Stock top Ace of Clubs" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_STOCK_TO_BUILD",
    target: "new",
  });
});

it("switches from Hand to a playable Discard top while keeping Hand discard available", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "discard-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);

  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, 2 of Hearts" }),
  );
  expect(submitAction).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, 2 of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Discard Hand to pile 1" }),
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 0,
  });
});

it("offers End Turn only with empty Hand, no refill, and no legal placement", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();

  const rare = structuredClone(state);
  rare.byId["player-1"]!.hand.cards = [];
  rare.deck.drawPile = [];
  rare.deck.recyclePile = [];
  rare.byId["player-1"]!.stock.faceDown[
    rare.byId["player-1"]!.stock.faceDown.length - 1
  ] = { kind: "standard", id: "blocked", rank: 8, suit: "Hearts" };
  gameRoom.view = { ...gameRoom.view, state: rare, seq: 1 };
  rerender(<GameRoomPage />);
  const refill = structuredClone(rare);
  refill.deck.recyclePile = [
    { kind: "standard", id: "refill", rank: 9, suit: "Clubs" },
  ];
  gameRoom.view = { ...gameRoom.view, state: refill, seq: 2 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  const playable = structuredClone(rare);
  playable.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "two-discard", rank: 2, suit: "Clubs" },
  ];
  gameRoom.view = { ...gameRoom.view, state: playable, seq: 3 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  gameRoom.view = { ...gameRoom.view, state: rare, seq: 4 };
  rerender(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "End Turn" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({ kind: "END_TURN" });

  const advanced = structuredClone(rare);
  advanced.turn.activePlayer = "player-2";
  advanced.turn.number = 2;
  gameRoom.view = { ...gameRoom.view, state: advanced, seq: 5 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  expect(screen.getByText("Active: Bob")).toBeTruthy();
});

it("locks a Pending Action across broadcasts until the server refills Hand", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "ace", rank: 1, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Hearts" }));
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));

  gameRoom.view = {
    ...gameRoom.view,
    pendingAction: {
      actionId: "pending",
      action: { kind: "PLAY_HAND_TO_BUILD" },
    },
    seq: 1,
  };
  rerender(<GameRoomPage />);
  expect(screen.getByLabelText("Hand Ace of Hearts")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  expect(screen.queryByRole("button", { name: /Build pile/ })).toBeNull();

  const accepted = structuredClone(state);
  accepted.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "refill", rank: 6, suit: "Diamonds" },
  ];
  accepted.center.buildPiles.push({
    id: "build-2",
    cards: [{ kind: "standard", id: "ace", rank: 1, suit: "Hearts" }],
    nextRank: 2,
  });
  gameRoom.view = {
    ...gameRoom.view,
    state: accepted,
    seq: 2,
    pendingAction: null,
  };
  rerender(<GameRoomPage />);
  expect(screen.queryByLabelText("Hand Ace of Hearts")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Hand 6 of Diamonds" }),
  ).toBeTruthy();
  expect(screen.getByText("build-2 → 2")).toBeTruthy();
  expect(submitAction).toHaveBeenCalledTimes(1);
});

it("starts expanded and restores a room's collapsed state only within its browser session", () => {
  showGameRoom();
  const { unmount } = render(<GameRoomPage />);
  const toggle = screen.getByRole("button", { name: /collapse chat/i });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByPlaceholderText("Type a message...")).toBeTruthy();
  fireEvent.click(toggle);
  expect(
    screen
      .getByRole("button", { name: /expand chat/i })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(screen.queryByRole("textbox")).toBeNull();

  unmount();
  const { rerender } = render(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /expand chat/i })).toBeTruthy();

  gameRoom.roomId = "room-2";
  rerender(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /collapse chat/i })).toBeTruthy();
  gameRoom.roomId = "room-1";
  rerender(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /expand chat/i })).toBeTruthy();
});

it("keeps a chat draft when the player collapses and reopens the panel", () => {
  showGameRoom();
  render(<GameRoomPage />);
  const draft = screen.getByPlaceholderText(
    "Type a message...",
  ) as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: /collapse chat/i }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /expand chat/i }));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Keep this draft",
  );
});

it("keeps chat available when session storage cannot be read", () => {
  showGameRoom();
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
  try {
    render(<GameRoomPage />);
    expect(screen.getByRole("button", { name: /collapse chat/i })).toBeTruthy();
  } finally {
    read.mockRestore();
  }
});

it("counts only live arrivals while collapsed and clears unread when expanded", () => {
  showGameRoom(3); // Recovered before the page became visible.
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: /collapse chat/i }));
  gameRoom.view = {
    ...gameRoom.view,
    chatMessages: [
      {
        id: "history",
        playerId: "player-2",
        playerName: "Bob",
        text: "Old",
        timestamp: 1,
      },
    ],
  };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).not.toContain("unread");

  gameRoom.view = { ...gameRoom.view, liveChatCount: 5 };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).toContain("2 unread");
  gameRoom.view = {
    ...gameRoom.view,
    chatMessages: [
      {
        id: "recovered",
        playerId: "player-2",
        playerName: "Bob",
        text: "Recovered",
        timestamp: 2,
      },
    ],
  };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).toContain("2 unread");
  fireEvent.click(screen.getByRole("button", { name: /expand chat/i }));
  expect(
    screen.getByRole("button", { name: /collapse chat/i }).textContent,
  ).not.toContain("unread");
  gameRoom.view = { ...gameRoom.view, liveChatCount: 6 };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /collapse chat/i }).textContent,
  ).not.toContain("unread");
});

it("keeps the game-page chat draft through disconnect and reconnect until the player sends it", () => {
  const sendChat = vi.fn(() => true);
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    chatMessages: [],
    sendChat,
  };
  const { rerender } = render(<GameRoomPage />);
  const draft = screen.getByPlaceholderText(
    "Type a message...",
  ) as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "After reconnect" } });

  gameRoom.view = { ...gameRoom.view, connectionStatus: "connecting" };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(draft.value).toBe("After reconnect");
  expect(sendChat).not.toHaveBeenCalled();

  gameRoom.view = { ...gameRoom.view, connectionStatus: "connected" };
  rerender(<GameRoomPage />);
  expect(draft.value).toBe("After reconnect");
  expect(sendChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sendChat).toHaveBeenCalledExactlyOnceWith("After reconnect");
  expect(draft.value).toBe("");
});

it("shows recovered Lobby and live chat on the Game room page", () => {
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    sendChat: vi.fn(),
    chatMessages: [
      {
        id: "old",
        playerId: "player-2",
        playerName: "Bob",
        text: "Before play",
        timestamp: 1,
      },
      {
        id: "new",
        playerId: "player-1",
        playerName: "Alice",
        text: "During play",
        timestamp: 2,
      },
    ],
  };
  render(<GameRoomPage />);
  expect(screen.getByText("Before play")).toBeTruthy();
  expect(screen.getByText("During play")).toBeTruthy();
  expect(screen.getByText("Alice (you):")).toBeTruthy();
});
