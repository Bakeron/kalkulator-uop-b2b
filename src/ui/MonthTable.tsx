/**
 * The year month by month (assumption A1 "Rachunek"): net of both offers in each month, the
 * difference with a sign and a word (not only colour), the days off and sick days that make the
 * dips, then the yearly return (it comes in spring of the next year) and the total.
 */
import type { Money } from "../calc/money";
import type { CombinedYear } from "../calc/multi";
import { useMoney, type ResultMoney } from "./currency";
import { MONTHS, plural } from "./format";
import { monthRows } from "./model";
import Rolling from "./Rolling";

const signed = (m: ResultMoney, v: Money) => (m.number(v) === "0" ? m.whole(0) : `${v > 0 ? "+" : "-"}${m.whole(Math.abs(v))}`);
const days = (n: number, what: string) => `${what} ${n} ${plural(n, "dzień", "dni", "dni")}`;

export default function MonthTable({ uop, b2b }: { uop: CombinedYear; b2b: CombinedYear }) {
  const m = useMoney();
  const rows = monthRows(uop, b2b);
  const uopMonths = rows.reduce((a, r) => a + r.uopNet, 0);
  const b2bMonths = rows.reduce((a, r) => a + r.b2bNet, 0);
  const uopReturn = uop.netYear - uopMonths;
  const b2bReturn = b2b.netYear - b2bMonths;
  return (
    <div className="months">
      <table>
        <caption className="sr-only">Na rękę w każdym miesiącu roku - umowa o pracę i B2B</caption>
        <thead>
          <tr>
            <th scope="col">Miesiąc</th>
            <th scope="col">Umowa o pracę</th>
            <th scope="col">B2B</th>
            <th scope="col">B2B różnica</th>
            <th scope="col" className="months__why">
              Dlaczego inaczej
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const why = [r.vacation > 0 && days(r.vacation, "urlop"), r.sick > 0 && days(r.sick, "choroba")].filter(Boolean).join(", ");
            return (
              <tr key={r.month}>
                <th scope="row">{MONTHS[r.month]}</th>
                <td><Rolling text={m.whole(r.uopNet)} /></td>
                <td><Rolling text={m.whole(r.b2bNet)} /></td>
                <td><Rolling text={signed(m, r.b2bNet - r.uopNet)} /></td>
                <td className="months__why">{why}</td>
              </tr>
            );
          })}
        </tbody>
        <tbody className="months__end">
          <tr>
            <th scope="row">Rozliczenie roczne</th>
            <td><Rolling text={signed(m, uopReturn)} /></td>
            <td><Rolling text={signed(m, b2bReturn)} /></td>
            <td><Rolling text={signed(m, b2bReturn - uopReturn)} /></td>
            <td className="months__why">zwrot (+) albo dopłata (-) wiosną następnego roku</td>
          </tr>
          <tr className="months__total">
            <th scope="row">Razem w roku</th>
            <td><Rolling text={m.whole(uop.netYear)} /></td>
            <td><Rolling text={m.whole(b2b.netYear)} /></td>
            <td><Rolling text={signed(m, b2b.netYear - uop.netYear)} /></td>
            <td className="months__why" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
