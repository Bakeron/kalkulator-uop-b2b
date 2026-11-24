// The look check (plan A17, assumption A7): opens the app in Chrome (Playwright), goes through
// every tab in the light and the dark theme with all assumption groups unfolded, one "?" hint
// and the AI window open, and checks the computed styles for:
//  - the "looks like AI" patterns from the ban list - a coloured stripe on the side of a block,
//    gradient text, gradients (the hatching of a section is a repeating gradient and allowed),
//    glass (backdrop-filter), soft shadows and glows, blur, tilted elements, violet-indigo colours,
//    the fonts every AI app uses (Inter, Geist, Roboto, ...) and mono in labels and buttons;
//  - legibility - text contrast at least 4.5:1 (3:1 for large text), no text under 12 px;
//  - movement ("nic zerojedynkowo", assumption A9) - every tab, switch, unfolding sentence, field
//    shown after a tick, table and window starts an animation instead of changing at once.
// Run: `npm run test:look` (needs Google Chrome; another browser: CHROME_PATH=...).

import { createServer } from "vite";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TABS = ["Porównanie", "Rok", "Co warto wiedzieć", "Źródła"];
/** The parts of "Porównanie" (plan A27); on a phone "Założenia" is one more tab, on the bar at the bottom. */
const PARTS = ["Wynik", "Skąd te kwoty", "Przy innej stawce", "Miesiąc po miesiącu"];
const tabsAt = (width) => (width <= 900 ? ["Porównanie", "Założenia", ...TABS.slice(1)] : TABS);

/** An application window (plan A27): the window itself never scrolls, only areas inside it. */
async function windowStill(page, where) {
  const [h, inner, w, innerW] = await page.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight, document.scrollingElement.scrollWidth, innerWidth]);
  return h > inner || w > innerW ? [`${where}: okno się przewija (${w}×${h} przy oknie ${innerW}×${inner}) - przewijać mają się tylko pola w środku`] : [];
}

/** Runs in the page: every rule above over every visible element. Returns the problems found. */
function inspect(where) {
  const BANNED_FONTS = /^(inter|geist|roboto|space grotesk|instrument serif|playfair display|poppins|manrope|dm sans)$/i;
  const MONO = /mono|courier|consolas|menlo/i;
  const problems = [];
  const name = (el) => {
    const cls = typeof el.className === "string" ? el.className : (el.className?.baseVal ?? "");
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls.trim().split(/\s+/).join(".") : ""} "${text}"`;
  };
  const add = (el, what) => problems.push(`${where}: ${what} - ${name(el)}`);

  const rgba = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const mix = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hueSat = ({ r, g, b }) => {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const d = max - min;
    if (d === 0) return { h: 0, s: 0 };
    const l = (max + min) / 2;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
    return { h, s };
  };
  // The background a text is drawn on: the nearest opaque background up the tree (a top-layer
  // window or popover has its own). Translucent layers are mixed on the way.
  const pageBg = rgba(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
  const backgroundOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let bg = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : pageBg;
    while (layers.length) bg = mix(layers.pop(), bg);
    return bg;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none";
  };
  const hidden = (el) => el.closest(".sr-only, [aria-hidden='true'] .sr-only, [hidden]");

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || hidden(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const isSvg = el instanceof SVGElement;

    if (s.backdropFilter && s.backdropFilter !== "none") add(el, "szkło (backdrop-filter)");
    if (s.backgroundClip === "text" || s.webkitBackgroundClip === "text") add(el, "tekst z gradientem");
    if (/(^|[^-])(linear|radial|conic)-gradient\(/.test(s.backgroundImage)) add(el, `gradient ${s.backgroundImage.slice(0, 50)}`);
    if (s.filter !== "none" && /blur|drop-shadow/.test(s.filter)) add(el, `rozmycie / poświata (filter ${s.filter})`);
    for (const sh of s.boxShadow === "none" ? [] : s.boxShadow.split(/,(?![^(]*\))/)) {
      const px = sh.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
      if ((px[2] ?? 0) > 0) add(el, `miękki cień (${sh.trim()})`);
      if (/inset/.test(sh) && (px[0] ?? 0) !== 0 && r.height >= 24) add(el, `kolorowy pasek z boku (${sh.trim()})`);
    }
    if (s.textShadow !== "none") add(el, `poświata tekstu (${s.textShadow})`);
    const sides = ["Top", "Right", "Bottom", "Left"].map((k) => parseFloat(s[`border${k}Width`]) || 0);
    const [bt, br, bb, bl] = sides;
    if (bl >= 3 && bt === 0 && br === 0 && bb === 0 && r.height >= 24 && r.width >= 40) add(el, "pasek z lewej");
    if (bt >= 3 && bl === 0 && br === 0 && bb === 0 && r.height >= 40 && r.width >= 80) add(el, "pasek u góry");
    if (!isSvg && s.transform !== "none") {
      const m = s.transform.match(/matrix\(([^)]+)\)/);
      const b = m ? Math.abs(parseFloat(m[1].split(",")[1])) : 0;
      if (b > 0.001) add(el, `przekrzywienie (${s.transform})`);
    }
    for (const prop of ["color", "backgroundColor", "borderTopColor", "borderLeftColor", "fill", "stroke"]) {
      const c = rgba(s[prop] ?? "");
      if (!c || c.a < 0.1) continue;
      const { h, s: sat } = hueSat(c);
      if (h >= 230 && h <= 300 && sat > 0.35) add(el, `fiolet / indygo (${prop} ${s[prop]})`);
    }

    // Text: the element's own text nodes only (so each text is checked once).
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const family = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    if (BANNED_FONTS.test(family)) add(el, `krój z szablonów AI (${family})`);
    if (MONO.test(family)) add(el, `czcionka maszynowa (${family})`);
    const size = parseFloat(s.fontSize);
    if (size < 12) add(el, `za mały tekst (${size}px)`);
    if (el.closest("[aria-hidden='true']") && !isSvg) continue;
    const ink = rgba(isSvg ? s.fill : s.color);
    if (!ink || ink.a === 0) continue;
    const bg = backgroundOf(isSvg ? el.ownerSVGElement ?? el : el);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrast(mix(ink, bg), bg);
    if (ratio < need - 0.01) add(el, `kontrast ${ratio.toFixed(2)}:1 (potrzeba ${need}:1)`);
  }
  return problems;
}

/**
 * Clicks every control that changes what is shown and requires some animation to start within
 * 400 ms (before each click it waits until the page is still). With motion allowed, unlike the
 * look pages above.
 */
async function motionCheck() {
  const found = [];
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: "no-preference" });
  try {
    await page.goto(url);
    await page.locator(".answer").first().waitFor();
    const still = () =>
      page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 3000 }).catch(() => {});
    const moves = async (what, act) => {
      await still();
      await act();
      const moved = await page
        .waitForFunction(() => document.getAnimations().some((a) => a.playState === "running"), null, { timeout: 400, polling: 10 })
        .then(() => true)
        .catch(() => false);
      if (!moved) found.push(`ruch: „${what}” zmienia się od razu, bez animacji`);
    };
    const skip = page.getByRole("button", { name: "Pomiń" });
    if (await skip.isVisible()) await skip.click();
    for (const tab of [...TABS.slice(1), TABS[0]]) await moves(`zakładka ${tab}`, () => page.getByRole("tab", { name: tab, exact: true }).click());
    await moves("części Porównania - z drugą zakładką", () => page.getByRole("tab", { name: "Rok", exact: true }).click());
    await moves("części Porównania - powrót", () => page.getByRole("tab", { name: "Porównanie", exact: true }).click());
    for (const p of [...PARTS.slice(1), PARTS[0]]) await moves(`część ${p}`, () => page.getByRole("tab", { name: p, exact: true }).click());
    for (const sign of ["€", "zł"]) await moves(`waluta ${sign}`, () => page.locator(".theme--currency label", { hasText: sign }).click());
    for (const theme of ["Ciemny", "Jasny"]) await moves(`motyw ${theme}`, () => page.locator(".theme label", { hasText: theme }).click());
    const rules = page.locator(".rules__switch label");
    if ((await rules.count()) > 1) {
      await moves("przepisy od 1.01", () => rules.nth(1).click());
      await moves("przepisy na dziś", () => rules.nth(0).click());
    }
    const known = (text) => page.locator(".known label", { hasText: text });
    await moves("znam: tylko UoP", () => known("tylko UoP").click());
    await moves("wpisz sam", () => page.getByRole("button", { name: "Wpisz sam" }).click());
    await moves("znam: tylko B2B", () => known("tylko B2B").click());
    await moves("znam: obie kwoty", () => known("obie kwoty").click());
    const others = page.locator(".assume__sentence", { hasText: "Inne umowy" });
    await moves("zdanie założeń", () => others.click());
    const tick = page.locator("label", { hasText: "Umowa zlecenie" }).locator("input");
    await moves("pola po zaznaczeniu", () => tick.click());
    await moves("pola po odznaczeniu", () => tick.click());
    await page.getByRole("tab", { name: "Przy innej stawce", exact: true }).click();
    // The opening of <details> is a transition of ::details-content, which getAnimations() does
    // not list - its height must pass through values between closed and open instead.
    await still();
    const table = page.locator(".profit__table");
    const closed = await table.evaluate((el) => el.getBoundingClientRect().height);
    await page.locator(".profit__table summary").click();
    const heights = await table.evaluate(
      (el) =>
        new Promise((done) => {
          const out = [];
          const t0 = performance.now();
          const frame = () => {
            out.push(el.getBoundingClientRect().height);
            if (performance.now() - t0 < 400) requestAnimationFrame(frame);
            else done(out);
          };
          requestAnimationFrame(frame);
        }),
    );
    const open = heights[heights.length - 1];
    if (!heights.some((h) => Math.abs(h - closed) > 1 && Math.abs(h - open) > 1)) found.push("ruch: „tabela pod wykresem” zmienia się od razu, bez animacji");
    await page.getByRole("tab", { name: "Wynik", exact: true }).click();
    await moves("okno AI - otwarcie", () => page.getByRole("button", { name: "Sprawdź przepisy z AI" }).click());
    await moves("okno AI - zamknięcie", () => page.locator(".ai-dialog .ai__plain").click());
    await moves("dymek „?”", () => page.locator(".hint__btn").first().click());
  } finally {
    await page.close();
  }
  return found;
}

/**
 * The phone (plan A27): the screens on the bar at the bottom, the parts of "Porównanie" and the
 * answer docked above the bar all move, and Back goes from any screen to "Porównanie" - "Wynik".
 */
async function phoneCheck() {
  const found = [];
  const page = await browser.newPage({ viewport: { width: 360, height: 760 }, reducedMotion: "no-preference" });
  try {
    await page.goto(url);
    await page.locator(".answer").first().waitFor();
    const still = () =>
      page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 3000 }).catch(() => {});
    const moves = async (what, act) => {
      await still();
      await act();
      const moved = await page
        .waitForFunction(() => document.getAnimations().some((a) => a.playState === "running"), null, { timeout: 400, polling: 10 })
        .then(() => true)
        .catch(() => false);
      if (!moved) found.push(`telefon: „${what}” zmienia się od razu, bez animacji`);
    };
    const skip = page.getByRole("button", { name: "Pomiń" });
    if (await skip.isVisible()) await skip.click();
    for (const tab of tabsAt(360).slice(1)) await moves(`ekran ${tab}`, () => page.locator(".nav").getByRole("tab", { name: tab, exact: true }).click());
    await moves("Wstecz z ekranu", () => page.goBack());
    if (!(await page.locator("#panel-wynik").isVisible())) found.push("telefon: Wstecz nie wraca do „Porównanie” - „Wynik”");
    if (await page.locator(".dock").isVisible()) found.push("telefon: wynik na dole widać także nad samym wynikiem");
    await moves("część Skąd te kwoty", () => page.getByRole("tab", { name: "Skąd te kwoty", exact: true }).click());
    if (!(await page.locator(".dock").isVisible())) found.push("telefon: w części bez wyniku nie widać wyniku na dole");
    await moves("Wstecz z części", () => page.goBack());
    if (!(await page.locator("#panel-wynik").isVisible())) found.push("telefon: Wstecz z części nie wraca do „Wynik”");
    found.push(...(await windowStill(page, "telefon po Wstecz")));
  } finally {
    await page.close();
  }
  return found;
}

/**
 * The way to the link in a "?" hint (plan A25): the mouse goes over the "?", travels slowly to the
 * link inside the hint and clicks it - the hint must stay open all the way and the link must open.
 * Then the mouse leaves and the hint must close by itself.
 */
async function hintWayCheck() {
  const found = [];
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "no-preference" });
  // The link opens a new tab - it is stopped before going to the internet.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.locator(".answer").first().waitFor();
    const skip = page.getByRole("button", { name: "Pomiń" });
    if (await skip.isVisible()) await skip.click();
    const hint = page.locator(".hint", { has: page.locator(".hint__more") }).first();
    const btn = hint.locator(".hint__btn");
    const tip = hint.locator(".hint__tip");
    const link = hint.locator(".hint__more");
    await btn.scrollIntoViewIfNeeded();
    const b = await btn.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await tip.waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const l = await link.boundingBox();
    // Slowly, in many small moves, also across the gap between the "?" and the hint.
    await page.mouse.move(l.x + Math.min(20, l.width / 2), l.y + l.height / 2, { steps: 40 });
    await page.waitForTimeout(600);
    if (!(await tip.evaluate((el) => el.matches(":popover-open")))) found.push("dymek „?”: zamknął się w drodze do linku");
    else {
      const opened = context.waitForEvent("page", { timeout: 2000 }).catch(() => null);
      await page.mouse.down();
      await page.mouse.up();
      const tab = await opened;
      if (!tab) found.push("dymek „?”: klik w link w dymku nic nie otworzył");
      else await tab.close();
    }
    await page.mouse.move(5, 5, { steps: 5 });
    await page.waitForTimeout(1000);
    if (await tip.evaluate((el) => el.matches(":popover-open"))) found.push("dymek „?”: nie zamyka się po zjechaniu myszą");
  } finally {
    await context.close();
  }
  return found;
}

const server = await createServer({ logLevel: "error", server: { port: 1431, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME });
const problems = [];
try {
  for (const [theme, width] of [["light", 1366], ["dark", 1366], ["light", 360], ["dark", 360]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    page.on("pageerror", (e) => problems.push(`${theme}: błąd strony - ${e.message}`));
    await page.goto(url);
    await page.locator(".answer").first().waitFor();
    // The check itself: each banned pattern planted once must be found, or a quiet pass means nothing.
    const planted = await page.evaluate((check) => {
      const box = document.createElement("div");
      box.id = "planted";
      box.innerHTML = [
        `<div style="border-left:4px solid #b01e28;height:60px;width:200px">pasek</div>`,
        `<p style="background:linear-gradient(90deg,red,blue);-webkit-background-clip:text;background-clip:text">gradient</p>`,
        `<div style="backdrop-filter:blur(8px);height:30px">szkło</div>`,
        `<div style="box-shadow:0 4px 12px rgb(0 0 0 / 0.2);height:30px">cień</div>`,
        `<p style="font-family:Inter">Inter</p>`,
        `<p style="color:#6366f1">indygo</p>`,
        `<p style="color:#bbb">słaby kontrast</p>`,
        `<p style="font-size:10px">mały</p>`,
        `<div style="transform:rotate(-2deg);height:30px">krzywo</div>`,
      ].join("");
      document.body.append(box);
      const found = new Function(`return (${check})`)()("test");
      box.remove();
      return found;
    }, inspect.toString());
    const expected = ["pasek z lewej", "tekst z gradientem", "szkło", "miękki cień", "Inter", "indygo", "kontrast", "za mały", "przekrzywienie"];
    const missed = expected.filter((e) => !planted.some((p) => p.includes(e)));
    if (missed.length) throw new Error(`Test wyglądu nie wykrywa: ${missed.join(", ")}`);
    // Every assumption group unfolded, so their fields are checked too (on a phone: their screen).
    const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
    if (width <= 900) await tab("Założenia");
    const shut = page.locator(".assume__sentence[aria-expanded='false']");
    for (let i = 0; i < 20 && (await shut.count()) > 0; i++) await shut.first().click();
    if (width <= 900) await tab("Porównanie");
    // One amount known: the computed field and the answer for it (plan A26).
    await page.locator(".known label", { hasText: "tylko UoP" }).click();
    await page.locator(".money__out").waitFor();
    await page.waitForTimeout(300);
    problems.push(...(await page.evaluate(inspect, `${theme} ${width}px / znam tylko UoP`)));
    await page.locator(".known label", { hasText: "obie kwoty" }).click();
    for (const name of PARTS) {
      await tab(name);
      await page.waitForTimeout(150);
      problems.push(...(await page.evaluate(inspect, `${theme} ${width}px / Porównanie - ${name}`)));
      problems.push(...(await windowStill(page, `${theme} ${width}px / Porównanie - ${name}`)));
    }
    await tab("Wynik");
    for (const name of tabsAt(width)) {
      await tab(name);
      await page.waitForTimeout(150);
      problems.push(...(await page.evaluate(inspect, `${theme} ${width}px / ${name}`)));
      problems.push(...(await windowStill(page, `${theme} ${width}px / ${name}`)));
    }
    await tab("Porównanie");
    await page.locator(".hint__btn").first().click();
    problems.push(...(await page.evaluate(inspect, `${theme} ${width}px / dymek „?”`)));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sprawdź przepisy z AI" }).click();
    problems.push(...(await page.evaluate(inspect, `${theme} ${width}px / okno AI`)));
    await page.close();
  }
  problems.push(...(await motionCheck()));
  problems.push(...(await phoneCheck()));
  problems.push(...(await hintWayCheck()));
} finally {
  await browser.close();
  await server.close();
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`Wygląd: ${unique.length} ${unique.length === 1 ? "problem" : "problemów"}:\n${unique.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Wygląd: bez zakazanych wzorów, kontrast i wielkość tekstu w porządku (jasny i ciemny, komputer i telefon).");
