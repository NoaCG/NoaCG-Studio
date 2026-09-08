#!/usr/bin/env node
// gate: build
// guards: api/**, vercel.json
//
// Count the serverless functions this deployment would create, and refuse to exceed the plan's cap.
//
// Why this exists: the Vercel Hobby plan refuses a deployment with more than 12 serverless
// functions, and every routed file under api/ is one. In July 2026 the tree reached 29 files and
// EVERY production deploy died at patchBuild with exceeded_serverless_functions_per_deployment -
// for four days, while the repo stayed green, because nothing here counts functions
// (docs/DEPLOYMENT.md, "The serverless function budget"). The fix then was consolidation to 10;
// nothing has stopped it climbing back since.
//
// Vercel's routing rule is what is implemented here, not an approximation of it: everything under
// api/ becomes a function EXCEPT paths with a segment starting with `_` (api/_lib/ - the whole
// reason handlers live there), and type declarations. Tests are excluded too: they only ever sit
// under _lib today, and a test file that escaped it would be a routed function on production, so
// they are counted rather than ignored if they ever appear outside.
//
// This is a hard gate, not a report, for the same reason as check-vercel-config.mjs: over the cap
// there is no deployment to look at, and production silently keeps serving whatever shipped last.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const apiDir = path.join(repoRoot, 'api');

// Hobby. Raising this is a plan change, not a code change - if the number here ever needs to move,
// the paid tier is the thing that moved it.
export const FUNCTION_CAP = 12;

const RUNTIME_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);

/** Every file under `dir` that Vercel would turn into a serverless function, repo-relative. */
export function routedFunctions(dir = apiDir) {
  const found = [];
  walk(dir, '');
  return found.sort();

  function walk(absolute, relative) {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      // A leading underscore takes a file or a whole directory out of routing. This is the one
      // rule the api/ layout is built on.
      if (entry.name.startsWith('_')) continue;
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childAbsolute, childRelative);
        continue;
      }
      if (entry.name.endsWith('.d.ts')) continue;
      if (!RUNTIME_EXTENSIONS.has(path.extname(entry.name))) continue;
      found.push(childRelative);
    }
  }
}

function main() {
  let functions;
  try {
    functions = routedFunctions();
  } catch (error) {
    console.error(`Cannot read ${apiDir}: ${error.message}`);
    process.exit(1);
  }

  // Required rather than optional even though this is a ceiling and zero is trivially under it:
  // the way zero would appear is RUNTIME_EXTENSIONS no longer matching the tree, which is this
  // gate breaking rather than api/ shrinking.
  measured(functions.length, 'serverless functions under api/');

  if (functions.length > FUNCTION_CAP) {
    console.error(
      `api/ would create ${functions.length} serverless functions; the plan allows ${FUNCTION_CAP}.`,
    );
    console.error('Vercel refuses the whole deployment, so production stops updating with no failed build to find.');
    console.error('Move the handler under api/_lib/ and route it from the area catch-all (docs/DEPLOYMENT.md).');
    for (const name of functions) console.error(`  api/${name}`);
    process.exit(1);
  }

  const headroom = FUNCTION_CAP - functions.length;
  console.log(
    `api/ routes ${functions.length} serverless functions, ${headroom} under the cap of ${FUNCTION_CAP}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
