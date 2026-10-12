#!/usr/bin/env node
// THE RUN'S DURABLE WAKE-UP - what brings a plan run or a wave back after its coordinator is gone.
//
//   node scripts/run-wake.mjs arm <wave file> --resume "<command>"   # the scheduled task to create, as JSON
//   node scripts/run-wake.mjs check <wave file>                      # alive | resume | over | unknown, one line
//   node scripts/run-wake.mjs awake <wave file>                      # hold the machine awake until the window ends
//
// WHY. A coordinator's timers (`sleep 1800`, CronCreate) live in its session. When the session or
// its process goes, nothing wakes the run, and it stops without a word until someone notices. A
// desktop scheduled task lives in the app instead: it fires while the app is open and, if the app
// was closed when it was due, on the next launch. `arm` prints that task (every 30 minutes, the
// coordinator's own timer); each firing is a fresh session that runs `check` and does what it says.
//
// LIVENESS is the harness's own process inventory (`claude agents --json`, scripts/claude-agents.mjs)
// against the `Session:` lines of the wave file: every session that opened or resumed the run
// records itself there, and a row launched with the Agent tool runs under its coordinator's id. Any
// recorded session still listed means the run has a coordinator: a second one is never started
// beside it. None listed, while the inventory answered, means it is gone: `resume`. An inventory
// that did not answer, or a run with no recorded session, is `unknown`, and nothing is done; the
// next firing asks again. A transcript's age is not used: a coordinator stopped on the owner's
// answer is silent for hours and still alive.
//
// THE MACHINE stays awake through `awake`, not the app's request_keep_awake, which lets go after
// about five idle minutes and when the app quits, while a coordinator sits idle up to 30 minutes
// between timers. `awake` starts a detached process that asks Windows (SetThreadExecutionState) or
// macOS (caffeinate) to stay out of idle sleep until the window ends or the report is written. It
// outlives the session and an app restart; after a reboot the wake-up's resume runs the start
// steps again, which start it again. A closed lid still sleeps.

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, readInventory } from './claude-agents.mjs';
import { PLAN_SUFFIX, REPORT_HEADING, waveSessions } from './wave-plan-store.mjs';

/** The wake-up fires this often: the coordinator's own fallback timer. */
export const WAKE_CRON = '*/30 * * * *';

function windowEnd(text) {
  return Date.parse(/^Window ends: (\S+)/m.exec(text)?.[1] ?? '');
}

/**
 * What a firing does, from the wave file's text, its recorded sessions and the process inventory:
 *   { verdict: 'over' }     the report is written or the window ended: delete the wake-up
 *   { verdict: 'alive' }    a recorded session is running: do nothing
 *   { verdict: 'resume' }   the inventory answered and lists none of them: take over the run
 *   { verdict: 'unknown' }  it cannot be told: do nothing, the next firing asks again
 * each with `why`, one clause.
 */
export function wakeVerdict({ text, sessions, inventory, now = Date.now() }) {
  if (REPORT_HEADING.test(text)) return { verdict: 'over', why: 'the run wrote its report' };
  const end = windowEnd(text);
  if (Number.isNaN(end)) return { verdict: 'unknown', why: 'the wave file has no readable "Window ends:" line' };
  if (now >= end) return { verdict: 'over', why: `the window ended at ${new Date(end).toISOString()}` };
  if (sessions.length === 0) return { verdict: 'unknown', why: 'no session is recorded in the wave file' };
  const index = buildIndex(inventory?.rows);
  if (!inventory?.available || index.bySession.size === 0) {
    return { verdict: 'unknown', why: `the process inventory did not answer${inventory?.why ? ` (${inventory.why})` : ''}` };
  }
  const live = sessions.find((id) => index.bySession.has(id));
  if (live) return { verdict: 'alive', why: `session ${live} is running (pid ${index.bySession.get(live).pid})` };
  return { verdict: 'resume', why: `no recorded session is running (${sessions.join(', ')})` };
}

/** One scheduled task per run, named after its wave file. */
export function wakeTaskId(file) {
  return `run-wake-${path.basename(file, PLAN_SUFFIX)}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

/** The create_scheduled_task arguments for this run. `repo` is the checkout the coordinator runs in. */
export function wakeTask({ file, resume, repo }) {
  const taskId = wakeTaskId(file);
  const script = path.join(repo, 'scripts', 'run-wake.mjs');
  return {
    taskId,
    title: `Wake-up: ${path.basename(file, PLAN_SUFFIX)}`,
    description: `Resumes ${resume} if its coordinator session is gone`,
    cronExpression: WAKE_CRON,
    notifyOnCompletion: false,
    prompt: [
      `Durable wake-up for a NoaCG run. Work in ${repo}. Do only this:`,
      `1. Run: node "${script}" check "${file}"`,
      '2. It prints one line. Act on its first word and nothing else:',
      '   - alive or unknown: end here and do nothing more.',
      `   - over: delete this scheduled task (${taskId}) with delete_scheduled_task, then end.`,
      `   - resume: the run's coordinator is gone and you replace it. Invoke ${resume} with the Skill tool and`,
      '     follow it in full from this session; it reopens the run, records this session, and reconciles',
      '     what was running before it launches anything.',
    ].join('\n'),
  };
}

/** The PowerShell that holds Windows out of idle sleep until `until` or the report. */
export function holderScript({ file, until }) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  return [
    `$end = [DateTimeOffset]::Parse(${quote(until)}); $file = ${quote(file)}`,
    "Add-Type -Namespace NoaCG -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    `while ([DateTimeOffset]::Now -lt $end -and (Test-Path -LiteralPath $file) -and -not (Select-String -LiteralPath $file -Pattern ${quote(REPORT_HEADING.source)} -CaseSensitive -Quiet)) {`,
    '  [void][NoaCG.Power]::SetThreadExecutionState([uint32]2147483649)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED',
    '  Start-Sleep -Seconds 60',
    '}',
  ].join('\n');
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Start the holder unless one from an earlier start is still running. Returns one line to print. */
export function holdAwake(file, { platform = process.platform, now = Date.now() } = {}) {
  const text = readFileSync(file, 'utf8');
  const until = /^Window ends: (\S+)/m.exec(text)?.[1];
  if (!until || Number.isNaN(Date.parse(until)) || Date.parse(until) <= now) return 'no window to hold: it has ended or is unreadable';
  if (REPORT_HEADING.test(text)) return 'no window to hold: the run wrote its report';
  const pidFile = `${file}.awake`;
  const held = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0;
  if (held > 0 && processAlive(held)) return `already held awake by pid ${held} until ${until}`;
  if (platform !== 'win32' && platform !== 'darwin') return `no keep-awake holder for ${platform}: keep the machine awake by hand until ${until}`;
  // A detached PowerShell exits at once on Windows (it gets no console), so a detached node runs
  // the holder as its child and lives as long as it does; that node is what outlives the session.
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'hold', file, until], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  return `held awake by pid ${child.pid} until ${until} or the report`;
}

/** The holder itself, run by the detached node `holdAwake` starts; resolves when it exits. */
function hold(file, until) {
  const child = process.platform === 'win32'
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(holderScript({ file, until }), 'utf16le').toString('base64')], { stdio: 'ignore', windowsHide: true })
    : spawn('caffeinate', ['-i', '-t', String(Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 1000)))], { stdio: 'ignore' });
  return new Promise((resolve) => child.on('exit', resolve).on('error', resolve));
}

const USAGE = `Usage: node scripts/run-wake.mjs arm <wave file> --resume "<command, e.g. /plan-run editor until <iso>>"
       node scripts/run-wake.mjs check <wave file>
       node scripts/run-wake.mjs awake <wave file>`;

export function main(argv = process.argv.slice(2)) {
  const [command, file] = argv;
  if (command === 'hold') return hold(file, argv[2]).then(() => 0);
  if (!['arm', 'check', 'awake'].includes(command) || !file) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (!existsSync(file)) {
    process.stdout.write(command === 'check' ? `over: the wave file ${file} is gone\n` : '');
    if (command !== 'check') process.stderr.write(`run-wake: no wave file at ${file}\n`);
    return command === 'check' ? 0 : 1;
  }
  if (command === 'arm') {
    const at = argv.indexOf('--resume');
    const resume = at === -1 ? '' : argv[at + 1] ?? '';
    if (!resume.trim()) {
      process.stderr.write(`run-wake: --resume names the command a fresh session resumes the run with\n\n${USAGE}\n`);
      return 2;
    }
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    process.stdout.write(`${JSON.stringify(wakeTask({ file: path.resolve(file), resume, repo }), null, 2)}\n`);
    return 0;
  }
  if (command === 'awake') {
    process.stdout.write(`${holdAwake(path.resolve(file))}\n`);
    return 0;
  }
  const result = wakeVerdict({ text: readFileSync(file, 'utf8'), sessions: waveSessions(file), inventory: readInventory() });
  if (result.verdict === 'resume') appendFileSync(file, `- ${new Date().toISOString()} wake-up: ${result.why}; a fresh session resumes the run\n`, 'utf8');
  process.stdout.write(`${result.verdict}: ${result.why}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve(main()).then((code) => { process.exitCode = code; });
}
