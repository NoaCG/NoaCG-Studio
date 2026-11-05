#!/usr/bin/env node
// cicd-followup cf14: which landings reach the catalog calibration gate, before and after the #1862
// mappings (the three CENTRAL entries cf14 added to scripts/e2e-affected.mjs).
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf14-replay.mjs [--since 2026-10-24] [--json]
//
// For every first-parent merge on origin/main since the date, it replays today's planner (`planFor`,
// as a pull request's plan job calls it: the shared-change set on, today's headers, reach and
// traced map) on the files that merge changed (first parent to merge commit), twice: once with
// CENTRAL as it is, once without the cf14 entries (planFor's `central` option). Everything else is
// the same code, so a landing that differs differs because of those entries alone. Needs the
// merges in the local clone (git fetch --shallow-since=2026-10-20 origin main). Reads no API.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CENTRAL, checkoutCatalogReach, helperImporters, planFor } from '../../../../scripts/e2e-affected.mjs';
import { specFilesOnDisk } from '../../../../scripts/e2e-durations.mjs';
import { readTracedMap } from '../../../../scripts/e2e-traced.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const at = process.argv.indexOf('--since');
const since = at > 0 ? process.argv[at + 1] : '2026-10-24';

// The three entries cf14 added, by their exact source: a reworded entry stops the replay.
const CF14_SOURCES = ['^companion-module\\/', '^benchmarks\\/harness\\/', String.raw`^(e2e\/(endurance|instruments)\/(?!.*\.(spec|test)\.[cm]?[jt]sx?$)|playwright\.(endurance|instrument)\.config\.ts$)`];
const cf14Entries = CENTRAL.filter(([r]) => CF14_SOURCES.includes(r.source));
if (cf14Entries.length !== CF14_SOURCES.length) throw new Error(`expected the ${CF14_SOURCES.length} cf14 CENTRAL entries, found ${cf14Entries.length}`);
const before = CENTRAL.filter((e) => !cf14Entries.includes(e));

const opts = { sprintFocus: true, specsOnDisk: specFilesOnDisk(), traced: readTracedMap(), catalogReach: checkoutCatalogReach() };
const helpers = helperImporters();
const plan = (changed, central = CENTRAL) => planFor(changed, { ...opts, central, helpers: changed.some((f) => /^e2e\/_/.test(f)) ? helpers : null });

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const merges = git('log', '--first-parent', `--since=${since}`, '--format=%H %cI %s', 'origin/main').split('\n').filter(Boolean);
const rows = [];
for (const line of merges) {
  const [sha, when, ...subject] = line.split(' ');
  let changed;
  try {
    changed = git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean);
  } catch {
    rows.push({ sha: sha.slice(0, 8), missing: true });
    continue;
  }
  const after = plan(changed);
  const old = plan(changed, before);
  rows.push({ sha: sha.slice(0, 8), when, pr: (/^Merge pull request #(\d+)/.exec(subject.join(' ')) ?? /\(#(\d+)\)$/.exec(subject.join(' ')))?.[1] ?? null, before: old.catalog, after: after.catalog, focusBefore: old.focusApplied, focusAfter: after.focusApplied, specsChanged: old.specs.join() !== after.specs.join() });
}

const n = rows.filter((r) => !r.missing).length;
const count = (k) => rows.filter((r) => r[k]).length;
const dropped = rows.filter((r) => r.before && !r.after);
const raised = rows.filter((r) => !r.before && r.after);
const summary = {
  since, landings: n, missing: rows.length - n,
  catalogBefore: count('before'), catalogAfter: count('after'),
  focusBefore: count('focusBefore'), focusAfter: count('focusAfter'), specsChanged: rows.filter((r) => r.specsChanged).map((r) => `${r.sha} #${r.pr}`),
  dropped: dropped.map((r) => `${r.sha} #${r.pr}`), raised: raised.map((r) => `${r.sha} #${r.pr}`),
};
console.log(JSON.stringify(process.argv.includes('--json') ? { summary, rows } : summary, null, 1));
if (raised.length) process.exitCode = 1; // a mapping can only take the gate away from a change that cannot move a design
