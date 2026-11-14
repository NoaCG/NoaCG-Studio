#!/usr/bin/env node
// gate: build
// guards: e2e/**, scripts/e2e-dev-server-specs.mjs, playwright.config.ts
//
// THE SPECS THAT RUN ON THE DEV SERVER WHEN THE SUITE RUNS ON THE E2E BUILD.
//
//   npm run check:e2e-dev-server     # fails on a spec that needs the dev server and does not say so
//
// The browser suite runs against the e2e build (playwright.config.ts, NOACG_E2E_ON_BUILD=1). A few
// specs test something only the dev server has: they swap a source module over the network
// (`page.route('**/src/backend/config.ts*')`), rewrite a page's boot script, ask for a fresh module
// copy (`?t=`), read source files or stylesheets by their /src URL, or import a file the build does
// not serve (/benchmarks). On the build such a route matches nothing and raises nothing, so the
// spec would pass without exercising its condition. Those specs run in the "dev" project instead,
// on a dev server, with every assertion unchanged.
//
// A spec says so on its first line, with the reason:
//
//   // runs on: dev server - <why the build cannot serve it>
//
// This check reads every spec and helper. A URL-style `/src/` or `/benchmarks/` path outside a
// `__noacgImport('/src/…')` call and outside a comment line means the dev server; such a spec
// without the header fails here. A helper with one fails too, since its importers cannot see it.
// A spec may carry the header without a detected path (it reads stylesheets the build bundles,
// say) - the reason is then the only evidence, so it is required.

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The header, on a spec's FIRST line. */
export const MARKER = /^\/\/ runs on: dev server - (\S.{9,})$/;
/** Anything that looks like an attempt at it, anywhere: a typo must not silently mean "the build". */
const NEAR = /^\s*\/\/\s*runs[\s-]*on\b/im;
const URL_PATH = /(['"`*]|\$\{[^}]*\}|https?:\/\/[^/'"`\s]*)\/(src|benchmarks)\//;

/** Line numbers (1-based) where a text names a URL-style /src/ or /benchmarks/ path outside the
 *  door and outside a comment line. */
export function devServerPaths(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    const rest = line
      .replace(/__noacgImport\(\s*(['"`])\/src\/[^'"`]*\1\s*\)/g, '')
      .replace(/typeof import\([^)]*\)/g, '');
    if (URL_PATH.test(rest)) hits.push(i + 1);
  });
  return hits;
}

/** `{ specs, problems }` over `[file, text]` entries of e2e/ (top level): the spec files marked
 *  for the dev server, and every spec or helper that needs it without saying so. */
export function classify(entries) {
  const specs = [];
  const problems = [];
  for (const [file, text] of entries) {
    const marked = MARKER.test(text.split('\n', 1)[0]);
    const near = !marked && NEAR.test(text);
    const hits = devServerPaths(text);
    const isSpec = file.endsWith('.spec.ts');
    if (marked && isSpec) specs.push(file);
    if (hits.length && !marked) {
      problems.push(
        isSpec
          ? `${file}:${hits[0]} needs the dev server; add \`// runs on: dev server - <why>\` to its header`
          : `${file}:${hits[0]} is a helper that needs the dev server; its importers cannot say so - move the path into the specs`,
      );
    }
    if (marked && !isSpec) problems.push(`${file} carries the dev-server header but is not a spec`);
    if (near) problems.push(`${file} has a "runs on" line that is not the header: write \`// runs on: dev server - <why>\` as its first line`);
  }
  return { specs: specs.sort(), problems };
}

/** The e2e/ top-level spec and helper files, as `[file, text]` (the configured and catalog suites
 *  run on their own configs and are not read). */
export function e2eEntries(root = ROOT) {
  return readdirSync(join(root, 'e2e'))
    .filter((f) => /\.ts$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => [`e2e/${f}`, readFileSync(join(root, 'e2e', f), 'utf8')]);
}

/** The spec files the "dev" project runs, as paths relative to the repo root. */
export function devServerSpecs(root = ROOT) {
  return classify(e2eEntries(root)).specs;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const entries = e2eEntries();
  const { specs, problems } = classify(entries);
  measured(entries.length, 'e2e spec and helper files read');
  if (problems.length) {
    console.error(`e2e-dev-server-specs: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`e2e-dev-server-specs: ok - ${specs.length} spec(s) run on the dev server when the suite runs on the build`);
}
