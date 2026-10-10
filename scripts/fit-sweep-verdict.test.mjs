import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, slim, summary, defectOf } from './fit-sweep-verdict.mjs';

const file = (name, findings, extra = {}) => ({ name, family: 'f', fields: 1, skipped: null, findings, readings: [{}, {}], ...extra });
const finding = (field, problem, mode = 'grow-x', length = 'over3') => ({ field, problem, mode, length });

test('a defect is its problem with the numbers taken out', () => {
  assert.equal(defectOf('block 812 wider than budget 790'), defectOf('block 815.5 wider than budget 790'));
  assert.notEqual(defectOf('block 812 wider than budget 790'), defectOf('block 812 taller than ceiling 90'));
  // A name is not a measurement: two shapes are two defects.
  assert.equal(defectOf('"g0" stayed 600 px wide'), '"g0" stayed # px wide');
  assert.notEqual(defectOf('"g0" stayed 600 px wide'), defectOf('"g1" stayed 600 px wide'));
  assert.equal(defectOf('drifted -5.8 down its box (drawn at 0.0)'), 'drifted # down its box (drawn at #)');
});

test('the same defect at other numbers, options or lengths is not a regression', () => {
  const baseline = [file('a', [finding('f0', 'block 812 wider than budget 790')])];
  const tonight = [file('a', [finding('f0', 'block 830 wider than budget 790', 'shrink', 'absurd')])];
  const v = judge(tonight, [baseline]);
  assert.deepEqual(v.regressions, []);
  assert.deepEqual(v.fixed, []);
});

test('a new defect on a swept file is a regression, and one that went away is reported as gone', () => {
  const baseline = [file('a', [finding('f0', 'block 812 wider than budget 790')])];
  const tonight = [file('a', [finding('f1', 'drifted 3.1 across its box (drawn at 0.0)')])];
  const v = judge(tonight, [baseline]);
  assert.equal(v.regressions.length, 1);
  assert.equal(v.regressions[0].field, 'f1');
  assert.equal(v.fixed.length, 1);
});

test('a file new to the corpus is reported, not judged; a file no longer swept is', () => {
  const baseline = [file('a', []), file('gone', [])];
  const tonight = [file('a', []), file('gone', [], { skipped: 'the door did not accept it' }), file('new', [finding('f0', 'x 1')])];
  const v = judge(tonight, [baseline]);
  assert.deepEqual(v.regressions, []);
  assert.equal(v.unjudged.length, 1);
  assert.deepEqual(v.lost, ['gone']);
});

test('with no baseline everything is unjudged and nothing fails', () => {
  const v = judge([file('a', [finding('f0', 'x 1')])], []);
  assert.equal(v.compared, 0);
  assert.deepEqual(v.regressions, []);
  assert.equal(v.unjudged.length, 1);
});

test('the baseline keeps the findings and the case count, not the readings', () => {
  const [row] = slim([file('a', [finding('f0', 'x 1')])]);
  assert.equal(row.cases, 2);
  assert.equal('readings' in row, false);
  // And a slimmed baseline judges exactly like the full rows it came from.
  assert.deepEqual(judge([file('a', [finding('f0', 'x 2')])], [[row]]).regressions, []);
});

test('the summary names the regression and the case it fired on', () => {
  const baseline = [file('a', [])];
  const tonight = [file('a', [finding('f2', 'shrank to 20.0 of 40.0 with room for another line', 'shrink', 'over2')])];
  const text = summary({ current: tonight, verdict: judge(tonight, [baseline]), missing: [], accepted: false });
  assert.match(text, /## Fit sweep: regressions/);
  assert.match(text, /\| a \| f2 \| shrank to 20\.0 of 40\.0 with room for another line \| 1 \| shrink \| over2 \|/);
});

test('a defect any recent green run had is not new; gone and unswept are read against the newest', () => {
  const newest = [file('a', [finding('f0', 'room moved to 238 (the design offers 0)')])];
  const older = [file('a', [finding('f0', 'spills 12 further out of its box than the design does')]), file('old', [])];
  const tonight = [file('a', [finding('f0', 'spills 30 further out of its box than the design does')])];
  const v = judge(tonight, [newest, older]);
  assert.deepEqual(v.regressions, []);
  assert.equal(v.fixed.length, 1);
  assert.equal(v.fixed[0].example, 'room moved to 238 (the design offers 0)');
  assert.deepEqual(v.lost, []);
});
