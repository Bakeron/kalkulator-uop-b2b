import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import { ITEM_KEYS, loadRates, type RatesFile } from "./rates";

const file2026 = rates2026 as RatesFile;
const file2027 = rates2027 as RatesFile;

describe("rates files", () => {
  for (const file of [file2026, file2027]) {
    it(`${file.year}: every number has its value, source, link and check date`, () => {
      expect(Object.keys(file.items).sort()).toEqual([...ITEM_KEYS].sort());
      for (const key of ITEM_KEYS) {
        const item = file.items[key];
        expect(item.value, key).toBeDefined();
        expect(item.source.length, key).toBeGreaterThan(3);
        expect(item.url, key).toMatch(/^https:\/\//);
        expect(item.checked, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(["pewne", "uchwalone", "projekt", "szacunek", "doniesienie"], key).toContain(item.status);
        if (item.pending) {
          expect(item.pending.url, key).toMatch(/^https:\/\//);
          expect(item.pending.status, key).not.toBe("pewne");
        }
      }
    });
  }
});

describe("loadRates", () => {
  it("turns złoty and percent into grosze and basis points", () => {
    const r = loadRates(file2026);
    expect(r.year).toBe(2026);
    expect(r.minWage).toBe(480_600);
    expect(r.pensionEmployee).toBe(976);
    expect(r.pitScale).toEqual([{ upTo: 12_000_000, rate: 1200 }, { upTo: null, rate: 3200 }]);
    expect(r.usedPending).toEqual([]);
  });

  it("2027: the bill from print 3293 only with the variant that includes it", () => {
    const sure = loadRates(file2027, "pewne");
    expect(sure.pitScale).toHaveLength(2);
    expect(sure.authorsCostsLimit).toBe(12_000_000);
    const bills = loadRates(file2027, "z-projektami");
    expect(bills.pitScale).toEqual([
      { upTo: 13_000_000, rate: 1200 },
      { upTo: 15_000_000, rate: 2400 },
      { upTo: null, rate: 3200 },
    ]);
    expect(bills.authorsCostsLimit).toBe(13_000_000);
    expect(bills.ryczaltLimit).toBe(109_425_000);
    expect(bills.usedPending.sort()).toEqual(["authorsCostsLimit", "pitScale", "ryczaltLimit"]);
  });

  it("derived numbers agree with their rules", () => {
    for (const r of [loadRates(file2026), loadRates(file2027)]) {
      // preferential base 30% of the minimum wage, full base 60% of the forecast average wage
      expect(r.preferentialBase).toBe(Math.round(r.minWage * 0.3));
      expect(r.fullBase).toBe(Math.round(r.avgWageForecast * 0.6));
      // 30x limit, health minimum 9% of the minimum wage
      expect(r.zusAnnualLimit).toBe(r.avgWageForecast * 30);
      expect(r.healthMin).toBe(Math.round(r.minWage * 0.09));
      expect(r.ryczaltHealthThresholds).toEqual([6_000_000, 30_000_000]);
    }
  });

  it("uses pending values only with the variant that includes bills", () => {
    const pending = {
      ...file2026.items.pitScale,
      status: "uchwalone" as const,
      value: [[130_000, 12], [150_000, 24], [null, 32]] as RatesFile["items"]["pitScale"]["value"],
    };
    const file: RatesFile = { ...file2026, items: { ...file2026.items, pitScale: { ...file2026.items.pitScale, pending } } };
    expect(loadRates(file, "pewne").pitScale).toHaveLength(2);
    const withBills = loadRates(file, "z-projektami");
    expect(withBills.pitScale).toHaveLength(3);
    expect(withBills.usedPending).toEqual(["pitScale"]);
  });
});
