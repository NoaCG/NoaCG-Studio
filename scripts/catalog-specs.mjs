#!/usr/bin/env node
// THE CATALOG SPECS, SCOPED - one door, one flag, one place the ids are checked.
//
//   node scripts/catalog-specs.mjs                    # the whole catalog (same as npm run test:e2e:catalog)
//   node scripts/catalog-specs.mjs --only lt01,lt02   # just these designs
//
// WHY THIS EXISTS RATHER THAN AN ENV PREFIX. Playwright gives a spec no argv channel, so the
// scope has to reach the specs as an environment variable (`e2e/_catalogScope.ts`). Printing
// `NOACG_ONLY_DESIGNS=lt01 npm run test:e2e:catalog` as the command to run made that variable a
// second user-facing interface - and a broken one on this repo's own platform: the job runner
// spawns with `shell: true`, which is cmd.exe on win32, where a leading `VAR=value` is not a
// variable assignment but a command nobody has. So `--only` is the ONE spelling across all six
// gates, and the env var goes back to being transport.
//
// AND IT IS WHERE A BAD SCOPE IS CAUGHT. Every catalog spec disables its own vacuity floor while
// a scope is set - correctly, because under an explicit scope a slice with no multi-column design
// in it is the ordinary case rather than a detection that stopped matching. Put that together with
// a scope naming ids the catalog does not ship and the whole battery measures NOTHING and reports
// green: a stale command line, a design renamed since the plan was printed, a typo. The ids are
// therefore resolved against the real catalog HERE, in about a second and with no dev server, and
// an unknown one refuses before Playwright starts.
//
// It runs both configs, because "the catalog specs" is both: the calibration tripwire and its
// siblings under e2e/catalog/, and e2e/catalog-baseline.spec.ts, which lives in the default suite
// (playwright.config.ts ignores `**/catalog/**`) and is the only place the RENDER baseline is
// compared. Running one and calling it the catalog specs is how that baseline came to be the one
// thing that only ever failed in CI.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { catalogIndex } from './catalog-emit.mjs';
import { parseOnly } from './catalog-scope.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const { ids: only } = parseOnly(args);
const passthrough = args.filter((a, i) => a !== '--only' && args[i - 1] !== '--only');

const env = { ...process.env };
if (only) {
  const index = await catalogIndex();
  const byId = new Map(index.map((v) => [v.id, v.category]));
  const unknown = only.filter((id) => !byId.has(id));
  if (unknown.length) {
    console.error(
      `catalog-specs: --only names ${unknown.length} id(s) the catalog does not ship: ${unknown.join(', ')}.\n` +
        '  A typo, or a design renamed or removed since the scope was derived - and a removal is a\n' +
        '  catalog-wide change, so run without --only. Re-derive with `npm run catalog:affected`.',
    );
    process.exit(2);
  }
  env.NOACG_ONLY_DESIGNS = only.join(',');
  // The categories the scoped designs live in, so a per-category test unit can skip before it
  // boots the app rather than booting it to find nothing to measure. Derived here, never typed:
  // a category left out would silently drop every design in it.
  env.NOACG_ONLY_CATEGORIES = [...new Set(only.map((id) => byId.get(id)))].join(',');
  console.log(`catalog-specs: scoped to ${only.length} design(s) in ${env.NOACG_ONLY_CATEGORIES.split(',').length} categor(y|ies).`);
}

const runs = [
  { name: 'catalog gate', args: ['playwright', 'test', '--config=playwright.catalog.config.ts', ...passthrough] },
  { name: 'catalog baseline', args: ['playwright', 'test', 'catalog-baseline', ...passthrough] },
];

let status = 0;
for (const run of runs) {
  console.log(`\n=== ${run.name} ===`);
  // Both run even when the first goes red: the second's verdict is information worth having, and
  // skipping it would turn one red run into two round trips. The FIRST failure's status is what
  // this command reports - a passing second run must never green over a failing first.
  const code = spawnSync('npx', run.args, { stdio: 'inherit', shell: true, cwd: REPO, env, windowsHide: true }).status ?? 1;
  if (code !== 0 && status === 0) status = code;
}
process.exit(status);
