/**
 * The "Źródła" tab (assumption A1 "Źródła i Odśwież", A3): every number of the rates file with
 * its source and the date it was checked, and the new legal acts found by "Odśwież". The button
 * itself, the NBP rate and the font licences are in Settings (Dane, Waluta, O aplikacji - B4 a).
 */
import { newestCheck, type RateItem, type RatesFile } from "../calc/rates";
import { dateShort, plural } from "./format";
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
  /** Opens Settings → Dane, where "Odśwież" is. */
  onSettings: () => void;
}

export const when = (iso: string) => {
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

export default function Sources({ file, fromRepo, kept, onSettings }: Props) {
  const checked = newestCheck(file);
  const acts = kept.acts.filter((a) => a.published >= checked);
  return (
    <div className="sources">
      <section className="sources__refresh" aria-labelledby="refresh-title">
        <h3 id="refresh-title" className="changes__title">
          Czy dane są aktualne
        </h3>
        <p className="answer__note">
          Stawki {file.year} roku {fromRepo ? "z repozytorium (nowsze niż w aplikacji)" : "z aplikacji"}, ostatnio sprawdzone {dateShort(checked)}.{" "}
          {kept.refreshed ? `Odświeżone na tym urządzeniu: ${when(kept.refreshed)}.` : "Jeszcze nie odświeżane na tym urządzeniu."}{" "}
          <button type="button" className="link" onClick={onSettings}>
            Odśwież w Ustawieniach → Dane
          </button>
        </p>
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
    </div>
  );
}
