import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import { loadRates, type RatesFile } from "../calc/rates";
import { knowledge, type Chapter } from "./guide";

const k2026 = knowledge(loadRates(rates2026 as RatesFile));
const k2027 = knowledge(loadRates(rates2027 as RatesFile, "z-projektami"));

const allText = (chapters: Chapter[]) =>
  chapters
    .flatMap((c) => [c.title, c.lead, ...(c.table ? c.table.rows.flat() : []), ...c.sections.flatMap((s) => [s.title, ...s.body.flat()])])
    .join("\n")
    .replace(/ /g, " ");

describe("Co warto wiedzieć", () => {
  it("the seven chapters of the assumptions, each with a unique id", () => {
    expect(k2026.map((c) => c.title)).toEqual([
      "Formy opodatkowania",
      "ZUS na B2B",
      "VAT",
      "Księgowość",
      "Na co uważać",
      "Założenie i codzienność firmy",
      "Umowa o pracę",
    ]);
    expect(new Set(k2026.map((c) => c.id)).size).toBe(7);
  });

  it("every section has a source with an https address", () => {
    for (const c of k2026) {
      for (const s of c.sections) {
        expect(s.sources.length, s.title).toBeGreaterThan(0);
        for (const src of s.sources) expect(src.url, s.title).toMatch(/^https:\/\//);
      }
    }
  });

  it("the forms table has a value for every form in every row", () => {
    const t = k2026[0]!.table!;
    for (const row of t.rows) expect(row).toHaveLength(t.forms.length + 1);
  });

  it("amounts come from the rates of the year", () => {
    const t26 = allText(k2026);
    expect(t26).toContain("12% do 120 000 zł dochodu, 32% powyżej");
    expect(t26).toContain("pierwsze 30 000 zł dochodu jest bez podatku");
    expect(t26).toContain("od podstawy 1 441,80 zł");
    expect(t26).toContain("o 300 zł");
    const t27 = allText(k2027);
    expect(t27).toContain("12% do 130 000 zł dochodu, 24% do 150 000 zł, 32% powyżej");
    expect(t27).toContain("od podstawy 1 485 zł");
  });

  it("plain text rules: short dash only, no undefined values", () => {
    const t = allText(k2026);
    expect(t).not.toMatch(/[–—]/);
    expect(t).not.toMatch(/undefined|NaN/);
  });
});
