/**
 * Employment contract, rules of 2026. Every expected number is worked out by hand in the comment
 * above it (assumption A10), the 10 000 zł case is also the figure given by public salary
 * calculators for 2026 (7 147,39 zł net without PPK, employer cost 12 048 zł).
 */
import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { zl } from "./money";
import { loadRates, type RatesFile } from "./rates";
import { calculateUop, defaultUopInput, defaultVacationPlan, type UopInput } from "./uop";

const rates = loadRates(rates2026 as RatesFile);

/** Plain case: no PPK, no sickness, default holidays. */
function plain(gross: number, change: Partial<UopInput> = {}): UopInput {
  return {
    ...defaultUopInput(zl(gross)),
    ppk: false,
    sickness: { days: 0, startMonth: 0, kind: "zwykla", over50: false },
    ...change,
  };
}

describe("UoP - one month, 10 000 zł gross", () => {
  const year = calculateUop(plain(10_000), rates);
  const jan = year.months[0]!;

  it("social contributions of the employee", () => {
    // 10 000 x 9,76% = 976,00; x 1,5% = 150,00; x 2,45% = 245,00
    expect(jan.pension).toBe(zl(976));
    expect(jan.disability).toBe(zl(150));
    expect(jan.sicknessContribution).toBe(zl(245));
    expect(jan.social).toBe(zl(1371));
  });

  it("health contribution 9% of the pay minus social contributions", () => {
    // (10 000 - 1 371) x 9% = 8 629 x 9% = 776,61
    expect(jan.healthBase).toBe(zl(8629));
    expect(jan.health).toBe(zl(776.61));
  });

  it("tax advance", () => {
    // 10 000 - 1 371 - 250 = 8 379; 8 379 x 12% = 1 005,48; - 300 = 705,48 -> 705
    expect(jan.costs).toBe(zl(250));
    expect(jan.income).toBe(zl(8379));
    expect(jan.advance).toBe(zl(705));
  });

  it("net pay", () => {
    // 10 000 - 1 371 - 776,61 - 705 = 7 147,39
    expect(jan.net).toBe(zl(7147.39));
  });

  it("employer cost", () => {
    // 976 + 650 (6,5%) + 167 (1,67%) + 245 (FP 2,45%) + 10 (FGŚP 0,1%) = 2 048
    expect(jan.employer).toEqual({
      pension: zl(976), disability: zl(650), accident: zl(167), laborFund: zl(245), fgsp: zl(10), ppk: 0,
      total: zl(2048),
    });
    expect(jan.employerCost).toBe(zl(12_048));
  });

  it("yearly return: monthly rounding of the 300 zł reduction leaves 6 zł to pay", () => {
    // 8 379 x 12 = 100 548; x 12% = 12 065,76; - 3 600 = 8 465,76 -> 8 466; advances 705 x 12 = 8 460
    expect(year.annualTax).toBe(zl(8466));
    expect(year.settlement).toBe(zl(6));
    expect(year.netYear).toBe(zl(7147.39 * 12 - 6));
    expect(year.netMonthly).toBe(Math.round(zl(7147.39 * 12 - 6) / 12));
  });
});

describe("UoP - PPK", () => {
  it("the employer's 1,5% is taxable income, the employee's 2% leaves the pay", () => {
    const jan = calculateUop(plain(10_000, { ppk: true }), rates).months[0]!;
    // revenue 10 150; income 10 150 - 1 371 - 250 = 8 529; x 12% = 1 023,48 - 300 -> 723
    expect(jan.ppkEmployer).toBe(zl(150));
    expect(jan.ppkEmployee).toBe(zl(200));
    expect(jan.revenue).toBe(zl(10_150));
    expect(jan.advance).toBe(zl(723));
    // 10 000 - 1 371 - 776,61 - 723 - 200 = 6 929,39
    expect(jan.net).toBe(zl(6929.39));
    expect(jan.employer.ppk).toBe(zl(150));
    expect(jan.employerCost).toBe(zl(12_198));
  });
});

describe("UoP - second tax threshold, 20 000 zł gross", () => {
  const year = calculateUop(plain(20_000), rates);

  it("12% until the year-to-date income reaches 120 000 zł, then 32%", () => {
    // social 1 952 + 300 + 490 = 2 742; income 20 000 - 2 742 - 250 = 17 008
    // Jan-Jul: 17 008 x 12% = 2 040,96 - 300 -> 1 741 (7 x 17 008 = 119 056)
    expect(year.months[0]!.income).toBe(zl(17_008));
    expect(year.months[6]!.advance).toBe(zl(1741));
    // Aug: 944 x 12% + 16 064 x 32% = 113,28 + 5 140,48 = 5 253,76 - 300 -> 4 954
    expect(year.months[7]!.advance).toBe(zl(4954));
    // Sep-Dec: 17 008 x 32% = 5 442,56 - 300 -> 5 143
    expect(year.months[11]!.advance).toBe(zl(5143));
    // health (20 000 - 2 742) x 9% = 1 553,22; net in January 20 000 - 2 742 - 1 553,22 - 1 741
    expect(year.months[0]!.net).toBe(zl(13_963.78));
  });

  it("yearly return", () => {
    // 204 096: 14 400 + 84 096 x 32% = 41 310,72 - 3 600 = 37 710,72 -> 37 711;
    // advances 7 x 1 741 + 4 954 + 4 x 5 143 = 37 713 -> 2 zł back
    expect(year.annualTax).toBe(zl(37_711));
    expect(year.settlement).toBe(zl(-2));
  });
});

describe("UoP - 30x limit, 30 000 zł gross", () => {
  const year = calculateUop(plain(30_000), rates);

  it("pension and disability stop at 282 600 zł in the year", () => {
    // Jan-Sep 270 000; October only 12 600 is under the limit; Nov-Dec nothing
    expect(year.months[8]!.pension).toBe(zl(2928));
    expect(year.months[9]!.pension).toBe(zl(1229.76));
    expect(year.months[9]!.disability).toBe(zl(189));
    expect(year.months[9]!.overLimit).toBe(zl(17_400));
    expect(year.months[10]!.pension).toBe(0);
    expect(year.months[10]!.employer.pension).toBe(0);
    // the sickness contribution has no limit
    expect(year.months[11]!.sicknessContribution).toBe(zl(735));
    expect(year.total.pension + year.total.disability).toBe(zl(282_600 * 0.1126));
  });

  it("net grows after the limit", () => {
    expect(year.months[10]!.net).toBeGreaterThan(year.months[8]!.net - zl(4000));
    expect(year.months[11]!.social).toBe(zl(735));
  });
});

describe("UoP - sickness", () => {
  it("10 days in February: salary cut by 10/30, 80% sick pay from the employer", () => {
    const feb = calculateUop(plain(10_000, { sickness: { days: 10, startMonth: 1, kind: "zwykla", over50: false } }), rates)
      .months[1]!;
    // salary 10 000 - 10 000 x 10/30 = 6 666,67
    expect(feb.salary).toBe(zl(6666.67));
    // base 10 000 - 13,71% = 8 629; daily 8 629 x 80% / 30 = 230,11; x 10 = 2 301,10
    expect(feb.sickPay).toBe(zl(2301.1));
    expect(feb.allowance).toBe(0);
    // social from 6 666,67: 650,67 + 100,00 + 163,33 = 914,00
    expect(feb.social).toBe(zl(914));
    // health (6 666,67 - 914 + 2 301,10) x 9% = 8 053,77 x 9% = 724,84
    expect(feb.health).toBe(zl(724.84));
    // income 6 666,67 + 2 301,10 - 914 - 250 = 7 803,77 -> 7 804 x 12% - 300 = 636,48 -> 636
    expect(feb.advance).toBe(zl(636));
    // net 6 666,67 + 2 301,10 - 914 - 724,84 - 636 = 6 692,93
    expect(feb.net).toBe(zl(6692.93));
    // February 2026: 20 working days; 1 Feb is a Sunday, so 1-10 Feb = 7 working days
    expect(feb.days).toMatchObject({ working: 20, sick: 10, sickWorking: 7, sickPayDays: 10, allowanceDays: 0 });
    expect(feb.employerCost).toBe(zl(6666.67) + zl(2301.1) + feb.employer.total);
  });

  it("40 days from 1 January: 33 days employer, from day 34 the ZUS allowance", () => {
    const year = calculateUop(plain(10_000, { sickness: { days: 40, startMonth: 0, kind: "zwykla", over50: false } }), rates);
    const [jan, feb] = [year.months[0]!, year.months[1]!];
    // whole January sick: no salary, 31 x 230,11 = 7 133,41
    expect(jan.salary).toBe(0);
    expect(jan.sickPay).toBe(zl(7133.41));
    expect(jan.social).toBe(0);
    expect(jan.health).toBe(zl(642.01));
    // 7 133,41 - 250 = 6 883,41 -> 6 883 x 12% - 300 = 525,96 -> 526
    expect(jan.advance).toBe(zl(526));
    expect(jan.net).toBe(zl(5965.4));
    // February: 2 days employer (32, 33), 7 days allowance
    expect(feb.days.sickPayDays).toBe(2);
    expect(feb.days.allowanceDays).toBe(7);
    expect(feb.allowance).toBe(zl(1610.77));
    // health also from sick pay and the allowance: 7 000 - social + 460,22 + 1 610,77
    expect(feb.healthBase).toBe(zl(7000) - feb.social + zl(460.22) + zl(1610.77));
  });

  it("over 50 the employer pays 14 days", () => {
    const feb = calculateUop(plain(10_000, { sickness: { days: 20, startMonth: 1, kind: "zwykla", over50: true } }), rates)
      .months[1]!;
    expect(feb.days.sickPayDays).toBe(14);
    expect(feb.days.allowanceDays).toBe(6);
  });

  it("pregnancy or accident on the way to work 100%", () => {
    const full = calculateUop(plain(10_000, { sickness: { days: 1, startMonth: 0, kind: "ciaza-wypadek", over50: false } }), rates);
    // 8 629 / 30 = 287,63
    expect(full.months[0]!.sickPay).toBe(zl(287.63));
    expect(full.sickBase).toBe(zl(8629));
  });

  it("sickness at the end of the year stops on 31 December", () => {
    const year = calculateUop(plain(10_000, { sickness: { days: 60, startMonth: 11, kind: "zwykla", over50: false } }), rates);
    expect(year.months[11]!.days.sick).toBe(31);
    expect(year.months[11]!.salary).toBe(0);
  });
});

describe("UoP - author's costs 50%", () => {
  const input = plain(10_000, { authors: { enabled: true, creativePercent: 80 } });
  const year = calculateUop(input, rates);

  it("January without holiday: 50% of the creative 80% after its social contributions", () => {
    const jan = year.months[0]!;
    // creative 8 000; its social 1 371 x 0,8 = 1 096,80; costs (8 000 - 1 096,80) / 2 = 3 451,60
    expect(jan.authorsCosts).toBe(zl(3451.6));
    expect(jan.costs).toBe(zl(250));
    // income 10 000 - 1 371 - 250 - 3 451,60 = 4 927,40 -> 4 927 x 12% - 300 = 291,24 -> 291
    expect(jan.advance).toBe(zl(291));
    expect(jan.net).toBe(zl(7561.39));
  });

  it("holiday pay is not creative work", () => {
    const jul = year.months[6]!;
    // July 2026: 23 working days, 10 days holiday: holiday pay 10 000 x 10/23 = 4 347,83
    // creative (10 000 - 4 347,83) x 80% = 4 521,74; social share 619,93; (4 521,74 - 619,93)/2
    expect(jul.days.vacation).toBe(10);
    expect(jul.authorsCosts).toBe(zl(1950.91));
  });

  it("annual limit 120 000 zł", () => {
    const high = calculateUop(plain(50_000, { authors: { enabled: true, creativePercent: 100 } }), rates);
    expect(high.total.authorsCosts).toBe(zl(120_000));
    // 100% creative - the standard 250 zł is not added on top
    expect(high.months[0]!.costs).toBe(0);
  });
});

describe("UoP - zero PIT (e.g. under 26)", () => {
  const year = calculateUop(plain(10_000, { zeroPit: true }), rates);

  it("no tax until 85 528 zł of revenue, then tax on the rest", () => {
    expect(year.months[7]!.advance).toBe(0);
    expect(year.months[7]!.exempt).toBe(zl(10_000));
    // September: 5 528 free, 4 472 taxable; social share 1 371 x 0,4472 = 613,11
    // 4 472 - 613,11 - 250 = 3 608,89 -> 3 609 x 12% - 300 = 133,08 -> 133
    const sep = year.months[8]!;
    expect(sep.exempt).toBe(zl(5528));
    expect(sep.socialDeducted).toBe(zl(613.11));
    expect(sep.advance).toBe(zl(133));
    expect(year.months[9]!.advance).toBe(zl(705));
    expect(year.total.exempt).toBe(zl(85_528));
  });

  it("the yearly return gives the advances back (tax under the 3 600 zł reduction)", () => {
    // income 3 608,89 + 3 x 8 379 = 28 745,89 -> 28 746 x 12% = 3 449,52 < 3 600 -> 0
    expect(year.annualTax).toBe(0);
    expect(year.settlement).toBe(zl(-(133 + 3 * 705)));
  });
});

describe("UoP - other options", () => {
  it("commuter costs 300 zł", () => {
    const jan = calculateUop(plain(10_000, { commuter: true }), rates).months[0]!;
    expect(jan.costs).toBe(zl(300));
    // 10 000 - 1 371 - 300 = 8 329 x 12% = 999,48 - 300 -> 699
    expect(jan.advance).toBe(zl(699));
  });

  it("benefits in kind are taxed but not paid out, a bonus is paid in its month", () => {
    const year = calculateUop(
      plain(10_000, {
        benefits: [
          { kind: "karta-sportowa", amount: zl(100), month: null, cash: false },
          { kind: "premia-roczna", amount: zl(5000), month: 11, cash: true },
        ],
      }),
      rates,
    );
    const jan = year.months[0]!;
    expect(jan.inKind).toBe(zl(100));
    expect(jan.zusBase).toBe(zl(10_100));
    // social from 10 100: 985,76 + 151,50 + 247,45 = 1 384,71
    expect(jan.social).toBe(zl(1384.71));
    // health (10 100 - 1 384,71) x 9% = 784,38; income 10 100 - 1 384,71 - 250 = 8 465,29 -> 8 465
    // x 12% = 1 015,80 - 300 -> 716; net 10 000 - 1 384,71 - 784,38 - 716
    expect(jan.net).toBe(zl(7114.91));
    expect(year.months[11]!.cashBonuses).toBe(zl(5000));
    expect(year.months[10]!.cashBonuses).toBe(0);
  });

  it("no Labour Fund below the minimum wage, own accident rate", () => {
    const jan = calculateUop(plain(4000, { accidentRate: 93 }), rates).months[0]!;
    expect(jan.employer.laborFund).toBe(0);
    // 4 000 x 0,93% = 37,20
    expect(jan.employer.accident).toBe(zl(37.2));
  });

  it("zero pay gives zeros", () => {
    const year = calculateUop(plain(0), rates);
    expect(year.total.net).toBe(0);
    expect(year.total.advance).toBe(0);
    expect(year.annualTax).toBe(0);
  });

  it("days: 251 working days in 2026 minus 26 days of holiday", () => {
    const year = calculateUop(plain(10_000), rates);
    expect(year.days).toEqual({ working: 251, vacation: 26, sickWorking: 0, worked: 225 });
  });
});

describe("UoP - holiday plan", () => {
  it("spreads 20, 26 and more days", () => {
    for (const days of [0, 20, 26, 40]) {
      const plan = defaultVacationPlan(days);
      expect(plan).toHaveLength(12);
      expect(plan.reduce((s, d) => s + d, 0)).toBe(days);
    }
    expect(defaultVacationPlan(26)[6]).toBe(10);
  });
});

describe("UoP - properties", () => {
  it("the 12 months add up to the year", () => {
    const year = calculateUop({ ...defaultUopInput(zl(14_321.55)), authors: { enabled: true, creativePercent: 60 } }, rates);
    expect(year.total.net).toBe(year.months.reduce((s, m) => s + m.net, 0));
    expect(year.total.employer.total).toBe(year.months.reduce((s, m) => s + m.employer.total, 0));
  });

  it("more gross never means less net in the year", () => {
    let last = -1;
    for (let gross = 3000; gross <= 60_000; gross += 777) {
      const year = calculateUop(defaultUopInput(zl(gross)), rates);
      expect(year.netYear).toBeGreaterThan(last);
      last = year.netYear;
    }
  });
});

describe("UoP - input edge cases", () => {
  it("a missing holiday plan means no holiday", () => {
    const year = calculateUop(plain(10_000, { vacationByMonth: [], authors: { enabled: true, creativePercent: 80 } }), rates);
    expect(year.days.vacation).toBe(0);
    expect(year.months[6]!.authorsCosts).toBe(zl(3451.6));
  });
});

describe("UoP - 2027", () => {
  it("the bill from print 3293 (24% bracket) lowers the tax at 20 000 zł gross", async () => {
    const file = (await import("../rates/2027.json")).default as RatesFile;
    const sure = calculateUop(plain(20_000), loadRates(file, "pewne"));
    const bills = calculateUop(plain(20_000), loadRates(file, "z-projektami"));
    // income 17 008 a month; social contributions grow with the higher 30x limit only above it
    expect(sure.months[0]!.income).toBe(zl(17_008));
    // 204 096: 15 600 + 20 000 x 24% + 54 096 x 32% = 37 711 - 3 600 = 34 111 (old scale 37 711)
    expect(bills.annualTax).toBe(zl(34_111));
    expect(sure.annualTax).toBe(zl(37_711));
    expect(bills.netYear - sure.netYear).toBe(zl(3600));
  });
});
