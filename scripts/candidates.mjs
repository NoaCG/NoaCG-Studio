#!/usr/bin/env node
// WHICH CANDIDATE DOES THE REFILL LOOP LAUNCH NEXT - the whole per-tick refill decision in one
// command, over the planner's ordered candidate list (`orchestrator/night.md`, "The candidate
// list"; the refilling loop is change 1 of the 2026-09-05 review).
//
//   node scripts/candidates.mjs --plan <wave-state file>     # ordered verdicts + the next pick
//   node scripts/candidates.mjs --plan <path> --json
//
// WHY. Change 1 gave the loop two instruments - collision-check reads a candidate against the
// running rows' real diffs, wave-horizon says whether a unit of its size still fits - but the loop
// ran them per candidate by hand. This composes both over the `## Candidates` TABLE the planner
// writes (columns L, size, serves, TOUCHES, SPECS, goal, and an optional browser), so the refill
// pick is one command whose answer the loop confirms rather than a sequence the model drives. It
// launches nothing; it prints LAUNCH <letter> for the first candidate that is not already launched,
// is collision-clear, whose scarce slot is free, AND that fits the window, and HOLD for each one it
// passes with the reason.
//
// THE LEDGER IS THE LOOP'S MEMORY. A candidate with a launch record for this wave is held as
// already launched, whatever became of it: on 2026-09-05 the pick printed LAUNCH W twice in an
// hour with W's record already written, because nothing here read the ledger for identity - and a
// freshly launched row has no diff yet, so collision-check cannot tell it from an unstarted one.
//
// THE SCARCE SLOT. On the night of 2026-09-08 this instrument said LAUNCH for a browser row four
// times while another row held the one browser slot the machine has (root AGENTS.md: one
// browser-driving job per MACHINE). Neither instrument knows a resource - collision-check reads
// files and wave-horizon reads time - and the candidate table had nowhere to say a unit needs one.
// The job queue does NOT already settle this: it serializes SCRIPTED browser jobs (`npm run queue`,
// `COST.browser` in jobs-store), and every one of the four bad picks was a row driving the browser
// BY HAND - "reproduce in the running app", a rendered measurement - which no process table shows
// as a job. That is what the wave table's `browser` column has always meant (collisions.md: a
// browser-driving session costs a full slot), so the plan is the source here on purpose, and the
// cost of that choice is accepted: a row that drives the browser for one suite inside a four-hour
// row holds the slot for four hours. Two halves are needed and they come from different places:
//
//   - WHAT A CANDIDATE NEEDS is DERIVED from what the planner already writes: a candidate whose
//     SPECS column names an e2e spec is taken to need the browser. Inference is wrong in both
//     directions, so the direction is chosen on purpose: it FAILS CLOSED. A code-only row covered
//     by e2e specs is held while the browser is busy although it could have run (row O that night
//     was such a row), and the loop simply takes the next candidate and comes back to it when the
//     slot frees. The alternative, a column the planner must remember to fill, fails OPEN when a
//     cell is forgotten - which is the four bad picks again, silently. An optional `browser`
//     column overrides the derivation, and ONLY a cell starting with `yes` or `no` counts as the
//     planner's word (`browserWord`, shared with the plan check, which refuses any other spelling):
//     an empty cell or a dash derives, so a placeholder cannot fail open either. Combining the
//     two is better than either alone because they fail in opposite directions and the override
//     can only move a verdict from "held by inference" to "the planner's word"; the one open
//     failure left is a planner writing `no` on a row that drives the browser, which no
//     instrument can check any more than it can check a wrong TOUCHES.
//   - WHAT IS HELD is read from the rows that are RUNNING. A planned row holds the browser when the
//     wave table says `browser` yes or its MINTS names the browser slot; a launched candidate holds
//     it when the rule above says it needs it (so the third bad pick, a candidate launched into
//     the slot, is covered too). Running means launched in the ledger `wave-launch.mjs` keeps for
//     THIS wave, not landed, not in the queue, and its branch still existing - existence, not a
//     diff, because the first minutes after a launch are exactly when the bad picks happened. A
//     landing that gave up or was withdrawn leaves the row running: the session may be back at
//     work, and that is the closed direction. The ledger is what wave-horizon already reads, so a
//     launch nobody records is invisible to both instruments in the same way, and `launch.md`
//     already makes recording every launch the rule; the hold is exactly as good as that
//     recording, and the first day wave this met (2026-09-09) had recorded none of its rows. A
//     wave-table browser row due now with NO ledger record is printed as a caution rather than
//     held: a phantom hold that no landing can lift is the one closed failure that is not cheap,
//     so this is the one place the choice is loud-open, and the caution names the record command.
//
// WHICH WAVE A LEDGER LINE BELONGS TO. A record written by this build names its plan, and plans are
// matched by FILE NAME, not path: the store keeps one file per date and kind, the record's path is
// always the store's (`inStore` checks it), and the path the operator types can differ in drive
// letter case, slash direction or be a copy of the plan somewhere else - measured on this machine,
// `path.resolve` keeps the case, so a path comparison emptied the running set and failed OPEN. A
// name that matches a copy is still the same wave, which is the answer wanted. Records with no plan
// (every line before 2026-09-09) match by the wave's WINDOW instead - from local midnight of the
// date in the plan's name to its "Window ends" - which keeps last night's F, G, K, L, O, P out of a
// plan that reuses those letters; a day and a night plan of one date share that window's early
// hours, and for those legacy lines that ambiguity is accepted rather than guessed at.
//
// The pick respects the planner's ORDER and falls through: a standard unit at the top that no
// longer fits does not block a small one below it that does. Read-only, like the instruments it
// composes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collisions } from './collision-check.mjs';
import { scanActivity } from './worktree-activity.mjs';
import { horizon, landingLatency, parseWindowEnd } from './wave-horizon.mjs';
import { joinDurations, readLaunches, SIZES, statsBySize } from './wave-launch.mjs';
import { jobsDir, landingStateFor, readJobs, readLandings } from './jobs-store.mjs';
import { browserWord, mintsOf, parseWaveTable, tableUnder } from './wave-plan-check.mjs';
import { git, worktreeEntries } from './worktree-cleanup-lib.mjs';
import { newestWavePlan, WAVE_PLAN_MAX_AGE_MS } from './wave-tick.mjs';

/** A cell without its markdown: backticks and bold stripped, trimmed. */
const clean = (cell) => String(cell ?? '').replace(/[`*]/g, '').trim();

/** Split a table cell of comma/semicolon-separated tokens, dropping `-`, `none`, and empties. */
function cells(value) {
  return clean(value).split(/[,;]/).map((token) => token.trim())
    .filter((token) => token && token !== '-' && token.toLowerCase() !== 'none');
}

/**
 * The `## Candidates` table as rows { letter, size, serves, files, specs, goal, browser }. Any
 * heading containing "candidates" opens it; the header row names the columns, so order is not
 * assumed. `browser` is the optional column's cell, cleaned and lower-cased, empty when absent.
 */
export function parseCandidates(text) {
  const table = tableUnder(text, /^#{1,6}\s+.*\bcandidates\b/i);
  if (!table?.header) return [];
  const rows = [];
  for (const row of table.rows) {
    const letter = clean(row.letter);
    if (!/^[A-Z]{1,2}$/.test(letter)) continue;
    rows.push({
      letter,
      size: clean(row.size ?? 'standard').toLowerCase() || 'standard',
      serves: clean(row.serves),
      files: cells(row.touches),
      specs: cells(row.specs).map((spec) => spec.replace(/^e2e\//, '')),
      goal: clean(row.goal),
      browser: clean(row.browser).toLowerCase(),
    });
  }
  return rows;
}

/**
 * Does this candidate need the machine's browser slot? The planner's `yes`/`no` wins; anything else
 * derives from the SPECS column, and the derivation fails CLOSED (see the header). `source` says
 * which, so the printed reason can tell the planner how to override a hold it disagrees with.
 */
export function needsBrowser(candidate) {
  const word = browserWord(candidate.browser);
  if (word !== null) return { needs: word, source: 'column' };
  return { needs: (candidate.specs ?? []).length > 0, source: 'specs' };
}

/** A MINTS slot name that is the browser: `browser`, `the browser slot` - a whole token, so a
 *  path like `docs/browser-support.md` or a note reading `not the browser` mints nothing here. */
const BROWSER_MINT = /^(the\s+)?browser(\s+slot)?$/i;

/** Does a wave-table row hold the browser? Its `browser` column, or a MINTS token naming the slot. */
export function waveRowHoldsBrowser(row) {
  return browserWord(row.browser) === true || mintsOf(row.mints).some((mint) => BROWSER_MINT.test(clean(mint)));
}

/**
 * When this wave is: its plan's file name, the local midnight of the date in that name (null when
 * the name carries none) and its "Window ends" (null when the plan has none). What `belongsToWave`
 * reads, computed once.
 */
/**
 * The file name out of a path written on EITHER platform.
 *
 * `path.basename` splits on the separator of the platform it runs on, and this comparison reads
 * paths WRITTEN ON WINDOWS: the ledger stores what `--plan` was given, which on this machine is
 * `C:\...\wave-plans\<name>`. On Linux a backslash is an ordinary character there, so basename
 * hands back the whole string, the two sides never match, and the running set comes back empty -
 * the silent failure this comparison exists to prevent, moved one platform sideways. CI caught it
 * as a red test; the laptop would have caught it as a bad pick, eventually, with no message.
 *
 * Normalising first costs one replace and makes the answer identical everywhere, which is what a
 * per-machine ledger read by a cross-platform test needs.
 */
function planFileName(planPath) {
  return path.basename(String(planPath).replaceAll('\\', '/'));
}

export function waveSpan(planPath, text) {
  const name = planFileName(planPath);
  const dated = /^(\d{4}-\d{2}-\d{2})/.exec(name);
  const day = dated ? Date.parse(`${dated[1]}T00:00:00`) : NaN; // no offset = LOCAL, like the file's name
  return { name, startMs: Number.isFinite(day) ? day : null, endMs: parseWindowEnd(text) };
}

/** Is this ledger line one of this wave's launches? See the header, "which wave a ledger line
 *  belongs to". `record` carries `at` and `plan`; a joined row carries `launchedAt` and `plan`. */
export function belongsToWave(record, span, { now = Date.now() } = {}) {
  const at = record.at ?? record.launchedAt;
  if (record.plan) return planFileName(record.plan).toLowerCase() === span.name.toLowerCase();
  const end = span.endMs ?? now;
  const start = span.startMs ?? end - 2 * WAVE_PLAN_MAX_AGE_MS;
  return at >= start && at <= end;
}

/**
 * The rows RUNNING right now, as { letter, branch, at }, out of the wave's launches: not landed,
 * not in the queue (a landing that gave up or was withdrawn is NOT the queue - the session may be
 * back at work, and holding is the closed direction), and the branch still exists. `launches` are
 * `joinDurations` rows already filtered to this wave; `branches` is every branch name that exists,
 * so a freshly launched row with no diff yet is as running as one mid-work. Pure: every input is
 * handed in.
 */
export function runningRows({ launches, jobs, branches }) {
  return launches
    .filter((row) => row.toLandMin === null && branches.has(row.branch))
    .filter((row) => {
      const state = landingStateFor(row.branch, jobs.filter((job) => (job.enqueuedAt ?? 0) >= row.launchedAt)).state;
      return state !== 'queued' && state !== 'landed';
    })
    .map((row) => ({ letter: row.letter ?? null, branch: row.branch, at: row.launchedAt }));
}

/** Who holds the browser slot: every running row the wave table or the candidate rule says drives it. */
export function heldBrowser({ waveRows = [], candidates = [], running = [] }) {
  return running.filter((row) => {
    const planned = waveRows.find((entry) => clean(entry.letter) === row.letter);
    if (planned) return waveRowHoldsBrowser(planned);
    const candidate = candidates.find((entry) => entry.letter === row.letter);
    return candidate ? needsBrowser(candidate).needs : false;
  });
}

/**
 * Wave-table browser rows that are due now and have no ledger line carrying their letter -
 * possibly running and invisible, which the caller prints rather than acts on (see the header).
 * A row whose START waits on a slot or a landing is not due and is not a caution.
 */
export function unrecordedBrowserRows({ waveRows = [], recorded = new Set() }) {
  return waveRows
    .filter((row) => waveRowHoldsBrowser(row) && /^now\b/i.test(clean(row.start)) && !recorded.has(clean(row.letter)))
    .map((row) => clean(row.letter));
}

/**
 * Evaluate the ordered candidates. `entries` are the activity scan's running rows; `durations` and
 * `latency` feed the horizon; `remainingMin` is the window left; `held.browser` names the rows
 * holding the browser slot; `launched` maps a letter to its launch { branch, at } for this wave.
 * Each result carries a verdict, what held it (`heldOn`) and the reason; `pick` is the first
 * candidate that is unlaunched, collision-clear, whose slot is free and that fits, in the
 * planner's order. The reasons are ordered by how hard the fact is: the ledger, then a real diff,
 * then the slot, then the clock.
 */
export function evaluate(candidates, { entries, durations, latency, remainingMin, held = { browser: [] }, launched = new Map() }) {
  const window = horizon({ remainingMin, durations, latency });
  const holders = held.browser ?? [];
  const results = candidates.map((candidate) => {
    const size = SIZES.includes(candidate.size) ? candidate.size : 'standard';
    const collision = collisions({ files: candidate.files, specs: candidate.specs, branch: null }, entries);
    const browser = needsBrowser(candidate);
    const fits = window.sizes[size]?.fits ?? false;
    const fitLine = fits ? 'fits' : `a ${size} unit no longer fits (${window.sizes[size]?.slackMin ?? '?'} min short)`;
    const launch = launched.get(candidate.letter);
    let verdict = 'HOLD';
    let heldOn = null;
    let reason;
    if (launch) {
      heldOn = 'launched';
      reason = `already launched as ${launch.branch} at ${new Date(launch.at).toISOString().slice(11, 16)}Z`;
    } else if (!collision.clear) {
      heldOn = 'collision';
      reason = `collides with ${collision.hits.map((hit) => hit.branch).join(', ')}`;
    } else if (browser.needs && holders.length > 0) {
      heldOn = 'browser';
      reason = `needs the browser${browser.source === 'specs' ? ' (from its specs; a browser cell of no overrides)' : ''}, `
        + `held by ${holders.map((row) => `${row.letter ?? '?'} (${row.branch})`).join(', ')}; ${fits ? 'fits once it frees' : fitLine}`;
    } else if (!fits) {
      heldOn = 'window';
      reason = fitLine;
    } else {
      verdict = 'LAUNCH';
      reason = 'clear and fits';
    }
    return {
      letter: candidate.letter, size, verdict, heldOn, reason, goal: candidate.goal, cautions: collision.cautions,
      needsBrowser: browser.needs, browserSource: browser.source,
    };
  });
  const pick = results.find((result) => result.verdict === 'LAUNCH') ?? null;
  return { window, results, pick };
}

/** The closing line when there is no pick: the slot is named when the slot is why, because
 *  night.md reads "nothing fits the window" as the stop condition and a spent list as the trigger
 *  to extend it, and a list waiting on the browser is neither. */
export function holdLine(results, holders) {
  const onSlot = results.filter((result) => result.heldOn === 'browser');
  if (onSlot.length > 0) {
    return `Hold - ${onSlot.map((result) => result.letter).join(', ')} wait${onSlot.length === 1 ? 's' : ''} on the browser slot held by `
      + `${holders.map((row) => row.letter ?? row.branch).join(', ')}; nothing else is both clear and fits. Re-check when it frees.`;
  }
  return 'Hold - nothing on the list is both clear and fits the window. Let what is running land, then re-check.';
}

/** Every branch that exists here: local heads plus every worktree's branch, or null when git cannot say. */
function existingBranches(cwd) {
  const refs = git(['for-each-ref', 'refs/heads', '--format=%(refname:short)'], cwd);
  if (!refs.ok) return null;
  const names = new Set(refs.stdout.split('\n').filter(Boolean));
  for (const entry of worktreeEntries(cwd)) if (entry.branch) names.add(entry.branch);
  return names;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), { now = Date.now(), cwd = process.cwd() } = {}) {
  const dir = jobsDir();
  if (!dir) { process.stderr.write('candidates: not inside a git repository.\n'); return 2; }
  const planArg = argValue(argv, '--plan');
  const planPath = planArg ? path.resolve(planArg) : newestWavePlan(now, cwd);
  if (!planPath || !existsSync(planPath)) {
    process.stderr.write('candidates: no wave-state plan found (pass --plan <path>).\n');
    return 2;
  }
  const text = readFileSync(planPath, 'utf8');
  const candidates = parseCandidates(text);
  if (candidates.length === 0) {
    process.stdout.write('No ## Candidates table in the plan - the planner writes one for the refill loop to draw on.\n');
    return 0;
  }
  const span = waveSpan(planPath, text);
  if (span.endMs === null) {
    process.stderr.write('candidates: the plan has no "Window ends: <iso>" line - wave-horizon needs it.\n');
    return 2;
  }
  const jobs = readJobs(dir);
  const joined = joinDurations(readLaunches(dir), jobs, readLandings(dir));
  const durations = statsBySize(joined);
  const latency = landingLatency(jobs);
  const activity = await scanActivity(cwd);
  const entries = [
    ...activity.worktrees.map((entry) => ({ name: entry.name, branch: entry.branch, files: entry.files })),
    ...activity.branches.map((entry) => ({ name: entry.branch, branch: entry.branch, files: entry.files })),
  ];
  const launches = joined.filter((row) => belongsToWave(row, span, { now }));
  const launched = new Map(launches.filter((row) => row.letter).map((row) => [row.letter, { branch: row.branch, at: row.launchedAt }]));
  const branches = existingBranches(cwd) ?? new Set(launches.map((row) => row.branch)); // git silent: every launch counts as alive
  const running = runningRows({ launches, jobs, branches });
  const waveRows = parseWaveTable(text).rows;
  const holders = heldBrowser({ waveRows, candidates, running });
  const unrecorded = unrecordedBrowserRows({ waveRows, recorded: new Set(launched.keys()) });
  const { results, pick } = evaluate(candidates, {
    entries, durations, latency, remainingMin: (span.endMs - now) / 60_000, held: { browser: holders }, launched,
  });

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ pick: pick?.letter ?? null, held: holders, unrecorded, results }, null, 2)}\n`);
    return 0;
  }
  for (const letter of unrecorded) {
    process.stdout.write(`  caution: wave row ${letter} drives the browser and no launch record carries its letter - if it is running, `
      + `the slot is held and this cannot see it. Record it: node scripts/wave-launch.mjs record --letter ${letter} --branch <b> --size <size>\n`);
  }
  for (const result of results) {
    process.stdout.write(`  ${result.verdict === 'LAUNCH' ? 'LAUNCH' : 'hold  '} ${result.letter} (${result.size}) - ${result.reason}${result.letter === pick?.letter ? '  <- next' : ''}\n`);
    for (const caution of result.cautions) process.stdout.write(`         caution: ${caution.reason}\n`);
  }
  process.stdout.write(pick ? `\nLaunch next: ${pick.letter} - ${pick.goal}\n` : `\n${holdLine(results, holders)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
