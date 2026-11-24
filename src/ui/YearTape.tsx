/**
 * The "Rok" tab (plan A9, look a: "miarka zwijana z 12 miesiącami"): each month is a piece of a
 * tape measure with one notch per business day - a solid tape for the employment contract, a
 * dashed one for B2B. Days off and sick days are hatched; on B2B the unpaid ones are cut out of
 * the tape. The net of the month stands under it. Below: the scale of payment deadlines.
 * Every mark has a word in the legend (not only colour); a screen reader gets one sentence per month.
 */
import { useId } from "react";
import type { TaxForm } from "../calc/b2b";
import { MONTHS, plural, zlWhole } from "./format";
import { monthlyDeadlines, unpaidDays, yearlyDeadlines, type TapeMonth } from "./year";

const CELL = 10;
const HEIGHT = 16;

const dni = (n: number) => `${n} ${plural(n, "dzień", "dni", "dni")}`;

type Mark = "worked" | "vacation" | "sick" | "cut" | "inactive";

function cells(parts: [Mark, number][]): Mark[] {
  return parts.flatMap(([mark, n]) => Array<Mark>(n).fill(mark));
}

function Strip({ marks, kind, ids }: { marks: Mark[]; kind: "uop" | "b2b"; ids: Record<"hatch" | "cross", string> }) {
  const width = marks.length * CELL;
  return (
    <svg className={`tape__strip tape__strip--${kind}`} viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {marks.map((m, i) => {
        const x = i * CELL;
        if (m === "inactive") return <line key={i} className="tape__none" x1={x} x2={x + CELL} y1={HEIGHT / 2} y2={HEIGHT / 2} />;
        if (m === "cut") return <rect key={i} className="tape__cut" x={x + 1} y={1} width={CELL - 2} height={HEIGHT - 2} />;
        const fill = m === "vacation" ? `url(#${ids.hatch})` : m === "sick" ? `url(#${ids.cross})` : undefined;
        return (
          <g key={i}>
            <rect className="tape__day" x={x} y={0} width={CELL} height={HEIGHT} style={fill ? { fill } : undefined} />
            <line className="tape__notch" x1={x} x2={x} y1={0} y2={i % 5 === 0 ? HEIGHT / 2 : HEIGHT / 4} />
          </g>
        );
      })}
    </svg>
  );
}

function monthSentence(t: TapeMonth): string {
  const u = [`${dni(t.uop.worked)} pracy`, t.uop.vacation > 0 && `${dni(t.uop.vacation)} płatnego urlopu`, t.uop.sick > 0 && `${dni(t.uop.sick)} płatnej choroby`];
  const b = [
    `${dni(t.b2b.worked)} pracy`,
    t.b2b.paid > 0 && `${dni(t.b2b.paid)} wolnego płatnego z umowy`,
    t.b2b.vacation + t.b2b.sick > 0 && `${dni(t.b2b.vacation + t.b2b.sick)} bez faktury`,
    t.b2b.inactive > 0 && `${dni(t.b2b.inactive)} przed założeniem firmy`,
  ];
  const list = (a: (string | false)[]) => a.filter(Boolean).join(", ");
  return `${MONTHS[t.month]}: ${dni(t.days)} roboczych. Umowa o pracę: ${list(u)}, na rękę ${zlWhole(t.uopNet)}. B2B: ${list(b)}, na rękę ${zlWhole(t.b2bNet)}.`;
}

export default function YearTape(props: { tape: TapeMonth[]; year: number; form: TaxForm; vatPayer: boolean; sickPercent: number }) {
  const { tape, year, form, vatPayer, sickPercent } = props;
  const id = useId();
  const ids = { hatch: `${id}-hatch`, cross: `${id}-cross` };
  const days = tape.reduce((a, t) => a + t.days, 0);
  const cut = unpaidDays(tape);
  const monthly = monthlyDeadlines(vatPayer);
  const byDay = [...new Set(monthly.map((d) => d.day))];

  return (
    <div className="year">
      <p className="answer__more">
        W {year} roku jest {dni(days)} roboczych. Na umowie o pracę płatny jest każdy z nich - urlop w całości, choroba w {sickPercent}%.
        {cut > 0 ? ` Na B2B ${dni(cut)} nie ma faktury - tyle taśmy jest uciętej.` : " Na B2B każdy dzień też jest płatny."}
      </p>

      <svg className="sr-only" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={ids.hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect className="tape__pattern-bg" width="4" height="4" />
            <line className="tape__pattern" x1="0" y1="0" x2="0" y2="4" />
          </pattern>
          <pattern id={ids.cross} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect className="tape__pattern-bg" width="4" height="4" />
            <circle className="tape__dot" cx="2" cy="2" r="0.9" />
          </pattern>
        </defs>
      </svg>

      <ul className="tape__legend" aria-label="Oznaczenia na taśmie">
        <li>
          <svg viewBox="0 0 20 12" aria-hidden="true">
            <rect className="tape__day" width="20" height="12" />
          </svg>
          praca
        </li>
        <li>
          <svg viewBox="0 0 20 12" aria-hidden="true">
            <rect className="tape__day" width="20" height="12" style={{ fill: `url(#${ids.hatch})` }} />
          </svg>
          urlop
        </li>
        <li>
          <svg viewBox="0 0 20 12" aria-hidden="true">
            <rect className="tape__day" width="20" height="12" style={{ fill: `url(#${ids.cross})` }} />
          </svg>
          choroba
        </li>
        <li>
          <svg viewBox="0 0 20 12" aria-hidden="true">
            <rect className="tape__cut" x="1" y="1" width="18" height="10" />
          </svg>
          dzień bez faktury (tylko B2B)
        </li>
        <li>
          <span className="tape__key tape__key--uop" aria-hidden="true" /> umowa o pracę
          <span className="tape__key tape__key--b2b" aria-hidden="true" /> B2B
        </li>
      </ul>

      <ol className="tape">
        {tape.map((t) => (
          <li key={t.month} className="tape__month">
            <span className="sr-only">{monthSentence(t)}</span>
            <div aria-hidden="true">
              <p className="tape__name">
                {MONTHS[t.month]} <span className="tape__count">{t.days} dni</span>
              </p>
              <Strip kind="uop" ids={ids} marks={cells([["worked", t.uop.worked], ["vacation", t.uop.vacation], ["sick", t.uop.sick]])} />
              <Strip
                kind="b2b"
                ids={ids}
                marks={cells([
                  ["inactive", t.b2b.inactive],
                  ["worked", t.b2b.worked],
                  ["vacation", t.b2b.paid],
                  ["cut", t.b2b.vacation + t.b2b.sick],
                ])}
              />
              <p className="tape__net tape__net--uop">{zlWhole(t.uopNet)}</p>
              <p className="tape__net tape__net--b2b">{zlWhole(t.b2bNet)}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="section-title">Terminy płatności</h2>
      <p className="answer__note">Co miesiąc, za poprzedni miesiąc. Kreska ciągła - umowa o pracę, przerywana - B2B.</p>
      <div className="due">
        <svg className="due__scale" viewBox="0 0 620 34" aria-hidden="true">
          <line className="due__base" x1="10" x2="610" y1="24" y2="24" />
          {Array.from({ length: 31 }, (_, i) => {
            const x = 10 + i * 20;
            const big = i === 0 || (i + 1) % 5 === 0;
            return (
              <g key={i}>
                <line className="due__tick" x1={x} x2={x} y1={big ? 14 : 19} y2={24} />
                {big && (
                  <text className="due__num" x={x} y={10}>
                    {i + 1}
                  </text>
                )}
              </g>
            );
          })}
          {byDay.map((day) => (
            <path key={day} className="due__mark" d={`M${10 + (day - 1) * 20} 25 l-6 8 h12 z`} />
          ))}
        </svg>
        <dl className="due__list">
          {byDay.map((day) => (
            <div key={day}>
              <dt>do {day}. dnia</dt>
              {monthly
                .filter((d) => d.day === day)
                .map((d) => (
                  <dd key={d.what} className={`due__item due__item--${d.who}`}>
                    {d.what} <span className="due__who">({d.who === "uop" ? "umowa o pracę" : "B2B"})</span>
                    <span className="due__source">{d.source}</span>
                  </dd>
                ))}
            </div>
          ))}
        </dl>
      </div>

      <h3 className="due__year-title">Raz w roku, w {year + 1}</h3>
      <dl className="due__list">
        {yearlyDeadlines(form, year).map((d) => (
          <div key={d.what}>
            <dt>do {d.date}</dt>
            <dd className={`due__item due__item--${d.who}`}>
              {d.what} <span className="due__who">({d.who === "uop" ? "umowa o pracę" : "B2B"})</span>
              <span className="due__source">{d.source}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
