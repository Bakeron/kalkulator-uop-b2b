/**
 * The "Źródła" tab (assumption A1 "Źródła i Odśwież", A3): every number of the rates file with
 * its source and the date it was checked, the button "Odśwież" (rates file from the repository,
 * new legal acts, NBP rates - public data only) and the licences of the bundled fonts.
 */
import { newestCheck, type RateItem, type RatesFile } from "../calc/rates";
import { CURRENCY_SIGN } from "./currency";
import { dateShort, plural } from "./format";
import FontLicenses from "./FontLicenses";
import Reveal from "./Reveal";
import type { Kept } from "./refresh";
import { checkedText, ITEM_ORDER, itemLabel, STATUS_WORDS, valueText } from "./rules";

/** What the last "Odśwież" said, one line per part. */
export interface RefreshReport {
  rates: string;
  acts: string;
  fx: string;
}

interface Props {
  file: RatesFile;
  /** The file came from the repository (newer than the one in the app). */
  fromRepo: boolean;
  kept: Kept;
  busy: boolean;
  report: RefreshReport | null;
  onRefresh: () => void;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${dateShort(iso.slice(0, 10))}, ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
};

function Source({ s }: { s: RateItem<unknown> }) {
  return (
    <span className="sources__meta">
      <a href={s.url} target="_blank" rel="noreferrer noopener">
        {s.source}
      </a>{" "}
      · {checkedText(s)} · {STATUS_WORDS[s.status]}
      <span className="sources__url">{s.url}</span>
    </span>
  );
}

export default function Sources({ file, fromRepo, kept, busy, report, onRefresh }: Props) {
  const checked = newestCheck(file);
  const acts = kept.acts.filter((a) => a.published >= checked);
  const fx = (["EUR", "USD"] as const).flatMap((c) => (kept.fx[c] ? [{ c, r: kept.fx[c]! }] : []));
  return (
    <div className="sources">
      <section className="sources__refresh" aria-labelledby="refresh-title">
        <h3 id="refresh-title" className="changes__title">
          Czy dane są aktualne
        </h3>
        <p className="answer__note">
          Stawki {file.year} roku {fromRepo ? "z repozytorium (nowsze niż w aplikacji)" : "z aplikacji"}, ostatnio sprawdzone{" "}
          {dateShort(checked)}. „Odśwież” pobiera tylko dane publiczne: plik stawek z repozytorium, nowe akty prawne z API Sejmu i kurs
          NBP. Twoje kwoty nigdzie nie wychodzą.
        </p>
        <p className="sources__actions">
          <button type="button" className="sources__button" onClick={onRefresh} disabled={busy} aria-describedby="refresh-state">
            {busy ? "Sprawdzam…" : "Odśwież"}
          </button>
          <span id="refresh-state" className="sources__state" role="status">
            <span key={busy ? "busy" : (kept.refreshed ?? "")} className="fade-in">
              {busy ? "Pobieram dane…" : kept.refreshed ? `Ostatnio: ${when(kept.refreshed)}` : "Jeszcze nie odświeżane na tym urządzeniu."}
            </span>
          </span>
        </p>
        <Reveal show={report !== null && !busy}>{() => report && (
          <ul className="sources__report">
            <li>{report.rates}</li>
            <li>{report.acts}</li>
            <li>{report.fx}</li>
          </ul>
        )}</Reveal>
        <Reveal show={acts.length > 0}>{() => (
          <div className="sources__acts" role="note">
            <p>
              <strong>
                Od {dateShort(checked)} opublikowano{" "}
                {acts.length === 1 ? "nowy akt" : `${acts.length} ${plural(acts.length, "nowy akt", "nowe akty", "nowych aktów")}`} o
                podatkach, ZUS albo płacach.
              </strong>{" "}
              Kalkulator dalej liczy po staremu, dopóki plik stawek nie zostanie sprawdzony - może coś zmieniają.
            </p>
            <ul>
              {acts.map((a) => (
                <li key={a.eli}>
                  <a href={a.url} target="_blank" rel="noreferrer noopener">
                    {a.title || a.eli}
                  </a>{" "}
                  <span className="sources__meta">
                    ({a.eli.replace(/\//g, " ")}, ogłoszony {dateShort(a.published)}; dotyczy: {a.topics.join(", ")})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}</Reveal>
        <Reveal show={fx.length > 0}>{() => (
          <p className="answer__note">
            Kurs średni NBP:{" "}
            {fx.map(({ c, r }, i) => (
              <span key={c}>
                {i > 0 && ", "}1 {CURRENCY_SIGN[c]} = {r.mid.toLocaleString("pl-PL", { minimumFractionDigits: 4 })} zł
              </span>
            ))}{" "}
            (tabela {fx[0]!.r.table || "A"} z {dateShort(fx[0]!.r.date)},{" "}
            <a href="https://nbp.pl/statystyka-i-sprawozdawczosc/kursy/tabela-a/" target="_blank" rel="noreferrer noopener">
              NBP
            </a>
            ).
          </p>
        )}</Reveal>
      </section>

      <section aria-labelledby="numbers-title">
        <h3 id="numbers-title" className="changes__title">
          Liczby w obliczeniach - {file.year} rok
        </h3>
        <p className="answer__note">
          Każda liczba z przepisu albo obwieszczenia, z odnośnikiem i datą, kiedy ją sprawdziłem. „Zmiana w projekcie” to wartość
          z ustawy, która jeszcze nie obowiązuje - liczona tylko przy przełączniku „razem z projektami”.
        </p>
        <ul className="sources__list">
          {ITEM_ORDER.map((key) => {
            const item = file.items[key] as RateItem<unknown>;
            return (
              <li key={key} className="sources__item">
                <span className="sources__name">{itemLabel(key)}</span>
                <span className="sources__value">{valueText(key, item.value)}</span>
                <Source s={item} />
                {item.note && <span className="sources__note">{item.note}</span>}
                {item.pending && (
                  <span className="sources__pending">
                    Zmiana w projekcie: {valueText(key, item.pending.value)} - <Source s={item.pending} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="fonts-title">
        <h3 id="fonts-title" className="changes__title">
          Czcionki
        </h3>
        <FontLicenses />
      </section>
    </div>
  );
}
