// The store's guard. What matters here is the LOCATION check: it decides whether a wave launches,
// so a false "outside the store" stops every wave and a false "inside" loses the week's record.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inStore, openNightWave, openWave, PLAN_SUFFIX, wavePlanFiles, wavePlanName, wavePlansDir, ensureWavePlansDir } from './wave-plan-store.mjs';

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
  assert.throws(() => wavePlanName('2026-09-09', 'evening'), /day, night or plan-/);
  assert.equal(wavePlanName('2026-10-09', 'plan-editor'), `2026-10-09-plan-editor${PLAN_SUFFIX}`);
  assert.throws(() => wavePlanName('2026-10-09', 'plan-../x'), /plan-/);
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

// OPENING A WAVE is where two of the root boundaries become checks: one orchestrator at a time,
// and no unattended chain past 24 hours. Both used to be sentences.

/** Pin a file's modification time, so "written to recently" does not depend on today's date. */
function touch(file, ms) {
  const at = new Date(ms);
  utimesSync(file, at, at);
}

const NOW = Date.parse('2026-10-08T20:00:00Z');

test('opening a wave writes its window and refuses one past the 24-hour ceiling', () => {
  const opened = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir: store(), now: NOW });
  assert.ok(opened.file, opened.refusal);
  const text = readFileSync(opened.file, 'utf8');
  assert.match(text, /^Window starts: 2026-10-08T20:00:00\.000Z$/m);
  assert.match(text, /^Window ends: 2026-10-09T06:00:00\+03:00$/m);
  assert.match(openWave({ date: '2026-10-09', kind: 'day', until: '2026-10-10T21:00:00+03:00', dir: store(), now: NOW }).refusal, /24 hours/);
  assert.match(openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T06:00:00+03:00', dir: store(), now: NOW }).refusal, /passed/);
  assert.match(openWave({ date: '2026-10-08', kind: 'day', until: '06:00', dir: store(), now: NOW }).refusal, /offset/);
});

test('a second wave is refused while another has no report, and allowed once it has one', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T23:00:00+03:00', dir, now: NOW - 3_600_000 });
  touch(first.file, NOW - 3_600_000);
  const second = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  assert.match(second.refusal, /another wave or plan run is open/);
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}\n## Report\n\nAll landed.\n`, 'utf8');
  touch(first.file, NOW - 600_000);
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('reopening the same wave resumes it instead of refusing or overwriting it', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}\n- 23:10 launched A\n`, 'utf8');
  touch(first.file, NOW);
  const again = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW + 600_000 });
  assert.equal(again.file, first.file);
  assert.match(readFileSync(again.file, 'utf8'), /launched A/);
});

test('a plan nobody has written to for a day no longer blocks a new wave', () => {
  const dir = store();
  const old = path.join(dir, 'wave-plans', wavePlanName('2026-10-01', 'night'));
  writeFileSync(old, '# plan with no report\n', 'utf8');
  touch(old, Date.parse('2026-10-02T06:00:00Z'));
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('a resumed wave is measured from the start its file records, so a restart cannot stretch it', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  // A Windows editor may have rewritten the file with CRLF; the recorded start must still be read.
  writeFileSync(first.file, readFileSync(first.file, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
  const later = NOW + 22 * 3_600_000;
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-10T06:00:00+03:00', dir, now: later }).refusal, /24 hours from its start/);
  assert.equal(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T23:00:00+03:00', dir, now: later }).file, first.file);
});

test('a wave nobody has written to for six hours stops blocking, and the refusal says how to resume', () => {
  const dir = store();
  const day = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T18:00:00+03:00', dir, now: NOW - 8 * 3_600_000 });
  touch(day.file, NOW - 5 * 3_600_000);
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).refusal, /open it again with its own date and kind/);
  touch(day.file, NOW - 7 * 3_600_000);
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('only an open night wave inside its window counts as unattended', () => {
  const dir = store();
  assert.equal(openNightWave(dir, NOW), null, 'no wave');
  const day = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-09T01:00:00+03:00', dir, now: NOW });
  touch(day.file, NOW);
  assert.equal(openNightWave(dir, NOW), null, 'a day wave has the owner near');
  writeFileSync(day.file, `${readFileSync(day.file, 'utf8')}\n## Report\n\nDone.\n`, 'utf8');
  touch(day.file, NOW);

  const night = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), night.file);
  assert.equal(openNightWave(dir, Date.parse('2026-10-09T06:00:00+03:00')), null, 'the window has ended');
  writeFileSync(night.file, `${readFileSync(night.file, 'utf8')}\n## Report\n\nDone.\n`, 'utf8');
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), null, 'a reported wave is over');
  writeFileSync(night.file, '# Night wave 2026-10-08\n', 'utf8');
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), night.file, 'no window line still counts as running');
});

// A PLAN RUN opens through the same store, so it and a wave exclude each other with one check.

test('a plan run and a wave refuse each other, and a plan run gets the same 24-hour ceiling', () => {
  const dir = store();
  const run = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  assert.ok(run.file, run.refusal);
  assert.match(readFileSync(run.file, 'utf8'), /^# Plan run editor 2026-10-08$/m);
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).refusal, /another wave or plan run is open/);

  const other = store();
  openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir: other, now: NOW });
  assert.match(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir: other, now: NOW }).refusal, /another wave or plan run is open/);

  assert.match(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-10T00:00:00+03:00', dir: store(), now: NOW }).refusal, /24 hours/);
});
