/**
 * What the main screen shows, computed from the two offers and the assumptions: the answer in
 * sentences, the break-even both ways, the breakdown of an average month and the two scales of
 * the slide rule (UoP gross on top, B2B rate below, equal net amounts opposite each other).
 */
import { defaultB2bInput, defaultCosts, type B2bInput, type CostItem, type TaxForm, type VatMode } from "../calc/b2b";
import { b2bForUop, b2bForUopEqual, compareOffers, extrasYear, pensionYear, uopForB2b, uopForB2bEqual, type Comparison, type Offers } from "../calc/compare";
import type { Bp, Money } from "../calc/money";
import { calculateCombined, compareCombined, defaultCivil, defaultFamily, type CivilContract, type CombinedInput, type CombinedYear, type Family } from "../calc/multi";
import type { Rates } from "../calc/rates";
import { defaultUopInput, defaultVacationPlan, type BenefitKind, type SicknessKind, type UopInput } from "../calc/uop";
import { zlWhole } from "./format";

/** A benefit of the employment contract: ticked or not, with its amount (assumption A1). */
export interface BenefitChoice {
  kind: Exclude<BenefitKind, "inny">;
  on: boolean;
  amount: Money;
}

/** Benefits with a typical value: monthly in kind, or once a year in money. */
export const BENEFITS: Record<BenefitChoice["kind"], { name: string; amount: Money; month: number | null; cash: boolean }> = {
  "karta-sportowa": { name: "Karta sportowa", amount: 15_000, month: null, cash: false },
  "opieka-medyczna": { name: "Opieka medyczna", amount: 10_000, month: null, cash: false },
  "premia-roczna": { name: "Premia roczna", amount: 1_000_000, month: 11, cash: true },
  trzynastka: { name: "Trzynastka", amount: 1_200_000, month: 2, cash: true },
};

/**
 * Which amounts the person knows (plan A26, question B1 a): both offers, or only one - then the
 * other is computed so that it gives the same on hand and the same benefits.
 */
export type Known = "obie" | "uop" | "b2b";
export const KNOWN: readonly Known[] = ["obie", "uop", "b2b"];

export interface Scenario {
  known: Known;
  uopGross: Money;
  b2bRate: Money;
  /** `null` = the best form chosen by the calculator. */
  form: TaxForm | null;
  vacationDays: 20 | 26;
  sickDays: number;
  sickKind: SicknessKind;
  over50: boolean;
  uop: {
    ppk: boolean;
    commuter: boolean;
    authors: boolean;
    creativePercent: number;
    zeroPit: boolean;
    benefits: BenefitChoice[];
  };
  b2b: {
    startDate: string;
    startRelief: boolean;
    preferential: boolean;
    smallZusPlus: boolean;
    prevRevenue: Money;
    prevIncome: Money;
    voluntarySickness: boolean;
    contributionHoliday: number | null;
    /** `null` = the usual rate for IT services. */
    ryczaltRate: Bp | null;
    ipBoxPercent: number;
    formerEmployer: boolean;
    clients: "jeden" | "kilku";
    paidDaysOff: number;
  };
  costs: CostItem[];
  vat: VatMode;
  family: Family;
  /** Other contracts of the person - counted with both offers ("Kilka umów naraz"). */
  extra: {
    /** Second employment contract at another employer, gross a month; `null` = none. */
    job: Money | null;
    zlecenie: { amount: Money; sameEmployer: boolean; voluntarySocial: boolean } | null;
    dzielo: { amount: Money; authors: boolean } | null;
    /** A business next to the employment contract (UoP offer only, on the scale), net a month. */
    sideBusiness: Money | null;
  };
}

export function defaultScenario(): Scenario {
  return {
    known: "obie",
    uopGross: 1_200_000,
    b2bRate: 1_500_000,
    form: null,
    vacationDays: 26,
    sickDays: 10,
    sickKind: "zwykla",
    over50: false,
    uop: {
      ppk: true,
      commuter: false,
      authors: false,
      creativePercent: 80,
      zeroPit: false,
      benefits: (Object.keys(BENEFITS) as BenefitChoice["kind"][]).map((kind) => ({ kind, on: false, amount: BENEFITS[kind].amount })),
    },
    b2b: {
      startDate: "",
      startRelief: true,
      preferential: true,
      smallZusPlus: false,
      prevRevenue: 0,
      prevIncome: 0,
      voluntarySickness: true,
      contributionHoliday: null,
      ryczaltRate: null,
      ipBoxPercent: 100,
      formerEmployer: false,
      clients: "jeden",
      paidDaysOff: 0,
    },
    costs: defaultCosts(),
    vat: "czynny",
    family: defaultFamily(),
    extra: { job: null, zlecenie: null, dzielo: null, sideBusiness: null },
  };
}

function uopInput(s: Scenario): UopInput {
  const base = defaultUopInput(s.uopGross);
  return {
    ...base,
    ppk: s.uop.ppk,
    commuter: s.uop.commuter,
    authors: { enabled: s.uop.authors, creativePercent: s.uop.creativePercent },
    zeroPit: s.uop.zeroPit,
    benefits: s.uop.benefits
      .filter((b) => b.on && b.amount > 0)
      .map((b) => ({ kind: b.kind, amount: b.amount, month: BENEFITS[b.kind].month, cash: BENEFITS[b.kind].cash })),
    vacationByMonth: defaultVacationPlan(s.vacationDays),
    sickness: { ...base.sickness, days: s.sickDays, kind: s.sickKind, over50: s.over50 },
  };
}

function b2bInput(s: Scenario, rates: Rates): B2bInput {
  const base = defaultB2bInput(s.b2bRate, rates.year);
  const o = s.b2b;
  return {
    ...base,
    startDate: o.startDate || base.startDate,
    zus: {
      startRelief: o.startRelief,
      preferential: o.preferential,
      smallZusPlus: { enabled: o.smallZusPlus, prevRevenue: o.prevRevenue, prevIncome: o.prevIncome, prevDays: 365 },
    },
    voluntarySickness: o.voluntarySickness,
    contributionHoliday: o.contributionHoliday,
    costs: s.costs,
    vat: s.vat,
    ryczaltRate: o.ryczaltRate,
    ipBox: { qualifiedPercent: o.ipBoxPercent },
    daysOffByMonth: defaultVacationPlan(s.vacationDays),
    paidDaysOff: o.paidDaysOff,
    sickness: { ...base.sickness, days: s.sickDays, kind: s.sickKind },
    formerEmployer: o.formerEmployer,
    clients: o.clients,
  };
}

function civilOf(s: Scenario, withJob: boolean): CivilContract[] {
  const list: CivilContract[] = [];
  const z = s.extra.zlecenie;
  if (z && z.amount > 0) {
    list.push({ ...defaultCivil(z.amount, "zlecenie"), sameEmployer: withJob && z.sameEmployer, voluntarySocial: z.voluntarySocial });
  }
  const d = s.extra.dzielo;
  if (d && d.amount > 0) list.push({ ...defaultCivil(d.amount, "dzielo"), authors: d.authors });
  return list;
}

/**
 * The two offers with everything else the person has. The other contracts count on both sides;
 * on the B2B side a second job becomes the main one (PIT-2 filed there). A business next to the
 * job is on the UoP side only and is counted on the scale.
 */
export function offersOf(s: Scenario, rates: Rates): Offers {
  const job = s.extra.job !== null && s.extra.job > 0 ? defaultUopInput(s.extra.job) : null;
  const side = s.extra.sideBusiness !== null && s.extra.sideBusiness > 0 ? defaultB2bInput(s.extra.sideBusiness, rates.year) : null;
  const uop: CombinedInput = { uop: uopInput(s), extraJobs: job ? [job] : [], civil: civilOf(s, true), b2b: side, family: s.family };
  const b2b: CombinedInput = { uop: job, extraJobs: [], civil: civilOf(s, false), b2b: b2bInput(s, rates), family: s.family };
  return { uop, b2b };
}

/** One line of "skąd ta kwota": an average month. */
export interface Part {
  key: "zus" | "zdrowotna" | "pit" | "ppk" | "koszty" | "netto";
  amount: Money;
}

export interface Breakdown {
  /** Money in: gross pay with sick pay, or invoices with the allowance (average month). */
  whole: Money;
  parts: Part[];
  /** VAT that goes through the business account (not the person's money). */
  vat: Money;
}

const avg = (year: Money) => Math.round(year / 12);

type Sums = { whole: Money; costs: Money; social: Money; health: Money; ppk: Money };

const add = (a: Sums, b: Sums): Sums => ({
  whole: a.whole + b.whole,
  costs: a.costs + b.costs,
  social: a.social + b.social,
  health: a.health + b.health,
  ppk: a.ppk + b.ppk,
});

const ZERO: Sums = { whole: 0, costs: 0, social: 0, health: 0, ppk: 0 };

function jobSums(j: NonNullable<CombinedYear["uop"]>): Sums {
  const t = j.total;
  return { whole: t.salary + t.cashBonuses + t.sickPay + t.allowance, costs: 0, social: t.social, health: t.health, ppk: t.ppkEmployee };
}

function businessSums(y: CombinedYear): Sums {
  const b = y.b2b;
  if (!b) return ZERO;
  const t = b.total;
  return { whole: t.revenue + t.allowance, costs: t.costsCash, social: t.social, health: t.health + b.healthSettlement, ppk: 0 };
}

/** Everything else the person has: further jobs and civil contracts. */
function otherSums(y: CombinedYear): Sums {
  let s = y.extraJobs.map(jobSums).reduce(add, ZERO);
  for (const c of y.civil) {
    const t = c.total;
    s = add(s, { whole: t.revenue, costs: 0, social: t.social, health: t.health, ppk: t.ppkEmployee });
  }
  return s;
}

/** Parts of an average month; "koszty" and "ppk" only when there are any. */
function breakdownOf(all: Sums, y: CombinedYear, vat: Money): Breakdown {
  const pit = y.yearly.advances + y.yearly.settlement + y.yearly.flatTax;
  const parts: Part[] = [
    { key: "koszty", amount: avg(all.costs) },
    { key: "zus", amount: avg(all.social) },
    { key: "zdrowotna", amount: avg(all.health) },
    { key: "pit", amount: avg(pit) },
    { key: "ppk", amount: avg(all.ppk) },
    { key: "netto", amount: avg(y.netYear) },
  ];
  return { whole: avg(all.whole), parts: parts.filter((p) => !((p.key === "koszty" || p.key === "ppk") && p.amount === 0)), vat: avg(vat) };
}

/** Average month of the UoP offer - with the other contracts and the side business, if any. */
export function uopBreakdown(y: CombinedYear): Breakdown {
  const all = [jobSums(y.uop!), otherSums(y), businessSums(y)].reduce(add, ZERO);
  return breakdownOf(all, y, y.b2b ? y.b2b.total.vatDue : 0);
}

/** Average month of the B2B offer - with the other contracts, if any. */
export function b2bBreakdown(y: CombinedYear): Breakdown {
  const all = [businessSums(y), y.uop ? jobSums(y.uop) : ZERO, otherSums(y)].reduce(add, ZERO);
  return breakdownOf(all, y, y.b2b!.total.vatDue);
}

/** The person has more than the two offers (the breakdown says so). */
export function hasOthers(s: Scenario): boolean {
  const e = s.extra;
  return (e.job ?? 0) > 0 || (e.zlecenie?.amount ?? 0) > 0 || (e.dzielo?.amount ?? 0) > 0 || (e.sideBusiness ?? 0) > 0;
}

/** One month of the table: net of both offers and what makes the difference. */
export interface MonthRow {
  month: number;
  uopNet: Money;
  b2bNet: Money;
  /** Days of holiday and sickness (calendar) in the month - the reasons of the dips. */
  vacation: number;
  sick: number;
}

/**
 * Net of each month (paid in that month's pay or left from that month's invoices); the yearly
 * return (refund or extra tax) is not in any month - it comes with the tax return in spring.
 */
export function monthRows(uop: CombinedYear, b2b: CombinedYear): MonthRow[] {
  const monthNet = (y: CombinedYear, m: number) =>
    (y.uop?.months[m]?.net ?? 0) +
    sumOf(y.extraJobs.map((j) => j.months[m]!.net)) +
    sumOf(y.civil.map((c) => c.months[m]!.net)) +
    (y.b2b?.months[m]?.net ?? 0);
  return Array.from({ length: 12 }, (_, m) => ({
    month: m,
    uopNet: monthNet(uop, m),
    b2bNet: monthNet(b2b, m),
    vacation: uop.uop?.months[m]?.days.vacation ?? 0,
    sick: uop.uop?.months[m]?.days.sick ?? 0,
  }));
}

const sumOf = (list: Money[]) => list.reduce((a, b) => a + b, 0);

export interface MainResult {
  comparison: Comparison;
  /** The B2B side in the form shown (the chosen one or the best). */
  b2bShown: CombinedYear;
  formShown: TaxForm;
  diffMonthly: Money;
  /** B2B rate that keeps as much as the UoP offer; UoP gross that matches the B2B offer. */
  b2bNeeded: Money | null;
  uopMatching: Money | null;
  /** The two amounts the result is computed for - with the computed one when only one is known. */
  amounts: { uopGross: Money; b2bRate: Money };
  /** The computed amount when only one is known; `amount: null` = no amount is enough. */
  derived: { side: "uop" | "b2b"; amount: Money | null } | null;
  /** Average month: PPK of both and benefits in kind of each side (what the computed amount also pays for). */
  extrasMonthly: { uop: Money; b2b: Money };
  /** Average month: pension contributions to the person's account in ZUS on each side. */
  pensionMonthly: { uop: Money; b2b: Money };
}

/** The scenario with the computed amount in place of the unknown one (the same scenario when both are known). */
function withDerived(s: Scenario, rates: Rates): { shown: Scenario; derived: MainResult["derived"] } {
  if (s.known === "obie") return { shown: s, derived: null };
  const offers = offersOf(s, rates);
  const form = s.form ?? undefined;
  if (s.known === "uop") {
    const amount = b2bForUopEqual(offers, rates, form).amount;
    return { shown: amount === null ? s : { ...s, b2bRate: amount }, derived: { side: "b2b", amount } };
  }
  const amount = uopForB2bEqual(offers, rates, form).amount;
  return { shown: amount === null ? s : { ...s, uopGross: amount }, derived: { side: "uop", amount } };
}

export function mainResult(given: Scenario, rates: Rates): MainResult {
  const { shown: s, derived } = withDerived(given, rates);
  const offers = offersOf(s, rates);
  const comparison = compareOffers(offers, rates);
  const formShown = s.form ?? comparison.b2b.best;
  const b2bShown = comparison.b2b.forms[formShown];
  const form = s.form ?? undefined;
  return {
    comparison,
    b2bShown,
    formShown,
    diffMonthly: Math.round((b2bShown.netYear - comparison.uop.netYear) / 12),
    b2bNeeded: b2bForUop(offers, rates, form).amount,
    uopMatching: uopForB2b(offers, rates, form).amount,
    amounts: { uopGross: s.uopGross, b2bRate: s.b2bRate },
    derived,
    extrasMonthly: { uop: avg(extrasYear(comparison.uop)), b2b: avg(extrasYear(b2bShown)) },
    pensionMonthly: { uop: avg(pensionYear(comparison.uop)), b2b: avg(pensionYear(b2bShown)) },
  };
}

/** Samples of net a year by the amount, for the two scales. */
export interface ScaleModel {
  min: Money;
  max: Money;
  uop: { amount: Money; net: Money }[];
  /** With the form the net is computed in (the chosen one or the best at that rate). */
  b2b: { amount: Money; net: Money; form: TaxForm }[];
}

const UOP_STEP = 25_000;
const B2B_STEP = 100_000;

/**
 * The scales depend only on the assumptions (not on the two amounts), so they are computed once
 * per change of the assumptions: UoP every 250 zł, B2B every 1 000 zł.
 */
export function scaleModel(s: Scenario, rates: Rates, max: Money): ScaleModel {
  const offers = offersOf(s, rates);
  const min = 400_000;
  const uop: ScaleModel["uop"] = [];
  for (let g = min; g <= max; g += UOP_STEP) {
    uop.push({ amount: g, net: calculateCombined({ ...offers.uop, uop: { ...offers.uop.uop!, gross: g } }, rates).netYear });
  }
  const top = uop[uop.length - 1]!.net;
  const b2b: ScaleModel["b2b"] = [];
  for (let r = 0; r <= max * 3; r += B2B_STEP) {
    const input = { ...offers.b2b, b2b: { ...offers.b2b.b2b!, rate: { ...offers.b2b.b2b!.rate, amount: r } } };
    const all = compareCombined(input, rates);
    const form = s.form ?? all.best;
    const net = all.forms[form].netYear;
    b2b.push({ amount: r, net, form });
    if (net > top) break;
  }
  return { min, max, uop, b2b };
}

/** Linear interpolation in samples sorted by `from`; `null` outside the samples. */
type Sample = { amount: Money; net: Money };

function interpolate(samples: Sample[], from: keyof Sample, to: keyof Sample, value: number): number | null {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const lo = Math.min(a[from], b[from]);
    const hi = Math.max(a[from], b[from]);
    if (value >= lo && value <= hi) {
      if (hi === lo) return a[to];
      return a[to] + ((b[to] - a[to]) * (value - a[from])) / (b[from] - a[from]);
    }
  }
  return null;
}

/** UoP gross with the same net as the B2B rate (position of a B2B amount on the scale). */
export function uopForRate(model: ScaleModel, rate: Money): Money | null {
  const net = interpolate(model.b2b, "amount", "net", rate);
  return net === null ? null : interpolate(model.uop, "net", "amount", net);
}

/** B2B rate with the same net as the UoP gross (approximate - the exact one is `b2bForUop`). */
export function rateForUop(model: ScaleModel, gross: Money): Money | null {
  const net = interpolate(model.uop, "amount", "net", gross);
  return net === null ? null : interpolate(model.b2b, "net", "amount", net);
}

/** Highest amount of the top scale: 40 000 zł, more when an offer does not fit. */
export function scaleMax(s: Scenario, uopMatching: Money | null): Money {
  const need = Math.max(s.uopGross, uopMatching ?? 0);
  return Math.max(4_000_000, Math.ceil((need * 1.2) / 1_000_000) * 1_000_000);
}

/** Everything the main screen shows. */
export interface Computed {
  result: MainResult;
  model: ScaleModel;
}

/** The scenario without the two amounts: what the scales depend on. */
export function assumptionsKey(s: Scenario): string {
  const { uopGross: _u, b2bRate: _b, known: _k, ...rest } = s;
  return JSON.stringify(rest);
}

/**
 * The main screen's calculation. The scales are the slow part (hundreds of years computed), so
 * they are kept while only the two amounts change and the top of the scale stays the same.
 */
export function calculator(rates: Rates): (s: Scenario) => Computed {
  let cached: { key: string; model: ScaleModel } | null = null;
  return (s) => {
    const result = mainResult(s, rates);
    // With one amount known, the scale has to fit the computed one too.
    const max = scaleMax({ ...s, uopGross: result.amounts.uopGross }, result.uopMatching);
    const key = `${assumptionsKey(s)}|${max}`;
    if (cached?.key !== key) cached = { key, model: scaleModel(s, rates, max) };
    return { result, model: cached.model };
  };
}

/** One point of the chart "B2B over UoP by the rate". */
export interface ProfitPoint {
  rate: Money;
  /** B2B minus UoP on the account, average month (+ = B2B gives more). */
  diff: Money;
  form: TaxForm;
}

export interface ProfitChartData {
  from: Money;
  to: Money;
  points: ProfitPoint[];
}

/**
 * d) The chart "B2B over UoP by the rate" (assumption A1) from the samples of the bottom scale
 * (every 1 000 zł) - no extra calculation. It spans from half of the lower of the offer and the
 * break-even to one and a half of the higher one.
 */
export function profitChart(model: ScaleModel, uopNetYear: Money, b2bRate: Money, b2bNeeded: Money | null): ProfitChartData {
  const low = Math.min(b2bRate, b2bNeeded ?? b2bRate);
  const high = Math.max(b2bRate, b2bNeeded ?? b2bRate);
  const last = model.b2b[model.b2b.length - 1]!.amount;
  const from = Math.max(0, Math.floor((low * 0.5) / B2B_STEP) * B2B_STEP);
  const to = Math.min(last, Math.max(from + 5 * B2B_STEP, Math.ceil((high * 1.5) / B2B_STEP) * B2B_STEP));
  const points = model.b2b
    .filter((p) => p.amount >= from && p.amount <= to)
    .map((p) => ({ rate: p.amount, diff: Math.round((p.net - uopNetYear) / 12), form: p.form }));
  return { from, to, points };
}

/**
 * Minimum wage act (10.10.2002), art. 6: full time may not be paid less than the minimum wage;
 * part time - in proportion. The calculator counts full time, so a lower salary gets a remark.
 */
export function belowMinWage(gross: Money, minWage: Money, year: number): string | null {
  if (gross >= minWage) return null;
  return `Mniej niż płaca minimalna na ${year} rok (${zlWhole(minWage)}). Na pełny etat tyle płacić nie wolno - pracodawca musi dopłacić do minimum. Mniej wolno tylko na części etatu, a kalkulator liczy pełny etat.`;
}
