/**
 * Currency of the results (assumption A1 "Kwoty i waluta wyniku"): the calculations are always
 * in złoty (taxes and ZUS are), the results can be shown in euro or dollars at the NBP mid rate
 * of the date given next to them. Without a rate (never refreshed, no network) - złoty.
 */
import { createContext, useContext } from "react";
import { formatZl, type Money } from "../calc/money";
import { dateShort, zlWhole } from "./format";
import type { Currency, FxRate } from "./refresh";

export const CURRENCY_SIGN: Record<Currency, string> = { PLN: "zł", EUR: "€", USD: "$" };
export const CURRENCY_NAME: Record<Currency, string> = { PLN: "złote", EUR: "euro", USD: "dolary" };

export interface ResultMoney {
  currency: Currency;
  /** The rate used, `null` for złoty. */
  rate: FxRate | null;
  /** "12 345 zł" / "2 870 €" - rounded to whole units. */
  whole: (amount: Money) => string;
  /** The number alone: "12 345" / "2 870". */
  number: (amount: Money) => string;
}

/** Złoty (grosze) in the currency, in its cents. */
export function toForeign(amount: Money, rate: FxRate): number {
  return Math.round(amount / rate.mid);
}

/** A foreign amount (cents) in grosze. */
export function fromForeign(cents: number, rate: FxRate): Money {
  return Math.round(cents * rate.mid);
}

export function resultMoney(currency: Currency, rate: FxRate | null): ResultMoney {
  if (currency === "PLN" || !rate) {
    return { currency: "PLN", rate: null, whole: zlWhole, number: (a) => zlWhole(a).replace(/ zł$/, "") };
  }
  const number = (a: Money) => formatZl(Math.round(toForeign(a, rate) / 100) * 100, false).replace(/ zł$/, "");
  return { currency, rate, whole: (a) => `${number(a)} ${CURRENCY_SIGN[currency]}`, number };
}

/** "Przeliczone po średnim kursie NBP z 24.11.2026 (1 € = 4,2512 zł)." */
export function rateNote(m: ResultMoney): string | null {
  if (!m.rate) return null;
  const mid = m.rate.mid.toLocaleString("pl-PL", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `Przeliczone ze złotych po średnim kursie NBP z ${dateShort(m.rate.date)} (1 ${CURRENCY_SIGN[m.currency]} = ${mid} zł).`;
}

export const MoneyContext = createContext<ResultMoney>(resultMoney("PLN", null));

/** How the results show money - złoty, euro or dollars. */
export const useMoney = () => useContext(MoneyContext);
