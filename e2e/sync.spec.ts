import { test, expect } from '@playwright/test';

// Era 5.2: the sync engine's merge policy is pure and must be provably correct offline. This drives
// reconcile()/runSync() directly (the "logic check without UI" path) with crafted records and an
// in-memory provider — no backend needed. The LIVE Supabase round-trip is maintainer-verified.

test('sync engine: reconcile + runSync behave correctly', async ({ page }) => {
  await page.goto('/app');

  const results = await page.evaluate(async () => {
    const { reconcile, runSync } = await import('/src/backend/sync.ts?t=' + Date.now());

    const rec = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
      kind: 'look' as const,
      id,
      updatedAt,
      body: { id, name: id, updatedAt, ...extra },
      ...extra,
    });

    // In-memory StorageProvider that just stores whatever StoredRecords it's given. `failPut`
    // lets a test make individual puts fail (return an Error to throw, null to store normally).
    type Rec = { kind: string; id: string; updatedAt: string } & Record<string, unknown>;
    const mem = (seed: Rec[] = [], failPut?: (r: Rec) => Error | null) => {
      const store = new Map<string, Rec>(seed.map((r): [string, Rec] => [r.kind + ':' + r.id, r]));
      return {
        store,
        async list(kind: string) {
          return [...store.values()].filter((r) => r.kind === kind);
        },
        async get(kind: string, id: string) {
          return store.get(kind + ':' + id) ?? null;
        },
        async put(r: Rec) {
          const e = failPut?.(r);
          if (e) throw e;
          store.set(r.kind + ':' + r.id, r);
        },
        async remove(kind: string, id: string) {
          store.delete(kind + ':' + id);
        },
      };
    };

    const out: { name: string; pass: boolean; got?: unknown }[] = [];
    const check = (name: string, pass: boolean, got?: unknown) => out.push({ name, pass, got });

    const T0 = '2026-01-01T00:00:00.000Z';
    const T1 = '2026-02-01T00:00:00.000Z';
    const T2 = '2026-03-01T00:00:00.000Z';

    // 1. new local record → push
    let p = reconcile([rec('a', T1)], [], T0);
    check('new-local pushes', p.toRemote.length === 1 && p.toLocal.length === 0 && p.conflicts.length === 0);

    // 2. new remote record → pull
    p = reconcile([], [rec('b', T1)], T0);
    check('new-remote pulls', p.toLocal.length === 1 && p.toRemote.length === 0);

    // 3. equal timestamps → no-op
    p = reconcile([rec('c', T1)], [rec('c', T1)], T0);
    check('equal is no-op', p.toRemote.length === 0 && p.toLocal.length === 0 && p.conflicts.length === 0);

    // 4. LWW: local newer, remote unchanged since last sync (since=T1) → push local
    p = reconcile([rec('d', T2)], [rec('d', T1)], T1);
    check('LWW local-newer pushes', p.toRemote.length === 1 && p.conflicts.length === 0);

    // 5. LWW: remote newer, local unchanged since last sync → pull remote
    p = reconcile([rec('e', T1)], [rec('e', T2)], T1);
    check('LWW remote-newer pulls', p.toLocal.length === 1 && p.conflicts.length === 0);

    // 6. true conflict: BOTH changed since last sync (since=T0, a real prior baseline) → remote
    //    wins, local kept as copy
    p = reconcile([rec('f', T1)], [rec('f', T2)], T0);
    check('conflict keeps both', p.toLocal.length === 1 && p.conflicts.length === 1);

    // 6b. FIRST sync (since=EPOCH): the same divergence must be pure LWW, NOT a spurious conflict
    const EPOCH = '1970-01-01T00:00:00.000Z';
    p = reconcile([rec('f2', T1)], [rec('f2', T2)], EPOCH);
    check('first-sync no spurious conflict', p.toLocal.length === 1 && p.conflicts.length === 0);

    // 6c. singleton (brand): local id 'default' vs remote id 'cloud' — matched by KIND (not id), and
    //     a concurrent edit is plain LWW, never a "(conflicted copy)" (there can only be one).
    const brandRec = (id: string, t: string) => ({ kind: 'brand' as const, id, updatedAt: t, body: { name: 'B', updatedAt: t } });
    p = reconcile([brandRec('default', T1)], [brandRec('cloud', T2)], T0);
    check('singleton matched by kind, LWW no conflict', p.toLocal.length === 1 && p.toRemote.length === 0 && p.conflicts.length === 0);

    // 7. delete propagates: local tombstone newer than remote live record → push the tombstone
    p = reconcile([rec('g', T2, { deleted: true })], [rec('g', T1)], T1);
    check('delete propagates', p.toRemote.length === 1 && p.toRemote[0].deleted === true);

    // 8. conflict where the loser is a tombstone → no meaningless "conflicted copy" of a delete
    p = reconcile([rec('h', T1, { deleted: true })], [rec('h', T2)], T0);
    check('delete-loser makes no copy', p.toLocal.length === 1 && p.conflicts.length === 0);

    // 9. runSync round-trip: push one local + pull one remote, then idempotent second run
    localStorage.removeItem('spx-gfx-sync');
    const local = mem([rec('L', T1)]);
    const remote = mem([rec('R', T1)]);
    const r1 = await runSync(local, remote);
    const remoteHasL = remote.store.has('look:L');
    const localHasR = local.store.has('look:R');
    check('runSync pushes+pulls', r1.pushed === 1 && r1.pulled === 1 && remoteHasL && localHasR);
    const r2 = await runSync(local, remote);
    check('runSync idempotent', r2.pushed === 0 && r2.pulled === 0 && r2.conflicts === 0);

    // 10. ids must be valid UUIDs (cloud documents.id is a uuid PK — a non-UUID poisons sync)
    const { uuid } = await import('/src/model/id.ts?t=' + Date.now());
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    check('uuid() is valid v4', [uuid(), uuid(), uuid()].every((u: string) => re.test(u)));

    // ── fault isolation + the pending sets (per-record carry-over) ───────────────────────────────

    const readMeta = () => JSON.parse(localStorage.getItem('spx-gfx-sync') ?? '{}');

    // 11. a record whose push previously FAILED counts as locally-changed regardless of the
    //     bookmark — a later remote edit is then a true conflict, not a silent overwrite
    const T1b = '2026-02-15T00:00:00.000Z';
    const pNo = reconcile([rec('pp', T1)], [rec('pp', T2)], T1b);
    p = reconcile([rec('pp', T1)], [rec('pp', T2)], T1b, { push: new Set(['look:pp']) });
    check(
      'pending push forces conflict',
      pNo.conflicts.length === 0 && pNo.toLocal.length === 1 && p.conflicts.length === 1 && p.toLocal.length === 1,
    );

    // 12. an owed "(conflicted copy)" forces the conflict branch again until it materializes
    p = reconcile([rec('pc', T1)], [rec('pc', T2)], '2026-04-01T00:00:00.000Z', { conflict: new Set(['look:pc']) });
    check('owed conflict copy forces conflict branch', p.conflicts.length === 1 && p.toLocal.length === 1);

    // 13. one failing put never sinks the pass: the healthy record still pushes, the failure is
    //     surfaced, the bookmark ADVANCES, and the failed key lands in pendingPush
    localStorage.removeItem('spx-gfx-sync');
    const l13 = mem([rec('ok1', T1), rec('bad', T1)]);
    const r13 = mem([], (r) => (r.id === 'bad' ? new Error('boom') : null));
    const s13 = await runSync(l13, r13);
    const meta13 = readMeta();
    check(
      'per-record isolation, bookmark advances',
      s13.pushed === 1 &&
        s13.failures.length === 1 &&
        s13.failures[0].id === 'bad' &&
        s13.failures[0].op === 'push' &&
        r13.store.has('look:ok1') &&
        typeof meta13.lastSyncedAt === 'string' &&
        meta13.lastSyncedAt > T2 &&
        meta13.pendingPush.includes('look:bad'),
    );

    // 14. the frozen-bookmark disaster, replayed against the fix: the failed push's record is
    //     edited remotely before the next pass — the local edit must survive as a copy, not be
    //     silently overwritten (and the pending debt clears once handled)
    const T9 = '2036-01-01T00:00:00.000Z'; // after the just-saved bookmark
    r13.store.set('look:bad', rec('bad', T9));
    const s14 = await runSync(l13, r13);
    const copies14 = [...l13.store.values()].filter(
      (x) => typeof (x.body as { name?: unknown })?.name === 'string' && String((x.body as { name: string }).name).includes('(conflicted copy)'),
    );
    check(
      'failed push + later remote edit = conflict, copy kept',
      s14.conflicts === 1 &&
        copies14.length === 1 &&
        l13.store.get('look:bad')?.updatedAt === T9 &&
        [...r13.store.values()].some((x) => String((x.body as { name?: unknown })?.name ?? '').includes('(conflicted copy)')) &&
        readMeta().pendingPush.length === 0,
    );

    // 15. a conflict copy of a SHOW must not carry the original's hostedSlug (it would publish
    //     over the original's hosted control page)
    localStorage.setItem('spx-gfx-sync', JSON.stringify({ lastSyncedAt: T0 }));
    const showRec = (id: string, t: string, name: string) => ({
      kind: 'show' as const,
      id,
      updatedAt: t,
      body: { id, name, updatedAt: t, hostedSlug: 'live-slug', graphics: [] },
    });
    const l15 = mem([showRec('s1', T1, 'My show')]);
    const r15 = mem([showRec('s1', T2, 'My show (cloud)')]);
    const s15 = await runSync(l15, r15);
    const copy15 = [...l15.store.values()].find((x) => String((x.body as { name?: unknown })?.name ?? '').includes('(conflicted copy)'));
    check(
      'conflict copy strips hostedSlug',
      s15.conflicts === 1 && !!copy15 && (copy15.body as { hostedSlug?: unknown }).hostedSlug === undefined,
    );

    // ── cross-account id collisions (RLS-denied puts) ────────────────────────────────────────────

    const denied = () =>
      Object.assign(new Error('Cloud put(look) failed: new row violates row-level security policy'), {
        putDenied: true,
      });

    // 16. a live record whose cloud id belongs to another account is NEVER copied into this one:
    //     no fresh id, nothing pushed, the local record untouched, and the refusal reported.
    //     Re-minting it is how one account's graphics used to land in another's cloud.
    localStorage.removeItem('spx-gfx-sync');
    const l16 = mem([rec('11111111-1111-4111-8111-111111111111', T1)]);
    const r16 = mem([], (r) => (r.id === '11111111-1111-4111-8111-111111111111' ? denied() : null));
    const s16 = await runSync(l16, r16);
    check(
      'RLS-denied put stays local and is never re-minted',
      s16.pushed === 0 &&
        s16.failures.length === 1 &&
        /another account/.test(s16.failures[0].message) &&
        l16.store.size === 1 &&
        l16.store.has('look:11111111-1111-4111-8111-111111111111') &&
        r16.store.size === 0,
      s16,
    );

    // 17. a TOMBSTONE denied by RLS deletes nothing of ours in the cloud — dropped silently,
    //     never a failure (so one foreign record can never wedge sync)
    const l17 = mem([rec('ghost', T1, { deleted: true })]);
    const r17 = mem([], (r) => (r.id === 'ghost' ? denied() : null));
    const s17 = await runSync(l17, r17);
    check(
      'foreign tombstone dropped silently',
      s17.failures.length === 0 && s17.pushed === 0 && l17.store.has('look:ghost'),
    );

    return out;
  });

  const failures = results.filter((r) => !r.pass);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  expect(results.length).toBe(20);
});

test('asset externalization: round-trips through a Storage stub', async ({ page }) => {
  await page.goto('/app');

  const result = await page.evaluate(async () => {
    const { externalizeAssets, rehydrateAssets, STORAGE_SENTINEL } = await import('/src/backend/assets.ts?t=' + Date.now());

    // In-memory "Storage": key -> data-URL.
    const store = new Map<string, string>();
    const upload = async (key: string, dataUrl: string) => { store.set(key, dataUrl); };
    const download = async (key: string) => store.get(key) ?? null;

    // Use the corpus-standard valid transparent pixel because only byte round-tripping is under test.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

    // A packet-shaped body: the asset is nested deep (graphics[].template.assets[]).
    const body = {
      id: 'p1', name: 'Show', updatedAt: 'x',
      graphics: [{ template: { assets: [{ path: 'images/logo.png', data: png }] } }],
    };

    const ext = await externalizeAssets(body, 'user123', upload);
    const extData: string = ext.graphics[0].template.assets[0].data;
    const re = await rehydrateAssets(ext, download);
    const reData: string = re.graphics[0].template.assets[0].data;

    // A non-base64 data-URL (inline SVG) must be left inline, not externalized.
    const svg = 'data:image/svg+xml,<svg/>';
    const extSvg = await externalizeAssets({ a: { path: 'x', data: svg } }, 'u', upload);

    return {
      sentinel: extData.startsWith(STORAGE_SENTINEL),
      keyScopedToUser: extData.includes('user123/'),
      storedExactlyOne: store.size === 1,
      bodyShrank: JSON.stringify(ext).length < JSON.stringify(body).length,
      roundTrips: reData === png,
      nonBase64LeftInline: extSvg.a.data === svg,
    };
  });

  expect(result).toEqual({
    sentinel: true,
    keyScopedToUser: true,
    storedExactlyOne: true,
    bodyShrank: true,
    roundTrips: true,
    nonBase64LeftInline: true,
  });
});
