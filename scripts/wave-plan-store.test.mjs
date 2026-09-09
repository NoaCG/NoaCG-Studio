// The store's guard. What matters here is the LOCATION check: it decides whether a wave launches,
// so a false "outside the store" stops every wave and a false "inside" loses the week's record.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inStore, PLAN_SUFFIX, wavePlanFiles, wavePlanName, wavePlansDir, ensureWavePlansDir } from './wave-plan-store.mjs';

/** A throwaway job store, so nothing here can touch the machine's real one. */
function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-plan-store-'));
  mkdirSync(path.join(dir, 'wave-plans'), { recursive: true });
  return dir;
}

test('the store sits inside the job store, beside its logs and its relay', () => {
  assert.equal(wavePlansDir('/repo/.git/noacg-jobs'), path.join('/repo/.git/noacg-jobs', 'wave-plans'));
  assert.equal(wavePlansDir(null), null);
});

test('a plan filename is a date, a kind, and nothing else', () => {
  assert.equal(wavePlanName('2026-09-09', 'night'), `2026-09-09-night${PLAN_SUFFIX}`);
  assert.equal(wavePlanName('2026-09-09', 'day'), `2026-09-09-day${PLAN_SUFFIX}`);
  assert.throws(() => wavePlanName('9 Sep', 'day'), /YYYY-MM-DD/);
  assert.throws(() => wavePlanName('2026-09-09', 'evening'), /day or night/);
});

test('the location check accepts a plan in the store and refuses one in a checkout', () => {
  const dir = store();
  const inside = path.join(dir, 'wave-plans', wavePlanName('2026-09-09', 'night'));
  writeFileSync(inside, '# plan\n', 'utf8');
  assert.equal(inStore(inside, dir), true);
  // The shape that lost three days of routing: a plan in whatever worktree the session occupied.
  assert.equal(inStore('C:/repo/.claude/worktrees/agent-abc/docs/handoffs/2026-09-09-night-wave-plan.local.md', dir), false);
  // And a subdirectory of the store is not the store - basename equality alone must not pass it.
  assert.equal(inStore(path.join(dir, 'wave-plans', 'old', wavePlanName('2026-09-09', 'day')), dir), false);
  assert.equal(inStore(null, dir), false);
  assert.equal(inStore(inside, null), false);
});

test('the location check survives the separators and the casing Windows hands back', () => {
  const dir = store();
  const name = wavePlanName('2026-09-09', 'day');
  writeFileSync(path.join(dir, 'wave-plans', name), '# plan\n', 'utf8');
  const mixed = `${dir.replace(/\\/g, '/')}/wave-plans/${name}`;
  assert.equal(inStore(mixed, dir), true);
  assert.equal(inStore(path.join(dir, 'wave-plans', '.', name), dir), true);
});

test('the listing is newest first and ignores everything that is not a plan', () => {
  const dir = store();
  for (const name of [wavePlanName('2026-09-07', 'day'), wavePlanName('2026-09-09', 'night'), wavePlanName('2026-09-08', 'day')]) {
    writeFileSync(path.join(dir, 'wave-plans', name), '# plan\n', 'utf8');
  }
  writeFileSync(path.join(dir, 'wave-plans', 'notes.md'), 'not a plan\n', 'utf8');
  assert.deepEqual(wavePlanFiles(dir), [
    wavePlanName('2026-09-09', 'night'),
    wavePlanName('2026-09-08', 'day'),
    wavePlanName('2026-09-07', 'day'),
  ]);
});

test('the directory is created on demand, because the orchestrator writes the file by hand', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-plan-store-'));
  assert.deepEqual(wavePlanFiles(dir), []); // absent reads as empty rather than throwing
  const folder = ensureWavePlansDir(dir);
  assert.equal(folder, path.join(dir, 'wave-plans'));
  writeFileSync(path.join(folder, wavePlanName('2026-09-09', 'night')), '# plan\n', 'utf8');
  assert.deepEqual(wavePlanFiles(dir), [wavePlanName('2026-09-09', 'night')]);
});
