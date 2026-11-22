// THE CLEAN STUDIO TEMPLATES of the Template Library (docs/tutorials/template-library/, style
// `studio` in library.json, offered at /svg-templates): the ready-made set students open in
// Illustrator, restyle and import. Each file is
// imported through the real door exactly as the README says, put in a production and run: every
// named text arrives as a field and reaches the output, and each behaviour's controls change it.
//
// THE PICTURE IS CHECKED TOO, in every state the walk reaches (owner walk 2026-11-10: the credits
// rolled over their own title and through the rule under it, and nothing failed). `airProblems`
// reads the program output and names every visible text that overlaps another text, is cut by a
// shape it is not inside, or is cut off by the frame edge; a roll is checked at ten points.
// `NOACG_SHOTS=<dir>` also writes each checked frame, for a person to review the whole set at once.
//
// ONE SWEEP, BATCHED BY ROUTE (svg-template-library TL4, spec "Tests and budget"): every studio
// template runs in a batch of its route (plain fields, pictures, each recipe, each contract), one
// browser page per batch, each template walked whole as before. Two cases stand alone: the Live
// vote's own timing (AC-5) and the countdown's motion (AC-6).
// covers: docs/tutorials/template-library/**
// covers: src/templates/importedDesign/creditsRoll.ts

import { test, expect, type Browser, type FrameLocator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoProduction } from './_svg-import';
import { settleDurableWrites } from './_durable';
import { qrReader } from './_qr';
import { installGraphicBody } from './_graphicBody';

interface Template { slug: string; name: string; style: string; recipe: string | null; preview: string; contract?: string }
const templates = (JSON.parse(readFileSync(new URL('../docs/tutorials/template-library/library.json', import.meta.url), 'utf8')) as Template[])
  .filter((t) => t.style === 'studio');
const file = (slug: string) => fileURLToPath(new URL(`../docs/tutorials/template-library/SVG/${slug}.svg`, import.meta.url));

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
const kind: Record<string, string> = { countdown: 'timer', clock: 'none', vote: 'poll' };

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

/** The credits forms the studio set draws, each with the layout the import reads and the
 *  playback the author picks in the import step (recorded as author choice in library.json). */
const CREDIT_FORMS: Record<string, { layout: 'role-above' | 'role-beside'; playback: 'roll' | 'static' | 'cards' }> = {
  'end-credits': { layout: 'role-above', playback: 'roll' },
  'end-credits-columns': { layout: 'role-beside', playback: 'roll' },
  'end-credits-pager': { layout: 'role-above', playback: 'cards' },
  'end-credits-static': { layout: 'role-beside', playback: 'static' },
};

/** The picture slots a template draws (`f:` images in its Text layer), by their titles. */
function pictureSlots(slug: string): string[] {
  const svg = readFileSync(file(slug), 'utf8');
  return [...svg.matchAll(/<image[^>]*inkscape:label="f:([^"]+)"/g)].map((m) => m[1]);
}

/** The answer rows a quiz template draws (`Answer A`, `Answer B`, ...). */
const answerRows = (slug: string) => namedTexts(slug).filter((n) => /^Answer [A-Z]$/.test(n)).map((n) => n.slice(-1));
/** The rows a stepped list draws (`Item 1`, ...). */
const itemRows = (slug: string) => namedTexts(slug).filter((n) => /^Item \d+$/.test(n)).length;

async function importTemplate(page: Page, t: Template) {
  await page.goto('/app');
  await dropSvg(page, file(t.slug));
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  if (t.recipe === 'credits') {
    const form = CREDIT_FORMS[t.slug];
    await expect(page.getByTestId('map-svg-credits-engine')).toHaveValue('editable');
    await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', form.layout);
    await expect(page.getByTestId('map-svg-credits-list')).toContainText('Alex Rivera');
    // A still board or a deck of pages is the author's choice in the import step.
    if (form.playback !== 'roll') await page.getByTestId('map-svg-credits-playback').selectOption(form.playback);
  } else if (t.recipe === 'choice') {
    // A choice is an instanced part beside no full recipe: its options are offered by name.
    await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('none');
    await expect(page.getByTestId('map-svg-extras').locator('input[value="Status"]')).toHaveCount(3);
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

/** One template through the door, onto air, through its controls and off again. */
async function runTemplate(page: Page, browser: Browser, t: Template): Promise<void> {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on('pageerror', onError);
  await importTemplate(page, t);
  const form = CREDIT_FORMS[t.slug];
  // The list in the README's own format: the show title first, then a role and its names on
  // one line, commas between names. A blank line starts a new page.
  if (t.recipe === 'credits') {
    const list = form.playback === 'cards'
      ? 'Night Quiz\nDirector: Casey Hill\nCamera: Robin Vale, Ari Moss\n\nSound: Jo Berg'
      : 'Night Quiz\nDirector: Casey Hill\nCamera: Robin Vale, Ari Moss\nSound: Jo Berg';
    await page.locator('textarea[data-testid^="cue-field-"]').first().fill(list);
  }
  await page.getByTestId('verb-take').click();
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(air.locator('svg').first()).toBeVisible();

  // Every text the Text layer names is an operator field (credits fold theirs into one list,
  // a clock owns its own readout, a vote writes its rows and total from the round, a list its
  // items from the one Entries field).
  if (t.recipe !== 'credits') {
    const driven = (n: string) => n === 'Clock' || /^Score \d/.test(n)
      || (t.recipe === 'vote' && (/^(Option|Percent) \d/.test(n) || n === 'Total votes'))
      || (t.recipe === 'list' && /^Item \d/.test(n));
    for (const name of namedTexts(t.slug).filter((n) => !driven(n))) await fieldFor(air, name);
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
      // Read as the lines on air: a value that wraps into the room drawn for it is one tspan a line.
      const shown = () => air.locator(`#${field}`).evaluate((el) => {
        const lines = [...el.querySelectorAll('tspan')].map((line) => (line.textContent ?? '').trim()).filter(Boolean);
        return lines.length ? lines.join(' ') : (el.textContent ?? '').trim();
      });
      await expect.poll(shown).toBe('Technical difficulties');
      await checkAir(page, air, `${t.slug}-2-retyped`);
      // PICTURE SLOTS (D8 and the picture rows): each `f:` picture is an operator field bound to
      // its <image>; a picture sent to it replaces the drawn placeholder on air, and an empty
      // value puts the placeholder back.
      for (const slot of pictureSlots(t.slug)) {
        const id = await fieldFor(air, slot);
        const image = air.locator(`image[id="${id}"]`);
        const drawn = await image.getAttribute('href');
        expect(drawn, `${slot} draws its placeholder`).toMatch(/^data:image\/png/);
        const sent = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#e5484d"/></svg>').toString('base64');
        await air.locator('svg').first().evaluate((_, v) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [v.id]: v.sent })), { id, sent });
        await expect(image).toHaveAttribute('href', sent);
        await air.locator('svg').first().evaluate((_, v) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [v]: '' })), id);
        await expect(image).toHaveAttribute('href', drawn!);
      }
      // CAMERA WINDOWS (frames): nothing is painted inside a window, so the camera behind shows.
      const windows = [...readFileSync(file(t.slug), 'utf8').matchAll(/<rect id="(Window_\d+)"[^>]*\bx="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
      for (const [, name, x, y, w, h] of windows) {
        const painted = await air.locator('svg').first().evaluate((svg, at) => {
          const art = svg.closest('svg') as SVGSVGElement;
          const point = new DOMPoint(at.x, at.y).matrixTransform(art.getScreenCTM()!);
          return document.elementsFromPoint(point.x, point.y)
            .filter((el) => el instanceof SVGGraphicsElement && !(el instanceof SVGSVGElement) && !(el instanceof SVGGElement))
            .filter((el) => { const fill = getComputedStyle(el).fill; return fill !== 'none' && !(el instanceof SVGTextElement); })
            .map((el) => el.id || el.tagName);
        }, { x: Number(x) + Number(w) / 2, y: Number(y) + Number(h) / 2 });
        expect(painted, `${name} stays transparent at its centre`).toEqual([]);
      }
      // AUDIENCE CONTRACTS (svg-template-library TL1): the QR draws the Join link the cue holds,
      // and long translated words fit their plates without cutting or overlap (AC-10).
      const long: Record<string, Record<string, string>> = {
        'join-link': {
          Label: 'Machen Sie mit bei unserer Livesendung',
          'Call to action': 'Scannen Sie den Code mit der Kamera Ihres Telefons, um abzustimmen und der Moderation eine Frage zu senden.',
        },
        message: {
          From: 'Maria-Magdalena Österberg-Lindqvist',
          Message: 'Wie lange haben Sie gebraucht, um das ganze Bühnenbild für diese Sendung zu bauen, und was war dabei am schwierigsten?',
        },
      };
      if (t.contract === 'join-link') {
        const link = 'https://noacg.studio/j/friday-night-live';
        await page.getByTestId(`cue-field-${await fieldFor(air, 'Join link')}`).fill(link);
        await page.getByTestId('verb-update').click();
        // A phone reading the code on air gets exactly this link.
        const reader = await qrReader(browser);
        try {
          const code = air.locator('[class$="-qr-code"]');
          await expect(code).toBeVisible();
          await expect.poll(async () => reader.read(await code.screenshot()), { message: 'the QR on air decodes to the Join link' }).toBe(link);
        } finally {
          await reader.close();
        }
      }
      if (t.contract && long[t.contract]) {
        for (const [title, value] of Object.entries(long[t.contract])) await page.getByTestId(`cue-field-${await fieldFor(air, title)}`).fill(value);
        await page.getByTestId('verb-update').click();
        for (const value of Object.values(long[t.contract])) await expect(air.locator('text', { hasText: value.slice(0, 20) }).first()).toBeVisible();
        await checkAir(page, air, `${t.slug}-3-long`);
      }
      break;
    }
    case 'vote': {
      // Voting open: the badge shows, the bars follow the counts, the figures wait for the result.
      const options = await fieldFor(air, 'Options');
      await page.getByTestId(`cue-field-${options}`).fill('Coast | 3\nForest | 1\nCity | 0\nMountains | 0');
      await page.getByTestId('verb-update').click();
      await expect(role(air, 'option/1')).toHaveText('Coast');
      await expect(role(air, 'badge')).toHaveClass(/imported-design-on/);
      await expect(role(air, 'percent/1')).not.toHaveClass(/imported-design-on/);
      // The counts move the bars the designer drew: three votes to one.
      const barWidth = (n: number) => role(air, `bar/${n}`).evaluate((el) => el.getBoundingClientRect().width);
      await expect.poll(async () => (await barWidth(1)) / Math.max(1, await barWidth(2)), { message: 'Coast leads Forest three to one' }).toBeCloseTo(3, 0);
      await checkAir(page, air, `${t.slug}-2-voting`);
      await page.getByTestId('cue-action-close').click();
      await expect(role(air, 'badge')).not.toHaveClass(/imported-design-on/);
      await page.getByTestId('cue-action-result').click();
      await expect(role(air, 'percent/1')).toHaveText('75%');
      await expect(role(air, 'percent/1')).toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-3-result`);
      await page.getByTestId('cue-action-call').click();
      await expect(role(air, 'winner/1')).toHaveClass(/imported-design-on/);
      await expect(role(air, 'winner/2')).not.toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-4-winner`);
      break;
    }
    case 'quiz': {
      // Every answer the board draws: select B, lock it in, reveal B correct and the rest wrong.
      const rows = answerRows(t.slug);
      expect(rows.length, `${t.slug} draws answers`).toBeGreaterThanOrEqual(2);
      await page.locator('[data-testid^="cue-field-"][data-testid$="-opt-B"]').first().click();
      await page.getByTestId('cue-pick-select-B').click();
      await expect(role(air, 'answer.selected/B')).toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-2-selected`);
      await page.getByTestId('cue-action-lock').click();
      await expect(role(air, 'locked')).toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-3-locked`);
      await page.getByRole('button', { name: /Reveal correct/ }).click();
      await expect(role(air, 'answer.correct/B')).toHaveClass(/imported-design-on/);
      for (const row of rows.filter((r) => r !== 'B')) await expect(role(air, `answer.wrong/${row}`)).toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-4-revealed`);
      break;
    }
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
      // New game sets every score back to 0.
      await page.getByTestId('cue-action-newGame').click();
      for (let n = 1; n <= rows; n++) await expect(await scoreLayer(air, String(n))).toHaveText('0');
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
      // Reset puts the length back and holds it there, with the bar full again.
      await page.getByTestId('cue-action-reset').click();
      await expect(air.locator('.imported-design-clock')).toHaveText('1:00');
      const full = await air.locator('[id="Track"]').evaluate((el) => el.getBoundingClientRect().width);
      await expect.poll(width, { message: 'the bar is full again' }).toBeCloseTo(full, 0);
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
    case 'list': {
      // One Entries field fills the drawn items; Next reveals them one at a time, from the last
      // number down (the recipe's default), each staying up as the next arrives.
      const n = itemRows(t.slug);
      const entries = Array.from({ length: n }, (_, i) => `Entry number ${i + 1}`);
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Entries')}`).fill(entries.join('\n'));
      await page.getByTestId('verb-update').click();
      for (let k = 1; k <= n; k++) await expect(role(air, `item/${k}`)).not.toHaveClass(/imported-design-on/);
      await page.getByTestId('verb-next').click();
      await expect(role(air, `item/${n}`)).toHaveText(entries[n - 1]);
      await expect(role(air, `item/${n}`)).toHaveClass(/imported-design-on/);
      await expect(role(air, `item/${n - 1}`)).not.toHaveClass(/imported-design-on/);
      await page.getByTestId('verb-next').click();
      await expect(role(air, `item/${n - 1}`)).toHaveClass(/imported-design-on/);
      await expect(role(air, `item/${n}`)).toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-2-next`);
      break;
    }
    case 'choice': {
      // Choosing a status shows only that look.
      const option = (label: string) => air.locator(`[data-noacg-role~="choice.status.option/${label}" i]`);
      await page.getByRole('button', { name: /Replay/ }).click();
      await expect(option('Replay')).toHaveClass(/imported-design-on/);
      await expect(option('Live')).not.toHaveClass(/imported-design-on/);
      await expect(option('Delayed')).not.toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-2-replay`);
      await page.getByRole('button', { name: /Delayed/ }).click();
      await expect(option('Delayed')).toHaveClass(/imported-design-on/);
      await expect(option('Replay')).not.toHaveClass(/imported-design-on/);
      break;
    }
    case 'credits': {
      // The first line is the show title, in the drawn title's look; the title is no field of its own.
      expect(await air.locator('svg').first().evaluate(() => (window as unknown as { SPXGCTemplateDefinition: { DataFields: { title: string }[] } }).SPXGCTemplateDefinition.DataFields.map((f) => f.title))).not.toContain('Heading');
      const rowsOnAir = air.locator('.imported-design-credits-row');
      if (form.playback === 'cards') {
        // A deck: the first page with the title, Next card the second, each holding still.
        await expect(rowsOnAir).toHaveText(['Night Quiz', 'Director', 'Casey Hill', 'Camera', 'Robin Vale', 'Ari Moss']);
        expect(await airProblems(air), 'the first page').toEqual([]);
        await page.getByTestId('cue-actions').getByRole('button', { name: /Next card$/ }).click();
        await expect(rowsOnAir).toHaveText(['Sound', 'Jo Berg']);
        await expect.poll(() => airProblems(air), { message: 'the second page' }).toEqual([]);
        break;
      }
      await expect(rowsOnAir).toHaveText(['Night Quiz', 'Director', 'Casey Hill', 'Camera', 'Robin Vale', 'Ari Moss', 'Sound', 'Jo Berg']);
      const heading = air.locator('.imported-design-credits-row[data-noacg-credits="title"]');
      expect(await heading.evaluate((el) => getComputedStyle(el).fontSize), 'the title keeps the drawn title size').toBe(await air.locator('[data-noacg-credit-title]').evaluate((el) => getComputedStyle(el).fontSize));
      if (form.layout === 'role-beside') {
        // Two columns: each role sits left of its first name, on the same line.
        const box = (text: string) => rowsOnAir.filter({ hasText: new RegExp(`^${text}$`) }).evaluate((el) => el.getBoundingClientRect());
        for (const [roleText, name] of [['Director', 'Casey Hill'], ['Camera', 'Robin Vale'], ['Sound', 'Jo Berg']]) {
          const [r, n] = [await box(roleText), await box(name)];
          expect(r.right, `${roleText} sits left of ${name}`).toBeLessThan(n.left);
          expect(Math.abs((r.top + r.bottom) / 2 - (n.top + n.bottom) / 2), `${roleText} and ${name} share a line`).toBeLessThan(r.height / 2);
        }
      }
      if (form.playback === 'static') {
        // A still board: no roll, and the frame is clean as it stands.
        await expect.poll(async () => air.locator('svg').first().evaluate(() => (window as unknown as { noacgCreditsLast: { still?: boolean } | null }).noacgCreditsLast?.still ?? false)).toBe(true);
        expect(await air.locator('svg').first().evaluate(() => (window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween ?? null), 'nothing rolls').toBeNull();
        await expect.poll(() => airProblems(air), { message: 'the still board' }).toEqual([]);
        break;
      }
      // ONE TEXT SCROLLS: the title travels with the list, and at no point of the roll does a
      // line cross another line or the rule drawn under the title.
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
      // A title too long for the window shrinks into it, as a row does, rather than running off.
      const drawnSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      await page.locator('textarea[data-testid^="cue-field-"]').first().fill('The Extraordinary Grand Final of the Weekly Quiz Night Championship 2026\nDirector: Casey Hill');
      await page.getByTestId('verb-update').click();
      await page.getByTestId('verb-retake').click();
      await expect(heading).toHaveText('The Extraordinary Grand Final of the Weekly Quiz Night Championship 2026');
      const fitted = await heading.evaluate((el) => {
        const frame = el.closest('svg')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { size: parseFloat(getComputedStyle(el).fontSize), width: box.width, room: frame.width };
      });
      expect(fitted.size, `the long title shrinks: ${JSON.stringify(fitted)}`).toBeLessThan(drawnSize);
      expect(fitted.width, `and fits the window: ${JSON.stringify(fitted)}`).toBeLessThanOrEqual(fitted.room);
      break;
    }
  }
  await page.getByTestId('verb-out').click();
  page.off('pageerror', onError);
  expect(errors, `${t.name}: no page errors`).toEqual([]);
}

// ONE BATCHED SWEEP (spec "Tests and budget"): the templates run in batches by route, each
// template still walked whole and checked on air exactly as before, so a batch shares one
// browser page instead of one test per template. A batch holds what fits the 120 s ceiling.
const BATCH = 5;
const routeOf = (t: Template) => t.recipe ?? (t.contract ? `contract:${t.contract}` : pictureSlots(t.slug).length ? 'pictures' : 'plain');
const batches: { label: string; items: Template[] }[] = [];
for (const route of [...new Set(templates.map(routeOf))]) {
  const items = templates.filter((t) => routeOf(t) === route);
  for (let i = 0; i < items.length; i += BATCH) batches.push({ label: route, items: items.slice(i, i + BATCH) });
}

for (const { label, items } of batches) {
  test(`${label}: ${items.map((t) => t.name).join(', ')}: each template imports, keeps every named text, runs its controls and stays clean on air`, async ({ page, browser }) => {
    test.setTimeout(120_000);
    for (const t of items) await test.step(t.name, () => runTemplate(page, browser, t));
  });
}

// LIVE VOTE ON ITS OWN (AC-5): an imported vote never closes itself, and its figures wait for the
// result unless the production asks for them live (`Live figures`), which is the imported board's
// own timing, apart from a built-in Vote results board's Figures selector.
test('Live vote: an imported vote stays open until the operator closes it, and Live figures shows the figures while it is open', async ({ page }) => {
  test.setTimeout(120_000);
  const t = templates.find((entry) => entry.slug === 'live-vote')!;
  await importTemplate(page, t);
  await page.getByTestId('verb-take').click();
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId(`cue-field-${await fieldFor(air, 'Options')}`).fill('Coast | 3\nForest | 1');
  await page.getByTestId('verb-update').click();
  await expect(role(air, 'badge')).toHaveClass(/imported-design-on/);
  // Nothing closes it: a while later it is still open, the badge up and the figures waiting.
  await page.waitForTimeout(3_000);
  await expect(role(air, 'badge')).toHaveClass(/imported-design-on/);
  await expect(role(air, 'percent/1')).not.toHaveClass(/imported-design-on/);
  // Live figures: the shares show while the vote is still open.
  await page.getByTestId(`cue-field-${await fieldFor(air, 'Live figures')}`).selectOption('live');
  await page.getByTestId('verb-update').click();
  await expect(role(air, 'percent/1')).toHaveClass(/imported-design-on/);
  await expect(role(air, 'percent/1')).toHaveText('75%');
  await expect(role(air, 'badge')).toHaveClass(/imported-design-on/);
  // Back to waiting for the result; only the operator's Close ends the vote.
  await page.getByTestId(`cue-field-${await fieldFor(air, 'Live figures')}`).selectOption('');
  await page.getByTestId('verb-update').click();
  await expect(role(air, 'percent/1')).not.toHaveClass(/imported-design-on/);
  await page.getByTestId('cue-action-close').click();
  await expect(role(air, 'badge')).not.toHaveClass(/imported-design-on/);
});

// THE COUNTDOWN'S MOTION (AC-6, spec "Countdown motion"): the last ten seconds pulse while the
// clock runs and hold still while it is paused; zero flashes once and rests; Reset clears both;
// reduced motion shows the same looks with no motion. Read off the look the runtime moves.
test('Countdown: the last ten seconds pulse, zero flashes once, and Pause, Reset and reduced motion behave', async ({ page }) => {
  test.setTimeout(120_000);
  const t = templates.find((entry) => entry.slug === 'game-timer')!;
  await importTemplate(page, t);
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const motion = (name: string) => role(air, name).evaluate((el) => {
    const w = window as unknown as { gsap: { getProperty(el: Element, p: string): number } };
    const move = (el as Element & { noacgMove?: { name: string; tween: { isActive(): boolean } } | null }).noacgMove;
    return { move: move ? move.name : null, active: move ? move.tween.isActive() : false, opacity: Number(w.gsap.getProperty(el, 'opacity')), scale: Number(w.gsap.getProperty(el, 'scale')) };
  });
  // 0.2 minutes is twelve seconds: two before the ten-second warning.
  await page.getByTestId('cue-field-f1').fill('0.2');
  await page.getByTestId('verb-take').click();
  await expect(role(air, 'warning')).not.toHaveClass(/imported-design-on/);
  expect((await motion('warning')).move).toBeNull();
  await expect(role(air, 'warning')).toHaveClass(/imported-design-on/, { timeout: 6_000 });
  await expect.poll(async () => (await motion('warning')).move).toBe('pulse');
  // It really moves: the opacity is seen below its rest within one beat.
  await expect.poll(async () => (await motion('warning')).opacity, { timeout: 2_000 }).toBeLessThan(0.9);
  // Pause holds the look still and visible; Start pulses again.
  await page.getByTestId('cue-action-pause').click();
  await expect(role(air, 'paused')).toHaveClass(/imported-design-on/);
  await expect(role(air, 'warning')).toHaveClass(/imported-design-on/);
  await expect.poll(async () => motion('warning')).toMatchObject({ move: null, opacity: 1 });
  await page.getByTestId('cue-action-start').click();
  await expect.poll(async () => (await motion('warning')).move).toBe('pulse');
  // Zero: the warning goes, Time up flashes once and then rests, readable.
  await expect(role(air, 'expired')).toHaveClass(/imported-design-on/, { timeout: 15_000 });
  await expect(role(air, 'warning')).not.toHaveClass(/imported-design-on/);
  expect((await motion('warning')).move).toBeNull();
  expect((await motion('expired')).move).toBe('flash');
  await expect.poll(async () => motion('expired'), { timeout: 3_000 }).toMatchObject({ move: 'flash', active: false, opacity: 1, scale: 1 });
  await expect(air.locator('.imported-design-clock')).toHaveText('0:00');
  // Reset: the length again, nothing lit and nothing moving, the bar full.
  await page.getByTestId('cue-action-reset').click();
  await expect(air.locator('.imported-design-clock')).toHaveText('0:12');
  await expect(role(air, 'expired')).not.toHaveClass(/imported-design-on/);
  expect(await motion('expired')).toMatchObject({ move: null, opacity: 1, scale: 1 });
  // Reduced motion: the same looks light, and nothing moves.
  await page.getByTestId('verb-out').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('verb-take').click();
  await expect(role(air, 'warning')).toHaveClass(/imported-design-on/, { timeout: 6_000 });
  await page.waitForTimeout(600);
  expect(await motion('warning')).toMatchObject({ move: null, opacity: 1 });
  await expect(role(air, 'expired')).toHaveClass(/imported-design-on/, { timeout: 15_000 });
  expect(await motion('expired')).toMatchObject({ move: null, opacity: 1, scale: 1 });
});

// THE MOTION IN EVERY EXPORT TARGET (AC-7, spec "Exports"): the pulse and the flash are the
// graphic's own runtime, so each package is loaded the way its host loads it and driven the way
// its host drives it, and the same looks move. OGraf is also sought out of order in non-real
// time, where a seek must land on the same frame whatever came before it (AC-6).
test('Countdown: the pulse and the flash play in every export target, and OGraf seeks land on the same frame in any order', async ({ page, context }) => {
  test.setTimeout(120_000);
  const t = templates.find((entry) => entry.slug === 'game-timer')!;
  await importTemplate(page, t);
  // Three seconds: inside the warning from the first tick, at zero three seconds later.
  const short = { f1: '0.05' };
  const packages = await page.evaluate(async ({ production, short }) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const { EXPORT_TARGETS } = await __noacgImport('/src/export/registry.ts');
    const template = shows.loadShows().find((s: { name: string }) => s.name === production)!.graphics[0].template;
    const out: Record<string, Record<string, string>> = {};
    for (const target of EXPORT_TARGETS) {
      const zip = await target.build(template, { sampleData: short, graphicUsage: 'both' });
      const files: Record<string, string> = {};
      for (const name of Object.keys(zip.files)) if (!zip.files[name].dir && /\.(html|js|mjs|css|json)$/.test(name)) files[name] = await zip.file(name)!.async('string');
      out[target.id] = files;
    }
    return out;
  }, { production: `${t.name} template`, short });
  expect(Object.keys(packages).sort()).toEqual(['casparcg', 'h2r', 'html-overlay', 'liveos', 'ograf', 'spx']);
  // The non-real-time gate reads an SVG's namespace names as names, and still refuses a real
  // address beside them.
  const gate = await page.evaluate(async (production) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const { validateOgrafOfflineCompatibility } = await __noacgImport('/src/export/targets/ograf.ts');
    const template = shows.loadShows().find((s: { name: string }) => s.name === production)!.graphics[0].template;
    return {
      own: validateOgrafOfflineCompatibility(template).errors,
      fetched: validateOgrafOfflineCompatibility({ ...template, html: template.html.replace('</svg>', '<image href="https://example.com/a.png"/></svg>') }).errors,
      lookalike: validateOgrafOfflineCompatibility({ ...template, js: `${template.js}\nvar u = 'http://www.w3.org/2000/svg.example.com/x';` }).errors,
    };
  }, `${t.name} template`);
  expect(gate.own, 'the imported countdown may be sought').toEqual([]);
  expect(gate.fetched).toContain('External network dependencies are not available during deterministic rendering.');
  expect(gate.lookalike).toContain('External network dependencies are not available during deterministic rendering.');

  /** One package's graphic page with its own css and js inlined, as its folder would serve it. */
  const inlined = (files: Record<string, string>) => {
    const html = Object.keys(files).find((n) => n.endsWith('.html') && !/control|panel|index|controller/i.test(n.split('/').pop()!))!;
    const dir = html.slice(0, html.lastIndexOf('/') + 1);
    const at = (ref: string) => files[dir + ref.replace(/^\.\//, '')];
    return files[html]
      .replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, ref) => (at(ref) !== undefined ? `<style>${at(ref)}</style>` : tag))
      .replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (tag, a, ref) => (at(ref) !== undefined ? `<script${a}>${at(ref).replace(/<\/script>/gi, '<\\/script>')}</script>` : tag));
  };

  // The page-based targets: CasparCG and H2R update then play, SPX likewise, the overlay plays itself.
  for (const id of ['spx', 'casparcg', 'h2r', 'html-overlay']) {
    const view = await context.newPage();
    await view.setContent(inlined(packages[id]), { waitUntil: 'load' });
    if (id !== 'html-overlay') {
      await view.evaluate((data) => {
        const w = window as unknown as { update(raw: string): void; play(): void };
        w.update(JSON.stringify(data));
        w.play();
      }, short);
    }
    const look = (name: string) => view.evaluate((n) => {
      const el = document.querySelector(`[data-noacg-role~="${n}"]`) as (Element & { noacgMove?: { name: string; tween: { isActive(): boolean } } | null }) | null;
      return el ? { lit: el.classList.contains('imported-design-on'), move: el.noacgMove ? el.noacgMove.name : null } : null;
    }, name);
    await expect.poll(() => look('warning'), { message: `${id}: the last stretch pulses`, timeout: 5_000 }).toEqual({ lit: true, move: 'pulse' });
    await expect.poll(() => look('expired'), { message: `${id}: zero flashes`, timeout: 8_000 }).toEqual({ lit: true, move: 'flash' });
    expect(await look('warning'), `${id}: the pulse stops at zero`).toEqual({ lit: false, move: null });
    await view.close();
  }

  // OGraf and LiveOS (the same Graphic): a renderer's real-time lifecycle.
  for (const id of ['ograf', 'liveos']) {
    const files = packages[id];
    const root = Object.keys(files).find((n) => n.endsWith('graphic.mjs'))!.replace(/graphic\.mjs$/, '');
    const origin = `http://${id}-motion.local/`;
    await page.route(`${origin}**`, (route) => {
      const body = files[root + new URL(route.request().url()).pathname.replace(/^\//, '')];
      return body == null ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body });
    });
    await installGraphicBody(page);
    const seen = await page.evaluate(async ({ origin, id, short }) => {
      const mod = await import(`${origin}graphic.mjs`);
      customElements.define(`${id}-motion-under-test`, mod.default);
      const el = document.createElement(`${id}-motion-under-test`) as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown>; dispose(): Promise<unknown> };
      document.body.appendChild(el);
      await el.load({ data: short, renderType: 'realtime', renderCharacteristics: {} });
      await el.playAction({});
      const look = (n: string) => {
        const node = graphicBody(el).querySelector(`[data-noacg-role~="${n}"]`) as (Element & { noacgMove?: { name: string } | null }) | null;
        return node ? { lit: node.classList.contains('imported-design-on'), move: node.noacgMove ? node.noacgMove.name : null } : null;
      };
      const until = async (n: string, move: string, ms: number) => {
        for (let waited = 0; waited < ms; waited += 100) {
          if (look(n)?.move === move) return look(n);
          await new Promise((r) => setTimeout(r, 100));
        }
        return look(n);
      };
      const warning = await until('warning', 'pulse', 5_000);
      const expired = await until('expired', 'flash', 8_000);
      const after = look('warning');
      await el.dispose();
      return { warning, expired, after };
    }, { origin, id, short });
    expect(seen, `${id}: real time`).toEqual({ warning: { lit: true, move: 'pulse' }, expired: { lit: true, move: 'flash' }, after: { lit: false, move: null } });
  }

  // OGraf non-real time: a schedule, then seeks in order and shuffled; each frame is the same.
  const files = packages.ograf;
  const root = Object.keys(files).find((n) => n.endsWith('graphic.mjs'))!.replace(/graphic\.mjs$/, '');
  const manifest = JSON.parse(files[Object.keys(files).find((n) => n.endsWith('.ograf.json'))!]);
  expect(manifest.supportsNonRealTime, 'the countdown is offered for non-real time').toBe(true);
  await page.route('http://ograf-seek.local/**', (route) => {
    const body = files[root + new URL(route.request().url()).pathname.replace(/^\//, '')];
    return body == null ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body });
  });
  const frames = await page.evaluate(async (short) => {
    const mod = await import('http://ograf-seek.local/graphic.mjs');
    customElements.define('ograf-seek-under-test', mod.default);
    const el = document.createElement('ograf-seek-under-test') as HTMLElement & { load(p: unknown): Promise<unknown>; setActionsSchedule(p: unknown): Promise<unknown>; goToTime(p: unknown): Promise<unknown>; dispose(): Promise<unknown> };
    document.body.appendChild(el);
    await el.load({ data: short, renderType: 'non-realtime', renderCharacteristics: {} });
    await el.setActionsSchedule({ schedule: [{ timestamp: 0, action: { type: 'playAction', params: {} } }] });
    const snapshot = async (timestamp: number) => {
      await el.goToTime({ timestamp });
      const doc = graphicBody(el).querySelector('iframe')!.contentDocument!;
      const gsap = (doc.defaultView as unknown as { gsap: { getProperty(node: Element, p: string): number } }).gsap;
      const read = (n: string) => {
        const node = doc.querySelector(`[data-noacg-role~="${n}"]`)!;
        return { lit: node.classList.contains('imported-design-on'), opacity: Number(gsap.getProperty(node, 'opacity')).toFixed(3), scale: Number(gsap.getProperty(node, 'scale')).toFixed(3) };
      };
      return { timestamp, warning: read('warning'), expired: read('expired') };
    };
    // In order, every fifth of a second through the entrance, the count and past zero.
    const sequential = [];
    for (let at = 200; at <= 7000; at += 200) sequential.push(await snapshot(at));
    const zero = sequential.find((f) => f.expired.lit)?.timestamp ?? -1;
    // Then out of order, each seek on a fresh frame: the warning, zero, after zero, again.
    const picks = [zero + 1400, 600, zero, 1400, zero + 200, 600, zero];
    const shuffled = [];
    for (const at of picks) if (at > 0 && at <= 7000) shuffled.push(await snapshot(at));
    await el.dispose();
    return { sequential, shuffled, zero };
  }, short);
  const at = (ms: number) => frames.sequential.find((f) => f.timestamp === ms)!;
  expect(frames.zero, 'zero is reached in the walk').toBeGreaterThan(0);
  // Every seek lands on the frame the in-order walk saw.
  for (const frame of frames.shuffled) expect(frame, `seek to ${frame.timestamp}`).toEqual(at(frame.timestamp));
  expect(frames.shuffled.length).toBe(7);
  // Before zero the warning is lit and pulsing: its opacity leaves 1 and moves from frame to frame.
  const warned = frames.sequential.filter((f) => f.timestamp < frames.zero && f.warning.lit);
  expect(warned.length, 'the warning shows before zero').toBeGreaterThan(5);
  expect(warned.some((f) => Number(f.warning.opacity) < 0.9), 'the pulse dims the warning').toBe(true);
  expect(new Set(warned.map((f) => f.warning.opacity)).size, 'and keeps moving').toBeGreaterThan(3);
  // At zero the warning goes and Time up flashes in: larger than drawn on its first frame, at
  // rest (opacity 1, scale 1) a second later, and never again after.
  expect(at(frames.zero).warning.lit).toBe(false);
  expect(Number(at(frames.zero).expired.scale), 'the flash on its first frame').toBeGreaterThan(1);
  for (const f of frames.sequential.filter((x) => x.timestamp >= frames.zero + 1000)) expect(f.expired, `rest at ${f.timestamp}`).toEqual({ lit: true, opacity: '1.000', scale: '1.000' });
});
