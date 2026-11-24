/**
 * The "Co warto wiedzieć" tab (plan A12): contents at the top, then the chapters. Each section
 * ends with its sources. The comparison of the tax forms is a real table (headers for screen
 * readers), scrolled sideways on a narrow screen instead of squeezed.
 */
import type { MouseEvent } from "react";
import type { Rates } from "../calc/rates";
import { knowledge, type Chapter, type Section } from "./guide";
import { motionReduced } from "./motion";

/** Scroll to the chapter and move the focus there, without a history entry (the demo lives in a frame). */
function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  const title = document.getElementById(`know-${id}-title`);
  if (!title) return;
  const still = motionReduced();
  title.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  title.focus({ preventScroll: true });
}

export default function Knowledge({ rates }: { rates: Rates }) {
  const chapters = knowledge(rates);
  return (
    <div className="know">
      <nav className="know__toc" aria-label="Rozdziały">
        <ol>
          {chapters.map((c) => (
            <li key={c.id}>
              <a href={`#know-${c.id}`} onClick={(e) => jump(e, c.id)}>
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {chapters.map((c) => (
        <ChapterView key={c.id} chapter={c} year={rates.year} />
      ))}
    </div>
  );
}

function ChapterView({ chapter: c, year }: { chapter: Chapter; year: number }) {
  return (
    <section className="know__chapter" id={`know-${c.id}`} aria-labelledby={`know-${c.id}-title`}>
      <h2 className="section-title" id={`know-${c.id}-title`} tabIndex={-1}>
        {c.title}
      </h2>
      <p className="know__lead">{c.lead}</p>
      {c.table && (
        <div className="know__table" role="region" aria-label={`${c.title} - porównanie`} tabIndex={0}>
          <table>
            <caption className="sr-only">
              {c.title} obok siebie, przepisy na {year} rok
            </caption>
            <thead>
              <tr>
                <td />
                {c.table.forms.map((f) => (
                  <th key={f} scope="col">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.table.rows.map(([what, ...values]) => (
                <tr key={what}>
                  <th scope="row">{what}</th>
                  {values.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.sections.map((s) => (
        <SectionView key={s.title} section={s} />
      ))}
    </section>
  );
}

function SectionView({ section: s }: { section: Section }) {
  return (
    <div className="know__section">
      <h3>{s.title}</h3>
      {s.body.map((p, i) =>
        Array.isArray(p) ? (
          <ul key={i}>
            {p.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{p}</p>
        ),
      )}
      <p className="know__sources">
        Źródło:{" "}
        {s.sources.map((src, i) => (
          <span key={src.url + src.label}>
            {i > 0 && ", "}
            <a href={src.url} target="_blank" rel="noopener noreferrer">
              {src.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
