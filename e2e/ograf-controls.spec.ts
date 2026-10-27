// TYPED OGRAF FORMS AND ACTION ARGUMENTS (docs/work-specs/playout-ograf-controls/spec.md, E2.1:
// AC-1, AC-4's form and arrangement part). A cue over a graphic carrying E1's stranger fixture
// manifest (nested lists and objects, typed enums, a hidden group, a URI-free image path, two custom
// actions) is edited through its generated form, kept, reloaded, taken and pressed on the page's
// own PROGRAM monitor. The graphic's own update() and noacgDispatch() write each value with its
// JSON type, so what is read is what the renderer received. Desktop and phone width.
// covers: src/components/home/TypedForm.tsx, src/control/ografForm.ts, src/components/home/CueEditor.tsx
// covers: src/control/ografContract.ts, src/control/typedSend.ts, src/control/graphicVerbs.ts, src/output/stage.ts
// covers: src/control/pressFeedback.ts, src/components/home/CueActions.tsx

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootstrapGraphic } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';

const MANIFEST = JSON.parse(readFileSync(new URL('../scripts/fixtures/ograf-typed/stranger.ograf.json', import.meta.url), 'utf8')) as Record<string, unknown>;

/** The probe's code: update() and a custom action write what they were sent, `name=type:json`. */
const PROBE_JS = [
  "function line(o) { return Object.keys(o).sort().map(function (n) { return n + '=' + (Array.isArray(o[n]) ? 'list' : typeof o[n]) + ':' + JSON.stringify(o[n]); }).join(' '); }",
  "window.update = function (d) { var o = JSON.parse(d); if (Object.keys(o).length) document.getElementById('v').textContent = line(o); };",
  "window.play = function () { document.getElementById('s').textContent = 'on'; };",
  "var presses = 0;",
  "window.noacgDispatch = function (e, p) { var a = document.getElementById('a'); a.textContent = e + ' ' + (typeof p) + ':' + JSON.stringify(p); a.dataset.n = String(++presses); };",
].join('\n');

/** A production with one cue over the probe, which carries the stranger's manifest. */
async function seed(page: Page): Promise<string> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await awaitDurableReady(page);
  const id = await page.evaluate(
    async ({ manifest, js }) => {
      const { createShowNamedChecked, addGraphicToShow, addShowCue, loadShows } = await import('/src/model/shows.ts');
      const { deleteGraphic, loadGraphics } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { useRouter } = await import('/src/app/router.ts');
      const { template } = useTemplateStore.getState();
      for (const g of loadGraphics()) deleteGraphic(g.id);
      const { show, error } = createShowNamedChecked(`Typed form ${Date.now()}`);
      if (error) throw new Error(error);
      addGraphicToShow(show.id, { ...template, name: 'Results', html: '<div id="v"></div><div id="s">off</div><div id="a"></div>', css: '', js, ograf: { v: 1, manifest } });
      // A second cue of the same graphic, which a switch mid-edit must leave alone.
      addShowCue(show.id, loadShows().find((s) => s.id === show.id)!.graphics[0].id);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      useRouter.getState().navigate({ view: 'production', id: show.id });
      await new Promise((resolve) => setTimeout(resolve));
      return show.id;
    },
    { manifest: MANIFEST, js: PROBE_JS },
  );
  await expect(page.getByTestId('production-page')).toBeVisible();
  return id;
}

const stored = (page: Page, showId: string) =>
  page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const cue = loadShows().find((s) => s.id === id)?.cues?.[0];
    return { values: (cue?.typed as { values?: Record<string, unknown> } | undefined)?.values ?? null, args: (cue?.typedArgs as { actions?: Record<string, { args: unknown }> } | undefined)?.actions ?? null };
  }, showId);

const program = (page: Page) => page.frameLocator('[data-testid="program-stage"] iframe[title="Results"]');

async function reload(page: Page) {
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);
}

/** Type into a text control and end the edit, as an operator turning back to the desk does. */
async function typeInto(page: Page, testId: string, text: string) {
  const box = page.getByTestId(testId);
  await box.fill(text);
  await box.blur();
}

test('a typed cue is edited through its generated form, kept as typed, reloaded, taken and its action pressed with typed arguments', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const showId = await seed(page);

  // ON: the schema's declared defaults fill what the cue did not say, once; the form is the schema.
  await page.getByTestId('cue-typed-toggle').check();
  await expect(page.getByTestId('cue-typed-title')).toHaveValue('Results');
  await expect(page.getByTestId('cue-typed-teams[0].name')).toHaveValue('Home');
  // A typed enum is a choice of its declared values by their labels, never free text.
  await expect(page.getByTestId('cue-typed-round').locator('option:checked')).toHaveText('Round one');
  // `hidden` keeps a value out of the graphic's name, not out of reach: its group can be opened.
  await expect(page.getByTestId('cue-typed-add-meta')).toBeVisible();
  // Precise notes for what is not carried, at their own place, the value kept.
  await page.getByTestId('cue-typed-add-meta').click();
  await expect(page.getByTestId('cue-typed-kept-meta.source')).toContainText('pattern');
  // An image path draws the picture picker; the rest of the strings are text.
  await expect(page.getByTestId('cue-typed-logo')).toHaveJSProperty('tagName', 'SELECT');

  // EDIT: every value in its own type.
  await typeInto(page, 'cue-typed-title', 'Final standings');
  await page.getByTestId('cue-typed-round').selectOption({ label: 'Final' });
  await page.getByTestId('cue-typed-ratio').selectOption({ label: 'Half' });
  // A new list item takes its declared shape; its empty required name is marked and stops Take only.
  await page.getByTestId('cue-typed-add-teams').click();
  await expect(page.getByTestId('cue-typed-error-teams[1].name')).toContainText('shorter than 1');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /teams\[1\]\.name/);
  await typeInto(page, 'cue-typed-teams[1].name', 'Away');
  await page.getByTestId('cue-typed-teams[1].score').fill('3');
  await expect(page.getByTestId('cue-typed-error-teams[1].name')).toHaveCount(0);
  // Removing the default's item is kept: a default is never put back when the form reopens.
  await page.getByTestId('cue-typed-remove-teams[0]').click();
  await expect.poll(async () => (await stored(page, showId)).values?.teams).toEqual([{ name: 'Away', score: 3 }]);

  // An action's arguments: its required team, a colour that does not fit, kept as typed.
  await page.getByTestId('cue-args-highlight-team').fill('2');
  await typeInto(page, 'cue-args-highlight-colour', '#zz');
  await expect(page.getByTestId('cue-args-highlight-error-colour')).toContainText('not a #rrggbbaa colour');

  // SAVE AND RELOAD: the same types, the drafts kept as they were, nothing defaulted again.
  await reload(page);
  const kept = await stored(page, showId);
  expect(kept.values).toMatchObject({ title: 'Final standings', round: 3, ratio: 0.5, live: true, teams: [{ name: 'Away', score: 3 }], meta: { revision: 0 } });
  expect(kept.args?.highlight.args).toEqual({ team: 2, colour: '#zz' });
  await expect(page.getByTestId('cue-typed-title')).toHaveValue('Final standings');
  await expect(page.getByTestId('cue-args-highlight-colour')).toHaveValue('#zz');
  await expect(page.getByTestId('cue-typed-teams[0].name')).toHaveValue('Away');

  // TAKE: the renderer receives the values with their declared types.
  await page.getByTestId('verb-take').click();
  await expect(program(page).locator('#s')).toHaveText('on', { timeout: 20_000 });
  const shown = program(page).locator('#v');
  await expect(shown).toContainText('round=number:3');
  await expect(shown).toContainText('ratio=number:0.5');
  await expect(shown).toContainText('live=boolean:true');
  await expect(shown).toContainText('teams=list:[{"name":"Away","score":3}]');
  await expect(shown).toContainText('meta=object:{"revision":0}');

  // An edit after the Take waits for ✎ Update and says so; an Update pressed while the box still
  // holds the edit (a key or a panel, not a click that blurs it) sends that edit.
  await typeInto(page, 'cue-typed-title', 'Final table');
  await expect(page.getByTestId('cue-unsent')).toContainText('1 change not on PROGRAM yet');
  await page.getByTestId('cue-typed-title').fill('Final table!');
  await page.getByTestId('verb-update').dispatchEvent('click');
  await expect(shown).toContainText('title=string:"Final table!"');
  await expect(page.getByTestId('cue-unsent')).toHaveText('');
  // A number out of range is kept as typed and marked, never replaced with a bound.
  await page.getByTestId('cue-typed-teams[0].score').fill('-1');
  await page.getByTestId('cue-typed-teams[0].score').blur();
  await expect(page.getByTestId('cue-typed-error-teams[0].score')).toContainText('below the minimum 0');
  await expect.poll(async () => (await stored(page, showId)).values?.teams).toEqual([{ name: 'Away', score: -1 }]);
  await page.getByTestId('cue-typed-teams[0].score').fill('3');
  await page.getByTestId('cue-typed-teams[0].score').blur();
  await expect(page.getByTestId('cue-typed-error-teams[0].score')).toHaveCount(0);
  // A required number emptied and sent while the box still holds it (no blur) is missing, so the
  // Update refuses rather than air the number it held before.
  await page.getByTestId('cue-typed-teams[0].score').fill('');
  await page.getByTestId('verb-update').dispatchEvent('click');
  await expect.poll(async () => (await stored(page, showId)).values?.teams).toEqual([{ name: 'Away' }]);
  await expect(page.getByTestId('cue-typed-error-teams[0].score')).toBeVisible();
  await expect(page.getByTestId('production-note')).toContainText('teams[0].score');
  await expect(shown).toContainText('teams=list:[{"name":"Away","score":3}]');
  await page.getByTestId('cue-typed-teams[0].score').fill('3');
  await page.getByTestId('cue-typed-teams[0].score').blur();
  await expect(page.getByTestId('cue-typed-error-teams[0].score')).toHaveCount(0);

  // A PRESS whose arguments do not fit sends nothing and says where.
  await page.getByTestId('cue-action-highlight').click();
  await expect(page.getByTestId('production-note')).toContainText('colour not a #rrggbbaa colour');
  await expect(program(page).locator('#a')).toHaveText('');
  // Fixed, the press carries them typed; the action without arguments carries none.
  await typeInto(page, 'cue-args-highlight-colour', '#005ca9ff');
  await page.getByTestId('cue-action-highlight').click();
  await expect(program(page).locator('#a')).toHaveText('highlight object:{"team":2,"colour":"#005ca9ff"}');
  await page.getByTestId('cue-action-reset').click();
  await expect(program(page).locator('#a')).toHaveText('reset object:{}');

  // An optional value emptied is absent again, not an empty string; an optional group is removed.
  await typeInto(page, 'cue-args-highlight-colour', '');
  await expect.poll(async () => (await stored(page, showId)).args?.highlight.args).toEqual({ team: 2 });
  await page.getByTestId('cue-action-highlight').click();
  await expect(program(page).locator('#a')).toHaveText('highlight object:{"team":2}');
  // A number has no empty state of its own: its remove mark clears an optional one.
  await expect(page.getByTestId('cue-typed-unset-opacity')).toBeVisible();
  await page.getByTestId('cue-typed-unset-opacity').click();
  await expect.poll(async () => (await stored(page, showId)).values?.opacity).toBeUndefined();
  await page.getByTestId('cue-typed-unset-meta').click();
  await expect.poll(async () => (await stored(page, showId)).values?.meta).toBeUndefined();
  await expect(page.getByTestId('cue-typed-add-meta')).toBeVisible();

  // A switch to another cue while an edit is still settling (a panel's selection, no blur) lands the
  // edit in the cue it was typed into and leaves the other alone.
  const secondTitle = (id: string) =>
    page.evaluate(async (showId) => {
      const { loadShows } = await import('/src/model/shows.ts');
      return (loadShows().find((s) => s.id === showId)?.cues?.[1]?.typed as { values?: { title?: string } } | undefined)?.values?.title ?? null;
    }, id);
  expect(
    await page.evaluate(async (id) => {
      const { loadShows, setCueTyped } = await import('/src/model/shows.ts');
      return setCueTyped(id, loadShows().find((s) => s.id === id)!.cues![1].id, true).error;
    }, showId),
  ).toBeNull();
  expect(await secondTitle(showId)).toBe('Results');
  await page.getByTestId('cue-typed-title').fill('Kept here');
  await page.getByTestId('cue-list').locator('.pd-cue').nth(1).locator('.pd-cue-label').dispatchEvent('click');
  await expect(page.getByTestId('cue-typed-title')).toHaveValue('Results');
  await expect.poll(async () => (await stored(page, showId)).values?.title).toBe('Kept here');
  await page.waitForTimeout(800); // past the settle: nothing still owed may land in the second cue
  expect(await secondTitle(showId)).toBe('Results');
});

test('the typed form works at phone width: reachable, no sideways scroll, edits kept through a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const showId = await seed(page);
  await page.getByTestId('cue-typed-toggle').check();
  const form = page.getByTestId('cue-typed-form');
  await form.scrollIntoViewIfNeeded();
  await expect(form).toBeVisible();
  // The form fits the column: no control pushes the page sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await form.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.getByTestId('cue-typed-add-teams').click();
  await typeInto(page, 'cue-typed-teams[1].name', 'Away');
  await page.getByTestId('cue-typed-round').selectOption({ label: 'Round two' });
  await expect.poll(async () => (await stored(page, showId)).values?.round).toBe(2);
  await reload(page);
  await expect(page.getByTestId('cue-typed-teams[1].name')).toHaveValue('Away');
  expect((await stored(page, showId)).values).toMatchObject({ round: 2, teams: [{ name: 'Home', score: 0 }, { name: 'Away', score: 0 }] });
});

test('a declared action targets the on-air cue: staged arguments say so, each press says what it came to, and a new instance starts clean', async ({ page }) => {
  // E2.2 (AC-2, AC-3), on a phone-width panel: two cues of one graphic, the press's target shown in
  // the form and on the button, and its outcome as an icon on the button for the instance on air.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const showId = await seed(page);
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  const press = page.getByTestId('cue-action-highlight');
  const target = page.getByTestId('cue-action-target-highlight');
  const sentArgs = program(page).locator('#a');

  // The first cue's arguments, staged until it is taken.
  await page.getByTestId('cue-args-highlight-team').fill('1');
  await page.getByTestId('cue-args-highlight-team').blur();
  await expect.poll(async () => (await stored(page, showId)).args?.highlight.args).toEqual({ team: 1 });
  await expect(target).toHaveText('Staged');
  await page.getByTestId('verb-take').click();
  await expect(program(page).locator('#s')).toHaveText('on', { timeout: 20_000 });
  await expect(target).toHaveText('On air');
  await expect(press).not.toHaveAttribute('data-press');
  await press.click();
  await expect(sentArgs).toHaveText('highlight object:{"team":1}');
  await expect(sentArgs).toHaveAttribute('data-n', '1');
  await expect(press).toHaveAttribute('data-press', 'sent');
  await expect(press).toHaveAttribute('title', /^Sent\. Fires .+ with .+’s arguments\. The graphic decides whether it takes it\.$/);

  // The second cue of the graphic, edited while the first airs: its arguments read staged, and a
  // press sends the on-air cue's, as the button says.
  await rows.nth(1).locator('.pd-cue-label').dispatchEvent('click');
  await expect(target).toHaveText('Staged');
  await page.getByTestId('cue-args-highlight-team').fill('2');
  await page.getByTestId('cue-args-highlight-team').blur();
  await expect(page.getByTestId('cue-args-highlight-team')).toHaveValue('2');
  await press.click();
  await expect(sentArgs).toHaveAttribute('data-n', '2');
  await expect(sentArgs).toHaveText('highlight object:{"team":1}');
  await expect(press).toHaveAttribute('data-press', 'sent');

  // A press refused for its arguments reads refused, never sent, and sends nothing.
  await rows.nth(0).locator('.pd-cue-label').dispatchEvent('click');
  await typeInto(page, 'cue-args-highlight-colour', '#zz');
  await press.click();
  await expect(press).toHaveAttribute('data-press', 'refused');
  await expect(press).toHaveAttribute('title', /^Refused: .*colour not a #rrggbbaa colour/);
  await expect(sentArgs).toHaveAttribute('data-n', '2');

  // A new instance on the layer: the old press's mark is not this one's, and its own arguments go.
  await rows.nth(1).locator('.pd-cue-label').dispatchEvent('click');
  await page.getByTestId('verb-take').click();
  await expect(target).toHaveText('On air');
  await expect(press).not.toHaveAttribute('data-press');
  await press.click();
  await expect(sentArgs).toHaveText('highlight object:{"team":2}');
  await expect(sentArgs).toHaveAttribute('data-n', '3');
  await expect(press).toHaveAttribute('data-press', 'sent');
  // The mark is drawn at phone width, inside the panel.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const icon = await press.evaluate((el) => getComputedStyle(el, '::after').content);
  expect(icon).toBe('"✓"');
});
