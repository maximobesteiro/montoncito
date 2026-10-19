// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page, type Route } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";

let browser: Browser;
let css: string;
let clientScript: string;
const nickname = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";

beforeAll(async () => {
  const from = fileURLToPath(new URL("../../globals.css", import.meta.url));
  css = (
    await postcss([tailwind({ base: process.cwd() })]).process(
      await readFile(from, "utf8"),
      { from },
    )
  ).css;
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SERVER_URL": '"https://lobby.test"',
    },
    esbuild: { jsx: "automatic", jsxDev: false },
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      {
        name: "controlled-lobby-boundaries",
        enforce: "pre",
        resolveId(id) {
          if (id === "next/navigation") return "\0test-navigation";
          if (id === "next/link") return "\0test-link";
          if (id === "@/lib/socket-client") return "\0test-socket";
        },
        load(id) {
          if (id === "\0test-navigation")
            return 'const navigate = (path) => {history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate"));}; const router = {push: navigate, replace: navigate}; export const useRouter = () => router; export const useParams = () => ({slug: "sample-room"});';
          if (id === "\0test-link")
            return 'import {createElement} from "react"; export default function Link({children,...props}) {return createElement("a",props,children);}';
          if (id === "\0test-socket")
            return "export const getSocketClient = () => ({connect() {}, disconnect() {}, on() {return () => {};}, sendChat() {}});";
        },
      },
    ],
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL("./lobby.browser.fixture.tsx", import.meta.url),
        ),
        formats: ["iife"],
        name: "LobbyFixture",
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

async function mountLobby(
  page: Page,
  options: {
    admission?: boolean;
    onReplacement?: (route: Route) => Promise<void>;
  } = {},
) {
  const joins: unknown[] = [];
  const profileWrites: string[] = [];
  await page.route("https://lobby.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const clientId = request.headers()["x-client-id"];
    if (path === "/profile") {
      if (request.method() === "PATCH") profileWrites.push(request.postData()!);
      return route.fulfill({
        json: {
          clientId,
          displayName: nickname,
          suggestions: ["Luna"],
          generation: "lobby-generation",
          revision: 0,
          updatedAt: "2026-10-19",
        },
      });
    }
    if (options.admission && path.endsWith("/nickname-suggestions"))
      return route.fulfill({ json: { suggestions: ["Luna"] } });
    if (options.admission && path.endsWith("/join")) {
      const body = request.postDataJSON();
      joins.push(body);
      if (body.displayName && options.onReplacement)
        return options.onReplacement(route);
      return route.fulfill({
        status: 409,
        json: { code: "NICKNAME_CONFLICT" },
      });
    }
    if (path.startsWith("/rooms/"))
      return route.fulfill({
        json: {
          id: "room-1",
          slug: "sample-room",
          ownerId: options.admission ? "host" : clientId,
          status: "open",
          visibility: "public",
          maxPlayers: 4,
          players: [
            {
              id: options.admission ? "host" : clientId,
              displayName: nickname,
              isOwner: true,
              isReady: false,
            },
          ],
          gameConfig: { discardPiles: 3 },
          createdAt: "2026-10-19",
          wsJoinToken: "token",
        },
      });
    return route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>',
    });
  });
  await page.goto("https://lobby.test/room/sample-room");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: clientScript });
  if (options.admission)
    await page.getByRole("dialog", { name: "Edit nickname" }).waitFor();
  else
    await page
      .getByRole("button", { name: `Edit nickname: ${nickname}` })
      .waitFor();
  return { joins, profileWrites };
}

it.each([320, 360, 390, 768])(
  "keeps Lobby identity and theme in one bounded header row at %ipx with full-name access",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.setDefaultTimeout(3000);
    try {
      await mountLobby(page);
      const header = page.getByRole("banner");
      const brand = header.getByRole("link", { name: "Montoncito" });
      const edit = header.getByRole("button", {
        name: `Edit nickname: ${nickname}`,
      });
      const theme = header.getByRole("button", { name: "Toggle theme" });
      const [b, e, t] = await Promise.all([
        brand.boundingBox(),
        edit.boundingBox(),
        theme.boundingBox(),
      ]);
      expect(b!.x + b!.width).toBeLessThanOrEqual(e!.x);
      expect(e!.x + e!.width).toBeLessThanOrEqual(t!.x);
      expect(
        Math.abs(b!.y + b!.height / 2 - e!.y - e!.height / 2),
      ).toBeLessThan(2);
      expect(
        Math.abs(e!.y + e!.height / 2 - t!.y - t!.height / 2),
      ).toBeLessThan(2);
      expect(t!.x + t!.width).toBeLessThanOrEqual(width);
      expect(e!.width).toBeGreaterThan(30);
      expect(t!.width).toBeGreaterThanOrEqual(40);
      expect(await edit.getAttribute("title")).toBe(nickname);
      if (width < 640)
        expect(
          await edit
            .locator("span")
            .first()
            .evaluate((element) => element.scrollWidth > element.clientWidth),
        ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await edit.click();
      expect(
        await page.getByRole("textbox", { name: "Nickname" }).inputValue(),
      ).toBe(nickname);
    } finally {
      await page.close();
    }
  },
);

it.each(["header", "row"])(
  "contains focus and restores the %s opener after keyboard, Cancel and backdrop dismissal",
  async (source) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 800 },
    });
    page.setDefaultTimeout(3000);
    try {
      await mountLobby(page);
      const opener = page.getByRole("button", {
        name:
          source === "header" ? `Edit nickname: ${nickname}` : "Edit nickname",
        exact: true,
      });
      for (const dismissal of ["Escape", "Cancel", "backdrop"]) {
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Edit nickname" });
        const input = dialog.getByRole("textbox", { name: "Nickname" });
        expect(await input.inputValue()).toBe(nickname);
        expect(
          await input.evaluate((element) => element === document.activeElement),
        ).toBe(true);
        expect(
          await dialog.evaluate((element) => element.matches(":modal")),
        ).toBe(true);
        await input.press("Shift+Tab");
        expect(
          await dialog
            .getByRole("button", { name: "Cancel" })
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("Tab");
        expect(
          await input.evaluate((element) => element === document.activeElement),
        ).toBe(true);
        await input.fill("Discard this draft");
        if (dismissal === "backdrop") await page.mouse.click(2, 2);
        else if (dismissal === "Cancel")
          await dialog.getByRole("button", { name: "Cancel" }).click();
        else await input.press("Escape");
        expect(await dialog.count()).toBe(0);
        expect(
          await opener.evaluate(
            (element) => element === document.activeElement,
          ),
        ).toBe(true);
      }
    } finally {
      await page.close();
    }
  },
);

it.each(["Escape", "Cancel", "backdrop"])(
  "contains admission focus and returns Home on %s without confirming the draft",
  async (dismissal) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 640 },
    });
    page.setDefaultTimeout(3000);
    try {
      const calls = await mountLobby(page, { admission: true });
      const dialog = page.getByRole("dialog", { name: "Edit nickname" });
      const input = dialog.getByRole("textbox", { name: "Nickname" });
      expect(await dialog.innerText()).toContain("You have not joined");
      expect(await input.inputValue()).toBe("Luna");
      expect(
        await input.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      expect(
        await dialog.evaluate((element) => element.matches(":modal")),
      ).toBe(true);
      await input.press("Shift+Tab");
      expect(
        await dialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Tab");
      expect(
        await input.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      // Native modal inertness prevents even programmatic focus on the header.
      await page
        .getByRole("button", { name: "Toggle theme" })
        .evaluate((element: HTMLElement) => element.focus());
      expect(
        await input.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      expect(
        await page.getByRole("button", { name: /^Edit nickname/ }).count(),
      ).toBe(0);
      await input.fill(nickname);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      if (dismissal === "backdrop") await page.mouse.click(2, 2);
      else if (dismissal === "Cancel")
        await dialog.getByRole("button", { name: "Cancel" }).click();
      else await input.press("Escape");
      await page.getByRole("button", { name: /Casual Game/ }).waitFor();
      expect(new URL(page.url()).pathname).toBe("/");
      expect(await dialog.count()).toBe(0);
      expect(calls.joins).toEqual([{}]);
      expect(calls.profileWrites).toEqual([]);
      await page
        .getByRole("button", { name: `Edit nickname: ${nickname}` })
        .waitFor();
    } finally {
      await page.close();
    }
  },
);

it("submits admission with Enter once and blocks Escape, backdrop and controls until rejection", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.setDefaultTimeout(3000);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const calls = await mountLobby(page, {
      admission: true,
      onReplacement: async (route) => {
        await pending;
        await route.fulfill({
          status: 409,
          json: { code: "NICKNAME_CONFLICT" },
        });
      },
    });
    const dialog = page.getByRole("dialog", { name: "Edit nickname" });
    const input = dialog.getByRole("textbox", { name: "Nickname" });
    await input.fill("My draft");
    await input.press("Enter");
    await dialog.getByRole("button", { name: "Saving..." }).waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.mouse.click(2, 2);
    expect(await dialog.count()).toBe(1);
    expect(await input.isDisabled()).toBe(true);
    expect(
      await dialog.getByRole("button", { name: "Cancel" }).isDisabled(),
    ).toBe(true);
    expect(
      await dialog.getByRole("button", { name: "Shuffle" }).isDisabled(),
    ).toBe(true);
    release();
    await dialog.getByRole("alert").waitFor();
    expect(calls.joins).toHaveLength(2);
    expect(await input.inputValue()).toBe("My draft");
    expect(await dialog.innerText()).toContain(
      `Confirmed nickname: ${nickname}`,
    );
    expect(calls.profileWrites).toEqual([]);
    await input.press("Escape");
    await page.getByRole("button", { name: /Casual Game/ }).waitFor();
  } finally {
    release();
    await page.close();
  }
});
