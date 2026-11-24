import { describe, expect, it } from "vitest";
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import { newestCheck, parseRatesFile, type RatesFile } from "../calc/rates";
import { fromForeign, rateNote, resultMoney, toForeign } from "./currency";
import { fetchFx, fetchRatesFiles, mergeFiles, parseNbp, relevantActs } from "./refresh";

const f26 = rates2026 as RatesFile;
const f27 = rates2027 as RatesFile;
const copy = (f: RatesFile): RatesFile => JSON.parse(JSON.stringify(f)) as RatesFile;

/** A fake `fetch` answering from a map of address -> JSON (missing = 404). */
function fakeFetch(answers: Record<string, unknown>, fail = false): typeof fetch {
  return (async (url: string) => {
    if (fail) throw new TypeError("Failed to fetch");
    const hit = Object.keys(answers).find((k) => url.includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(answers[hit]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("parseRatesFile", () => {
  it("accepts the files of the app", () => {
    expect(parseRatesFile(copy(f26))).not.toBeNull();
    expect(parseRatesFile(copy(f27))).not.toBeNull();
  });

  it("checks the bills: a list of at most 50, each with its source and texts; no list is fine", () => {
    const none = copy(f27) as unknown as { bills?: unknown };
    delete none.bills;
    expect(parseRatesFile(none)).not.toBeNull();
    expect(newestCheck(none as unknown as RatesFile)).not.toBe("");
    expect(newestCheck({ year: 2026, items: {} } as unknown as RatesFile)).toBe("");

    const notList = copy(f27) as unknown as { bills: unknown };
    notList.bills = { title: "x" };
    expect(parseRatesFile(notList)).toBeNull();

    const tooMany = copy(f27);
    tooMany.bills = Array.from({ length: 51 }, () => f27.bills![0]!);
    expect(parseRatesFile(tooMany)).toBeNull();

    const noTitle = copy(f27) as unknown as { bills: Record<string, unknown>[] };
    delete noTitle.bills[0]!.title;
    expect(parseRatesFile(noTitle)).toBeNull();
  });

  it("rejects a file with a missing number, a wrong type, a bad link or a bad date", () => {
    const missing = copy(f26) as unknown as { items: Record<string, unknown> };
    delete missing.items.minWage;
    expect(parseRatesFile(missing)).toBeNull();

    const text = copy(f26);
    (text.items.minWage as unknown as { value: string }).value = "4806";
    expect(parseRatesFile(text)).toBeNull();

    const link = copy(f26);
    link.items.health.url = "javascript:alert(1)";
    expect(parseRatesFile(link)).toBeNull();

    const date = copy(f26);
    date.items.health.checked = "24.11.2026";
    expect(parseRatesFile(date)).toBeNull();

    const scale = copy(f26);
    (scale.items.pitScale as unknown as { value: unknown }).value = [[120000]];
    expect(parseRatesFile(scale)).toBeNull();

    expect(parseRatesFile(null)).toBeNull();
    expect(parseRatesFile("2026")).toBeNull();
    expect(parseRatesFile({ ...copy(f26), year: 1999 })).toBeNull();
  });
});

describe("mergeFiles", () => {
  it("takes a file from the repository only when it was checked later", () => {
    const newer = copy(f27);
    newer.items.minWage.checked = "2099-01-01";
    newer.items.minWage.value = 5000;
    const merged = mergeFiles([f26, f27], [newer]);
    expect(merged.map((f) => f.year)).toEqual([2026, 2027]);
    expect(merged[1]).toBe(newer);
    expect(newestCheck(merged[1]!)).toBe("2099-01-01");

    const same = copy(f27);
    expect(mergeFiles([f26, f27], [same])[1]).toBe(f27);
  });

  it("adds a year the app does not know yet", () => {
    const y2028 = { ...copy(f27), year: 2028 };
    expect(mergeFiles([f26, f27], [y2028]).map((f) => f.year)).toEqual([2026, 2027, 2028]);
  });
});

describe("fetchRatesFiles", () => {
  it("keeps valid files of the right year and names the broken ones", async () => {
    const broken = { ...copy(f27), items: {} };
    const res = await fetchRatesFiles(new Date(2026, 10, 24), fakeFetch({ "/2026.json": copy(f26), "/2027.json": broken }));
    expect(res.files.map((f) => f.year)).toEqual([2026]);
    expect(res.rejected).toEqual([2027]);
  });

  it("a file under another year's name does not count", async () => {
    const res = await fetchRatesFiles(new Date(2026, 10, 24), fakeFetch({ "/2027.json": copy(f26) }));
    expect(res.files).toEqual([]);
    expect(res.rejected).toEqual([2027]);
  });

  it("no network = an error, so the old files stay", async () => {
    await expect(fetchRatesFiles(new Date(2026, 10, 24), fakeFetch({}, true))).rejects.toThrow();
  });
});

describe("relevantActs", () => {
  const api = {
    items: [
      { ELI: "DU/2026/1600", title: "Ustawa o zmianie ustawy o podatku dochodowym od osób fizycznych", promulgation: "2026-11-28" },
      { ELI: "DU/2026/1500", title: "Rozporządzenie w sprawie minimalnego wynagrodzenia za pracę", promulgation: "2026-09-12" },
      { ELI: "MP/2026/900", title: "Obwieszczenie o odznaczeniach", promulgation: "2026-11-29" },
      { ELI: "x", title: "podatku dochodowym od osób fizycznych", promulgation: "2026-11-29" },
      "nonsense",
    ],
  };

  it("keeps acts about taxes, ZUS and wages published since the date", () => {
    const acts = relevantActs(api, "2026-11-24");
    expect(acts.map((a) => a.eli)).toEqual(["DU/2026/1600"]);
    expect(acts[0]!.topics).toEqual(["PIT"]);
    expect(acts[0]!.url).toBe("https://api.sejm.gov.pl/eli/acts/DU/2026/1600/text.pdf");
  });

  it("does not break on an odd answer", () => {
    expect(relevantActs(null, "2026-01-01")).toEqual([]);
    expect(relevantActs({ items: "x" }, "2026-01-01")).toEqual([]);
  });
});

describe("NBP", () => {
  const eur = { table: "A", currency: "euro", code: "EUR", rates: [{ no: "228/A/NBP/2026", effectiveDate: "2026-11-24", mid: 4.2512 }] };

  it("reads the mid rate and its date", () => {
    expect(parseNbp(eur)).toEqual({ mid: 4.2512, date: "2026-11-24", table: "228/A/NBP/2026" });
    expect(parseNbp({ rates: [{ mid: -1, effectiveDate: "2026-11-24" }] })).toBeNull();
    expect(parseNbp({ rates: [] })).toBeNull();
    expect(parseNbp("x")).toBeNull();
  });

  it("fetches both currencies; with neither it fails", async () => {
    const usd = { ...eur, code: "USD", rates: [{ ...eur.rates[0], mid: 3.6801 }] };
    const fx = await fetchFx(fakeFetch({ "/eur/": eur, "/usd/": usd }));
    expect(fx.EUR?.mid).toBe(4.2512);
    expect(fx.USD?.mid).toBe(3.6801);
    await expect(fetchFx(fakeFetch({}))).rejects.toThrow();
  });
});

describe("currency of the results", () => {
  const rate = { mid: 4.25, date: "2026-11-24", table: "228/A/NBP/2026" };

  it("złoty without a rate, euro with one", () => {
    expect(resultMoney("EUR", null).whole(1_234_500)).toBe(resultMoney("PLN", null).whole(1_234_500));
    expect(resultMoney("PLN", null).whole(1_234_500)).toMatch(/^12\s345\szł$/);
    expect(resultMoney("EUR", rate).whole(1_275_000)).toMatch(/^3\s000\s€$/);
    expect(resultMoney("USD", rate).number(425_000)).toBe("1 000");
  });

  it("there and back again", () => {
    expect(toForeign(425_000, rate)).toBe(100_000);
    expect(fromForeign(100_000, rate)).toBe(425_000);
  });

  it("says the rate and its date", () => {
    expect(rateNote(resultMoney("EUR", rate))).toBe("Przeliczone ze złotych po średnim kursie NBP z 24.11.2026 (1 € = 4,2500 zł).");
    expect(rateNote(resultMoney("PLN", rate))).toBeNull();
  });
});
