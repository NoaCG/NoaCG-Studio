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
//                                                              # a plan run and a wave exclude each other
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

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir } from './jobs-store.mjs';
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
 * does, so "one wave or one plan run, never both" is the same open-wave check, not a second one.
 */
const PLAN_RUN_KIND = /^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
const REPORT_HEADING = /^## (?:Morning )?[Rr]eport\b/m;

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

/**
 * Open a wave: refuse a window past the 24-hour ceiling and a second live wave, then create the
 * plan with its window lines, or hand back the existing one when this same wave is resumed. A
 * resumed wave is measured from the start its file records, so a restart cannot stretch it.
 * `session` (the opener's `CLAUDE_CODE_SESSION_ID`) is added as a `Session:` line under the window
 * lines, once per session, so a resume after a restart records the new one too.
 * Returns `{ file }` or `{ refusal }`.
 */
export function openWave({ date, kind, until, session, dir = jobsDir(), now = Date.now() }) {
  const name = wavePlanName(date, kind);
  const end = Date.parse(until ?? '');
  if (!/(?:[+-]\d{2}:\d{2}|Z)$/.test(String(until ?? '')) || Number.isNaN(end)) {
    return { refusal: `--until must be an ISO time with its offset, e.g. 2026-10-09T06:00:00+03:00 (got "${until}")` };
  }
  if (end <= now) return { refusal: `the window end ${until} has already passed` };
  const file = path.join(ensureWavePlansDir(dir), name);
  const recorded = existsSync(file) ? /^Window starts: (\S+)\s*$/m.exec(readFileSync(file, 'utf8'))?.[1] : undefined;
  const start = recorded && !Number.isNaN(Date.parse(recorded)) ? Date.parse(recorded) : now;
  if (end - start > MAX_WINDOW_MS) {
    return { refusal: `a wave runs at most 24 hours from its start (${new Date(start).toISOString()}), and ${until} is later than that` };
  }
  const others = openWaves(dir, now, name);
  if (others.length > 0) {
    return {
      refusal: `another wave or plan run is open (no report yet): ${others.join(', ')}. One at a time: finish or ` +
        'report it first. To resume it after a restart, open it again with its own date and kind.',
    };
  }
  if (!existsSync(file)) {
    writeFileSync(file, `${waveTitle(date, kind)}\n\nWindow starts: ${new Date(now).toISOString()}\nWindow ends: ${until}\n`, 'utf8');
  }
  if (session && !waveSessions(file).includes(session)) {
    const text = readFileSync(file, 'utf8');
    const block = SESSION_BLOCK.exec(text);
    if (block) {
      const at = block.index + block[0].length;
      writeFileSync(file, `${text.slice(0, at)}Session: ${session}\n${text.slice(at)}`, 'utf8');
    }
  }
  return { file };
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
    let opened;
    try {
      const until = at === -1 ? undefined : argv[at + 1];
      opened = openWave({ date: argv[1], kind: argv[2], until, session: process.env.CLAUDE_CODE_SESSION_ID || undefined });
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
