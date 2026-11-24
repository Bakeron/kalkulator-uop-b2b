/**
 * Several contracts at once, rules of 2026. Every expected number is worked out by hand in the
 * comment above it (assumption A10).
 */
import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { calculateB2b, defaultB2bInput, type B2bInput } from "./b2b";
import { zl } from "./money";
import {
  calculateCombined,
  calculateJobs,
  childRelief,
  civilZus,
  compareCombined,
  defaultCivil,
  defaultFamily,
  type CivilContract,
  type CombinedInput,
  type Family,
} from "./multi";
import { loadRates, type RatesFile } from "./rates";
import { annualScaleTax } from "./tax";
import { calculateUop, defaultUopInput, type UopInput } from "./uop";

const rates = loadRates(rates2026 as RatesFile);

/** Plain job: no PPK, no sickness (holidays do not change the pay). */
function job(gross: number, change: Partial<UopInput> = {}): UopInput {
  return {
    ...defaultUopInput(zl(gross)),
    ppk: false,
    sickness: { days: 0, startMonth: 0, kind: "zwykla", over50: false },
    ...change,
  };
}

/** Plain business: old company on full ZUS, no costs, no days off, no sickness. */
function business(monthly: number, change: Partial<B2bInput> = {}): B2bInput {
  return {
    ...defaultB2bInput(zl(monthly), 2026),
    startDate: "2020-01-01",
    costs: [],
    daysOffByMonth: Array<number>(12).fill(0),
    sickness: { days: 0, startMonth: 0, kind: "zwykla" },
    ...change,
  };
}

function civil(amount: number, change: Partial<CivilContract> = {}): CivilContract {
  return { ...defaultCivil(zl(amount)), ...change };
}

function combined(change: Partial<CombinedInput>, family: Partial<Family> = {}): CombinedInput {
  return { uop: null, extraJobs: [], civil: [], b2b: null, ...change, family: { ...defaultFamily(), ...family } };
}

describe("one contract alone gives the same as its own calculation", () => {
  it("employment contract", () => {
    const alone = calculateUop(job(10_000), rates);
    const year = calculateCombined(combined({ uop: job(10_000) }), rates);
    expect(year.netYear).toBe(alone.netYear);
    expect(year.yearly.settlement).toBe(alone.settlement);
    expect(year.payersCost).toBe(alone.total.employerCost);
  });

  it("business in every form", () => {
    for (const form of ["skala", "liniowy", "ryczalt", "ipbox"] as const) {
      const alone = calculateB2b(business(15_000), rates, form);
      const year = calculateCombined(combined({ b2b: business(15_000) }), rates, form);
      expect(year.netYear, form).toBe(alone.netYear);
      expect(year.yearly.settlement, form).toBe(alone.taxSettlement);
    }
  });
});

describe("zlecenie at another company", () => {
  it("job with at least the minimum wage: only health and tax", () => {
    // health 2 000 x 9% = 180; costs 20% = 400; income 1 600 x 12% = 192
    const year = calculateCombined(combined({ uop: job(10_000), civil: [civil(2000)] }), rates);
    const jan = year.civil[0]!.months[0]!;
    expect(jan.zus).toBe("brak");
    expect(jan.social).toBe(0);
    expect(jan.health).toBe(zl(180));
    expect(jan.costs).toBe(zl(400));
    expect(jan.income).toBe(zl(1600));
    expect(jan.advance).toBe(zl(192));
    expect(jan.net).toBe(zl(1628));
    expect(jan.employerCost).toBe(zl(2000));
  });

  it("job below the minimum wage: social contributions are obligatory", () => {
    // pension 2 000 x 9,76% = 195,20; disability x 1,5% = 30; social 225,20
    // health (2 000 - 225,20) x 9% = 159,73; costs 1 774,80 x 20% = 354,96
    // income 1 419,84 -> 1 420 x 12% = 170,40 -> 170; net 2 000 - 225,20 - 159,73 - 170 = 1 445,07
    const year = calculateCombined(combined({ uop: job(3000), civil: [civil(2000)] }), rates);
    const jan = year.civil[0]!.months[0]!;
    expect(jan.zus).toBe("obowiazkowe");
    expect(jan.social).toBe(zl(225.2));
    expect(jan.health).toBe(zl(159.73));
    expect(jan.costs).toBe(zl(354.96));
    expect(jan.advance).toBe(zl(170));
    expect(jan.net).toBe(zl(1445.07));
    // employer: pension 195,20, disability 6,5% = 130, accident 1,67% = 33,40, FGŚP 0,1% = 2,
    // no Labour Fund (2 000 zł is below the minimum wage)
    expect(jan.employer.total).toBe(zl(360.6));
    expect(year.warnings).toContain("zlecenie-obowiazkowy-zus");
  });

  it("without any job a zlecenie has obligatory ZUS", () => {
    const year = calculateCombined(combined({ civil: [civil(2000)] }), rates);
    expect(year.civil[0]!.months[0]!.zus).toBe("obowiazkowe");
    expect(year.civil[0]!.months[0]!.ppkEmployee).toBe(0);
  });

  it("voluntary social contributions when chosen, a student under 26 pays nothing", () => {
    expect(civilZus(civil(2000, { voluntarySocial: true }), zl(10_000), true, rates)).toBe("dobrowolne");
    expect(civilZus(civil(2000, { studentUnder26: true }), zl(3000), true, rates)).toBe("brak");
    const student = calculateCombined(combined({ uop: job(10_000), civil: [civil(2000, { studentUnder26: true })] }), rates);
    expect(student.civil[0]!.months[0]!.health).toBe(0);
  });

  it("small contract up to 200 zł: flat 12% tax outside the yearly return", () => {
    // health 200 x 9% = 18; flat tax 200 x 12% = 24; net 158
    const year = calculateCombined(combined({ uop: job(10_000), civil: [civil(200)] }), rates);
    const c = year.civil[0]!;
    expect(c.small).toBe(true);
    expect(c.months[0]!.flatTax).toBe(zl(24));
    expect(c.months[0]!.advance).toBe(0);
    expect(c.months[0]!.net).toBe(zl(158));
    expect(c.total.income).toBe(0);
    expect(year.yearly.flatTax).toBe(zl(288));
  });
});

describe("zlecenie at the same employer", () => {
  it("ZUS as from the job, Labour Fund from the joint base, PPK", () => {
    // social 195,20 + 30 + sickness 2,45% 49 = 274,20; health 1 725,80 x 9% = 155,32
    // PPK 2% = 40, employer 1,5% = 30 (taxed); after social 2 030 - 274,20 = 1 755,80
    // costs 20% = 351,16; income 1 404,64 -> 1 405 x 12% = 168,60 -> 169
    // net 2 000 - 274,20 - 155,32 - 40 - 169 = 1 361,48
    const year = calculateCombined(combined({ uop: job(10_000, { ppk: true }), civil: [civil(2000, { sameEmployer: true })] }), rates);
    const jan = year.civil[0]!.months[0]!;
    expect(jan.zus).toBe("jak-etat");
    expect(jan.social).toBe(zl(274.2));
    expect(jan.health).toBe(zl(155.32));
    expect(jan.ppkEmployee).toBe(zl(40));
    expect(jan.costs).toBe(zl(351.16));
    expect(jan.advance).toBe(zl(169));
    expect(jan.net).toBe(zl(1361.48));
    // employer: 195,20 + 130 + 33,40 + FP 49 + FGŚP 2 + PPK 30 = 439,60
    expect(jan.employer.total).toBe(zl(439.6));
  });
});

describe("dzieło", () => {
  it("at another company: no ZUS, no health, 50% author's costs", () => {
    // costs 5 000 x 50% = 2 500; advance 2 500 x 12% = 300; net 4 700
    const year = calculateCombined(combined({ uop: job(10_000), civil: [defaultCivil(zl(5000), "dzielo")] }), rates);
    const jan = year.civil[0]!.months[0]!;
    expect(jan.social + jan.health).toBe(0);
    expect(jan.authorsCosts).toBe(zl(2500));
    expect(jan.advance).toBe(zl(300));
    expect(jan.net).toBe(zl(4700));
  });

  it("one-off in one month only", () => {
    const year = calculateCombined(combined({ uop: job(10_000), civil: [{ ...defaultCivil(zl(5000), "dzielo"), months: [5] }] }), rates);
    expect(year.civil[0]!.total.revenue).toBe(zl(5000));
    expect(year.civil[0]!.months[4]!.net).toBe(0);
  });

  it("at the own employer: ZUS as from the job", () => {
    const year = calculateCombined(combined({ uop: job(10_000), civil: [{ ...defaultCivil(zl(5000), "dzielo"), sameEmployer: true }] }), rates);
    expect(year.civil[0]!.months[0]!.zus).toBe("jak-etat");
    expect(year.warnings).toContain("dzielo-u-pracodawcy");
  });
});

describe("two employment contracts", () => {
  const year = calculateCombined(combined({ uop: job(10_000), extraJobs: [job(5000)] }), rates);

  it("the second employer: no PIT-2, so no 300 zł off the advance", () => {
    // 5 000 - 685,50 - 250 = 4 064,50 -> 4 065 x 12% = 487,80 -> 488
    expect(year.extraJobs[0]!.months[0]!.advance).toBe(zl(488));
    expect(year.uop!.months[0]!.advance).toBe(zl(705));
  });

  it("one yearly return: costs up to 4 500 zł and the threshold counted together", () => {
    // costs 2 x 3 000 = 6 000 -> 1 500 above the limit added back
    // income 100 548 + 48 774 + 1 500 = 150 822; tax 14 400 + 30 822 x 32% = 24 263,04 - 3 600
    // = 20 663,04 -> 20 663; advances 705 x 12 + 488 x 12 = 14 316 -> 6 347 to pay
    expect(year.yearly.costsExcess).toBe(zl(1500));
    expect(year.yearly.scaleIncome).toBe(zl(150_822));
    expect(year.yearly.tax).toBe(zl(20_663));
    expect(year.yearly.advances).toBe(zl(14_316));
    expect(year.yearly.settlement).toBe(zl(6347));
    expect(year.warnings).toContain("koszty-kilku-etatow");
  });

  it("one 30x limit for both, used up in time order", () => {
    // 20 000 + 15 000 a month: 8 months = 280 000, in September 2 600 left - the main job takes it
    const [main, extra] = calculateJobs([job(20_000), job(15_000)], rates);
    const capped = (y: typeof main) => y!.months.map((m) => m.zusBase - m.overLimit);
    expect(capped(main)[8]).toBe(zl(2600));
    expect(capped(extra)[8]).toBe(0);
    expect(capped(extra)[7]).toBe(zl(15_000));
    const all = [...capped(main), ...capped(extra)].reduce((a, b) => a + b, 0);
    expect(all).toBe(rates.zusAnnualLimit);
  });

  it("commuter: the costs limit of several jobs is 5 400 zł", () => {
    // 300 x 12 + 250 x 12 = 6 600 -> 1 200 above 5 400
    const y = calculateCombined(combined({ uop: job(10_000, { commuter: true }), extraJobs: [job(5000)] }), rates);
    expect(y.yearly.costsExcess).toBe(zl(1200));
  });

  it("a single job is not changed", () => {
    expect(calculateJobs([job(20_000)], rates)[0]).toEqual(calculateUop(job(20_000), rates));
  });
});

describe("zero PIT shared by the job and a zlecenie", () => {
  it("what the job leaves of the 85 528 zł frees the zlecenie", () => {
    // job 4 000 x 12 = 48 000 exempt, left 37 528 >= zlecenie 24 000
    const year = calculateCombined(combined({ uop: job(4000, { zeroPit: true }), civil: [civil(2000)] }), rates);
    expect(year.uop!.total.exempt).toBe(zl(48_000));
    expect(year.civil[0]!.total.exempt).toBe(zl(24_000));
    expect(year.civil[0]!.total.advance).toBe(0);
  });

  it("dzieło is not covered", () => {
    const year = calculateCombined(combined({ uop: job(4000, { zeroPit: true }), civil: [defaultCivil(zl(2000), "dzielo")] }), rates);
    expect(year.civil[0]!.total.exempt).toBe(0);
  });
});

describe("job and a business", () => {
  it("only the health contribution from the business, no allowance", () => {
    // liniowy: 4,9% of 5 000 = 245 is below the minimum 432,54 (from the February contribution)
    const year = calculateCombined(combined({ uop: job(10_000), b2b: business(5000) }), rates, "liniowy");
    const feb = year.b2b!.months[1]!;
    expect(feb.social.total).toBe(0);
    expect(feb.health).toBe(zl(432.54));
    expect(year.b2b!.warnings).not.toContain("chorobowe-bez-zasilku");
  });

  it("a job below the minimum wage: full ZUS from the business", () => {
    const year = calculateCombined(combined({ uop: job(3000), b2b: business(5000) }), rates, "liniowy");
    expect(year.b2b!.months[0]!.social.total).toBe(zl(1926.76));
  });

  it("business on the scale joins the job's threshold - the advances are too low", () => {
    // the business counts its advances with its own threshold and its own tax-reducing amount
    const year = calculateCombined(combined({ uop: job(10_000), b2b: business(10_000) }), rates, "skala");
    const expected = annualScaleTax(year.uop!.total.income + year.b2b!.scaleIncome, rates);
    expect(year.yearly.scaleTax).toBe(expected);
    expect(year.yearly.settlement).toBeGreaterThan(0);
  });

  it("the best form counts the job too", () => {
    const both = compareCombined(combined({ uop: job(10_000), b2b: business(10_000) }), rates);
    // the job already fills the first threshold, so the scale loses to the flat forms
    expect(both.best).not.toBe("skala");
    for (const f of ["skala", "liniowy", "ryczalt"] as const) {
      expect(both.forms[both.best].netYear).toBeGreaterThanOrEqual(both.forms[f].netYear);
    }
  });

  it("one client - the warning about hidden employment", () => {
    const year = calculateCombined(combined({ b2b: business(15_000, { clients: "jeden" }) }), rates, "liniowy");
    expect(year.b2b!.warnings).toContain("jeden-klient");
  });
});

describe("spouse and children", () => {
  it("joint return with a spouse without income saves 3 600 zł", () => {
    // income 100 548: alone 12 065,76 - 3 600 -> 8 466; joint 2 x (50 274 x 12% = 6 032,88
    // - 3 600 -> 2 433) = 4 866; saving 3 600
    const year = calculateCombined(combined({ uop: job(10_000) }, { married: true, joint: true }), rates);
    expect(year.yearly.scaleTax).toBe(zl(8466));
    expect(year.yearly.jointTax).toBe(zl(4866));
    expect(year.yearly.jointSaving).toBe(zl(3600));
    const alone = calculateCombined(combined({ uop: job(10_000) }), rates);
    expect(year.netYear - alone.netYear).toBe(zl(3600));
  });

  it("joint return of equal incomes saves nothing and is not used", () => {
    const year = calculateCombined(combined({ uop: job(10_000) }, { married: true, joint: true, spouseIncome: zl(100_548) }), rates);
    expect(year.yearly.jointUsed).toBe(false);
    expect(year.yearly.jointSaving).toBe(0);
  });

  it("no joint return with a business on liniowy or ryczałt", () => {
    for (const form of ["liniowy", "ryczalt"] as const) {
      const year = calculateCombined(combined({ b2b: business(15_000) }, { married: true, joint: true }), rates, form);
      expect(year.yearly.jointAllowed, form).toBe(false);
      expect(year.warnings, form).toContain("wspolne-niedostepne");
    }
    const skala = calculateCombined(combined({ b2b: business(15_000) }, { married: true, joint: true }), rates, "skala");
    expect(skala.yearly.jointAllowed).toBe(true);
  });

  it("IP Box: joint return only when it works on the scale (former employer)", () => {
    const linear = calculateCombined(combined({ b2b: business(15_000) }, { married: true, joint: true }), rates, "ipbox");
    expect(linear.yearly.jointAllowed).toBe(false);
    const onScale = calculateCombined(combined({ b2b: business(15_000, { formerEmployer: true }) }, { married: true, joint: true }), rates, "ipbox");
    expect(onScale.yearly.jointAllowed).toBe(true);
  });

  it("child relief amounts", () => {
    // 1 112,04 + 1 112,04 + 2 000,04 + 2 700 + 2 700
    expect(childRelief(1, rates)).toBe(zl(1112.04));
    expect(childRelief(2, rates)).toBe(zl(2224.08));
    expect(childRelief(3, rates)).toBe(zl(4224.12));
    expect(childRelief(5, rates)).toBe(zl(9624.12));
  });

  it("two children: 2 224,08 zł off the tax", () => {
    // 8 466 - 2 224,08 = 6 241,92; advances 705 x 12 = 8 460 -> refund 2 218,08
    const year = calculateCombined(combined({ uop: job(10_000) }, { children: 2 }), rates);
    expect(year.yearly.childReliefUsed).toBe(zl(2224.08));
    expect(year.yearly.tax).toBe(zl(6241.92));
    expect(year.yearly.settlement).toBe(zl(-2218.08));
  });

  it("one child: income limit 56 000 zł alone, 112 000 zł with the spouse", () => {
    const alone = calculateCombined(combined({ uop: job(10_000) }, { children: 1 }), rates);
    expect(alone.yearly.childRelief).toBe(0);
    expect(alone.warnings).toContain("ulga-na-dzieci-ponad-limit");
    const married = calculateCombined(combined({ uop: job(10_000) }, { children: 1, married: true }), rates);
    expect(married.yearly.childReliefUsed).toBe(zl(1112.04));
  });

  it("low income: the unused relief paid back up to the contributions", () => {
    const year = calculateCombined(combined({ uop: job(4806) }, { children: 4 }), rates);
    const y = year.yearly;
    expect(y.childReliefUsed).toBe(y.scaleTax);
    const contributions = year.uop!.total.social + year.uop!.total.health;
    expect(y.childRefund).toBe(Math.min(y.childRelief - y.scaleTax, contributions));
    expect(y.childRefund).toBeGreaterThan(0);
  });

  it("on liniowy the relief has no scale tax to go off", () => {
    const year = calculateCombined(combined({ b2b: business(15_000) }, { children: 2 }), rates, "liniowy");
    expect(year.yearly.childReliefUsed).toBe(0);
    expect(year.yearly.childRefund).toBe(0);
  });
});
