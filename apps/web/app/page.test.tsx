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

const harness = vi.hoisted(() => ({ apiFetch: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  apiFetch: harness.apiFetch,
  getOrCreateClientId: () => "home-guest",
}));

import Home from "./page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { GuestProfile } from "@/lib/guest-profile";
import { ApiHttpError } from "@/lib/api";

let profile: GuestProfile;
beforeEach(() => {
  localStorage.clear();
  profile = {
    clientId: "home-guest",
    displayName: "Nico",
    suggestions: ["Luna"],
    generation: crypto.randomUUID(),
    revision: 0,
    updatedAt: "2026-10-19",
  };
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => Promise<unknown>) =>
        callback(),
    },
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  harness.push.mockReset();
  harness.apiFetch.mockReset().mockImplementation(async (_url, options) => {
    if (options?.method === "PATCH") {
      profile = {
        ...profile,
        displayName: JSON.parse(options.body).displayName.trim(),
        revision: profile.revision + 1,
      };
    }
    return profile;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mountHome() {
  return render(
    <ThemeProvider>
      <AppShell>
        <Home />
      </AppShell>
    </ThemeProvider>,
  );
}

it("edits the confirmed nickname in the real Home header without changing the menu", async () => {
  mountHome();
  const header = within(screen.getByRole("banner"));
  fireEvent.click(
    await header.findByRole("button", { name: "Edit nickname: Nico" }),
  );
  expect(screen.queryByText(/Playing as/)).toBeNull();
  expect(screen.queryByRole("region", { name: "Guest nickname" })).toBeNull();
  for (const name of [
    "Casual Game",
    "Join a Game",
    "Create a Game",
    "How to Play",
  ]) {
    expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
  }
  const dialog = within(screen.getByRole("dialog", { name: "Edit nickname" }));
  expect(
    (dialog.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement)
      .value,
  ).toBe("Nico");
  expect(dialog.getByText("Use up to 32 characters.")).toBeTruthy();
  fireEvent.change(dialog.getByRole("textbox"), {
    target: { value: "  Sol  " },
  });
  fireEvent.submit(dialog.getByRole("textbox").closest("form")!);
  expect(
    await header.findByRole("button", { name: "Edit nickname: Sol" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem("montoncito:nickname:home-guest")).toBe("Sol");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("shows no cached nickname while initializing and offers an explicit retry on failure", async () => {
  localStorage.setItem("montoncito:nickname:home-guest", "Old cached name");
  const pending = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(pending.promise);
  mountHome();
  const header = within(screen.getByRole("banner"));
  expect(header.getByRole("status").textContent).toBe("Loading nickname...");
  expect(header.queryByText("Old cached name")).toBeNull();
  expect(header.queryByRole("button", { name: /Edit nickname/ })).toBeNull();
  await act(async () => pending.reject(new Error("offline")));
  expect(header.queryByRole("status")).toBeNull();
  fireEvent.click(
    await header.findByRole("button", { name: "Retry nickname" }),
  );
  expect(
    await header.findByRole("button", { name: "Edit nickname: Nico" }),
  ).toBeTruthy();
  expect(harness.apiFetch).toHaveBeenCalledTimes(2);
});

it("does not expose a cross-tab cached identity before initialization confirms the current generation", async () => {
  const pending = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(pending.promise);
  mountHome();
  act(() => {
    localStorage.setItem(
      "montoncito:profile:home-guest",
      JSON.stringify({ ...profile, displayName: "Unconfirmed cache" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:home-guest" }),
    );
  });
  expect(
    within(screen.getByRole("banner")).getByRole("status").textContent,
  ).toBe("Loading nickname...");
  expect(screen.queryByRole("button", { name: /Edit nickname:/ })).toBeNull();
  await act(async () =>
    pending.resolve({ ...profile, displayName: "Server confirmed" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Edit nickname: Server confirmed",
    }),
  ).toBeTruthy();
});

async function openEditor() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Edit nickname:/ }),
  );
  return within(screen.getByRole("dialog", { name: "Edit nickname" }));
}
function patches() {
  return harness.apiFetch.mock.calls.filter(
    ([, options]) => options?.method === "PATCH",
  );
}

it("keeps Shuffle draft-only, validates blank/long names, and discards idle drafts on Cancel", async () => {
  mountHome();
  let editor = await openEditor();
  fireEvent.click(editor.getByRole("button", { name: "Shuffle" }));
  await waitFor(() =>
    expect((editor.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Luna",
    ),
  );
  expect(
    within(screen.getByRole("banner")).getByRole("button", {
      name: "Edit nickname: Nico",
    }),
  ).toBeTruthy();
  expect(patches()).toHaveLength(0);
  fireEvent.change(editor.getByRole("textbox"), { target: { value: "   " } });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect(editor.getByRole("alert").textContent).toBe("Enter a nickname.");
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "x".repeat(33) },
  });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect(editor.getByRole("alert").textContent).toBe(
    "Use 32 characters or fewer.",
  );
  expect(patches()).toHaveLength(0);
  fireEvent.click(editor.getByRole("button", { name: "Cancel" }));
  editor = await openEditor();
  expect((editor.getByRole("textbox") as HTMLInputElement).value).toBe("Nico");
});

it("blocks duplicate saves and dismissal while pending, retaining the useful draft after failure", async () => {
  mountHome();
  const editor = await openEditor();
  const pending = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(pending.promise);
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "My useful draft" },
  });
  const form = editor.getByRole("textbox").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(patches()).toHaveLength(1);
  expect(
    (editor.getByRole("button", { name: "Saving..." }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(editor.getByRole("button", { name: "Cancel" }));
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: false, cancelable: true }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => pending.reject(new Error("offline")));
  expect(editor.getByRole("alert").textContent).toContain("Please try again");
  expect((editor.getByRole("textbox") as HTMLInputElement).value).toBe(
    "My useful draft",
  );
  expect(editor.getByText("Confirmed nickname: Nico")).toBeTruthy();
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByRole("button", {
      name: "Edit nickname: My useful draft",
    }),
  ).toBeTruthy();
});

it("preserves Lobby-conflict explanations without replacing the confirmed name or draft", async () => {
  mountHome();
  const editor = await openEditor();
  harness.apiFetch.mockRejectedValueOnce(
    new ApiHttpError(409, "conflict", "NICKNAME_CONFLICT"),
  );
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "Taken elsewhere" },
  });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect((await editor.findByRole("alert")).textContent).toContain(
    "It may be another Lobby",
  );
  expect((editor.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Taken elsewhere",
  );
  expect(editor.getByText("Confirmed nickname: Nico")).toBeTruthy();
});

it("updates cross-tab confirmation without replacing the draft and requires explicit stale-save retry", async () => {
  mountHome();
  const editor = await openEditor();
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "My draft" },
  });
  profile = { ...profile, displayName: "Luna", revision: 1 };
  act(() => {
    localStorage.setItem(
      "montoncito:profile:home-guest",
      JSON.stringify(profile),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "montoncito:profile:home-guest" }),
    );
  });
  expect(
    within(screen.getByRole("banner")).getByRole("button", {
      name: "Edit nickname: Luna",
    }),
  ).toBeTruthy();
  expect((editor.getByRole("textbox") as HTMLInputElement).value).toBe(
    "My draft",
  );
  harness.apiFetch.mockRejectedValueOnce(
    new ApiHttpError(409, "stale", "STALE_PROFILE"),
  );
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect((await editor.findByRole("alert")).textContent).toContain(
    "retry your draft",
  );
  expect(editor.getByText("Confirmed nickname: Luna")).toBeTruthy();
  expect(patches()).toHaveLength(1);
  expect(JSON.parse(patches()[0]![1].body).base.revision).toBe(0);
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByRole("button", { name: "Edit nickname: My draft" }),
  ).toBeTruthy();
  expect(JSON.parse(patches()[1]![1].body).base.revision).toBe(1);
});

it("removes editing on page departure while accepted late saves cannot roll back newer confirmation", async () => {
  const view = mountHome();
  const editor = await openEditor();
  const late = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(late.promise);
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "Late name" },
  });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  view.rerender(
    <ThemeProvider>
      <AppShell>
        <p>Another page</p>
      </AppShell>
    </ThemeProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /Edit nickname:/ })).toBeNull();
  profile = { ...profile, displayName: "Newer name", revision: 2 };
  localStorage.setItem(
    "montoncito:profile:home-guest",
    JSON.stringify(profile),
  );
  await act(async () =>
    late.resolve({ ...profile, displayName: "Late name", revision: 1 }),
  );
  view.rerender(
    <ThemeProvider>
      <AppShell>
        <Home />
      </AppShell>
    </ThemeProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Edit nickname: Newer name" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("remembers an accepted save after departure without reopening editing on return", async () => {
  const view = mountHome();
  const editor = await openEditor();
  const late = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(late.promise);
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "Accepted" },
  });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  view.rerender(
    <ThemeProvider>
      <AppShell>
        <p>Another page</p>
      </AppShell>
    </ThemeProvider>,
  );
  profile = { ...profile, displayName: "Accepted", revision: 1 };
  await act(async () => late.resolve(profile));
  expect(localStorage.getItem("montoncito:nickname:home-guest")).toBe(
    "Accepted",
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <ThemeProvider>
      <AppShell>
        <Home />
      </AppShell>
    </ThemeProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Edit nickname: Accepted" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows the newest persisted confirmation when an older save arrives before its storage event", async () => {
  mountHome();
  const editor = await openEditor();
  const late = deferred<GuestProfile>();
  harness.apiFetch.mockReturnValueOnce(late.promise);
  fireEvent.change(editor.getByRole("textbox"), {
    target: { value: "Older save" },
  });
  fireEvent.click(editor.getByRole("button", { name: "Save" }));
  localStorage.setItem(
    "montoncito:profile:home-guest",
    JSON.stringify({ ...profile, displayName: "Newer persisted", revision: 2 }),
  );
  await act(async () =>
    late.resolve({ ...profile, displayName: "Older save", revision: 1 }),
  );
  expect(
    screen.getByRole("button", { name: "Edit nickname: Newer persisted" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves brand navigation and the Home create, join and rules actions", async () => {
  mountHome();
  await screen.findByRole("button", { name: "Edit nickname: Nico" });
  expect(
    screen.getByRole("link", { name: "Montoncito" }).getAttribute("href"),
  ).toBe("/");
  fireEvent.click(screen.getByRole("button", { name: /How to Play/ }));
  expect(screen.getByRole("dialog", { name: "How to Play" })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("dialog")).getAllByRole("button", {
      name: "Close",
    })[0]!,
  );
  fireEvent.click(screen.getByRole("button", { name: /Join a Game/ }));
  fireEvent.change(screen.getByPlaceholderText("Enter game ID"), {
    target: { value: "invite" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(harness.push).toHaveBeenCalledWith("/room/invite"),
  );
  harness.apiFetch.mockImplementation(async (url) =>
    url === "/rooms" ? { slug: "created" } : profile,
  );
  fireEvent.click(screen.getByRole("button", { name: /Create a Game/ }));
  await waitFor(() =>
    expect(harness.push).toHaveBeenCalledWith("/room/created"),
  );
  const creation = harness.apiFetch.mock.calls.find(
    ([url]) => url === "/rooms",
  );
  expect(creation?.[1].headers["x-profile-generation"]).toBe(
    profile.generation,
  );
});
