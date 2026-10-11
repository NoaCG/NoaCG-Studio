// A Playwright reporter that gathers what the trace fixture (e2e/_trace.ts) recorded into one
// trace for this run, `<NOACG_E2E_TRACE>/trace.json`, for scripts/e2e-traced.mjs to merge. Wired
// into playwright.config.ts only when NOACG_E2E_TRACE names a directory.
//
// The reporter adds what the fixture cannot know: whether each spec FINISHED. A spec with a test
// that failed or never ran executed only part of what it needs, and the merge treats it so.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRecords, traceOf } from './e2e-traced.mjs';

export default class TraceReporter {
  onBegin(config, suite) {
    this.suite = suite;
    const dir = process.env.NOACG_E2E_TRACE;
    if (!dir) return;
    // This run's records only: a directory reused from an earlier run must not lend it its files.
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) if (/^worker-\d+\.jsonl$|^trace\.json$/.test(name)) rmSync(path.join(dir, name));
  }

  onEnd() {
    const dir = process.env.NOACG_E2E_TRACE;
    if (!dir || !this.suite) return;
    const complete = new Map();
    for (const test of this.suite.allTests()) {
      const project = test.parent.project();
      const spec = path.relative(project.testDir, test.location.file).replaceAll('\\', '/');
      const ran = test.results.length > 0 && test.results.every((r) => r.status === 'passed' || r.status === 'skipped');
      complete.set(spec, (complete.get(spec) ?? true) && ran);
    }
    writeFileSync(path.join(dir, 'trace.json'), `${JSON.stringify(traceOf(readRecords(dir), complete), null, 1)}\n`);
  }

  printsToStdio() {
    return false;
  }
}
