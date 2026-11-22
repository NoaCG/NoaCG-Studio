// guards: src/templates/importedDesign/behaviourReads.ts, src/templates/importedDesign/behaviourRuntime.ts, src/templates/importedDesign/behaviour.ts, src/templates/behaviours/**, src/blocks/behaviourData.ts, src/validation/validateTemplate.ts, scripts/fixtures/pre-tl2/**
//
// WHAT A BEHAVIOUR RUNTIME READS, AND THE CHECK THAT REFUSES MORE (svg-template-library TL2,
// spec Rules C1-C7). In Node, over the real modules:
//
//   * the frozen pre-TL2 vocabulary is EXACTLY what the frozen runtime of df0c7a0 reads, read
//     mechanically off that runtime's own code in the committed fixtures (C2);
//   * the runtime this build emits reads EXACTLY what its READS declares, per kind: a declared
//     fact or derivation the code does not compare is a failure, and so is one the code compares
//     but READS leaves out (C4). A planted READS-only derivation is caught;
//   * every recipe, with every option, compiles to a table its own emitted runtime reads (C5);
//   * a hand edit asking for a word a saved runtime does not read is refused by the validator,
//     on a graphic built before this plan; one asking nothing new passes, and its saved code is
//     never rewritten (C3, C7); a table version or a READS version this build does not know is
//     handled as the Rules say (C3, C6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { measured } from './measured.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One TypeScript module of the app's graph, importable here. */
async function load(rel) {
  const bundle = await rolldown({ input: path.join(root, rel), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const R = await load('src/templates/importedDesign/behaviourReads.ts');
const { behaviourRuntimeJs } = await load('src/templates/importedDesign/behaviourRuntime.ts');
const { compileBinding } = await load('src/templates/importedDesign/behaviour.ts');
const { BEHAVIOUR_RECIPES } = await load('src/templates/behaviours/registry.ts');
const { validateTemplate } = await load('src/validation/validateTemplate.ts');

const frozen = (name) => JSON.parse(readFileSync(path.join(root, `scripts/fixtures/pre-tl2/${name}.json`), 'utf8'));
const VOTE = frozen('vote');
const COUNTDOWN = frozen('countdown');

// ── Reading what a runtime's CODE reads ─────────────────────────────────────────────────────
// Mechanical, from the emitted text: each kind's block (`noacgKinds.k = {` or
// `noacgKinds['k'] = {`, to its closing `};`) split into its members; a fact or derivation is a
// literal comparison of `name` in that member (`name === 'w'`, `name !== 'w'`,
// `name.indexOf('w:') === 0`); a member that is another kind's (`derive: noacgKinds.text.derive`)
// reads what that one reads. A kind's spec keys are `spec.<key>` in its block and in the
// `noacg*` helpers it calls.

function functionBody(js, name) {
  const at = js.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const end = js.indexOf('\n}\n', at);
  return js.slice(at, end === -1 ? js.length : end + 2);
}

function kindBlocks(js) {
  const out = {};
  const re = /\nnoacgKinds(?:\.([a-z]+)|\['([a-z-]+)'\]) = \{\n/g;
  let m;
  while ((m = re.exec(js))) {
    const kind = m[1] ?? m[2];
    const end = js.indexOf('\n};\n', m.index);
    out[kind] = js.slice(m.index + m[0].length, end);
  }
  return out;
}

function members(block) {
  const out = {};
  const parts = block.split(/\n {2}(?=[a-z][A-Za-z]*: )/);
  for (const part of parts) {
    const m = /^\s*([a-z][A-Za-z]*): ([\s\S]*)$/.exec(part);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const names = (text) => {
  const words = new Set();
  for (const m of text.matchAll(/name [!=]== '([a-z-]+)'/g)) words.add(m[1]);
  for (const m of text.matchAll(/name\.indexOf\('([a-z-]+:)'\) [!=]== 0/g)) words.add(m[1]);
  return words;
};

function codeReads(js) {
  const blocks = kindBlocks(js);
  const kinds = {};
  for (const [kind, block] of Object.entries(blocks)) {
    const m = members(block);
    const of = (member) => {
      const text = m[member] ?? '';
      const borrowed = /^noacgKinds(?:\.([a-z]+)|\['([a-z-]+)'\])\.(fact|derive)\b/.exec(text.trim());
      if (borrowed) return names(members(blocks[borrowed[1] ?? borrowed[2]])[borrowed[3]] ?? '');
      return names(text);
    };
    const helpers = [...new Set([...block.matchAll(/\b(noacg[A-Za-z]+)\(/g)].map((h) => h[1]))].map((h) => functionBody(js, h)).join('\n');
    const spec = new Set(['kind', ...[...`${block}\n${helpers}`.matchAll(/\bspec\.([A-Za-z]+)/g)].map((s) => s[1])]);
    kinds[kind] = { spec: [...spec].sort(), facts: [...of('fact')].sort(), derive: [...of('derive')].sort() };
  }
  const listOf = (re, text = js) => [...new Set([...text.matchAll(re)].map((m) => m[1] ?? m[2]))].sort();
  return {
    kinds,
    rule: listOf(/\brule(?:\.([a-z]+)|\['([a-z]+)'\])/g),
    when: listOf(/\bwhen\.([a-z]+)/g),
    table: listOf(/\bNOACG_BEHAVIOUR\.([a-z]+)/g),
    enter: listOf(/rule\.enter === '([a-z-]+)'/g),
    default: listOf(/\bkind === '([a-z-]+)'/g, functionBody(js, 'noacgDefaultEl')),
  };
}

/** A declaration, sorted the way codeReads reports. The keys the runtime never reads but every
 *  build emits (`version`, `recipe`, `parts`, `options`) are not in its code by design. */
const IGNORED_TABLE_KEYS = ['version', 'recipe', 'parts', 'options'];
function sortedReads(reads) {
  const kinds = {};
  for (const [kind, k] of Object.entries(reads.kinds)) kinds[kind] = { spec: [...k.spec].sort(), facts: [...k.facts].sort(), derive: [...k.derive].sort() };
  return {
    kinds,
    rule: [...reads.rule].sort(),
    when: [...reads.when].sort(),
    table: reads.table.filter((k) => !IGNORED_TABLE_KEYS.includes(k)).sort(),
    enter: [...reads.enter].sort(),
    default: [...reads.default].sort(),
  };
}

test('the frozen pre-TL2 vocabulary is exactly what the df0c7a0 runtime reads, in both frozen fixtures', () => {
  for (const [name, t] of [['vote', VOTE], ['countdown', COUNTDOWN]]) {
    const code = codeReads(t.js);
    const want = sortedReads(R.READS_BEFORE_TL2);
    // The countdown carries the clock's tick hook, the vote does not: the cut drops the clock.
    if (!/function clockPainted\(/.test(t.js)) delete want.kinds.clock;
    else assert.ok(code.kinds.clock, `${name}: the clock kind is defined`);
    if (!/function clockPainted\(/.test(t.js)) delete code.kinds.clock;
    assert.deepEqual(code, want, name);
  }
  assert.ok(!VOTE.js.includes('NOACG_BEHAVIOUR_READS'), 'a graphic built before TL2 declares nothing');
  measured(Object.keys(R.READS_BEFORE_TL2.kinds).length, 'frozen kinds');
});

test('the frozen cut of a saved runtime: every kind it defines, both spellings, the clock only with its tick', () => {
  const vote = R.readsOfRuntime(VOTE.js);
  assert.equal(vote.status, 'frozen');
  assert.ok(vote.reads.kinds['vote-status'] && vote.reads.kinds['row-pick'] && vote.reads.kinds.share, 'bracketed and dotted kinds both read');
  assert.equal(vote.reads.kinds.clock, undefined, 'no clockPainted, no clock');
  const countdown = R.readsOfRuntime(COUNTDOWN.js);
  assert.equal(countdown.status, 'frozen');
  assert.ok(countdown.reads.kinds.clock);
  // An older runtime without the place rule or the default treatments reads neither.
  const older = VOTE.js.replace(/function noacgPlaceAll\(/g, 'function noacgPlaceAllGone(').replace(/function noacgDefaultEl\(/g, 'function noacgDefaultGone(');
  const cut = R.readsOfRuntime(older);
  assert.ok(!cut.reads.rule.includes('place') && !cut.reads.rule.includes('default') && cut.reads.default.length === 0);
  assert.deepEqual(R.readsOfRuntime('var x = 1;'), { status: 'none' });
});

for (const withClock of [false, true]) {
  for (const withAwards of [false, true]) {
    test(`the emitted runtime (clock ${withClock}, awards ${withAwards}) reads exactly what its READS declares`, () => {
      const js = behaviourRuntimeJs(withClock, withAwards);
      const declared = R.readsOfRuntime(js);
      assert.equal(declared.status, 'declared');
      const code = codeReads(js);
      if (!withClock) delete code.kinds.clock;
      assert.deepEqual(code, sortedReads(declared.reads));
    });
  }
}

test('the drift check catches a derivation READS declares and the code does not compare (a planted word)', () => {
  const js = behaviourRuntimeJs(false, false);
  // `count` was this test's planted word until TL5 taught the runtime to read it; `median` is
  // one no code compares.
  const planted = js.replace(/("share":\{"spec":\["kind","rows"\],"facts":\["listed","leader"\],"derive":\["label","share","percent","count")/, '$1,"median"');
  assert.notEqual(planted, js, 'the share declaration was found');
  const declared = R.readsOfRuntime(planted);
  assert.notDeepEqual(codeReads(planted), sortedReads(declared.reads));
  // ...and the same word, taught to the code, passes.
  const taught = planted.replace("if (name === 'percent') return noacgPercentText(share * 100);", "if (name === 'percent') return noacgPercentText(share * 100);\n    if (name === 'median') return share;");
  assert.notEqual(taught, planted);
  const code = codeReads(taught);
  delete code.kinds.clock;
  assert.deepEqual(code, sortedReads(R.readsOfRuntime(taught).reads));
});

test('READS only grows: every word before TL2 is still read by the runtime this build emits', () => {
  for (const withClock of [false, true]) {
    const now = R.readsWords(R.runtimeReads(withClock));
    const before = [...R.readsWords(R.READS_BEFORE_TL2)].filter((w) => withClock || !/clock/.test(w));
    assert.deepEqual(before.filter((w) => !now.has(w)), []);
  }
});

// ── Every recipe, every option ─────────────────────────────────────────────────────────────

/** A binding that binds every role of a recipe, with three rows where it has rows. */
function fullBinding(recipe, options) {
  const rowDecl = recipe.rows;
  const count = rowDecl ? Math.min(rowDecl.max, Math.max(rowDecl.min, 3)) : 0;
  const rows = Array.from({ length: count }, (_, i) => (rowDecl.keys === 'letters' ? String.fromCharCode(65 + i) : String(i + 1)));
  const fields = {};
  const layers = {};
  const artworkFields = [];
  let n = 0;
  const field = (title) => {
    artworkFields.push({ field: `f${artworkFields.length}`, ftype: 'textfield', title, value: '' });
    return artworkFields.length - 1;
  };
  for (const role of recipe.roles) {
    if (role.kind === 'field') {
      fields[role.id] = role.perRow ? Object.fromEntries(rows.map((k) => [k, field(`${role.label} ${k}`)])) : field(role.label);
    } else {
      layers[role.id] = role.perRow ? Object.fromEntries(rows.map((k) => [k, `c${n++}`])) : `c${n++}`;
    }
  }
  return {
    artworkFields,
    binding: { recipe: recipe.id, ...(recipe.instanced ? { name: 'Sponsor' } : {}), options, rows, fields, layers },
  };
}

function optionSets(recipe) {
  const keys = (recipe.options ?? []).map((o) => o.key);
  return Array.from({ length: 2 ** keys.length }, (_, mask) => Object.fromEntries(keys.map((k, i) => [k, !!(mask & (1 << i))])));
}

test('every recipe, with every option, compiles to a table its own emitted runtime reads', () => {
  let built = 0;
  const bad = [];
  for (const recipe of BEHAVIOUR_RECIPES) {
    for (const options of optionSets(recipe)) {
      const { artworkFields, binding } = fullBinding(recipe, options);
      const js = compileBinding(artworkFields, binding).js();
      const verdict = R.behaviourReadsVerdict(js);
      if (verdict.status !== 'ok') bad.push(`${recipe.id} ${JSON.stringify(options)}: ${JSON.stringify(verdict)}`);
      built++;
    }
  }
  measured(built, 'recipe and option tables');
  assert.deepEqual(bad, []);
});

// ── The check on a graphic built before this plan ───────────────────────────────────────────

const errorsOf = (t) => validateTemplate(t).errors.filter((e) => e.rule === 'behaviour').map((e) => e.message);
const warningsOf = (t) => validateTemplate(t).warnings.filter((e) => e.rule === 'behaviour').map((e) => e.message);

/** The frozen vote's table, edited by hand as Advanced mode allows. */
function handEdit(t, edit) {
  const at = t.js.indexOf('var NOACG_BEHAVIOUR = ');
  const start = t.js.indexOf('{', at);
  const end = t.js.indexOf('\n};\n', start) + 2;
  const table = JSON.parse(t.js.slice(start, end));
  edit(table);
  return { ...t, js: t.js.slice(0, start) + JSON.stringify(table, null, 2) + t.js.slice(end) };
}

test('a graphic built before this plan passes the check, and the check leaves its saved code byte for byte', () => {
  for (const t of [VOTE, COUNTDOWN]) {
    const before = JSON.stringify(t);
    assert.deepEqual(R.behaviourReadsVerdict(t.js), { status: 'ok' });
    assert.deepEqual(errorsOf(t), []);
    assert.equal(JSON.stringify(t), before);
  }
});

test('a hand edit asking the frozen vote runtime for a per-option count is refused; asking nothing new passes', () => {
  const shareField = Object.entries(JSON.parse(VOTE.js.slice(VOTE.js.indexOf('{', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')), VOTE.js.indexOf('\n};\n', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')) + 2)).kinds)
    .find(([, spec]) => spec.kind === 'share');
  assert.ok(shareField, 'the frozen vote has a share field');
  const write = (from) => handEdit(VOTE, (table) => {
    const rule = table.paint.find((r) => typeof r.write === 'string');
    table.paint.push({ ...rule, from });
  });
  const head = (r) => r.split(':')[0];
  const percent = JSON.parse(VOTE.js.slice(VOTE.js.indexOf('{', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')), VOTE.js.indexOf('\n};\n', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')) + 2))
    .paint.find((r) => typeof r.write === 'string' && /:percent$/.test(r.from));
  assert.ok(percent, 'the frozen vote writes a percent');
  const asksCount = write(`${head(percent.from)}:count`);
  // Still refused under the frozen runtime; since TL5 this build reads it, so importing again is
  // the way out (upgradable), and the error says so.
  assert.deepEqual(R.behaviourReadsVerdict(asksCount.js), { status: 'unread', missing: ['derive:share.count'], upgradable: true });
  const errors = errorsOf(asksCount);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /derive:share\.count/);
  assert.match(errors[0], /import/i);
  assert.deepEqual(errorsOf(write(percent.from)), []);
  // A new kind is refused; a key NO runtime reads (a rule's `effect` before TL4, a spec key) is
  // ignored by every runtime, so it is only warned about and the graphic still exports.
  const more = handEdit(VOTE, (table) => {
    table.kinds.f0 = { kind: 'word-cloud' };
    table.paint[0].effect = 'pulse';
    table.kinds[shareField[0]].scale = 'log';
  });
  const verdict = R.behaviourReadsVerdict(more.js);
  assert.deepEqual(verdict, { status: 'unread', missing: ['kind:word-cloud', 'derive:word-cloud.text'], upgradable: false, ignored: ['kind:share.scale', 'rule.effect'] });
  const keysOnly = handEdit(VOTE, (table) => {
    table.paint.find((r) => typeof r.gauge === 'string').axis = 'x';
  });
  assert.deepEqual(R.behaviourReadsVerdict(keysOnly.js), { status: 'ok', ignored: ['rule.axis'] });
  assert.deepEqual(errorsOf(keysOnly), [], 'a documented key no runtime reads never blocks an export');
  assert.match(warningsOf(keysOnly).join('\n'), /rule\.axis, which no behaviour runtime reads/);
  // A condition key is never ignorable: it narrows when a look shows.
  const narrower = handEdit(VOTE, (table) => {
    table.paint.find((r) => typeof r.look === 'string').when.notFacts = ['options:leader'];
  });
  assert.deepEqual(R.behaviourReadsVerdict(narrower.js), { status: 'unread', missing: ['when.notFacts'], upgradable: false });
  assert.equal(errorsOf(narrower).length, 1);
});

test('a key this build\'s runtime reads and a saved runtime does not is refused, and importing again is the fix', () => {
  // A runtime from before the place rule: its code has no noacgPlaceAll, so `place` is not read.
  const older = { ...VOTE, js: VOTE.js.replace(/function noacgPlaceAll\(/g, 'function noacgPlaceAllGone(') };
  const withPlace = handEdit(older, (table) => {
    table.paint.push({ place: 'option', rows: 'option', from: 'options:label', anchor: 'option' });
  });
  assert.deepEqual(R.behaviourReadsVerdict(withPlace.js), { status: 'unread', missing: ['rule.place'], upgradable: true });
  assert.match(errorsOf(withPlace).join('\n'), /rule\.place.*Import the artwork again/);
});

test('versions: an additive key still parses; a table version the runtime does not list is refused; an unknown READS cannot pass', () => {
  // An additive optional key keeps version 1 and parses (the shape gate is silent about it); no
  // runtime reads it, so the export gate warns and still passes.
  const additive = handEdit(VOTE, (table) => { table.note = 'kept'; });
  assert.deepEqual(R.behaviourReadsVerdict(additive.js), { status: 'ok', ignored: ['table.note'] });
  assert.deepEqual(errorsOf(additive), []);
  assert.match(warningsOf(additive).join('\n'), /table\.note/);
  // A version 2 table under a runtime that reads version 1 is refused, not merely warned about.
  const v2 = handEdit(VOTE, (table) => { table.version = 2; });
  assert.match(errorsOf(v2).join('\n'), /version:2.*Remove those rules/);
  const none = handEdit(VOTE, (table) => { delete table.version; });
  assert.match(errorsOf(none).join('\n'), /version:none.*Set the table's "version" to 1/);
  assert.ok(R.tableWords(JSON.parse(none.js.slice(none.js.indexOf('{', none.js.indexOf('var NOACG_BEHAVIOUR = ')), none.js.indexOf('\n};\n', none.js.indexOf('var NOACG_BEHAVIOUR = ')) + 2))).includes('version:none'));
  // A runtime whose READS is of a version this build does not know: a warning, never a pass.
  const fresh = compileBinding(...Object.values(fullBinding(BEHAVIOUR_RECIPES.find((r) => r.id === 'vote'), {}))).js();
  const unknown = fresh.replace('var NOACG_BEHAVIOUR_READS = {"v":1', 'var NOACG_BEHAVIOUR_READS = {"v":9');
  assert.notEqual(unknown, fresh);
  assert.deepEqual(R.behaviourReadsVerdict(unknown), { status: 'unknown', v: 9 });
  assert.deepEqual(R.behaviourReadsVerdict(fresh), { status: 'ok' });
  const asTemplate = { ...VOTE, js: VOTE.js.replace(/var NOACG_BEHAVIOUR = /, 'var NOACG_BEHAVIOUR_READS = {"v":9};\nvar NOACG_BEHAVIOUR = ') };
  assert.match(warningsOf(asTemplate).join('\n'), /could not be checked/);
});

// ── TL5: a choice's starting option ────────────────────────────────────────────────────────

test('a choice that starts on an option is never empty, and compiles to a table its runtime reads; without one it is the empty choice it always was', () => {
  const binding = (options) => ({
    recipe: 'choice', name: 'Level', ...(options ? { options } : {}),
    rows: ['ADVISORY', 'WATCH', 'WARNING'], rowLabels: { ADVISORY: 'Advisory', WATCH: 'Watch', WARNING: 'Warning' },
    fields: {}, layers: { option: { ADVISORY: 'g1', WATCH: 'g2', WARNING: 'g3' } },
  });
  const typeOf = (b) => compileBinding([], b).type('Alert level');
  const started = typeOf(binding({ initial: 'ADVISORY' }));
  const field = started.fields.find((f) => f.label === 'Level');
  assert.equal(field.value, 'advisory');
  assert.deepEqual(field.options.map((o) => o.value), ['advisory', 'watch', 'warning'], 'no empty value');
  const group = started.machine.parallel[0];
  assert.equal(group.initial, 'advisory');
  assert.deepEqual(group.states.map((s) => s.id), ['advisory', 'watch', 'warning'], 'no "none" state');
  // Every option is reachable from every other, and from nowhere else.
  for (const state of group.states) assert.deepEqual(state.edges.map((e) => e.from).sort(), group.states.map((s) => s.id).filter((id) => id !== state.id).sort());
  assert.deepEqual(started.controls.map((c) => c.label), ['Advisory', 'Watch', 'Warning']);
  assert.deepEqual(R.behaviourReadsVerdict(compileBinding([], binding({ initial: 'ADVISORY' })).js()), { status: 'ok' });
  // An initial that names no row is ignored: the empty start.
  const empty = typeOf(binding());
  assert.deepEqual(typeOf(binding({ initial: 'NOPE' })).machine, empty.machine);
  assert.equal(empty.machine.parallel[0].initial, 'none');
  assert.deepEqual(empty.fields.find((f) => f.label === 'Level').options.map((o) => o.value), ['', 'advisory', 'watch', 'warning']);
  const tableOf = (js) => JSON.parse(js.slice(js.indexOf('{', js.indexOf('var NOACG_BEHAVIOUR = ')), js.indexOf('\n};\n', js.indexOf('var NOACG_BEHAVIOUR = ')) + 2));
  assert.equal('options' in tableOf(compileBinding([], binding()).js()), false, 'a choice without a start emits no options key');
  const startedTable = tableOf(compileBinding([], binding({ initial: 'ADVISORY' })).js());
  assert.deepEqual(startedTable.options, { 'choice.level.initial': 'ADVISORY' });
  // The field's kind names the start, so a value naming no row (a cue saved before) picks it.
  assert.equal(Object.values(startedTable.kinds).find((k) => k.kind === 'row-pick').start, 'ADVISORY');
  assert.equal('start' in Object.values(tableOf(compileBinding([], binding()).js()).kinds).find((k) => k.kind === 'row-pick'), false);
});
