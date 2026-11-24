import { describe, expect, it } from "vitest";
import { defaultScenario } from "./model";
import { fromLink, linkHash, normalizeScenario, SAVED_MAX, shareLink, withSaved } from "./saved";

describe("normalizeScenario", () => {
  it("keeps a valid scenario as it is", () => {
    const s = defaultScenario();
    s.uopGross = 2_000_000;
    s.form = "liniowy";
    s.b2b.contributionHoliday = 7;
    s.extra.zlecenie = { amount: 300_000, sameEmployer: true, voluntarySocial: false };
    expect(normalizeScenario(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("falls back to the defaults for anything wrong or missing", () => {
    const d = defaultScenario();
    const s = normalizeScenario({
      uopGross: -5,
      b2bRate: "15000",
      form: "podatek-od-psa",
      sickDays: 1.5,
      vacationDays: 30,
      uop: { ppk: "tak", benefits: "x" },
      b2b: { startDate: "<script>", ryczaltRate: 99_999, contributionHoliday: 12 },
      costs: [{ name: 5, amount: 1e20, vatRate: 1, month: 13, kind: "rakieta", enabled: 1 }, "x"],
      family: { children: 99 },
      extra: { job: "dużo", zlecenie: "tak" },
    });
    expect(s.uopGross).toBe(d.uopGross);
    expect(s.b2bRate).toBe(d.b2bRate);
    expect(s.form).toBeNull();
    expect(s.sickDays).toBe(d.sickDays);
    expect(s.vacationDays).toBe(d.vacationDays);
    expect(s.uop).toEqual(d.uop);
    expect(s.b2b.startDate).toBe("");
    expect(s.b2b.ryczaltRate).toBeNull();
    expect(s.b2b.contributionHoliday).toBeNull();
    expect(s.costs).toEqual([{ name: "Koszt", amount: 0, vatRate: 2300, month: 0, kind: "zwykly", enabled: true }]);
    expect(s.family.children).toBe(0);
    expect(s.extra.job).toBe(0);
    expect(s.extra.zlecenie).toBeNull();
  });

  it("gives the defaults for no data at all", () => {
    expect(normalizeScenario(null)).toEqual(defaultScenario());
    expect(normalizeScenario([1, 2])).toEqual(defaultScenario());
  });
});

describe("which amounts are known (plan A26)", () => {
  it("keeps a valid choice, anything else is both amounts", () => {
    expect(normalizeScenario({ ...defaultScenario(), known: "uop" }).known).toBe("uop");
    expect(normalizeScenario({ ...defaultScenario(), known: "b2b" }).known).toBe("b2b");
    expect(normalizeScenario({ ...defaultScenario(), known: "x" }).known).toBe("obie");
    expect(normalizeScenario({}).known).toBe("obie");
  });

  it("goes in the link there and back", () => {
    const s = { ...defaultScenario(), known: "b2b" as const };
    expect(fromLink(linkHash(s, "dzis"))?.scenario.known).toBe("b2b");
  });
});

describe("the link", () => {
  it("carries the scenario and the rules there and back", () => {
    const s = defaultScenario();
    s.b2bRate = 2_345_600;
    s.form = null;
    s.uop.benefits[0]!.on = true;
    s.costs.push({ name: "Laptop ąęł", amount: 800_000, vatRate: 2300, month: 3, kind: "zwykly", enabled: true });
    const back = fromLink(linkHash(s, "2027-pewne"));
    expect(back?.scenario).toEqual(s);
    expect(back?.rules).toBe("2027-pewne");
  });

  it("is short for the defaults and leaves out today's rules", () => {
    const hash = linkHash(defaultScenario(), "dzis");
    expect(hash).toBe("#s=e30");
    expect(fromLink(hash)).toEqual({ scenario: defaultScenario(), rules: null });
  });

  it("only carries what differs from the defaults", () => {
    const s = defaultScenario();
    s.uopGross = 999_900;
    const json = atob(linkHash(s, "dzis").slice(3).replace(/-/g, "+").replace(/_/g, "/"));
    expect(JSON.parse(json)).toEqual({ uopGross: 999_900 });
  });

  it("ignores an address without settings or with broken ones", () => {
    expect(fromLink("")).toBeNull();
    expect(fromLink("#zrodla")).toBeNull();
    expect(fromLink("#s=%%%")).toBeNull();
    expect(fromLink(`#s=${"A".repeat(9_000)}`)).toBeNull();
    expect(fromLink(`#s=${btoa('{"uopGross":"<b>"}')}&r=<script>`)).toEqual({ scenario: defaultScenario(), rules: null });
  });

  it("leads to the demo page from the desktop app", () => {
    expect(shareLink(defaultScenario(), "dzis", null)).toBe("https://szymonbakonis.pl/kalkulator-uop-b2b/#s=e30");
  });
});

describe("withSaved", () => {
  const now = new Date("2026-11-24T18:00:00Z");

  it("puts the newest first and replaces the same name", () => {
    const a = defaultScenario();
    const b = { ...defaultScenario(), uopGross: 1 };
    let list = withSaved([], "Oferta A", a, now);
    list = withSaved(list, "Oferta B", b, now);
    list = withSaved(list, " oferta a ", b, now);
    expect(list.map((x) => x.name)).toEqual(["oferta a", "Oferta B"]);
    expect(list[0]!.scenario).toBe(b);
  });

  it("skips an empty name and keeps at most a few", () => {
    expect(withSaved([], "   ", defaultScenario(), now)).toEqual([]);
    let list = withSaved([], "0", defaultScenario(), now);
    for (let i = 1; i <= SAVED_MAX + 2; i++) list = withSaved(list, String(i), defaultScenario(), now);
    expect(list).toHaveLength(SAVED_MAX);
    expect(list[0]!.name).toBe(String(SAVED_MAX + 2));
  });
});
