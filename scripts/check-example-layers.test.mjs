// guards: public/docs/examples/**, docs/tutorials/**, src/templates/behaviours/layer-names.json, src/templates/behaviours/words.json
//
// THE LAYER-NAMING GATE, MUTATION-CHECKED.
//
// scripts/check-example-layers.mjs passes every example file today. A gate that passes is only
// worth something if it FAILS on the drift it exists for, so each test below breaks a real file
// the way an agent drawing a graphic has broken one (a plate named `Row A`, a label without
// `static:`, a Finnish synonym, a moment left visible, the background called `Background`) and
// asserts the rule that must catch it. Then it builds a throwaway repository with a broken copy
// in EACH covered folder and checks that the file walk finds every one and skips only the
// exempt set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { auditSvg, coveredFiles, EXEMPT, readSystem, renderCheat, cheatBlock, ROOT } from './check-example-layers.mjs';

const ctx = readSystem();
// LF throughout: a Windows checkout with core.autocrlf hands the files over with CRLF, and the
// mutations below anchor on line breaks.
const example = (name) => readFileSync(path.join(ROOT, 'public', 'docs', 'examples', name), 'utf8').replace(/\r\n/g, '\n');
const audit = (src, words = ctx.words) => auditSvg(src, { system: ctx.system, words });

/** Replace exactly one thing, so a mutation that stopped matching fails loudly. */
function mutate(src, from, to) {
  const hits = src.split(from).length - 1;
  assert.ok(hits > 0, `the mutation's anchor ${JSON.stringify(from)} is not in the file`);
  return src.split(from).join(to);
}

/** Assert the audit reports a problem under `rule` whose text matches `pattern`. */
function caught(problems, rule, pattern) {
  assert.ok(
    problems.some((p) => p.startsWith(`${rule}:`) && pattern.test(p)),
    `expected a "${rule}" problem matching ${pattern}, got:\n  ${problems.join('\n  ') || '(none)'}`,
  );
}

test('every covered example follows the system as committed', () => {
  const { covered } = coveredFiles();
  assert.ok(covered.length >= 7, `only ${covered.length} covered files`);
  for (const file of covered) assert.deepEqual(audit(readFileSync(path.join(ROOT, file), 'utf8')), [], file);
});

test('a plate named for its row rather than its text is caught', () => {
  const src = mutate(example('quiz.svg'), 'data-name="Answer box B"', 'data-name="Row B"');
  caught(audit(src), 'board', /"Row B" sits under "Answer B" alone - name its plate "Answer box B"/);
});

test('a plate named for a text that does not exist is caught', () => {
  const src = mutate(example('ticker.svg'), 'data-name="Kicker box"', 'data-name="Tag box"');
  caught(audit(src), 'board', /"Tag box" is named as a plate, and there is no "Tag" text/);
});

test('a background not called Panel is caught', () => {
  const src = mutate(example('ticker.svg'), 'data-name="Panel"', 'data-name="Strip"');
  caught(audit(src), 'board', /"Strip" is the background, under every text - name it "Panel"/);
});

test('fixed words without static: are caught', () => {
  const src = mutate(example('quiz.svg'), 'data-name="static:Letter C"', 'data-name="Letter C"');
  caught(audit(src), 'board', /the text "Letter C" in Board is not static:/);
});

test('a synonym instead of the taught spelling is caught, and so is a name that is not English', () => {
  const finnish = mutate(example('quiz.svg'), 'data-name="Answer A"', 'data-name="Vastaus A"');
  caught(audit(finnish), 'text', /"Vastaus A" reads as the quiz answer - spell it "Answer A"/);
  const letters = mutate(example('scoreboard.svg'), 'data-name="Team 2"', 'data-name="Joukkue 2"');
  caught(audit(letters), 'text', /"Joukkue 2" reads as the score team - spell it "Team 2"/);
  const umlaut = mutate(example('name-tag.svg'), 'data-name="Role"', 'data-name="Tehtävä"');
  caught(audit(umlaut), 'english', /"Tehtävä" is not plain English/);
});

test('a row put first, or a name spelled with underscores, is caught', () => {
  caught(audit(mutate(example('quiz.svg'), 'data-name="Answer C"', 'data-name="C Answer"')), 'english', /puts its row first/);
  caught(audit(mutate(example('scoreboard.svg'), 'data-name="Score 1"', 'data-name="score_1"')), 'english', /not spelled the taught way/);
});

test('a moment left visible, or not a group, is caught; a bar drawn full stays visible', () => {
  const visible = mutate(example('quiz.svg'), 'data-name="Selected A" display="none"', 'data-name="Selected A"');
  caught(audit(visible), 'moments', /"Selected A" must be a hidden group/);
  const hiddenBar = mutate(example('live-vote.svg'), 'data-name="Bar 2"', 'data-name="Bar 2" display="none"');
  caught(audit(hiddenBar), 'moments', /"Bar 2" is a bar - draw it at full length and leave it visible/);
});

test('a moment NoaCG does not know, or one whose row has no text, is caught', () => {
  caught(audit(mutate(example('scoreboard.svg'), 'data-name="Full time"', 'data-name="Sparkle"')), 'moments', /"Sparkle" is not a moment NoaCG knows/);
  caught(audit(mutate(example('scoreboard.svg'), 'data-name="Flash 2"', 'data-name="Flash 3"')), 'moments', /"Flash 3" belongs to row 3, and no text in Text has that row/);
});

test('the layers: a stray name, the wrong order, an empty layer and a missing Text are caught', () => {
  caught(audit(mutate(example('ticker.svg'), 'data-name="Board"', 'data-name="Artwork"')), 'layers', /"Artwork" is not one of Text, Moments, Board/);
  caught(audit(mutate(example('name-tag.svg'), 'data-name="Text"', 'data-name="Fields"')), 'layers', /there is no "Text" layer/);
  // Board painted LAST puts it at the top of the Layers panel.
  const src = example('name-tag.svg');
  const board = / {2}<!-- BOARD[\s\S]*?<\/g>\n/.exec(src)[0];
  caught(audit(src.replace(board, '').replace('</svg>', `${board}</svg>`)), 'layers', /the layers run Board, Text from the top - they go Text, Board/);
  caught(audit(mutate(src, '</svg>', '<g id="Moments" data-name="Moments"/>\n</svg>')), 'layers', /the "Moments" layer is empty/);
});

test('a simple type keeps its one field set', () => {
  // The drift the owner saw: credits drawn as a field per name.
  const perName = mutate(example('end-credits.svg'), '  </g>\n</svg>', '    <text data-name="Director name" x="960" y="930">Maya Lind</text>\n  </g>\n</svg>');
  caught(audit(perName), 'text', /"Director name" is not a credits field - a credits graphic has Credits and Heading/);
  // Lower thirds used Name and Title in one file and Name and Role in another.
  const titled = mutate(example('name-tag.svg'), 'data-name="Role"', 'data-name="Title"');
  caught(audit(titled), 'text', /mix title and name tag names/);
});

test('the behaviour words come from words.json at run time, never from a copy', () => {
  // A moment word that does not exist yet is refused...
  const src = mutate(example('scoreboard.svg'), 'data-name="Full time"', 'data-name="Sparkle"');
  caught(audit(src), 'moments', /"Sparkle" is not a moment NoaCG knows/);
  // ...and accepted the moment words.json teaches it, with no edit to the check.
  const words = structuredClone(ctx.words);
  words.score.roles.push({ id: 'sparkle', label: 'Sparkle', kind: 'layer', paint: ['look'], pool: 'drawn', words: 'sparkle', teach: 'Sparkle', what: 'test' });
  assert.deepEqual(audit(src, words), []);
});

test('genuine Illustrator output is read: the transforms, the class-hidden moments, the escaped ids', () => {
  // The talk-show quiz was written by Illustrator 2026's own SVG save. It breaks the Board rule
  // (Row A to Row D), and renamed to the system it passes, so the check reads Illustrator's
  // markup and not only the hand-written examples.
  const genuine = readFileSync(path.join(ROOT, 'docs', 'tutorials', 'talk-show-set', 'import-ready', 'quiz.svg'), 'utf8');
  caught(audit(genuine), 'board', /"Row A" sits under "Answer A" alone - name its plate "Answer box A"/);
  const fixed = genuine.replace(/id="Row_([A-D])"/g, 'id="Answer_box_$1"');
  assert.deepEqual(audit(fixed), []);
});

test('the file walk covers every folder it promises and skips only the exempt one', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'example-layers-'));
  try {
    // The system files, so the walk's root is a whole (tiny) repository.
    for (const rel of ['src/templates/behaviours/layer-names.json', 'src/templates/behaviours/words.json']) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      cpSync(path.join(ROOT, rel), path.join(root, rel));
    }
    const broken = mutate(example('quiz.svg'), 'data-name="Answer box A"', 'data-name="Row A"');
    const folders = ['public/docs/examples', 'docs/tutorials/demo/import-ready', 'docs/tutorials/demo/SVG', ...EXEMPT.keys()].map((f) => (f.startsWith('docs/tutorials/talk') ? `${f}/import-ready` : f));
    for (const folder of folders) {
      mkdirSync(path.join(root, folder), { recursive: true });
      writeFileSync(path.join(root, folder, 'quiz.svg'), broken);
    }
    const { covered, exempt } = coveredFiles(root);
    assert.deepEqual(covered.sort(), ['docs/tutorials/demo/SVG/quiz.svg', 'docs/tutorials/demo/import-ready/quiz.svg', 'public/docs/examples/quiz.svg']);
    assert.deepEqual(exempt, ['docs/tutorials/talk-show-set/import-ready/quiz.svg']);
    const sys = readSystem(root);
    for (const file of covered) caught(auditSvg(readFileSync(path.join(root, file), 'utf8'), sys), 'board', /"Row A" sits under "Answer A"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the cheat sheet is five lines and renders the same into every form', () => {
  assert.equal(ctx.system.cheatSheet.length, 5);
  const page = 'intro\r\n<!-- layer-cheat-sheet:start -->\r\n<!-- layer-cheat-sheet:end -->\r\nrest';
  const once = renderCheat(page, ctx.system.cheatSheet, 'md');
  assert.equal(renderCheat(once, ctx.system.cheatSheet, 'md'), once, 'writing twice changes nothing');
  assert.ok(!once.replace(/\r\n/g, '').includes('\n'), 'the page keeps its own line ending');
  const html = cheatBlock(ctx.system.cheatSheet, 'html');
  assert.equal((html.match(/<li>/g) ?? []).length, 5);
  assert.ok(html.includes('<code>Answer box A</code>') && html.includes('Save a Copy &gt; SVG'));
  assert.equal(renderCheat('no markers here', ctx.system.cheatSheet, 'md'), null);
});
