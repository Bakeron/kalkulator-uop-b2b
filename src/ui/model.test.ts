import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { defaultB2bInput } from "../calc/b2b";
import { b2bForUopEqual, uopForB2bEqual } from "../calc/compare";
import { loadRates, type RatesFile } from "../calc/rates";
import { defaultUopInput } from "../calc/uop";
import { b2bBreakdown, belowMinWage, calculator, defaultScenario, profitChart, hasOthers, mainResult, monthRows, offersOf, uopBreakdown } from "./model";

const rates = loadRates(rates2026 as RatesFile);

describe("offersOf", () => {
  it("default scenario gives the default inputs of the calculation module", () => {
    const s = defaultScenario();
    const o = offersOf(s, rates);
    expect(o.uop.uop).toEqual({ ...defaultUopInput(s.uopGross), vacationByMonth: o.uop.uop!.vacationByMonth });
    expect(o.b2b.b2b).toEqual({ ...defaultB2bInput(s.b2bRate, rates.year), clients: "jeden" });
    expect(o.uop.extraJobs).toEqual([]);
    expect(o.uop.civil).toEqual([]);
    expect(o.uop.b2b).toBeNull();
    expect(hasOthers(s)).toBe(false);
  });

  it("passes the options of every group", () => {
    const s = defaultScenario();
    s.uop = { ...s.uop, ppk: false, authors: true, creativePercent: 60, benefits: s.uop.benefits.map((b) => ({ ...b, on: b.kind === "trzynastka" })) };
    s.b2b = { ...s.b2b, startDate: "2025-03-01", contributionHoliday: 7, ryczaltRate: 850, formerEmployer: true, paidDaysOff: 5 };
    s.vat = "zagranica";
    s.sickKind = "ciaza-wypadek";
    s.over50 = true;
    const o = offersOf(s, rates);
    expect(o.uop.uop!.ppk).toBe(false);
    expect(o.uop.uop!.authors).toEqual({ enabled: true, creativePercent: 60 });
    expect(o.uop.uop!.benefits).toEqual([{ kind: "trzynastka", amount: 1_200_000, month: 2, cash: true }]);
    expect(o.uop.uop!.sickness).toMatchObject({ kind: "ciaza-wypadek", over50: true });
    expect(o.b2b.b2b).toMatchObject({ startDate: "2025-03-01", contributionHoliday: 7, ryczaltRate: 850, formerEmployer: true, paidDaysOff: 5, vat: "zagranica" });
  });

  it("counts the other contracts with both offers; the side business only with the UoP", () => {
    const s = defaultScenario();
    s.extra = { job: 500_000, zlecenie: { amount: 200_000, sameEmployer: true, voluntarySocial: false }, dzielo: { amount: 100_000, authors: false }, sideBusiness: 300_000 };
    const o = offersOf(s, rates);
    expect(hasOthers(s)).toBe(true);
    expect(o.uop.extraJobs.map((j) => j.gross)).toEqual([500_000]);
    // On the B2B side the second job is the main one (PIT-2 filed there).
    expect(o.b2b.uop!.gross).toBe(500_000);
    expect(o.uop.civil.map((c) => [c.kind, c.sameEmployer, c.authors])).toEqual([["zlecenie", true, false], ["dzielo", false, false]]);
    // Without the employment contract there is no "same employer".
    expect(o.b2b.civil[0]!.sameEmployer).toBe(false);
    expect(o.uop.b2b!.rate.amount).toBe(300_000);
  });
});

describe("breakdown and months", () => {
  it("12 months plus the yearly return give the net of the year", () => {
    const s = defaultScenario();
    s.extra = { ...s.extra, zlecenie: { amount: 200_000, sameEmployer: false, voluntarySocial: false } };
    const r = mainResult(s, rates);
    const rows = monthRows(r.comparison.uop, r.b2bShown);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((a, x) => a + x.vacation, 0)).toBe(26);
    expect(rows.reduce((a, x) => a + x.sick, 0)).toBe(10);
    // Net of the months is close to the year (the difference is the yearly return).
    const uopMonths = rows.reduce((a, x) => a + x.uopNet, 0);
    expect(Math.abs(r.comparison.uop.netYear - uopMonths)).toBeLessThan(r.comparison.uop.netYear * 0.05);
  });

  it("the breakdown has costs only on B2B and the net of the year", () => {
    const r = mainResult(defaultScenario(), rates);
    const uop = uopBreakdown(r.comparison.uop);
    const b2b = b2bBreakdown(r.b2bShown);
    expect(uop.parts.map((p) => p.key)).toEqual(["zus", "zdrowotna", "pit", "ppk", "netto"]);
    expect(b2b.parts.map((p) => p.key)).toEqual(["koszty", "zus", "zdrowotna", "pit", "netto"]);
    expect(b2b.parts.at(-1)!.amount).toBe(Math.round(r.b2bShown.netYear / 12));
    expect(b2b.vat).toBeGreaterThan(0);
  });
});

describe("calculator", () => {
  it("keeps the scales while only the two amounts change", () => {
    const calc = calculator(rates);
    const s = defaultScenario();
    const first = calc(s);
    expect(first.result).toEqual(mainResult(s, rates));
    const amounts = calc({ ...s, uopGross: 1_300_000, b2bRate: 1_600_000 });
    expect(amounts.model).toBe(first.model);
    expect(amounts.result.comparison.uop.uop!.months[0]!.salary).toBe(1_300_000);
    const other = calc({ ...s, sickDays: 0 });
    expect(other.model).not.toBe(first.model);
    // A much higher offer moves the top of the scale - new scales.
    const high = calc({ ...s, sickDays: 0, uopGross: 6_000_000 });
    expect(high.model).not.toBe(other.model);
    expect(high.model.max).toBeGreaterThan(other.model.max);
  });
});

describe("one amount known (plan A26)", () => {
  it("both known: the amounts as typed, nothing computed", () => {
    const r = mainResult(defaultScenario(), rates);
    expect(r.derived).toBeNull();
    expect(r.amounts).toEqual({ uopGross: 1_200_000, b2bRate: 1_500_000 });
  });

  it("only UoP: the B2B rate is computed (the typed one does not count) and the comparison uses it", () => {
    const s = { ...defaultScenario(), known: "uop" as const };
    const r = mainResult(s, rates);
    const rate = b2bForUopEqual(offersOf(s, rates), rates).amount!;
    expect(r.derived).toEqual({ side: "b2b", amount: rate });
    expect(r.amounts.b2bRate).toBe(rate);
    expect(r.comparison.b2bBest.b2b!.months[0]!.revenue).toBeGreaterThan(0);
    expect(mainResult({ ...s, b2bRate: 99_900 }, rates)).toEqual(r);
    // PPK is on by default, so B2B has to give more on hand than the UoP - about the extras.
    expect(r.diffMonthly).toBeGreaterThan(0);
    expect(Math.abs(r.diffMonthly - r.extrasMonthly.uop)).toBeLessThanOrEqual(1_000);
  });

  it("only B2B: the UoP gross is computed and the scales fit it", () => {
    const s = { ...defaultScenario(), known: "b2b" as const, b2bRate: 6_000_000 };
    const r = mainResult(s, rates);
    const gross = uopForB2bEqual(offersOf(s, rates), rates).amount!;
    expect(r.derived).toEqual({ side: "uop", amount: gross });
    expect(r.amounts.uopGross).toBe(gross);
    expect(calculator(rates)(s).model.max).toBeGreaterThanOrEqual(gross);
  });

  it("pension contributions of both sides, average month", () => {
    const r = mainResult(defaultScenario(), rates);
    expect(r.pensionMonthly.uop).toBeGreaterThan(r.pensionMonthly.b2b);
    expect(r.pensionMonthly.b2b).toBeGreaterThanOrEqual(0);
  });
});

describe("profitChart", () => {
  it("B2B over UoP around the offer and the break-even, zero at the break-even", () => {
    const { result, model } = calculator(rates)(defaultScenario());
    const uopNet = result.comparison.uop.netYear;
    const chart = profitChart(model, uopNet, 1_500_000, result.b2bNeeded);
    expect(chart.from).toBe(Math.floor((result.b2bNeeded! * 0.5) / 100_000) * 100_000);
    expect(chart.to).toBe(Math.ceil((1_500_000 * 1.5) / 100_000) * 100_000);
    expect(chart.points[0]!.rate).toBe(chart.from);
    expect(chart.points.at(-1)!.rate).toBe(chart.to);
    // The offer's point is the difference of the answer.
    const offer = chart.points.find((p) => p.rate === 1_500_000)!;
    expect(Math.abs(offer.diff - result.diffMonthly)).toBeLessThanOrEqual(1);
    expect(offer.form).toBe(result.formShown);
    // Below the break-even B2B gives less, above it more.
    const even = result.b2bNeeded!;
    expect(chart.points.filter((p) => p.rate < even - 100_000).every((p) => p.diff < 0)).toBe(true);
    expect(chart.points.filter((p) => p.rate > even + 100_000).every((p) => p.diff > 0)).toBe(true);
  });

  it("without a break-even spans around the offer, at least 5 000 zł", () => {
    const { result, model } = calculator(rates)(defaultScenario());
    const chart = profitChart(model, result.comparison.uop.netYear, 100_000, null);
    expect(chart.from).toBe(0);
    expect(chart.to).toBe(500_000);
    expect(chart.points).toHaveLength(6);
  });
});

describe("belowMinWage", () => {
  it("remarks a full-time salary below the minimum wage of the year, not at or above it", () => {
    expect(rates.minWage).toBe(480_600);
    expect(belowMinWage(480_600, rates.minWage, 2026)).toBeNull();
    expect(belowMinWage(1_200_000, rates.minWage, 2026)).toBeNull();
    const note = belowMinWage(300_000, rates.minWage, 2026)!;
    expect(note).toContain("płaca minimalna na 2026 rok");
    expect(note).toMatch(/4\s806\szł/);
    expect(belowMinWage(0, rates.minWage, 2026)).not.toBeNull();
  });
});
