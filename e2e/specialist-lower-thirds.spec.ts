import { test, expect } from '@playwright/test';
import { bootstrapGraphic } from './_create';

// The SPECIALIST lower-third pack (src/templates/lowerThirds/specialist).
//
// Discovery is NOT this spec's subject: browse facets and search come from the one taxonomy
// (model/taxonomy.ts + templates/templateMeta.ts), which covers the whole catalog and has its
// own coverage. What is worth pinning here is the two contracts the pack introduced, each of
// which broke at least once while it was being built:
//
//   1. INDEPENDENT FIELDS: a two-person strap emits one SPX field per person per value —
//      never one string an operator has to punctuate themselves.
//   2. DEGRADATION: removing a role line must never re-read the next person's NAME as a role,
//      and the split rule differs between peer designs and lead/support designs.

test('a two-person strap gives each person independent fields', async ({ page }) => {
  await bootstrapGraphic(page, 'Split Interview');

  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return t.fields.map((f) => ({ field: f.field, title: f.title }));
  });

  // Four fields, one per person per value — not two fields holding "Name, Role" strings.
  expect(fields).toEqual([
    { field: 'f0', title: 'Left name' },
    { field: 'f1', title: 'Left role' },
    { field: 'f2', title: 'Right name' },
    { field: 'f3', title: 'Right role' },
  ]);

  // Each is a separately addressable element the runtime writes into, so an operator can
  // change one person without touching the other.
  const written = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const t = useTemplateStore.getState().template;
    return new Promise<Record<string, string>>((resolve) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px';
      f.onload = () => {
        const w = f.contentWindow as unknown as { update: (s: string) => void };
        const d = f.contentDocument!;
        w.update(JSON.stringify({ f0: 'Bo Li', f1: 'Analyst', f2: 'Elena Marchetti', f3: 'Correspondent' }));
        resolve({
          f0: d.getElementById('f0')!.textContent!,
          f1: d.getElementById('f1')!.textContent!,
          f2: d.getElementById('f2')!.textContent!,
          f3: d.getElementById('f3')!.textContent!,
        });
        f.remove();
      };
      f.srcdoc = composeDocument(t);
      document.body.appendChild(f);
    });
  });
  expect(written).toEqual({ f0: 'Bo Li', f1: 'Analyst', f2: 'Elena Marchetti', f3: 'Correspondent' });
});

test('dropping the role lines degrades by the design\'s own split rule', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();

  const shapes = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const read = (id: string, n: number) => {
      const v = variantById(id)!;
      const tpl = v.create({ lines: v.suggestedLines.slice(0, n) });
      const doc = new DOMParser().parseFromString(tpl.html, 'text/html');
      // Which column does each surviving field land in?
      return [...doc.querySelectorAll('.lower-third-person')].map((col) =>
        [...col.querySelectorAll('[id^="f"]')].map((el) => el.id),
      );
    };
    return {
      // ls01 is a PEER design: two lines must still name TWO people, one per column.
      peer4: read('ls01', 4),
      peer2: read('ls01', 2),
      // ls04 is a LEAD design: two lines are the guest AND the guest's own chip, one column —
      // never the guest's role re-read as the host's name.
      led4: read('ls04', 4),
      led2: read('ls04', 2),
    };
  });

  expect(shapes.peer4).toEqual([['f0', 'f1'], ['f2', 'f3']]);
  expect(shapes.peer2).toEqual([['f0'], ['f1']]);
  expect(shapes.led4).toEqual([['f0', 'f1'], ['f2', 'f3']]);
  expect(shapes.led2).toEqual([['f0', 'f1']]);
});

test('every specialist design passes the export gate on all targets', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();

  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const list = variantsFor('lower-third').filter((v) => /^ls\d\d$/.test(v.id));
    const failures: string[] = [];
    for (const v of list) {
      const tpl = v.create();
      const val = validateTemplate(tpl);
      if (!val.ok) failures.push(`${v.id}: ${val.errors.map((e) => e.rule).join(',')}`);
      for (const t of EXPORT_TARGETS) {
        try {
          const zip = await t.build(tpl, {});
          if (Object.keys(zip.files).length === 0) failures.push(`${v.id}/${t.id}: empty package`);
        } catch (e) {
          failures.push(`${v.id}/${t.id}: ${(e as Error).message}`);
        }
      }
    }
    return { count: list.length, targets: EXPORT_TARGETS.length, failures };
  });

  expect(result.count).toBeGreaterThanOrEqual(32);
  expect(result.failures).toEqual([]);
});
