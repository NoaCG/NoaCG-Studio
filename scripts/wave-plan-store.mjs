#!/usr/bin/env node
// THE WAVE-PLAN STORE - where a wave's plan lives so that it outlives the session that wrote it.
//
//   node scripts/wave-plan-store.mjs --path 2026-09-09 night   # the path to write, dir created
//   node scripts/wave-plan-store.mjs --dir                     # just the directory
//   node scripts/wave-plan-store.mjs --list                    # every plan in the store, newest first
//   node scripts/wave-plan-store.mjs --open 2026-10-08 night --until 2026-10-09T06:00:00+03:00
//                                                              # start (or resume) a wave: refuses a
//                                                              # second open wave and a window over 24 h
//   node scripts/wave-plan-store.mjs --open 2026-10-09 plan-editor --until 2026-10-09T18:00:00+03:00
//                                                              # the same for a plan run (`/plan-run`):
//                                                              # a plan run and a wave exclude each other;
//                                                              # a new --until on the same date is a new window
//
// WHY. The wave plan is the ONLY record of which pools ran, what the routing was, and every
// `DECIDED:` line the orchestrator wrote when it took a decision on the owner's behalf. It is
// gitignored, so git is not its archive - unlike every other handoff, which is the exception that
// made this possible to miss.
//
// It used to be written to `docs/handoffs/` in whatever checkout the orchestrator session happened
// to occupy. On 2026-09-08 the first weekly review over a real week found NO plan anywhere on the
// machine: the plans for 09-05, 09-06 and 09-07 had been written into throwaway worktrees and died
// with them, while nine lettered rows landed on 09-05 alone. A week of the owner's own oversight
// mechanism reported zero because its input no longer existed.
//
// WHY HERE and not the orchestrator's home worktree. The contract already calls
// `.claude/worktrees/orchestrator` permanent, and the cleanup sweep exempts it by name - and it
// still did not exist for the eight days after `orchestrator-home.mjs` landed, because a session
// has to remember to run a script for a worktree to be there at all. The git common directory is
// not remembered into existence: it is there because the repository is there. `noacg-jobs/` beside
// it was born 2026-08-25 and still holds files written the next day, across every worktree removal,
// every `git clean` and every rewrite the landing queue made of the primary tree in between.
// `relay.mjs` already keeps human-written markdown here for the same reason, so this is the
// second use of a shape that is already load-bearing, not a new idea about where files go.
//
// The `.local.md` suffix stays even though nothing here is inside a checkout. It still means what
// it always meant - not tracked by git - and keeping it means one glob matches a plan in the store
// and a plan in the legacy `docs/handoffs/` location, which is what lets the weekly review read
// across the move without a second pattern to keep in step.
//
// WHY A NEW `--until` IS A NEW WINDOW and the same `--until` a restart. A restart must not renew
// authorisation, so a resumed wave is measured from the start its file records; but a new window the
// owner named must not be ignored either. Measured 2026-10-11: reopening the plan run's date with a
// later `--until` kept the morning window, and the ledger answered `time-limit` for a run the owner
// had just re-authorised. So a different end is a new window: the window lines are rewritten and
// the 24 hours count from now, while the ledger and the sessions stay. Every earlier `## Report`
// becomes `## Earlier report`, because a report is what lets a wave open beside this run, and a run
// that continues is open again. A new date for a plan whose run is not done is refused with the date
// to reopen, so no empty ledger is ever started beside a half-run one.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir } from './jobs-store.mjs';
import { nextStep } from './plan-run.mjs';
import { samePath } from './worktree-cleanup-lib.mjs';

/** The store's folder name inside the job store, beside `logs/` and `relay/`. */
export const WAVE_PLANS_DIR = 'wave-plans';

/** Every plan file matches this, in the store and in the legacy checkout location alike. */
export const PLAN_SUFFIX = '-wave-plan.local.md';

/** The store's directory, or null outside a git checkout. */
export function wavePlansDir(dir = jobsDir()) {
  return dir ? path.join(dir, WAVE_PLANS_DIR) : null;
}

/** The same, created if it is not there yet. The orchestrator writes the file, so nothing else will. */
export function ensureWavePlansDir(dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (folder) mkdirSync(folder, { recursive: true });
  return folder;
}

/**
 * A plan run (`/plan-run <plan>`) is the third kind: `plan-<plan>`. It lives in this store as a wave
 * does, so "a wave runs alone" is the same open-wave check, not a second one.
 */
const PLAN_RUN_KIND = /^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Is this store file a plan run's? Its kind follows the `YYYY-MM-DD-` date. */
function isPlanRunFile(file) {
  return PLAN_RUN_KIND.test(path.basename(file).slice(11, -PLAN_SUFFIX.length));
}

/** The one filename a plan may have: `<date>-<day|night|plan-<plan>>-wave-plan.local.md`. */
export function wavePlanName(date, kind) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) throw new Error(`date must be YYYY-MM-DD, got "${date}"`);
  if (kind !== 'day' && kind !== 'night' && !PLAN_RUN_KIND.test(String(kind ?? ''))) {
    throw new Error(`kind must be day, night or plan-<plan name>, got "${kind}"`);
  }
  return `${date}-${kind}${PLAN_SUFFIX}`;
}

function waveTitle(date, kind) {
  if (kind === 'day' || kind === 'night') return `# ${kind === 'night' ? 'Night' : 'Day'} wave ${date}`;
  return `# Plan run ${kind.slice('plan-'.length)} ${date}`;
}

/**
 * Is `file` inside the store? The refusal in the plan check and the launch ledger asks this.
 *
 * Compared against the store path REBUILT from the file's own basename, so a path in a
 * subdirectory of the store is not in the store either. `samePath` is the repo's Windows-safe
 * comparison (separators and case both vary for one file), and a check that answered "not in the
 * store" about a file that is in it would refuse every plan on this machine.
 */
export function inStore(file, dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (!folder || !file) return false;
  return samePath(file, path.join(folder, path.basename(file)));
}

/** Every plan in the store, newest name first. Names sort by date because the date leads them. */
export function wavePlanFiles(dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (!folder || !existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => name.endsWith(PLAN_SUFFIX)).sort().reverse();
}

/** A wave may run unattended for at most this long (the root boundary). */
export const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A plan written to within this long and holding no report is a wave somebody may still be running.
 * A live coordinator writes a line at every launch and every result, so six quiet hours means it
 * is gone; a day wave that ended without its report must not stop that night's wave.
 */
const OPEN_WAVE_MS = 6 * 60 * 60 * 1000;

/** The heading a finished wave's report sits under; older plans used "Morning report". */
export const REPORT_HEADING = /^## (?:Morning )?[Rr]eport\b/m;

/**
 * Plans in the store that look like a LIVE wave: written to in the last day, with no report yet.
 * "One orchestrator at a time" is a boundary, and this is what makes it one rather than a sentence.
 */
export function openWaves(dir = jobsDir(), now = Date.now(), except = '') {
  const folder = wavePlansDir(dir);
  if (!folder) return [];
  return wavePlanFiles(dir)
    .filter((name) => name !== except)
    .map((name) => path.join(folder, name))
    .filter((file) => now - statSync(file).mtimeMs < OPEN_WAVE_MS)
    .filter((file) => !REPORT_HEADING.test(readFileSync(file, 'utf8')));
}

/**
 * The open NIGHT wave whose window has not ended, or null: while it runs, nobody is there to
 * answer its sessions' questions (scripts/hooks/guard-question.mjs). A day wave and a plan run
 * run with the owner near, and a night wave past its `Window ends:` line is over even if its
 * report is missing.
 * A night wave with no readable window end counts as running.
 */
export function openNightWave(dir = jobsDir(), now = Date.now()) {
  return openWaves(dir, now).find((file) => {
    if (!path.basename(file).endsWith(`-night${PLAN_SUFFIX}`)) return false;
    const end = Date.parse(/^Window ends: (\S+)/m.exec(readFileSync(file, 'utf8'))?.[1] ?? '');
    return Number.isNaN(end) || now < end;
  }) ?? null;
}

/** The window lines the store writes. The value alone is read and rewritten, so a trailing note survives. */
const WINDOW_START = /^(Window starts: )(\S+)/m;
const WINDOW_END = /^(Window ends: )(\S+)/m;

/**
 * Open a wave: refuse a window past the 24-hour ceiling and a second live wave, then create the
 * plan with its window lines, hand back the existing one when this same wave is resumed, or give it
 * the new window when `until` names a different end. A resumed wave is measured from the start its
 * file records, so a restart cannot stretch it; a new window is measured from now, rewrites the
 * window lines and demotes every earlier report heading, so the run counts as open again. A plan
 * run is refused a new date while an earlier date's run is not done: that file is the one to reopen.
 * `session` (the opener's `CLAUDE_CODE_SESSION_ID`) is added as a `Session:` line under the window
 * lines, once per session, so a resume after a restart records the new one too.
 * Returns `{ file, window: 'opened' | 'resumed' | 'new' }`, with `previousEnd` for a new window, or
 * `{ refusal }`.
 */
export function openWave({ date, kind, until, session, dir = jobsDir(), now = Date.now() }) {
  const name = wavePlanName(date, kind);
  const end = Date.parse(until ?? '');
  if (!/(?:[+-]\d{2}:\d{2}|Z)$/.test(String(until ?? '')) || Number.isNaN(end)) {
    return { refusal: `--until must be an ISO time with its offset, e.g. 2026-10-09T06:00:00+03:00 (got "${until}")` };
  }
  if (end <= now) return { refusal: `the window end ${until} has already passed` };
  const file = path.join(ensureWavePlansDir(dir), name);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const recorded = { start: WINDOW_START.exec(text ?? '')?.[2], end: WINDOW_END.exec(text ?? '')?.[2] };
  const window = text === null ? 'opened' : recorded.end && Date.parse(recorded.end) !== end ? 'new' : 'resumed';
  const start = window === 'resumed' && !Number.isNaN(Date.parse(recorded.start ?? '')) ? Date.parse(recorded.start) : now;
  if (end - start > MAX_WINDOW_MS) {
    const from = window === 'resumed' ? `its start (${new Date(start).toISOString()})` : `now (${new Date(now).toISOString()})`;
    return { refusal: `a wave runs at most 24 hours from ${from}, and ${until} is later than that` };
  }
  const unfinished = window === 'opened' && PLAN_RUN_KIND.test(kind) ? unfinishedRun(kind, dir, now) : null;
  if (unfinished) {
    return {
      refusal: `the plan ${kind.slice('plan-'.length)} has an unfinished run: ${unfinished}. Continue it: ` +
        `--open ${path.basename(unfinished).slice(0, 10)} ${kind} --until ${until}`,
    };
  }
  // Plan runs of different plans may run side by side: each builds only its own plan's phases and
  // names its own file at every step. A wave runs alone, because it picks from the whole backlog and
  // could take up the work a plan run is doing, and its watch loop reads the newest plan file.
  const planRun = PLAN_RUN_KIND.test(kind);
  const others = openWaves(dir, now, name).filter((file) => !(planRun && isPlanRunFile(file)));
  if (others.length > 0) {
    return {
      refusal: `another ${planRun ? 'wave' : 'wave or plan run'} is open (no report yet): ${others.join(', ')}. ` +
        'A wave runs alone: finish or report it first. To resume it after a restart, open it again with its own date and kind.',
    };
  }
  if (window === 'opened') {
    writeFileSync(file, `${waveTitle(date, kind)}\n\nWindow starts: ${new Date(now).toISOString()}\nWindow ends: ${until}\n`, 'utf8');
  } else if (window === 'new') {
    writeFileSync(file, text
      .replace(WINDOW_START, `$1${new Date(now).toISOString()}`)
      .replace(WINDOW_END, `$1${until}`)
      .replace(new RegExp(REPORT_HEADING.source, 'gm'), '## Earlier report'), 'utf8');
  }
  if (session && !waveSessions(file).includes(session)) {
    const current = readFileSync(file, 'utf8');
    const block = SESSION_BLOCK.exec(current);
    if (block) {
      const at = block.index + block[0].length;
      writeFileSync(file, `${current.slice(0, at)}Session: ${session}\n${current.slice(at)}`, 'utf8');
    }
  }
  return window === 'new' ? { file, window, previousEnd: recorded.end } : { file, window };
}

/**
 * The newest run of this plan on another date whose ledger is not done, or null. Asked only before a
 * NEW file is created, so every file of this kind in the store is another date's.
 */
function unfinishedRun(kind, dir, now) {
  const folder = wavePlansDir(dir);
  return wavePlanFiles(dir)
    .filter((name) => name.endsWith(`-${kind}${PLAN_SUFFIX}`))
    .map((name) => path.join(folder, name))
    .find((file) => !['done', 'no-phases'].includes(nextStep(readFileSync(file, 'utf8'), now).action)) ?? null;
}

/**
 * The `Window ends:` line and the `Session:` lines directly under it. Sessions are written there and
 * read only there, so a `Session:` in the prompt, the log or the report can never name one.
 */
const SESSION_BLOCK = /^Window ends: [^\r\n]*\r?\n(?:Session: [^\r\n]*\r?\n)*/m;

/**
 * The Claude Code sessions that opened or resumed this wave. A row the orchestrator launches with
 * the Agent tool runs under the orchestrator's session id, so these name the wave's own sessions,
 * rows included, and nobody else's (scripts/hooks/guard-question.mjs).
 */
export function waveSessions(file) {
  const block = SESSION_BLOCK.exec(readFileSync(file, 'utf8'))?.[0] ?? '';
  return [...block.matchAll(/^Session: (\S+)/gm)].map((match) => match[1]);
}

const USAGE = `Usage: node scripts/wave-plan-store.mjs --path <YYYY-MM-DD> <day|night|plan-<plan>>
       node scripts/wave-plan-store.mjs --dir
       node scripts/wave-plan-store.mjs --list
       node scripts/wave-plan-store.mjs --open <YYYY-MM-DD> <day|night|plan-<plan>> --until <iso time with offset>`;

export function main(argv = process.argv.slice(2)) {
  const folder = wavePlansDir();
  if (!folder) {
    process.stderr.write('wave-plan-store: not inside a git checkout, so there is no store.\n');
    return 1;
  }
  if (argv[0] === '--dir') {
    process.stdout.write(`${ensureWavePlansDir()}\n`);
    return 0;
  }
  if (argv[0] === '--list') {
    const names = wavePlanFiles();
    process.stdout.write(names.length ? `${names.map((name) => path.join(folder, name)).join('\n')}\n` : 'no wave plans in the store\n');
    return 0;
  }
  if (argv[0] === '--open') {
    const at = argv.indexOf('--until');
    const until = at === -1 ? undefined : argv[at + 1];
    const now = Date.now();
    let opened;
    try {
      opened = openWave({ date: argv[1], kind: argv[2], until, session: process.env.CLAUDE_CODE_SESSION_ID || undefined, now });
    } catch (error) {
      process.stderr.write(`wave-plan-store: ${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    if (opened.refusal) {
      process.stderr.write(`wave-plan-store: ${opened.refusal}\n`);
      return 1;
    }
    if (!process.env.CLAUDE_CODE_SESSION_ID) {
      process.stderr.write('wave-plan-store: no CLAUDE_CODE_SESSION_ID here, so no session is recorded and the question ' +
        'guard cannot tell this wave\'s own sessions.\n');
    }
    process.stdout.write(`${opened.file}\n`);
    if (opened.window === 'new') {
      process.stderr.write(`wave-plan-store: new window from ${new Date(now).toISOString()} to ${until}; the earlier window ended ${opened.previousEnd}\n`);
    }
    return 0;
  }
  if (argv[0] === '--path') {
    let name;
    try {
      name = wavePlanName(argv[1], argv[2]);
    } catch (error) {
      process.stderr.write(`wave-plan-store: ${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    process.stdout.write(`${path.join(ensureWavePlansDir(), name)}\n`);
    return 0;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
