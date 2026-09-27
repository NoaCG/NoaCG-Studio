import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { parkFocusOffControls } from './_keys';

// THE RUNDOWN, SIZED BY THE OPERATOR AND ONE LINE A ROW (docs/CLIP_PLAYBACK_PLAN.md phase 1:
// §6.1, §6.2 and the graphic half of §6.5).
//
//   - The divider is a handle (home/RailResizer): dragged, stepped with the arrow keys, reset by a
//     double-click, held between 320px and 60% of the window, and remembered per device.
//   - Every row is one line, and what the old second line carried is MOVED, never dropped: the
//     number, the kind in words (the icon's accessible name), the note, the layer or server
//     address with the clash warning, and ON AIR / PVW. The table of §6.2 is written out below as
//     `ROW_PARTS` - a graphics-only operator is who would lose information if one went missing.
//   - The clash badge is the door to the layer repair, which now lives under the editor's Advanced.
//   - The list follows the air, except while the operator is working in it.
//
// Every guard here was broken on purpose once and the spec went red (the follow's four pauses,
// the limits, the clash door); see the handoff of the change that added this file.

/** The narrowest the rundown gets, and the widest share of the window (home/RailResizer). */
const RAIL_MIN = 320;
const RAIL_MAX_SHARE = 0.6;
/** The default with nothing chosen: 23% of the window, never under 380px (owner, 2026-09-27). */
const railDefault = (width: number) => Math.round(Math.max(380, 0.23 * width));
/** A graphic with TWELVE operator fields, number controls among them (the widest control there
 *  is, docs/PLAYOUT_DASHBOARD.md §2d): the esports series scorebug, by category and position. */
const WIDE_GRAPHIC = 'esports-score#0';

/** One production from a FIXED list of catalog designs, so a new design never changes it. */
async function seed(
  page: Page,
  opts: { extraCues?: number; clash?: boolean; server?: boolean; wide?: string } = {},
): Promise<string> {
  await page.goto('/app#/home');
  await awaitDurableReady(page);
  const id = await page.evaluate(async (o) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const S = await import('/src/model/shows.ts');
    const show = S.createShowNamed('Rail width');
    const designs = [variantsFor('lower-third')[0], variantsFor('lower-third')[1], variantsFor('quiz')[0]];
    for (const v of designs) S.addGraphicToShow(show.id, v.create({}));
    if (o.wide) {
      const [category, index] = o.wide.split('#');
      S.addGraphicToShow(show.id, variantsFor(category as never)[Number(index)].create({}));
    }
    if (o.server) {
      S.addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', name: 'LOOPS/STUDIO_BG', frames: 1500, fps: 25, channel: 2, loop: true });
    }
    let cur = S.loadShows().find((s) => s.id === show.id)!;
    for (let i = 0; i < (o.extraCues ?? 0); i++) {
      S.addShowCue(show.id, cur.graphics[0].id, { label: `Guest ${i + 1}`, values: { f0: `Person ${i + 1}` } });
    }
    // The first cue carries an operator note; with `clash`, the second graphic is typed onto the
    // first one's layer, so both rows must say they replace each other on air.
    cur = S.loadShows().find((s) => s.id === show.id)!;
    S.updateShowCue(show.id, cur.cues[0].id, { note: 'after the intro' });
    if (o.clash) S.setShowGraphicLayer(show.id, cur.graphics[1].id, S.graphicLayer(cur.graphics[0]));
    return show.id;
  }, opts);
  await settleDurableWrites(page);
  return id;
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue').first()).toBeVisible();
}

const railWidth = (page: Page) => page.locator('.pd-rail').evaluate((el) => Math.round(el.getBoundingClientRect().width));
const storedWidth = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('spx-gfx-prefs') ?? '{}').rundownWidth ?? null);

/** Drag the handle by `dx` pixels (negative = left = a WIDER rundown). */
async function dragHandle(page: Page, dx: number): Promise<void> {
  const box = (await page.getByTestId('rail-resizer').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('the handle drags, steps with the arrows, holds its limits, survives a reload and resets on a double-click', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const id = await seed(page);
  await open(page, id);
  const handle = page.getByTestId('rail-resizer');

  // THE DEFAULT, and the handle says it in words a screen reader can use.
  expect(await railWidth(page)).toBe(railDefault(1920));
  await expect(handle).toHaveAttribute('role', 'separator');
  await expect(handle).toHaveAttribute('aria-valuenow', String(railDefault(1920)));
  await expect(handle).toHaveAttribute('aria-valuemin', String(RAIL_MIN));
  await expect(handle).toHaveAttribute('aria-valuemax', String(Math.floor(RAIL_MAX_SHARE * 1920)));
  const monitorAt = (page: Page) => page.locator('.pd-pvw .pd-frame').evaluate((el) => el.getBoundingClientRect().width);
  const monitorDefault = await monitorAt(page);

  // DRAGGED LEFT, the rundown widens by exactly the drag, the monitors give it the room (never
  // the verbs, which keep their floor), and the width is stored for this device.
  await dragHandle(page, -200);
  expect(await railWidth(page)).toBe(railDefault(1920) + 200);
  expect(await storedWidth(page)).toBe(railDefault(1920) + 200);
  expect(await monitorAt(page), 'a wider rundown makes the monitors smaller').toBeLessThan(monitorDefault);
  const verbs = await page.locator('.pd-stagehead .pd-verbs').evaluate((el) => el.getBoundingClientRect().width);
  expect(verbs, 'the verb column keeps its floor').toBeGreaterThanOrEqual(206);

  // THE ARROW KEYS move it the way the pointer does: Left widens, Right narrows, Shift is five.
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  expect(await railWidth(page)).toBe(railDefault(1920) + 180);
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await railWidth(page)).toBe(railDefault(1920) + 280);
  expect(await storedWidth(page)).toBe(railDefault(1920) + 280);

  // THE LIMITS: 320px at the narrow end, 60% of the window at the wide one, however far the drag.
  await dragHandle(page, 1500);
  expect(await railWidth(page)).toBe(RAIL_MIN);
  await dragHandle(page, -1800);
  expect(await railWidth(page)).toBe(Math.floor(RAIL_MAX_SHARE * 1920));

  // REMEMBERED across a reload, and held to THIS window's limits when the window shrinks - the
  // stored choice is not rewritten, so the wide window gets it back.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  expect(await railWidth(page)).toBe(Math.floor(RAIL_MAX_SHARE * 1920));
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(() => railWidth(page)).toBe(Math.floor(RAIL_MAX_SHARE * 1366));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => railWidth(page)).toBe(Math.floor(RAIL_MAX_SHARE * 1920));

  // A DOUBLE-CLICK goes back to the default, and forgets the choice, so the default follows the
  // window again.
  await handle.dblclick();
  await expect.poll(() => railWidth(page)).toBe(railDefault(1920));
  expect(await storedWidth(page)).toBeNull();
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(() => railWidth(page)).toBe(railDefault(1366));
  expect(railDefault(1366), 'the laptop a class runs on opens exactly as it always did').toBe(380);

  // Data and Audience take the whole body: no rundown there, so no handle.
  await page.goto(`/app#/production/${id}/data`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(handle).toHaveCount(0);
});

/** Every rectangle in `boxes` pairwise apart: an overlap is two controls painting on each other. */
function overlaps(boxes: { name: string; x: number; y: number; w: number; h: number }[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const apart = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
      if (!apart) out.push(`${a.name} overlaps ${b.name}`);
    }
  }
  return out;
}

for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`at ${size.width}x${size.height} a twelve-field graphic reflows from the narrowest rundown to the widest and nothing overlaps`, async ({ page }) => {
    await page.setViewportSize(size);
    const id = await seed(page, { wide: WIDE_GRAPHIC });
    await open(page, id);
    await page.getByTestId('cue-list').locator('.pd-cue').last().getByTestId('select-cue').click();
    await expect(page.getByTestId('cue-editor')).toBeVisible();
    const fieldCount = await page.locator('.pd-band-fields > *').count();
    expect(fieldCount, 'the graphic under test has twelve fields').toBeGreaterThanOrEqual(12);

    const columnsAt = async (): Promise<number> =>
      page.evaluate(() => {
        const cells = [...document.querySelectorAll('.pd-band-fields > *')].map((el) => Math.round(el.getBoundingClientRect().x));
        return new Set(cells).size;
      });
    const measure = () =>
      page.evaluate(() => {
        const box = (name: string, el: Element) => {
          const r = el.getBoundingClientRect();
          return { name, x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const editor = document.querySelector('[data-testid="cue-editor"]')!.getBoundingClientRect();
        // Each field's own box, and each control inside it against that box: a control wider than
        // its track overflows it and paints on the next field (docs/PLAYOUT_DASHBOARD.md §2d).
        const fields = [...document.querySelectorAll('.pd-band-fields > *')].map((el, i) => box(`field ${i}`, el));
        const spill = [...document.querySelectorAll('.pd-band-fields > *')].flatMap((el, i) => {
          const r = el.getBoundingClientRect();
          return [...el.querySelectorAll('input, select, textarea, button')]
            .map((c) => c.getBoundingClientRect())
            .filter((c) => c.width > 0 && (c.right > r.right + 0.5 || c.left < r.left - 0.5))
            .map(() => `a control spills out of field ${i}`);
        });
        const outside = fields.filter((f) => f.x < editor.left - 0.5 || f.x + f.w > editor.right + 0.5).map((f) => `${f.name} leaves the editor`);
        // The stage head: two monitors, their headers and the verb column side by side.
        const head = [
          ...[...document.querySelectorAll('.pd-monitor')].map((el, i) => box(`monitor ${i}`, el)),
          box('verbs', document.querySelector('.pd-stagehead .pd-verbs')!),
        ];
        // A monitor's header fits its monitor: at the widest rundown PROGRAM is narrower than
        // "PROGRAM · ON AIR" and its layer badge, and the header used to run under TAKE. Content
        // that does not fit shows here as a scroll width past the header's own.
        const headers = [...document.querySelectorAll('.pd-monitor h2')]
          .filter((h) => h.scrollWidth > h.clientWidth + 1)
          .map((h, i) => `monitor ${i}'s header is ${h.scrollWidth - h.clientWidth}px wider than the monitor`);
        const root = document.scrollingElement ?? document.documentElement;
        return {
          fields,
          head,
          problems: [...spill, ...outside, ...headers],
          sideways: root.scrollWidth - root.clientWidth,
          docScroll: root.scrollHeight - root.clientHeight,
        };
      });

    const results: Record<string, number> = {};
    for (const rail of ['narrowest', 'default', 'widest'] as const) {
      const w = rail === 'narrowest' ? RAIL_MIN : rail === 'widest' ? 99999 : null;
      await page.evaluate((width) => {
        const prefs = JSON.parse(localStorage.getItem('spx-gfx-prefs') ?? '{"v":2}');
        localStorage.setItem('spx-gfx-prefs', JSON.stringify({ ...prefs, v: 2, rundownWidth: width }));
      }, w);
      await page.reload();
      // A reload selects the first cue again, so the scorebug is picked once more, and taken, so
      // PROGRAM's header carries a name and a layer badge as well as its label.
      await page.getByTestId('cue-list').locator('.pd-cue').last().getByTestId('select-cue').click();
      await expect(page.locator('.pd-band-fields > *')).toHaveCount(fieldCount);
      await page.getByTestId('verb-take').click();
      await expect(page.locator('.pd-pgm .pd-layer-badge')).toBeVisible();
      const m = await measure();
      expect.soft(overlaps(m.fields), `fields at the ${rail} rundown`).toEqual([]);
      expect.soft(overlaps(m.head), `the stage head at the ${rail} rundown`).toEqual([]);
      expect.soft(m.problems, `the editor at the ${rail} rundown`).toEqual([]);
      expect.soft(m.sideways, `no sideways scroll at the ${rail} rundown`).toBe(0);
      expect.soft(m.docScroll, `the document never scrolls at the ${rail} rundown`).toBe(0);
      results[rail] = await columnsAt();
    }
    // THE FIELDS REFLOW TO THE EDITOR'S OWN WIDTH, not the window's: a wider rundown is fewer
    // field columns in the same window.
    expect(results.widest).toBeLessThan(results.narrowest);
  });
}

// §6.2, AS A TABLE. What each row must still say after the second line went, and where it lives.
test('a one-line row keeps its number, its kind in words, its note, its slot, the clash and the state tag', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'spx-gfx-caspar',
      JSON.stringify({
        agentUrl: 'http://127.0.0.1:8899', agentToken: 't', host: '127.0.0.1', amcpPort: 5250, channel: 1, layer: 20, v: 1,
        channels: [{ channel: 1, name: 'Graphics' }, { channel: 2, name: 'Inserts' }],
        clipChannel: 2,
      }),
    );
  });
  const id = await seed(page, { clash: true, server: true });
  await open(page, id);
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(4);
  const names = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Rail width')!;
    return show.graphics.map((g) => ({ name: g.name, type: g.type }));
  });

  // ONE LINE: every row is the same 34px, where two lines were 50.
  for (const h of await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))) {
    expect(h).toBe(34);
  }

  // THE ROW TABLE (§6.2). Each part, on each row it belongs to.
  const row = (i: number) => rows.nth(i);
  // number
  for (let i = 0; i < 4; i++) await expect(row(i).locator('.pd-cue-no')).toHaveText(String(i + 1));
  // kind, in words: the icon's accessible name and tooltip say what the second line printed.
  await expect(row(0).getByRole('img', { name: `Lower third · ${names[0].name}` })).toBeVisible();
  await expect(row(1).getByRole('img', { name: `Lower third · ${names[1].name}` })).toBeVisible();
  await expect(row(2).getByRole('img', { name: `Quiz · ${names[2].name}` })).toBeVisible();
  await expect(row(3).getByRole('img', { name: 'Server clip · 2-10' })).toBeVisible();
  await expect(row(0).getByTestId('cue-kind')).toHaveAttribute('title', `Lower third · ${names[0].name}`);
  // the note, as a mark whose name and tooltip ARE the note - and only where there is one.
  await expect(row(0).getByRole('img', { name: 'Note: after the intro' })).toHaveAttribute('title', 'after the intro');
  await expect(rows.getByTestId('cue-note-mark')).toHaveCount(1);
  // the slot: the layer on a graphic, the server address on a server cue.
  await expect(row(2).getByTestId('cue-layer')).toHaveText('L22');
  await expect(row(3).getByTestId('cue-layer')).toHaveText('2-10');
  // the clip's own facts: its length, and that it loops. No length column on a graphic's row
  // beyond the empty cell that keeps the column straight.
  await expect(row(3).getByTestId('cue-length')).toHaveText('1:00');
  await expect(row(3).getByRole('img', { name: 'Loops until Out' })).toBeVisible();
  await expect(row(2).getByTestId('cue-length')).toHaveText('');
  // the clash: BOTH rows on the shared layer wear it, with the sentence, and neither other row.
  for (const i of [0, 1]) {
    const badge = row(i).getByTestId('cue-layer');
    await expect(badge).toHaveClass(/clash/);
    await expect(badge).toHaveText('L20');
    await expect(badge).toHaveAttribute('title', new RegExp(`Shares layer 20 with ${i === 0 ? names[1].name : names[0].name}\\. On air they replace each other`));
  }
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(2);

  // the state tags: PVW on the cue on preview, ON AIR on the one taken, as words beside the tint.
  await row(2).getByTestId('select-cue').click();
  await expect(row(2).locator('.pd-tag')).toHaveText('PVW');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(row(2).locator('.pd-tag')).toHaveText('ON AIR');
  await expect(row(2)).toHaveClass(/on-air/);
  await expect(row(2).locator('.pd-cue-no')).toHaveText('●');

  // A graphics-only rundown has no length column at all (§6.8).
  const graphicsOnly = await seed(page);
  await open(page, graphicsOnly);
  await expect(page.getByTestId('cue-length')).toHaveCount(0);
});

test('the clash badge opens the layer repair, and a graphic keeps its layer under a closed Advanced', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const id = await seed(page, { clash: true });
  await open(page, id);
  const rows = page.getByTestId('cue-list').locator('.pd-cue');

  // No clash on the quiz: its layer is under Advanced, closed, with the number in the summary.
  await rows.nth(2).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-advanced-summary')).toHaveText('Layer 22');
  await expect(page.getByTestId('cue-advanced-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('graphic-layer')).toHaveCount(0);
  await page.getByTestId('cue-advanced-toggle').click();
  await expect(page.getByTestId('cue-advanced-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('graphic-layer')).toHaveValue('22');
  // It closes again the same way, since nothing about this layer needs the operator.
  await page.getByTestId('cue-advanced-toggle').click();
  await expect(page.getByTestId('graphic-layer')).toHaveCount(0);

  // THE BADGE IS THE DOOR: pressed on the second row, it selects that cue, Advanced is open by
  // itself because the layer clashes, and the repair is in front with its button focused.
  await rows.nth(1).getByTestId('cue-layer').click();
  await expect(rows.nth(1)).toHaveClass(/selected/);
  await expect(page.getByTestId('cue-advanced-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cue-advanced-summary')).toContainText('Layer 20 · shared');
  await expect(page.getByTestId('layer-clash')).toBeInViewport();
  await expect(page.getByTestId('layer-clash-fix')).toBeFocused();
  // While the layer is shared the part cannot be closed: the repair must never hide.
  await expect(page.getByTestId('cue-advanced-toggle')).toBeDisabled();
  await page.getByTestId('layer-clash-fix').click();
  await expect(page.getByTestId('layer-clash')).toHaveCount(0);
  await expect(page.getByTestId('cue-list').locator('[data-testid="cue-layer"].clash')).toHaveCount(0);
});

// THE LIST FOLLOWS THE AIR (§6.2), and holds still while the operator is working in it.
test('the list follows a cue going on air off-screen, except during a drag, with a menu open, with focus in it, or just after a hand scrolled it', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1366, height: 768 });
  const id = await seed(page, { extraCues: 30 });
  await open(page, id);
  const list = page.getByTestId('cue-list');
  const rows = list.locator('.pd-cue');
  const last = rows.last();

  // The last cue selected, then the list scrolled back to the top by script (not by a hand) and
  // focus parked outside the rundown.
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await last.getByTestId('select-cue').click();
  const toTop = async () => {
    await list.evaluate((el) => (el.scrollTop = 0));
    await parkFocusOffControls(page);
    await expect(last).not.toBeInViewport();
  };
  const takeOff = async () => {
    await page.keyboard.press(' ');
    await expect(last).not.toHaveClass(/on-air/);
  };

  // FOLLOWS: SPACE takes the selected (last) cue, off-screen - the list brings it into view.
  await toTop();
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).toBeInViewport();
  await takeOff();

  // FOCUS IN THE RUNDOWN: the operator's cursor is in the list, so the list is theirs.
  await toTop();
  await rows.first().getByTestId('select-cue').focus();
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).not.toBeInViewport();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await takeOff();

  // A MENU OPEN: a row's ⋯ is up, with focus taken back out of the rundown.
  await toTop();
  await rows.first().hover();
  await rows.first().getByTestId('cue-menu').click();
  await expect(page.getByTestId('cue-actions-menu')).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).not.toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cue-actions-menu')).toHaveCount(0);
  await takeOff();

  // A ROW BEING DRAGGED.
  await toTop();
  await rows.first().dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).not.toBeInViewport();
  await rows.first().dispatchEvent('dragend');
  await takeOff();

  // A HAND SCROLLED IT: ten seconds of stillness after a wheel, then it follows again.
  await toTop();
  await list.hover();
  await page.mouse.wheel(0, -120);
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).not.toBeInViewport();
  await takeOff();
  await page.clock.fastForward(10_500);
  await page.keyboard.press(' ');
  await expect(last).toHaveClass(/on-air/);
  await expect(last).toBeInViewport();
});
