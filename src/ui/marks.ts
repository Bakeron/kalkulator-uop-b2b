/**
 * The line under the chosen option of a switch (currency, theme, rules, tabs) slides to the new
 * option instead of jumping ("nic zerojedynkowo", assumption A9). A switch carries
 * data-mark="<selector of the chosen option>"; this puts the option's place into CSS variables
 * (--mark-x, --mark-y, --mark-w), and the switch's ::after line moves there with a transition.
 * The first placement does not move (data-mark-ready comes a frame later).
 */
import { useEffect, useLayoutEffect } from "react";

function place(box: HTMLElement): void {
  const chosen = box.dataset.mark ? box.querySelector<HTMLElement>(box.dataset.mark) : null;
  if (!chosen) {
    box.style.setProperty("--mark-w", "0px");
    return;
  }
  const b = box.getBoundingClientRect();
  const r = chosen.getBoundingClientRect();
  box.style.setProperty("--mark-x", `${r.left - b.left}px`);
  box.style.setProperty("--mark-y", `${r.bottom - b.top}px`);
  box.style.setProperty("--mark-w", `${r.width}px`);
  if (!box.dataset.markReady) requestAnimationFrame(() => (box.dataset.markReady = ""));
}

function placeAll(): void {
  document.querySelectorAll<HTMLElement>("[data-mark]").forEach(place);
}

/** Call once in the top component: places the marks after every render and on resize. */
export function useSlidingMarks(): void {
  useLayoutEffect(placeAll);
  useEffect(() => {
    // Wider text (the font loaded, larger text, a narrower window) moves the options.
    const ro = new ResizeObserver(placeAll);
    document.querySelectorAll<HTMLElement>("[data-mark]").forEach((box) => ro.observe(box));
    void document.fonts?.ready.then(placeAll);
    return () => ro.disconnect();
  }, []);
}
