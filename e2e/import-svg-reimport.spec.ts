// covers: src/templates/importedDesign/reimport.ts, src/blocks/svgIdentity.ts
// covers: src/components/wizard/import/draft.ts
// covers: src/components/wizard/shell/walkState.ts, src/components/wizard/steps/FinishStep.tsx, src/components/wizard/CreationWizard.tsx
//
// REIMPORT KEEPS THE WORK (docs/work-specs/jev-svg-import/spec.md, row 27, AC-15). Changed artwork
// imported over a saved graphic keeps every verified-match layer's field id, the keys and labels
// made after the earlier import, and an identity the editor minted on a keyed artwork layer. A
// removed or look-alike layer is never guessed: it is named, and the earlier graphic is kept.

import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCORE_SVG, dropSvg, intoProduction } from './_svg-import';
import { addToProductionFromFinish } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';

/** Version one: a plate, a name and a role. */
const V1 = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="240" viewBox="0 0 1280 240" font-family="sans-serif" fill="#fff">
  <rect x="0" y="0" width="1280" height="240" fill="#122036"/>
  <g id="Plate"><rect x="40" y="60" width="760" height="140" fill="#243b5a" rx="12"/></g>
  <text x="70" y="118" font-size="36" id="name">Guest name</text>
  <text x="70" y="166" font-size="22" id="role">Guest role</text>
</svg>`;

/** Version two: a new plate colour, new words, and a BADGE drawn before the name, so the build
 *  numbers it first and every earlier id would move by one. */
const V2 = V1.replace('#243b5a', '#7a1f2b')
  .replace('Guest name', 'Presenter')
  .replace('<text x="70" y="118"', '<text x="900" y="40" font-size="20" id="badge">LIVE</text>\n  <text x="70" y="118"');

/** Version three: the role layer deleted. */
const V3 = V1.replace(/\s*<text[^>]*id="role">Guest role<\/text>/, '');

/** Version four: the role drawn twice, exactly alike. */
const V4 = V1.replace('</svg>', '  <text x="70" y="166" font-size="22" id="role">Guest role</text>\n</svg>');

/** Build each artwork as the wizard does, save-shaped: the first with a key on the role and an
 *  edited label, then reimport the second over it. */
async function reimport(page: Page, first: string, second: string) {
  return page.evaluate(async ([a, b]) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const D = await import('/src/components/wizard/import/draft.ts');
    const A = await import('/src/blocks/animData.ts');
    const variant = variantsFor('imported-design').find((v) => v.id === 'svg01')!;
    const build = (markup: string) => {
      const patch = D.svgDraftFromImport(importSvgMarkup(markup), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
      return buildDraftTemplate(variant, mergeDraft(initialDraft(), { ...patch, name: 'Guest' }));
    };
    const baseline = build(a);
    const role = baseline.fields.find((f) => f.title === 'role')!.field;
    // The work made after the import: two Position X keys on the role, and the role relabelled.
    const data = A.parseAnimData(baseline.js)!;
    data.steps[0].layers[`#${role}`] = { ...data.steps[0].layers[`#${role}`], x: [{ time: 0, value: -40 }, { time: 0.5, value: 0, ease: 'power2.out' }] };
    // ...and the first entrance track the import made, deleted.
    const name = Object.keys(data.steps[0].layers).find((sel) => Object.keys(data.steps[0].layers[sel]).length > 0) ?? '';
    const deleted = name ? Object.keys(data.steps[0].layers[name])[0] : null;
    if (deleted) delete data.steps[0].layers[name][deleted];
    const fields = baseline.fields.map((f) => (f.field === role ? { ...f, title: 'Job title' } : f));
    const prior = { ...baseline, js: A.spliceAnimData(baseline.js, data)!, fields };
    let built = build(b);
    // The new build's own motion on its first field (the badge in version two), which must follow
    // that field through any id rename.
    const first = built.fields[0];
    const builtData = A.parseAnimData(built.js)!;
    builtData.steps[0].layers[`#${first.field}`] = { ...builtData.steps[0].layers[`#${first.field}`], scale: [{ time: 0, value: 0.5 }, { time: 0.3, value: 1 }] };
    built = { ...built, js: A.spliceAnimData(built.js, builtData)! };
    const out = D.svgReimported({ template: prior, baseline }, built)!;
    const doc = new DOMParser().parseFromString(out.template.html, 'text/html');
    const textOf = (id: string) => doc.getElementById(id)?.textContent ?? null;
    const outData = A.parseAnimData(out.template.js)!;
    return {
      priorIds: Object.fromEntries(baseline.fields.map((f) => [f.title, f.field])),
      builtIds: Object.fromEntries(built.fields.map((f) => [f.title, f.field])),
      ids: Object.fromEntries(out.template.fields.map((f) => [f.field, f.title])),
      texts: Object.fromEntries(out.template.fields.map((f) => [f.field, textOf(f.field)])),
      roleKeys: outData.steps[0].layers[`#${role}`]?.x ?? null,
      firstScale: outData.steps[0].layers[`#${out.template.fields.find((f) => f.title === first.title)?.field}`]?.scale ?? null,
      deleted,
      deletedBack: deleted ? Object.keys(outData.steps[0].layers[name] ?? {}).includes(deleted) : null,
      definition: out.template.html.includes('"title": "Job title"'),
      unresolved: out.unresolved,
      role,
    };
  }, [first, second]);
}

test('changed artwork keeps every matched id, its keys and its label; an added layer takes a fresh id', async ({ page }) => {
  await page.goto('/app');
  const r = await reimport(page, V1, V2);
  // The fresh build numbers the badge first, so its name and role ids moved...
  expect(r.priorIds).toEqual({ name: 'f0', role: 'f1' });
  expect(r.builtIds).toEqual({ badge: 'f0', name: 'f1', role: 'f2' });
  // ...and the reimport gives them back, with the badge on an id the earlier graphic never used.
  expect(r.ids).toEqual({ f0: 'name', f1: 'Job title', f2: 'badge' });
  expect(r.texts).toEqual({ f0: 'Presenter', f1: 'Guest role', f2: 'LIVE' });
  expect(r.roleKeys).toEqual([{ time: 0, value: -40 }, { time: 0.5, value: 0, ease: 'power2.out' }]);
  // The new build's motion on the badge follows the badge through the id cycle (f0 -> f2).
  expect(r.firstScale).toEqual([{ time: 0, value: 0.5 }, { time: 0.3, value: 1 }]);
  // A track deleted after the import does not come back from the new build.
  expect(r.deleted, 'the import makes an entrance track').not.toBeNull();
  expect(r.deletedBack).toBe(false);
  expect(r.definition).toBe(true);
  expect(r.unresolved).toEqual([]);
});

test('a removed layer and look-alike layers are named, never guessed', async ({ page }) => {
  await page.goto('/app');
  const removed = await reimport(page, V1, V3);
  expect(removed.unresolved).toEqual([
    { kind: 'removed', label: 'Job title' },
  ]);
  // Its keys are not written onto the gone id, where a later layer could pick them up.
  expect(removed.roleKeys).toBeNull();
  const twins = await reimport(page, V1, V4);
  expect(twins.unresolved.map((u) => u.kind)).toContain('ambiguous');
});

test('a key on an edited artwork layer follows that layer; a changed layer leaves it named', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(async ([a, b]) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const D = await import('/src/components/wizard/import/draft.ts');
    const A = await import('/src/blocks/animData.ts');
    const { commitSvgIdentity } = await import('/src/blocks/svgIdentity.ts');
    const { getTemplateParts } = await import('/src/model/structure.ts');
    const variant = variantsFor('imported-design').find((v) => v.id === 'svg01')!;
    const build = (markup: string) => {
      const patch = D.svgDraftFromImport(importSvgMarkup(markup), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
      return buildDraftTemplate(variant, mergeDraft(initialDraft(), { ...patch, name: 'Guest' }));
    };
    const baseline = build(a);
    // The editor mints an identity for each unnamed rectangle it keys: the backdrop, and the plate
    // inside the Plate group.
    const rects = getTemplateParts(baseline.html, baseline.fields, true).filter((p) => p.selector.startsWith('body:nth-of-type(') && />rect:nth-of-type\(\d+\)$/.test(p.selector));
    let prior = baseline;
    const ids: string[] = [];
    for (const part of rects) {
      const done = commitSvgIdentity(prior, part.selector);
      prior = done.template;
      ids.push(done.selector);
    }
    const data = A.parseAnimData(prior.js)!;
    for (const id of ids) data.steps[0].layers[id] = { opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }] };
    prior = { ...prior, js: A.spliceAnimData(prior.js, data)! };
    const out = D.svgReimported({ template: prior, baseline }, build(b))!;
    const doc = new DOMParser().parseFromString(out.template.html, 'text/html');
    return {
      ids,
      fills: ids.map((id) => doc.querySelector(id)?.getAttribute('fill') ?? null),
      keyed: ids.map((id) => !!A.parseAnimData(out.template.js)!.steps[0].layers[id]),
      unresolved: out.unresolved,
    };
  }, [V1, V2]);
  expect(r.ids).toEqual(['#artwork-1', '#artwork-2']);
  // The backdrop is drawn the same in both versions and takes its identity and key across; the
  // plate's colour changed, so its key is named rather than moved onto a guess, and not written
  // where nothing holds it (the earlier graphic keeps it).
  expect(r.fills).toEqual(['#122036', null]);
  expect(r.keyed).toEqual([true, false]);
  expect(r.unresolved).toEqual([{ kind: 'key', label: 'Plate' }]);
});

test('a behaviour keeps its fields and actions; dropping it names every action', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(async (markup) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const D = await import('/src/components/wizard/import/draft.ts');
    const variant = variantsFor('imported-design').find((v) => v.id === 'svg01')!;
    const build = (svg: string, plain = false) => {
      const patch = D.svgDraftFromImport(importSvgMarkup(svg), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
      return buildDraftTemplate(variant, mergeDraft(initialDraft(), { ...patch, ...(plain ? { svgBehaviour: null } : {}), name: 'Board' }));
    };
    const first = build(markup);
    // The same board with a new background colour.
    const again = D.svgReimported({ template: first, baseline: first }, build(markup.replace(/<svg([^>]*)>/, '<svg$1><rect width="10" height="10" fill="#010203"/>')))!;
    const plain = D.svgReimported({ template: first, baseline: first }, build(markup, true))!;
    return {
      recipe: first.js.includes('NOACG_BEHAVIOUR'),
      fields: first.fields.map((f) => `${f.field} ${f.title}`),
      againFields: again.template.fields.map((f) => `${f.field} ${f.title}`),
      againUnresolved: again.unresolved,
      plainKinds: [...new Set(plain.unresolved.map((u) => u.kind))],
    };
  }, readFileSync(SCORE_SVG, 'utf8'));
  expect(r.recipe).toBe(true);
  expect(r.againUnresolved).toEqual([]);
  expect(r.againFields).toEqual(r.fields);
  expect(r.plainKinds).toContain('action');
});

// ── THE DOORS ────────────────────────────────────────────────────────────────────────────────
// The same reimport through the product: import into a production, make work on the saved
// graphic, then import the next version under the same name.

/** The artwork as a file the drop zone takes, named so every version reads as "guest". */
function asFile(markup: string, tag: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), `reimport-${tag}-`)), 'guest.svg');
  writeFileSync(file, markup);
  return file;
}

/** The work a person makes after the first import: keys on the role, the role relabelled, and the
 *  role bound to production data. Written through the model, as the editor and the data
 *  workspace write it. */
async function makeWork(page: Page) {
  await page.evaluate(async () => {
    const { loadGraphics, updateGraphic } = await import('/src/model/library.ts');
    const { loadShows, setFieldBinding } = await import('/src/model/shows.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const A = await import('/src/blocks/animData.ts');
    const g = loadGraphics().find((d) => d.name === 'Guest')!;
    const role = g.template.fields.find((f) => f.title === 'role')!.field;
    const data = A.parseAnimData(g.template.js)!;
    data.steps[0].layers[`#${role}`] = { ...data.steps[0].layers[`#${role}`], x: [{ time: 0, value: -40 }, { time: 0.5, value: 0 }] };
    const fields = g.template.fields.map((f) => (f.field === role ? { ...f, title: 'Job title' } : f));
    const html = replaceDefinitionInHtml(g.template.html, g.template.settings, fields);
    updateGraphic(g.id, { template: { ...g.template, html, fields, js: A.spliceAnimData(g.template.js, data)! } });
    setFieldBinding(loadShows()[0].id, 'Guest', role, 'guest.role');
  });
  await settleDurableWrites(page);
}

/** What the library and the production hold. */
async function state(page: Page) {
  await awaitDurableReady(page);
  return page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    const A = await import('/src/blocks/animData.ts');
    const show = loadShows()[0];
    return {
      library: loadGraphics().map((g) => {
        const doc = new DOMParser().parseFromString(g.template.html, 'text/html');
        const steps = A.parseAnimData(g.template.js)?.steps ?? [];
        return {
          id: g.id,
          name: g.name,
          fields: g.template.fields.map((f) => `${f.field} ${f.title} ${doc.getElementById(f.field)?.textContent ?? ''}`.trim()),
          keyed: Object.entries(steps[0]?.layers ?? {}).filter(([, t]) => (t as Record<string, unknown[]>).x?.length === 2).map(([sel]) => sel),
        };
      }),
      bindings: show.bindings ?? {},
      pool: show.graphics.map((g) => g.name),
      poolGuest: show.graphics.find((g) => g.name === 'Guest')?.template.fields.map((f) => `${f.field} ${f.title}`) ?? null,
    };
  });
}

/** From a fresh visit to the Finish step of the next version, named like the saved graphic. */
async function reimportToFinish(page: Page, file: string): Promise<void> {
  await page.goto('/app');
  await dropSvg(page, file);
  await page.getByTestId('wz-skip-to-finish').click();
  await expect(page.getByTestId('wz-stepcount')).toContainText('5');
  await page.getByTestId('wz-finish-name').fill('Guest');
  const pick = page.getByTestId('wz-finish-production');
  await pick.selectOption((await pick.locator('option', { hasText: 'Show' }).getAttribute('value'))!);
}

async function pressAdd(page: Page): Promise<void> {
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
}

test('reimporting changed artwork through Finish keeps the graphic, its ids, keys, label and binding', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/app');
  await dropSvg(page, asFile(V1, 'v1'));
  await intoProduction(page, 'Guest', 'Show');
  await makeWork(page);
  const before = await state(page);

  await reimportToFinish(page, asFile(V2, 'v2'));
  // Nothing is unresolved, so Finish says what it always says about a held name.
  await expect(page.getByTestId('wz-finish-name-taken')).toBeVisible();
  await expect(page.getByTestId('wz-finish-reimport')).toHaveCount(0);
  // Two presses of one walk: Export saves the reconciled graphic, then the production door saves
  // again from a fresh build, and must reconcile again rather than write that build over it.
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();
  await page.getByTestId('export-window').locator('.gallery-close').click();
  await pressAdd(page);

  const after = await state(page);
  expect(after.library.map((g) => g.id)).toEqual(before.library.map((g) => g.id));
  // In the new artwork's order: the badge is drawn first and took an id nobody used.
  expect(after.library[0].fields).toEqual(['f2 badge LIVE', 'f0 name Presenter', 'f1 Job title Guest role']);
  expect(after.library[0].keyed).toEqual(['#f1']);
  // The binding still names the role's id, and that id is still the role layer.
  expect(after.bindings).toEqual(before.bindings);
  expect(after.bindings).toEqual({ Guest: { f1: 'guest.role' } });
  expect(after.pool).toEqual(['Guest']);
});

test('a removed layer saves the new version beside the earlier one; Replace anyway keeps a copy', async ({ page }) => {
  test.setTimeout(110_000);
  await page.goto('/app');
  await dropSvg(page, asFile(V1, 'v1'));
  await intoProduction(page, 'Guest', 'Show');
  await makeWork(page);
  const before = await state(page);
  const earlier = before.library[0];

  const v3 = asFile(V3, 'v3');
  await reimportToFinish(page, v3);
  const review = page.getByTestId('wz-finish-reimport');
  await expect(review).toContainText('Not carried over to this version: Job title.');
  await expect(review).toContainText('saves this one as Guest 2');
  await expect(page.getByTestId('wz-finish-name-taken')).toHaveCount(0);
  // Saved separately through Export first; Finish then carries the name it was saved under, so
  // the production door that follows adds that graphic rather than renaming it back over Guest.
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();
  await page.getByTestId('export-window').locator('.gallery-close').click();
  await expect(page.getByTestId('wz-finish-name')).toHaveValue('Guest 2');
  await pressAdd(page);
  let now = await state(page);
  // The earlier graphic, its work, its binding and its place in the production are untouched; the
  // new version is its own graphic beside it.
  expect(now.library.find((g) => g.id === earlier.id)).toEqual(earlier);
  expect(now.library.map((g) => g.name).sort()).toEqual(['Guest', 'Guest 2']);
  expect(now.library.find((g) => g.name === 'Guest 2')!.keyed).toEqual([]);
  expect(now.bindings).toEqual({ Guest: { [earlier.fields[1].split(' ')[0]]: 'guest.role' } });
  expect(now.pool.sort()).toEqual(['Guest', 'Guest 2']);
  expect(now.poolGuest).toEqual(before.poolGuest);

  await reimportToFinish(page, v3);
  await page.getByTestId('wz-finish-reimport-replace').check();
  await expect(page.getByTestId('wz-finish-reimport')).toContainText('keeps the earlier one as Guest copy');
  await pressAdd(page);
  now = await state(page);
  const replaced = now.library.find((g) => g.id === earlier.id)!;
  expect(replaced.fields).toEqual(['f0 name Guest name']);
  // The earlier version stays recoverable as its own graphic, work included.
  const copy = now.library.find((g) => g.name === 'Guest copy')!;
  expect({ ...copy, id: earlier.id, name: earlier.name }).toEqual(earlier);
});

test('reconciliation follows the record, not the press', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(async () => {
    const { reimportTarget } = await import('/src/components/wizard/import/draft.ts');
    const index = [{ id: 'g', name: 'Guest', updatedAt: 't1', fields: [] }];
    const over = { kind: 'over' as const, targetId: 'g', holder: index[0] };
    const update = { kind: 'update' as const, targetId: 'g', renamedFrom: null, sharesWith: null };
    const made = (m: object) => ({ name: 'Guest', graphicId: 'g', production: null, landedOn: null, ...m });
    return {
      // A graphic this walk never opened.
      over: reimportTarget(over, null, index),
      // This walk's own plain graphic, untouched since: today's plain write.
      ownPlain: reimportTarget(update, made({ at: 't1' }), index),
      // The same graphic after another tab wrote to it: its work is read, not written over.
      ownChanged: reimportTarget(update, made({ at: 't0' }), index),
      // A graphic this walk reconciled: every later press reconciles again.
      ownReconciled: reimportTarget(update, made({ at: 't1', reconciled: true }), index),
      mint: reimportTarget({ kind: 'mint', targetId: null }, null, index),
    };
  });
  expect(r).toEqual({ over: 'g', ownPlain: null, ownChanged: 'g', ownReconciled: 'g', mint: null });
});
