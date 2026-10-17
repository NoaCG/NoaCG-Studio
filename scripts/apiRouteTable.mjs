// WHICH api/ FUNCTION SERVES A PATH - derived from the tree, so nothing keeps a copy in step.
//
// THE DEFECT THIS CLOSES. Every dev middleware that mounts the real api/ handlers has to decide
// two things: is this path routable at all, and which function file answers it. `aiDevPlugin`
// answered the first from a hand-kept ALLOWLIST, and that list has now hidden a whole surface
// three times - the imported-graphic-analysis task, hosted Pro (a dev 404 in every dev server
// and the entire e2e suite while production served it), and `/api/ai/consent`, which no dev
// server has ever routed. `meDevPlugin` already refuse to keep a list, and
// say why: "a second copy in the dev server would be a second thing to keep in step". It can
// simply forward everything because each mounts ONE function. `api/ai` mounts four, so the
// choice cannot be skipped - it has to be DERIVED instead.
//
// THE RULE IS THE DEPLOYMENT'S, MEASURED, NOT VERCEL'S DOCUMENTATION. A `[...path].ts` function
// under api/ routes exactly ONE segment; anything deeper never reaches code and gets the
// platform's own NOT_FOUND. `scripts/check-api-route-depth.mjs` records the probe that measured
// it, and `api/_lib/pro/router.ts` records what it cost. So a dev server that answered a
// two-segment path would be HIDING that defect rather than merely differing - which is exactly
// how hosted Pro shipped three endpoints production refused while every gate stayed green.
//
// Both halves are read off disk. A new function, a new concrete route, a renamed area: none of
// them needs this file edited to be served.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** A file under api/ that is not itself a route: shared code, tests, fixtures. */
function isRoutableFile(name) {
  return /\.[tj]s$/.test(name) && !name.startsWith('_') && !/\.(test|spec)\.[tj]s$/.test(name);
}

/**
 * The function table for one AREA of api/ (`api/ai`, say), as the deployment sees it.
 *
 * `exact` maps a route path to the concrete function that owns it - `generate` ->
 * `/api/ai/generate.ts`, which is its own function because it carries maxDuration 300 and reads
 * 12 MB bodies. `catchAlls` are the `[...path].ts` functions, each with the prefix its own
 * directory contributes ('' for `api/ai/[...path].ts`, 'lite' for `api/ai/lite/[...path].ts').
 *
 * Module paths are absolute-from-repo-root and slash-separated, which is the shape Vite's
 * `ssrLoadModule` wants on every platform - `path.join` would hand it backslashes on Windows.
 */
export function apiFunctionTable(repoRoot, area) {
  const exact = new Map();
  const catchAlls = [];
  const walk = (absolute, relative) => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;                                  // an area that does not exist has no routes
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue;
      const child = path.join(absolute, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child, rel);
      } else if (/^\[\.\.\..+\]\.[tj]s$/.test(entry.name)) {
        catchAlls.push({ prefix: relative, module: `/${area}/${rel}` });
      } else if (isRoutableFile(entry.name)) {
        exact.set(rel.replace(/\.[tj]s$/, ''), `/${area}/${rel}`);
      }
    }
  };
  walk(path.join(repoRoot, area), '');
  // Longest prefix first: `lite/status` belongs to the lite function, not to the root catch-all.
  catchAlls.sort((a, b) => b.prefix.length - a.prefix.length);
  return { exact, catchAlls };
}

/**
 * The module that serves `route` (the path with the area prefix already stripped), or null when
 * the deployment would not route it at all.
 *
 * A concrete file wins over a catch-all, which is what the platform does and what keeps
 * `api/ai/generate.ts` out of the light-routes function. Everything else must sit EXACTLY one
 * segment past its catch-all's own directory; a second segment returns null, because production
 * never reaches code for it and a dev server that did would hide the difference.
 */
export function resolveApiRoute(table, route) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const direct = table.exact.get(clean);
  if (direct) return direct;
  for (const { prefix, module } of table.catchAlls) {
    if (prefix && !clean.startsWith(`${prefix}/`)) continue;
    const rest = prefix ? clean.slice(prefix.length + 1) : clean;
    if (!rest || rest.includes('/')) continue;               // too deep for the platform to route
    return module;
  }
  return null;
}

// ── WHAT THE BROWSER ACTUALLY ASKS FOR ───────────────────────────────────────────────────
//
// Both route guards need the same answer to "which `/api/...` paths does our own client name",
// and each derives it rather than keeping a list: `src/ai/importAnalysis/client.ts` carried two
// unroutable paths that a hand-kept list could not see, because nobody had added the file. The
// whole of `src/` is cheap to read and cannot go stale.

/** Every browser file that could name an `/api/...` path - DERIVED, not listed. */
function clientSources(repoRoot) {
  const files = [];
  const walk = (absolute, relative) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, rel);
      else if (/\.[tj]sx?$/.test(entry.name)) files.push(rel);
    }
  };
  walk(path.join(repoRoot, 'src'), 'src');
  return files;
}

/**
 * The `/api/...` paths one source names, each reduced to the SEGMENTS the router sees. A template
 * literal counts an interpolation as exactly one segment - which is the claim a path builder
 * makes and the thing worth checking: `/api/me/${path}` is legal, and `/api/me/${a}/detail`
 * is a platform 404 however `a` resolves. Anything unrecognisable inside the braces is still one
 * segment, because a builder that splices a slash in is a path this cannot answer and must not
 * pretend to.
 */
function apiPathsIn(source) {
  const found = [];
  for (const match of source.matchAll(/(['"`])(\/api\/[^'"`\n]*)\1/g)) {
    const raw = match[2];
    if (match[1] !== '`' && raw.includes('$')) continue;          // not a path, whatever it is
    const normalized = raw.replace(/\$\{[^}]*\}/g, 'SEGMENT');
    if (normalized.includes('$')) continue;                       // a nested brace we cannot read
    // A query string is not part of the path the router matches, and leaving it on would let a
    // slash inside one read as another segment.
    found.push({ raw, normalized: normalized.split(/[?#]/)[0].replace(/\/+$/, '') });
  }
  return found;
}

/** Every `/api/...` path named anywhere under `src/`, with the file that names it. */
export function clientApiPaths(repoRoot) {
  const out = [];
  const files = clientSources(repoRoot);
  for (const file of files) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const found of apiPathsIn(source)) out.push({ file, ...found });
  }
  return { paths: out, fileCount: files.length };
}
