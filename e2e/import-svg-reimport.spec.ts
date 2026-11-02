// covers: src/templates/importedDesign/reimport.ts, src/blocks/svgIdentity.ts
// covers: src/components/wizard/import/draft.ts
//
// REIMPORT KEEPS THE WORK (docs/work-specs/jev-svg-import/spec.md, row 27, AC-15). Changed artwork
// imported over a saved graphic keeps every verified-match layer's field id, the keys and labels
// made after the earlier import, and an identity the editor minted on a keyed artwork layer. A
// removed or look-alike layer is never guessed: it is named, and the earlier graphic is kept.

import { test, expect, type Page } from '@playwright/test';

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
    const fields = baseline.fields.map((f) => (f.field === role ? { ...f, title: 'Job title' } : f));
    const prior = { ...baseline, js: A.spliceAnimData(baseline.js, data)!, fields };
    const built = build(b);
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
  expect(r.definition).toBe(true);
  expect(r.unresolved).toEqual([]);
});

test('a removed layer and look-alike layers are named, never guessed', async ({ page }) => {
  await page.goto('/app');
  const removed = await reimport(page, V1, V3);
  expect(removed.unresolved).toEqual([
    { kind: 'removed', label: 'Job title' },
    { kind: 'key', label: `#${removed.role}` },
  ]);
  const twins = await reimport(page, V1, V4);
  expect(twins.unresolved.map((u) => u.kind)).toContain('ambiguous');
});
