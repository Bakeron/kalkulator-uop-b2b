/**
 * The window "Sprawdź przepisy z AI" (assumption A4): the check itself and its proposals with
 * "Zastosuj" / "Pomiń", and "Przywróć dane z pliku". The key, the daily limit and the spending are
 * in Settings → AI (AiSettings.tsx); here only today's spending with a way there. The window opens
 * only with a key saved - without it the button opens Settings → AI.
 */
import { useRef, useState } from "react";
import type { RatesFile } from "../calc/rates";
import { changeId, isOfficial, question, readAnswer, systemPrompt, verify, type AiAnswer, type AiChange, type Applied, type Checked } from "../ai/check";
import { ask, errorText, fetchSource, type AiError } from "../ai/bridge";
import { ESTIMATE_USD, canAsk, costUsd, localDay, record, saveSpending, spentToday, usd, type Spending } from "../ai/spend";
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
  /** Last 4 characters of the saved key; `null` = none (the check cannot run). */
  hint: string | null;
  spending: Spending;
  onSpending: (s: Spending) => void;
  /** Opens Settings → AI (the key, the limit, the spending). */
  onSettings: () => void;
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

export default function AiCheck({ files, acts, applied, usdRate, hint, spending, onSpending, onSettings, onApply, onRestore }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [checked, setChecked] = useState<Checked[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const today = new Date();
  const spendingNow = useRef(spending);
  spendingNow.current = spending;

  const check = async () => {
    setError(null);
    setAnswer(null);
    setChecked([]);
    setDone(new Set());
    setBusy("Claude szuka w aktach i ogłoszeniach - zwykle 1-3 minuty…");
    try {
      const got = await ask(systemPrompt(localDay(today)), question(files, acts));
      // Paid even when the answer turns out refused or broken.
      const next = record(spendingNow.current, costUsd(got), new Date());
      onSpending(next);
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

      <p className="ai__row">
        <span>
          Dziś wydane: <span className="amount">{usd(spent)}</span> z <span className="amount">{usd(spending.limitUsd)}</span>
          {zlText(spent, usdRate)}.
        </span>
        <button type="button" className="ai__plain" onClick={onSettings}>
          Klucz, limit i wydatki - Ustawienia → AI
        </button>
      </p>

      <div className="sources__actions">
        <button type="button" className="sources__button" disabled={!hint || !allowed || busy !== null} onClick={check}>
          Sprawdź przepisy z AI
        </button>
        <span className="sources__state">
          {busy ??
            (!hint
              ? "Najpierw zapisz klucz w Ustawieniach → AI."
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
