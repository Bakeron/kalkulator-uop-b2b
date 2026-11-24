/** Income tax by the PIT scale (ustawa o PIT art. 27 ust. 1, advances art. 32). */
import { ofRate, toFullZl, type Money } from "./money";
import type { Bracket, Rates } from "./rates";

/** Tax by the scale brackets for the income, before the tax-reducing amount (exact grosze). */
export function scaleTax(income: Money, brackets: readonly Bracket[]): Money {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    if (income <= lower) break;
    const top = upTo === null ? income : Math.min(income, upTo);
    tax += ofRate(top - lower, rate);
    if (upTo === null) break;
    lower = upTo;
  }
  return tax;
}

/**
 * Annual tax on the scale (the yearly return): tax base and tax rounded to full złoty,
 * the tax-reducing amount subtracted, never below zero.
 */
export function annualScaleTax(income: Money, rates: Rates): Money {
  const base = toFullZl(Math.max(0, income));
  return Math.max(0, toFullZl(scaleTax(base, rates.pitScale) - rates.taxReduction));
}

/**
 * Monthly income tax advance of an employee (art. 32): the scale applied to this month's tax base
 * on top of the year-to-date bases (so the higher rate starts in the month the threshold is
 * crossed), minus 1/12 of the tax-reducing amount (PIT-2 filed), rounded to full złoty, never
 * below zero.
 */
export function monthlyAdvance(base: Money, baseBefore: Money, rates: Rates): Money {
  if (base <= 0) return 0;
  const tax = scaleTax(baseBefore + base, rates.pitScale) - scaleTax(baseBefore, rates.pitScale);
  return Math.max(0, toFullZl(tax - Math.round(rates.taxReduction / 12)));
}
