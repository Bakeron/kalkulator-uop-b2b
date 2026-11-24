/**
 * The slide rule (assumption A8 a): UoP gross on the top scale, the B2B rate on the bottom one,
 * placed so that amounts with the same net stand exactly opposite each other. The red hairline
 * is the UoP offer and reads the B2B rate it is worth; the triangle below is the B2B offer.
 * Both are draggable (mouse, finger) and keyboard sliders.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Money } from "../calc/money";
import { numberWhole, zlWhole } from "./format";
import { rateForUop, uopForRate, type ScaleModel } from "./model";
import { motionReduced } from "./motion";

interface Props {
  model: ScaleModel;
  uopGross: Money;
  b2bRate: Money;
  /** Exact break-even B2B rate for the UoP offer. */
  b2bNeeded: Money | null;
  onUop: (gross: Money) => void;
  onB2b: (rate: Money) => void;
}

type Handle = "uop" | "b2b";

const PAD = 28;
const H = 280;
const TOP = 80; // baseline of the UoP scale
const BOTTOM = 124; // baseline of the B2B scale
const SNAP = 10_000; // 100 zł

const snap = (v: Money) => Math.max(0, Math.round(v / SNAP) * SNAP);

export default function SlideRule({ model, uopGross, b2bRate, b2bNeeded, onUop, onB2b }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [drag, setDrag] = useState<{ handle: Handle; value: Money } | null>(null);
  const [focus, setFocus] = useState<Handle | null>(null);
  const samples = useRef<{ x: number; t: number }[]>([]);
  const glide = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A drag ends also when the pointer leaves the window.
  useEffect(() => {
    if (!drag) return;
    const cancel = () => {
      if (glide.current !== null) cancelAnimationFrame(glide.current);
      glide.current = null;
      setDrag(null);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [drag]);

  const span = width - 2 * PAD;
  const x = (gross: Money) => PAD + ((gross - model.min) / (model.max - model.min)) * span;
  const grossAt = (px: number) => model.min + ((px - PAD) / span) * (model.max - model.min);
  const clampGross = (g: Money) => Math.min(model.max, Math.max(model.min, g));

  const shownUop = drag?.handle === "uop" ? drag.value : uopGross;
  const shownB2b = drag?.handle === "b2b" ? drag.value : b2bRate;
  const dragging = drag !== null;
  // While dragging the readings come from the scale (to 100 zł); at rest the exact break-even.
  const needed = drag?.handle === "uop" ? rateForUop(model, shownUop) : b2bNeeded;
  const cursorX = x(clampGross(shownUop));
  const offerGross = uopForRate(model, shownB2b);
  const offerX = offerGross === null ? (shownB2b > 0 ? PAD + span : PAD) : x(offerGross);

  const valueAt = (handle: Handle, px: number): Money => {
    const g = clampGross(grossAt(px));
    if (handle === "uop") return snap(g);
    return snap(rateForUop(model, g) ?? 0);
  };

  const pointerX = (e: PointerEvent<SVGSVGElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  const commit = (handle: Handle, value: Money) => {
    if (handle === "uop") onUop(value);
    else onB2b(value);
    setDrag(null);
  };
  const stopGlide = () => {
    if (glide.current !== null) cancelAnimationFrame(glide.current);
    glide.current = null;
  };
  useEffect(() => stopGlide, []);

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    stopGlide();
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const handle: Handle = y < (TOP + BOTTOM) / 2 ? "uop" : "b2b";
    e.currentTarget.setPointerCapture(e.pointerId);
    samples.current = [{ x: pointerX(e), t: e.timeStamp }];
    setDrag({ handle, value: valueAt(handle, pointerX(e)) });
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || glide.current !== null) return;
    const px = pointerX(e);
    samples.current = [...samples.current.filter((p) => e.timeStamp - p.t < 100), { x: px, t: e.timeStamp }];
    setDrag({ handle: drag.handle, value: valueAt(drag.handle, px) });
  };
  // On release the scale glides on with the speed of the throw and slows down (friction), then
  // stops on a whole 100 zł - "z lekką bezwładnością", assumption A8 a. No glide with reduced motion.
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || glide.current !== null) return;
    const handle = drag.handle;
    const list = samples.current.filter((p) => e.timeStamp - p.t < 100);
    const first = list[0];
    const last = list[list.length - 1];
    const dt = first && last ? last.t - first.t : 0;
    let v = dt > 0 ? (last!.x - first!.x) / dt : 0; // px per ms
    const reduced = motionReduced();
    if (reduced || Math.abs(v) < 0.3 || !last) {
      commit(handle, drag.value);
      return;
    }
    let px = last.x;
    let value = drag.value;
    let before = performance.now();
    const step = (now: number) => {
      const ms = Math.min(50, now - before);
      before = now;
      px += v * ms;
      v *= Math.pow(0.994, ms);
      const end = px <= PAD || px >= PAD + span || Math.abs(v) < 0.02;
      px = Math.min(PAD + span, Math.max(PAD, px));
      value = valueAt(handle, px);
      if (end) {
        glide.current = null;
        commit(handle, value);
        return;
      }
      setDrag({ handle, value });
      glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  };

  const onKey = (handle: Handle) => (e: KeyboardEvent<SVGGElement>) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    const step = steps[e.key];
    if (step === undefined) return;
    e.preventDefault();
    if (handle === "uop") onUop(snap(Math.min(model.max, Math.max(model.min, uopGross + step * SNAP))));
    else onB2b(snap(Math.max(0, b2bRate + step * SNAP)));
  };

  // Ticks of the UoP scale: 500 zł, longer every 1 000 zł, labelled every 5 000 zł.
  const perTick = span / ((model.max - model.min) / 50_000);
  // Numbers every 5 000 zł, or every 10 000 / 20 000 zł when they would not fit (64 px each).
  const per5000 = perTick * 10;
  const labelEvery = per5000 >= 64 ? 500_000 : per5000 * 2 >= 64 ? 1_000_000 : 2_000_000;
  const uopTicks: { at: number; size: 1 | 2 | 3; label?: string }[] = [];
  for (let g = Math.ceil(model.min / 50_000) * 50_000; g <= model.max; g += 50_000) {
    const size = g % 500_000 === 0 ? 3 : g % 100_000 === 0 ? 2 : 1;
    if (size === 1 && perTick < 4) continue;
    uopTicks.push({ at: x(g), size, label: size === 3 && g % labelEvery === 0 ? numberWhole(g) : undefined });
  }
  // Ticks of the B2B scale at round B2B amounts, placed where their net meets the UoP scale.
  const b2bTicks: typeof uopTicks = [];
  const lastRate = model.b2b[model.b2b.length - 1]!.amount;
  for (let r = 50_000; r <= lastRate; r += 50_000) {
    const g = uopForRate(model, r);
    if (g === null || g < model.min || g > model.max) continue;
    const size = r % 500_000 === 0 ? 3 : r % 100_000 === 0 ? 2 : 1;
    if (size === 1 && perTick < 4) continue;
    b2bTicks.push({ at: x(g), size, label: size === 3 && r % labelEvery === 0 ? numberWhole(r) : undefined });
  }

  const len = (size: number) => (size === 3 ? 16 : size === 2 ? 10 : 5);
  const anchor = (px: number, toward: number) => (px > width - 150 ? "end" : px < 150 ? "start" : px < toward ? "end" : "start");
  const gap = needed === null ? null : shownB2b - needed;
  const gapText =
    gap === null
      ? "nawet bardzo wysoka stawka nie wystarczy"
      : gap >= 0
        ? `o ${zlWhole(gap)} więcej, niż trzeba`
        : `o ${zlWhole(-gap)} za mało`;
  const cursorAnchor = anchor(cursorX, offerX);
  const textX = (px: number, a: string) => px + (a === "end" ? -8 : a === "start" ? 8 : 0);
  // The reading under the hairline must not run into the B2B offer (narrow screens): then the
  // offer's marker, the gap and its labels move one row down and the reading breaks the offer's
  // line like the text of a dimension on a drawing.
  const reading = needed === null ? "B2B - poza skalą" : `= B2B ${dragging ? "ok. " : ""}${zlWhole(needed)} netto`;
  const readingW = reading.length * 9.5;
  const readingX0 = cursorAnchor === "end" ? textX(cursorX, "end") - readingW : textX(cursorX, "start");
  const clash = offerX > readingX0 - 14 && offerX < readingX0 + readingW + 14;
  const dy = clash ? 34 : 0;
  const h = H + dy;

  return (
    <div className={`rule${dragging ? " is-dragging" : ""}`} ref={box}>
      <p className="rule__caption">
        <span className="rule__solid" aria-hidden="true" /> Umowa o pracę - brutto miesięcznie
      </p>
      <svg
        width={width}
        height={h}
        viewBox={`0 0 ${width} ${h}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          stopGlide();
          setDrag(null);
        }}
        aria-label="Suwak porównania: górna podziałka to umowa o pracę brutto, dolna to B2B netto na fakturze; kwoty naprzeciw siebie dają tyle samo na rękę."
      >
        <rect className="rule__slide" x={0} y={TOP} width={width} height={BOTTOM - TOP} />
        <line className="rule__base" x1={PAD} x2={PAD + span} y1={TOP} y2={TOP} />
        <line className="rule__base rule__base--dashed" x1={PAD} x2={PAD + span} y1={BOTTOM} y2={BOTTOM} />
        {uopTicks.map((t) => (
          <g key={`u${t.at}`}>
            <line className="rule__tick" x1={t.at} x2={t.at} y1={TOP} y2={TOP - len(t.size)} />
            {t.label && (
              <text className="rule__num" x={t.at} y={TOP - 22} textAnchor="middle">
                {t.label}
              </text>
            )}
          </g>
        ))}
        {b2bTicks.map((t) => (
          <g key={`b${t.at}`}>
            <line className="rule__tick" x1={t.at} x2={t.at} y1={BOTTOM} y2={BOTTOM + len(t.size)} />
            {t.label && (
              <text className="rule__num" x={t.at} y={BOTTOM + 34} textAnchor="middle">
                {t.label}
              </text>
            )}
          </g>
        ))}

        {/* The B2B offer: triangle under the bottom scale and the gap to the break-even. */}
        <g
          className="rule__offer"
          role="slider"
          tabIndex={0}
          aria-label="Oferta B2B, netto na fakturze miesięcznie"
          aria-valuenow={Math.round(b2bRate / 100)}
          aria-valuemin={0}
          aria-valuetext={zlWhole(b2bRate)}
          onKeyDown={onKey("b2b")}
          onFocus={() => setFocus("b2b")}
          onBlur={() => setFocus(null)}
        >
          <line className="rule__offer-line" x1={offerX} x2={offerX} y1={BOTTOM} y2={BOTTOM + 96 + dy} />
          <path className="rule__marker" d={`M${offerX} ${BOTTOM + 44 + dy} l-8 13 h16 z`} />
          {focus === "b2b" && <rect className="rule__focus" x={offerX - 14} y={BOTTOM + 38 + dy} width={28} height={26} rx={3} />}
          <text className="rule__label" x={textX(offerX, anchor(offerX, cursorX))} y={BOTTOM + 112 + dy} textAnchor={anchor(offerX, cursorX)}>
            Oferta B2B {zlWhole(shownB2b)}
          </text>
        </g>
        {needed !== null && Math.abs(offerX - cursorX) > 24 && (
          <g className="rule__gap">
            <line x1={cursorX} x2={offerX} y1={BOTTOM + 78 + dy} y2={BOTTOM + 78 + dy} />
            <path d={arrow(cursorX, BOTTOM + 78 + dy, offerX > cursorX ? -1 : 1)} />
            <path d={arrow(offerX, BOTTOM + 78 + dy, offerX > cursorX ? 1 : -1)} />
          </g>
        )}
        <text className="rule__gap-text" x={(cursorX + offerX) / 2} y={BOTTOM + 136 + dy} textAnchor="middle">
          {gapText}
        </text>

        {/* The red hairline: the UoP offer and the B2B rate worth the same. */}
        <g
          className="rule__cursor"
          role="slider"
          tabIndex={0}
          aria-label="Umowa o pracę, brutto miesięcznie"
          aria-valuenow={Math.round(uopGross / 100)}
          aria-valuemin={Math.round(model.min / 100)}
          aria-valuemax={Math.round(model.max / 100)}
          aria-valuetext={zlWhole(uopGross)}
          onKeyDown={onKey("uop")}
          onFocus={() => setFocus("uop")}
          onBlur={() => setFocus(null)}
        >
          <line className="rule__hair" x1={cursorX} x2={cursorX} y1={20} y2={BOTTOM + 56 + dy} />
          <rect className="rule__grip" x={cursorX - 14} y={TOP - 8} width={28} height={BOTTOM - TOP + 16} rx={3} />
          {focus === "uop" && <rect className="rule__focus" x={cursorX - 18} y={TOP - 12} width={36} height={BOTTOM - TOP + 24} rx={4} />}
          <text className="rule__value" x={textX(cursorX, cursorAnchor)} y={14} textAnchor={cursorAnchor}>
            UoP {zlWhole(shownUop)} brutto
          </text>
          {clash && <rect className="rule__knockout" x={readingX0 - 4} y={BOTTOM + 56} width={readingW + 8} height={20} />}
          <text className="rule__value" x={textX(cursorX, cursorAnchor)} y={BOTTOM + 70} textAnchor={cursorAnchor}>
            {reading}
          </text>
        </g>
      </svg>
      <p className="rule__caption">
        <span className="rule__dashed" aria-hidden="true" /> B2B - netto na fakturze miesięcznie (bez VAT)
      </p>
    </div>
  );
}

/** Arrowhead of a dimension line at (x, y) pointing in `dir` (1 = right, -1 = left). */
function arrow(x: number, y: number, dir: 1 | -1): string {
  return `M${x} ${y} l${10 * -dir} -4 v8 z`;
}
