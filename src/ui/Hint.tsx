/**
 * The "?" next to a term (plan A11, pattern from Tablica Ofert `Help.tsx`, assumption A6): hover
 * or keyboard focus shows the explanation, a click or tap pins it, a second click or Esc hides it.
 * The explanation is a popover in the top layer anchored with CSS, so it never moves the layout
 * and is not cut off. Most hints end with "Przeczytaj więcej" - a link to the act or office page;
 * when pinned, Tab reaches it. A screen reader hears "Co to znaczy: <term>" and then the text.
 * The mouse can travel from the "?" to that link (plan A25): leaving the "?" or the hint only
 * closes it after LEAVE_MS, and entering either of them again in that time keeps it open.
 */
import { useEffect, useId, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { onBack } from "./back";

/** How long a hint stays after the mouse leaves the "?" and the hint - time to reach the link. */
export const LEAVE_MS = 400;

export interface HintText {
  text: string;
  /** Where to read more (act, ZUS, gov.pl) and how the link is named. */
  more?: { label: string; url: string };
}

export default function Hint({ term, hint }: { term: string; hint: HintText }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  // Clicked (or tapped) open - stays until clicked again, Esc or focus leaves the hint.
  const pinned = useRef(false);

  useLayoutEffect(() => {
    const anchor = `--hint-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
    btn.current?.style.setProperty("anchor-name", anchor);
    tip.current?.style.setProperty("position-anchor", anchor);
  }, [id]);

  const isOpen = () => tip.current?.matches(":popover-open") ?? false;
  // A pending close after the mouse left - cancelled when it comes back to the "?" or the hint.
  const leaving = useRef<number | undefined>(undefined);
  const stay = () => {
    window.clearTimeout(leaving.current);
    leaving.current = undefined;
  };
  useEffect(() => stay, []);
  const show = () => {
    stay();
    if (!isOpen()) tip.current?.showPopover?.();
  };
  // A pinned hint is closed by the Back button of a phone first (ui/back.ts).
  const back = useRef<(() => void) | null>(null);
  const release = () => {
    const done = back.current;
    back.current = null;
    done?.();
  };
  useEffect(() => release, []);
  const hide = (force = false) => {
    stay();
    if (force) pinned.current = false;
    if (!pinned.current && isOpen()) tip.current?.hidePopover?.();
    if (!pinned.current) release();
  };
  const leave = () => {
    stay();
    if (!pinned.current) leaving.current = window.setTimeout(() => hide(), LEAVE_MS);
  };
  // Focus moving between the "?" and the link inside keeps the hint open.
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (btn.current?.contains(next) || tip.current?.contains(next))) return;
    hide(true);
  };
  const onKey = (e: KeyboardEvent) => {
    // Esc closes the hint first, not what is under it.
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
      btn.current?.focus();
    }
  };

  return (
    <span className="hint">
      <button
        ref={btn}
        type="button"
        className="hint__btn"
        aria-label={`Co to znaczy: ${term}`}
        aria-describedby={`${id}-text`}
        onMouseEnter={show}
        onMouseLeave={leave}
        onFocus={show}
        onBlur={onBlur}
        onClick={() => {
          pinned.current = !pinned.current;
          if (pinned.current) {
            show();
            back.current ??= onBack(() => {
              back.current = null;
              hide(true);
            });
          } else hide(true);
        }}
        onKeyDown={onKey}
      >
        ?
      </button>
      <span ref={tip} id={id} popover="manual" className="hint__tip" onMouseEnter={show} onMouseLeave={leave} onBlur={onBlur} onKeyDown={onKey}>
        <span id={`${id}-text`} role="tooltip">
          {hint.text}
        </span>
        {hint.more && (
          <a className="hint__more" href={hint.more.url} target="_blank" rel="noopener noreferrer">
            Przeczytaj więcej: {hint.more.label}
          </a>
        )}
      </span>
    </span>
  );
}
