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
// launches nothing; it prints LAUNCH <letter> for the first candidate that is collision-clear, whose
// scarce slot is free, AND that fits the window, and HOLD for each one it passes with the reason.
//
// THE SCARCE SLOT. On the night of 2026-09-08 this instrument said LAUNCH for a browser row four
// times while another row held the one browser slot the machine has (root AGENTS.md: one
// browser-driving job per MACHINE). Neither instrument knows a resource - collision-check reads
// files and wave-horizon reads time - and the candidate table had nowhere to say a unit needs one.
// Two halves are needed and they come from different places:
//
//   - WHAT A CANDIDATE NEEDS is DERIVED from what the planner already writes: a candidate whose
//     SPECS column names an e2e spec is taken to need the browser. Inference is wrong in both
//     directions, so the direction is chosen on purpose: it FAILS CLOSED. A code-only row covered
//     by e2e specs is held while the browser is busy although it could have run (row O that night
//     was such a row), and the loop simply takes the next candidate and comes back to it when the
//     slot frees. The alternative, a column the planner must remember to fill, fails OPEN when a
//     cell is forgotten - which is the four bad picks again, silently. An optional `browser`
//     column overrides the derivation, and ONLY the values `yes` and `no` count as the planner's
//     word: an empty cell, a dash or anything else derives, so a placeholder cannot fail open
//     either. Combining the two is better than either alone because they fail in opposite
//     directions and the override can only move a verdict from "held by inference" to "the
//     planner's word"; the one open failure left is a planner writing `no` on a row that drives
//     the browser, which no instrument can check any more than it can check a wrong TOUCHES.
//   - WHAT IS HELD is read from the rows that are RUNNING. A planned row holds the browser when the
//     wave table says `browser` yes or its MINTS names the browser; a launched candidate holds it
//     when the rule above says it needs it (so the third bad pick, a candidate launched into the
//     slot, is covered too). Running means launched in the ledger `wave-launch.mjs` keeps, not yet
//     queued, not landed, and still seen by the activity scan; the ledger is what wave-horizon
//     already reads, so a launch nobody records is invisible to both instruments in the same way
//     and `launch.md` already makes recording every launch the rule. A wave-table browser row with
//     NO ledger record is printed as a caution rather than held: a phantom hold that no landing
//     can lift is the one closed failure that is not cheap, so this is the one place the choice
//     is loud-open, and the caution names the record command.
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
import { jobsDir, readJobs, readLandings } from './jobs-store.mjs';
import { parseWaveTable } from './wave-plan-check.mjs';
import { newestWavePlan, WAVE_PLAN_MAX_AGE_MS } from './wave-tick.mjs';

/** Split a table cell of comma/semicolon-separated tokens, dropping `-`, `none`, and empties. */
function cells(value) {
  return String(value ?? '').split(/[,;]/).map((token) => token.replace(/`/g, '').trim())
    .filter((token) => token && token !== '-' && token.toLowerCase() !== 'none');
}

/**
 * The `## Candidates` table as rows { letter, size, serves, files, specs, goal, browser }. Any
 * heading containing "candidates" opens it; the header row names the columns, so order is not
 * assumed. `browser` is the raw cell of the optional column, lower-cased, empty when absent.
 */
export function parseCandidates(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^#{1,6}\s+.*\bcandidates\b/i.test(line));
  if (start < 0) return [];
  let header = null;
  const rows = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s+/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (!header) { header = parts.map((cell) => cell.replace(/\*/g, '').toLowerCase()); continue; }
    if (parts.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const row = {};
    header.forEach((key, position) => { row[key] = parts[position] ?? ''; });
    const letter = (row.l ?? row.letter ?? row['#'] ?? '').replace(/\*/g, '').trim();
    if (!/^[A-Z]{1,2}$/.test(letter)) continue;
    rows.push({
      letter,
      size: (row.size ?? 'standard').trim().toLowerCase(),
      serves: (row.serves ?? '').trim(),
      files: cells(row.touches),
      specs: cells(row.specs).map((spec) => spec.replace(/^e2e\//, '')),
      goal: (row.goal ?? '').trim(),
      browser: (row.browser ?? '').replace(/`/g, '').trim().toLowerCase(),
    });
  }
  return rows;
}

/** The planner's word in a `browser` cell: a cell STARTING with yes or no, so `yes - drives the
 *  app` counts and a dash, a question mark or a note that names neither does not. */
function browserWord(cell) {
  const text = String(cell ?? '').trim();
  if (/^yes\b/i.test(text)) return true;
  if (/^no\b/i.test(text)) return false;
  return null;
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

/** Does a wave-table row hold the browser? Its `browser` column, or a MINTS cell naming it. */
export function waveRowHoldsBrowser(row) {
  return browserWord(row.browser) === true || /\bbrowser\b/i.test(String(row.mints ?? ''));
}

/**
 * The rows RUNNING right now, as { letter, branch }: launched in the ledger, not yet queued, not
 * landed, still seen by the activity scan, and belonging to this wave - a record that names another
 * plan is not this wave's, and one older than a plan can live (`WAVE_PLAN_MAX_AGE_MS` past its
 * window) is a leftover whose letter may have been reused. The scan filter is what drops a record
 * whose branch was rewound and deleted. Pure: every input is handed in.
 */
export function runningRows({ launches, jobs, landings, entries, planPath = null, now = Date.now() }) {
  const seen = new Set(entries.map((entry) => entry.branch).filter(Boolean));
  return joinDurations(launches, jobs, landings) // newest record per branch, joined to its queueing and landing
    .filter((row) => row.toQueueMin === null && row.toLandMin === null && seen.has(row.branch)
      && belongsToWave({ at: row.launchedAt, plan: row.plan }, { planPath, now }))
    .map((row) => ({ letter: row.letter ?? null, branch: row.branch }));
}

/**
 * Is this ledger line one of this wave's launches? The plan and age filters `runningRows` uses.
 * Plans are compared by FILE NAME: the store holds one per date and kind, and the ledger's path
 * comes from `wave-launch.mjs` while this one comes from whatever the operator typed - a drive
 * letter in another case or forward slashes would make every record read as another wave's, and
 * an empty running set fails open, which is the failure this whole check exists to remove.
 */
export function belongsToWave(record, { planPath = null, now = Date.now() } = {}) {
  if (planPath && record.plan && path.basename(record.plan).toLowerCase() !== path.basename(planPath).toLowerCase()) return false;
  return now - record.at <= 2 * WAVE_PLAN_MAX_AGE_MS;
}

/** The letters this wave has launched at all - running, queued or landed. */
export function recordedLetters({ launches, planPath = null, now = Date.now() }) {
  return new Set(launches.filter((record) => record.letter && belongsToWave(record, { planPath, now })).map((record) => record.letter));
}

/**
 * Who holds the browser slot: every running row the wave table or the candidate rule says drives
 * the browser. `unrecorded` lists wave-table browser rows with no ledger record at all (`recorded`
 * is every letter the wave has launched, whatever happened to it since) - possibly running and
 * invisible, which the caller prints rather than acts on (see the header).
 */
export function heldBrowser({ waveRows = [], candidates = [], running = [], recorded = new Set(running.map((row) => row.letter)) }) {
  const holders = [];
  for (const row of running) {
    const planned = waveRows.find((entry) => entry.letter === row.letter);
    const candidate = candidates.find((entry) => entry.letter === row.letter);
    const holds = planned ? waveRowHoldsBrowser(planned) : (candidate ? needsBrowser(candidate).needs : false);
    if (holds) holders.push(row);
  }
  const unrecorded = waveRows.filter((row) => waveRowHoldsBrowser(row) && !recorded.has(row.letter)).map((row) => row.letter);
  return { holders, unrecorded };
}

/**
 * Evaluate the ordered candidates. `entries` are the activity scan's running rows; `durations` and
 * `latency` feed the horizon; `remainingMin` is the window left; `held.browser` names the rows
 * holding the browser slot. Each result carries a verdict and the reason; `pick` is the first
 * candidate that is collision-clear, whose slot is free and that fits, in the planner's order.
 */
export function evaluate(candidates, { entries, durations, latency, remainingMin, held = { browser: [] } }) {
  const window = horizon({ remainingMin, durations, latency });
  const holders = held.browser ?? [];
  const results = candidates.map((candidate) => {
    const size = SIZES.includes(candidate.size) ? candidate.size : 'standard';
    const collision = collisions({ files: candidate.files, specs: candidate.specs, branch: null }, entries);
    const browser = needsBrowser(candidate);
    const fits = window.sizes[size]?.fits ?? false;
    let verdict;
    let reason;
    if (!collision.clear) { verdict = 'HOLD'; reason = `collides with ${collision.hits.map((hit) => hit.branch).join(', ')}`; }
    else if (browser.needs && holders.length > 0) {
      verdict = 'HOLD';
      reason = `needs the browser${browser.source === 'specs' ? ' (from its specs; a browser column cell of no overrides)' : ''}, `
        + `held by ${holders.map((row) => `${row.letter ?? '?'} (${row.branch})`).join(', ')}`;
    } else if (!fits) { verdict = 'HOLD'; reason = `a ${size} unit no longer fits (${window.sizes[size]?.slackMin ?? '?'} min short)`; }
    else { verdict = 'LAUNCH'; reason = 'clear and fits'; }
    return {
      letter: candidate.letter, size, verdict, reason, goal: candidate.goal, cautions: collision.cautions,
      needsBrowser: browser.needs, browserSource: browser.source,
    };
  });
  const pick = results.find((result) => result.verdict === 'LAUNCH') ?? null;
  return { window, results, pick };
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
  const endAt = parseWindowEnd(text);
  if (endAt === null) {
    process.stderr.write('candidates: the plan has no "Window ends: <iso>" line - wave-horizon needs it.\n');
    return 2;
  }
  const jobs = readJobs(dir);
  const launches = readLaunches(dir);
  const landings = readLandings(dir);
  const durations = statsBySize(joinDurations(launches, jobs, landings));
  const latency = landingLatency(jobs);
  const activity = await scanActivity(cwd);
  const entries = [
    ...activity.worktrees.map((entry) => ({ name: entry.name, branch: entry.branch, files: entry.files })),
    ...activity.branches.map((entry) => ({ name: entry.branch, branch: entry.branch, files: entry.files })),
  ];
  const running = runningRows({ launches, jobs, landings, entries, planPath, now });
  const held = heldBrowser({
    waveRows: parseWaveTable(text).rows, candidates, running, recorded: recordedLetters({ launches, planPath, now }),
  });
  const { results, pick } = evaluate(candidates, {
    entries, durations, latency, remainingMin: (endAt - now) / 60_000, held: { browser: held.holders },
  });

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ pick: pick?.letter ?? null, held: held.holders, unrecorded: held.unrecorded, results }, null, 2)}\n`);
    return 0;
  }
  for (const letter of held.unrecorded) {
    process.stdout.write(`  caution: wave row ${letter} drives the browser and has no launch record - if it is running, the slot is `
      + `held and this cannot see it. Record it: node scripts/wave-launch.mjs record --letter ${letter} --branch <b> --size <size>\n`);
  }
  for (const result of results) {
    process.stdout.write(`  ${result.verdict === 'LAUNCH' ? 'LAUNCH' : 'hold  '} ${result.letter} (${result.size}) - ${result.reason}${result.letter === pick?.letter ? '  <- next' : ''}\n`);
    for (const caution of result.cautions) process.stdout.write(`         caution: ${caution.reason}\n`);
  }
  process.stdout.write(pick
    ? `\nLaunch next: ${pick.letter} - ${pick.goal}\n`
    : '\nHold - nothing on the list is both clear and fits the window. Let what is running land, then re-check.\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
