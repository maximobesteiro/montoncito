// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createStartedGame, type GameState } from "@mont/core-game";
import type { ReactNode } from "react";
import type { GuestProfile } from "@/lib/guest-profile";

const room = vi.hoisted(() => ({
  id: "room-1",
  view: {} as Record<string, unknown>,
  apiFetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: room.id }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/use-game-room", () => ({ useGameRoom: () => room.view }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  apiFetch: room.apiFetch,
  getOrCreateClientId: () => "local",
}));

import GameRoomPage from "./page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import Home from "../../page";

let profile: GuestProfile;

beforeEach(() => {
  HTMLDialogElement.prototype.show = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  sessionStorage.clear();
  profile = {
    clientId: "local",
    displayName: "Shared name",
    suggestions: ["Luna"],
    generation: crypto.randomUUID(),
    revision: 0,
    updatedAt: "2026-10-19",
  };
  room.apiFetch.mockReset().mockImplementation(async () => profile);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => Promise<unknown>) =>
        callback(),
    },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const state = createStartedGame({ players: ["local", "opponent"], seed: 1 });
  state.byId.local!.name = "Nico";
  room.id = "room-1";
  room.view = {
    state,
    seq: 0,
    currentPlayerId: "local",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    sendChat: vi.fn(),
    chatMessages: [],
    liveChatCount: 0,
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function app(page: ReactNode = <GameRoomPage />) {
  return (
    <ThemeProvider>
      <AppShell>{page}</AppShell>
    </ThemeProvider>
  );
}

it("shows the captured Match identity without header editing interactions", () => {
  localStorage.setItem("montoncito:nickname:local", "Luna");
  render(app());
  const header = sharedHeader();
  expect(header.getByText("Nico").getAttribute("title")).toBe("Nico");
  expect(header.queryByText("Luna")).toBeNull();
  expect(header.queryByRole("button", { name: /nickname/i })).toBeNull();
  expect(header.getAllByRole("button")).toHaveLength(1);
  expect(header.getByRole("button", { name: "Toggle theme" })).toBeTruthy();
  expect(
    header.getByRole("link", { name: "Montoncito" }).getAttribute("href"),
  ).toBe("/");
  expect(screen.queryByRole("dialog", { name: "Edit nickname" })).toBeNull();
});

function sharedHeader() {
  return within(
    screen.getByRole("link", { name: "Montoncito" }).closest("header")!,
  );
}

it("retains an identified match name while reconnecting without a snapshot", () => {
  const page = render(app());
  room.view = { ...room.view, state: null, connectionStatus: "synchronizing" };
  page.rerender(app());
  expect(sharedHeader().getByText("Nico")).toBeTruthy();
  expect(screen.getByText("Synchronizing Game room…")).toBeTruthy();
});

it("keeps Nico through cross-tab confirmation, reconnect and game over while Home shows Luna", async () => {
  const page = render(app(<Home />));
  await sharedHeader().findByRole("button", {
    name: "Edit nickname: Shared name",
  });
  profile = { ...profile, displayName: "Luna", revision: 1 };
  act(() => {
    localStorage.setItem("montoncito:profile:local", JSON.stringify(profile));
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:local" }),
    );
  });
  expect(
    sharedHeader().getByRole("button", { name: "Edit nickname: Luna" }),
  ).toBeTruthy();
  page.rerender(app());
  expect(sharedHeader().getByText("Nico")).toBeTruthy();
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:local" }),
    );
  });
  room.view = { ...room.view, connectionStatus: "connecting" };
  page.rerender(app());
  expect(sharedHeader().getByText("Nico")).toBeTruthy();
  expect(screen.getByText(/Reconnecting to the Game room/)).toBeTruthy();
  const state = room.view.state as GameState;
  room.view = {
    ...room.view,
    state: { ...state, phase: "gameover", winner: "local" },
    connectionStatus: "connected",
  };
  page.rerender(app());
  expect(sharedHeader().getByText("Nico")).toBeTruthy();
  fireEvent.click(sharedHeader().getByText("Nico"));
  fireEvent.keyDown(sharedHeader().getByText("Nico"), { key: "Enter" });
  expect(
    sharedHeader().queryByRole("button", { name: /nickname/i }),
  ).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Edit nickname" })).toBeNull();
  expect(sharedHeader().queryByText("Luna")).toBeNull();
  page.rerender(app(<Home />));
  expect(
    await sharedHeader().findByRole("button", { name: "Edit nickname: Luna" }),
  ).toBeTruthy();
});

it.each([
  "loading",
  "unknown participant",
  "no participant",
  "unnamed participant",
])("omits identity rather than a profile or raw ID during %s", (scenario) => {
  localStorage.setItem("montoncito:nickname:local", "Luna");
  if (scenario === "loading") room.view = { ...room.view, state: null };
  if (scenario === "unknown participant")
    room.view.currentPlayerId = "missing-guest";
  if (scenario === "no participant") room.view.currentPlayerId = null;
  if (scenario === "unnamed participant")
    (room.view.state as GameState).byId.local!.name = undefined;
  render(app());
  const header = sharedHeader();
  expect(header.queryByText(/Nico|Luna|local|missing-guest/)).toBeNull();
  expect(header.getAllByRole("button")).toHaveLength(1);
  expect(room.apiFetch).not.toHaveBeenCalled();
});

it("clears identity for a missing participant and when switching rooms or leaving Game", () => {
  const page = render(app());
  const original = room.view;
  room.view = { ...original, currentPlayerId: "missing-guest" };
  page.rerender(app());
  expect(sharedHeader().queryByText("Nico")).toBeNull();
  room.view = original;
  page.rerender(app());
  expect(sharedHeader().getByText("Nico")).toBeTruthy();
  room.id = "room-2";
  room.view = { ...original, state: null, connectionStatus: "connecting" };
  page.rerender(app());
  expect(sharedHeader().queryByText("Nico")).toBeNull();
  const state = createStartedGame({ players: ["local", "opponent"], seed: 2 });
  state.byId.local!.name = "Sol";
  room.view = { ...original, state };
  page.rerender(app());
  expect(sharedHeader().getByText("Sol")).toBeTruthy();
  page.rerender(app(<p>Unrelated route</p>));
  expect(sharedHeader().queryByText(/Nico|Sol/)).toBeNull();
  expect(sharedHeader().getAllByRole("button")).toHaveLength(1);
});

it.each([false, true])(
  "closes Home editing on entry into Game and ignores late save UI (newer confirmation=%s)",
  async (newer) => {
    const page = render(app(<Home />));
    fireEvent.click(
      await sharedHeader().findByRole("button", {
        name: "Edit nickname: Shared name",
      }),
    );
    let resolve!: (profile: GuestProfile) => void;
    room.apiFetch.mockReturnValueOnce(
      new Promise<GuestProfile>((done) => {
        resolve = done;
      }),
    );
    const editor = within(
      screen.getByRole("dialog", { name: "Edit nickname" }),
    );
    fireEvent.change(editor.getByRole("textbox"), {
      target: { value: "Late name" },
    });
    fireEvent.click(editor.getByRole("button", { name: "Save" }));
    page.rerender(app());
    expect(screen.queryByRole("dialog", { name: "Edit nickname" })).toBeNull();
    expect(sharedHeader().getByText("Nico")).toBeTruthy();
    const accepted = { ...profile, displayName: "Late name", revision: 1 };
    profile = newer
      ? { ...profile, displayName: "Newer name", revision: 2 }
      : accepted;
    if (newer) {
      localStorage.setItem("montoncito:profile:local", JSON.stringify(profile));
      localStorage.setItem("montoncito:nickname:local", profile.displayName);
    }
    await act(async () => resolve(accepted));
    expect(sharedHeader().getByText("Nico")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Edit nickname" })).toBeNull();
    expect(localStorage.getItem("montoncito:nickname:local")).toBe(
      profile.displayName,
    );
    page.rerender(app(<Home />));
    expect(
      await sharedHeader().findByRole("button", {
        name: `Edit nickname: ${profile.displayName}`,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Edit nickname" })).toBeNull();
  },
);
