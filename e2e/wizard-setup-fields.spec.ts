import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { chooseType, pickDesign } from './_browse';

// The wizard's SETUP section: the non-line decisions that belong to BUILDING a graphic rather
// than to running it - which answer a quiz marks correct, the club colours, how long a
// countdown runs. Every one of them was previously reachable only after creation, in the
// editor's Data tab, so a quiz created in the wizard always revealed its chassis's own default
// row and the only way to change that was to open the advanced surface the student release
// exists to make optional.
//
// What appears there is DERIVED, never a second declaration: `setupFields` drops any field an
// operator event carries as PAYLOAD, because this model's answer to combinatorial states is
// "the moment is a state, what it is about is DATA" - so a payload field is live state by
// construction. The quiz proves both halves at once: `correctAnswer` is setup and offered,
// `selectedAnswer` is the `select` event's payload and is not. Since 2026-09-22 the Reveal carries
// `correctAnswer` too, and it stays offered because `judge` is a DEFAULT-PATH event: Continue
// reaches it with no control page, so the key must be real at build.

async function toFieldsStep(page: Page, category: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variantName);
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
}

async function createdFields(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return Object.fromEntries(
      useTemplateStore.getState().template.fields.map((f) => [f.title, f.value]),
    );
  });
}

test('a quiz created in the wizard marks the answer the author chose', async ({ page }) => {
  await toFieldsStep(page, 'Quiz', 'House Quiz');

  const setup = page.getByTestId('wz-setup');
  await expect(setup).toBeVisible();
  // The board's own default is B; the author picks C without ever opening the editor. Four
  // letters render as the shared control's segmented picker, not a dropdown - a small closed
  // choice is one press either way, which is the whole reason that control exists.
  await setup.getByTestId('wz-setup-correctAnswer-opt-C').click();

  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();

  const fields = await createdFields(page);
  expect(fields['Correct answer']).toBe('C');
  // The lines are untouched by the setup edit - the board still says what it said.
  expect(fields['Question']).toBeTruthy();
});

test('live state is not offered at create, only setup is', async ({ page }) => {
  await toFieldsStep(page, 'Quiz', 'House Quiz');

  const setup = page.getByTestId('wz-setup');
  // `correctAnswer` is decided when the quiz is written…
  await expect(setup.getByTestId('wz-setup-correctAnswer')).toBeVisible();
  // …while the contestant's pick and the audience percentages ride in on operator events, so
  // offering them here would invite an author to set a value the first event overwrites.
  await expect(setup.getByTestId('wz-setup-selectedAnswer')).toHaveCount(0);
  await expect(setup.getByTestId('wz-setup-audienceResults')).toHaveCount(0);
});

test('a countdown\'s duration and a scorebug\'s colours are setup too', async ({ page }) => {
  // The quiz proves a `select`; these are the other kinds the section has to render, and they
  // come from SELF-ASSEMBLED categories whose fields the design owns rather than the shared
  // assembler emitting them - which is exactly where a positional mapping could have been
  // wrong without anything noticing.
  await toFieldsStep(page, 'Timers & clocks', 'Clean Clock');
  const clock = page.getByTestId('wz-setup');
  await clock.getByTestId('wz-setup-minutes').fill('12');
  await finishIntoEditor(page);
  // The store is read only once the wizard has closed: the create lands as the modal goes, and
  // reading straight after the click returns the PREVIOUS project's fields.
  await expect(page.locator('.wz-modal')).toBeHidden();
  expect((await createdFields(page))['Timer (minutes)']).toBe('12');

  await toFieldsStep(page, 'Scoreboards', 'House Scorebug');
  const board = page.getByTestId('wz-setup');
  // The colour control is a swatch plus its hex box; the box is the one a spec can type into.
  await board.getByTestId('wz-setup-colourA').locator('..').locator('input.grow').fill('#123456');
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  expect((await createdFields(page))['Team A colour']).toBe('#123456');
});

test('a setup value lands on the field it names, for every type that has one', async ({ page }) => {
  // Registry-wide, because the write is POSITIONAL (declared field i is the template's i-th)
  // and the check is by TITLE. A type whose design emitted its fields in a different order
  // from the declaration would silently write the club colour into the period chip, and no
  // per-type spec would be looking. 25 types carry setup fields today.
  await page.goto('/app');
  const wrong = await page.evaluate(async () => {
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const { setupFields } = await import('/src/templates/types/graphicType.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const probe = (kind: string, field: { options?: { value: string }[] }) => {
      switch (kind) {
        case 'number': return '7';
        case 'color': return '#123456';
        case 'select': return field.options?.[field.options.length - 1]?.value ?? '';
        case 'lines': return 'PROBE | 1';
        default: return 'PROBE';
      }
    };
    const bad: string[] = [];
    let covered = 0;
    for (const type of TYPES) {
      const setup = setupFields(type);
      if (!setup.length) continue;
      const variant = variantById(type.designs[0].id);
      if (!variant) continue;
      covered += 1;
      const content = Object.fromEntries(setup.map((f) => [f.key, probe(f.kind, f)]));
      const byTitle = Object.fromEntries(variant.create({ content }).fields.map((f) => [f.title, f.value]));
      for (const f of setup) {
        if (byTitle[f.label] !== content[f.key]) {
          bad.push(`${type.id}.${f.key} (${f.kind}): wanted ${content[f.key]}, got ${String(byTitle[f.label])}`);
        }
      }
    }
    return { bad, covered };
  });
  expect(wrong.covered).toBeGreaterThan(20); // the measurement itself is reaching the registry
  expect(wrong.bad).toEqual([]);
});

test('a design with no setup values shows no setup section', async ({ page }) => {
  // A lower third is lines, a logo and nothing else - so the section must not appear at all
  // rather than appear empty. (The mutation half of the test above: a section that rendered
  // unconditionally would pass every assertion there and still be wrong here.)
  await toFieldsStep(page, 'Lower thirds', 'House Strap');
  await expect(page.getByTestId('wz-setup')).toHaveCount(0);
});

// ── The Style step's offer (docs/backlog/style-step-palettes-match-graphic.md) ────────────
//
// The same rule as the setup section above, one step later: what the wizard offers has to be
// what the wizard can change. The style contract declares all four palette colours whether or
// not a design paints with them, so the step used to offer fourteen packages to every design -
// and on one that paints no accent, three of them (Frost, Orchid and Mint, which differ in
// nothing else) rendered the identical graphic. "Nothing happens in the graphic. That's a bug."
//
// "Frosted Panel" is the accent-less witness and "Frosted Card" the accent-painting control.
// They are the same style family, so a run that lost the measurement and started answering by
// family would go red here rather than pass both.

/** Search Browse for a design by name, take it, and land on the Style step. */
async function toStyleStep(page: Page, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, variantName);
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await expect(page.getByTestId('wz-typeface')).toBeVisible();
}

/** The package names the step is offering, in order, with "Custom" left off. */
async function offeredPalettes(page: Page): Promise<string[]> {
  const names = await page.locator('.wz-palette:not([data-palette="custom"]) .wz-palette-name').allInnerTexts();
  return names.map((n) => n.trim());
}

test('a design that paints no accent is offered no package that only moves one', async ({ page }) => {
  await toStyleStep(page, 'Frosted Panel');

  // The bar is a promise about the graphic, so it never names a role the design does not paint.
  // Asserted on the role rather than on the bar's presence: this design paints text, so it still
  // gets a bar, and a step that had simply stopped drawing them would leave every package the
  // same rectangle - the same defect one size smaller.
  await expect(page.locator('[data-swatch-ink="accent"]')).toHaveCount(0);
  await expect(page.locator('[data-swatch-ink="text"]').first()).toBeVisible();
  await expect(page.locator('.wz-step h3').first()).toContainText('this design paints no accent');

  // Frost survives as the glass package; Orchid and Mint were the same offer wearing other
  // names. Which of the three is kept is the list's own order (the design's family first), so
  // the assertion is on the collapse, not on the winner.
  const offered = await offeredPalettes(page);
  expect(offered).toContain('Frost');
  expect(offered).not.toContain('Orchid');
  expect(offered).not.toContain('Mint');

  // THE ACTUAL RULE, measured rather than counted: every package still on offer builds a
  // different graphic. Asked of the emitted code rather than by clicking twelve swatches and
  // watching the preview settle - same question, and it cannot flake on a debounce. The `:root`
  // `--accent` declaration is normalised away because it is exactly what nothing reads here.
  const distinct = await page.evaluate(async (names) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { PALETTES } = await import('/src/model/wizard.ts');
    const variant = variantById('card03')!;
    const built = new Map<string, string>();
    for (const name of names) {
      const palette = PALETTES.find((p) => p.name === name)!;
      const t = variant.create({ palette });
      const key = `${t.html} ${t.css.replace(/--accent:[^;]*;/, '--accent: X;')} ${t.js}`;
      if (!built.has(key)) built.set(key, name);
    }
    return { offered: names.length, distinct: built.size };
  }, offered);
  expect(distinct.offered).toBeGreaterThan(1);
  expect(distinct.distinct).toBe(distinct.offered);
});

test('a design that paints an accent keeps every package and its accent bar', async ({ page }) => {
  // The mutation half: a step that had simply dropped the bar and deduplicated for everyone
  // would pass every assertion above and be wrong here.
  await toStyleStep(page, 'Frosted Card');

  const offered = await offeredPalettes(page);
  expect(offered).toEqual(expect.arrayContaining(['Frost', 'Orchid', 'Mint']));
  // One accent bar per package plus the Custom chip's.
  await expect(page.locator('[data-swatch-ink="accent"]')).toHaveCount(offered.length + 1);
  await expect(page.locator('.wz-step h3').first()).toContainText('one accent + neutrals');
});

test('a chip never renders as the same rectangle as its neighbour', async ({ page }) => {
  // "Disclaimer Strip" is the hard case: it paints neither an accent nor a panel, only the two
  // text roles. Draw the chip as ground-plus-accent-bar and all eight of its packages come out
  // pixel-identical under eight different names, which is the reported defect at a smaller size
  // rather than a fix for it. So the bar carries the loudest role the design DOES paint.
  await toStyleStep(page, 'Disclaimer Strip');
  await expect(page.locator('[data-swatch-ink="accent"]')).toHaveCount(0);

  const looks = await page.locator('.wz-palette:not([data-palette="custom"]) .wz-swatch').evaluateAll(
    (chips) => chips.map((chip) => {
      const bar = chip.querySelector('[data-swatch-ink]');
      return `${getComputedStyle(chip).backgroundColor}|${bar ? getComputedStyle(bar).backgroundColor : 'none'}`;
    }),
  );
  expect(looks.length).toBeGreaterThan(1);
  expect(new Set(looks).size).toBeGreaterThan(1);
});

test('the Custom rows are the roles the design actually paints with', async ({ page }) => {
  await toStyleStep(page, 'Frosted Panel');
  await page.locator('[data-palette="custom"]').click();
  const rows = page.locator('.wz-custom-colors');
  await expect(rows).toBeVisible();
  await expect(rows).toContainText('Panel');
  // An accent the graphic never reads is a colour picker wired to nothing.
  await expect(rows).not.toContainText('Accent');
});

test('the viewing target and size floors are off the template path', async ({ page }) => {
  // Measured 2026-09-02: on a catalog design, moving the target from TV to Mobile or the floor
  // from standard to safe left the composed preview document byte-identical. They are a rule
  // about what may SHIP, so they live where shipping happens - the export panel and the publish
  // sheet, both of which carry the same control - and on the AI step, where they ride the prompt
  // and change what gets drawn. Both of those are pinned in e2e/design-rules-product.spec.ts.
  await toStyleStep(page, 'Frosted Card');
  await expect(page.getByTestId('wz-viewing')).toHaveCount(0);
  await expect(page.getByTestId('wz-floors')).toHaveCount(0);
});
