#!/usr/bin/env node
// gate: build
// guards: api/**
//
// Refuse an api/ path the deployment will not route.
//
// MEASURED ON PRODUCTION 2026-08-14, not inferred: a `[...path].ts` function under api/ routes
// exactly ONE segment. The probe, against the live site:
//
//   /api/ai/pro                          -> the app's own JSON 404   (routed)
//   /api/ai/pro/status                   -> platform NOT_FOUND       (never routed)
//   /api/ai/lite/nonexistent             -> Lite's own JSON 404      (routed)
//   /api/ai/lite/a/b                     -> platform NOT_FOUND       (never routed)
//   /api/ai/tasks/import-analysis        -> the app's 405            (routed)
//   /api/ai/tasks/import-analysis/status -> platform NOT_FOUND       (never routed)
//
// Vercel's docs describe `[...slug]` as a catch-all over multiple segments; this deployment
// does not behave that way, and the deployment is what serves users. Hosted Pro shipped three
// endpoints one segment too deep and every one of them 404'd in production while every test,
// every gate and the whole CI suite stayed green - because nothing here drives a real URL
// through Vercel's router.
//
// So this is a STATIC check of the one thing that was wrong: the paths the browser asks for,
// against what the platform serves. Both sides are DERIVED - every `/api/` path named anywhere
// under `src/`, against the functions found in the `api/` tree - so neither a new function nor a
// new client file needs this script edited to be covered. Nothing here is a list somebody keeps
// in step: a URL written down twice is how one copy quietly stops being served, and a source file
// left off a list is how `src/ai/importAnalysis/client.ts` kept two unroutable paths after the
// same defect had already been found and fixed in hosted Pro.
//
// IT ANSWERS THROUGH THE SAME RESOLVER THE DEV SERVER ROUTES BY (`scripts/apiRouteTable.mjs`),
// which is the point rather than an economy. `aiDevPlugin` used to decide reachability from a
// hand-kept allowlist, and that list hid a whole surface three times - a check with its own
// second model of routing would just be a fourth place for the same disagreement to live. One
// model, two consumers: the dev server serves what this gate certifies.
//
// TWO FAILURES, and they are different repairs. A path too DEEP for its catch-all never reaches
// code (flatten the segment into the name, as hosted Pro's `pro-status` does). A path NO function
// serves at all is a client calling something that does not exist - a renamed handler, a typo, an
// area that lost its function.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFunctionTable, clientApiPaths, resolveApiRoute } from './apiRouteTable.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const table = apiFunctionTable(repoRoot, 'api');
const { paths, fileCount } = clientApiPaths(repoRoot);
const problems = [];
const served = new Set();

for (const { file, raw, normalized } of paths) {
  const route = normalized.replace(/^\/api\//, '');
  if (!route) continue;                              // `/api` itself is not a route
  const target = resolveApiRoute(table, route);
  if (target) {
    served.add(target);
    continue;
  }
  // Which of the two it is: a catch-all owns the path but at the wrong depth, or nothing owns it.
  const owner = table.catchAlls.find(({ prefix }) => !prefix || route.startsWith(`${prefix}/`));
  const rest = owner ? (owner.prefix ? route.slice(owner.prefix.length + 1) : route) : null;
  problems.push(rest && rest.includes('/')
    ? `${file}: ${raw} is ${rest.split('/').length} segments past api/${owner.prefix ? `${owner.prefix}/` : ''}[...path]`
      + ' - the deployment routes ONE, so this is a platform 404'
    : `${file}: ${raw} - no api/ function serves this path at all`);
}

if (problems.length) {
  console.error('API paths the deployment will not route:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nEither flatten the path into one segment (hosted Pro uses `pro-status`), or give the '
    + 'area its own [...path].ts function - which costs one against the Hobby cap of 12 '
    + '(npm run check:function-budget). A path nothing serves is a client calling a handler '
    + 'that does not exist.',
  );
  process.exit(1);
}

console.log(
  `API routing OK (${paths.length} client path(s) reaching ${served.size} of `
  + `${table.exact.size + table.catchAlls.length} function(s), read from ${fileCount} source file(s)).`,
);
