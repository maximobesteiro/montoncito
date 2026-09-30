// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page, type Locator } from "playwright";
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

async function client(width: number, name: string) {
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
  await page.route("http://localhost:4173/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://localhost:4173/");
  const id = await page.evaluate(() => {
    const id = crypto.randomUUID();
    localStorage.setItem("montoncito:clientId", id);
    return id;
  });
  const response = await page.request.patch(`${server.url}/profile`, {
    headers: { "x-client-id": id },
    data: { displayName: name },
  });
  expect(response.ok()).toBe(true);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  return {
    page,
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
