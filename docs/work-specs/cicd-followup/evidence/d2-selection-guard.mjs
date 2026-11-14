#!/usr/bin/env node
// THE d2 SELECTION GUARD (plan run #1967, land-trim-3, step d2; the coordinator's condition b).
//
//   node docs/work-specs/cicd-followup/evidence/d2-selection-guard.mjs \
//     --build-traces <dir> --dev-traces <dir> --since <YYYY-MM-DD> [--previous <ref>]
//
// From PR #2530 on, the traced spec map is recorded on the e2e build instead of the dev server. The
// switch was accepted on the condition that real changes never select fewer specs under the build
// map than under the dev-server map. This re-checks it on the SAME commit: a build nightly and a
// dev-server nightly of it (`gh workflow run nightly.yml -f full_e2e=true -f dev_server=true`),
// each downloaded as its `nightly-trace-*` artifacts (one directory each, holding the shards'
// trace.json files at any depth).
//
// Both are merged over the same previous map (scripts/e2e-traced.json at `--previous`, default
// origin/main) exactly as the nightly merges them. Then every src/ file changed by the merges into
// origin/main since `--since` is planned alone with each map. A file whose build-map plan leaves
// out a spec its dev-map plan selects is printed, and the exit code is 1: an alarm for the owner and
// a revert candidate for #2530.
//
// WHY THE SAME COMMIT. The dev map is not stable night to night, and it follows code changes:
// between two consecutive dev nightlies (c46c222a and c92910f4, both before #2530) 5 of 136
// changed files already selected fewer specs, src/control/liveData.ts going from 126 to 85. Maps
// from different nights cannot tell the tracing method from the code.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { planFor } from '../../../../scripts/e2e-affected.mjs';
import { mergeTraces, tracedFrom } from '../../../../scripts/e2e-traced.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`--${name} is required`);
  return value;
};
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Every trace.json under a directory, as parsed shard traces. */
function shards(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'trace.json') out.push(JSON.parse(readFileSync(p, 'utf8')));
    }
  };
  walk(dir);
  if (out.length === 0) throw new Error(`no trace.json under ${dir}`);
  return out;
}

const previous = JSON.parse(git('show', `${arg('previous', 'origin/main')}:scripts/e2e-traced.json`));
const specsOnDisk = readdirSync('e2e').filter((f) => f.endsWith('.spec.ts'));
const tracedAt = new Date().toISOString();
const mapOf = (dir, sha) => tracedFrom(mergeTraces(shards(dir), previous, { sha, tracedAt, specsOnDisk }));
const build = mapOf(arg('build-traces'), 'build');
const dev = mapOf(arg('dev-traces'), 'dev');

const merges = git('log', 'origin/main', '--merges', '--first-parent', `--since=${arg('since')}`, '--format=%H').trim().split('\n').filter(Boolean);
const files = new Set();
for (const merge of merges) {
  for (const file of git('diff', '--name-only', `${merge}^1`, merge).trim().split('\n')) {
    if (file.startsWith('src/') && existsSync(file)) files.add(file);
  }
}

let fewer = 0;
for (const file of [...files].sort()) {
  const old = planFor([file], { traced: dev, specsOnDisk });
  const now = planFor([file], { traced: build, specsOnDisk });
  if (now.mode === 'full') continue;
  const kept = new Set(now.specs);
  const lost = old.mode === 'full' ? ['(the whole suite)'] : old.specs.filter((s) => !kept.has(s));
  if (lost.length) {
    fewer += 1;
    console.log(`FEWER ${file}: dev map ${old.mode} ${old.specs.length} -> build map ${now.mode} ${now.specs.length}; lost ${lost.join(', ')}`);
  }
}
console.log(`d2 selection guard: ${merges.length} merge(s) since ${arg('since')}, ${files.size} src file(s) planned, ${fewer} select fewer specs on the build map`);
process.exit(fewer ? 1 : 0);
