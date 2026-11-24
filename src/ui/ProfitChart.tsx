/**
 * d) "B2B over UoP by the rate" (assumption A1), drawn like the slide rule: graphite ink on the
 * paper, the gain hatched, the red hairline at the break-even, the B2B offer as the same
 * triangle. Pointer or arrow keys read any rate; the table below has the same numbers.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TaxForm } from "../calc/b2b";
import type { Money } from "../calc/money";
import { useMoney, type ResultMoney } from "./currency";
import type { ProfitChartData, ProfitPoint } from "./model";

interface Props {
  data: ProfitChartData;
  b2bRate: Money;
  b2bNeeded: Money | null;
  /** The form is shown only when the calculator picks the best one at every rate. */
  formChosen: boolean;
}

const H = 300;
const LEFT = 64;
const RIGHT = 16;
const TOP = 34;
const BOTTOM = 44;

const FORM: Record<TaxForm, string> = { skala: "skala", liniowy: "liniowy", ryczalt: "ryczałt", ipbox: "IP Box" };

/** "+1 234 zł", "-1 234 zł". */
const signed = (m: ResultMoney, v: Money) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${m.whole(Math.abs(v))}`;

/** A round step giving at most `count` steps over `range`. */
function niceStep(range: number, count: number): number {
  for (const zl of [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000]) {
    if (range / (zl * 100) <= count) return zl * 100;
  }
  return 10_000_000;
}

function sentence(m: ResultMoney, p: ProfitPoint, formChosen: boolean): string {
  const how = p.diff === 0 ? "tyle samo, co umowa o pracę" : `o ${m.whole(Math.abs(p.diff))} miesięcznie ${p.diff > 0 ? "więcej" : "mniej"} na rękę`;
  return `Przy stawce ${m.whole(p.rate)} B2B daje ${how}${formChosen ? "" : ` (najkorzystniej: ${FORM[p.form]})`}.`;
}

export default function ProfitChart({ data, b2bRate, b2bNeeded, formChosen }: Props) {
  const m = useMoney();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { from, to, points } = data;
  if (points.length < 2) return null;

  const diffs = points.map((p) => p.diff);
  const yStep = niceStep(Math.max(...diffs, 0) - Math.min(...diffs, 0), 5);
  const yMin = Math.floor(Math.min(...diffs, 0) / yStep) * yStep;
  const yMax = Math.ceil(Math.max(...diffs, 0) / yStep) * yStep || yStep;
  const span = width - LEFT - RIGHT;
  const x = (rate: Money) => LEFT + ((rate - from) / (to - from)) * span;
  const y = (diff: Money) => TOP + ((yMax - diff) / (yMax - yMin)) * (H - TOP - BOTTOM);
  const zeroY = y(0);

  const xStep = (() => {
    for (const zl of [1_000, 2_000, 5_000, 10_000, 20_000, 50_000]) if ((span / (to - from)) * zl * 100 >= 72) return zl * 100;
    return 10_000_000;
  })();
  const xTicks: Money[] = [];
  for (let r = Math.ceil(from / xStep) * xStep; r <= to; r += xStep) xTicks.push(r);
  const yTicks: Money[] = [];
  for (let d = yMin; d <= yMax; d += yStep) yTicks.push(d);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.rate).toFixed(1)} ${y(p.diff).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points[points.length - 1]!.rate).toFixed(1)} ${zeroY.toFixed(1)} L${x(points[0]!.rate).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // The point read: under the pointer or the keys, otherwise the B2B offer.
  const nearest = (rate: Money) => points.reduce((a, b) => (Math.abs(b.rate - rate) < Math.abs(a.rate - rate) ? b : a));
  const offer = b2bRate >= from && b2bRate <= to ? nearest(b2bRate) : null;
  const read = hover !== null ? points[hover]! : offer;
  const offerOn = offer !== null && Math.abs(offer.rate - b2bRate) <= 50_000;
  const evenX = b2bNeeded !== null && b2bNeeded >= from && b2bNeeded <= to ? x(b2bNeeded) : null;
  // The even label sits right of its line, else left of it; when neither side fits (a phone),
  // it ends at the chart's edge and the line starts below it. About 8 px per bold 16 px letter.
  const evenLabel = b2bNeeded !== null ? `= tyle samo: ${m.whole(b2bNeeded)}` : "";
  const labelW = evenLabel.length * 8;
  const anchor = (px: number) => (px + 8 + labelW <= width ? "start" : "end");
  const textX = (px: number) => (px + 8 + labelW <= width ? px + 8 : px - 8 - labelW >= 0 ? px - 8 : width - 2);
  const labelOnLine = (px: number) => textX(px) === width - 2;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const rate = from + ((px - LEFT) / span) * (to - from);
    setHover(points.indexOf(nearest(rate)));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const start = hover ?? (offer ? points.indexOf(offer) : 0);
    const big = Math.max(1, Math.round(points.length / 10));
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: big, PageDown: -big }[e.key];
    if (e.key === "Escape") return setHover(null);
    if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(points.length - 1);
    else if (step !== undefined) setHover(Math.min(points.length - 1, Math.max(0, start + step)));
    else return;
    e.preventDefault();
  };

  // The table does not depend on the width: every 1 000 zł, or a rounder step for at most 25 rows.
  const rowStep = [100_000, 200_000, 500_000, 1_000_000, 2_000_000].find((s) => (to - from) / s <= 25) ?? 5_000_000;
  const rows = points.filter((p) => p.rate % rowStep === 0);

  return (
    <div className="profit" ref={box}>
      <p className="profit__read" aria-live="polite">
        {read ? sentence(m, read, formChosen) : "Najedź na wykres albo użyj strzałek, żeby odczytać inną stawkę."}
      </p>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        tabIndex={0}
        role="group"
        aria-label="Wykres: o ile B2B daje więcej albo mniej na rękę niż umowa o pracę przy różnych stawkach B2B. Strzałkami zmieniasz stawkę."
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <defs>
          <pattern id="profit-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="profit__hatch" x1="0" y1="0" x2="0" y2="7" />
          </pattern>
          <clipPath id="profit-above">
            <rect x={LEFT} y={0} width={span} height={Math.max(0, zeroY)} />
          </clipPath>
        </defs>

        {yTicks.map((d) => (
          <g key={`y${d}`}>
            {d !== 0 && <line className="profit__grid" x1={LEFT} x2={LEFT + span} y1={y(d)} y2={y(d)} />}
            <text className="profit__num" x={LEFT - 8} y={y(d) + 5} textAnchor="end">
              {d > 0 ? "+" : d < 0 ? "-" : ""}
              {m.number(Math.abs(d))}
            </text>
          </g>
        ))}
        {xTicks.map((r) => (
          <g key={`x${r}`}>
            <line className="profit__tick" x1={x(r)} x2={x(r)} y1={H - BOTTOM} y2={H - BOTTOM + 6} />
            <text className="profit__num" x={x(r)} y={H - BOTTOM + 24} textAnchor="middle">
              {m.number(r)}
            </text>
          </g>
        ))}
        <line className="profit__axis" x1={LEFT} x2={LEFT + span} y1={H - BOTTOM} y2={H - BOTTOM} />

        <path className="profit__gain" d={area} fill="url(#profit-hatch)" clipPath="url(#profit-above)" />
        {/* Moved by transform, not by y1/y2: CSS can glide a transform when the scale changes. */}
        <line className="profit__zero" x1={LEFT} x2={LEFT + span} y1={0} y2={0} style={{ transform: `translateY(${zeroY}px)` }} />
        <path className="profit__line" d={line} />

        {evenX !== null && (
          <g className="profit__even" style={{ transform: `translateX(${evenX}px)` }}>
            <line x1={0} x2={0} y1={labelOnLine(evenX) ? TOP - 4 : TOP - 26} y2={H - BOTTOM} />
            <text x={textX(evenX) - evenX} y={TOP - 14} textAnchor={anchor(evenX)}>
              {evenLabel}
            </text>
          </g>
        )}
        {/* Zone names over the lines, with a halo - on a phone the even line runs through them. */}
        {zeroY - TOP > 26 && (
          <text className="profit__zone" x={LEFT + 8} y={TOP + 14}>
            B2B daje więcej
          </text>
        )}
        {H - BOTTOM - zeroY > 26 && (
          // The line usually rises, so its corners top left and bottom right stay free.
          <text className="profit__zone" x={LEFT + span - 8} y={zeroY + 20} textAnchor="end">
            umowa o pracę daje więcej
          </text>
        )}
        {offerOn && (
          <g className="profit__offer">
            <circle cx={x(offer!.rate)} cy={y(offer!.diff)} r={5} />
            <path d={`M${x(b2bRate)} ${H - BOTTOM - 12} l-7 12 h14 z`} />
          </g>
        )}
        {hover !== null && (
          <g className="profit__cursor">
            <line x1={x(points[hover]!.rate)} x2={x(points[hover]!.rate)} y1={TOP} y2={H - BOTTOM} />
            <circle cx={x(points[hover]!.rate)} cy={y(points[hover]!.diff)} r={5} />
          </g>
        )}
      </svg>
      <p className="profit__axis-name">Stawka B2B - netto na fakturze miesięcznie (bez VAT); w pionie różnica na rękę miesięcznie</p>
      <details className="profit__table">
        <summary>Te same liczby w tabeli</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Stawka B2B</th>
              <th scope="col">B2B minus umowa o pracę, na rękę miesięcznie</th>
              {!formChosen && <th scope="col">Najkorzystniejsza forma</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.rate}>
                <td>{m.whole(p.rate)}</td>
                <td>{signed(m, p.diff)}</td>
                {!formChosen && <td>{FORM[p.form]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
