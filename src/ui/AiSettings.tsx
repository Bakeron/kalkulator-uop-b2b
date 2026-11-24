/**
 * Settings → AI (assumption A11, B4 a): one provider only - Claude Sonnet 5.5 - described as in
 * Tablica Ofert: what AI does here, what one check costs, how accurate it is, what is sent; how to
 * get a key, the key field (system vault, last 4 characters, "Pokaż / Ukryj"), the daily limit,
 * what was spent today and this month, the last top-up and roughly what is left of it.
 * In the demo everything is shown, the fields are disabled with the demo note.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DEMO_NOTE } from "../demo";
import { deleteKey, errorText, revealKey, setKey, type AiError } from "../ai/bridge";
import { ESTIMATE_USD, dollarsTyped, localDay, saveSpending, sinceTopUp, spentMonth, spentToday, usd, type Spending } from "../ai/spend";
import { dateShort } from "./format";
import Reveal from "./Reveal";
import type { FxRate } from "./refresh";

/** Pages of the Claude console - one per step of "Jak zdobyć klucz". */
const STEPS: { text: string; link: [string, string] | null }[] = [
  { text: "Otwórz konsolę Claude i zaloguj się albo załóż konto (e-mail albo konto Google).", link: ["https://platform.claude.com/", "Otwórz konsolę Claude"] },
  {
    text: "Doładuj konto: na stronie „Billing” kliknij „Buy credits”, wpisz kwotę (najmniej 5 $) i dane karty. Bez środków klucz nie działa.",
    link: ["https://platform.claude.com/settings/billing", "Otwórz „Billing”"],
  },
  {
    text: "Utwórz klucz: na stronie „API keys” kliknij „Create Key”, wpisz nazwę (np. Kalkulator UoP i B2B) i potwierdź. Skopiuj klucz od razu - pokazuje się tylko raz.",
    link: ["https://platform.claude.com/settings/keys", "Otwórz „API keys”"],
  },
  { text: "Wklej klucz w pole „Klucz API” poniżej i kliknij „Zapisz w sejfie”.", link: null },
];

const plnOf = (dollars: number, rate: FxRate | null) => (rate ? `ok. ${(dollars * rate.mid).toFixed(2).replace(".", ",")} zł` : null);

interface Props {
  /** The desktop or phone app - outside it (demo, browser) the fields are disabled. */
  app: boolean;
  /** Last 4 characters of the saved key (`••••1234`), `null` = no key. */
  hint: string | null;
  onHint: (hint: string | null) => void;
  /** The vault could not be read at the start. */
  vaultError: string | null;
  spending: Spending;
  onSpending: (s: Spending) => void;
  usdRate: FxRate | null;
  /** Opened by "Sprawdź przepisy z AI" without a key: the key field is marked and focused. */
  wantKey: boolean;
}

export default function AiSettings({ app, hint, onHint, vaultError, spending, onSpending, usdRate, wantKey }: Props) {
  const today = new Date();
  const off = !app;
  const change = (next: Spending) => {
    onSpending(next);
    saveSpending(next);
  };
  const spent = spentToday(spending, today);
  const month = spentMonth(spending, today);
  const left = sinceTopUp(spending);
  const pln = (d: number) => plnOf(d, usdRate);

  return (
    <div className="set-ai">
      <section className="set-card" aria-labelledby="ai-card-title">
        <header className="set-card__head">
          <h3 id="ai-card-title">Claude (Anthropic) - Sonnet 5.5</h3>
          <span className="set-card__tag">Płatne za zużycie</span>
        </header>
        <dl className="set-facts">
          <div>
            <dt>Co robi</dt>
            <dd>
              Na Twoje kliknięcie sprawdza z wyszukiwaniem w sieci, czy kwoty i daty przepisów w kalkulatorze są aktualne, i proponuje zmiany ze źródłem i
              cytatem. Nic nie zmienia samo - każdą zmianę zatwierdzasz.
            </dd>
          </div>
          <div>
            <dt>Koszt jednego sprawdzenia</dt>
            <dd>
              ok. {usd(ESTIMATE_USD.low)}-{usd(ESTIMATE_USD.high)}
              {usdRate ? ` (${pln(ESTIMATE_USD.low)!.replace("ok. ", "")}-${pln(ESTIMATE_USD.high)!.replace("ok. ", "")}, kurs NBP z ${dateShort(usdRate.date)})` : ""}
              {" "}- cennik Sonnet 5.5: 2 $ / 10 $ za milion tokenów i 0,01 $ za wyszukiwanie (11.2026).
            </dd>
          </div>
          <div>
            <dt>Dokładność</dt>
            <dd>
              Dobrze czyta polskie ustawy i obwieszczenia, ale może się pomylić albo wziąć nieurzędową stronę. Dlatego każda propozycja ma cytat, który
              aplikacja sama szuka w źródle; gdy go nie znajdzie, propozycja dostaje „Sprawdź sam” i nie da się jej zastosować bez Twojego potwierdzenia.
            </dd>
          </div>
          <div>
            <dt>Co wysyła</dt>
            <dd>Tylko obecne stawki z kalkulatora i listę nowych aktów prawnych. Twoich kwot, założeń ani zapisanych porównań - nigdy.</dd>
          </div>
        </dl>
      </section>

      {off && (
        <p className="set-demo" role="note">
          {DEMO_NOTE}.
        </p>
      )}

      <details className="set-how" open={!hint && !off ? true : undefined}>
        <summary>Jak zdobyć klucz</summary>
        <ol>
          {STEPS.map((s) => (
            <li key={s.text}>
              {s.text}
              {s.link && (
                <span className="set-how__link">
                  <a href={s.link[0]} target="_blank" rel="noopener noreferrer">
                    {s.link[1]}
                  </a>{" "}
                  <span className="set-url">{s.link[0].replace("https://", "")}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </details>

      {vaultError && <p className="set-warn">{vaultError}</p>}
      <KeyField off={off} hint={hint} onHint={onHint} want={wantKey} />

      <section className="set-group" aria-labelledby="ai-money-title">
        <h3 id="ai-money-title">Wydatki</h3>
        <DollarField
          label="Dzienny limit wydatków (w $)"
          note="Po tej kwocie dziś nie da się zapytać Claude - do jutra albo do podniesienia limitu. Sprawdzane przed każdym zapytaniem - wyjątkowo drogie zapytanie może go lekko przekroczyć."
          value={spending.limitUsd}
          max={100}
          off={off}
          onSave={(v) => change({ ...spending, limitUsd: v ?? spending.limitUsd })}
          required
        />
        <p className="set-state" aria-live="polite">
          Dziś wydane: <span className="amount">{usd(spent)}</span> z <span className="amount">{usd(spending.limitUsd)}</span>
          {pln(spent) && ` (${pln(spent)})`}. W tym miesiącu: <span className="amount">{usd(month)}</span>
          {pln(month) && ` (${pln(month)})`}.
        </p>

        <DollarField
          label="Ostatnie doładowanie konta Claude (w $)"
          note="Wpłata na konto w konsoli Claude - w dolarach, bo tak liczy Anthropic. Aplikacja policzy, ile z niej wydała. Puste = nie licz."
          value={spending.topUpUsd}
          max={10_000}
          off={off}
          onSave={(v) =>
            change({ ...spending, topUpUsd: v, topUpDay: v === null ? null : (spending.topUpDay ?? localDay(today)) })
          }
        />
        <Reveal show={spending.topUpUsd !== null}>
          {() => (
            <label className="set-field">
              <span className="set-field__label">Dzień doładowania</span>
              <input
                type="date"
                max={localDay(today)}
                disabled={off}
                value={spending.topUpDay ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  // A day from the future (typed by hand - `max` does not stop typing) counts as today.
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) change({ ...spending, topUpDay: v > localDay(today) ? localDay(today) : v });
                }}
              />
              <span className="set-note">Wydatki liczę od tego dnia (włącznie).</span>
            </label>
          )}
        </Reveal>
        <Reveal show={left !== null}>
          {() =>
            left && (
              <p className="set-state" aria-live="polite">
                Wydane od {dateShort(spending.topUpDay!)}: ok. <span className="amount">{usd(left.spent)}</span> z{" "}
                <span className="amount">{usd(spending.topUpUsd!)}</span>, zostało ok. <span className="amount">{usd(left.left)}</span>
                {pln(left.left) && ` (${pln(left.left)})`}.
              </p>
            )
          }
        </Reveal>
        <Reveal show={left?.low === true}>
          <p className="set-warn" role="note">
            <strong>Uwaga:</strong> z doładowania zostało mniej niż 10%. Doładuj konto w konsoli Claude („Billing”), zanim Claude przestanie odpowiadać, i
            wpisz wyżej nową kwotę i dzień.
          </p>
        </Reveal>
        <p className="set-note">
          Aplikacja liczy to sama z tokenów i cennika Claude, więc to szacunek - dokładne saldo jest w konsoli Claude, w „Billing”.
          {usdRate ? ` Złote po kursie NBP z ${dateShort(usdRate.date)}.` : " Złote pokażę po pobraniu kursu NBP (Dane → Odśwież)."}
        </p>
      </section>
    </div>
  );
}

/** The key: typed once, saved straight to the system vault, shown as "••••1234". */
function KeyField({ off, hint, onHint, want }: { off: boolean; hint: string | null; onHint: (h: string | null) => void; want: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  // The saved key put into the field by "Pokaż" - unchanged it is not saved again, "Ukryj" takes it away.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (want) input.current?.focus({ preventScroll: false });
  }, [want]);

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e as AiError));
    } finally {
      setBusy(false);
    }
  };
  const toggle = () => {
    if (shown) {
      if (revealed !== null && value === revealed) setValue("");
      setRevealed(null);
      setShown(false);
      return;
    }
    setShown(true);
    if (value === "" && hint)
      void attempt(async () => {
        const saved = await revealKey();
        if (saved !== null) {
          setValue(saved);
          setRevealed(saved);
        }
      });
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    void attempt(async () => {
      onHint(await setKey(value));
      setValue("");
      setRevealed(null);
      setShown(false);
    });
  };
  const remove = () =>
    void attempt(async () => {
      await deleteKey();
      onHint(null);
      setValue("");
      setRevealed(null);
    });

  return (
    <form className={`set-key${want && !hint ? " set-key--wanted" : ""}`} onSubmit={save}>
      <div className="set-key__head">
        <label htmlFor={id} className="set-field__label">
          Klucz API Anthropic (zaczyna się od sk-ant-)
        </label>
        <button type="button" className="link" aria-controls={id} aria-pressed={shown} disabled={off || busy} onClick={toggle}>
          {shown ? "Ukryj klucz" : "Pokaż klucz"}
        </button>
      </div>
      <div className="set-key__row">
        <input
          ref={input}
          id={id}
          type={shown ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          maxLength={512}
          value={value}
          placeholder={hint ?? ""}
          disabled={off}
          aria-describedby={`${id}-state`}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="sources__button" disabled={off || busy || !value.trim() || value === revealed}>
          Zapisz w sejfie
        </button>
        {hint && (
          <button type="button" className="ai__plain" disabled={off || busy} onClick={remove}>
            Usuń klucz
          </button>
        )}
      </div>
      <p id={`${id}-state`} className="set-note">
        {hint ? `Zapisany: ${hint}. ` : "Nie ustawiono. "}
        Klucz jest w sejfie systemu (Menedżer poświadczeń Windows / Keystore Androida), nigdy w pliku. Na ekranie widać 4 ostatnie znaki, cały klucz -
        po kliknięciu „Pokaż klucz”.
      </p>
      <div aria-live="polite">
        <Reveal show={error !== null}>{error && <p className="set-warn">{error}</p>}</Reveal>
      </div>
    </form>
  );
}

/** A dollar amount saved on leaving the field (or Enter); a wrong one says how to write it. */
function DollarField({
  label,
  note,
  value,
  max,
  off,
  onSave,
  required = false,
}: {
  label: string;
  note: string;
  value: number | null;
  max: number;
  off: boolean;
  onSave: (v: number | null) => void;
  required?: boolean;
}) {
  const id = useId();
  const shown = value === null ? "" : String(value).replace(".", ",");
  const [text, setText] = useState<string | null>(null);
  const typed = text === null ? null : dollarsTyped(text, max);
  const wrong = text !== null && (typed === null || (required && typed === ""));
  const commit = () => {
    if (text === null) return;
    if (!wrong) onSave(typed === "" ? null : (typed as number));
    if (!wrong) setText(null);
  };
  return (
    <div className="set-field">
      <label htmlFor={id} className="set-field__label">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        className="set-field__money"
        disabled={off}
        value={text ?? shown}
        aria-invalid={wrong}
        aria-describedby={`${id}-note`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <Reveal show={wrong}>
        <p className="set-warn">Wpisz kwotę w dolarach, np. 5 albo 20,50 (od 0,01 do {max.toLocaleString("pl-PL")}).</p>
      </Reveal>
      <span id={`${id}-note`} className="set-note">
        {note}
      </span>
    </div>
  );
}
