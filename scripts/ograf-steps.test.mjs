// THE STEP CONTROLS of a foreign OGraf Graphic (src/control/ografSteps.ts; E2.2, AC-2): what a
// relative step, a Goto and skipAnimation send, judged against the declared count and the
// runtime's last answer, and every refusal said. The browser half, on the real stage with a
// dynamic-count fixture, is e2e/foreign-ograf-sandbox.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';

const steps = await import('../src/control/ografSteps.ts');
const { ografStepFor, ografStepAfter, declaredSteps, OGRAF_STEP_DELTA_MAX, OGRAF_STEP_GOTO_MAX } = steps;

const ok = (params) => ({ ok: true, params });
const no = (j) => (j.ok ? null : j.refusal);

test('a fixed count takes a Goto inside it and a relative step that stays in it', () => {
  const rt = (at) => ({ declared: 3, at });
  assert.deepEqual(ografStepFor({ goto: 2 }, rt(0)), ok({ goto: 2 }));
  assert.deepEqual(ografStepFor({ goto: 0, skipAnimation: true }, rt('end')), ok({ goto: 0, skipAnimation: true }));
  assert.deepEqual(ografStepFor({ delta: 1 }, rt(1)), ok({ delta: 1 }));
  assert.deepEqual(ografStepFor({ delta: -2 }, rt(2)), ok({ delta: -2 }));
  assert.equal(no(ografStepFor({ goto: 3 }, rt(0))), 'It has steps 1 to 3; there is no step 4.');
  assert.equal(no(ografStepFor({ delta: 1 }, rt(2))), 'It is on step 3 of 3; Out ends it.');
  assert.equal(no(ografStepFor({ delta: -1 }, rt(0))), 'It is on step 1; there is no step before the first.');
  // A false skipAnimation sends none.
  assert.deepEqual(ografStepFor({ delta: 1, skipAnimation: false }, rt(0)), ok({ delta: 1 }));
});

test('one step, no steps, and an unreadable count', () => {
  assert.equal(declaredSteps(undefined), 1, 'absent is one step');
  assert.deepEqual(ografStepFor({ goto: 0 }, { declared: undefined, at: null }), ok({ goto: 0 }));
  assert.equal(no(ografStepFor({ goto: 1 }, { declared: 1, at: 0 })), 'It has one step; there is no step 2.');
  assert.equal(no(ografStepFor({ delta: 1 }, { declared: 1, at: 0 })), 'It is on step 1 of 1; Out ends it.');
  assert.equal(no(ografStepFor({ goto: 0 }, { declared: 0, at: null })), 'It plays in and out by itself; it has no steps.');
  for (const declared of [-2, 1.5, '3', null, {}]) {
    assert.equal(no(ografStepFor({ goto: 0 }, { declared, at: 0 })), 'Its step count is unreadable, so it takes no step.', String(declared));
  }
});

test('a dynamic count leaves the end to the Graphic and refuses only what is no step', () => {
  const rt = (at) => ({ declared: -1, at });
  assert.deepEqual(ografStepFor({ goto: 40 }, rt(0)), ok({ goto: 40 }));
  assert.deepEqual(ografStepFor({ delta: 7 }, rt(3)), ok({ delta: 7 }));
  assert.equal(no(ografStepFor({ delta: -4 }, rt(3))), 'It is on step 4; there is no step before the first.');
});

test('a relative step needs a known position; Goto always moves', () => {
  for (const declared of [3, -1]) {
    assert.equal(no(ografStepFor({ delta: 1 }, { declared, at: null })), 'Where it is is not known yet; Goto a step.');
    assert.equal(no(ografStepFor({ delta: -1 }, { declared, at: 'end' })), 'It has played to its end; Goto a step.');
    assert.equal(ografStepFor({ goto: 0 }, { declared, at: null }).ok, true);
  }
});

test('what is no step is refused, at its limits exactly', () => {
  const rt = { declared: -1, at: 50 };
  for (const op of [{}, { delta: 1, goto: 1 }, { delta: 0 }, { delta: 1.5 }, { goto: -1 }, { goto: 0.5 }, { delta: Number.NaN }, { goto: Infinity }, { delta: 1, skipAnimation: 'yes' }]) {
    assert.equal(ografStepFor(op, rt).ok, false, JSON.stringify(op));
  }
  assert.equal(ografStepFor({ delta: OGRAF_STEP_DELTA_MAX }, rt).ok, true);
  assert.equal(ografStepFor({ delta: OGRAF_STEP_DELTA_MAX + 1 }, rt).ok, false);
  assert.equal(ografStepFor({ delta: -OGRAF_STEP_DELTA_MAX }, { declared: -1, at: 200 }).ok, true);
  assert.equal(ografStepFor({ delta: -OGRAF_STEP_DELTA_MAX - 1 }, { declared: -1, at: 200 }).ok, false);
  assert.equal(ografStepFor({ goto: OGRAF_STEP_GOTO_MAX }, rt).ok, true);
  assert.equal(ografStepFor({ goto: OGRAF_STEP_GOTO_MAX + 1 }, rt).ok, false);
  assert.equal(OGRAF_STEP_DELTA_MAX, 100);
  assert.equal(OGRAF_STEP_GOTO_MAX, 9_999);
});

test('an answer moves the position only as far as it says', () => {
  assert.equal(ografStepAfter(null, { statusCode: 200, currentStep: 2 }), 2);
  assert.equal(ografStepAfter(1, { statusCode: 200 }), 'end', 'no currentStep is the end');
  assert.equal(ografStepAfter(1, { statusCode: 204, currentStep: -1 }), 'end');
  assert.equal(ografStepAfter(1, { statusCode: 409 }), 1, 'a refusal moved nothing');
  assert.equal(ografStepAfter(1, { statusCode: 408 }), null, 'a timeout says nothing');
  assert.equal(ografStepAfter(1, { statusCode: 504 }), null);
  assert.equal(ografStepAfter(1, { statusCode: 500 }), null);
  assert.equal(ografStepAfter(1, null), null);
});
