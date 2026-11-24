// Screenshots for the user guide (`public/instrukcja/index.html`, published with the demo): the
// website demo with its default, made-up amounts, opened in Chrome by Playwright, with numbered
// markers over the parts the guide talks about. Run after interface changes:
//   node scripts/instrukcja-zrzuty.mjs [part of a name]
// Needs Google Chrome (another browser: CHROME_PATH=...). Writes public/instrukcja/zrzuty/*.png.

import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const OUT = "public/instrukcja/zrzuty";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PHONE_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const only = process.argv[2];

/** Numbered markers over the given parts: a dashed frame and a number in a red circle. */
async function mark(page, items) {
  const boxes = [];
  for (const [locator, n] of items) {
    const box = await locator.first().boundingBox();
    if (!box) throw new Error(`znacznik ${n}: tej części nie ma na ekranie`);
    boxes.push({ ...box, n });
  }
  await page.evaluate((list) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const b of list) {
      const frame = document.createElement("div");
      Object.assign(frame.style, {
        position: "fixed",
        left: `${b.x - 4}px`,
        top: `${b.y - 4}px`,
        width: `${b.width + 8}px`,
        height: `${b.height + 8}px`,
        border: "2px dashed #b01e28",
        zIndex: 2147483646,
        pointerEvents: "none",
      });
      const badge = document.createElement("div");
      badge.textContent = String(b.n);
      Object.assign(badge.style, {
        position: "fixed",
        left: `${Math.min(Math.max(b.x - 16, 2), vw - 32)}px`,
        top: `${Math.min(Math.max(b.y - 16, 2), vh - 32)}px`,
        width: "28px",
        height: "28px",
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        background: "#b01e28",
        color: "#fff",
        border: "2px solid #fff",
        font: "700 15px/1 Arial, sans-serif",
        zIndex: 2147483647,
        pointerEvents: "none",
      });
      // An open window is in the top layer - the markers go inside it, else they would be under it.
      const windows = document.querySelectorAll("dialog[open]");
      (windows[windows.length - 1] ?? document.body).append(frame, badge);
    }
  }, boxes);
}

const wait = (page, ms = 350) => page.waitForTimeout(ms);
/** Scrolls so the part's top is near the top of the screen (under nothing - the page has no fixed bar on a PC). */
const toTop = async (locator, offset = 16) => {
  await locator.first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o), offset);
  await locator.page().waitForTimeout(300);
};
const tab = (p, name) => p.getByRole("tab", { name, exact: true });

/** Each screenshot on a fresh demo (first steps closed unless `steps`). */
const SHOTS = [
  {
    name: "pc-pierwsze-kroki",
    steps: true,
    run: async () => {},
  },
  {
    name: "pc-ekran-glowny",
    run: async (p) =>
      mark(p, [
        [p.locator(".side > .hinted").first(), 1],
        [p.locator(".side > .hinted").nth(1), 2],
        [p.locator(".rules"), 3],
        [p.locator(".tabs"), 4],
        [p.locator("#answer"), 5],
        [p.locator(".rule"), 6],
        [p.locator(".assume__title"), 7],
        [p.locator(".top fieldset").first(), 8],
        [p.getByRole("button", { name: "Sprawdź przepisy z AI" }), 9],
      ]),
  },
  {
    name: "pc-dymek",
    run: async (p) => {
      await p.locator(".side .hint__btn").first().click();
      await wait(p);
      await mark(p, [
        [p.locator(".side .hint__btn").first(), 1],
        [p.locator(".hint__more").first(), 2],
      ]);
    },
  },
  {
    name: "pc-suwak",
    run: async (p) => {
      const rule = p.locator(".rule");
      await toTop(p.locator("#answer"));
      await mark(p, [
        [rule.locator(".rule__value").first(), 1],
        [rule.locator(".rule__hair"), 2],
        [rule.locator(".rule__value").last(), 3],
        [rule.locator(".rule__label"), 4],
        [rule.locator(".rule__gap-text"), 5],
      ]);
    },
  },
  {
    name: "pc-skad-te-kwoty",
    run: async (p) => {
      const dims = p.locator(".dims").first();
      await toTop(p.getByRole("heading", { name: "Skąd te kwoty" }));
      const first = dims.locator("button").first();
      await first.click();
      await wait(p, 400);
      await mark(p, [
        [dims.locator(".dims__title"), 1],
        [first, 2],
        [dims.locator(".dims__detail").first(), 3],
      ]);
    },
  },
  {
    name: "pc-wykres-i-miesiace",
    run: async (p) => {
      await toTop(p.getByRole("heading", { name: "Przy innej stawce B2B" }));
      await mark(p, [
        [p.locator(".profit__read"), 1],
        [p.locator(".profit svg").first(), 2],
        [p.locator(".profit summary").first(), 3],
      ]);
    },
  },
  {
    name: "pc-miesiac-po-miesiacu",
    run: async (p) => {
      await toTop(p.getByRole("heading", { name: "Miesiąc po miesiącu" }));
      await mark(p, [
        [p.locator(".months table, .months").first(), 1],
        [p.getByRole("heading", { name: "Co się zmieni i kiedy" }), 2],
      ]);
    },
  },
  {
    name: "pc-zalozenia",
    run: async (p) => {
      const sentence = p.locator(".assume__sentence").first();
      await toTop(p.locator(".assume__title"));
      await sentence.click();
      await wait(p, 500);
      await mark(p, [
        [p.locator(".assume__lead"), 1],
        [sentence, 2],
        [p.locator(".assume__sentence").nth(1), 3],
      ]);
    },
  },
  {
    name: "pc-zapisz-i-udostepnij",
    run: async (p) => {
      await toTop(p.locator(".scenarios"), 120);
      await mark(p, [
        [p.getByRole("button", { name: "Pobierz PDF" }), 1],
        [p.getByRole("button", { name: "Kopiuj link" }), 2],
        [p.getByRole("button", { name: "Zapisz", exact: true }), 3],
      ]);
    },
  },
  {
    name: "pc-rok",
    run: async (p) => {
      await tab(p, "Rok").click();
      await wait(p, 500);
      await mark(p, [
        [p.locator(".tape__legend"), 1],
        [p.getByRole("heading", { name: "Terminy płatności" }), 2],
      ]);
    },
  },
  {
    name: "pc-co-warto-wiedziec",
    run: async (p) => {
      await tab(p, "Co warto wiedzieć").click();
      await wait(p, 500);
      await mark(p, [[p.locator(".know__toc"), 1]]);
    },
  },
  {
    name: "pc-zrodla",
    run: async (p) => {
      await tab(p, "Źródła").click();
      await wait(p, 500);
      await mark(p, [
        [p.getByRole("button", { name: "Odśwież" }), 1],
        [p.getByRole("heading", { name: /^Liczby w obliczeniach/ }), 2],
      ]);
    },
  },
  {
    name: "pc-ai",
    run: async (p) => {
      await p.getByRole("button", { name: "Sprawdź przepisy z AI" }).click();
      await wait(p, 500);
      await mark(p, [[p.locator("dialog[open] #ai-title"), 1]]);
    },
  },
  {
    name: "pc-ciemny",
    dark: true,
    run: async (p) => mark(p, [[p.locator(".top fieldset").nth(1), 1]]),
  },
  {
    name: "tel-ekran-glowny",
    phone: true,
    run: async (p) =>
      mark(p, [
        [p.locator(".side > .hinted").first(), 1],
        [p.locator(".side > .hinted").nth(1), 2],
        [p.locator(".dock"), 3],
      ]),
  },
  {
    name: "tel-pierwsze-kroki",
    phone: true,
    steps: true,
    run: async () => {},
  },
];

mkdirSync(OUT, { recursive: true });
const server = await createServer({ mode: "demo", logLevel: "error", server: { port: 5198, strictPort: false, open: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
try {
  for (const shot of SHOTS) {
    if (only && !shot.name.includes(only)) continue;
    const scheme = shot.dark ? "dark" : "light";
    const context = await browser.newContext(
      shot.phone
        ? { viewport: { width: 400, height: 860 }, userAgent: PHONE_AGENT, hasTouch: true, isMobile: true, colorScheme: scheme, reducedMotion: "reduce" }
        : { viewport: { width: 1280, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" },
    );
    const page = await context.newPage();
    try {
      await page.goto(url);
      await page.locator(".steps__note.is-placed").waitFor();
      await wait(page, 500);
      if (!shot.steps) {
        await page.keyboard.press("Escape");
        await wait(page);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await shot.run(page);
      await wait(page, 150);
      await page.screenshot({ path: `${OUT}/${shot.name}.png` });
      console.log("ok", shot.name);
    } catch (e) {
      failed++;
      console.error("BŁĄD", shot.name, e.message.split("\n")[0]);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
