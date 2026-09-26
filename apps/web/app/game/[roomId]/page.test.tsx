// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStartedGame } from "@mont/core-game";

const gameRoom = vi.hoisted(() => ({
  view: {} as Record<string, unknown>,
  roomId: "room-1",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: gameRoom.roomId }),
}));
vi.mock("@/lib/use-game-room", () => ({ useGameRoom: () => gameRoom.view }));
vi.mock("@/components/game/ActionPanel", () => ({ ActionPanel: () => null }));

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
  expect(screen.queryByPlaceholderText("Type a message...")).toBeNull();

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
