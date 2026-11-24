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

/** Shape of `src/rates/<year>.json`. */
export interface RatesFile {
  year: number;
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
  /** The items that came from `pending` (shown as "z projektami" on the result). */
  usedPending: ItemKey[];
}

const MONEY_KEYS = [
  "minWage", "avgWageForecast", "zusAnnualLimit", "taxReduction", "employeeCosts",
  "employeeCostsCommuter", "authorsCostsLimit", "zeroPitLimit", "preferentialBase", "fullBase",
  "healthMin", "healthMinJanuary", "linearHealthDeductionLimit", "ryczaltHealthAvgWage",
  "ryczaltLimit", "vatExemptLimit", "smallZusRevenueLimit",
] as const;
const RATE_KEYS = [
  "pensionEmployee", "pensionEmployer", "disabilityEmployee", "disabilityEmployer", "sickness",
  "accident", "laborFund", "fgsp", "health", "ppkEmployee", "ppkEmployer", "healthLinear",
  "linearRate", "ipBoxRate", "ryczaltItRate", "vatRate",
] as const;
const COUNT_KEYS = [
  "sickPayEmployerDays", "sickPayEmployerDaysOver50", "voluntarySicknessWaitDays",
  "startReliefMonths", "preferentialMonths",
] as const;

/** Every key a rates file must have - used by the completeness test of the files. */
export const ITEM_KEYS: readonly ItemKey[] = [
  ...MONEY_KEYS, ...RATE_KEYS, ...COUNT_KEYS, "pitScale", "ryczaltHealthThresholds",
];

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
    usedPending: used,
  };
}
