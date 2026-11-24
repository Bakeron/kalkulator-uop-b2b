/**
 * The Back button of a phone (shared app decision "Wstecz"): it undoes the last move - closes the
 * window, the hint or the first steps on top, then goes back to "Porównanie" - and leaves the app
 * only when nothing is open.
 *
 * The Android app listens to Tauri's back-button event only while something is open; with nothing
 * open it stops listening, so Android does what it always does (the app goes away). Elsewhere -
 * the demo in a browser tab, the mouse's back button on the PC - every open thing adds one history
 * entry instead. (Not history on Android: entries added without a tap, like the first steps at the
 * start, are skipped by the WebView's Back.) Not inside the demo window on the home page: there
 * Back belongs to that page.
 */
import { IS_DEMO } from "../demo";

type Step = () => void;

/** What Back closes, the last opened on top. */
const stack: Step[] = [];

const NATIVE = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && /Android/i.test(navigator.userAgent);

let native: Promise<{ unregister(): Promise<void> } | null> | null = null;

function nativeOn(): void {
  if (native) return;
  native = import("@tauri-apps/api/app")
    .then(({ onBackButtonPress }) =>
      onBackButtonPress(() => {
        stack.pop()?.();
        nativeOffWhenEmpty();
      }),
    )
    .catch(() => null);
}

function nativeOffWhenEmpty(): void {
  if (stack.length > 0 || !native) return;
  const done = native;
  native = null;
  void done.then((l) => l?.unregister());
}

/** Entries taken off by `history.back()` after a close from the page itself - not a Back press. */
let skip = 0;
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  addEventListener("popstate", () => {
    if (skip > 0) {
      skip--;
      return;
    }
    stack.pop()?.();
  });
}

/**
 * While something is open: Back calls `step`. Returns the function to call when it closes some
 * other way (a button, Esc) - it stops waiting for Back again.
 */
export function onBack(step: Step): () => void {
  if (IS_DEMO && window.top !== window) return () => {};
  stack.push(step);
  if (NATIVE) {
    nativeOn();
    return () => {
      const i = stack.lastIndexOf(step);
      if (i >= 0) stack.splice(i, 1);
      nativeOffWhenEmpty();
    };
  }
  listen();
  history.pushState({ back: stack.length }, "");
  return () => {
    const i = stack.lastIndexOf(step);
    if (i < 0) return; // already undone by Back
    stack.splice(i, 1);
    skip++;
    history.back();
  };
}
