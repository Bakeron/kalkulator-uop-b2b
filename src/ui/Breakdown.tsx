/**
 * "Skąd ta kwota" as a technical drawing (assumption A8 a): the money of an average month is a
 * bar, every part has its own dimension line under the bar, with its name and amount in plain
 * text. A tap on a line opens who pays, to whom, when and which rule says so.
 * UoP is drawn with solid lines, B2B with dashed ones (not only colour).
 */
import { useId, useState } from "react";
import type { TaxForm } from "../calc/b2b";
import { useMoney } from "./currency";
import type { Breakdown as Data, Part } from "./model";
import Rolling from "./Rolling";

interface Text {
  name: string;
  short: string;
  detail: string;
}

const UOP: Record<Exclude<Part["key"], "koszty">, Text> = {
  zus: {
    name: "Składki na ZUS",
    short: "emerytalna 9,76%, rentowa 1,5%, chorobowa 2,45%",
    detail:
      "Pracodawca potrąca je z pensji i przelewa do ZUS do 15. dnia następnego miesiąca. Zapisują się na Twoim koncie emerytalnym. Przepis: ustawa o systemie ubezpieczeń społecznych.",
  },
  zdrowotna: {
    name: "Składka zdrowotna",
    short: "9% od brutto po składkach ZUS",
    detail:
      "Pracodawca potrąca ją i przekazuje do ZUS (dla NFZ) do 15. dnia następnego miesiąca. Nie zmniejsza podatku. Przepis: ustawa o świadczeniach opieki zdrowotnej.",
  },
  pit: {
    name: "Podatek PIT",
    short: "zaliczki co miesiąc i rozliczenie roczne",
    detail:
      "Pracodawca potrąca zaliczkę i wpłaca ją do urzędu skarbowego do 20. dnia następnego miesiąca. Zeznanie roczne PIT-37 składasz do 30 kwietnia - dopłata albo zwrot są tu już wliczone. Przepis: ustawa o podatku dochodowym od osób fizycznych.",
  },
  ppk: {
    name: "PPK - Twoja wpłata",
    short: "2% brutto",
    detail:
      "Pracodawca potrąca ją i przelewa do instytucji finansowej PPK. To nadal Twoje pieniądze - na koncie PPK, nie na wypłacie. Możesz zrezygnować deklaracją u pracodawcy.",
  },
  netto: {
    name: "Na rękę",
    short: "przelew na Twoje konto",
    detail:
      "Pracodawca wypłaca pensję najpóźniej 10. dnia następnego miesiąca (Kodeks pracy, art. 85). To średnia z 12 miesięcy - z płatnym urlopem i chorobowym 80%.",
  },
};

const HEALTH_SHORT: Record<TaxForm, string> = {
  skala: "9% dochodu",
  liniowy: "4,9% dochodu",
  ryczalt: "stała kwota według progu przychodu",
  ipbox: "9% dochodu",
};

const PIT_SHORT: Record<TaxForm, string> = {
  skala: "skala 12% i 32%",
  liniowy: "liniowy 19% dochodu",
  ryczalt: "ryczałt od przychodu",
  ipbox: "IP Box 5% dochodu z praw",
};

function b2bText(key: Part["key"], form: TaxForm): Text {
  switch (key) {
    case "koszty":
      return {
        name: "Koszty firmy",
        short: "księgowość i inne - z VAT, którego nie odzyskasz",
        detail: "Płacisz sam dostawcom. Na skali i liniowym zmniejszają podatek, na ryczałcie nie.",
      };
    case "zus":
      return {
        name: "Składki na ZUS",
        short: "zależą od etapu firmy",
        detail:
          "Płacisz sam, przelewem na swój rachunek składkowy w ZUS, do 20. dnia następnego miesiąca. Przez pierwsze 6 miesięcy firmy ulga na start (bez składek społecznych), potem 24 miesiące preferencyjnego ZUS. Przepis: Prawo przedsiębiorców, art. 18.",
      };
    case "zdrowotna":
      return {
        name: "Składka zdrowotna",
        short: HEALTH_SHORT[form],
        detail:
          "Płacisz sam do ZUS do 20. dnia następnego miesiąca. Raz w roku rozliczasz ją w deklaracji za kwiecień (do 20 maja) - dopłata albo zwrot są tu już wliczone.",
      };
    case "pit":
      return {
        name: "Podatek PIT",
        short: PIT_SHORT[form],
        detail:
          "Zaliczkę wpłacasz sam na mikrorachunek podatkowy do 20. dnia następnego miesiąca. Zeznanie roczne (PIT-36, PIT-36L albo PIT-28) składasz do 30 kwietnia - dopłata albo zwrot są tu już wliczone.",
      };
    case "netto":
      return {
        name: "Na rękę",
        short: "co zostaje z faktur",
        detail:
          "Klient płaci fakturę w terminie z umowy (zwykle 14-30 dni). Za dni wolne nie wystawiasz faktury. To średnia z 12 miesięcy.",
      };
    default:
      return UOP[key];
  }
}

interface Props {
  kind: "uop" | "b2b";
  title: string;
  wholeLabel: string;
  wholeShort: string;
  data: Data;
  form: TaxForm;
}

export default function Breakdown({ kind, title, wholeLabel, wholeShort, data, form }: Props) {
  const m = useMoney();
  const [open, setOpen] = useState<Part["key"] | null>(null);
  const id = useId();
  const whole = Math.max(1, data.whole);
  let start = 0;
  const spans = data.parts.map((p) => {
    const width = (Math.max(0, p.amount) / whole) * 100;
    const span = { ...p, left: Math.min(100, start), width: Math.min(width, 100 - Math.min(100, start)) };
    start += width;
    return span;
  });
  const edges = [0, ...spans.map((s) => s.left + s.width)];

  return (
    <section className={`dims dims--${kind}`} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="dims__title">
        {title}
      </h3>
      <div className="dims__grid">
        {/* Extension lines from the bar down through every dimension line. */}
        <div className="dims__exts" aria-hidden="true">
          {edges.map((e, i) => (
            <span key={i} className="dims__ext" style={{ left: `${e}%` }} />
          ))}
        </div>
        <div className="dims__text dims__text--whole">
          <span>{wholeLabel}</span>
          <strong className="amount"><Rolling text={m.whole(data.whole)} /></strong>
          <span className="dims__short">{wholeShort}</span>
        </div>
        <div className="dims__track" aria-hidden="true">
          <div className="dims__bar">
            {spans.map((s) => (
              <span key={s.key} className={`dims__seg dims__seg--${s.key}`} style={{ left: `${s.left}%`, width: `${s.width}%` }} />
            ))}
          </div>
        </div>

        {spans.map((s) => {
          // The UoP side has business costs only with a business next to the job.
          const t = kind === "uop" && s.key !== "koszty" ? UOP[s.key] : b2bText(s.key, form);
          const isOpen = open === s.key;
          return (
            <div key={s.key} className={`dims__row${s.key === "netto" ? " dims__row--net" : ""}${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="dims__text"
                aria-expanded={isOpen}
                aria-controls={`${id}-${s.key}`}
                onClick={() => setOpen(isOpen ? null : s.key)}
              >
                <span className="dims__name">{t.name}</span>
                <strong className="amount"><Rolling text={m.whole(s.amount)} /></strong>
                <span className="dims__short">{t.short}</span>
              </button>
              <div className="dims__track" aria-hidden="true">
                {s.width > 0 && (
                  <span className={`dims__dim${s.width < 4 ? " is-narrow" : ""}`} style={{ left: `${s.left}%`, width: `${s.width}%` }}>
                    <i />
                    <i />
                  </span>
                )}
              </div>
              <div className="dims__detail" id={`${id}-${s.key}`} role="region" aria-label={t.name}>
                <div>
                  <p>{t.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {data.vat > 0 && (
        <p className="dims__vat">
          Do tego VAT {m.whole(data.vat)} miesięcznie - doliczasz go do faktury i oddajesz do urzędu skarbowego do 25. dnia
          następnego miesiąca. To nie są Twoje pieniądze, więc nie ma go na rysunku.
        </p>
      )}
    </section>
  );
}
