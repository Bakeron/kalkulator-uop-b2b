// Checks the built website demo (`npm run build:demo` -> dist-demo/) before Cloudflare Pages
// serves it: the headers file is there and right, the page stays out of search engines, and
// nothing in index.html would be blocked by the demo's CSP (= white page in the frame).
// Usage: node scripts/check-demo.mjs [dir]   (exit code 1 = problems, listed one per line)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { demoHeaders } from "./demo-headers.mjs";

/** Problems of a built demo; `exists(path)` tells whether a file from index.html was built. */
export function demoProblems({ headers, html, exists }) {
  const problems = [];
  if (headers === null) problems.push("brak pliku _headers");
  else {
    if (headers !== demoHeaders()) problems.push("_headers różni się od scripts/demo-headers.mjs");
    if (/X-Frame-Options/i.test(headers)) problems.push("_headers ma X-Frame-Options - demo nie otworzy się w oknie strony");
  }
  if (!/<meta\s+name="robots"\s+content="noindex"/i.test(html)) problems.push("index.html bez <meta name=\"robots\" content=\"noindex\">");
  // script-src 'self' and style-src 'self': inline code would not run.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(m[1]) || m[2].trim() !== "") problems.push("skrypt w treści index.html - CSP go zablokuje");
  }
  if (/<style\b/i.test(html)) problems.push("<style> w index.html - CSP go zablokuje");
  if (/\son[a-z]+\s*=/i.test(html)) problems.push("atrybut on...= w index.html - CSP go zablokuje");
  // Every local file the page asks for must be in the build.
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/gi)) {
    const ref = m[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) {
      if (/^https?:|^\/\//i.test(ref)) problems.push(`zewnętrzny adres w index.html: ${ref}`);
      continue;
    }
    if (!exists(ref.replace(/^\.?\//, "").split(/[?#]/)[0])) problems.push(`brak pliku z index.html: ${ref}`);
  }
  return problems;
}

function main() {
  const dir = process.argv[2] ?? "dist-demo";
  const headersPath = join(dir, "_headers");
  const problems = demoProblems({
    headers: existsSync(headersPath) ? readFileSync(headersPath, "utf8") : null,
    html: readFileSync(join(dir, "index.html"), "utf8"),
    exists: (p) => existsSync(join(dir, p)),
  });
  if (problems.length === 0) {
    console.log(`Demo w ${dir}: nagłówki i index.html w porządku.`);
    return;
  }
  for (const p of problems) console.error(p);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
