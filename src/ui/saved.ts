/**
 * What the user typed, kept on the device (assumption "zapis ostatnich danych i kilku scenariuszy")
 * and carried in a link (the settings in the address, after "#", so they never reach a server).
 * Everything read back - from local storage or from a link - is checked field by field and falls
 * back to the default, because both can be edited by hand.
 */
import { TAX_FORMS, type CostItem } from "../calc/b2b";
import { IS_DEMO } from "../demo";
import { BENEFITS, KNOWN, defaultScenario, type BenefitChoice, type Scenario } from "./model";

/** Where the link leads: the demo on the web (the desktop app has no address of its own). */
export const DEMO_URL = "https://szymonbakonis.pl/kalkulator-uop-b2b/";

const LAST_KEY = "scenario";
const SAVED_KEY = "scenarios";
/** A few scenarios to compare, not an archive. */
export const SAVED_MAX = 10;
const NAME_MAX = 60;
const MONEY_MAX = 100_000_000_00; // 100 mln zł in grosze - far above any real offer

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const int = (v: unknown, min: number, max: number, d: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : d);
const money = (v: unknown, d: number) => int(v, 0, MONEY_MAX, d);
const oneOf = <T>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

function benefits(v: unknown, d: BenefitChoice[]): BenefitChoice[] {
  if (!Array.isArray(v)) return d;
  return d.map((b) => {
    const got = obj(v.find((x) => isObj(x) && x.kind === b.kind));
    return { kind: b.kind, on: bool(got.on, b.on), amount: money(got.amount, BENEFITS[b.kind].amount) };
  });
}

function costs(v: unknown, d: CostItem[]): CostItem[] {
  if (!Array.isArray(v)) return d;
  return v
    .filter(isObj)
    .slice(0, 30)
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.slice(0, NAME_MAX) : "Koszt",
      amount: money(c.amount, 0),
      vatRate: oneOf(c.vatRate, [2300, 800, 500, 0], 2300),
      month: c.month === null ? null : int(c.month, 0, 11, 0),
      kind: oneOf(c.kind, ["zwykly", "auto-mieszany", "auto-firmowy"] as const, "zwykly"),
      enabled: bool(c.enabled, true),
    }));
}

/** Any value -> a valid scenario: every field checked, anything wrong or missing from the default. */
export function normalizeScenario(raw: unknown): Scenario {
  const d = defaultScenario();
  const r = obj(raw);
  const u = obj(r.uop);
  const b = obj(r.b2b);
  const f = obj(r.family);
  const x = obj(r.extra);
  const z = x.zlecenie === null ? null : isObj(x.zlecenie) ? x.zlecenie : undefined;
  const dz = x.dzielo === null ? null : isObj(x.dzielo) ? x.dzielo : undefined;
  return {
    known: oneOf(r.known, KNOWN, d.known),
    uopGross: money(r.uopGross, d.uopGross),
    b2bRate: money(r.b2bRate, d.b2bRate),
    form: TAX_FORMS.includes(r.form as never) ? (r.form as Scenario["form"]) : null,
    vacationDays: oneOf(r.vacationDays, [20, 26] as const, d.vacationDays),
    sickDays: int(r.sickDays, 0, 60, d.sickDays),
    sickKind: oneOf(r.sickKind, ["zwykla", "ciaza-wypadek"] as const, d.sickKind),
    over50: bool(r.over50, d.over50),
    uop: {
      ppk: bool(u.ppk, d.uop.ppk),
      commuter: bool(u.commuter, d.uop.commuter),
      authors: bool(u.authors, d.uop.authors),
      creativePercent: int(u.creativePercent, 0, 100, d.uop.creativePercent),
      zeroPit: bool(u.zeroPit, d.uop.zeroPit),
      benefits: benefits(u.benefits, d.uop.benefits),
    },
    b2b: {
      startDate: typeof b.startDate === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(b.startDate) ? b.startDate : d.b2b.startDate,
      startRelief: bool(b.startRelief, d.b2b.startRelief),
      preferential: bool(b.preferential, d.b2b.preferential),
      smallZusPlus: bool(b.smallZusPlus, d.b2b.smallZusPlus),
      prevRevenue: money(b.prevRevenue, d.b2b.prevRevenue),
      prevIncome: money(b.prevIncome, d.b2b.prevIncome),
      voluntarySickness: bool(b.voluntarySickness, d.b2b.voluntarySickness),
      contributionHoliday: b.contributionHoliday === null ? null : int(b.contributionHoliday, 0, 11, -1) === -1 ? d.b2b.contributionHoliday : (b.contributionHoliday as number),
      ryczaltRate: b.ryczaltRate === null ? null : int(b.ryczaltRate, 0, 10_000, -1) === -1 ? d.b2b.ryczaltRate : (b.ryczaltRate as number),
      ipBoxPercent: int(b.ipBoxPercent, 0, 100, d.b2b.ipBoxPercent),
      formerEmployer: bool(b.formerEmployer, d.b2b.formerEmployer),
      clients: oneOf(b.clients, ["jeden", "kilku"] as const, d.b2b.clients),
      paidDaysOff: int(b.paidDaysOff, 0, 26, d.b2b.paidDaysOff),
    },
    costs: costs(r.costs, d.costs),
    vat: oneOf(r.vat, ["czynny", "zagranica", "zwolniony"] as const, d.vat),
    family: {
      married: bool(f.married, d.family.married),
      spouseIncome: money(f.spouseIncome, d.family.spouseIncome),
      joint: bool(f.joint, d.family.joint),
      children: int(f.children, 0, 10, d.family.children),
    },
    extra: {
      job: x.job === null || x.job === undefined ? null : money(x.job, 0),
      zlecenie: z ? { amount: money(z.amount, 0), sameEmployer: bool(z.sameEmployer, false), voluntarySocial: bool(z.voluntarySocial, false) } : null,
      dzielo: dz ? { amount: money(dz.amount, 0), authors: bool(dz.authors, true) } : null,
      sideBusiness: x.sideBusiness === null || x.sideBusiness === undefined ? null : money(x.sideBusiness, 0),
    },
  };
}

function read(key: string): unknown {
  if (IS_DEMO) return null;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (IS_DEMO) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full storage: the app still works, only this is not kept.
  }
}

/** The data typed last time (desktop app; the demo starts from the defaults). */
export function loadLast(): Scenario {
  const raw = read(LAST_KEY);
  return raw === null ? defaultScenario() : normalizeScenario(raw);
}

export function saveLast(s: Scenario): void {
  write(LAST_KEY, s);
}

export interface SavedScenario {
  name: string;
  /** When it was saved (ISO). */
  saved: string;
  scenario: Scenario;
}

export function loadSaved(): SavedScenario[] {
  const raw = read(SAVED_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .filter((s) => typeof s.name === "string" && s.name.trim() !== "")
    .slice(0, SAVED_MAX)
    .map((s) => ({
      name: (s.name as string).slice(0, NAME_MAX),
      saved: typeof s.saved === "string" ? s.saved : "",
      scenario: normalizeScenario(s.scenario),
    }));
}

export function storeSaved(list: SavedScenario[]): void {
  write(SAVED_KEY, list);
}

/**
 * Adds a scenario under a name - the same name replaces the old one (no duplicates), the newest
 * first; past the limit the oldest one goes.
 */
export function withSaved(list: SavedScenario[], name: string, s: Scenario, now: Date): SavedScenario[] {
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) return list;
  const rest = list.filter((x) => x.name.toLocaleLowerCase("pl") !== clean.toLocaleLowerCase("pl"));
  return [{ name: clean, saved: now.toISOString(), scenario: s }, ...rest].slice(0, SAVED_MAX);
}

// The link: only what differs from the defaults, as JSON in base64url after "#s=".

/** The parts of `s` that differ from `d` (arrays whole). */
function diff(s: unknown, d: unknown): unknown {
  if (isObj(s) && isObj(d)) {
    const out: Obj = {};
    for (const k of Object.keys(s)) {
      const v = diff(s[k], d[k]);
      if (v !== undefined) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(s) === JSON.stringify(d) ? undefined : s;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** "#s=..." for the scenario and the chosen rules (`dzis` = the default, left out). */
export function linkHash(s: Scenario, rules: string): string {
  const params = new URLSearchParams();
  params.set("s", toBase64Url(JSON.stringify(diff(s, defaultScenario()) ?? {})));
  if (rules !== "dzis") params.set("r", rules);
  return `#${params.toString()}`;
}

/** The address to share: the demo page, or this page when it is the demo itself. */
export function shareLink(s: Scenario, rules: string, here: Location | null = typeof location === "undefined" ? null : location): string {
  const base = IS_DEMO && here ? `${here.origin}${here.pathname}` : DEMO_URL;
  return `${base}${linkHash(s, rules)}`;
}

const LINK_MAX = 8_000;

/** The scenario and rules from "#s=..."; `null` when the address carries none or it cannot be read. */
export function fromLink(hash: string): { scenario: Scenario; rules: string | null } | null {
  if (!hash.startsWith("#") || hash.length > LINK_MAX) return null;
  const params = new URLSearchParams(hash.slice(1));
  const s = params.get("s");
  if (!s) return null;
  try {
    const d = defaultScenario() as unknown as Obj;
    const got = JSON.parse(fromBase64Url(s)) as unknown;
    const r = params.get("r");
    return { scenario: normalizeScenario(merge(d, got)), rules: r && /^[a-z0-9-]{1,30}$/.test(r) ? r : null };
  } catch {
    return null;
  }
}

/** The defaults with the link's differences laid over them (arrays replaced whole). */
function merge(d: unknown, over: unknown): unknown {
  if (isObj(d) && isObj(over)) {
    const out: Obj = { ...d };
    for (const k of Object.keys(d)) if (k in over) out[k] = merge(d[k], over[k]);
    return out;
  }
  return over === undefined ? d : over;
}
