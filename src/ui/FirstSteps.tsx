/**
 * First steps (plan A20, shared app decision "Pierwsze kroki"): 5 notes at the first start, each
 * pointing at one part of the main screen with corner marks, like a detail called out on a
 * technical drawing. "Dalej", "Wstecz" and "Pomiń"; Esc skips, the arrow keys move between notes,
 * the Back button of a phone closes them. Shown again from the footer ("Pokaż pierwsze kroki"),
 * next to the link to the full guide with screenshots (`public/instrukcja/`).
 *
 * The desktop app remembers that the steps were seen; the demo keeps nothing, so every visit
 * starts with them (rules of the demo).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { IS_DEMO } from "../demo";
import { onBack } from "./back";
import { motionReduced } from "./motion";
import "../styles/steps.css";

export interface Step {
  /** CSS selector of the part the note points at; several matches = one frame around all. */
  target: string;
  title: string;
  text: string;
}

export const STEPS: readonly Step[] = [
  {
    target: ".amounts > .hinted",
    title: "Wpisz dwie oferty",
    text: "Kwotę brutto z umowy o pracę i stawkę B2B z faktury, bez VAT. Wynik liczy się od razu, bez żadnego przycisku.",
  },
  {
    target: "#answer",
    title: "Odpowiedź jest na górze",
    text: "Jedno zdanie mówi, która oferta daje więcej na rękę i ile trzeba wziąć na B2B, żeby wyjść tak samo.",
  },
  {
    target: ".rule",
    title: "Przesuń czerwoną kreskę",
    text: "Na dwóch podziałkach naprzeciw siebie stoją kwoty, które dają tyle samo na rękę. Kreskę przesuwa się myszą, palcem albo strzałkami.",
  },
  {
    // On a phone the assumptions are a screen of their own - the note points at its tab.
    target: ".assume, .nav #tab-assume",
    title: "Założenia zdaniami",
    text: "Urlop, choroba, podatek, ZUS i koszty firmy mają rozsądne wartości domyślne. Stuknij zdanie, żeby je zmienić. Znak „?” wyjaśnia pojęcie.",
  },
  {
    target: ".tabs:not(.tabs--parts), .nav",
    title: "Rok, przewodnik i źródła",
    text: "„Rok” pokazuje 12 miesięcy na miarce, „Co warto wiedzieć” tłumaczy obie umowy, a „Źródła” podają przepis przy każdej liczbie.",
  },
];

const SEEN_KEY = "firstSteps";
const SHOW_EVENT = "first-steps";
/** "Pokaż pierwsze kroki" from anywhere else (Settings → O aplikacji). */
export const showFirstSteps = () => dispatchEvent(new Event(SHOW_EVENT));
/** The full guide: next to the demo it is a file of the same site, the desktop app opens it online. */
export const GUIDE_URL = IS_DEMO ? "instrukcja/" : "https://szymonbakonis.pl/kalkulator-uop-b2b/instrukcja/";

/** Room kept free around the frame and from the screen edges, in pixels. */
const GAP = 14;
const EDGE = 8;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One rectangle around every element the selector finds (only those that are laid out). */
export function boxOf(rects: readonly Box[]): Box | null {
  const shown = rects.filter((r) => r.width > 0 || r.height > 0);
  if (shown.length === 0) return null;
  const top = Math.min(...shown.map((r) => r.top));
  const left = Math.min(...shown.map((r) => r.left));
  const bottom = Math.max(...shown.map((r) => r.top + r.height));
  const right = Math.max(...shown.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Where the note goes: under the part when it fits, else above it, else over its lower edge;
 * always inside the screen (minus the answer docked at the bottom of a phone).
 */
export function placeNote(target: Box, note: { width: number; height: number }, screen: { width: number; height: number; bottomFree: number }) {
  const bottom = screen.height - screen.bottomFree - EDGE;
  const below = target.top + target.height + GAP;
  const above = target.top - GAP - note.height;
  let top: number;
  let side: "below" | "above" | "over";
  if (below + note.height <= bottom) [top, side] = [below, "below"];
  else if (above >= EDGE) [top, side] = [above, "above"];
  else [top, side] = [Math.max(EDGE, bottom - note.height), "over"];
  const left = Math.min(Math.max(EDGE, target.left), Math.max(EDGE, screen.width - note.width - EDGE));
  return { top, left, side };
}

function targetBox(selector: string): Box | null {
  const rects = [...document.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });
  return boxOf(rects);
}

/** Only the notes whose part is on the screen now (the slide rule lives in "Porównanie" only). */
function stepsShown(): Step[] {
  return STEPS.filter((s) => targetBox(s.target) !== null);
}

/** The links go into the footer of whichever layout is shown (`linksIn`); the notes stay mounted. */
export default function FirstSteps({ linksIn }: { linksIn: Element | null }) {
  const id = useId();
  const layer = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [at, setAt] = useState(0);
  const [frame, setFrame] = useState<Box | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; side: string } | null>(null);
  // The Back button of a phone closes the notes (ui/back.ts).
  const release = useRef<(() => void) | null>(null);
  const backTo = useRef<HTMLElement | null>(null);
  const fading = useRef(0);
  // The note glides between parts only after it first stood in place (else it would fly in from the corner).
  const [follow, setFollow] = useState(false);
  useEffect(() => {
    if (!spot) {
      setFollow(false);
      return;
    }
    const frameId = requestAnimationFrame(() => setFollow(true));
    return () => cancelAnimationFrame(frameId);
  }, [spot !== null]);

  const open = useCallback(() => {
    const list = stepsShown();
    if (list.length === 0) return;
    clearTimeout(fading.current);
    backTo.current = document.activeElement as HTMLElement | null;
    setAt(0);
    setSteps(list);
    release.current?.();
    release.current = onBack(() => {
      release.current = null;
      closeRef.current();
    });
  }, []);

  const close = useCallback(() => {
    // The layer fades out with the note still in it; the note goes once it is invisible.
    layer.current?.hidePopover?.();
    const ms = motionReduced() ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--t")) || 0;
    fading.current = window.setTimeout(() => {
      setSteps(null);
      setFrame(null);
      setSpot(null);
    }, ms);
    if (!IS_DEMO) localStorage.setItem(SEEN_KEY, "done");
    const done = release.current;
    release.current = null;
    done?.();
    backTo.current?.focus?.();
  }, []);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    addEventListener(SHOW_EVENT, open);
    return () => removeEventListener(SHOW_EVENT, open);
  }, [open]);

  // The first start: once the fonts are in, so the frames do not point at a moving layout.
  useEffect(() => {
    if (!IS_DEMO && localStorage.getItem(SEEN_KEY) === "done") return;
    let gone = false;
    void document.fonts.ready.then(() => requestAnimationFrame(() => !gone && open()));
    return () => {
      gone = true;
    };
  }, [open]);

  const step = steps?.[at] ?? null;

  // Positions move by transform only - moving top and left would count as layout shifts.
  // Show the layer (top layer, above everything) and bring the part into view.
  useLayoutEffect(() => {
    const el = layer.current;
    if (!step || !el) return;
    if (!el.matches(":popover-open")) el.showPopover?.();
    const part = document.querySelector(step.target);
    part?.scrollIntoView({ block: "center", behavior: motionReduced() ? "auto" : "smooth" });
    note.current?.focus({ preventScroll: true });
  }, [step]);

  // Esc skips the notes wherever the focus is (a hint or a window open above takes its Esc first).
  useEffect(() => {
    if (!steps) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      close();
    };
    addEventListener("keydown", onEsc);
    return () => removeEventListener("keydown", onEsc);
  }, [steps, close]);

  // Follow the part while the page scrolls or resizes.
  useEffect(() => {
    if (!step) return;
    let frameId = 0;
    const measure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const box = targetBox(step.target);
        const n = note.current;
        if (!box || !n) return;
        // The bars at the bottom (the answer and the tabs on a phone, the footer) stay free.
        const bars = [...document.querySelectorAll(".dock, .nav, .foot")].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0 && r.top > innerHeight / 2);
        const bottomFree = bars.length ? innerHeight - Math.min(...bars.map((r) => r.top)) : 0;
        setFrame(box);
        setSpot(placeNote(box, { width: n.offsetWidth, height: n.offsetHeight }, { width: innerWidth, height: innerHeight, bottomFree }));
      });
    };
    measure();
    addEventListener("scroll", measure, { passive: true, capture: true });
    addEventListener("resize", measure);
    const watch = new ResizeObserver(measure);
    if (note.current) watch.observe(note.current);
    document.querySelectorAll(step.target).forEach((el) => watch.observe(el));
    return () => {
      cancelAnimationFrame(frameId);
      removeEventListener("scroll", measure, { capture: true });
      removeEventListener("resize", measure);
      watch.disconnect();
    };
  }, [step]);

  const count = steps?.length ?? 0;
  const last = at === count - 1;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" && !last) {
      e.preventDefault();
      setAt(at + 1);
    } else if (e.key === "ArrowLeft" && at > 0) {
      e.preventDefault();
      setAt(at - 1);
    }
  };

  // Where the line from the note meets the frame: the middle of the frame, within the note.
  const leader =
    frame && spot && spot.side !== "over"
      ? {
          left: Math.min(Math.max(frame.left + Math.min(frame.width, 160) / 2, spot.left + 16), spot.left + (note.current?.offsetWidth ?? 0) - 16),
          top: spot.side === "below" ? frame.top + frame.height + 3 : spot.top + (note.current?.offsetHeight ?? 0),
          height: Math.max(0, spot.side === "below" ? spot.top - frame.top - frame.height - 3 : frame.top - 3 - spot.top - (note.current?.offsetHeight ?? 0)),
        }
      : null;

  return (
    <>
      {linksIn &&
        createPortal(
          <p className="foot__help">
            <button type="button" className="link" onClick={open}>
              Pokaż pierwsze kroki
            </button>
            <a className="link" href={GUIDE_URL} target="_blank" rel="noopener">
              Instrukcja ze zrzutami ekranu
            </a>
          </p>,
          linksIn,
        )}
      <div ref={layer} popover="manual" className="steps">
        {step && (
          <>
            {frame && (
              <div className="steps__frame" aria-hidden="true" style={{ transform: `translate(${frame.left - 6}px, ${frame.top - 6}px)`, width: frame.width + 12, height: frame.height + 12 }}>
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
            {leader && <div className="steps__leader" aria-hidden="true" style={{ transform: `translate(${leader.left}px, ${leader.top}px)`, height: leader.height }} />}
            <div
              ref={note}
              className={`steps__note${spot ? " is-placed" : ""}${follow ? " is-follow" : ""}`}
              role="dialog"
              aria-labelledby={`${id}-t`}
              aria-describedby={`${id}-d`}
              tabIndex={-1}
              style={spot ? { transform: `translate(${spot.left}px, ${spot.top}px)` } : undefined}
              onKeyDown={onKey}
            >
              <p className="steps__count">
                Pierwsze kroki - {at + 1} z {count}
              </p>
              <div className="steps__body" key={at}>
                <h2 id={`${id}-t`} className="steps__title">
                  {step.title}
                </h2>
                <p id={`${id}-d`} className="steps__text">
                  {step.text}
                </p>
              </div>
              <div className="steps__buttons">
                <button type="button" className="link steps__skip" onClick={() => close()}>
                  {last ? "Zamknij" : "Pomiń"}
                </button>
                {at > 0 && (
                  <button type="button" className="steps__btn" onClick={() => setAt(at - 1)}>
                    Wstecz
                  </button>
                )}
                <button type="button" className="steps__btn steps__btn--go" onClick={() => (last ? close() : setAt(at + 1))}>
                  {last ? "Gotowe" : "Dalej"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
