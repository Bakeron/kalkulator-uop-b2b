// Daily check for new legal acts that may change the rates in src/rates/*.json.
// Asks the Sejm ELI API (free, no key) for acts published in the Journal of Laws (DU) and
// Monitor Polski (MP) in the last LOOKBACK_DAYS days (by publication date), keeps the ones about income tax, social
// security, health insurance, wages and VAT, and opens one GitHub issue per act that has no issue yet.
// Without GITHUB_TOKEN / GITHUB_REPOSITORY, or with --dry-run, it only prints what it found.
// No dependencies - Node 20+ (global fetch).

import { pathToFileURL } from "node:url";

const ELI_API = "https://api.sejm.gov.pl/eli";
const GITHUB_API = "https://api.github.com";
export const LOOKBACK_DAYS = 10;
// The API's dateFrom filters by the date of the act, not of its publication - an act signed weeks
// before it is published would be missed, so ask further back and filter by publication here.
export const FETCH_DAYS = 90;
export const LABEL = "stawki";
const TITLE_PREFIX = "Nowy akt - sprawdź stawki:";

// Each rule: what the act is about (shown in the issue) and a pattern for its title or keywords.
export const RULES = [
  { topic: "PIT", pattern: /podatku dochodowym od osób fizycznych/i },
  { topic: "ryczałt", pattern: /zryczałtowanym podatku dochodowym/i },
  { topic: "ZUS", pattern: /systemie ubezpieczeń społecznych|podstaw\w* wymiaru składek/i },
  { topic: "zasiłek chorobowy", pattern: /świadczeniach pieniężnych z ubezpieczenia społecznego w razie choroby/i },
  { topic: "składka wypadkowa", pattern: /ubezpieczeniu społecznym z tytułu wypadków|ubezpieczenie wypadkowe/i },
  { topic: "zdrowotna", pattern: /świadczeniach opieki zdrowotnej finansowanych ze środków publicznych|składk\w* zdrowotn/i },
  { topic: "płaca minimalna", pattern: /minimaln\w* wynagrodzeni/i },
  { topic: "przeciętne wynagrodzenie", pattern: /przeciętn\w* (?:miesięczn\w* )?wynagrodzeni/i },
  { topic: "Fundusz Pracy", pattern: /Fundusz\w* Pracy|rynku pracy i służbach zatrudnienia/i },
  { topic: "PPK", pattern: /pracowniczych planach kapitałowych/i },
  { topic: "VAT", pattern: /podatku od towarów i usług/i },
  { topic: "ulga na start", pattern: /Prawo przedsiębiorców/i },
  { topic: "Kodeks pracy", pattern: /Kodeks pracy/i },
];

/** Topics an act matches - by its title and its ELI keywords. Empty = not relevant. */
export function topicsOf(act) {
  const text = [act.title ?? "", ...(Array.isArray(act.keywords) ? act.keywords : [])].join(" | ");
  return RULES.filter((r) => r.pattern.test(text)).map((r) => r.topic);
}

/** "YYYY-MM-DD" of `today` minus `days`, in UTC. */
export function daysAgo(today, days) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

/** ELI id like "DU/2026/1544" - the same in the issue title and the API address. */
export function eliOf(act) {
  if (typeof act.ELI === "string" && /^(DU|MP)\/\d{4}\/\d+$/.test(act.ELI)) return act.ELI;
  return `${act.publisher}/${act.year}/${act.pos}`;
}

export function issueTitle(act) {
  return `${TITLE_PREFIX} ${act.displayAddress ?? eliOf(act)} (${eliOf(act)})`;
}

// Text from the API goes into a Markdown issue: no mentions, no HTML, no runaway length.
export function plain(text, max = 600) {
  return String(text ?? "")
    .replace(/[<>`]/g, "")
    .replace(/@/g, "@​")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function issueBody(act, topics) {
  const eli = eliOf(act);
  const lines = [
    `**${plain(act.title)}**`,
    "",
    `- Dotyczy: ${topics.join(", ")}`,
    `- Ogłoszony: ${plain(act.promulgation, 10) || "-"}, wchodzi w życie: ${plain(act.entryIntoForce, 10) || "-"}`,
    `- Tekst (PDF): ${ELI_API}/acts/${eli}/text.pdf`,
    `- ISAP: https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=${encodeURIComponent(plain(act.address, 40))}`,
    "",
    "Co zrobić: sprawdzić, czy akt zmienia kwotę albo stawkę z `src/rates/*.json` (pole „Co się zmieni i kiedy” też).",
    "Jeśli tak - poprawić plik stawek (z datą sprawdzenia i źródłem) i zamknąć zgłoszenie z odnośnikiem do zmiany.",
    "Jeśli nie - zamknąć zgłoszenie z krótkim „nie dotyczy”.",
    "",
    "_Zgłoszenie założył automat „Nowe akty prawne” (API Sejmu ELI)._",
  ];
  return lines.join("\n");
}

/** Acts published on `since` ("YYYY-MM-DD") or later; an act without a publication date stays. */
export function publishedSince(acts, since) {
  return acts.filter((a) => typeof a.promulgation !== "string" || a.promulgation >= since);
}

/** Acts from `acts` that are relevant and have no issue yet (by ELI id in an existing title). */
export function newRelevantActs(acts, existingTitles) {
  const seen = new Set();
  const result = [];
  for (const act of acts) {
    const eli = eliOf(act);
    if (seen.has(eli)) continue;
    seen.add(eli);
    const topics = topicsOf(act);
    if (topics.length === 0) continue;
    if (existingTitles.some((t) => t.includes(`(${eli})`))) continue;
    result.push({ act, topics });
  }
  return result;
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url} -> HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function fetchActs(publisher, dateFrom) {
  const acts = [];
  const limit = 500;
  for (let offset = 0; offset < 5000; offset += limit) {
    const url = `${ELI_API}/acts/search?publisher=${publisher}&dateFrom=${dateFrom}&limit=${limit}&offset=${offset}`;
    const page = await fetchJson(url, { headers: { Accept: "application/json" } });
    const items = Array.isArray(page?.items) ? page.items : [];
    acts.push(...items);
    if (items.length < limit) break;
  }
  return acts;
}

function github(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  return (path, init = {}) => fetchJson(`${GITHUB_API}${path}`, { ...init, headers });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const today = new Date();
  const dateFrom = daysAgo(today, FETCH_DAYS);
  const since = daysAgo(today, LOOKBACK_DAYS);

  const all = [...(await fetchActs("DU", dateFrom)), ...(await fetchActs("MP", dateFrom))];
  const acts = publishedSince(all, since);
  console.log(`Akty ogłoszone od ${since}: ${acts.length}`);

  if (dryRun || !token || !repo) {
    for (const { act, topics } of newRelevantActs(acts, [])) {
      console.log(`- ${issueTitle(act)} [${topics.join(", ")}] ${plain(act.title, 160)}`);
    }
    if (!dryRun) console.log("Brak GITHUB_TOKEN / GITHUB_REPOSITORY - tylko lista, bez zgłoszeń.");
    return;
  }

  const gh = github(token);
  // Issues from the last weeks are enough: older acts are outside the lookback window.
  const issues = await gh(`/repos/${repo}/issues?labels=${LABEL}&state=all&sort=created&direction=desc&per_page=100`);
  const existing = (issues ?? []).map((i) => String(i.title));
  const fresh = newRelevantActs(acts, existing);
  console.log(`Nowe akty do sprawdzenia: ${fresh.length}`);

  if (fresh.length > 0) {
    try {
      await gh(`/repos/${repo}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: LABEL, color: "b60205", description: "Nowy akt prawny - sprawdzić plik stawek" }),
      });
    } catch (e) {
      if (!String(e.message).includes("HTTP 422")) throw e; // 422 = the label already exists
    }
  }
  for (const { act, topics } of fresh) {
    await gh(`/repos/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: issueTitle(act), body: issueBody(act, topics), labels: [LABEL] }),
    });
    console.log(`Zgłoszenie: ${issueTitle(act)}`);
  }
}

// Run only as a script, not when imported by the tests.
if (import.meta.url === new URL(`file://${process.argv[1]?.replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
