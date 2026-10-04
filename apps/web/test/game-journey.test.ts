// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";
import type { GameState } from "@mont/core-game";
import { getValidMoves } from "@/lib/game-actions";

let browser: Browser;
let server: {
  url: string;
  scenario: (scenario: "seeded" | "controlled" | "fallback") => void;
  close: () => Promise<void>;
  restart: () => Promise<void>;
};
let css: string;
let script: string;
let actionLog: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  // Build dependencies as well so the real Nest app runs in a clean checkout.
  execFileSync(
    "pnpm",
    ["exec", "turbo", "run", "build", "--filter=server..."],
    { cwd: new URL("../../..", import.meta.url), stdio: "pipe" },
  );
  vi.stubEnv("WS_SECRET", "journey-test-secret");
  const require = createRequire(import.meta.url);
  server = await require("./journey-server.fixture.cjs").start();
  actionLog = vi.spyOn(console, "info").mockImplementation(() => {});
  const from = new URL("../app/globals.css", import.meta.url).pathname;
  css = (
    await postcss([tailwind({ base: process.cwd() })]).process(
      await readFile(from, "utf8"),
      { from },
    )
  ).css;
  const entry = new URL("./journey.browser.fixture.tsx", import.meta.url)
    .pathname;
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SERVER_URL": JSON.stringify(server.url),
    },
    esbuild: { jsx: "automatic", jsxDev: false },
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      {
        name: "browser-router",
        enforce: "pre",
        resolveId(id) {
          if (id === "next/navigation") return entry;
          if (id === "next/link") return "\0journey-link";
        },
        load(id) {
          if (id === "\0journey-link")
            return 'import {createElement} from "react"; export default function Link({children,...props}) { return createElement("a",props,children); }';
        },
      },
    ],
    build: { write: false, lib: { entry, formats: ["iife"], name: "Journey" } },
  });
  const output = Array.isArray(bundle)
    ? bundle[0]!.output
    : "output" in bundle
      ? bundle.output
      : [];
  script = output
    .flatMap((item) => (item.type === "chunk" ? [item.code] : []))
    .join("\n");
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  actionLog?.mockRestore();
  vi.unstubAllEnvs();
});

async function client(width: number, name?: string) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 1024,
    permissions: ["local-network-access"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let snapshot: { state: GameState; seq: number } | undefined;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const text = String(payload);
      if (!text.startsWith("42/ws,")) return;
      const [, frame] = JSON.parse(text.slice(6));
      if (frame?.state) snapshot = frame;
    }),
  );
  await context.route("http://localhost:4173/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://localhost:4173/");
  const id = await page.evaluate(() => {
    const id = crypto.randomUUID();
    localStorage.setItem("montoncito:clientId", id);
    return id;
  });
  if (name) {
    const response = await page.request.patch(`${server.url}/profile`, {
      headers: { "x-client-id": id },
      data: { displayName: name },
    });
    expect(response.ok()).toBe(true);
  }
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  return {
    page,
    openPage: async (path = "/") => {
      const next = await context.newPage();
      next.setDefaultTimeout(5000);
      next.on("pageerror", (error) => errors.push(error.message));
      await next.goto(`http://localhost:4173${path}`);
      await next.addStyleTag({ content: css });
      await next.addScriptTag({ content: script });
      return next;
    },
    id,
    errors,
    snapshot: () => snapshot,
    close: () => context.close(),
  };
}

async function tap(page: Page, target: Locator) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0))
    await target.tap();
  else await target.click();
}

async function delayProfileResponse(
  target: Page | BrowserContext,
  method: "POST" | "PATCH",
) {
  let release!: () => void;
  let captured!: () => void;
  const intercepted = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delayNext = true;
  await target.route(`${server.url}/profile`, async (route) => {
    if (route.request().method() !== method || !delayNext)
      return route.continue();
    delayNext = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    captured();
    await delivery;
    await route.fulfill({ response });
  });
  return { intercepted, release };
}

function blockNicknameStorageWrites() {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (
      key.startsWith("montoncito:profile:") ||
      key.startsWith("montoncito:nickname:")
    )
      throw new DOMException("Full", "QuotaExceededError");
    return original.call(this, key, value);
  };
}

it("initializes a playful profile and validates canonical nickname saves through REST", async () => {
  const headers = { "x-client-id": crypto.randomUUID() };
  const initial = await fetch(`${server.url}/profile`, { headers });
  expect(initial.status).toBe(200);
  const profile = await initial.json();
  expect(profile.displayName).toMatch(/^[A-Za-z]{3,8}$/);
  const save = (displayName: string) =>
    fetch(`${server.url}/profile`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
  const saved = await save("  小 Moki!  ");
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({
    clientId: headers["x-client-id"],
    displayName: "小 Moki!",
  });
  expect((await save("   ")).status).toBe(400);
  expect((await save("x".repeat(33))).status).toBe(400);
  expect(
    await (await fetch(`${server.url}/profile`, { headers })).json(),
  ).toMatchObject({ displayName: "小 Moki!" });
  const initialized = await fetch(`${server.url}/profile`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Older cached name" }),
  });
  expect(await initialized.json()).toMatchObject({ displayName: "小 Moki!" });
  expect((await save("x".repeat(32))).status).toBe(200);
});

it("rejects stale nickname writes and preserves a newer profile during restoration", async () => {
  const headers = {
    "x-client-id": crypto.randomUUID(),
    "content-type": "application/json",
  };
  const initialize = (displayName: string) =>
    fetch(`${server.url}/profile`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName }),
    }).then((response) => response.json());
  const [first, second] = await Promise.all([
    initialize("Remembered"),
    initialize("Older cache"),
  ]);
  expect(second).toMatchObject({
    displayName: first.displayName,
    generation: first.generation,
    revision: first.revision,
  });
  const save = (displayName: string, base: typeof first) =>
    fetch(`${server.url}/profile`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        displayName,
        base: { generation: base.generation, revision: base.revision },
      }),
    });
  expect((await save("Latest", first)).status).toBe(200);
  const stale = await save("Stale draft", second);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ code: "STALE_PROFILE" });
  expect(await initialize("Remembered")).toMatchObject({
    displayName: "Latest",
    revision: first.revision + 1,
  });
  const latest = await initialize("Older cache");
  const contenders = await Promise.all([
    save("First contender", latest),
    save("Second contender", latest),
  ]);
  expect(contenders.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const winner = await contenders
    .find((response) => response.status === 200)!
    .json();
  expect(await initialize("Remembered")).toMatchObject({
    displayName: winner.displayName,
    revision: latest.revision + 1,
  });

  const hostHeaders = {
    "x-client-id": crypto.randomUUID(),
    "content-type": "application/json",
  };
  const room = await (
    await fetch(`${server.url}/rooms`, {
      method: "POST",
      headers: hostHeaders,
      body: "{}",
    })
  ).json();
  const admission = await fetch(`${server.url}/rooms/${room.id}/join`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      displayName: "Stale admission",
      base: { generation: first.generation, revision: first.revision },
    }),
  });
  expect(admission.status).toBe(409);
  expect(await admission.json()).toMatchObject({ code: "STALE_PROFILE" });
  const unchanged = await (
    await fetch(`${server.url}/rooms/${room.id}`, { headers: hostHeaders })
  ).json();
  expect(
    unchanged.players.map((player: { id: string }) => player.id),
  ).not.toContain(headers["x-client-id"]);
});

it("synchronizes confirmed names across tabs without saving another tab's draft", async () => {
  const guest = await client(1440);
  try {
    await guest.page.getByText(/^Playing as /).waitFor();
    const other = await guest.openPage();
    await other.getByText(/^Playing as /).waitFor();
    await other.getByRole("button", { name: "Edit nickname" }).click();
    const draft = other.getByRole("textbox", { name: "Nickname", exact: true });
    await draft.fill("Unsaved in second tab");
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    await guest.page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Latest across tabs");
    await guest.page.getByRole("button", { name: "Save", exact: true }).click();
    await other
      .getByText("Playing as Latest across tabs", { exact: true })
      .waitFor();
    expect(await draft.inputValue()).toBe("Unsaved in second tab");
    await draft.press("Enter");
    await other
      .getByRole("alert")
      .getByText(/nickname changed/)
      .waitFor();
    expect(await draft.inputValue()).toBe("Unsaved in second tab");
    expect(
      await (
        await other.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        })
      ).json(),
    ).toMatchObject({ displayName: "Latest across tabs" });
    await guest.page.close();
    await other.close();
    const reopened = await guest.openPage();
    await reopened
      .getByText("Playing as Latest across tabs", { exact: true })
      .waitFor();
  } finally {
    await guest.close();
  }
});

it("restores the latest preference after server restart before simultaneous tab entry", async () => {
  const guest = await client(1440);
  try {
    await guest.page.getByText(/^Playing as /).waitFor();
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    await guest.page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Remember after restart");
    await guest.page.getByRole("button", { name: "Save", exact: true }).click();
    await guest.page
      .getByText("Playing as Remember after restart", { exact: true })
      .waitFor();
    const before = await (
      await guest.page.request.get(`${server.url}/profile`, {
        headers: { "x-client-id": guest.id },
      })
    ).json();
    await guest.page.close();
    await server.restart();
    const [first, second] = await Promise.all([
      guest.openPage(),
      guest.openPage(),
    ]);
    for (const page of [first, second])
      await page
        .getByText("Playing as Remember after restart", { exact: true })
        .waitFor();
    const after = await (
      await first.request.get(`${server.url}/profile`, {
        headers: { "x-client-id": guest.id },
      })
    ).json();
    expect(after.generation).not.toBe(before.generation);
    expect(after.revision).toBe(0);
    const stale = await first.request.patch(`${server.url}/profile`, {
      headers: { "x-client-id": guest.id },
      data: {
        displayName: "Old generation",
        base: { generation: before.generation, revision: before.revision },
      },
    });
    expect(stale.status()).toBe(409);
    await first.getByRole("button", { name: /Create a Game/ }).click();
    await first.getByRole("heading", { name: /^Room #/ }).waitFor();
    await first
      .getByText("Remember after restart (you)", { exact: true })
      .waitFor();
    const room = await (
      await first.request.get(
        `${server.url}/rooms/by-slug/${new URL(first.url()).pathname.split("/").pop()}`,
        { headers: { "x-client-id": guest.id } },
      )
    ).json();
    expect(room.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: guest.id,
          displayName: "Remember after restart",
        }),
      ]),
    );
  } finally {
    await guest.close();
  }
}, 15000);

it("keeps the remembered nickname recoverable when restoration fails after restart", async () => {
  const guest = await client(1440, "Retained on failure");
  try {
    await guest.page
      .getByText("Playing as Retained on failure", { exact: true })
      .waitFor();
    await guest.page.close();
    await server.restart();
    await guest.page
      .context()
      .route(`${server.url}/profile`, (route) => route.abort("failed"));
    const reopened = await guest.openPage();
    await reopened
      .getByRole("alert")
      .getByText(/Couldn't load your nickname/)
      .waitFor();
    await guest.page.context().unroute(`${server.url}/profile`);
    await reopened.getByRole("button", { name: /Create a Game/ }).click();
    await reopened
      .getByText("Retained on failure (you)", { exact: true })
      .waitFor();
    expect(
      await (
        await reopened.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        })
      ).json(),
    ).toMatchObject({ displayName: "Retained on failure" });
  } finally {
    await guest.close();
  }
}, 15000);

it("keeps a new-generation confirmation when a reopened tab cannot update old stored data", async () => {
  const guest = await client(1440, "Old stored name");
  try {
    await guest.page
      .getByText("Playing as Old stored name", { exact: true })
      .waitFor();
    await guest.page.close();
    await server.restart();
    await guest.page.context().addInitScript(blockNicknameStorageWrites);
    const reopened = await guest.openPage();
    await reopened
      .getByText("Playing as Old stored name", { exact: true })
      .waitFor();
    await reopened.getByRole("button", { name: "Edit nickname" }).click();
    await reopened
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Newest without storage");
    await reopened.getByRole("button", { name: "Save", exact: true }).click();
    await reopened
      .getByText("Playing as Newest without storage", { exact: true })
      .waitFor();
    expect(
      await (
        await reopened.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        })
      ).json(),
    ).toMatchObject({ displayName: "Newest without storage" });
  } finally {
    await guest.close();
  }
}, 15000);

it("queues a save behind a delayed initialization without restoring its older response", async () => {
  const guest = await client(1440);
  let release = () => {};
  try {
    await guest.page.getByText(/^Playing as /).waitFor();
    const delay = await delayProfileResponse(guest.page.context(), "POST");
    release = delay.release;
    const opening = guest.openPage();
    await delay.intercepted;
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    await guest.page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("After delayed read");
    await guest.page.getByRole("button", { name: "Save", exact: true }).click();
    await guest.page
      .getByRole("button", { name: "Saving...", exact: true })
      .waitFor();
    release();
    const other = await opening;
    await other
      .getByText("Playing as After delayed read", { exact: true })
      .waitFor();
    await guest.page
      .getByText("Playing as After delayed read", { exact: true })
      .waitFor();
    await guest.page.context().unroute(`${server.url}/profile`);
    await other.close();
    await guest.page.close();
    const reopened = await guest.openPage();
    await reopened
      .getByText("Playing as After delayed read", { exact: true })
      .waitFor();
  } finally {
    release();
    await guest.close();
  }
}, 15000);

it("ignores an older save response after a stale tab reviews and confirms a newer draft", async () => {
  const guest = await client(1440);
  let release = () => {};
  try {
    await guest.page.getByText(/^Playing as /).waitFor();
    const other = await guest.openPage();
    await other.getByText(/^Playing as /).waitFor();
    for (const page of [guest.page, other])
      await page.getByRole("button", { name: "Edit nickname" }).click();
    const delay = await delayProfileResponse(guest.page, "PATCH");
    release = delay.release;
    await guest.page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Delayed accepted name");
    await guest.page.getByRole("button", { name: "Save", exact: true }).click();
    await delay.intercepted;
    const input = other.getByRole("textbox", { name: "Nickname", exact: true });
    await input.fill("Newer reviewed name");
    await input.press("Enter");
    await other
      .getByRole("alert")
      .getByText(/nickname changed/)
      .waitFor();
    await other
      .getByText("Playing as Delayed accepted name", { exact: true })
      .waitFor();
    expect(await input.inputValue()).toBe("Newer reviewed name");
    await input.press("Enter");
    await other
      .getByText("Playing as Newer reviewed name", { exact: true })
      .waitFor();
    release();
    await guest.page.getByRole("button", { name: "Edit nickname" }).waitFor();
    await guest.page
      .getByText("Playing as Newer reviewed name", { exact: true })
      .waitFor();
    await guest.page.close();
    await other.close();
    const reopened = await guest.openPage();
    await reopened
      .getByText("Playing as Newer reviewed name", { exact: true })
      .waitFor();
  } finally {
    release();
    await guest.close();
  }
}, 15000);

it("ignores a delayed save from a previous server generation", async () => {
  const guest = await client(1440, "Before restart");
  let release = () => {};
  try {
    await guest.page
      .getByText("Playing as Before restart", { exact: true })
      .waitFor();
    const delay = await delayProfileResponse(guest.page, "PATCH");
    release = delay.release;
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    await guest.page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Lost with old server");
    await guest.page.getByRole("button", { name: "Save", exact: true }).click();
    await delay.intercepted;
    await server.restart();
    const other = await guest.openPage();
    await other
      .getByText("Playing as Before restart", { exact: true })
      .waitFor();
    await other.getByRole("button", { name: "Edit nickname" }).click();
    await other
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Confirmed on new server");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await other
      .getByText("Playing as Confirmed on new server", { exact: true })
      .waitFor();
    release();
    await guest.page.getByRole("button", { name: "Edit nickname" }).waitFor();
    await guest.page
      .getByText("Playing as Confirmed on new server", { exact: true })
      .waitFor();
    await guest.page.close();
    await other.close();
    const reopened = await guest.openPage();
    await reopened
      .getByText("Playing as Confirmed on new server", { exact: true })
      .waitFor();
  } finally {
    release();
    await guest.close();
  }
}, 15000);

it("restores an invite nickname when initialization delivery spans a server restart", async () => {
  const guest = await client(1440, "Restore before invite");
  let release = () => {};
  try {
    await guest.page
      .getByText("Playing as Restore before invite", { exact: true })
      .waitFor();
    await guest.page.close();
    const delay = await delayProfileResponse(guest.page.context(), "POST");
    release = delay.release;
    const opening = guest.openPage("/room/restart-invite");
    await delay.intercepted;
    await server.restart();
    release();
    const invite = await opening;
    await invite
      .getByText("Restore before invite (you)", { exact: true })
      .waitFor();
    expect(
      await (
        await invite.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        })
      ).json(),
    ).toMatchObject({ displayName: "Restore before invite" });
  } finally {
    release();
    await guest.close();
  }
}, 15000);

it("restores the confirmed nickname when Lobby Shuffle runs after a server restart", async () => {
  const guest = await client(1440, "Remember through Shuffle");
  let release = () => {};
  try {
    await guest.page
      .getByText("Playing as Remember through Shuffle", { exact: true })
      .waitFor();
    await guest.page.getByRole("button", { name: /Create a Game/ }).click();
    await guest.page
      .getByText("Remember through Shuffle (you)", { exact: true })
      .waitFor();
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    let started = () => {};
    const renewing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    await guest.page.route(
      `${server.url}/rooms/*/socket-token`,
      async (route) => {
        started();
        await delivery;
        await route.abort("failed").catch(() => {});
      },
    );
    await server.restart();
    await renewing;
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .click();
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .waitFor();
    const home = await guest.openPage();
    await home
      .getByText("Playing as Remember through Shuffle", { exact: true })
      .waitFor();
    expect(
      await (
        await home.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        })
      ).json(),
    ).toMatchObject({ displayName: "Remember through Shuffle" });
  } finally {
    release();
    await guest.close();
  }
}, 15000);

it.each([1440, 390])(
  "chooses and remembers a confirmed nickname at %ipx",
  async (width) => {
    const guest = await client(width);
    const page = guest.page;
    try {
      const playing = page.getByText(/^Playing as /);
      await playing.waitFor();
      const original = await playing.textContent();
      expect(original).toMatch(/^Playing as [A-Za-z]{3,8}$/);
      const storedNickname = () =>
        page.evaluate(
          (id) => localStorage.getItem(`montoncito:nickname:${id}`),
          guest.id,
        );
      expect(await storedNickname()).toBe(original!.replace("Playing as ", ""));
      await page.getByRole("button", { name: "Edit nickname" }).click();
      const input = page.getByRole("textbox", {
        name: "Nickname",
        exact: true,
      });
      expect(await input.inputValue()).toBe(
        original!.replace("Playing as ", ""),
      );
      await page.getByRole("button", { name: "Shuffle" }).click();
      expect(await input.inputValue()).not.toBe(
        original!.replace("Playing as ", ""),
      );
      expect(await playing.textContent()).toBe(original);
      await input.press("Escape");
      expect(await playing.textContent()).toBe(original);
      expect(await storedNickname()).toBe(original!.replace("Playing as ", ""));
      await page.getByRole("button", { name: "Edit nickname" }).click();
      await input.fill("   ");
      await input.press("Enter");
      await page.getByRole("alert").getByText("Enter a nickname.").waitFor();
      await input.fill("x".repeat(33));
      await input.press("Enter");
      await page
        .getByRole("alert")
        .getByText("Use 32 characters or fewer.")
        .waitFor();
      await input.fill("  小 Moki!  ");
      await input.press("Enter");
      await page.getByText("Playing as 小 Moki!", { exact: true }).waitFor();
      expect(await storedNickname()).toBe("小 Moki!");
      expect(
        await (
          await page.request.get(`${server.url}/profile`, {
            headers: { "x-client-id": guest.id },
          })
        ).json(),
      ).toMatchObject({ clientId: guest.id, displayName: "小 Moki!" });
      // Reopen with retained browser storage, as a normal returning guest.
      const next = await page.context().newPage();
      next.setDefaultTimeout(5000);
      next.on("pageerror", (error) => guest.errors.push(error.message));
      await page.close();
      await next.goto("http://localhost:4173/");
      await next.addStyleTag({ content: css });
      await next.addScriptTag({ content: script });
      await next
        .getByText("Playing as 小 Moki!", { exact: true })
        .waitFor()
        .catch(async (error) => {
          throw new Error(
            `${error}\n${guest.errors.join("\n")}\n${await next.locator("body").innerText()}`,
          );
        });
      await next.getByRole("button", { name: /Create a Game/ }).click();
      await next.waitForURL("**/room/**");
      await next.getByText("小 Moki! (you)", { exact: true }).waitFor();
    } finally {
      await guest.close();
    }
  },
  20_000,
);

it("retains the draft and confirmed nickname on failure and prevents duplicate saves", async () => {
  const guest = await client(390, "Moki");
  const page = guest.page;
  try {
    await page.getByText("Playing as Moki", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit nickname" }).click();
    const input = page.getByRole("textbox", { name: "Nickname", exact: true });
    await input.fill("Zibble");
    let submissions = 0;
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`${server.url}/profile`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      submissions++;
      await delivery;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    });
    await input.press("Enter");
    await page.getByRole("button", { name: "Saving..." }).waitFor();
    expect(await input.isDisabled()).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Cancel", exact: true })
        .isDisabled(),
    ).toBe(true);
    await input.press("Enter");
    release();
    await page
      .getByRole("alert")
      .getByText("Couldn't save your nickname. Please try again.")
      .waitFor();
    expect(submissions).toBe(1);
    expect(await input.inputValue()).toBe("Zibble");
    expect(
      await page.evaluate(
        (id) => localStorage.getItem(`montoncito:nickname:${id}`),
        guest.id,
      ),
    ).toBe("Moki");
    expect(
      await page.getByText("Playing as Moki", { exact: true }).isVisible(),
    ).toBe(true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.unroute(`${server.url}/profile`);
    await page.getByRole("button", { name: "Edit nickname" }).click();
    expect(await input.inputValue()).toBe("Moki");
    await page.getByRole("button", { name: "Shuffle" }).click();
    const suggestion = await input.inputValue();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText(`Playing as ${suggestion}`, { exact: true }).waitFor();
  } finally {
    await guest.close();
  }
}, 20_000);

it("edits only your Lobby row, delivers live renames, preserves readiness and rejects capitalization conflicts", async () => {
  const host = await client(1440, "Boppo");
  const guest = await client(390, "Moki");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    await guest.page.getByRole("button", { name: /Join a Game/ }).click();
    await guest.page.getByPlaceholder("Enter game ID").fill(slug);
    await guest.page.getByRole("button", { name: "Confirm" }).click();
    await guest.page.getByText("Moki (you)", { exact: true }).waitFor();
    await host.page.getByText("Moki", { exact: true }).waitFor();
    for (const player of [host, guest]) {
      expect(
        await player.page
          .getByRole("button", { name: "Edit nickname" })
          .count(),
      ).toBe(1);
      expect(
        await player.page.getByText(player.id, { exact: true }).count(),
      ).toBe(0);
    }
    const ready = guest.page.getByRole("checkbox", { name: "I'm Ready" });
    await ready.click();
    await host.page.locator('[title="Ready"]').waitFor();
    await guest.page.getByRole("button", { name: "Edit nickname" }).click();
    const input = guest.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await input.fill(" boppo ");
    await input.press("Enter");
    await guest.page
      .getByRole("alert")
      .getByText(/already used in a Lobby/)
      .waitFor();
    expect(await input.inputValue()).toBe(" boppo ");
    expect(await ready.isChecked()).toBe(true);
    expect(await host.page.getByText("Moki", { exact: true }).isVisible()).toBe(
      true,
    );
    expect(
      await guest.page.getByText("Moki (you)", { exact: true }).isVisible(),
    ).toBe(true);
    await guest.page.getByRole("button", { name: "Shuffle" }).click();
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .waitFor();
    const suggestion = await input.inputValue();
    expect(suggestion.toLowerCase()).not.toBe("boppo");
    await input.fill(" 小 Zibble! ");
    await input.press("Enter");
    await host.page.getByText("小 Zibble!", { exact: true }).waitFor();
    await guest.page.getByText("小 Zibble! (you)", { exact: true }).waitFor();
    expect(await ready.isChecked()).toBe(true);
    await host.page.getByRole("button", { name: "Edit nickname" }).click();
    const hostInput = host.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await hostInput.fill("Host draft");
    await hostInput.press("Escape");
    await host.page.getByRole("button", { name: "Edit nickname" }).click();
    expect(await hostInput.inputValue()).toBe("Boppo");
    await hostInput.fill("Fizzi");
    await hostInput.press("Enter");
    await guest.page.getByText("Fizzi", { exact: true }).waitFor();
    expect(host.errors).toEqual([]);
    expect(guest.errors.filter((error) => !error.includes("409"))).toEqual([]);
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it.each(["ready", "settings"])(
  "retains a live nickname after a delayed %s response",
  async (operation) => {
    const host = await client(1440, "Boppo");
    const guest = await client(390, "Moki");
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await host.page.getByRole("button", { name: /Create a Game/ }).click();
      await host.page.waitForURL("**/room/**");
      const slug = host.page.url().split("/").pop()!;
      await guest.page.getByRole("button", { name: /Join a Game/ }).click();
      await guest.page.getByPlaceholder("Enter game ID").fill(slug);
      await guest.page.getByRole("button", { name: "Confirm" }).click();
      await guest.page.getByText("Moki (you)", { exact: true }).waitFor();
      const target = operation === "ready" ? guest : host;
      const path =
        operation === "ready"
          ? `${server.url}/rooms/*/ready`
          : `${server.url}/rooms/*`;
      await target.page.route(path, async (route) => {
        if (
          route.request().method() !==
          (operation === "ready" ? "POST" : "PATCH")
        )
          return route.continue();
        const response = await route.fetch();
        await delivery;
        await route.fulfill({ response });
      });
      if (operation === "ready") {
        await guest.page.getByRole("checkbox", { name: "I'm Ready" }).click();
        await host.page.locator('[title="Ready"]').waitFor();
      } else {
        await host.page.getByRole("combobox").selectOption("private");
        await vi.waitFor(async () =>
          expect(await guest.page.getByRole("combobox").inputValue()).toBe(
            "private",
          ),
        );
      }
      await target.page.getByRole("button", { name: "Edit nickname" }).click();
      await target.page
        .getByRole("textbox", { name: "Nickname", exact: true })
        .fill("Zibble");
      await target.page
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await target.page.getByText("Zibble (you)", { exact: true }).waitFor();
      const completed = target.page.waitForResponse(
        (response) =>
          response.url().includes("/rooms/") &&
          response.request().method() ===
            (operation === "ready" ? "POST" : "PATCH"),
      );
      release();
      await completed;
      await target.page.waitForTimeout(50);
      expect(
        await target.page
          .getByText("Zibble (you)", { exact: true })
          .isVisible(),
      ).toBe(true);
      expect(
        await target.page
          .getByText(operation === "ready" ? "Moki (you)" : "Boppo (you)", {
            exact: true,
          })
          .count(),
      ).toBe(0);
    } finally {
      release();
      await host.close();
      await guest.close();
    }
  },
  20_000,
);

it("handles exhausted generated names across joined Lobbies and explains a conflict in another Lobby", async () => {
  const guest = await client(390, "Custom nickname");
  const page = guest.page;
  try {
    await page.getByRole("button", { name: /Create a Game/ }).click();
    await page.waitForURL("**/room/**");
    await page.getByText("Custom nickname (you)", { exact: true }).waitFor();
    const profile = await (
      await page.request.get(`${server.url}/profile`, {
        headers: { "x-client-id": guest.id },
      })
    ).json();
    for (const name of profile.suggestions as string[]) {
      if (name === "Moki") continue;
      const id = crypto.randomUUID();
      const headers = { "x-client-id": id };
      await page.request.patch(`${server.url}/profile`, {
        headers,
        data: { displayName: name },
      });
      const room = await (
        await page.request.post(`${server.url}/rooms`, { headers })
      ).json();
      const joined = await page.request.post(
        `${server.url}/rooms/${room.id}/join`,
        { headers: { "x-client-id": guest.id } },
      );
      expect(joined.status()).toBe(201);
    }
    await page.getByRole("button", { name: "Edit nickname" }).click();
    const input = page.getByRole("textbox", { name: "Nickname", exact: true });
    await input.fill("Moki");
    await page.getByRole("button", { name: "Shuffle" }).click();
    await page
      .getByRole("alert")
      .getByText(
        "Your draft is the only available generated nickname. You can save it or enter your own.",
      )
      .waitFor();
    expect(await input.inputValue()).toBe("Moki");
    const otherId = crypto.randomUUID();
    const otherHeaders = { "x-client-id": otherId };
    await page.request.patch(`${server.url}/profile`, {
      headers: otherHeaders,
      data: { displayName: "Moki" },
    });
    const lastRoom = await (
      await page.request.post(`${server.url}/rooms`, { headers: otherHeaders })
    ).json();
    expect(
      (
        await page.request.post(`${server.url}/rooms/${lastRoom.id}/join`, {
          headers: { "x-client-id": guest.id },
        })
      ).status(),
    ).toBe(201);
    await input.fill("Custom nickname");
    await page.getByRole("button", { name: "Shuffle" }).click();
    await page
      .getByRole("alert")
      .getByText(
        "No generated nicknames are available. Enter your own nickname.",
      )
      .waitFor();
    expect(await input.inputValue()).toBe("Custom nickname");
    await input.fill("moki");
    await input.press("Enter");
    await page
      .getByRole("alert")
      .getByText(/It may be another Lobby/)
      .waitFor();
    expect(await input.inputValue()).toBe("moki");
    expect(
      await page
        .getByText("Custom nickname (you)", { exact: true })
        .isVisible(),
    ).toBe(true);
    await input.fill("A custom replacement!");
    await input.press("Enter");
    await page
      .getByText("A custom replacement! (you)", { exact: true })
      .waitFor();
  } finally {
    await guest.close();
  }
}, 20_000);

it.each([false, true])(
  "ignores a late Lobby save after departure with failed storage writes=%s",
  async (failStorageWrites) => {
    const guest = await client(1440, "Moki");
    const page = guest.page;
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await page.getByRole("button", { name: /Create a Game/ }).click();
      await page.waitForURL("**/room/**");
      await page.getByRole("button", { name: "Edit nickname" }).click();
      let firstSave = true;
      await page.route(`${server.url}/profile`, async (route) => {
        if (route.request().method() !== "PATCH" || !firstSave)
          return route.continue();
        firstSave = false;
        const response = await route.fetch();
        await delivery;
        await route.fulfill({ response });
      });
      await page
        .getByRole("textbox", { name: "Nickname", exact: true })
        .fill("Zibble");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Zibble (you)", { exact: true }).waitFor();
      await page.getByTitle("Exit room").click();
      await page.getByText("Playing as Zibble", { exact: true }).waitFor();
      if (failStorageWrites) await page.evaluate(blockNicknameStorageWrites);
      await page.getByRole("button", { name: "Edit nickname" }).click();
      await page
        .getByRole("textbox", { name: "Nickname", exact: true })
        .fill("Fizzi");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Playing as Fizzi", { exact: true }).waitFor();
      release();
      await page.waitForTimeout(100);
      expect(
        await page.getByText("Playing as Fizzi", { exact: true }).isVisible(),
      ).toBe(true);
      expect(
        await page
          .getByRole("textbox", { name: "Nickname", exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page.evaluate(
          (id) => localStorage.getItem(`montoncito:nickname:${id}`),
          guest.id,
        ),
      ).toBe(failStorageWrites ? "Zibble" : "Fizzi");
    } finally {
      release();
      await guest.close();
    }
  },
  20_000,
);

it.each(["before", "after"] as const)(
  "discards a delayed Lobby save accepted %s match start",
  async (ordering) => {
    const host = await client(1440, "Boppo");
    const guest = await client(390, "Moki");
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted!: () => void;
    const saved = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    try {
      await host.page.getByRole("button", { name: /Create a Game/ }).click();
      await host.page.waitForURL("**/room/**");
      const slug = host.page.url().split("/").pop()!;
      await guest.page.getByRole("button", { name: /Join a Game/ }).click();
      await guest.page.getByPlaceholder("Enter game ID").fill(slug);
      await guest.page.getByRole("button", { name: "Confirm" }).click();
      await guest.page.getByText("Moki (you)", { exact: true }).waitFor();
      await guest.page.getByRole("checkbox", { name: "I'm Ready" }).click();
      await host.page.locator('[title="Ready"]').waitFor();
      await guest.page.getByRole("button", { name: "Edit nickname" }).click();
      await guest.page.route(`${server.url}/profile`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        if (ordering === "before") {
          const response = await route.fetch();
          accepted();
          await delivery;
          await route.fulfill({ response });
        } else {
          await delivery;
          await route.continue();
        }
      });
      await guest.page
        .getByRole("textbox", { name: "Nickname", exact: true })
        .fill("Zibble");
      await guest.page
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await guest.page.getByRole("button", { name: "Saving..." }).waitFor();
      if (ordering === "before") await saved;
      await host.page
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await guest.page.waitForURL("**/game/**");
      await vi.waitFor(() =>
        expect(guest.snapshot()?.state.byId[guest.id]?.name).toBe(
          ordering === "before" ? "Zibble" : "Moki",
        ),
      );
      const snapshot = guest.snapshot();
      release();
      await vi.waitFor(async () => {
        const response = await guest.page.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": guest.id },
        });
        expect(await response.json()).toMatchObject({ displayName: "Zibble" });
      });
      expect(guest.snapshot()).toEqual(snapshot);
      expect(
        await guest.page
          .getByRole("textbox", { name: "Nickname", exact: true })
          .count(),
      ).toBe(0);
      await vi.waitFor(async () =>
        expect(
          await guest.page.evaluate(
            (id) => localStorage.getItem(`montoncito:nickname:${id}`),
            guest.id,
          ),
        ).toBe("Zibble"),
      );
      const home = await guest.page.context().newPage();
      await home.goto("http://localhost:4173/");
      await home.addStyleTag({ content: css });
      await home.addScriptTag({ content: script });
      await home.getByText("Playing as Zibble", { exact: true }).waitFor();
    } finally {
      release();
      await host.close();
      await guest.close();
    }
  },
  20_000,
);

it("restores a browser nickname before joining a direct invite", async () => {
  const host = await client(1440, "Boppo");
  const guest = await client(390);
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    const id = await guest.page.evaluate(() => {
      const id = crypto.randomUUID();
      localStorage.setItem("montoncito:clientId", id);
      localStorage.setItem(`montoncito:nickname:${id}`, "Invite Moki!");
      return id;
    });
    await guest.page.goto(`http://localhost:4173/room/${slug}`);
    await guest.page.addStyleTag({ content: css });
    await guest.page.addScriptTag({ content: script });
    await guest.page.getByText("Invite Moki! (you)", { exact: true }).waitFor();
    await host.page.getByText("Invite Moki!", { exact: true }).waitFor();
    expect(
      await (
        await guest.page.request.get(`${server.url}/profile`, {
          headers: { "x-client-id": id },
        })
      ).json(),
    ).toMatchObject({ clientId: id, displayName: "Invite Moki!" });
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it("resolves a direct-invite capitalization conflict only after explicit confirmation", async () => {
  const host = await client(1440, "Moki");
  const guest = await client(390, "moki");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    const openInvite = async () => {
      await guest.page.goto(`http://localhost:4173/room/${slug}`);
      await guest.page.addStyleTag({ content: css });
      await guest.page.addScriptTag({ content: script });
    };
    const stored = () =>
      guest.page.evaluate(
        (id) => localStorage.getItem(`montoncito:nickname:${id}`),
        guest.id,
      );
    await openInvite();
    const input = guest.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await input.waitFor();
    expect(await input.inputValue()).not.toBe("Moki");
    expect(await stored()).toBe("moki");
    expect(
      await guest.page.getByText("I'm Ready", { exact: true }).count(),
    ).toBe(0);
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .click();
    expect(await stored()).toBe("moki");
    await guest.page
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await guest.page.waitForURL("http://localhost:4173/");
    expect(await stored()).toBe("moki");
    await openInvite();
    await input.fill("MOKI");
    await input.press("Enter");
    await guest.page
      .getByRole("alert")
      .getByText(/already used/)
      .waitFor();
    expect(await input.inputValue()).toBe("MOKI");
    expect(await stored()).toBe("moki");
    await input.fill("  Invite guest!  ");
    await input.press("Enter");
    await guest.page
      .getByText("Invite guest! (you)", { exact: true })
      .waitFor();
    await host.page.getByText("Invite guest!", { exact: true }).waitFor();
    expect(await stored()).toBe("Invite guest!");
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it("keeps the invite draft recoverable when a suggestion is taken, then reconciles a lost admission response", async () => {
  const host = await client(1440, "Moki");
  const guest = await client(390, "moki");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    // The homepage flow reaches the same pre-admission editor.
    await guest.page.getByRole("button", { name: /Join a Game/ }).click();
    await guest.page.getByPlaceholder("Enter game ID").fill(slug);
    await guest.page
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    const input = guest.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await input.waitFor();
    const suggested = await input.inputValue();
    // Public ordering: the host takes the suggestion before Save reaches admission.
    expect(
      (
        await host.page.request.patch(`${server.url}/profile`, {
          headers: { "x-client-id": host.id },
          data: { displayName: suggested.toUpperCase() },
        })
      ).ok(),
    ).toBe(true);
    await input.press("Enter");
    await guest.page
      .getByRole("alert")
      .getByText(/already used/)
      .waitFor();
    expect(await input.inputValue()).toBe(suggested);
    const headers = { "x-client-id": guest.id };
    expect(
      await (
        await guest.page.request.get(`${server.url}/profile`, { headers })
      ).json(),
    ).toMatchObject({ displayName: "moki" });
    const view = await (
      await guest.page.request.get(`${server.url}/rooms/by-slug/${slug}`, {
        headers,
      })
    ).json();
    expect(view.players).toHaveLength(1);
    expect(
      await guest.page.evaluate(
        (id) => localStorage.getItem(`montoncito:nickname:${id}`),
        guest.id,
      ),
    ).toBe("moki");
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .click();
    await expect
      .poll(async () => (await input.inputValue()).toLowerCase())
      .not.toBe(suggested.toLowerCase());
    await input.fill("Recovered guest");
    let replacements = 0;
    await guest.page.route(
      `${server.url}/rooms/${view.id}/join`,
      async (route) => {
        if (route.request().postDataJSON().displayName) {
          replacements++;
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.abort("failed");
        } else await route.continue();
      },
    );
    await input.press("Enter");
    await guest.page
      .getByText("Recovered guest (you)", { exact: true })
      .waitFor();
    await host.page.getByText("Recovered guest", { exact: true }).waitFor();
    const joined = await (
      await guest.page.request.get(`${server.url}/rooms/by-slug/${slug}`, {
        headers,
      })
    ).json();
    expect(
      joined.players.filter((p: { id: string }) => p.id === guest.id),
    ).toHaveLength(1);
    expect(replacements).toBe(1);
    expect(
      await guest.page.evaluate(
        (id) => localStorage.getItem(`montoncito:nickname:${id}`),
        guest.id,
      ),
    ).toBe("Recovered guest");
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it("shows pending join initialization and a recoverable error inside the join dialog", async () => {
  const guest = await client(390, "Moki");
  const page = guest.page;
  try {
    await page.getByText("Playing as Moki", { exact: true }).waitFor();
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`${server.url}/profile`, async (route) => {
      await delivery;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.getByRole("button", { name: /Join a Game/ }).click();
    await page.getByPlaceholder("Enter game ID").fill("test-1234");
    await page.getByRole("button", { name: "Confirm" }).click();
    const joining = page.getByRole("button", { name: "Joining..." });
    await joining.waitFor();
    expect(await joining.isDisabled()).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Cancel", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.keyboard.press("Escape");
    expect(await joining.isVisible()).toBe(true);
    release();
    await page
      .getByRole("alert")
      .getByText("Couldn't load your nickname. Please try again.")
      .waitFor();
    expect(
      await page.getByRole("button", { name: "Confirm" }).isEnabled(),
    ).toBe(true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(new URL(page.url()).pathname).toBe("/");
  } finally {
    await guest.close();
  }
}, 20_000);

it("allows a custom invite replacement when target and joined Lobbies exhaust generated suggestions", async () => {
  const host = await client(1440, "Moki");
  const guest = await client(390, "moki");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    const headers = { "x-client-id": guest.id };
    const profile = await (
      await guest.page.request.get(`${server.url}/profile`, { headers })
    ).json();
    for (const name of profile.suggestions as string[]) {
      if (name === "Moki") continue;
      const otherHeaders = { "x-client-id": crypto.randomUUID() };
      await guest.page.request.patch(`${server.url}/profile`, {
        headers: otherHeaders,
        data: { displayName: name },
      });
      const room = await (
        await guest.page.request.post(`${server.url}/rooms`, {
          headers: otherHeaders,
        })
      ).json();
      expect(
        (
          await guest.page.request.post(`${server.url}/rooms/${room.id}/join`, {
            headers,
          })
        ).status(),
      ).toBe(201);
    }
    await guest.page.goto(`http://localhost:4173/room/${slug}`);
    await guest.page.addStyleTag({ content: css });
    await guest.page.addScriptTag({ content: script });
    const input = guest.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await input.waitFor();
    expect(await input.inputValue()).toBe("moki");
    await guest.page
      .getByRole("button", { name: "Shuffle", exact: true })
      .click();
    await guest.page
      .getByRole("alert")
      .getByText(
        "No generated nicknames are available. Enter your own nickname.",
      )
      .waitFor();
    await input.fill("BOPPO");
    await input.press("Enter");
    await guest.page
      .getByRole("alert")
      .getByText(/another Lobby you have joined/)
      .waitFor();
    expect(await input.inputValue()).toBe("BOPPO");
    await input.fill("My custom invite name");
    await input.press("Enter");
    await guest.page
      .getByText("My custom invite name (you)", { exact: true })
      .waitFor();
    await host.page
      .getByText("My custom invite name", { exact: true })
      .waitFor();
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it.each(["started", "kicked", "deleted"] as const)(
  "reconciles a lost replacement response after the Lobby is %s",
  async (outcome) => {
    server.scenario("seeded");
    const host = await client(1440, "Moki");
    const guest = await client(390, "moki");
    try {
      await host.page.getByRole("button", { name: /Create a Game/ }).click();
      await host.page.waitForURL("**/room/**");
      const slug = host.page.url().split("/").pop()!;
      const hostHeaders = { "x-client-id": host.id };
      const guestHeaders = { "x-client-id": guest.id };
      const room = await (
        await host.page.request.get(`${server.url}/rooms/by-slug/${slug}`, {
          headers: hostHeaders,
        })
      ).json();
      await guest.page.goto(`http://localhost:4173/room/${slug}`);
      await guest.page.addStyleTag({ content: css });
      await guest.page.addScriptTag({ content: script });
      const input = guest.page.getByRole("textbox", {
        name: "Nickname",
        exact: true,
      });
      await input.fill("Confirmed replacement");
      await guest.page.route(
        `${server.url}/rooms/${room.id}/join`,
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          if (outcome === "started") {
            await host.page.request.post(
              `${server.url}/rooms/${room.id}/ready`,
              { headers: guestHeaders, data: { ready: true } },
            );
            expect(
              (
                await host.page.request.post(
                  `${server.url}/rooms/${room.id}/start`,
                  { headers: hostHeaders },
                )
              ).ok(),
            ).toBe(true);
          } else if (outcome === "kicked") {
            expect(
              (
                await host.page.request.post(
                  `${server.url}/rooms/${room.id}/kick/${guest.id}`,
                  { headers: hostHeaders },
                )
              ).ok(),
            ).toBe(true);
          } else {
            await host.page.request.post(
              `${server.url}/rooms/${room.id}/leave`,
              { headers: hostHeaders },
            );
            await host.page.request.post(
              `${server.url}/rooms/${room.id}/leave`,
              { headers: guestHeaders },
            );
          }
          await route.abort("failed");
        },
      );
      await input.press("Enter");
      if (outcome === "started") {
        await guest.page.waitForURL(`**/game/${room.id}`);
      } else if (outcome === "kicked") {
        await guest.page
          .getByRole("alert")
          .getByText(/Your confirmed nickname is Confirmed replacement/)
          .waitFor();
        expect(await input.inputValue()).toBe("Confirmed replacement");
        expect(
          await guest.page.evaluate(
            (id) => localStorage.getItem(`montoncito:nickname:${id}`),
            guest.id,
          ),
        ).toBe("Confirmed replacement");
        const view = await (
          await host.page.request.get(`${server.url}/rooms/${room.id}`, {
            headers: hostHeaders,
          })
        ).json();
        expect(view.players).not.toContainEqual(
          expect.objectContaining({ id: guest.id }),
        );
      } else {
        await guest.page
          .getByRole("alert")
          .getByText(/This Lobby no longer exists/)
          .waitFor();
        expect(
          (
            await guest.page.request.get(`${server.url}/rooms/${room.id}`, {
              headers: guestHeaders,
            })
          ).status(),
        ).toBe(404);
        let pageCount = 1;
        for (let page = 1; page <= pageCount; page++) {
          const listed = await (
            await guest.page.request.get(
              `${server.url}/rooms?limit=50&page=${page}`,
            )
          ).json();
          pageCount = listed.pages;
          expect(listed.items).not.toContainEqual(
            expect.objectContaining({ slug }),
          );
        }
      }
    } finally {
      await host.close();
      await guest.close();
    }
  },
  20_000,
);

it("checks unresolved admission before retrying Save after the match starts", async () => {
  server.scenario("seeded");
  const host = await client(1440, "Moki");
  const guest = await client(390, "moki");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    const hostHeaders = { "x-client-id": host.id };
    const guestHeaders = { "x-client-id": guest.id };
    const room = await (
      await host.page.request.get(`${server.url}/rooms/by-slug/${slug}`, {
        headers: hostHeaders,
      })
    ).json();
    await guest.page.goto(`http://localhost:4173/room/${slug}`);
    await guest.page.addStyleTag({ content: css });
    await guest.page.addScriptTag({ content: script });
    const input = guest.page.getByRole("textbox", {
      name: "Nickname",
      exact: true,
    });
    await input.fill("Unresolved replacement");
    let joins = 0;
    await guest.page.route(
      `${server.url}/rooms/${room.id}/join`,
      async (route) => {
        joins++;
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      },
    );
    await guest.page.route(`${server.url}/profile`, async (route) => {
      if (["GET", "POST"].includes(route.request().method()))
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        });
      else await route.continue();
    });
    await input.press("Enter");
    await guest.page
      .getByRole("alert")
      .getByText(/Couldn't confirm whether you joined/)
      .waitFor();
    expect(await input.inputValue()).toBe("Unresolved replacement");
    await host.page.request.post(`${server.url}/rooms/${room.id}/ready`, {
      headers: guestHeaders,
      data: { ready: true },
    });
    expect(
      (
        await host.page.request.post(`${server.url}/rooms/${room.id}/start`, {
          headers: hostHeaders,
        })
      ).ok(),
    ).toBe(true);
    await guest.page.unroute(`${server.url}/profile`);
    await input.press("Enter");
    await guest.page.waitForURL(`**/game/${room.id}`);
    expect(joins).toBe(1);
    expect(
      await guest.page.evaluate(
        (id) => localStorage.getItem(`montoncito:nickname:${id}`),
        guest.id,
      ),
    ).toBe("Unresolved replacement");
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it("recovers an ordinary admission when its response is lost", async () => {
  const host = await client(1440, "Ordinary host");
  const guest = await client(390, "Ordinary guest");
  try {
    await host.page.getByRole("button", { name: /Create a Game/ }).click();
    await host.page.waitForURL("**/room/**");
    const slug = host.page.url().split("/").pop()!;
    let joins = 0;
    await guest.page.route(`${server.url}/rooms/*/join`, async (route) => {
      joins++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    });
    await guest.page.goto(`http://localhost:4173/room/${slug}`);
    await guest.page.addStyleTag({ content: css });
    await guest.page.addScriptTag({ content: script });
    await guest.page
      .getByText("Ordinary guest (you)", { exact: true })
      .waitFor();
    expect(joins).toBe(1);
    await host.page.getByText("Ordinary guest", { exact: true }).waitFor();
  } finally {
    await host.close();
    await guest.close();
  }
}, 20_000);

it.each(["full", "started"] as const)(
  "retains a %s admission error when loading conflict suggestions",
  async (outcome) => {
    const host = await client(1440, "Moki");
    const guest = await client(390, "moki");
    try {
      await host.page.getByRole("button", { name: /Create a Game/ }).click();
      await host.page.waitForURL("**/room/**");
      const slug = host.page.url().split("/").pop()!;
      const hostHeaders = { "x-client-id": host.id };
      const otherHeaders = { "x-client-id": crypto.randomUUID() };
      const room = await (
        await host.page.request.get(`${server.url}/rooms/by-slug/${slug}`, {
          headers: hostHeaders,
        })
      ).json();
      await guest.page.route(
        `${server.url}/rooms/${room.id}/nickname-suggestions`,
        async (route) => {
          await host.page.request.patch(`${server.url}/profile`, {
            headers: otherHeaders,
            data: { displayName: "Other guest" },
          });
          await host.page.request.post(`${server.url}/rooms/${room.id}/join`, {
            headers: otherHeaders,
          });
          if (outcome === "full") {
            await host.page.request.patch(`${server.url}/rooms/${room.id}`, {
              headers: hostHeaders,
              data: { maxPlayers: 2 },
            });
          } else {
            await host.page.request.post(
              `${server.url}/rooms/${room.id}/ready`,
              { headers: otherHeaders, data: { ready: true } },
            );
            await host.page.request.post(
              `${server.url}/rooms/${room.id}/start`,
              { headers: hostHeaders },
            );
          }
          await route.continue();
        },
      );
      await guest.page.goto(`http://localhost:4173/room/${slug}`);
      await guest.page.addStyleTag({ content: css });
      await guest.page.addScriptTag({ content: script });
      await guest.page
        .getByText(
          outcome === "full" ? /Room is full/ : /Room is not open for joining/,
        )
        .waitFor();
      expect(
        await guest.page
          .getByRole("textbox", { name: "Nickname", exact: true })
          .count(),
      ).toBe(0);
      expect(
        await guest.page
          .getByRole("button", { name: "Retry admission", exact: true })
          .isEnabled(),
      ).toBe(true);
    } finally {
      await host.close();
      await guest.close();
    }
  },
  20_000,
);

async function chat(page: Page, text?: string) {
  const open = page.getByRole("button", { name: /Open chat/ });
  if (await open.isVisible()) await open.click();
  if (text) {
    await page.getByRole("textbox", { name: "Chat message" }).fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  }
}
async function closeChat(page: Page) {
  const close = page.getByRole("button", { name: "Close chat" });
  if (await close.isVisible()) await close.click();
}

async function lobby(
  alice: Awaited<ReturnType<typeof client>>,
  bob: Awaited<ReturnType<typeof client>>,
) {
  await alice.page.getByRole("button", { name: /Create a Game/ }).click();
  await alice.page.waitForURL("**/room/**").catch(() => {
    throw new Error(alice.errors.join("\n"));
  });
  const slug = alice.page.url().split("/").pop()!;
  await alice.page.getByText("Discard piles", { exact: true }).waitFor();
  await alice.page.locator('input[type="number"]').last().fill("2");
  await bob.page.getByRole("button", { name: /Join a Game/ }).click();
  await bob.page.getByPlaceholder("Enter game ID").fill(slug);
  await bob.page.getByRole("button", { name: "Confirm" }).click();
  await bob.page.getByText("Alice", { exact: true }).waitFor();
  await alice.page.getByText("Bob", { exact: true }).waitFor();
  await chat(alice.page, "From the Lobby");
  await bob.page.getByText("From the Lobby", { exact: true }).waitFor();
  await bob.page.getByRole("checkbox").click();
  await alice.page
    .getByRole("button", { name: "Start game", exact: true })
    .click();
  await Promise.all([
    alice.page.waitForURL("**/game/**"),
    bob.page.waitForURL("**/game/**"),
  ]);
  expect(alice.page.url()).toBe(bob.page.url());
  await Promise.all([
    alice.page.getByRole("region", { name: "Game board" }).waitFor(),
    bob.page.getByRole("region", { name: "Game board" }).waitFor(),
  ]);
  await chat(bob.page);
  await bob.page.getByText("From the Lobby", { exact: true }).waitFor();
  await closeChat(bob.page);
  expect(
    await alice.page
      .getByRole("group", { name: /Your Discard piles/ })
      .getByRole("group")
      .count(),
  ).toBe(2);
}

async function synced(
  alice: Awaited<ReturnType<typeof client>>,
  bob: Awaited<ReturnType<typeof client>>,
  seq: number,
) {
  await Promise.all([
    alice.page.getByText(`Sequence ${seq}`, { exact: true }).waitFor(),
    bob.page.getByText(`Sequence ${seq}`, { exact: true }).waitFor(),
  ]);
  expect(alice.snapshot()).toEqual(bob.snapshot());
}

it.each([1440, 390])(
  "keeps match board and chat names across a rename in another tab at %ipx",
  async (width) => {
    server.scenario("seeded");
    const alice = await client(width, "Alice");
    const bob = await client(width, "Bob");
    try {
      await lobby(alice, bob);
      await synced(alice, bob, 0);
      const captured = alice.snapshot();
      const nextTab = async (page: Page) => {
        const tab = await page.context().newPage();
        tab.setDefaultTimeout(5000);
        await tab.goto("http://localhost:4173/");
        await tab.addStyleTag({ content: css });
        await tab.addScriptTag({ content: script });
        return tab;
      };
      const nextAlice = await nextTab(alice.page);
      await nextAlice.getByRole("button", { name: /Create a Game/ }).click();
      await nextAlice.waitForURL("**/room/**");
      const nextSlug = nextAlice.url().split("/").pop()!;
      const nextBob = await nextTab(bob.page);
      await nextBob.getByRole("button", { name: /Join a Game/ }).click();
      await nextBob.getByPlaceholder("Enter game ID").fill(nextSlug);
      await nextBob.getByRole("button", { name: "Confirm" }).click();
      await nextBob.getByText("Alice", { exact: true }).waitFor();
      await nextAlice.getByRole("button", { name: "Edit nickname" }).click();
      await nextAlice
        .getByRole("textbox", { name: "Nickname", exact: true })
        .fill("Future Alice");
      await nextAlice
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await nextAlice
        .getByText("Future Alice (you)", { exact: true })
        .waitFor();
      await nextBob.getByText("Future Alice", { exact: true }).waitFor();
      expect(
        await nextAlice.evaluate(
          (id) => localStorage.getItem(`montoncito:nickname:${id}`),
          alice.id,
        ),
      ).toBe("Future Alice");
      expect(alice.snapshot()).toEqual(captured);
      expect(bob.snapshot()).toEqual(captured);
      for (const page of [alice.page, bob.page]) {
        expect(
          await page.getByRole("button", { name: "Edit nickname" }).count(),
        ).toBe(0);
        expect(
          await page.getByRole("region", { name: "Game board" }).innerText(),
        ).not.toContain("Future Alice");
      }
      await chat(alice.page, "Still Alice in this match");
      await chat(bob.page);
      const log = bob.page.getByRole("log", { name: "Chat messages" });
      await log
        .getByText("Still Alice in this match", { exact: true })
        .waitFor();
      expect(
        await log
          .getByText("Still Alice in this match", { exact: true })
          .locator("..")
          .innerText(),
      ).toBe("Alice: Still Alice in this match");
      expect(
        await log
          .getByText("From the Lobby", { exact: true })
          .locator("..")
          .innerText(),
      ).toBe("Alice: From the Lobby");
      await nextBob.getByRole("checkbox", { name: "I'm Ready" }).click();
      await nextAlice
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await nextBob.waitForURL("**/game/**");
      await nextBob.getByRole("region", { name: "Game board" }).waitFor();
      await nextBob
        .getByRole("heading", { name: "Future Alice", exact: true })
        .waitFor();
      await chat(nextAlice, "New match name");
      await chat(nextBob);
      const nextMessage = nextBob
        .getByRole("log")
        .getByText("New match name", { exact: true });
      await nextMessage.waitFor();
      expect(await nextMessage.locator("..").innerText()).toBe(
        "Future Alice: New match name",
      );
      expect(alice.snapshot()).toEqual(captured);
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      await alice.close();
      await bob.close();
    }
  },
  30_000,
);

it.each([1440, 390])(
  "plays a seeded Lobby-to-winner match with two live clients at %ipx",
  async (width) => {
    server.scenario("seeded");
    const alice = await client(width, "Alice");
    const bob = await client(width, "Bob");
    try {
      await lobby(alice, bob);
      await synced(alice, bob, 0);
      expect(
        alice.snapshot()!.state.byId[alice.id]!.stock.faceDown,
      ).toHaveLength(20);
      expect(alice.snapshot()!.state.byId[bob.id]!.stock.faceDown).toHaveLength(
        20,
      );
      let seq = 0;
      while (alice.snapshot()!.state.phase !== "gameover" && seq < 1500) {
        const state = alice.snapshot()!.state;
        const active = state.turn.activePlayer === alice.id ? alice : bob;
        const passive = active === alice ? bob : alice;
        expect(await passive.page.locator("[data-drag-source]").count()).toBe(
          0,
        );
        const moves = getValidMoves(state, active.id);
        const stock = moves.stockToBuild[0];
        const discard = moves.discardToBuild[0];
        const hand = moves.handToBuild[0];
        let target: string | undefined;
        if (stock) {
          await tap(
            active.page,
            active.page.getByRole("button", { name: /^Stock top / }),
          );
          target = stock.buildId;
        } else if (discard) {
          await tap(
            active.page,
            active.page
              .getByRole("group", {
                name: `${active === alice ? "Alice" : "Bob"} Discard pile ${discard.pileIndex + 1}`,
              })
              .getByRole("button", { name: /^Discard pile / }),
          );
          target = discard.buildId;
        } else if (hand) {
          await tap(
            active.page,
            active.page.locator(`[data-drag-source="hand:${hand.cardId}"]`),
          );
          target = hand.buildId;
        } else if (moves.canDiscard[0]) {
          const move = moves.canDiscard[0];
          await tap(
            active.page,
            active.page.locator(`[data-drag-source="hand:${move.cardId}"]`),
          );
          await tap(
            active.page,
            active.page.getByRole("group", {
              name: `${active === alice ? "Alice" : "Bob"} Discard pile ${move.pileIndex + 1}`,
            }),
          );
        } else {
          await tap(
            active.page,
            active.page.getByRole("button", { name: "End Turn", exact: true }),
          );
        }
        if (target)
          await tap(
            active.page,
            active.page.getByRole("button", {
              name:
                target === "new"
                  ? "New Build pile"
                  : new RegExp(`^Build pile ${target},`),
            }),
          );
        await synced(alice, bob, ++seq);
      }
      const final = alice.snapshot()!.state;
      expect(final.phase).toBe("gameover");
      expect(final.byId[final.winner!]!.stock.faceDown).toHaveLength(0);
      expect(final.turn.number).toBeGreaterThan(2);
      const winner = final.winner === alice.id ? "Alice" : "Bob";
      for (const c of [alice, bob]) {
        await c.page
          .getByRole("heading", {
            name: `${winner} wins!${final.winner === c.id ? " (You)" : ""}`,
            exact: true,
          })
          .waitFor();
        expect(await c.page.locator("[data-drag-source]").count()).toBe(0);
        expect(
          await c.page
            .getByRole("region", { name: "Game board", exact: true })
            .count(),
        ).toBe(1);
        expect(
          await c.page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
      }
      await chat(alice.page, "Good game");
      await chat(bob.page);
      await bob.page.getByText("Good game", { exact: true }).waitFor();
      await chat(bob.page, "See you next match");
      await alice.page
        .getByText("See you next match", { exact: true })
        .waitFor();
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      await alice.close();
      await bob.close();
    }
  },
  240_000,
);

it.each([1440, 390])(
  "clears and recycles Builds, refills Hand, inspects Discards, and wins by Stock at %ipx",
  async (width) => {
    server.scenario("controlled");
    const alice = await client(width, "Alice");
    const bob = await client(width, "Bob");
    try {
      await lobby(alice, bob);
      await synced(alice, bob, 0);
      const stock = alice.page.getByRole("group", {
        name: "Your Stock",
        exact: true,
      });
      expect(await stock.getByText("Stock (2)", { exact: true }).count()).toBe(
        1,
      );
      expect(
        await stock.getByLabel("Covered Stock card", { exact: true }).count(),
      ).toBe(1);
      expect(
        await stock
          .getByLabel("Covered Stock card", { exact: true })
          .textContent(),
      ).toBe("🂠");
      const builds = alice.page.getByRole("region", {
        name: "Build piles",
        exact: true,
      });
      expect(
        await builds.getByLabel(/^Covered Build/).allTextContents(),
      ).toHaveLength(2);
      for (const name of ["9 of Clubs", "10 of Clubs"])
        expect(
          await builds
            .getByLabel(`Covered Build ${name}`, { exact: true })
            .isVisible(),
        ).toBe(true);
      const coveredBuild = (await builds
        .getByLabel("Covered Build 9 of Clubs", { exact: true })
        .boundingBox())!;
      const buildTop = (await builds
        .getByLabel("Build top Jack of Clubs", { exact: true })
        .boundingBox())!;
      expect(buildTop.x - coveredBuild.x).toBe(8);
      expect(buildTop.y - coveredBuild.y).toBe(8);
      const ownHistory = alice.page.getByRole("group", {
        name: "Alice Discard pile 1",
      });
      await ownHistory.getByRole("button", { name: "View all" }).click();
      expect(
        await ownHistory
          .getByLabel("Covered Discard pile 1, 6 of Clubs")
          .isVisible(),
      ).toBe(true);
      const publicCards = alice.page.getByRole("region", {
        name: "Bob",
        exact: true,
      });
      expect(
        await publicCards.getByText("Hand: 1 concealed card").isVisible(),
      ).toBe(true);
      expect(
        await publicCards.getByLabel("Stock top 3 of Clubs").isVisible(),
      ).toBe(true);
      await publicCards.getByRole("button", { name: "View all" }).click();
      expect(
        await publicCards
          .getByLabel("Covered Discard pile 1, 8 of Clubs")
          .isVisible(),
      ).toBe(true);

      // Real pointer capture and release hit-testing, including touch on Chromium.
      const queen = alice.page.getByRole("button", {
        name: "Hand Queen of Clubs",
      });
      await queen.scrollIntoViewIfNeeded();
      const start = (await queen.boundingBox())!;
      const x = start.x + start.width / 2;
      const y = start.y + start.height / 2;
      if (width < 1024) {
        const cdp = await alice.page.context().newCDPSession(alice.page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        const target = alice.page.getByRole("button", {
          name: "Build pile build-1, next 12",
        });
        await target.scrollIntoViewIfNeeded();
        const end = (await target.boundingBox())!;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: end.x + end.width / 2, y: end.y + end.height / 2 },
          ],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      } else {
        await alice.page.mouse.move(x, y);
        await alice.page.mouse.down();
        const target = alice.page.getByRole("button", {
          name: "Build pile build-1, next 12",
        });
        await target.scrollIntoViewIfNeeded();
        const end = (await target.boundingBox())!;
        await alice.page.mouse.move(
          end.x + end.width / 2,
          end.y + end.height / 2,
        );
        await alice.page.mouse.up();
      }
      await synced(alice, bob, 1);
      expect(alice.snapshot()!.state.center.buildPiles).toEqual([]);
      expect(await builds.getByLabel(/^Covered Build/).count()).toBe(0);
      expect(
        await alice.page
          .getByText("Recycle pile: 12 cards", { exact: true })
          .isVisible(),
      ).toBe(true);
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "Hand Ace of Clubs" }),
      );
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "New Build pile" }),
      );
      await synced(alice, bob, 2);
      expect(await builds.getByLabel(/^Covered Build/).count()).toBe(0);
      expect(alice.snapshot()!.state.byId[alice.id]!.hand.cards).toHaveLength(
        5,
      );
      expect(alice.snapshot()!.state.deck.recyclePile).toEqual([]);
      expect(alice.snapshot()!.state.deck.drawPile).toHaveLength(7);
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "Stock top Ace of Clubs" }),
      );
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "New Build pile" }),
      );
      await synced(alice, bob, 3);
      expect(alice.snapshot()!.state.center.buildPiles).toHaveLength(2);
      expect(await stock.getByText("Stock (1)", { exact: true }).count()).toBe(
        1,
      );
      expect(
        await stock.getByLabel("Covered Stock card", { exact: true }).count(),
      ).toBe(0);
      const discard = getValidMoves(alice.snapshot()!.state, alice.id)
        .canDiscard[0]!;
      await tap(
        alice.page,
        alice.page.locator(`[data-drag-source="hand:${discard.cardId}"]`),
      );
      await tap(alice.page, ownHistory);
      await synced(alice, bob, 4);
      await alice.page.getByText("Active: Bob", { exact: true }).waitFor();
      expect(await alice.page.locator("[data-drag-source]").count()).toBe(0);
      await tap(
        bob.page,
        bob.page.getByRole("button", { name: "Hand 9 of Clubs" }),
      );
      await tap(
        bob.page,
        bob.page.getByRole("group", { name: "Bob Discard pile 2" }),
      );
      await synced(alice, bob, 5);
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "Stock top 2 of Clubs" }),
      );
      await tap(
        alice.page,
        alice.page
          .getByRole("button", { name: /^Build pile .*next 2$/ })
          .first(),
      );
      await synced(alice, bob, 6);
      await alice.page
        .getByRole("heading", { name: "Alice wins! (You)" })
        .waitFor();
      await bob.page
        .getByRole("heading", { name: "Alice wins!", exact: true })
        .waitFor();
      expect(alice.snapshot()!.state.byId[alice.id]!.stock.faceDown).toEqual(
        [],
      );
      expect(await stock.getByText("Stock (0)", { exact: true }).count()).toBe(
        1,
      );
      expect(await stock.getByLabel(/^Stock top/).count()).toBe(0);
      expect(
        await builds
          .getByLabel("Covered Build Ace of Clubs", { exact: true })
          .count(),
      ).toBe(1);
      expect(
        await ownHistory
          .getByRole("button", { name: "Close", exact: true })
          .isVisible(),
      ).toBe(true);
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      await alice.close();
      await bob.close();
    }
  },
  30_000,
);

it.each([1440, 390])(
  "allows exceptional End Turn and names the no-moves fallback winner at %ipx",
  async (width) => {
    server.scenario("fallback");
    const alice = await client(width, "Alice");
    const bob = await client(width, "Bob");
    try {
      await lobby(alice, bob);
      await tap(
        alice.page,
        alice.page.getByRole("button", { name: "End Turn", exact: true }),
      );
      await synced(alice, bob, 1);
      await tap(
        bob.page,
        bob.page.getByRole("button", { name: "Hand Ace of Clubs" }),
      );
      await tap(
        bob.page,
        bob.page.getByRole("button", { name: "New Build pile" }),
      );
      await synced(alice, bob, 2);
      await alice.page
        .getByRole("heading", { name: "Bob wins!", exact: true })
        .waitFor();
      await bob.page
        .getByRole("heading", { name: "Bob wins! (You)" })
        .waitFor();
      expect(alice.snapshot()!.state.byId[bob.id]!.stock.faceDown).toHaveLength(
        1,
      );
      expect(
        await alice.page
          .getByRole("button", { name: "End Turn", exact: true })
          .count(),
      ).toBe(0);
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      await alice.close();
      await bob.close();
    }
  },
  30_000,
);
