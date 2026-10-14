// SUBSCRIPTION WORK: every `claude -p` child the harness bench starts (the Claude Code reference
// arm, the judge) runs on the owner's Max subscription and never on an API key
// (docs/work-specs/noacg-harness/spec.md decision 12 and section 5.4).
//
// The child's environment is BUILT FROM SCRATCH, never copied from ours and scrubbed: PATH, a
// fresh home with its profile directories inside it, the OAuth token, NOACG_URL, what Windows
// needs to start a process, and the two switches that stop the owner's own instructions loading.
// HOME and USERPROFILE alone do not isolate on Windows: Claude Code still finds
// `~/.claude/CLAUDE.md` through the Windows profile, and only CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 and
// CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 with a fresh CLAUDE_CONFIG_DIR stopped it (H0, sessions
// b9bfa410, ff3de1d4, 6bfb47eb). A variable named like a key refuses the whole start, so no API
// key can reach a child however it got into our environment.
//
// Before any subscription stage, `claude auth status` in that same environment must say
// `loggedIn: true` and `authMethod: oauth_token`, or nothing starts.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** Names that must never reach a subscription child. */
export const FORBIDDEN = /API_KEY|BENCH|^ANTHROPIC_AUTH_TOKEN$|^ANTHROPIC_BASE_URL$/i;

/** What Windows needs from our environment to start a process at all; nothing secret. */
const WINDOWS_PASSTHROUGH = ['SystemRoot', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'windir', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];

/**
 * The child's whole environment. `home` is a fresh directory the caller owns; `pathDirs` are the
 * only directories on PATH (the claude install, node, a CLI shim, the system's own).
 */
export function subscriptionEnv({ token, home, noacgUrl, pathDirs, platform = process.platform, from = process.env }) {
  if (!token) throw new Error('no CLAUDE_CODE_OAUTH_TOKEN: the subscription stages need the main checkout .env to carry it');
  if (!home) throw new Error('a subscription child needs a fresh home directory');
  const profile = {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    TEMP: path.join(home, 'tmp'),
    TMP: path.join(home, 'tmp'),
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
  };
  for (const dir of Object.values(profile)) mkdirSync(dir, { recursive: true });
  const env = {
    PATH: pathDirs.filter(Boolean).join(path.delimiter),
    ...profile,
    CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ...(noacgUrl ? { NOACG_URL: noacgUrl } : {}),
  };
  if (platform === 'win32') for (const name of WINDOWS_PASSTHROUGH) if (from[name] !== undefined && env[name] === undefined) env[name] = from[name];
  assertNoKeys(env);
  return env;
}

/** Refuse an environment carrying anything named like a key. The token we put there is the one exception. */
export function assertNoKeys(env) {
  const bad = Object.keys(env).filter((name) => FORBIDDEN.test(name));
  if (bad.length) throw new Error(`refusing to start a subscription child with ${bad.join(', ')} in its environment`);
}

/** The `claude` executable on our PATH, and the directory it lives in. */
export function claudeExecutable() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8', windowsHide: true });
  const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (r.status !== 0 || !first) throw new Error('`claude` is not on PATH - the subscription stages drive Claude Code headless');
  return first;
}

/** How to run `exe` with `args`: a .cmd shim on Windows goes through cmd.exe, anything else directly. */
export function invocation(exe, args) {
  return /\.(cmd|bat)$/i.test(exe) ? { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', exe, ...args] } : { file: exe, args };
}

/**
 * `claude auth status` in the child's environment: refuse unless it is the subscription.
 * Returns the parsed status. `run` is injectable so the refusal can be tested without Claude Code.
 */
export function checkSubscriptionAuth({ claude, env, run = spawnSync }) {
  const { file, args } = invocation(claude, ['auth', 'status']);
  const r = run(file, args, { env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  let status = null;
  try {
    status = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  if (!status || status.loggedIn !== true || status.authMethod !== 'oauth_token') {
    throw new Error(`claude auth status in the subscription environment did not report the OAuth token (${status ? `loggedIn ${status.loggedIn}, authMethod ${status.authMethod}` : (r.stderr || r.stdout || 'no output').toString().slice(0, 200)}); nothing was started`);
  }
  return status;
}

/** A child that hit the subscription's usage limit says when it resets: pause until then. */
export function usageLimit(result, now = Date.now()) {
  const text = `${result?.result ?? ''} ${result?.stderr ?? ''}`;
  // Claude Code has said both "Claude AI usage limit reached|<epoch>" and, by 2.1.296, "You've hit
  // your session limit · resets 12:20am (Europe/Kyiv)".
  if (!/usage limit|rate limit|session limit|hit your [a-z ]*limit/i.test(text)) return null;
  const epoch = /\|(\d{10})\b/.exec(text);
  if (epoch) return { resetsAt: new Date(Number(epoch[1]) * 1000).toISOString() };
  const clock = /resets (\d{1,2})(?::(\d{2}))?\s*([ap]m)\s*\(([^)]+)\)/i.exec(text);
  return { resetsAt: clock ? nextLocalTime({ hour: (Number(clock[1]) % 12) + (clock[3].toLowerCase() === 'pm' ? 12 : 0), minute: Number(clock[2] ?? 0), timeZone: clock[4], now }) : null };
}

/** The next instant, within a day of `now`, whose wall clock in `timeZone` reads hour:minute. */
export function nextLocalTime({ hour, minute, timeZone, now = Date.now() }) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    return null;
  }
  const want = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const start = Math.ceil(now / 60_000) * 60_000;
  for (let t = start; t < start + 25 * 3_600_000; t += 60_000) if (fmt.format(t) === want) return new Date(t).toISOString();
  return null;
}

/** How long a stage paused by the usage limit waits: until the reset and a minute, or 15 minutes when no reset was given. */
export function pauseMs(paused, now = Date.now()) {
  return paused?.resetsAt ? Math.max(60_000, Date.parse(paused.resetsAt) - now + 60_000) : 15 * 60_000;
}

/** Run one `claude -p` child: the prompt on stdin, JSON out. */
export function runClaude({ claude, args, env, cwd, input, timeoutMs, run = spawnSync }) {
  assertNoKeys(env);
  const { file, args: argv } = invocation(claude, ['-p', '--output-format', 'json', ...args]);
  const started = Date.now();
  return readRun(run(file, argv, { cwd, env, input, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }), started);
}

/** `runClaude` without blocking, so several judgements run at once. `run` may return a promise. */
export async function runClaudeAsync({ claude, args, env, cwd, input, timeoutMs, run = spawnAsync }) {
  assertNoKeys(env);
  const { file, args: argv } = invocation(claude, ['-p', '--output-format', 'json', ...args]);
  const started = Date.now();
  return readRun(await run(file, argv, { cwd, env, input, encoding: 'utf8', timeout: timeoutMs, windowsHide: true }), started);
}

/** `spawnSync`'s result shape, from a child that does not block the event loop. */
export function spawnAsync(file, args, { input, timeout, ...opts }) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let error = null;
    let done = false;
    const finish = (status, signal) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ status, signal, error, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    };
    const timer = timeout ? setTimeout(() => {
      error = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      child.kill();
      // A grandchild behind a .cmd shim can hold the pipes open after the kill: answer anyway.
      setTimeout(() => finish(null, 'SIGTERM'), 5000).unref();
    }, timeout) : null;
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      error = e;
    });
    child.on('close', finish);
    // A child that exits before reading its prompt closes stdin under us: its exit says what happened.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
  });
}

function readRun(r, started) {
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* a timeout leaves no json */
  }
  const out = {
    exit: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT' || r.signal != null,
    ms: Date.now() - started,
    sessionId: json?.session_id ?? null,
    turns: json?.num_turns ?? null,
    notionalUsd: json?.total_cost_usd ?? null,
    isError: json?.is_error ?? null,
    result: typeof json?.result === 'string' ? json.result.slice(0, 4000) : null,
    stderr: (r.stderr || '').slice(-2000),
    stdout: r.stdout || '',
  };
  // Only a child that failed can have hit the limit: a delivered session's summary may well say
  // "limit reached" about the graphic it made.
  out.paused = out.isError || (out.exit !== 0 && out.exit !== null) || out.timedOut ? usageLimit(out) : null;
  return out;
}
