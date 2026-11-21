// PHASE 9 STAGING RERUN (not for main): read the staging switches, put them back to what the rerun
// found before its first run (all off; team_designs had no row), read them back.
import { test } from '@playwright/test';
import { admitStaging, emit, readSwitches, restoreSwitches, SHARD1 } from './_p9';

test.describe.configure({ retries: 0 });
if (!SHARD1) test('idle shard', () => {});
else
  test('p9r-switches', async () => {
    emit('target', { kind: admitStaging() });
    emit('switches-found', await readSwitches());
    emit('switches-after', await restoreSwitches({ auto_publish: { on: false }, partial_writes: { on: false }, production_copies: { on: false }, team_designs: { on: false } }));
  });
