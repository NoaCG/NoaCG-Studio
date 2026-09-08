#!/usr/bin/env node
/**
 * THE HARNESS'S OWN LIVE-SESSION INVENTORY - the third liveness signal.
 *
 *   node scripts/claude-agents.mjs            # what Claude Code says is running right now
 *   node scripts/claude-agents.mjs --json     # the rows, unchanged, for a script
 *
 * WHY A THIRD SIGNAL. The night loop has two instruments and both are inferences from files on
 * disk, and both say so in their own headers. `blocked-sessions.mjs` reads a transcript, finds a
 * tool call with no result, and states plainly that it cannot tell a permission prompt from a
 * session that died mid-call from a call that is still running. `session-liveness.mjs` reads
 * transcript mtimes and measured its own by-name lookup missing sixteen of nineteen agent
 * worktrees, because a worktree-isolated subagent files its transcript under the PARENT session's
 * directory. Neither can see a PROCESS, because until now nothing exposed one.
 *
 * `claude agents --json` does. It needs no terminal, answers in well under a second, and returns
 * one row per live session: `pid`, `cwd`, `sessionId`, `name`, and - on background sessions - a
 * `status`, plus `waitingFor` when that status is `waiting`. That turns two of the three causes
 * above into separate answers rather than one shrug: a wait held by a session the harness still
 * lists is a prompt or a slow call, and a wait held by a session it does not list is a session
 * that is no longer running.
 *
 * WHAT IT STILL CANNOT SEE, stated first because everything downstream is built on it. An
 * Agent-tool subagent is not a process of its own, so it never appears here; a Codex session, an
 * `agy` run and a plain shell never appear either; and a session on another machine cannot. So
 * this is a signal ADDED to the two file-based ones, never a replacement for either, and the one
 * verdict it may assert on its own is the POSITIVE one - "something is running there".
 *
 * THE ABSENT VERDICT IS DELIBERATELY WEAK. `absent` means the inventory answered, listed at least
 * one session, and none of them matched - which is good evidence and not proof. It is reported as
 * "no live session in the harness inventory", never as "this session died", because a wrong death
 * notice to a human is the one cost this cannot take back. Operationally the loop already treats
 * all three causes the same way (report it, count the slot free, never kill it), so a wrong
 * `absent` changes the wording of a report line and frees a slot the contract would have freed
 * anyway.
 *
 * CAPABILITY, NEVER VERSION. Nothing here asks which Claude Code is installed. It runs the
 * command; if the binary is missing, the subcommand is not understood, the call times out, or the
 * output is not a JSON array, the answer is `available: false` and every caller degrades to
 * exactly the behaviour it had before this file existed. The one field whose presence varies -
 * `status` - is probed on the rows that came back rather than assumed from a release note.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The inventory is a fast local read; anything slower than this is a broken daemon, not an answer. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** The fixed argv. No caller supplies any part of it, which is what makes the shell fallback safe. */
export const AGENTS_ARGS = Object.freeze(['agents', '--json']);

// ── Pure decisions ───────────────────────────────────────────────────────────────────────────────

/** One spelling for a path, so a Windows drive letter or a trailing slash cannot split a match. */
export function normalisePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const resolved = path.resolve(value).replaceAll('\\', '/').toLowerCase();
  return resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved;
}

/**
 * The rows out of the command's stdout, or null when it did not answer with an array.
 *
 * A launcher is free to print a warning line first, so the whole buffer is tried and then the span
 * from the first `[` to the last `]`. Anything else is treated as "the command did not answer",
 * never as an empty inventory - an empty array and an unparseable one mean opposite things here.
 */
export function parseAgents(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  const attempt = (candidate) => {
    if (!candidate || candidate[0] !== '[') return null;
    try {
      const value = JSON.parse(candidate);
      return Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };
  const whole = attempt(text);
  if (whole) return whole;
  // The span fallback survives a launcher's warning line, and must not reach INSIDE an object:
  // `{"rows":[]}` would otherwise be read as an empty inventory, which is the one answer that
  // must never be manufactured. So the array has to begin a line of its own.
  const first = text.indexOf('\n[');
  const last = text.lastIndexOf(']');
  return first === -1 || last <= first ? null : attempt(text.slice(first + 1, last + 1));
}

/**
 * What this installation's inventory actually carries, read off the rows themselves. `status` is
 * the field that varies by build and by session kind, and a caller that assumes it is there
 * silently reports every session as not-waiting.
 */
export function agentsCapability(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    rows: list.length,
    status: list.some((row) => sessionState(row).status !== null),
    waitingFor: list.some((row) => sessionState(row).waitingFor !== null),
  };
}

/**
 * The session a transcript path belongs to. Claude Code files an ordinary session at
 * `<project>/<session-id>.jsonl` and a subagent at `<project>/<session-id>/subagents/<agent>.jsonl`,
 * so a subagent resolves to its PARENT - which is right, because the parent is the process, and a
 * subagent cannot outlive it.
 */
export function sessionIdFromTranscript(file) {
  if (typeof file !== 'string' || !file.trim()) return null;
  const parts = file.replaceAll('\\', '/').split('/').filter(Boolean);
  const index = parts.lastIndexOf('subagents');
  if (index > 0) return parts[index - 1] || null;
  const name = parts.at(-1);
  return name?.endsWith('.jsonl') ? name.slice(0, -'.jsonl'.length) : null;
}

/**
 * Is this directory the same as that one, or inside it? Both sides go through `normalisePath`, so a
 * drive letter cased differently, a backslash or a trailing slash cannot decide the answer - and
 * the boundary is a `/`, so a sibling checkout called `NoaCG-Studio-old` is not inside
 * `NoaCG-Studio`.
 *
 * Here rather than at each call site because the cost of getting it wrong is one-directional: every
 * caller is deciding something about live sessions from a path, and a test that matches nothing
 * prints a confident all-clear on a machine full of them.
 */
export function isUnder(cwd, root) {
  const at = normalisePath(cwd);
  const under = normalisePath(root);
  if (!at || !under) return false;
  return at === under || at.startsWith(`${under}/`);
}

/**
 * A row's `status` and `waitingFor` as either a non-empty string or null - the one guard, written
 * once. The field varies by build and by session kind (see `agentsCapability`), so every reader has
 * to make the same check, and four copies of it was three too many.
 */
export function sessionState(row) {
  const text = (value) => (typeof value === 'string' && value ? value : null);
  return { status: text(row?.status), waitingFor: text(row?.waitingFor) };
}

/** The rows indexed both ways a caller can ask for them. */
export function buildIndex(rows) {
  const bySession = new Map();
  const byCwd = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.sessionId === 'string' && row.sessionId) bySession.set(row.sessionId, row);
    const cwd = normalisePath(row.cwd);
    if (cwd) byCwd.set(cwd, [...(byCwd.get(cwd) ?? []), row]);
  }
  return { bySession, byCwd };
}

/**
 * Is anything running for this session or in this directory?
 *
 * `unknown` when the inventory did not answer, and ALSO when it answered empty - an empty list is
 * far more likely to be a daemon that is not talking than a machine on which every session died,
 * and the difference decides whether a report says "gone".
 *
 * A cwd match counts a session running in the directory OR in a subdirectory of it, so a worktree
 * asked about its own path sees a session that has changed into a folder inside it.
 */
export function livenessFor({ sessionId = null, cwd = null } = {}, index, { available = true } = {}) {
  if (!available || !index || index.bySession.size + index.byCwd.size === 0) {
    return { verdict: 'unknown', row: null, why: 'the harness inventory did not answer' };
  }
  if (sessionId && index.bySession.has(sessionId)) {
    return { verdict: 'live', row: index.bySession.get(sessionId), why: 'the harness lists this session' };
  }
  for (const [at, rows] of index.byCwd) {
    if (!isUnder(at, cwd)) continue;
    return { verdict: 'live', row: rows[0], why: `a session is running in ${rows[0].cwd}` };
  }
  return {
    verdict: 'absent',
    row: null,
    why: 'no live session in the harness inventory holds it',
  };
}

/** One clause a report can print. Never the words "died" or "crashed" - see the header. */
export function describeLiveness({ verdict, row }) {
  if (verdict === 'live') {
    const { status, waitingFor } = sessionState(row);
    if (status && waitingFor) return `its process is running (pid ${row.pid}, ${status}: ${waitingFor})`;
    if (status) return `its process is running (pid ${row.pid}, ${status})`;
    return `its process is running (pid ${row?.pid ?? '?'})`;
  }
  if (verdict === 'absent') return 'no live session in the harness inventory holds it';
  return 'process liveness unknown (the harness inventory did not answer)';
}

// ── The side-effecting shell ─────────────────────────────────────────────────────────────────────

/**
 * Where the Claude Code executable is. `CLAUDE_BIN` overrides everything.
 *
 * Node refuses to spawn a `.cmd` or `.bat` without a shell, and this machine has both an npm shim
 * and a native build on PATH, so a directly spawnable executable is preferred and the launcher is
 * the fallback. Both read the same session state under `~/.claude`, so either answers correctly.
 */
export function claudeCandidates({ env = process.env, platform = process.platform } = {}) {
  if (env.CLAUDE_BIN) return [{ command: env.CLAUDE_BIN, shell: false }];
  const windows = platform === 'win32';
  const separator = windows ? ';' : ':';
  const join = windows ? path.win32.join : path.posix.join;
  const dirs = (env.PATH || env.Path || '').split(separator).filter(Boolean);
  if (!windows) return dirs.map((dir) => ({ command: join(dir, 'claude'), shell: false }));
  // Extension-major: every real executable anywhere on PATH beats every launcher anywhere on it.
  return [
    ...dirs.map((dir) => ({ command: join(dir, 'claude.exe'), shell: false })),
    ...dirs.flatMap((dir) => ['claude.cmd', 'claude.bat'].map((name) => ({ command: join(dir, name), shell: true }))),
  ];
}

export function resolveClaude({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  for (const candidate of claudeCandidates({ env, platform })) {
    if (exists(candidate.command)) return candidate;
  }
  return null;
}

/**
 * The inventory, as `{ available, rows, capability, why }`. Never throws, and never reports a
 * failure as an empty inventory: `available: false` is the only way a caller learns nothing.
 */
export function readInventory({
  env = process.env,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  run = spawnSync,
  resolve = resolveClaude,
} = {}) {
  const unavailable = (why) => ({ available: false, rows: [], capability: agentsCapability([]), why });
  const binary = resolve({ env, platform });
  if (!binary) return unavailable('no Claude Code executable on PATH (set CLAUDE_BIN to point at one)');
  let result;
  try {
    result = run(binary.command, AGENTS_ARGS, {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      shell: binary.shell === true,
    });
  } catch (error) {
    return unavailable(`could not run the inventory: ${error?.message ?? error}`);
  }
  if (result?.error) return unavailable(`could not run the inventory: ${result.error.message ?? result.error}`);
  if (result?.signal) return unavailable(`the inventory did not finish within ${Math.round(timeoutMs / 1000)}s`);
  if (result?.status !== 0) {
    const detail = String(result?.stderr ?? '').trim().split('\n')[0] || `exit ${result?.status}`;
    return unavailable(`the inventory command failed: ${detail}`);
  }
  const rows = parseAgents(result.stdout);
  if (rows === null) return unavailable('the inventory did not answer with a JSON array');
  return { available: true, rows, capability: agentsCapability(rows), why: null };
}

/**
 * One inventory read per process. Every caller asks the same question about a different worktree
 * and the answer is the same for all of them; re-spawning per worktree would be the slowest thing
 * a sweep does.
 */
let cached = null;
export function resetInventoryCache() {
  cached = null;
}

export function inventory(options = {}) {
  if (options.inventory) return options.inventory; // injected by a test, never cached
  if (cached === null) cached = readInventory(options);
  return cached;
}

/** The indexed inventory, cached alongside it. */
export function inventoryIndex(options = {}) {
  const read = inventory(options);
  return { ...read, index: buildIndex(read.rows) };
}

function report(argv) {
  const read = readInventory();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ available: read.available, why: read.why, capability: read.capability, rows: read.rows }, null, 2)}\n`);
    return read.available ? 0 : 1;
  }
  if (!read.available) {
    process.stdout.write(`Live-session inventory unavailable: ${read.why}\n`);
    return 1;
  }
  if (!read.rows.length) {
    process.stdout.write('The harness reports no live sessions. Treat that as unknown, not as none.\n');
    return 0;
  }
  process.stdout.write(`${read.rows.length} live session(s) the harness knows about:\n\n`);
  for (const row of read.rows) {
    const { status, waitingFor } = sessionState(row);
    const state = status ? `  ${status}${waitingFor ? ` (${waitingFor})` : ''}` : '';
    process.stdout.write(`  ${row.name ?? row.sessionId ?? 'unnamed'}  ${row.kind ?? '?'}  pid ${row.pid ?? '?'}${state}\n`);
    process.stdout.write(`    ${row.cwd ?? 'no working directory recorded'}\n`);
  }
  const missing = read.capability.status ? '' : '\nNo row carried a status; this build or these session kinds do not publish one.\n';
  process.stdout.write(missing);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(report(process.argv.slice(2)));
}
