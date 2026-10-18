#!/usr/bin/env node
// THE RUN'S DURABLE WAKE-UP - what brings a plan run or a wave back after its coordinator is gone.
//
//   node scripts/run-wake.mjs arm <wave file> --resume "plan-run <plan> until <iso>"  # mark the run, print the task
//   node scripts/run-wake.mjs check            # alive | resume | idle | unknown, for every marked run
//   node scripts/run-wake.mjs awake <wave file> # hold the machine out of idle sleep until the window ends
//
// WHY. A coordinator's timers (`sleep 1800`, CronCreate) live in its session. When its process goes,
// nothing wakes the run and it stops without a word. A desktop scheduled task lives in the app: it
// fires while the app is open and, if the app was closed when it was due, at the next launch. One
// task, `noacg-run-wake`, every 30 minutes (the coordinator's own timer), serves every run: `arm`
// writes a `Wake:` line into the run's wave file (the coordinator's desktop session, its Claude Code
// session and the command that resumes it) and prints the task to create or re-enable.
//
// WHAT A FIRING DOES, measured on Claude Code 2.1.295 (2026-10-12). A task's run is a fresh session
// in the primary checkout, and it starts in the default permission mode whatever mode its creator
// had, so it can neither run a coordinator nor wait on prompts with nobody there. It runs `check`
// (allowed in .claude/settings.json) and, for `resume`, sends the coordinator's own desktop session a
// message: the app starts a dead session's process again on the same conversation, in that
// session's own mode, and it carries on from its wave file. Only if that send fails does the firing
// session take the run over itself. `idle`, when no marked run is open, pauses the task.
//
// A FIRING COSTS NOTHING when there is nothing to do. The model call is the whole cost of a firing
// (about 85k tokens of context on the default model), so scripts/hooks/run-wake-gate.mjs runs the
// check on the firing's prompt, before any model call, and blocks the prompt on alive, unknown and
// waiting. Only resume and idle reach the model, with the check's output in its context; that
// firing also archives the finished wake-up sessions and itself, so they do not pile up.
//
// LIVENESS is the harness's own process inventory (`claude agents --json`, scripts/claude-agents.mjs,
// which drops a killed process) against the run's recorded sessions: the `Session:` lines and the
// `Wake:` line. Any of them listed means the run has a coordinator, so nothing is done. None listed,
// while the inventory answered, means it is gone: `resume`. An inventory that did not answer is
// `unknown`, and the next firing asks again. A transcript's age is not used: a coordinator stopped
// on the owner's answer is silent for hours and still alive.
//
// THE USAGE LIMIT stops a coordinator without ending its process, and no timer of its own fires
// again: its turn ends on a rate-limit error, or it wraps up cleanly under the harness's grace
// notice. So a running coordinator whose transcript ends on that error, or whose last turn ran under
// that notice, is `waiting` until the limit's reset and `resume` once it has passed: the same
// message starts its next turn. The error records the reset; the notice does not, so the latest
// error's reset is used while it still lay ahead at the notice, else an hour after the notice. A
// plan run whose ledger stopped on a question to the owner stays `alive`: his answer wakes it.
//
// THE MACHINE stays awake through `awake`, not the app's request_keep_awake, which lets go after
// about five idle minutes and when the app quits. It starts a detached holder that keeps Windows
// (SetThreadExecutionState) or macOS (caffeinate) out of idle sleep until the window ends or the
// report is written; it outlives the session and an app restart, and a restarted coordinator runs
// the start steps again, which start it again after a reboot. A closed lid still sleeps.

import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, inventory as harnessInventory } from './claude-agents.mjs';
import { processAlive } from './codex-rescue.mjs';
import { nextStep } from './plan-run.mjs';
import { primaryCheckout } from './primary-checkout.mjs';
import { advanceLocalMain } from './worktree-cleanup-lib.mjs';
import { REPORT_HEADING, SESSION_BLOCK, sessionsIn, WINDOW_END, wavePlanFiles, wavePlansDir } from './wave-plan-store.mjs';

export const WAKE_TASK_ID = 'noacg-run-wake';
export const WAKE_CRON = '*/30 * * * *';

/** The `Wake:` line is read only directly under the session lines, like they are. */
const WAKE_LINE = /^Wake: (\S+) (\S+) ([^\r\n]+?)[ \t]*(?:\r?\n|$)/;

function wakeAt(text) {
  const block = SESSION_BLOCK.exec(text);
  if (!block) return null;
  const at = block.index + block[0].length;
  return { at, match: WAKE_LINE.exec(text.slice(at)) };
}

/** The run's wake-up mark: `{ host, session, resume }`, or null when the run is not armed. */
export function readWake(text) {
  const match = wakeAt(text)?.match;
  return match ? { host: match[1], session: match[2], resume: match[3] } : null;
}

/** The text with its `Wake:` line written (replaced if there was one) under the session lines. */
export function writeWake(text, { host, session, resume }) {
  const found = wakeAt(text);
  if (!found) return null;
  const { at, match } = found;
  return `${text.slice(0, at)}Wake: ${host} ${session} ${resume}\n${text.slice(at + (match?.[0].length ?? 0))}`;
}

/** How far back a transcript is read for its last turn; a turn under the usage limit is far smaller. */
const TAIL_BYTES = 256 * 1024;

/** The transcript of Claude Code session `id`, under any project folder, or null. */
function transcriptOf(id, projects = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'projects')) {
  if (!existsSync(projects)) return null;
  for (const folder of readdirSync(projects)) {
    const file = path.join(projects, folder, `${id}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
}

/** How long after its grace notice a coordinator is resumed when no reset is recorded, and how that is said. */
const GRACE_WAIT_MS = 60 * 60 * 1000;
const GRACE_WAIT = 'an hour after the grace notice, which records no reset';

/**
 * Did the conversation in this transcript text stop on the usage limit? Then `{ resetsAt }` (ms, or
 * null when nothing records it, plus `basis` when it is the grace wait), otherwise null:
 * - its last main-chain message is the harness's rate-limit error, which records the reset;
 * - or its last turn, the user entries sharing the latest `promptId`, holds the harness's grace
 *   notice (`usageLimitNote: 'wrap_up'`) with no `release` note after it. A later prompt (the
 *   owner's answer, a timer, a wake-up) is a new turn, so an earlier grace never counts.
 * Lines that do not parse, such as a first line cut by the tail read, are skipped.
 */
export function usageStopIn(text) {
  const entries = String(text).split('\n').flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return (entry?.type === 'user' || entry?.type === 'assistant') && !entry.isSidechain ? [entry] : [];
    } catch { return []; }
  });
  const limited = (entry) => entry?.type === 'assistant' && entry.error === 'rate_limit';
  const resetOf = (entry) => {
    const seconds = Number(entry?.quotaLimits?.resetsAt);
    return seconds > 0 ? seconds * 1000 : null;
  };
  const last = entries.at(-1);
  if (limited(last)) return { resetsAt: resetOf(last) };
  const prompts = entries.filter((entry) => entry.type === 'user');
  const turn = prompts.at(-1)?.promptId;
  const note = turn ? prompts.findLast((entry) => entry.promptId === turn && entry.usageLimitNote) : null;
  if (note?.usageLimitNote !== 'wrap_up') return null;
  const at = Date.parse(note.timestamp);
  const recorded = resetOf(entries.findLast(limited));
  if (recorded > at || Number.isNaN(at)) return { resetsAt: recorded };
  return { resetsAt: at + GRACE_WAIT_MS, basis: GRACE_WAIT };
}

/** `usageStopIn` for session `id`'s transcript, read from its tail; null (working) when it cannot be read. */
function usageStop(id) {
  const file = transcriptOf(id);
  if (!file) return null;
  let fd;
  try {
    fd = openSync(file, 'r');
    const { size } = fstatSync(fd);
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return usageStopIn(buffer.toString('utf8'));
  } catch {
    return null; // gone or locked between the lookup and the read: treated as working, as before
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * One run's state from its wave file's text and the process inventory (or a function returning it,
 * asked only for an open armed run): over (report written, window ended or not armed) | alive |
 * waiting (stopped on the usage limit until it resets) | resume | unknown, each with `why`.
 * `stopped(id)` says whether a running session stopped on the usage limit (see `usageStop`).
 */
export function wakeVerdict({ text, inventory, now = Date.now(), stopped = usageStop }) {
  const wake = readWake(text);
  if (!wake) return { verdict: 'over', why: 'the run has no wake-up' };
  const { why } = holdable(text, now);
  if (why) return { verdict: 'over', why };
  if (typeof inventory === 'function') inventory = inventory();
  const sessions = sessionsIn(text);
  const index = buildIndex(inventory?.rows);
  if (!inventory?.available || index.bySession.size === 0) {
    return { verdict: 'unknown', why: `the process inventory did not answer${inventory?.why ? ` (${inventory.why})` : ''}` };
  }
  const ids = [...new Set([...sessions, wake.session])];
  const live = ids.filter((id) => index.bySession.has(id));
  if (live.length === 0) return { verdict: 'resume', why: `no recorded session is running (${ids.join(', ')})`, ...wake };
  const stops = live.map((id) => stopped(id));
  const working = live.find((id, i) => !stops[i]);
  if (working) return { verdict: 'alive', why: `session ${working} is running (pid ${index.bySession.get(working).pid})` };
  // A plan run stopped on a question to the owner is woken by his answer, not by the limit's reset.
  const owed = nextStep(text, now);
  if (owed.action === 'stopped') return { verdict: 'alive', why: `session ${live.join(', ')} is waiting on the owner's answer for phase ${owed.phase}` };
  const resets = stops.map((stop) => stop.resetsAt);
  const until = resets.includes(null) ? null : Math.max(...resets);
  const basis = stops.find((stop) => stop.resetsAt === until)?.basis;
  const guess = basis ? ` (${basis})` : '';
  if (until && until > now) {
    return { verdict: 'waiting', why: `session ${live.join(', ')} stopped on the usage limit, which resets at ${new Date(until).toISOString()}${guess}` };
  }
  return { verdict: 'resume', usage: true, why: `session ${live.join(', ')} stopped on the usage limit, which has reset${guess}`, ...wake };
}

/**
 * What one firing does about every run in the store, as the lines it prints: the first resume (a
 * second dead run is taken on the next firing), else `idle` when no run is armed and open, else
 * what the open ones are.
 */
export function wakeReport(runs) {
  const open = runs.filter((run) => run.verdict !== 'over');
  const resume = open.find((run) => run.verdict === 'resume');
  if (resume) {
    const stop = resume.usage
      ? 'you stopped on the usage limit, which should have reset by now, and this message starts your next turn'
      : 'your process had stopped and this message started it again';
    return [
      `resume: ${resume.why} for ${resume.file}`,
      `session_id: ${resume.host}`,
      `message: Wake-up: ${stop}. Continue the run in ${resume.file} with ${resume.resume}: reconcile first, launch nothing twice, and go no further than a question the owner has not answered.`,
      `command: ${resume.resume}`,
    ];
  }
  if (open.length === 0) return ['idle: no open run has a wake-up'];
  const verdict = ['unknown', 'waiting'].find((word) => open.some((run) => run.verdict === word)) ?? 'alive';
  return [`${verdict}: ${open.map((run) => `${path.basename(run.file)} ${run.verdict} (${run.why})`).join('; ')}`];
}

/** The first words of a check that leave nothing for a firing to do: its prompt gate blocks them. */
export const QUIET_VERDICTS = Object.freeze(['alive', 'unknown', 'waiting']);

/** The wake-up sessions' title, which the firing that acts archives. */
export const WAKE_TITLE = 'NoaCG run wake-up';

/** The create_scheduled_task arguments; `repo` is the primary checkout, where its runs start. */
export function wakeTask(repo) {
  return {
    taskId: WAKE_TASK_ID,
    title: WAKE_TITLE,
    description: 'Restarts a plan run or wave whose coordinator session stopped or hit the usage limit',
    cronExpression: WAKE_CRON,
    notifyOnCompletion: false,
    prompt: [
      'Durable wake-up for NoaCG plan runs and waves. Do only this, in as few turns as you can:',
      '1. The output of `node scripts/run-wake.mjs check` is normally already in your context (a prompt hook',
      `   ran it). Only if it is not, run exactly, in ${repo}: node scripts/run-wake.mjs check`,
      '2. Act on the first word of that output and nothing else:',
      '   - alive, unknown or waiting: end here and do nothing more.',
      `   - idle: pause this task with update_scheduled_task (taskId ${WAKE_TASK_ID}, enabled false).`,
      '   - resume: send the printed message to the printed session_id with mcp__ccd_session_mgmt__send_message;',
      '     that restarts the run\'s own coordinator session. Only if the send fails, invoke the printed',
      '     command with the Skill tool (its name without the slash, the rest as arguments), follow it and',
      '     end without step 3.',
      `3. Clean up: list_task_runs (taskId ${WAKE_TASK_ID}, limit 50), then in one parallel batch archive_session every`,
      '   other run not yet archived (finished firings), then archive_session "self". Write no report.',
    ].join('\n'),
  };
}

/** The PowerShell that holds Windows out of idle sleep until `until`; the node around it ends it sooner. */
export function holderScript(until) {
  return [
    `$end = [DateTimeOffset]::Parse('${String(until).replaceAll("'", "''")}')`,
    "Add-Type -Namespace NoaCG -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    'while ([DateTimeOffset]::Now -lt $end) {',
    '  [void][NoaCG.Power]::SetThreadExecutionState([uint32]2147483649)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED',
    '  Start-Sleep -Seconds 60',
    '}',
  ].join('\n');
}

/** Is the window in this text still to be held? The holder asks every minute. */
export function holdable(text, now = Date.now()) {
  const until = WINDOW_END.exec(text)?.[2];
  if (!until || Number.isNaN(Date.parse(until)) || Date.parse(until) <= now) return { until, why: 'it has ended or is unreadable' };
  if (REPORT_HEADING.test(text)) return { until, why: 'the run wrote its report' };
  return { until };
}

/** Start the holder unless one for this same window is still running. Returns one line to print. */
export function holdAwake(file, { platform = process.platform, now = Date.now() } = {}) {
  const { until, why } = holdable(readFileSync(file, 'utf8'), now);
  if (why) return `no window to hold: ${why}`;
  const pidFile = `${file}.awake`;
  const [held, heldUntil] = existsSync(pidFile) ? readFileSync(pidFile, 'utf8').trim().split(' ') : [];
  if (Number(held) > 0 && heldUntil === until && processAlive(Number(held))) return `already held awake by pid ${held} until ${until}`;
  if (platform !== 'win32' && platform !== 'darwin') return `no keep-awake holder for ${platform}: keep the machine awake by hand until ${until}`;
  // A detached PowerShell exits at once on Windows (it gets no console), so a detached node runs
  // the holder as its child and lives as long as it does; that node is what outlives the session.
  // It runs beside the wave file, so it holds no worktree open against removal.
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'hold', file], {
    cwd: path.dirname(file), detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid} ${until}\n`, 'utf8');
  return `held awake by pid ${child.pid} until ${until} or the report`;
}

/** The holder itself, run by the detached node `holdAwake` starts: ends with the window or the report. */
function hold(file) {
  const read = () => (existsSync(file) ? holdable(readFileSync(file, 'utf8')) : { why: 'the wave file is gone' });
  const { until, why } = read();
  if (why) return Promise.resolve();
  const child = process.platform === 'win32'
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(holderScript(until), 'utf16le').toString('base64')], { stdio: 'ignore', windowsHide: true })
    : spawn('caffeinate', ['-i', '-t', String(Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 1000)))], { stdio: 'ignore', windowsHide: true });
  const poll = setInterval(() => { if (read().why) child.kill(); }, 60_000);
  return new Promise((resolve) => child.on('exit', resolve).on('error', resolve)).finally(() => clearInterval(poll));
}

/**
 * The checkout the task's runs start in and whose copy of this script they run: the primary
 * checkout of the checkout holding `scriptsDir`. Asked of the checkout root, which holds `.git`;
 * asked of `scripts/` it would answer with that folder itself.
 */
export function wakeRepo(scriptsDir = path.dirname(fileURLToPath(import.meta.url))) {
  return primaryCheckout(path.resolve(scriptsDir, '..'));
}

function arm(file, argv, env = process.env) {
  const at = argv.indexOf('--resume');
  // Given without its slash: Git Bash rewrites an argument that starts with one into a path.
  const command = (at === -1 ? '' : argv[at + 1] ?? '').trim().replace(/^\/+/, '');
  if (!command) return fail(`--resume names the command that continues the run\n\n${USAGE}`, 2);
  const host = env.CLAUDE_CODE_HOST_SESSION_ID;
  const session = env.CLAUDE_CODE_SESSION_ID;
  if (!host || !session) return fail('arm from the coordinator\'s Claude desktop session: it has no desktop session to restart here', 1);
  const text = writeWake(readFileSync(file, 'utf8'), { host, session, resume: `/${command}` });
  if (!text) return fail(`${file} has no "Window ends:" line; open the run with wave-plan-store.mjs first`, 1);
  writeFileSync(file, text, 'utf8');
  const repo = wakeRepo();
  advanceLocalMain(repo);
  if (!existsSync(path.join(repo, 'scripts', 'run-wake.mjs'))) {
    process.stderr.write(`run-wake: ${repo} has no scripts/run-wake.mjs yet (its main is behind origin/main); the wake-up cannot run until it has\n`);
  }
  process.stdout.write(`${JSON.stringify(wakeTask(repo), null, 2)}\n`);
  return 0;
}

/** One check over the given wave files (default: every one in the store): its output lines. */
export function runCheck(files = wavePlanFiles().map((name) => path.join(wavePlansDir(), name))) {
  const runs = files.filter((file) => existsSync(file))
    .map((file) => ({ file, ...wakeVerdict({ text: readFileSync(file, 'utf8'), inventory: harnessInventory }) }));
  const lines = wakeReport(runs);
  const resume = runs.find((run) => run.verdict === 'resume');
  if (resume) {
    const text = readFileSync(resume.file, 'utf8');
    appendFileSync(resume.file, `${text.endsWith('\n') || !text ? '' : '\n'}- ${new Date().toISOString()} wake-up: ${resume.why}; restarting its session ${resume.host}\n`, 'utf8');
  }
  return lines;
}

function fail(message, code) {
  process.stderr.write(`run-wake: ${message}\n`);
  return code;
}

const USAGE = `Usage: node scripts/run-wake.mjs arm <wave file> --resume "<command without its slash, e.g. plan-run editor until <iso>>"
       node scripts/run-wake.mjs check [<wave file>...]
       node scripts/run-wake.mjs awake <wave file>`;

export function main(argv = process.argv.slice(2)) {
  const [command, file] = argv;
  if (command === 'hold') return hold(file).then(() => 0);
  if (command === 'check') {
    process.stdout.write(`${runCheck(...(argv.length > 1 ? [argv.slice(1)] : [])).join('\n')}\n`);
    return 0;
  }
  if (!['arm', 'awake'].includes(command) || !file) return fail(USAGE, 2);
  if (!existsSync(file)) return fail(`no wave file at ${file}`, 1);
  if (command === 'arm') return arm(path.resolve(file), argv);
  process.stdout.write(`${holdAwake(path.resolve(file))}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve(main()).then((code) => { process.exitCode = code; });
}
