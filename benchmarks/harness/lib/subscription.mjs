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

import { spawnSync } from 'node:child_process';
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
export function usageLimit(result) {
  const text = `${result?.result ?? ''} ${result?.stderr ?? ''}`;
  if (!/usage limit|rate limit/i.test(text)) return null;
  const epoch = /\|(\d{10})\b/.exec(text);
  return { resetsAt: epoch ? new Date(Number(epoch[1]) * 1000).toISOString() : null };
}

/** Run one `claude -p` child: the prompt on stdin, JSON out. */
export function runClaude({ claude, args, env, cwd, input, timeoutMs, run = spawnSync }) {
  assertNoKeys(env);
  const { file, args: argv } = invocation(claude, ['-p', '--output-format', 'json', ...args]);
  const started = Date.now();
  const r = run(file, argv, { cwd, env, input, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
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
