#!/usr/bin/env node
// cicd-followup cf14: which landings reach the catalog calibration gate, before and after the #1862
// mappings (the three CENTRAL entries cf14 added to scripts/e2e-affected.mjs).
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf14-replay.mjs [--since 2026-10-24] [--json]
//
// For every first-parent merge on origin/main since the date, it replays today's planner (`planFor`,
// as a pull request's plan job calls it: the shared-change set on, today's headers, reach and
// traced map) on the files that merge changed (first parent to merge commit), twice: once with
// CENTRAL as it is, once without the cf14 entries. Everything else is the same code, so a landing
// that differs differs because of those entries alone. Needs the merges in the local clone
// (git fetch --shallow-since=2026-10-20 origin main). Reads no API.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CENTRAL, checkoutCatalogReach, helperImporters, planFor } from '../../../../scripts/e2e-affected.mjs';
import { specFilesOnDisk } from '../../../../scripts/e2e-durations.mjs';
import { readTracedMap } from '../../../../scripts/e2e-traced.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const at = process.argv.indexOf('--since');
const since = at > 0 ? process.argv[at + 1] : '2026-10-24';

const CF14 = /companion-module|benchmarks\\\/harness|endurance/;
const cf14Entries = CENTRAL.filter(([r]) => CF14.test(r.source));
if (cf14Entries.length !== 3) throw new Error(`expected the three cf14 CENTRAL entries, found ${cf14Entries.length}`);

const opts = { sprintFocus: true, specsOnDisk: specFilesOnDisk(), traced: readTracedMap(), catalogReach: checkoutCatalogReach() };
const helpers = helperImporters();
const plan = (changed) => planFor(changed, { ...opts, helpers: changed.some((f) => /^e2e\/_/.test(f)) ? helpers : null });
const without = (fn) => {
  const kept = CENTRAL.splice(0, CENTRAL.length);
  CENTRAL.push(...kept.filter((e) => !cf14Entries.includes(e)));
  try { return fn(); } finally { CENTRAL.splice(0, CENTRAL.length, ...kept); }
};

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const merges = git('log', '--first-parent', `--since=${since}`, '--format=%H %cI %s', 'origin/main').trim().split('\n');
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
  const before = without(() => plan(changed));
  rows.push({ sha: sha.slice(0, 8), when, pr: /#(\d+)/.exec(subject.join(' '))?.[1] ?? null, before: before.catalog, after: after.catalog, focusBefore: before.focusApplied, focusAfter: after.focusApplied });
}

const n = rows.filter((r) => !r.missing).length;
const count = (k) => rows.filter((r) => r[k]).length;
const dropped = rows.filter((r) => r.before && !r.after);
const raised = rows.filter((r) => !r.before && r.after);
const summary = {
  since, landings: n, missing: rows.length - n,
  catalogBefore: count('before'), catalogAfter: count('after'),
  focusBefore: count('focusBefore'), focusAfter: count('focusAfter'),
  dropped: dropped.map((r) => `${r.sha} #${r.pr}`), raised: raised.map((r) => `${r.sha} #${r.pr}`),
};
console.log(JSON.stringify(process.argv.includes('--json') ? { summary, rows } : summary, null, 1));
if (raised.length) process.exitCode = 1; // a mapping can only take the gate away from a change that cannot move a design
