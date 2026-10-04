// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const harness = vi.hoisted(() => ({
  handler: undefined as ((event: unknown) => void) | undefined,
  connect: vi.fn(),
  disconnect: vi.fn(),
  apiFetch: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  showToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "sample-room" }),
  useRouter: () => harness.router,
}));
vi.mock("@/lib/api", () => ({
  getOrCreateClientId: () => "player-1",
  apiFetch: harness.apiFetch,
  ApiHttpError: class ApiHttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/room-settings-storage", () => ({
  getRoomSettings: () => null,
  saveRoomSettings: vi.fn(),
}));
vi.mock("@/lib/socket-client", () => ({
  getSocketClient: () => ({
    connect: harness.connect,
    disconnect: harness.disconnect,
    on: (handler: (event: unknown) => void) => {
      harness.handler = handler;
      return () => {
        harness.handler = undefined;
      };
    },
    sendChat: vi.fn(),
  }),
}));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ showToast: harness.showToast }),
}));

import WaitingRoomPage from "./page";
import { ApiHttpError } from "@/lib/api";

beforeEach(() => {
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      locks: {
        request: async (_name: string, callback: () => Promise<unknown>) =>
          callback(),
      },
    }),
  );
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  harness.handler = undefined;
  harness.apiFetch.mockReset().mockImplementation(async (url: string) =>
    url === "/profile"
      ? {
          clientId: "player-1",
          displayName: "Alice",
          generation: "bd791ffd-3a8c-4bca-8a97-fd20e10925dc",
          revision: 0,
          suggestions: [],
          updatedAt: "2024-01-01",
        }
      : {
          id: "room-1",
          slug: "sample-room",
          ownerId: "player-1",
          status: "open",
          visibility: "public",
          maxPlayers: 4,
          players: [
            {
              id: "player-1",
              displayName: "Alice",
              isOwner: true,
              isReady: false,
            },
          ],
          gameConfig: { discardPiles: 3 },
          createdAt: "2024-01-01",
          ...(url.endsWith("/join") ? { wsJoinToken: "token" } : {}),
        },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows recovered Lobby chat with sender names and current-player highlighting", async () => {
  render(<WaitingRoomPage />);
  await waitFor(() => expect(harness.handler).toBeDefined());
  harness.handler?.({
    type: "CHAT_HISTORY",
    messages: [
      {
        id: "one",
        playerId: "player-2",
        playerName: "Bob",
        text: "Earlier",
        timestamp: 1,
      },
      {
        id: "two",
        playerId: "player-1",
        playerName: "Alice",
        text: "Here now",
        timestamp: 2,
      },
    ],
  });
  expect(await screen.findByText("Earlier")).toBeTruthy();
  expect(screen.getByText("Here now")).toBeTruthy();
  expect(screen.getByText("Alice (you):")).toBeTruthy();
  harness.handler?.({
    type: "CHAT_MESSAGE",
    id: "two",
    playerId: "player-1",
    playerName: "Alice",
    text: "Here now",
    timestamp: 2,
  });
  expect(screen.getAllByText("Here now")).toHaveLength(1);
});

it("renews only an existing member and navigates to the Game room if play starts during reconnection", async () => {
  render(<WaitingRoomPage />);
  await waitFor(() => expect(harness.connect).toHaveBeenCalled());
  harness.apiFetch.mockImplementation(async (url: string) => ({
    id: "room-1",
    slug: "sample-room",
    ownerId: "player-1",
    status: "in_progress",
    gameId: "game-1",
    visibility: "public",
    maxPlayers: 4,
    players: [
      { id: "player-1", displayName: "Alice", isOwner: true, isReady: false },
    ],
    gameConfig: { discardPiles: 3 },
    createdAt: "2024-01-01",
    wsJoinToken: "renewed",
  }));
  const renew = harness.connect.mock.calls.at(-1)?.[1] as () => Promise<string>;
  expect(await renew()).toBe("renewed");
  await waitFor(() =>
    expect(harness.router.push).toHaveBeenCalledWith("/game/room-1"),
  );
  expect(harness.apiFetch.mock.calls.map(([url]) => url)).toContain(
    "/rooms/room-1/socket-token",
  );
  expect(
    harness.apiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url === "/rooms/room-1/join"),
  ).toHaveLength(1);
});

it("does not silently rejoin after membership has been removed", async () => {
  render(<WaitingRoomPage />);
  await waitFor(() => expect(harness.connect).toHaveBeenCalled());
  harness.apiFetch.mockRejectedValueOnce(new ApiHttpError(403, "Not a member"));
  const renew = harness.connect.mock.calls.at(-1)?.[1] as () => Promise<string>;
  await expect(renew()).rejects.toThrow("Not a member");
  expect(harness.disconnect).toHaveBeenCalled();
  expect(harness.router.push).toHaveBeenCalledWith("/");
  expect(
    harness.apiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url === "/rooms/room-1/join"),
  ).toHaveLength(1);
});
