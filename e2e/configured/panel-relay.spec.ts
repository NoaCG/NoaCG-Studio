// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend can refuse a key, relay a press or rotate a topic.
//
// HARDWARE PANELS, THE SERVER HALF (docs/work-specs/hardware-panel-control/spec.md AC-1, AC-2,
// AC-5, AC-6, AC-10; protocol.md §2 to §5): pairing with a one-time code, the press relay to the
// one answering page, the refusals, the claim, revoke and the topic boundary. Driven from Node with
// two kinds of client, as the real parties are: an ANONYMOUS client holding only a panel key (the
// Companion module), and an anonymous client holding only the control slug (an operator page).
// The page's own half (running a press through onVerb, publishing feedback) has its own spec.
// covers: supabase/migrations/{0073_panel_relay,0077_direct_cue_trigger,0081_panel_lease}.sql

import { test, expect } from '@playwright/test';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { E2E_EMAIL, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY && E2E_EMAIL);
test.skip(!canRun, 'set VITE_SUPABASE_URL/_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and E2E_EMAIL to run the panel relay suite');

type Json = Record<string, unknown>;
const clients: SupabaseClient[] = [];
const client = () => {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(c);
  return c;
};
let admin: SupabaseClient;
const shows: string[] = [];

async function rpc(c: SupabaseClient, name: string, args: Json): Promise<Json> {
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as Json;
}

/** A published production of the test account's, as publish leaves it: a control_shows row. */
let ownerId: string | null = null;
async function production(): Promise<string> {
  // The account's id, read once, through every page of a long-lived backend's users.
  for (let page = 1; !ownerId && page <= 100; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    ownerId = data.users.find((u) => u.email === E2E_EMAIL)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!ownerId) throw new Error('the test account is not on this backend');
  const owner = { id: ownerId };
  const id = crypto.randomUUID();
  const { data, error } = await admin
    .from('control_shows')
    .insert({ id, owner_id: owner.id, title: 'Panel relay spec', output: { v: 1, graphics: [], cues: [] } })
    .select('slug')
    .single();
  if (error) throw new Error(error.message);
  shows.push(id);
  return (data as { slug: string }).slug;
}

/**
 * Join a private topic and keep every message with its arrival time. Realtime adds its own message
 * id at `id` to every payload the database broadcasts; it is set aside as `rid`, so the payloads
 * compare as the functions built them.
 *
 * A first join can come back CHANNEL_ERROR on a backend that has not authorised this topic shape
 * before (seen once on the preview branch, then fine); a page rejoins, and so does this, twice.
 */
async function listen(c: SupabaseClient, topic: string) {
  const got: { event: string; payload: Json; rid?: unknown; at: number }[] = [];
  let channel!: RealtimeChannel;
  let status = '';
  for (let attempt = 0; attempt < 3 && status !== 'SUBSCRIBED'; attempt++) {
    if (channel) await c.removeChannel(channel);
    channel = c.channel(topic, { config: { private: true, broadcast: { self: false } } });
    channel.on('broadcast', { event: '*' }, (m: { event: string; payload: Json }) => {
      const { id: rid, ...payload } = m.payload ?? {};
      got.push({ event: m.event, payload, rid, at: Date.now() });
    });
    const ch = channel;
    status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('NO ANSWER'), 10_000);
      ch.subscribe((s) => {
        clearTimeout(timer);
        resolve(s);
      });
    });
  }
  return { channel, got, status, next: (event: string, from = 0) => waitFor(got, event, from) };
}

async function waitFor(got: { event: string; payload: Json; rid?: unknown; at: number }[], event: string, from = 0, ms = 5_000) {
  const end = Date.now() + ms;
  for (;;) {
    const hit = got.slice(from).find((m) => m.event === event);
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`no ${event} within ${ms} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function pair(slug: string, label: string): Promise<{ key: string; keyId: string; feedback: string }> {
  const page = client();
  const start = await rpc(page, 'panel_pair_start', { p_slug: slug });
  const done = await rpc(client(), 'panel_pair_finish', { p_code: start.code, p_label: label });
  expect(done.ok, JSON.stringify(done)).toBe(true);
  return { key: done.key as string, keyId: done.key_id as string, feedback: done.feedback_topic as string };
}

const press = (id: string, over: Json = {}) => ({ verb: 'take', target: 'cue_a', seen: 4, id, ...over });

test.beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
});

test.afterAll(async () => {
  for (const c of clients) {
    await c.removeAllChannels();
    // Close the socket itself: a Realtime socket still closing as Node exits trips a libuv
    // assertion on Windows and fails the run after every test passed.
    c.realtime.disconnect();
  }
  if (shows.length) await admin.from('control_shows').delete().in('id', shows);
});

test('a one-time code pairs a panel once, and the page lists it', async () => {
  const slug = await production();
  const page = client();
  const start = await rpc(page, 'panel_pair_start', { p_slug: slug });
  expect(start.ok).toBe(true);
  expect(start.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  // Five minutes in the server's clock; the runner's may differ by a little, so a minute of slack.
  const expires = Date.parse(start.expires_at as string) - Date.now();
  expect(expires).toBeGreaterThan(4 * 60_000);
  expect(expires).toBeLessThan(6 * 60_000);

  const module = client();
  // Typed as an operator would: lower case, a space instead of the dash.
  const done = await rpc(module, 'panel_pair_finish', { p_code: (start.code as string).toLowerCase().replace('-', ' '), p_label: '  Desk deck  ' });
  expect(done).toMatchObject({ ok: true, label: 'Desk deck', title: 'Panel relay spec' });
  expect(done.key).toMatch(/^ncpk_[A-Za-z0-9_-]{43}$/);
  expect(done.feedback_topic).toMatch(/^pfb-[0-9a-f]{32}$/);

  expect(await rpc(client(), 'panel_pair_finish', { p_code: start.code, p_label: 'again' })).toMatchObject({ ok: false, refused: 'used-code' });
  expect(await rpc(client(), 'panel_pair_finish', { p_code: 'ZZZZ-ZZZZ', p_label: 'x' })).toMatchObject({ ok: false, refused: 'unknown-code' });

  // A code past its five minutes says so.
  const late = await rpc(page, 'panel_pair_start', { p_slug: slug });
  await admin.from('panel_codes').update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq('show_id', shows.at(-1)!).is('used_at', null);
  expect(await rpc(client(), 'panel_pair_finish', { p_code: late.code, p_label: 'x' })).toMatchObject({ ok: false, refused: 'expired-code' });

  const list = await rpc(page, 'panel_list', { p_slug: slug });
  expect(list.panels).toEqual([expect.objectContaining({ id: done.key_id, label: 'Desk deck', last_used_at: null })]);
  expect(list.answering).toBeNull();
  expect(list.press_topic).toMatch(/^pnp-[0-9a-f]{32}$/);
  expect(list.feedback_topic).toBe(done.feedback_topic);

  // The key never reads the panel tables, the control slug or the show id.
  const { error: denied } = await module.from('panel_keys').select('*');
  expect(denied?.message ?? '').toMatch(/permission denied/);
  expect(JSON.stringify(done)).not.toContain(slug);
  expect(JSON.stringify(done)).not.toContain(shows.at(-1)!);
});

test('with no answering page a press is refused and nothing is relayed', async () => {
  const slug = await production();
  const { key } = await pair(slug, 'Deck');
  const page = client();
  const list = await rpc(page, 'panel_list', { p_slug: slug });
  const presses = await listen(page, list.press_topic as string);
  expect(presses.status).toBe('SUBSCRIBED');

  expect(await rpc(client(), 'panel_hello', { p_key: key })).toMatchObject({ ok: true, answering: false });
  expect(await rpc(client(), 'panel_press', { p_key: key, p_press: press('abcdef:1') })).toMatchObject({ ok: false, refused: 'no-page' });
  await new Promise((r) => setTimeout(r, 1_500));
  expect(presses.got).toEqual([]);

  // A page that answers afterwards hears nothing of the earlier press.
  await rpc(page, 'panel_claim', { p_slug: slug, p_page: 'pagepagepage0001', p_where: 'production', p_label: 'Production page' });
  await presses.next('claim');
  await new Promise((r) => setTimeout(r, 1_000));
  expect(presses.got.map((m) => m.event)).toEqual(['claim']);
});

test('a press reaches the answering page stamped with its claim, with only the permitted fields', async () => {
  const slug = await production();
  const { key, keyId } = await pair(slug, 'Desk deck');
  const page = client();
  const claimed = await rpc(page, 'panel_claim', { p_slug: slug, p_page: 'pagepagepage0001', p_where: 'control', p_label: 'Control page' });
  const presses = await listen(page, claimed.press_topic as string);
  expect(presses.status).toBe('SUBSCRIBED');

  // hello asks the answering page to republish.
  expect(await rpc(client(), 'panel_hello', { p_key: key })).toMatchObject({ ok: true, answering: true, key_id: keyId });
  const want = await presses.next('want');
  expect(want.payload).toEqual({ v: 1, panel: { id: keyId, label: 'Desk deck' } });

  // A module calling hello in a loop cannot make the page republish without end: five wants in ten
  // seconds, then hello still answers but asks nothing of the page.
  for (let i = 0; i < 7; i++) expect((await rpc(client(), 'panel_hello', { p_key: key })).ok).toBe(true);
  await new Promise((r) => setTimeout(r, 1_500));
  expect(presses.got.filter((m) => m.event === 'want')).toHaveLength(5);

  const module = client();
  const answer = await rpc(module, 'panel_press', { p_key: key, p_press: { ...press('abcdef:2'), extra: 'dropped', claim: 999 } });
  expect(answer).toEqual({ ok: true, claim: claimed.claim });
  const got = await presses.next('press');
  expect(got.payload).toEqual({ v: 1, verb: 'take', target: 'cue_a', seen: 4, press_id: 'abcdef:2', claim: claimed.claim, panel: { id: keyId, label: 'Desk deck' } });
  // Realtime's own message id rides beside it and never replaces the press id.
  expect(got.rid).toEqual(expect.any(String));
  expect(got.rid).not.toBe('abcdef:2');

  // Direct-cue and legacy toggle commands use the same real private-topic relay.
  // Migration self-checks run before the local stack creates its account, so these calls
  // also prove the new verb with a real key after the account exists.
  for (const [i, verb] of ['trigger-cue', 'take-cue'].entries()) {
    const from = presses.got.length;
    const id = `abcdef:${3 + i}`;
    expect(await rpc(module, 'panel_press', { p_key: key, p_press: press(id, { verb }) })).toEqual({ ok: true, claim: claimed.claim });
    const delivered = await presses.next('press', from);
    expect(delivered.payload).toEqual({ v: 1, verb, target: 'cue_a', seen: 4, press_id: id, claim: claimed.claim, panel: { id: keyId, label: 'Desk deck' } });
    expect(delivered.rid).toEqual(expect.any(String));
    expect(delivered.rid).not.toBe(id);
  }

  // The relay's own hop, press to page, for the record (research §6.3 measured p50 68 ms).
  const hops: number[] = [];
  for (let i = 0; i < 15; i++) {
    const from = presses.got.length;
    const t0 = Date.now();
    await rpc(module, 'panel_press', { p_key: key, p_press: press(`abcdef:${10 + i}`, { verb: 'select-next', target: '' }) });
    hops.push((await presses.next('press', from)).at - t0);
    await new Promise((r) => setTimeout(r, 150));
  }
  hops.sort((a, b) => a - b);
  console.log(`panel_press to the page: p50 ${hops[7]} ms, min ${hops[0]} ms, max ${hops[14]} ms (15 presses)`);
});

test('the relay refuses foreign verbs, malformed presses, wrong keys and bursts', async () => {
  const slug = await production();
  const { key } = await pair(slug, 'Deck');
  await rpc(client(), 'panel_claim', { p_slug: slug, p_page: 'pagepagepage0001', p_where: 'production', p_label: 'Production page' });
  const module = client();
  const refused = async (p: Json, k = key) => (await rpc(module, 'panel_press', { p_key: k, p_press: p })).refused;
  for (const verb of ['paste', 'copy', 'folder-new', 'select-clear', 'drop-table']) expect(await refused(press('abcdef:1', { verb }))).toBe('not-a-panel-verb');
  expect(await refused(press('abcdef:1', { target: 'x'.repeat(129) }))).toBe('bad-press');
  expect(await refused(press('abcdef:1', { target: 'bell\u0007' }))).toBe('bad-press');
  // Any printable row id up to 128 characters is a target: an imported cue's id is not ours to shape.
  expect(await refused(press('abcdef:1', { target: 'cue 7/b é' }))).toBeUndefined();
  expect(await refused(press('abcdef:1', { seen: '4' }))).toBe('bad-press');
  expect(await refused(press('abcdef:1', { seen: 1.5 }))).toBe('bad-press');
  expect(await refused(press('ABCDEF:1'))).toBe('bad-press');
  expect(await refused({ verb: 'take' })).toBe('bad-press');
  expect(await refused(press('abcdef:1'), 'ncpk_' + 'A'.repeat(43))).toBe('unknown-key');
  expect(await refused(press('abcdef:1'), 'not a key')).toBe('unknown-key');

  // Twenty presses in two seconds, then slow down: thirty at once, faster than any hand.
  const answers = await Promise.all(Array.from({ length: 30 }, (_, i) => refused(press(`burst1:${i}`, { verb: 'select-next', target: '' }))));
  expect(answers.filter((r) => r === undefined).length).toBeLessThanOrEqual(20);
  expect(answers.filter((r) => r === 'slow-down').length).toBeGreaterThanOrEqual(10);
});

test('the panel lease: taken when free, never taken from a live page, kept on reload, moved by Use here, renewed, and lapsing', async () => {
  // docs/work-specs/panel-ownership-lease/spec.md L1, L4 to L6, L9; supabase/migrations/0081_panel_lease.sql.
  test.setTimeout(90_000);
  const slug = await production();
  const { key } = await pair(slug, 'Deck');
  const lease = (page: string, where: string, label: string, move = false) =>
    rpc(client(), 'panel_lease', { p_slug: slug, p_page: page, p_where: where, p_label: label, p_move: move });

  // Free: the first page takes it.
  const first = client();
  const a = await rpc(first, 'panel_lease', { p_slug: slug, p_page: 'pagepagepage000a', p_where: 'production', p_label: 'Production page', p_move: false });
  expect(a.ok).toBe(true);
  const heardByFirst = await listen(first, a.press_topic as string);
  // Held: another page takes nothing, and hears who has it.
  expect(await lease('pagepagepage000b', 'control', 'Phone')).toMatchObject({ ok: false, refused: 'held', answering: { page: 'pagepagepage000a', label: 'Production page' } });
  // A page from before leases cannot take it either.
  await expect(rpc(client(), 'panel_claim', { p_slug: slug, p_page: 'pagepagepage000c', p_where: 'production', p_label: 'Old page' })).rejects.toThrow(/answers on Production page/);
  // The same page again (a reload of its tab): the same claim.
  expect(await lease('pagepagepage000a', 'production', 'Production page')).toMatchObject({ ok: true, claim: a.claim });
  expect(await rpc(client(), 'panel_press', { p_key: key, p_press: press('lease1:1') })).toEqual({ ok: true, claim: a.claim });

  // Use here: moved, under a newer claim, and the first page hears it.
  const b = await lease('pagepagepage000b', 'control', 'Phone', true);
  expect(Number(b.claim)).toBeGreaterThan(Number(a.claim));
  expect((await heardByFirst.next('claim')).payload).toEqual({ v: 1, claim: b.claim, page: 'pagepagepage000b', where: 'control', label: 'Phone' });
  expect((await rpc(first, 'panel_list', { p_slug: slug })).answering).toMatchObject({ page: 'pagepagepage000b', where: 'control', label: 'Phone' });
  // The first page's renewal is refused: its claim moved on. The second's renews.
  expect(await rpc(first, 'panel_renew', { p_slug: slug, p_page: 'pagepagepage000a', p_claim: a.claim })).toMatchObject({ ok: false, refused: 'lost', answering: { label: 'Phone' } });
  expect(await rpc(client(), 'panel_renew', { p_slug: slug, p_page: 'pagepagepage000b', p_claim: b.claim })).toEqual({ ok: true, claim: b.claim });
  expect(await rpc(client(), 'panel_press', { p_key: key, p_press: press('lease1:2') })).toEqual({ ok: true, claim: b.claim });

  // The replaced page letting go changes nothing; the answering one letting go stops presses.
  expect(await rpc(first, 'panel_release', { p_slug: slug, p_claim: a.claim })).toEqual({ ok: true, released: false });
  expect(await rpc(client(), 'panel_release', { p_slug: slug, p_claim: b.claim })).toEqual({ ok: true, released: true });
  await heardByFirst.next('released');
  expect((await rpc(client(), 'panel_press', { p_key: key, p_press: press('lease1:3') })).refused).toBe('no-page');

  // A lease nobody renews lapses in 15 s: no page answers, and another page may take it. Until
  // someone does, the page whose claim it was keeps it by renewing (it was only cut off).
  const c = await lease('pagepagepage000c', 'production', 'Laptop');
  await new Promise((r) => setTimeout(r, 16_000));
  expect((await rpc(client(), 'panel_press', { p_key: key, p_press: press('lease1:4') })).refused).toBe('no-page');
  expect((await rpc(client(), 'panel_list', { p_slug: slug })).answering).toBeNull();
  expect((await rpc(client(), 'panel_hello', { p_key: key })).answering).toBe(false);
  expect(await rpc(client(), 'panel_renew', { p_slug: slug, p_page: 'pagepagepage000c', p_claim: c.claim })).toEqual({ ok: true, claim: c.claim });
  expect((await rpc(client(), 'panel_press', { p_key: key, p_press: press('lease1:5') })).ok).toBe(true);
});

test('two pages taking a free panel at once: exactly one gets it', async () => {
  const slug = await production();
  await pair(slug, 'Deck');
  const takes = await Promise.all(
    ['pagepagepage00x1', 'pagepagepage00x2', 'pagepagepage00x3'].map((page) =>
      rpc(client(), 'panel_lease', { p_slug: slug, p_page: page, p_where: 'production', p_label: page, p_move: false }),
    ),
  );
  expect(takes.filter((t) => t.ok).length).toBe(1);
  expect(takes.filter((t) => t.refused === 'held').length).toBe(2);
});

test('revoking a panel stops it at once, moves the feedback topic, and leaves the others working', async () => {
  const slug = await production();
  const one = await pair(slug, 'Deck one');
  const two = await pair(slug, 'Deck two');
  const page = client();
  const claimed = await rpc(page, 'panel_claim', { p_slug: slug, p_page: 'pagepagepage0001', p_where: 'production', p_label: 'Production page' });
  const presses = await listen(page, claimed.press_topic as string);

  const revoked = await rpc(page, 'panel_revoke', { p_slug: slug, p_key_id: one.keyId });
  expect(revoked.ok).toBe(true);
  expect(revoked.feedback_topic).not.toBe(one.feedback);
  expect((await presses.next('rotated')).payload).toEqual({ v: 1, feedback_topic: revoked.feedback_topic });

  expect((await rpc(client(), 'panel_press', { p_key: one.key, p_press: press('abcdef:1') })).refused).toBe('revoked');
  expect((await rpc(client(), 'panel_hello', { p_key: one.key })).refused).toBe('revoked');
  expect(await rpc(client(), 'panel_hello', { p_key: two.key })).toMatchObject({ ok: true, feedback_topic: revoked.feedback_topic });
  expect((await rpc(client(), 'panel_press', { p_key: two.key, p_press: press('abcdef:2') })).ok).toBe(true);
  expect((await rpc(page, 'panel_list', { p_slug: slug })).panels).toEqual([expect.objectContaining({ label: 'Deck two' })]);
  expect((await rpc(page, 'panel_revoke', { p_slug: slug, p_key_id: one.keyId })).refused).toBe('unknown-key');
});

test('feedback travels page to panels on its topic; nobody but the database writes the press topic', async () => {
  const slug = await production();
  const { feedback } = await pair(slug, 'Deck');
  const pageClient = client();
  const claimed = await rpc(pageClient, 'panel_claim', { p_slug: slug, p_page: 'pagepagepage0001', p_where: 'production', p_label: 'Production page' });

  // The page's state reaches a panel, as a client broadcast.
  const panel = await listen(client(), feedback);
  expect(panel.status).toBe('SUBSCRIBED');
  const pageOut = await listen(pageClient, feedback);
  await pageOut.channel.send({ type: 'broadcast', event: 'state', payload: { v: 1, ver: 1, page: 'pagepagepage0001' } });
  expect((await panel.next('state')).payload).toMatchObject({ ver: 1 });

  // A client broadcasting on the press topic is not heard: no INSERT policy admits it.
  const pressTopic = claimed.press_topic as string;
  const listener = await listen(pageClient, pressTopic);
  const forger = await listen(client(), pressTopic);
  const sent = await forger.channel.send({ type: 'broadcast', event: 'press', payload: { verb: 'all-out', claim: claimed.claim } });
  await new Promise((r) => setTimeout(r, 1_500));
  expect(listener.got.filter((m) => m.event === 'press')).toEqual([]);
  console.log(`a client's broadcast on the press topic answered "${sent}" and reached nobody`);
});
