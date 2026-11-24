import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT_USD, canAsk, costUsd, parseSpending, priceOf, record, spentToday, usd } from "./spend";

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("spending", () => {
  it("prices a model by the beginning of its name", () => {
    expect(priceOf("claude-sonnet-5-5")).toEqual({ input: 2, output: 10, cacheRead: 0.1 });
    expect(priceOf("Claude-Sonnet-5-5-20261001")).toEqual({ input: 2, output: 10, cacheRead: 0.1 });
    expect(priceOf("claude-sonnet-5").cacheRead).toBe(0.2);
    // Unknown or a name that only starts the same: the high price.
    expect(priceOf("claude-sonnet-55").input).toBe(5);
  });

  it("counts tokens, cache and searches", () => {
    // 100 000 in x 2 $ + 10 000 out x 10 $ + 50 000 cache read x 0.1 $ + 1 000 cache write x 2.5 $ per million, 5 searches x 0.01 $.
    near(costUsd({ model: "claude-sonnet-5-5", input: 100_000, output: 10_000, cacheRead: 50_000, cacheWrite: 1_000, searches: 5 }), 0.2 + 0.1 + 0.005 + 0.0025 + 0.05);
    near(costUsd({ model: "claude-sonnet-5-5", input: -5, output: NaN, cacheRead: 0, cacheWrite: 0, searches: 0 }), 0);
  });

  it("adds up a day and keeps the limit", () => {
    const today = new Date(2026, 10, 24, 15);
    let s = parseSpending(null);
    expect(s.limitUsd).toBe(DEFAULT_LIMIT_USD);
    s = record(s, 0.3, today);
    s = record(s, 0.25, today);
    near(spentToday(s, today), 0.55);
    expect(canAsk(s, today)).toBe(true);
    s = record(s, 0.1, today);
    // 0.65 + up to 0.4 for the next one is over 1 $.
    expect(canAsk(s, today)).toBe(false);
    expect(canAsk(s, new Date(2026, 10, 25))).toBe(true);
    // Old days are dropped.
    const later = record(s, 0.1, new Date(2027, 1, 1));
    expect(Object.keys(later.days)).toEqual(["2027-02-01"]);
  });

  it("reads back only sound data", () => {
    expect(parseSpending({ days: { "2026-11-24": 0.5, x: 1, "2026-11-23": -1 }, limitUsd: 1000 })).toEqual({ days: { "2026-11-24": 0.5 }, limitUsd: 1 });
    expect(parseSpending({ limitUsd: 2.5 }).limitUsd).toBe(2.5);
  });

  it("writes dollars the Polish way", () => {
    expect(usd(0.234)).toBe("0,23 $");
  });
});
