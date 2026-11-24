import { describe, expect, it } from "vitest";
import { easterSunday, holidays, isBusinessDay, monthDays } from "./calendar";

describe("calendar", () => {
  it("finds Easter Sunday", () => {
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
    expect(easterSunday(2024)).toEqual([3, 31]);
  });

  it("lists the 14 public holidays from 2025 (24 December added) and 13 before", () => {
    expect(holidays(2026).size).toBe(14);
    expect(holidays(2026).has("12-24")).toBe(true);
    expect(holidays(2024).has("12-24")).toBe(false);
    // Corpus Christi 2026: 4 June (Easter + 60 days)
    expect(holidays(2026).has("6-4")).toBe(true);
    // Pentecost 2027: 16 May
    expect(holidays(2027).has("5-16")).toBe(true);
  });

  it("counts working days of 2026 - 251 days (2008 h) of working time", () => {
    // 261 weekdays - 8 holidays on weekdays = 253; 15 August and 26 December are Saturdays,
    // so an employee works 2 days less (Kodeks pracy art. 130 par. 2).
    const days = monthDays(2026);
    expect(days).toHaveLength(12);
    // August 2026: 21 weekdays, 15 August on a Saturday.
    expect(days[7]).toEqual({ calendar: 31, business: 21, employee: 20 });
    expect(days.reduce((s, d) => s + d.employee, 0)).toBe(251);
    expect(days.reduce((s, d) => s + d.business, 0)).toBe(253);
  });

  it("counts working days of 2027", () => {
    const days = monthDays(2027);
    // 261 weekdays - 8 holidays on weekdays; 1 May and 25 December are Saturdays.
    expect(days.reduce((s, d) => s + d.business, 0)).toBe(253);
    expect(days.reduce((s, d) => s + d.employee, 0)).toBe(251);
    expect(days[1]!.calendar).toBe(28);
  });

  it("tells a business day", () => {
    expect(isBusinessDay(2026, 1, 1)).toBe(false); // holiday
    expect(isBusinessDay(2026, 1, 2)).toBe(true); // Friday
    expect(isBusinessDay(2026, 1, 3)).toBe(false); // Saturday
  });
});
