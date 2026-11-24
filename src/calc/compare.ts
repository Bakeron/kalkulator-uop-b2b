/**
 * The questions the app answers (assumption A1 "Zakres pytań"): a) which offer is better,
 * b) the break-even point both ways, c) what the person costs the employer or the client,
 * d) the data of the chart "B2B over UoP by the rate". Pure functions on top of `multi.ts`.
 */
import type { B2bInput, TaxForm } from "./b2b";
import { monthDays } from "./calendar";
import { fraction, sum, type Money } from "./money";
import { compareCombined, calculateCombined, type CombinedComparison, type CombinedInput, type CombinedYear } from "./multi";
import type { Rates } from "./rates";

/** The two offers: the UoP side has `uop`, the B2B side has `b2b` (each may have more contracts). */
export interface Offers {
  uop: CombinedInput;
  b2b: CombinedInput;
}

export interface EmployerView {
  /** Employer's whole cost of the employment contract in the year (pay + contributions + PPK). */
  uopYear: Money;
  /** Pay for days not worked: holidays and the employer's sick pay. */
  uopPaidAbsence: Money;
  uopWorkedDays: number;
  uopPerWorkedDay: Money;
  /** What the client pays on the invoices in the year (net - a VAT payer gets the VAT back). */
  b2bYear: Money;
  b2bWorkedDays: number;
  b2bPerWorkedDay: Money;
  /** + = the employment contract costs the company more. */
  diffYear: Money;
}

export interface Comparison {
  uop: CombinedYear;
  b2b: CombinedComparison;
  /** The B2B result in the best form. */
  b2bBest: CombinedYear;
  /** B2B minus UoP on the account (+ = B2B gives more). */
  diffYear: Money;
  diffMonthly: Money;
  days: {
    uopWorked: number;
    b2bWorked: number;
    /** Days B2B needs to work in the year to keep as much as the UoP; `null` = not possible. */
    b2bNeeded: number | null;
  };
  employer: EmployerView;
}

function b2bOf(side: CombinedInput): B2bInput {
  if (!side.b2b) throw new Error("The B2B side has no business");
  return side.b2b;
}

function withRate(side: CombinedInput, amount: Money): CombinedInput {
  const b2b = b2bOf(side);
  return { ...side, b2b: { ...b2b, rate: { ...b2b.rate, amount } } };
}

function withGross(side: CombinedInput, gross: Money): CombinedInput {
  if (!side.uop) throw new Error("The UoP side has no employment contract");
  return { ...side, uop: { ...side.uop, gross } };
}

/** Net of the year of the B2B side: in the given form or in the best available one. */
function b2bNet(side: CombinedInput, rates: Rates, form?: TaxForm): Money {
  if (form) return calculateCombined(side, rates, form).netYear;
  const all = compareCombined(side, rates);
  return all.forms[all.best].netYear;
}

/**
 * Smallest whole-złoty amount in [0, max] for which `net(amount)` reaches `target` (`net` grows
 * with the amount); `null` when even `max` is not enough.
 */
export function smallestReaching(net: (amount: Money) => Money, target: Money, max: Money): Money | null {
  let lo = 0;
  let hi = 100;
  while (net(hi) < target) {
    if (hi >= max) return null;
    lo = hi;
    hi = Math.min(max, hi * 2);
  }
  // Invariant: net(hi) >= target; whole złoty only.
  let a = Math.floor(lo / 100);
  let b = hi / 100;
  while (a < b) {
    const mid = Math.floor((a + b) / 2);
    if (net(mid * 100) >= target) b = mid;
    else a = mid + 1;
  }
  return b * 100;
}

/** Highest amount the search goes to: 10 million zł a month. */
const MAX_AMOUNT: Money = 1_000_000_000;

export interface BreakEven {
  /** The amount found (B2B rate in the unit of its input, or UoP gross a month). */
  amount: Money | null;
  /** Net of the year it has to reach. */
  target: Money;
}

/** b) "How much do I need on B2B to keep as much as on UoP X gross?" (in the unit of the rate). */
export function b2bForUop(offers: Offers, rates: Rates, form?: TaxForm): BreakEven {
  const target = calculateCombined(offers.uop, rates).netYear;
  const amount = smallestReaching((a) => b2bNet(withRate(offers.b2b, a), rates, form), target, MAX_AMOUNT);
  return { amount, target };
}

/** b) "How much gross on UoP matches B2B Y net?" */
export function uopForB2b(offers: Offers, rates: Rates, form?: TaxForm): BreakEven {
  const target = b2bNet(offers.b2b, rates, form);
  const amount = smallestReaching((g) => calculateCombined(withGross(offers.uop, g), rates).netYear, target, MAX_AMOUNT);
  return { amount, target };
}

/**
 * What a side gives besides the account, in the year (plan A26, question B2 a): PPK paid by the
 * person and by the employer (it is the person's savings) and benefits in kind, of every job.
 * Bonuses in cash are already in the net.
 */
export function extrasYear(y: CombinedYear): Money {
  let total = 0;
  for (const job of [y.uop, ...y.extraJobs]) if (job) total += job.total.ppkEmployee + job.total.ppkEmployer + job.total.inKind;
  return total;
}

/** Net of the year with the extras: what "the same on hand and the same benefits" compares. */
export function valueYear(y: CombinedYear): Money {
  return y.netYear + extrasYear(y);
}

/** Pension contributions of the year that go to the person's account in ZUS (both parts). */
export function pensionYear(y: CombinedYear): Money {
  let total = 0;
  for (const job of [y.uop, ...y.extraJobs]) if (job) total += job.total.pension + job.total.employer.pension;
  for (const c of y.civil) total += c.total.pension + c.total.employer.pension;
  if (y.b2b) for (const m of y.b2b.months) total += m.social.pension;
  return total;
}

/** Value of the year of the B2B side: in the given form or in the best one (the extras do not depend on the form). */
function b2bValue(side: CombinedInput, rates: Rates, form?: TaxForm): Money {
  if (form) return valueYear(calculateCombined(side, rates, form));
  const all = compareCombined(side, rates);
  return valueYear(all.forms[all.best]);
}

/**
 * "I know only the UoP offer" (plan A26): the smallest B2B rate that gives as much on hand as the
 * UoP and also pays for what the UoP gives besides (PPK of both, benefits in kind).
 */
export function b2bForUopEqual(offers: Offers, rates: Rates, form?: TaxForm): BreakEven {
  const target = valueYear(calculateCombined(offers.uop, rates));
  const amount = smallestReaching((a) => b2bValue(withRate(offers.b2b, a), rates, form), target, MAX_AMOUNT);
  return { amount, target };
}

/** "I know only the B2B offer": the smallest UoP gross whose net with PPK and benefits matches it. */
export function uopForB2bEqual(offers: Offers, rates: Rates, form?: TaxForm): BreakEven {
  const target = b2bValue(offers.b2b, rates, form);
  const amount = smallestReaching((g) => valueYear(calculateCombined(withGross(offers.uop, g), rates)), target, MAX_AMOUNT);
  return { amount, target };
}

/** Days off spread over the months in proportion to their business days (largest remainder). */
export function spreadDays(total: number, year: number): number[] {
  const business = monthDays(year).map((m) => m.business);
  const all = sum(business);
  const days = Math.min(Math.max(0, total), all);
  const exact = business.map((b) => (b * days) / all);
  const plan = exact.map(Math.floor);
  const left = days - sum(plan);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  // The fractions add up to `left`, so the largest `left` of them each get one more day.
  for (const [, i] of order.slice(0, left)) plan[i]!++;
  return plan;
}

/**
 * Days B2B has to work in the year to keep the target: the most days off (spread evenly) that
 * still reach it. `null` when working every day is not enough.
 */
export function b2bDaysNeeded(side: CombinedInput, target: Money, rates: Rates, form?: TaxForm): number | null {
  const b2b = b2bOf(side);
  const run = (off: number) => {
    const input = { ...side, b2b: { ...b2b, daysOffByMonth: spreadDays(off, rates.year) } };
    const all = compareCombined(input, rates);
    const year = form ? all.forms[form] : all.forms[all.best];
    return { net: year.netYear, worked: year.b2b!.days.worked };
  };
  const business = sum(monthDays(rates.year).map((m) => m.business));
  if (run(0).net < target) return null;
  // Largest number of days off with net >= target (net falls with every day off).
  let a = 0;
  let b = business;
  while (a < b) {
    const mid = Math.ceil((a + b) / 2);
    if (run(mid).net >= target) a = mid;
    else b = mid - 1;
  }
  return run(a).worked;
}

/** c) What the person costs: the employer on UoP, the client on B2B. */
export function employerView(uop: CombinedYear, b2b: CombinedYear): EmployerView {
  const job = uop.uop;
  const uopYear = job ? job.total.employerCost : 0;
  let uopPaidAbsence = 0;
  let uopWorkedDays = 0;
  if (job) {
    for (const m of job.months) {
      uopPaidAbsence += fraction(m.salary, Math.min(m.days.vacation, m.days.working), m.days.working) + m.sickPay;
      uopWorkedDays += m.days.worked;
    }
  }
  const b2bYear = b2b.b2b ? b2b.b2b.total.revenue : 0;
  const b2bWorkedDays = b2b.b2b ? b2b.b2b.days.worked : 0;
  return {
    uopYear,
    uopPaidAbsence,
    uopWorkedDays,
    uopPerWorkedDay: uopWorkedDays === 0 ? 0 : Math.round(uopYear / uopWorkedDays),
    b2bYear,
    b2bWorkedDays,
    b2bPerWorkedDay: b2bWorkedDays === 0 ? 0 : Math.round(b2bYear / b2bWorkedDays),
    diffYear: uopYear - b2bYear,
  };
}

/** a) + c): both offers side by side, the difference, the days and the company's view. */
export function compareOffers(offers: Offers, rates: Rates): Comparison {
  b2bOf(offers.b2b);
  const uop = calculateCombined(offers.uop, rates);
  const b2b = compareCombined(offers.b2b, rates);
  const b2bBest = b2b.forms[b2b.best];
  const diffYear = b2bBest.netYear - uop.netYear;
  return {
    uop,
    b2b,
    b2bBest,
    diffYear,
    diffMonthly: Math.round(diffYear / 12),
    days: {
      uopWorked: uop.uop?.days.worked ?? 0,
      b2bWorked: b2bBest.b2b!.days.worked,
      b2bNeeded: b2bDaysNeeded(offers.b2b, uop.netYear, rates),
    },
    employer: employerView(uop, b2bBest),
  };
}

export interface CurvePoint {
  /** B2B rate (in the unit of the input). */
  rate: Money;
  b2bNetMonthly: Money;
  /** B2B over UoP a month (+ = B2B gives more). */
  diffMonthly: Money;
  best: TaxForm;
  /** Every form, for the lines of the chart. */
  forms: Record<TaxForm, Money>;
}

/** d) Data of the chart: B2B over UoP for `points` rates from `from` to `to` (evenly). */
export function profitCurve(offers: Offers, rates: Rates, from: Money, to: Money, points = 25): { uopNetMonthly: Money; points: CurvePoint[] } {
  const uopNetMonthly = calculateCombined(offers.uop, rates).netMonthly;
  const count = Math.max(2, points);
  const result: CurvePoint[] = [];
  for (let i = 0; i < count; i++) {
    const rate = from + Math.round(((to - from) * i) / (count - 1) / 100) * 100;
    const all = compareCombined(withRate(offers.b2b, rate), rates);
    const forms = Object.fromEntries(Object.entries(all.forms).map(([f, y]) => [f, y.netMonthly])) as Record<TaxForm, Money>;
    const b2bNetMonthly = forms[all.best];
    result.push({ rate, b2bNetMonthly, diffMonthly: b2bNetMonthly - uopNetMonthly, best: all.best, forms });
  }
  return { uopNetMonthly, points: result };
}
