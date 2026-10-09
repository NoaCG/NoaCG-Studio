// covers: supabase/migrations/0088_control_link_and_suspension_guards.sql
//
// ISSUE #795, against a real database. A control link is handed to a class or a second phone, so
// whoever holds one may send any patch they can write by hand: it must move the values the
// production has bound and nothing else. And a suspended account must not write: no team rename,
// no new join code, no report.
//
// Both tests talk to the database directly, with no page: what is under test is the RPCs and the
// policies, and the operator holds nothing but the slug and the anon key. The owner's production
// and team are made through the service role on a throwaway account, which is deleted afterwards
// and takes both with it.

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintAccount, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = 'e2e-guard@example.test';
const PASSWORD = 'e2e-guard-pw-1';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe('control link and suspension guards (configured)', () => {
  test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');

  let admin: SupabaseClient;
  let userId = '';

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);
    userId = await mintAccount(admin, EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  test('a control link moves bound values and cannot delete, truncate or blank the data', async () => {
    const data = {
      match: { home: { score: 4 } },
      drivers: [
        { name: 'Ada', gap: 'LEADER' },
        { name: 'Ben', gap: '+0.5' },
        { name: 'Cy', gap: '+1.0' },
      ],
      panel: { katri: { points: 3 } },
      bingo: { called: ['K7'] },
    };
    const bindings = {
      Board: { f1: 'match.home.score', f5: 'bingo.called' },
      Bug: { f3: 'drivers.0.gap' },
      Panel: { f2: 'panel.katri.points' },
    };
    const { data: show, error } = await admin
      .from('control_shows')
      .insert({ id: crypto.randomUUID(), owner_id: userId, title: 'E2E control link guard', data, bindings })
      .select('id, slug')
      .single();
    expect(error, 'the owner production is made').toBeNull();
    const operator = createClient(SUPABASE_URL, ANON_KEY, noSession);
    const press = (patch: unknown) => operator.rpc('control_data_patch_by_slug', { p_slug: show!.slug, p_patch: patch });
    const stored = async () => (await admin.from('control_shows').select('data').eq('id', show!.id).single()).data?.data;

    // Refused outright: a bound value erased, an object over a bound value, the grid turned into
    // an object, a key that only looks like a bound path.
    for (const patch of [
      { match: { home: { score: null } } },
      { panel: { katri: { points: {} } } },
      { drivers: { 0: { gap: 'x' } } },
      { 'drivers.0': { gap: 'x' } },
      { match: null },
    ]) {
      const { error: refused } = await press(patch);
      expect(refused?.message, JSON.stringify(patch)).toMatch(/^not a (bound path|field value): /);
    }
    expect(await stored()).toEqual(data);

    // An array over the grid moves its bound leaves and nothing else: emptying it, cutting it to
    // one car or renaming a car changes nothing.
    for (const patch of [{ drivers: [] }, { drivers: [{ name: 'EVIL', gap: 'LEADER' }] }]) {
      const { error: pressError } = await press(patch);
      expect(pressError).toBeNull();
    }
    expect(await stored()).toEqual(data);
    const { error: shortError } = await press({ drivers: [{ gap: '+0.1' }] });
    expect(shortError).toBeNull();
    expect(((await stored()) as typeof data).drivers).toEqual([
      { name: 'Ada', gap: '+0.1' },
      { name: 'Ben', gap: '+0.5' },
      { name: 'Cy', gap: '+1.0' },
    ]);

    // The presses the product sends still land: a score, a list add, and the clear.
    for (const patch of [{ match: { home: { score: 5 } } }, { bingo: { called: ['K7', 'B2'] } }, { bingo: { called: [] } }]) {
      const { error: pressError } = await press(patch);
      expect(pressError, JSON.stringify(patch)).toBeNull();
    }
    const after = (await stored()) as typeof data;
    expect(after.match.home.score).toBe(5);
    expect(after.bingo.called).toEqual([]);
  });

  test('a suspended account cannot rename its team, rotate its code or file a report', async () => {
    const member = createClient(SUPABASE_URL, ANON_KEY, noSession);
    const { error: signInError } = await member.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    expect(signInError).toBeNull();
    const { data: team, error: teamError } = await member.from('teams').insert({ name: 'E2E guard team' }).select('id, join_code').single();
    expect(teamError, 'an active account makes a team').toBeNull();

    const { error: suspendError } = await admin.from('user_accounts').upsert({ user_id: userId, state: 'suspended', reason: 'e2e guard' });
    expect(suspendError).toBeNull();

    // The rename is filtered out by the policy rather than raised, so read the row back.
    await member.from('teams').update({ name: 'Renamed while suspended' }).eq('id', team!.id);
    const { error: rotateError } = await member.rpc('team_rotate_code', { p_team: team!.id });
    expect(rotateError?.message).toBe('this account is suspended');
    const { error: reportError } = await member.rpc('community_pack_report', { p_id: crypto.randomUUID(), p_reason: 'spam' });
    expect(reportError?.message).toBe('This account cannot report packs.');

    const { data: row } = await admin.from('teams').select('name, join_code').eq('id', team!.id).single();
    expect(row).toEqual({ name: 'E2E guard team', join_code: team!.join_code });
  });
});
