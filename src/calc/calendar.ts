/**
 * Polish working-day calendar. Public holidays from the act on days off work (ustawa o dniach
 * wolnych od pracy, art. 1 - with 24 December added from 2025).
 */

/** Easter Sunday (Gregorian, anonymous algorithm) as [month 1-12, day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function key(month: number, day: number): string {
  return `${month}-${day}`;
}

/** All public holidays of the year as "month-day" keys. */
export function holidays(year: number): Set<string> {
  const fixed: [number, number][] = [
    [1, 1], [1, 6], [5, 1], [5, 3], [8, 15], [11, 1], [11, 11], [12, 25], [12, 26],
  ];
  if (year >= 2025) fixed.push([12, 24]);
  const [em, ed] = easterSunday(year);
  const easter = Date.UTC(year, em - 1, ed);
  const day = 86_400_000;
  const movable = [0, 1, 49, 60].map((offset) => new Date(easter + offset * day));
  const set = new Set(fixed.map(([m, d]) => key(m, d)));
  for (const date of movable) set.add(key(date.getUTCMonth() + 1, date.getUTCDate()));
  return set;
}

export interface MonthDays {
  /** Calendar days in the month. */
  calendar: number;
  /** Monday-Friday that are not holidays - days a B2B contractor can invoice. */
  business: number;
  /**
   * Working time of an employee in days (Kodeks pracy art. 130): a holiday on a Saturday
   * lowers it by one more day.
   */
  employee: number;
}

/** Days of every month of the year (index 0 = January). */
export function monthDays(year: number): MonthDays[] {
  const free = holidays(year);
  const result: MonthDays[] = [];
  for (let month = 1; month <= 12; month++) {
    const calendar = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let business = 0;
    let saturdayHolidays = 0;
    for (let d = 1; d <= calendar; d++) {
      const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      const holiday = free.has(key(month, d));
      if (weekday >= 1 && weekday <= 5 && !holiday) business++;
      if (weekday === 6 && holiday) saturdayHolidays++;
    }
    result.push({ calendar, business, employee: business - saturdayHolidays });
  }
  return result;
}

/** Monday-Friday that is not a public holiday. `month` 1-12. */
export function isBusinessDay(year: number, month: number, day: number, free = holidays(year)): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !free.has(key(month, day));
}
