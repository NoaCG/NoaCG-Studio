// guards: src/control/controlModel.ts, src/blocks/animMachine.ts
//
// « BACK AND ⟲ RESET, the two step presses that replaced the recovery list on both dashboards
// (#2181: its "Back to start" took a graphic off air, and no entry in it went back a step). Both are
// snaps, so both are answered from the machine alone: Back is the state before the current one on
// the route a snap replays (`canonicalPath`), Reset is the first step with every other group at
// rest. What they look like on air is e2e/production-controls.spec.ts (the League Table walk).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadWizardModule } from './wizard-load.mjs';

const { backTarget, resetTarget } = await loadWizardModule(fileURLToPath(new URL('../src/control/controlModel.ts', import.meta.url)));

/** A data block as a template carries it: steps, and the machine over them when there is one. */
const template = (data) => `var NOACG_ANIM = ${JSON.stringify({ version: 2, root: '#stage', speed: 1, ...data })};`;
const step = (name) => ({ name, duration: 0.4, ease: 'power2.out', layers: {} });
const at = (main, rest = {}) => ({ groups: { main, ...rest } });

// A standings board's walk: the whole table, the final table, out; a highlighted row off the path,
// and a parallel group, so Back and Reset have something to keep and something to rest.
const board = template({
  steps: [step('Enter'), step('Final'), step('Out')],
  machine: {
    groups: [
      {
        id: 'main',
        initial: 'off',
        defaultPath: ['enter', 'final', 'out'],
        states: [{ id: 'off' }, { id: 'enter' }, { id: 'final' }, { id: 'out' }, { id: 'highlighted', timeline: step('Highlight') }],
        transitions: [
          { from: 'enter', to: 'final', trigger: 'operator', event: 'final' },
          { from: 'enter', to: 'highlighted', trigger: 'operator', event: 'highlight' },
          { from: 'highlighted', to: 'highlighted', trigger: 'operator', event: 'highlight' },
          { from: 'highlighted', to: 'final', trigger: 'operator', event: 'final' },
        ],
      },
      {
        id: 'flag',
        initial: 'none',
        states: [{ id: 'none' }, { id: 'up', timeline: step('Up') }],
        transitions: [{ from: 'none', to: 'up', trigger: 'operator', event: 'flag' }],
      },
    ],
  },
});

test('Back is the step before: the previous waypoint, or the step a branch was entered from', () => {
  assert.deepEqual(backTarget(board, at('final', { flag: 'up' })), { main: 'enter' }, 'the final table goes back to the whole one, and only the main group moves');
  assert.deepEqual(backTarget(board, at('highlighted')), { main: 'enter' });
  assert.equal(backTarget(board, at('enter')), null, 'the first step has nothing before it');
  assert.equal(backTarget(board, at('off')), null, 'off air, Take is how a graphic enters');
  assert.equal(backTarget(board, at('out')), null, 'on its exit, Back never puts it back on air');
  assert.equal(backTarget(board, null), null, 'nothing reported yet');
});

test('Back walks a plain stepped graphic too, from the machine its steps derive', () => {
  const lowerThird = template({ steps: [step('Name'), step('Title'), step('Logo'), step('Out')] });
  assert.deepEqual(backTarget(lowerThird, at('logo')), { main: 'title' });
  assert.deepEqual(backTarget(lowerThird, at('title')), { main: 'name' });
  assert.equal(backTarget(lowerThird, at('name')), null);
});

test('Reset is the first step ON air, with every other group at rest', () => {
  assert.deepEqual(resetTarget(board), { main: 'enter', flag: 'none' }, 'never `off`, which takes the graphic off air');
  assert.equal(resetTarget('var x = 1;'), null, 'no data block, nothing to stand on');
});
