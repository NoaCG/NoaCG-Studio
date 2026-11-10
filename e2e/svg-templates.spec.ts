// THE SVG TEMPLATES (docs/tutorials/svg-templates/, offered at /downloads#svg-templates): the
// ready-made Clean Studio set students open in Illustrator, restyle and import. Each file is
// imported through the real door exactly as the README says, put in a production and run: every
// named text arrives as a field and reaches the output, and each behaviour's controls change it.
// covers: docs/tutorials/svg-templates/**

import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoProduction } from './_svg-import';
import { settleDurableWrites } from './_durable';

interface Template { slug: string; name: string; recipe: string | null; preview: string }
const templates = JSON.parse(readFileSync(new URL('../docs/tutorials/svg-templates/templates.json', import.meta.url), 'utf8')) as Template[];
const file = (slug: string) => fileURLToPath(new URL(`../docs/tutorials/svg-templates/SVG/${slug}.svg`, import.meta.url));

/** The texts a template names in its Text layer, in drawing order - each one is a field. */
function namedTexts(slug: string): string[] {
  const svg = readFileSync(file(slug), 'utf8');
  const layer = svg.slice(svg.indexOf('<g id="Text"'));
  return [...layer.matchAll(/<text id="([^"]+)"/g)].map((m) => m[1].replace(/_/g, ' '));
}

const role = (air: FrameLocator, name: string) => air.locator(`[data-noacg-role~="${name}"]`);
const kind: Record<string, string> = { countdown: 'timer', clock: 'none' };

async function fieldFor(air: FrameLocator, title: string): Promise<string> {
  const field = await air.locator('svg').first().evaluate((_, name) => {
    const definition = (window as unknown as { SPXGCTemplateDefinition: { DataFields: { field: string; title: string }[] } }).SPXGCTemplateDefinition;
    return definition.DataFields.find((entry) => entry.title === name)?.field;
  }, title);
  expect(field, `the operator has a ${title} field`).toBeTruthy();
  return field!;
}

async function scoreLayer(air: FrameLocator, row: string) {
  const id = await air.locator('svg').first().evaluate((_, key) =>
    (window as unknown as { noacgFieldFor(role: string, key: string): string | null }).noacgFieldFor('score', key), row);
  expect(id, `score/${row} binds an artwork field`).toMatch(/^f\d+$/);
  return air.locator(`[id="${id}"]`);
}

async function importTemplate(page: Page, t: Template) {
  await page.goto('/app');
  await dropSvg(page, file(t.slug));
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  if (t.recipe === 'credits') {
    await expect(page.getByTestId('map-svg-credits-engine')).toHaveValue('editable');
    await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', 'role-above');
    await expect(page.getByTestId('map-svg-credits-list')).toContainText('Alex Rivera');
  } else {
    await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue(t.recipe ? kind[t.recipe] ?? t.recipe : 'none');
    await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
  }
  if (t.recipe === 'clock') {
    await expect(page.getByTestId('map-svg-clock-mode')).toHaveValue('none');
    await page.getByTestId('map-svg-clock-mode').selectOption('duration');
  }
  await intoProduction(page, t.name, `${t.name} template`);
  await settleDurableWrites(page);
}

for (const t of templates) {
  test(`${t.name} template imports, keeps every named text and runs its controls`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await importTemplate(page, t);
    if (t.recipe === 'credits') await page.getByTestId('cue-field-f1').fill('Director: Casey Hill\nCamera:\nRobin Vale\nAri Moss');
    await page.getByTestId('verb-take').click();
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    await expect(air.locator('svg').first()).toBeVisible();

    // Every text the Text layer names is an operator field (credits fold theirs into one list,
    // a clock owns its own readout).
    if (t.recipe !== 'credits') {
      for (const name of namedTexts(t.slug).filter((n) => n !== 'Clock' && !/^Score \d/.test(n))) await fieldFor(air, name);
    }

    switch (t.recipe) {
      case null: {
        // A plain template: retype its first field, Update, and the output follows.
        const first = namedTexts(t.slug)[0];
        const field = await fieldFor(air, first);
        await page.getByTestId(`cue-field-${field}`).fill('Technical difficulties');
        await page.getByTestId('verb-update').click();
        await expect(air.locator(`#${field}`)).toHaveText('Technical difficulties');
        break;
      }
      case 'quiz':
        await page.getByTestId('cue-pick-select-B').click();
        await expect(role(air, 'answer.selected/B')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-lock').click();
        await expect(role(air, 'locked')).toHaveClass(/imported-design-on/);
        break;
      case 'score': {
        const rows = namedTexts(t.slug).filter((n) => /^Score \d/.test(n)).length;
        for (let n = 1; n <= rows; n++) {
          await page.getByTestId(`cue-action-score${n}`).click();
          await expect(await scoreLayer(air, String(n))).toHaveText('1');
          await expect(role(air, `team.flash/${n}`)).toHaveClass(/imported-design-on/);
        }
        await page.getByTestId('cue-action-unscore1').click();
        await expect(await scoreLayer(air, '1')).toHaveText('0');
        break;
      }
      case 'countdown':
        // Clock is minutes, read off the drawn 1:00.
        await expect(page.getByTestId('cue-field-f1')).toHaveValue('1');
        await expect(air.locator('.imported-design-clock')).not.toHaveText('1:00', { timeout: 4_000 });
        await page.getByTestId('cue-action-pause').click();
        await expect(role(air, 'paused')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-start').click();
        await expect(role(air, 'paused')).not.toHaveClass(/imported-design-on/);
        break;
      case 'clock': {
        const readout = air.locator('.imported-design-clock');
        await expect(readout).toHaveAttribute('data-count', 'down');
        await expect(readout).not.toHaveText('5:00', { timeout: 4_000 });
        await page.getByTestId('cue-action-clock_pause').click();
        const held = await readout.textContent();
        await page.waitForTimeout(1_100);
        await expect(readout).toHaveText(held!);
        await page.getByTestId('cue-action-clock_reset').click();
        await expect(readout).toHaveText('5:00');
        break;
      }
      case 'credits':
        await expect(air.locator('.imported-design-credits-row')).toHaveText(['Director', 'Casey Hill', 'Camera', 'Robin Vale', 'Ari Moss']);
        break;
    }
    await page.getByTestId('verb-out').click();
    expect(errors).toEqual([]);
  });
}
