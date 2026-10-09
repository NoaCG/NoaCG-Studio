// THE MACHINE'S PROCESSES ON WINDOWS: ONE LIST, AND CLOSING ONE BY ITS IDENTITY.
//
// The worktree sweep and the e2e diagnostics read the whole process table here, so they share one
// PowerShell query. They want different things from a failure, and both get them from the same
// answer:
//   - the worktree sweep (agent-processes.mjs) decides what to close and what to delete, so a list
//     that could not be read is `{ ok: false }` and it then closes and removes nothing;
//   - the diagnostics and the Codex reaper (e2e-runs.mjs `allProcesses`) fail OPEN: they turn a
//     failed list into an empty one, which they already read as "unknown".
//
// Off Windows there is no list (`supported: false`).

import { spawnSync } from 'node:child_process';

// One compiled helper for both directions. Cwd reads the working directory out of the process's
// own parameters (PEB -> RTL_USER_PROCESS_PARAMETERS.CurrentDirectory, 64-bit layout); 32-bit and
// unreadable processes answer null. Close opens ONE handle, checks the start time through it, and
// terminates through the same handle, so nothing can swap the process in between.
const START_TOLERANCE_MS = 1000;
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
      if (Math.Abs((created - 116444736000000000L) / 10000L - createdMs) > ${START_TOLERANCE_MS}) return "gone";
      if (WaitForSingleObject(h, 0) == 0) return "gone";
      if (!TerminateProcess(h, 1)) return "denied";
      return WaitForSingleObject(h, 5000) == 0 ? "closed" : "still running";
    } finally { CloseHandle(h); }
  }
}
`;

function powershell(script, { run = spawnSync, timeoutMs = 60_000, helper = true } = {}) {
  const compile = helper ? `Add-Type -TypeDefinition @'\n${HELPER}\n'@\n` : '';
  const full = `$ErrorActionPreference = 'Stop'\n${compile}${script}`;
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
 * Every process on the machine: `{ ok, supported, processes, why }`, each process
 * `{ pid, ppid, name, exe, command, createdMs, cpuSeconds, cwd }`.
 *
 * `createdMs` is half of a process's IDENTITY on a system that reuses pids: a kill is pinned to it
 * (`closeProcesses`, and the Codex reaper's ownership records). `cwd` is read from the process
 * itself and is null where it cannot be (another user, elevated, 32-bit). `cwd: false` skips that
 * read and the compiled helper it needs, for callers that never look at it: about half a second
 * less per call, and no `Add-Type` that a locked-down machine could refuse.
 *
 * `ok: false` is the only way a failure is reported; an empty list is never the answer to one.
 */
export function listProcesses({ platform = process.platform, run, timeoutMs, cwd = true } = {}) {
  if (platform !== 'win32') return { ok: false, supported: false, processes: [], why: 'process listing is only implemented on Windows' };
  const script = [
    '$rows = foreach ($p in Get-CimInstance Win32_Process) {',
    '  $created = $null',
    '  if ($p.CreationDate) { $created = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }',
    '  [pscustomobject]@{ pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = $p.Name; exe = $p.ExecutablePath;',
    '    command = $p.CommandLine; createdMs = $created; kernel = $p.KernelModeTime; user = $p.UserModeTime;',
    `    cwd = ${cwd ? '[NoacgProcesses]::Cwd([int]$p.ProcessId)' : '$null'} }`,
    '}',
    '@($rows) | ConvertTo-Json -Depth 2 -Compress',
  ].join('\n');
  const res = powershell(script, { run, timeoutMs, helper: cwd });
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
      // Kernel plus user time, in 100 ns ticks: what a diagnostic compares between two samples.
      cpuSeconds: row.kernel != null && row.user != null ? (Number(row.kernel) + Number(row.user)) / 10_000_000 : null,
      cwd: row.cwd ?? null,
    }));
  // A machine with no processes is a broken answer, not an idle machine.
  if (processes.length === 0) return { ok: false, supported: true, processes: [], why: 'could not list processes: the list was empty' };
  return { ok: true, supported: true, processes, why: null };
}

const CLOSE_BATCH = 100;

const closedOrGone = (said) => said === 'closed' || said === 'gone';

/**
 * Close `entries` (`{ pid, createdMs, ... }`), in order, each only if it is still the process that
 * was judged. Returns `{ closed, failed }`; `gone` counts as closed.
 *
 * A FAILED CLOSE IS CHECKED AGAINST A FRESH TABLE before it fails anything (#919). Windows refuses
 * to terminate a process that is already exiting with the same "access denied" a protected one
 * gets, and a hidden shell's conhost.exe starts exiting the moment the shell it serves is closed,
 * just before its own turn. So a process that is not in `list()` with the same start time counts as
 * gone. One still listed, or listed without a start time, is a real refusal and stays failed; a
 * table that cannot be read changes nothing.
 */
export function closeProcesses(entries, { platform = process.platform, run, list } = {}) {
  const pinned = [];
  const unpinned = [];
  for (const e of entries) {
    if (Number.isInteger(e.pid) && Number.isFinite(e.createdMs)) pinned.push(e);
    else unpinned.push({ ...e, result: 'no start time to check its identity against' });
  }
  const failAll = (result) => ({ closed: [], failed: [...pinned.map((e) => ({ ...e, result })), ...unpinned] });
  if (pinned.length === 0) return failAll(null);
  if (platform !== 'win32') return failAll('closing is only implemented on Windows');
  // In batches: one encoded command carries the helper and a line per close, and Windows refuses a
  // command line over 32767 characters, about 150 closes. A batch that fails fails its own entries.
  const results = new Map();
  for (let at = 0; at < pinned.length; at += CLOSE_BATCH) {
    const batch = pinned.slice(at, at + CLOSE_BATCH);
    const res = powershell(batch.map((e) => `"${e.pid}=" + [NoacgProcesses]::Close(${e.pid}, ${Math.trunc(e.createdMs)})`).join('\n'), { run });
    if (!res.ok) {
      for (const e of batch) results.set(e.pid, res.why);
      continue;
    }
    for (const line of res.stdout.split(/\r?\n/)) {
      const found = /^(\d+)=(.*)$/.exec(line.trim());
      if (found) results.set(Number(found[1]), found[2]);
    }
  }
  const refused = pinned.filter((e) => !closedOrGone(results.get(e.pid)));
  const fresh = refused.length > 0 ? (list ?? (() => listProcesses({ platform, run, cwd: false })))() : null;
  if (fresh?.ok) {
    const sameProcess = (e, p) => p.pid === e.pid && (!Number.isFinite(p.createdMs) || Math.abs(p.createdMs - e.createdMs) <= START_TOLERANCE_MS);
    for (const e of refused) {
      if (!fresh.processes.some((p) => sameProcess(e, p))) results.set(e.pid, 'gone');
    }
  }
  const closed = [];
  const failed = [...unpinned];
  for (const e of pinned) {
    const said = results.get(e.pid) ?? 'no answer';
    (closedOrGone(said) ? closed : failed).push({ ...e, result: said });
  }
  return { closed, failed };
}
