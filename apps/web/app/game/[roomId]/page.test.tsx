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
    screen.getByRole("button", { name: "Discard pile 2, 7 of Clubs" }),
  ).toBeTruthy();
  const buildPile = screen.getByRole("button", { name: /Build pile build-1/ });
  expect(buildPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 2, 7 of Clubs" }),
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

  fireEvent.click(screen.getByRole("button", { name: "Hand King of Diamonds" }));
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

it("can end a Turn when Hand is empty and no cards or placements remain", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.hand.cards = [];
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "stock-nine", rank: 9, suit: "Hearts" },
  ];
  state.deck.drawPile = [];
  state.deck.recyclePile = [];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "End Turn" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({ kind: "END_TURN" });
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
