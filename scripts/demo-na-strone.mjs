// Puts the built website demo (dist-demo/) on the home page: szymonbakonis.pl/kalkulator-uop-b2b/.
// The home page repository (strona-z-demami) gets the folder kalkulator-uop-b2b/ (replaced as a whole)
// and the demo's block in its `_headers` - Cloudflare reads only the root `_headers` of a site.
// Publishing = commit and push of the home page repository (by its owner, not by this script).
// Usage: npm run demo:strona   or   node scripts/demo-na-strone.mjs [home page dir]

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEMO_DIR, withHomeBlock } from "./demo-headers.mjs";

const BUILD = "dist-demo";

function main() {
  const site = resolve(process.argv[2] ?? "../strona-z-demami");
  const headersPath = join(site, "_headers");
  if (!existsSync(headersPath)) throw new Error(`${site}: brak _headers - to nie jest folder strony z demami`);
  if (!existsSync(join(BUILD, "index.html"))) throw new Error(`brak ${BUILD}/index.html - najpierw npm run build:demo`);

  const target = join(site, DEMO_DIR);
  // Replace only a folder this script made before: an empty one or one with the demo's page.
  if (existsSync(target) && readdirSync(target).length > 0) {
    const page = join(target, "index.html");
    const ours = existsSync(page) && readFileSync(page, "utf8").includes("<title>Kalkulator UoP i B2B");
    if (!ours) throw new Error(`${target} ma inne pliki niż demo - nic nie zmieniam`);
    rmSync(target, { recursive: true });
  }
  // `_headers` of the build would be ignored in a subfolder; its rules go to the site's file below.
  cpSync(BUILD, target, { recursive: true, filter: (src) => resolve(src) !== resolve(BUILD, "_headers") });

  const before = readFileSync(headersPath, "utf8");
  const after = withHomeBlock(before);
  if (after !== before) writeFileSync(headersPath, after);
  console.log(`Demo skopiowane do ${target}; _headers strony ${after === before ? "bez zmian" : "uzupełnione"}.`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
