/**
 * B2B contract, rules of 2026. Every expected number is worked out by hand in the comment above it
 * (assumption A10). Full ZUS 2026 = 1 926,76 zł with sickness and Labour Fund, preferential
 * 456,18 zł - the amounts ZUS publishes for 2026.
 */
import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import {
  addMonths,
  calculateB2b,
  compareB2bForms,
  convertRate,
  defaultB2bInput,
  parseDate,
  ryczaltHealth,
  zusPlan,
  type B2bInput,
  type CostItem,
} from "./b2b";
import { zl } from "./money";
import { loadRates, type RatesFile } from "./rates";
import { annualScaleTax } from "./tax";

const rates = loadRates(rates2026 as RatesFile);

/** Plain case: an old company on full ZUS, no costs, no days off, no sickness. */
function plain(monthly: number, change: Partial<B2bInput> = {}): B2bInput {
  return {
    ...defaultB2bInput(zl(monthly), 2026),
    startDate: "2020-01-01",
    costs: [],
    daysOffByMonth: Array<number>(12).fill(0),
    sickness: { days: 0, startMonth: 0, kind: "zwykla" },
    ...change,
  };
}

describe("B2B - full ZUS 2026", () => {
  const year = calculateB2b(plain(15_000), rates, "liniowy");
  const jan = year.months[0]!;

  it("social contributions from the base 5 652 zł", () => {
    // 5 652 x 19,52% = 1 103,27; x 8% = 452,16; x 2,45% = 138,47; x 1,67% = 94,39; FP x 2,45% = 138,47
    expect(jan.social).toEqual({
      base: zl(5652), pension: zl(1103.27), disability: zl(452.16), sickness: zl(138.47),
      accident: zl(94.39), laborFund: zl(138.47), total: zl(1926.76),
    });
    expect(jan.stages).toEqual(["pelny"]);
  });

  it("without voluntary sickness insurance 138,47 zł less", () => {
    const m = calculateB2b(plain(15_000, { voluntarySickness: false }), rates, "liniowy").months[0]!;
    expect(m.social.sickness).toBe(0);
    expect(m.social.total).toBe(zl(1788.29));
  });
});

describe("B2B - liniowy, 15 000 zł a month", () => {
  const year = calculateB2b(plain(15_000), rates, "liniowy");
  const jan = year.months[0]!;

  it("health 4,9% of the income, deducted from the income", () => {
    // income 15 000 - 1 926,76 = 13 073,24; x 4,9% = 640,59
    expect(jan.healthIncome).toBe(zl(13_073.24));
    expect(jan.health).toBe(zl(640.59));
    expect(jan.healthDeduction).toBe(zl(640.59));
  });

  it("advance 19%", () => {
    // 13 073,24 - 640,59 = 12 432,65 -> 12 433; x 19% = 2 362,27 -> 2 362
    expect(jan.taxBase).toBe(zl(12_433));
    expect(jan.advance).toBe(zl(2362));
    expect(jan.net).toBe(zl(15_000 - 1926.76 - 640.59 - 2362));
  });

  it("yearly return and health of the year", () => {
    // income 156 878,88 - health 7 687,08 = 149 191,80 -> 149 192; x 19% = 28 346,48 -> 28 346
    expect(year.annualTax).toBe(zl(28_346));
    expect(year.taxSettlement).toBe(0);
    // 4,9% x 156 878,88 = 7 687,07; paid 12 x 640,59 = 7 687,08 -> 1 grosz back
    expect(year.annualHealth).toBe(zl(7687.07));
    expect(year.healthSettlement).toBe(-1);
    // 180 000 - 23 121,12 - 7 687,08 - 28 346 + 0,01
    expect(year.netYear).toBe(zl(120_845.81));
    expect(year.netMonthly).toBe(zl(10_070.48));
  });

  it("the health deduction stops at the limit 14 100 zł", () => {
    const rich = calculateB2b(plain(40_000), rates, "liniowy");
    // health (40 000 - 1 926,76) x 4,9% = 1 865,59 a month; the limit is reached in August
    expect(rich.total.healthDeduction).toBe(zl(14_100));
    expect(rich.months[7]!.healthDeduction).toBe(zl(14_100 - 7 * 1865.59));
    expect(rich.months[8]!.healthDeduction).toBe(0);
  });
});

describe("B2B - skala, 15 000 zł a month", () => {
  const year = calculateB2b(plain(15_000), rates, "skala");
  const m = year.months;

  it("health 9% of the income, not deducted", () => {
    // 13 073,24 x 9% = 1 176,59
    expect(m[0]!.health).toBe(zl(1176.59));
    expect(m[0]!.healthDeduction).toBe(0);
  });

  it("advances from the year-to-date income minus the whole 3 600 zł", () => {
    // Jan 13 073 x 12% = 1 568,76 < 3 600; Feb 26 146 x 12% = 3 137,52 < 3 600
    expect(m[0]!.advance).toBe(0);
    expect(m[1]!.advance).toBe(0);
    // Mar 39 219,72 -> 39 220 x 12% = 4 706,40 - 3 600 = 1 106,40 -> 1 106
    expect(m[2]!.advance).toBe(zl(1106));
  });

  it("the 32% bracket in the yearly return", () => {
    // 156 879: 120 000 x 12% = 14 400 + 36 879 x 32% = 11 801,28; - 3 600 = 22 601,28 -> 22 601
    expect(year.annualTax).toBe(zl(22_601));
    expect(year.total.advance).toBe(zl(22_601));
    // 9% x 156 878,88 = 14 119,10; paid 12 x 1 176,59 = 14 119,08
    expect(year.healthSettlement).toBe(2);
    expect(year.netYear).toBe(zl(180_000 - 23_121.12 - 14_119.08 - 22_601 - 0.02));
  });
});

describe("B2B - ryczałt, 15 000 zł a month", () => {
  const year = calculateB2b(plain(15_000), rates, "ryczalt");
  const jan = year.months[0]!;

  it("health by the threshold of revenue minus social contributions", () => {
    // 180 000 - 23 121,12 = 156 878,88 - between 60 000 and 300 000: 9228,64 x 9% = 830,58
    expect(jan.health).toBe(zl(830.58));
    expect(year.healthSettlement).toBe(0);
  });

  it("12% from revenue minus social and half of health", () => {
    // 15 000 - 1 926,76 - 415,29 = 12 657,95 -> 12 658; x 12% = 1 518,96 -> 1 519
    expect(jan.healthDeduction).toBe(zl(415.29));
    expect(jan.taxBase).toBe(zl(12_658));
    expect(jan.advance).toBe(zl(1519));
    expect(year.annualTax).toBe(zl(1519 * 12));
    expect(year.netYear).toBe(zl((15_000 - 1926.76 - 830.58 - 1519) * 12));
  });

  it("three health thresholds", () => {
    // 60% / 100% / 180% of 9 228,64 x 9%
    expect(ryczaltHealth(zl(60_000), rates)).toBe(zl(498.35));
    expect(ryczaltHealth(zl(300_000), rates)).toBe(zl(830.58));
    expect(ryczaltHealth(zl(300_000.01), rates)).toBe(zl(1495.04));
  });

  it("own rate, costs that do not count, deductions carried to the next month", () => {
    const off = Array<number>(12).fill(0);
    off[0] = 25;
    const input = plain(15_000, { ryczaltRate: 850, daysOffByMonth: off, costs: [cost(500, 2300, null)] });
    const y = calculateB2b(input, rates, "ryczalt");
    // January: no revenue, 1 926,76 + 415,29 = 2 342,05 carried to February
    expect(y.months[0]!.revenue).toBe(0);
    expect(y.months[0]!.advance).toBe(0);
    // February: 15 000 - 2 342,05 - 2 342,05 = 10 315,90 -> 10 316 x 8,5% = 876,86 -> 877
    expect(y.months[1]!.taxBase).toBe(zl(10_316));
    expect(y.months[1]!.advance).toBe(zl(877));
    expect(y.warnings).toContain("ryczalt-bez-kosztow");
  });

  it("revenue over the ryczałt limit", () => {
    expect(calculateB2b(plain(800_000), rates, "ryczalt").warnings).toContain("limit-ryczaltu");
  });
});

describe("B2B - IP Box", () => {
  it("5% of the qualified income in the yearly return, advances like liniowy, health 9%", () => {
    const y = calculateB2b(plain(15_000), rates, "ipbox");
    expect(y.months[0]!.health).toBe(zl(1176.59));
    // 156 878,88 -> 156 879 x 5% = 7 843,95 -> 7 844
    expect(y.annualTax).toBe(zl(7844));
    expect(y.taxSettlement).toBeLessThan(0);
    // 180 000 - 23 121,12 - 14 119,10 - 7 844
    expect(y.netYear).toBe(zl(134_915.78));
    expect(y.warnings).toContain("ip-box-ewidencja");
  });

  it("only a part qualified: the rest at 19% after the health deduction", () => {
    const y = calculateB2b(plain(15_000, { ipBox: { qualifiedPercent: 60 } }), rates, "ipbox");
    // qualified 94 127,33 -> 94 127 x 5% = 4 706,35 -> 4 706; rest 62 751,55 - health deducted up
    // to the limit 14 100 (12 x 1 176,59 = 14 119,08) = 48 651,55 -> 48 652 x 19% = 9 243,88 -> 9 244
    expect(y.annualTax).toBe(zl(4706 + 9244));
  });

  it("former employer: IP Box on the scale", () => {
    const y = calculateB2b(plain(15_000, { formerEmployer: true, ipBox: { qualifiedPercent: 50 } }), rates, "ipbox");
    // qualified 78 439,44 -> 78 439 x 5% = 3 921,95 -> 3 922; rest 78 439,44 on the scale:
    // 78 439 x 12% = 9 412,68 - 3 600 = 5 812,68 -> 5 813
    expect(y.annualTax).toBe(zl(3922 + 5813));
    expect(y.available).toBe(true);
  });
});

describe("B2B - ZUS stages", () => {
  it("default: new company on 1 January - ulga na start to June, preferential from July", () => {
    const y = calculateB2b(defaultB2bInput(zl(15_000), 2026), rates, "liniowy");
    for (let m = 0; m < 6; m++) {
      expect(y.months[m]!.stages).toEqual(["ulga-na-start"]);
      expect(y.months[m]!.social.total).toBe(0);
    }
    // 1 441,80 x 19,52% = 281,44; x 8% = 115,34; x 2,45% = 35,32; x 1,67% = 24,08; no Labour Fund
    expect(y.months[6]!.stages).toEqual(["preferencyjny"]);
    expect(y.months[6]!.social).toEqual({
      base: zl(1441.8), pension: zl(281.44), disability: zl(115.34), sickness: zl(35.32),
      accident: zl(24.08), laborFund: 0, total: zl(456.18),
    });
    // the minimum health still applies during ulga na start (January 314,96)
    expect(y.months[0]!.health).toBeGreaterThan(zl(314.96));
  });

  it("start on 15 March, no reliefs: base cut to 17 of 31 days, revenue to 12 of 22 business days", () => {
    const input = plain(10_000, { startDate: "2026-03-15", zus: { ...plain(0).zus, startRelief: false, preferential: false } });
    const y = calculateB2b(input, rates, "liniowy");
    expect(y.months[0]!.stages).toEqual([]);
    expect(y.months[0]!.health).toBe(0);
    expect(y.months[0]!.revenue).toBe(0);
    const mar = y.months[2]!;
    // 5 652 x 17 / 31 = 3 099,48: 605,02 + 247,96 + 75,94 + 51,76 + 75,94
    expect(mar.social.base).toBe(zl(3099.48));
    expect(mar.social.total).toBe(zl(1056.62));
    // 10 000 x 12 / 22 = 5 454,55
    expect(mar.revenue).toBe(zl(5454.55));
    expect(mar.days).toMatchObject({ business: 22, active: 12, invoiced: 12 });
  });

  it("two stages in one month: ulga na start ends on 14 September", () => {
    const y = calculateB2b(plain(10_000, { startDate: "2026-03-15" }), rates, "liniowy");
    const sep = y.months[8]!;
    expect(sep.stages).toEqual(["ulga-na-start", "preferencyjny"]);
    // 1 441,80 x 16 / 30 = 768,96
    expect(sep.social.base).toBe(zl(768.96));
    expect(y.months[9]!.social.base).toBe(zl(1441.8));
  });

  it("preferential ends after 24 months, then full ZUS", () => {
    const y = calculateB2b(plain(10_000, { startDate: "2024-05-01" }), rates, "liniowy");
    // ulga to 31.10.2024, preferential 1.11.2024 - 31.10.2026
    expect(y.months[9]!.stages).toEqual(["preferencyjny"]);
    expect(y.months[10]!.stages).toEqual(["pelny"]);
  });

  it("Mały ZUS Plus: half of the average monthly income of the previous year", () => {
    const smallZusPlus = { enabled: true, prevRevenue: zl(100_000), prevIncome: zl(60_000), prevDays: 365 };
    const input = plain(8000, { zus: { ...plain(0).zus, smallZusPlus } });
    expect(zusPlan(input, rates).smallZusBase).toBe(zl(2465.76));
    const jan = calculateB2b(input, rates, "skala").months[0]!;
    // 60 000 x 30 / 365 = 4 931,51 / 2 = 2 465,76: 481,32 + 197,26 + 60,41 + 41,18, no Labour Fund
    expect(jan.stages).toEqual(["maly-zus-plus"]);
    expect(jan.social.total).toBe(zl(780.17));
  });

  it("Mały ZUS Plus never under the preferential base and not over the full one", () => {
    const low = { enabled: true, prevRevenue: zl(20_000), prevIncome: zl(1000), prevDays: 365 };
    expect(zusPlan(plain(1, { zus: { ...plain(0).zus, smallZusPlus: low } }), rates).smallZusBase).toBe(zl(1441.8));
    const high = { ...low, prevIncome: zl(119_000), prevDays: 100 };
    expect(zusPlan(plain(1, { zus: { ...plain(0).zus, smallZusPlus: high } }), rates).smallZusBase).toBe(zl(5652));
  });

  it("Mały ZUS Plus refused: revenue over 120 000 zł or 60 days of business or less", () => {
    for (const prev of [{ prevRevenue: zl(130_000), prevDays: 365 }, { prevRevenue: zl(10_000), prevDays: 60 }]) {
      const smallZusPlus = { enabled: true, prevIncome: zl(50_000), ...prev };
      const y = calculateB2b(plain(8000, { zus: { ...plain(0).zus, smallZusPlus } }), rates, "skala");
      expect(y.months[0]!.stages).toEqual(["pelny"]);
      expect(y.warnings).toContain("maly-zus-plus-niedostepny");
    }
  });

  it("contribution holiday: no social contributions in April, health as usual", () => {
    const y = calculateB2b(plain(15_000, { contributionHoliday: 3 }), rates, "liniowy");
    expect(y.months[3]!.social.total).toBe(0);
    expect(y.months[3]!.holidaySaved).toBe(zl(1926.76));
    expect(y.months[3]!.health).toBeGreaterThan(0);
    expect(y.total.holidaySaved).toBe(zl(1926.76));
    // nothing to save during ulga na start
    const relief = calculateB2b(defaultB2bInput(zl(15_000), 2026), rates, "liniowy");
    const holiday = calculateB2b({ ...defaultB2bInput(zl(15_000), 2026), contributionHoliday: 0 }, rates, "liniowy");
    expect(holiday.netYear).toBe(relief.netYear);
  });
});

describe("B2B - former employer", () => {
  it("full ZUS from the start and no liniowy or ryczałt", () => {
    const input = { ...defaultB2bInput(zl(15_000), 2026), formerEmployer: true };
    const cmp = compareB2bForms(input, rates);
    expect(cmp.forms.skala.months[0]!.stages).toEqual(["pelny"]);
    expect(cmp.forms.liniowy.available).toBe(false);
    expect(cmp.forms.ryczalt.available).toBe(false);
    expect(cmp.best).toBe("skala");
    expect(cmp.forms.skala.warnings).toContain("byly-pracodawca");
  });
});

describe("B2B - which form is best", () => {
  it("15 000 zł, no costs: ryczałt; IP Box would give more", () => {
    const cmp = compareB2bForms(plain(15_000), rates);
    expect(cmp.best).toBe("ryczalt");
    expect(cmp.ipBoxBetter).toBe(true);
  });

  it("high costs: liniowy beats ryczałt", () => {
    const cmp = compareB2bForms(plain(30_000, { costs: [cost(12_000, 2300, null)] }), rates);
    expect(cmp.best).toBe("liniowy");
  });

  it("low revenue: the scale (tax-reducing amount)", () => {
    const cmp = compareB2bForms(plain(6000, { costs: [cost(2000, 2300, null)] }), rates);
    expect(cmp.best).toBe("skala");
  });
});

function cost(net: number, vatRate: number, month: number | null, kind: CostItem["kind"] = "zwykly"): CostItem {
  return { name: "test", amount: zl(net), vatRate, month, kind, enabled: true };
}

describe("B2B - costs and VAT", () => {
  const costs = [cost(5000, 2300, 2), cost(1000, 2300, null, "auto-mieszany"), { ...cost(300, 2300, null), enabled: false }];

  it("active VAT payer: VAT on the invoice, VAT from costs deducted, car 50% VAT and 75% costs", () => {
    const y = calculateB2b(plain(10_000, { costs }), rates, "liniowy");
    const mar = y.months[2]!;
    // laptop 5 000 + car 1 000 + 230 - 115 = 1 115 cash, 75% = 836,25 cost
    expect(mar.costsCash).toBe(zl(6115));
    expect(mar.costsTax).toBe(zl(5836.25));
    expect(mar.vatInput).toBe(zl(1265));
    expect(mar.vatOutput).toBe(zl(2300));
    expect(mar.vatDue).toBe(zl(1035));
    expect(y.months[0]!.costsCash).toBe(zl(1115));
    expect(y.warnings).not.toContain("srodek-trwaly");
  });

  it("client abroad: no Polish VAT on the invoice, VAT from costs comes back", () => {
    const mar = calculateB2b(plain(10_000, { costs, vat: "zagranica" }), rates, "liniowy").months[2]!;
    expect(mar.vatOutput).toBe(0);
    expect(mar.vatDue).toBe(-zl(1265));
    expect(mar.costsCash).toBe(zl(6115));
  });

  it("VAT exempt: costs with VAT, nothing deducted; warning over 240 000 zł", () => {
    const y = calculateB2b(plain(10_000, { costs, vat: "zwolniony" }), rates, "liniowy");
    const mar = y.months[2]!;
    // laptop 6 150 + car 1 230; car cost 75% x 1 230 = 922,50
    expect(mar.costsCash).toBe(zl(7380));
    expect(mar.costsTax).toBe(zl(7072.5));
    expect(mar.vatInput).toBe(0);
    expect(mar.vatOutput).toBe(0);
    expect(y.warnings).not.toContain("limit-zwolnienia-vat");
    expect(calculateB2b(plain(25_000, { vat: "zwolniony" }), rates, "liniowy").warnings).toContain("limit-zwolnienia-vat");
  });

  it("company car used only for the business: 100%", () => {
    const jan = calculateB2b(plain(10_000, { costs: [cost(1000, 2300, null, "auto-firmowy")] }), rates, "liniowy").months[0]!;
    expect(jan.costsTax).toBe(zl(1000));
    expect(jan.vatInput).toBe(zl(230));
  });

  it("equipment over 10 000 zł net is depreciated - warning", () => {
    expect(calculateB2b(plain(10_000, { costs: [cost(12_000, 2300, 4), cost(11_000, 2300, 5)] }), rates, "liniowy").warnings
      .filter((w) => w === "srodek-trwaly")).toHaveLength(1);
  });

  it("no costs before the company exists", () => {
    const y = calculateB2b(plain(10_000, { startDate: "2026-03-15", costs: [cost(100, 2300, null)] }), rates, "skala");
    expect(y.months[1]!.costsCash).toBe(0);
    expect(y.months[2]!.costsCash).toBe(zl(100));
  });
});

describe("B2B - rate per day and per hour", () => {
  it("January 2026 has 20 business days", () => {
    const daily = calculateB2b(plain(0, { rate: { kind: "dzienna", amount: zl(800), hoursPerDay: 8 } }), rates, "skala");
    expect(daily.months[0]!.revenue).toBe(zl(16_000));
    const hourly = calculateB2b(plain(0, { rate: { kind: "godzinowa", amount: zl(100), hoursPerDay: 7.5 } }), rates, "skala");
    expect(hourly.months[0]!.revenue).toBe(zl(15_000));
  });

  it("conversion by the 253 business days of 2026", () => {
    const monthly = { kind: "miesieczna" as const, amount: zl(15_000), hoursPerDay: 8 };
    // 15 000 x 12 / 253 = 711,46; / 8 = 88,93
    expect(convertRate(monthly, "dzienna", 2026)).toBe(zl(711.46));
    expect(convertRate(monthly, "godzinowa", 2026)).toBe(zl(88.93));
    expect(convertRate(monthly, "miesieczna", 2026)).toBe(zl(15_000));
    const daily = { kind: "dzienna" as const, amount: zl(800), hoursPerDay: 8 };
    // 800 x 253 / 12 = 16 866,67
    expect(convertRate(daily, "miesieczna", 2026)).toBe(zl(16_866.67));
    const hourly = { kind: "godzinowa" as const, amount: zl(100), hoursPerDay: 8 };
    expect(convertRate(hourly, "godzinowa", 2026)).toBe(zl(100));
    expect(convertRate(hourly, "dzienna", 2026)).toBe(zl(800));
  });
});

describe("B2B - days off and sickness", () => {
  it("26 unpaid days off cut the invoices, 5 paid days off from the contract go first", () => {
    const input = plain(15_000, { daysOffByMonth: defaultB2bInput(0, 2026).daysOffByMonth, paidDaysOff: 5 });
    const y = calculateB2b(input, rates, "liniowy");
    // February: 2 days off, both paid; May: 5 days off, 3 paid
    expect(y.months[1]!.days).toMatchObject({ daysOff: 2, paid: 2, invoiced: 20, worked: 18 });
    expect(y.months[4]!.days).toMatchObject({ daysOff: 5, paid: 3, invoiced: 18 });
    // July 2026: 23 business days, 10 off -> 15 000 x 13 / 23 = 8 478,26
    expect(y.months[6]!.revenue).toBe(zl(8478.26));
    expect(y.days).toMatchObject({ business: 253, daysOff: 26, invoiced: 253 - 21, worked: 253 - 26 });
  });

  it("10 sick days in February with voluntary insurance: allowance 80% from ZUS, smaller social base", () => {
    const y = calculateB2b(plain(15_000, { sickness: { days: 10, startMonth: 1, kind: "zwykla" } }), rates, "liniowy");
    const feb = y.months[1]!;
    // (5 652 - 774,89) x 80% / 30 = 130,06 a day x 10
    expect(feb.allowance).toBe(zl(1300.6));
    expect(feb.allowanceAdvance).toBe(zl(156));
    expect(feb.days).toMatchObject({ sickCalendar: 10, sickWorking: 7, allowanceDays: 10, invoiced: 13 });
    // 15 000 x 13 / 20 = 9 750
    expect(feb.revenue).toBe(zl(9750));
    // base 5 652 x 18 / 28 = 3 633,43: 709,25 + 290,67 + 89,02 + 60,68 + 89,02
    expect(feb.social.base).toBe(zl(3633.43));
    expect(feb.social.total).toBe(zl(1238.64));
    // the allowance is taxed on the scale on its own: 1 301 x 12% = 156,12 < 3 600 -> the 156 zł
    // ZUS took comes back in the yearly return
    expect(y.taxSettlement).toBe(-zl(156));
  });

  it("pregnancy: 100%", () => {
    const y = calculateB2b(plain(15_000, { sickness: { days: 1, startMonth: 1, kind: "ciaza-wypadek" } }), rates, "skala");
    // 4 877,11 / 30 = 162,57
    expect(y.months[1]!.allowance).toBe(zl(162.57));
  });

  it("no allowance in the first 90 days of insurance (from 1 April for a company from 1 January)", () => {
    const zus = { ...plain(0).zus, startRelief: false, preferential: false };
    const y = calculateB2b(plain(15_000, { startDate: "2026-01-01", zus, sickness: { days: 40, startMonth: 2, kind: "zwykla" } }), rates, "skala");
    expect(y.months[2]!.days.allowanceDays).toBe(0);
    expect(y.months[3]!.days.allowanceDays).toBe(9);
    expect(y.warnings).toContain("chorobowe-bez-zasilku");
  });

  it("no allowance during ulga na start, none without voluntary insurance", () => {
    const relief = calculateB2b(defaultB2bInput(zl(15_000), 2026), rates, "skala");
    expect(relief.total.allowance).toBe(0);
    expect(relief.warnings).toContain("chorobowe-bez-zasilku");
    const none = calculateB2b(plain(15_000, { voluntarySickness: false, sickness: { days: 10, startMonth: 1, kind: "zwykla" } }), rates, "skala");
    expect(none.total.allowance).toBe(0);
    expect(none.warnings).not.toContain("chorobowe-bez-zasilku");
    expect(none.months[1]!.revenue).toBe(zl(9750));
  });

  it("on the scale the allowance joins the business income", () => {
    const sick = calculateB2b(plain(15_000, { sickness: { days: 10, startMonth: 1, kind: "zwykla" } }), rates, "skala");
    expect(sick.annualTax).toBe(annualScaleTax(sick.total.healthIncome + zl(1300.6), rates));
  });
});

describe("B2B - other cases", () => {
  it("own accident rate", () => {
    const jan = calculateB2b(plain(15_000, { accidentRate: 93 }), rates, "liniowy").months[0]!;
    // 5 652 x 0,93% = 52,56
    expect(jan.social.accident).toBe(zl(52.56));
  });

  it("zero revenue: minimum health, no tax", () => {
    const y = calculateB2b(plain(0), rates, "skala");
    expect(y.months[0]!.health).toBe(zl(314.96));
    expect(y.months[1]!.health).toBe(zl(432.54));
    expect(y.total.advance).toBe(0);
    expect(y.annualTax).toBe(0);
    expect(y.healthSettlement).toBe(0);
    expect(y.netYear).toBe(-(zl(1926.76) * 12 + zl(314.96) + zl(432.54) * 11));
  });

  it("a missing days-off plan means no days off", () => {
    const y = calculateB2b(plain(15_000, { daysOffByMonth: [] }), rates, "liniowy");
    expect(y.days.daysOff).toBe(0);
  });

  it("2027: January minimum health 432,54 zł, from February 445,50 zł", () => {
    const r2027 = loadRates(rates2027 as RatesFile);
    const y = calculateB2b({ ...plain(0), startDate: "2020-01-01" }, r2027, "liniowy");
    expect(y.months[0]!.health).toBe(zl(432.54));
    expect(y.months[1]!.health).toBe(zl(445.5));
  });
});

describe("B2B - dates", () => {
  it("parses ISO dates and refuses others", () => {
    expect(parseDate("2026-03-15")).toBe(Date.UTC(2026, 2, 15));
    expect(() => parseDate("15.03.2026")).toThrow();
  });

  it("adds months, the last day of a shorter month", () => {
    expect(addMonths(Date.UTC(2026, 7, 31), 6)).toBe(Date.UTC(2027, 1, 28));
    expect(addMonths(Date.UTC(2026, 0, 1), 6)).toBe(Date.UTC(2026, 6, 1));
  });
});

describe("B2B - properties", () => {
  it("the 12 months add up to the year", () => {
    const y = calculateB2b(defaultB2bInput(zl(18_000), 2026), rates, "skala");
    expect(y.total.net).toBe(y.months.reduce((s, m) => s + m.net, 0));
    expect(y.netYear).toBe(y.total.net - y.taxSettlement - y.healthSettlement);
  });

  it("a higher rate never gives less net in any form", () => {
    for (const form of ["skala", "liniowy", "ryczalt", "ipbox"] as const) {
      let previous = -Infinity;
      for (let monthly = 0; monthly <= 60_000; monthly += 2500) {
        const net = calculateB2b(defaultB2bInput(zl(monthly), 2026), rates, form).netYear;
        expect(net, `${form} ${monthly}`).toBeGreaterThanOrEqual(previous);
        previous = net;
      }
    }
  });
});
