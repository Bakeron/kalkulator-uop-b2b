// @ts-expect-error type error without @types/node package (as in vite.config.ts)
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import { loadRates, type RatesFile } from "../calc/rates";
import { resultMoney } from "./currency";
import { defaultScenario, mainResult } from "./model";
import { pdfBytes, pdfName, reportOf, type ReportInput } from "./pdf";

const rates = loadRates(rates2026 as RatesFile);
const font = (w: string) => readFileSync(new URL(`../assets/pdf/AtkinsonHyperlegibleNext-${w}.ttf`, import.meta.url));

function input(over: Partial<ReportInput> = {}): ReportInput {
  const s = defaultScenario();
  const r = mainResult(s, rates);
  return {
    today: new Date(2026, 10, 24),
    year: 2026,
    rulesMark: null,
    checked: "2026-11-20",
    answer: ["B2B daje o 1 234 zł miesięcznie więcej na rękę.", "Żeby wyjść tak samo, na B2B trzeba wziąć co najmniej 12 000 zł."],
    uopGross: s.uopGross,
    b2bRate: s.b2bRate,
    uop: r.comparison.uop,
    b2b: r.b2bShown,
    b2bTitle: "B2B na ryczałcie 12%",
    form: "ryczalt",
    assumptions: ["Umowa o pracę: PPK włączone, koszty pracy 250 zł."],
    money: resultMoney("PLN", null),
    rateNote: null,
    link: "https://szymonbakonis.pl/kalkulator-uop-b2b/#s=e30",
    ...over,
  };
}

describe("reportOf", () => {
  it("has both offers, 12 months with the yearly return and the total, and the simulation note", () => {
    const rep = reportOf(input());
    expect(rep.meta).toBe("Stan na 24.11.2026 · przepisy na 2026 rok · stawki sprawdzone 20.11.2026");
    expect(rep.offers.rows.map((r) => r.map((c) => c.replace(/ /g, " ")))).toEqual([
      ["Umowa o pracę - brutto miesięcznie", "12 000 zł"],
      ["B2B - netto na fakturze miesięcznie (bez VAT)", "15 000 zł"],
    ]);
    expect(rep.months.rows).toHaveLength(12);
    expect(rep.months.rows[0]![0]).toBe("styczeń");
    expect(rep.months.foot.map((r) => r[0])).toEqual(["Rozliczenie roczne", "Razem w roku"]);
    expect(rep.breakdowns.map((b) => b.title)).toEqual(["Umowa o pracę", "B2B na ryczałcie 12%"]);
    expect(rep.breakdowns[1]!.table.rows.some((r) => r[0] === "- Ryczałt")).toBe(true);
    expect(rep.breakdowns[1]!.note).toMatch(/^Do tego VAT/);
    expect(rep.notes.at(-1)).toMatch(/^To symulacja, nie porada podatkowa/);
    expect(rep.months.widths.reduce((a, b) => a + b)).toBeCloseTo(1);
  });

  it("marks the amount computed from the other one (plan A26)", () => {
    const rows = (d: "uop" | "b2b") => reportOf(input({ derived: d })).offers.rows.map((r) => r[0]);
    expect(rows("b2b")).toEqual(["Umowa o pracę - brutto miesięcznie", "B2B - netto na fakturze miesięcznie (bez VAT) (wyliczone)"]);
    expect(rows("uop")[0]).toBe("Umowa o pracę - brutto miesięcznie (wyliczone)");
  });

  it("says which rules and the exchange rate when they are not the default", () => {
    const rep = reportOf(input({ rulesMark: "Liczone razem z ustawami, które jeszcze nie obowiązują.", rateNote: "Przeliczone ze złotych po średnim kursie NBP z 24.11.2026 (1 € = 4,2500 zł)." }));
    expect(rep.notes[0]).toMatch(/^Liczone razem z ustawami/);
    expect(rep.notes[1]).toMatch(/^Przeliczone/);
  });

  it("totals of the month table add up to the year", () => {
    const i = input();
    const rep = reportOf(i);
    const total = rep.months.foot[1]!;
    expect(total[1]).toBe(i.money.whole(i.uop.netYear));
    expect(total[2]).toBe(i.money.whole(i.b2b.netYear));
  });
});

describe("pdfBytes", () => {
  it("makes a PDF with Polish letters, several pages when needed", async () => {
    const rep = reportOf(input({ assumptions: Array.from({ length: 40 }, (_, k) => `Założenie ${k + 1}: zażółć gęślą jaźń, ŁÓDŹ, „cudzysłów” - ok, 12 000 zł, znak spoza czcionki: \u{1F600}.`) }));
    const bytes = await pdfBytes(rep, { regular: font("Regular"), bold: font("Bold") });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe(rep.title);
  });

  it("names the file with the date", () => {
    expect(pdfName(new Date(2026, 0, 5))).toBe("porownanie-uop-b2b-2026-01-05.pdf");
  });
});
