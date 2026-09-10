import { test, expect } from '@playwright/test';
import { createProject } from './_create';
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
