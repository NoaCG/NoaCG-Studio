// The instruction drift audit only reports, so the thing worth pinning is that it runs against the
// real tree, reports the always-loaded budgets and every list the monthly review reads, and leaves
// the history alone (it runs without --record here).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT = new URL('./instruction-audit.mjs', import.meta.url);

test('the audit reports budgets and every review list the monthly review reads', () => {
  const run = spawnSync(process.execPath, [SCRIPT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.snapshot.always.unscopedRules, 0, 'no .claude/rules file may load in every session');
  assert.ok(report.snapshot.always.root <= report.budgets.root, 'the root AGENTS.md is within its budget');
  for (const list of ['drift', 'duplicates', 'couldBeMechanical', 'harnessWorkarounds', 'askingLines']) {
    assert.ok(Array.isArray(report[list]), list);
  }
});
