/**
 * Settings "Sprawdź przepisy z AI" (assumption A4): the API key (kept in the system vault, only its
 * end shown), the daily limit with the spending counter, the check itself and its proposals with
 * "Zastosuj" / "Pomiń", and "Przywróć dane z pliku". In the demo and the browser it only says it
 * works in the app.
 */
import { useEffect, useState } from "react";
import { DEMO_NOTE, IS_DEMO } from "../demo";
import type { RatesFile } from "../calc/rates";
import { changeId, isOfficial, question, readAnswer, systemPrompt, verify, type AiAnswer, type AiChange, type Applied, type Checked } from "../ai/check";
import { ask, deleteKey, errorText, fetchSource, inApp, keyHint, setKey, type AiError } from "../ai/bridge";
import { ESTIMATE_USD, canAsk, costUsd, loadSpending, localDay, record, saveSpending, spentToday, usd } from "../ai/spend";
import { dateShort } from "./format";
import Reveal from "./Reveal";
import type { FxRate, NewAct } from "./refresh";
import { STATUS_WORDS, itemLabel, valueText } from "./rules";
import "../styles/ai.css";

interface Props {
  /** The files as the calculator uses them now (with what was applied before). */
  files: readonly RatesFile[];
  acts: readonly NewAct[];
  applied: readonly Applied[];
  usdRate: FxRate | null;
  onApply: (a: Applied) => void;
  onRestore: () => void;
}

const zlText = (dollars: number, rate: FxRate | null) =>
  rate ? ` (ok. ${(dollars * rate.mid).toFixed(2).replace(".", ",")} zł)` : "";

function wasText(c: AiChange, files: readonly RatesFile[]): string {
  const file = files.find((f) => f.year === c.year);
  if (!file) return "-";
  if (c.type === "bill") return file.bills?.find((b) => b.title === c.title)?.from ?? "nie było na liście";
  const item = file.items[c.key];
  const old = c.target === "pending" ? item.pending?.value : item.value;
  return old === undefined ? "brak" : valueText(c.key, old);
}

function Proposal({ checked, files, onApply, onSkip }: { checked: Checked; files: readonly RatesFile[]; onApply: () => void; onSkip: () => void }) {
  const { change: c, verdict, reasons } = checked;
  const [sure, setSure] = useState(false);
  const title = c.type === "value" ? `${itemLabel(c.key)} - ${c.year}${c.target === "pending" ? " (zapowiedź, jeszcze nie obowiązuje)" : ""}` : `Co się zmieni: ${c.title} - ${c.year}`;
  const now = c.type === "value" ? valueText(c.key, c.value) : `${c.what} (od: ${c.from})`;
  return (
    <li className={`ai__item ai__item--${verdict}`}>
      <p className="ai__item-title">{title}</p>
      <p>
        było: <span className="amount">{wasText(c, files)}</span> -&gt; jest: <strong className="amount">{now}</strong>
        {c.type === "value" && <> - od {c.from}</>}
      </p>
      <p className="ai__meta">
        {STATUS_WORDS[c.status]} · źródło:{" "}
        <a href={c.url} target="_blank" rel="noreferrer noopener">
          {c.source}
        </a>
        {!isOfficial(c.url) && " (nie urzędowe)"}
      </p>
      <blockquote className="ai__quote">„{c.quote}”</blockquote>
      <Reveal show={verdict === "check"}>{() => (
        <div className="ai__check">
          <p>
            <strong>Sprawdź sam:</strong> {reasons.join("; ")}.
          </p>
          <label>
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> Sprawdziłem w źródle - liczba się zgadza
          </label>
        </div>
      )}</Reveal>
      <div className="ai__buttons">
        <button type="button" className="sources__button" disabled={verdict === "check" && !sure} onClick={onApply}>
          Zastosuj
        </button>
        <button type="button" className="ai__plain" onClick={onSkip}>
          Pomiń
        </button>
      </div>
    </li>
  );
}

export default function AiCheck({ files, acts, applied, usdRate, onApply, onRestore }: Props) {
  const app = !IS_DEMO && inApp();
  const [hint, setHint] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [spending, setSpending] = useState(loadSpending);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [checked, setChecked] = useState<Checked[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const today = new Date();

  useEffect(() => {
    if (app) keyHint().then(setHint, (e: AiError) => setError(errorText(e)));
  }, [app]);

  if (!app) {
    return (
      <section className="ai" aria-labelledby="ai-title">
        <h2 id="ai-title">Sprawdź przepisy z AI</h2>
        <p>
          Claude Sonnet z wyszukiwaniem w sieci sprawdza, czy kwoty i daty w kalkulatorze są aktualne, i proponuje zmiany ze źródłem i cytatem. Nic nie
          zmienia się samo.
        </p>
        <p className="ai__note">{IS_DEMO ? DEMO_NOTE : "Działa tylko w aplikacji na komputerze - klucz API jest w sejfie systemu."}</p>
      </section>
    );
  }

  const saveKey = async () => {
    setError(null);
    try {
      setHint(await setKey(keyInput));
      setKeyInput("");
    } catch (e) {
      setError(errorText(e as AiError));
    }
  };
  const removeKey = async () => {
    setError(null);
    try {
      await deleteKey();
      setHint(null);
    } catch (e) {
      setError(errorText(e as AiError));
    }
  };
  const setLimit = (value: string) => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 100) return;
    const next = { ...spending, limitUsd: n };
    setSpending(next);
    saveSpending(next);
  };

  const check = async () => {
    setError(null);
    setAnswer(null);
    setChecked([]);
    setDone(new Set());
    setBusy("Claude szuka w aktach i ogłoszeniach - zwykle 1-3 minuty…");
    try {
      const got = await ask(systemPrompt(localDay(today)), question(files, acts));
      // Paid even when the answer turns out refused or broken.
      const next = record(loadSpending(), costUsd(got), new Date());
      setSpending(next);
      saveSpending(next);
      if (got.stopReason === "refusal") throw { kind: "refused", message: "" };
      const read = readAnswer(got.text, files);
      if (!read) throw { kind: "answer", message: "" };
      setBusy("Sprawdzam cytaty w źródłach…");
      const urls = [...new Set(read.changes.map((c) => c.url).filter(isOfficial))];
      const pages = new Map(await Promise.all(urls.map(async (u) => [u, await fetchSource(u)] as const)));
      setChecked(read.changes.map((c) => verify(c, pages.get(c.url) ?? null)));
      setAnswer(read);
    } catch (e) {
      setError(errorText(e as AiError));
    } finally {
      setBusy(null);
    }
  };

  const spent = spentToday(spending, today);
  const allowed = canAsk(spending, today);
  const open = checked.filter((c) => !done.has(changeId(c.change)));
  const finish = (c: AiChange) => setDone((d) => new Set(d).add(changeId(c)));

  return (
    <section className="ai" aria-labelledby="ai-title">
      <h2 id="ai-title">Sprawdź przepisy z AI</h2>
      <p>
        Claude Sonnet z wyszukiwaniem w sieci sprawdza, czy kwoty i daty w kalkulatorze są aktualne, i proponuje zmiany ze źródłem i cytatem. Wysyła tylko
        obecne stawki i listę nowych aktów - żadnych Twoich kwot. Nic nie zmienia się samo.
      </p>

      <h3>Klucz API Anthropic</h3>
      {hint ? (
        <p className="ai__row">
          Zapisany w sejfie systemu: <span className="amount">{hint}</span>
          <button type="button" className="ai__plain" onClick={removeKey}>
            Usuń klucz
          </button>
        </p>
      ) : (
        <form
          className="ai__row"
          onSubmit={(e) => {
            e.preventDefault();
            void saveKey();
          }}
        >
          <label htmlFor="ai-key">Klucz (zaczyna się od sk-ant-)</label>
          <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          <button type="submit" className="sources__button" disabled={!keyInput.trim()}>
            Zapisz w sejfie
          </button>
        </form>
      )}

      <h3>Wydatki</h3>
      <p>
        Dziś wydane: <span className="amount">{usd(spent)}</span> z <span className="amount">{usd(spending.limitUsd)}</span>
        {zlText(spent, usdRate)} - to szacunek liczony przez aplikację
        {usdRate ? `, kurs NBP z ${dateShort(usdRate.date)}` : ""}.
      </p>
      <p className="ai__row">
        <label htmlFor="ai-limit">Dzienny limit w $</label>
        <input id="ai-limit" type="number" min="0.5" max="100" step="0.5" defaultValue={spending.limitUsd} onBlur={(e) => setLimit(e.target.value)} />
      </p>

      <div className="sources__actions">
        <button type="button" className="sources__button" disabled={!hint || !allowed || busy !== null} onClick={check}>
          Sprawdź przepisy z AI
        </button>
        <span className="sources__state">
          {busy ??
            (!hint
              ? "Najpierw zapisz klucz."
              : allowed
                ? `Koszt jednego sprawdzenia: ok. ${usd(ESTIMATE_USD.low)}-${usd(ESTIMATE_USD.high)}${zlText(ESTIMATE_USD.high, usdRate)}.`
                : "Dzienny limit wyczerpany - podnieś go albo spróbuj jutro.")}
        </span>
      </div>
      <p role="status" className="ai__error">
        <span key={error ?? ""} className="fade-in">
          {error}
        </span>
      </p>

      <Reveal show={answer !== null}>{() => answer && (
        <div className="ai__answer">
          {answer.summary && <p>{answer.summary}</p>}
          {checked.length === 0 && <p>Brak propozycji zmian - dane w kalkulatorze zgadzają się z tym, co znalazło AI.</p>}
          {answer.rejected > 0 && (
            <p className="ai__meta">Odrzucone propozycje bez źródła, cytatu albo w złej postaci: {answer.rejected}.</p>
          )}
          {open.length > 0 && (
            <ul className="ai__list">
              {open.map((c) => (
                <Proposal
                  key={changeId(c.change)}
                  checked={c}
                  files={files}
                  onApply={() => {
                    onApply({ change: c.change, day: localDay(new Date()) });
                    finish(c.change);
                  }}
                  onSkip={() => finish(c.change)}
                />
              ))}
            </ul>
          )}
          {answer.acts.length > 0 && (
            <>
              <h3>Nowe akty</h3>
              <ul>
                {answer.acts.map((a) => (
                  <li key={a.eli}>
                    {a.eli}: {a.changes ? "zmienia obliczenia" : "nie zmienia obliczeń"} - {a.what}
                  </li>
                ))}
              </ul>
            </>
          )}
          {answer.needsNewVersion.length > 0 && (
            <>
              <h3>Ta zmiana wymaga nowej wersji aplikacji</h3>
              <ul>
                {answer.needsNewVersion.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}</Reveal>

      <Reveal show={applied.length > 0}>{() => (
        <div className="sources__actions">
          <span>
            Zastosowane z AI: {applied.length} (oznaczone w źródłach „z AI, dnia …”).
          </span>
          <button type="button" className="ai__plain" onClick={onRestore}>
            Przywróć dane z pliku
          </button>
        </div>
      )}</Reveal>
    </section>
  );
}
