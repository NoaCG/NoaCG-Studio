// WHAT AN AGENT LEFT RUNNING, AND CLOSING IT (docs/work-specs/agent-lifecycle/spec.md, points 3-5).
//
// Two callers, one judgement:
//   - the worktree sweep, BEFORE it removes a landed worktree, closes every process running from it
//     (`closeWorktreeProcesses`): dev servers, test browsers, shell loops. A process left behind
//     both holds memory and holds the folder, which is why the removal used to come back "in use";
//   - the unattended sweep closes what agents ABANDONED (`closeAbandonedProcesses`): a process an
//     agent session started, once that session and its worktree have both been quiet for an hour.
//     On 2026-10-09 one `until docker info; do sleep 5; done` had polled for 14 hours.
//
// WHERE A PROCESS RUNS FROM is its working directory, read from the process itself. A command line
// does not carry it - `bash -c "until docker info; ..."` names no folder at all - and it is exactly
// what Windows refuses to rename a folder under. A process whose directory cannot be read (another
// user, elevated, 32-bit) falls back to a worktree path in its command line, and one whose directory
// is outside every worktree (a browser that moved to its own folder) belongs where its parent does.
//
// WHO STARTED IT is read by walking up its parents, and the walk is what keeps this conservative:
//   - a Claude Code or Codex session reached through one of its SHELLS (the Bash or PowerShell
//     tool): an agent started it, and it may be closed;
//   - a session reached any other way: the session's own helper (an MCP server, a language
//     server), kept - and so is the session process itself;
//   - an exempt process on the way up (EXEMPT below): kept, with its reason;
//   - a chain that ends at a dead parent, in an agent worktree: orphaned by whatever started it,
//     and may be closed. In the primary checkout an orphan is kept: that checkout is shared, and
//     nothing there says an agent made it;
//   - anything else (the owner's terminal, a scheduled task, a service): kept.
// The sweep's own process and what it started are never judged at all.
//
// A CHECK THAT FAILED NEVER READS AS "NOTHING RUNNING". A process list that could not be read is
// `{ ok: false }`, and every caller then closes nothing and removes nothing (#805 is that bug
// class). Off Windows there is no list (`supported: false`): the removal behaves as it did before.
//
// The kill is pinned to the identity that was judged: pid AND start time, checked through the same
// handle that terminates, so a pid Windows has since handed to another process is never touched.

import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { believableParent, withinRoot as within } from './e2e-runs.mjs';
import { sessionHold } from './session-liveness.mjs';
import { lastGitActivityMs, worktreeRoots } from './worktree-cleanup-lib.mjs';

/** A process an agent started is abandoned once its session and worktree are this quiet. */
export const ABANDONED_AFTER_MINUTES = 60;

const NO_INVENTORY = Object.freeze({ available: false, rows: [] });

/** Lower-case path with forward slashes and no trailing slash, for comparison. */
function key(path) {
  return resolve(path).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

const base = (p) => String(p?.name ?? '').toLowerCase();
const text = (p) => `${p?.exe ?? ''} ${p?.command ?? ''}`;

// --- Who is who ---------------------------------------------------------------------------------

/** The shells an agent's command tool runs in. `cmd.exe` is not one: it is how MCP servers start. */
const SHELLS = new Set(['bash', 'bash.exe', 'sh', 'sh.exe', 'zsh', 'zsh.exe', 'dash', 'dash.exe', 'powershell.exe', 'pwsh', 'pwsh.exe']);

/**
 * A shell a session keeps open and feeds commands to, rather than one started per command: it
 * belongs to the session, and only what runs inside it was started by an agent.
 */
function persistentShell(p) {
  if (!SHELLS.has(base(p))) return false;
  // Persistent means nothing to run: no argument but the flags of an interactive shell. `bash -lc`,
  // `pwsh -enc …` and `powershell -File x` all run something and end.
  const args = String(p.command ?? '').replace(/^\s*("[^"]*"|\S+)/, '').trim().split(/\s+/).filter(Boolean);
  return args.every((arg) => /^-(?:nologo|noprofile|noexit|noninteractive|i|l|-login|login)$/i.test(arg));
}

/** The desktop apps the owner works in. They host sessions, but they are applications, not agents. */
const DESKTOP_APP = /[/\\]windowsapps[/\\](?:claude_|openai\.)/i;

/**
 * A Claude Code or Codex session process: the CLI the desktop app runs per session, a terminal
 * install, the Codex app server and CLI, and Codex's sandbox and runner helpers.
 */
export function isAgentSession(p) {
  const name = base(p);
  // The desktop app hosts its sessions' PowerShell tool in a node service of its own.
  if (DESKTOP_APP.test(text(p))) return name === 'claude.exe' && /--utility-sub-type=node\.mojom\.NodeService/i.test(p.command ?? '');
  if (name === 'claude.exe' || name === 'claude') return !/\s--type=/.test(p.command ?? '');
  if (/^codex(?:-[\w-]+)?(?:\.exe)?$/.test(name)) return true;
  if (name === 'node.exe' || name === 'node') {
    return /@anthropic-ai[/\\]claude-code[/\\]|@openai[/\\]codex[/\\]/i.test(p.command ?? '');
  }
  return false;
}

/**
 * THE EXEMPTIONS: never closed, whoever started them, and nothing below one is either. A short
 * written list on purpose (spec point 5); adding to it is a reviewed change to this file. Matching
 * is by executable name or path, never by "looks idle".
 */
export const EXEMPT = Object.freeze([
  {
    id: 'queue-runners',
    why: 'the merge queue and job queue runners',
    match: (p) => /scripts[/\\]+jobs\.mjs["']?\s(?:.*\s)?--runner\b|scripts[/\\]+land-watch\.mjs/i.test(p.command ?? ''),
  },
  {
    id: 'orchestration',
    why: 'a running orchestrator or plan run: its watchers and its Codex delegations, which their own reaper closes once they finish',
    match: (p) => /scripts[/\\]+(?:wave-[\w-]+|relay|ci-watch|codex-rescue)\.mjs|[/\\]codex-companion[/\\]/i.test(p.command ?? ''),
  },
  {
    id: 'worktree-sweep',
    why: 'the worktree sweep itself',
    match: (p) => /scripts[/\\]+cleanup-worktrees\.mjs/i.test(p.command ?? ''),
  },
  {
    id: 'owner-apps',
    why: "the owner's own applications: browsers, OBS, vMix, CasparCG, Companion, editors, terminals and the desktop apps",
    match: (p) => {
      const name = base(p);
      // A browser is the owner's unless it is a test browser from Playwright's own cache.
      if (/^(?:chrome|msedge|firefox|brave|opera)\.exe$/.test(name)) return !/[/\\]ms-playwright[/\\]/i.test(text(p));
      return OWNER_APPS.has(name) || DESKTOP_APP.test(text(p));
    },
  },
]);

const OWNER_APPS = new Set([
  'obs64.exe', 'obs32.exe', 'obs.exe', 'vmix64.exe', 'vmix.exe', 'casparcg.exe', 'scanner.exe', 'companion.exe',
  'code.exe', 'cursor.exe', 'windsurf.exe', 'zed.exe', 'devenv.exe', 'idea64.exe', 'webstorm64.exe',
  'sublime_text.exe', 'notepad++.exe', 'notepad.exe',
  'windowsterminal.exe', 'wt.exe', 'openconsole.exe', 'explorer.exe', 'chatgpt.exe', 'docker desktop.exe',
]);

/** Windows itself and what it schedules: never an agent's, whatever its directory. */
const SYSTEM = new Set([
  'system', 'system idle process', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe',
  'svchost.exe', 'lsass.exe', 'taskhostw.exe', 'sihost.exe', 'userinit.exe', 'runtimebroker.exe',
]);

function exemption(p) {
  if (SYSTEM.has(base(p))) return 'part of Windows';
  return EXEMPT.find((entry) => entry.match(p))?.why ?? null;
}

// --- The judgement (pure) -----------------------------------------------------------------------

/**
 * Judge every process in `processes` against the checkouts in `roots` (primary first).
 *
 * Returns a Map pid -> `{ p, home, verdict, why, root }`:
 *   - `home`: the checkout it runs from (the deepest root holding it), or null;
 *   - `verdict`: 'agent' (an agent session's command started it), 'orphan' (its starter is gone),
 *     'keep' (with `why`) or 'self' (the sweep's own line, never judged);
 *   - `root`: for 'agent' and 'orphan', the top of what was started - the tool shell, or the
 *     oldest process left in the orphaned chain. Its start time is the tree's age.
 */
export function judgeProcesses(processes, { roots = [], self = process.pid } = {}) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const parentOf = (p) => {
    const parent = byPid.get(p.ppid);
    return believableParent(parent, p) ? parent : null;
  };
  // The sweep's own line: itself up to the session it runs in, never above that session. Above it
  // are the desktop app, a terminal, explorer - shared with the owner's own work.
  // Those ancestors themselves (the terminal the session runs in) are never judged either.
  const selfLine = new Set();
  const ancestors = new Set();
  let below = true;
  for (let at = byPid.get(self); at && !ancestors.has(at.pid); at = parentOf(at)) {
    ancestors.add(at.pid);
    if (below) selfLine.add(at.pid);
    if (isAgentSession(at)) below = false;
  }
  const ordered = [...roots].sort((a, b) => key(b).length - key(a).length);
  const rootOf = (path) => (path ? ordered.find((root) => within(path, root)) ?? null : null);
  const namedRoot = (command) => {
    const lower = String(command ?? '').replaceAll('\\', '/').toLowerCase();
    return ordered.find((root) => lower.includes(key(root))) ?? null;
  };

  const homes = new Map();
  const homeOf = (p, depth = 0) => {
    if (homes.has(p.pid)) return homes.get(p.pid);
    let home = p.cwd ? rootOf(p.cwd) : namedRoot(p.command);
    if (!home && depth < 64) {
      const parent = parentOf(p);
      home = parent ? homeOf(parent, depth + 1) : null;
    }
    homes.set(p.pid, home);
    return home;
  };

  const judged = new Map();
  for (const p of processes) {
    const home = homeOf(p);
    const out = (verdict, why = null, root = null, session = null) => judged.set(p.pid, { p, home, verdict, why, root, session });
    if (ancestors.has(p.pid)) {
      out('self', 'the sweep itself');
      continue;
    }
    const line = [p];
    let decided = false;
    for (let at = p, steps = 0; at && steps < 64; steps += 1) {
      // Below the sweep, or below one of the shells it runs in (their console host, a sibling in
      // the same command): its own line, whatever the rest of the session is doing.
      if (at.pid === self || (at !== p && selfLine.has(at.pid) && !isAgentSession(at))) {
        out('self', 'started by the sweep itself');
        decided = true;
        break;
      }
      if (isAgentSession(at)) {
        const shell = line.at(-2);
        // What the session the sweep runs in keeps for itself is the sweep's own line too: a self
        // cleanup must not be refused by its own MCP servers.
        const own = (why) => out(selfLine.has(at.pid) ? 'self' : 'keep', why);
        if (at === p) out('keep', 'a Claude Code or Codex session itself');
        else if (!SHELLS.has(base(shell))) own('what a session runs for itself, such as its MCP servers');
        else if (!persistentShell(shell)) out('agent', null, shell, at);
        else if (shell === p) own("a session's own shell");
        else out('agent', null, line.at(-3), at);
        decided = true;
        break;
      }
      const exempt = exemption(at);
      if (exempt) {
        out('keep', exempt);
        decided = true;
        break;
      }
      const parent = parentOf(at);
      if (!parent) {
        // A dead parent is an orphan; pid 0 or 4 above is the top of the machine, which only
        // Windows' own processes reach.
        if (at.ppid === 0 || at.ppid === 4) out('keep', 'not started by an agent');
        else out('orphan', null, at);
        decided = true;
        break;
      }
      line.push(parent);
      at = parent;
    }
    if (!decided) out('keep', 'its parents could not be followed');
  }
  return judged;
}

/** How a closable entry is reported and closed: who, and the identity the kill is pinned to. */
function entry(judgement, extra = {}) {
  const { p, home, why } = judgement;
  return { pid: p.pid, createdMs: p.createdMs ?? null, name: p.name ?? '', command: String(p.command ?? '').slice(0, 300), home, why, ...extra };
}

/** Roots first, so a loop is gone before the children it would start again. */
function rootsFirst(entries, judged) {
  const depth = (pid) => {
    let n = 0;
    for (let at = judged.get(pid)?.p; at && n < 64; n += 1) {
      const parent = judged.get(at.ppid)?.p;
      if (!parent || !believableParent(parent, at) || judged.get(parent.pid)?.verdict !== judged.get(pid)?.verdict) break;
      at = parent;
    }
    return n;
  };
  return [...entries].sort((a, b) => depth(a.pid) - depth(b.pid));
}

/**
 * What runs from `worktree`: `{ close, keep }`. Everything an agent started or that was orphaned
 * there goes; anything kept (the owner's terminal, a session sitting in it) is named, so the caller
 * can leave the worktree in place rather than pull it out from under somebody.
 */
export function worktreeProcesses(processes, worktree, { roots = [worktree], self = process.pid } = {}) {
  const judged = judgeProcesses(processes, { roots: roots.some((r) => key(r) === key(worktree)) ? roots : [...roots, worktree], self });
  const close = [];
  const keep = [];
  for (const judgement of judged.values()) {
    if (!judgement.home || key(judgement.home) !== key(worktree) || judgement.verdict === 'self') continue;
    if (judgement.verdict === 'keep') keep.push(entry(judgement));
    else close.push(entry(judgement));
  }
  return { close: rootsFirst(close, judged), keep };
}

/**
 * What agents abandoned: processes an agent started (or that were orphaned in an agent worktree)
 * whose tree has run for `minutes` and whose checkout is quiet. `quiet(home)` answers
 * `{ quiet, why }` and is asked once per checkout; an answer that is not a clear `quiet: true`
 * keeps everything there.
 */
export function abandonedProcesses(
  processes,
  { roots = [], primaryRoot = roots[0] ?? null, self = process.pid, now = Date.now(), minutes = ABANDONED_AFTER_MINUTES, quiet = () => ({ quiet: false }) } = {},
) {
  const judged = judgeProcesses(processes, { roots, self });
  const answers = new Map();
  const isQuiet = (home) => {
    if (!answers.has(home)) {
      let answer;
      try {
        answer = quiet(home);
      } catch (error) {
        answer = { quiet: false, why: error?.message ?? String(error) };
      }
      answers.set(home, answer?.quiet === true);
    }
    return answers.get(home);
  };
  const close = [];
  for (const judgement of judged.values()) {
    const { verdict, home, root } = judgement;
    if ((verdict !== 'agent' && verdict !== 'orphan') || !home) continue;
    if (verdict === 'orphan' && primaryRoot && key(home) === key(primaryRoot)) continue;
    const started = root?.createdMs;
    if (!Number.isFinite(started) || now - started < minutes * 60_000) continue;
    if (!isQuiet(home)) continue;
    // The session that started it must be quiet too, wherever it works from: an orchestrator in
    // the primary checkout that started a server in a worktree is still using it.
    const sessionHome = judgement.session ? judged.get(judgement.session.pid)?.home : null;
    if (sessionHome && !isQuiet(sessionHome)) continue;
    close.push(entry(judgement, { ageMinutes: Math.floor((now - started) / 60_000) }));
  }
  return rootsFirst(close, judged);
}

// --- Quiet: no session and no git activity for the window --------------------------------------

/** Where Codex writes its session logs: one JSONL per session, its first line naming the cwd. */
export function codexSessionsRoot({ env = process.env, home = homedir() } = {}) {
  return join(env.CODEX_HOME || join(home, '.codex'), 'sessions');
}

/**
 * The working directory of every Codex session written to within `windowMs`, with when, as
 * `[{ cwd, mtimeMs }]`. Codex sessions leave no Claude transcript, so this is the only sign one is
 * still working. Unreadable files are skipped; a missing folder is no sessions.
 */
export function recentCodexSessions({ root = codexSessionsRoot(), now = Date.now(), windowMs = ABANDONED_AFTER_MINUTES * 60_000 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    let names;
    try {
      names = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of names) {
      const path = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (depth < 4) walk(path, depth + 1);
        continue;
      }
      if (!dirent.name.endsWith('.jsonl')) continue;
      let mtimeMs;
      try {
        ({ mtimeMs } = statSync(path));
      } catch {
        continue;
      }
      if (now - mtimeMs > windowMs) continue;
      // A recent session whose directory cannot be read is reported as one in an unknown place,
      // which keeps every checkout from reading as quiet.
      found.push({ cwd: firstLineCwd(path), mtimeMs });
    }
  };
  walk(root, 0);
  return found;
}

/** The `cwd` of a session log's first line. That line carries the instructions, so it is long. */
function firstLineCwd(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const buffer = Buffer.alloc(1024 * 1024);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    const line = buffer.toString('utf8', 0, read).split('\n')[0];
    const found = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(line);
    const cwd = found ? JSON.parse(found[1]) : null;
    return typeof cwd === 'string' && cwd ? cwd : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Has `path` been quiet for `minutes`: no Claude Code transcript, no Codex session log and no git
 * HEAD movement in it? `{ quiet, why }`. A LIVE session process is deliberately not a reason to
 * stay: the desktop app keeps idle sessions open for days, and the 14-hour loop belonged to one.
 * The session process itself is never closed (it is kept above); only what it left running is.
 */
export function worktreeQuiet(
  path,
  { now = Date.now(), minutes = ABANDONED_AFTER_MINUTES, liveness = {}, codexSessions = null, gitActivity = lastGitActivityMs } = {},
) {
  // Every signal that could not be read answers "not quiet": a check that failed is never silence.
  const hold = sessionHold(path, { ...liveness, inventory: NO_INVENTORY, minIdleMinutes: minutes, now });
  if (hold.busy) return { quiet: false, why: hold.why };
  if (hold.activity?.available === false) return { quiet: false, why: 'the session transcripts could not be read' };
  const codex = (codexSessions ?? recentCodexSessions({ now, windowMs: minutes * 60_000 })).find(
    (session) => (session.cwd === null || within(session.cwd, path)) && now - session.mtimeMs < minutes * 60_000,
  );
  if (codex) return { quiet: false, why: codex.cwd ? 'a Codex session was active here within the hour' : 'a recent Codex session could not be read' };
  const lastGit = gitActivity(path);
  if (lastGit === null) return { quiet: false, why: 'its git activity could not be read' };
  if (now - lastGit < minutes * 60_000) {
    return { quiet: false, why: `its HEAD moved ${Math.floor((now - lastGit) / 60_000)} minute(s) ago` };
  }
  return { quiet: true, why: null };
}

// --- The machine: list and close (Windows) ------------------------------------------------------

// One compiled helper for both directions. Cwd reads the working directory out of the process's
// own parameters (PEB -> RTL_USER_PROCESS_PARAMETERS.CurrentDirectory, 64-bit layout); 32-bit and
// unreadable processes answer null. Close opens ONE handle, checks the start time through it, and
// terminates through the same handle, so nothing can swap the process in between.
const HELPER = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NoacgProcesses {
  [StructLayout(LayoutKind.Sequential)]
  struct Basic { public IntPtr ExitStatus; public IntPtr Peb; public IntPtr Affinity; public IntPtr Priority; public IntPtr Pid; public IntPtr ParentPid; }
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, ref Basic info, int len, out int ret);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr at, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr h, out bool wow);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr h, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  static byte[] Read(IntPtr h, IntPtr at, int n) {
    byte[] b = new byte[n]; IntPtr got;
    return ReadProcessMemory(h, at, b, (IntPtr)n, out got) && (long)got == n ? b : null;
  }
  public static string Cwd(int pid) {
    if (IntPtr.Size != 8) return null;
    IntPtr h = OpenProcess(0x1010, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      bool wow;
      if (!IsWow64Process(h, out wow) || wow) return null;
      Basic info = new Basic(); int ret;
      if (NtQueryInformationProcess(h, 0, ref info, Marshal.SizeOf(typeof(Basic)), out ret) != 0) return null;
      byte[] pp = Read(h, IntPtr.Add(info.Peb, 0x20), 8); if (pp == null) return null;
      byte[] us = Read(h, IntPtr.Add(new IntPtr(BitConverter.ToInt64(pp, 0)), 0x38), 16); if (us == null) return null;
      int len = BitConverter.ToUInt16(us, 0); if (len == 0) return null;
      byte[] s = Read(h, new IntPtr(BitConverter.ToInt64(us, 8)), len); if (s == null) return null;
      return Encoding.Unicode.GetString(s);
    } catch { return null; } finally { CloseHandle(h); }
  }
  public static string Close(int pid, long createdMs) {
    IntPtr h = OpenProcess(0x00101001, false, pid);
    if (h == IntPtr.Zero) return Marshal.GetLastWin32Error() == 87 ? "gone" : "denied";
    try {
      long created, exited, kernel, user;
      if (!GetProcessTimes(h, out created, out exited, out kernel, out user)) return "denied";
      if (Math.Abs((created - 116444736000000000L) / 10000L - createdMs) > 1000) return "gone";
      if (WaitForSingleObject(h, 0) == 0) return "gone";
      if (!TerminateProcess(h, 1)) return "denied";
      return WaitForSingleObject(h, 5000) == 0 ? "closed" : "still running";
    } finally { CloseHandle(h); }
  }
}
`;

function powershell(script, { run = spawnSync, timeoutMs = 60_000 } = {}) {
  const full = `$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @'\n${HELPER}\n'@\n${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  const res = run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (res?.error) return { ok: false, why: res.error.message ?? String(res.error) };
  if (res?.signal) return { ok: false, why: `PowerShell did not answer within ${Math.round(timeoutMs / 1000)}s` };
  if (res?.status !== 0) return { ok: false, why: String(res?.stderr ?? '').trim().split('\n')[0] || `PowerShell exited ${res?.status}` };
  return { ok: true, stdout: String(res.stdout ?? '') };
}

/**
 * Every process on the machine with its working directory: `{ ok, supported, processes, why }`.
 * `ok: false` is the only way a failure is reported; an empty list is never the answer to one.
 */
export function listProcesses({ platform = process.platform, run = spawnSync } = {}) {
  if (platform !== 'win32') return { ok: false, supported: false, processes: [], why: 'process listing is only implemented on Windows' };
  const script = [
    '$rows = foreach ($p in Get-CimInstance Win32_Process) {',
    '  $created = $null',
    '  if ($p.CreationDate) { $created = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }',
    '  [pscustomobject]@{ pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = $p.Name; exe = $p.ExecutablePath;',
    '    command = $p.CommandLine; createdMs = $created; cwd = [NoacgProcesses]::Cwd([int]$p.ProcessId) }',
    '}',
    '@($rows) | ConvertTo-Json -Depth 2 -Compress',
  ].join('\n');
  const res = powershell(script, { run });
  if (!res.ok) return { ok: false, supported: true, processes: [], why: `could not list processes: ${res.why}` };
  let rows;
  try {
    rows = JSON.parse(res.stdout);
  } catch {
    return { ok: false, supported: true, processes: [], why: 'could not list processes: the answer was not JSON' };
  }
  const processes = (Array.isArray(rows) ? rows : [rows])
    .filter((row) => Number.isInteger(row?.pid))
    .map((row) => ({
      pid: row.pid,
      ppid: Number(row.ppid),
      name: String(row.name ?? ''),
      exe: row.exe ?? null,
      command: row.command ?? '',
      createdMs: Number.isFinite(row.createdMs) ? row.createdMs : null,
      cwd: row.cwd ?? null,
    }));
  // A machine with no processes is a broken answer, not an idle machine.
  if (processes.length === 0) return { ok: false, supported: true, processes: [], why: 'could not list processes: the list was empty' };
  return { ok: true, supported: true, processes, why: null };
}

/**
 * Close `entries` (from `worktreeProcesses` / `abandonedProcesses`), in order, each only if it is
 * still the process that was judged. Returns `{ closed, failed }`; `gone` counts as closed.
 */
export function closeProcesses(entries, { platform = process.platform, run = spawnSync } = {}) {
  const pinned = entries.filter((e) => Number.isInteger(e.pid) && Number.isFinite(e.createdMs));
  const unpinned = entries.filter((e) => !pinned.includes(e)).map((e) => ({ ...e, result: 'no start time to check its identity against' }));
  if (pinned.length === 0) return { closed: [], failed: unpinned };
  if (platform !== 'win32') return { closed: [], failed: [...pinned.map((e) => ({ ...e, result: 'closing is only implemented on Windows' })), ...unpinned] };
  const calls = pinned.map((e) => `"${e.pid}=" + [NoacgProcesses]::Close(${e.pid}, ${Math.trunc(e.createdMs)})`).join('\n');
  const res = powershell(calls, { run });
  if (!res.ok) return { closed: [], failed: [...pinned.map((e) => ({ ...e, result: res.why })), ...unpinned] };
  const results = new Map(
    res.stdout.split(/\r?\n/).map((line) => /^(\d+)=(.*)$/.exec(line.trim())).filter(Boolean).map(([, pid, said]) => [Number(pid), said]),
  );
  const closed = [];
  const failed = [...unpinned];
  for (const e of pinned) {
    const said = results.get(e.pid) ?? 'no answer';
    (said === 'closed' || said === 'gone' ? closed : failed).push({ ...e, result: said });
  }
  return { closed, failed };
}

// --- What the sweep calls -----------------------------------------------------------------------

/**
 * Before `worktree` is removed: close what runs from it. `{ ok, supported, closed, kept, failed, why }`.
 * `ok: false` means leave the worktree where it is - something is kept there, a close failed, or
 * the processes could not be listed at all. Off Windows nothing is listed and the removal goes on
 * as it always did (`supported: false`).
 */
export function closeWorktreeProcesses(
  worktree,
  { primaryRoot = null, roots = primaryRoot ? worktreeRoots(primaryRoot) : [worktree], self = process.pid, list = listProcesses, close = closeProcesses } = {},
) {
  const listed = list();
  if (!listed.ok) {
    return listed.supported === false
      ? { ok: true, supported: false, closed: [], kept: [], failed: [], why: listed.why }
      : { ok: false, supported: true, closed: [], kept: [], failed: [], why: listed.why };
  }
  const { close: toClose, keep } = worktreeProcesses(listed.processes, worktree, { roots, self });
  // Somebody still in it keeps the worktree, and with it everything running there: what they
  // started may be what they are using. Abandonment (an hour of quiet) is the other step's call.
  if (keep.length > 0) return { ok: false, supported: true, closed: [], kept: keep, failed: [], why: `in use by ${describe(keep)}` };
  const { closed, failed } = toClose.length > 0 ? close(toClose) : { closed: [], failed: [] };
  const why = failed.length > 0 ? `could not close ${describe(failed)}` : null;
  return { ok: why === null, supported: true, closed, kept: [], failed, why };
}

/**
 * `closeWorktreeProcesses` for a sweep that removes several worktrees: the machine is listed once,
 * on the first removal. A process started after that is not judged, and the removal's own
 * in-use check (Windows refusing the rename) still keeps its worktree.
 */
export function worktreeCloser(primaryRoot, { list = listProcesses } = {}) {
  let listed = null;
  let roots = null;
  return (path) => {
    roots ??= worktreeRoots(primaryRoot);
    return closeWorktreeProcesses(path, { roots, list: () => (listed ??= list()) });
  };
}

/**
 * The unattended sweep's step for abandoned processes, across every checkout of the repository.
 * `{ ok, closed, failed, why }`; never throws.
 */
export function closeAbandonedProcesses({
  primaryRoot,
  roots = primaryRoot ? worktreeRoots(primaryRoot) : [],
  self = process.pid,
  now = Date.now(),
  minutes = ABANDONED_AFTER_MINUTES,
  liveness = {},
  list = listProcesses,
  close = closeProcesses,
  quiet = null,
} = {}) {
  try {
    if (roots.length === 0) return { ok: false, closed: [], failed: [], why: 'no checkouts to look in' };
    const listed = list();
    if (!listed.ok) return { ok: listed.supported === false, closed: [], failed: [], why: listed.why };
    let codexSessions = null;
    const ask = quiet ?? ((home) => {
      codexSessions ??= recentCodexSessions({ now, windowMs: minutes * 60_000 });
      return worktreeQuiet(home, { now, minutes, liveness, codexSessions });
    });
    const abandoned = abandonedProcesses(listed.processes, { roots, primaryRoot: roots[0], self, now, minutes, quiet: ask });
    if (abandoned.length === 0) return { ok: true, closed: [], failed: [], why: null };
    const { closed, failed } = close(abandoned);
    return { ok: failed.length === 0, closed, failed, why: failed.length > 0 ? `could not close ${describe(failed)}` : null };
  } catch (error) {
    return { ok: false, closed: [], failed: [], why: error?.message ?? String(error) };
  }
}

function describe(entries) {
  const shown = entries.slice(0, 3).map((e) => `${e.name || 'process'} (pid ${e.pid}${e.why ? `: ${e.why}` : ''}${e.result ? `: ${e.result}` : ''})`);
  return `${shown.join(', ')}${entries.length > 3 ? ` and ${entries.length - 3} more` : ''}`;
}
