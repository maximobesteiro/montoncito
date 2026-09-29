// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";
import { denseBoardState } from "./dense-board.fixture";

const gameRoom = vi.hoisted(() => ({ view: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: "dense-room" }),
}));
vi.mock("@/lib/use-game-room", () => ({ useGameRoom: () => gameRoom.view }));
import GameRoomPage from "./page";

// jsdom cannot measure CSS layout. Render the same live page into Chromium with
// the real compiled stylesheet; interaction/submission is covered in page.test.tsx.
let browser: Browser;
let css: string;
let clientScript: string;
beforeAll(async () => {
  const from = new URL("../../globals.css", import.meta.url).pathname;
  const result = await postcss([tailwind({ base: process.cwd() })]).process(
    await readFile(from, "utf8"),
    { from },
  );
  css = result.css;
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
    esbuild: { jsx: "automatic", jsxDev: false },
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      {
        name: "controlled-game-room",
        enforce: "pre",
        resolveId(id) {
          if (id === "next/navigation") return "\0test-navigation";
          if (id === "next/link") return "\0test-link";
          if (id.endsWith("/lib/use-game-room")) return "\0test-room";
        },
        load(id) {
          if (id === "\0test-navigation")
            return 'export const useParams = () => ({roomId:"dense-room"});';
          if (id === "\0test-link")
            return 'import {createElement} from "react"; export default function Link({children,...props}) { return createElement("a",props,children); }';
          if (id === "\0test-room")
            return "export const useGameRoom = () => window.__roomView;";
        },
      },
    ],
    build: {
      write: false,
      lib: {
        entry: new URL("./chat.browser.fixture.tsx", import.meta.url).pathname,
        formats: ["iife"],
        name: "ChatFixture",
      },
    },
  });
  const output = Array.isArray(bundle)
    ? bundle[0]!.output
    : "output" in bundle
      ? bundle.output
      : [];
  clientScript = output
    .flatMap((entry) => (entry.type === "chunk" ? [entry.code] : []))
    .join("\n");
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  await browser?.close();
});

async function mountChatPage(page: Page) {
  await page.route("http://chat.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div id="root"></div>',
    }),
  );
  await page.goto("http://chat.test/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: clientScript });
}

it.each([true, false])(
  "retains desktop expanded=%s and the draft across viewport changes without leaving the board inert",
  async (expanded) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      await page
        .getByRole("textbox", { name: "Chat message" })
        .fill("Keep across resizing");
      if (!expanded)
        await page.getByRole("button", { name: "Collapse chat" }).click();
      await page.setViewportSize({ width: 390, height: 900 });
      await page.getByRole("button", { name: "Open chat" }).click();
      expect(
        await page.getByRole("textbox", { name: "Chat message" }).inputValue(),
      ).toBe("Keep across resizing");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page
        .getByRole("button", {
          name: expanded ? "Collapse chat" : "Expand chat",
        })
        .waitFor();
      expect(
        await page
          .getByLabel("Game room chat", { exact: true })
          .evaluate((element) => element.matches(":modal")),
      ).toBe(false);
      if (!expanded)
        await page.getByRole("button", { name: "Expand chat" }).click();
      expect(
        await page.getByRole("textbox", { name: "Chat message" }).inputValue(),
      ).toBe("Keep across resizing");
      await page.getByRole("button", { name: "Hand Ace of Clubs" }).click();
      await page.getByRole("button", { name: "New Build pile" }).click();
      expect(await page.evaluate(() => window.chatTest.actions.length)).toBe(1);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.getByRole("button", { name: "Open chat" }).waitFor();
      expect(
        await page.getByLabel("Game room chat", { exact: true }).isVisible(),
      ).toBe(false);
    } finally {
      await page.close();
    }
  },
);

it.each([320, 390, 768, 1024, 1440])(
  "keeps chat bounded, opponents in flow, and mobile modal taps off the board at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await mountChatPage(page);
      await page
        .getByRole("heading", { name: "Game room", exact: true })
        .waitFor()
        .catch(() => {
          throw new Error(errors.join("\n"));
        });
      expect(errors).toEqual([]);
      const chat = page.getByLabel("Game room chat", { exact: true });
      const log = page.getByRole("log", { name: "Chat messages" });
      if (width >= 1024) {
        await page.getByRole("button", { name: "Collapse chat" }).waitFor();
        const chatBounds = await box(chat);
        const opponentBounds = await box(
          page.getByRole("complementary", { name: "Opponents" }),
        );
        const buildBounds = await box(
          page.getByRole("region", { name: "Build piles" }),
        );
        expect(chatBounds.x).toBeGreaterThanOrEqual(
          buildBounds.x + buildBounds.width,
        );
        expect(chatBounds.y + chatBounds.height).toBeLessThanOrEqual(
          opponentBounds.y,
        );
        expect(chatBounds.height).toBeLessThanOrEqual(470);
        expect(
          await log.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
          ),
        ).toBe(true);
        const before = await box(
          page.getByRole("region", { name: "Bob", exact: true }),
        );
        await log.evaluate((element) => {
          element.scrollTop = 0;
        });
        expect(
          (await box(page.getByRole("region", { name: "Bob", exact: true }))).y,
        ).toBe(before.y);
      } else {
        const entry = page.getByRole("button", {
          name: "Open chat",
          exact: true,
        });
        await entry.waitFor();
        expect(await chat.isVisible()).toBe(false);
        const entryBounds = await box(entry);
        const shellBounds = await box(page.locator(".app-shell"));
        expect(entryBounds.y).toBeGreaterThanOrEqual(
          shellBounds.y + shellBounds.height,
        );
        expect(entryBounds.x + entryBounds.width).toBeLessThanOrEqual(
          width - 16,
        );
        expect(entryBounds.y + entryBounds.height).toBeLessThanOrEqual(
          900 - 12,
        );
        const source = page.getByRole("button", { name: "Hand Ace of Clubs" });
        await source.click();
        const target = page.getByText("New Build pile", { exact: true });
        await target.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await entry.click();
        await chat.waitFor();
        const chatBounds = await box(chat);
        expect(chatBounds.height).toBeLessThanOrEqual(900 * 0.8);
        expect(chatBounds.y + chatBounds.height).toBe(900);
        expect(
          await log.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
          ),
        ).toBe(true);
        expect(
          await page
            .getByLabel("Hand Ace of Clubs")
            .getAttribute("aria-pressed"),
        ).toBeNull();
        await expect
          .poll(() => log.evaluate((element) => element.scrollTop > 0))
          .toBe(true);
        // A physical tap outside the sheet lands on its backdrop, never the board.
        const bounds = await box(target);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThan(chatBounds.y);
        await page.mouse.click(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        expect(await page.evaluate(() => window.chatTest.actions.length)).toBe(
          0,
        );
        await page.getByRole("button", { name: "Open chat" }).waitFor();
        await entry.click();
        await page.keyboard.press("Escape");
        await entry.waitFor();
        await entry.click();
        await page.getByRole("button", { name: "Close chat" }).click();
        await source.click();
        await page.getByRole("button", { name: "New Build pile" }).click();
        expect(await page.evaluate(() => window.chatTest.actions.length)).toBe(
          1,
        );
      }
    } finally {
      await page.close();
    }
  },
  15_000,
);

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

it("keeps the mobile composer and Close reachable in a short landscape viewport", async () => {
  const page = await browser.newPage({ viewport: { width: 768, height: 320 } });
  try {
    await mountChatPage(page);
    await page.getByRole("button", { name: "Open chat" }).click();
    const sheet = await box(
      page.getByRole("dialog", { name: "Game room chat" }),
    );
    expect(sheet.height).toBeLessThanOrEqual(320 * 0.8);
    for (const control of [
      page.getByRole("button", { name: "Close chat" }),
      page.getByRole("textbox", { name: "Chat message" }),
      page.getByRole("button", { name: "Send" }),
    ]) {
      const bounds = await box(control);
      expect(bounds.y).toBeGreaterThanOrEqual(sheet.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        sheet.y + sheet.height,
      );
    }
    expect(
      (await box(page.getByRole("log", { name: "Chat messages" }))).height,
    ).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  it.each([1, 2, 3, 4] as const)(
    `keeps every public pile readable and controls reachable at ${width}px with %i Discards`,
    async (count) => {
      gameRoom.view = {
        state: denseBoardState(count),
        seq: 0,
        currentPlayerId: "player-1",
        connectionStatus: "connected",
        pendingAction: null,
        chatMessages: [],
        liveChatCount: 0,
        submitAction: () => true,
        sendChat: () => true,
      };
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.setContent(renderToStaticMarkup(<GameRoomPage />));
        await page.addStyleTag({ content: css });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);

        const build = page.getByRole("region", { name: "Build piles" });
        const stock = page.getByRole("group", {
          name: "Your Stock",
          exact: true,
        });
        const hand = page.getByRole("group", {
          name: "Your Hand",
          exact: true,
        });
        const discards = page.getByRole("group", {
          name: "Your Discard piles",
          exact: true,
        });
        const opponents = page.getByRole("complementary", {
          name: "Opponents",
        });
        const [b, s, h, d, o] = await Promise.all([
          box(build),
          box(stock),
          box(hand),
          box(discards),
          box(opponents),
        ]);
        expect(b.y + b.height).toBeLessThanOrEqual(s.y);
        expect(d.y).toBeGreaterThanOrEqual(h.y + h.height);
        if (width >= 1024) {
          expect(o.x).toBeGreaterThanOrEqual(b.x + b.width);
          expect(b.width).toBeGreaterThan(o.width);
        } else {
          expect(o.y).toBeGreaterThanOrEqual(d.y + d.height);
        }
        if (width >= 768) {
          expect(s.y).toBe(h.y);
          expect(s.x + s.width).toBeLessThanOrEqual(h.x);
        } else {
          expect(s.y + s.height).toBeLessThanOrEqual(h.y);
        }

        const buildTops = build.getByLabel("Build top 2 of Clubs", {
          exact: true,
        });
        expect(await buildTops.count()).toBe(18);
        const first = await box(buildTops.first());
        const last = await box(buildTops.last());
        expect(last.y).toBeGreaterThan(first.y);
        const newPile = build.getByText("New Build pile", { exact: true });
        expect(
          await newPile.evaluate(
            (element) =>
              element.getBoundingClientRect().y >=
              element.previousElementSibling!.getBoundingClientRect().y,
          ),
        ).toBe(true);

        // Every card keeps its readable dimensions, stays horizontally visible,
        // and can be reached by vertical scrolling without another element covering it.
        const cards = page.locator(
          '[aria-label^="Hand "], [aria-label^="Stock top "], [aria-label^="Build top "], [aria-label^="Discard pile "]',
        );
        expect(await cards.count()).toBe(27 + count * 4);
        for (const card of await cards.all()) {
          const bounds = await box(card);
          expect(bounds.width).toBe(72);
          expect(bounds.height).toBe(104);
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          await card.scrollIntoViewIfNeeded();
          expect(
            await card.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return element.contains(
                document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                ),
              );
            }),
          ).toBe(true);
        }
        await newPile.scrollIntoViewIfNeeded();
        for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
          for (let pile = 1; pile <= count; pile++) {
            const group = page.getByRole("group", {
              name: `${name} Discard pile ${pile}`,
              exact: true,
            });
            expect(await group.count()).toBe(1);
            await group
              .getByRole("button", { name: "View all" })
              .click({ trial: true });
          }
        }
        const handCards = await hand.getByRole("button").all();
        expect(handCards).toHaveLength(5);
        for (const card of handCards) await card.click({ trial: true });
        for (const name of ["Bob", "Carol", "Dave"]) {
          const panel = page.getByRole("region", { name, exact: true });
          expect(await panel.getByText("Hand: 5 concealed cards").count()).toBe(
            1,
          );
          expect(
            await panel
              .locator("[data-drag-source], [data-drop-discard]")
              .count(),
          ).toBe(0);
        }
      } finally {
        await page.close();
      }
    },
    15_000,
  );
}
