/**
 * Licences of the fonts bundled with the app (task A21b) - the same facts as the README,
 * shown in the app for people who never open the repository. The address is also printed
 * as text, so it can be copied where a link does not open (desktop app without an opener).
 * Shown at the bottom of the "Źródła" tab.
 */
const FONTS = [
  {
    name: "Atkinson Hyperlegible Next",
    use: "tekst",
    licence: "SIL Open Font License 1.1",
    url: "https://openfontlicense.org/",
  },
  {
    name: "osifont",
    use: "cyfry na podziałkach, pismo techniczne wg ISO 3098",
    licence: "GNU LGPL 3 z wyjątkiem dla czcionek",
    url: "https://github.com/hikikomori82/osifont",
  },
] as const;

export default function FontLicenses() {
  return (
    <details className="font-licences">
      <summary>Czcionki i ich licencje</summary>
      <ul>
        {FONTS.map((f) => (
          <li key={f.name}>
            <strong>{f.name}</strong> ({f.use}) -{" "}
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              {f.licence}
            </a>
            <span className="font-licences__url">{f.url}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
