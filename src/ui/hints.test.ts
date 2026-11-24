import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import { formatZl, type Money } from "../calc/money";
import { loadRates, type RatesFile } from "../calc/rates";
import type { HintText } from "./Hint";
import { hints, MAIN_HINTS } from "./hints";

const r2026 = loadRates(rates2026 as RatesFile);
const r2027 = loadRates(rates2027 as RatesFile, "z-projektami");
const years = [
  ["2026", r2026],
  ["2027", r2027],
] as const;

const zl = (m: Money) => formatZl(m, m % 100 !== 0);
const all = (h: Record<string, HintText>) => Object.entries(h);

describe("dymki „?”", () => {
  for (const [year, r] of years) {
    const list = [...all(MAIN_HINTS), ...all(hints(r))];

    it(`${year}: every hint has a real text and an https link (if any)`, () => {
      for (const [key, h] of list) {
        expect(h.text.length, key).toBeGreaterThan(40);
        expect(h.text, key).not.toMatch(/undefined|NaN|null|\[object/);
        expect(h.text, key).not.toMatch(/[–—]/);
        if (h.more) {
          expect(h.more.url, key).toMatch(/^https:\/\//);
          expect(h.more.label.trim(), key).not.toBe("");
          expect(h.more.label, key).not.toMatch(/[–—]|undefined/);
        }
      }
    });

    it(`${year}: amounts come from the rates of that year`, () => {
      const h = hints(r);
      expect(h.commuter.text).toContain(zl(r.employeeCosts));
      expect(h.commuter.text).toContain(zl(r.employeeCostsCommuter));
      expect(h.zeroPit.text).toContain(zl(r.zeroPitLimit));
      expect(h.authors.text).toContain(zl(r.authorsCostsLimit));
      expect(h.preferential.text).toContain(zl(r.preferentialBase));
      expect(h.smallZusPlus.text).toContain(zl(r.smallZusRevenueLimit));
      expect(h.vat.text).toContain(zl(r.vatExemptLimit));
      expect(h.job.text).toContain(zl(r.employeeCostsMultiLimit));
      expect(h.over50.text).toContain(String(r.sickPayEmployerDaysOver50));
    });
  }

  it("the minimal-wage based amounts change with the year", () => {
    expect(r2027.preferentialBase).not.toBe(r2026.preferentialBase);
    expect(hints(r2027).preferential.text).not.toBe(hints(r2026).preferential.text);
  });
});
