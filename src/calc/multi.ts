/**
 * Several contracts of one person at the same time (assumption A1 "Kilka umów naraz"): the main
 * employment contract with a second one at another employer, a contract of mandate (zlecenie) or a
 * contract for a specific work (dzieło) at another company or at the same employer, a business next
 * to the job - and the one yearly return of all of them on the scale, with the spouse and the
 * child relief. Pure functions: input + rates -> result with every intermediate amount.
 */
import { calculateB2b, TAX_FORMS, type B2bInput, type B2bYear, type TaxForm } from "./b2b";
import { fraction, ofRate, sum, toFullZl, type Money } from "./money";
import type { Rates } from "./rates";
import { annualScaleTax } from "./tax";
import { calculateUop, type EmployerPart, type UopInput, type UopYear } from "./uop";

export type CivilKind = "zlecenie" | "dzielo";

export interface CivilContract {
  kind: CivilKind;
  /** Gross amount paid in a month in grosze. */
  amount: Money;
  /** Months 0-11 in which it is paid. */
  months: number[];
  /**
   * With the employer of the main employment contract: for ZUS it is a part of the job
   * (ustawa systemowa art. 8 ust. 2a) - contributions as from the employment contract.
   */
  sameEmployer: boolean;
  /** 50% author's costs instead of 20% (art. 22 ust. 9 pkt 3). */
  authors: boolean;
  /**
   * Zlecenie at another company while the job gives at least the minimum wage: social
   * contributions are voluntary (art. 9 ust. 1) - paid only when this is on.
   */
  voluntarySocial: boolean;
  /** Voluntary sickness insurance on a zlecenie with social contributions. */
  voluntarySickness: boolean;
  /** A pupil or student under 26 on a zlecenie at another company: no ZUS, no health. */
  studentUnder26: boolean;
}

/** How ZUS treats a civil contract in a month. */
export type CivilZus = "jak-etat" | "obowiazkowe" | "dobrowolne" | "brak";

export interface CivilMonth {
  month: number;
  revenue: Money;
  zus: CivilZus;
  pension: Money;
  disability: Money;
  sickness: Money;
  social: Money;
  health: Money;
  ppkEmployee: Money;
  ppkEmployer: Money;
  exempt: Money;
  costs: Money;
  /** Author's costs - a part of `costs`. */
  authorsCosts: Money;
  socialDeducted: Money;
  income: Money;
  /** Advance 12% (joined to the yearly return) or the flat 12% tax of a small contract (final). */
  advance: Money;
  flatTax: Money;
  net: Money;
  employer: EmployerPart;
  employerCost: Money;
}

export interface CivilYear {
  contract: CivilContract;
  months: CivilMonth[];
  /** Small contract up to the limit: flat tax, outside the yearly return. */
  small: boolean;
  total: Omit<CivilMonth, "month" | "zus" | "employer"> & { employer: EmployerPart };
}

export interface Family {
  /** Married for the whole year. */
  married: boolean;
  /** Spouse's income of the year on the scale (after costs and social contributions). */
  spouseIncome: Money;
  /** Joint return with the spouse (art. 6 ust. 2) - off by default. */
  joint: boolean;
  /** Children for the child relief (art. 27f) - 0 by default. */
  children: number;
}

export interface CombinedInput {
  /** The main employment contract (PIT-2 filed here). `null` = only a business. */
  uop: UopInput | null;
  /** Further employment contracts at other employers. */
  extraJobs: UopInput[];
  civil: CivilContract[];
  b2b: B2bInput | null;
  family: Family;
}

export type CombinedWarning =
  | "wspolne-niedostepne"
  | "ulga-na-dzieci-ponad-limit"
  | "koszty-kilku-etatow"
  | "zlecenie-obowiazkowy-zus"
  | "dzielo-u-pracodawcy";

export interface YearlyReturn {
  /** All income on the scale: jobs, civil contracts, business on the scale, the allowance. */
  scaleIncome: Money;
  /** Employee costs above the annual limit of several jobs, added back to the income. */
  costsExcess: Money;
  /** Tax of the scale income alone. */
  scaleTax: Money;
  jointAllowed: boolean;
  /** Joint return used (it gives less tax than two separate ones). */
  jointUsed: boolean;
  /** Tax of both spouses together (0 without the joint return). */
  jointTax: Money;
  /** Tax the household saves with the joint return. */
  jointSaving: Money;
  childRelief: Money;
  /** The relief taken off the tax and the unused part paid back (up to the contributions). */
  childReliefUsed: Money;
  childRefund: Money;
  /** Tax outside the scale (19%, ryczałt, IP Box). */
  separateTax: Money;
  /** Final flat tax of small contracts (already withheld, outside the return). */
  flatTax: Money;
  /** Advances paid during the year by all payers and by the business. */
  advances: Money;
  /** Tax of the year after the reliefs (without the flat tax). */
  tax: Money;
  /** + to pay with the return, - refund (the child refund included). */
  settlement: Money;
}

export interface CombinedYear {
  /** Form of tax of the business, `null` without one. */
  form: TaxForm | null;
  /** `false` = the form cannot be used (former employer). */
  available: boolean;
  uop: UopYear | null;
  extraJobs: UopYear[];
  civil: CivilYear[];
  b2b: B2bYear | null;
  yearly: YearlyReturn;
  netYear: Money;
  netMonthly: Money;
  /** What all employers and clients pay for the person in the year (without VAT). */
  payersCost: Money;
  warnings: CombinedWarning[];
}

export interface CombinedComparison {
  forms: Record<TaxForm, CombinedYear>;
  best: TaxForm;
  ipBoxBetter: boolean;
}

/** No family options - assumption A1 (joint return and child relief unchecked). */
export function defaultFamily(): Family {
  return { married: false, spouseIncome: 0, joint: false, children: 0 };
}

/** Default civil contract: zlecenie at another company every month, social contributions not paid. */
export function defaultCivil(amount: Money, kind: CivilKind = "zlecenie"): CivilContract {
  return {
    kind,
    amount,
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    sameEmployer: false,
    authors: kind === "dzielo",
    voluntarySocial: false,
    voluntarySickness: false,
    studentUnder26: false,
  };
}

const NO_EMPLOYER: EmployerPart = { pension: 0, disability: 0, accident: 0, laborFund: 0, fgsp: 0, ppk: 0, total: 0 };

/** Running state shared by all contracts: one 30x limit, one "zero PIT" limit, one author's limit. */
interface Shared {
  limitLeft: Money;
  zeroPitLeft: Money;
  authorsLeft: Money;
}

/** How ZUS treats the contract in a month with the given base of the employment contracts. */
export function civilZus(contract: CivilContract, jobsBase: Money, hasJob: boolean, rates: Rates): CivilZus {
  if (contract.sameEmployer && hasJob) return "jak-etat";
  if (contract.kind === "dzielo" || contract.studentUnder26) return "brak";
  if (jobsBase >= rates.minWage) return contract.voluntarySocial ? "dobrowolne" : "brak";
  return "obowiazkowe";
}

/**
 * One civil contract for the year. `jobsBase` = base of all employment contracts in each month
 * (decides whether ZUS from a zlecenie is voluntary and whether the Labour Fund is due).
 */
export function calculateCivil(
  contract: CivilContract,
  rates: Rates,
  jobsBase: readonly Money[],
  hasJob: boolean,
  options: { ppk: boolean; zeroPit: boolean; accidentRate: number | null },
  shared: Shared,
): CivilYear {
  const small = !contract.sameEmployer && contract.amount <= rates.smallContractLimit;
  const months: CivilMonth[] = [];
  const lowestRate = rates.pitScale[0]!.rate;
  for (let m = 0; m < 12; m++) {
    const revenue = contract.months.includes(m) ? contract.amount : 0;
    const zus = revenue === 0 ? "brak" : civilZus(contract, jobsBase[m]!, hasJob, rates);
    const paysSocial = zus !== "brak";
    const capped = paysSocial ? Math.min(revenue, shared.limitLeft) : 0;
    shared.limitLeft -= capped;
    const pension = ofRate(capped, rates.pensionEmployee);
    const disability = ofRate(capped, rates.disabilityEmployee);
    const sickness =
      zus === "jak-etat" || (paysSocial && contract.voluntarySickness) ? ofRate(revenue, rates.sickness) : 0;
    const social = pension + disability + sickness;
    // Health 9% on every zlecenie (not of a student under 26) and on a contract with the employer.
    const healthDue = revenue > 0 && (zus === "jak-etat" || (contract.kind === "zlecenie" && !contract.studentUnder26));
    const health = healthDue ? ofRate(revenue - social, rates.health) : 0;
    const ppk = zus === "jak-etat" && options.ppk;
    const ppkEmployee = ppk ? ofRate(revenue, rates.ppkEmployee) : 0;
    const ppkEmployer = ppk ? ofRate(revenue, rates.ppkEmployer) : 0;

    // Tax: "zero PIT" covers a zlecenie (not dzieło); costs 20% or 50% of revenue after social.
    const taxRevenue = revenue + ppkEmployer;
    const exempt = contract.kind === "zlecenie" && options.zeroPit ? Math.min(taxRevenue, shared.zeroPitLeft) : 0;
    shared.zeroPitLeft -= exempt;
    const taxable = taxRevenue - exempt;
    const socialDeducted = taxRevenue === 0 ? 0 : fraction(social, taxable, taxRevenue);
    const afterSocial = taxable - socialDeducted;
    let costs = 0;
    let authorsCosts = 0;
    if (contract.authors) {
      authorsCosts = Math.min(shared.authorsLeft, fraction(afterSocial, 1, 2));
      shared.authorsLeft -= authorsCosts;
      costs = authorsCosts;
    } else {
      costs = ofRate(afterSocial, rates.civilCostsRate);
    }
    const income = small ? 0 : afterSocial - costs;
    // Small contract: flat 12% of revenue after social contributions, no costs (art. 30 ust. 1
    // pkt 5a); otherwise an advance of the lowest scale rate without the tax-reducing amount.
    const flatTax = small && revenue > 0 ? toFullZl(ofRate(toFullZl(afterSocial), lowestRate)) : 0;
    const advance = small ? 0 : toFullZl(ofRate(toFullZl(income), lowestRate));

    const accident = paysSocial ? ofRate(capped, options.accidentRate ?? rates.accident) : 0;
    const employerPension = ofRate(capped, rates.pensionEmployer);
    const employerDisability = ofRate(capped, rates.disabilityEmployer);
    const obligatory = zus === "jak-etat" || zus === "obowiazkowe";
    const fundBase = zus === "jak-etat" ? jobsBase[m]! + revenue : revenue;
    const laborFund = obligatory && fundBase >= rates.minWage ? ofRate(revenue, rates.laborFund) : 0;
    const fgsp = obligatory ? ofRate(revenue, rates.fgsp) : 0;
    const employer: EmployerPart = {
      pension: employerPension,
      disability: employerDisability,
      accident,
      laborFund,
      fgsp,
      ppk: ppkEmployer,
      total: employerPension + employerDisability + accident + laborFund + fgsp + ppkEmployer,
    };
    months.push({
      month: m,
      revenue,
      zus,
      pension,
      disability,
      sickness,
      social,
      health,
      ppkEmployee,
      ppkEmployer,
      exempt,
      costs: small ? 0 : costs,
      authorsCosts: small ? 0 : authorsCosts,
      socialDeducted,
      income,
      advance,
      flatTax,
      net: revenue - social - health - ppkEmployee - advance - flatTax,
      employer,
      employerCost: revenue + employer.total,
    });
  }
  const keys = [
    "revenue", "pension", "disability", "sickness", "social", "health", "ppkEmployee", "ppkEmployer",
    "exempt", "costs", "authorsCosts", "socialDeducted", "income", "advance", "flatTax", "net", "employerCost",
  ] as const;
  const total = {} as Record<(typeof keys)[number], Money>;
  for (const k of keys) total[k] = sum(months.map((x) => x[k]));
  const employer = { ...NO_EMPLOYER };
  for (const k of Object.keys(NO_EMPLOYER) as (keyof EmployerPart)[]) {
    employer[k] = sum(months.map((x) => x.employer[k]));
  }
  return { contract, months, small, total: { ...total, employer } };
}

/** Child relief of the year (art. 27f): 1st and 2nd child, 3rd, 4th and next. */
export function childRelief(children: number, rates: Rates): Money {
  let total = 0;
  for (let i = 0; i < children; i++) total += rates.childRelief[Math.min(i, rates.childRelief.length - 1)]!;
  return total;
}

/**
 * Joint return available: no business, or a business on the scale - also IP Box when it works on
 * the scale (former employer); liniowy and ryczałt exclude it (art. 6 ust. 8).
 */
function jointAllowedFor(b2b: B2bYear | null, input: B2bInput | null): boolean {
  return b2b === null || b2b.form === "skala" || (b2b.form === "ipbox" && input!.formerEmployer);
}

/** Usage of the shared limits by one job in each month. */
interface Usage {
  limit: Money[];
  zeroPit: Money[];
  authors: Money[];
}

function usageOf(year: UopYear): Usage {
  return {
    limit: year.months.map((m) => m.zusBase - m.overLimit),
    zeroPit: year.months.map((m) => m.exempt),
    authors: year.months.map((m) => m.authorsCosts),
  };
}

/**
 * All employment contracts of the person with the shared annual limits (30x, "zero PIT",
 * author's costs) used up in time order: in a month the earlier job goes first, a later job
 * counts only up to the month before. Each job sees the others from the previous round, so the
 * rounds stop when nothing changes (at most one round per month).
 */
export function calculateJobs(jobs: readonly UopInput[], rates: Rates): UopYear[] {
  // PIT-2 only with the main employer unless the input says otherwise.
  const inputs = jobs.map((job, i) => ({ ...job, pit2: job.pit2 ?? i === 0 }));
  let years = inputs.map((job) => calculateUop(job, rates));
  if (years.length < 2) return years;
  for (let round = 0; round < 13; round++) {
    const usage = years.map(usageOf);
    const next = inputs.map((job, i) => {
      const seen = (k: keyof Usage) =>
        Array.from({ length: 12 }, (_, m) =>
          sum(usage.map((u, j) => (j < i ? u[k][m]! : j > i && m > 0 ? u[k][m - 1]! : 0))),
        );
      return calculateUop(job, rates, { zusLimitUsed: seen("limit"), zeroPitUsed: seen("zeroPit"), authorsUsed: seen("authors") });
    });
    const stable = next.every((y, i) => JSON.stringify(usageOf(y)) === JSON.stringify(usage[i]));
    years = next;
    if (stable) break;
  }
  return years;
}

/**
 * The person's year with all their contracts and, with a business, one form of its tax. Civil
 * contracts use what the jobs left of the annual limits (by the whole year - the totals are the
 * same as ZUS and the tax office settle them, only the split between the months is simplified).
 */
export function calculateCombined(input: CombinedInput, rates: Rates, form: TaxForm = "skala"): CombinedYear {
  const jobs = [...(input.uop ? [input.uop] : []), ...input.extraJobs];
  const jobYears = calculateJobs(jobs, rates);
  const jobsBase = Array.from({ length: 12 }, (_, m) => sum(jobYears.map((y) => y.months[m]!.zusBase)));
  const used = (pick: (mo: UopYear["months"][number]) => Money) => sum(jobYears.flatMap((y) => y.months.map(pick)));

  // What is left of the annual limits after the jobs (a simplification: by the whole year).
  const shared: Shared = {
    limitLeft: Math.max(0, rates.zusAnnualLimit - used((mo) => mo.zusBase - mo.overLimit)),
    zeroPitLeft: input.uop?.zeroPit ? Math.max(0, rates.zeroPitLimit - used((mo) => mo.exempt)) : 0,
    authorsLeft: Math.max(0, rates.authorsCostsLimit - used((mo) => mo.authorsCosts)),
  };
  const main = input.uop;
  const civil = input.civil.map((c) =>
    calculateCivil(c, rates, jobsBase, main !== null, { ppk: main?.ppk ?? false, zeroPit: main?.zeroPit ?? false, accidentRate: main?.accidentRate ?? null }, shared),
  );

  // A business next to a job with at least the minimum wage pays only the health contribution.
  const b2bInput: B2bInput | null = input.b2b
    ? { ...input.b2b, otherTitle: main ? main.gross >= rates.minWage : (input.b2b.otherTitle ?? false) }
    : null;
  const b2b = b2bInput ? calculateB2b(b2bInput, rates, form) : null;

  const warnings: CombinedWarning[] = [];
  if (civil.some((c) => c.months.some((x) => x.zus === "obowiazkowe"))) warnings.push("zlecenie-obowiazkowy-zus");
  if (civil.some((c) => c.contract.kind === "dzielo" && c.contract.sameEmployer && main)) warnings.push("dzielo-u-pracodawcy");

  // Yearly return: everything on the scale together, the threshold counted once.
  const jobCosts = sum(jobYears.map((y) => y.total.costs));
  const costsLimit = jobs.some((j) => j.commuter) ? rates.employeeCostsMultiLimitCommuter : rates.employeeCostsMultiLimit;
  const costsExcess = jobs.length > 1 ? Math.max(0, jobCosts - costsLimit) : 0;
  if (costsExcess > 0) warnings.push("koszty-kilku-etatow");
  const scaleIncome =
    sum(jobYears.map((y) => y.total.income)) +
    sum(civil.map((c) => c.total.income)) +
    (b2b?.scaleIncome ?? 0) +
    costsExcess;
  const scaleTax = annualScaleTax(scaleIncome, rates);

  const { family } = input;
  const jointAllowed = family.married && jointAllowedFor(b2b, b2bInput);
  if (family.married && family.joint && !jointAllowed) warnings.push("wspolne-niedostepne");
  let jointTax = 0;
  let jointSaving = 0;
  let jointUsed = false;
  if (family.married && family.joint && jointAllowed) {
    jointTax = 2 * annualScaleTax(fraction(scaleIncome + family.spouseIncome, 1, 2), rates);
    const separate = scaleTax + annualScaleTax(family.spouseIncome, rates);
    jointUsed = jointTax < separate;
    jointSaving = jointUsed ? separate - jointTax : 0;
  }

  // Child relief: off the tax on the scale; one child only up to the income limit (scale and
  // liniowy, with the spouse's); the unused part paid back up to the contributions (ust. 8).
  let relief = childRelief(family.children, rates);
  const limitIncome = scaleIncome + (b2b?.linearIncome ?? 0) + (family.married ? family.spouseIncome : 0);
  const limit = family.married ? rates.childReliefIncomeLimitMarried : rates.childReliefIncomeLimitSingle;
  if (family.children === 1 && limitIncome > limit) {
    relief = 0;
    warnings.push("ulga-na-dzieci-ponad-limit");
  }
  // With the joint return the relief can also use the spouse's part of the joint tax.
  const childReliefUsed = Math.min(relief, jointUsed ? jointTax : scaleTax);
  const contributions =
    sum(jobYears.map((y) => y.total.social + y.total.health)) +
    sum(civil.filter((c) => !c.small).map((c) => c.total.social + c.total.health)) +
    (b2b?.scaleContributions ?? 0);
  const childRefund = Math.min(relief - childReliefUsed, contributions);

  const separateTax = b2b?.separateTax ?? 0;
  const flatTax = sum(civil.map((c) => c.total.flatTax));
  const advances =
    sum(jobYears.map((y) => y.total.advance)) +
    sum(civil.map((c) => c.total.advance)) +
    (b2b ? b2b.total.advance + b2b.total.allowanceAdvance : 0);
  // The household's saving from the joint return and the relief count on this person's side.
  const tax = separateTax + scaleTax - jointSaving - childReliefUsed;
  const settlement = tax - advances - childRefund;

  const netBefore =
    sum(jobYears.map((y) => y.total.net)) +
    sum(civil.map((c) => c.total.net)) +
    (b2b ? b2b.total.net - b2b.healthSettlement : 0);
  const netYear = netBefore - settlement;
  const payersCost =
    sum(jobYears.map((y) => y.total.employerCost)) + sum(civil.map((c) => c.total.employerCost)) + (b2b?.total.revenue ?? 0);

  return {
    form: b2b ? form : null,
    available: b2b ? b2b.available : true,
    uop: input.uop ? jobYears[0]! : null,
    extraJobs: input.uop ? jobYears.slice(1) : jobYears,
    civil,
    b2b,
    yearly: {
      scaleIncome,
      costsExcess,
      scaleTax,
      jointAllowed,
      jointUsed,
      jointTax,
      jointSaving,
      childRelief: relief,
      childReliefUsed,
      childRefund,
      separateTax,
      flatTax,
      advances,
      tax,
      settlement,
    },
    netYear,
    netMonthly: Math.round(netYear / 12),
    payersCost,
    warnings,
  };
}

/**
 * Every form of tax of the business with all the other contracts and the family, and the most
 * profitable available one (IP Box only flagged, as in `compareB2bForms`).
 */
export function compareCombined(input: CombinedInput, rates: Rates): CombinedComparison {
  const forms = Object.fromEntries(TAX_FORMS.map((f) => [f, calculateCombined(input, rates, f)])) as Record<TaxForm, CombinedYear>;
  let best: TaxForm = "skala";
  for (const f of ["liniowy", "ryczalt"] as const) {
    if (forms[f].available && forms[f].netYear > forms[best].netYear) best = f;
  }
  return { forms, best, ipBoxBetter: forms.ipbox.netYear > forms[best].netYear };
}
