/**
 * The "Rok" tab (plan A9, look a: a tape measure with 12 months): every business day of the year
 * on two tapes - the employment contract and B2B - marked as worked, paid day off, sick or unpaid,
 * the net of each month under it, and the scale of payment deadlines. Pure data, no interface.
 */
import type { TaxForm } from "../calc/b2b";
import type { Money } from "../calc/money";
import type { CombinedYear } from "../calc/multi";
import { monthRows } from "./model";

export interface TapeMonth {
  month: number;
  /** Monday-Friday without public holidays. */
  days: number;
  /** Employment contract: every day is paid - vacation in full, sick days at 80% (or 100%). */
  uop: { worked: number; vacation: number; sick: number };
  /** B2B: only worked days and days off paid by the contract are invoiced. */
  b2b: { worked: number; paid: number; vacation: number; sick: number; inactive: number };
  uopNet: Money;
  b2bNet: Money;
}

export function yearTape(uop: CombinedYear, b2b: CombinedYear): TapeMonth[] {
  return monthRows(uop, b2b).map((row) => {
    const m = row.month;
    const u = uop.uop?.months[m]?.days;
    const b = b2b.b2b?.months[m]?.days;
    const days = b?.business ?? u?.working ?? 0;
    const uopSick = u?.sickWorking ?? 0;
    const uopVacation = u?.vacation ?? 0;
    const inactive = b ? b.business - b.active : 0;
    const unpaid = b ? Math.max(0, b.active - b.invoiced) : 0;
    const b2bSick = Math.min(b?.sickWorking ?? 0, unpaid);
    return {
      month: m,
      days,
      uop: u ? { worked: Math.max(0, days - uopVacation - uopSick), vacation: uopVacation, sick: uopSick } : { worked: 0, vacation: 0, sick: 0 },
      b2b: b
        ? { worked: b.worked, paid: b.invoiced - b.worked, vacation: unpaid - b2bSick, sick: b2bSick, inactive }
        : { worked: 0, paid: 0, vacation: 0, sick: 0, inactive: 0 },
      uopNet: row.uopNet,
      b2bNet: row.b2bNet,
    };
  });
}

/** Unpaid business days on B2B in the year - the part of the tape that is "cut off". */
export function unpaidDays(tape: TapeMonth[]): number {
  return tape.reduce((a, t) => a + t.b2b.vacation + t.b2b.sick, 0);
}

export interface Deadline {
  /** Day of the month (monthly) or "30 kwietnia" style date of the next year (yearly). */
  day: number;
  who: "uop" | "b2b";
  what: string;
  source: string;
}

/** What is paid every month and by which day (for the previous month). */
export function monthlyDeadlines(vatPayer: boolean): Deadline[] {
  const list: Deadline[] = [
    { day: 10, who: "uop", what: "pensja na koncie", source: "Kodeks pracy art. 85 § 2 - najpóźniej 10. dnia następnego miesiąca" },
    { day: 20, who: "b2b", what: "składki ZUS i zdrowotna", source: "ustawa o systemie ubezpieczeń społecznych art. 47 ust. 1 pkt 4 - do 20. dnia następnego miesiąca" },
    { day: 20, who: "b2b", what: "zaliczka na podatek", source: "ustawa o PIT art. 44 ust. 6, ustawa o ryczałcie art. 21 ust. 1 - do 20. dnia następnego miesiąca, za grudzień do 20 stycznia" },
  ];
  if (vatPayer) list.push({ day: 25, who: "b2b", what: "VAT i plik JPK_V7M", source: "ustawa o VAT art. 99 ust. 1 i art. 103 ust. 1 - do 25. dnia następnego miesiąca" });
  return list;
}

export interface YearlyDeadline {
  date: string;
  who: "uop" | "b2b";
  what: string;
  source: string;
}

const RETURN_FORM: Record<TaxForm, string> = {
  skala: "PIT-36",
  liniowy: "PIT-36L",
  ryczalt: "PIT-28",
  ipbox: "PIT-36 albo PIT-36L z załącznikiem PIT/IP",
};

/** Once a year, in the next year: the employer's PIT-11, the yearly returns, the yearly health settlement. */
export function yearlyDeadlines(form: TaxForm, year: number): YearlyDeadline[] {
  const next = year + 1;
  return [
    { date: `28 lutego ${next}`, who: "uop", what: "pracodawca wysyła PIT-11", source: "ustawa o PIT art. 39 ust. 1 - do końca lutego" },
    { date: `30 kwietnia ${next}`, who: "uop", what: "zeznanie roczne PIT-37", source: "ustawa o PIT art. 45 ust. 1 - od 15 lutego do 30 kwietnia" },
    {
      date: `30 kwietnia ${next}`,
      who: "b2b",
      what: `zeznanie roczne ${RETURN_FORM[form]} i dopłata podatku`,
      source: form === "ryczalt" ? "ustawa o ryczałcie art. 21 ust. 2 pkt 2" : "ustawa o PIT art. 45 ust. 1 i 4",
    },
    {
      date: `20 maja ${next}`,
      who: "b2b",
      what: "roczne rozliczenie składki zdrowotnej (w deklaracji ZUS za kwiecień)",
      source: "ustawa o świadczeniach opieki zdrowotnej art. 81 ust. 2k-2l - w dokumencie za miesiąc terminu zeznania (kwiecień), płatne do 20 maja",
    },
  ];
}
