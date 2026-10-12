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
// LIVENESS is the harness's own process inventory (`claude agents --json`, scripts/claude-agents.mjs,
// which drops a killed process) against the run's recorded sessions: the `Session:` lines and the
// `Wake:` line. Any of them listed means the run has a coordinator, so nothing is done. None listed,
// while the inventory answered, means it is gone: `resume`. An inventory that did not answer is
// `unknown`, and the next firing asks again. A transcript's age is not used: a coordinator stopped
// on the owner's answer is silent for hours and still alive.
//
// THE MACHINE stays awake through `awake`, not the app's request_keep_awake, which lets go after
// about five idle minutes and when the app quits. It starts a detached holder that keeps Windows
// (SetThreadExecutionState) or macOS (caffeinate) out of idle sleep until the window ends or the
// report is written; it outlives the session and an app restart, and a restarted coordinator runs
// the start steps again, which start it again after a reboot. A closed lid still sleeps.

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, readInventory } from './claude-agents.mjs';
import { primaryCheckout } from './primary-checkout.mjs';
import { advanceLocalMain } from './worktree-cleanup-lib.mjs';
import { REPORT_HEADING, wavePlanFiles, wavePlansDir, waveSessions } from './wave-plan-store.mjs';

export const WAKE_TASK_ID = 'noacg-run-wake';
export const WAKE_CRON = '*/30 * * * *';

const WAKE_LINE = /^Wake: (\S+) (\S+) (.+?)\s*$/m;
const SESSION_BLOCK = /^Window ends: [^\r\n]*\r?\n(?:Session: [^\r\n]*\r?\n)*/m;

/** The run's wake-up mark: `{ host, session, resume }`, or null when the run is not armed. */
export function readWake(text) {
  const match = WAKE_LINE.exec(text);
  return match ? { host: match[1], session: match[2], resume: match[3] } : null;
}

/** The text with its `Wake:` line written (replaced if there was one) under the window lines. */
export function writeWake(text, { host, session, resume }) {
  const line = `Wake: ${host} ${session} ${resume}\n`;
  if (WAKE_LINE.test(text)) return text.replace(/^Wake: [^\r\n]*\r?\n?/m, line);
  const block = SESSION_BLOCK.exec(text);
  if (!block) return null;
  const at = block.index + block[0].length;
  return `${text.slice(0, at)}${line}${text.slice(at)}`;
}

/**
 * One run's state from its wave file's text, its recorded sessions and the process inventory:
 *   over (report written, window ended or not armed) | alive | resume | unknown, each with `why`.
 */
export function wakeVerdict({ text, sessions, inventory, now = Date.now() }) {
  const wake = readWake(text);
  if (!wake) return { verdict: 'over', why: 'the run has no wake-up' };
  if (REPORT_HEADING.test(text)) return { verdict: 'over', why: 'the run wrote its report' };
  const end = Date.parse(/^Window ends: (\S+)/m.exec(text)?.[1] ?? '');
  if (Number.isNaN(end) || now >= end) return { verdict: 'over', why: 'its window has ended' };
  const index = buildIndex(inventory?.rows);
  if (!inventory?.available || index.bySession.size === 0) {
    return { verdict: 'unknown', why: `the process inventory did not answer${inventory?.why ? ` (${inventory.why})` : ''}` };
  }
  const ids = [...new Set([...sessions, wake.session])];
  const live = ids.find((id) => index.bySession.has(id));
  if (live) return { verdict: 'alive', why: `session ${live} is running (pid ${index.bySession.get(live).pid})` };
  return { verdict: 'resume', why: `no recorded session is running (${ids.join(', ')})`, ...wake };
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
    return [
      `resume: ${resume.why} for ${resume.file}`,
      `session_id: ${resume.host}`,
      `message: Wake-up: your process had stopped and this message started it again. Continue the run in ${resume.file} with ${resume.resume}: reconcile first, launch nothing twice.`,
      `command: ${resume.resume}`,
    ];
  }
  if (open.length === 0) return ['idle: no open run has a wake-up'];
  const verdict = open.some((run) => run.verdict === 'unknown') ? 'unknown' : 'alive';
  return [`${verdict}: ${open.map((run) => `${path.basename(run.file)} ${run.verdict} (${run.why})`).join('; ')}`];
}

/** The create_scheduled_task arguments; `repo` is the primary checkout, where its runs start. */
export function wakeTask(repo) {
  return {
    taskId: WAKE_TASK_ID,
    title: 'NoaCG run wake-up',
    description: 'Restarts a plan run or wave whose coordinator session stopped',
    cronExpression: WAKE_CRON,
    notifyOnCompletion: false,
    prompt: [
      'Durable wake-up for NoaCG plan runs and waves. Do only this:',
      `1. In ${repo}, run exactly: node scripts/run-wake.mjs check`,
      '2. Act on the first word of its output and nothing else:',
      '   - alive or unknown: end here and do nothing more.',
      `   - idle: pause this task with update_scheduled_task (taskId ${WAKE_TASK_ID}, enabled false), then end.`,
      '   - resume: send the printed message to the printed session_id with mcp__ccd_session_mgmt__send_message;',
      '     that restarts the run\'s own coordinator session. Only if the send fails, invoke the printed',
      '     command with the Skill tool and follow it in full yourself.',
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
  // The task's runs start in the primary checkout and run its copy of this script.
  const repo = primaryCheckout(path.dirname(fileURLToPath(import.meta.url)));
  advanceLocalMain(repo);
  if (!existsSync(path.join(repo, 'scripts', 'run-wake.mjs'))) {
    process.stderr.write(`run-wake: ${repo} has no scripts/run-wake.mjs yet (its main is behind origin/main); the wake-up cannot run until it has\n`);
  }
  process.stdout.write(`${JSON.stringify(wakeTask(repo), null, 2)}\n`);
  return 0;
}

function check(files) {
  const inventory = readInventory();
  const runs = files.map((file) => {
    const text = readFileSync(file, 'utf8');
    return { file, ...wakeVerdict({ text, sessions: waveSessions(file), inventory }) };
  });
  const lines = wakeReport(runs);
  const resume = runs.find((run) => run.verdict === 'resume');
  if (lines[0].startsWith('resume') && resume) {
    appendFileSync(resume.file, `- ${new Date().toISOString()} wake-up: ${resume.why}; restarting its session ${resume.host}\n`, 'utf8');
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
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
  if (command === 'hold') return hold(file, argv[2]).then(() => 0);
  if (command === 'check') {
    const folder = wavePlansDir();
    return check(argv.length > 1 ? argv.slice(1) : wavePlanFiles().map((name) => path.join(folder, name)));
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
