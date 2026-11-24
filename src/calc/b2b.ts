/**
 * B2B contract (jednoosobowa działalność) - the whole year month by month for every form of tax:
 * revenue from the rate and the days invoiced, business costs with VAT, ZUS by its stages, health
 * contribution of each form, PIT advances and the yearly return, voluntary sickness insurance with
 * the allowance, the contribution holiday and the "former employer" trap.
 * Pure functions: input + rates -> result with every intermediate amount (for "skąd ta kwota").
 */
import { isBusinessDay, holidays, monthDays } from "./calendar";
import { fraction, ofRate, sum, toFullZl, type Bp, type Money } from "./money";
import type { Rates } from "./rates";
import { annualScaleTax, scaleTax } from "./tax";
import { defaultVacationPlan, SICK_PERCENT, sickDays, type SicknessKind } from "./uop";

export type TaxForm = "skala" | "liniowy" | "ryczalt" | "ipbox";
export const TAX_FORMS: readonly TaxForm[] = ["skala", "liniowy", "ryczalt", "ipbox"];

/**
 * VAT as it works in practice: a) active VAT payer with a client in Poland (the rate is net,
 * 23% VAT goes on top and to the tax office); b) a client company abroad (no Polish VAT on the
 * invoice - reverse charge), c) exempt (up to the revenue limit; no VAT deducted from costs).
 */
export type VatMode = "czynny" | "zagranica" | "zwolniony";

export type RateKind = "miesieczna" | "dzienna" | "godzinowa";

export interface B2bRate {
  kind: RateKind;
  /** Net amount (without VAT) per month, day or hour in grosze. */
  amount: Money;
  /** Hours invoiced per working day (hourly rate). */
  hoursPerDay: number;
}

/** A company car also used privately (75% costs, 50% VAT) or only for the business (100%). */
export type CostKind = "zwykly" | "auto-mieszany" | "auto-firmowy";

export interface CostItem {
  name: string;
  /** Net amount (without VAT) per occurrence in grosze. */
  amount: Money;
  /** VAT rate of the purchase in basis points (2300, 800, 500, 0). */
  vatRate: Bp;
  /** Month 0-11 for a one-off purchase; `null` = every month. */
  month: number | null;
  kind: CostKind;
  enabled: boolean;
}

/** ZUS stage on a given day (Prawo przedsiębiorców art. 18, ustawa systemowa art. 18a, 18c). */
export type ZusStage = "brak-firmy" | "ulga-na-start" | "preferencyjny" | "maly-zus-plus" | "pelny";

export interface B2bInput {
  rate: B2bRate;
  /** Day the business was (or will be) started, "YYYY-MM-DD". */
  startDate: string;
  zus: {
    /** Ulga na start - the first 6 months without social contributions (only health). */
    startRelief: boolean;
    /** Preferential contributions for the next 24 months (base 30% of the minimum wage). */
    preferential: boolean;
    /** Mały ZUS Plus after the preferential stage - needs the previous year's figures. */
    smallZusPlus: { enabled: boolean; prevRevenue: Money; prevIncome: Money; prevDays: number };
  };
  /** Voluntary sickness insurance - on by default (assumption A1). */
  voluntarySickness: boolean;
  /** Contribution holiday (wakacje składkowe): month 0-11 without social contributions, or `null`. */
  contributionHoliday: number | null;
  costs: CostItem[];
  vat: VatMode;
  /** Ryczałt rate in basis points; `null` = the usual rate for IT services from the rates file. */
  ryczaltRate: Bp | null;
  /** IP Box: share of the income that comes from qualified IP rights (percent, nexus included). */
  ipBox: { qualifiedPercent: number };
  /** Days off (not invoiced) taken in each month (12 numbers). */
  daysOffByMonth: number[];
  /** Paid days off in the B2B contract per year (default 0). */
  paidDaysOff: number;
  sickness: {
    /** Calendar days of sickness in the year, from the first day of `startMonth`. */
    days: number;
    startMonth: number;
    kind: SicknessKind;
  };
  /**
   * The client is a current or former employer and the work is the same as on the employment
   * contract (this or last year): no liniowy, no ryczałt, no ZUS reliefs (PIT art. 9a ust. 3,
   * ryczałt art. 8 ust. 2, Prawo przedsiębiorców art. 18, ustawa systemowa art. 18a, 18c).
   */
  formerEmployer: boolean;
  /** Own accident insurance rate in basis points; `null` = the default rate. */
  accidentRate: number | null;
  /**
   * Another insurance title at the same time - an employment contract paying at least the minimum
   * wage: from the business only the health contribution (ustawa systemowa art. 9 ust. 1), no
   * voluntary sickness insurance and no allowance from it. Missing = no other title.
   */
  otherTitle?: boolean;
  /** One client or several - one client is the usual case and the risk of hidden employment. */
  clients?: "jeden" | "kilku";
}

export interface B2bSocial {
  /** Base of the month after the cut for days without business or with the sickness allowance. */
  base: Money;
  pension: Money;
  disability: Money;
  sickness: Money;
  accident: Money;
  laborFund: Money;
  total: Money;
}

export interface B2bMonth {
  month: number;
  /** Stages of ZUS in this month (usually one, two when a stage ends inside the month). */
  stages: ZusStage[];
  /** Net revenue (without VAT) invoiced for the month. */
  revenue: Money;
  vatOutput: Money;
  vatInput: Money;
  /** VAT to pay to the tax office (negative = refund or carried on). */
  vatDue: Money;
  /** Money spent on the costs (net + VAT that cannot be deducted). */
  costsCash: Money;
  /** Tax-deductible costs (not used by ryczałt). */
  costsTax: Money;
  social: B2bSocial;
  /** Social contributions not paid thanks to the contribution holiday. */
  holidaySaved: Money;
  /** Income for the health contribution (revenue - costs - social contributions). */
  healthIncome: Money;
  health: Money;
  /** Health contribution deducted from the income (liniowy) or half of it from revenue (ryczałt). */
  healthDeduction: Money;
  /** Income (skala, liniowy, IP Box) or revenue (ryczałt) the advance is computed from. */
  taxBase: Money;
  advance: Money;
  /** Sickness allowance from ZUS and the tax advance ZUS takes from it. */
  allowance: Money;
  allowanceAdvance: Money;
  /** Money that stays after costs, contributions and taxes. */
  net: Money;
  days: {
    /** Monday-Friday without holidays in the month. */
    business: number;
    /** Business days on which the company exists. */
    active: number;
    daysOff: number;
    sickWorking: number;
    /** Days off and sick days paid by the contract (paid days off). */
    paid: number;
    /** Days invoiced (worked + paid days off). */
    invoiced: number;
    worked: number;
    sickCalendar: number;
    allowanceDays: number;
  };
}

/** Warning codes - the texts and sources live in the interface. */
export type B2bWarning =
  | "byly-pracodawca"
  | "ryczalt-bez-kosztow"
  | "limit-ryczaltu"
  | "limit-zwolnienia-vat"
  | "srodek-trwaly"
  | "maly-zus-plus-niedostepny"
  | "ip-box-ewidencja"
  | "chorobowe-bez-zasilku"
  | "jeden-klient";

export interface B2bYear {
  form: TaxForm;
  /** `false` = the form cannot be used (former employer) - shown, but never recommended. */
  available: boolean;
  months: B2bMonth[];
  total: {
    revenue: Money;
    vatOutput: Money;
    vatInput: Money;
    vatDue: Money;
    costsCash: Money;
    costsTax: Money;
    social: Money;
    holidaySaved: Money;
    healthIncome: Money;
    health: Money;
    healthDeduction: Money;
    advance: Money;
    allowance: Money;
    allowanceAdvance: Money;
    net: Money;
  };
  /** Tax of the year (business + the allowance on the scale) and the difference to the advances. */
  annualTax: Money;
  /** The part of the yearly return on the scale (joined with other contracts and the spouse). */
  scaleIncome: Money;
  /** Tax outside the scale: 19%, ryczałt, IP Box 5% (`annualTax` = this + the scale tax). */
  separateTax: Money;
  /** Income on liniowy - counts to the income limit of the child relief. */
  linearIncome: Money;
  /** Social and health contributions of the scale income - the cap of the child relief refund. */
  scaleContributions: Money;
  taxSettlement: Money;
  /** Health contribution of the year and the difference to the monthly payments (+ to pay). */
  annualHealth: Money;
  healthSettlement: Money;
  netYear: Money;
  netMonthly: Money;
  days: { business: number; daysOff: number; sickWorking: number; invoiced: number; worked: number };
  warnings: B2bWarning[];
}

export interface B2bComparison {
  forms: Record<TaxForm, B2bYear>;
  /** The best available of skala / liniowy / ryczałt. */
  best: TaxForm;
  /** IP Box when it gives more than `best` (needs separate records - shown with a warning). */
  ipBoxBetter: boolean;
}

const DAY = 86_400_000;

/** Typical costs for the default input: an accounting office. */
export function defaultCosts(): CostItem[] {
  return [{ name: "Księgowość", amount: 25_000, vatRate: 2300, month: null, kind: "zwykly", enabled: true }];
}

/**
 * Default input - assumption A1: monthly net rate, a new company from 1 January of the year with
 * ulga na start and preferential ZUS, voluntary sickness on, active VAT payer, accounting 250 zł,
 * the same 26 days off as on the employment contract (none of them paid), 10 sick days.
 */
export function defaultB2bInput(monthly: Money, year: number): B2bInput {
  return {
    rate: { kind: "miesieczna", amount: monthly, hoursPerDay: 8 },
    startDate: `${year}-01-01`,
    zus: {
      startRelief: true,
      preferential: true,
      smallZusPlus: { enabled: false, prevRevenue: 0, prevIncome: 0, prevDays: 365 },
    },
    voluntarySickness: true,
    contributionHoliday: null,
    costs: defaultCosts(),
    vat: "czynny",
    ryczaltRate: null,
    ipBox: { qualifiedPercent: 100 },
    daysOffByMonth: defaultVacationPlan(26),
    paidDaysOff: 0,
    sickness: { days: 10, startMonth: 1, kind: "zwykla" },
    formerEmployer: false,
    accidentRate: null,
  };
}

/** "YYYY-MM-DD" -> UTC milliseconds; an invalid date is an error of the caller. */
export function parseDate(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The same day `months` later (the last day of a shorter month: 31.08 + 6 = 28.02). */
export function addMonths(time: number, months: number): number {
  const d = new Date(time);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last));
}

export interface ZusPlan {
  start: number;
  /** First day after ulga na start (= start when not used). */
  reliefEnd: number;
  /** First day after the preferential stage (= reliefEnd when not used). */
  preferentialEnd: number;
  smallZusPlus: boolean;
  smallZusBase: Money;
  /** The input asked for Mały ZUS Plus, but the previous year does not allow it. */
  smallZusRefused: boolean;
}

/**
 * Stages of ZUS from the day of the start. Mały ZUS Plus (ustawa systemowa art. 18c): previous
 * year's revenue up to the limit and more than 60 days of business; the base is half of the
 * average monthly income (income x 30 / days of business), between the preferential and the
 * full base.
 */
export function zusPlan(input: B2bInput, rates: Rates): ZusPlan {
  const start = parseDate(input.startDate);
  const allowed = !input.formerEmployer;
  const reliefEnd = allowed && input.zus.startRelief ? addMonths(start, rates.startReliefMonths) : start;
  const preferentialEnd = allowed && input.zus.preferential ? addMonths(reliefEnd, rates.preferentialMonths) : reliefEnd;
  const szp = input.zus.smallZusPlus;
  const eligible = szp.prevRevenue <= rates.smallZusRevenueLimit && szp.prevDays > 60;
  const smallZusPlus = allowed && szp.enabled && eligible;
  const average = eligible ? fraction(szp.prevIncome, 30, szp.prevDays) : 0;
  const smallZusBase = Math.min(rates.fullBase, Math.max(rates.preferentialBase, fraction(average, 1, 2)));
  return {
    start,
    reliefEnd,
    preferentialEnd,
    smallZusPlus,
    smallZusBase,
    smallZusRefused: szp.enabled && !smallZusPlus,
  };
}

export function stageOn(plan: ZusPlan, time: number): ZusStage {
  if (time < plan.start) return "brak-firmy";
  if (time < plan.reliefEnd) return "ulga-na-start";
  if (time < plan.preferentialEnd) return "preferencyjny";
  return plan.smallZusPlus ? "maly-zus-plus" : "pelny";
}

/** Monthly base of a stage with social contributions (never called for the other stages). */
function stageBase(stage: ZusStage, plan: ZusPlan, rates: Rates): Money {
  if (stage === "preferencyjny") return rates.preferentialBase;
  if (stage === "maly-zus-plus") return plan.smallZusBase;
  return rates.fullBase;
}

/** Social contributions of the self-employed from the base of (a part of) a month. */
function contributions(base: Money, fullMonthBase: Money, stage: ZusStage, input: B2bInput, rates: Rates): Omit<B2bSocial, "base" | "total"> {
  return {
    pension: ofRate(base, rates.pensionEmployee + rates.pensionEmployer),
    disability: ofRate(base, rates.disabilityEmployee + rates.disabilityEmployer),
    sickness: input.voluntarySickness ? ofRate(base, rates.sickness) : 0,
    accident: ofRate(base, input.accidentRate ?? rates.accident),
    // Labour Fund: not on preferential contributions and not from a base below the minimum wage
    // (ustawa o rynku pracy art. 259).
    laborFund: stage !== "preferencyjny" && fullMonthBase >= rates.minWage ? ofRate(base, rates.laborFund) : 0,
  };
}

/** A cost item in one month: cash spent, tax cost, VAT deducted. */
function costOf(item: CostItem, vat: VatMode, rates: Rates): { cash: Money; tax: Money; vat: Money } {
  const vatAmount = ofRate(item.amount, item.vatRate);
  const payer = vat !== "zwolniony";
  const mixed = item.kind === "auto-mieszany";
  const deducted = !payer ? 0 : mixed ? ofRate(vatAmount, rates.carVatShare) : vatAmount;
  const cash = item.amount + vatAmount - deducted;
  return { cash, tax: mixed ? ofRate(cash, rates.carCostShare) : cash, vat: deducted };
}

/** Everything that does not depend on the form of tax. */
interface Common {
  plan: ZusPlan;
  months: Omit<B2bMonth, "health" | "healthDeduction" | "taxBase" | "advance" | "allowanceAdvance" | "net">[];
  /** Months in which the company exists (the minimum health contribution is due). */
  activeMonths: boolean[];
  warnings: B2bWarning[];
}

function common(input: B2bInput, rates: Rates): Common {
  const year = rates.year;
  const calendar = monthDays(year);
  const free = holidays(year);
  const sick = sickDays(year, input.sickness.startMonth, input.sickness.days);
  const plan = zusPlan(input, rates);
  // Sickness insurance runs from the first day with social contributions; the allowance is paid
  // after 90 days of it (ustawa zasiłkowa art. 4 ust. 1 pkt 2).
  const allowanceFrom = plan.reliefEnd + rates.voluntarySicknessWaitDays * DAY;
  const employeeSocial = rates.pensionEmployee + rates.disabilityEmployee + rates.sickness;
  const warnings: B2bWarning[] = [];
  let paidLeft = input.paidDaysOff;
  const months: Common["months"] = [];
  const activeMonths: boolean[] = [];

  for (let m = 0; m < 12; m++) {
    const cal = calendar[m]!;
    const sickCal = sick.calendar[m]!;
    const socialDays = new Map<ZusStage, number>();
    const stages: ZusStage[] = [];
    let active = 0;
    let activeCalendar = 0;
    let sickWorking = 0;
    let sickCalendar = 0;
    let allowanceDays = 0;
    let allowance = 0;

    for (let d = 1; d <= cal.calendar; d++) {
      const time = Date.UTC(year, m, d);
      const stage = stageOn(plan, time);
      if (stage === "brak-firmy") continue;
      if (!stages.includes(stage)) stages.push(stage);
      activeCalendar++;
      const sickDay = d <= sickCal;
      if (sickDay) sickCalendar++;
      if (isBusinessDay(year, m + 1, d, free)) {
        active++;
        if (sickDay) sickWorking++;
      }
      const insured = stage !== "ulga-na-start" && !input.otherTitle;
      // Days with the allowance: no social contributions for them (ustawa systemowa art. 18 ust. 7).
      if (sickDay && insured && input.voluntarySickness && time >= allowanceFrom) {
        const base = stageBase(stage, plan, rates);
        allowance += fraction(base - ofRate(base, employeeSocial), SICK_PERCENT[input.sickness.kind], 100 * 30);
        allowanceDays++;
      } else if (insured) {
        socialDays.set(stage, (socialDays.get(stage) ?? 0) + 1);
      }
    }
    activeMonths.push(activeCalendar > 0);

    // Social contributions: the base cut in proportion to the days (art. 18 ust. 7 and 8).
    const social: B2bSocial = { base: 0, pension: 0, disability: 0, sickness: 0, accident: 0, laborFund: 0, total: 0 };
    for (const [stage, days] of socialDays) {
      const full = stageBase(stage, plan, rates);
      const base = days === cal.calendar ? full : fraction(full, days, cal.calendar);
      const part = contributions(base, full, stage, input, rates);
      social.base += base;
      social.pension += part.pension;
      social.disability += part.disability;
      social.sickness += part.sickness;
      social.accident += part.accident;
      social.laborFund += part.laborFund;
    }
    social.total = social.pension + social.disability + social.sickness + social.accident + social.laborFund;
    // Contribution holiday: the state pays the social contributions of one month (from the lowest
    // base - here the declared base is always the lowest one); the health contribution stays.
    let holidaySaved = 0;
    if (input.contributionHoliday === m && social.total > 0) {
      holidaySaved = social.total;
      Object.assign(social, { pension: 0, disability: 0, sickness: 0, accident: 0, laborFund: 0, total: 0 });
    }

    // Days invoiced: days off and sick working days are not invoiced unless paid by the contract.
    const daysOff = Math.min(active, input.daysOffByMonth[m] ?? 0);
    const absent = Math.min(active, daysOff + sickWorking);
    const paid = Math.min(absent, paidLeft);
    paidLeft -= paid;
    const invoiced = active - absent + paid;
    const { kind, amount, hoursPerDay } = input.rate;
    const revenue =
      kind === "miesieczna"
        ? fraction(amount, invoiced, cal.business)
        : kind === "dzienna"
          ? amount * invoiced
          : fraction(amount, Math.round(hoursPerDay * 100) * invoiced, 100);

    let costsCash = 0;
    let costsTax = 0;
    let vatInput = 0;
    if (activeCalendar > 0) {
      for (const item of input.costs) {
        if (!item.enabled || (item.month !== null && item.month !== m)) continue;
        const c = costOf(item, input.vat, rates);
        costsCash += c.cash;
        costsTax += c.tax;
        vatInput += c.vat;
        if (item.month !== null && item.amount > rates.fixedAssetLimit && !warnings.includes("srodek-trwaly")) {
          warnings.push("srodek-trwaly");
        }
      }
    }
    const vatOutput = input.vat === "czynny" ? ofRate(revenue, rates.vatRate) : 0;

    months.push({
      month: m,
      stages,
      revenue,
      vatOutput,
      vatInput,
      vatDue: vatOutput - vatInput,
      costsCash,
      costsTax,
      social,
      holidaySaved,
      healthIncome: revenue - costsTax - social.total,
      allowance,
      days: {
        business: cal.business,
        active,
        daysOff,
        sickWorking,
        paid,
        invoiced,
        worked: active - absent,
        sickCalendar,
        allowanceDays,
      },
    });
  }

  if (input.formerEmployer) warnings.push("byly-pracodawca");
  if (plan.smallZusRefused) warnings.push("maly-zus-plus-niedostepny");
  if (input.vat === "zwolniony" && sum(months.map((x) => x.revenue)) > rates.vatExemptLimit) {
    warnings.push("limit-zwolnienia-vat");
  }
  if (input.clients === "jeden") warnings.push("jeden-klient");
  if (input.voluntarySickness && !input.otherTitle && sum(months.map((x) => x.days.sickCalendar)) > sum(months.map((x) => x.days.allowanceDays))) {
    warnings.push("chorobowe-bez-zasilku");
  }
  return { plan, months, activeMonths, warnings };
}

/** Health contribution on ryczałt: a fixed amount by the annual revenue (art. 81 ust. 2e-2f). */
export function ryczaltHealth(annualRevenue: Money, rates: Rates): Money {
  const [low, high] = rates.ryczaltHealthThresholds;
  const percent = annualRevenue <= low ? 60 : annualRevenue <= high ? 100 : 180;
  return ofRate(fraction(rates.ryczaltHealthAvgWage, percent, 100), rates.health);
}

/** Tax advance ZUS takes from the sickness allowance: the lowest rate of the scale, full złoty. */
function allowanceAdvance(allowance: Money, rates: Rates): Money {
  return toFullZl(ofRate(allowance, rates.pitScale[0]!.rate));
}

/** Annual result of the B2B contract in one form of tax. */
export function calculateB2b(input: B2bInput, rates: Rates, form: TaxForm, shared = common(input, rates)): B2bYear {
  // IP Box works on top of liniowy (or the scale when liniowy is not allowed): advances during the
  // year as usual, the 5% only in the yearly return.
  const mode: "skala" | "liniowy" | "ryczalt" =
    form === "ipbox" ? (input.formerEmployer ? "skala" : "liniowy") : form;
  // Health on IP Box income: 9% - the reading of art. 79 ust. 1 followed by ZUS (disputed, some
  // say 4,9% on liniowy).
  const healthRate = form === "liniowy" ? rates.healthLinear : rates.health;
  const ryczaltRate = input.ryczaltRate ?? rates.ryczaltItRate;
  const annualRevenueAfterSocial = sum(shared.months.map((x) => x.revenue - x.social.total));
  const ryczaltMonthly = ryczaltHealth(annualRevenueAfterSocial, rates);

  let cumulative = 0;
  let advancesPaid = 0;
  let deductionLeft = rates.linearHealthDeductionLimit;
  let ryczaltCarry = 0;
  let healthMinimums = 0;
  const months: B2bMonth[] = [];

  for (const base of shared.months) {
    const m = base.month;
    const active = shared.activeMonths[m]!;
    const minimum = m === 0 ? rates.healthMinJanuary : rates.healthMin;
    let health = 0;
    if (active && form === "ryczalt") health = ryczaltMonthly;
    else if (active) {
      healthMinimums += minimum;
      health = Math.max(minimum, ofRate(Math.max(0, base.healthIncome), healthRate));
    }

    let healthDeduction = 0;
    let taxBase = 0;
    let advance = 0;
    if (mode === "skala") {
      cumulative += base.healthIncome;
      taxBase = toFullZl(Math.max(0, cumulative));
      const due = Math.max(0, toFullZl(scaleTax(taxBase, rates.pitScale) - rates.taxReduction));
      advance = Math.max(0, due - advancesPaid);
    } else if (mode === "liniowy") {
      healthDeduction = Math.min(health, deductionLeft);
      deductionLeft -= healthDeduction;
      cumulative += base.healthIncome - healthDeduction;
      taxBase = toFullZl(Math.max(0, cumulative));
      advance = Math.max(0, toFullZl(ofRate(taxBase, rates.linearRate)) - advancesPaid);
    } else {
      // Ryczałt: monthly from revenue minus social contributions and half of the health
      // contribution (ryczałt art. 11 ust. 1 and 1c); what does not fit moves to next months.
      healthDeduction = fraction(health, 1, 2);
      const left = base.revenue - base.social.total - healthDeduction - ryczaltCarry;
      ryczaltCarry = Math.max(0, -left);
      taxBase = toFullZl(Math.max(0, left));
      advance = toFullZl(ofRate(taxBase, ryczaltRate));
    }
    advancesPaid += advance;

    const allowanceTax = allowanceAdvance(base.allowance, rates);
    const net = base.revenue - base.costsCash - base.social.total - health - advance + base.allowance - allowanceTax;
    months.push({ ...base, health, healthDeduction, taxBase, advance, allowanceAdvance: allowanceTax, net });
  }

  const total = {
    revenue: sum(months.map((x) => x.revenue)),
    vatOutput: sum(months.map((x) => x.vatOutput)),
    vatInput: sum(months.map((x) => x.vatInput)),
    vatDue: sum(months.map((x) => x.vatDue)),
    costsCash: sum(months.map((x) => x.costsCash)),
    costsTax: sum(months.map((x) => x.costsTax)),
    social: sum(months.map((x) => x.social.total)),
    holidaySaved: sum(months.map((x) => x.holidaySaved)),
    healthIncome: sum(months.map((x) => x.healthIncome)),
    health: sum(months.map((x) => x.health)),
    healthDeduction: sum(months.map((x) => x.healthDeduction)),
    advance: sum(months.map((x) => x.advance)),
    allowance: sum(months.map((x) => x.allowance)),
    allowanceAdvance: sum(months.map((x) => x.allowanceAdvance)),
    net: sum(months.map((x) => x.net)),
  };

  // Yearly return. On the scale the allowance joins the business income; on the other forms it
  // is taxed on the scale on its own (with the whole tax-reducing amount).
  const income = Math.max(0, total.healthIncome);
  let scaleIncome = total.allowance;
  let separateTax: Money;
  let linearIncome = 0;
  if (form === "ipbox") {
    const qualified = fraction(income, input.ipBox.qualifiedPercent, 100);
    const rest = income - qualified;
    const ipTax = toFullZl(ofRate(toFullZl(qualified), rates.ipBoxRate));
    if (mode === "skala") {
      scaleIncome += rest;
      separateTax = ipTax;
    } else {
      linearIncome = rest - Math.min(total.healthDeduction, rest);
      separateTax = ipTax + toFullZl(ofRate(toFullZl(linearIncome), rates.linearRate));
    }
  } else if (mode === "skala") {
    scaleIncome += income;
    separateTax = 0;
  } else if (mode === "liniowy") {
    linearIncome = Math.max(0, income - total.healthDeduction);
    separateTax = toFullZl(ofRate(toFullZl(linearIncome), rates.linearRate));
  } else {
    separateTax = total.advance;
  }
  const annualTax = separateTax + annualScaleTax(scaleIncome, rates);
  const taxSettlement = annualTax - total.advance - total.allowanceAdvance;

  // Health of the year (skala, liniowy, IP Box): the rate of the annual income, at least the sum of
  // the monthly minimums; ryczałt pays the amount of its threshold every month.
  const annualHealth =
    form === "ryczalt" ? total.health : Math.max(healthMinimums, ofRate(income, healthRate));
  const healthSettlement = annualHealth - total.health;

  const warnings = [...shared.warnings];
  if (form === "ryczalt" && total.costsTax > 0) warnings.push("ryczalt-bez-kosztow");
  if (form === "ryczalt" && total.revenue > rates.ryczaltLimit) warnings.push("limit-ryczaltu");
  if (form === "ipbox") warnings.push("ip-box-ewidencja");

  const netYear = total.net - taxSettlement - healthSettlement;
  return {
    form,
    available: !(input.formerEmployer && (form === "liniowy" || form === "ryczalt")),
    months,
    total,
    annualTax,
    scaleIncome,
    separateTax,
    linearIncome,
    scaleContributions: mode === "skala" ? total.social + annualHealth : 0,
    taxSettlement,
    annualHealth,
    healthSettlement,
    netYear,
    netMonthly: Math.round(netYear / 12),
    days: {
      business: sum(months.map((x) => x.days.business)),
      daysOff: sum(months.map((x) => x.days.daysOff)),
      sickWorking: sum(months.map((x) => x.days.sickWorking)),
      invoiced: sum(months.map((x) => x.days.invoiced)),
      worked: sum(months.map((x) => x.days.worked)),
    },
    warnings,
  };
}

/** All forms of tax and the most profitable one (assumption A1 "sama wskazuje najkorzystniejszą"). */
export function compareB2bForms(input: B2bInput, rates: Rates): B2bComparison {
  const shared = common(input, rates);
  const forms = Object.fromEntries(
    TAX_FORMS.map((form) => [form, calculateB2b(input, rates, form, shared)]),
  ) as Record<TaxForm, B2bYear>;
  let best: TaxForm = "skala";
  for (const form of ["liniowy", "ryczalt"] as const) {
    if (forms[form].available && forms[form].netYear > forms[best].netYear) best = form;
  }
  return { forms, best, ipBoxBetter: forms.ipbox.netYear > forms[best].netYear };
}

/**
 * The same rate per month, day and hour: a month is the average month of the year
 * (business days of the year / 12).
 */
export function convertRate(rate: B2bRate, to: RateKind, year: number): Money {
  const businessDays = sum(monthDays(year).map((m) => m.business));
  const hundredthsPerDay = Math.round(rate.hoursPerDay * 100);
  const daily =
    rate.kind === "dzienna"
      ? rate.amount
      : rate.kind === "miesieczna"
        ? fraction(rate.amount, 12, businessDays)
        : fraction(rate.amount, hundredthsPerDay, 100);
  if (to === "dzienna") return daily;
  if (to === "godzinowa") return rate.kind === "godzinowa" ? rate.amount : fraction(daily, 100, hundredthsPerDay);
  return rate.kind === "miesieczna" ? rate.amount : fraction(daily, businessDays, 12);
}
