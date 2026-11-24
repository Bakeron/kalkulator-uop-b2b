/**
 * Money is always an integer number of grosze (1 zł = 100 gr) and rates are integer basis points
 * (1% = 100 bp), so no floating point error ever reaches a result (assumption A1 "technika").
 */

/** Integer amount in grosze. */
export type Money = number;
/** Integer rate in basis points: 9,76% = 976. */
export type Bp = number;

/** Złoty with up to 2 decimals (as written in acts and in the rates files) -> grosze. */
export function zl(amount: number): Money {
  return Math.round(amount * 100);
}

/** Percent with up to 2 decimals (9.76) -> basis points (976). */
export function pct(percent: number): Bp {
  return Math.round(percent * 100);
}

/**
 * Commercial rounding of a non-negative fraction to the nearest integer (0,5 up).
 * Integer arithmetic only: `numerator / denominator` rounded half up.
 */
function roundDiv(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const r = n - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

/** `base x rate`, rounded to the grosz - how ZUS rounds every single contribution. */
export function ofRate(base: Money, rate: Bp): Money {
  return roundDiv(base * rate, 10_000);
}

/** `base x numerator / denominator`, rounded to the grosz (e.g. 1/30 of the sick pay base). */
export function fraction(base: Money, numerator: number, denominator: number): Money {
  return roundDiv(base * numerator, denominator);
}

/**
 * Rounding to full złoty (Ordynacja podatkowa art. 63 par. 1): under 50 gr down, from 50 gr up.
 * Used for tax bases and for income tax amounts.
 */
export function toFullZl(amount: Money): Money {
  return roundDiv(amount, 100) * 100;
}

/** Sum of amounts. */
export function sum(values: readonly Money[]): Money {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Polish money format: "12 345,67 zł" (non-breaking spaces between thousands). */
export function formatZl(amount: Money, withGrosze = true): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const gr = abs % 100;
  const digits = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const text = withGrosze ? `${digits},${String(gr).padStart(2, "0")}` : digits;
  return `${negative ? "-" : ""}${text}\u00a0zł`;
}
