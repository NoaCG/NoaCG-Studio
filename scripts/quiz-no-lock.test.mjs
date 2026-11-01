// guards: src/templates/behaviours/quiz.ts, src/templates/types/answerBoard.ts, src/templates/behaviours/recipe.ts, src/templates/behaviours/words.json, src/templates/importedDesign/behaviour.ts
//
// SAVED QUIZZES KEEP THEIR BYTES, AND THE TRUE NO-LOCK QUIZ HAS NO LOCK AND NO TIMER
// (docs/work-specs/jev-svg-import/spec.md, rows 14 and 15, AC-12; evidence/phase-15.md).
//
// Row 14 added a quiz with no lock at all (`options.noLock`). Every quiz saved before it carries
// one of seven option shapes, and each must compile to the bytes it compiled to before the
// variant existed. The PINS below are those bytes' SHA-256, per part of the compiled behaviour:
//
//   data    the emitted JS up to the shared paint runtime: the NOACG_BEHAVIOUR table, with the
//           options, rows, fields, kinds and paint rules this recipe wrote
//   type    the graphic type the cue and the playout surfaces read: machine, controls, fields
//   steps   the default path the recipe splices into the animation data
//   fields  the hidden holders it owns (answer key and pick), with their ids
//   html    those holders' markup
//   marks   what it stamps on the drawn layers (`data-noacg-role`, the look class): the
//           animation targets
//
// The shared paint runtime and the look CSS are the same string for every recipe and every
// option, so they are asserted to be exactly that string rather than pinned here: a change to
// the runtime moves every imported graphic and is guarded where the runtime is.
//
// WHERE THE PINS CAME FROM. They were computed on main at 043fcccb (before row 14 added the
// variant) and on this row's branch, and were equal for all seven shapes. The test can be run
// against any other source tree, which is how that was checked and how it can be checked again:
//
//   QUIZ_SRC=<another checkout>/src/ node --test scripts/quiz-no-lock.test.mjs
//
// NO RE-RECORD SWITCH, ON PURPOSE (as scripts/jev-svg-baseline.test.mjs). A change that moves a
// saved quiz's bytes edits this file by hand, so the difference is in a pull request's diff. A
// failing shape prints its fresh record as one `[quiz-no-lock] record <shape> <json>` line. The
// pins are also not the only check: each profile's machine is compared with an edge list written
// out by hand from the rules below, so a re-pinned regression still fails there.
//
// The rules (phase notes, rows 14 and 15):
//   Q1 A saved quiz (no `noLock`) keeps its lock, its hidden-pick seal, its buttons and its look.
//   Q2 The five-second timer starts at the lock: one timer arrow, from `locked`, after 5. Nothing
//      else in any quiz is timed, so a pick or a sealed answer never reveals by itself.
//   Q3 The no-Lock quiz has no lock state, seal, lock or reveal-choice event or button, Locked in
//      look, or timer. A pick goes to the reveal by Reveal correct or Next.
//   Q4 No lock with the timed reveal is refused by name rather than moving the timer to the pick.
//   Q5 No lock keeps the answer key and pick fields at their ids, and stamps the same layers.
//
//   node --test scripts/quiz-no-lock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { measured } from './measured.mjs';
import { rawSuffix } from './rolldown-raw.mjs';

const SRC = process.env.QUIZ_SRC ?? fileURLToPath(new URL('../src/', import.meta.url));
const ENTRY = '\0quiz-no-lock-entry';

/** The compiler and the shared runtime, from SRC, bundled as the build would. No browser: the
 *  compile is pure, and `markLayers` is handed a stand-in root below. */
async function load() {
  const at = (rel) => JSON.stringify(`${SRC}${rel}`);
  const bundle = await rolldown({
    input: ENTRY,
    platform: 'neutral',
    logLevel: 'silent',
    plugins: [
      rawSuffix,
      {
        name: 'quiz-no-lock-entry',
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) =>
          id === ENTRY
            ? `export { compileBinding } from ${at('templates/importedDesign/behaviour.ts')};\n` +
              `export { behaviourRuntimeJs, lookCss } from ${at('templates/importedDesign/behaviourRuntime.ts')};\n`
            : null,
      },
    ],
  });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
}
const M = await load();

const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

/** A four-answer board: the question and four answers are artwork text (f0-f4), and every drawn
 *  moment is bound, the lock included. */
const ROWS = ['A', 'B', 'C', 'D'];
const ART = ['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D'].map((title, i) => ({ field: `f${i}`, ftype: 'textfield', title, value: title }));
const perRow = (prefix) => Object.fromEntries(ROWS.map((r, i) => [r, `${prefix}${i}`]));
const binding = (options) => ({
  recipe: 'quiz',
  rows: ROWS,
  ...(options === undefined ? {} : { options }),
  fields: { question: 0, answer: { A: 1, B: 2, C: 3, D: 4 } },
  layers: { 'answer.selected': perRow('s'), 'answer.correct': perRow('c'), 'answer.wrong': perRow('w'), locked: 'k0' },
});
const compile = (options) => M.compileBinding(ART, binding(options));
const ANIM = {
  steps: [
    { name: 'In', duration: 0.5, ease: 'power2.out', calls: [], layers: {} },
    { name: 'Out', duration: 0.4, ease: 'power2.in', calls: [], layers: {} },
  ],
};

/** What `markLayers` writes, on stand-in elements that start hidden the way a designer draws a
 *  moment (`display="none"` and an inline `display:none`). */
function marks(bound) {
  const els = new Map();
  const root = {
    querySelector(selector) {
      const id = /="([^"]+)"/.exec(selector)?.[1];
      if (!els.has(id)) {
        const attrs = { display: 'none', style: 'display:none' };
        els.set(id, { attrs, getAttribute: (n) => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: (n) => { delete attrs[n]; } });
      }
      return els.get(id);
    },
  };
  bound.markLayers(root);
  return Object.fromEntries([...els].sort(([a], [b]) => a.localeCompare(b)).map(([id, el]) => [id, el.attrs]));
}

const RUNTIME = M.behaviourRuntimeJs(false, false);

function record(options) {
  const bound = compile(options);
  const js = bound.js();
  assert.ok(js.endsWith(RUNTIME), 'the emitted JS ends with the shared paint runtime');
  assert.equal(bound.css, M.lookCss, 'the CSS is the shared look CSS');
  return {
    data: sha(js.slice(0, js.length - RUNTIME.length)),
    type: sha(bound.type()),
    steps: sha(bound.steps(ANIM)),
    fields: sha(bound.fields(ART.length)),
    html: sha(bound.html(ART.length)),
    marks: sha(marks(bound)),
  };
}

// The parts no option changes.
const SHARED = {
  steps: '2f0a3aec7db02c299da064e55b0ed347d354f65afda55bd5ad90a8fcdcf9bf31',
  fields: '21b07113a7f1270302afaed327b370f990c6825d2af2e9b1118b68062063943b',
  html: '0fcf3daae20e48b5baf2e9797f653076adcfb700a361552e15daa350e23af167',
  marks: '8be768d0c00a8d228500032edd821a0c6c0c346253908f9dca200f4b56139675',
};
const LOCK_REQUIRED = { ...SHARED, data: '8787390d35d4d06abde67d24960104fc2a2e171a78c0f62abfd76df20d82a278', type: '79139f01607cd715c4ade9e69416d6fad990882e8ae758c1be344d6e551f07f9' };
const LOCK_OPTIONAL = { ...SHARED, data: 'b29ce8e6f8b52d9b0ac6ab50c38606bd4786bc07555563aeb74285fe68f3e08f', type: 'd758345623c0f94edb3334cdbfb4507daa8e5dd28bca960e759e4fccab6ee20a' };
const TIMED = { ...SHARED, data: '0f1e65d815bc10ef3fe8c96c4f49cbf0eb918aafb5ee2270d7b1f8a7d6727061', type: '21acd9040916987d9be33b270b1c41592b6859091a5087c2cf911bc0de376902' };
const LOCK_OPTIONAL_TIMED = { ...SHARED, data: '296b6388cf10dcde1d5181f0288c97991241a7c6c1bd7879db9675747eb0746a', type: '59f14276d6fcea0994b41e03ac13c9e356e8d117a2167bae9d3a441d60d6044b' };

/** The seven option shapes a saved quiz can carry, and the bytes each compiled to before row 14. */
const SAVED = [
  ['no options', undefined, LOCK_REQUIRED],
  ['{}', {}, LOCK_REQUIRED],
  ['lock true', { lock: true }, LOCK_REQUIRED],
  ['lock false', { lock: false }, LOCK_OPTIONAL],
  ['autoReveal', { autoReveal: true }, TIMED],
  ['lock false, autoReveal', { lock: false, autoReveal: true }, LOCK_OPTIONAL_TIMED],
  ['lock true, autoReveal false', { lock: true, autoReveal: false }, LOCK_REQUIRED],
];

for (const [name, options, pinned] of SAVED) {
  test(`AC-3/Q1: a saved quiz with ${name} compiles to the bytes it had before the no-Lock variant`, () => {
    const fresh = record(options);
    if (JSON.stringify(fresh) !== JSON.stringify(pinned)) console.log(`[quiz-no-lock] record ${name} ${JSON.stringify(fresh)}`);
    assert.deepEqual(fresh, pinned);
  });
}

/** Every explicit arrow of the quiz's machine, as `from -event-> to`. Waypoint 0 is the question
 *  (the entrance) and waypoint 1 the reveal; a timer reads `timer<seconds>`. */
function arrows(options) {
  const place = (p) => (typeof p === 'string' ? p : ['question', 'reveal'][p.waypoint] ?? `waypoint${p.waypoint}`);
  return compile(options)
    .type()
    .machine.main.branches.flatMap((b) => b.edges.map((e) => `${place(e.from)} -${e.trigger === 'timer' ? `timer${e.after}` : e.event}-> ${place(e.to)}`))
    .sort();
}

// THE ORACLE: each profile's arrows written out by hand from the rules, not from quiz.ts.
const PICK = ['question -select-> selected', 'selected -select-> selected'];
const LOCK = [
  'selected -lock-> locked',
  'locked -judge-> reveal',
  'locked -next-> reveal',
  'question -lock-> sealed',
  'sealed -revealChoice-> locked',
  'sealed -judge-> reveal',
  'sealed -next-> reveal',
];
const PROFILES = [
  ['lock required', { lock: true }, [...PICK, ...LOCK]],
  ['lock optional', { lock: false }, [...PICK, ...LOCK, 'selected -judge-> reveal']],
  ['timed reveal', { autoReveal: true }, [...PICK, ...LOCK, 'locked -timer5-> reveal']],
  ['lock optional, timed', { lock: false, autoReveal: true }, [...PICK, ...LOCK, 'selected -judge-> reveal', 'locked -timer5-> reveal']],
  ['no lock', { lock: false, noLock: true }, [...PICK, 'selected -judge-> reveal', 'selected -next-> reveal']],
  ['no lock, timed reveal off', { lock: false, noLock: true, autoReveal: false }, [...PICK, 'selected -judge-> reveal', 'selected -next-> reveal']],
];

for (const [name, options, expected] of PROFILES) {
  test(`Q1-Q3: the ${name} quiz has exactly the arrows its rules give it`, () => {
    assert.deepEqual(arrows(options), [...expected].sort());
  });
}

test('Q2: the one timer in any quiz leaves the lock, never the pick, the seal or the question', () => {
  for (const [, options] of PROFILES) {
    const timers = arrows(options).filter((a) => a.includes('-timer'));
    if (options.autoReveal === true) assert.deepEqual(timers, ['locked -timer5-> reveal'], JSON.stringify(options));
    else assert.deepEqual(timers, [], JSON.stringify(options));
  }
});

test('Q3: the no-Lock quiz has no lock button, state, look or seal', () => {
  const type = compile({ lock: false, noLock: true }).type();
  assert.deepEqual(type.controls.map((c) => c.event), ['select', 'judge', 'audience']);
  assert.equal(type.controls.find((c) => c.event === 'select')?.section, 'Pick, then reveal');
  assert.deepEqual(type.machine.main.branches.map((b) => b.id), ['selected']);
  const js = compile({ lock: false, noLock: true }).js();
  const table = js.slice(0, js.length - RUNTIME.length);
  for (const gone of ['main/locked', 'main/sealed', '"look":"locked"', 'Locked in']) assert.ok(!table.includes(gone), `the table names ${gone}`);
  // A saved quiz still has all of it.
  const saved = compile(undefined).type();
  assert.deepEqual(saved.controls.map((c) => c.event), ['select', 'lock', 'revealChoice', 'judge', 'audience']);
  assert.deepEqual(saved.machine.main.branches.map((b) => b.id), ['selected', 'locked', 'sealed']);
});

test('Q4: no lock with the timed reveal is refused by name, whatever else is set', () => {
  for (const options of [{ noLock: true, autoReveal: true }, { lock: false, noLock: true, autoReveal: true }, { lock: true, noLock: true, autoReveal: true }]) {
    assert.throws(() => compile(options), /^Error: Behaviour: a quiz without a lock has no automatic reveal \(the timer starts at the lock\)\.$/, JSON.stringify(options));
  }
});

test('Q5: no lock keeps the answer key and pick at their ids and stamps the same layers', () => {
  const plain = compile({ lock: false });
  const none = compile({ lock: false, noLock: true });
  assert.deepEqual(none.fields(ART.length), plain.fields(ART.length));
  assert.deepEqual(none.fields(ART.length).map((f) => `${f.field} ${f.title}`), ['f5 Correct answer', 'f6 Selected answer']);
  assert.equal(none.html(ART.length), plain.html(ART.length));
  // The lock layer stays bound (and so stays hidden on air): no rule ever shows it.
  assert.deepEqual(marks(none), marks(plain));
  assert.match(marks(none).k0['data-noacg-role'], /\blocked\b/);
  assert.deepEqual(none.steps(ANIM), plain.steps(ANIM));
  measured(SAVED.length + PROFILES.length, 'quiz option shapes compiled');
});
