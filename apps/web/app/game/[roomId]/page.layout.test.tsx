// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";
import { denseBoardState } from "./dense-board.fixture";
import { applyMove, type Rank } from "@mont/core-game";

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
            return 'export const useParams = () => ({roomId:window.__roomView?.roomId ?? "dense-room"});';
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
      body: '<!doctype html><div id="root"></div>',
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

it.each([false, true])(
  "desktop chat opening cancels unsubmitted targeting while retaining pending=%s collapse",
  async (pending) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await mountChatPage(page);
      await page.getByRole("button", { name: "Collapse chat" }).click();
      const pile = page.getByRole("group", {
        name: "Alice Discard pile 1",
        exact: true,
      });
      await pile.getByRole("button", { name: "View all" }).click();
      const source = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await source.click();
      if (pending)
        await page
          .getByRole("button", { name: "Discard Hand to pile 1", exact: true })
          .click();
      await page.getByRole("button", { name: "Expand chat" }).click();
      if (pending) {
        expect(
          await pile.getByRole("button", { name: "View all" }).isDisabled(),
        ).toBe(true);
        expect(await page.evaluate(() => window.chatTest.actions.length)).toBe(
          1,
        );
      } else {
        expect(await source.getAttribute("aria-pressed")).toBe("false");
        expect(
          await pile
            .getByRole("button", { name: "Close", exact: true })
            .isEnabled(),
        ).toBe(true);
        expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
        // The persistent desktop panel permits a fresh board interaction.
        await source.click();
        expect(await source.getAttribute("aria-pressed")).toBe("true");
      }
    } finally {
      await page.close();
    }
  },
);

it.each(["mouse", "touch"])(
  "rejects a %s release on a Discard rectangle clipped behind the mobile dock",
  async (method) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 600 },
      hasTouch: true,
    });
    const input = await page.context().newCDPSession(page);
    try {
      await mountChatPage(page);
      const source = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await source.scrollIntoViewIfNeeded();
      const pickup = await box(source);
      const x = pickup.x + 30;
      const y = pickup.y + 40;
      if (method === "mouse") {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 10, y);
      } else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
      await page.getByLabel("Moving 5 of Clubs").waitFor();
      const target = page.getByRole("button", {
        name: "Discard Hand to pile 1",
        exact: true,
      });
      await target.evaluate((element) => {
        const host = document.querySelector(".app-shell")!;
        host.scrollTop += element.getBoundingClientRect().top - 510;
      });
      const bounds = await box(target);
      expect(bounds.y).toBeCloseTo(510, 0);
      const viewport = await box(page.locator(".app-shell"));
      expect(viewport.y + viewport.height).toBeLessThan(550);
      const releaseX = bounds.x + 30;
      if (method === "mouse") await page.mouse.move(releaseX, 550);
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: releaseX, y: 550, id: 1 }],
        });
      // The hidden rectangle contains the release point, but no visible destination does.
      await expect
        .poll(() => target.getAttribute("data-drop-hovered"))
        .toBe("false");
      if (method === "mouse") await page.mouse.up();
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
      await expect
        .poll(() => source.getAttribute("aria-pressed"))
        .toBe("false");
    } finally {
      await input.detach();
      await page.close();
    }
  },
);

async function mountInspectionPage(page: Page) {
  await mountChatPage(page);
  // Exercise restoration without Chromium's optional native anchoring, as on Safari.
  await page.addStyleTag({ content: "* { overflow-anchor: none; }" });
  const state = denseBoardState(2);
  state.players = ["player-1", "player-2"];
  state.byId["player-2"]!.discards = [[], []];
  state.center.buildPiles = state.center.buildPiles.slice(0, 1);
  state.byId["player-1"]!.discards = [0, 1].map((pile) =>
    Array.from({ length: 30 }, (_, i) => ({
      kind: "standard" as const,
      id: `history-${pile}-${i}`,
      rank: 7 as const,
      suit: "Hearts" as const,
    })),
  );
  await page.evaluate(
    (state) => window.chatTest.update({ state, seq: 1 }),
    state,
  );
  const piles = [1, 2].map((index) =>
    page.getByRole("group", {
      name: `Alice Discard pile ${index}`,
      exact: true,
    }),
  );
  for (const pile of piles)
    await pile.getByRole("button", { name: "View all" }).click();
  const source = page.getByRole("button", {
    name: "Hand 5 of Clubs",
    exact: true,
  });
  const scroll = page.locator(
    await page.evaluate(() =>
      matchMedia("(min-width: 1024px)").matches
        ? document.scrollingElement!.tagName.toLowerCase()
        : ".app-shell",
    ),
  );
  await scroll.evaluate((element) => {
    element.scrollTop = 1800;
  });
  await source.evaluate((element) =>
    (element as HTMLElement).focus({ preventScroll: true }),
  );
  const before = await scroll.evaluate((element) => element.scrollTop);
  return { source, scroll, before, piles, state };
}

it.each([
  { width: 390, ending: "Escape" },
  { width: 1440, ending: "Escape" },
  { width: 390, ending: "deselect" },
  { width: 390, ending: "unused" },
  { width: 390, ending: "blur" },
  { width: 390, ending: "snapshot" },
  { width: 390, ending: "chat" },
])(
  "recovers the reading position after collapse clamps scrolling and $ending cancels targeting at $width px",
  async ({ width, ending }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const { scroll, before, piles } = await mountInspectionPage(page);
      await page.keyboard.press("Enter");
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeLessThan(before - 20);
      if (ending === "blur")
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else if (ending === "snapshot")
        await page.evaluate(() =>
          window.chatTest.update({
            state: structuredClone(window.__roomView.state),
            seq: 2,
          }),
        );
      else if (ending === "chat")
        await page.getByRole("button", { name: "Open chat" }).click();
      else if (ending === "unused") await page.mouse.click(25, 300);
      else
        await page.keyboard.press(ending === "deselect" ? "Enter" : "Escape");
      for (const pile of piles)
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .waitFor();
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeCloseTo(before, 0);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
    } finally {
      await page.close();
    }
  },
);

it.each([
  { outcome: "accepted", nativeAnchoring: false },
  { outcome: "rejected", nativeAnchoring: false },
  { outcome: "accepted", nativeAnchoring: true },
  { outcome: "rejected", nativeAnchoring: true },
])(
  "preserves the current opponent viewport anchor on $outcome with native anchoring=$nativeAnchoring",
  async ({ outcome, nativeAnchoring }) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 600 },
    });
    try {
      const { piles, before, scroll, state } = await mountInspectionPage(page);
      if (nativeAnchoring)
        await page.addStyleTag({ content: "* { overflow-anchor: auto; }" });
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: "Discard Hand to pile 1", exact: true })
        .click();
      const opponent = page.getByRole("region", { name: "Bob", exact: true });
      await opponent.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      const anchor = (await box(opponent)).y;
      expect(
        await scroll.evaluate((element) => element.scrollTop),
      ).toBeLessThan(before);
      await page.getByRole("button", { name: "Open chat" }).click();
      await page
        .getByRole("textbox", { name: "Chat message" })
        .fill("Keep reading after reconnect");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.evaluate(() =>
        window.chatTest.update({ connectionStatus: "connecting" }),
      );
      for (const pile of piles)
        expect(
          await pile.getByRole("button", { name: "View all" }).isDisabled(),
        ).toBe(true);
      await page.evaluate(() =>
        window.chatTest.update({ connectionStatus: "connected" }),
      );
      const accepted = applyMove(state, {
        kind: "DISCARD_FROM_HAND",
        cardId: "player-1-hand-5",
        pileIndex: 0,
      });
      expect(accepted.accepted).toBe(true);
      await page.evaluate(
        ({ outcome, state }) => {
          window.chatTest.update({
            pendingAction: null,
            lastActionResult: {
              version: 1,
              actionId: "browser-action-1",
              seq: outcome === "accepted" ? 2 : 1,
              state,
              ...(outcome === "rejected" ? { code: "ILLEGAL_ACTION" } : {}),
            },
            state,
            seq: outcome === "accepted" ? 2 : 1,
          });
        },
        { outcome, state: outcome === "accepted" ? accepted.state : state },
      );
      for (const pile of piles)
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .waitFor();
      await page.getByRole("button", { name: "Close chat" }).click();
      await expect
        .poll(async () => (await box(opponent)).y)
        .toBeCloseTo(anchor, 0);
    } finally {
      await page.close();
    }
  },
);

it.each(["wheel", "touch", "edge"])(
  "respects deliberate %s scrolling when targeting is cancelled",
  async (method) => {
    const page = await browser.newPage({
      viewport: { width: method === "wheel" ? 1440 : 390, height: 600 },
      hasTouch: true,
    });
    const input = await page.context().newCDPSession(page);
    try {
      const { source, scroll, piles } = await mountInspectionPage(page);
      if (method === "edge") {
        await source.scrollIntoViewIfNeeded();
        const pickup = await box(source);
        await input.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: pickup.x + 30, y: pickup.y + 40, id: 1 }],
        });
        await page.getByLabel("Moving 5 of Clubs").waitFor();
        expect(
          await scroll.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: pickup.x + 30, y: 5, id: 1 }],
        });
      } else {
        await page.keyboard.press("Enter");
        await piles[0]!.getByRole("button", { name: "View all" }).waitFor();
        expect(
          await scroll.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
        if (method === "wheel") {
          await page.mouse.move(1000, 300);
          await page.mouse.wheel(0, -2500);
        } else {
          await input.send("Input.synthesizeScrollGesture", {
            x: 350,
            y: 100,
            yDistance: 2500,
            gestureSourceType: "touch",
          });
        }
      }
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop), {
          timeout: 5000,
        })
        .toBe(0);
      if (method === "edge")
        await input.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
      else await page.keyboard.press("Escape");
      for (const pile of piles)
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .waitFor();
      expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
    } finally {
      await input.detach();
      await page.close();
    }
  },
  15000,
);

it("retains affected inspection across source switches and starts fresh after those destinations reopen", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
  const select = async (name: string) => {
    await page
      .getByRole("button", { name, exact: true })
      .evaluate((element) =>
        (element as HTMLElement).focus({ preventScroll: true }),
      );
    await page.keyboard.press("Enter");
  };
  try {
    const { scroll, before, piles } = await mountInspectionPage(page);
    await page.keyboard.press("Enter");
    await select("Hand 3 of Clubs");
    await page.keyboard.press("Escape");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(before);
    await select("Hand 5 of Clubs");
    const opponent = page.getByRole("region", { name: "Bob", exact: true });
    await opponent.scrollIntoViewIfNeeded();
    const anchor = (await box(opponent)).y;
    await select("Stock top 3 of Clubs");
    for (const pile of piles)
      await pile.getByRole("button", { name: "Close", exact: true }).waitFor();
    expect((await box(opponent)).y).toBeCloseTo(anchor, 0);
    await page.keyboard.press("Escape");
    expect((await box(opponent)).y).toBeCloseTo(anchor, 0);
    // The same interaction may reopen inspection and later collapse it again.
    await select("Stock top 3 of Clubs");
    await scroll.evaluate((element) => {
      element.scrollTop = 1600;
    });
    await select("Hand 5 of Clubs");
    await page.keyboard.press("Escape");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(1600);
  } finally {
    await page.close();
  }
});

it.each(["source", "outside", "Escape", "pointercancel"])(
  "restores the long-history viewport after a mouse drag ends at %s without navigation",
  async (ending) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      const { source, scroll, piles } = await mountInspectionPage(page);
      await source.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      await scroll.evaluate((element) => {
        element.scrollTop -= 200;
      });
      const before = await scroll.evaluate((element) => element.scrollTop);
      const pickup = await box(source);
      await page.mouse.move(pickup.x + 30, pickup.y + 40);
      await page.mouse.down();
      await page.mouse.move(pickup.x + 40, pickup.y + 40);
      const overlay = page.getByLabel("Moving 5 of Clubs");
      await overlay.waitFor();
      if (ending === "Escape") await page.keyboard.press("Escape");
      else if (ending === "pointercancel")
        await source.dispatchEvent("pointercancel", { pointerType: "mouse" });
      else {
        const target =
          ending === "source" ? await box(source) : { x: 5, y: 300 };
        await page.mouse.move(target.x + 20, target.y + 40);
      }
      await page.mouse.up();
      await overlay.waitFor({ state: "detached" });
      for (const pile of piles)
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .waitFor();
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeCloseTo(before, 0);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
    } finally {
      await page.close();
    }
  },
);

it.each([0, 1])(
  "forgets a %i-card history during pending collapse and anchors the remaining shrinking history",
  async (count) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 600 },
    });
    try {
      const { piles, state } = await mountInspectionPage(page);
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: "Discard Hand to pile 1", exact: true })
        .click();
      const shorter = structuredClone(state);
      shorter.byId["player-1"]!.discards[0] = shorter.byId[
        "player-1"
      ]!.discards[0]!.slice(0, count);
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 2 }),
        shorter,
      );
      if (count === 0)
        await piles[0]!.getByText("Empty", { exact: true }).waitFor();
      else
        await piles[0]!
          .getByLabel("Discard pile 1, 7 of Hearts", { exact: true })
          .waitFor();
      await expect
        .poll(() => piles[0]!.getByLabel(/^Covered Discard/).count())
        .toBe(0);
      shorter.byId["player-1"]!.discards[0] = state.byId[
        "player-1"
      ]!.discards[0]!.slice(0, 2);
      shorter.byId["player-1"]!.discards[1] = state.byId[
        "player-1"
      ]!.discards[1]!.slice(0, 6);
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 3 }),
        shorter,
      );
      await piles[0]!.getByRole("button", { name: "View all" }).waitFor();
      const opponent = page.getByRole("region", { name: "Bob", exact: true });
      await opponent.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      const anchor = (await box(opponent)).y;
      await page.evaluate(() =>
        window.chatTest.update({ pendingAction: null }),
      );
      await piles[1]!
        .getByRole("button", { name: "Close", exact: true })
        .waitFor();
      expect(
        await piles[0]!
          .getByRole("button", { name: "Close", exact: true })
          .count(),
      ).toBe(0);
      expect(
        await piles[0]!.getByRole("button", { name: "View all" }).isEnabled(),
      ).toBe(true);
      expect((await box(opponent)).y).toBeCloseTo(anchor, 0);
    } finally {
      await page.close();
    }
  },
);

it("resets inspection and discards the previous room's reading position when room identity changes", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
  try {
    const { piles, scroll, before, state } = await mountInspectionPage(page);
    await page.keyboard.press("Enter");
    await page.evaluate(
      (state) =>
        window.chatTest.update({
          roomId: "another-room",
          state,
          seq: 0,
          pendingAction: null,
          lastActionResult: null,
        }),
      state,
    );
    await page.getByText("another-room", { exact: true }).waitFor();
    for (const pile of piles) {
      expect(
        await pile.getByRole("button", { name: "Close", exact: true }).count(),
      ).toBe(0);
      expect(
        await pile.getByRole("button", { name: "View all" }).isEnabled(),
      ).toBe(true);
    }
    const current = await scroll.evaluate((element) => element.scrollTop);
    expect(current).toBeLessThan(before);
    await page
      .getByRole("button", { name: "Hand 5 of Clubs", exact: true })
      .evaluate((element) =>
        (element as HTMLElement).focus({ preventScroll: true }),
      );
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    expect(await scroll.evaluate((element) => element.scrollTop)).toBe(current);
    for (const pile of piles)
      expect(
        await pile.getByRole("button", { name: "Close", exact: true }).count(),
      ).toBe(0);
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
  } finally {
    await page.close();
  }
});

it("moves a floating Hand card with the mouse and submits once on a covered Build corner", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });
  try {
    await mountChatPage(page);
    const source = page.getByRole("button", {
      name: "Hand 3 of Clubs",
      exact: true,
    });
    await source.scrollIntoViewIfNeeded();
    const pickup = await box(source);
    const x = pickup.x + 30;
    const y = pickup.y + 40;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3, y);
    expect(await page.getByLabel("Moving 3 of Clubs").count()).toBe(0);
    await page.mouse.move(x + 20, y - 20);
    const overlay = page.getByLabel("Moving 3 of Clubs");
    await overlay.waitFor();
    await page.mouse.move(x + 40, y - 40);
    const moved = await box(overlay);
    expect(moved.x).toBeCloseTo(pickup.x + 40, 0);
    expect(moved.y).toBeCloseTo(pickup.y - 40, 0);
    expect(await box(source)).toEqual(pickup);
    const target = page.getByRole("button", {
      name: "Build pile build-1, next 3",
      exact: true,
    });
    const bounds = await box(target);
    await page.mouse.move(bounds.x + 1, bounds.y + 1);
    await expect
      .poll(() => target.getAttribute("data-drop-hovered"))
      .toBe("true");
    await page.mouse.up();
    expect(await overlay.count()).toBe(0);
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
      {
        kind: "PLAY_HAND_TO_BUILD",
        cardId: "player-1-hand-3",
        target: "build-1",
      },
    ]);
    expect(
      await page.getByLabel("Hand 3 of Clubs", { exact: true }).textContent(),
    ).toContain("Pending");
    expect(await source.count()).toBe(0);
  } finally {
    await page.close();
  }
});

it.each(["outside", "label", "control", "source", "Escape", "blur"])(
  "cancels a mouse drag at %s and restores expanded histories",
  async (release) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      const pile = page.getByRole("group", {
        name: "Alice Discard pile 1",
        exact: true,
      });
      await pile.getByRole("button", { name: "View all" }).click();
      const source = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await source.scrollIntoViewIfNeeded();
      const pickup = await box(source);
      await page.mouse.move(pickup.x + 30, pickup.y + 40);
      await page.mouse.down();
      await page.mouse.move(pickup.x + 40, pickup.y + 40);
      const overlay = page.getByLabel("Moving 5 of Clubs");
      await overlay.waitFor();
      expect(
        await pile.getByRole("button", { name: "View all" }).isDisabled(),
      ).toBe(true);
      if (release === "Escape") await page.keyboard.press("Escape");
      else if (release === "blur")
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else {
        const target = pile.getByRole("button", {
          name: "Discard Hand to pile 1",
          exact: true,
        });
        await target.scrollIntoViewIfNeeded();
        const bounds = await box(target);
        const point =
          release === "outside"
            ? { x: bounds.x - 1, y: bounds.y + 50 }
            : release === "source"
              ? await box(source)
              : await box(
                  release === "label"
                    ? pile.getByText("Discard 1", { exact: true })
                    : pile.getByRole("button", { name: "View all" }),
                );
        await page.mouse.move(
          point.x + (release === "outside" ? 0 : 20),
          point.y + (release === "outside" ? 0 : 5),
        );
        expect(await target.getAttribute("data-drop-hovered")).toBe("false");
      }
      await page.mouse.up();
      await overlay.waitFor({ state: "detached" });
      expect(await source.getAttribute("aria-pressed")).toBe("false");
      expect(
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .isEnabled(),
      ).toBe(true);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
    } finally {
      await page.close();
    }
  },
);

it.each(["mouse", "touch"])(
  "keeps the %s pickup fixed through collapse-induced scrolling and measures the collapsed Discard for release",
  async (method) => {
    const page = await browser.newPage({
      viewport: { width: method === "touch" ? 390 : 1440, height: 900 },
      hasTouch: method === "touch",
    });
    const input = await page.context().newCDPSession(page);
    const move = async (x: number, y: number) => {
      if (method === "mouse") await page.mouse.move(x, y);
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y, id: 1 }],
        });
    };
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      const state = denseBoardState(2);
      state.players = ["player-1", "player-2"];
      state.byId["player-2"]!.discards = [[], []];
      state.center.buildPiles = state.center.buildPiles.slice(0, 1);
      // The expanded history fills the scroll container; collapsing it clamps scroll.
      state.byId["player-1"]!.discards[0] = Array.from(
        { length: 12 },
        (_, i) => ({
          kind: "standard" as const,
          id: `history-${i}`,
          rank: 7 as const,
          suit: "Hearts" as const,
        }),
      );
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 1 }),
        state,
      );
      const pile = page.getByRole("group", {
        name: "Alice Discard pile 1",
        exact: true,
      });
      await pile.getByRole("button", { name: "View all" }).click();
      const expandedHeight = (await box(pile)).height;
      const source = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await source.evaluate(
        (element, method) =>
          element.scrollIntoView({
            block: method === "touch" ? "center" : "start",
          }),
        method,
      );
      const pickup = await box(source);
      if (method === "touch") {
        expect(
          await page.evaluate(
            ({ x, y }) =>
              document
                .elementFromPoint(x + 40, y + 40)
                ?.closest("[data-drag-source]")
                ?.getAttribute("aria-label"),
            pickup,
          ),
        ).toBe("Hand 5 of Clubs");
      }
      if (method === "mouse") {
        await page.mouse.move(pickup.x + 30, pickup.y + 40);
        await page.mouse.down();
        await move(pickup.x + 40, pickup.y + 40);
      } else {
        await input.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: pickup.x + 40, y: pickup.y + 40, id: 1 }],
        });
        await page.waitForTimeout(100);
        expect(
          await pile
            .getByRole("button", { name: "Close", exact: true })
            .count(),
        ).toBe(1);
        expect(await source.getAttribute("aria-pressed")).toBe("false");
      }
      const overlay = page.getByLabel("Moving 5 of Clubs");
      await overlay.waitFor();
      expect((await box(overlay)).x).toBeCloseTo(pickup.x, 0);
      expect((await box(overlay)).y).toBeCloseTo(pickup.y, 0);
      if (method === "mouse")
        expect(Math.abs((await box(source)).y - pickup.y)).toBeGreaterThan(20);
      expect((await box(pile)).height).toBeLessThan(expandedHeight - 20);
      const movement = method === "touch" ? 30 : 10;
      await move(pickup.x + 40 + movement, pickup.y + 40 + movement);
      await expect
        .poll(async () => (await box(overlay)).y)
        .toBeCloseTo(pickup.y + movement, 0);
      const destination = pile.getByRole("button", {
        name: "Discard Hand to pile 1",
        exact: true,
      });
      if (method === "touch")
        await destination.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
      const bounds = await box(destination);
      expect(bounds.height).toBe(144);
      await move(bounds.x + 1, bounds.y + 1);
      await expect
        .poll(() => destination.getAttribute("data-drop-hovered"))
        .toBe("true");
      expect(
        await destination.evaluate(
          (element) => getComputedStyle(element).boxShadow,
        ),
      ).not.toBe("none");
      if (method === "mouse") await page.mouse.up();
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
        { kind: "DISCARD_FROM_HAND", cardId: "player-1-hand-5", pileIndex: 0 },
      ]);
      expect(await overlay.count()).toBe(0);
      expect(
        await page.getByLabel("Hand 5 of Clubs", { exact: true }).textContent(),
      ).toContain("Pending");
      expect(
        await pile.getByRole("button", { name: "View all" }).isDisabled(),
      ).toBe(true);
    } finally {
      await input.detach();
      await page.close();
    }
  },
);

it.each([
  {
    name: "Stock top 3 of Clubs",
    method: "mouse",
    action: { kind: "PLAY_STOCK_TO_BUILD", target: "build-1" },
  },
  {
    name: "Discard pile 1, 3 of Clubs",
    method: "mouse",
    action: { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, target: "build-1" },
  },
  {
    name: "Stock top 3 of Clubs",
    method: "touch",
    action: { kind: "PLAY_STOCK_TO_BUILD", target: "build-1" },
  },
  {
    name: "Discard pile 1, 3 of Clubs",
    method: "touch",
    action: { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, target: "build-1" },
  },
])(
  "drags the eligible $name with $method",
  async ({ name, action, method }) => {
    const page = await browser.newPage({
      viewport: { width: method === "touch" ? 390 : 1440, height: 1200 },
      hasTouch: method === "touch",
    });
    const input = await page.context().newCDPSession(page);
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      const state = denseBoardState(2);
      state.center.buildPiles = state.center.buildPiles.slice(0, 1);
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 1 }),
        state,
      );
      const source = page.getByRole("button", { name, exact: true });
      await source.scrollIntoViewIfNeeded();
      const pickup = await box(source);
      if (method === "mouse") {
        await page.mouse.move(pickup.x + 30, pickup.y + 40);
        await page.mouse.down();
        await page.mouse.move(pickup.x + 40, pickup.y + 40);
      } else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: pickup.x + 30, y: pickup.y + 40, id: 1 }],
        });
      await page.getByLabel("Moving 3 of Clubs").waitFor();
      const target = page.getByRole("button", {
        name: "Build pile build-1, next 3",
        exact: true,
      });
      if (method === "touch")
        await target.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
      const bounds = await box(target);
      if (method === "mouse")
        await page.mouse.move(bounds.x + 30, bounds.y + 40);
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: bounds.x + 1, y: bounds.y + 1, id: 1 }],
        });
      await expect
        .poll(() => target.getAttribute("data-drop-hovered"))
        .toBe("true");
      if (method === "mouse") await page.mouse.up();
      else
        await input.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
        action,
      ]);
      const group = page.getByRole("group", {
        name: name.startsWith("Stock") ? "Your Stock" : "Alice Discard pile 1",
        exact: true,
      });
      expect(await group.getByLabel(name, { exact: true }).count()).toBe(1);
      expect(await group.getByText("Pending", { exact: true }).count()).toBe(1);
      expect(await source.count()).toBe(0);
    } finally {
      await input.detach();
      await page.close();
    }
  },
);

it("holds to drag and scrolls to an off-screen Build in the mobile board", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    hasTouch: true,
  });
  page.setDefaultTimeout(3000);
  const input = await page.context().newCDPSession(page);
  try {
    await mountChatPage(page);
    const source = page.getByRole("button", {
      name: "Hand 3 of Clubs",
      exact: true,
    });
    await source.scrollIntoViewIfNeeded();
    const pickup = await box(source);
    const scroll = page.locator(".app-shell");
    const before = await scroll.evaluate((element) => element.scrollTop);
    expect(before).toBeGreaterThan(100);
    const touch = async (
      type: "touchStart" | "touchMove" | "touchEnd",
      x = pickup.x + 30,
      y = pickup.y + 40,
    ) => {
      await input.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    };
    await touch("touchStart");
    await page.waitForTimeout(100);
    expect(await page.getByLabel("Moving 3 of Clubs").count()).toBe(0);
    expect(await source.getAttribute("aria-pressed")).toBe("false");
    await page.waitForTimeout(150);
    const overlay = page.getByLabel("Moving 3 of Clubs");
    await overlay.waitFor();
    await touch("touchMove", pickup.x + 40, 5);
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop), {
        timeout: 5000,
      })
      .toBe(0);
    expect((await box(overlay)).y).toBeCloseTo(-35, 0);
    const target = page.getByRole("button", {
      name: "Build pile build-1, next 3",
      exact: true,
    });
    const bounds = await box(target);
    await touch("touchMove", bounds.x + 1, bounds.y + 1);
    await expect
      .poll(() => target.getAttribute("data-drop-hovered"))
      .toBe("true");
    await touch("touchEnd");
    await overlay.waitFor({ state: "detached" });
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
      {
        kind: "PLAY_HAND_TO_BUILD",
        cardId: "player-1-hand-3",
        target: "build-1",
      },
    ]);
    const ended = await scroll.evaluate((element) => element.scrollTop);
    await page.waitForTimeout(100);
    expect(await scroll.evaluate((element) => element.scrollTop)).toBe(ended);
  } finally {
    await input.detach();
    await page.close();
  }
}, 15000);

it("scrolls natively from a playable card before the hold without selecting or collapsing histories", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    hasTouch: true,
  });
  const input = await page.context().newCDPSession(page);
  try {
    await mountChatPage(page);
    const pile = page.getByRole("group", {
      name: "Alice Discard pile 1",
      exact: true,
    });
    await pile.getByRole("button", { name: "View all" }).click();
    const source = page.getByRole("button", {
      name: "Hand 5 of Clubs",
      exact: true,
    });
    await source.scrollIntoViewIfNeeded();
    const pickup = await box(source);
    const scroll = page.locator(".app-shell");
    const before = await scroll.evaluate((element) => element.scrollTop);
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: pickup.x + 30, y: pickup.y + 40, id: 1 }],
    });
    expect(
      await pile.getByRole("button", { name: "Close", exact: true }).count(),
    ).toBe(1);
    for (let step = 1; step <= 5; step++) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: pickup.x + 30, y: pickup.y + 40 - step * 30, id: 1 },
        ],
      });
      expect(await source.getAttribute("aria-pressed")).toBe("false");
      expect(await page.getByLabel("Moving 5 of Clubs").count()).toBe(0);
      expect(
        await pile.getByRole("button", { name: "Close", exact: true }).count(),
      ).toBe(1);
    }
    await input.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before + 50);
    await page.waitForTimeout(250);
    expect(await source.getAttribute("aria-pressed")).toBe("false");
    expect(await page.getByLabel("Moving 5 of Clubs").count()).toBe(0);
    expect(
      await pile.getByRole("button", { name: "Close", exact: true }).count(),
    ).toBe(1);
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
  } finally {
    await input.detach();
    await page.close();
  }
});

it("suppresses a synthesized click after seven pixels of pre-hold touch movement and still permits the next tap", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    hasTouch: true,
  });
  const input = await page.context().newCDPSession(page);
  try {
    await mountChatPage(page);
    const pile = page.getByRole("group", {
      name: "Alice Discard pile 1",
      exact: true,
    });
    await pile.getByRole("button", { name: "View all" }).click();
    const source = page.getByRole("button", {
      name: "Hand 5 of Clubs",
      exact: true,
    });
    await source.scrollIntoViewIfNeeded();
    const pickup = await box(source);
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: pickup.x + 30, y: pickup.y + 40, id: 1 }],
    });
    await input.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: pickup.x + 30, y: pickup.y + 47, id: 1 }],
    });
    await input.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await source.getAttribute("aria-pressed")).toBe("false");
    expect(
      await pile.getByRole("button", { name: "Close", exact: true }).count(),
    ).toBe(1);
    expect(await page.getByLabel("Moving 5 of Clubs").count()).toBe(0);
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
    await source.tap();
    expect(await source.getAttribute("aria-pressed")).toBe("true");
  } finally {
    await input.detach();
    await page.close();
  }
});

it("keeps physical touch taps selectable through normal capture release", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    hasTouch: true,
  });
  page.setDefaultTimeout(3000);
  try {
    await mountChatPage(page);
    const source = page.getByRole("button", {
      name: "Hand Ace of Clubs",
      exact: true,
    });
    await source.tap();
    expect(await source.getAttribute("aria-pressed")).toBe("true");
    await source.tap();
    expect(await source.getAttribute("aria-pressed")).toBe("false");
    await source.tap();
    await page
      .getByRole("button", { name: "New Build pile", exact: true })
      .tap();
    expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
      { kind: "PLAY_HAND_TO_BUILD", cardId: "player-1-hand-1", target: "new" },
    ]);
  } finally {
    await page.close();
  }
});

it.each(["outside", "label", "touchcancel", "chat"])(
  "stops mobile edge scrolling and clears an unsubmitted hold drag on %s",
  async (ending) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 600 },
      hasTouch: true,
    });
    page.setDefaultTimeout(3000);
    const input = await page.context().newCDPSession(page);
    const touch = async (
      type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
      x = 0,
      y = 0,
    ) => {
      await input.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd" || type === "touchCancel"
            ? []
            : [{ x, y, id: 1 }],
      });
    };
    try {
      await input.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { bottom: 24 },
      });
      await mountChatPage(page);
      const pile = page.getByRole("group", {
        name: "Alice Discard pile 1",
        exact: true,
      });
      await pile.getByRole("button", { name: "View all" }).click();
      const source = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await source.scrollIntoViewIfNeeded();
      const pickup = await box(source);
      const scroll = page.locator(".app-shell");
      const viewport = await box(scroll);
      const dock = await box(page.getByRole("button", { name: "Open chat" }));
      // The active scrolling edge is above the dock, not the physical screen edge.
      expect(viewport.y + viewport.height).toBe(504);
      expect(dock.y).toBeGreaterThanOrEqual(viewport.y + viewport.height);
      await touch("touchStart", pickup.x + 30, pickup.y + 40);
      const overlay = page.getByLabel("Moving 5 of Clubs");
      await overlay.waitFor();
      const before = await scroll.evaluate((element) => element.scrollTop);
      await touch("touchMove", pickup.x + 30, viewport.y + viewport.height - 5);
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(before + 40);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
      if (ending === "touchcancel") await touch("touchCancel");
      else if (ending === "chat") {
        await page.getByRole("button", { name: "Open chat" }).click();
        await page.getByRole("button", { name: "Close chat" }).waitFor();
        await overlay.waitFor({ state: "detached" });
        await touch("touchEnd");
      } else {
        const target = pile.getByRole("button", {
          name: "Discard Hand to pile 1",
          exact: true,
        });
        await target.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
        const bounds = await box(target);
        // Overlap of the floating card is insufficient; the finger is outside.
        const label = await box(pile.getByText(/^\d+ cards$/));
        await touch(
          "touchMove",
          ending === "outside" ? bounds.x - 1 : label.x + label.width / 2,
          ending === "outside" ? bounds.y + 30 : label.y + label.height / 2,
        );
        await expect
          .poll(() => target.getAttribute("data-drop-hovered"))
          .not.toBe("true");
        await touch("touchEnd");
      }
      await overlay.waitFor({ state: "detached" });
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([]);
      const stopped = await scroll.evaluate((element) => element.scrollTop);
      await page.waitForTimeout(150);
      expect(await scroll.evaluate((element) => element.scrollTop)).toBe(
        stopped,
      );
      if (ending === "chat")
        await page.getByRole("button", { name: "Close chat" }).click();
      expect(await source.getAttribute("aria-pressed")).toBe("false");
      expect(
        await pile.getByRole("button", { name: "Close", exact: true }).count(),
      ).toBe(1);
      // A mouse action still works after the touch gesture, without a stale sensor.
      await source.click();
      await page
        .getByRole("button", { name: "Discard Hand to pile 1", exact: true })
        .click();
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
        { kind: "DISCARD_FROM_HAND", cardId: "player-1-hand-5", pileIndex: 0 },
      ]);
    } finally {
      await input.detach();
      await page.close();
    }
  },
  15000,
);

it.each([320, 390, 768, 1024, 1440])(
  "uses card-sized empty slots and whole-stack destination bounds at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await mountChatPage(page);
      const state = denseBoardState(2);
      state.center.buildPiles = [];
      state.byId["player-1"]!.discards[1] = [];
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 1 }),
        state,
      );
      const slot = page.getByLabel("New Build pile", { exact: true });
      await slot.waitFor();
      const empty = page.getByLabel("Discard pile 2, empty", { exact: true });
      for (const target of [slot, empty]) {
        const bounds = await box(target);
        expect(bounds.width).toBe(72);
        expect(bounds.height).toBe(104);
      }
      expect(
        (await box(page.getByRole("region", { name: "Build piles" }))).height,
      ).toBeGreaterThan(104);
      await page.getByRole("button", { name: "Hand 5 of Clubs" }).click();
      const pile = page.getByRole("group", { name: "Alice Discard pile 1" });
      const destination = pile.getByRole("button", {
        name: "Discard Hand to pile 1",
        exact: true,
      });
      const bounds = await box(destination);
      const covered = await box(pile.getByLabel(/^Covered Discard/).first());
      const top = await box(pile.getByLabel(/^Discard pile 1,/));
      expect(bounds.x).toBe(covered.x);
      expect(bounds.y).toBe(covered.y);
      expect(bounds.width).toBe(72);
      expect(bounds.y + bounds.height).toBe(top.y + top.height);
      expect(
        await destination.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
      ).toBe("4px");
      const label = await box(pile.getByText("Discard 1", { exact: true }));
      expect(label.y + label.height).toBeLessThanOrEqual(bounds.y);
      const control = await box(pile.getByRole("button", { name: "View all" }));
      expect(control.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    } finally {
      await page.close();
    }
  },
);

it.each(["Enter", "Space"])(
  "selects, cancels, switches sources and activates whole-pile destinations with %s",
  async (key) => {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 900 },
    });
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      const pile = page.getByRole("group", {
        name: "Alice Discard pile 1",
        exact: true,
      });
      const open = pile.getByRole("button", { name: "View all" });
      await open.click();
      const id = await pile
        .getByRole("button", { name: "Close", exact: true })
        .getAttribute("aria-controls");
      const hand = page.getByRole("button", {
        name: "Hand 5 of Clubs",
        exact: true,
      });
      await hand.focus();
      await page.keyboard.press(key);
      expect(await hand.getAttribute("aria-pressed")).toBe("true");
      expect(await open.isDisabled()).toBe(true);
      expect(
        await page
          .getByRole("region", { name: "Game board" })
          .getByRole("status")
          .textContent(),
      ).toContain("legal Discard destinations");
      await page.keyboard.press("Escape");
      expect(await hand.getAttribute("aria-pressed")).toBe("false");
      expect(
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .getAttribute("aria-controls"),
      ).toBe(id);
      expect(
        await page
          .getByRole("region", { name: "Game board" })
          .getByRole("status")
          .textContent(),
      ).toContain("Selection cancelled");
      await hand.focus();
      await page.keyboard.press(key);
      const target = pile.getByRole("button", {
        name: "Discard Hand to pile 1",
        exact: true,
      });
      await target.focus();
      await page.keyboard.press(key);
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
        { kind: "DISCARD_FROM_HAND", cardId: "player-1-hand-5", pileIndex: 0 },
      ]);
      expect(await open.isDisabled()).toBe(true);
      await page.evaluate(() =>
        window.chatTest.update({
          pendingAction: null,
          lastActionResult: {
            version: 1,
            actionId: "browser-action-1",
            code: "ILLEGAL_ACTION",
            seq: window.__roomView.seq,
            state: window.__roomView.state,
          },
        }),
      );
      expect(await page.getByRole("alert").textContent()).toContain(
        "Action rejected",
      );
      expect(
        await pile
          .getByRole("button", { name: "Close", exact: true })
          .getAttribute("aria-controls"),
      ).toBe(id);
      const ace = page.getByRole("button", {
        name: "Hand Ace of Clubs",
        exact: true,
      });
      await ace.focus();
      await page.keyboard.press(key);
      const three = page.getByRole("button", {
        name: "Hand 3 of Clubs",
        exact: true,
      });
      await three.focus();
      await page.keyboard.press(key);
      expect(await ace.getAttribute("aria-pressed")).toBe("false");
      const build = page.getByRole("button", {
        name: "Build pile build-1, next 3",
        exact: true,
      });
      expect(await build.getByText("build-1 → 3").count()).toBe(0);
      expect(
        await build.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
      ).toBe("4px");
      await build.focus();
      await page.keyboard.press(key);
      expect(await page.evaluate(() => window.chatTest.actions[1])).toEqual({
        kind: "PLAY_HAND_TO_BUILD",
        cardId: "player-1-hand-3",
        target: "build-1",
      });
    } finally {
      await page.close();
    }
  },
);

it.each([320, 390, 768, 1024, 1440])(
  "fully exposes large own and opponent histories inline without overflow at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      const state = denseBoardState(2);
      const history = Array.from({ length: 30 }, (_, index) => ({
        kind: "standard" as const,
        id: `history-${index}`,
        rank: 7 as const,
        suit: "Hearts" as const,
      }));
      state.byId["player-1"]!.discards = [history, []];
      state.byId["player-2"]!.discards[0] = history.map((card) => ({
        ...card,
        id: `opponent-${card.id}`,
      }));
      await page.evaluate(
        (state) => window.chatTest.update({ state, seq: 1 }),
        state,
      );
      await page
        .getByRole("group", { name: "Alice Discard pile 2", exact: true })
        .waitFor();

      for (const name of ["Alice", "Bob"]) {
        const pile = page.getByRole("group", {
          name: `${name} Discard pile 1`,
          exact: true,
        });
        const compact = pile.getByLabel(/^(Covered )?Discard pile 1,/);
        expect(await compact.count()).toBe(name === "Alice" ? 3 : 1);
        if (name === "Alice") {
          const first = await box(compact.first());
          const last = await box(compact.last());
          expect(last.y - first.y).toBe(40);
        }
        const open = pile.getByRole("button", { name: "View all" });
        const historyId = await open.getAttribute("aria-controls");
        await open.focus();
        await page.keyboard.press("Enter");
        const close = pile.getByRole("button", { name: "Close", exact: true });
        expect(await close.getAttribute("aria-expanded")).toBe("true");
        expect(await close.getAttribute("aria-controls")).toBe(historyId);
        expect(await pile.getByText("Top", { exact: true }).count()).toBe(1);
        const cards = pile.getByLabel(/^(Covered )?Discard pile 1,/);
        expect(await cards.count()).toBe(30);
        let previousBottom = 0;
        for (const card of await cards.all()) {
          await card.scrollIntoViewIfNeeded();
          const dimensions = await card.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const pileTop = element
              .closest('[role="group"]')!
              .getBoundingClientRect().top;
            return {
              width: rect.width,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top - pileTop,
              bottom: rect.bottom - pileTop,
              exposed: [
                [4, 4],
                [rect.width / 2, rect.height / 2],
                [rect.width - 4, rect.height - 4],
              ].every(([x, y]) =>
                element.contains(
                  document.elementFromPoint(rect.x + x!, rect.y + y!),
                ),
              ),
            };
          });
          expect(dimensions.width).toBe(72);
          expect(dimensions.height).toBe(104);
          expect(dimensions.left).toBeGreaterThanOrEqual(0);
          expect(dimensions.right).toBeLessThanOrEqual(width);
          expect(dimensions.top).toBeGreaterThanOrEqual(previousBottom);
          expect(dimensions.exposed).toBe(true);
          previousBottom = dimensions.bottom;
        }
        const bounds = await box(pile);
        expect(bounds.height).toBeGreaterThan(3300);
        const controlBounds = await box(close);
        expect(controlBounds.y).toBeGreaterThanOrEqual(
          (await box(cards.last())).y + 104,
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const empty = page.getByRole("group", {
        name: "Alice Discard pile 2",
        exact: true,
      });
      expect(await empty.getByRole("button").count()).toBe(0);
      await page.getByRole("button", { name: "Hand 5 of Clubs" }).click();
      const destination = empty.getByRole("button", {
        name: "Discard pile 2, empty",
      });
      const emptyBounds = await box(destination);
      expect(emptyBounds.width).toBe(72);
      expect(emptyBounds.height).toBe(104);
      await destination.click();
      expect(await page.evaluate(() => window.chatTest.actions)).toEqual([
        { kind: "DISCARD_FROM_HAND", cardId: "player-1-hand-5", pileIndex: 1 },
      ]);
    } finally {
      await page.close();
    }
  },
  15_000,
);

it.each([320, 390, 768, 1024, 1440])(
  "reserves capped Stock and Build stack offsets without clipping at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(3000);
    try {
      await mountChatPage(page);
      let singleStockHeight = 0;
      let singleBuildHeight = 0;
      for (const { count, depth, offset } of [
        { count: 0, depth: 0, offset: 0 },
        { count: 1, depth: 0, offset: 0 },
        { count: 2, depth: 1, offset: 4 },
        { count: 3, depth: 2, offset: 8 },
        { count: 8, depth: 2, offset: 8 },
      ]) {
        const state = denseBoardState(2);
        const cards = Array.from({ length: count }, (_, index) => ({
          kind: "standard" as const,
          id: `stack-${index}`,
          rank: (index + 1) as Rank,
          suit: "Spades" as const,
        }));
        state.byId["player-1"]!.stock.faceDown = cards;
        state.byId["player-1"]!.hand.cards = [{ kind: "joker", id: "wild" }];
        state.center.buildPiles = [
          { id: "stack", cards, nextRank: (count + 1) as Rank },
        ];
        await page.evaluate(
          ({ state, seq }) => window.chatTest.update({ state, seq }),
          { state, seq: count + 1 },
        );
        const stock = page.getByRole("group", {
          name: "Your Stock",
          exact: true,
        });
        await stock.getByText(`Stock (${count})`, { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Hand Joker", exact: true })
          .click();
        const build = page.getByRole("button", {
          name: `Build pile stack, next ${count + 1}`,
          exact: true,
        });
        const stockBounds = await box(stock);
        const buildBounds = await box(build);
        if (count === 1) {
          singleStockHeight = stockBounds.height;
          singleBuildHeight = buildBounds.height;
        }
        if (count > 1) {
          expect(stockBounds.height - singleStockHeight).toBe(offset);
          expect(buildBounds.height - singleBuildHeight).toBe(offset);
        }
        expect(
          await stock.getByLabel("Covered Stock card", { exact: true }).count(),
        ).toBe(depth);
        expect(await build.getByLabel(/^Covered Build/).count()).toBe(depth);
        for (const [pile, covered, top] of [
          [
            stock,
            stock.getByLabel("Covered Stock card", { exact: true }),
            stock.getByLabel(/^Stock top/),
          ],
          [
            build,
            build.getByLabel(/^Covered Build/),
            build.getByLabel(/^Build top/),
          ],
        ] as const) {
          const bounds = await box(pile);
          if (!count) {
            const empty = await box(pile.getByText("—", { exact: true }));
            expect(empty.width).toBe(72);
            expect(empty.height).toBe(104);
            continue;
          }
          const topBounds = await box(top);
          expect(topBounds.width).toBe(72);
          expect(topBounds.height).toBe(104);
          for (const card of [...(await covered.all()), top]) {
            const cardBounds = await box(card);
            expect(cardBounds.x).toBeGreaterThanOrEqual(bounds.x);
            expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(
              bounds.x + bounds.width,
            );
            expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(
              bounds.y + bounds.height,
            );
            expect(cardBounds.x).toBeGreaterThanOrEqual(0);
            expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(width);
          }
          if (depth) {
            const bottom = covered.first();
            const bottomBounds = await box(bottom);
            expect(topBounds.x - bottomBounds.x).toBe(offset);
            expect(topBounds.y - bottomBounds.y).toBe(offset);
            await bottom.evaluate((element) =>
              element.scrollIntoView({ block: "center" }),
            );
            // Click the exposed corner, rather than the covered card's hidden center.
            const corner = await box(bottom);
            expect(
              await bottom.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const hit = document.elementFromPoint(rect.x + 1, rect.y + 1);
                return {
                  exposed: element.contains(hit),
                  card: element.getAttribute("aria-label"),
                  hit: hit?.outerHTML.slice(0, 300),
                };
              }),
            ).toMatchObject({ exposed: true });
            await page.mouse.click(corner.x + 1, corner.y + 1);
            if (pile === build) {
              expect(
                await page.evaluate(() => window.chatTest.actions.length),
              ).toBeGreaterThan(0);
              await page.evaluate(() =>
                window.chatTest.update({
                  pendingAction: null,
                  lastActionResult: {
                    version: 1,
                    actionId: `browser-action-${window.chatTest.actions.length}`,
                    code: "ILLEGAL_ACTION",
                    seq: window.__roomView.seq,
                    state: window.__roomView.state,
                  },
                }),
              );
              await page.getByRole("button", { name: "Hand Joker" }).click();
            } else {
              expect(
                await page
                  .getByRole("button", { name: "Hand Joker" })
                  .getAttribute("aria-pressed"),
              ).toBe("true");
            }
          }
          await top.evaluate((element) =>
            element.scrollIntoView({ block: "center" }),
          );
          expect(
            await top.evaluate((element) => {
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
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
      }
    } finally {
      await page.close();
    }
  },
  15_000,
);

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
              element.parentElement!.previousElementSibling!.getBoundingClientRect()
                .y,
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
