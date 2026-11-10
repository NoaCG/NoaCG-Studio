// THE SVG TEMPLATES (docs/tutorials/svg-templates/, offered at /downloads#svg-templates): the
// ready-made Clean Studio set students open in Illustrator, restyle and import. Each file is
// imported through the real door exactly as the README says, put in a production and run: every
// named text arrives as a field and reaches the output, and each behaviour's controls change it.
//
// THE PICTURE IS CHECKED TOO, in every state the walk reaches (owner walk 2026-11-10: the credits
// rolled over their own title and through the rule under it, and nothing failed). `airProblems`
// reads the program output and names every visible text that overlaps another text, is cut by a
// shape it is not inside, or is cut off by the frame edge; a roll is checked at ten points.
// `NOACG_SHOTS=<dir>` also writes each checked frame, for a person to review the whole set at once.
// covers: docs/tutorials/svg-templates/**
// covers: src/templates/importedDesign/creditsRoll.ts

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


const SHOTS = process.env.NOACG_SHOTS ?? '';
// The program monitor is small on the page: review pictures are taken at four times its density.
if (SHOTS) test.use({ deviceScaleFactor: 4 });

/** Everything wrong with the frame on air right now, in words; empty when it is clean.
 *
 *  A text's box is its line box, which is taller than its ink, so a sixth is taken off the top and
 *  the bottom before boxes are compared; a box a clipping window cuts is compared as clipped. A
 *  shape matters to a text when they cross without the shape holding the text: a plate behind a
 *  line holds it, a rule drawn through a line does not. */
async function airProblems(air: FrameLocator): Promise<string[]> {
  return air.locator('svg').first().evaluate((root) => {
    type Box = { l: number; t: number; r: number; b: number };
    const art = root.closest('svg') as SVGSVGElement;
    const frame = art.getBoundingClientRect();
    const shown = (el: Element): boolean => {
      for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      }
      return true;
    };
    // A clipping window above an element (the inner svg a credits roll runs in), as the rectangle
    // its own x, y, width and height give it on screen; a text past its edge is hidden there, not
    // broken, so it is compared as clipped and never reported for leaving the frame.
    const windowOf = (el: Element): Box | null => {
      for (let e = el.parentElement; e && e !== art; e = e.parentElement) {
        if (e instanceof SVGSVGElement && e.parentElement instanceof SVGGraphicsElement) {
          const m = (e.parentElement as SVGGraphicsElement).getScreenCTM();
          if (!m) return null;
          const x = e.x.baseVal.value, y = e.y.baseVal.value, w = e.width.baseVal.value, h = e.height.baseVal.value;
          const p = [new DOMPoint(x, y).matrixTransform(m), new DOMPoint(x + w, y + h).matrixTransform(m)];
          return { l: Math.min(p[0].x, p[1].x), t: Math.min(p[0].y, p[1].y), r: Math.max(p[0].x, p[1].x), b: Math.max(p[0].y, p[1].y) };
        }
      }
      return null;
    };
    const cut = (r: Box, w: Box): Box | null => {
      const c = { l: Math.max(r.l, w.l), t: Math.max(r.t, w.t), r: Math.min(r.r, w.r), b: Math.min(r.b, w.b) };
      return c.r - c.l > 1 && c.b - c.t > 1 ? c : null;
    };
    const clip = (el: Element, r: Box): Box | null => {
      const w = windowOf(el);
      return w ? cut(r, w) : r;
    };
    const boxOf = (el: Element, inset = 0): Box | null => {
      const g = el.getBoundingClientRect();
      if (!(g.width > 0 && g.height > 0) || !shown(el)) return null;
      const cut = g.height * inset;
      return clip(el, { l: g.left, t: g.top + cut, r: g.right, b: g.bottom - cut });
    };
    const cross = (a: Box, b: Box) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2;
    const holds = (o: Box, i: Box) => o.l <= i.l + 2 && o.t <= i.t + 2 && o.r >= i.r - 2 && o.b >= i.b - 2;
    const name = (el: Element) => `"${(el.textContent ?? '').trim().slice(0, 30)}"`;
    const texts = [...art.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim() && !t.closest('[class$="-credits"]'))
      .map((el) => ({ el, box: boxOf(el, 1 / 6), rolled: !!windowOf(el) }))
      .filter((t): t is { el: SVGTextElement; box: Box; rolled: boolean } => !!t.box);
    const shapes = [...art.querySelectorAll('rect, path, polygon, polyline, line, ellipse, circle')]
      .map((el) => ({ el, box: boxOf(el) }))
      .filter((s): s is { el: Element; box: Box } => !!s.box);
    const out: string[] = [];
    texts.forEach((a, i) => {
      // Wholly outside the frame is off screen; partly outside is cut off on air.
      const seen = cut(a.box, { l: frame.left, t: frame.top, r: frame.right, b: frame.bottom });
      if (seen && !a.rolled && !holds({ l: frame.left, t: frame.top, r: frame.right, b: frame.bottom }, a.box)) out.push(`${name(a.el)} is cut off by the frame edge`);
      for (const b of texts.slice(i + 1)) if (cross(a.box, b.box)) out.push(`${name(a.el)} overlaps ${name(b.el)}`);
      // A shape's edge through a text is fine where a plate painted above that shape holds the
      // text: a badge drawn across a card's edge covers the edge it sits on.
      const covered = (s: Element) => shapes.some((h) => h.el !== s && holds(h.box, a.box) && !!(s.compareDocumentPosition(h.el) & Node.DOCUMENT_POSITION_FOLLOWING));
      for (const s of shapes) if (cross(a.box, s.box) && !holds(s.box, a.box) && !covered(s.el)) out.push(`${name(a.el)} is cut by a <${s.el.tagName}>${s.el.id ? ' #' + s.el.id : ''}`);
    });
    return out;
  });
}

/** The frame on air is clean once its entrance settles; with NOACG_SHOTS, a picture of it. */
async function checkAir(page: Page, air: FrameLocator, label: string): Promise<void> {
  await expect.poll(() => airProblems(air), { message: `${label}: the frame on air`, timeout: 6_000 }).toEqual([]);
  if (SHOTS) {
    await page.waitForTimeout(1_200);           // the entrance finishes before the picture
    await page.getByTestId('program-stage').screenshot({ path: `${SHOTS}/${label}.png` });
  }
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
    await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', t.slug.endsWith('columns') ? 'role-beside' : 'role-above');
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
  test(`${t.name} template imports, keeps every named text, runs its controls and stays clean on air`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await importTemplate(page, t);
    // The list in the README's own format: the show title first, then a role and its names on
    // one line, commas between names.
    if (t.recipe === 'credits') await page.locator('textarea[data-testid^="cue-field-"]').first().fill('Night Quiz\nDirector: Casey Hill\nCamera: Robin Vale, Ari Moss\nSound: Jo Berg');
    await page.getByTestId('verb-take').click();
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    await expect(air.locator('svg').first()).toBeVisible();

    // Every text the Text layer names is an operator field (credits fold theirs into one list,
    // a clock owns its own readout).
    if (t.recipe !== 'credits') {
      for (const name of namedTexts(t.slug).filter((n) => n !== 'Clock' && !/^Score \d/.test(n))) await fieldFor(air, name);
      await checkAir(page, air, `${t.slug}-1-take`);
    }

    switch (t.recipe) {
      case null: {
        // A plain template: retype its first field with a long value, Update, and the output
        // follows and still fits.
        const first = namedTexts(t.slug)[0];
        const field = await fieldFor(air, first);
        await page.getByTestId(`cue-field-${field}`).fill('Technical difficulties');
        await page.getByTestId('verb-update').click();
        await expect(air.locator(`#${field}`)).toHaveText('Technical difficulties');
        await checkAir(page, air, `${t.slug}-2-retyped`);
        break;
      }
      case 'quiz':
        await page.locator('[data-testid^="cue-field-"][data-testid$="-opt-B"]').first().click();
        await page.getByTestId('cue-pick-select-B').click();
        await expect(role(air, 'answer.selected/B')).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-2-selected`);
        await page.getByTestId('cue-action-lock').click();
        await expect(role(air, 'locked')).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-3-locked`);
        await page.getByRole('button', { name: /Reveal correct/ }).click();
        await expect(role(air, 'answer.correct/B')).toHaveClass(/imported-design-on/);
        for (const row of ['A', 'C', 'D']) await expect(role(air, `answer.wrong/${row}`)).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-4-revealed`);
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
        // A score keeps its drawn size from one digit to three, and stays inside its plate.
        const score = await scoreLayer(air, '1');
        const size = () => score.evaluate((el) => getComputedStyle(el).fontSize);
        const drawn = await size();
        for (const target of [9, 10, 100]) {
          while (Number(await score.textContent()) < target) await page.getByTestId('cue-action-score1').click();
          await expect(score).toHaveText(String(target));
          expect(await size(), `${target} keeps the drawn size`).toBe(drawn);
          await checkAir(page, air, `${t.slug}-2-score-${target}`);
        }
        break;
      }
      case 'countdown': {
        // Clock is minutes, read off the drawn 1:00.
        await expect(page.getByTestId('cue-field-f1')).toHaveValue('1');
        await expect(air.locator('.imported-design-clock')).not.toHaveText('1:00', { timeout: 4_000 });
        // The timer bar is the time left: it shortens as the clock runs.
        const bar = air.locator('[data-noacg-role~="bar"], [id="Timer_bar"]').first();
        const width = () => bar.evaluate((el) => el.getBoundingClientRect().width);
        const before = await width();
        await expect.poll(width, { message: 'the timer bar shortens as time runs', timeout: 5_000 }).toBeLessThan(before - 2);
        await page.getByTestId('cue-action-pause').click();
        await expect(role(air, 'paused')).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-2-paused`);
        await page.getByTestId('cue-action-start').click();
        await expect(role(air, 'paused')).not.toHaveClass(/imported-design-on/);
        break;
      }
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
      case 'credits': {
        // The first line is the show title, in the drawn title's look; the title is no field of its own.
        await expect(air.locator('.imported-design-credits-row')).toHaveText(['Night Quiz', 'Director', 'Casey Hill', 'Camera', 'Robin Vale', 'Ari Moss', 'Sound', 'Jo Berg']);
        expect(await air.locator('svg').first().evaluate(() => (window as unknown as { SPXGCTemplateDefinition: { DataFields: { title: string }[] } }).SPXGCTemplateDefinition.DataFields.map((f) => f.title))).not.toContain('Show title');
        // ONE TEXT SCROLLS: the title travels with the list, and at no point of the roll does a
        // line cross another line or the rule drawn under the title.
        const heading = air.locator('.imported-design-credits-row[data-noacg-credits="title"]');
        expect(await heading.evaluate((el) => getComputedStyle(el).fontSize), 'the title keeps the drawn title size').toBe(await air.locator('[data-noacg-credit-title]').evaluate((el) => getComputedStyle(el).fontSize));
        const at = (share: number) => air.locator('svg').first().evaluate((_, p) => {
          const tween = (window as unknown as { noacgCreditsTween: { pause(): void; progress(v: number): void } }).noacgCreditsTween;
          tween.pause();
          tween.progress(p);
        }, share);
        await expect.poll(() => air.locator('svg').first().evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
        const ys: number[] = [];
        for (let k = 0; k <= 10; k++) {
          await at(k / 10);
          ys.push(await heading.evaluate((el) => el.getBoundingClientRect().top));
          expect(await airProblems(air), `the roll at ${k * 10}%`).toEqual([]);
          if (SHOTS && k % 2 === 1) await page.getByTestId('program-stage').screenshot({ path: `${SHOTS}/${t.slug}-roll-${k * 10}.png` });
        }
        for (let k = 1; k < ys.length; k++) expect(ys[k], 'the title moves up with the list').toBeLessThan(ys[k - 1]);
        break;
      }
    }
    await page.getByTestId('verb-out').click();
    expect(errors).toEqual([]);
  });
}
