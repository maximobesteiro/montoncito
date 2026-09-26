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

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  harness.handler = undefined;
  harness.apiFetch.mockReset().mockImplementation(async (url: string) => ({
    id: "room-1",
    slug: "sample-room",
    ownerId: "player-1",
    status: "open",
    visibility: "public",
    maxPlayers: 4,
    players: [
      { id: "player-1", displayName: "Alice", isOwner: true, isReady: false },
    ],
    gameConfig: { discardPiles: 3 },
    createdAt: "2024-01-01",
    ...(url.endsWith("/join") ? { wsJoinToken: "token" } : {}),
  }));
});
afterEach(cleanup);

it("shows recovered waiting-room chat with sender names and current-player highlighting", async () => {
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
