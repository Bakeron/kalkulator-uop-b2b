/**
 * "Ogranicz animacje": the choice in the app wins over the system setting. The root element
 * carries data-motion="reduce" or "full" when the user chose; without it the system decides.
 * CSS reads the same attribute (--t becomes 0ms), so styles and scripts always agree.
 */
export type Motion = "system" | "reduce" | "full";

export function motionReduced(): boolean {
  const chosen = document.documentElement.dataset.motion;
  if (chosen === "reduce") return true;
  if (chosen === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Applies a change to the page with a short cross-fade (a theme switch, a tab), or at once with
 * reduced motion. `kind` lands on the root element as data-vt while it runs, so CSS can give one
 * kind of change its own movement (a tab slides its panel to the side the tab is on).
 */
let running: ViewTransition | null = null;

export function smoothly(change: () => void, kind?: string): void {
  if (motionReduced() || typeof document.startViewTransition !== "function") change();
  else {
    const root = document.documentElement;
    if (kind) root.dataset.vt = kind;
    else delete root.dataset.vt;
    // A transition cut short (the window resized, another switch) still applies the change;
    // only its promises reject, and that is not an error here.
    const t = document.startViewTransition(change);
    running = t;
    t.ready.catch(() => {});
    t.finished
      .catch(() => {})
      .finally(() => {
        // A newer transition has its own kind - leave it.
        if (running === t) delete root.dataset.vt;
      });
  }
}
