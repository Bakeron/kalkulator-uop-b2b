/**
 * Button "Odśwież" (assumption A3, no AI): only public data comes in, nothing about the user goes
 * out - the rates files from the repository, new legal acts from the Sejm ELI API since the data
 * were checked, and the NBP mid rates of the euro and the dollar. The desktop app keeps what it
 * got for the next start; the demo keeps nothing between visits.
 */
import { newestCheck, parseRatesFile, type RatesFile } from "../calc/rates";
import { IS_DEMO } from "../demo";

const RATES_URL = "https://raw.githubusercontent.com/Bakeron/kalkulator-uop-b2b/main/src/rates";
const ELI_API = "https://api.sejm.gov.pl/eli";
const NBP_API = "https://api.nbp.pl/api/exchangerates/rates/a";
const TIMEOUT_MS = 15_000;

export type Currency = "PLN" | "EUR" | "USD";

/** An NBP table A mid rate: złoty for one unit of the currency, on the day of the table. */
export interface FxRate {
  mid: number;
  /** "YYYY-MM-DD" of the NBP table. */
  date: string;
  /** Number of the table, e.g. "228/A/NBP/2026". */
  table: string;
}

export type FxRates = Partial<Record<Exclude<Currency, "PLN">, FxRate>>;

/** A new act about taxes, ZUS, health insurance or wages - a hint that the rates may be old. */
export interface NewAct {
  eli: string;
  title: string;
  published: string;
  url: string;
  topics: string[];
}

// The same topics as the daily check on GitHub (scripts/check-acts.mjs).
const TOPICS: { topic: string; pattern: RegExp }[] = [
  { topic: "PIT", pattern: /podatku dochodowym od osób fizycznych/i },
  { topic: "ryczałt", pattern: /zryczałtowanym podatku dochodowym/i },
  { topic: "ZUS", pattern: /systemie ubezpieczeń społecznych|podstaw\w* wymiaru składek/i },
  { topic: "zasiłek chorobowy", pattern: /świadczeniach pieniężnych z ubezpieczenia społecznego w razie choroby/i },
  { topic: "składka wypadkowa", pattern: /ubezpieczeniu społecznym z tytułu wypadków|ubezpieczenie wypadkowe/i },
  { topic: "zdrowotna", pattern: /świadczeniach opieki zdrowotnej finansowanych ze środków publicznych|składk\w* zdrowotn/i },
  { topic: "płaca minimalna", pattern: /minimaln\w* wynagrodzeni/i },
  { topic: "przeciętne wynagrodzenie", pattern: /przeciętn\w* (?:miesięczn\w* )?wynagrodzeni/i },
  { topic: "Fundusz Pracy", pattern: /Fundusz\w* Pracy|rynku pracy i służbach zatrudnienia/i },
  { topic: "PPK", pattern: /pracowniczych planach kapitałowych/i },
  { topic: "VAT", pattern: /podatku od towarów i usług/i },
  { topic: "ulga na start", pattern: /Prawo przedsiębiorców/i },
  { topic: "Kodeks pracy", pattern: /Kodeks pracy/i },
];

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const res = await fetcher(url, {
    headers: { Accept: "application/json" },
    // Nothing of the user's: no cookies, no referrer.
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Rates files

/**
 * The files to use: each bundled year replaced by the one from the repository when that is valid
 * and checked later; a valid file of a year the app does not know yet is added.
 */
export function mergeFiles(bundled: readonly RatesFile[], remote: readonly RatesFile[]): RatesFile[] {
  const out = new Map(bundled.map((f) => [f.year, f]));
  for (const r of remote) {
    const mine = out.get(r.year);
    if (!mine || newestCheck(r) > newestCheck(mine)) out.set(r.year, r);
  }
  return [...out.values()].sort((a, b) => a.year - b.year);
}

/** Rates files of the years around today from the repository (the ones that exist and pass the check). */
export async function fetchRatesFiles(today: Date, fetcher: typeof fetch = fetch): Promise<{ files: RatesFile[]; rejected: number[] }> {
  const year = today.getFullYear();
  const years = [year - 1, year, year + 1];
  const files: RatesFile[] = [];
  const rejected: number[] = [];
  const results = await Promise.allSettled(years.map((y) => getJson(`${RATES_URL}/${y}.json`, fetcher)));
  results.forEach((r, i) => {
    if (r.status === "rejected") throw r.reason;
    if (r.value === null) return; // no file for that year
    const file = parseRatesFile(r.value);
    if (file && file.year === years[i]) files.push(file);
    else rejected.push(years[i]!);
  });
  return { files, rejected };
}

// New legal acts

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Relevant acts of the API answer published on `since` ("YYYY-MM-DD") or later, newest first. */
export function relevantActs(json: unknown, since: string): NewAct[] {
  const items = typeof json === "object" && json !== null && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : [];
  const out = new Map<string, NewAct>();
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const a = raw as Record<string, unknown>;
    const eli = typeof a.ELI === "string" && /^(DU|MP)\/\d{4}\/\d+$/.test(a.ELI) ? a.ELI : null;
    const published = str(a.promulgation, 10);
    if (!eli || !/^\d{4}-\d{2}-\d{2}$/.test(published) || published < since) continue;
    const title = str(a.title, 400);
    const keywords = Array.isArray(a.keywords) ? a.keywords.filter((k): k is string => typeof k === "string") : [];
    const text = [title, ...keywords].join(" | ");
    const topics = TOPICS.filter((t) => t.pattern.test(text)).map((t) => t.topic);
    if (topics.length === 0) continue;
    out.set(eli, { eli, title, published, url: `${ELI_API}/acts/${eli}/text.pdf`, topics });
  }
  return [...out.values()].sort((a, b) => (a.published < b.published ? 1 : -1));
}

/** "YYYY-MM-DD" `days` before `iso`. */
function before(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days)).toISOString().slice(0, 10);
}

/**
 * Acts published since the rates were checked. The API filters by the date of the act, not of
 * its publication, so it is asked further back and filtered here.
 */
export async function fetchNewActs(since: string, fetcher: typeof fetch = fetch): Promise<NewAct[]> {
  const from = before(since, 90);
  const pages = await Promise.all(
    ["DU", "MP"].map((p) => getJson(`${ELI_API}/acts/search?publisher=${p}&dateFrom=${from}&limit=500`, fetcher)),
  );
  return pages.flatMap((p) => relevantActs(p, since)).sort((a, b) => (a.published < b.published ? 1 : -1));
}

// NBP exchange rates

/** The rate of the NBP answer, `null` when it is not one. */
export function parseNbp(json: unknown): FxRate | null {
  const rate = (json as { rates?: unknown })?.rates;
  const last = Array.isArray(rate) ? (rate[rate.length - 1] as Record<string, unknown> | undefined) : undefined;
  if (!last) return null;
  const mid = last.mid;
  const date = last.effectiveDate;
  const table = last.no;
  if (typeof mid !== "number" || !(mid > 0 && mid < 100)) return null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { mid, date, table: typeof table === "string" ? table.slice(0, 40) : "" };
}

/** The latest mid rates of the euro and the dollar (NBP table A). */
export async function fetchFx(fetcher: typeof fetch = fetch): Promise<FxRates> {
  const [eur, usd] = await Promise.all(["eur", "usd"].map((c) => getJson(`${NBP_API}/${c}/?format=json`, fetcher)));
  const out: FxRates = {};
  const e = parseNbp(eur);
  const u = parseNbp(usd);
  if (e) out.EUR = e;
  if (u) out.USD = u;
  if (!e && !u) throw new Error("NBP: brak kursu");
  return out;
}

// What the desktop app keeps between starts

export interface Kept {
  /** Rates files from the repository that passed the check. */
  files: RatesFile[];
  fx: FxRates;
  acts: NewAct[];
  /** When "Odśwież" last worked (ISO date and time). */
  refreshed: string | null;
}

const KEY = "refresh";
const EMPTY: Kept = { files: [], fx: {}, acts: [], refreshed: null };

/** What the last refresh brought - checked again, because local storage can be edited by hand. */
export function loadKept(): Kept {
  if (IS_DEMO) return EMPTY;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Kept> | null;
    if (!raw) return EMPTY;
    const files = Array.isArray(raw.files) ? raw.files.map(parseRatesFile).filter((f): f is RatesFile => f !== null) : [];
    const fx: FxRates = {};
    for (const c of ["EUR", "USD"] as const) {
      const r = raw.fx?.[c];
      const ok = r && parseNbp({ rates: [{ mid: r.mid, effectiveDate: r.date, no: r.table }] });
      if (ok) fx[c] = ok;
    }
    const acts = Array.isArray(raw.acts) ? relevantActs({ items: raw.acts.map((a) => ({ ELI: a.eli, title: a.title, promulgation: a.published })) }, "0000-00-00") : [];
    const refreshed = typeof raw.refreshed === "string" ? raw.refreshed : null;
    return { files, fx, acts, refreshed };
  } catch {
    return EMPTY;
  }
}

export function saveKept(kept: Kept): void {
  if (IS_DEMO) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Full storage: the refresh still works until the app is closed.
  }
}
