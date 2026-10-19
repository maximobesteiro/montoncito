// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

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
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
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
import Home from "../../page";
import { ApiHttpError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { GuestProfile } from "@/lib/guest-profile";

let profile: GuestProfile;
let lobby: {
  id: string;
  slug: string;
  ownerId: string;
  status: string;
  visibility: string;
  maxPlayers: number;
  players: Array<{
    id: string;
    displayName: string;
    isOwner: boolean;
    isReady: boolean;
  }>;
  gameConfig: { discardPiles: number };
  createdAt: string;
};

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
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
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollIntoView = vi.fn();
  harness.handler = undefined;
  profile = {
    clientId: "player-1",
    displayName: "Alice",
    generation: crypto.randomUUID(),
    revision: 0,
    suggestions: [],
    updatedAt: "2024-01-01",
  };
  lobby = {
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
  };
  harness.apiFetch
    .mockReset()
    .mockImplementation(async (url: string, options) => {
      if (url === "/profile") {
        if (options?.method === "PATCH")
          profile = {
            ...profile,
            displayName: JSON.parse(options.body).displayName.trim(),
            revision: profile.revision + 1,
          };
        return profile;
      }
      return {
        ...lobby,
        ...(url.endsWith("/join") ? { wsJoinToken: "token" } : {}),
      };
    });
});

function mountLobby() {
  return render(
    <ThemeProvider>
      <AppShell>
        <WaitingRoomPage />
      </AppShell>
    </ThemeProvider>,
  );
}

it("opens one modal from the host header and current-player row, not an inline editor", async () => {
  mountLobby();
  const header = within(screen.getByRole("banner"));
  fireEvent.click(
    await header.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  expect(screen.getAllByRole("dialog", { name: "Edit nickname" })).toHaveLength(
    1,
  );
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Alice");
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
    target: { value: "One session" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit nickname" }));
  expect(screen.getAllByRole("dialog", { name: "Edit nickname" })).toHaveLength(
    1,
  );
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("One session");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit nickname" }));
  expect(screen.getAllByRole("dialog", { name: "Edit nickname" })).toHaveLength(
    1,
  );
  expect(screen.getByText("Host")).toBeTruthy();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("saves canonical names for an already-ready guest in header and row without changing readiness", async () => {
  lobby.ownerId = "player-2";
  lobby.players = [
    { id: "player-2", displayName: "Bob", isOwner: true, isReady: false },
    { id: "player-1", displayName: "Alice", isOwner: false, isReady: true },
  ];
  mountLobby();
  fireEvent.click(await screen.findByRole("button", { name: "Edit nickname" }));
  expect(screen.getAllByRole("button", { name: "Edit nickname" })).toHaveLength(
    1,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
    target: { value: "  Sol  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Edit nickname: Sol" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Sol (you)")).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(
    harness.apiFetch.mock.calls.filter(([url]) => url.endsWith("/ready")),
  ).toHaveLength(0);
  expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Sol");
});

it("shows authoritative roster renames even before a delayed profile save response", async () => {
  mountLobby();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  const pending = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValue(pending.promise);
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
    target: { value: "Sol" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  act(() =>
    harness.handler?.({
      type: "ROOM_UPDATED",
      room: {
        ...lobby,
        players: lobby.players.map((player) => ({
          ...player,
          displayName: "Sol",
        })),
      },
    }),
  );
  expect(screen.getByText("Sol (you)")).toBeTruthy();
  await act(async () =>
    pending.resolve({ ...profile, displayName: "Sol", revision: 1 }),
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it("keeps a cross-tab draft, shows the latest confirmation and requires explicit stale-save retry", async () => {
  mountLobby();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  const input = screen.getByRole("textbox", { name: "Nickname" });
  fireEvent.change(input, { target: { value: "My draft" } });
  profile = { ...profile, displayName: "Luna", revision: 1 };
  act(() => {
    localStorage.setItem(
      "montoncito:profile:player-1",
      JSON.stringify(profile),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:player-1" }),
    );
  });
  expect(
    screen.getByRole("button", { name: "Edit nickname: Luna" }),
  ).toBeTruthy();
  expect(screen.getByText("Luna (you)")).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("My draft");
  const api = harness.apiFetch.getMockImplementation()!;
  let patches = 0;
  harness.apiFetch.mockImplementation((url, options) => {
    if (url === "/profile" && options?.method === "PATCH" && patches++ === 0)
      return Promise.reject(new ApiHttpError(409, "Stale", "STALE_PROFILE"));
    return api(url, options);
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("retry your draft"),
  );
  expect(screen.getByText("Confirmed nickname: Luna")).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("My draft");
  expect(patches).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Edit nickname: My draft" });
  const saves = harness.apiFetch.mock.calls.filter(
    ([url, options]) => url === "/profile" && options?.method === "PATCH",
  );
  expect(
    saves.map(([, options]) => JSON.parse(options.body).base.revision),
  ).toEqual([0, 1]);
});

it("loads membership-aware Shuffle suggestions without confirming and retains conflicts and exhausted drafts", async () => {
  mountLobby();
  fireEvent.click(await screen.findByRole("button", { name: "Edit nickname" }));
  profile = { ...profile, suggestions: ["Luna"] };
  fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
        .value,
    ).toBe("Luna"),
  );
  expect(
    screen.getByRole("button", { name: "Edit nickname: Alice" }),
  ).toBeTruthy();
  expect(
    harness.apiFetch.mock.calls.filter(
      ([, options]) => options?.method === "PATCH",
    ),
  ).toHaveLength(0);
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) =>
    url === "/profile" && options?.method === "PATCH"
      ? Promise.reject(new ApiHttpError(409, "Conflict", "NICKNAME_CONFLICT"))
      : api(url, options),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("another Lobby"),
  );
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Luna");
  expect(screen.getByText("Confirmed nickname: Alice")).toBeTruthy();
  profile = { ...profile, suggestions: [] };
  fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "No generated nicknames are available",
    ),
  );
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Luna");
});

it("blocks duplicate saves and cancellation while pending", async () => {
  mountLobby();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  const pending = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValue(pending.promise);
  const input = screen.getByRole("textbox", { name: "Nickname" });
  fireEvent.change(input, { target: { value: "Draft" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(
    (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(
    harness.apiFetch.mock.calls.filter(
      ([, options]) => options?.method === "PATCH",
    ),
  ).toHaveLength(1);
  await act(async () =>
    pending.resolve({ ...profile, displayName: "Draft", revision: 1 }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows initialization loading without an invented nickname or duplicate initialization", async () => {
  const pending = deferred<GuestProfile>();
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementationOnce(() => pending.promise);
  mountLobby();
  expect(
    within(screen.getByRole("banner")).getByRole("status").textContent,
  ).toBe("Loading nickname...");
  expect(screen.queryByRole("button", { name: /^Edit nickname/ })).toBeNull();
  await act(async () => pending.resolve(profile));
  await screen.findByRole("button", { name: "Edit nickname: Alice" });
  expect(
    harness.apiFetch.mock.calls.filter(([url]) => url === "/profile"),
  ).toHaveLength(1);
  harness.apiFetch.mockImplementation(api);
});

it("retries failed profile initialization from the header", async () => {
  harness.apiFetch.mockRejectedValueOnce(new Error("Offline"));
  mountLobby();
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry nickname" }),
  );
  await screen.findByRole("button", { name: "Edit nickname: Alice" });
  expect(
    harness.apiFetch.mock.calls.filter(([url]) => url === "/profile"),
  ).toHaveLength(2);
});

it("allows a fresh editor after departure fails without reopening the discarded session", async () => {
  mountLobby();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
    target: { value: "Discarded" },
  });
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) =>
    url.endsWith("/leave")
      ? Promise.reject(new Error("Offline"))
      : api(url, options),
  );
  fireEvent.click(screen.getByTitle("Exit room"));
  await waitFor(() =>
    expect(harness.showToast).toHaveBeenCalledWith("Offline", "error"),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit nickname: Alice" }),
  );
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Alice");
});

it("preserves the admission-conflict step without a competing header or row editor", async () => {
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) => {
    if (url.endsWith("/join"))
      return Promise.reject(
        new ApiHttpError(409, "Conflict", "NICKNAME_CONFLICT"),
      );
    if (url.endsWith("/nickname-suggestions"))
      return Promise.resolve({ suggestions: ["Luna"] });
    return api(url, options);
  });
  mountLobby();
  await screen.findByRole("dialog", { name: "Edit nickname" });
  expect(screen.queryByRole("button", { name: /^Edit nickname/ })).toBeNull();
  expect(within(screen.getByRole("banner")).getByText("Alice")).toBeTruthy();
  expect(screen.getByText(/You have not joined/)).toBeTruthy();
  expect(
    (screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Luna");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

// Control only the external admission API; profile persistence, shell, page and
// modal remain real so these cases exercise the same boundary as an invite.
function admissionConflict(suggestions = ["Luna"]) {
  lobby.ownerId = "player-2";
  lobby.players = [
    { id: "player-2", displayName: "Alice", isOwner: true, isReady: false },
  ];
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) => {
    if (url.endsWith("/join"))
      return Promise.reject(
        new ApiHttpError(409, "Conflict", "NICKNAME_CONFLICT"),
      );
    if (url.endsWith("/nickname-suggestions"))
      return Promise.resolve({ suggestions });
    return api(url, options);
  });
}

function admissionCalls() {
  return harness.apiFetch.mock.calls.filter(([url]) => url.endsWith("/join"));
}

it.each(["invite", "Join a Game"])(
  "confirms a canonical replacement and admission together from %s",
  async (entry) => {
    admissionConflict();
    if (entry === "Join a Game") {
      const home = render(
        <ThemeProvider>
          <AppShell>
            <Home />
          </AppShell>
        </ThemeProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Join a Game/ }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "sample-room" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() =>
        expect(harness.router.push).toHaveBeenCalledWith("/room/sample-room"),
      );
      home.unmount();
    }
    mountLobby();
    await screen.findByRole("dialog", { name: "Edit nickname" });
    expect(admissionCalls()).toHaveLength(1);
    expect(JSON.parse(admissionCalls()[0]![1].body)).toEqual({});
    expect(harness.connect).not.toHaveBeenCalled();
    expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Alice");
    const api = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) => {
      if (!url.endsWith("/join")) return api(url, options);
      profile = { ...profile, displayName: "Sol", revision: 1 };
      lobby.players.push({
        id: "player-1",
        displayName: "Sol",
        isOwner: false,
        isReady: false,
      });
      return Promise.resolve({
        ...lobby,
        wsJoinToken: "accepted-token",
        profile,
      });
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
      target: { value: "  Sol  " },
    });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await screen.findByRole("button", { name: "Edit nickname: Sol" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Sol (you)")).toBeTruthy();
    expect(JSON.parse(admissionCalls()[1]![1].body)).toEqual({
      displayName: "  Sol  ",
      base: { generation: profile.generation, revision: 0 },
    });
    expect(harness.connect).toHaveBeenCalledWith(
      "accepted-token",
      expect.any(Function),
      expect.any(Function),
    );
    expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Sol");
    expect(
      harness.apiFetch.mock.calls.filter(
        ([, options]) => options?.method === "PATCH",
      ),
    ).toHaveLength(0);
  },
);

it("keeps admission suggestions draft-only, validates custom names and preserves rejected drafts", async () => {
  admissionConflict([]);
  mountLobby();
  await screen.findByRole("dialog");
  expect(screen.getByText(/No generated nicknames are available/)).toBeTruthy();
  const input = screen.getByRole("textbox", { name: "Nickname" });
  fireEvent.change(input, { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(admissionCalls()).toHaveLength(1);
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) =>
    url.endsWith("/nickname-suggestions")
      ? Promise.resolve({ suggestions: ["Sol"] })
      : api(url, options),
  );
  fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe("Sol"));
  expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Alice");
  expect(admissionCalls()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("another Lobby"),
  );
  expect((input as HTMLInputElement).value).toBe("Sol");
  expect(within(screen.getByRole("banner")).getByText("Alice")).toBeTruthy();
  expect(harness.connect).not.toHaveBeenCalled();
});

it.each(["Cancel", "Escape", "backdrop"])(
  "returns Home on admission %s without confirming or joining",
  async (dismissal) => {
    admissionConflict();
    mountLobby();
    const dialog = await screen.findByRole("dialog");
    if (dismissal === "Cancel")
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    else if (dismissal === "Escape")
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
    else {
      fireEvent.pointerDown(dialog, { clientX: -1, clientY: -1 });
      fireEvent.click(dialog, { clientX: -1, clientY: -1 });
    }
    expect(harness.router.push).toHaveBeenCalledWith("/");
    expect(admissionCalls()).toHaveLength(1);
    expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Alice");
    expect(harness.connect).not.toHaveBeenCalled();
  },
);

it("blocks admission duplicates and dismissal while saving, but keeps the draft on rejection", async () => {
  admissionConflict();
  mountLobby();
  const dialog = await screen.findByRole("dialog");
  const pending = deferred<never>();
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) =>
    url.endsWith("/join") ? pending.promise : api(url, options),
  );
  const input = screen.getByRole("textbox");
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  fireEvent.pointerDown(dialog, { clientX: -1, clientY: -1 });
  fireEvent.click(dialog, { clientX: -1, clientY: -1 });
  expect(admissionCalls()).toHaveLength(2);
  expect(harness.router.push).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () =>
    pending.reject(new ApiHttpError(409, "Conflict", "NICKNAME_CONFLICT")),
  );
  await screen.findByRole("alert");
  expect((input as HTMLInputElement).value).toBe("Luna");
});

it.each(["Lobby is full", "Lobby already started"])(
  "keeps %s errors out of nickname setup",
  async (message) => {
    const api = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) =>
      url.endsWith("/join")
        ? Promise.reject(new ApiHttpError(409, message))
        : api(url, options),
    );
    mountLobby();
    await screen.findByText(new RegExp(message));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Retry admission" }),
    ).toBeTruthy();
    expect(harness.connect).not.toHaveBeenCalled();
  },
);

it("enters immediately without a modal or replacement when the confirmed nickname is available", async () => {
  mountLobby();
  await screen.findByRole("button", { name: "Edit nickname: Alice" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(JSON.parse(admissionCalls()[0]![1].body)).toEqual({});
  expect(harness.connect).toHaveBeenCalledTimes(1);
});

it.each(["open", "in_progress"])(
  "recovers a lost replacement response through confirmed profile and %s membership without another admission",
  async (status) => {
    admissionConflict();
    mountLobby();
    await screen.findByRole("dialog");
    const api = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) => {
      if (!url.endsWith("/join")) return api(url, options);
      profile = { ...profile, displayName: "Luna", revision: 1 };
      lobby.status = status;
      lobby.players.push({
        id: "player-1",
        displayName: "Luna",
        isOwner: false,
        isReady: false,
      });
      return Promise.reject(new Error("Response lost"));
    });
    // Existing reconciliation reads room metadata, then obtains a member-only token.
    const recover = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) =>
      url.endsWith("/socket-token")
        ? Promise.resolve({ wsJoinToken: "recovered-token" })
        : Promise.resolve(recover(url, options)).then((value) =>
            url === "/rooms/room-1" && status === "in_progress"
              ? { ...value, gameId: "game-1" }
              : value,
          ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(admissionCalls()).toHaveLength(2);
    expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Luna");
    expect(harness.connect).toHaveBeenCalledWith(
      "recovered-token",
      expect.any(Function),
      expect.any(Function),
    );
    if (status === "in_progress")
      expect(harness.router.push).toHaveBeenCalledWith("/game/room-1");
    else expect(screen.getByText("Luna (you)")).toBeTruthy();
  },
);

it("explains unavailable admission recovery without falsely claiming non-membership and retries the check first", async () => {
  admissionConflict();
  mountLobby();
  await screen.findByRole("dialog");
  const api = harness.apiFetch.getMockImplementation()!;
  let checksAvailable = false;
  harness.apiFetch.mockImplementation((url, options) => {
    if (url.endsWith("/join"))
      return Promise.reject(new Error("Response lost"));
    if (url === "/rooms/room-1" && !checksAvailable)
      return Promise.reject(new Error("Offline"));
    if (url.endsWith("/socket-token"))
      return Promise.resolve({ wsJoinToken: "recovered-token" });
    return api(url, options);
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Couldn't confirm whether you joined"),
  );
  expect(screen.queryByText(/You have not joined/)).toBeNull();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Luna");
  expect(screen.queryByRole("button", { name: /^Edit nickname/ })).toBeNull();
  checksAvailable = true;
  profile = { ...profile, displayName: "Luna", revision: 1 };
  lobby.players.push({
    id: "player-1",
    displayName: "Luna",
    isOwner: false,
    isReady: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Edit nickname: Luna" });
  expect(admissionCalls()).toHaveLength(2);
});

it.each([
  "STALE_PROFILE",
  "STALE_PROFILE_GENERATION",
  "Lobby is full",
  "Lobby already started",
])(
  "retains the admission draft and confirms no replacement on %s",
  async (failure) => {
    admissionConflict();
    mountLobby();
    await screen.findByRole("dialog");
    const api = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) =>
      url.endsWith("/join")
        ? Promise.reject(new ApiHttpError(409, failure, failure))
        : api(url, options),
    );
    if (failure.startsWith("STALE_PROFILE"))
      profile = { ...profile, displayName: "New confirmation", revision: 1 };
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep my draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Keep my draft",
    );
    expect(harness.connect).not.toHaveBeenCalled();
    if (failure.startsWith("STALE_PROFILE")) {
      expect(
        screen.getByText("Confirmed nickname: New confirmation"),
      ).toBeTruthy();
      expect(alert.textContent).toContain(
        failure === "STALE_PROFILE" ? "retry your draft" : "server restarted",
      );
      expect(admissionCalls()).toHaveLength(2);
      if (failure === "STALE_PROFILE") {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(admissionCalls()).toHaveLength(3));
        expect(JSON.parse(admissionCalls()[2]![1].body).base.revision).toBe(1);
      }
    } else {
      expect(alert.textContent).toContain(
        "Your nickname replacement was not confirmed",
      );
      expect(screen.getByText("Confirmed nickname: Alice")).toBeTruthy();
    }
  },
);

it("does not navigate or replace newer confirmation when an admission response arrives after page departure", async () => {
  admissionConflict();
  const mounted = mountLobby();
  await screen.findByRole("dialog");
  const pending = deferred<unknown>();
  const api = harness.apiFetch.getMockImplementation()!;
  harness.apiFetch.mockImplementation((url, options) =>
    url.endsWith("/join") ? pending.promise : api(url, options),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  mounted.unmount();
  const newer = { ...profile, displayName: "Newer", revision: 2 };
  localStorage.setItem("montoncito:profile:player-1", JSON.stringify(newer));
  localStorage.setItem("montoncito:nickname:player-1", "Newer");
  await act(async () =>
    pending.resolve({
      ...lobby,
      wsJoinToken: "late-token",
      profile: { ...profile, displayName: "Luna", revision: 1 },
    }),
  );
  expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Newer");
  expect(harness.connect).not.toHaveBeenCalled();
  expect(harness.router.push).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("updates the confirmed admission name across tabs without replacing the draft or enabling another editor", async () => {
  admissionConflict();
  mountLobby();
  await screen.findByRole("dialog");
  const input = screen.getByRole("textbox", { name: "Nickname" });
  fireEvent.change(input, { target: { value: "My unsaved admission" } });
  profile = { ...profile, displayName: "New confirmation", revision: 1 };
  act(() => {
    localStorage.setItem(
      "montoncito:profile:player-1",
      JSON.stringify(profile),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:player-1" }),
    );
  });
  expect(
    within(screen.getByRole("banner")).getByText("New confirmation"),
  ).toBeTruthy();
  expect(screen.getByText("Confirmed nickname: New confirmation")).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("My unsaved admission");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /^Edit nickname/ })).toBeNull();
  expect(admissionCalls()).toHaveLength(1);
});

it.each([
  "GAME_STARTED",
  "KICKED",
  "removed roster",
  "started roster",
  "leave",
  "unmount",
])(
  "invalidates a pending edit on %s without undoing accepted persistence",
  async (transition) => {
    const mounted = mountLobby();
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit nickname: Alice" }),
    );
    const pending = deferred<GuestProfile>();
    const api = harness.apiFetch.getMockImplementation()!;
    harness.apiFetch.mockImplementation((url, options) =>
      options?.method === "PATCH" && url === "/profile"
        ? pending.promise
        : api(url, options),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
      target: { value: "Late" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving..." });
    if (transition === "leave") fireEvent.click(screen.getByTitle("Exit room"));
    else if (transition === "unmount") mounted.unmount();
    else if (transition === "removed roster" || transition === "started roster")
      act(() =>
        harness.handler?.({
          type: "ROOM_UPDATED",
          room: {
            ...lobby,
            status: transition === "started roster" ? "in_progress" : "open",
            players: transition === "removed roster" ? [] : lobby.players,
            gameId: transition === "started roster" ? "game-1" : undefined,
          },
        }),
      );
    else act(() => harness.handler?.({ type: transition, roomId: "room-1" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Edit nickname:/ }),
    ).toBeNull();
    // A newer confirmation must win even if the accepted earlier save arrives late.
    const newer = { ...profile, displayName: "Newer", revision: 2 };
    if (transition !== "unmount")
      act(() => {
        localStorage.setItem(
          "montoncito:profile:player-1",
          JSON.stringify(newer),
        );
        window.dispatchEvent(
          new StorageEvent("storage", { key: "montoncito:profile:player-1" }),
        );
      });
    await act(async () =>
      pending.resolve({ ...profile, displayName: "Late", revision: 1 }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    if (transition !== "unmount")
      expect(screen.queryByText("Late (you)")).toBeNull();
    else
      expect(localStorage.getItem("montoncito:nickname:player-1")).toBe("Late");
  },
);

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
  harness.apiFetch.mockImplementation(async () => ({
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
  const connected = harness.connect.mock.calls.at(-1)?.[2] as () => void;
  connected();
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
