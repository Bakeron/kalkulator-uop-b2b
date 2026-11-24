/**
 * "Co się zmieni i kiedy" under the result (assumption A1 "Przepisy na dziś i po zmianach"):
 * what is sure, what is passed and waits, what is only a bill or an estimate - each with its
 * source - and which of them the result now counts.
 */
import type { RatesFile } from "../calc/rates";
import { checkedText, counted, STATUS_WORDS, type Change, type ChangeGroup, type RulesChoice } from "./rules";

const GROUPS: { key: ChangeGroup; title: string }[] = [
  { key: "pewne", title: "Pewne" },
  { key: "uchwalone", title: "Uchwalone - jeszcze nie obowiązują" },
  { key: "niepewne", title: "Projekty, szacunki i zapowiedzi" },
];

export default function UpcomingChanges({
  changes,
  now,
  target,
  chosen,
}: {
  changes: Change[];
  now: RatesFile;
  target: RatesFile;
  chosen: RulesChoice;
}) {
  return (
    <section className="changes" aria-labelledby="changes-title">
      <h2 id="changes-title" className="section-title">
        Co się zmieni i kiedy
      </h2>
      <p className="answer__note">
        Przepisy na dziś to stawki {now.year} roku.
        {target.year !== now.year && ` Od 1 stycznia ${target.year} zmienia się to, co niżej.`} Przy każdej zmianie widać, czy wynik ją
        teraz uwzględnia - zmienisz to przełącznikiem nad wynikiem.
      </p>
      {changes.length === 0 && <p className="answer__note">Nic nie zapowiedziano.</p>}
      {GROUPS.map((g) => {
        const list = changes.filter((c) => c.group === g.key);
        if (list.length === 0) return null;
        return (
          <div key={g.key} className="changes__group">
            <h3 className="changes__title">{g.title}</h3>
            <ul className="changes__list">
              {list.map((c) => {
                const inResult = counted(c, chosen, target);
                return (
                  <li key={`${c.title}|${c.pending}`} className="changes__item">
                    <span className="changes__name">{c.title}</span>
                    <span className="changes__what">{c.what}</span>
                    <span className="changes__meta">
                      {STATUS_WORDS[c.status]}, {c.from} ·{" "}
                      <a href={c.url} target="_blank" rel="noreferrer noopener">
                        {c.source}
                      </a>{" "}
                      · {checkedText(c)}
                    </span>
                    {c.note && <span className="changes__note">{c.note}</span>}
                    <span className={inResult ? "changes__in changes__in--yes" : "changes__in"}>
                      {!c.inCalc ? "nie zmienia kwot" : inResult ? "w wyniku" : "nie w wyniku"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
