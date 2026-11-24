import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { zl } from "./money";
import { loadRates, type RatesFile } from "./rates";
import { annualScaleTax, monthlyAdvance, scaleTax } from "./tax";

const rates = loadRates(rates2026 as RatesFile);
const scale3 = [
  { upTo: zl(130_000), rate: 1200 },
  { upTo: zl(150_000), rate: 2400 },
  { upTo: null, rate: 3200 },
];

describe("PIT scale", () => {
  it("2026 scale: 12% up to 120 000, 32% above", () => {
    expect(scaleTax(zl(120_000), rates.pitScale)).toBe(zl(14_400));
    expect(scaleTax(zl(150_000), rates.pitScale)).toBe(zl(14_400 + 9600));
    expect(scaleTax(0, rates.pitScale)).toBe(0);
  });

  it("three brackets (2027 bill: 12% / 24% / 32%)", () => {
    // 130 000 x 12% = 15 600; 20 000 x 24% = 4 800; 50 000 x 32% = 16 000
    expect(scaleTax(zl(200_000), scale3)).toBe(zl(36_400));
    expect(scaleTax(zl(140_000), scale3)).toBe(zl(15_600 + 2400));
  });

  it("annual tax: no tax up to 30 000 zł, rounding to full złoty", () => {
    expect(annualScaleTax(zl(30_000), rates)).toBe(0);
    expect(annualScaleTax(zl(-100), rates)).toBe(0);
    // 30 004,49 -> 30 004 x 12% = 3 600,48 - 3 600 = 0,48 -> 0
    expect(annualScaleTax(zl(30_004.49), rates)).toBe(0);
    // 30 005 x 12% = 3 600,60 - 3 600 -> 1
    expect(annualScaleTax(zl(30_005), rates)).toBe(zl(1));
  });

  it("monthly advance never below zero", () => {
    expect(monthlyAdvance(zl(2000), 0, rates)).toBe(0);
    expect(monthlyAdvance(0, zl(5000), rates)).toBe(0);
  });
});
