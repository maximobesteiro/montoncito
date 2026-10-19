// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";

let browser: Browser;
let css: string;
let clientScript: string;
const nickname = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
beforeAll(async () => {
  const from = fileURLToPath(new URL("./globals.css", import.meta.url));
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
      "process.env.NEXT_PUBLIC_SERVER_URL": '"https://home.test"',
    },
    esbuild: { jsx: "automatic", jsxDev: false },
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      {
        name: "controlled-home-navigation",
        enforce: "pre",
        resolveId(id) {
          if (id === "next/navigation") return "\0test-navigation";
          if (id === "next/link") return "\0test-link";
        },
        load(id) {
          if (id === "\0test-navigation")
            return "export const useRouter = () => ({push: path => window.homeNavigate(path)});";
          if (id === "\0test-link")
            return 'import {createElement} from "react"; export default function Link({children,...props}) { return createElement("a",props,children); }';
        },
      },
    ],
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL("./home.browser.fixture.tsx", import.meta.url),
        ),
        formats: ["iife"],
        name: "HomeFixture",
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

async function mountHome(page: Page) {
  await page.route("https://home.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>',
    }),
  );
  await page.route("https://home.test/profile", (route) =>
    route.fulfill({
      json: {
        clientId: route.request().headers()["x-client-id"],
        displayName: nickname,
        suggestions: ["Luna"],
        generation: "home-generation",
        revision: 0,
        updatedAt: "2026-10-19",
      },
    }),
  );
  await page.goto("https://home.test/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: clientScript });
  await page
    .getByRole("button", { name: `Edit nickname: ${nickname}` })
    .waitFor();
}

it("contains modal focus, blocks background interaction and restores the opener after Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.setDefaultTimeout(3000);
  try {
    await mountHome(page);
    const opener = page.getByRole("button", {
      name: `Edit nickname: ${nickname}`,
    });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Edit nickname" });
    const input = dialog.getByRole("textbox", { name: "Nickname" });
    expect(
      await input.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
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
    await page
      .getByRole("button", { name: "Toggle theme" })
      .evaluate((element: HTMLElement) => element.focus());
    expect(
      await input.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await input.fill("Discard this draft");
    await page.keyboard.press("Escape");
    expect(await dialog.count()).toBe(0);
    expect(
      await opener.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await opener.click();
    expect(await input.inputValue()).toBe(nickname);
  } finally {
    await page.close();
  }
});

it.each([320, 360, 390, 768])(
  "keeps maximum-length identity, edit and theme controls in one bounded header row at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.setDefaultTimeout(3000);
    try {
      await mountHome(page);
      const header = page.getByRole("banner");
      const brand = header.getByRole("link", { name: "Montoncito" });
      const edit = header.getByRole("button", {
        name: `Edit nickname: ${nickname}`,
      });
      const theme = header.getByRole("button", { name: "Toggle theme" });
      const boxes = await Promise.all([
        brand.boundingBox(),
        edit.boundingBox(),
        theme.boundingBox(),
      ]);
      const [b, e, t] = boxes.map((box) => {
        expect(box).not.toBeNull();
        return box!;
      });
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
      await theme.click();
      await page.getByRole("option", { name: "Dark" }).click();
      expect(await page.locator("html").getAttribute("class")).toContain(
        "dark",
      );
      await edit.click();
      expect(
        await page.getByRole("textbox", { name: "Nickname" }).inputValue(),
      ).toBe(nickname);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(
        await edit.evaluate((element) => element === document.activeElement),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);

it("discards backdrop drafts but prevents backdrop/Escape dismissal and repeated Enter while saving", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  page.setDefaultTimeout(3000);
  try {
    await mountHome(page);
    const opener = page.getByRole("button", {
      name: `Edit nickname: ${nickname}`,
    });
    await opener.click();
    await page.getByRole("textbox", { name: "Nickname" }).fill("Discard");
    await page.mouse.click(2, 2);
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      await opener.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await opener.click();
    const input = page.getByRole("textbox", { name: "Nickname" });
    expect(await input.inputValue()).toBe(nickname);
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("https://home.test/profile", async (route) => {
      requests += 1;
      await pending;
      await route.fulfill({
        json: {
          clientId: route.request().headers()["x-client-id"],
          displayName: "Sol",
          suggestions: ["Luna"],
          generation: "home-generation",
          revision: 1,
          updatedAt: "2026-10-19",
        },
      });
    });
    await input.fill("  Sol  ");
    await input.press("Enter");
    await page.getByRole("button", { name: "Saving..." }).waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.mouse.click(2, 2);
    expect(
      await page.getByRole("dialog", { name: "Edit nickname" }).count(),
    ).toBe(1);
    expect(
      await page
        .getByRole("button", { name: "Cancel", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(requests).toBe(1);
    release();
    await page.getByRole("button", { name: "Edit nickname: Sol" }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
  } finally {
    await page.close();
  }
});

it("removes the modal and releases the background on navigation even while a save response is delayed", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.setDefaultTimeout(3000);
  try {
    await mountHome(page);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("https://home.test/profile", async (route) => {
      if (route.request().method() === "PATCH") await pending;
      await route.fulfill({
        json: {
          clientId: route.request().headers()["x-client-id"],
          displayName: "Accepted after navigation",
          suggestions: ["Luna"],
          generation: "home-generation",
          revision: 1,
          updatedAt: "2026-10-19",
        },
      });
    });
    await page.getByRole("button", { name: /^Edit nickname:/ }).click();
    await page
      .getByRole("textbox", { name: "Nickname" })
      .fill("Accepted after navigation");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Saving..." }).waitFor();
    await page.evaluate(() => window.homeNavigate("/other"));
    await page.getByText("Another page").waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: /^Edit nickname:/ }).count(),
    ).toBe(0);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("option", { name: "Light" }).click();
    release();
    await page.waitForFunction(() => {
      const id = localStorage.getItem("montoncito:clientId");
      return (
        localStorage.getItem(`montoncito:nickname:${id}`) ===
        "Accepted after navigation"
      );
    });
    await page.evaluate(() => window.homeNavigate("/"));
    await page
      .getByRole("button", { name: "Edit nickname: Accepted after navigation" })
      .waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
  } finally {
    await page.close();
  }
});
