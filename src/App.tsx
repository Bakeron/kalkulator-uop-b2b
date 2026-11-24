/**
 * Main screen - sketch of plan A7a (look a: the slide rule and the technical drawing, assumption
 * A8): the answer in sentences first, the slide rule under it, then "skąd ta kwota" for both
 * contracts; the two amounts and the assumptions on the side.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IS_DEMO } from "./demo";
import type { TaxForm } from "./calc/b2b";
import type { Money } from "./calc/money";
import { newestCheck, parseRatesFile } from "./calc/rates";
import { applyAll, changeId, loadApplied, saveApplied, type Applied } from "./ai/check";
import { errorText, inApp, keyHint, type AiError } from "./ai/bridge";
import { loadSpending } from "./ai/spend";
import AiCheck from "./ui/AiCheck";
import { onBack } from "./ui/back";
import { SICK_PERCENT } from "./calc/uop";
import Assumptions, { assumptionSentences } from "./ui/Assumptions";
import Breakdown from "./ui/Breakdown";
import FirstSteps from "./ui/FirstSteps";
import { CURRENCY_SIGN, MoneyContext, fromForeign, rateNote, resultMoney, toForeign } from "./ui/currency";
import Hint, { type HintText } from "./ui/Hint";
import { MAIN_HINTS } from "./ui/hints";
import Knowledge from "./ui/Knowledge";
import { useSlidingMarks } from "./ui/marks";
import { motionReduced, smoothly, type Motion } from "./ui/motion";
import { dateShort, parseZl, plural, zlWhole } from "./ui/format";
import { b2bBreakdown, belowMinWage, hasOthers, KNOWN, profitChart, uopBreakdown, type Known, type Scenario } from "./ui/model";
import MonthTable from "./ui/MonthTable";
import ProfitChart from "./ui/ProfitChart";
import { fetchFx, fetchNewActs, fetchRatesFiles, loadKept, mergeFiles, saveKept, type Currency, type FxRate, type Kept } from "./ui/refresh";
import { downloadPdf, pdfName, reportOf } from "./ui/pdf";
import Reveal from "./ui/Reveal";
import Rolling from "./ui/Rolling";
import { RATES_FILES, fileOn, ratesFor, rulesOptions, upcomingChanges, type RulesOption } from "./ui/rules";
import { fromLink, loadLast, loadSaved, saveLast, shareLink, storeSaved, withSaved, type SavedScenario } from "./ui/saved";
import Scenarios from "./ui/Scenarios";
import Settings, { type Section, type SettingsOpen, type Theme } from "./ui/Settings";
import SlideRule from "./ui/SlideRule";
import Tabs from "./ui/Tabs";
import Sources, { type RefreshReport } from "./ui/Sources";
import { useCalculation } from "./ui/useCalculation";
import UpcomingChanges from "./ui/UpcomingChanges";
import { yearTape } from "./ui/year";
import YearTape from "./ui/YearTape";

function formLong(form: TaxForm, ryczaltRate: number | null): string {
  if (form === "ryczalt") return `na ryczałcie ${((ryczaltRate ?? 1200) / 100).toLocaleString("pl-PL")}%`;
  return { skala: "na skali podatkowej", liniowy: "na podatku liniowym", ipbox: "z IP Box" }[form];
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (IS_DEMO ? null : (localStorage.getItem("theme") as Theme | null)) ?? "system");
  const first = useRef(true);
  useEffect(() => {
    // The demo keeps nothing between visits.
    if (!IS_DEMO) localStorage.setItem("theme", theme);
    const apply = () => {
      if (theme === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
    };
    // The whole page fades to the other theme (not only the background); the first paint at once.
    if (first.current) apply();
    else smoothly(apply);
    first.current = false;
    // Android: the status and navigation bars take the same light or dark colours (MainActivity.kt).
    const bars = (window as { AndroidBars?: { theme(dark: boolean): void } }).AndroidBars;
    if (!bars) return;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = () => bars.theme(theme === "dark" || (theme === "system" && system.matches));
    paint();
    system.addEventListener("change", paint);
    return () => system.removeEventListener("change", paint);
  }, [theme]);
  return [theme, setTheme];
}

/** "Ogranicz animacje": until the user chooses, the system setting decides (see ui/motion.ts). */
function useMotion(): [boolean, (reduce: boolean) => void] {
  const [motion, setMotion] = useState<Motion>(() => (IS_DEMO ? null : (localStorage.getItem("motion") as Motion | null)) ?? "system");
  if (motion === "system") delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = motion;
  useEffect(() => {
    if (!IS_DEMO) localStorage.setItem("motion", motion);
  }, [motion]);
  return [motionReduced(), (reduce) => setMotion(reduce ? "reduce" : "full")];
}

const TODAY = new Date();

/** Settings carried in the address ("#s=..."), read once at the start; they win over the data kept last time. */
const FROM_LINK = typeof location === "undefined" ? null : fromLink(location.hash);
if (FROM_LINK) history.replaceState(null, "", location.pathname + location.search);

/** The demo opened on a page of its own: the same window, standing in the middle of the page (plan A27). */
if (IS_DEMO && typeof window !== "undefined" && window.top === window) document.documentElement.dataset.window = "";

/** A choice kept between starts of the desktop app (the demo keeps nothing). */
function useKeptChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const v = IS_DEMO ? null : localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  });
  useEffect(() => {
    if (!IS_DEMO) localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue];
}

const CURRENCIES = ["PLN", "EUR", "USD"] as const;

/**
 * The rates files in use - the app's own, or newer ones from "Odśwież" - with the rules in force
 * on the day the app opens, the next year's file and what changes between them.
 */
function useRules(remote: Kept["files"], applied: readonly Applied[]) {
  return useMemo(() => {
    // Proposals from "Sprawdź przepisy z AI" the user applied go on top of the files.
    const files = applyAll(mergeFiles(RATES_FILES, remote), applied, newestCheck, parseRatesFile);
    const now = fileOn(files, TODAY);
    const next = files.find((f) => f.year === now.year + 1) ?? null;
    return { files, options: rulesOptions(files, TODAY), now, next, changes: upcomingChanges(now, next) };
  }, [remote, applied]);
}

/** "Przepisy na dziś / od 1.01.2027 pewne / z projektami" above the result. */
function RulesSwitch({ options, chosen, onChange }: { options: RulesOption[]; chosen: RulesOption; onChange: (o: RulesOption) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="rules">
      <fieldset className="rules__switch" data-mark="input:checked + span">
        <legend className="sr-only">Według jakich przepisów liczyć</legend>
        {options.map((o) => (
          <label key={o.key}>
            <input type="radio" name="rules" checked={chosen === o} onChange={() => onChange(o)} />
            <span data-text={o.label}>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <Reveal show={chosen.mark !== null}>
        {() => (
          <p className="rules__mark" role="status">
            <span>{chosen.mark}</span>{" "}
            <button type="button" className="link" onClick={() => onChange(options[0]!)}>
              Wróć do przepisów na dziś
            </button>
          </p>
        )}
      </Reveal>
    </div>
  );
}

const KNOWN_NAME: Record<Known, string> = { obie: "obie kwoty", uop: "tylko UoP", b2b: "tylko B2B" };

/** "Znam: obie kwoty / tylko UoP / tylko B2B" above the two amounts (plan A26). */
function KnownSwitch({ known, onChange }: { known: Known; onChange: (k: Known) => void }) {
  return (
    <div className="known">
      {/* A visible legend would shift the sliding line (ui/marks.ts), so the word is beside it. */}
      <div className="known__lead">
        <span aria-hidden="true">Znam</span>
        <Hint term="Znam obie kwoty albo tylko jedną" hint={MAIN_HINTS.known} />
      </div>
      <fieldset className="rules__switch" data-mark="input:checked + span">
        <legend className="sr-only">Które kwoty znam</legend>
        {KNOWN.map((k) => (
          <label key={k}>
            <input type="radio" name="known" checked={known === k} onChange={() => onChange(k)} />
            <span data-text={KNOWN_NAME[k]}>{KNOWN_NAME[k]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** "Założenia" is a tab only on a phone - on a wider window they stay in the left column. */
const TABS = [
  { key: "compare", label: "Porównanie" },
  { key: "assume", label: "Założenia" },
  { key: "year", label: "Rok" },
  { key: "know", label: "Co warto wiedzieć" },
  { key: "sources", label: "Źródła" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const WIDE_TABS = TABS.filter((t) => t.key !== "assume");

/** "Porównanie" in smaller parts, so none of them has to be scrolled long (plan A27, B3 a). */
const PARTS = [
  { key: "wynik", label: "Wynik" },
  { key: "skad", label: "Skąd te kwoty" },
  { key: "stawka", label: "Przy innej stawce" },
  { key: "miesiace", label: "Miesiąc po miesiącu" },
] as const;
type Part = (typeof PARTS)[number]["key"];

/** Order of every view, so a new one slides in from its side. */
const ORDER = [...PARTS.map((p) => `compare/${p.key}`), ...TABS.slice(1).map((t) => t.key)];
const viewKey = (t: Tab, p: Part) => (t === "compare" ? `compare/${p}` : t);

/** The phone layout: one screen at a time with the tabs on a bar at the bottom. */
const NARROW = "(max-width: 900px)";
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(() => FROM_LINK?.scenario ?? loadLast());
  useEffect(() => saveLast(scenario), [scenario]);
  const narrow = useNarrow();
  const [tab, setTab] = useState<Tab>("compare");
  const [part, setPart] = useState<Part>("wynik");
  // A wider window has no "Założenia" tab - they are in the left column there.
  const view: Tab = !narrow && tab === "assume" ? "compare" : tab;
  const home = view === "compare" && part === "wynik";
  useSlidingMarks();
  // Each view keeps its own place in the scrolled area; the window itself never scrolls (plan A27).
  const screen = useRef<HTMLDivElement>(null);
  // The links of the first steps go into the footer of whichever layout is shown.
  const [footSlot, setFootSlot] = useState<HTMLElement | null>(null);
  const partsBar = useRef<HTMLDivElement>(null);
  const scrolled = useRef(new Map<string, number>());
  // A new view slides in from its side while the old one fades out (styles: [data-vt^="tab"]).
  const go = (t: Tab, p: Part) => {
    const from = viewKey(view, part);
    const to = viewKey(t, p);
    if (from === to) return;
    const el = screen.current;
    let top = 0;
    if (el) {
      scrolled.current.set(from, el.scrollTop);
      // On a phone the parts of "Porównanie" sit under the two amounts: a new part starts at its
      // tabs (they stick to the top), not back at the amounts.
      const bar = partsBar.current;
      const block = bar?.parentElement;
      if (narrow && t === "compare" && view === "compare" && bar && block) top = block.offsetTop + block.offsetHeight - bar.offsetHeight;
      top = scrolled.current.get(to) ?? top;
    }
    smoothly(
      () => {
        flushSync(() => {
          setTab(t);
          setPart(p);
        });
        if (el) el.scrollTop = top;
      },
      ORDER.indexOf(to) > ORDER.indexOf(from) ? "tab-next" : "tab-prev",
    );
  };
  const goRef = useRef(go);
  goRef.current = go;
  const [theme, setTheme] = useTheme();
  const [still, setStill] = useMotion();
  const [kept, setKept] = useState<Kept>(loadKept);
  const [applied, setApplied] = useState<Applied[]>(() => (IS_DEMO ? [] : loadApplied(RATES_FILES)));
  const aiDialog = useRef<HTMLDialogElement>(null);
  const aiBack = useRef<(() => void) | null>(null);
  // The window "Ustawienia" (gear in the header) and what Settings → AI shares with the AI window.
  const [settingsOpen, setSettingsOpen] = useState<SettingsOpen | null>(null);
  const openSettings = (section: Section, wantKey = false) => setSettingsOpen({ section, wantKey });
  const closeSettings = useCallback(() => setSettingsOpen(null), []);
  const app = !IS_DEMO && inApp();
  const [aiKey, setAiKey] = useState<string | null>(null);
  const [aiKeyError, setAiKeyError] = useState<string | null>(null);
  useEffect(() => {
    if (app) keyHint().then(setAiKey, (e: AiError) => setAiKeyError(errorText(e)));
  }, [app]);
  const [spending, setSpending] = useState(loadSpending);
  // Back from any other view or part goes to "Porównanie" - "Wynik" first.
  useEffect(() => (home ? undefined : onBack(() => goRef.current("compare", "wynik"))), [home]);
  const { files, options, now: nowFile, next: nextFile, changes } = useRules(kept.files, applied);
  const [ruleKey, setRuleKey] = useState(FROM_LINK?.rules ?? "dzis");
  const rules = options.find((o) => o.key === ruleKey) ?? options[0]!;
  const rates = ratesFor(rules, files);
  const shownFile = files.find((f) => f.year === rates.year) ?? nowFile;
  const {
    data: { result, model },
    busy,
  } = useCalculation(scenario, rules, files);

  // Currency of the results and of the B2B rate: needs the NBP rate, fetched when first chosen.
  const [currency, setCurrency] = useKeptChoice<Currency>("currency", CURRENCIES, "PLN");
  const [rateCurrency, setRateCurrency] = useKeptChoice<Currency>("rateCurrency", CURRENCIES, "PLN");
  const [fxFailed, setFxFailed] = useState(false);
  const fxAsking = useRef(false);
  const fxOf = (c: Currency): FxRate | null => (c === "PLN" ? null : (kept.fx[c] ?? null));
  const fxMissing = (c: Currency) => c !== "PLN" && !kept.fx[c];
  const keep = (change: (k: Kept) => Kept) =>
    setKept((k) => {
      const next = change(k);
      saveKept(next);
      return next;
    });
  useEffect(() => {
    if (!(fxMissing(currency) || fxMissing(rateCurrency)) || fxAsking.current || fxFailed) return;
    fxAsking.current = true;
    fetchFx()
      .then((fx) => keep((k) => ({ ...k, fx: { ...k.fx, ...fx } })))
      .catch(() => setFxFailed(true))
      .finally(() => {
        fxAsking.current = false;
      });
  }, [currency, rateCurrency, kept.fx, fxFailed]);
  const money = resultMoney(currency, fxOf(currency));
  const note = rateNote(money);
  const fxWait = (c: Currency, what: string) => (fxMissing(c) ? (fxFailed ? `Brak kursu NBP (sieć?) - ${what} w złotych.` : "Pobieram kurs NBP…") : null);

  // "Odśwież": the rates files, new legal acts since the data were checked, the NBP rates.
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<RefreshReport | null>(null);
  const refresh = async () => {
    setRefreshing(true);
    const [got, fx] = await Promise.allSettled([fetchRatesFiles(TODAY), fetchFx()]);
    const remote = got.status === "fulfilled" ? got.value.files : kept.files;
    const merged = mergeFiles(RATES_FILES, remote);
    const before = new Map(files.map((f) => [f.year, newestCheck(f)]));
    const fresh = merged.filter((f) => newestCheck(f) > (before.get(f.year) ?? ""));
    const since = newestCheck(fileOn(merged, TODAY));

    let ratesText: string;
    if (got.status === "rejected") ratesText = "Plik stawek: nie udało się pobrać (brak sieci?) - zostają dotychczasowe stawki.";
    else {
      ratesText = fresh.length
        ? `Plik stawek: pobrano nowsze - ${fresh.map((f) => `${f.year} (sprawdzone ${dateShort(newestCheck(f))})`).join(", ")}.`
        : "Plik stawek: aktualny - w repozytorium nie ma nowszego.";
      if (got.value.rejected.length) ratesText += ` Plik ${got.value.rejected.join(", ")} w repozytorium nie pasuje do tej wersji aplikacji - zostają stawki z aplikacji.`;
    }

    let acts = kept.acts;
    let actsText: string;
    try {
      acts = await fetchNewActs(since);
      actsText =
        acts.length === 0
          ? `Nowe akty: od ${dateShort(since)} nic o podatkach, ZUS ani płacach.`
          : `Nowe akty: od ${dateShort(since)} ${acts.length} ${plural(acts.length, "akt", "akty", "aktów")} o podatkach, ZUS albo płacach - lista niżej.`;
    } catch {
      actsText = "Nowe akty: nie udało się sprawdzić w API Sejmu - spróbuj później.";
    }

    const newFx = fx.status === "fulfilled" ? { ...kept.fx, ...fx.value } : kept.fx;
    const anyFx = newFx.EUR ?? newFx.USD;
    const fxText =
      fx.status === "fulfilled" && anyFx
        ? `Kurs NBP: z ${dateShort(anyFx.date)}.`
        : `Kurs NBP: nie udało się pobrać${anyFx ? ` - zostaje kurs z ${dateShort(anyFx.date)}` : ""}.`;

    const worked = got.status === "fulfilled" || fx.status === "fulfilled";
    keep((k) => ({ files: remote, fx: newFx, acts, refreshed: worked ? new Date().toISOString() : k.refreshed }));
    if (fx.status === "fulfilled") setFxFailed(false);
    setReport({ rates: ratesText, acts: actsText, fx: fxText });
    setRefreshing(false);
  };

  const { comparison: c, diffMonthly, b2bNeeded, uopMatching, formShown, b2bShown, amounts, extrasMonthly, pensionMonthly } = result;
  const better = diffMonthly >= 0 ? "więcej" : "mniej";
  // One amount known (plan A26): the other one comes from the calculation. Until the answer for
  // the new choice comes, the field shows the amount it had, and its digits roll to the new one.
  const known = scenario.known;
  const derived = result.derived && result.derived.side !== known ? result.derived : null;
  const derivedUop = known === "b2b" ? (derived?.side === "uop" ? derived.amount : scenario.uopGross) : null;
  const derivedB2b = known === "uop" ? (derived?.side === "b2b" ? derived.amount : scenario.b2bRate) : null;
  const setKnown = (k: Known) => smoothly(() => flushSync(() => setScenario((s) => ({ ...s, known: k }))));
  // "Wpisz sam": back to both amounts, starting from the computed one.
  const takeOver = (change: Partial<Scenario>) => smoothly(() => flushSync(() => setScenario((s) => ({ ...s, ...change, known: "obie" }))));
  const extrasText =
    extrasMonthly.uop > 0
      ? `PPK i benefity z umowy o pracę są warte ${money.whole(extrasMonthly.uop)} miesięcznie - na B2B trzeba je opłacić samemu, więc na rękę wychodzi o tyle więcej.`
      : "PPK i benefitów nie ma w założeniach, więc wyrównana jest tylko kwota na rękę.";
  const pensionGap = pensionMonthly.uop - pensionMonthly.b2b;
  const pensionText =
    pensionGap > 0
      ? `Emerytura: na umowie o pracę na Twoje konto w ZUS trafia ${money.whole(pensionMonthly.uop)} składek emerytalnych miesięcznie, na B2B ${money.whole(pensionMonthly.b2b)}. Żeby to wyrównać, odkładaj sam ok. ${money.whole(pensionGap)} miesięcznie - tej kwoty nie ma w wyliczeniu.`
      : `Emerytura: na B2B na Twoje konto w ZUS trafia tyle samo albo więcej składek emerytalnych (${money.whole(pensionMonthly.b2b)} miesięcznie) niż na umowie o pracę.`;
  const derivedText =
    known === "uop"
      ? [
          derived?.amount === null
            ? "Na B2B nie da się wyjść tak samo - nawet bardzo wysoka stawka nie wystarczy."
            : `Na B2B weź co najmniej ${money.whole(amounts.b2bRate)} netto na fakturze.`,
          `Wtedy masz tyle samo, co na umowie o pracę: na rękę i w korzyściach. ${extrasText}${b2bNeeded !== null && b2bNeeded !== amounts.b2bRate ? ` Licząc tylko na rękę, wystarczy ${money.whole(b2bNeeded)}.` : ""}`,
        ]
      : known === "b2b"
        ? [
            `Ta oferta B2B jest warta tyle, co ${money.whole(amounts.uopGross)} brutto na umowie o pracę.`,
            `Tyle brutto daje na rękę razem z korzyściami tyle samo, co B2B. ${extrasText}${uopMatching !== null && uopMatching !== amounts.uopGross ? ` Licząc tylko na rękę: ${money.whole(uopMatching)} brutto.` : ""}`,
          ]
        : null;
  const days = c.days;
  const others = hasOthers(scenario);

  // Named scenarios on the device (the demo keeps them only until the page is closed).
  const [saved, setSaved] = useState<SavedScenario[]>(loadSaved);
  const [lastDeleted, setLastDeleted] = useState<SavedScenario[] | null>(null);
  const storeList = (list: SavedScenario[]) => {
    setSaved(list);
    storeSaved(list);
  };
  const answerText = derivedText ? [...derivedText, pensionText] : [
    diffMonthly === 0 ? "Obie oferty dają tyle samo na rękę." : `B2B daje o ${money.whole(Math.abs(diffMonthly))} miesięcznie ${better} na rękę.`,
    [
      b2bNeeded === null
        ? "Na B2B nie da się wyjść tak samo - nawet bardzo wysoka stawka nie wystarczy."
        : `Żeby wyjść tak samo, na B2B trzeba wziąć co najmniej ${money.whole(b2bNeeded)} netto na fakturze.`,
      uopMatching !== null ? `Twoja oferta B2B jest warta tyle, co ${money.whole(uopMatching)} brutto na umowie o pracę.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  ];
  const makePdf = () =>
    downloadPdf(
      reportOf({
        today: new Date(),
        year: rates.year,
        rulesMark: rules.mark,
        checked: newestCheck(shownFile),
        answer: answerText,
        uopGross: amounts.uopGross,
        b2bRate: amounts.b2bRate,
        derived: derived?.side ?? null,
        uop: c.uop,
        b2b: b2bShown,
        b2bTitle: `B2B ${formLong(formShown, scenario.b2b.ryczaltRate)}`,
        form: formShown,
        assumptions: assumptionSentences(scenario, c.b2b.best, rates.year),
        money,
        rateNote: note,
        link: shareLink(scenario, rules.key),
      }),
      pdfName(new Date()),
    );

  // The parts of the window, put together below for a wide window or a phone (plan A27).
  const amountsPart = (
    <div className="amounts">
      <h1 className="side__title">Porównaj dwie oferty</h1>
      <KnownSwitch known={known} onChange={setKnown} />
      {known === "b2b" ? (
        <DerivedField
          label="Umowa o pracę - brutto miesięcznie"
          explain={MAIN_HINTS.uopGross}
          value={derivedUop}
          onTake={() => takeOver({ uopGross: derivedUop ?? scenario.uopGross })}
        />
      ) : (
        <MoneyField
          label="Umowa o pracę - brutto miesięcznie"
          explain={MAIN_HINTS.uopGross}
          value={scenario.uopGross}
          onChange={(uopGross) => setScenario({ ...scenario, uopGross })}
          note={belowMinWage(scenario.uopGross, rates.minWage, rates.year)}
        />
      )}
      {known === "uop" ? (
        <DerivedField
          label="B2B - netto na fakturze miesięcznie"
          hint="bez VAT"
          explain={MAIN_HINTS.b2bRate}
          value={derivedB2b}
          currency={rateCurrency}
          rate={fxOf(rateCurrency)}
          onTake={() => takeOver({ b2bRate: derivedB2b ?? scenario.b2bRate })}
        />
      ) : (
        <MoneyField
          label="B2B - netto na fakturze miesięcznie"
          hint="bez VAT"
          explain={MAIN_HINTS.b2bRate}
          value={scenario.b2bRate}
          onChange={(b2bRate) => setScenario({ ...scenario, b2bRate })}
          currency={rateCurrency}
          rate={fxOf(rateCurrency)}
          onCurrency={setRateCurrency}
          fxNote={fxWait(rateCurrency, "stawka")}
        />
      )}
    </div>
  );

  const assumptions = (
    <>
      <Assumptions scenario={scenario} best={c.b2b.best} year={rates.year} rates={rates} onChange={setScenario} />
      <Scenarios
        saved={saved}
        onSave={(name) => storeList(withSaved(saved, name, scenario, new Date()))}
        onLoad={(item) => setScenario(item.scenario)}
        onDelete={(item) => {
          setLastDeleted(saved);
          storeList(saved.filter((x) => x !== item));
        }}
        onUndoDelete={() => {
          if (lastDeleted) storeList(lastDeleted);
          setLastDeleted(null);
        }}
        link={() => shareLink(scenario, rules.key)}
        onPdf={makePdf}
      />
    </>
  );

  const rulesSwitch = <RulesSwitch options={options} chosen={rules} onChange={(o) => smoothly(() => flushSync(() => setRuleKey(o.key)))} />;
  const partsTabs = (
    <div ref={partsBar} className="parts">
      <Tabs items={PARTS} chosen={part} onChange={(p) => go("compare", p)} label="Część porównania" prefix="part" className="tabs tabs--parts" />
    </div>
  );
  const changesList = <UpcomingChanges changes={changes} now={nowFile} target={nextFile ?? nowFile} chosen={rules} />;
  const footText = (
    <p>
      To symulacja, nie porada podatkowa. Obliczenia odtwarzają przepisy na {rates.year} rok dokładnie, ale przed decyzją sprawdź je z
      księgowym.
    </p>
  );
  const foot = (
    <>
      {footText}
      <div ref={setFootSlot} />
    </>
  );

  const comparePart =
    part === "wynik" ? (
      // Only the answer is read out on every change - the other parts would be read whole.
      <div className="panel" role="tabpanel" id="panel-wynik" aria-labelledby="part-wynik" aria-live="polite">
        {derivedText ? (
          <>
            <h2 id="answer" className="answer">
              {known === "uop" ? (
                derived?.amount === null ? (
                  derivedText[0]
                ) : (
                  <>
                    Na B2B weź co najmniej <Rolling className="answer__num" text={money.whole(amounts.b2bRate)} /> netto na fakturze.
                  </>
                )
              ) : (
                <>
                  Ta oferta B2B jest warta tyle, co <Rolling className="answer__num" text={money.whole(amounts.uopGross)} /> brutto na umowie o pracę.
                </>
              )}
            </h2>
            <p className="answer__more">
              {derivedText[1]}
              {diffMonthly !== 0 && ` Na rękę B2B daje o ${money.whole(Math.abs(diffMonthly))} miesięcznie ${better}.`}
            </p>
            <p className="answer__note">{pensionText}</p>
          </>
        ) : (
          <>
            <h2 id="answer" className="answer">
              {diffMonthly === 0 ? (
                "Obie oferty dają tyle samo na rękę."
              ) : (
                <>
                  B2B daje o <Rolling className="answer__num" text={money.whole(Math.abs(diffMonthly))} /> miesięcznie {better} na rękę.
                </>
              )}
            </h2>
            <p className="answer__more">
              {b2bNeeded === null ? (
                "Na B2B nie da się wyjść tak samo - nawet bardzo wysoka stawka nie wystarczy."
              ) : (
                <>
                  Żeby wyjść tak samo, na B2B trzeba wziąć co najmniej <Rolling text={money.whole(b2bNeeded)} /> netto na fakturze.
                </>
              )}{" "}
              {uopMatching !== null && (
                <>
                  Twoja oferta B2B jest warta tyle, co <Rolling text={money.whole(uopMatching)} /> brutto na umowie o pracę.
                </>
              )}
            </p>
          </>
        )}
        <p className="answer__note">
          Średnio w miesiącu, cały rok {rates.year} z urlopem i chorobą. B2B liczone {formLong(formShown, scenario.b2b.ryczaltRate)}
          {scenario.form === null ? " - to najkorzystniejsza forma przy tych kwotach" : ""}.{" "}
          {days.b2bNeeded !== null &&
            `Na umowie o pracę pracujesz ${days.uopWorked} ${plural(days.uopWorked, "dzień", "dni", "dni")} w roku; na B2B, żeby mieć tyle samo, wystarczy ${days.b2bNeeded} ${plural(days.b2bNeeded, "dzień", "dni", "dni")}.`}
          {note && ` ${note}`}
          {fxWait(currency, "kwoty") && ` ${fxWait(currency, "kwoty")}`}
        </p>

        {/* Moving the computed amount on the rule means typing it - back to both amounts. */}
        <SlideRule
          model={model}
          uopGross={amounts.uopGross}
          b2bRate={amounts.b2bRate}
          b2bNeeded={b2bNeeded}
          onUop={(uopGross) => setScenario((s) => ({ ...s, uopGross, known: s.known === "b2b" ? "obie" : s.known }))}
          onB2b={(b2bRate) => setScenario((s) => ({ ...s, b2bRate, known: s.known === "uop" ? "obie" : s.known }))}
        />
      </div>
    ) : part === "skad" ? (
      <div className="panel" role="tabpanel" id="panel-skad" aria-labelledby="part-skad">
        <h2 id="answer" className="section-title section-title--first">
          Skąd te kwoty
        </h2>
        <Breakdown
          kind="uop"
          title="Umowa o pracę"
          wholeLabel="Brutto średnio"
          wholeShort={others ? "z innymi umowami; za chorobę jest 80%" : "mniej niż w umowie, bo za chorobę jest 80%"}
          data={uopBreakdown(c.uop)}
          form={formShown}
        />
        <Breakdown
          kind="b2b"
          title={`B2B ${formLong(formShown, scenario.b2b.ryczaltRate)}`}
          wholeLabel="Faktury średnio"
          wholeShort={others ? "z innymi umowami; za urlop i chorobę nie ma faktury" : "za urlop i chorobę nie ma faktury; z zasiłkiem z ZUS"}
          data={b2bBreakdown(b2bShown)}
          form={formShown}
        />
      </div>
    ) : part === "stawka" ? (
      <div className="panel" role="tabpanel" id="panel-stawka" aria-labelledby="part-stawka">
        <h2 id="answer" className="section-title section-title--first">
          Przy innej stawce B2B
        </h2>
        <p className="answer__note">
          O ile B2B daje więcej albo mniej na rękę niż ta umowa o pracę, gdyby stawka była inna - przy tych samych założeniach
          {scenario.form === null ? ", zawsze w najkorzystniejszej formie podatku" : ""}.
        </p>
        <ProfitChart
          data={profitChart(model, c.uop.netYear, amounts.b2bRate, b2bNeeded)}
          b2bRate={amounts.b2bRate}
          b2bNeeded={b2bNeeded}
          formChosen={scenario.form !== null}
        />
      </div>
    ) : (
      <div className="panel" role="tabpanel" id="panel-miesiace" aria-labelledby="part-miesiace">
        <h2 id="answer" className="section-title section-title--first">
          Miesiąc po miesiącu
        </h2>
        <p className="answer__note">Ile wpływa na konto w każdym miesiącu {rates.year} roku. Podatek i zdrowotną rozlicza się raz w roku - ta kwota jest osobno na dole.</p>
        <MonthTable uop={c.uop} b2b={b2bShown} />
      </div>
    );

  const panels =
    view === "compare" ? (
      <div role="tabpanel" id="panel-compare" aria-labelledby="tab-compare">
        {comparePart}
      </div>
    ) : view === "year" ? (
      <div className="panel" role="tabpanel" id="panel-year" aria-labelledby="tab-year">
        <h2 id="answer" className="answer">
          Rok {rates.year} na miarce
        </h2>
        <YearTape
          tape={yearTape(c.uop, b2bShown)}
          year={rates.year}
          form={formShown}
          vatPayer={scenario.vat !== "zwolniony"}
          sickPercent={SICK_PERCENT[scenario.sickKind]}
        />
      </div>
    ) : view === "know" ? (
      <div className="panel" role="tabpanel" id="panel-know" aria-labelledby="tab-know">
        <h2 id="answer" className="answer">
          Co warto wiedzieć
        </h2>
        <p className="answer__more">Przewodnik po obu umowach - przepisy na {rates.year} rok, przy każdym punkcie źródło.</p>
        <Knowledge rates={rates} />
      </div>
    ) : view === "sources" ? (
      <div className="panel" role="tabpanel" id="panel-sources" aria-labelledby="tab-sources">
        <h2 id="answer" className="answer">
          Źródła
        </h2>
        <Sources file={shownFile} fromRepo={kept.files.includes(shownFile)} kept={kept} onSettings={() => openSettings("data")} />
      </div>
    ) : null;

  return (
    <MoneyContext.Provider value={money}>
    <div className="page">
      <header className="top">
        <p className="top__name">Kalkulator UoP i B2B</p>
        <div className="top__actions">
        <button
          type="button"
          className="ai-open"
          aria-haspopup="dialog"
          onClick={() => {
            // Without a key the check cannot run - Settings → AI shows where to put it.
            if (!aiKey) return openSettings("ai", true);
            aiDialog.current?.showModal();
            aiBack.current = onBack(() => {
              aiBack.current = null;
              aiDialog.current?.close();
            });
          }}
        >
          Sprawdź przepisy z AI
        </button>
        <button type="button" className="set-open" aria-haspopup="dialog" onClick={() => openSettings("look")}>
          <Gear />
          Ustawienia
        </button>
        </div>
        <dialog
          ref={aiDialog}
          className="ai-dialog"
          aria-label="Sprawdź przepisy z AI"
          onClose={() => {
            aiBack.current?.();
            aiBack.current = null;
          }}
        >
          <div className="ai-dialog__bar">
            <button type="button" className="ai__plain" onClick={() => aiDialog.current?.close()}>
              Zamknij
            </button>
          </div>
          <AiCheck
            files={files}
            acts={kept.acts}
            applied={applied}
            usdRate={kept.fx.USD ?? null}
            hint={aiKey}
            spending={spending}
            onSpending={setSpending}
            onSettings={() => {
              aiDialog.current?.close();
              openSettings("ai");
            }}
            onApply={(a) =>
              setApplied((list) => {
                const next = [...list.filter((x) => changeId(x.change) !== changeId(a.change)), a];
                saveApplied(next);
                return next;
              })
            }
            onRestore={() => {
              saveApplied([]);
              setApplied([]);
            }}
          />
        </dialog>
        <Settings
          open={settingsOpen}
          onSection={(section) => setSettingsOpen((o) => (o ? { section, wantKey: false } : o))}
          onClose={closeSettings}
          theme={theme}
          onTheme={setTheme}
          still={still}
          onStill={setStill}
          currency={currency}
          onCurrency={setCurrency}
          kept={kept}
          busy={refreshing}
          report={report}
          onRefresh={() => void refresh()}
          app={app}
          keyHint={aiKey}
          keyError={aiKeyError}
          onKeyHint={(h) => {
            setAiKey(h);
            setAiKeyError(null);
          }}
          spending={spending}
          onSpending={setSpending}
        />
      </header>

      <main className="layout">
        {narrow ? (
          // Phone: one screen at a time, scrolled inside; the tabs on the bar at the bottom.
          <div className="result screen" ref={screen} aria-busy={busy}>
            <div className="screen__compare" hidden={view !== "compare"}>
              {amountsPart}
              {rulesSwitch}
              {partsTabs}
            </div>
            <div className="side" role="tabpanel" id="panel-assume" aria-labelledby="tab-assume" hidden={view !== "assume"}>
              {assumptions}
            </div>
            {panels}
            {view !== "assume" && changesList}
            <div className="foot foot--in" hidden={view !== "sources"}>
              {foot}
            </div>
          </div>
        ) : (
          <>
            <aside className="side">
              {amountsPart}
              {assumptions}
            </aside>
            <section className="result" aria-busy={busy}>
              <div className="result__head">
                {rulesSwitch}
                <Tabs items={WIDE_TABS} chosen={view} onChange={(t) => go(t, part)} label="Widok wyniku" prefix="tab" className="tabs" />
                <Reveal show={view === "compare"}>{partsTabs}</Reveal>
              </div>
              <div className="screen" ref={screen}>
                {panels}
                {changesList}
              </div>
            </section>
          </>
        )}
      </main>

      {/* The answer stays in sight on a phone wherever the result itself is not on the screen. */}
      <div className="dock" aria-hidden="true" hidden={!narrow || home}>
        {diffMonthly === 0 ? "Tyle samo na rękę" : <>B2B: <Rolling text={`${diffMonthly > 0 ? "+" : "-"}${money.whole(Math.abs(diffMonthly))}`} /> miesięcznie na rękę</>}
        {rules.mark && ` (przepisy ${rules.year}${rules.variant === "z-projektami" ? " z projektami" : ""})`}
      </div>

      {!narrow && <footer className="foot">{foot}</footer>}
      {narrow && <Tabs items={TABS} chosen={view} onChange={(t) => go(t, part)} label="Ekrany" prefix="tab" className="nav" />}
      <FirstSteps linksIn={footSlot} />
    </div>
    </MoneyContext.Provider>
  );
}

/** The gear of "Ustawienia", drawn with a thin line like the rest of the drawing. */
function Gear() {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.5" />
      {teeth.map((deg) => (
        <line key={deg} x1="12" y1="2.5" x2="12" y2="5.5" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}

interface MoneyProps {
  label: string;
  hint?: string;
  value: Money;
  onChange: (v: Money) => void;
  /** The B2B rate can be typed in euro or dollars - converted to złoty at the NBP mid rate. */
  currency?: Currency;
  rate?: FxRate | null;
  onCurrency?: (c: Currency) => void;
  /** Said under the field while the rate is missing. */
  fxNote?: string | null;
  /** A quiet remark under the field, e.g. a salary below the minimum wage. */
  note?: string | null;
}

function MoneyField(props: MoneyProps & { explain: HintText }) {
  // The "?" sits outside the <label>, so a tap on it does not move the focus into the field.
  return (
    <div className="hinted">
      <MoneyInput {...props} />
      <Hint term={props.label} hint={props.explain} />
    </div>
  );
}

function MoneyInput({ label, hint, value, onChange, currency = "PLN", rate = null, onCurrency, fxNote, note }: MoneyProps) {
  const [text, setText] = useState<string | null>(null);
  // Without the rate the field stays in złoty.
  const fx = currency !== "PLN" && rate ? rate : null;
  const shown = text ?? zlWhole(fx ? Math.round(toForeign(value, fx) / 100) * 100 : value).replace(/\s*zł$/, "");
  const invalid = text !== null && parseZl(text) === null;
  const toZl = (typed: Money) => (fx ? fromForeign(typed, fx) : typed);
  return (
    <label className="money">
      <span className="money__label">
        {label}
        {hint && <span className="money__hint"> ({hint})</span>}
      </span>
      <span className="money__box">
        <input
          inputMode="decimal"
          value={shown}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseZl(e.target.value);
            if (v !== null) onChange(toZl(v));
          }}
          onBlur={() => setText(null)}
        />
        {!onCurrency && <span className="money__unit">zł</span>}
        {onCurrency && (
        <select
          className="money__currency"
          aria-label={`Waluta: ${label}`}
          value={currency}
          onChange={(e) => {
            setText(null);
            onCurrency(e.target.value as Currency);
          }}
        >
          {(["PLN", "EUR", "USD"] as const).map((c) => (
            <option key={c} value={c}>
              {CURRENCY_SIGN[c]}
            </option>
          ))}
        </select>
        )}
      </span>
      <Reveal inline show={invalid}>
        <span className="money__error">Wpisz kwotę cyframi, np. 12 000.</span>
      </Reveal>
      <Reveal inline show={fx !== null && !invalid}>
        {() => (
          <span className="money__fx">
            = {zlWhole(value)} po kursie NBP z {dateShort(fx!.date)}
          </span>
        )}
      </Reveal>
      <Reveal inline show={!!fxNote}>
        <span className="money__fx">{fxNote}</span>
      </Reveal>
      <Reveal inline show={!!note && !invalid}>
        <span className="money__fx">{note}</span>
      </Reveal>
    </label>
  );
}

interface DerivedProps {
  label: string;
  hint?: string;
  explain: HintText;
  /** The computed amount in złoty; `null` = no amount is enough. */
  value: Money | null;
  currency?: Currency;
  rate?: FxRate | null;
  onTake: () => void;
}

/**
 * The amount the person does not know (plan A26): a result in place of the field, its digits
 * rolling like the answer, with "Wpisz sam" to type it again (from the computed amount).
 */
function DerivedField({ label, hint, explain, value, currency = "PLN", rate = null, onTake }: DerivedProps) {
  const fx = currency !== "PLN" && rate ? rate : null;
  const id = useId();
  const shown = value === null ? null : zlWhole(fx ? Math.round(toForeign(value, fx) / 100) * 100 : value).replace(/\s*zł$/, "");
  return (
    <div className="hinted">
      <div className="money money--derived">
        <span className="money__label" id={id}>
          {label}
          {hint && <span className="money__hint"> ({hint})</span>}
        </span>
        <span className="money__box money__box--derived">
          <output className="money__out" aria-labelledby={id}>
            {shown === null ? "nie da się" : <Rolling text={shown} />}
          </output>
          <span className="money__unit">{fx ? CURRENCY_SIGN[currency] : "zł"}</span>
        </span>
        <span className="money__fx">
          Wyliczone: tyle samo na rękę i te same korzyści.
          {fx && value !== null && ` = ${zlWhole(value)} po kursie NBP z ${dateShort(fx.date)}.`}
        </span>
        <button type="button" className="link money__take" onClick={onTake}>
          Wpisz sam
        </button>
      </div>
      <Hint term={label} hint={explain} />
    </div>
  );
}
