// A Playwright reporter that refuses to let a run which could not finish honestly end green.
//
// WHY. A full local run once died on ENOSPC while its reporter was summarising: Playwright
// artifacts and the sibling worktrees had filled the disk, workers were killed as the summary
// printed, and the run ended with a passing tail and exit code 0. The exit code is the thing this
// repo says to read, and it lied. More free space only moves when that happens next; the defect is
// that a run that could not finish looks exactly like one that did.
//
// So the run's own status is overridden to `failed`, with the reason printed last, when any of
// these is true at the end of a run that would otherwise pass:
//   - an error anywhere in the run says ENOSPC (no space left on the device);
//   - a test the run planned never reported a result - the run was truncated, whatever the cause;
//   - the disk the run writes to has less than DISK_FLOOR_BYTES free, so its artifacts and its
//     verdict may both be partial.
//
// Wired into every Playwright config beside the visible reporter, so it covers a run however it is
// started (`npm run test:e2e`, the affected runner, the job queue, CI) - except a run given its
// own `--reporter` on the command line, which replaces the config's list. It is the LAST reporter
// on purpose: the others print their summary first, and the reason a pass is refused comes after.
// The decision is the pure `runProblems`, tested in scripts/e2e-run-integrity.test.mjs with a
// stubbed disk.
import { statfsSync } from 'node:fs';

/** Below this much free space at the end of a run, the run is about the disk, not the product. */
export const DISK_FLOOR_BYTES = 1024 ** 3;

const ENOSPC = /\bENOSPC\b|no space left on device/i;
// Linux reports an exhausted inotify watch limit as ENOSPC too, and the dev server's watcher logs
// it through the reporter. That is not a full disk.
const WATCH_LIMIT = /file watchers/i;

/** True when an error or output chunk reports the disk filling. */
export function mentionsEnospc(value) {
  if (value == null) return false;
  const text = typeof value === 'string' || Buffer.isBuffer(value)
    ? String(value)
    : [value.message, value.stack, value.value].filter(Boolean).join('\n');
  return ENOSPC.test(text) && !WATCH_LIMIT.test(text);
}

/** Free bytes on the volume holding `dir`, or null when it cannot be read. */
function freeBytes(dir, statfs) {
  try {
    const stats = statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/**
 * Why this run is not a verdict, as sentences; empty when it is one.
 * @param {{ planned: number, unreported: number, enospc: boolean, free: number|null, floor?: number }} run
 */
export function runProblems({ planned, unreported, enospc, free }) {
  const problems = [];
  if (enospc) problems.push('the disk filled during the run (ENOSPC), so workers, artifacts or results may be missing');
  if (unreported > 0) problems.push(`${unreported} of ${planned} planned test(s) never reported a result, so the run was cut short`);
  if (free !== null && free < DISK_FLOOR_BYTES) {
    const mb = (bytes) => Math.round(bytes / 1024 ** 2);
    problems.push(`only ${mb(free)} MB is free on the disk the run writes to (floor ${mb(DISK_FLOOR_BYTES)} MB)`);
  }
  return problems;
}

export default class RunIntegrity {
  constructor(options = {}) {
    // `--list` and `merge-reports` load the same reporters but run nothing, so they are not runs.
    this.active = options._mode !== 'list' && options._mode !== 'merge';
    this.statfs = options.statfs ?? statfsSync;
    this.enospc = false;
    this.suite = null;
    this.dir = process.cwd();
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.suite = suite;
    this.dir = config.rootDir ?? this.dir;
  }

  onTestEnd(test, result) {
    if ((result.errors ?? []).some(mentionsEnospc)) this.enospc = true;
  }

  onStdErr(chunk) {
    if (mentionsEnospc(chunk)) this.enospc = true;
  }

  onError(error) {
    if (mentionsEnospc(error)) this.enospc = true;
  }

  onEnd(result) {
    if (!this.active || result.status !== 'passed') return undefined;
    const tests = this.suite ? this.suite.allTests() : [];
    const problems = runProblems({
      planned: tests.length,
      unreported: tests.filter((test) => test.results.length === 0).length,
      enospc: this.enospc,
      free: freeBytes(this.dir, this.statfs),
    });
    if (!problems.length) return undefined;
    console.error('\nNOT A VERDICT - this run reports a pass it cannot stand behind:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Free disk space (old test-results/ folders, finished worktrees) and run it again; nothing here is a test result.\n');
    return { status: 'failed' };
  }
}
