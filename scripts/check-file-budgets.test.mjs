// guards: scripts/check-file-budgets.mjs, scripts/file-budgets/*.json
//
// The size gate has two ways to pass while measuring nothing, and both are pinned here: a line
// count that disagrees between a Windows checkout and the Linux runner (CRLF counted as two
// breaks, or a last line without a newline dropped), and a budget source that is silently
// skipped (the single-file layout the production-page plan names, read by no one). The rest is
// the refusal itself - over budget, a stale budget for a file that is gone, a malformed entry,
// and one file budgeted twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { countLines, measureBudgets, readBudgets } from './check-file-budgets.mjs';

/** A throwaway repository root holding `files` (repo-relative path -> text). */
function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'file-budgets-'));
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
  return root;
}

const budget = (file, lines) => JSON.stringify({ file, lines });

test('a line is counted the way wc -l counts the LF checkout, on every platform', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('one\ntwo\n'), 2);
  assert.equal(countLines('one\r\ntwo\r\n'), 2, 'CRLF is one break, not two');
  assert.equal(countLines('one\ntwo'), 2, 'a last line without a newline still counts');
  assert.equal(countLines('\n'), 1);
});

test('both layouts are read: the per-file directory and the single file beside it', () => {
  const root = fixture({
    'scripts/file-budgets/a.json': budget('src/a.ts', 3),
    'scripts/file-budgets/notes.txt': 'not a budget',
    'scripts/file-budgets.json': JSON.stringify([{ file: 'src/b.ts', lines: 2 }, { file: 'src/c.ts', lines: 9 }]),
    'src/a.ts': 'x\ny\nz\n',
    'src/b.ts': 'x\r\ny\r\n',
    'src/c.ts': 'x\n',
  });
  const rows = measureBudgets(readBudgets(root), root);
  assert.deepEqual(
    rows.map((r) => [r.file, r.count, r.over, r.source]),
    [
      ['src/a.ts', 3, false, 'scripts/file-budgets/a.json'],
      ['src/b.ts', 2, false, 'scripts/file-budgets.json'],
      ['src/c.ts', 1, false, 'scripts/file-budgets.json'],
    ],
  );
});

test('one line over the budget fails, exactly at the budget passes', () => {
  const root = fixture({
    'scripts/file-budgets/a.json': budget('src/a.ts', 2),
    'scripts/file-budgets/b.json': budget('src/b.ts', 2),
    'src/a.ts': 'x\ny\n',
    'src/b.ts': 'x\ny\nz\n',
  });
  const rows = measureBudgets(readBudgets(root), root);
  assert.deepEqual(rows.map((r) => [r.file, r.over]), [['src/a.ts', false], ['src/b.ts', true]]);
});

test('a budget for a file that is gone fails rather than passing over nothing', () => {
  const root = fixture({ 'scripts/file-budgets/a.json': budget('src/moved.ts', 10) });
  const [row] = measureBudgets(readBudgets(root), root);
  assert.equal(row.missing, true);
});

test('a malformed budget and a file budgeted twice are refused, not guessed', () => {
  const malformed = fixture({ 'scripts/file-budgets/a.json': JSON.stringify({ file: 'src/a.ts', lines: '2601' }) });
  assert.throws(() => readBudgets(malformed), /positive whole number/);
  const broken = fixture({ 'scripts/file-budgets/a.json': '{ "file": ' });
  assert.throws(() => readBudgets(broken), /not readable JSON/);
  const twice = fixture({
    'scripts/file-budgets/a.json': budget('src/a.ts', 5),
    'scripts/file-budgets.json': budget('src/a.ts', 4),
  });
  assert.throws(() => readBudgets(twice), /budgeted twice/);
});

test('the committed budgets are met by the committed files', () => {
  const rows = measureBudgets(readBudgets());
  assert.ok(rows.some((r) => r.file === 'src/components/wizard/CreationWizard.tsx'), 'the wizard shell is budgeted');
  for (const r of rows) {
    assert.equal(r.missing, false, `${r.file} is budgeted in ${r.source} and does not exist`);
    assert.equal(r.over, false, `${r.file} has ${r.count} lines, over its budget of ${r.lines}`);
  }
});
