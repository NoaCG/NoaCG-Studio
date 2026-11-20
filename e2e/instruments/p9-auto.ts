// PHASE 9 CLOUD, dry runs of checklist steps 11 and 12 on hosted staging (not for main): with
// auto_publish and partial_writes switched ON in staging only, after both state functions report
// installed. Records what the production page's light said and when, and what the outputs held.
import { test, type Page } from '@playwright/test';
import { installDoor } from '../_door';
import { bootstrapGraphic } from '../_create';
import { publishProduction } from '../_publish';
import { setSwitch } from '../configured/_five';
import { clearPublishedShows, readyOf, signIn, unpublishForCleanup, wipeMyGraphics, SERVICE_ROLE_KEY, SUPABASE_URL } from '../configured/_helpers';
import { admitStaging, emit, expect, readSwitches, restoreSwitches, SHARD1, shot, states } from './_p9';

test.describe.configure({ retries: 0 });

const SCOREBUG = 'House Scorebug';
const STRAP = 'Hairline';

async function libraryGraphic(page: Page, name: string): Promise<void> {
  await bootstrapGraphic(page, { name });
  expect(
    await page.evaluate(async () => {
      const { createGraphic } = await __noacgImport('/src/model/library.ts');
      const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
      const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
      const { template } = useTemplateStore.getState();
      const { error } = createGraphic(template, { name: template.name });
      return error ?? (await commitDurableWrites());
    }),
  ).toBeFalsy();
}

async function editInLibrary(page: Page, showId: string, graphic: string, note: string): Promise<boolean> {
  return page.evaluate(
    async ([id, name, comment]) => {
      const { loadShows, updateCopyFromLibrary } = await __noacgImport('/src/model/shows.ts');
      const { loadGraphics, newerLibraryDesign, resolveSavedGraphicDoc, updateGraphic } = await __noacgImport('/src/model/library.ts');
      const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
      const pooled = loadShows().find((s) => s.id === id)?.graphics.find((g) => g.name === name);
      const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
      if (!pooled || !doc) return false;
      const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* ${comment} */` } });
      if (error) return false;
      const newer = newerLibraryDesign(pooled, loadGraphics());
      if (!newer) return false;
      const updated = updateCopyFromLibrary(id, pooled.id, newer, pooled.savedAt);
      return !updated.error && !(await commitDurableWrites());
    },
    [showId, graphic, note] as [string, string, string],
  );
}

const service = (path: string) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } }).then((r) => r.json());

async function server(showId: string) {
  const rows = await service(`control_shows?id=eq.${showId}&select=published_rev,output`);
  const output = rows[0]?.output as { ver?: { n: number }; cues?: { label: string; values?: Record<string, string> }[]; graphics?: { key: string }[] } | undefined;
  return { published: rows[0]?.published_rev ?? null, n: output?.ver?.n ?? null, labels: (output?.cues ?? []).map((c) => c.label), text: JSON.stringify(output?.cues ?? []), graphics: (output?.graphics ?? []).map((g) => g.key) };
}

/** Record every change of the production page's light: tone and text, with a timestamp. */
async function watchLight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __p9light?: { t: number; tone: string | null; text: string }[]; __p9timer?: number };
    w.__p9light = [];
    let last = '';
    w.__p9timer = window.setInterval(() => {
      const el = document.querySelector('[data-testid="production-status"]');
      const tone = el?.getAttribute('data-tone') ?? null;
      const text = (el?.textContent ?? '').trim().slice(0, 160);
      const key = `${tone}|${text}`;
      if (key !== last) { last = key; w.__p9light!.push({ t: Date.now(), tone, text }); }
    }, 50);
  });
}
const light = (page: Page) => page.evaluate(() => (window as unknown as { __p9light?: { t: number; tone: string | null; text: string }[] }).__p9light ?? []);
const holds = async (out: Page) => ((await readyOf(out)) as { v?: { n: number } } | null)?.v?.n ?? 0;
const outputUrl = (slug: string, name: string, extra = '') => `/output?production=${encodeURIComponent(slug)}&destination=browser&name=${encodeURIComponent(name)}&debug=1${extra}`;
const selectCue = async (page: Page, hasText: string) => page.getByTestId('select-cue').filter({ hasText }).first().click({ timeout: 30_000 });

if (!SHARD1) test('idle shard', () => {});
else
  test('steps 11 and 12: automatic updates and a design change on air', async ({ page, browser }) => {
    test.setTimeout(20 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    const result: Record<string, unknown> = {};
    try {
      await installDoor(page.context());
      await signIn(page);
      await page.keyboard.press('Escape');
      const st = await states(page);
      emit('states', st);
      const installed = (st.auto as { installed?: boolean })?.installed === true && (st.partial as { installed?: boolean })?.installed === true;
      if (!installed) throw new Error(`not installed on staging: ${JSON.stringify(st)}`);
      await setSwitch('production_copies', true);
      await setSwitch('auto_publish', false);
      await setSwitch('partial_writes', false);
      await clearPublishedShows(page);
      await wipeMyGraphics(page);
      await libraryGraphic(page, SCOREBUG);
      await libraryGraphic(page, STRAP);
      const showId = await page.evaluate(
        async ([showName, names]) => {
          const { createShowNamedChecked, addGraphicToShow } = await __noacgImport('/src/model/shows.ts');
          const { loadGraphics } = await __noacgImport('/src/model/library.ts');
          const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
          const { show, error } = createShowNamedChecked(showName);
          if (error) throw new Error(error);
          for (const name of names) {
            const doc = loadGraphics().find((g) => g.name === name)!;
            const added = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
            if (added.error) throw new Error(added.error);
          }
          const failure = await commitDurableWrites();
          if (failure) throw new Error(failure);
          return show.id;
        },
        [`P9 auto ${Date.now()}`, [SCOREBUG, STRAP]] as [string, string[]],
      );
      await page.goto(`/app#/production/${showId}`);
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
      await publishProduction(page);
      const slug = await page.evaluate(async (id) => {
        const { loadShows } = await __noacgImport('/src/model/shows.ts');
        return loadShows().find((x) => x.id === id)?.outputSlug ?? '';
      }, showId);

      // Outputs opened BEFORE the switch: one of this build, one behaving as an older build.
      const viewers = await browser.newContext();
      await installDoor(viewers);
      const air = await viewers.newPage();
      await air.goto(outputUrl(slug, 'Desk A'));
      const old = await viewers.newPage();
      await old.goto(outputUrl(slug, 'Old', '&oldbuild=1'));
      await expect.poll(() => holds(air), { timeout: 90_000 }).toBeGreaterThan(0);
      await expect.poll(() => holds(old), { timeout: 90_000 }).toBeGreaterThan(0);

      // Switch on in staging, with the page open; the page reads the switch every 30 s.
      await setSwitch('partial_writes', true);
      await setSwitch('auto_publish', true);
      const switchedAt = Date.now();
      emit('states-on', await states(page));
      await watchLight(page);
      await expect.poll(async () => page.getByTestId('production-status').textContent(), { timeout: 60_000 }).toContain('Reload Old when nothing is on air').catch(() => undefined);
      result.oldNamedAfterMs = (await page.getByTestId('production-status').textContent())?.includes('Reload Old') ? Date.now() - switchedAt : null;
      await page.waitForTimeout(Math.max(0, 35_000 - (Date.now() - switchedAt)));
      await shot(page, 'step11-after-switch-on');

      // 11.1: edits with no press.
      const changes: Record<string, unknown>[] = [];
      const measure = async (name: string, act: () => Promise<void>, landed: (s: Awaited<ReturnType<typeof server>>) => boolean) => {
        const n0 = (await server(showId)).n ?? 0;
        const t0 = Date.now();
        await act();
        let serverMs: number | null = null, airMs: number | null = null, oldMs: number | null = null;
        const end = t0 + 90_000;
        while (Date.now() < end && (serverMs === null || airMs === null || oldMs === null)) {
          const s = await server(showId);
          if (serverMs === null && landed(s) && (s.n ?? 0) > n0) serverMs = Date.now() - t0;
          if (serverMs !== null) {
            if (airMs === null && (await holds(air)) === s.n) airMs = Date.now() - t0;
            if (oldMs === null && (await holds(old)) === s.n) oldMs = Date.now() - t0;
          }
          await page.waitForTimeout(100);
        }
        const seen = (await light(page)).filter((x) => x.t >= t0).map((x) => ({ ms: x.t - t0, tone: x.tone, text: x.text }));
        const pressVisible = await page.getByTestId('production-publish-changes').count();
        changes.push({ name, serverMs, deskAMs: airMs, oldMs, light: seen, publishChangesButton: pressVisible });
      };
      await measure(
        'cue text typed',
        async () => {
          await selectCue(page, STRAP);
          const box = page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').first();
          await box.selectText();
          await page.keyboard.type('P9 typed text', { delay: 40 });
        },
        (s) => s.text.includes('P9 typed text'),
      );
      await shot(page, 'step11-after-typed');
      const edit = (change: string, arg: string) =>
        page.evaluate(async ({ id, change, arg }) => {
          const shows = await __noacgImport('/src/model/shows.ts');
          const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
          const s = shows.loadShows().find((x) => x.id === id)!;
          if (change === 'remove-graphic') shows.removeShowGraphic(id, s.graphics.find((g) => g.name === arg)!.id);
          if (change === 'add-graphic') {
            const added = shows.addGraphicToShow(id, { ...s.graphics.find((g) => g.name === 'Hairline')!.template, name: arg });
            if (added.error) throw new Error(added.error);
          }
          if (change === 'label') shows.updateShowCue(id, (s.cues ?? [])[0].id, { label: arg });
          const failure = await commitDurableWrites();
          if (failure) throw new Error(failure);
        }, { id: showId, change, arg });
      await measure('graphic added', () => edit('add-graphic', 'P9 second strap'), (s) => s.graphics.includes('P9 second strap'));
      await measure('graphic removed', () => edit('remove-graphic', 'P9 second strap'), (s) => !s.graphics.includes('P9 second strap'));
      result.changes = changes;
      result.statusAfterEdits = { tone: await page.getByTestId('production-status').getAttribute('data-tone'), text: await page.getByTestId('production-status').textContent() };
      await shot(page, 'step11-after-edits');

      // 11.2: close the page with a change not yet published; another computer opens it.
      await page.route('**/rest/v1/control_shows**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
      await page.route('**/rest/v1/rpc/control_publish**', (r) => r.abort());
      await edit('label', 'P9 closed unpublished');
      await page.waitForTimeout(5_000);
      const heldBack = !(await server(showId)).labels.includes('P9 closed unpublished');
      await page.close();
      const other = await browser.newContext();
      await installDoor(other);
      const page2 = await other.newPage();
      await signIn(page2);
      await page2.keyboard.press('Escape').catch(() => undefined);
      const t2 = Date.now();
      await page2.goto(`/app#/production/${showId}`);
      await expect(page2.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
      let publishedMs: number | null = null;
      await expect
        .poll(async () => (await server(showId)).labels.includes('P9 closed unpublished'), { timeout: 120_000, intervals: [500] })
        .toBe(true)
        .then(() => (publishedMs = Date.now() - t2))
        .catch(() => undefined);
      result.closedUnpublished = { heldBackBeforeClose: heldBack, publishedFromOtherComputerMs: publishedMs };

      // 11.3: which outputs the page asks to reload.
      await watchLight(page2);
      await page2.waitForTimeout(5_000);
      const status2 = (await page2.getByTestId('production-status').textContent()) ?? '';
      await page2.getByTestId('production-status').click();
      const panelText = (await page2.getByTestId('production-status-panel').textContent().catch(() => '')) ?? '';
      await shot(page2, 'step11-reload-old-output');
      await page2.keyboard.press('Escape');
      result.reload = { status: status2, oldNamed: /Reload Old when nothing is on air/.test(status2 + panelText), deskANamed: /Reload Desk A/.test(status2 + panelText), panel: panelText.slice(0, 600) };

      // 12: the scorebug's design changes while it is on air, with no press.
      await selectCue(page2, 'P9 closed unpublished');
      await page2.getByTestId('verb-take').click();
      await expect.poll(() => air.locator('body').getAttribute('data-plays'), { timeout: 30_000 }).toBe('1');
      const onAir = air.locator(`iframe[title="${SCOREBUG}"]:not([data-prepared])`);
      await onAir.evaluate((el) => el.setAttribute('data-probe', 'before'));
      const t3 = Date.now();
      const changed = await editInLibrary(page2, showId, SCOREBUG, 'p9 design change');
      let namedMs: number | null = null;
      await expect
        .poll(async () => (await page2.getByTestId('production-status').textContent()) ?? '', { timeout: 120_000, intervals: [200] })
        .toContain(`${SCOREBUG}: new design at next Take`)
        .then(() => (namedMs = Date.now() - t3))
        .catch(() => undefined);
      const tone12 = await page2.getByTestId('production-status').getAttribute('data-tone');
      const stillSameFrame = await onAir.getAttribute('data-probe').catch(() => null);
      await shot(page2, 'step12-new-design-at-next-take');
      await shot(air, 'step12-output-still-old');
      const light12 = (await light(page2)).filter((x) => x.t >= t3).map((x) => ({ ms: x.t - t3, tone: x.tone, text: x.text }));
      // Out, then Take again: the new design.
      await page2.getByTestId('verb-out').click();
      await expect.poll(async () => ((await readyOf(air)) as { chg?: unknown } | null)?.chg ?? null, { timeout: 60_000 }).toBeNull().catch(() => undefined);
      await page2.waitForTimeout(1_000);
      await selectCue(page2, 'P9 closed unpublished');
      await page2.getByTestId('verb-take').click();
      await expect.poll(() => air.locator('body').getAttribute('data-plays'), { timeout: 30_000 }).toBe('2').catch(() => undefined);
      const newOnAir = air.locator(`iframe[title="${SCOREBUG}"]:not([data-prepared])`);
      const hasNewDesign = await newOnAir
        .first()
        .evaluate((el) => {
          const doc = (el as HTMLIFrameElement).contentDocument;
          return (doc?.documentElement.outerHTML ?? (el as HTMLIFrameElement).srcdoc ?? '').includes('p9 design change');
        })
        .catch((e) => `unreadable: ${String(e).slice(0, 120)}`);
      await shot(air, 'step12-output-after-next-take');
      result.step12 = { libraryEdit: changed, namedAfterMs: namedMs, tone: tone12, frameKeptWhileOnAir: stillSameFrame === 'before', light: light12, nextTakeHasNewDesign: hasNewDesign, plays: await air.locator('body').getAttribute('data-plays') };

      await page2.getByTestId('verb-out').click().catch(() => undefined);
      await unpublishForCleanup(page2).catch(() => undefined);
      await clearPublishedShows(page2).catch(() => undefined);
      await wipeMyGraphics(page2).catch(() => undefined);
      await other.close();
      await viewers.close();
    } finally {
      emit('auto', result);
      emit('switches-after', await restoreSwitches(before));
    }
  });
