/**
 * "Zapisz i udostępnij" under the assumptions: the PDF, the link with the settings and a few named
 * scenarios kept on the device (assumption "zapis ostatnich danych i kilku scenariuszy"). The data
 * typed last time are kept on their own (App), these are the ones the person wants to come back to.
 */
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { IS_DEMO } from "../demo";
import { dateShort } from "./format";
import { smoothly } from "./motion";
import Reveal from "./Reveal";
import { SAVED_MAX, type SavedScenario } from "./saved";

interface Props {
  saved: SavedScenario[];
  onSave: (name: string) => void;
  onLoad: (item: SavedScenario) => void;
  onDelete: (item: SavedScenario) => void;
  onUndoDelete: () => void;
  link: () => string;
  onPdf: () => Promise<void>;
}

type Status = { text: string; undo?: boolean; link?: string } | null;

export default function Scenarios({ saved, onSave, onLoad, onDelete, onUndoDelete, link, onPdf }: Props) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const nameId = useId();

  const copy = async () => {
    const url = link();
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ text: "Link skopiowany - otwiera kalkulator w przeglądarce z tymi samymi danymi. Kwoty są w samym linku, nie na serwerze." });
    } catch {
      setStatus({ text: "Nie udało się skopiować - zaznacz link i skopiuj go sam:", link: url });
    }
  };

  const pdf = async () => {
    setPdfBusy(true);
    try {
      await onPdf();
      setStatus({ text: "PDF gotowy - jest w pobranych plikach." });
    } catch {
      setStatus({ text: "Nie udało się zrobić PDF - spróbuj jeszcze raz." });
    } finally {
      setPdfBusy(false);
    }
  };

  const save = () => {
    const clean = name.trim();
    if (!clean) {
      setStatus({ text: "Wpisz nazwę scenariusza, np. „Oferta z banku”." });
      return;
    }
    const replaced = saved.some((s) => s.name.toLocaleLowerCase("pl") === clean.toLocaleLowerCase("pl"));
    onSave(clean);
    setName("");
    setStatus({ text: replaced ? `Zapisano „${clean}” w miejsce poprzedniego o tej nazwie.` : `Zapisano „${clean}”.` });
  };

  return (
    <section className="scenarios" aria-labelledby="scenarios-title">
      <h2 id="scenarios-title" className="assume__title">
        Zapisz i udostępnij
      </h2>
      <div className="scenarios__actions">
        <button type="button" className="scenarios__button" onClick={() => void pdf()} disabled={pdfBusy} aria-busy={pdfBusy}>
          {pdfBusy ? "Robię PDF…" : "Pobierz PDF"}
        </button>
        <button type="button" className="scenarios__button" onClick={() => void copy()}>
          Kopiuj link
        </button>
      </div>

      <div className="scenarios__save">
        <label htmlFor={nameId} className="scenarios__label">
          Zapisz te dane jako scenariusz
        </label>
        <div className="scenarios__row">
          <input
            id={nameId}
            value={name}
            maxLength={60}
            placeholder="np. Oferta z banku"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <button type="button" className="scenarios__button" onClick={save}>
            Zapisz
          </button>
        </div>
        <p className="assume__note">
          {IS_DEMO
            ? "W wersji demonstracyjnej scenariusze znikają po zamknięciu strony - w aplikacji zostają na urządzeniu."
            : `Zostają tylko na tym urządzeniu, najwyżej ${SAVED_MAX}.`}
        </p>
      </div>

      <p className="scenarios__status" role="status">
        {/* A new message fades in (keyed by its text) instead of replacing the old one at once. */}
        <span key={status?.text ?? ""} className="fade-in">
        {status?.text}
        {status?.undo && (
          <>
            {" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                onUndoDelete();
                setStatus(null);
              }}
            >
              Cofnij
            </button>
          </>
        )}
        {status?.link && <input className="scenarios__link" readOnly value={status.link} aria-label="Link do skopiowania" onFocus={(e) => e.target.select()} />}
        </span>
      </p>

      <Reveal show={saved.length > 0}>{() => (
        <ul className="scenarios__list" aria-label="Zapisane scenariusze">
          {saved.map((s) => (
            <li key={s.name} className="scenarios__item">
              <span className="scenarios__name">
                {s.name}
                {s.saved && <span className="scenarios__date"> · {dateShort(s.saved.slice(0, 10))}</span>}
              </span>
              <button
                type="button"
                className="link"
                aria-label={`Wczytaj scenariusz ${s.name}`}
                onClick={() =>
                  // Every number and sentence changes at once - the page cross-fades to the loaded scenario.
                  smoothly(() =>
                    flushSync(() => {
                      onLoad(s);
                      setStatus({ text: `Wczytano „${s.name}”.` });
                    }),
                  )
                }
              >
                Wczytaj
              </button>
              <button
                type="button"
                className="link"
                aria-label={`Usuń scenariusz ${s.name}`}
                onClick={() =>
                  // The list closes the gap smoothly instead of jumping up.
                  smoothly(() =>
                    flushSync(() => {
                      onDelete(s);
                      setStatus({ text: `Usunięto „${s.name}”.`, undo: true });
                    }),
                  )
                }
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}</Reveal>
    </section>
  );
}
