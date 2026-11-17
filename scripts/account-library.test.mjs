// guards: src/backend/accountLibrary.ts
//
// An account switch revokes a cue recovery still waiting on storage before the library account
// changes and before the general save request goes out (PR #2573); a switch that fails resumes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/backend/accountLibrary.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ inUse = null, setFails = false } = {}) {
  const steps = [];
  let revoked = false;
  const listeners = {};
  const window = {
    dispatchEvent: event => { steps.push(`event ${event.type} (revoked ${revoked})`); },
    addEventListener: (type, run) => { listeners[type] = run; },
    location: { reload: () => steps.push('reload') },
  };
  const stubs = {
    '../model/accountScope': {
      LIBRARY_ACCOUNT_KEY: 'spx-gfx-account',
      setLibraryAccount: account => {
        steps.push(`account ${account} (revoked ${revoked})`);
        if (setFails) throw new Error('storage refused');
      },
    },
    '../model/durableStore': {
      libraryInUse: () => inUse,
      flushDurableStore: async () => { steps.push(`flush (revoked ${revoked})`); },
      revokeCueRecoveryForSwitch: () => {
        revoked = true; steps.push('revoke');
        return () => { revoked = false; steps.push('resume'); };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, window, CustomEvent: class { constructor(type) { this.type = type; } },
    require: name => { assert.ok(name in stubs, `unexpected dependency: ${name}`); return stubs[name]; },
  });
  return { library: exports, steps, listeners };
}

test('signing in revokes waiting cue recovery before the account changes and the save request goes out', async () => {
  const { library, steps } = harness();
  assert.equal(await library.bindLibraryToAccount('acct'), 'reloading');
  assert.deepEqual(steps, [
    'revoke', 'account acct (revoked true)',
    'event noacg-account-authoring-flush (revoked true)', 'flush (revoked true)', 'reload',
  ]);
});

test('signing out and another tab\'s switch revoke it too', async () => {
  const out = harness({ inUse: 'acct' });
  await out.library.releaseLibrary();
  assert.deepEqual(out.steps.slice(0, 2), ['revoke', 'account null (revoked true)']);
  const other = harness();
  other.library.followLibraryChangesInOtherTabs();
  other.listeners.storage({ key: 'spx-gfx-account' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(other.steps[0], 'revoke');
  assert.ok(other.steps.includes('reload'));
});

test('a switch that fails before reloading resumes recovery; the library already in use revokes nothing', async () => {
  const failed = harness({ setFails: true });
  assert.equal(await failed.library.bindLibraryToAccount('acct'), 'failed');
  assert.deepEqual(failed.steps, ['revoke', 'account acct (revoked true)', 'resume']);
  const same = harness({ inUse: 'acct' });
  assert.equal(await same.library.bindLibraryToAccount('acct'), 'ready');
  assert.deepEqual(same.steps, []);
});
