import { describe, expect, it } from "vitest";
import { newestCheck, parseRatesFile, type RatesFile } from "../calc/rates";
import { RATES_FILES } from "../ui/rules";
import {
  applyAll,
  changeId,
  extractJson,
  isOfficial,
  numbersIn,
  numbersOf,
  pageText,
  parseApplied,
  question,
  readAnswer,
  systemPrompt,
  verify,
  type Applied,
  type ValueChange,
} from "./check";

const files: readonly RatesFile[] = RATES_FILES;

const minWage: ValueChange = {
  type: "value",
  year: 2027,
  key: "minWage",
  target: "value",
  value: 5000,
  status: "pewne",
  source: "Dz.U. 2026 poz. 1600",
  url: "https://api.sejm.gov.pl/eli/acts/DU/2026/1600/text.html",
  quote: "Od dnia 1 stycznia 2027 r. minimalne wynagrodzenie za pracę wynosi 5 000,00 zł.",
  from: "1.01.2027",
};

const answer = (changes: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ summary: "Sprawdziłem.", changes, ...extra });

describe("the question", () => {
  it("sends only the rates and the acts, with the rules of the answer", () => {
    const q = question(files, [{ eli: "DU/2026/1541", title: "Ustawa o PIT", published: "2026-11-24", url: "https://x.gov.pl", topics: ["PIT"] }]);
    expect(q).toContain('"minWage"');
    expect(q).toContain("Płaca minimalna");
    expect(q).toContain("DU/2026/1541");
    const s = systemPrompt("2026-11-24");
    expect(s).toContain("2026-11-24");
    expect(s).toContain("word for word");
    expect(s).toContain("needsNewVersion");
  });
});

describe("reading the answer", () => {
  it("finds the JSON in a chatty answer or a code fence", () => {
    const json = answer([minWage]);
    expect(extractJson(json)).not.toBeNull();
    expect(extractJson(`Oto wynik:\n\`\`\`json\n${json}\n\`\`\`\nTo wszystko.`)?.summary).toBe("Sprawdziłem.");
    // A brace inside a string does not break it; an earlier object without "changes" is skipped.
    expect(extractJson(`{"note": "a { b"} ${answer([], { summary: "x } y" })}`)?.summary).toBe("x } y");
    expect(extractJson("Nie mogę odpowiedzieć.")).toBeNull();
    expect(extractJson("{ broken")).toBeNull();
  });

  it("a broken answer changes nothing", () => {
    expect(readAnswer("brak JSON", files)).toBeNull();
    expect(readAnswer('{"changes": "none"}', files)).toBeNull();
  });

  it("drops proposals without a source, quote, known number or right shape", () => {
    const bad = [
      { ...minWage, url: "" },
      { ...minWage, quote: "" },
      { ...minWage, url: "http://api.sejm.gov.pl/x" },
      { ...minWage, key: "noSuchKey" },
      { ...minWage, year: 1999 },
      { ...minWage, value: "5000" },
      { ...minWage, value: -5 },
      { ...minWage, status: "na pewno" },
      { ...minWage, target: "maybe" },
      { ...minWage, key: "pitScale", value: [[1, 2, 3]] },
      { type: "bill", year: 2027, title: "", what: "x", from: "x", status: "projekt", source: "s", url: "https://sejm.gov.pl", quote: "q" },
      { type: "other" },
      null,
    ];
    const read = readAnswer(answer([minWage, ...bad]), files)!;
    expect(read.changes).toEqual([minWage]);
    expect(read.rejected).toBe(bad.length);
  });

  it("reads verdicts on new acts and changes that need a new version", () => {
    const read = readAnswer(
      answer([], {
        acts: [{ eli: "DU/2026/1541", changes: true, what: "Nowa skala PIT." }, { eli: "x" }],
        needsNewVersion: ["Nowa ulga dla rodziców", 5],
      }),
      files,
    )!;
    expect(read.acts).toEqual([{ eli: "DU/2026/1541", changes: true, what: "Nowa skala PIT." }]);
    expect(read.needsNewVersion).toEqual(["Nowa ulga dla rodziców"]);
  });
});

describe("numbers", () => {
  it("reads Polish numbers", () => {
    expect(numbersIn("wynosi 5 000,00 zł i 9,76%")).toEqual([5000, 9.76]);
    expect(numbersIn("130.000 zł, 4 806,50 zł")).toEqual([130000, 4806.5]);
    expect(numbersOf([[130000, 12], [null, 32]])).toEqual([130000, 12, 32]);
  });

  it("strips a page to its text", () => {
    expect(pageText("<p>Kwota&nbsp;<b>5 000</b> zł</p><script>var a = 1;</script>")).toBe("Kwota 5 000 zł");
  });

  it("knows official sources", () => {
    expect(isOfficial("https://isap.sejm.gov.pl/x")).toBe(true);
    expect(isOfficial("https://www.zus.pl/")).toBe(true);
    expect(isOfficial("https://www.infor.pl/")).toBe(false);
    expect(isOfficial("https://gov.pl.evil.com/")).toBe(false);
    expect(isOfficial("https://evil.com@gov.pl/")).toBe(false);
  });
});

describe("checking a proposal against its source", () => {
  const page = { text: "<p>minimalne wynagrodzenie za pracę wynosi 5 000,00 zł</p>", contentType: "text/html" };

  it("is ok only with an official source holding the quoted number", () => {
    expect(verify(minWage, page)).toEqual({ change: minWage, verdict: "ok", reasons: [] });
  });

  it("a number not in the quote needs checking", () => {
    const r = verify({ ...minWage, value: 5100 }, page);
    expect(r.verdict).toBe("check");
    expect(r.reasons).toContain("w cytacie nie ma proponowanej liczby");
  });

  it("a number not on the page needs checking", () => {
    const r = verify(minWage, { text: "<p>4 950 zł</p>", contentType: "text/html" });
    expect(r.reasons).toEqual(["na stronie źródła nie ma proponowanej liczby"]);
  });

  it("a portal is only a report and is not fetched", () => {
    const r = verify({ ...minWage, url: "https://www.infor.pl/x" }, null);
    expect(r.verdict).toBe("check");
    expect(r.change.status).toBe("doniesienie");
  });

  it("a PDF, a failed fetch or no fetch need checking", () => {
    expect(verify(minWage, { text: "%PDF", contentType: "application/pdf" }).verdict).toBe("check");
    expect(verify(minWage, { error: "HTTP 404" }).reasons[0]).toContain("HTTP 404");
    expect(verify(minWage, null).verdict).toBe("check");
  });

  it("a bill needs its quote on the page", () => {
    const bill = {
      type: "bill" as const,
      year: 2027,
      title: "Nowa ustawa",
      what: "Zmienia skalę.",
      from: "1.01.2027",
      status: "pewne" as const,
      source: "Dz.U. 2026 poz. 1541",
      url: "https://api.sejm.gov.pl/eli/acts/DU/2026/1541/text.html",
      quote: "Ustawa wchodzi w życie z dniem 1 stycznia 2027 r.",
    };
    expect(verify(bill, { text: "<p>Ustawa wchodzi w życie z dniem 1&nbsp;stycznia 2027 r.</p>", contentType: "text/html" }).verdict).toBe("ok");
    expect(verify(bill, { text: "<p>inny tekst</p>", contentType: "text/html" }).verdict).toBe("check");
  });
});

describe("applying", () => {
  const apply = (applied: Applied[]) => applyAll(files, applied, newestCheck, parseRatesFile);
  const year = (fs: RatesFile[], y: number) => fs.find((f) => f.year === y)!;
  const day = "2026-11-30";

  it("sets the new number with its source and an AI note", () => {
    const out = apply([{ change: minWage, day }]);
    const item = year(out, 2027).items.minWage;
    expect(item.value).toBe(5000);
    expect(item.checked).toBe(day);
    expect(item.note).toBe("z AI, dnia 30.11.2026 - od 1.01.2027");
    expect(year(out, 2026)).toBe(files.find((f) => f.year === 2026));
  });

  it("a signed pending number becomes the value and stops being pending", () => {
    const scale = files.find((f) => f.year === 2027)!.items.pitScale;
    expect(scale.pending).toBeDefined();
    const change: ValueChange = { ...minWage, key: "pitScale", value: scale.pending!.value, quote: "q" };
    const item = year(apply([{ change, day }]), 2027).items.pitScale;
    expect(item.value).toEqual(scale.pending!.value);
    expect(item.pending).toBeUndefined();
    // A pending proposal keeps the value in force.
    const later = year(apply([{ change: { ...minWage, target: "pending", value: 5100 }, day }]), 2027).items.minWage;
    expect([later.value, later.pending?.value]).toEqual([4950, 5100]);
  });

  it("adds or replaces an entry of upcoming changes", () => {
    const bill = { type: "bill" as const, year: 2027, title: "Chorobowe w ciąży od 1. dnia z ZUS", what: "Weto prezydenta.", from: "nie wejdzie", status: "pewne" as const, source: "prezydent.pl", url: "https://www.prezydent.pl/x", quote: "q" };
    const bills = year(apply([{ change: bill, day }]), 2027).bills!;
    expect(bills.filter((b) => b.title === bill.title)).toHaveLength(1);
    expect(bills.find((b) => b.title === bill.title)!.what).toBe("Weto prezydenta.");
  });

  it("a fresher rates file wins over an older AI change", () => {
    expect(year(apply([{ change: minWage, day: "2026-01-01" }]), 2027).items.minWage.value).toBe(4950);
  });

  it("reads back only sound kept changes", () => {
    const kept = [{ change: minWage, day }, { change: { ...minWage, value: "x" }, day }, { change: minWage, day: "jutro" }, 5];
    expect(parseApplied(kept, files)).toEqual([{ change: minWage, day }]);
    expect(parseApplied("x", files)).toEqual([]);
  });

  it("names a proposal by what it changes", () => {
    expect(changeId(minWage)).toBe("2027:minWage:value");
  });
});
