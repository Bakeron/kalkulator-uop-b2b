import { describe, expect, it } from "vitest";
import { formatZl, fraction, ofRate, pct, sum, toFullZl, zl } from "./money";

describe("money", () => {
  it("converts złoty and percent to integers", () => {
    expect(zl(4806)).toBe(480_600);
    expect(zl(1441.8)).toBe(144_180);
    expect(zl(0.1 + 0.2)).toBe(30); // float noise does not reach the result
    expect(pct(9.76)).toBe(976);
    expect(pct(0.1)).toBe(10);
  });

  it("rounds a contribution half up to the grosz", () => {
    // 8 629,00 zł x 9% = 776,61 zł
    expect(ofRate(862_900, 900)).toBe(77_661);
    // 0,05 zł x 50% = 0,025 -> 0,03 zł
    expect(ofRate(5, 5000)).toBe(3);
    expect(ofRate(3, 5000)).toBe(2); // 0,015 -> 0,02
    expect(ofRate(1, 4900)).toBe(0); // 0,0049 -> 0
    expect(ofRate(-5, 5000)).toBe(-3); // symmetric for negative amounts
  });

  it("takes a fraction of an amount", () => {
    // 1/30 of 10 000 zł = 333,333... -> 333,33 zł
    expect(fraction(1_000_000, 1, 30)).toBe(33_333);
    expect(fraction(1_000_000, 2, 3)).toBe(666_667);
  });

  it("rounds to full złoty as Ordynacja podatkowa art. 63", () => {
    expect(toFullZl(837_949)).toBe(837_900);
    expect(toFullZl(837_950)).toBe(838_000);
    expect(toFullZl(0)).toBe(0);
    expect(toFullZl(-150)).toBe(-200);
  });

  it("sums and formats in Polish", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
    expect(formatZl(1_234_567)).toBe("12\u00a0345,67\u00a0zł");
    expect(formatZl(-5)).toBe("-0,05\u00a0zł");
    expect(formatZl(100_000_000, false)).toBe("1\u00a0000\u00a0000\u00a0zł");
  });
});
