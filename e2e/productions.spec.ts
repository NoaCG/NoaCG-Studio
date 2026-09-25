import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootstrapGraphic, openProductionWithCurrent, openWorkingGraphicInEditor, skipOldEditor } from './_create';
import { settleDurableWrites } from './_durable';
import { outputEmbedFileName, outputEmbedHtml } from '../src/export/outputEmbed';

/** Drag cue row `from` onto row `to` — the rundown reorders by DRAG now, not by ↑/↓ buttons
 *  (docs/PLAYOUT_DASHBOARD.md §4). Playwright's dragTo drives real HTML5 drag events, which is
 *  what the row's dragstart/drop handlers listen for. */
async function dragCue(page: Page, from: number, to: number): Promise<void> {
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await rows.nth(from).dragTo(rows.nth(to));
}

// Cloud playout (docs/CLOUD_PLAYOUT.md): the Productions area + the production page's cue
// rundown + the output renderer's offline honesty. The wire paths (publish, the log, the
// hosted pages, the live renderer) are backend features covered by the maintainer's
// live-verify checklist (§8) — this suite pins everything that runs offline.

test('a production page manages cues: auto-cue on add, edit, duplicate, reorder, preview', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });

  // Add the current graphic to a new production from the editor's control panel.
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');

  // The panel links straight to the production page.
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Adding a graphic auto-created its first cue, seeded from the template's defaults (§2).
  const cueRows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cueRows).toHaveCount(1);
  await expect(cueRows.first()).toContainText('Hairline');

  // Edit the cue: label, note, and a field value.
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await expect(cueRows.first()).toContainText('Anna Andersson');
  await expect(cueRows.first()).toContainText('after the intro');

  // The LOCAL preview settles with the cue's values (debounced 350 ms; the locator retries).
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Anna Andersson');

  // A second cue on the SAME pool graphic — the point of the cue model (§2).
  await page.getByTestId('add-cue').click();
  await expect(cueRows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben Berg');

  // Reorder: Ben moves above Anna; order is the rundown.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await dragCue(page, 1, 0);
  await expect(rows.nth(0)).toContainText('Ben Berg');
  await expect(rows.nth(1)).toContainText('Anna Andersson');

  // Duplicate keeps the values and appends.
  await rows.nth(0).getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('Ben Berg copy');

  // Offline, publishing says why it cannot run — but the VERBS still work, because what they
  // drive is the local program monitor right here (docs/PLAYOUT_DASHBOARD.md §6).
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await expect(page.getByTestId('production-publish')).toBeDisabled();
  await expect(page.getByTestId('production-publish')).toHaveAttribute('title', /runs offline/);

  // The cue survives a reload (persisted on the Show record).
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
});

test('Home Productions creates a production and opens its page; removing a graphic removes its cues', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  // Save to the library so the production page's "add from library" list has a row.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Morning Show');
  await page.getByTestId('new-production').click();

  // Creating lands straight on the production page.
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('no-cues')).toBeVisible();

  // Add the saved graphic from the library; its auto-cue appears.
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(1);

  // A second cue on the same graphic, so removing the GRAPHIC is a gesture of its own: with a
  // single cue, removing that cue already takes the graphic (docs/PLAYOUT_DASHBOARD.md §5).
  await page.getByTestId('add-cue').click();
  await expect(rows).toHaveCount(2);

  // Removing the pool graphic takes its cues with it — a cue over nothing cannot air. It asks
  // twice: the rows hold values somebody typed and there is no undo behind the rundown.
  await rows.first().getByTestId('cue-menu').click();
  await page.getByTestId('delete-graphic').click();
  await expect(page.getByTestId('delete-graphic')).toContainText('Confirm?');
  await page.getByTestId('delete-graphic').click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId('no-cues')).toBeVisible();
});

test('the rundown is the only list: the last cue takes its graphic with it', async ({ page }) => {
  // docs/PLAYOUT_DASHBOARD.md §5. The layer list is gone, so a pool graphic with no cues would be
  // invisible in the rundown and still ship in the published payload — an orphan nobody could
  // reach. Removing the last cue prunes it (model/shows.ts removeShowCue).
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Only List');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();

  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(1);
  const poolCount = () =>
    page.evaluate(async () => {
      const { loadShows } = await import('/src/model/shows.ts');
      return loadShows()[0].graphics.length;
    });
  expect(await poolCount()).toBe(1);

  // The menu says what the removal will do, rather than letting it be discovered afterwards.
  await rows.first().getByTestId('cue-menu').click();
  await expect(page.getByTestId('delete-cue')).toHaveText('Remove cue and graphic');
  // With one cue there is no separate graphic removal — it would be the same gesture twice.
  await expect(page.getByTestId('delete-graphic')).toHaveCount(0);
  await page.getByTestId('delete-cue').click();

  await expect(rows).toHaveCount(0);
  await expect.poll(poolCount).toBe(0);
});

test('the LAST cue\'s ⋯ menu opens upward, inside the rundown that would otherwise clip it', async ({ page }) => {
  // The library's row menus were fixed on the 2026-08-23 owner walk ("the pop-up goes underneath
  // my view field"); this surface has the same defect and is the one an operator uses LIVE. It is
  // worse here than on Home: the rundown is its own scroll container (`.pd-cues`), so the last
  // row's menu is cut off by the LIST while it still clears the bottom of the screen — which is
  // why home/LibMenu measures against clipping ancestors and not just the viewport.
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Long Rundown');

  // Enough cues that the rundown scrolls and the last row sits at the bottom of its list.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  for (let i = 0; i < 14; i += 1) await page.getByTestId('add-cue').click();
  await expect(rows).toHaveCount(15);
  await rows.last().scrollIntoViewIfNeeded();

  await rows.last().getByTestId('cue-menu').click();
  const menu = page.getByTestId('cue-actions-menu');
  await expect(menu).toHaveAttribute('data-placement', 'up');

  // The DECISION is measured, so assert on the geometry it claims to produce as well —
  // `toBeVisible()` is blind both to a box past the fold and to one clipped by an ancestor.
  const box = (await menu.boundingBox())!;
  const list = (await page.getByTestId('cue-list').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(list.y);
  expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height);
  // And it is reachable there: a box inside the list can still sit under something. The hit
  // test is what a click would find.
  const onTop = await menu.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 8));
  });
  expect(onTop).toBe(true);

  // A row at the TOP of the list has room below it and must NOT flip — the measurement has to
  // answer both ways, or a shell hard-coded to "always up" would pass this spec too.
  // Reaching it takes ONE press with a menu already standing: the shell listens for the outside
  // press instead of covering the page with a backdrop, so it never eats the click an operator
  // aimed at the next cue.
  await rows.first().scrollIntoViewIfNeeded();
  await rows.first().getByTestId('cue-menu').click();
  await expect(menu).toHaveCount(1);
  await expect(menu).toHaveAttribute('data-placement', 'down');
});

test('the links panel stays whole on a short screen — it caps and scrolls itself', async ({ page }) => {
  // The other hand-rolled popover on this page. It hangs off a header pinned to the TOP, so the
  // flip is never the answer here: what fell off the bottom was the panel's own tail (the
  // Publish/Unpublish row), because it had no height cap at all — while §1 of the dashboard's
  // layout rules already said this popover scrolls itself when tall.
  // 560px is a 1366×768 laptop once Windows and the browser have taken their share.
  await page.setViewportSize({ width: 1280, height: 560 });
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Short Screen');

  // Publishing is offline here, so seed every slug a real publish mints. ALL of them: the panel
  // is only over-tall once the audience plane is on it (six rows plus the publish pair), and
  // seeding just the hosted/output pair measures a panel that always fitted.
  await page.evaluate(async () => {
    const { loadShows, setShowHostedSlug, setShowOutputSlug, setShowAudienceSlugs } = await import(
      '/src/model/shows.ts'
    );
    const id = loadShows()[0].id;
    setShowHostedSlug(id, 'demo-slug');
    setShowOutputSlug(id, 'demo-output');
    setShowAudienceSlugs(id, { joinSlug: 'demo-join', presenterSlug: 'demo-presenter' });
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();

  await page.getByTestId('production-links-toggle').click();
  const panel = page.getByTestId('production-links');
  await expect(panel).toBeVisible();

  // Open every row's ▸ explanation. Collapsed, the panel was never the problem; the tall case is
  // exactly the one somebody reaches when they do not yet know which link is which.
  const toggles = page.locator('.prod-link-help-toggle');
  for (let i = 0; i < (await toggles.count()); i += 1) {
    const toggle = toggles.nth(i);
    if ((await toggle.textContent()) === '▸') await toggle.click();
  }

  const box = (await panel.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(560);
  // Nothing was dropped to achieve that: the tail is inside the panel, one scroll away.
  await page.getByTestId('production-republish').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('production-republish')).toBeVisible();

  // Escape closes it. Worth pinning HERE because this popover's other closing routes are only
  // reachable against a real backend (the e2e/configured specs dismiss it after a live publish),
  // and nothing in CI runs those — so without this the shell could stop closing `pd-links` and
  // every gate would still be green.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('the production page fits one 1080p screen, and the preview takes only the room left over', async ({ page }) => {
  // Acceptance round 2, 2026-08-05: "the preview video is way too big — I want the whole page
  // to fit on one screen". Fitting the preview on WIDTH alone gave it 862px of a 1027px column
  // on a full-HD screen, so the verbs and the cue editor sat below the fold.
  //
  // This is the SIMPLE case, and it stays the simple case: a two-field lower third fits one
  // 1080p screen with nothing scrolling at all. It is NOT a rule that the page may never
  // scroll — a graphic with many fields is allowed to make it long, and the monitor cap is
  // what buys that room back (docs/PLAYOUT_DASHBOARD.md §2, and the scroll-model specs in
  // production-controls.spec.ts). What this pins is that the simple case never has to.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'One Screen');
  await expect(page.locator('.pd-pvw .pd-frame')).toBeVisible();

  const fit = await page.evaluate(() => {
    const main = document.querySelector('.pd-main')!;
    const frame = document.querySelector('.pd-pvw .pd-frame')!.getBoundingClientRect();
    const log = document.querySelector('[data-testid="action-log"]')!.getBoundingClientRect();
    return {
      // Nothing scrolls here: not the column (which is never a scroller now), not the document.
      columnOverflow: main.scrollHeight - main.clientHeight,
      documentOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // The LAST thing on the page is above the fold — that is what "one screen" means.
      lastRowBottom: Math.round(log.bottom),
      viewportHeight: window.innerHeight,
      // The frame keeps the graphic's own aspect ratio, so nothing is cropped or stretched.
      frameRatio: +(frame.width / frame.height).toFixed(2),
      frameHeight: Math.round(frame.height),
    };
  });
  expect(fit.columnOverflow).toBe(0);
  expect(fit.documentOverflow).toBe(0);
  expect(fit.lastRowBottom).toBeLessThanOrEqual(fit.viewportHeight);
  expect(fit.frameRatio).toBe(1.78);
  // Big enough to judge a graphic by, small enough to leave the operator's controls on screen —
  // and since 2026-08-19 that upper bound is the §2 monitor cap, not "whatever is left over".
  //
  // THE BOUNDS MOVED UP ON 2026-08-21, because the owner read this exact size and rejected what
  // they pinned: at 1920x1080 a flat 26vh left "too much empty room at the bottom and the
  // monitors are unnecessarily small". The cap now grows with the window from the 768px floor of
  // the minimum supported one, so a full-HD screen gets about a third more picture. The LOWER
  // bound is what pins that fix — 27% of 1080 is 292px, and anything at or under it is the old
  // cap back again.
  expect(fit.frameHeight).toBeGreaterThan(300);
  expect(fit.frameHeight).toBeLessThanOrEqual(fit.viewportHeight * 0.36);
});

test('the /output page answers honestly offline and builds a stage from a payload', async ({ page }) => {
  // The offline build: the renderer names its state instead of spinning (never on real air —
  // this state only exists for a wrong URL or a build with no backend).
  await page.goto('/output?production=abc&debug=1');
  await expect(page.locator('body')).toContainText('Output not available');
  await expect(page.locator('body')).toContainText('runs offline');
  await page.goto('/output');
  await expect(page.locator('body')).toContainText('missing its');

  // The STAGE is testable without a backend: build it from a payload in the page context —
  // one sandboxed iframe per graphic, resolution-exact, scaled to the viewport. Commands are
  // applied IMMEDIATELY after creation, before any iframe can have loaded: the stage must
  // queue them until each document's listener exists, because a postMessage into an unloaded
  // srcdoc is silently lost — exactly what ate the boot-recovery burst on a renderer refresh.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { createOutputStage } = await import('/src/output/stage.ts');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const graphic = (key: string) => ({
      key,
      html: `<div id="f0"></div>`,
      css: 'body { margin: 0; }',
      js: 'function update(d){ document.getElementById("f0").textContent = JSON.parse(d).f0 || ""; } function play(){} function stop(){}',
      assets: [],
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      fps: 50,
    });
    const stage = createOutputStage(root, {
      v: 1,
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      graphics: [graphic('Lower third'), graphic('Ticker')],
      cues: [],
    });
    // The recovery pattern, fired before load: data half, then visual half.
    stage.apply('Lower third', { t: 'update', data: { f0: 'Recovered after refresh' } });
    stage.apply('Lower third', { t: 'play' });
    const iframes = [...root.querySelectorAll('iframe')];
    return {
      graphics: stage.graphics,
      count: iframes.length,
      sandboxes: iframes.map((f) => f.getAttribute('sandbox')),
      widths: iframes.map((f) => f.style.width),
      titles: iframes.map((f) => f.getAttribute('title')),
      zIndexes: iframes.map((f) => f.style.zIndex),
      transform: (root.firstElementChild as HTMLElement).style.transform,
      transparent: (root.firstElementChild as HTMLElement).style.background,
    };
  });
  expect(result.graphics).toEqual(['Lower third', 'Ticker']);
  expect(result.count).toBe(2);
  // The sandbox posture is load-bearing (published template code must never reach the origin).
  expect(result.sandboxes).toEqual(['allow-scripts', 'allow-scripts']);
  expect(result.widths).toEqual(['1920px', '1920px']);
  // Payload order IS the layer stack, stated as a z-index rather than left to append order:
  // index 0 furthest back, the last entry on top.
  expect(result.titles).toEqual(['Lower third', 'Ticker']);
  expect(result.zIndexes).toEqual(['1', '2']);
  expect(result.transform).toContain('scale(');
  expect(result.transparent).toBe('transparent');
  // The pre-load commands flushed into the document once it loaded — the queued update landed.
  await expect(page.frameLocator('iframe[title="Lower third"]').locator('#f0')).toHaveText('Recovered after refresh');
});

test('a dropped recovery RPC is retried, and only an answer is ever concluded from', async ({ page }) => {
  // THE RULE THE RENDERER'S BOOT AND THE HOSTED RECEIVER BOTH RUN ON (docs/CONTROL_LAYER.md):
  // an RPC either answered - possibly with nothing - or failed, and the two must not collapse.
  // The renderer used to resolve its production ONCE and read a dropped request as "no such
  // production", painting its wrong-URL card over a live airing; the catch-up read the same
  // failure as "nothing was missed". Both now retry, and the walk they retry with is pure, so
  // it can be measured here rather than only against a real backend.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { untilAnswered } = await import('/src/control/hostedControl.ts');

    // A failure is retried until it answers, backing off by doubling.
    const waits: number[] = [];
    let calls = 0;
    const answer = await untilAnswered<string | null>(
      async () => (++calls < 4 ? { ok: false, error: 'dropped' } : { ok: true, value: 'the show' }),
      { wait: async (ms) => void waits.push(ms) },
    );

    // The backoff has a ceiling and then keeps knocking at it - a browser source with no
    // fallback must not back off into next week.
    const capped: number[] = [];
    await untilAnswered(async () => ({ ok: false, error: 'down' }), {
      limit: 8,
      wait: async (ms) => void capped.push(ms),
    });

    // An ANSWER of nothing is the revoked capability, and that one is honoured at once.
    let asked = 0;
    const none = await untilAnswered<string | null>(
      async () => {
        asked += 1;
        return { ok: true, value: null };
      },
      { wait: async () => {} },
    );

    // A bounded caller (the catch-up, which has the report baseline to stand on) gives up and
    // says WHY, rather than handing on an empty list that reads as "nothing was missed".
    let tries = 0;
    const gaveUp = await untilAnswered(
      async () => {
        tries += 1;
        return { ok: false, error: 'log unread' };
      },
      { limit: 3, wait: async () => {} },
    );

    return { calls, answer, waits, capped, asked, none, tries, gaveUp };
  });

  expect(result.answer).toEqual({ ok: true, value: 'the show' });
  expect(result.calls, 'the two dropped requests must be asked again').toBe(4);
  expect(result.waits).toEqual([500, 1000, 2000]);
  expect(result.capped[result.capped.length - 1]).toBe(10_000);
  expect(result.none).toEqual({ ok: true, value: null });
  expect(result.asked, 'an answer is final, however empty').toBe(1);
  expect(result.tries).toBe(3);
  expect(result.gaveUp).toEqual({ ok: false, error: 'log unread' });
});


test('every graphic gets its own playout layer, typed, and it is what the output stacks', async ({ page }) => {
  skipOldEditor();
  // docs/PLAYOUT_DASHBOARD.md §5. Layers used to be DERIVED from pool position and moved with
  // ↑/↓ arrows, which made the layer an accident of ordering. They are now numbers: distinct by
  // construction from 20 up, editable, and the SAME number the export declares and the browser
  // output paints by.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Bug');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Evening News');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  const addGraphic = async (label: string) => {
    await page.getByTestId('add-graphic-pick').selectOption({ label });
    await page.getByTestId('add-graphic').click();
  };
  await addGraphic('Bug');
  await addGraphic('Anchor L3');

  // Distinct on arrival: 20, then the next free number. Nothing to repair, nothing to warn about.
  const layerOf = (name: string) =>
    page.evaluate(async (n) => {
      const { loadShows, graphicLayer } = await import('/src/model/shows.ts');
      const g = loadShows()[0].graphics.find((x: { name: string }) => x.name === n)!;
      return graphicLayer(g);
    }, name);
  expect(await layerOf('Bug')).toBe(20);
  expect(await layerOf('Anchor L3')).toBe(21);
  await expect(page.getByTestId('layer-clash')).toHaveCount(0);

  // Every RUNDOWN ROW wears its graphic's number — the only place the layer is listed now that
  // the layer chips are gone (§5).
  const rowLayers = page.getByTestId('cue-list').locator('[data-testid="cue-layer"]');
  await expect(rowLayers).toHaveCount(2);
  await expect(rowLayers.nth(0)).toHaveText('L20');
  await expect(rowLayers.nth(1)).toHaveText('L21');

  // Typing a number is the whole interaction. Selecting a cue points the editor at its graphic.
  await page.getByTestId('cue-list').locator('.pd-cue').first().getByTestId('select-cue').click();
  await page.getByTestId('graphic-layer').fill('30');
  await expect.poll(() => layerOf('Bug')).toBe(30);
  await expect(rowLayers.nth(0)).toHaveText('L30');
  // No clash, so no warning colour anywhere in the rundown.
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(0);

  // A DUPLICATE can still be typed, and then the surface says so rather than letting it be
  // found on air — with the next free number one click away.
  await page.getByTestId('graphic-layer').fill('21');
  await expect(page.getByTestId('layer-clash')).toContainText('share layer 21');
  await expect(page.getByTestId('layer-clash')).toContainText('replace each other');
  // BOTH rundown rows wear the warning colour, not only the one being edited — the operator has
  // to see which two graphics are about to replace each other.
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(2);
  await expect(rowLayers.nth(0)).toHaveAttribute('title', /Shares layer 21 with Anchor L3/);
  await page.getByTestId('layer-clash-fix').click();
  await expect(page.getByTestId('layer-clash')).toHaveCount(0);
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(0);
  expect(await layerOf('Bug')).toBe(20);

  // That number is what the PUBLISHED payload carries, and the payload's layer is what the
  // stage turns into a z-index — the two halves of "the higher number wins".
  const payload = await page.evaluate(async () => {
    const [{ buildOutputPayload }, { loadShows }] = await Promise.all([
      import('/src/control/hostedControl.ts'),
      import('/src/model/shows.ts'),
    ]);
    const p = await buildOutputPayload(loadShows()[0]);
    return p.graphics.map((g: { key: string; layer?: number }) => [g.key, g.layer]);
  });
  expect(payload).toEqual([
    ['Bug', 20],
    ['Anchor L3', 21],
  ]);
});

test('the program monitor is the real renderer, and every verb reaches it without a wire', async ({ page }) => {
  skipOldEditor();
  // The verbs work on an UNPUBLISHED production: they drive the local PROGRAM monitor, which is
  // the same createOutputStage the published output URL is built from. That is what makes the
  // whole surface provable offline — and it is why Rehearse is gone (§6): preview is local and
  // always available, so a separate practise mode was a second way to do what this already does.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await bootstrapGraphic(page, { category: 'Tickers' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Ticker crawl');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Evening News');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  for (const label of ['Anchor L3', 'Ticker crawl']) {
    await page.getByTestId('add-graphic-pick').selectOption({ label });
    await page.getByTestId('add-graphic').click();
  }

  // Unpublished: the mode says so and publishing is unavailable offline — but the verbs are
  // live, because the monitor they drive is right here. There is no rehearsal toggle to find.
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED');
  await expect(page.getByTestId('production-publish')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await expect(page.locator('[data-testid="toggle-rehearsal"]')).toHaveCount(0);

  // The monitor is the REAL renderer: one iframe per pool graphic, stacked as layers.
  await expect(page.getByTestId('program-stage').locator('iframe')).toHaveCount(2);

  const cueRows = page.getByTestId('cue-list').locator('.pd-cue');
  const takeCue = async (i: number) => {
    await cueRows.nth(i).getByTestId('select-cue').click();
    await page.getByTestId('verb-take').click();
  };

  // Take the lower third: its value reaches the monitor's own document, so this is the rendered
  // graphic, not a claim about one. The cue is NAMED too — the log reads cues by the name the
  // operator wrote, so a cue left on its default name would prove nothing.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await takeCue(0);
  await expect(page.frameLocator('[data-testid="program-stage"] iframe[title="Anchor L3"]').locator('#f0')).toHaveText(
    'Anna Andersson',
  );
  await expect(page.getByTestId('live-cue-chip')).toContainText('Anna Andersson');

  // Take the ticker: BOTH layers are up at once — the multi-layer contract.
  await takeCue(1);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Anna Andersson');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Ticker crawl');
  // Two layers up, counted off the rundown itself — one ON AIR row per live layer.
  await expect(page.getByTestId('cue-list').locator('.pd-cue.on-air')).toHaveCount(2);

  // Out takes down the SELECTED cue's layer and leaves the other one up.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue.on-air')).toHaveCount(1);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Ticker crawl');
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('Anna Andersson');

  // All out clears the frame. It lives in the HEADER, apart from the verbs, because a hand
  // reaching for Take must never land on it.
  await page.getByTestId('verb-out-all').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(page.getByTestId('cue-list').locator('.pd-cue.on-air')).toHaveCount(0);

  // The ACTION LOG recorded all of it, newest first, in the operator's own words — through the
  // same describeLogRow the wire rows go through, which is the only reason this is checkable
  // without a backend.
  const log = page.getByTestId('action-log');
  await log.locator('summary').click();
  const rows = log.getByTestId('action-log-row');
  await expect(rows.first()).toContainText('Out');
  await expect(rows.first()).toContainText('Ticker crawl');
  await expect(log).toContainText('Took “Anna Andersson”');
  await expect(log).not.toContainText('Updated 0 fields');

  // Rename a cue and take it IMMEDIATELY — no click in between to let the record catch up. The
  // verb runs in the same tick as its own draft flush, so a log reading only the stored record
  // names the cue as it was BEFORE the rename: the one moment the log is most likely to be read
  // is the one it used to get wrong.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Björn Berg');
  await page.getByTestId('verb-take').click();
  await expect(rows.first()).toContainText('Took “Björn Berg”');
});

test('the verbs answer their keyboard shortcuts, and never while a field has focus', async ({ page }) => {
  // docs/PLAYOUT_DASHBOARD.md §2: the verb bar shows the keys that fire it. SPACE is Take — and
  // the cue title and every field live on this same surface, so a space typed into a name must
  // stay a space. That guard is the whole reason this spec exists.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Keys');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // Typing into the cue title: SPACE belongs to the text, not to Take. The check is what the
  // space DID — the character arriving in the field. "Nothing went on air" would pass on its
  // first poll, before a broken guard's take could possibly have landed, so it proves nothing.
  await page.getByTestId('cue-label').click();
  await page.getByTestId('cue-label').fill('Anna');
  await page.keyboard.press('Space');
  await page.keyboard.type('Andersson');
  await expect(page.getByTestId('cue-label')).toHaveValue('Anna Andersson');

  // Focus off the fields: now SPACE takes.
  await page.locator('.pd-monitors').click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Anna Andersson');

  // And 0 plays it out again.
  await page.keyboard.press('0');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('a published production reads SHOW; an unpublished one says so and offers no rehearsal', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Evening News');
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED');
  // Unpublished says nothing about a renderer it does not have: a second "not published" beside
  // the mode chip was noise, not status.
  await expect(page.getByTestId('renderer-status')).toHaveCount(0);
  await expect(page.locator('[data-testid="toggle-rehearsal"]')).toHaveCount(0);

  // Fake a published record (the wire itself is backend-gated and lives on the live checklist).
  await page.evaluate(async () => {
    const { loadShows, setShowHostedSlug } = await import('/src/model/shows.ts');
    setShowHostedSlug(loadShows()[0].id, 'demo-slug');
  });
  // Wait for the database, not just the mirror - a reload fired now aborts the write that
  // publishes the record, and the page comes back still saying NOT PUBLISHED (e2e/_durable.ts).
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW');
  // Published is NOT enough (owner walk, 2026-08-29): publishing mints the output slug whether
  // or not anybody wants an output, so a header reading "output not seen lately" beside a
  // production with no browser source anywhere sounds like a fault and is not one.
  await expect(page.getByTestId('renderer-status')).toHaveCount(0);

  // Taking the output URL is what makes the heartbeat a real question. Recorded on the show
  // record, so it survives the reload the way the slug does.
  await page.evaluate(async () => {
    const { loadShows, noteShowOutputOpened } = await import('/src/model/shows.ts');
    noteShowOutputOpened(loadShows()[0].id);
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  const heartbeat = page.getByTestId('renderer-status');
  await expect(heartbeat).toBeVisible();
  // Nobody has loaded it, and the readout says exactly that rather than implying a failure.
  await expect(heartbeat).toContainText('output not loaded yet');
  await expect(heartbeat).toHaveAttribute('title', /Open it once in your browser source/);
  await expect(page.locator('[data-testid="toggle-rehearsal"]')).toHaveCount(0);
});

test('the action log reads commands as operator language, and drops the bookkeeping', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { describeLogRow, appendLogEntries, logTime } = await import('/src/control/eventLog.ts');
    const label = (id: string) => (id === 'cue-a' ? 'Anna Andersson' : null);
    const row = (id: number, graphic: string, msg: unknown) => ({ id, graphic, msg, created_at: '2026-08-04T09:15:30.000Z' });
    const say = (id: number, graphic: string, msg: unknown) => describeLogRow(row(id, graphic, msg) as never, label);
    return {
      take: say(1, 'Bug', { t: 'cue', cue: 'cue-a' }),
      // A cue whose label has since been deleted still reads as a take, never as a raw id.
      unknownCue: say(2, 'Bug', { t: 'cue', cue: 'gone' })?.text,
      out: say(3, 'Bug', { t: 'cue', cue: null })?.text,
      update: say(4, 'Bug', { t: 'update', data: { f0: 'x', f1: 'y' } })?.text,
      one: say(5, 'Bug', { t: 'update', data: { f0: 'x' } })?.text,
      event: say(6, 'Bug', { t: 'event', event: 'reveal' })?.text,
      // The bookkeeping rows are NOT operator actions and must never reach the feed.
      staged: say(7, 'Bug', { t: 'staged', data: {} }),
      live: say(8, 'Bug', { t: 'live', data: {} }),
      unknown: say(9, 'Bug', { t: 'something-new' }),
      // Newest first, and a re-delivered row (the tail refill replays what the socket brought)
      // must not appear twice.
      order: appendLogEntries(
        appendLogEntries([], [say(1, 'Bug', { t: 'play' })!, say(2, 'Bug', { t: 'next' })!]),
        [say(2, 'Bug', { t: 'next' })!, say(3, 'Bug', { t: 'stop' })!],
      ).map((e) => e.id),
      time: logTime('2026-08-04T09:15:30.000Z').length,
      undated: logTime(null),
    };
  });
  expect(result.take).toMatchObject({ kind: 'take', graphic: 'Bug', text: 'Took “Anna Andersson”' });
  expect(result.unknownCue).toBe('Took “a cue”');
  expect(result.out).toBe('Out');
  expect(result.update).toBe('Updated 2 fields');
  expect(result.one).toBe('Updated 1 field');
  expect(result.event).toBe('Pressed “reveal”');
  expect(result.staged).toBeNull();
  expect(result.live).toBeNull();
  expect(result.unknown).toBeNull();
  expect(result.order).toEqual([3, 2, 1]);
  expect(result.time).toBe(8); // hh:mm:ss — seconds matter when two takes are a moment apart
  expect(result.undated).toBe('—');
});

test('a cue is live per LAYER, not per production', async ({ page }) => {
  // The vocabulary the whole multi-layer operator surface rests on: the row-persisted snapshot
  // reads as a map keyed by graphic, an older single-cue row migrates into the one layer it
  // described, and a marker only ever touches its own layer.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { readLiveCue, withLiveCue } = await import('/src/control/hostedControl.ts');
    // Format 1 (migration 0031): one cue, on the layer its own `graphic` names.
    const migrated = readLiveCue({ cue: 'cue-a', graphic: 'Bug', at: '2026-01-01T00:00:00.000Z' });
    // Format 2 (migration 0034): the per-layer map.
    const current = readLiveCue({
      v: 2,
      layers: { Bug: { cue: 'cue-a' }, 'Lower third': { cue: 'cue-b' } },
    });
    return {
      migrated,
      current,
      // Nothing at all, and a shape from a future format, both read as "nothing on air".
      empty: readLiveCue(null),
      unknown: readLiveCue({ v: 9, layers: 'not a map' }),
      // A take on one layer leaves the other alone; an Out removes the key rather than nulling it.
      afterTake: withLiveCue(current, 'Ticker', 'cue-c'),
      afterOut: withLiveCue(current, 'Bug', null),
      // A repeated marker returns the SAME object, so a re-delivered log row re-renders nothing.
      idempotent: withLiveCue(current, 'Bug', 'cue-a') === current,
    };
  });
  expect(result.migrated).toEqual({ Bug: 'cue-a' });
  expect(result.current).toEqual({ Bug: 'cue-a', 'Lower third': 'cue-b' });
  expect(result.empty).toEqual({});
  expect(result.unknown).toEqual({});
  expect(result.afterTake).toEqual({ Bug: 'cue-a', 'Lower third': 'cue-b', Ticker: 'cue-c' });
  expect(result.afterOut).toEqual({ 'Lower third': 'cue-b' });
  expect(result.idempotent).toBe(true);
});

test('the output embed is a legal SPX template whose frame IS the production output', async ({ page }) => {
  // The file an SPX rundown lists (src/export/outputEmbed.ts). Two things have to hold at once:
  // SPX must accept it as a template, and an OLD CEF must be able to parse it - CasparCG 2.3.x
  // shows a dead layer with no clue when it cannot (docs/CLOUD_PLAYOUT.md §3).
  const outputUrl = 'https://studio.example/output?production=cap-slug';
  const html = outputEmbedHtml({
    production: 'Evening News',
    outputUrl,
    resolution: { width: 1920, height: 1080, label: 'HD' },
  });

  expect(outputEmbedFileName('Evening News')).toBe('evening_news_output.html');
  // The SPX contract: a definition, one phase (Continue disabled - stepping a graphic is the
  // NoaCG operator's Next), JSON data, and the URL as the first field so the rundown previews it.
  expect(html).toContain('window.SPXGCTemplateDefinition');
  const definition = JSON.parse(html.match(/window\.SPXGCTemplateDefinition = (\{[\s\S]*?\});/)![1]);
  expect(definition.steps).toBe('1');
  expect(definition.dataformat).toBe('json');
  expect(definition.playlayer).toBe(definition.webplayout);
  expect(definition.DataFields.find((f: { field?: string }) => f.field === 'f0').value).toBe(outputUrl);
  // The pair Chromium needs, or it paints the framed page opaque - a white card over the video.
  expect(html).toContain('<meta name="color-scheme" content="dark" />');
  expect(html).toContain('background: transparent');
  // ES5 only, measured on the emitted script rather than trusted: `?.`, `??` and arrow functions
  // all kill the whole file on CasparCG 2.3.x's engine.
  const script = html.slice(html.lastIndexOf('<script type="text/javascript">'));
  expect(script).not.toMatch(/\?\.|\?\?|=>|\b(const|let)\s/);

  // Now RUN it, with the output URL stubbed by a page that reports it was framed.
  await page.route('**/embed-under-test.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.route('https://studio.example/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>output</body></html>' }),
  );
  await page.goto('/embed-under-test.html');
  const frame = page.locator('#noacg-frame');
  const box = page.locator('#noacg-output');

  // PRELOADED and up: the renderer connects while the item is still only loaded, and the frame
  // shows whatever the production has on air, exactly as a browser source does.
  await expect(frame).toHaveAttribute('src', outputUrl);
  await expect(box).not.toHaveClass(/noacg-hidden/);

  // The host's verbs move the FRAME, never the production: Stop hides, Play shows.
  await page.evaluate(() => (window as unknown as { stop: () => void }).stop());
  await expect(box).toHaveClass(/noacg-hidden/);
  await page.evaluate(() => (window as unknown as { play: () => void }).play());
  await expect(box).not.toHaveClass(/noacg-hidden/);

  // The debug overlay is a field, and re-sending the SAME url must not reload the frame - a
  // reload costs the connection and a rebuild of whatever is on air.
  await page.evaluate((url) => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f0: url, f1: '1' }));
  }, outputUrl);
  await expect(frame).toHaveAttribute('src', `${outputUrl}&debug=1`);
  // Let that load finish before counting, or the load being counted is this one.
  await expect(page.frameLocator('#noacg-frame').locator('body')).toContainText('output');
  await page.evaluate(() => {
    (window as unknown as { noacgLoads: number }).noacgLoads = 0;
    document.getElementById('noacg-frame')!.addEventListener('load', () => {
      (window as unknown as { noacgLoads: number }).noacgLoads += 1;
    });
  });
  await page.evaluate((url) => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f0: url, f1: '1' }));
  }, outputUrl);
  await page.waitForTimeout(300); // KEEP as a sleep: this asserts a reload never comes
  expect(await page.evaluate(() => (window as unknown as { noacgLoads: number }).noacgLoads)).toBe(0);

  // CasparCG sends missing values as the literal string "undefined" - the baked URL survives it.
  await page.evaluate(() => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f0: 'undefined', f1: '0' }));
  });
  await expect(frame).toHaveAttribute('src', outputUrl);
});

test('a published production offers the SPX template file beside its output URL', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Evening News');

  // Fake the published record - publishing itself is backend-gated and lives on the live
  // checklist; what this spec is about is the door the two capabilities open in the UI.
  await page.evaluate(async () => {
    const { loadShows, setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    const id = loadShows()[0].id;
    setShowHostedSlug(id, 'demo-slug');
    setShowOutputSlug(id, 'demo-output');
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();

  await page.getByTestId('production-links-toggle').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-output-embed').click(),
  ]);
  expect(download.suggestedFilename()).toBe('evening_news_output.html');
  const file = readFileSync(await download.path(), 'utf8');
  // It carries THIS production's output capability, and nothing that could operate the show:
  // the control slug is what airs a cue, and this file is copied onto playout machines.
  expect(file).toContain('/output?production=demo-output');
  expect(file).not.toContain('demo-slug');
});

// ── Pictures in the rundown (src/templates/picture.ts) ───────────────────────────────────────
// A production puts a still on air without anybody opening the editor: upload, and each picture
// becomes a cue on ONE picture layer. Taking picture 2 therefore REPLACES picture 1 rather than
// stacking a second still over it — which is the cue model (docs/CLOUD_PLAYOUT.md §2) doing
// exactly what it was built to do, with no new architecture underneath it.

/** A 1×1 PNG — small enough that the import leaves the bytes untouched, real enough to decode. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

const pictureFile = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1x1 });

test('pictures upload straight into the rundown: one cue each, one layer, and they survive a reload', async ({
  page,
}) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Picture Show');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('no-cues')).toBeVisible();

  // Two pictures at once — the input takes multiple, because a rundown of stills is how this
  // gets used and adding them one at a time would be the wrong shape of work.
  await page.getByTestId('add-pictures-input').setInputFiles([
    pictureFile('Opening slide.png'),
    pictureFile('Sponsor board.png'),
  ]);

  // One cue per picture, each named after its own file — the name an operator scans for.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Opening slide');
  await expect(rows.nth(1)).toContainText('Sponsor board');

  // ONE pool graphic holds both, so both cues air on the same layer and replace each other. Both
  // rows therefore carry the SAME number — and it is not a clash, because it is one graphic.
  const poolCount = () =>
    page.evaluate(async () => {
      const { loadShows } = await import('/src/model/shows.ts');
      return loadShows()[0].graphics.length;
    });
  expect(await poolCount()).toBe(1);
  const rowLayers = page.getByTestId('cue-list').locator('[data-testid="cue-layer"]');
  await expect(rowLayers.nth(0)).toHaveText('L20');
  await expect(rowLayers.nth(1)).toHaveText('L20');
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(0);

  // A third upload joins the SAME graphic rather than minting a second picture layer.
  await page.getByTestId('add-pictures-input').setInputFiles([pictureFile('Closing card.png')]);
  await expect(rows).toHaveCount(3);
  expect(await poolCount()).toBe(1);
  await expect(rows.nth(2)).toContainText('Closing card');

  // Taking a cue reaches the real renderer: the picture's path resolves to its uploaded bytes
  // (composeDocument's asset shim), so what airs is the picture, not a broken image box.
  await rows.nth(1).getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  const aired = page.frameLocator('[data-testid="program-stage"] iframe[title="Pictures"]');
  await expect(aired.locator('#f0')).toHaveAttribute('src', /^data:image\/png/);

  // Persisted on the Show record like every other cue.
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
  expect(await poolCount()).toBe(1);

  // Removing the last picture cue takes the picture graphic — and the uploads — with it, which is
  // why that removal asks twice and names the count (docs/PLAYOUT_DASHBOARD.md §5).
  const removeCue = async (i: number) => {
    await rows.nth(i).getByTestId('cue-menu').click();
    await page.getByTestId('delete-cue').click();
  };
  await removeCue(2);
  await removeCue(1);
  await expect(rows).toHaveCount(1);
  expect(await poolCount()).toBe(1);
  await rows.first().getByTestId('cue-menu').click();
  await page.getByTestId('delete-cue').click();
  await expect(page.getByTestId('delete-cue')).toContainText('Also deletes 3 pictures');
  await page.getByTestId('delete-cue').click();
  await expect(rows).toHaveCount(0);
  await expect.poll(poolCount).toBe(0);
});

test('a match clock survives a renderer reboot: the wire carries the instant the value was true', async ({ page }) => {
  // docs/CLOUD_PLAYOUT.md §3. A clock is the one value that keeps moving with nobody commanding
  // it, so a snapshot of the commands cannot rebuild it — a browser source reloaded at 67
  // minutes came back at 0:00, on air. `control/matchClockWire.ts` is the wire half of the fix:
  // it reads the clock out of the published markup (no design declares anything) and stamps the
  // value with the clockStart ROW's own server time, which every renderer sees identically and
  // a boot-time replay of the log reconstructs exactly.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  // The markup is the scoreboard contract's own shape (`.<prefix>-clock` carrying a field id,
  // `data-count`, `data-start`) written out here rather than taken from a catalog design: this
  // asserts what the READER promises, and every clock-bearing design in the catalog is walked
  // for real by e2e/sports.spec.ts.
  const CLOCK_HTML =
    '<div class="scoreboard"><span id="f0">HOME</span>'
    + '<span class="scoreboard-clock" id="f5" data-count="down" data-start="12:00">12:00</span></div>';
  const wire = await page.evaluate(async (html) => {
    const w = await import('/src/control/matchClockWire.ts');
    const spec = w.clockSpecFromHtml(html);
    const T = 1_755_600_000_000;
    return {
      spec,
      // A graphic with no clock says so rather than guessing a field.
      noClock: w.clockSpecFromHtml('<div class="lower-third"><span id="f0">Name</span></div>'),
      // Start stamps the value it reads AT that instant; 45:00 held is 45:00.
      started: w.startedClockValue('45:00', false, T),
      // …and 22 minutes later the same string still resolves to the right second.
      derived: w.clockValueAt(`45:00@${T}`, false, T + 22 * 60_000),
      down: w.clockValueAt(`12:00@${T}`, true, T + 90_000),
      // A countdown never runs past zero, however long the outage was.
      floor: w.clockValueAt(`0:30@${T}`, true, T + 10 * 60_000),
      // Holding banks the derived time back as a plain value, so the snapshot holds a real time.
      held: w.heldClockValue(`45:00@${T}`, false, T + 125_000),
      // A stamp that is not a number degrades to a HELD clock reading the right time, never to
      // a clock counting from 1970.
      broken: w.clockValueAt('45:00@nonsense', false, T),
      // The row's own server time is the anchor; a locally-authored row has none.
      rowTime: w.rowInstant(new Date(T).toISOString(), 1),
      localRow: w.rowInstant(undefined, T),
    };
  }, CLOCK_HTML);
  // `seed` and `resetTo` differ only when the markup carries no data-start, which the scoreboard
  // emitter never produces — they are separate because the RUNTIME reads different things for
  // the two jobs, and a disagreement would recover a different time from the one on air.
  expect(wire.spec).toEqual({ field: 'f5', countsDown: true, seed: '12:00', resetTo: '12:00' });
  expect(wire.noClock).toBeNull();
  expect(wire.started).toBe('45:00@1755600000000');
  expect(wire.derived).toBe('67:00');
  expect(wire.down).toBe('10:30');
  expect(wire.floor).toBe('0:00');
  expect(wire.held).toBe('47:05');
  expect(wire.broken).toBe('45:00');
  expect(wire.rowTime).toBe(1_755_600_000_000);
  expect(wire.localRow).toBe(1_755_600_000_000);
});

test('a resend of the cue’s own clock value keeps the origin, so half time banks the running time', async ({ page }) => {
  // THE HOSTED FAULT THIS EXISTS FOR (found and fixed 2026-08-21). A cue stores a PLAIN time and
  // stores it forever, so every Take and ✎ Update mid-match re-sends "10:00" over a clock the
  // renderer has already stamped. `mergedData` merged that blindly and the origin was gone: the
  // next clockStop banked the seed instead of the running time, and a renderer booting from that
  // report came back at the seed too. Both are the very things the origin was added to prevent.
  //
  // The rule is the runtime's own - a CORRECTION is a value the wire carries that CHANGED - held
  // as a pure function so this spec can drive the decision `output/main.ts` makes. The stamp is
  // OURS, not the operator's, so it is the PLAIN HALF that is compared.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const walk = await page.evaluate(async () => {
    const w = await import('/src/control/matchClockWire.ts');
    // sb09's clock: counts DOWN from 10:00.
    const clock = { field: 'f5', countsDown: true, seed: '10:00', resetTo: '10:00' };
    const T = 1_755_600_000_000;
    const at = (mins: number) => new Date(T + mins * 60_000).toISOString();

    // src/output/main.ts apply(), mirrored: an update merges into mergedData - through
    // clockValueAfterUpdate for the CLOCK field - and clockRowEffect is then asked against it.
    const merged: Record<string, string> = {};
    const trace: { row: string; held: string | undefined; effect: string | null }[] = [];
    const step = (label: string, msg: unknown, createdAt: string) => {
      const m = msg as { t: string; data?: Record<string, string> };
      if (m.t === 'update' && m.data) {
        // The PRIOR value, read before the merge - that is what `held` means, and reading it
        // after would hand clockValueAfterUpdate the very value it is being asked to judge.
        const prior = merged[clock.field];
        Object.assign(merged, m.data);
        if (m.data[clock.field] !== undefined) {
          merged[clock.field] = w.clockValueAfterUpdate(prior, m.data[clock.field]);
        }
      }
      const effect = w.clockRowEffect({ msg, created_at: createdAt } as never, clock, merged[clock.field], T);
      if (effect) merged[clock.field] = effect.value;
      trace.push({ row: label, held: merged[clock.field], effect: effect?.value ?? null });
    };

    step('take', { t: 'update', data: { f0: 'HOME', f5: '10:00' } }, at(0));
    step('clockStart', { t: 'event', event: 'clockStart' }, at(0));
    step('goal (whole value set, plain f5)', { t: 'update', data: { f1: '1', f5: '10:00' } }, at(5));
    step('clockStop (half time)', { t: 'event', event: 'clockStop' }, at(5));

    return {
      trace,
      // The RULE itself, stated four ways.
      resendKeepsOrigin: w.clockValueAfterUpdate('10:00@1755600000000', '10:00'),
      correctionWins: w.clockValueAfterUpdate('10:00@1755600000000', '43:12'),
      stampAlwaysWins: w.clockValueAfterUpdate('43:12', '10:00@1755600000000'),
      heldPlainIsReplaced: w.clockValueAfterUpdate('10:00', '9:30'),
      nothingHeld: w.clockValueAfterUpdate(undefined, '10:00'),
    };
  });

  // The origin survives the goal, so half time banks the five minutes that were actually run.
  expect(walk.trace[2].held).toBe(`10:00@${1_755_600_000_000}`);
  expect(walk.trace[3].effect).toBe('5:00');
  // A plain value equal to the held value's PLAIN half is a resend; anything else is an edit.
  expect(walk.resendKeepsOrigin).toBe(`10:00@${1_755_600_000_000}`);
  expect(walk.correctionWins).toBe('43:12');
  expect(walk.stampAlwaysWins).toBe(`10:00@${1_755_600_000_000}`);
  expect(walk.heldPlainIsReplaced).toBe('9:30');
  expect(walk.nothingHeld).toBe('10:00');
});

test('the clock walks a whole match through the log: start, bump, stop, restart, reset', async ({ page }) => {
  // `clockRowEffect` is the one place a control-log row is read as a clock move, and it is pure
  // for exactly this reason: the renderer that uses it (src/output/main.ts) only ever runs
  // against a live backend, so the decision it used to hold inside its boot closure could be
  // driven by no offline spec at all. "Which event stamps what, in which order, and against
  // which held value" is where a bug here would hide, and it airs.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const walk = await page.evaluate(async () => {
    const w = await import('/src/control/matchClockWire.ts');
    const clock = { field: 'f5', countsDown: false, seed: '0:00', resetTo: '0:00' };
    const T = 1_755_600_000_000;
    const at = (mins: number) => new Date(T + mins * 60_000).toISOString();

    // The wire's own state, exactly as the renderer keeps it: one merged value per field.
    let held: string | undefined;
    const trace: { row: string; value: string | null; when: string | null }[] = [];
    const step = (label: string, msg: unknown, createdAt?: string) => {
      const effect = w.clockRowEffect({ msg, created_at: createdAt } as never, clock, held, T);
      if (effect) held = effect.value;
      trace.push({ row: label, value: effect?.value ?? null, when: effect?.when ?? null });
    };

    // A Take sends the cue's whole value set; the clock rides it as a plain (held) time.
    step('take', { t: 'update', data: { f0: 'HOME', f5: '0:00' } }, at(0));
    held = '0:00';
    // Kick-off.
    step('clockStart', { t: 'event', event: 'clockStart' }, at(0));
    // A goal in the 12th minute: the whole value set goes again, clock field included. It must
    // not move the clock, and the stamped value it re-sends still resolves to the right second.
    step('update (goal)', { t: 'update', data: { f1: '1', f5: held! } }, at(12));
    // Half time: the clock is HELD, and what is banked is the derived time, not the seed.
    step('clockStop', { t: 'event', event: 'clockStop' }, at(45));
    // Second half: it resumes from where it stood, not from 0:00.
    step('clockStart', { t: 'event', event: 'clockStart' }, at(60));
    // A row that is not about the clock at all.
    step('event (final)', { t: 'event', event: 'final' }, at(105));
    // Reset returns to the period's own start, held.
    step('clockReset', { t: 'event', event: 'clockReset' }, at(106));

    return {
      trace,
      // What a renderer BOOTING at each of two moments would paint, from the banked value alone.
      atKickoffPlus22: w.clockValueAt(trace[1].value!, false, T + 22 * 60_000),
      atHalfTime: w.clockValueAt(trace[3].value!, false, T + 50 * 60_000),
      secondHalfPlus7: w.clockValueAt(trace[4].value!, false, T + 67 * 60_000),
      // A locally-authored row (an offline production's own command) has no server time and
      // falls back to the caller's clock — correct, because that log has one renderer.
      localRow: w.clockRowEffect(
        { msg: { t: 'event', event: 'clockStart' } } as never,
        clock,
        '30:00',
        T,
      ),
    };
  });

  expect(walk.trace.map((t) => [t.row, t.when])).toEqual([
    ['take', null],                        // an update never moves the clock
    ['clockStart', 'before'],              // the origin must be in the document before the call
    ['update (goal)', null],
    ['clockStop', 'after'],                // the banked value follows the event that settled it
    ['clockStart', 'before'],
    ['event (final)', null],               // a non-clock event is not a clock move
    ['clockReset', 'after'],
  ]);
  // Kick-off stamps 0:00 at T; 22 minutes later a renderer booting cold reads 22:00.
  expect(walk.trace[1].value).toBe(`0:00@${1_755_600_000_000}`);
  expect(walk.atKickoffPlus22).toBe('22:00');
  // Half time banks the DERIVED 45:00 as a plain time — a held clock reads the same five
  // minutes later, which is what "held" has to mean.
  expect(walk.trace[3].value).toBe('45:00');
  expect(walk.atHalfTime).toBe('45:00');
  // The second half resumes FROM 45:00, stamped at kick-off of the half, so seven minutes in it
  // reads 52:00 — not 7:00, and emphatically not 0:00.
  expect(walk.trace[4].value).toBe(`45:00@${1_755_600_000_000 + 60 * 60_000}`);
  expect(walk.secondHalfPlus7).toBe('52:00');
  // Reset goes to the period's own start, held.
  expect(walk.trace[6]).toEqual({ row: 'clockReset', value: '0:00', when: 'after' });
  // No server time: the caller's instant, and the held value still leads.
  expect(walk.localRow).toEqual({ value: `30:00@${1_755_600_000_000}`, when: 'before' });
});

test('a debate’s two clocks survive a renderer reboot: the stamp says which one is running', async ({ page }) => {
  // THE FAULT THIS EXISTS FOR. A debate board (dc01, the speaking-timer type) runs TWO clocks and
  // one of them at a time, and until now neither was on the wire as anything but a plain time. A
  // renderer rebuilding from a report snapshot taken AFTER the switch it needed had no row left
  // to replay, so it came back at whatever the cue last wrote — the full allowance, mid-speech,
  // on air, with a speaker's remaining time visibly wrong to the room.
  //
  // Which of the two is running is the floor group's pointer, and that is MACHINE state. The wire
  // does not learn to read machine graphs to find it: **the stamp IS the pointer**. At most one
  // clock field carries an origin, and that one is running, so `switch` is "bank the stamped one,
  // stamp the other" and every other verb follows. This walks a real debate through the log
  // exactly as `src/output/main.ts` does, and then reads the snapshot mid-speech.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const walk = await page.evaluate(async () => {
    const w = await import('/src/control/matchClockWire.ts');
    const { CATALOG } = await import('/src/templates/catalog.ts');
    // The REAL design's markup, not a fixture: what is asserted here is that the reader finds
    // what the emitter writes, and a hand-written fixture could only ever agree with itself.
    let dc01 = null as null | { create: (o: Record<string, never>) => { html: string } };
    for (const list of Object.values(CATALOG)) {
      const hit = (list || []).find((v: { id: string }) => v.id === 'dc01');
      if (hit) dc01 = hit as never;
    }
    const html = dc01!.create({}).html;
    const clocks = w.speakingClocksFromHtml(html)!;
    const T = 1_755_600_000_000;
    const at = (secs: number) => new Date(T + secs * 1000).toISOString();

    // src/output/main.ts apply(), mirrored: an update merges into the graphic's value set —
    // through clockValueAfterUpdate for BOTH clock fields — and the row effect is then asked
    // against it, its values written before or after the row itself.
    let merged: Record<string, string> = {};
    const trace: { row: string; values: Record<string, string> | null; when: string | null }[] = [];
    const step = (label: string, msg: unknown, createdAt: string) => {
      const m = msg as { t: string; data?: Record<string, string> };
      if (m.t === 'update' && m.data) {
        const prior = merged;
        merged = { ...merged, ...m.data };
        for (const field of [clocks.fieldA, clocks.fieldB]) {
          if (m.data[field] !== undefined) merged[field] = w.clockValueAfterUpdate(prior[field], m.data[field]);
        }
      }
      const effect = w.speakingClockRowEffect({ msg, created_at: createdAt } as never, clocks, merged, T);
      if (effect) merged = { ...merged, ...effect.values };
      trace.push({ row: label, values: effect?.values ?? null, when: effect?.when ?? null });
    };

    // A Take sends the cue's whole value set; both clocks ride it as plain (held) times.
    step('take', { t: 'update', data: { f0: 'OPENING STATEMENTS', f5: '05:00', f6: '05:00', f7: '05:00', f9: '10' } }, at(0));
    // The chair opens the debate. The board was ARMED — nobody had the floor — so the first
    // Switch hands to A, which is what the machine's armed state does with the same press.
    step('switch (A opens)', { t: 'event', event: 'switch' }, at(0));
    // A minute in, the chair retypes the round label. The cue's WHOLE value set goes again and a
    // cue stores a plain time forever, so this re-sends "05:00" over a clock at 04:00.
    step('update (round label)', { t: 'update', data: { f0: 'REBUTTAL', f5: '05:00', f6: '05:00' } }, at(60));
    // A penalty at 1:30. A docks ten seconds and KEEPS SPEAKING — a deduction, not a stoppage.
    step('penalty (A)', { t: 'event', event: 'penalty' }, at(90));
    // The floor passes at 3:00.
    step('switch (to B)', { t: 'event', event: 'switch' }, at(180));
    // …and back at 4:00, then off air at 5:00, then re-armed.
    const midSpeech = { ...merged };
    step('switch (back to A)', { t: 'event', event: 'switch' }, at(240));
    step('stop (off air)', { t: 'stop' }, at(300));
    step('reset', { t: 'event', event: 'reset' }, at(360));

    return {
      clocks,
      trace,
      // A graphic with no speaking clocks says so rather than guessing a pair.
      noClocks: w.speakingClocksFromHtml('<div class="lower-third"><span id="f0">Name</span></div>'),
      // Half a pair cannot alternate, so it is refused whole rather than half-guessed.
      halfPair: w.speakingClocksFromHtml('<div><span id="f5" data-speaking="a">05:00</span></div>'),
      // WHAT A RENDERER BOOTING AT 4:00 PAINTS, from the banked value set alone. This is the
      // whole point: B is mid-speech and its remaining time is not the allowance.
      rebuiltA: w.speakingClockAt(midSpeech[clocks.fieldA], T + 240_000),
      rebuiltB: w.speakingClockAt(midSpeech[clocks.fieldB], T + 240_000),
      // …and the same snapshot read a minute later still resolves, because it is time-relative.
      rebuiltBLater: w.speakingClockAt(midSpeech[clocks.fieldB], T + 300_000),
      runningMidSpeech: w.runningSpeakingSide(clocks, midSpeech),
      runningAfterReset: w.runningSpeakingSide(clocks, merged),
      // A locally-authored row (an offline rehearsal's own command) has no server time and falls
      // back to the caller's instant — correct, because that log has exactly one renderer.
      localRow: w.speakingClockRowEffect({ msg: { t: 'event', event: 'switch' } } as never, clocks, {}, T),
    };
  });

  // The reader finds what dc01 emits, both clocks and both of the numbers the verbs need.
  expect(walk.clocks).toEqual({
    fieldA: 'f5', fieldB: 'f6', seedA: '05:00', seedB: '05:00',
    allowanceField: 'f7', allowanceSeed: '05:00', penaltyField: 'f9', penaltySeed: '10',
  });
  expect(walk.noClocks).toBeNull();
  expect(walk.halfPair).toBeNull();

  expect(walk.trace.map((t) => [t.row, t.when])).toEqual([
    ['take', null],                          // an update never moves a clock
    ['switch (A opens)', 'before'],          // the stamp must be in the document before the call
    ['update (round label)', null],
    ['penalty (A)', 'after'],                // the engine docks it too; writing first docks twice
    ['switch (to B)', 'before'],
    ['switch (back to A)', 'before'],
    ['stop (off air)', 'after'],
    ['reset', 'after'],
  ]);
  // The chair's first press stamps A at the allowance and leaves B alone.
  expect(walk.trace[1].values).toEqual({ f5: `05:00@${1_755_600_000_000}` });
  // The penalty docks ten seconds off the DERIVED 03:30 and re-stamps, so A keeps running.
  expect(walk.trace[3].values).toEqual({ f5: `03:20@${1_755_600_000_000 + 90_000}` });
  // The floor passes: A banks the 01:50 it had actually run down to — not the 05:00 the cue
  // re-sent at 1:00, which is the resend the origin has to survive — and B takes the stamp.
  expect(walk.trace[4].values).toEqual({ f5: '01:50', f6: `05:00@${1_755_600_000_000 + 180_000}` });

  // THE RECOVERY. A renderer rebuilding at 4:00 from that snapshot: A held where it stopped, B
  // still speaking with a minute gone. Before the fix both read 05:00.
  expect(walk.runningMidSpeech).toBe('b');
  expect(walk.rebuiltA).toBe('01:50');
  expect(walk.rebuiltB).toBe('04:00');
  expect(walk.rebuiltBLater).toBe('03:00');

  // Back to A: B banks the 04:00 it had run to, and A resumes from its OWN number — an
  // interrupted speaker does not lose the time.
  expect(walk.trace[5].values).toEqual({ f6: '04:00', f5: `01:50@${1_755_600_000_000 + 240_000}` });
  // Off air nobody holds the floor, so the running clock is banked where it stood: 01:50 less
  // the minute it ran. Without this a board taken down keeps its stamp and "runs" off air.
  expect(walk.trace[6].values).toEqual({ f5: '00:50' });
  // Re-arming returns both to the allowance ON SCREEN, plain — and with no stamp anywhere, the
  // next Switch hands to A again.
  expect(walk.trace[7].values).toEqual({ f5: '05:00', f6: '05:00' });
  expect(walk.runningAfterReset).toBeNull();
  // A row with no server time still opens the debate, against the caller's instant.
  expect(walk.localRow).toEqual({ values: { f5: `05:00@${1_755_600_000_000}` }, when: 'before' });
});

test('the debate board itself reads a stamped clock: it opens mid-speech and keeps counting', async ({ page }) => {
  test.setTimeout(60_000);
  // The wire half above is arithmetic; this is the BOARD, which is where the recovery is either
  // visible or not. It boots dc01 into a frame that has never seen the debate and hands it what a
  // report snapshot holds mid-speech — one clock stamped, one plain — exactly as /output would.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    let variant = null;
    for (const list of Object.values(CATALOG)) {
      const hit = (list || []).find((v) => v.id === 'dc01');
      if (hit) variant = hit;
    }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(variant.create({})); });
    await sleep(60);
    const w = f.contentWindow, d = f.contentDocument;
    const A = () => d.querySelector('#f5').textContent;
    const B = () => d.querySelector('#f6').textContent;

    // The Take: the cue's own plain values, which is all a cue ever stores.
    w.update(JSON.stringify({ f0: 'REBUTTAL', f5: '05:00', f6: '05:00', f7: '05:00', f9: '10' }));
    const afterTake = [A(), B()];
    // The snapshot: B has been speaking for 62 seconds from 03:12, A is held at 01:50. This is
    // the shape /output banks — the running clock stamped, the held one plain.
    const stamped = '03:12@' + (Date.now() - 62000);
    w.update(JSON.stringify({ f5: '01:50', f6: stamped }));
    const recovered = [A(), B()];
    await sleep(1300);
    const stillRunning = [A(), B()];          // …and B is COUNTING, not a frozen recovered number
    // A resend of the cue's whole value set — the chair retypes the round label. /output forwards
    // what it HOLDS for the clock fields, so the stamped value comes round again; re-sending it
    // is idempotent and must neither restart B nor disturb A.
    w.update(JSON.stringify({ f0: 'CLOSING', f5: '01:50', f6: stamped }));
    const afterResend = [A(), B()];
    await sleep(1300);
    const afterResendLater = [A(), B()];
    // And a REAL correction is still obeyed, or the guard would have swallowed the one edit that
    // matters most: a clock the chair cannot correct is a clock the chair stops trusting.
    w.update(JSON.stringify({ f6: '00:45' }));
    const corrected = [A(), B()];
    return { afterTake, recovered, stillRunning, afterResend, afterResendLater, corrected,
             label: d.querySelector('#f0').textContent };
  })()`) as Record<string, string[] & string>;

  expect(result.afterTake).toEqual(['05:00', '05:00']);
  // The board opens at the real remaining time — 03:12 less the 62 seconds that had gone — and
  // NOT at the 05:00 the cue last wrote, which is what it painted a line earlier. No '@' ever
  // reaches the screen either: the raw wire text is written into the element by setFieldValue
  // like any other field, and the engine paints the real time back over it.
  expect(result.recovered).toEqual(['01:50', '02:10']);
  expect(result.stillRunning[0]).toBe('01:50');       // the held clock does not creep
  expect(result.stillRunning[1]).not.toBe('02:10');   // the running one does
  // The resend leaves both where they stood — B a second on from where the sleep left it, never
  // back at 03:12 and never back at the cue's 05:00 — and B is still counting after it.
  expect(result.afterResend[0]).toBe('01:50');
  expect(result.afterResend[1]).toBe(result.stillRunning[1]);
  expect(result.afterResendLater[1]).not.toBe(result.afterResend[1]);
  // A genuine correction still takes.
  expect(result.corrected).toEqual(['01:50', '00:45']);
  expect(result.label).toBe('CLOSING');
});

test('a renderer that has never reported boots from the START of the log, not its head', async ({ page }) => {
  // `control/outputRecovery.ts` decides which log rows a booting /output renderer counts as
  // already applied, and it is pure for the same reason the clock wire is: that page only runs
  // against a live backend, so the rule used to sit in a boot closure no offline spec could
  // reach — and getting it wrong loses a take, on air, permanently.
  //
  // The case this pins is a production NOBODY has rendered yet. Seeding the cursor with the log
  // HEAD there reads "everything up to here is already on air" about a log no renderer has ever
  // followed, so a cue taken before the browser source finished booting was dropped for good.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const plan = await page.evaluate(async () => {
    const r = await import('/src/control/outputRecovery.ts');
    const graphics = ['Scorebug', 'Lower third'];
    const snap = (p: { followFrom: number; snapshotAt: Map<string, number> }) => ({
      followFrom: p.followFrom,
      snapshotAt: [...p.snapshotAt.entries()],
    });
    return {
      // Nothing reported: the log is unrendered history, so all of it replays.
      cold: snap(r.planOutputRecovery(graphics, {})),
      // Reports with baselines: the OLDEST baseline is the floor, and each graphic drops only
      // what its own snapshot already holds (reports are debounced, so they differ).
      reported: snap(
        r.planOutputRecovery(graphics, {
          Scorebug: { event: 120, data: { f1: '1' } },
          'Lower third': { event: 90, data: {} },
        }),
      ),
      // A report with NO baseline (a pre-0033 server or renderer) is not a baseline: it is
      // replayed rather than trusted, so it must not raise the floor.
      unbaselined: snap(r.planOutputRecovery(graphics, { Scorebug: { data: { f1: '1' } } })),
      // A graphic that reported while another never did: the reported one keeps its own
      // snapshot, the other takes everything from the shared floor.
      partial: snap(r.planOutputRecovery(graphics, { Scorebug: { event: 200 } })),
      // The per-row question the boot asks twice — replay, and "does this catch-up animate".
      insideSnapshot: r.alreadyInSnapshot(new Map([['Scorebug', 120]]), 'Scorebug', 120),
      afterSnapshot: r.alreadyInSnapshot(new Map([['Scorebug', 120]]), 'Scorebug', 121),
      noSnapshot: r.alreadyInSnapshot(new Map([['Scorebug', 120]]), 'Lower third', 1),
    };
  });

  // THE REGRESSION: 0, not the head. A production whose log holds a take nobody rendered must
  // replay that take, and the boot pass runs with the stage hidden, so it settles off air.
  expect(plan.cold).toEqual({ followFrom: 0, snapshotAt: [] });
  expect(plan.reported).toEqual({
    followFrom: 90,
    snapshotAt: [['Scorebug', 120], ['Lower third', 90]],
  });
  expect(plan.unbaselined).toEqual({ followFrom: 0, snapshotAt: [] });
  expect(plan.partial).toEqual({ followFrom: 200, snapshotAt: [['Scorebug', 200]] });
  // The row a snapshot was captured AT is inside it; the next one is not; a graphic with no
  // snapshot holds nothing, so every row reaches it.
  expect([plan.insideSnapshot, plan.afterSnapshot, plan.noSnapshot]).toEqual([true, false, false]);
});
