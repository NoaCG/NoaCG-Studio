// guards: src/model/csv.ts
//
// Unit tests for the shared quoted-CSV/JSON parser (src/model/csv.ts, Phase 7).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: the parser is pure text in, table out, and the cases that matter are the ones a
// `split(',')` gets silently wrong. Every one of them is a real spreadsheet export shape.
//
// The module is TypeScript, so the test transpiles the REAL FILE and imports the result.
// Re-implementing the parser here would test the wrong code, and the module imports nothing —
// which is what makes one `transpileModule` call enough (the api/ tests need a whole emitted
// tree because their modules import each other).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/model/csv.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { parseCsv, parseJsonTable, parseDelimited, detectSeparator, parseTableFile, serializeCsv } = mod;

test('a quoted field keeps its commas', () => {
  const { header, rows } = parseCsv('Question,Answer\n"Which, of these, is a comma?",Yes\n');
  assert.deepEqual(header, ['Question', 'Answer']);
  assert.deepEqual(rows, [['Which, of these, is a comma?', 'Yes']]);
});

test('a quoted field keeps its newlines, and the row does not split', () => {
  const { header, rows } = parseCsv('Question,Note\n"Line one\nLine two",ok\n');
  assert.deepEqual(header, ['Question', 'Note']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'Line one\nLine two');
});

test('a doubled quote is one literal quote', () => {
  const { rows } = parseCsv('A,B\n"He said ""hello""",2\n');
  assert.deepEqual(rows, [['He said "hello"', '2']]);
});

test('CRLF and a missing trailing newline both parse, with no phantom row', () => {
  assert.deepEqual(parseCsv('A,B\r\n1,2\r\n').rows, [['1', '2']]);
  assert.deepEqual(parseCsv('A,B\n1,2').rows, [['1', '2']]);
});

test('a short row pads and a long row reports its extra cells', () => {
  const short = parseCsv('A,B,C\n1,2\n');
  assert.deepEqual(short.rows, [['1', '2', '']]);
  const long = parseCsv('A,B\n1,2,3\n');
  assert.deepEqual(long.rows, [['1', '2']]);
  assert.equal(long.extraCells, 1);
});

test('a UTF-8 BOM does not become part of the first column name', () => {
  const { header } = parseCsv('﻿Question,Answer\n1,2\n');
  assert.deepEqual(header, ['Question', 'Answer']);
});

test('the separator is detected, so a semicolon export is not one fat column', () => {
  assert.equal(detectSeparator('A;B;C\n1;2;3\n'), ';');
  assert.equal(detectSeparator('A\tB\tC\n1\t2\t3\n'), '\t');
  assert.equal(detectSeparator('A,B,C\n1,2,3\n'), ',');
  const semi = parseCsv('Question;Answer\n"one; two";yes\n');
  assert.deepEqual(semi.header, ['Question', 'Answer']);
  assert.deepEqual(semi.rows, [['one; two', 'yes']]);
});

test('a stray quote inside an unquoted value is data, not a quoted field', () => {
  assert.deepEqual(parseDelimited('5" pipe,ok', ','), [['5" pipe', 'ok']]);
});

test('an unterminated quote closes itself rather than throwing', () => {
  assert.deepEqual(parseDelimited('A,"unfinished', ','), [['A', 'unfinished']]);
});

test('JSON: an array of objects becomes the union of its keys, in first-seen order', () => {
  const { header, rows, error } = parseJsonTable('[{"Question":"Q1","Answer":"A"},{"Answer":"B","Note":"n"}]');
  assert.equal(error, null);
  assert.deepEqual(header, ['Question', 'Answer', 'Note']);
  assert.deepEqual(rows, [['Q1', 'A', ''], ['', 'B', 'n']]);
});

test('JSON: numbers and booleans become strings, null becomes empty', () => {
  const { rows } = parseJsonTable('[{"a":1,"b":true,"c":null}]');
  assert.deepEqual(rows, [['1', 'true', '']]);
});

test('JSON: an array of arrays uses its first row as the header', () => {
  const { header, rows } = parseJsonTable('[["A","B"],["1","2"]]');
  assert.deepEqual(header, ['A', 'B']);
  assert.deepEqual(rows, [['1', '2']]);
});

test('JSON: a wrapped export unwraps its single array property', () => {
  const { header } = parseJsonTable('{"rows":[{"A":"1"}]}');
  assert.deepEqual(header, ['A']);
});

test('JSON: something that is not a table is REFUSED with a reason, never coerced', () => {
  assert.match(parseJsonTable('{"a":1}').error, /list of rows/);
  assert.match(parseJsonTable('nope').error, /not valid JSON/);
  assert.match(parseJsonTable('[]').error, /list of rows/);
  assert.match(parseJsonTable('["a","b"]').error, /list of rows/);
});

test('the file name picks the reader, not a MIME type the browser may not have set', () => {
  assert.deepEqual(parseTableFile('bank.json', '[{"A":"1"}]').header, ['A']);
  assert.deepEqual(parseTableFile('bank.csv', 'A,B\n1,2\n').header, ['A', 'B']);
  assert.match(parseTableFile('bank.csv', '').error, /no rows/);
});

test('a written table reads back as itself, quoting only what has to be quoted', () => {
  // The template the Data tab offers for download is this writer's output, and the file the
  // operator hands back is this reader's input - so the round trip IS the contract.
  const header = ['Question', 'Answer A', 'Correct answer'];
  const rows = [
    ['Which, of these, is a comma?', 'This one', 'A'],
    ['She said "hello"', 'Line\nbreak', 'B'],
  ];
  const back = parseCsv(serializeCsv(header, rows));
  assert.deepEqual(back.header, header);
  assert.deepEqual(back.rows, rows);
  // Plain cells stay plain: a file where every value is quoted looks machine-mangled in the
  // spreadsheet's own preview, which is the first thing an operator sees.
  assert.equal(serializeCsv(['A', 'B']), 'A,B\r\n');
});

test('a header-only template imports as columns with nothing in them', () => {
  const { header, rows, error } = parseTableFile('quiz.csv', serializeCsv(['Question', 'Answer A']));
  assert.equal(error, null);
  assert.deepEqual(header, ['Question', 'Answer A']);
  assert.deepEqual(rows, []);
});
