// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Locator } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
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
beforeAll(async () => {
  const from = new URL("../../globals.css", import.meta.url).pathname;
  const result = await postcss([tailwind({ base: process.cwd() })]).process(
    await readFile(from, "utf8"),
    { from },
  );
  css = result.css;
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  await browser?.close();
});

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

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
