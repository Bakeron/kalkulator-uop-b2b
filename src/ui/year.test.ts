import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { loadRates, type RatesFile } from "../calc/rates";
import { defaultScenario, mainResult } from "./model";
import { monthlyDeadlines, unpaidDays, yearlyDeadlines, yearTape } from "./year";

const rates = loadRates(rates2026 as RatesFile);

function tapeOf(edit: (s: ReturnType<typeof defaultScenario>) => void = () => {}) {
  const s = defaultScenario();
  edit(s);
  const r = mainResult(s, rates);
  return { tape: yearTape(r.comparison.uop, r.b2bShown), r };
}

describe("yearTape", () => {
  it("every business day of the month is on both tapes exactly once", () => {
    const { tape } = tapeOf();
    expect(tape).toHaveLength(12);
    for (const t of tape) {
      expect(t.days).toBeGreaterThan(17);
      expect(t.uop.worked + t.uop.vacation + t.uop.sick).toBe(t.days);
      expect(t.b2b.worked + t.b2b.paid + t.b2b.vacation + t.b2b.sick + t.b2b.inactive).toBe(t.days);
    }
    // 2026: 261 weekdays minus 8 holidays on weekdays (1.01, 6.01, 6.04, 1.05, 4.06, 11.11, 24.12, 25.12).
    expect(tape.reduce((a, t) => a + t.days, 0)).toBe(253);
  });

  it("the default year: the same days off on both tapes, unpaid only on B2B", () => {
    const { tape } = tapeOf();
    const uopOff = tape.reduce((a, t) => a + t.uop.vacation + t.uop.sick, 0);
    expect(uopOff).toBe(unpaidDays(tape));
    expect(tape.every((t) => t.b2b.paid === 0 && t.b2b.inactive === 0)).toBe(true);
    // The month table and the tape show the same net.
    expect(tape[6]!.b2bNet).toBeLessThan(tape[0]!.b2bNet);
  });

  it("paid days off in the B2B contract are invoiced, not cut off", () => {
    const { tape } = tapeOf((s) => {
      s.b2b = { ...s.b2b, paidDaysOff: 20 };
    });
    const paid = tape.reduce((a, t) => a + t.b2b.paid, 0);
    expect(paid).toBe(20);
    const off = tape.reduce((a, t) => a + t.uop.vacation + t.uop.sick, 0);
    expect(unpaidDays(tape)).toBe(off - 20);
  });

  it("a company started in the year: the days before it are not on the B2B tape", () => {
    const { tape } = tapeOf((s) => {
      s.b2b = { ...s.b2b, startDate: "2026-03-01" };
    });
    expect(tape[0]!.b2b.inactive).toBe(tape[0]!.days);
    expect(tape[1]!.b2b.inactive).toBe(tape[1]!.days);
    expect(tape[2]!.b2b.inactive).toBe(0);
  });
});

describe("deadlines", () => {
  it("monthly: salary by the 10th, ZUS and the advance by the 20th, VAT only for a VAT payer", () => {
    expect(monthlyDeadlines(false).map((d) => d.day)).toEqual([10, 20, 20]);
    const withVat = monthlyDeadlines(true);
    expect(withVat.at(-1)).toMatchObject({ day: 25, who: "b2b" });
    for (const d of withVat) expect(d.source).toMatch(/art\. \d+/);
  });

  it("yearly: in the next year, the return form follows the tax form", () => {
    const ryczalt = yearlyDeadlines("ryczalt", 2026);
    expect(ryczalt.map((d) => d.date)).toEqual(["28 lutego 2027", "30 kwietnia 2027", "30 kwietnia 2027", "20 maja 2027"]);
    expect(ryczalt[2]!.what).toContain("PIT-28");
    expect(ryczalt[2]!.source).toContain("ryczałcie");
    expect(yearlyDeadlines("liniowy", 2027)[2]!.what).toContain("PIT-36L");
    expect(yearlyDeadlines("skala", 2027)[2]!.source).toContain("ustawa o PIT");
  });
});
