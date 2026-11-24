/**
 * Employment contract (umowa o pracę) - the whole year month by month: social and health
 * contributions, costs, PIT advances, PPK, benefits, holidays, sickness and the employer's cost.
 * Pure functions: input + rates -> result with every intermediate amount (for "skąd ta kwota").
 */
import { holidays, isBusinessDay, monthDays } from "./calendar";
import { fraction, ofRate, sum, toFullZl, type Money } from "./money";
import type { Rates } from "./rates";
import { annualScaleTax, monthlyAdvance } from "./tax";

export type BenefitKind = "karta-sportowa" | "opieka-medyczna" | "premia-roczna" | "trzynastka" | "inny";

export interface Benefit {
  kind: BenefitKind;
  /** Amount per occurrence in grosze. */
  amount: Money;
  /** Month 0-11 for a one-off payment; `null` = every month. */
  month: number | null;
  /** Paid in money (bonus) or in kind (card, medical care - taxed, but not on the account). */
  cash: boolean;
}

/**
 * Why the person is sick - sets the percentage (ustawa zasiłkowa art. 11, Kodeks pracy art. 92).
 * A hospital stay is paid 80% like an ordinary sickness (the 70% rule was repealed, art. 11 ust. 1a).
 */
export type SicknessKind = "zwykla" | "ciaza-wypadek";

export interface UopInput {
  /** Monthly gross salary in grosze. */
  gross: Money;
  /** Higher costs (300 zł) for an employee commuting from another town. */
  commuter: boolean;
  /** 50% author's costs - off by default; share of creative work in percent (default 80). */
  authors: { enabled: boolean; creativePercent: number };
  /** PPK - on by default (assumption A1). */
  ppk: boolean;
  /** "Zero PIT" (under 26, return from abroad, 4+ children, working pensioner) - off by default. */
  zeroPit: boolean;
  benefits: Benefit[];
  /** Holiday days taken in each month (12 numbers). */
  vacationByMonth: number[];
  sickness: {
    /** Calendar days of sickness in the year. */
    days: number;
    /** Month 0-11 in which the sickness starts (the days run on from its first day). */
    startMonth: number;
    kind: SicknessKind;
    /** Over 50 - the employer pays only 14 days (Kodeks pracy art. 92 par. 1 pkt 1). */
    over50: boolean;
  };
  /** Accident insurance rate of the employer in basis points; `null` = the default rate. */
  accidentRate: number | null;
  /**
   * PIT-2 filed with this employer (1/12 of the tax-reducing amount off every advance). Missing =
   * filed; a second employment contract usually has it off.
   */
  pit2?: boolean;
}

/** Other contracts of the same person that change this one (assumption A1 "Kilka umów naraz"). */
export interface UopContext {
  /**
   * Base of pension and disability contributions already used up in each month by other
   * contracts - the annual 30x limit is one for all of them.
   */
  zusLimitUsed?: readonly Money[];
  /** "Zero PIT" exemption already used up in each month by other contracts (one annual limit). */
  zeroPitUsed?: readonly Money[];
  /** 50% author's costs already used up in each month by other contracts (one annual limit). */
  authorsUsed?: readonly Money[];
}

export interface EmployerPart {
  pension: Money;
  disability: Money;
  accident: Money;
  laborFund: Money;
  fgsp: Money;
  ppk: Money;
  total: Money;
}

export interface UopMonth {
  month: number;
  /** Salary for the month after the 1/30 cut for sick days. */
  salary: Money;
  cashBonuses: Money;
  inKind: Money;
  /** Base of the social contributions (salary + bonuses + benefits in kind). */
  zusBase: Money;
  /** Part of the base above the annual 30x limit - no pension and disability contributions. */
  overLimit: Money;
  pension: Money;
  disability: Money;
  sicknessContribution: Money;
  social: Money;
  /** Sick pay paid by the employer (wynagrodzenie chorobowe). */
  sickPay: Money;
  /** Sickness allowance from ZUS (zasiłek chorobowy). */
  allowance: Money;
  healthBase: Money;
  health: Money;
  ppkEmployee: Money;
  ppkEmployer: Money;
  /** All taxable revenue of the month (incl. the employer's PPK payment). */
  revenue: Money;
  /** Revenue free of tax under "zero PIT". */
  exempt: Money;
  costs: Money;
  authorsCosts: Money;
  socialDeducted: Money;
  income: Money;
  taxBase: Money;
  advance: Money;
  /** Money on the account. */
  net: Money;
  employer: EmployerPart;
  employerCost: Money;
  days: {
    /** Working time in days (Kodeks pracy art. 130). */
    working: number;
    vacation: number;
    /** Sick calendar days in the month. */
    sick: number;
    /** Sick days that were working days. */
    sickWorking: number;
    /** Days actually worked. */
    worked: number;
    /** Sick calendar days paid by the employer / by ZUS. */
    sickPayDays: number;
    allowanceDays: number;
  };
}

export interface UopYear {
  months: UopMonth[];
  /** Sums of the 12 months (the same field names as a month). */
  total: Omit<UopMonth, "month" | "days" | "employer"> & { employer: EmployerPart };
  /** Annual tax in the yearly return (PIT-37) and the difference to the advances (+ to pay, - refund). */
  annualTax: Money;
  settlement: Money;
  /** Net after the yearly settlement. */
  netYear: Money;
  netMonthly: Money;
  /** Base of the sick pay: average gross of 12 months minus 13,71% (ustawa zasiłkowa art. 36, 3). */
  sickBase: Money;
  days: { working: number; vacation: number; sickWorking: number; worked: number };
}

/** Percent of the base paid for a sick day (ustawa zasiłkowa art. 11, Kodeks pracy art. 92). */
export const SICK_PERCENT: Record<SicknessKind, number> = { zwykla: 80, "ciaza-wypadek": 100 };

/** Typical spread of holidays: the summer and the Christmas week, the rest in May. */
export function defaultVacationPlan(days: number): number[] {
  const plan = Array<number>(12).fill(0);
  const order: [number, number][] = [[6, 10], [7, 5], [11, 4], [4, 5], [1, 2]];
  let left = days;
  for (const [month, max] of order) {
    const take = Math.min(left, max);
    plan[month] = take;
    left -= take;
  }
  plan[9]! += left;
  return plan;
}

/** Default input - assumption A1 (PPK on, author's costs and zero PIT off, 26 days, 10 sick days). */
export function defaultUopInput(gross: Money): UopInput {
  return {
    gross,
    commuter: false,
    authors: { enabled: false, creativePercent: 80 },
    ppk: true,
    zeroPit: false,
    benefits: [],
    vacationByMonth: defaultVacationPlan(26),
    sickness: { days: 10, startMonth: 1, kind: "zwykla", over50: false },
    accidentRate: null,
  };
}

export interface SickSplit {
  calendar: number[];
  working: number[];
}

/** Sick days run from the first day of the start month, one after another, within the year. */
export function sickDays(year: number, startMonth: number, days: number): SickSplit {
  const calendar = Array<number>(12).fill(0);
  const working = Array<number>(12).fill(0);
  const free = holidays(year);
  const lengths = monthDays(year).map((m) => m.calendar);
  let left = days;
  for (let m = startMonth; m < 12 && left > 0; m++) {
    const take = Math.min(left, lengths[m]!);
    calendar[m] = take;
    for (let d = 1; d <= take; d++) if (isBusinessDay(year, m + 1, d, free)) working[m]!++;
    left -= take;
  }
  return { calendar, working };
}

/** Annual result of the employment contract. */
export function calculateUop(input: UopInput, rates: Rates, context: UopContext = {}): UopYear {
  const calendarDays = monthDays(rates.year);
  const sick = sickDays(rates.year, input.sickness.startMonth, input.sickness.days);
  const employerDaysLimit = input.sickness.over50 ? rates.sickPayEmployerDaysOver50 : rates.sickPayEmployerDays;
  const accidentRate = input.accidentRate ?? rates.accident;
  const employeeSocialRate = rates.pensionEmployee + rates.disabilityEmployee + rates.sickness;
  // Sick pay base: the same gross for the last 12 months, minus the employee's social contributions.
  const sickBase = input.gross - ofRate(input.gross, employeeSocialRate);
  const sickDaily = fraction(sickBase, SICK_PERCENT[input.sickness.kind], 100 * 30);

  let limitLeft = rates.zusAnnualLimit;
  let authorsLeft = rates.authorsCostsLimit;
  let exemptLeft = input.zeroPit ? rates.zeroPitLimit : 0;
  let sickPaidSoFar = 0;
  let baseSoFar = 0;
  const months: UopMonth[] = [];

  for (let m = 0; m < 12; m++) {
    const cal = calendarDays[m]!;
    const sickCal = sick.calendar[m]!;
    const vacation = input.vacationByMonth[m] ?? 0;

    // Salary: 1/30 less for every sick calendar day, nothing for a whole month of sickness.
    const salary = sickCal >= cal.calendar ? 0 : Math.max(0, input.gross - fraction(input.gross, sickCal, 30));
    let cashBonuses = 0;
    let inKind = 0;
    for (const b of input.benefits) {
      if (b.month !== null && b.month !== m) continue;
      if (b.cash) cashBonuses += b.amount;
      else inKind += b.amount;
    }
    const zusBase = salary + cashBonuses + inKind;

    // Pension and disability only up to the annual 30x limit (shared with other contracts).
    limitLeft = Math.max(0, limitLeft - (context.zusLimitUsed?.[m] ?? 0));
    const capped = Math.min(zusBase, limitLeft);
    limitLeft -= capped;
    const pension = ofRate(capped, rates.pensionEmployee);
    const disability = ofRate(capped, rates.disabilityEmployee);
    const sicknessContribution = ofRate(zusBase, rates.sickness);
    const social = pension + disability + sicknessContribution;

    // Sick days: the first 33 (14) in the year paid by the employer, the rest by ZUS.
    const sickPayDays = Math.min(sickCal, Math.max(0, employerDaysLimit - sickPaidSoFar));
    const allowanceDays = sickCal - sickPayDays;
    sickPaidSoFar += sickCal;
    const sickPay = sickDaily * sickPayDays;
    const allowance = sickDaily * allowanceDays;

    // Health 9%: from the base minus social contributions, from sick pay and from the allowance
    // (no social contributions on either of them).
    const healthBase = zusBase - social + sickPay + allowance;
    const health = ofRate(healthBase, rates.health);

    const ppkEmployee = input.ppk ? ofRate(zusBase, rates.ppkEmployee) : 0;
    const ppkEmployer = input.ppk ? ofRate(zusBase, rates.ppkEmployer) : 0;

    // Tax. "Zero PIT" frees revenue from work up to the annual limit (not the ZUS allowance).
    exemptLeft = Math.max(0, exemptLeft - (context.zeroPitUsed?.[m] ?? 0));
    authorsLeft = Math.max(0, authorsLeft - (context.authorsUsed?.[m] ?? 0));
    const revenue = zusBase + sickPay + allowance + ppkEmployer;
    const exempt = Math.min(revenue - allowance, exemptLeft);
    exemptLeft -= exempt;
    const taxable = revenue - exempt;
    const share = revenue === 0 ? 0 : taxable / revenue;
    const socialDeducted = Math.round(social * share);

    // Author's costs: 50% of the creative part of the pay for days worked (not holiday pay),
    // after its share of social contributions, within the annual limit.
    let authorsCosts = 0;
    let creative = 0;
    let creativeSocial = 0;
    if (input.authors.enabled && zusBase > 0) {
      const holidayPay = fraction(input.gross, Math.min(vacation, cal.employee), cal.employee);
      const workPay = Math.max(0, salary - holidayPay);
      creative = Math.round(fraction(workPay, input.authors.creativePercent, 100) * share);
      creativeSocial = fraction(social, creative, zusBase);
      authorsCosts = Math.min(authorsLeft, fraction(creative - creativeSocial, 1, 2));
      authorsLeft -= authorsCosts;
    }
    // Standard monthly costs for the rest of the pay, never more than that pay's income.
    const restIncome = Math.max(0, taxable - creative - (socialDeducted - creativeSocial));
    const flat = input.commuter ? rates.employeeCostsCommuter : rates.employeeCosts;
    const costs = taxable > 0 ? Math.min(flat, restIncome) : 0;

    const income = Math.max(0, taxable - socialDeducted - costs - authorsCosts);
    const taxBase = toFullZl(income);
    const advance = monthlyAdvance(taxBase, baseSoFar, rates, input.pit2 ?? true);
    baseSoFar += taxBase;

    const net = salary + cashBonuses + sickPay + allowance - social - health - advance - ppkEmployee;

    const employerPension = ofRate(capped, rates.pensionEmployer);
    const employerDisability = ofRate(capped, rates.disabilityEmployer);
    const accident = ofRate(zusBase, accidentRate);
    // Labour Fund and FGŚP: not due when the base is below the minimum wage.
    const laborFund = zusBase >= rates.minWage ? ofRate(zusBase, rates.laborFund) : 0;
    const fgsp = ofRate(zusBase, rates.fgsp);
    const employer: EmployerPart = {
      pension: employerPension,
      disability: employerDisability,
      accident,
      laborFund,
      fgsp,
      ppk: ppkEmployer,
      total: employerPension + employerDisability + accident + laborFund + fgsp + ppkEmployer,
    };

    const working = cal.employee;
    const sickWorking = sick.working[m]!;
    months.push({
      month: m,
      salary,
      cashBonuses,
      inKind,
      zusBase,
      overLimit: zusBase - capped,
      pension,
      disability,
      sicknessContribution,
      social,
      sickPay,
      allowance,
      healthBase,
      health,
      ppkEmployee,
      ppkEmployer,
      revenue,
      exempt,
      costs,
      authorsCosts,
      socialDeducted,
      income,
      taxBase,
      advance,
      net,
      employer,
      employerCost: zusBase + sickPay + employer.total,
      days: {
        working,
        vacation,
        sick: sickCal,
        sickWorking,
        worked: Math.max(0, working - vacation - sickWorking),
        sickPayDays,
        allowanceDays,
      },
    });
  }

  const total = sumMonths(months);
  const annualTax = annualScaleTax(total.income, rates);
  const settlement = annualTax - total.advance;
  const netYear = total.net - settlement;
  return {
    months,
    total,
    annualTax,
    settlement,
    netYear,
    netMonthly: Math.round(netYear / 12),
    sickBase,
    days: {
      working: sum(months.map((m) => m.days.working)),
      vacation: sum(months.map((m) => m.days.vacation)),
      sickWorking: sum(months.map((m) => m.days.sickWorking)),
      worked: sum(months.map((m) => m.days.worked)),
    },
  };
}

const SUMMED = [
  "salary", "cashBonuses", "inKind", "zusBase", "overLimit", "pension", "disability",
  "sicknessContribution", "social", "sickPay", "allowance", "healthBase", "health", "ppkEmployee",
  "ppkEmployer", "revenue", "exempt", "costs", "authorsCosts", "socialDeducted", "income", "taxBase",
  "advance", "net", "employerCost",
] as const;
const EMPLOYER = ["pension", "disability", "accident", "laborFund", "fgsp", "ppk", "total"] as const;

function sumMonths(months: UopMonth[]): UopYear["total"] {
  const total = {} as Record<(typeof SUMMED)[number], Money>;
  for (const k of SUMMED) total[k] = sum(months.map((m) => m[k]));
  const employer = {} as EmployerPart;
  for (const k of EMPLOYER) employer[k] = sum(months.map((m) => m.employer[k]));
  return { ...total, employer };
}
