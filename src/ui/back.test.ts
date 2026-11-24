import { beforeEach, describe, expect, it, vi } from "vitest";

/** A history like the browser's: `back()` fires "popstate" later, as the real one does. */
function fakeHistory() {
  let entries = 1;
  const listeners: (() => void)[] = [];
  const pending: (() => void)[] = [];
  const history = {
    pushState: () => void entries++,
    back: () => {
      if (entries <= 1) return;
      entries--;
      pending.push(() => listeners.forEach((l) => l()));
    },
  };
  const win = { top: null as unknown };
  win.top = win;
  vi.stubGlobal("window", win);
  vi.stubGlobal("history", history);
  vi.stubGlobal("addEventListener", (type: string, l: () => void) => type === "popstate" && listeners.push(l));
  return {
    entries: () => entries,
    /** The phone's Back button: one entry back, then the events. */
    press: () => {
      history.back();
      flush();
    },
    flush,
  };
  function flush() {
    while (pending.length) pending.shift()!();
  }
}

describe("Back button", () => {
  let h: ReturnType<typeof fakeHistory>;
  let onBack: typeof import("./back").onBack;
  beforeEach(async () => {
    vi.resetModules();
    h = fakeHistory();
    ({ onBack } = await import("./back"));
  });

  it("closes the last opened thing first, then the one under it", () => {
    const closed: string[] = [];
    onBack(() => closed.push("tab"));
    onBack(() => closed.push("window"));
    expect(h.entries()).toBe(3);
    h.press();
    expect(closed).toEqual(["window"]);
    h.press();
    expect(closed).toEqual(["window", "tab"]);
    expect(h.entries()).toBe(1);
  });

  it("a thing closed by its own button takes its entry away without closing anything else", () => {
    const closed: string[] = [];
    onBack(() => closed.push("tab"));
    const release = onBack(() => closed.push("hint"));
    release();
    h.flush();
    expect(closed).toEqual([]);
    expect(h.entries()).toBe(2);
    h.press();
    expect(closed).toEqual(["tab"]);
  });

  it("releasing after Back already closed it does nothing", () => {
    const step = vi.fn();
    const release = onBack(step);
    h.press();
    release();
    h.flush();
    expect(step).toHaveBeenCalledTimes(1);
    expect(h.entries()).toBe(1);
  });
});
