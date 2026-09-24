import { test, expect } from '@playwright/test';
import { createProject } from './_create';
import { importProofCase, PROOF_TOTALS, PROOF_VOTES } from './_proofCase';
import { appliedIn, receiverHost } from './_receiverHost';

// Hosted control ENTRIES (docs/CONTROL_LAYER.md + docs/SAVED_CONTENT_MODEL.md §4): a show's
// published `panel` spec carries every graphic's saved entries, so the hosted ?control= page
// can offer them as a read-only switcher.
//
// Publishing and operating need a real backend, which this suite deliberately does not have
// (offline-pinned) — the hosted page itself is covered by the maintainer's live checklist.
// What is pinned here is the half that runs locally and decides whether an operator sees
// their rundown rows at all: which library record a show graphic's entries come from.

test('a saved graphic carries its entries into the show it is added to', async ({ page }) => {
  await createProject(page, 'Hairline');

  // Save it, then build two entries on its control panel — the operator's rundown rows.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Presenter lower third');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Presenter lower third' });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('open-control').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await page.getByTestId('add-entry').click();
  await page.getByTestId('entry-field-f0').fill('Anna Andersson');
  await page.getByTestId('entry-field-f1').fill('Presenter');
  await page.getByTestId('add-entry').click();
  await page.getByTestId('entry-field-f0').fill('Michael Smith');
  await expect(page.locator('.control-entry')).toHaveCount(2);

  // Back into the editor (the document keeps its library link) and into a show.
  await page.getByTestId('control-open-editor').click();
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Presenter lower third');
  await page.getByTestId('dock-tab-control').click();
  const shows = page.locator('.panel-section', { hasText: 'Productions' });
  await shows.getByPlaceholder('New production name').fill('Evening Show');
  await shows.getByRole('button', { name: 'Create', exact: true }).click();
  await shows.getByRole('button', { name: '+ Add current' }).click();
  await expect(shows.locator('.status-ok')).toContainText('is in the production');

  // The show's copy records WHICH library graphic it came from — the link the panel follows
  // (a name match would pass here by luck; this pins the id).
  const link = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { graphicById } = await import('/src/model/library.ts');
    const id = loadShows()[0].graphics[0].graphicId ?? null;
    return { id, name: id ? graphicById(id)?.name : null };
  });
  expect(link.name).toBe('Presenter lower third');

  // The published panel spec — what the hosted page renders from — carries both entries.
  const panel = await page.evaluate(async () => {
    const { buildPanelSpec } = await import('/src/control/hostedControl.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    return buildPanelSpec(loadShows()[0]);
  });
  expect(panel).toHaveLength(1);
  expect(panel[0].entries.map((e) => e.label)).toEqual(['Anna Andersson', 'Michael Smith']);
  expect(panel[0].entries[0].values.f1).toBe('Presenter');
  // Never the template payload — the spec stays the operator's view of the graphic.
  expect(Object.keys(panel[0])).toEqual(['name', 'fields', 'js', 'images', 'entries', 'dataRows']);
});

test('a production dataset publishes the rows its graphics can load', async ({ page }) => {
  // The hosted control page never sees the show record, only what publishing wrote — so the
  // Data workspace's other half (loading a row into a cue) reaches it as PUBLISHED rows,
  // matched by the same `control/cueData.ts` the in-app page runs live. Before this the hosted
  // page had no data loading at all, on the surface a class actually operates from.
  await createProject(page, 'Hairline');

  const spec = await page.evaluate(async () => {
    const { buildPanelSpec } = await import('/src/control/hostedControl.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { setFieldTitle } = await import('/src/blocks/edit.ts');
    // Name the first two fields so a table can bind to them by title.
    let template = useTemplateStore.getState().template;
    template = setFieldTitle(template, 'f0', 'Name');
    template = setFieldTitle(template, 'f1', 'Role');
    const show = {
      id: 'show-data-1',
      name: 'Data Show',
      updatedAt: new Date().toISOString(),
      graphics: [
        { id: 'copy-1', name: 'Guest strap', type: template.type, savedAt: new Date().toISOString(), template },
      ],
      datasets: [
        {
          id: 'ds1',
          name: 'Guests',
          kind: 'roster',
          columns: [
            { key: 'c0', label: 'Name' },
            { key: 'c1', label: 'Role' },
          ],
          rows: [
            { id: 'r1', values: { c0: 'Anna Andersson', c1: 'Presenter' } },
            { id: 'r2', values: { c0: 'Ben Berg', c1: 'Reporter' } },
          ],
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return buildPanelSpec(show as any)[0].dataRows;
  });

  // One row per table row (no A/B sides on a lower third), labelled by the first non-empty
  // cell, with the values already resolved against the FIELD IDS.
  expect(spec.map((r: { label: string }) => r.label)).toEqual(['Guests: Anna Andersson', 'Guests: Ben Berg']);
  expect(spec[0].side).toBeNull();
  expect(spec[0].values).toEqual({ f0: 'Anna Andersson', f1: 'Presenter' });
});

test('entries resolve by library id, fall back to a unique name, and never guess', async ({ page }) => {
  await createProject(page, 'Hairline');

  const result = await page.evaluate(async () => {
    const { createGraphic, newEntry } = await import('/src/model/library.ts');
    const { buildPanelSpec } = await import('/src/control/hostedControl.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const template = useTemplateStore.getState().template;

    const linked = createGraphic(template, {
      name: 'Presenter lower third',
      entries: [newEntry('Anna Andersson', { f0: 'Anna Andersson' })],
    }).doc;
    // Two library graphics sharing a name: no unique match, so no entries may be guessed.
    createGraphic(template, { name: 'Twin', entries: [newEntry('Left', { f0: 'Left' })] });
    createGraphic(template, { name: 'Twin', entries: [newEntry('Right', { f0: 'Right' })] });

    const show = (graphics: unknown[]) =>
      ({ id: 'show-1', name: 'Evening Show', graphics, updatedAt: new Date().toISOString() });
    const copy = (name: string, graphicId?: string) => ({
      id: `copy-${name}-${graphicId ?? 'none'}`,
      name,
      type: template.type,
      savedAt: new Date().toISOString(),
      template,
      ...(graphicId ? { graphicId } : {}),
    });

    const spec = (graphics: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildPanelSpec(show(graphics) as any).map((g) => g.entries.map((e) => e.label));

    return {
      byId: spec([copy('Renamed in the show', linked.id)]),
      byName: spec([copy('Presenter lower third')]),
      ambiguous: spec([copy('Twin')]),
      staleLink: spec([copy('Presenter lower third', 'not-a-record')]),
      unknown: spec([copy('Never saved')]),
    };
  });

  // The id wins even when the show's copy was renamed…
  expect(result.byId).toEqual([['Anna Andersson']]);
  // …an older copy with no link resolves by its unique name…
  expect(result.byName).toEqual([['Anna Andersson']]);
  // …and an ambiguous name, a stale link, or an unsaved graphic publishes nothing.
  expect(result.ambiguous).toEqual([[]]);
  expect(result.staleLink).toEqual([[]]);
  expect(result.unknown).toEqual([[]]);
});

// ── THE HOSTED RECEIVER'S BOOT, offline ──────────────────────────────────────────────────
//
// The block appended to a graphic whose production has a hosted control page (hostedReceiver.ts)
// is plain generated JS talking to two addresses: the REST RPCs and the Realtime socket. Both
// can be answered in-spec, so the discipline that decides whether a published graphic survives a
// bad minute IS pinnable offline - it had simply never been pinned, and the defects below rode a
// year of releases on the plane real productions publish onto.
//
// Load is not how this family reproduces. Injecting the dropped request is, and it is
// deterministic in one run - the technique local-relay.spec.ts uses for the local half.

/** The receiver block for a fixed capability, generated by the real exporter. */
async function receiverBlock(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  return page.evaluate(async () => {
    const { hostedReceiverBlock } = await import('/src/control/hostedReceiver.ts');
    return hostedReceiverBlock({ ref: 'bootref', key: 'anon-key', slug: 'cap-slug', graphic: 'Board' });
  });
}

test('a hosted graphic whose boot resolve is dropped still comes back on air', async ({ page, context }) => {
  test.setTimeout(120_000);
  // THE RESOLVE IS THE ONE REQUEST THE WHOLE AIRING HANGS ON: it carries the show id (no id, no
  // subscription), the log baseline and the graphic's own last report. It used to be asked once,
  // with a failure swallowed into null and read as the answer a REVOKED slug gives - so a single
  // dropped request left the graphic dead for the whole show, silently, and nothing would ever
  // wake it. Here the first two attempts fail; the airing must survive them.
  const html = receiverHost(await receiverBlock(page));

  let resolves = 0;
  const graphic = await context.newPage();
  await graphic.routeWebSocket('wss://bootref.supabase.co/**', () => {
    /* joined and silent: this test is about the boot, not about live rows */
  });
  await graphic.route('https://bootref.supabase.co/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'control_show_by_slug') {
      resolves += 1;
      if (resolves <= 2) return route.abort('failed');
      return route.fulfill({
        json: [{ id: 'show-1', last_event_id: 7, live: { Board: { data: { f0: 'RECOVERED' } } } }],
      });
    }
    return route.fulfill({ json: [] });
  });
  await graphic.route('http://hosted-boot.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );

  await graphic.goto('http://hosted-boot.local/board.html', { waitUntil: 'load' });
  // The graphic rebuilds from its own last report only once the resolve finally answers.
  await expect(graphic.locator('#f0')).toHaveText('RECOVERED', { timeout: 30_000 });
  expect(resolves, 'the dropped attempts must be retried, not concluded from').toBeGreaterThan(2);

  await graphic.close();
});

test('a hole in the hosted log is filled from the log, not papered over by the row that revealed it', async ({ page, context }) => {
  test.setTimeout(120_000);
  // A row arriving with rows missing in front of it means the socket dropped some. The receiver
  // used to APPLY that row and then fill the tail - but applying it pushed the cursor past the
  // gap, so the tail's older rows came back and were dropped as duplicates. The gap closed on
  // paper while the commands inside it never ran: here that is the PLAY, so the board would have
  // taken its new score without ever coming on air.
  const html = receiverHost(await receiverBlock(page));

  const log = [
    { id: 1, graphic: 'Board', msg: { t: 'play' } },
    { id: 2, graphic: 'Board', msg: { t: 'update', data: { f0: 'B' } } },
    { id: 3, graphic: 'Board', msg: { t: 'update', data: { f0: 'C' } } },
  ];
  // The three rows are written only AFTER the receiver's boot tail fill has come back empty.
  // Without that the first version of this test proved nothing: the fill that runs before the
  // socket had already delivered all three, so the live row was a duplicate and the hole path
  // never ran - it passed with the defect put back, which is how it was caught.
  const visible: typeof log = [];
  let tailReads = 0;
  let socket: import('@playwright/test').WebSocketRoute | null = null;

  const graphic = await context.newPage();
  await graphic.routeWebSocket('wss://bootref.supabase.co/**', (ws) => {
    socket = ws;
  });
  await graphic.route('https://bootref.supabase.co/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'control_show_by_slug') {
      // Nothing reported yet, and the baseline is the log's start: everything below is a gap.
      return route.fulfill({ json: [{ id: 'show-1', last_event_id: 0, live: {} }] });
    }
    if (name === 'control_tail') {
      const after = Number((route.request().postDataJSON() as { p_after?: number }).p_after ?? 0);
      tailReads += 1;
      return route.fulfill({ json: visible.filter((r) => r.id > after) });
    }
    return route.fulfill({ json: [] });
  });
  await graphic.route('http://hosted-hole.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );

  await graphic.goto('http://hosted-hole.local/board.html', { waitUntil: 'load' });
  // The join-time fill has run and found nothing…
  await expect.poll(() => tailReads, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await appliedIn(graphic)).toEqual([]);
  // …now the show happens, and only the LAST of its three rows reaches the socket: rows 1 and 2
  // are the ones a dropped connection eats. That is the hole.
  visible.push(...log);
  socket!.send(JSON.stringify({ event: 'postgres_changes', payload: { data: { record: log[2] } } }));

  // All three run, in log order. Under the old code this read ['update:C'] alone: the row that
  // revealed the hole was applied first and the two it was hiding were then dropped.
  await expect
    .poll(() => appliedIn(graphic), { timeout: 30_000 })
    .toEqual(['play', 'update:B', 'update:C']);

  await graphic.close();
});

test('a hosted graphic that has never reported airs what was commanded before it existed', async ({ page, context }) => {
  test.setTimeout(120_000);
  // THE COLD BOOT ON THE RELAY PLANE (docs/CLOUD_PLAYOUT.md §3). The operator takes a cue and
  // THEN the graphic loads - a browser source pasted into OBS after the production is already up,
  // which is the ordinary order in a control room. Nothing has ever reported for this graphic, so
  // the log's whole content is a command no renderer has ever rendered.
  //
  // The receiver used to seed its cursor with `last_event_id`, the log HEAD, which is a claim
  // about the RENDERER - "everything up to here is already on air" - made here about a log that
  // nothing had ever followed. So the take was dropped for good: no report to rebuild from, no
  // row left to replay, a dark layer until an operator happened to send another command. The
  // /output plane fixed exactly this; this is the same rule on the plane exported packages run on.
  const html = receiverHost(await receiverBlock(page));

  const log = [
    { id: 1, graphic: 'Board', msg: { t: 'update', data: { f0: 'AIRED' } } },
    { id: 2, graphic: 'Board', msg: { t: 'play' } },
  ];

  const graphic = await context.newPage();
  await graphic.routeWebSocket('wss://bootref.supabase.co/**', () => {
    /* joined and silent: everything this graphic must show is already history */
  });
  await graphic.route('https://bootref.supabase.co/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'control_show_by_slug') {
      // The head is 2 and `live` is empty: the take is IN the log, and nobody has rendered it.
      return route.fulfill({ json: [{ id: 'show-1', last_event_id: 2, live: {} }] });
    }
    if (name === 'control_tail') {
      const after = Number((route.request().postDataJSON() as { p_after?: number }).p_after ?? 0);
      return route.fulfill({ json: log.filter((r) => r.id > after) });
    }
    return route.fulfill({ json: [] });
  });
  await graphic.route('http://hosted-cold.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );

  await graphic.goto('http://hosted-cold.local/board.html', { waitUntil: 'load' });

  // Both rows run, in log order. Seeded from the head this read [] for the whole airing.
  await expect
    .poll(() => appliedIn(graphic), { timeout: 30_000 })
    .toEqual(['update:AIRED', 'play']);
  await expect(graphic.locator('#f0')).toHaveText('AIRED');

  await graphic.close();
});

test('a hosted graphic whose channel never delivers a row still catches up from the log', async ({ page, context }) => {
  test.setTimeout(180_000);
  // THE CHANNEL THAT JOINS AND NEVER SPEAKS. A socket that opens but whose subscription never
  // delivers - a venue proxy that passes the upgrade and eats the frames, a Realtime incident, an
  // old CEF - leaves this receiver with exactly one tail fill (the one at connect time) and then
  // silence for the rest of the show. Nothing retries it: the reconnect path is driven by
  // `onclose`, and this socket never closes. So every command sent after the graphic loaded was
  // lost, on air, with nothing anywhere saying why.
  //
  // The floor under Realtime is a periodic tail fill (control/hostedControl.ts CONTROL_POLL_MS,
  // emitted into this block from the same constant). It is a FLOOR, not the transport: on a
  // healthy production Realtime has already delivered the row long before the poll comes round.
  const html = receiverHost(await receiverBlock(page));

  const log: { id: number; graphic: string; msg: unknown }[] = [];

  const graphic = await context.newPage();
  await graphic.routeWebSocket('wss://bootref.supabase.co/**', () => {
    /* the whole subject: the socket opens, is never joined, and never delivers a single row */
  });
  let tailReads = 0;
  await graphic.route('https://bootref.supabase.co/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'control_show_by_slug') {
      return route.fulfill({ json: [{ id: 'show-1', last_event_id: 0, live: {} }] });
    }
    if (name === 'control_tail') {
      const after = Number((route.request().postDataJSON() as { p_after?: number }).p_after ?? 0);
      tailReads += 1;
      return route.fulfill({ json: log.filter((r) => r.id > after) });
    }
    return route.fulfill({ json: [] });
  });
  await graphic.route('http://hosted-silent.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );

  await graphic.goto('http://hosted-silent.local/board.html', { waitUntil: 'load' });
  // The boot fill has run and found an empty log - so whatever appears below arrived through
  // the poll, not through that one read.
  await expect.poll(() => tailReads, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await appliedIn(graphic)).toEqual([]);

  // …now the operator takes a cue. The socket says nothing about it, ever.
  log.push(
    { id: 1, graphic: 'Board', msg: { t: 'update', data: { f0: 'LATE' } } },
    { id: 2, graphic: 'Board', msg: { t: 'play' } },
  );

  await expect
    .poll(() => appliedIn(graphic), { timeout: 90_000 })
    .toEqual(['update:LATE', 'play']);

  await graphic.close();
});

test('the receiver block emits the SAME baseline rule the app renderer applies', async () => {
  // ONE RULE, TWO FORMS. `control/outputRecovery.ts` decides where a boot starts reading the
  // control log; the receiver block cannot import it (it ships as text inside a graphic's own JS,
  // on an engine that predates `?.`), so the module emits an ES5 copy beside the TypeScript one.
  // Two implementations of a decision this load-bearing drift, and the drift shows up on air and
  // nowhere else - so they are compared here rather than trusted, over every shape the resolve
  // can hand either of them.
  //
  // Node-side, no page: `outputRecovery.ts` imports nothing but a TYPE, so it is a leaf module
  // and both forms can be exercised directly.
  const { receiverFollowFrom, RECEIVER_FOLLOW_FROM_JS } = await import('../src/control/outputRecovery');
  const emitted = new Function(`${RECEIVER_FOLLOW_FROM_JS}\nreturn followFrom;`)() as (
    graphic: string,
    live: unknown,
    logHead: unknown,
  ) => number;

  const cases: { why: string; live: Record<string, { event?: number }>; head: number; want: number }[] = [
    { why: 'a dated report replays after its own baseline', live: { Board: { event: 42 } }, head: 99, want: 42 },
    { why: 'a baseline of 0 is a baseline, not a missing one', live: { Board: { event: 0 } }, head: 99, want: 0 },
    { why: 'never reported at all: the log START, never its head', live: {}, head: 99, want: 0 },
    { why: 'another graphic reported, this one did not', live: { Other: { event: 42 } }, head: 99, want: 0 },
    { why: 'reported but undatable: the head (this plane cannot hide a replay)', live: { Board: {} }, head: 99, want: 99 },
    { why: 'undatable with no head either', live: { Board: {} }, head: 0, want: 0 },
  ];

  for (const c of cases) {
    expect(receiverFollowFrom('Board', c.live, c.head), `TS: ${c.why}`).toBe(c.want);
    expect(emitted('Board', c.live, c.head), `emitted: ${c.why}`).toBe(c.want);
  }
  // The shapes a bad answer arrives in — a resolve row with no `live` at all, and no head.
  for (const live of [null, undefined, {}]) {
    expect(receiverFollowFrom('Board', (live ?? {}) as Record<string, never>, 0)).toBe(0);
    expect(emitted('Board', live, undefined)).toBe(0);
  }

  // ES5 ONLY: a CasparCG 2.3 CEF is Chromium 71, where `?.` and `??` are syntax errors — a dead
  // layer with nothing on air and no clue why (docs/CLOUD_PLAYOUT.md §3). The emitted text is
  // never transpiled by Vite, so this is the only thing standing between the rule and that.
  expect(RECEIVER_FOLLOW_FROM_JS).not.toMatch(/\?\.|\?\?|=>|`|\bconst\b|\blet\b/);
});

test('a production carries its control profile canonically, and deleting it leaves no trace', async ({ page }) => {
  // AC-4 of docs/work-specs/control-panel-any-graphic: `Show.profile` is a versioned, DELETABLE
  // part of the production (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e). The format's own refusals are
  // pinned node-side in `scripts/control-profile.test.mjs`, which transpiles the leaf module; what
  // only the real app can show is the half below — that the record round trips through the store,
  // that writing it CANONICALIZES, and that deleting it removes the KEY rather than emptying it.
  await createProject(page, 'Hairline');

  const stored = await page.evaluate(async () => {
    const { createShowNamed, setShowProfile, deleteShowProfile, loadShows, upsertShow } = await import(
      '/src/model/shows.ts'
    );
    const show = createShowNamed('Elämäni biisi');
    // Authored the way a surface would hand it over: keys in no particular order, a default
    // spelled out, a zero wait. All three must be gone from what lands on the record.
    setShowProfile(show.id, {
      v: 1,
      combine: [
        {
          steps: [
            { control: 'reveal', graphic: 'Votes board', kind: 'event', after: 0 },
            { kind: 'event', graphic: 'Totals board', control: 'plus_katri', after: 3, ask: { default: true } },
          ],
          name: 'Reveal, then the points',
          id: 'c1',
        },
      ],
      arrange: { 'Totals board': { plus_katri: { pinned: true, hidden: false } } },
    });
    const written = JSON.stringify(loadShows().find((s) => s.id === show.id)?.profile);
    const deleted = deleteShowProfile(show.id);
    const after = loadShows().find((s) => s.id === show.id);

    // A profile written by a NEWER build must survive both doors on this one. It is invisible
    // here (every surface reads it as null and renders the generated panel), so a write or a
    // delete would be destroying something the operator was never shown.
    const future = createShowNamed('From a newer build');
    const readOnly = { v: 99, arrange: {}, combine: [], conditions: [{ when: 'score > 50' }] };
    // Straight onto the record, because that is how it would arrive: written by a build whose
    // format this one does not have.
    upsertShow({ ...future, profile: readOnly as never });
    const set = setShowProfile(future.id, { v: 1, arrange: {}, combine: [] });
    const del = deleteShowProfile(future.id);
    const survived = JSON.stringify(loadShows().find((s) => s.id === future.id)?.profile);

    return {
      written,
      hasKey: after ? 'profile' in after : true,
      stillThere: !!after,
      deletedRefused: deleted.refused,
      setRefused: set.refused,
      delRefused: del.refused,
      survived,
    };
  });

  // Canonical: `v`, then `arrange`, then `combine`; keys sorted; every default omitted.
  expect(stored.written).toBe(
    '{"v":1,"arrange":{"Totals board":{"plus_katri":{"pinned":true}}},' +
      '"combine":[{"id":"c1","name":"Reveal, then the points",' +
      '"steps":[{"kind":"event","graphic":"Votes board","control":"reveal"},' +
      '{"kind":"event","graphic":"Totals board","control":"plus_katri","after":3,"ask":{"default":true}}]}]}',
  );
  // Deleting is ONE action and leaves no key, so a production that never had a profile and one
  // whose profile was deleted are byte-identical — and the generated panel is what remains.
  expect(stored.stillThere).toBe(true);
  expect(stored.hasKey).toBe(false);
  expect(stored.deletedRefused).toBe(false);

  // Read-only holds at BOTH doors, and both say so rather than reporting a write that never
  // happened: the newer build's bytes are still there, verbatim.
  expect(stored.setRefused).toBe(true);
  expect(stored.delRefused).toBe(true);
  expect(stored.survived).toBe('{"v":99,"arrange":{},"combine":[],"conditions":[{"when":"score > 50"}]}');
});

// The READ side of `control_shows.profile` — every shape that column can hand back — is pinned
// node-side in `scripts/control-profile.test.mjs`, which runs in every build. It is not pinned
// here because reaching the normalizer through `hostedControl.ts` would drag the whole Supabase
// and asset graph into a Playwright transform, which is how the first cut of this failed. The
// publish WRITE needs a real backend and is step 8 of the live-verify checklist in
// docs/CONTROL_LAYER.md: `publishControlShow` returns before its upsert when there is no Supabase,
// so no offline spec can see the column being written.

test('the hosted page arranges from the PUBLISHED bytes, by the one rule the in-app page uses', async ({ page }) => {
  // AC-5's hosted deployment, pinned as far as an OFFLINE spec honestly can.
  //
  // WHAT THIS PROVES AND WHAT IT DOES NOT. The hosted page renders from two published things
  // and nothing else: the `panel` spec (which carries each graphic's `js`, and therefore its
  // declared controls) and the `profile` column. This asserts that those two, run through the
  // SHARED `arrangeControls`, give the three lists the page draws — which is the whole of what
  // ARRANGE does there, since the page has no other input. What it cannot reach is the page's
  // own DOM: mounting it needs a configured backend, so the buttons themselves are step 9 of the
  // live-verify checklist in docs/CONTROL_LAYER.md, with the rest of that surface.
  //
  // ONE RULE IS THE POINT. The in-app case in `production-controls.spec.ts` drives the DOM of
  // the same function on the same graphic; if these two ever disagree, one of the surfaces has
  // grown a second opinion, which is exactly the divergence the shared helper exists to prevent.
  await createProject(page, { name: 'Club Scorebug' });

  const arranged = await page.evaluate(async () => {
    const { buildPanelSpec } = await import('/src/control/hostedControl.ts');
    const { arrangeControls, arrangeFor, eventButtons } = await import('/src/control/controlModel.ts');
    const { withGraphicArrange, readPublishedProfile } = await import('/src/model/profile.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const template = useTemplateStore.getState().template;
    const show = {
      id: 'show-arrange-1',
      name: 'Club Match',
      updatedAt: new Date().toISOString(),
      graphics: [
        { id: 'copy-1', name: 'Club Scorebug', type: template.type, savedAt: new Date().toISOString(), template },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const panel = buildPanelSpec(show as any);
    const profile = withGraphicArrange(undefined, 'Club Scorebug', {
      clockStart: { pinned: true },
      clockStop: { name: 'Stop the clock', hidden: true },
    });
    // THROUGH THE PUBLISHED COLUMN, not through the record: `publishControlShow` writes the
    // profile as jsonb and `controlShowBySlug` hands it back through `readPublishedProfile`, so
    // the bytes the page arranges from are the ones that survived that round trip.
    const published = readPublishedProfile(JSON.parse(JSON.stringify(profile)));
    const buttons = eventButtons(panel[0].js);
    const read = arrangeControls(buttons, arrangeFor(published, panel[0].name));
    const generated = arrangeControls(buttons, arrangeFor(null, panel[0].name));
    // A profile a NEWER build wrote. `arrangeFor` applies the version gate itself, so every
    // surface degrades to the generated panel together — the in-app page and the exporter both
    // read the arrangement raw at one point, which rendered a v2 profile's arrangement here and
    // ignored it there: one show, two different panels.
    const newer = arrangeControls(
      buttons,
      arrangeFor({ v: 99, arrange: { 'Club Scorebug': { clockStart: { hidden: true } } }, combine: [] }, panel[0].name),
    );
    const names = (controls: { button: { event: string }; label: string }[]) =>
      controls.map((c) => `${c.button.event}:${c.label}`);
    return {
      pinned: names(read.pinned),
      more: names(read.more),
      sections: read.sections.map(([section, controls]) => [section, names(controls)]),
      generatedSections: generated.sections.map(([section, controls]) => [section, names(controls)]),
      generatedExtras: generated.pinned.length + generated.more.length,
      newerSections: newer.sections.map(([section, controls]) => [section, names(controls)]),
      newerExtras: newer.pinned.length + newer.more.length,
      // The legality table is read off the graphic's own `js` and knows nothing about the
      // profile, which is what makes "a hidden control is still guarded" true by construction.
      hiddenIsStillDeclared: buttons.some((b) => b.event === 'clockStop'),
    };
  });

  expect(arranged.pinned).toEqual(['clockStart:Start clock']);
  expect(arranged.more).toEqual(['clockStop:Stop the clock']);
  // Pinned and hidden are LIFTED out of their section rather than drawn twice, and the sections
  // that were not touched arrive exactly as the author declared them.
  expect(arranged.sections).toEqual([
    ['Clock', ['clockReset:Reset to period start']],
    ['Match', ['interval:Interval', 'resumePlay:Resume play', 'final:Full time']],
  ]);
  expect(arranged.hiddenIsStillDeclared).toBe(true);

  // …and with no profile the same call is the generated panel, which is what deleting one leaves
  // on this surface too.
  expect(arranged.generatedExtras).toBe(0);
  expect(arranged.generatedSections).toEqual([
    ['Clock', ['clockStart:Start clock', 'clockStop:Stop clock', 'clockReset:Reset to period start']],
    ['Match', ['interval:Interval', 'resumePlay:Resume play', 'final:Full time']],
  ]);

  // A profile a newer build wrote arranges NOTHING, on every surface at once. It is read-only at
  // both write doors, so a surface that honoured it would show an arrangement nobody on this
  // build could change — and a panel arranged by rules this build does not understand is worse
  // than the generated one it falls back to.
  expect(arranged.newerExtras, 'a v99 profile must not hide a control').toBe(0);
  expect(arranged.newerSections).toEqual(arranged.generatedSections);
});

// ── COMBINED CONTROLS ON THE HOSTED PAGE (AC-6 of docs/work-specs/control-panel-any-graphic) ──
//
// WHAT THIS PROVES AND WHAT IT DOES NOT, stated plainly because the shape matters more than the
// assertions. The hosted page CANNOT BE MOUNTED BY AN OFFLINE SPEC: it needs a configured
// backend, the e2e server pins offline mode, and that is the same ceiling the ARRANGE case above
// hits. So the DOM of the ⚡ Combined section — the button, its ticks, its countdown — stays step
// 9 of the live-verify checklist in docs/CONTROL_LAYER.md, with the rest of that surface, and it
// is drawn by the very component the in-app spec drives (src/components/control/CombinedButton).
//
// WHAT IS REACHABLE IS THE PART THAT DECIDES WHAT GOES ON THE WIRE, and this drives exactly the
// functions the page calls, over the bytes PUBLISHING WRITES — `buildPanelSpec`, the output
// payload, and the profile through the jsonb round trip the column does. It is the page's own
// reading of its production (`control/hostedCombine.ts`) handed to the one resolver both
// dashboards share (`control/combineSend.ts`). Nothing here re-implements a rule to assert it:
// the page holds no copy of any of this.
//
// THE FIXTURE IS THE PROOF CASE, the two boards two agents authored (§6c's first row), not a
// machine written to make the assertion pass.

test('the hosted page reads a delayed step off the WIRE, and reports the one the machine drops', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await importProofCase(page);

  const measured = await page.evaluate(async ({ VOTES, TOTALS }) => {
    const shows = await import('/src/model/shows.ts');
    const { buildPanelSpec, buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { eventLegality, isEventLegal, machineStateGroups } = await import('/src/control/controlModel.ts');
    const { readPublishedProfile } = await import('/src/model/profile.ts');
    const { hostedPoolMachines, hostedCombineNow, hostedCombineWorld, hostedCombineNames } =
      await import('/src/control/hostedCombine.ts');
    const { resolveCombineSend, commandBatches } = await import('/src/control/combineSend.ts');
    const { combineBlocked, planCombine, stepWords } = await import('/src/control/combine.ts');

    const show = shows.loadShows().find((s) => s.graphics.some((g) => g.name === VOTES))!;
    // The proof case's own press, two steps of it: the reveal now, one +1 three seconds later.
    shows.setShowProfile(show.id, {
      v: 1,
      arrange: {},
      combine: [
        {
          id: 'c1',
          name: 'Reveal + points',
          steps: [
            { kind: 'event', graphic: VOTES, control: 'reveal' },
            { kind: 'event', graphic: TOTALS, control: 'plus1', after: 3 },
          ],
        },
      ],
    });
    const stored = shows.loadShows().find((s) => s.id === show.id)!;

    // THE PUBLISHED BYTES, built by the same two functions `publishControlShow` writes with, and
    // the profile taken through the jsonb round trip its column does. This page never sees a show
    // record, so anything read from one here would be proving the wrong thing.
    const panel = buildPanelSpec(stored);
    const payload = await buildOutputPayload(stored);
    const profile = readPublishedProfile(JSON.parse(JSON.stringify(stored.profile)));
    const control = profile!.combine[0];
    const machines = hostedPoolMachines(panel);

    // The two states the votes board's own machine has for `reveal` — one with an arrow out and
    // one without — found from the graphic's declared legality rather than from a state id typed
    // here, so renaming a state in the pack cannot quietly turn this test green.
    const votesJs = panel.find((g) => g.name === VOTES)!.js;
    const legality = eventLegality(votesJs);
    const flat = machineStateGroups(votesJs).flatMap((g) => g.states.map((s) => ({ group: g.id, id: s.id })));
    const asState = (s: { group: string; id: string }) => ({ state: { groups: { [s.group]: s.id } } });
    const ready = flat.find((s) => isEventLegal(legality, 'reveal', asState(s).state))!;
    const spent = flat.find((s) => !isEventLegal(legality, 'reveal', asState(s).state))!;

    const cueOf = (graphic: string) => payload.cues.find((c) => c.graphic === graphic)!;
    /** Both boards on air, the votes board at the start of its walk, nothing reported by the
     *  totals board yet — the production as the operator's minute starts (§3c). */
    const base = {
      panel,
      cues: payload.cues,
      staged: {},
      profile,
      liveCue: { [VOTES]: cueOf(VOTES).id, [TOTALS]: cueOf(TOTALS).id },
      live: { [VOTES]: asState(ready), [TOTALS]: {} },
      aired: {} as Record<string, Record<string, string>>,
      // This production binds nothing, which is the case every production is in until somebody
      // uses the Data tab - and with nothing bound every rule below is the one it always was.
      bindings: {},
      resolved: {},
    };
    const [firstGroup, tailGroup] = planCombine(control, new Set<number>());
    const sendWith = (at: typeof base, groups: typeof firstGroup[]) =>
      resolveCombineSend(groups, hostedCombineNow(machines, at), hostedCombineWorld(machines, at));

    // (A) NOTHING ON AIR: the button greys on its FIRST step, naming the graphic.
    const greyed = combineBlocked(control, hostedCombineNow(machines, { ...base, liveCue: {} }), new Set());

    // (B) THE PRESS ITSELF sends the first group and nothing else.
    const press = sendWith(base, [firstGroup]);

    // (C) THE DELAYED STEP, fired three seconds later against a wire that has MOVED since the
    //     press: another operator's surface has put 4 on the board. The cue still says what it
    //     always said, so a step resolved from the cue would send 1.
    const wired = sendWith({ ...base, aired: { [TOTALS]: { f5: '4' } } }, [tailGroup]);
    const cold = sendWith(base, [tailGroup]);

    // (D) THE DROP: by the time the pair fires the votes board is already revealed and has no
    //     arrow left, so the machine would refuse that row — and the +1 beside it must still go.
    const spentAt = { ...base, live: { ...base.live, [VOTES]: asState(spent) } };
    const drop = sendWith(spentAt, [firstGroup, tailGroup]);
    const names = hostedCombineNames(machines, spentAt);

    // (E) A WALK THAT AIRS WHAT IT THEN DRIVES: Take the totals board, then +1 on it, in one
    //     press, with nothing on air to start with. The take has not come back round the log when
    //     the +1 is judged, so a resolver reading only the surface's own state refuses its own
    //     second step - the composition the owner-queue route all but invites.
    const walk = {
      id: 'c2',
      name: 'Board up, first point',
      steps: [
        { kind: 'verb' as const, verb: 'take' as const, cue: cueOf(TOTALS).id },
        { kind: 'event' as const, graphic: TOTALS, control: 'plus1' },
      ],
    };
    const cold2 = { ...base, liveCue: {}, live: {} };
    const walked = sendWith(cold2, planCombine(walk, new Set<number>()));

    // (F) THREE TAKES, which is nine wire items and so more than one RPC. No batch may hold part
    //     of a take: its `cue` row alone in a refused second batch is a graphic on air that
    //     nothing can then take off.
    const threeTakes = {
      id: 'c3',
      name: 'Top of show',
      steps: [
        { kind: 'verb' as const, verb: 'take' as const, cue: cueOf(VOTES).id },
        { kind: 'verb' as const, verb: 'take' as const, cue: cueOf(TOTALS).id },
        { kind: 'verb' as const, verb: 'take' as const, cue: cueOf(VOTES).id },
      ],
    };
    const top = sendWith(cold2, planCombine(threeTakes, new Set<number>()));

    const kindOf = (item: { msg: unknown }) => (item.msg as { t: string }).t;
    const eventOf = (item: { graphic: string; msg: unknown }) =>
      `${item.graphic}:${(item.msg as { event?: string }).event}`;
    const payloadOf = (item: { msg: unknown }) => (item.msg as { payload?: Record<string, string> }).payload ?? {};
    return {
      greyed,
      pressEvents: press.steps.flat().map(eventOf),
      wiredF5: payloadOf(wired.steps.flat()[0]).f5,
      coldF5: payloadOf(cold.steps.flat()[0]).f5,
      wiredMirror: wired.mirrors.map(
        (m) => `${m.graphic}:${m.cueId === cueOf(TOTALS).id ? 'its cue' : m.cueId}:${m.values.f5}`,
      ),
      cueF5: cueOf(TOTALS).values.f5 ?? '',
      dropSentences: drop.dropped.map(
        (d) => `“${control.name}” skipped ${stepWords(d.step, names)}, because ${d.why}`,
      ),
      dropGraphics: drop.dropped.map((d) => d.graphic),
      dropProceeded: drop.steps.flat().map(eventOf),
      walkDropped: walked.dropped.length,
      walkWire: walked.steps.map((step) => step.map(kindOf).join('+')),
      walkMirror: walked.mirrors.map((m) => `${m.cueId === cueOf(TOTALS).id ? 'its cue' : m.cueId}:${m.values.f5}`),
      topBatches: commandBatches(top.steps).map((b) => b.map(kindOf).join('+')),
    };
  }, { VOTES: PROOF_VOTES, TOTALS: PROOF_TOTALS });

  // (A) GREY WHILE THE FIRST STEP IS ILLEGAL, and it says which graphic and why. The later step
  // is illegal too and that is deliberately NOT what decides: a walk's later steps are routinely
  // illegal at the moment the first one is pressed.
  expect(measured.greyed).toBe('“Votes board” is not on air');

  // (B) The first step goes on the press, alone — one row, on the graphic the step names.
  expect(measured.pressEvents).toEqual(['Votes board:reveal']);

  // (C) THE WIRE IS THE BASELINE. This is the property that makes the hosted page a MULTI-OPERATOR
  // surface rather than one operator's copy: the delayed +1 counts from the figure the wire is
  // carrying at the moment it fires, so a second phone's press is not overwritten. Resolved from
  // the cue instead — which is what a surface that captured its values at the press would do — the
  // same step sends 1 and the board goes backwards on air.
  expect(parseInt(measured.cueF5 || '0', 10), 'the fixture cue starts at zero, so the two readings differ').toBe(0);
  expect(measured.wiredF5).toBe('5');
  expect(measured.coldF5).toBe('1');
  // …and the moved figure is mirrored back at the cue that is on air, which is what the page
  // stages into the SHARED buffer so every open page counts from it and ⟳ TAKE cannot regress it.
  expect(measured.wiredMirror).toEqual(['Totals board:its cue:5']);

  // (D) A DROPPED STEP IS DROPPED ALONE (§6b): the +1 beside it lands, and the feed names the step
  // that did not apply, the control it belongs to and why — rather than leaving an operator to
  // notice that one of two things quietly did not happen.
  expect(measured.dropProceeded).toEqual(['Totals board:plus1']);
  expect(measured.dropSentences).toHaveLength(1);
  expect(measured.dropSentences[0]).toContain('“Reveal + points” skipped');
  expect(measured.dropSentences[0]).toContain('no arrow out of “Votes board”');
  // The note is filed against the graphic it names, so the feed's own column agrees with it.
  expect(measured.dropGraphics).toEqual(['Votes board']);

  // (E) A PRESS SEES ITS OWN EARLIER STEPS. The take airs the board and the +1 that follows it in
  // the same press goes — nothing is dropped, and the figure is mirrored at the cue the take just
  // put up rather than at whatever was there before.
  expect(measured.walkDropped, 'a step must not be refused by a take earlier in its own press').toBe(0);
  expect(measured.walkWire).toEqual(['update+play+cue', 'event']);
  expect(measured.walkMirror).toEqual(['its cue:1']);

  // (F) A BATCH NEVER HOLDS PART OF A STEP. Three takes are nine items, over the eight
  // `control_send_many` accepts, so they go in two calls — and the split falls between takes. Cut
  // at the raw item count instead, the third take's `cue` row would sit alone in the second batch:
  // every caller stops at the first refusal, so that graphic would be playing in on air with no
  // ON AIR marker, no entry in `liveCue` and nothing able to take it off.
  expect(measured.topBatches).toEqual([
    'update+play+cue+update+play+cue',
    'update+play+cue',
  ]);
});

test('a bound field on the hosted page reads the tree, and a press moves the value rather than the field', async ({
  page,
}) => {
  // AC-7's hosted half. This page cannot be mounted by an offline spec (it needs a configured
  // backend), so what the merge gate can hold is its RESOLUTION over the bytes a slug can reach:
  // the published panel and cues, plus the production tree and bindings `control_data_by_slug`
  // hands it (migration 0060). Those are the four inputs `src/control/hostedCombine.ts` takes,
  // and they are what the page hands the shared resolver - the same fence HG put the combined
  // controls behind.
  test.setTimeout(120_000);
  await importProofCase(page);

  const measured = await page.evaluate(async ({ VOTES, TOTALS }) => {
    const shows = await import('/src/model/shows.ts');
    const { buildPanelSpec, buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { readPublishedProfile } = await import('/src/model/profile.ts');
    const { hostedPoolMachines, hostedCombineNow, hostedCombineWorld, hostedCueValues } =
      await import('/src/control/hostedCombine.ts');
    const { resolveBindings } = await import('/src/model/productionData.ts');
    const { resolveCombineSend } = await import('/src/control/combineSend.ts');
    const { planCombine } = await import('/src/control/combine.ts');

    const show = shows.loadShows().find((s) => s.graphics.some((g) => g.name === VOTES))!;
    const panel = buildPanelSpec(show);
    const payload = await buildOutputPayload(show);
    const machines = hostedPoolMachines(panel);
    const cueOf = (graphic: string) => payload.cues.find((c) => c.graphic === graphic)!;

    // ONE VALUE, TWO GRAPHICS. The totals board shows panelist 1's points as a number (`plus1`
    // declares `adjust: { f5: 1 }`); the votes board carries the same panelist's slot. This is
    // AC-7's scenario, through the bytes rather than through a show record.
    const PATH = 'panel.katri.points';
    const bindings = { [TOTALS]: { f5: PATH }, [VOTES]: { f5: PATH } };
    const tree = { panel: { katri: { points: 4 } } };
    const resolved = resolveBindings(tree, bindings);

    const base = {
      panel,
      cues: payload.cues,
      staged: {} as Record<string, Record<string, string>>,
      profile: readPublishedProfile(null),
      liveCue: { [VOTES]: cueOf(VOTES).id, [TOTALS]: cueOf(TOTALS).id },
      live: { [VOTES]: {}, [TOTALS]: {} },
      // The WIRE deliberately disagrees with the tree here. A bound field must count from the
      // tree: the wire is only the tree's last resolution, and a value the operator has since
      // moved on the Data tab would otherwise be counted from a stale row.
      aired: { [TOTALS]: { f5: '99' } } as Record<string, Record<string, string>>,
      bindings,
      resolved,
    };
    const unbound = { ...base, bindings: {}, resolved: {} };

    const plus = (n: number) => ({ kind: 'event' as const, graphic: TOTALS, control: `plus${n}` });
    const send = (at: typeof base, steps: ReturnType<typeof plus>[]) =>
      resolveCombineSend(
        planCombine({ id: 'c', name: 'press', steps }, new Set<number>()),
        hostedCombineNow(machines, at),
        hostedCombineWorld(machines, at),
      );

    const boundPress = send(base, [plus(1)]);
    const unboundPress = send(unbound, [plus(1)]);
    // Two presses of the SAME shared value in one press. The chain is by PATH, so the second
    // counts from what the first wrote rather than from the tree both started at.
    const twice = send(base, [plus(1), plus(1)]);
    // An unbound field on a graphic that has OTHER bound fields is untouched: `plus2` moves f6,
    // which nothing binds.
    const mixed = send(base, [{ kind: 'event' as const, graphic: TOTALS, control: 'plus2' }]);

    const msgOf = (item: { msg: unknown }) => item.msg as { t: string; event?: string; payload?: Record<string, string> };
    return {
      // What the tree says every bound graphic is showing - one value, two graphics.
      resolvedBoth: [resolved[TOTALS]?.f5, resolved[VOTES]?.f5],
      boundAnswer: hostedCombineWorld(machines, base).bound(TOTALS, 'f5'),
      unboundAnswer: hostedCombineWorld(machines, base).bound(TOTALS, 'f6'),
      // A bound press: a bare event on the wire, and the figure as a TREE write.
      boundWire: boundPress.steps.flat().map((i) => `${i.graphic}:${msgOf(i).event}:${JSON.stringify(msgOf(i).payload ?? null)}`),
      boundTree: boundPress.tree,
      boundMirrors: boundPress.mirrors.length,
      // The same control with nothing bound is byte for byte what it always was.
      unboundWire: unboundPress.steps.flat().map((i) => `${i.graphic}:${msgOf(i).event}:${JSON.stringify(msgOf(i).payload ?? null)}`),
      unboundTree: unboundPress.tree.length,
      unboundMirrors: unboundPress.mirrors.map((m) => `${m.cueId === cueOf(TOTALS).id ? 'its cue' : m.cueId}:${m.values.f5}`),
      twiceTree: twice.tree.map((w) => w.text),
      mixedTree: mixed.tree.length,
      mixedWire: mixed.steps.flat().map((i) => JSON.stringify(msgOf(i).payload ?? null)),
      // What a TAKE of the totals board would send, with the cue's own value, a staged edit and
      // the tree all in play.
      takeValues: hostedCueValues(cueOf(TOTALS), { [TOTALS]: { f5: '7', f0: 'Katri' } }, resolved).f5,
      takeStaged: hostedCueValues(cueOf(TOTALS), { [TOTALS]: { f5: '7', f0: 'Katri' } }, resolved).f0,
      cueF5: cueOf(TOTALS).values.f5 ?? '',
    };
  }, { VOTES: PROOF_VOTES, TOTALS: PROOF_TOTALS });

  // ONE VALUE, EVERY GRAPHIC BOUND TO IT. This is the whole claim of AC-7, and it is answered
  // before any press: both graphics resolve the same figure from the same path.
  expect(measured.resolvedBoth).toEqual(['4', '4']);
  expect(measured.boundAnswer).toEqual({ path: 'panel.katri.points', current: '4' });
  expect(measured.unboundAnswer).toBe(null);

  // THE PRESS MOVES THE VALUE, NOT THE FIELD. The event still fires - the machine's own arrow is
  // what plays the point animation - but it rides bare, because the figure is not this graphic's
  // to carry. It counts from the TREE (4), never from the wire (99) and never from the cue (0).
  expect(measured.boundWire).toEqual(['Totals board:plus1:null']);
  expect(measured.boundTree).toEqual([{ path: 'panel.katri.points', text: '5', verb: 'adjust' }]);
  // Nothing is mirrored into a cue: a bound field is never a cue value (plan §2.7), so there is
  // no stored figure left for the next Take to regress to.
  expect(measured.boundMirrors).toBe(0);

  // AN UNBOUND FIELD IS UNCHANGED, which is the other half of the acceptance: the figure rides as
  // the event's payload, counted from the wire, and mirrored back at the cue on air.
  expect(measured.cueF5).toBe('0');
  expect(measured.unboundWire).toEqual(['Totals board:plus1:{"f5":"100"}']);
  expect(measured.unboundTree).toBe(0);
  expect(measured.unboundMirrors).toEqual(['its cue:100']);

  // TWO PRESSES OF ONE SHARED VALUE CHAIN BY PATH. Two graphics bound to one figure are one
  // figure: "+1 here, +1 there" in a single press has to land on 6, not twice on 5.
  expect(measured.twiceTree).toEqual(['5', '6']);

  // A control moving an UNBOUND field of a graphic that binds others is untouched.
  expect(measured.mixedTree).toBe(0);
  expect(measured.mixedWire).toEqual(['{"f6":"1"}']);

  // AND THE TAKE CANNOT REGRESS IT. The cue says 0 and a second operator has staged 7; the tree
  // says 4, and that is what a Take sends. Without this the page's own ± press was undone by the
  // very next Take - the trap §2.7 exists to close, on the surface the show is run from.
  expect(measured.takeValues).toBe('4');
  // …and staging still wins for every field the production has NOT bound.
  expect(measured.takeStaged).toBe('Katri');
});

test('the hosted page reads the SPACE mode the in-app page stores: one key per browser, the default when unset', async ({
  page,
}) => {
  // The two SPACE modes (docs/PLAYOUT_DASHBOARD.md §2f) are one setting on one machine: the
  // hosted page and the in-app page share the browser's prefs, so an operator who ticked the box
  // on one finds it ticked when the other next opens. This page cannot be mounted offline, so
  // what the merge gate holds is the CONTRACT it reads - a device-level preference beside the
  // other workflow defaults, the two words, and that an unknown value is the default rather than
  // a crash. The hosted page's own keys in both modes are walked with a real backend in
  // e2e/configured/hosted-space-modes.spec.ts.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const read = await page.evaluate(async () => {
    const { loadPrefs, savePrefs } = await import('/src/model/prefs.ts');
    const { asSpaceMode } = await import('/src/control/spaceMode.ts');
    const unset = asSpaceMode(loadPrefs().spaceMode);
    savePrefs({ spaceMode: 'preview-then-take' });
    const set = asSpaceMode(loadPrefs().spaceMode);
    // A value from an older or newer build than this one: the default, never a crash.
    savePrefs({ spaceMode: 'something-older-or-newer' as never });
    const unknown = asSpaceMode(loadPrefs().spaceMode);
    savePrefs({ spaceMode: 'take' });
    return { unset, set, unknown };
  });
  expect(read).toEqual({ unset: 'take', set: 'preview-then-take', unknown: 'take' });
});

// ── » NEXT GREYS AND ✎ UPDATE NAMES WHAT IT KEEPS, on the hosted page too (g2 handoff, "Left,
// and why": "HostedControlPage has the same Next and Update verbs... so the hosted page does not
// grey Next or name kept states yet"). `canAdvance` and `movedStateNames` (controlModel.ts) are
// the ONE answer both dashboards read for these two questions; the hosted page could not be left
// asking a different one without an operator reading a different truth depending which device
// they picked up.
//
// The page itself cannot be mounted offline (it needs a configured backend, docs/CONTROL_LAYER.md
// step 9), so this spec pins the two things an offline run can: that the page's OWN SOURCE calls
// both functions on the Next button's `disabled` and the Update button's title exactly as
// ProductionPage does, and that the two functions themselves grey the right waypoint and name the
// right state — over a small hand-authored machine, so the answer is unambiguous rather than
// depending on a real SVG's exact state ids.

test('HostedControlPage wires » Next and ✎ Update to canAdvance and movedStateNames, like the dashboard', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/components/HostedControlPage.tsx', import.meta.url), 'utf8');
  // The Next button greys on `!nextMoves` too, not on `layerLive` alone - that bare condition is
  // exactly what let a press log "Next step" while a quiz's Reveal sat still.
  expect(src).toContain('disabled={!layerLive || !nextMoves}');
  expect(src).toContain('const nextMoves = !!selectedGraphic && canAdvance(');
  // Update's title names what it would keep, the same sentence ProductionPage's verb bar uses.
  expect(src).toContain('keptStates ? `Sends the values. Stays on ${keptStates}.`');
  expect(src).toContain('movedStateNames(');
});

test('canAdvance greys past the last waypoint, and movedStateNames names only a state Update would actually keep', async ({
  page,
}) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const measured = await page.evaluate(async () => {
    const { canAdvance, movedStateNames, machineStateNames } = await import('/src/control/controlModel.ts');

    // A four-waypoint main group standing in for a quiz's walk - Question, Locked in, Reveal,
    // then the authored Out step (Exit). `ensureLifecycleEdges` fills a lifecycle `stop` edge
    // between the last two waypoints of any real graphic's machine, never an OPERATOR one, so
    // the boundary case below (no authored arrow out of Reveal) is exactly what a real quiz's
    // last step leaves canAdvance looking at.
    const js = `var NOACG_ANIM = ${JSON.stringify({
      version: 2,
      root: '#stage',
      speed: 1,
      steps: [
        { name: 'Question', duration: 0.4, ease: 'power2.out', layers: {} },
        { name: 'Locked in', duration: 0.4, ease: 'power2.out', layers: {} },
        { name: 'Reveal', duration: 0.4, ease: 'power2.out', layers: {} },
        { name: 'Exit', duration: 0.4, ease: 'power2.out', layers: {} },
      ],
      machine: {
        groups: [
          {
            id: 'main',
            initial: 'off',
            defaultPath: ['question', 'locked', 'reveal', 'exit'],
            states: [
              { id: 'off', name: 'Off' },
              { id: 'question', name: 'Question' },
              { id: 'locked', name: 'Locked in' },
              { id: 'reveal', name: 'Reveal' },
              { id: 'exit', name: 'Exit' },
            ],
            transitions: [
              { trigger: 'operator', event: 'lock', from: 'question', to: 'locked' },
              { trigger: 'operator', event: 'reveal', from: 'locked', to: 'reveal' },
            ],
          },
        ],
      },
    })};`;

    const names = machineStateNames(js);
    const at = (id: string) => ({ groups: { main: id } });
    return {
      questionAdvances: canAdvance(js, at('question')),
      lockedAdvances: canAdvance(js, at('locked')),
      revealAdvances: canAdvance(js, at('reveal')),
      revealKeeps: movedStateNames(js, names, at('reveal')),
      questionKeeps: movedStateNames(js, names, at('question')),
      nothingReportedAdvances: canAdvance(js, null),
    };
  });

  // » Next moves the graphic on every waypoint but the last: Reveal has no authored arrow into
  // the exit, so it greys - exactly as the dashboard's `verb-next` does on a quiz's Reveal.
  expect(measured.questionAdvances).toBe(true);
  expect(measured.lockedAdvances).toBe(true);
  expect(measured.revealAdvances).toBe(false);
  // ✎ Update keeps whatever the graphic has moved into since Take, in the author's own words.
  expect(measured.revealKeeps).toEqual(['Reveal']);
  // …and nothing is "kept" at the state a Take leaves it on - there is nothing yet for Update to
  // undo, so the note has nothing to say.
  expect(measured.questionKeeps).toEqual([]);
  expect(measured.nothingReportedAdvances).toBe(true);
});
