import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { bootstrapGraphic, openExportWindow, skipOldEditor } from './_create';
import { awaitPreviewRebuild } from './_preview';

// The gap-list pack (docs/PACK_TAXONOMY.md): the commerce, fundraising, sponsor, location and
// call-to-action designs, plus the two NEW categories — camera frames and transitions.
//
// What this spec is for, over and above the catalog-wide gates that already cover every
// variant (catalog-baseline for the emitted code and the rendered look, bench.spec for the
// runtime, graphic-types.spec for the compiled types): the things that are only true of THIS
// pack. A new category has to be discoverable and creatable; a transition has to clear itself,
// which no other graphic does; and both new categories have to survive the round trip a real
// user makes — edit, save, reload, export to every target.

/** The new categories, by their BROWSE TILE label and a design to build from each. The label is
 *  the graphic category's name in the taxonomy (model/taxonomy.ts), NOT the old wizard category
 *  name — the Browse step files templates by graphic category. */
const NEW_CATEGORIES = [
  { label: 'Frames & layouts', id: 'frame', design: 'House Cam' },
  { label: 'Stingers & wipes', id: 'transition', design: 'Volt Stinger' },
];

async function openWizardCategories(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // Entry -> the broadcast-graphics "templates" card -> the category grid.
  await page.locator('[data-entry="template"]').click();
}

test('the two new categories are browsable, and every design in them creates', async ({ page }) => {
  await openWizardCategories(page);
  // Browsable = the ONE type dropdown offers their shelf as a selectable heading row and each
  // category as a row under it (proposal §19 Option A since 2026-08-28; before that the
  // categories were chips revealed by picking the shelf). The fact under test is unchanged:
  // these categories are reachable by browsing.
  const types = page.getByTestId('wz-browse-type');
  await expect(types.locator('option[value="group:frames"]')).toHaveText(/^Frames & stingers ·/);
  for (const cat of NEW_CATEGORIES) {
    await expect(types.locator('option', { hasText: cat.label })).toHaveCount(1);
  }
  await types.selectOption('group:frames');

  // …and each category's designs all build. Done in the page rather than by clicking every
  // card: what is being asserted is that the category RESOLVES to real variants, which is the
  // half a UI click cannot see.
  const built = await page.evaluate(async (ids: string[]) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    return ids.map((id) => {
      const variants = variantsFor(id as never);
      return {
        id,
        count: variants.length,
        errors: variants
          .map((v) => {
            try {
              v.create({});
              return null;
            } catch (e) {
              return `${v.id}: ${String(e)}`;
            }
          })
          .filter(Boolean),
      };
    });
  }, NEW_CATEGORIES.map((c) => c.id));

  for (const row of built) {
    expect(row.errors, `${row.id} designs failed to create`).toEqual([]);
    expect(row.count, `${row.id} has no designs`).toBeGreaterThan(0);
  }
});

test('discover → select → edit → timeline → save → reload keeps a commerce card whole', async ({ page }) => {
  skipOldEditor();
  // A product card is the pack's most field-heavy design: five text lines plus an image slot,
  // with two elements that vanish when their field is cleared. If anything in the round trip
  // drops a field, this is where it shows.
  await bootstrapGraphic(page, { category: 'Info cards', name: 'House Product' });

  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.map((f) => `${f.field}:${f.ftype}`);
  });
  expect(fields).toEqual(['f0:textfield', 'f1:textfield', 'f2:textfield', 'f3:textfield', 'f4:textfield', 'f5:filelist']);

  // EDIT: retype the price. Two different things are being changed here on purpose, because
  // they are two different things in the product: `setFieldDefault` rewrites the DEFAULT that
  // travels in the template (what an export ships, what a reload restores), and the sample
  // value is what the preview's update() actually writes. Setting only the default leaves the
  // preview showing the old price — correctly, since sample data outranks it on air.
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { setFieldDefault } = await import('/src/blocks/edit.ts');
      const store = useTemplateStore.getState();
      store.applyTemplate(setFieldDefault(store.template, 'f1', '€99'));
      useTemplateStore.getState().setSampleValue('f1', '€99');
    }),
  );
  await expect(page.frameLocator('iframe.preview-frame').locator('#f1')).toHaveText('€99');

  // TIMELINE: the card is a data-block template with a real entrance and Out step.
  const steps = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js);
    return data?.steps.map((s) => s.name) ?? null;
  });
  expect(steps).not.toBeNull();
  expect(steps!.length).toBeGreaterThanOrEqual(2);

  // SAVE → RELOAD: the edited value survives, and so does the image field.
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill('Winter headphones');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.reload();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.locator('.tpl-name')).toHaveText('Winter headphones');

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      price: t.fields.find((f) => f.field === 'f1')?.value,
      image: t.fields.find((f) => f.field === 'f5')?.ftype,
    };
  });
  expect(after.price).toBe('€99');
  expect(after.image).toBe('filelist');
});

test('a transition carries the timer machine that clears it, and actually clears itself', async ({ page }) => {
  // The transition type is the only graphic in the catalog whose whole content is its
  // LIFECYCLE, so this is the assertion that cannot be borrowed from anywhere else: the arrow
  // exists in the data, and the RUNTIME honours it.
  await bootstrapGraphic(page, { category: 'Transitions', name: 'Volt Stinger' });

  const machine = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { validateMachine } = await import('/src/blocks/animMachine.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js)!;
    const main = data.machine!.groups[0];
    const path = main.defaultPath!;
    const timer = main.transitions.find((t) => t.trigger === 'timer');
    return {
      problems: validateMachine(data),
      // The self-clear runs from the entrance waypoint straight to the exit.
      timerFromEntrance: timer?.from === path[0] && timer?.to === path[path.length - 1],
      after: timer?.after,
      // …and `next` is the manual version of the same move.
      exitOnNext: main.transitions.some(
        (t) => t.trigger === 'operator' && t.event === 'next' && t.to === path[path.length - 1],
      ),
    };
  });
  expect(machine.problems).toEqual({ errors: [], warnings: [] });
  expect(machine.timerFromEntrance).toBe(true);
  expect(machine.after).toBeGreaterThan(0);
  expect(machine.exitOnNext).toBe(true);

  // Drive the real runtime in its own document: play() covers the frame, and the graphic takes
  // ITSELF off air without anyone calling stop(). Time is accelerated the way the bench does
  // it, so the hold costs milliseconds rather than seconds.
  const run = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const template = useTemplateStore.getState().template;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;';
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('the iframe failed to load'));
      iframe.srcdoc = composeDocument(template);
      document.body.appendChild(iframe);
    });
    const win = iframe.contentWindow as unknown as {
      play?: () => void;
      gsap?: { globalTimeline?: { timeScale: (v: number) => void } };
    };
    const doc = iframe.contentDocument!;
    const root = doc.querySelector('.transition') as HTMLElement;
    const visible = () => parseFloat(getComputedStyle(root).opacity) > 0.1;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    win.gsap?.globalTimeline?.timeScale(20);
    win.play?.();

    // Covered: poll for the cover rather than sampling once — the entrance is a real tween.
    let covered = false;
    for (let i = 0; i < 40 && !covered; i++) {
      covered = visible();
      if (!covered) await wait(25);
    }
    // …then cleared, by the timer alone. Nothing below calls stop().
    let cleared = false;
    for (let i = 0; i < 80 && !cleared; i++) {
      await wait(25);
      cleared = !visible();
    }
    iframe.remove();
    return { covered, cleared };
  });
  expect(run.covered, 'play() did not cover the frame').toBe(true);
  expect(run.cleared, 'the transition never cleared itself — the timer arrow did not fire').toBe(true);
});

test('every export target packages a graphic from each new category', async ({ page }) => {
  test.setTimeout(180_000);
  const TARGETS = [
    'SPX export',
    'HTML overlay (OBS / vMix)',
    'H2R Graphics export',
    'CasparCG export',
    'OGraf (EBU) export',
    'LiveOS (NetOn.Live) export',
  ];

  for (const cat of NEW_CATEGORIES) {
    await bootstrapGraphic(page, { category: cat.label, name: cat.design });
    await openExportWindow(page);

    for (const label of TARGETS) {
      await page.locator('.issue', { hasText: label }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Validate & download/ }).click(),
      ]);
      const zip = await JSZip.loadAsync(readFileSync(await download.path()));
      const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      expect(names.length, `${cat.design} → ${label} produced an empty package`).toBeGreaterThan(0);

      // Whatever the shape, the graphic's own markup has to be in there: a package that
      // validates and downloads but carries no root element is the failure worth catching.
      //
      // Deliberately NOT "find the .html" — an OGraf package has none. Its markup is embedded
      // as a string inside graphic.mjs, because a Web Component ships its own template; the
      // same is true of the LiveOS package, which IS the OGraf one. So the search is over every
      // text file the package carries, which is what "the markup is in there" actually means.
      const textFiles = names.filter((n) => /\.(html|mjs|js|json|md)$/.test(n));
      const bodies = await Promise.all(textFiles.map((n) => zip.file(n)!.async('string')));
      expect(
        bodies.some((body) => body.includes(`class=\\"${cat.id}\\"`) || body.includes(`class="${cat.id}"`)),
        `${cat.design} → ${label} shipped no .${cat.id} root`,
      ).toBe(true);

      // Plug-and-play: nothing in a package may reach for the network at playout.
      for (const body of bodies) {
        expect(body, `${cat.design} → ${label} references a CDN`).not.toMatch(/src=["']https?:\/\//);
      }
    }
  }
});
