/**
 * Comparison, break-even both ways, the company's view and the chart data - rules of 2026
 * (assumption A10: round trips, properties and hand-checked numbers).
 */
import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { defaultB2bInput, type B2bInput } from "./b2b";
import { monthDays } from "./calendar";
import {
  b2bDaysNeeded,
  b2bForUop,
  b2bForUopEqual,
  compareOffers,
  employerView,
  extrasYear,
  pensionYear,
  profitCurve,
  smallestReaching,
  spreadDays,
  uopForB2b,
  uopForB2bEqual,
  valueYear,
  type Offers,
} from "./compare";
import { zl } from "./money";
import { calculateCombined, defaultFamily, type CombinedInput } from "./multi";
import { loadRates, type RatesFile } from "./rates";
import { defaultUopInput, type UopInput } from "./uop";

const rates = loadRates(rates2026 as RatesFile);

function job(gross: number, change: Partial<UopInput> = {}): UopInput {
  return { ...defaultUopInput(zl(gross)), ppk: false, sickness: { days: 0, startMonth: 0, kind: "zwykla", over50: false }, ...change };
}

function business(monthly: number, change: Partial<B2bInput> = {}): B2bInput {
  return { ...defaultB2bInput(zl(monthly), 2026), startDate: "2020-01-01", ...change };
}

function side(change: Partial<CombinedInput>): CombinedInput {
  return { uop: null, extraJobs: [], civil: [], b2b: null, family: defaultFamily(), ...change };
}

function offers(gross: number, monthly: number, b2bChange: Partial<B2bInput> = {}): Offers {
  return { uop: side({ uop: job(gross) }), b2b: side({ b2b: business(monthly, b2bChange) }) };
}

describe("smallestReaching", () => {
  it("whole złoty, the first amount that reaches the target", () => {
    expect(smallestReaching((a) => a, 12_345, 1_000_000)).toBe(12_400);
    expect(smallestReaching((a) => a, 0, 1_000_000)).toBe(0);
    expect(smallestReaching((a) => 2 * a, 1_000_000, 10_000_000)).toBe(500_000);
  });

  it("null when even the highest amount is not enough", () => {
    expect(smallestReaching((a) => a, 2_000_000, 1_000_000)).toBeNull();
  });
});

describe("a) comparison", () => {
  const result = compareOffers(offers(10_000, 15_000), rates);

  it("difference = B2B in its best form minus UoP", () => {
    expect(result.b2bBest).toBe(result.b2b.forms[result.b2b.best]);
    expect(result.diffYear).toBe(result.b2bBest.netYear - result.uop.netYear);
    expect(result.diffMonthly).toBe(Math.round(result.diffYear / 12));
    expect(result.diffYear).toBeGreaterThan(0);
  });

  it("days: B2B that gives more needs fewer days to keep as much as the UoP", () => {
    // 26 days off on both sides, nothing paid on B2B (the UoP side here without sickness)
    expect(result.days.uopWorked).toBeGreaterThan(200);
    expect(result.days.b2bNeeded).not.toBeNull();
    expect(result.days.b2bNeeded!).toBeLessThan(result.days.b2bWorked);
  });

  it("days: null when even working every day is not enough", () => {
    const low = offers(20_000, 8000);
    const target = calculateCombined(low.uop, rates).netYear;
    expect(b2bDaysNeeded(low.b2b, target, rates)).toBeNull();
  });

  it("days needed really keep the target, one day less does not", () => {
    const o = offers(10_000, 15_000);
    const target = calculateCombined(o.uop, rates).netYear;
    const needed = b2bDaysNeeded(o.b2b, target, rates, "liniowy")!;
    const business = monthDays(2026).reduce((a, m) => a + m.business, 0);
    const net = (off: number) =>
      calculateCombined({ ...o.b2b, b2b: { ...o.b2b.b2b!, daysOffByMonth: spreadDays(off, 2026), sickness: o.b2b.b2b!.sickness } }, rates, "liniowy").netYear;
    // default sickness: 10 days from February take some working days too
    const off = business - needed - result.b2bBest.b2b!.days.sickWorking;
    expect(net(off)).toBeGreaterThanOrEqual(target);
    expect(net(off + 1)).toBeLessThan(target);
  });
});

describe("b) break-even both ways", () => {
  it("B2B for UoP 12 000 gross: the rate reaches the UoP net, 1 zł less does not", () => {
    const o = offers(12_000, 0);
    const { amount, target } = b2bForUop(o, rates);
    expect(amount).not.toBeNull();
    const net = (a: number) => {
      const s = { ...o.b2b, b2b: { ...o.b2b.b2b!, rate: { ...o.b2b.b2b!.rate, amount: a } } };
      return calculateCombined(s, rates, "liniowy").netYear;
    };
    const best = (a: number) => Math.max(net(a), ...(["skala", "ryczalt"] as const).map((f) => {
      const s = { ...o.b2b, b2b: { ...o.b2b.b2b!, rate: { ...o.b2b.b2b!.rate, amount: a } } };
      return calculateCombined(s, rates, f).netYear;
    }));
    expect(best(amount!)).toBeGreaterThanOrEqual(target);
    expect(best(amount! - 100)).toBeLessThan(target);
  });

  it("there and back again: UoP X -> B2B -> UoP gives X (within 2 zł)", () => {
    for (const gross of [6000, 12_000, 25_000]) {
      const there = b2bForUop(offers(gross, 0), rates, "liniowy");
      const back = uopForB2b(offers(gross, there.amount! / 100), rates, "liniowy");
      expect(Math.abs(back.amount! - zl(gross)), String(gross)).toBeLessThanOrEqual(zl(2));
    }
  });

  it("in the unit of the rate: a daily rate gives a daily amount", () => {
    const monthly = b2bForUop(offers(12_000, 0), rates, "liniowy").amount!;
    const daily = b2bForUop(offers(12_000, 0, { rate: { kind: "dzienna", amount: 0, hoursPerDay: 8 } }), rates, "liniowy").amount!;
    // a month has about 21 business days
    expect(daily).toBeGreaterThan(Math.floor(monthly / 23));
    expect(daily).toBeLessThan(Math.ceil(monthly / 19));
  });
});

describe("one amount known - the same on hand and the same benefits (plan A26)", () => {
  // PPK on and a sports card (150 zł a month in kind) - what B2B has to pay for itself.
  const rich = (gross: number, monthly: number): Offers => ({
    uop: side({ uop: job(gross, { ppk: true, benefits: [{ kind: "karta-sportowa", amount: zl(150), month: null, cash: false }] }) }),
    b2b: side({ b2b: business(monthly) }),
  });

  it("extras = PPK of both and benefits in kind; 12 000 gross: 2% + 1.5% of 12 150 and 150 zł, 12 months", () => {
    const y = calculateCombined(rich(12_000, 0).uop, rates);
    // PPK base = salary + benefit in kind (12 150 zł) without sickness; 2% = 243 zł, 1.5% = 182.25 zł
    expect(extrasYear(y)).toBe(12 * (zl(243) + 18_225 + zl(150)));
    expect(valueYear(y)).toBe(y.netYear + extrasYear(y));
    expect(extrasYear(calculateCombined(rich(12_000, 15_000).b2b, rates))).toBe(0);
  });

  it("B2B for UoP: reaches net + extras, 1 zł less does not; higher than the rate for net alone", () => {
    const o = rich(12_000, 0);
    const { amount, target } = b2bForUopEqual(o, rates, "liniowy");
    const value = (a: number) => valueYear(calculateCombined({ ...o.b2b, b2b: { ...o.b2b.b2b!, rate: { ...o.b2b.b2b!.rate, amount: a } } }, rates, "liniowy"));
    expect(target).toBe(valueYear(calculateCombined(o.uop, rates)));
    expect(value(amount!)).toBeGreaterThanOrEqual(target);
    expect(value(amount! - 100)).toBeLessThan(target);
    expect(amount!).toBeGreaterThan(b2bForUop(o, rates, "liniowy").amount!);
  });

  it("without PPK and benefits it is the plain break-even", () => {
    const o = offers(12_000, 0);
    expect(b2bForUopEqual(o, rates, "liniowy").amount).toBe(b2bForUop(o, rates, "liniowy").amount);
  });

  it("there and back again: UoP X -> B2B -> UoP gives X (within 2 zł), in the best form too", () => {
    for (const gross of [6000, 12_000, 25_000]) {
      for (const form of ["liniowy", undefined] as const) {
        const there = b2bForUopEqual(rich(gross, 0), rates, form);
        const back = uopForB2bEqual(rich(gross, there.amount! / 100), rates, form);
        expect(Math.abs(back.amount! - zl(gross)), `${gross} ${form}`).toBeLessThanOrEqual(zl(2));
      }
    }
  });

  it("and back the other way: B2B Y -> UoP -> B2B gives Y (within 2 zł)", () => {
    for (const monthly of [8000, 15_000, 30_000]) {
      const there = uopForB2bEqual(rich(0, monthly), rates, "liniowy");
      const back = b2bForUopEqual(rich(there.amount! / 100, monthly), rates, "liniowy");
      expect(Math.abs(back.amount! - zl(monthly)), String(monthly)).toBeLessThanOrEqual(zl(2));
    }
  });

  it("pension contributions: UoP 19.52% of the pay, B2B 19.52% of the declared base", () => {
    // Without sickness: a sick month on B2B has the base cut for the days of the allowance.
    const o = offers(10_000, 15_000, { sickness: { ...defaultB2bInput(0, 2026).sickness, days: 0 } });
    const uop = calculateCombined(o.uop, rates);
    expect(pensionYear(uop)).toBe(12 * 2 * 97_600);
    const b2b = calculateCombined(o.b2b, rates, "liniowy");
    // started in 2020 - full ZUS, base 60% of the forecast average pay (5 652 zł), 19.52% = 1 103.27 zł
    expect(pensionYear(b2b)).toBe(12 * 110_327);
  });
});

describe("c) the company's view", () => {
  const o = offers(10_000, 15_000);
  const result = compareOffers(o, rates);

  it("UoP 10 000 gross costs the employer 12 048 zł a month", () => {
    // 10 000 + pension 976 + disability 650 + accident 167 + Labour Fund 245 + FGŚP 10
    expect(result.employer.uopYear).toBe(zl(12_048 * 12));
  });

  it("B2B costs the client only the invoices, and the per-day cost counts days worked", () => {
    const e = result.employer;
    expect(e.b2bYear).toBe(result.b2bBest.b2b!.total.revenue);
    expect(e.b2bPerWorkedDay).toBe(Math.round(e.b2bYear / e.b2bWorkedDays));
    expect(e.uopPerWorkedDay).toBe(Math.round(e.uopYear / e.uopWorkedDays));
    expect(e.diffYear).toBe(e.uopYear - e.b2bYear);
  });

  it("paid absence on UoP: 26 days of holidays", () => {
    // about 26 days x (120 000 / ~250 working days) = ~12 500 zł
    expect(result.employer.uopPaidAbsence).toBeGreaterThan(zl(12_000));
    expect(result.employer.uopPaidAbsence).toBeLessThan(zl(13_500));
  });

  it("no contracts - zeros, no division by zero", () => {
    const empty = calculateCombined(side({}), rates);
    expect(employerView(empty, empty)).toEqual({
      uopYear: 0, uopPaidAbsence: 0, uopWorkedDays: 0, uopPerWorkedDay: 0,
      b2bYear: 0, b2bWorkedDays: 0, b2bPerWorkedDay: 0, diffYear: 0,
    });
  });
});

describe("d) chart data", () => {
  const curve = profitCurve(offers(12_000, 0), rates, zl(8000), zl(30_000), 12);

  it("points from the first to the last rate in whole złoty", () => {
    expect(curve.points).toHaveLength(12);
    expect(curve.points[0]!.rate).toBe(zl(8000));
    expect(curve.points.at(-1)!.rate).toBe(zl(30_000));
    for (const p of curve.points) expect(p.rate % 100).toBe(0);
  });

  it("difference = best form minus UoP, and it changes sign once", () => {
    for (const p of curve.points) {
      expect(p.b2bNetMonthly).toBe(p.forms[p.best]);
      expect(p.diffMonthly).toBe(p.b2bNetMonthly - curve.uopNetMonthly);
    }
    expect(curve.points[0]!.diffMonthly).toBeLessThan(0);
    expect(curve.points.at(-1)!.diffMonthly).toBeGreaterThan(0);
  });

  it("property: a higher rate never gives less on liniowy and on the scale", () => {
    for (const form of ["liniowy", "skala"] as const) {
      for (let i = 1; i < curve.points.length; i++) {
        expect(curve.points[i]!.forms[form], form).toBeGreaterThanOrEqual(curve.points[i - 1]!.forms[form]);
      }
    }
  });
});

describe("wrong input", () => {
  it("each side needs its contract", () => {
    const o = offers(10_000, 15_000);
    expect(() => compareOffers({ ...o, b2b: side({ uop: job(10_000) }) }, rates)).toThrow(/no business/);
    expect(() => uopForB2b({ ...o, uop: side({}) }, rates)).toThrow(/no employment/);
  });

  it("the UoP side with only an extra job has no main job days", () => {
    const r = compareOffers({ ...offers(10_000, 15_000), uop: side({ extraJobs: [job(10_000)] }) }, rates);
    expect(r.days.uopWorked).toBe(0);
    expect(r.employer.uopYear).toBe(0);
  });
});

describe("spreadDays", () => {
  it("spreads by business days and never more than there are", () => {
    const plan = spreadDays(26, 2026);
    expect(plan.reduce((a, b) => a + b, 0)).toBe(26);
    const all = monthDays(2026).reduce((a, m) => a + m.business, 0);
    expect(spreadDays(10_000, 2026)).toEqual(monthDays(2026).map((m) => m.business));
    expect(spreadDays(all, 2026).reduce((a, b) => a + b, 0)).toBe(all);
    expect(spreadDays(-5, 2026)).toEqual(Array(12).fill(0));
  });
});
