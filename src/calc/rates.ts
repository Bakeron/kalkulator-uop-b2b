/**
 * Rates of one tax year. The JSON files in `src/rates/` keep every number next to its official
 * source and the date it was checked (assumption A1 "Stawki"); this module validates them and turns
 * them into integer grosze and basis points for the calculations.
 */
import { pct, zl, type Bp, type Money } from "./money";

/** How sure a number is (assumption A1 "Kwoty potwierdzone vs szacunek"). */
export type Status = "pewne" | "uchwalone" | "projekt" | "szacunek" | "doniesienie";

/** Which rules the calculation follows (assumption A1 "Przepisy na dziś i po zmianach"). */
export type RulesVariant = "pewne" | "z-projektami";

export interface SourceInfo {
  /** Act or page, e.g. "Dz.U. 2025 poz. 1242". */
  source: string;
  url: string;
  /** Date the number was checked against the source (YYYY-MM-DD). */
  checked: string;
  status: Status;
  note?: string;
}

export interface RateItem<T> extends SourceInfo {
  value: T;
  /** Not yet in force (passed, waiting for a signature, or a bill) - used only with "z-projektami". */
  pending?: RateItem<T>;
}

/** One bracket of the PIT scale in a rates file: [upper limit in zł or null for "above", rate %]. */
export type BracketJson = [number | null, number];

/**
 * A planned change that moves no number of the calculation (e.g. who pays the sick pay) - shown
 * only in "Co się zmieni i kiedy".
 */
export interface Bill extends SourceInfo {
  title: string;
  /** What it would change, in plain words. */
  what: string;
  /** From when, as far as it is known, e.g. "30 dni po ogłoszeniu". */
  from: string;
}

/** Shape of `src/rates/<year>.json`. */
export interface RatesFile {
  year: number;
  bills?: Bill[];
  items: {
    minWage: RateItem<number>;
    avgWageForecast: RateItem<number>;
    zusAnnualLimit: RateItem<number>;
    pensionEmployee: RateItem<number>;
    pensionEmployer: RateItem<number>;
    disabilityEmployee: RateItem<number>;
    disabilityEmployer: RateItem<number>;
    sickness: RateItem<number>;
    accident: RateItem<number>;
    laborFund: RateItem<number>;
    fgsp: RateItem<number>;
    health: RateItem<number>;
    ppkEmployee: RateItem<number>;
    ppkEmployer: RateItem<number>;
    pitScale: RateItem<BracketJson[]>;
    taxReduction: RateItem<number>;
    employeeCosts: RateItem<number>;
    employeeCostsCommuter: RateItem<number>;
    authorsCostsLimit: RateItem<number>;
    zeroPitLimit: RateItem<number>;
    sickPayEmployerDays: RateItem<number>;
    sickPayEmployerDaysOver50: RateItem<number>;
    // Self-employment (B2B)
    preferentialBase: RateItem<number>;
    fullBase: RateItem<number>;
    healthMin: RateItem<number>;
    healthMinJanuary: RateItem<number>;
    healthLinear: RateItem<number>;
    linearHealthDeductionLimit: RateItem<number>;
    ryczaltHealthAvgWage: RateItem<number>;
    ryczaltHealthThresholds: RateItem<[number, number]>;
    ryczaltLimit: RateItem<number>;
    linearRate: RateItem<number>;
    ipBoxRate: RateItem<number>;
    ryczaltItRate: RateItem<number>;
    vatRate: RateItem<number>;
    vatExemptLimit: RateItem<number>;
    smallZusRevenueLimit: RateItem<number>;
    voluntarySicknessWaitDays: RateItem<number>;
    startReliefMonths: RateItem<number>;
    preferentialMonths: RateItem<number>;
    carCostShare: RateItem<number>;
    carVatShare: RateItem<number>;
    fixedAssetLimit: RateItem<number>;
    // Several contracts, family
    employeeCostsMultiLimit: RateItem<number>;
    employeeCostsMultiLimitCommuter: RateItem<number>;
    civilCostsRate: RateItem<number>;
    smallContractLimit: RateItem<number>;
    childRelief: RateItem<number[]>;
    childReliefIncomeLimitMarried: RateItem<number>;
    childReliefIncomeLimitSingle: RateItem<number>;
  };
}

export type ItemKey = keyof RatesFile["items"];

export interface Bracket {
  /** Upper limit of the bracket in grosze, `null` = no limit. */
  upTo: Money | null;
  rate: Bp;
}

/** Rates of one year as the calculations use them. */
export interface Rates {
  year: number;
  variant: RulesVariant;
  minWage: Money;
  avgWageForecast: Money;
  zusAnnualLimit: Money;
  pensionEmployee: Bp;
  pensionEmployer: Bp;
  disabilityEmployee: Bp;
  disabilityEmployer: Bp;
  sickness: Bp;
  accident: Bp;
  laborFund: Bp;
  fgsp: Bp;
  health: Bp;
  ppkEmployee: Bp;
  ppkEmployer: Bp;
  pitScale: Bracket[];
  /** Annual tax-reducing amount (kwota zmniejszająca podatek). */
  taxReduction: Money;
  /** Monthly employee costs (koszty uzyskania przychodu). */
  employeeCosts: Money;
  employeeCostsCommuter: Money;
  /** Annual limit of the 50% author's costs. */
  authorsCostsLimit: Money;
  /** Annual limit of the "zero PIT" exemptions (under 26, return, 4+ children, working pensioner). */
  zeroPitLimit: Money;
  sickPayEmployerDays: number;
  sickPayEmployerDaysOver50: number;
  /** Self-employed social contributions base: preferential (30% of the minimum wage) and full. */
  preferentialBase: Money;
  fullBase: Money;
  /** Minimum health contribution from the February contribution on, and for January of the year. */
  healthMin: Money;
  healthMinJanuary: Money;
  /** Health contribution rate on the flat 19% tax. */
  healthLinear: Bp;
  linearHealthDeductionLimit: Money;
  /** Average wage of Q4 of the previous year - base of the health contribution on ryczałt. */
  ryczaltHealthAvgWage: Money;
  /** Annual revenue thresholds of the ryczałt health contribution (60 000 / 300 000 zł). */
  ryczaltHealthThresholds: [Money, Money];
  ryczaltLimit: Money;
  linearRate: Bp;
  ipBoxRate: Bp;
  ryczaltItRate: Bp;
  vatRate: Bp;
  vatExemptLimit: Money;
  smallZusRevenueLimit: Money;
  voluntarySicknessWaitDays: number;
  startReliefMonths: number;
  preferentialMonths: number;
  /** A company car also used privately: share of its expenses in costs and of its VAT deducted. */
  carCostShare: Bp;
  carVatShare: Bp;
  /** Equipment up to this net price goes to costs at once, a dearer one is depreciated. */
  fixedAssetLimit: Money;
  /** Annual costs of several employment contracts together (art. 22 ust. 2 pkt 2 and 4). */
  employeeCostsMultiLimit: Money;
  employeeCostsMultiLimitCommuter: Money;
  /** Costs of a civil contract (zlecenie, dzieło) without author's rights. */
  civilCostsRate: Bp;
  /** A civil contract up to this amount with someone who is not the employer: flat 12% tax. */
  smallContractLimit: Money;
  /** Annual child relief for the 1st, 2nd, 3rd and every next child (art. 27f ust. 1 pkt 2). */
  childRelief: Money[];
  /** Income limit of the relief for one child: married (spouses together) and single parent. */
  childReliefIncomeLimitMarried: Money;
  childReliefIncomeLimitSingle: Money;
  /** The items that came from `pending` (shown as "z projektami" on the result). */
  usedPending: ItemKey[];
}

const MONEY_KEYS = [
  "minWage", "avgWageForecast", "zusAnnualLimit", "taxReduction", "employeeCosts",
  "employeeCostsCommuter", "authorsCostsLimit", "zeroPitLimit", "preferentialBase", "fullBase",
  "healthMin", "healthMinJanuary", "linearHealthDeductionLimit", "ryczaltHealthAvgWage",
  "ryczaltLimit", "vatExemptLimit", "smallZusRevenueLimit", "fixedAssetLimit",
  "employeeCostsMultiLimit", "employeeCostsMultiLimitCommuter", "smallContractLimit",
  "childReliefIncomeLimitMarried", "childReliefIncomeLimitSingle",
] as const;
const RATE_KEYS = [
  "pensionEmployee", "pensionEmployer", "disabilityEmployee", "disabilityEmployer", "sickness",
  "accident", "laborFund", "fgsp", "health", "ppkEmployee", "ppkEmployer", "healthLinear",
  "linearRate", "ipBoxRate", "ryczaltItRate", "vatRate", "carCostShare", "carVatShare",
  "civilCostsRate",
] as const;
const COUNT_KEYS = [
  "sickPayEmployerDays", "sickPayEmployerDaysOver50", "voluntarySicknessWaitDays",
  "startReliefMonths", "preferentialMonths",
] as const;

/** Every key a rates file must have - used by the completeness test of the files. */
export const ITEM_KEYS: readonly ItemKey[] = [
  ...MONEY_KEYS, ...RATE_KEYS, ...COUNT_KEYS, "pitScale", "ryczaltHealthThresholds", "childRelief",
];

// Checking a rates file that comes from outside (button "Odśwież" downloads it from the repository).

const STATUSES: readonly Status[] = ["pewne", "uchwalone", "projekt", "szacunek", "doniesienie"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isText = (v: unknown, max = 2000) => typeof v === "string" && v.length > 0 && v.length <= max;
const isBracket = (v: unknown) => Array.isArray(v) && v.length === 2 && (v[0] === null || isNum(v[0])) && isNum(v[1]);

function isSource(v: Record<string, unknown>): boolean {
  return (
    isText(v.source, 300) &&
    typeof v.url === "string" &&
    /^https:\/\/[^\s"<>]+$/.test(v.url) &&
    v.url.length <= 500 &&
    typeof v.checked === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.checked) &&
    STATUSES.includes(v.status as Status) &&
    (v.note === undefined || isText(v.note))
  );
}

/** Whether a value has the shape of this number of a rates file (also for values proposed by AI). */
export function valueOk(key: ItemKey, v: unknown): boolean {
  if (key === "pitScale") return Array.isArray(v) && v.length > 0 && v.length <= 10 && v.every(isBracket);
  if (key === "ryczaltHealthThresholds") return Array.isArray(v) && v.length === 2 && v.every(isNum);
  if (key === "childRelief") return Array.isArray(v) && v.length > 0 && v.length <= 10 && v.every(isNum);
  return isNum(v);
}

function itemOk(key: ItemKey, v: unknown, nested = false): boolean {
  if (!isObj(v) || !isSource(v) || !valueOk(key, v.value)) return false;
  if (v.pending === undefined) return true;
  return !nested && itemOk(key, v.pending, true);
}

/**
 * The file when it has every number with its value, source, link and check date in the right
 * shape; `null` otherwise - a broken or tampered file never reaches the calculations.
 */
export function parseRatesFile(json: unknown): RatesFile | null {
  if (!isObj(json) || !Number.isInteger(json.year) || (json.year as number) < 2020 || (json.year as number) > 2100) return null;
  const items = json.items;
  if (!isObj(items) || !ITEM_KEYS.every((k) => itemOk(k, items[k]))) return null;
  const bills = json.bills;
  if (bills !== undefined) {
    if (!Array.isArray(bills) || bills.length > 50) return null;
    const billOk = (b: unknown) => isObj(b) && isSource(b) && isText(b.title, 300) && isText(b.what) && isText(b.from, 200);
    if (!bills.every(billOk)) return null;
  }
  return json as unknown as RatesFile;
}

/** The latest check date of the file ("YYYY-MM-DD") - which of two files is fresher. */
export function newestCheck(file: RatesFile): string {
  const dates: string[] = [];
  for (const item of Object.values(file.items) as RateItem<unknown>[]) {
    dates.push(item.checked);
    if (item.pending) dates.push(item.pending.checked);
  }
  for (const b of file.bills ?? []) dates.push(b.checked);
  dates.sort();
  return dates[dates.length - 1] ?? "";
}

function pick<T>(item: RateItem<T>, variant: RulesVariant, key: ItemKey, used: ItemKey[]): T {
  if (variant === "z-projektami" && item.pending) {
    used.push(key);
    return item.pending.value;
  }
  return item.value;
}

function scale(brackets: BracketJson[]): Bracket[] {
  return brackets.map(([upTo, rate]) => ({ upTo: upTo === null ? null : zl(upTo), rate: pct(rate) }));
}

function thresholds([low, high]: [number, number]): [Money, Money] {
  return [zl(low), zl(high)];
}

/** Rates of the file for the chosen variant of the rules. */
export function loadRates(file: RatesFile, variant: RulesVariant = "pewne"): Rates {
  const used: ItemKey[] = [];
  const it = file.items;
  const money = (k: (typeof MONEY_KEYS)[number]) => zl(pick(it[k], variant, k, used));
  const rate = (k: (typeof RATE_KEYS)[number]) => pct(pick(it[k], variant, k, used));
  const count = (k: (typeof COUNT_KEYS)[number]) => pick(it[k], variant, k, used);
  return {
    year: file.year,
    variant,
    minWage: money("minWage"),
    avgWageForecast: money("avgWageForecast"),
    zusAnnualLimit: money("zusAnnualLimit"),
    pensionEmployee: rate("pensionEmployee"),
    pensionEmployer: rate("pensionEmployer"),
    disabilityEmployee: rate("disabilityEmployee"),
    disabilityEmployer: rate("disabilityEmployer"),
    sickness: rate("sickness"),
    accident: rate("accident"),
    laborFund: rate("laborFund"),
    fgsp: rate("fgsp"),
    health: rate("health"),
    ppkEmployee: rate("ppkEmployee"),
    ppkEmployer: rate("ppkEmployer"),
    pitScale: scale(pick(it.pitScale, variant, "pitScale", used)),
    taxReduction: money("taxReduction"),
    employeeCosts: money("employeeCosts"),
    employeeCostsCommuter: money("employeeCostsCommuter"),
    authorsCostsLimit: money("authorsCostsLimit"),
    zeroPitLimit: money("zeroPitLimit"),
    sickPayEmployerDays: count("sickPayEmployerDays"),
    sickPayEmployerDaysOver50: count("sickPayEmployerDaysOver50"),
    preferentialBase: money("preferentialBase"),
    fullBase: money("fullBase"),
    healthMin: money("healthMin"),
    healthMinJanuary: money("healthMinJanuary"),
    healthLinear: rate("healthLinear"),
    linearHealthDeductionLimit: money("linearHealthDeductionLimit"),
    ryczaltHealthAvgWage: money("ryczaltHealthAvgWage"),
    ryczaltHealthThresholds: thresholds(pick(it.ryczaltHealthThresholds, variant, "ryczaltHealthThresholds", used)),
    ryczaltLimit: money("ryczaltLimit"),
    linearRate: rate("linearRate"),
    ipBoxRate: rate("ipBoxRate"),
    ryczaltItRate: rate("ryczaltItRate"),
    vatRate: rate("vatRate"),
    vatExemptLimit: money("vatExemptLimit"),
    smallZusRevenueLimit: money("smallZusRevenueLimit"),
    voluntarySicknessWaitDays: count("voluntarySicknessWaitDays"),
    startReliefMonths: count("startReliefMonths"),
    preferentialMonths: count("preferentialMonths"),
    carCostShare: rate("carCostShare"),
    carVatShare: rate("carVatShare"),
    fixedAssetLimit: money("fixedAssetLimit"),
    employeeCostsMultiLimit: money("employeeCostsMultiLimit"),
    employeeCostsMultiLimitCommuter: money("employeeCostsMultiLimitCommuter"),
    civilCostsRate: rate("civilCostsRate"),
    smallContractLimit: money("smallContractLimit"),
    childRelief: pick(it.childRelief, variant, "childRelief", used).map(zl),
    childReliefIncomeLimitMarried: money("childReliefIncomeLimitMarried"),
    childReliefIncomeLimitSingle: money("childReliefIncomeLimitSingle"),
    usedPending: used,
  };
}
