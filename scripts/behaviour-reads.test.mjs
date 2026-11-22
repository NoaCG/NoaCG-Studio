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
  // Every option is reachable from every other; the start from itself too, so after data alone
  // showed another option (the machine stays on the start) its button still brings it back.
  for (const state of group.states) {
    const from = group.states.map((s) => s.id).filter((id) => id !== state.id || id === 'advisory').sort();
    assert.deepEqual(state.edges.map((e) => e.from).sort(), from);
  }
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

// ── TL5: a poll result ─────────────────────────────────────────────────────────────────────

test('a poll result is the vote with its figures live from the take; a vote without the box is unchanged', () => {
  const binding = (options) => ({
    recipe: 'vote', ...(options ? { options } : {}), rows: ['1', '2'], fields: {},
    layers: { option: { 1: 'c1', 2: 'c2' }, bar: { 1: 'c3', 2: 'c4' }, percent: { 1: 'c5', 2: 'c6' } },
  });
  const liveOf = (b) => compileBinding([], b).type('Poll result').fields.find((f) => f.label === 'Live figures').value;
  assert.equal(liveOf(binding({ figures: true })), 'live');
  assert.equal(liveOf(binding()), '');
  assert.deepEqual(R.behaviourReadsVerdict(compileBinding([], binding({ figures: true })).js()), { status: 'ok' });
  // The figures are the vote's own words: nothing new is asked of the runtime.
  const tableOf = (js) => JSON.parse(js.slice(js.indexOf('{', js.indexOf('var NOACG_BEHAVIOUR = ')), js.indexOf('\n};\n', js.indexOf('var NOACG_BEHAVIOUR = ')) + 2));
  const poll = tableOf(compileBinding([], binding({ figures: true })).js());
  assert.deepEqual(poll.options, { figures: true });
  delete poll.options;
  assert.deepEqual(poll, tableOf(compileBinding([], binding()).js()));
  assert.equal('options' in tableOf(compileBinding([], binding()).js()), false);
});


// ── TL5: Clear on a choice that starts empty; Hold on the Pop-up alert ─────────────────────

test('a choice that starts empty has Clear, back to nothing from any option; a choice with a start has none', () => {
  const binding = (rows, options) => ({
    recipe: 'choice', name: 'Verdict', ...(options ? { options } : {}),
    rows, rowLabels: Object.fromEntries(rows.map((r) => [r, r[0] + r.slice(1).toLowerCase()])),
    fields: {}, layers: { option: Object.fromEntries(rows.map((r, i) => [r, `g${i}`])) },
  });
  const typeOf = (b) => compileBinding([], b).type('Verdict card');
  const empty = typeOf(binding(['CORRECT', 'WRONG']));
  const clear = empty.controls.find((c) => c.label === 'Clear');
  assert.ok(clear, 'Clear is a button');
  assert.deepEqual(Object.values(clear.set), [''], 'Clear sets the empty value');
  const none = empty.machine.parallel[0].states.find((s) => s.id === 'none');
  // From every option, and from none too: data alone can show an option while the machine rests
  // on none, so Clear stays live to take it away.
  assert.deepEqual(none.edges.map((e) => [e.from, e.event]), [['none', clear.event], ['correct', clear.event], ['wrong', clear.event]]);
  assert.deepEqual(R.behaviourReadsVerdict(compileBinding([], binding(['CORRECT', 'WRONG'])).js()), { status: 'ok' });
  // A choice with a start is never empty, so it has no Clear.
  const started = typeOf(binding(['CORRECT', 'WRONG'], { initial: 'CORRECT' }));
  assert.equal(started.controls.some((c) => c.label === 'Clear'), false);
  // An option named Clear keeps its own button, and no second one is made.
  const named = typeOf(binding(['CLEAR', 'CLOUDY']));
  assert.deepEqual(named.controls.map((c) => c.label), ['Clear', 'Cloudy']);
  assert.deepEqual(named.machine.parallel[0].states.find((s) => s.id === 'none').edges, []);
});

test('a Pop-up alert with Hold on air has Hold and Take it off; without it the machine is the one it was', () => {
  const binding = (options) => ({ recipe: 'alert', ...(options ? { options } : {}), rows: [], fields: {}, layers: {} });
  const typeOf = (b) => compileBinding([], b).type('Chat highlight');
  const plain = typeOf(binding());
  assert.deepEqual(plain.controls, []);
  assert.equal(plain.machine.main.branches, undefined);
  assert.deepEqual(typeOf(binding({ hold: false })).machine, plain.machine, 'an unticked box is the alert as it was');
  const held = typeOf(binding({ hold: true }));
  assert.deepEqual(held.controls.map((c) => [c.label, c.event]), [['Hold on air', 'hold'], ['Take it off', 'dismiss']]);
  assert.deepEqual(held.machine.main.edges, [...plain.machine.main.edges, { from: { waypoint: 0 }, to: { waypoint: -1 }, trigger: 'operator', event: 'dismiss' }], 'the self-clear stays, and Take it off works unheld');
  const [branch] = held.machine.main.branches;
  assert.equal(branch.id, 'held');
  assert.equal(branch.timeline, null, 'holding plays nothing');
  assert.deepEqual(branch.edges.map((e) => [e.from, e.to, e.trigger, e.event]), [[{ waypoint: 0 }, 'held', 'operator', 'hold'], ['held', { waypoint: -1 }, 'operator', 'dismiss'], ['held', { waypoint: -1 }, 'operator', 'next']]);
  assert.equal(branch.edges.some((e) => e.trigger === 'timer'), false, 'nothing arms the timer again');
});

// ── TL5 group 7: tiers on the goal meter (Rules M1-M5), quiz rows in use (Q1-Q3), S1-S2 ──────

/** The emitted JS of one binding, run in Node with its fields' values: the real runtime's kinds,
 *  asked the way a paint rule asks them. */
function runtimeOf(binding, artworkFields = []) {
  const compiled = compileBinding(artworkFields, binding);
  const js = compiled.js();
  const values = {};
  const document = { getElementById: (id) => (id in values ? { textContent: values[id] } : null), querySelectorAll: () => [], readyState: 'complete', addEventListener() {} };
  const run = new Function('document', 'window', `${js}\n;return { NOACG_BEHAVIOUR, fact: noacgFactHolds, derive: noacgDerive };`);
  const rt = run(document, { addEventListener() {} });
  return { compiled, js, table: rt.NOACG_BEHAVIOUR, values, fact: rt.fact, derive: rt.derive };
}

/**
 * THE REFERENCE MODEL, written from Rules M2-M4 and nothing else (never from the runtime): the
 * box's lines, split at the last bar sign; row n is listed when line n exists; a figure is
 * readable when the text after the bar sign holds a number; reached is listed, readable and met;
 * a segment runs from the nearest earlier readable figure (0 before the first) to its own.
 */
function tierModel(lines, current, rowCount) {
  const parsed = lines.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const bar = line.lastIndexOf('|');
    const amount = bar === -1 ? '' : line.slice(bar + 1).trim();
    const digits = amount.replace(/[^\d.-]/g, '');
    return { label: bar === -1 ? line : line.slice(0, bar).trim(), amount, figure: digits === '' ? null : Number(digits) };
  });
  const now = current.replace(/[^\d.-]/g, '') === '' ? null : Number(current.replace(/[^\d.-]/g, ''));
  return Array.from({ length: rowCount }, (_, i) => {
    const row = parsed[i];
    if (!row) return { listed: false, reached: false, span: 0, label: '', amount: '', hasLabel: false, hasAmount: false };
    const reached = row.figure !== null && now !== null && now >= row.figure;
    let span = 0;
    if (row.figure !== null && now !== null) {
      const earlier = parsed.slice(0, i).reverse().find((r) => r.figure !== null);
      const from = earlier ? earlier.figure : 0;
      span = row.figure > from ? Math.min(1, Math.max(0, (now - from) / (row.figure - from))) : now >= row.figure ? 1 : 0;
    }
    return { listed: true, reached, span, label: row.label, amount: row.amount, hasLabel: row.label !== '', hasAmount: row.amount !== '' };
  });
}

const TIERS = ['1', '2', '3', '4'];
const meterBinding = (extra = {}) => ({
  recipe: 'meter', rows: TIERS, fields: {},
  layers: {
    bar: 'c0', tier: Object.fromEntries(TIERS.map((k) => [k, `t${k}`])), 'tier.figure': Object.fromEntries(TIERS.map((k) => [k, `h${k}`])),
    'tier.reached': Object.fromEntries(TIERS.map((k) => [k, `r${k}`])), 'tier.bar': Object.fromEntries(TIERS.map((k) => [k, `s${k}`])),
  },
  ...extra,
});

test('tiers: the runtime reads the Milestones box against Current exactly as the Rules say (M2-M4, a reference model)', () => {
  const rt = runtimeOf(meterBinding());
  const { fields } = rt.table;
  const cases = [
    ['Warm-up | 5000\nHalfway | 15000\nStretch | 30000\nDream | 50000', '18400'],
    ['Warm-up | 5000\nHalfway | 15000\nStretch | 30000\nDream | 50000', '0'],
    ['Warm-up | 5000\nHalfway | 15000\nStretch | 30000\nDream | 50000', '50000'],
    ['Warm-up | 5000\nHalfway | 15000\nStretch | 30000\nDream | 50000', '99999'],
    ['A | $5,000\nB | $15,000', '$10,000'],
    // A line with no readable figure is never reached; the next segment runs from the one before.
    ['A | 10\nB\nC | 30', '25'],
    ['A | 10\nB | soon\nC | 30', '35'],
    // Figures not ascending: a segment that cannot run is full when reached, else empty.
    ['A | 20\nB | 10\nC | 40', '15'],
    ['A | 20\nB | 10\nC | 40', '5'],
    // A label holding a bar sign keeps it: the split is at the last one.
    ['Rock | roll | 10\nB | 20', '10'],
    // Fewer lines than tiers, more lines than tiers, no lines, blank lines, no Current.
    ['A | 10', '5'],
    ['A | 1\nB | 2\nC | 3\nD | 4\nE | 5', '3'],
    ['', '50'],
    ['\n  \nA | 10\n\nB | 20\n', '15'],
    ['A | 10\nB | 20', ''],
    // A line with no label, or nothing after its bar sign: listed, its readout has nothing to show.
    ['| 10\nB |\nC | 30', '12'],
  ];
  for (const [lines, current] of cases) {
    rt.values[fields.milestones] = lines;
    rt.values[fields.current] = current;
    const want = tierModel(lines, current, TIERS.length);
    TIERS.forEach((key, i) => {
      const at = `${JSON.stringify(lines)} at ${JSON.stringify(current)}, tier ${key}`;
      assert.equal(rt.fact('milestones:listed', key), want[i].listed, `${at}: listed`);
      assert.equal(rt.fact('milestones:reached', key), want[i].reached, `${at}: reached`);
      assert.ok(Math.abs(rt.derive('milestones:span', key) - want[i].span) < 1e-9, `${at}: span ${rt.derive('milestones:span', key)} for ${want[i].span}`);
      assert.equal(rt.derive('milestones:label', key), want[i].label, `${at}: label`);
      assert.equal(rt.derive('milestones:amount', key), want[i].amount, `${at}: amount as typed`);
      assert.equal(rt.fact('milestones:has-label', key), want[i].hasLabel, `${at}: has a label`);
      assert.equal(rt.fact('milestones:has-amount', key), want[i].hasAmount, `${at}: has a figure`);
    });
  }
  measured(cases.length, 'milestone cases against the reference model');
});

/** Saved markup drawing these texts in the meter binding's tier layers (`t1`, `h1` and so on). */
const tierMarkup = (tiers, figures = {}) => `<svg>${[...Object.entries(tiers).map(([k, v]) => `<text data-noacg-candidate="t${k}">${v}</text>`), ...Object.entries(figures).map(([k, v]) => `<text data-noacg-candidate="h${k}">${v}</text>`)].join('')}</svg>`;

test('tiers: the box starts as the tiers are drawn, made after Current and Target; a meter without tiers is the meter it was', () => {
  const markup = tierMarkup({ 1: 'Warm-up', 2: 'Halfway', 3: 'Stretch', 4: 'Dream' }, { 1: '5,000', 2: '15,000', 4: '50,000' });
  const type = compileBinding([], meterBinding({ markup })).type('Milestone track');
  assert.deepEqual(type.fields.map((f) => [f.key, f.value]), [
    ['current', '0'], ['target', '100'],
    ['milestones', 'Warm-up | 5,000\nHalfway | 15,000\nStretch\nDream | 50,000'],
  ], 'a tier drawn without its figure is its label alone, never reached');
  // One line per row, whatever is drawn: an empty tier is named for its row; a label holding a bar
  // sign and no figure keeps it.
  const odd = compileBinding([], meterBinding({ markup: tierMarkup({ 1: 'Rock | Roll', 2: '', 3: 'C', 4: 'D' }, { 3: '30' }) })).type('Milestone track');
  assert.equal(odd.fields.find((f) => f.key === 'milestones').value, 'Rock | Roll |\nTier 2\nC | 30\nD');
  assert.deepEqual(R.behaviourReadsVerdict(compileBinding([], meterBinding({ markup })).js()), { status: 'ok' });
  // S1: no tiers - with no rows at all, or none chosen - is the meter's own table, fields and html.
  const plain = (rows) => compileBinding([], { recipe: 'meter', ...(rows ? { rows } : {}), fields: {}, layers: { bar: 'c0', percent: 'c1' } });
  for (const rows of [undefined, []]) {
    const c = plain(rows);
    const { table } = runtimeOf({ recipe: 'meter', ...(rows ? { rows } : {}), fields: {}, layers: { bar: 'c0', percent: 'c1' } });
    assert.deepEqual(table, {
      version: 1, recipe: 'meter',
      paint: [{ gauge: 'bar', from: 'current:fraction' }, { write: 'percent', from: 'current:percent' }],
      fields: { current: 'f0', target: 'f1' }, kinds: { f0: { kind: 'fraction', total: 'f1' } },
    });
    assert.deepEqual(c.type('Meter').fields.map((f) => f.key), ['current', 'target']);
    assert.doesNotMatch(c.html(0), /milestones|Milestones/);
  }
  // A drawn label with markup characters reaches the box as text, never as markup.
  const html = compileBinding([], meterBinding({ markup: tierMarkup({ 1: 'R&amp;D &lt;b&gt;', 2: 'B', 3: 'C', 4: 'D' }) })).html(0);
  assert.match(html, /R&amp;D &lt;b&gt;/);
});

test('quiz rows in use: a Row shows while its answer has text, and no pick or verdict lights a row not in use; a board without a Row is the quiz it was', () => {
  const artworkFields = ['Question', 'Answer A', 'Answer B', 'Answer C'].map((title, i) => ({ field: `f${i}`, ftype: 'textfield', title, value: '' }));
  const quiz = (rowLayers) => ({
    recipe: 'quiz', rows: ['A', 'B', 'C'],
    fields: { question: 0, answer: { A: 1, B: 2, C: 3 } },
    layers: { 'answer.selected': { A: 's1', B: 's2', C: 's3' }, 'answer.correct': { A: 'k1', B: 'k2', C: 'k3' }, 'answer.wrong': { A: 'w1', B: 'w2', C: 'w3' }, ...(rowLayers ? { 'answer.row': rowLayers } : {}) },
  });
  // S1: no Row drawn asks nothing new of the runtime: the three looks are exactly as before.
  const plain = runtimeOf(quiz(), artworkFields);
  assert.doesNotMatch(JSON.stringify(plain.table), /filled|answer\.row/);
  assert.deepEqual(plain.table.paint.filter((r) => r.look).map((r) => [r.look, r.when.facts ?? []]), [
    ['answer.selected', ['selectedAnswer:picked']], ['answer.correct', ['correctAnswer:picked']], ['answer.wrong', ['correctAnswer:unpicked']], ['locked', []],
  ]);
  // One Row drawn makes the whole board count rows in use.
  const rows = runtimeOf(quiz({ C: 'p3' }), artworkFields);
  assert.deepEqual(R.behaviourReadsVerdict(rows.js), { status: 'ok' });
  // The verdict looks are the quiz's own; the dropdowns' kind keeps every fact off a row not in use.
  assert.deepEqual(rows.table.paint.filter((r) => r.look && r.look !== 'answer.row'), plain.table.paint.filter((r) => r.look));
  assert.deepEqual(rows.table.paint.find((r) => r.look === 'answer.row'), { look: 'answer.row', rows: 'answer', when: { facts: ['answer:filled'] } }, 'a Row never pops');
  assert.deepEqual(Object.values(rows.table.kinds).filter((k) => k.kind === 'row-pick'), [{ kind: 'row-pick', rows: 'answer', inUse: 'answer' }, { kind: 'row-pick', rows: 'answer', inUse: 'answer' }]);
  // In use while the answer holds text other than spaces (Q1, Q3).
  const { fields } = rows.table;
  Object.assign(rows.values, { [fields.answer.A]: 'Neptune', [fields.answer.B]: '   ', [fields.answer.C]: 'Saturn' });
  assert.deepEqual(['A', 'B', 'C'].map((k) => rows.fact('answer:filled', k)), [true, false, true]);
  // A pick or a key naming a row not in use names nothing (Q2): no Wrong lights from it.
  rows.values[fields.correctAnswer] = 'B';
  assert.deepEqual(['A', 'B', 'C'].map((k) => [rows.fact('correctAnswer:picked', k), rows.fact('correctAnswer:unpicked', k)]), [[false, false], [false, false], [false, false]]);
  // A key on a row in use: Correct there, Wrong only on the other rows in use, nothing on B.
  rows.values[fields.correctAnswer] = 'C';
  assert.deepEqual(['A', 'B', 'C'].map((k) => [rows.fact('correctAnswer:picked', k), rows.fact('correctAnswer:unpicked', k)]), [[false, true], [false, false], [true, false]]);
  rows.values[fields.selectedAnswer] = 'B';
  assert.deepEqual(['A', 'B', 'C'].map((k) => rows.fact('selectedAnswer:picked', k)), [false, false, false], 'a pick of a row not in use lights nothing');
  // Without Rows the dropdowns read exactly as before: a key on an empty answer is still the key.
  assert.deepEqual(Object.values(plain.table.kinds).filter((k) => k.kind === 'row-pick'), [{ kind: 'row-pick', rows: 'answer' }, { kind: 'row-pick', rows: 'answer' }]);
  Object.assign(plain.values, { [plain.table.fields.answer.B]: '', [plain.table.fields.correctAnswer]: 'B' });
  assert.equal(plain.fact('correctAnswer:picked', 'B'), true);
  // The quiz's controls, machine and fields are unchanged by the Row (Q2, Q3).
  const typeOf = (b) => compileBinding(artworkFields, b).type('Quiz show');
  assert.deepEqual(typeOf(quiz({ C: 'p3' })).controls, typeOf(quiz()).controls);
  assert.deepEqual(typeOf(quiz({ C: 'p3' })).machine, typeOf(quiz()).machine);
  assert.deepEqual(typeOf(quiz({ C: 'p3' })).fields, typeOf(quiz()).fields);
});

test('S2: the frozen runtime refuses the new words, and importing again is the fix', () => {
  const table = JSON.parse(VOTE.js.slice(VOTE.js.indexOf('{', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')), VOTE.js.indexOf('\n};\n', VOTE.js.indexOf('var NOACG_BEHAVIOUR = ')) + 2));
  const textRole = Object.entries(table.fields).find(([, id]) => typeof id === 'string' && !(table.kinds ?? {})[id])[0];
  const asksFilled = handEdit(VOTE, (t) => {
    t.paint.push({ look: 'badge', when: { facts: [`${textRole}:filled`] } });
  });
  assert.deepEqual(R.behaviourReadsVerdict(asksFilled.js), { status: 'unread', missing: ['fact:text.filled'], upgradable: true });
  const asksTiers = handEdit(VOTE, (t) => {
    t.kinds.f90 = { kind: 'list', rows: 'option', of: textRole };
    t.fields.tiers = 'f90';
    t.paint.push({ look: 'badge', rows: 'option', when: { facts: ['tiers:reached'] } });
    t.paint.push({ gauge: 'bar', rows: 'option', from: 'tiers:span' });
    t.paint.push({ write: 'option', rows: 'option', from: 'tiers:amount' });
  });
  const verdict = R.behaviourReadsVerdict(asksTiers.js);
  assert.equal(verdict.status, 'unread');
  assert.equal(verdict.upgradable, true);
  assert.deepEqual([...verdict.missing].sort(), ['derive:list.amount', 'derive:list.span', 'fact:list.reached', 'kind:list.of'].sort());
  const asksInUse = handEdit(VOTE, (t) => {
    t.kinds.f91 = { kind: 'row-pick', rows: 'option', inUse: textRole };
    t.fields.key = 'f91';
    t.paint.push({ look: 'badge', rows: 'option', when: { facts: ['key:picked', 'tiers:has-label'] } });
    t.kinds.f90 = { kind: 'list', rows: 'option' };
    t.fields.tiers = 'f90';
  });
  const more = R.behaviourReadsVerdict(asksInUse.js);
  assert.equal(more.upgradable, true);
  assert.deepEqual([...more.missing].sort(), ['fact:list.has-label', 'kind:row-pick.inUse']);
});

test('the build reads the text a bound layer draws off the saved markup, as textContent joins it', async () => {
  const { drawnTextOf } = await load('src/templates/importedDesign/behaviour.ts');
  const markup = '<svg><text data-noacg-candidate="c1" x="0"><tspan>War</tspan><tspan>m-up</tspan></text><text data-noacg-candidate="c2">R&amp;D &#8364;5</text><rect data-noacg-candidate="c3"/></svg>';
  assert.equal(drawnTextOf(markup, 'c1'), 'Warm-up');
  assert.equal(drawnTextOf(markup, 'c2'), 'R&D €5');
  assert.equal(drawnTextOf(markup, 'c3'), '');
  // Drawn on two lines, the words stay apart; split on one line, they join.
  const lines = '<text data-noacg-candidate="c4"><tspan x="0" y="0">Stretch</tspan><tspan x="0" y="30">goal</tspan></text><text data-noacg-candidate="c5"><tspan x="0" y="0">Big</tspan><tspan x="0" dy="1.2em">win</tspan></text><text data-noacg-candidate="c6"><tspan x="0" y="0">Kick</tspan><tspan x="41" y="0">off</tspan></text>';
  assert.deepEqual(['c4', 'c5', 'c6'].map((id) => drawnTextOf(lines, id)), ['Stretch goal', 'Big win', 'Kickoff']);
  // A baseline nudge inside a line (a superscript) is no line: it joins, as the import reads it.
  const nudged = '<text data-noacg-candidate="c8" font-size="28"><tspan x="0" y="0">10</tspan><tspan dy="-5">th</tspan><tspan dy="5"> goal</tspan></text><text data-noacg-candidate="c9" font-size="28"><tspan x="0" y="0">10</tspan><tspan y="-4">th</tspan></text><text data-noacg-candidate="c10" font-size="20"><tspan x="0" y="0">Big</tspan><tspan x="0" dy="24">win</tspan></text>';
  assert.deepEqual(['c8', 'c9', 'c10'].map((id) => drawnTextOf(nudged, id)), ['10th goal', '10th', 'Big win']);
  // Entities are read once: an escaped ampersand never starts a second entity.
  assert.equal(drawnTextOf('<text data-noacg-candidate="c7">R&amp;lt;D &#38;amp;</text>', 'c7'), 'R&lt;D &amp;');
  // What is left of a broken tag is never text: no angle bracket survives but an entity's.
  assert.equal(drawnTextOf('<text data-noacg-candidate="c11"><<b>script>A &lt;b&gt; <</text>', 'c11'), 'scriptA <b>');
  assert.equal(drawnTextOf(markup, 'c9'), '');
});
