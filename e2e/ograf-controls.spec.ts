// TYPED OGRAF FORMS AND ACTION ARGUMENTS (docs/work-specs/playout-ograf-controls/spec.md, E2.1:
// AC-1, AC-4's form and arrangement part). A cue over a graphic carrying E1's stranger fixture
// manifest (nested lists and objects, typed enums, a hidden group, a URI-free image path, two custom
// actions) is edited through its generated form, kept, reloaded, taken and pressed on the page's
// own PROGRAM monitor. The graphic's own update() and noacgDispatch() write each value with its
// JSON type, so what is read is what the renderer received. Desktop and phone width.
// covers: src/components/home/TypedForm.tsx, src/control/ografForm.ts, src/components/home/CueEditor.tsx
// covers: src/control/ografContract.ts, src/control/typedSend.ts, src/control/graphicVerbs.ts, src/output/stage.ts

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
  "window.noacgDispatch = function (e, p) { document.getElementById('a').textContent = e + ' ' + (typeof p) + ':' + JSON.stringify(p); };",
].join('\n');

/** A production with one cue over the probe, which carries the stranger's manifest. */
async function seed(page: Page): Promise<string> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await awaitDurableReady(page);
  const id = await page.evaluate(
    async ({ manifest, js }) => {
      const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
      const { deleteGraphic, loadGraphics } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { useRouter } = await import('/src/app/router.ts');
      const { template } = useTemplateStore.getState();
      for (const g of loadGraphics()) deleteGraphic(g.id);
      const { show, error } = createShowNamedChecked(`Typed form ${Date.now()}`);
      if (error) throw new Error(error);
      addGraphicToShow(show.id, { ...template, name: 'Results', html: '<div id="v"></div><div id="s">off</div><div id="a"></div>', css: '', js, ograf: { v: 1, manifest } });
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
