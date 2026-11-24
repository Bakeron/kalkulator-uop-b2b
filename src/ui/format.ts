/** Display helpers of the interface: whole złoty, Polish plural forms, parsing typed amounts. */
import { formatZl, type Money } from "../calc/money";

/** "12 345 zł" - rounded to the whole złoty (averages are not exact grosze anyway). */
export function zlWhole(amount: Money): string {
  return formatZl(Math.round(amount / 100) * 100, false);
}

/** The number without the currency: "12 345". */
export function numberWhole(amount: Money): string {
  return zlWhole(amount).replace(/ zł$/, "");
}

/** Polish plural: 1 dzień, 2 dni, 5 dni (the three forms: one, few, many). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const tens = abs % 100;
  const units = abs % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

/** Month names in the nominative ("styczeń") - for lists and the table. */
export const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

/** "2026-03-15" -> "15.03.2026". */
export function dateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${m}.${y}`;
}

/** "12 000", "12000,50", "12 000 zł" -> grosze; `null` when it is not an amount. */
export function parseZl(text: string): Money | null {
  const clean = text.replace(/zł/gi, "").replace(/[\s ]/g, "").replace(",", ".");
  if (clean === "" || !/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
