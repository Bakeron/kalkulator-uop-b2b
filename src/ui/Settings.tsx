/**
 * The window "Ustawienia" behind the gear in the header (assumption A11, B4 a - like
 * Mikropłatności): parts on tabs - Wygląd, Waluta, Dane, AI, O aplikacji. The assumptions of the
 * calculation stay in the main window: they are what is compared, not settings of the app.
 * The window comes and goes smoothly; Esc, "Wstecz", "Zamknij" and a click beside it close it.
 * It keeps one height, so a part with less in it does not make the window jump.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { version } from "../../package.json";
import type { Spending } from "../ai/spend";
import AiSettings from "./AiSettings";
import { onBack } from "./back";
import { CURRENCY_NAME, CURRENCY_SIGN } from "./currency";
import { GUIDE_URL, showFirstSteps } from "./FirstSteps";
import { FONTS } from "./fonts";
import { dateShort } from "./format";
import { placeAll } from "./marks";
import { smoothly } from "./motion";
import Reveal from "./Reveal";
import type { Currency, Kept } from "./refresh";
import { when, type RefreshReport } from "./Sources";
import Tabs from "./Tabs";
import "../styles/settings.css";

export const SECTIONS = [
  { key: "look", label: "Wygląd" },
  { key: "currency", label: "Waluta" },
  { key: "data", label: "Dane" },
  { key: "ai", label: "AI" },
  { key: "about", label: "O aplikacji" },
] as const;
export type Section = (typeof SECTIONS)[number]["key"];

export type Theme = "system" | "light" | "dark";
const THEME_NAME: Record<Theme, string> = { light: "Jasny", dark: "Ciemny", system: "Jak w systemie" };
const CURRENCIES = ["PLN", "EUR", "USD"] as const;

/** What the window was opened for; `null` = closed. `onClose` must keep its identity (useCallback). */
export interface SettingsOpen {
  section: Section;
  /** "Sprawdź przepisy z AI" without a key: the key field is marked and focused. */
  wantKey: boolean;
}

interface Props {
  open: SettingsOpen | null;
  onSection: (s: Section) => void;
  onClose: () => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  still: boolean;
  onStill: (reduce: boolean) => void;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  kept: Kept;
  /** "Odśwież" running, its last report. */
  busy: boolean;
  report: RefreshReport | null;
  onRefresh: () => void;
  /** Settings → AI. */
  app: boolean;
  keyHint: string | null;
  /** The vault could not be read at the start. */
  keyError: string | null;
  onKeyHint: (h: string | null) => void;
  spending: Spending;
  onSpending: (s: Spending) => void;
}

export default function Settings(props: Props) {
  const { open, onSection, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const isOpen = open !== null;

  // Opened and closed from the state; Back closes it while it is open.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !isOpen) return;
    if (!d.open) d.showModal();
    const release = onBack(() => onClose());
    return () => {
      release();
      if (d.open) d.close();
    };
  }, [isOpen, onClose]);

  // The sliding line under the chosen tab and option: measured once the window is laid out.
  useLayoutEffect(() => {
    if (isOpen) placeAll();
  }, [isOpen, open?.section, props.theme, props.currency]);

  // A new part starts at its top.
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [open?.section]);

  // While the window fades out it still shows the part it had.
  const last = useRef<SettingsOpen>({ section: "look", wantKey: false });
  if (open) last.current = open;
  const section = last.current.section;
  return (
    <dialog
      ref={dialog}
      className="settings"
      aria-labelledby="settings-title"
      onClose={() => {
        if (isOpen) onClose();
      }}
      // A click beside the window (on the dimmed page) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="settings__sheet">
        <header className="settings__head">
          <h2 id="settings-title">Ustawienia</h2>
          <button type="button" className="ai__plain" onClick={() => dialog.current?.close()}>
            Zamknij
          </button>
        </header>
        <Tabs
          items={SECTIONS}
          chosen={section}
          onChange={onSection}
          label="Części ustawień"
          prefix="set"
          className="tabs settings__tabs"
          panelOf={(k) => `set-panel-${k}`}
        />
        <div className="settings__body" ref={body}>
          <div key={section} className="settings__panel" role="tabpanel" id={`set-panel-${section}`} aria-labelledby={`set-${section}`}>
            <Part section={section} {...props} open={last.current} />
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Part({ section, ...p }: Props & { section: Section }) {
  switch (section) {
    case "look":
      return (
        <>
          <Group title="Motyw">
            <fieldset className="theme" data-mark="input:checked + span">
              <legend className="sr-only">Motyw</legend>
              {(["light", "dark", "system"] as const).map((t) => (
                <label key={t}>
                  <input type="radio" name="theme" checked={p.theme === t} onChange={() => p.onTheme(t)} />
                  <span data-text={THEME_NAME[t]}>{THEME_NAME[t]}</span>
                </label>
              ))}
            </fieldset>
            <p className="set-note">„Jak w systemie” zmienia się sam razem z ustawieniem Windows albo telefonu.</p>
          </Group>
          <Group title="Ruch">
            <label className="set-check">
              <input type="checkbox" checked={p.still} onChange={(e) => p.onStill(e.target.checked)} />
              <span>Ogranicz animacje</span>
            </label>
            <p className="set-note">Zakładki, okna i liczby zmieniają się od razu, bez przesuwania i przenikania. Bez wyboru decyduje ustawienie systemu.</p>
          </Group>
        </>
      );
    case "currency": {
      const fx = (["EUR", "USD"] as const).flatMap((c) => (p.kept.fx[c] ? [{ c, r: p.kept.fx[c]! }] : []));
      return (
        <>
          <Group title="Waluta wyników">
            <fieldset className="theme" data-mark="input:checked + span">
              <legend className="sr-only">Waluta wyników</legend>
              {CURRENCIES.map((c) => (
                <label key={c}>
                  <input type="radio" name="currency" checked={p.currency === c} onChange={() => smoothly(() => flushSync(() => p.onCurrency(c)))} />
                  <span title={CURRENCY_NAME[c]} data-text={`${CURRENCY_SIGN[c]} - ${CURRENCY_NAME[c]}`}>
                    {CURRENCY_SIGN[c]} - {CURRENCY_NAME[c]}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="set-note">
              Podatki i ZUS liczę zawsze w złotych - wyniki przeliczam po średnim kursie NBP. Stawkę B2B możesz wpisać w euro albo dolarach w samym polu
              stawki.
            </p>
          </Group>
          <Group title="Kurs NBP">
            {fx.length > 0 ? (
              <p className="set-state">
                {fx.map(({ c, r }, i) => (
                  <span key={c}>
                    {i > 0 && ", "}1 {CURRENCY_SIGN[c]} = <span className="amount">{r.mid.toLocaleString("pl-PL", { minimumFractionDigits: 4 })} zł</span>
                  </span>
                ))}{" "}
                (tabela {fx[0]!.r.table || "A"} z {dateShort(fx[0]!.r.date)},{" "}
                <a href="https://nbp.pl/statystyka-i-sprawozdawczosc/kursy/tabela-a/" target="_blank" rel="noreferrer noopener">
                  NBP
                </a>
                ).
              </p>
            ) : (
              <p className="set-state">Jeszcze nie pobrany - pobiorę go, gdy wybierzesz euro albo dolary, albo przy „Odśwież” w części „Dane”.</p>
            )}
          </Group>
        </>
      );
    }
    case "data":
      return (
        <Group title="Czy dane są aktualne">
          <p className="set-note">
            „Odśwież” pobiera tylko dane publiczne: plik stawek z repozytorium, nowe akty prawne z API Sejmu i kurs NBP. Twoje kwoty nigdzie nie wychodzą.
            Nowe akty pokazuję w zakładce „Źródła”.
          </p>
          <p className="sources__actions">
            <button type="button" className="sources__button" onClick={p.onRefresh} disabled={p.busy} aria-describedby="refresh-state">
              {p.busy ? "Sprawdzam…" : "Odśwież"}
            </button>
            <span id="refresh-state" className="sources__state" role="status">
              <span key={p.busy ? "busy" : (p.kept.refreshed ?? "")} className="fade-in">
                {p.busy ? "Pobieram dane…" : p.kept.refreshed ? `Ostatnio: ${when(p.kept.refreshed)}` : "Jeszcze nie odświeżane na tym urządzeniu."}
              </span>
            </span>
          </p>
          <Reveal show={p.report !== null && !p.busy}>
            {() =>
              p.report && (
                <ul className="sources__report">
                  <li>{p.report.rates}</li>
                  <li>{p.report.acts}</li>
                  <li>{p.report.fx}</li>
                </ul>
              )
            }
          </Reveal>
        </Group>
      );
    case "ai":
      return (
        <AiSettings
          app={p.app}
          hint={p.keyHint}
          vaultError={p.keyError}
          onHint={p.onKeyHint}
          spending={p.spending}
          onSpending={p.onSpending}
          usdRate={p.kept.fx.USD ?? null}
          wantKey={p.open?.wantKey ?? false}
        />
      );
    case "about":
      return (
        <>
          <Group title="Kalkulator UoP i B2B">
            <p className="set-state">
              Wersja <span className="amount">{version}</span>. Licencja MIT. To symulacja, nie porada podatkowa - przed decyzją sprawdź wynik z księgowym.
            </p>
          </Group>
          <Group title="Pomoc">
            <p className="set-row">
              <button
                type="button"
                className="sources__button"
                onClick={() => {
                  p.onClose();
                  showFirstSteps();
                }}
              >
                Pokaż pierwsze kroki
              </button>
              <a className="link" href={GUIDE_URL} target="_blank" rel="noopener">
                Instrukcja ze zrzutami ekranu
              </a>
            </p>
          </Group>
          <Group title="Czcionki i ich licencje">
            <ul className="set-list">
              {FONTS.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}</strong> ({f.use}) -{" "}
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.licence}
                  </a>
                  <span className="set-url">{f.url}</span>
                </li>
              ))}
            </ul>
          </Group>
        </>
      );
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
