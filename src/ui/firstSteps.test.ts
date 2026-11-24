import { describe, expect, it } from "vitest";
import { STEPS, boxOf, placeNote } from "./FirstSteps";

const screen = { width: 1280, height: 800, bottomFree: 0 };
const note = { width: 360, height: 200 };

describe("first steps", () => {
  it("has 3 to 5 notes, each with a part, a title and a text", () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(3);
    expect(STEPS.length).toBeLessThanOrEqual(5);
    for (const s of STEPS) {
      expect(s.target && s.title && s.text).toBeTruthy();
      // Plain hyphen only (shared text rule).
      expect(s.title + s.text).not.toMatch(/[–—]/);
    }
  });

  it("frames all matched parts as one box and skips parts not laid out", () => {
    expect(boxOf([])).toBeNull();
    expect(boxOf([{ top: 0, left: 0, width: 0, height: 0 }])).toBeNull();
    expect(
      boxOf([
        { top: 100, left: 20, width: 300, height: 60 },
        { top: 180, left: 20, width: 320, height: 60 },
        { top: 0, left: 0, width: 0, height: 0 },
      ]),
    ).toEqual({ top: 100, left: 20, width: 320, height: 140 });
  });

  it("puts the note under the part when it fits", () => {
    const spot = placeNote({ top: 100, left: 40, width: 300, height: 50 }, note, screen);
    expect(spot).toEqual({ top: 164, left: 40, side: "below" });
  });

  it("puts the note above the part near the bottom of the screen", () => {
    const spot = placeNote({ top: 600, left: 40, width: 300, height: 100 }, note, screen);
    expect(spot.side).toBe("above");
    expect(spot.top).toBe(600 - 14 - 200);
  });

  it("keeps the note over a tall part inside the screen and above the docked answer", () => {
    const spot = placeNote({ top: 20, left: 0, width: 400, height: 760 }, note, { width: 400, height: 800, bottomFree: 50 });
    expect(spot.side).toBe("over");
    expect(spot.top).toBe(800 - 50 - 8 - 200);
    expect(spot.left).toBe(8);
  });

  it("never lets the note leave the screen on the right", () => {
    const spot = placeNote({ top: 100, left: 1200, width: 60, height: 30 }, note, screen);
    expect(spot.left).toBe(1280 - 360 - 8);
  });
});
