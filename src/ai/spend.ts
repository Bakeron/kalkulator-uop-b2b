/**
 * The spending counter of "Sprawdź przepisy z AI" (assumption A4): a normal API key cannot read
 * the account balance, so the app counts what it spent itself - tokens and web searches of every
 * check at the list price - and keeps a daily limit (1 $ by default). Kept on the device only.
 */

/** Token counts and searches of one check, as the Rust side returns them. */
export interface Usage {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  searches: number;
}

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

/** Dollars per million tokens (Anthropic's price list, as of 3.11.2026). */
const PRICES: [string, Price][] = [
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.1 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-8", { input: 5, output: 25, cacheRead: 0.5 }],
];
/** A model missing from the list (a safety fallback) counts at a high price: rather too much than too little. */
const UNKNOWN: Price = { input: 5, output: 25, cacheRead: 0.5 };
/** Web search: 10 $ per 1000 searches. */
export const SEARCH_USD = 0.01;

export function priceOf(model: string): Price {
  const m = model.trim().toLowerCase();
  const hit = PRICES.filter(([name]) => m === name || (m.startsWith(name) && /^[-@]/.test(m.slice(name.length))))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : UNKNOWN;
}

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** The cost of one check in dollars. A 5-minute cache write costs 1.25 x input. */
export function costUsd(u: Usage): number {
  const p = priceOf(u.model);
  const tokens =
    safe(u.input) * p.input + safe(u.output) * p.output + safe(u.cacheRead) * p.cacheRead + safe(u.cacheWrite) * p.input * 1.25;
  return tokens / 1_000_000 + safe(u.searches) * SEARCH_USD;
}

/** What one check is expected to cost before it is asked (assumption A3: about 0.2-0.4 $). */
export const ESTIMATE_USD = { low: 0.2, high: 0.4 };

/**
 * Kept on the device: dollars spent per local day ("YYYY-MM-DD"), the daily limit and the last
 * top-up of the Claude account (Settings → AI), so the app can say roughly what is left of it.
 */
export interface Spending {
  days: Record<string, number>;
  limitUsd: number;
  /** The last top-up in dollars and its day; `null` = not given. */
  topUpUsd: number | null;
  topUpDay: string | null;
}

export const DEFAULT_LIMIT_USD = 1;
const KEY = "aiSpending";
/** A little over a year - enough to count what was spent since a top-up. */
const KEEP_DAYS = 400;
const MAX_TOP_UP = 10_000;

export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Checked again on reading - local storage can be edited by hand. */
export function parseSpending(raw: unknown): Spending {
  const out: Spending = { days: {}, limitUsd: DEFAULT_LIMIT_USD, topUpUsd: null, topUpDay: null };
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Partial<Spending>;
  if (typeof r.limitUsd === "number" && Number.isFinite(r.limitUsd) && r.limitUsd > 0 && r.limitUsd <= 100) out.limitUsd = r.limitUsd;
  if (typeof r.topUpUsd === "number" && Number.isFinite(r.topUpUsd) && r.topUpUsd > 0 && r.topUpUsd <= MAX_TOP_UP) out.topUpUsd = r.topUpUsd;
  if (out.topUpUsd !== null && typeof r.topUpDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.topUpDay)) out.topUpDay = r.topUpDay;
  if (typeof r.days === "object" && r.days !== null) {
    for (const [day, usd] of Object.entries(r.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof usd === "number" && Number.isFinite(usd) && usd >= 0) out.days[day] = usd;
    }
  }
  return out;
}

export function loadSpending(storage: Pick<Storage, "getItem"> = localStorage): Spending {
  try {
    return parseSpending(JSON.parse(storage.getItem(KEY) ?? "null"));
  } catch {
    return parseSpending(null);
  }
}

export function saveSpending(s: Spending, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Full storage: the counter still works until the app is closed.
  }
}

/** Adds one check to its day; days older than a year are dropped. */
export function record(s: Spending, usd: number, today: Date): Spending {
  const day = localDay(today);
  const oldest = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_DAYS));
  const days: Record<string, number> = {};
  for (const [d, v] of Object.entries(s.days)) if (d >= oldest) days[d] = v;
  days[day] = (days[day] ?? 0) + safe(usd);
  return { ...s, days };
}

export const spentToday = (s: Spending, today: Date) => s.days[localDay(today)] ?? 0;

/** This month, from its first day until today. */
export function spentMonth(s: Spending, today: Date): number {
  const month = localDay(today).slice(0, 7);
  return Object.entries(s.days).reduce((sum, [d, v]) => (d.startsWith(month) ? sum + v : sum), 0);
}

/** Since the day of the last top-up (that day included); `null` without a top-up. */
export function sinceTopUp(s: Spending): { spent: number; left: number; low: boolean } | null {
  if (s.topUpUsd === null || s.topUpDay === null) return null;
  const day = s.topUpDay;
  const spent = Object.entries(s.days).reduce((sum, [d, v]) => (d >= day ? sum + v : sum), 0);
  const left = Math.max(0, s.topUpUsd - spent);
  // Below 10% of the top-up: time to top up before Claude stops answering.
  return { spent, left, low: left < s.topUpUsd * 0.1 };
}

/**
 * A dollar amount typed by the user ("5", "20,50", "$ 5", "5 USD"): `null` when it is not one,
 * `""` for an empty field (no amount).
 */
export function dollarsTyped(text: string, max = MAX_TOP_UP): number | "" | null {
  const t = text.replace(/\$|usd/gi, "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return "";
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= max ? n : null;
}

/** Another check fits in today's limit only when even its expensive end does. */
export const canAsk = (s: Spending, today: Date) => spentToday(s, today) + ESTIMATE_USD.high <= s.limitUsd;

/** "0,23 $" - dollars with two decimals, the Polish way. */
export const usd = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;
