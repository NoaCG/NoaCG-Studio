#!/usr/bin/env node
// THE QUARANTINE: specs that failed and then passed on the same commit, kept out of the blocking
// plan and watched until they have earned their way back.
//
//   node scripts/e2e-quarantine.mjs list
//   node scripts/e2e-quarantine.mjs enter <spec...> --run <url> [--queue]
//   node scripts/e2e-quarantine.mjs enter --from-json '["e2e/x.spec.ts"]' --run <url> --queue
//   node scripts/e2e-quarantine.mjs release <spec> [--queue]
//   node scripts/e2e-quarantine.mjs release-due [--queue]     # reads main's status history
//   node scripts/e2e-quarantine.mjs matrix                    # quarantine.yml's job list, as JSON
//   node scripts/e2e-quarantine.mjs filter <spec>             # the Playwright filter for one spec
//   node scripts/e2e-quarantine.mjs status <spec> <outcome> --run <url>   # post one verdict
//
// WHY A FILE AND NOT A TABLE IN A DOC. docs/CI_STABILITY.md kept a flake table by hand, with the
// rule that a row needs a re-run-green receipt on the same sha. Nothing read the table, so a spec
// in it still turned main red and still stopped the queue, and the receipt was a person's
// screenshot. This file is the same rule made mechanical (docs/WORKFLOW_ARCHITECTURE.md §5.1,
// phase 1c): ci.yml re-runs the failed specs of a red main run once on the same commit, and a
// fail-then-pass IS the receipt - the gate writes the entry here through the merge queue, so the
// history shows who quarantined what, from which run, and the change went through the same door
// as every other. `scripts/e2e-affected.mjs` reads it: a quarantined spec leaves the blocking
// shards, and `quarantine.yml` runs it on every push to main in its own job, which posts the
// verdict as the commit status `noacg/quarantine/<spec>` on that commit (the `status` command
// here, so the string is written and read by one file) - a status is read the same way whatever
// GitHub does with a job's conclusion, and one status call per commit answers for every
// quarantined spec at once. `release-due` reads those statuses newest first and queues the
// release after RELEASE_AFTER consecutive passes. A spec stays out of quarantine only by passing,
// never by somebody forgetting it was there.
//
// Identity is the repo-relative path (`e2e/anim-engine.spec.ts`), the same string the failure set
// and the annotations use; scripts/e2e-spec-names.mjs converts to the planner's bare name.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ghJsonLines, mainPushRuns } from './ci-failure-set.mjs';
import { planIdentity, specFilterArg, specPath } from './e2e-spec-names.mjs';
import { alreadyQueued, configureBotIdentity, queuePullRequest, spawnRunner } from './queue-pr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STORE_PATH = path.join(ROOT, 'e2e', 'quarantine.json');
export const STORE_VERSION = 1;

/** Consecutive passes on main after which a spec leaves quarantine. */
export const RELEASE_AFTER = 20;

/** How many main commits to read when counting passes: enough to hold RELEASE_AFTER plus skipped ones. */
const HISTORY_RUNS = 40;

/** The commit status one quarantined spec's run posts (quarantine.yml, through `status` below). */
export function statusContext(spec) {
  return `noacg/quarantine/${specPath(spec)}`;
}

const COMMENT =
  'Specs that failed and then passed on the same commit (scripts/e2e-quarantine.mjs). ' +
  'They run in quarantine.yml on every push to main and leave after RELEASE_AFTER consecutive passes. ' +
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
  const out = { ...emptyStore(), specs: sortKeys(store.specs ?? {}), released: sortKeys(store.released ?? {}) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

function writeStore(store, file = STORE_PATH) {
  writeFileSync(file, serializeStore(store));
}

/** The quarantined specs, as repo-relative paths, sorted. */
export function quarantinedSpecs(store) {
  return Object.keys(store.specs ?? {}).sort();
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

/** Take a spec out of quarantine, remembering how many times it has been in and when it last left. */
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
 * Consecutive passes, newest first. A commit where the spec did not run (null) is neither a pass
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
 * The verdicts of every quarantined spec over main's recent commits, newest first, as a map
 * spec -> results. One combined-status call per commit answers for all specs (the endpoint holds
 * the latest state per context, so a reposted status cannot shadow the verdict): quarantine.yml
 * posts `noacg/quarantine/<spec>` as `success` or `failure`, and a commit with no status for a
 * spec (it was not yet quarantined, or the run never got there) is null for it.
 */
export function passHistories({ repo, specs, gh = ghJsonLines, limit = HISTORY_RUNS, need = RELEASE_AFTER }) {
  const histories = new Map(specs.map((spec) => [spec, []]));
  const answered = new Map(specs.map((spec) => [spec, 0]));
  for (const run of mainPushRuns({ repo, workflow: 'quarantine.yml', limit, gh })) {
    if ([...answered.values()].every((n) => n >= need)) break;
    const statuses = gh([`repos/${repo}/commits/${run.head_sha}/status`, '--jq', '.statuses[] | {context, state}']);
    for (const spec of specs) {
      const status = statuses.find((s) => s?.context === statusContext(spec));
      const verdict = status?.state === 'success' ? 'success' : status?.state === 'failure' || status?.state === 'error' ? 'failure' : null;
      histories.get(spec).push(verdict);
      if (verdict !== null) answered.set(spec, answered.get(spec) + 1);
    }
  }
  return histories;
}

function today(now = new Date()) {
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
 * Commit a store change on a fresh branch off origin/main and queue it. `mutate` returns the next
 * store; a store that comes back unchanged is a landing that already happened (the same spec was
 * entered or released by an earlier run), reported and not committed. Returns the pull request,
 * or `{ skipped: reason }`.
 */
export function queueStoreChange({ branch, title, body, mechanism, runUrl, mutate, git = spawnRunner('git'), gh = spawnRunner('gh'), file = STORE_PATH }) {
  const state = alreadyQueued(branch, git, gh);
  if (state.state === 'open') return { skipped: `already queued as ${state.pr.url}` };
  if (state.state === 'closed') return { skipped: `${state.pr.url} was closed without merging - a person said no` };
  git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const base = git(['rev-parse', 'refs/remotes/origin/main']).out;
  git(['checkout', '-q', '-B', branch, base]);
  const store = readStore(file);
  const next = mutate(store);
  if (serializeStore(next) === serializeStore(store)) {
    git(['checkout', '-q', base], { allowFailure: true });
    return { skipped: 'origin/main already holds this change' };
  }
  writeStore(next, file);
  configureBotIdentity(git);
  git(['add', path.relative(ROOT, file).replaceAll('\\', '/')]);
  git(['commit', '-q', '-m', title, '-m', body]);
  return queuePullRequest({ branch, title, body, mechanism, runUrl, diffBase: base, force: state.state === 'stale-branch', git, gh });
}

/** `--flag value` pairs, bare `--flag`s, and the rest positional. Shared with the retry's CLI. */
export function parseArgs(argv) {
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

/**
 * One store change, locally or through the queue: `mutate` is the change, `done` says what it did
 * to the store at this commit (so a no-op is reported rather than committed), and the branch,
 * title and body are the landing's. Returns the exit code.
 */
function applyStoreChange({ queue, branch, title, body, mechanism, runUrl, mutate, describe }) {
  if (!queue) {
    const before = readStore();
    const after = mutate(before);
    if (serializeStore(after) === serializeStore(before)) {
      console.log(`quarantine: ${describe} - already so, nothing to write.`);
      return 0;
    }
    writeStore(after);
    console.log(`quarantine: ${describe} (written locally; commit it or use --queue).`);
    return 0;
  }
  const result = queueStoreChange({ branch, title, body, mechanism, runUrl, mutate });
  console.log(result.skipped ? `quarantine: ${result.skipped}` : `quarantine: queued ${result.url}`);
  return 0;
}

function releaseSpecs(specs, { queue, runUrl, reason }) {
  const date = today();
  return applyStoreChange({
    queue,
    branch: `quarantine/release-${date}-${slugOf(specs)}`,
    title: `Release ${specs.length === 1 ? specs[0] : `${specs.length} specs`} from quarantine`,
    body: `${specs.join(', ')}: ${reason}. Back in the blocking plan from this landing on.`,
    mechanism: `quarantine release for ${specs.join(', ')}`,
    runUrl,
    mutate: (store) => specs.reduce((s, spec) => release(s, spec, { date }).store, store),
    describe: `released ${specs.join(', ')}`,
  });
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
    for (const [spec, e] of Object.entries(store.released ?? {})) console.log(`released: ${spec}  last ${e.last}  count ${e.count}`);
    return 0;
  }

  if (command === 'matrix') {
    process.stdout.write(`${JSON.stringify(quarantinedSpecs(readStore()))}\n`);
    return 0;
  }

  if (command === 'filter') {
    if (!rest[0]) {
      console.error('filter: name the spec.');
      return 2;
    }
    console.log(specFilterArg(planIdentity(rest[0])));
    return 0;
  }

  if (command === 'status') {
    // quarantine.yml's verdict for one spec on the commit under test: `success` and `failure` are
    // the two answers, anything else (a cancelled step) is `error`, which the history reads as no
    // verdict. GH_TOKEN, GITHUB_REPOSITORY and GITHUB_SHA come from the workflow.
    const [spec, outcome] = rest;
    const sha = process.env.GITHUB_SHA ?? '';
    if (!spec || !outcome || !repo || !sha) {
      console.error('status: needs <spec> <outcome> and GITHUB_REPOSITORY + GITHUB_SHA in the environment.');
      return 2;
    }
    const state = outcome === 'success' ? 'success' : outcome === 'failure' ? 'failure' : 'error';
    const description = state === 'error' ? `no verdict (${outcome})` : `${state === 'success' ? 'passed' : 'failed'} in quarantine`;
    const gh = spawnRunner('gh');
    gh(['api', `repos/${repo}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${statusContext(spec)}`, '-f', `description=${description}`, ...(runUrl ? ['-f', `target_url=${runUrl}`] : [])]);
    console.log(`::notice title=Quarantine::${specPath(spec)}: ${description}`);
    return 0;
  }

  if (command === 'enter') {
    const specs = flags.has('--from-json') ? JSON.parse(String(flags.get('--from-json'))) : rest;
    if (!Array.isArray(specs) || specs.length === 0) {
      console.error('enter: name at least one spec, or pass --from-json \'["e2e/x.spec.ts"]\'.');
      return 2;
    }
    const date = today();
    const targets = specs.map(specPath);
    const one = targets.length === 1;
    return applyStoreChange({
      queue,
      branch: `quarantine/enter-${date}-${slugOf(targets)}`,
      title: `Quarantine ${one ? targets[0] : `${targets.length} specs`} after a fail-then-pass on one commit`,
      body: [
        `${targets.join(', ')} failed in the blocking shards and passed when re-run on the same commit`,
        `(${runUrl || 'run url unknown'}), which is the receipt a flake needs. From now on ${one ? 'it runs' : 'they run'}`,
        `in quarantine.yml on every push to main and ${one ? 'leaves' : 'leave'} after ${RELEASE_AFTER} consecutive passes.`,
      ].join('\n'),
      mechanism: `quarantine entry for ${targets.join(', ')}`,
      runUrl,
      mutate: (store) => enter(store, targets, { date, run: runUrl }).store,
      describe: `entered ${targets.join(', ')}`,
    });
  }

  if (command === 'release') {
    if (!rest[0]) {
      console.error('release: name the spec.');
      return 2;
    }
    return releaseSpecs([specPath(rest[0])], { queue, runUrl, reason: 'released by hand' });
  }

  if (command === 'release-due') {
    const store = readStore();
    const specs = quarantinedSpecs(store);
    if (specs.length === 0) {
      console.log('quarantine: empty - nothing to release.');
      return 0;
    }
    if (!repo) {
      console.error('release-due: GH_REPO (or GITHUB_REPOSITORY) must name the repository to read status history from.');
      return 2;
    }
    const histories = passHistories({ repo, specs });
    for (const spec of specs) console.log(`${spec}: ${consecutivePasses(histories.get(spec))} consecutive pass(es) of ${RELEASE_AFTER} needed`);
    const due = dueForRelease(store, (spec) => histories.get(spec) ?? []);
    if (due.length === 0) {
      console.log('quarantine: nothing due for release.');
      return 0;
    }
    return releaseSpecs(due, { queue, runUrl, reason: `${RELEASE_AFTER} consecutive passes on main` });
  }

  console.error('usage: e2e-quarantine.mjs list | matrix | filter <spec> | status <spec> <outcome> --run <url> | enter <spec...> --run <url> [--queue] | release <spec> [--queue] | release-due [--queue]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
