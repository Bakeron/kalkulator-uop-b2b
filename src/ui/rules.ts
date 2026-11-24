/**
 * Which rules the calculation follows (assumption A1 "Przepisy na dziś i po zmianach"): today's,
 * next year's sure ones, or next year's with the bills - and the list "Co się zmieni i kiedy".
 */
import rates2026 from "../rates/2026.json";
import rates2027 from "../rates/2027.json";
import { formatZl, pct, zl } from "../calc/money";
import { loadRates, type BracketJson, type ItemKey, type Rates, type RatesFile, type RulesVariant, type SourceInfo, type Status } from "../calc/rates";
import { dateShort } from "./format";

export const RATES_FILES: readonly RatesFile[] = [rates2026 as RatesFile, rates2027 as RatesFile];

export interface RulesChoice {
  year: number;
  variant: RulesVariant;
}

export interface RulesOption extends RulesChoice {
  key: string;
  label: string;
  /** Said on the result when this option is not today's rules. */
  mark: string | null;
}

const byYear = (files: readonly RatesFile[], year: number) => files.find((f) => f.year === year) ?? null;
const hasPending = (f: RatesFile) => Object.values(f.items).some((i) => i.pending);

/** The rates file in force on that day: its year, or the latest earlier one. */
export function fileOn(files: readonly RatesFile[], today: Date): RatesFile {
  const year = today.getFullYear();
  const known = files.filter((f) => f.year <= year).sort((a, b) => b.year - a.year);
  return known[0] ?? [...files].sort((a, b) => a.year - b.year)[0]!;
}

/** The options of the switch: today first; next year sure and with bills when its file exists. */
export function rulesOptions(files: readonly RatesFile[], today: Date): RulesOption[] {
  const now = fileOn(files, today);
  const options: RulesOption[] = [{ key: "dzis", year: now.year, variant: "pewne", label: "Przepisy na dziś", mark: null }];
  const next = byYear(files, now.year + 1);
  if (next) {
    options.push({
      key: "nastepny",
      year: next.year,
      variant: "pewne",
      label: `Od 1.01.${next.year} - pewne zmiany`,
      mark: `Liczone według przepisów od 1.01.${next.year} - tylko zmiany już pewne.`,
    });
    if (hasPending(next)) {
      options.push({
        key: "nastepny-projekty",
        year: next.year,
        variant: "z-projektami",
        label: `Od 1.01.${next.year} - razem z projektami`,
        mark: `Liczone według przepisów od 1.01.${next.year} razem z ustawami, które jeszcze nie obowiązują - może się nie sprawdzić.`,
      });
    }
  } else if (hasPending(now)) {
    options.push({
      key: "dzis-projekty",
      year: now.year,
      variant: "z-projektami",
      label: "Na dziś razem z projektami",
      mark: "Liczone razem z ustawami, które jeszcze nie obowiązują - może się nie sprawdzić.",
    });
  }
  return options;
}

const cache = new WeakMap<readonly RatesFile[], Map<string, Rates>>();

/** Rates of the choice from these files (loaded once per list of files). */
export function ratesFor(choice: RulesChoice, files: readonly RatesFile[] = RATES_FILES): Rates {
  let byKey = cache.get(files);
  if (!byKey) {
    byKey = new Map();
    cache.set(files, byKey);
  }
  const key = `${choice.year}:${choice.variant}`;
  let r = byKey.get(key);
  if (!r) {
    const file = byYear(files, choice.year) ?? files[0]!;
    r = loadRates(file, choice.variant);
    byKey.set(key, r);
  }
  return r;
}

// "Co się zmieni i kiedy"

type Unit = "zl" | "pct" | "dni" | "mies" | "scale" | "thresholds" | "children";

const LABELS: Record<ItemKey, [string, Unit]> = {
  minWage: ["Płaca minimalna", "zl"],
  avgWageForecast: ["Prognozowane przeciętne wynagrodzenie", "zl"],
  zusAnnualLimit: ["Limit składek emerytalnej i rentowej w roku (30-krotność)", "zl"],
  pensionEmployee: ["Składka emerytalna - pracownik", "pct"],
  pensionEmployer: ["Składka emerytalna - pracodawca", "pct"],
  disabilityEmployee: ["Składka rentowa - pracownik", "pct"],
  disabilityEmployer: ["Składka rentowa - pracodawca", "pct"],
  sickness: ["Składka chorobowa", "pct"],
  accident: ["Składka wypadkowa", "pct"],
  laborFund: ["Fundusz Pracy i Solidarnościowy", "pct"],
  fgsp: ["Fundusz Gwarantowanych Świadczeń Pracowniczych", "pct"],
  health: ["Składka zdrowotna", "pct"],
  ppkEmployee: ["PPK - pracownik", "pct"],
  ppkEmployer: ["PPK - pracodawca", "pct"],
  pitScale: ["Skala podatkowa", "scale"],
  taxReduction: ["Kwota zmniejszająca podatek w roku", "zl"],
  employeeCosts: ["Koszty pracownika miesięcznie", "zl"],
  employeeCostsCommuter: ["Koszty pracownika dojeżdżającego miesięcznie", "zl"],
  authorsCostsLimit: ["Limit kosztów autorskich w roku", "zl"],
  zeroPitLimit: ["Limit zerowego PIT (np. do 26 lat)", "zl"],
  sickPayEmployerDays: ["Dni choroby płatne przez pracodawcę", "dni"],
  sickPayEmployerDaysOver50: ["Dni choroby płatne przez pracodawcę po 50. roku życia", "dni"],
  preferentialBase: ["Podstawa preferencyjnego ZUS", "zl"],
  fullBase: ["Podstawa pełnego ZUS", "zl"],
  healthMin: ["Najniższa składka zdrowotna", "zl"],
  healthMinJanuary: ["Najniższa składka zdrowotna za styczeń", "zl"],
  healthLinear: ["Zdrowotna na podatku liniowym", "pct"],
  linearHealthDeductionLimit: ["Limit odliczenia zdrowotnej na liniowym", "zl"],
  ryczaltHealthAvgWage: ["Przeciętne wynagrodzenie - podstawa zdrowotnej na ryczałcie", "zl"],
  ryczaltHealthThresholds: ["Progi przychodu zdrowotnej na ryczałcie", "thresholds"],
  ryczaltLimit: ["Limit przychodu na ryczałcie", "zl"],
  linearRate: ["Podatek liniowy", "pct"],
  ipBoxRate: ["IP Box", "pct"],
  ryczaltItRate: ["Ryczałt dla usług IT", "pct"],
  vatRate: ["Stawka VAT", "pct"],
  vatExemptLimit: ["Limit zwolnienia z VAT", "zl"],
  smallZusRevenueLimit: ["Limit przychodu Małego ZUS Plus", "zl"],
  voluntarySicknessWaitDays: ["Okres czekania na zasiłek przy dobrowolnym chorobowym", "dni"],
  startReliefMonths: ["Ulga na start", "mies"],
  preferentialMonths: ["Preferencyjny ZUS", "mies"],
  carCostShare: ["Auto także prywatnie - wydatki w kosztach", "pct"],
  carVatShare: ["Auto także prywatnie - odliczany VAT", "pct"],
  fixedAssetLimit: ["Sprzęt od razu w koszty do", "zl"],
  employeeCostsMultiLimit: ["Koszty przy kilku umowach o pracę w roku", "zl"],
  employeeCostsMultiLimitCommuter: ["Koszty przy kilku umowach i dojazdach w roku", "zl"],
  civilCostsRate: ["Koszty umowy zlecenia i o dzieło", "pct"],
  smallContractLimit: ["Mała umowa z ryczałtem 12%", "zl"],
  childRelief: ["Ulga na dzieci w roku", "children"],
  childReliefIncomeLimitMarried: ["Limit dochodu przy uldze na jedno dziecko - małżonkowie", "zl"],
  childReliefIncomeLimitSingle: ["Limit dochodu przy uldze na jedno dziecko - osoba sama", "zl"],
};

/** Name of a number of the rates file, e.g. "Płaca minimalna". */
export const itemLabel = (key: ItemKey) => LABELS[key][0];

/** Unit of a number of a rates file: "zl", "pct", "dni", "mies", "scale", "thresholds" or "children". */
export const itemUnit = (key: ItemKey) => LABELS[key][1];

/** Every number of a rates file in the order of the list: employment first, then B2B, then family. */
export const ITEM_ORDER = Object.keys(LABELS) as ItemKey[];

const percent = (v: number) => `${(pct(v) / 100).toLocaleString("pl-PL")}%`;
const money = (v: number) => {
  const m = zl(v);
  return formatZl(m, m % 100 !== 0);
};

/** A value of a rates file as words, e.g. "4 950 zł", "12% do 120 000 zł, 32% powyżej". */
export function valueText(key: ItemKey, value: unknown): string {
  const unit = LABELS[key][1];
  switch (unit) {
    case "zl":
      return money(value as number);
    case "pct":
      return percent(value as number);
    case "dni":
      return `${value as number} dni`;
    case "mies":
      return `${value as number} mies.`;
    case "scale":
      return (value as BracketJson[]).map(([upTo, rate]) => (upTo === null ? `${rate}% powyżej` : `${rate}% do ${money(upTo)}`)).join(", ");
    case "thresholds":
      return (value as number[]).map(money).join(" i ");
    case "children":
      return (value as number[]).map(money).join(" / ");
  }
}

export type ChangeGroup = "pewne" | "uchwalone" | "niepewne";

export interface Change extends SourceInfo {
  group: ChangeGroup;
  title: string;
  /** "4 806 zł → 4 950 zł", or what a bill would change. */
  what: string;
  from: string;
  /** Whether the calculator counts it (with the right switch option). */
  inCalc: boolean;
  /** Counted only with the option "razem z projektami". */
  pending: boolean;
}

const groupOf = (status: Status): ChangeGroup => (status === "pewne" ? "pewne" : status === "uchwalone" ? "uchwalone" : "niepewne");

export const STATUS_WORDS: Record<Status, string> = {
  pewne: "pewne",
  uchwalone: "uchwalone, czeka na podpis",
  projekt: "projekt",
  szacunek: "szacunek",
  doniesienie: "zapowiedź",
};

/**
 * What changes between today's file and the next one (and what is still uncertain), grouped
 * pewne / uchwalone / niepewne. Without the next file - the pending items of today's file.
 */
export function upcomingChanges(now: RatesFile, next: RatesFile | null): Change[] {
  const target = next ?? now;
  const from = next ? `od 1.01.${next.year}` : "po wejściu w życie";
  const out: Change[] = [];
  for (const key of Object.keys(LABELS) as ItemKey[]) {
    const item = target.items[key];
    const title = LABELS[key][0];
    const before = JSON.stringify(now.items[key].value);
    const after = JSON.stringify(item.value);
    if (next && (before !== after || item.status !== "pewne")) {
      out.push({
        ...pickSource(item),
        group: groupOf(item.status),
        title,
        what: before === after ? `bez zmian: ${valueText(key, item.value)}` : `${valueText(key, now.items[key].value)} → ${valueText(key, item.value)}`,
        from,
        inCalc: true,
        pending: false,
      });
    }
    if (item.pending) {
      const p = item.pending;
      out.push({
        ...pickSource(p),
        group: groupOf(p.status),
        title,
        what: `${valueText(key, item.value)} → ${valueText(key, p.value)}`,
        from,
        inCalc: true,
        pending: true,
      });
    }
  }
  for (const b of target.bills ?? []) {
    out.push({ ...pickSource(b), group: groupOf(b.status), title: b.title, what: b.what, from: b.from, inCalc: false, pending: false });
  }
  const order: ChangeGroup[] = ["pewne", "uchwalone", "niepewne"];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

function pickSource(s: SourceInfo): SourceInfo {
  return { source: s.source, url: s.url, checked: s.checked, status: s.status, ...(s.note ? { note: s.note } : {}) };
}

/** Whether a change of `upcomingChanges(now, next)` is in the result under the chosen rules. */
export function counted(c: Change, chosen: RulesChoice, target: RatesFile): boolean {
  if (!c.inCalc || chosen.year !== target.year) return false;
  return !c.pending || chosen.variant === "z-projektami";
}

/** "sprawdzone 24.11.2026". */
export const checkedText = (c: SourceInfo) => `sprawdzone ${dateShort(c.checked)}`;
