#!/usr/bin/env node
// THE QUARANTINE: specs that failed and then passed on the same commit, kept out of the blocking
// plan and watched until they have earned their way back.
//
//   node scripts/e2e-quarantine.mjs list
//   node scripts/e2e-quarantine.mjs enter <spec...> --run <url> [--queue]
//   node scripts/e2e-quarantine.mjs enter --from-json '["e2e/x.spec.ts"]' --run <url> --queue
//   node scripts/e2e-quarantine.mjs release <spec> [--queue]
//   node scripts/e2e-quarantine.mjs release-due [--queue]     # reads main's run history
//
// WHY A FILE AND NOT A TABLE IN A DOC. docs/CI_STABILITY.md kept a flake table by hand, with the
// rule that a row needs a re-run-green receipt on the same sha. Nothing read the table, so a spec
// in it still turned main red and still stopped the queue, and the receipt was a person's
// screenshot. This file is the same rule made mechanical (docs/WORKFLOW_ARCHITECTURE.md §5.1,
// phase 1c): ci.yml re-runs the failed specs of a red main run once on the same commit, and a
// fail-then-pass IS the receipt - the gate writes the entry here through the merge queue, so the
// history shows who quarantined what, from which run, and the change went through the same door
// as every other. `scripts/e2e-affected.mjs` reads it: a quarantined spec leaves the blocking
// shards and runs in its own non-blocking job on main, one job per spec so each has its own
// verdict in the run history; `release-due` reads that history and queues the release after
// RELEASE_AFTER consecutive passes. A spec stays out of quarantine only by passing, never by
// somebody forgetting it was there.
//
// Identity is the repo-relative path (`e2e/anim-engine.spec.ts`), the same string the failure set
// and the annotations use; `planIdentity` turns it into the bare name the planner keys on.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { branchExistsOnOrigin, configureBotIdentity, openPullRequestFor, queuePullRequest, spawnRunner } from './queue-pr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STORE_PATH = path.join(ROOT, 'e2e', 'quarantine.json');
export const STORE_VERSION = 1;

/** Consecutive passes on main after which a spec leaves quarantine. */
export const RELEASE_AFTER = 20;

/** How many main runs to read when counting passes: enough to hold RELEASE_AFTER plus skipped ones. */
const HISTORY_RUNS = 40;

const COMMENT =
  'Specs that failed and then passed on the same commit (scripts/e2e-quarantine.mjs). ' +
  'They run in their own non-blocking job on main and leave after RELEASE_AFTER consecutive passes. ' +
  'Entries are written by ci.yml through the merge queue; edit by hand only to release early.';

export function emptyStore() {
  return { $comment: COMMENT, version: STORE_VERSION, specs: {}, released: {} };
}

/** Read the store; a missing file is an empty store, a newer version is refused rather than misread. */
export function readStore(file = STORE_PATH) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return emptyStore();
  }
  const parsed = JSON.parse(text);
  if (parsed.version !== STORE_VERSION) {
    throw new Error(`e2e/quarantine.json is version ${parsed.version}; this build reads version ${STORE_VERSION}`);
  }
  return { ...emptyStore(), ...parsed, specs: parsed.specs ?? {}, released: parsed.released ?? {} };
}

/** Serialize with sorted keys, so two entries made on two branches diff as two lines, not a rewrite. */
export function serializeStore(store) {
  const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  const out = { $comment: COMMENT, version: STORE_VERSION, specs: sortKeys(store.specs ?? {}), released: sortKeys(store.released ?? {}) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function writeStore(store, file = STORE_PATH) {
  writeFileSync(file, serializeStore(store));
}

/** The quarantined specs, as repo-relative paths, sorted. */
export function quarantinedSpecs(store) {
  return Object.keys(store.specs ?? {}).sort();
}

/** `e2e/anim-engine.spec.ts` -> `anim-engine.spec.ts`, the name the planner and the durations table key on. */
export function planIdentity(spec) {
  return String(spec).replaceAll('\\', '/').replace(/^e2e\//, '');
}

/** The other direction: a planner name back to the store's identity. */
export function specPath(name) {
  const clean = String(name).replaceAll('\\', '/');
  return clean.startsWith('e2e/') ? clean : `e2e/${clean}`;
}

/** The job name ci.yml gives one quarantined spec's run; `passHistory` finds the job by it. */
export function quarantineJobName(spec) {
  return `E2E quarantine (${spec})`;
}

/**
 * Put specs into quarantine. A spec already there is left as it is (its entry is the record of
 * the run that first caught it); a spec that has been here before comes back with its count up
 * by one, so a repeat offender is visible as one.
 *
 * @returns {{ store: object, entered: string[] }}
 */
export function enter(store, specs, { date = today(), run = '' } = {}) {
  const next = { ...store, specs: { ...store.specs }, released: { ...store.released } };
  const entered = [];
  for (const raw of specs) {
    const spec = specPath(raw);
    if (next.specs[spec]) continue;
    const before = next.released[spec];
    next.specs[spec] = { since: date, count: (before?.count ?? 0) + 1, run };
    delete next.released[spec];
    entered.push(spec);
  }
  return { store: next, entered };
}

/** Take a spec out of quarantine, remembering how many times it has been in. */
export function release(store, spec, { date = today() } = {}) {
  const key = specPath(spec);
  const entry = store.specs?.[key];
  if (!entry) return { store, released: false };
  const next = { ...store, specs: { ...store.specs }, released: { ...store.released } };
  delete next.specs[key];
  next.released[key] = { count: entry.count, last: date };
  return { store: next, released: true };
}

/**
 * Consecutive passes, newest first. A run where the spec did not run (null) is neither a pass
 * nor a failure and is skipped; the first failure ends the streak.
 * @param {Array<'success'|'failure'|null>} results
 */
export function consecutivePasses(results) {
  let n = 0;
  for (const r of results) {
    if (r === null || r === undefined) continue;
    if (r === 'success') n += 1;
    else break;
  }
  return n;
}

/** Which quarantined specs have earned their release, given each spec's history newest first. */
export function dueForRelease(store, historyOf, threshold = RELEASE_AFTER) {
  return quarantinedSpecs(store).filter((spec) => consecutivePasses(historyOf(spec)) >= threshold);
}

/**
 * The verdicts of one spec's quarantine job over main's recent runs, newest first.
 *
 * The job runs with `continue-on-error`, which keeps the RUN green; the job's own conclusion is
 * still what it found. `success` and `failure` are the two answers; anything else (the job did
 * not run because the spec was not yet quarantined, a run cancelled, a step skipped) is null.
 */
export function passHistory({ repo, spec, gh, limit = HISTORY_RUNS, need = RELEASE_AFTER }) {
  const runs = gh([`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=${limit}`, '--jq', '.workflow_runs[] | {id, conclusion}']);
  const wanted = quarantineJobName(spec);
  const results = [];
  let answered = 0;
  for (const run of runs) {
    if (answered >= need) break;
    const jobs = gh([`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`, '--jq', '.jobs[] | {name, conclusion}']);
    const job = jobs.find((j) => j?.name === wanted);
    const verdict = job?.conclusion === 'success' ? 'success' : ['failure', 'timed_out'].includes(job?.conclusion) ? 'failure' : null;
    results.push(verdict);
    if (verdict !== null) answered += 1;
  }
  return results;
}

/** `gh api ... --jq` prints one JSON value per line; unreadable output is no answer, not a crash. */
export function ghJsonLines(args) {
  const res = spawnSync('gh', ['api', ...args], { encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) return [];
  return String(res.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** A short stable slug for a branch name. */
export function slugOf(specs) {
  const joined = [...specs].sort().join(',');
  let h = 0;
  for (const ch of joined) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Commit a store change on a fresh branch off origin/main and queue it. Returns the pull request,
 * or `{ skipped: reason }` when the branch is already queued.
 */
export function queueStoreChange({ branch, title, body, mechanism, runUrl, mutate, git = spawnRunner('git'), gh = spawnRunner('gh'), file = STORE_PATH }) {
  if (branchExistsOnOrigin(branch, git)) {
    const pr = openPullRequestFor(branch, gh);
    return { skipped: `already queued as ${pr?.url ?? `origin/${branch}`}` };
  }
  git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const base = git(['rev-parse', 'refs/remotes/origin/main']).out;
  git(['checkout', '-q', '-B', branch, base]);
  const store = readStore(file);
  const next = mutate(store);
  writeStore(next, file);
  configureBotIdentity(git);
  git(['add', path.relative(ROOT, file).replaceAll('\\', '/')]);
  git(['commit', '-q', '-m', title, '-m', body]);
  return queuePullRequest({ branch, title, body, mechanism, runUrl, diffBase: base, git, gh });
}

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(a, next);
        i += 1;
      } else flags.set(a, true);
    } else positional.push(a);
  }
  return { command: positional[0], rest: positional.slice(1), flags };
}

function main(argv) {
  const { command, rest, flags } = parseArgs(argv);
  const queue = flags.has('--queue');
  const runUrl = String(flags.get('--run') ?? '');
  const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? '';

  if (command === 'list') {
    const store = readStore();
    const specs = quarantinedSpecs(store);
    if (specs.length === 0) console.log('quarantine: empty.');
    for (const spec of specs) {
      const e = store.specs[spec];
      console.log(`${spec}  since ${e.since}  count ${e.count}${e.run ? `  ${e.run}` : ''}`);
    }
    return 0;
  }

  if (command === 'enter') {
    const specs = flags.has('--from-json') ? JSON.parse(String(flags.get('--from-json'))) : rest;
    if (!Array.isArray(specs) || specs.length === 0) {
      console.error('enter: name at least one spec, or pass --from-json \'["e2e/x.spec.ts"]\'.');
      return 2;
    }
    const date = String(flags.get('--date') ?? today());
    const local = enter(readStore(), specs, { date, run: runUrl });
    const { entered } = local;
    if (entered.length === 0) {
      console.log(`quarantine: ${specs.join(', ')} already quarantined - nothing to write.`);
      return 0;
    }
    if (!queue) {
      writeStore(local.store);
      console.log(`quarantine: entered ${entered.join(', ')} (written locally; commit it or use --queue).`);
      return 0;
    }
    const title = `Quarantine ${entered.length === 1 ? entered[0] : `${entered.length} specs`} after a fail-then-pass on one commit`;
    const body = [
      `${entered.join(', ')} failed in the blocking shards and passed when re-run on the same commit`,
      `(${runUrl || 'run url unknown'}), which is the receipt a flake needs. From now on ${entered.length === 1 ? 'it runs' : 'they run'}`,
      `in main's non-blocking quarantine job and ${entered.length === 1 ? 'leaves' : 'leave'} after ${RELEASE_AFTER} consecutive passes.`,
    ].join('\n');
    const result = queueStoreChange({
      branch: `quarantine/enter-${date}-${slugOf(entered)}`,
      title,
      body,
      mechanism: `quarantine entry for ${entered.join(', ')}`,
      runUrl,
      mutate: (store) => enter(store, entered, { date, run: runUrl }).store,
    });
    console.log(result.skipped ? `quarantine: ${result.skipped}` : `quarantine: queued ${result.url}`);
    return 0;
  }

  if (command === 'release') {
    const spec = rest[0];
    if (!spec) {
      console.error('release: name the spec.');
      return 2;
    }
    return releaseSpecs([specPath(spec)], { queue, runUrl, reason: 'released by hand' });
  }

  if (command === 'release-due') {
    const store = readStore();
    if (quarantinedSpecs(store).length === 0) {
      console.log('quarantine: empty - nothing to release.');
      return 0;
    }
    if (!repo) {
      console.error('release-due: GH_REPO (or GITHUB_REPOSITORY) must name the repository to read run history from.');
      return 2;
    }
    const histories = new Map();
    for (const spec of quarantinedSpecs(store)) {
      const history = passHistory({ repo, spec, gh: ghJsonLines });
      histories.set(spec, history);
      console.log(`${spec}: ${consecutivePasses(history)} consecutive pass(es) of ${RELEASE_AFTER} needed`);
    }
    const due = dueForRelease(store, (spec) => histories.get(spec) ?? []);
    if (due.length === 0) {
      console.log('quarantine: nothing due for release.');
      return 0;
    }
    return releaseSpecs(due, { queue, runUrl, reason: `${RELEASE_AFTER} consecutive passes on main` });
  }

  console.error('usage: e2e-quarantine.mjs list | enter <spec...> --run <url> [--queue] | release <spec> [--queue] | release-due [--queue]');
  return 2;
}

function releaseSpecs(specs, { queue, runUrl, reason }) {
  const date = today();
  if (!queue) {
    let store = readStore();
    for (const spec of specs) store = release(store, spec, { date }).store;
    writeStore(store);
    console.log(`quarantine: released ${specs.join(', ')} (written locally; commit it or use --queue).`);
    return 0;
  }
  const title = `Release ${specs.length === 1 ? specs[0] : `${specs.length} specs`} from quarantine`;
  const body = `${specs.join(', ')}: ${reason}. Back in the blocking plan from this landing on.`;
  const result = queueStoreChange({
    branch: `quarantine/release-${date}-${slugOf(specs)}`,
    title,
    body,
    mechanism: `quarantine release for ${specs.join(', ')}`,
    runUrl,
    mutate: (store) => specs.reduce((s, spec) => release(s, spec, { date }).store, store),
  });
  console.log(result.skipped ? `quarantine: ${result.skipped}` : `quarantine: queued ${result.url}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
