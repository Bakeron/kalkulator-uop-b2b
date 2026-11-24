// Tests of the demo headers and of the built-demo check (node --test scripts/). No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCsp, demoHeaders, HOME_BLOCK_END, HOME_BLOCK_START, homeHeadersBlock, withHomeBlock } from "./demo-headers.mjs";
import { demoProblems } from "./check-demo.mjs";

const goodHtml = `<!doctype html><html lang="pl"><head>
<meta name="robots" content="noindex">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
</head><body><div id="root"></div></body></html>`;
const allExist = () => true;

test("headers: the demo opens only in a frame on the author's home page", () => {
  const h = demoHeaders();
  assert.match(h, /^\/\*\n/);
  assert.match(h, /frame-ancestors 'self' https:\/\/szymonbakonis\.pl https:\/\/szymonbakonis\.pages\.dev/);
  assert.match(h, /X-Robots-Tag: noindex/);
  assert.doesNotMatch(h, /X-Frame-Options/i);
  // Cloudflare: each header on its own indented line under the path.
  for (const line of h.trim().split("\n").slice(1)) assert.match(line, /^ {2}[A-Za-z-]+: \S/);
});

test("CSP: no inline code, public APIs for 'Odśwież' allowed", () => {
  const csp = demoCsp();
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /script-src 'self'(;|$)/);
  for (const api of ["https://api.nbp.pl", "https://api.sejm.gov.pl", "https://raw.githubusercontent.com"]) {
    assert.ok(csp.includes(api), api);
  }
  assert.match(csp, /worker-src 'self'/);
});

test("built demo: a correct build has no problems", () => {
  assert.deepEqual(demoProblems({ headers: demoHeaders(), html: goodHtml, exists: allExist }), []);
});

test("built demo: missing or changed headers", () => {
  assert.deepEqual(demoProblems({ headers: null, html: goodHtml, exists: allExist }), ["brak pliku _headers"]);
  const deny = demoHeaders() + "  X-Frame-Options: DENY\n";
  const p = demoProblems({ headers: deny, html: goodHtml, exists: allExist });
  assert.equal(p.length, 2);
  assert.match(p[1], /X-Frame-Options/);
});

test("built demo: what the CSP would block", () => {
  const html = goodHtml
    .replace('<meta name="robots" content="noindex">', "")
    .replace("</head>", '<script>alert(1)</script><style>a{}</style><button onclick="x()"></button></head>');
  const p = demoProblems({ headers: demoHeaders(), html, exists: allExist });
  assert.equal(p.length, 4);
  assert.match(p[0], /noindex/);
  assert.match(p[1], /skrypt/);
  assert.match(p[2], /<style>/);
  assert.match(p[3], /on\.\.\.=/);
});

test("built demo: missing and external files", () => {
  const html = goodHtml.replace("</head>", '<script src="https://cdn.example.com/x.js"></script></head>');
  const p = demoProblems({ headers: demoHeaders(), html, exists: (f) => f !== "favicon.svg" });
  assert.deepEqual(p, ["brak pliku z index.html: /favicon.svg", "zewnętrzny adres w index.html: https://cdn.example.com/x.js"]);
});

test("home page block: the demo's own CSP replaces the home page's", () => {
  const b = homeHeadersBlock();
  const lines = b.split("\n");
  assert.equal(lines[0], HOME_BLOCK_START);
  assert.equal(lines[1], "/kalkulator-uop-b2b/*");
  assert.equal(lines.at(-1), HOME_BLOCK_END);
  // Detach first (Cloudflare applies "/*" before this rule), then set.
  const detach = lines.indexOf("  ! Content-Security-Policy");
  const set = lines.findIndex((l) => l.startsWith("  Content-Security-Policy: "));
  assert.ok(detach > 0 && set > detach);
  assert.ok(lines.includes("  ! X-Frame-Options"));
  assert.ok(b.includes(demoCsp()));
});

test("home page block: put in once, then replaced in place", () => {
  const home = "/*\n  X-Robots-Tag: noindex\n";
  const once = withHomeBlock(home);
  assert.equal(once, `/*\n  X-Robots-Tag: noindex\n\n${homeHeadersBlock()}\n`);
  assert.equal(withHomeBlock(once), once);
  const old = once.replace("Referrer-Policy: no-referrer", "Referrer-Policy: same-origin") + "/x\n  A: b\n";
  assert.equal(withHomeBlock(old), `${once}/x\n  A: b\n`);
  assert.throws(() => withHomeBlock(`${home}${HOME_BLOCK_START}\n`), /uszkodzony/);
});
