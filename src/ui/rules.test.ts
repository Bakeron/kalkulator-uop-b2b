import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import type { RatesFile } from "../calc/rates";
import { counted, fileOn, ratesFor, rulesOptions, upcomingChanges, valueText } from "./rules";

const f26 = rates2026 as RatesFile;
const f27 = rates2027 as RatesFile;
const files = [f26, f27];
/** Amounts use non-breaking spaces - compare them as plain ones. */
const plain = (t: string) => t.replace(/[  ]/g, " ");

describe("rulesOptions", () => {
  it("in 2026: today, 2027 sure and 2027 with bills", () => {
    const o = rulesOptions(files, new Date(2026, 10, 24));
    expect(o.map((x) => [x.key, x.year, x.variant])).toEqual([
      ["dzis", 2026, "pewne"],
      ["nastepny", 2027, "pewne"],
      ["nastepny-projekty", 2027, "z-projektami"],
    ]);
    expect(o[0]!.mark).toBeNull();
    expect(o[1]!.label).toBe("Od 1.01.2027 - pewne zmiany");
    expect(o[2]!.mark).toMatch(/nie obowiązują/);
  });

  it("from 1.01.2027 without a 2028 file: today's 2027 and its bills", () => {
    const o = rulesOptions(files, new Date(2027, 0, 1));
    expect(o.map((x) => [x.key, x.year, x.variant])).toEqual([
      ["dzis", 2027, "pewne"],
      ["dzis-projekty", 2027, "z-projektami"],
    ]);
  });

  it("no bills in the next file - no option with bills", () => {
    const plain: RatesFile = {
      ...f27,
      items: Object.fromEntries(Object.entries(f27.items).map(([k, v]) => [k, { ...v, pending: undefined }])) as RatesFile["items"],
    };
    expect(rulesOptions([f26, plain], new Date(2026, 5, 1)).map((x) => x.key)).toEqual(["dzis", "nastepny"]);
    expect(rulesOptions([plain], new Date(2027, 5, 1)).map((x) => x.key)).toEqual(["dzis"]);
  });

  it("a date before every file uses the earliest one", () => {
    expect(fileOn(files, new Date(2020, 0, 1)).year).toBe(2026);
    expect(fileOn(files, new Date(2031, 0, 1)).year).toBe(2027);
  });
});

describe("ratesFor", () => {
  it("loads the year and variant, once", () => {
    const a = ratesFor({ year: 2027, variant: "z-projektami" });
    expect(a.year).toBe(2027);
    expect(a.pitScale).toHaveLength(3);
    expect(ratesFor({ year: 2027, variant: "z-projektami" })).toBe(a);
    expect(ratesFor({ year: 2026, variant: "pewne" }).year).toBe(2026);
  });
});

describe("upcomingChanges", () => {
  const changes = upcomingChanges(f26, f27);
  const find = (title: string, pending = false) => {
    const c = changes.find((x) => x.title === title && x.pending === pending)!;
    return { ...c, what: plain(c.what) };
  };

  it("sure changes first, then passed, then the rest", () => {
    const order = changes.map((c) => c.group);
    expect(order).toEqual([...order].sort((a, b) => ["pewne", "uchwalone", "niepewne"].indexOf(a) - ["pewne", "uchwalone", "niepewne"].indexOf(b)));
    expect(find("Płaca minimalna")).toMatchObject({ group: "pewne", what: "4 806 zł → 4 950 zł", from: "od 1.01.2027", inCalc: true });
    expect(find("Najniższa składka zdrowotna").what).toBe("432,54 zł → 445,50 zł");
  });

  it("the bill from print 3293 as passed, the old values stay out of the list", () => {
    expect(find("Skala podatkowa", true)).toMatchObject({
      group: "uchwalone",
      what: "12% do 120 000 zł, 32% powyżej → 12% do 130 000 zł, 24% do 150 000 zł, 32% powyżej",
    });
    expect(changes.find((c) => c.title === "Skala podatkowa" && !c.pending)).toBeUndefined();
    expect(changes.filter((c) => c.group === "uchwalone").map((c) => c.title).sort()).toEqual(
      ["Limit kosztów autorskich w roku", "Limit przychodu na ryczałcie", "Skala podatkowa"].sort(),
    );
  });

  it("estimates and budget bills even without a change of the number, and the bills without numbers", () => {
    expect(find("Składka wypadkowa")).toMatchObject({ group: "niepewne", what: "bez zmian: 1,67%" });
    expect(find("Fundusz Pracy i Solidarnościowy").status).toBe("projekt");
    const sick = find("Chorobowe w ciąży od 1. dnia z ZUS");
    expect(sick).toMatchObject({ group: "niepewne", inCalc: false, from: "30 dni po ogłoszeniu ustawy" });
    expect(find("Chorobowe od 1. dnia z ZUS dla wszystkich").status).toBe("doniesienie");
    expect(changes.every((c) => c.url.startsWith("https://"))).toBe(true);
  });

  it("without the next file - only what waits in today's file", () => {
    const list = upcomingChanges(f27, null);
    expect(list.every((c) => c.pending || !c.inCalc)).toBe(true);
    expect(list[0]!.from).toBe("po wejściu w życie");
  });

  it("counted: what the chosen rules put into the result", () => {
    const sure = find("Płaca minimalna");
    const bill = find("Skala podatkowa", true);
    const words = find("Chorobowe w ciąży od 1. dnia z ZUS");
    expect(counted(sure, { year: 2026, variant: "pewne" }, f27)).toBe(false);
    expect(counted(sure, { year: 2027, variant: "pewne" }, f27)).toBe(true);
    expect(counted(bill, { year: 2027, variant: "pewne" }, f27)).toBe(false);
    expect(counted(bill, { year: 2027, variant: "z-projektami" }, f27)).toBe(true);
    expect(counted(words, { year: 2027, variant: "z-projektami" }, f27)).toBe(false);
  });
});

describe("valueText", () => {
  it("every unit", () => {
    expect(plain(valueText("minWage", 4806))).toBe("4 806 zł");
    expect(plain(valueText("pensionEmployee", 9.76))).toBe("9,76%");
    expect(plain(valueText("sickPayEmployerDays", 33))).toBe("33 dni");
    expect(plain(valueText("preferentialMonths", 24))).toBe("24 mies.");
    expect(plain(valueText("ryczaltHealthThresholds", [60000, 300000]))).toBe("60 000 zł i 300 000 zł");
    expect(plain(valueText("childRelief", [1112.04, 2700]))).toBe("1 112,04 zł / 2 700 zł");
  });
});
