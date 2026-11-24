/**
 * "Sprawdź przepisy z AI" (assumption A4): the question to Claude, reading its answer and the
 * checks against made-up numbers. Nothing changes by itself - every proposal is shown as
 * "było -> jest, źródło, od kiedy" and waits for "Zastosuj" or "Pomiń".
 *
 * Lessons from the job board app: the answer is read even when the model wraps or comments the
 * JSON; a proposal needs a source and a word-for-word quote; the quoted numbers must be the
 * proposed ones and must really stand on the source page (the app fetches it itself); only
 * official sources count as sure, an accounting portal is at most "doniesienie".
 */
import { ITEM_KEYS, valueOk, type Bill, type ItemKey, type RatesFile, type Status } from "../calc/rates";
import type { NewAct } from "../ui/refresh";
import { itemLabel, itemUnit } from "../ui/rules";

const STATUSES: readonly Status[] = ["pewne", "uchwalone", "projekt", "szacunek", "doniesienie"];

/** A new number (or a new "pending" number, i.e. not in force yet) of one year. */
export interface ValueChange {
  type: "value";
  year: number;
  key: ItemKey;
  /** "value" = in force from the given day, "pending" = passed or planned, not in force yet. */
  target: "value" | "pending";
  value: unknown;
  status: Status;
  source: string;
  url: string;
  quote: string;
  from: string;
}

/** A new or changed entry of "Co się zmieni i kiedy" that moves no number. */
export interface BillChange {
  type: "bill";
  year: number;
  title: string;
  what: string;
  from: string;
  status: Status;
  source: string;
  url: string;
  quote: string;
}

export type AiChange = ValueChange | BillChange;

/** What Claude says about a new act from "Odśwież". */
export interface ActVerdict {
  eli: string;
  changes: boolean;
  what: string;
}

export interface AiAnswer {
  summary: string;
  changes: AiChange[];
  acts: ActVerdict[];
  needsNewVersion: string[];
  /** Proposals dropped because they were broken (unknown number, wrong shape, no source). */
  rejected: number;
}

// The question

/** Official sources (assumption A4) - the same list as `official()` in `src-tauri/src/ai.rs`. */
export function isOfficial(url: string): boolean {
  const m = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url);
  if (!m) return false;
  const host = m[1]!.toLowerCase();
  if (/[@:]/.test(host)) return false;
  return ["gov.pl", "zus.pl", "prezydent.pl"].some((d) => host === d || host.endsWith(`.${d}`));
}

const ANSWER_SHAPE = `{
  "summary": "1-3 short sentences in Polish: what you checked and what you found",
  "changes": [
    { "type": "value", "year": 2027, "key": "<key from the data>", "target": "value" | "pending",
      "value": <new value in the same shape and unit as in the data>, "status": "pewne" | "uchwalone" | "projekt" | "szacunek" | "doniesienie",
      "source": "short name, e.g. Dz.U. 2026 poz. 1541", "url": "https://...", "quote": "fragment copied word for word from the source, containing the number(s)",
      "from": "from when, e.g. 1.01.2027" },
    { "type": "bill", "year": 2027, "title": "<the exact title from the data, or a new title>", "what": "what it changes, in plain Polish",
      "from": "from when", "status": "...", "source": "...", "url": "https://...", "quote": "fragment copied word for word from the source" }
  ],
  "acts": [ { "eli": "<eli from newActs>", "changes": true | false, "what": "in Polish: does it change any number of the data, which one" } ],
  "needsNewVersion": [ "in Polish: a change that needs a new way of calculating, not just a new number" ]
}`;

/** System prompt: the rules of the check. */
export function systemPrompt(today: string): string {
  return [
    "You check the numbers of Polish payroll and tax rules used by a calculator that compares an employment contract (umowa o pracę) with self-employment (B2B).",
    `Today is ${today}. Use web search and web fetch to check the data the user sends against the newest acts and official announcements.`,
    "Official sources are the only sure ones: dziennikustaw.gov.pl, monitorpolski.gov.pl, isap.sejm.gov.pl, api.sejm.gov.pl (ELI - prefer the HTML text of an act: https://api.sejm.gov.pl/eli/acts/DU/<year>/<position>/text.html), sejm.gov.pl, gov.pl, zus.pl, stat.gov.pl, prezydent.pl. A news or accounting portal is only a report: use status \"doniesienie\" for anything you know only from such a page.",
    "Propose a change only when a source states the new number. Never estimate, round or compute a number yourself. The quote must be copied word for word from the page at the url and must contain the proposed number(s); prefer HTML pages to PDF files, because the app downloads the page and checks the quote.",
    "List only what differs from the data - not the numbers that are still right. Use target \"pending\" for a number that is passed or planned but not in force yet, and target \"value\" for a number in force from a known day of that year. A signed and published act moves a pending number to \"value\" with status \"pewne\"; a veto or a rejected bill is a \"bill\" entry that says so.",
    "Values use the units of the data: \"zl\" in złoty (4806.5), \"pct\" in percent (9.76), \"scale\" as [[upper limit in złoty or null, rate in percent], ...], \"thresholds\" as [złoty, złoty], \"children\" as yearly złoty for the 1st, 2nd, 3rd and each next child.",
    "The calculator takes only numbers and dates from you. When a change needs a new way of calculating (a new relief, a new kind of contribution), put it in needsNewVersion instead.",
    `Reply with exactly one JSON object and nothing else, in this shape:\n${ANSWER_SHAPE}`,
  ].join("\n\n");
}

/** The data Claude checks - only the rates files and new acts, nothing about the user. */
export function question(files: readonly RatesFile[], acts: readonly NewAct[]): string {
  const years = files.map((f) => ({
    year: f.year,
    items: Object.fromEntries(
      ITEM_KEYS.map((key) => {
        const it = f.items[key];
        const pending = it.pending ? { value: it.pending.value, status: it.pending.status, source: it.pending.source } : undefined;
        return [key, { label: itemLabel(key), unit: itemUnit(key), value: it.value, status: it.status, source: it.source, checked: it.checked, pending }];
      }),
    ),
    bills: (f.bills ?? []).map((b) => ({ title: b.title, what: b.what, from: b.from, status: b.status, source: b.source, checked: b.checked })),
  }));
  const newActs = acts.map((a) => ({ eli: a.eli, title: a.title, published: a.published, url: a.url }));
  return `Check these data:\n${JSON.stringify({ years, newActs })}`;
}

// Reading the answer

/** Every balanced {...} of the text, outermost first - strings with braces inside are skipped. */
function jsonObjects(text: string): string[] {
  const out: string[] = [];
  for (let start = text.indexOf("{"); start !== -1; ) {
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) break;
    out.push(text.slice(start, end + 1));
    start = text.indexOf("{", end + 1);
  }
  return out;
}

/** The answer object even when the model wrote a sentence around it or a code fence. */
export function extractJson(text: string): Record<string, unknown> | null {
  const candidates = jsonObjects(text).reverse();
  for (const c of candidates) {
    try {
      const v: unknown = JSON.parse(c);
      if (typeof v === "object" && v !== null && !Array.isArray(v) && "changes" in v) return v as Record<string, unknown>;
    } catch {
      // Not JSON - try the next one.
    }
  }
  return null;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null);

function readChange(v: unknown, years: ReadonlySet<number>): AiChange | null {
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  const year = c.year;
  if (typeof year !== "number" || !years.has(year)) return null;
  const status = STATUSES.includes(c.status as Status) ? (c.status as Status) : null;
  const source = text(c.source, 300);
  const url = typeof c.url === "string" && /^https:\/\/[^\s"<>]+$/.test(c.url) && c.url.length <= 500 ? c.url : null;
  const quote = text(c.quote, 2000);
  const from = text(c.from, 200);
  if (!status || !source || !url || !quote || !from) return null;
  if (c.type === "value") {
    const key = c.key as ItemKey;
    if (!ITEM_KEYS.includes(key) || (c.target !== "value" && c.target !== "pending") || !valueOk(key, c.value)) return null;
    return { type: "value", year, key, target: c.target, value: c.value, status, source, url, quote, from };
  }
  if (c.type === "bill") {
    const title = text(c.title, 300);
    const what = text(c.what, 2000);
    if (!title || !what) return null;
    return { type: "bill", year, title, what, from, status, source, url, quote };
  }
  return null;
}

/** The answer, or `null` when it is no answer at all - then nothing changes. */
export function readAnswer(raw: string, files: readonly RatesFile[]): AiAnswer | null {
  const json = extractJson(raw);
  if (!json || !Array.isArray(json.changes) || json.changes.length > 100) return null;
  const years = new Set(files.map((f) => f.year));
  const changes = json.changes.map((c) => readChange(c, years));
  const acts = Array.isArray(json.acts)
    ? json.acts.flatMap((a): ActVerdict[] => {
        const r = a as Record<string, unknown>;
        const eli = text(r?.eli, 100);
        const what = text(r?.what, 1000);
        return eli && what && typeof r.changes === "boolean" ? [{ eli, changes: r.changes, what }] : [];
      })
    : [];
  const needsNewVersion = Array.isArray(json.needsNewVersion) ? json.needsNewVersion.map((n) => text(n, 1000)).filter((n): n is string => n !== null) : [];
  return {
    summary: text(json.summary, 1500) ?? "",
    changes: changes.filter((c): c is AiChange => c !== null),
    acts: acts.slice(0, 50),
    needsNewVersion: needsNewVersion.slice(0, 20),
    rejected: changes.filter((c) => c === null).length,
  };
}

// Checking a proposal against its source

/** Numbers of a proposed value: 4806.5 -> [4806.5]; a scale -> its limits and rates. */
export function numbersOf(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersOf);
  return [];
}

/** Every number written in a Polish text: "4 806,50 zł" -> 4806.5, "9,76%" -> 9.76, "130.000" -> 130000. */
export function numbersIn(s: string): number[] {
  const flat = s
    .replace(/[    ]/g, " ")
    // Thousands separated by a space or a dot: "130 000", "130.000".
    .replace(/(\d)[ .](?=\d{3}(?!\d))/g, "$1");
  const out: number[] = [];
  for (const m of flat.matchAll(/\d+(?:,\d+)?(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const hasNumber = (pool: readonly number[], n: number) => pool.some((p) => Math.abs(p - n) < 0.005);

/** The page as plain text: no tags, scripts or styles, the usual entities decoded, one space. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const squash = (s: string) => s.replace(/[    ]/g, " ").replace(/[„”"«»]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/** A fetched source page, or why there is none. */
export type SourcePage = { text: string; contentType: string } | { error: string };

export type Verdict = "ok" | "check";

export interface Checked {
  change: AiChange;
  verdict: Verdict;
  /** Why it needs checking by hand, in plain words. */
  reasons: string[];
}

/**
 * "ok" only when the source is official, the quote holds the proposed numbers and the page really
 * says them (a bill: the page holds the quote). Otherwise "check" with the reasons - such a
 * proposal cannot be applied with one click.
 */
export function verify(change: AiChange, page: SourcePage | null): Checked {
  const reasons: string[] = [];
  if (!isOfficial(change.url)) reasons.push("źródło nie jest urzędowe (np. portal księgowy) - to najwyżej zapowiedź");
  const wanted = change.type === "value" ? numbersOf(change.value) : [];
  if (change.type === "value" && !wanted.every((n) => hasNumber(numbersIn(change.quote), n)))
    reasons.push("w cytacie nie ma proponowanej liczby");
  if (!page) {
    if (isOfficial(change.url)) reasons.push("nie pobrano źródła");
  } else if ("error" in page) {
    reasons.push(`nie udało się pobrać źródła (${page.error})`);
  } else if (/pdf/i.test(page.contentType)) {
    reasons.push("źródło to PDF - aplikacja nie umie w nim szukać");
  } else {
    const plain = pageText(page.text);
    if (change.type === "value") {
      const onPage = numbersIn(plain);
      if (!wanted.every((n) => hasNumber(onPage, n))) reasons.push("na stronie źródła nie ma proponowanej liczby");
    } else {
      const head = squash(change.quote).slice(0, 80);
      if (!squash(plain).includes(head)) reasons.push("na stronie źródła nie ma cytowanego zdania");
    }
  }
  // A non-official source is never "pewne", whatever the model says.
  const fixed: AiChange = isOfficial(change.url) ? change : { ...change, status: "doniesienie" };
  return { change: fixed, verdict: reasons.length ? "check" : "ok", reasons };
}

// Applying

/** One applied proposal, kept on the device until "Przywróć dane z pliku". */
export interface Applied {
  change: AiChange;
  /** "YYYY-MM-DD" of "Zastosuj". */
  day: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyOne(file: RatesFile, a: Applied): RatesFile {
  const c = a.change;
  const note = `z AI, dnia ${a.day.split("-").reverse().join(".")} - od ${c.from}`;
  const info = { source: c.source, url: c.url, checked: a.day, status: c.status, note };
  if (c.type === "bill") {
    const bill: Bill = { ...info, title: c.title, what: c.what, from: c.from };
    const bills = (file.bills ?? []).filter((b) => b.title !== c.title);
    return { ...file, bills: [...bills, bill] };
  }
  const item = file.items[c.key];
  const next =
    c.target === "pending"
      ? { ...item, pending: { ...info, value: c.value } }
      : // In force now: a pending number that became law is no longer pending.
        { ...item, ...info, value: c.value, pending: item.pending && !same(item.pending.value, c.value) ? item.pending : undefined };
  if (next.pending === undefined) delete next.pending;
  return { ...file, items: { ...file.items, [c.key]: next } as RatesFile["items"] };
}

/**
 * The files with the applied proposals. A proposal is skipped when the file got newer than it (a
 * fresher file from "Odśwież" wins) or when the result would not pass the rates file check.
 */
export function applyAll(files: readonly RatesFile[], applied: readonly Applied[], newest: (f: RatesFile) => string, check: (f: unknown) => RatesFile | null): RatesFile[] {
  return files.map((file) => {
    const base = newest(file);
    let out = file;
    for (const a of applied) {
      if (a.change.year !== file.year || base > a.day) continue;
      const next = check(applyOne(out, a));
      if (next) out = next;
    }
    return out;
  });
}

const APPLIED_KEY = "aiApplied";

/** Checked again on reading - local storage can be edited by hand. */
export function parseApplied(raw: unknown, files: readonly RatesFile[]): Applied[] {
  if (!Array.isArray(raw)) return [];
  const years = new Set(files.map((f) => f.year));
  return raw.flatMap((r): Applied[] => {
    const day = (r as Applied)?.day;
    const change = readChange((r as Applied)?.change, years);
    return change && typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? [{ change, day }] : [];
  });
}

export function loadApplied(files: readonly RatesFile[], storage: Pick<Storage, "getItem"> = localStorage): Applied[] {
  try {
    return parseApplied(JSON.parse(storage.getItem(APPLIED_KEY) ?? "null"), files);
  } catch {
    return [];
  }
}

export function saveApplied(applied: readonly Applied[], storage: Pick<Storage, "setItem" | "removeItem"> = localStorage): void {
  try {
    if (applied.length) storage.setItem(APPLIED_KEY, JSON.stringify(applied));
    else storage.removeItem(APPLIED_KEY);
  } catch {
    // Full storage: applied until the app is closed.
  }
}

/** A stable name of a proposal - the same number of the same year replaces the earlier one. */
export const changeId = (c: AiChange) => (c.type === "value" ? `${c.year}:${c.key}:${c.target}` : `${c.year}:bill:${c.title}`);
