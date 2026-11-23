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

import { test, expect, type Browser, type BrowserContext, type FrameLocator, type Page } from '@playwright/test';
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

/** The drawn width of a layer by its label (`Segment 3`): a gauge's full length. */
const drawnWidth = (slug: string, label: string) => Number(new RegExp(`inkscape:label="${label}"[^>]*width="([\\d.]+)"`).exec(readFileSync(file(slug), 'utf8'))?.[1]);

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
        // A crawl's window (TL6): the runtime's own clipping group, its clip rectangle on screen.
        const clipRef = /url\(#(noacg-crawl-[^)]+)\)/.exec(e.getAttribute('clip-path') ?? '')?.[1];
        const clipRect = clipRef ? art.querySelector(`[id="${clipRef}"] rect`) as SVGRectElement | null : null;
        if (clipRect && e instanceof SVGGraphicsElement) {
          const m = e.getScreenCTM();
          if (!m) return null;
          const x = clipRect.x.baseVal.value, y = clipRect.y.baseVal.value, w = clipRect.width.baseVal.value, h = clipRect.height.baseVal.value;
          const p = [new DOMPoint(x, y).matrixTransform(m), new DOMPoint(x + w, y + h).matrixTransform(m)];
          return { l: Math.min(p[0].x, p[1].x), t: Math.min(p[0].y, p[1].y), r: Math.max(p[0].x, p[1].x), b: Math.max(p[0].y, p[1].y) };
        }
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

/** The choices a template draws (`choice:Level/Advisory`, ...), by name in drawing order. */
function choiceNames(slug: string): string[] {
  return [...new Set([...readFileSync(file(slug), 'utf8').matchAll(/inkscape:label="choice:([^/"]+)\//g)].map((m) => m[1]))];
}

/** One choice a template draws (the first, unless named): its name, its options in drawing
 *  order, and the one option drawn visible, where the choice starts (null: it starts empty). */
function choiceOf(slug: string, name = choiceNames(slug)[0]): { name: string; options: string[]; start: string | null } {
  // Each option group's whole tag: hidden by a `display` attribute or a style, wherever it sits.
  const groups = [...readFileSync(file(slug), 'utf8').matchAll(/<g\b[^>]*>/g)]
    .map(([tag]) => ({ tag, label: /inkscape:label="choice:([^/"]+)\/([^"]+)"/.exec(tag) }))
    .filter((g): g is { tag: string; label: RegExpExecArray } => !!g.label && g.label[1] === name);
  const shown = groups.filter((g) => !/\bdisplay\s*[:=]\s*"?\s*none/.test(g.tag));
  return { name, options: groups.map((g) => g.label[2]), start: shown.length === 1 ? shown[0].label[2] : null };
}

/** The answer rows a quiz template draws (`Answer A`, `Answer B`, ...). */
const answerRows = (slug: string) => namedTexts(slug).filter((n) => /^Answer [A-Z]$/.test(n)).map((n) => n.slice(-1));
/** The rows a stepped list draws (`Item 1`, ...). */
const itemRows = (slug: string) => namedTexts(slug).filter((n) => /^Item \d+$/.test(n)).length;

/** A `Clock` text beside a recipe that is not itself a clock: a match clock counting up. */
const hasMatchClock = (t: Template) => t.recipe !== 'clock' && t.recipe !== 'countdown' && namedTexts(t.slug).includes('Clock');

/** Pop-up alerts imported with Hold on air ticked. */
const HELD = new Set(['chat-highlight']);

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
    const choice = choiceOf(t.slug);
    await expect(page.getByTestId('map-svg-extras').locator(`input[value="${choice.name}"]`)).toHaveCount(choice.options.length);
  } else if (t.recipe === 'alert') {
    // A pop-up alert is never proposed: the author chooses it (README, Pop-up alert).
    await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('none');
    await page.getByTestId('map-svg-behaviour-kind').selectOption('alert');
    // Hold on air is the author's tick (README, Chat highlight); off, the alert is as it was.
    await expect(page.getByTestId('map-svg-option-hold')).not.toBeChecked();
    if (HELD.has(t.slug)) await page.getByTestId('map-svg-option-hold').check();
  } else {
    await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue(t.recipe ? kind[t.recipe] ?? t.recipe : 'none');
    await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
  }
  // A drawn choice beside a full recipe is offered by its name, one box per option.
  if (t.recipe !== 'choice') {
    for (const name of choiceNames(t.slug)) await expect(page.getByTestId('map-svg-extras').locator(`input[value="${name}"]`)).toHaveCount(choiceOf(t.slug, name).options.length);
  }
  // A match clock beside the score (Scorebug): the author chooses how Clock counts (CLOCKS.md).
  if (hasMatchClock(t)) {
    await expect(page.getByTestId('map-svg-clock-mode')).toHaveValue('none');
    await page.getByTestId('map-svg-clock-mode').selectOption('count-up');
  }
  // A POLL RESULT is the vote recipe with its typed figures shown from the take: the author's
  // choice at import (library README), recorded here as the box the author ticks.
  if (t.slug === 'poll-result') {
    await expect(page.getByTestId('map-svg-poll-figures')).not.toBeChecked();
    await page.getByTestId('map-svg-poll-figures').check();
  }
  if (t.recipe === 'clock') {
    await expect(page.getByTestId('map-svg-clock-mode')).toHaveValue('none');
    await page.getByTestId('map-svg-clock-mode').selectOption('duration');
  }
  await intoProduction(page, t.name, `${t.name} template`);
  await settleDurableWrites(page);
}

/** A drawn choice through its buttons: each option shows only its own look; a choice that
 *  starts on an option is never empty. */
async function walkChoice(page: Page, air: FrameLocator, t: Template, name: string): Promise<void> {
  // Choosing an option shows only that look. A choice drawn with one option visible starts
  // on it and is never empty (TL5: Alert level, Public notice); one drawn all hidden starts
  // with nothing shown (Live bug).
  const choice = choiceOf(t.slug, name);
  const option = (label: string) => air.locator(`[data-noacg-role~="choice.${choice.name.toLowerCase()}.option/${label}" i]`);
  const only = async (label: string | null) => {
    for (const o of choice.options) {
      if (o === label) await expect(option(o), `${o} shows`).toHaveClass(/imported-design-on/);
      else await expect(option(o), `${o} is hidden`).not.toHaveClass(/imported-design-on/);
    }
  };
  // An option's button reads its name after the control's mark ("⚡ Replay").
  const press = (label: string) => page.getByTestId('cue-actions').getByRole('button', { name: new RegExp(`^\\W*${label}$`) });
  await only(choice.start);
  const state = await fieldFor(air, choice.name);
  // A field of a few values is drawn as buttons, a longer one as a dropdown; either lists them.
  const field = page.getByTestId(`cue-field-${state}`);
  const segmented = (await field.getAttribute('role')) === 'radiogroup';
  const offered = await field.locator(segmented ? 'button' : 'option').allTextContents();
  expect(offered, 'the operator picks among the options, and an empty value only where the choice starts empty').toEqual(choice.start ? choice.options : ['-', ...choice.options]);
  // Every option is a button of its own, greyed only while it is the one showing; the start
  // stays live (data alone can show another option while the machine rests on the start).
  for (const o of choice.options) await expect(press(o)).toBeEnabled();
  for (const [i, o] of choice.options.filter((label) => label !== choice.start).entries()) {
    await press(o).click();
    await only(o);
    await expect(press(o), `${o} is greyed while it shows`).toBeDisabled();
    if (i === 0) await checkAir(page, air, `${t.slug}-2-${o.toLowerCase()}`);
  }
  // CLEAR (TL5): a choice that starts empty goes back to empty; Clear stays live, since data alone
  // can show an option while the machine rests on none.
  if (!choice.start) {
    await press('Clear').click();
    await only(null);
    await air.locator('svg').first().evaluate((_, v) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [v.id]: v.value })), { id: state, value: choice.options[0].toLowerCase() });
    await only(choice.options[0]);
    await expect(press('Clear'), 'Clear takes away an option data showed').toBeEnabled();
    await press('Clear').click();
    await only(null);
    if (segmented) await expect(field.getByRole('button', { name: '-', exact: true })).toHaveAttribute('aria-pressed', 'true');
    else await expect(field).toHaveValue('');
  }
  // A value that names no option (a cue saved before the choice had a start, a host sending
  // an empty level) shows the start: a choice that starts on an option is never empty.
  if (choice.start) {
    await air.locator('svg').first().evaluate((_, id) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [id]: '' })), state);
    await only(choice.start);
    await air.locator('svg').first().evaluate((_, id) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [id]: 'nothing-drawn' })), state);
    await only(choice.start);
    // A level sent as data while the machine rests on the start: the start's button brings it back.
    await page.getByTestId('verb-out').click();
    await page.getByTestId('verb-take').click();
    const other = choice.options.find((o) => o !== choice.start)!;
    await air.locator('svg').first().evaluate((_, v) => (window as unknown as { update(raw: string): void }).update(JSON.stringify({ [v.id]: v.value })), { id: state, value: other.toLowerCase() });
    await only(other);
    await expect(press(choice.start)).toBeEnabled();
    await press(choice.start).click();
    await only(choice.start);
  }
  // ALERT LEVEL (AC-10): every level reads without colour and without flashing - its look
  // carries the level's word, and nothing on it moves.
  if (t.slug === 'alert-level') {
    for (const o of choice.options) {
      await press(o).click();
      await expect(option(o).locator('text')).toHaveText(o.toUpperCase());
      await expect(option(o).locator('text')).toBeVisible();
      const still = await option(o).evaluate((el) => {
        const nodes = [el, ...el.querySelectorAll('*')] as (Element & { noacgMove?: unknown })[];
        return nodes.every((n) => !n.noacgMove && getComputedStyle(n).animationName === 'none');
      });
      expect(still, `${o}: no motion and no flashing`).toBe(true);
    }
  }
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
      || (t.recipe === 'vote' && (/^(Option|Percent|Count) \d/.test(n) || n === 'Total votes'))
      || (t.recipe === 'list' && /^Item \d/.test(n))
      || (t.recipe === 'reveal' && n === 'Price')
      || (t.recipe === 'ranking' && /^Position \d/.test(n))
      || (t.recipe === 'meter' && (n === 'Percent' || /^(Tier|Threshold) \d/.test(n)))
      || (t.recipe === 'crawl' && n === 'Crawl')
      || (t.recipe === 'wordcloud' && /^Word \d+$/.test(n));
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
      const options = await fieldFor(air, 'Options');
      // POLL RESULT (AC-5, its own case beside Live vote and Vote results): the operator types the
      // question and the rows, and the board shows them at once, figures included, with no press.
      if (t.slug === 'poll-result') {
        await page.getByTestId(`cue-field-${await fieldFor(air, 'Question')}`).fill('Which day suits the final?');
        await page.getByTestId(`cue-field-${options}`).fill('Saturday | 62\nSunday | 27\nFriday | 11');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'question')).toHaveText('Which day suits the final?');
        await expect(role(air, 'option/2')).toHaveText('Sunday');
        await expect(role(air, 'percent/1')).toHaveText('62%');
        for (const n of [1, 2, 3]) await expect(role(air, `percent/${n}`)).toHaveClass(/imported-design-on/);
        const barOf = (n: number) => role(air, `bar/${n}`).evaluate((el) => el.getBoundingClientRect().width);
        await expect.poll(async () => (await barOf(1)) / Math.max(1, await barOf(3)), { message: 'Saturday is drawn about 62 to 11 against Friday' }).toBeCloseTo(62 / 11, 0);
        await checkAir(page, air, `${t.slug}-2-typed`);
        // A new set of rows replaces the figures on air, still with no press.
        await page.getByTestId(`cue-field-${options}`).fill('Saturday | 1\nSunday | 3');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'percent/2')).toHaveText('75%');
        await expect(role(air, 'percent/3')).toHaveText('0%');
        break;
      }
      // Voting open: the badge shows, the bars follow the counts, the figures wait for the result.
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
      // A board that draws each option's count (TL5) prints it with the share, timed the same.
      if (namedTexts(t.slug).includes('Count 1')) {
        await expect(role(air, 'count/1')).toHaveText('3');
        await expect(role(air, 'count/2')).toHaveText('1');
        await expect(role(air, 'count/1')).toHaveClass(/imported-design-on/);
        // The count is written by the vote, never typed: no operator field is made of it.
        const titles = await air.locator('svg').first().evaluate(() => (window as unknown as { SPXGCTemplateDefinition: { DataFields: { title: string }[] } }).SPXGCTemplateDefinition.DataFields.map((f) => f.title));
        expect(titles.filter((title) => /^Count \d/.test(title)), 'no Count field').toEqual([]);
        // A row the next round does not list reads 0, never the last round's count.
        await page.getByTestId(`cue-field-${options}`).fill('Coast | 2');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'count/1')).toHaveText('2');
        await expect(role(air, 'count/2')).toHaveText('0');
        await page.getByTestId(`cue-field-${options}`).fill('Coast | 3\nForest | 1\nCity | 0\nMountains | 0');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'count/2')).toHaveText('1');
      }
      await checkAir(page, air, `${t.slug}-3-result`);
      await page.getByTestId('cue-action-call').click();
      await expect(role(air, 'winner/1')).toHaveClass(/imported-design-on/);
      await expect(role(air, 'winner/2')).not.toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-4-winner`);
      break;
    }
    case 'quiz': {
      // Every answer the board draws: select B, lock it in, reveal B correct and the rest wrong.
      let rows = answerRows(t.slug);
      expect(rows.length, `${t.slug} draws answers`).toBeGreaterThanOrEqual(2);
      // ROWS IN USE (TL5, Rules Q1-Q3: Quiz show): a board drawing an Answer row plays as many
      // answers as have text. Two answers: C and D emptied, their rows go, and a pick of a row
      // not in use lights nothing.
      const drawsRows = readFileSync(file(t.slug), 'utf8').includes('inkscape:label="Answer row A"');
      if (drawsRows) {
        for (const row of rows) await expect(role(air, `answer.row/${row}`), `row ${row} in use`).toHaveClass(/imported-design-on/);
        for (const row of ['C', 'D']) await page.getByTestId(`cue-field-${await fieldFor(air, `Answer ${row}`)}`).fill('');
        await page.getByTestId('verb-update').click();
        for (const row of ['C', 'D']) await expect(role(air, `answer.row/${row}`), `row ${row} is not in use`).not.toHaveClass(/imported-design-on/);
        for (const row of ['A', 'B']) await expect(role(air, `answer.row/${row}`)).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-2-two-answers`);
        await page.locator('[data-testid^="cue-field-"][data-testid$="-opt-C"]').first().click();
        await page.getByTestId('cue-pick-select-C').click();
        await expect(role(air, 'answer.selected/C'), 'a pick of a row not in use lights nothing').not.toHaveClass(/imported-design-on/);
        rows = ['A', 'B'];
      }
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
      if (drawsRows) {
        for (const row of ['C', 'D']) await expect(role(air, `answer.wrong/${row}`), `no verdict on row ${row}, not in use`).not.toHaveClass(/imported-design-on/);
        // Typed back on air, a row is in use again: its row shows and the verdict marks it.
        await page.getByTestId(`cue-field-${await fieldFor(air, 'Answer C')}`).fill('Venus');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'answer.row/C')).toHaveClass(/imported-design-on/);
        await expect(role(air, 'answer.wrong/C')).toHaveClass(/imported-design-on/);
        await expect(role(air, 'answer.row/D')).not.toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-5-three-answers`);
      }
      break;
    }
    case 'meter': {
      // TIERS ON THE GOAL METER (TL5, Rules M1-M6: Milestone track). The Milestones box starts with
      // the tiers as drawn, so the take shows the drawing, nothing reached at 0.
      const tiers = namedTexts(t.slug).filter((n) => /^Tier \d/.test(n)).map((n) => n.slice(5));
      const svgText = readFileSync(file(t.slug), 'utf8');
      const drawn = (name: string) => new RegExp(`inkscape:label="${name}"[^>]*>([^<]*)<`).exec(svgText)?.[1] ?? '';
      const milestones = await fieldFor(air, 'Milestones');
      await expect(page.getByTestId(`cue-field-${milestones}`)).toHaveValue(tiers.map((k) => `${drawn(`Tier ${k}`)} | ${drawn(`Threshold ${k}`)}`).join('\n'));
      const lit = (r: string, on: boolean) => (on ? expect(role(air, r), `${r} shows`).toHaveClass(/imported-design-on/) : expect(role(air, r), `${r} is hidden`).not.toHaveClass(/imported-design-on/));
      for (const k of tiers) {
        await expect(role(air, `tier/${k}`)).toHaveText(drawn(`Tier ${k}`));
        await lit(`tier/${k}`, true);
        await lit(`tier.reached/${k}`, false);
      }
      // Current past two tiers: they light, the line runs a part of the way to the third, and the
      // percent is of Target.
      const full: Record<string, number> = {};
      for (const k of tiers) full[k] = drawnWidth(t.slug, `Segment ${k}`);
      const share = (k: string) => role(air, `tier.bar/${k}`).evaluate((el, w) => (el as SVGGraphicsElement).getBBox().width / w, full[k]);
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Current')}`).fill('18400');
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Target')}`).fill('50000');
      await page.getByTestId('verb-update').click();
      await expect(role(air, 'percent')).toHaveText('36.8%');
      for (const k of tiers) await lit(`tier.reached/${k}`, Number(k) <= 2);
      await expect.poll(() => share('2'), { message: 'the line runs past the second tier' }).toBeCloseTo(1, 2);
      await expect.poll(() => share('3'), { message: 'and (18,400 - 15,000) / 15,000 of the way to the third' }).toBeCloseTo(3400 / 15000, 2);
      await expect.poll(() => share('4')).toBeCloseTo(0, 2);
      await checkAir(page, air, `${t.slug}-2-reached`);
      // Three lines: the fourth tier hides with its node and figure; typed lines are written.
      await page.getByTestId(`cue-field-${milestones}`).fill('Kickoff | 1,000\nHalfway | 15,000\nStretch | $30,000');
      await page.getByTestId('verb-update').click();
      await expect(role(air, 'tier/1')).toHaveText('Kickoff');
      await expect(role(air, 'tier.figure/3')).toHaveText('$30,000');
      for (const r of ['tier/4', 'tier.figure/4', 'tier.row/4']) await lit(r, false);
      for (const r of ['tier/3', 'tier.figure/3', 'tier.row/3']) await lit(r, true);
      await checkAir(page, air, `${t.slug}-3-three-tiers`);
      // Every listed tier reached; an emptied box hides every tier.
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Current')}`).fill('30000');
      await page.getByTestId('verb-update').click();
      for (const k of ['1', '2', '3']) await lit(`tier.reached/${k}`, true);
      await lit('tier.reached/4', false);
      await page.getByTestId(`cue-field-${milestones}`).fill('');
      await page.getByTestId('verb-update').click();
      for (const k of tiers) await lit(`tier/${k}`, false);
      break;
    }
    case 'score': {
      const rows = namedTexts(t.slug).filter((n) => /^Score \d/.test(n)).length;
      for (let n = 1; n <= rows; n++) {
        await page.getByTestId(`cue-action-score${n}`).click();
        await expect(await scoreLayer(air, String(n))).toHaveText('1');
        // A drawn flash shows as the point lands (Match status draws none).
        if (readFileSync(file(t.slug), 'utf8').includes(`inkscape:label="Flash ${n}"`)) await expect(role(air, `team.flash/${n}`)).toHaveClass(/imported-design-on/);
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
      // A drawn Full time (TL5: Scorebug, Match board, Esports score) shows once the game is called.
      if (readFileSync(file(t.slug), 'utf8').includes('inkscape:label="Full time"')) {
        await expect(role(air, 'final')).not.toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-final').click();
        await expect(role(air, 'final')).toHaveClass(/imported-design-on/);
        await checkAir(page, air, `${t.slug}-3-full-time`);
      }
      // The texts beside the teams and scores (a period breakdown, a map, a detail line) are the
      // operator's: each one retyped reaches the output.
      for (const [i, name] of namedTexts(t.slug).filter((n) => !/^(Team|Score) \d$/.test(n) && n !== 'Clock').entries()) {
        const id = await fieldFor(air, name);
        const value = String(i + 7);
        await page.getByTestId(`cue-field-${id}`).fill(value);
        await page.getByTestId('verb-update').click();
        await expect(air.locator(`[id="${id}"]`)).toHaveText(value);
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
    case 'ranking': {
      // STANDINGS (TL5): raising the last row's points moves its name, points and plate into first
      // place; the position numbers stay in their slots, written with the place of whoever is there.
      const rows = namedTexts(t.slug).filter((n) => /^Points \d/.test(n)).length;
      const last = String(rows);
      const nameOf = async (row: string) => {
        const id = await air.locator('svg').first().evaluate((_, r) => (window as unknown as { noacgFieldFor(role: string, key: string): string | null }).noacgFieldFor('competitor', r), row);
        expect(id, `competitor/${row} binds an artwork field`).toMatch(/^f\d+$/);
        return air.locator(`[id="${id}"]`);
      };
      const competitor = await nameOf(last);
      const leader = await nameOf('1');
      const top = (l: typeof leader) => l.evaluate((el) => el.getBoundingClientRect().top);
      const firstPlace = await top(leader);
      expect(await top(competitor), 'the last row starts below the first').toBeGreaterThan(firstPlace + 1);
      await page.getByTestId(`cue-field-${await fieldFor(air, `Points ${last}`)}`).fill('99');
      await page.getByTestId('verb-update').click();
      await expect.poll(() => top(competitor), { message: 'the row with 99 points moves to first place' }).toBeCloseTo(firstPlace, 0);
      await expect.poll(() => top(leader), { message: 'the old leader moves down a place' }).toBeGreaterThan(firstPlace + 1);
      for (let n = 1; n <= rows; n++) await expect(role(air, `position/${n}`), `the slot's number stays ${n}`).toHaveText(String(n));
      await checkAir(page, air, `${t.slug}-2-moved`);
      // A long title stays clear of whatever is drawn beside it (the Status tag).
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Title')}`).fill('PREMIER LEAGUE TABLE - MATCHWEEK 12');
      await page.getByTestId('verb-update').click();
      await checkAir(page, air, `${t.slug}-3-long-title`);
      // +1 under a competitor's own name moves its points; Reset points sets every row to 0.
      await page.getByTestId('cue-action-up1').click();
      await expect(air.locator(`[id="${await fieldFor(air, 'Points 1')}"]`)).toHaveText('25');
      await page.getByTestId('cue-action-resetPoints').click();
      for (let n = 1; n <= rows; n++) await expect(air.locator(`[id="${await fieldFor(air, `Points ${n}`)}"]`)).toHaveText('0');
      // Every row tied on 0 shares first place.
      for (let n = 1; n <= rows; n++) await expect(role(air, `position/${n}`)).toHaveText('1');
      break;
    }
    case 'choice': {
      await walkChoice(page, air, t, choiceNames(t.slug)[0]);
      break;
    }
    case 'reveal': {
      // REVEAL (TL5: Winner card, Award reveal, Q&A card, Nominee reveal): taken sealed under the
      // cover; Reveal shows the typed text. A drawn `show:` layer is a switch beside it: Show and
      // Hide set its field, so a host that only sends data can raise it too.
      const reveal = await fieldFor(air, 'The reveal');
      await page.getByTestId(`cue-field-${reveal}`).fill('Jordan Okafor');
      await page.getByTestId('verb-update').click();
      await expect(role(air, 'cover')).toHaveClass(/imported-design-on/);
      await expect(role(air, 'secret')).not.toHaveClass(/imported-design-on/);
      await page.getByTestId('cue-action-reveal').click();
      await expect(role(air, 'secret')).toHaveText('Jordan Okafor');
      await expect(role(air, 'secret')).toHaveClass(/imported-design-on/);
      await expect(role(air, 'cover')).not.toHaveClass(/imported-design-on/);
      await checkAir(page, air, `${t.slug}-2-revealed`);
      // Each `show:` switch the template draws beside the reveal (Celebration, Suspense): Show
      // raises it, Hide puts it away, each greyed where it cannot act; the winner stays.
      for (const [, name] of readFileSync(file(t.slug), 'utf8').matchAll(/inkscape:label="show:([^"]+)"/g)) {
        const slug = name.toLowerCase();
        const look = role(air, `switch.${slug}.on`);
        await expect(look).not.toHaveClass(/imported-design-on/);
        await expect(page.getByTestId(`cue-action-${slug}_hide`)).toBeDisabled();
        await page.getByTestId(`cue-action-${slug}_show`).click();
        await expect(look).toHaveClass(/imported-design-on/);
        await expect(page.getByTestId(`cue-action-${slug}_show`)).toBeDisabled();
        await checkAir(page, air, `${t.slug}-3-${slug}`);
        await page.getByTestId(`cue-action-${slug}_hide`).click();
        await expect(look).not.toHaveClass(/imported-design-on/);
        await expect(page.getByTestId(`cue-action-${slug}_show`)).toBeEnabled();
        await expect(role(air, 'secret')).toHaveClass(/imported-design-on/);
      }
      break;
    }
    case 'alert': {
      // POP-UP ALERT (author choice; TL5: Transition, Match event, Chat highlight): Next clears
      // it; taken again, it holds, then clears itself.
      const design = air.locator('.imported-design');
      await expect(design).not.toHaveCSS('opacity', '0');
      // HOLD ON AIR (Chat highlight): held, it outlasts the hold; Take it off clears it.
      if (HELD.has(t.slug)) {
        await page.getByTestId('cue-action-hold').click();
        await expect(page.getByTestId('cue-action-hold'), 'Hold is greyed while held').toBeDisabled();
        await page.waitForTimeout(9_500);
        await expect(design, 'held past the eight-second hold').not.toHaveCSS('opacity', '0');
        await page.getByTestId('cue-action-dismiss').click();
        await expect(design).toHaveCSS('opacity', '0', { timeout: 5_000 });
        await page.getByTestId('verb-out').click();
        await page.getByTestId('verb-take').click();
        await expect(design).not.toHaveCSS('opacity', '0');
      } else {
        await expect(page.getByTestId('cue-action-hold')).toHaveCount(0);
      }
      await page.getByTestId('verb-next').click();
      await expect(design).toHaveCSS('opacity', '0', { timeout: 5_000 });
      await page.getByTestId('verb-out').click();
      await page.getByTestId('verb-take').click();
      await expect(design).not.toHaveCSS('opacity', '0');
      await expect(design).toHaveCSS('opacity', '0', { timeout: 20_000 });
      break;
    }
    case 'rotation': {
      // ROTATION (TL6, Rules T1 to T4): the slides take turns, one at a time. Every field named
      // with a slide's number shows with that slide only. Hold keeps the slide, Next slide moves
      // on (held or counting), Resume moves on and counts again. The six-second timer itself is
      // the export case's, where every host waits it out together.
      const slides = [...readFileSync(file(t.slug), 'utf8').matchAll(/inkscape:label="Slide (\d+)"/g)].map((m) => m[1]).sort();
      const ownFields = async (k: string) => Promise.all([...namedTexts(t.slug), ...pictureSlots(t.slug)].filter((n) => n.endsWith(` ${k}`)).map((n) => fieldFor(air, n)));
      const showing = async (k: string) => {
        for (const other of slides) {
          const lit = other === k;
          await expect(air.locator(`g[data-noacg-role~="slide/${other}"]`).first(), `Slide ${other} ${lit ? 'shows' : 'is hidden'}`).toHaveClass(lit ? /imported-design-on/ : /^(?!.*imported-design-on)/);
          for (const id of await ownFields(other)) await expect(air.locator(`[id="${id}"]`).locator('xpath=..'), `${id}'s wrapper follows Slide ${other}`).toHaveClass(lit ? /imported-design-on/ : /^(?!.*imported-design-on)/);
        }
      };
      const press = (event: string) => page.getByTestId(`cue-action-${event}`);
      await showing('1');
      await expect(press('resume'), 'nothing to resume while it counts').toBeDisabled();
      await press('skip').click();
      await showing('2');
      // Held at once, so a slow machine cannot reach the six seconds before the picture is checked.
      await press('hold').click();
      await showing('2');
      await checkAir(page, air, `${t.slug}-2-slide-2`);
      await expect(press('hold'), 'Hold is greyed while held').toBeDisabled();
      await press('skip').click();
      await showing(slides[2 % slides.length]);
      await expect(press('resume'), 'still held after Next slide').toBeEnabled();
      await press('resume').click();
      await showing(slides[3 % slides.length]);
      await expect(press('hold')).toBeEnabled();
      // A long first story or headline is a field like any other: it fits its slide when that
      // slide shows.
      const first = namedTexts(t.slug).find((n) => /^(Story|Headline) 1$/.test(n));
      if (first) {
        await page.getByTestId(`cue-field-${await fieldFor(air, first)}`).fill('Harbour Street and the old market square reopen to traffic after three weeks of repairs');
        await page.getByTestId('verb-update').click();
        while (!(await air.locator('g[data-noacg-role~="slide/1"]').first().getAttribute('class'))?.includes('imported-design-on')) await press('skip').click();
        await checkAir(page, air, `${t.slug}-3-long`);
      }
      // Out plays the exit over the slide that was showing (T4), and a new take starts at slide 1.
      const onAir = [];
      for (const k of slides) if ((await air.locator(`g[data-noacg-role~="slide/${k}"]`).first().getAttribute('class'))?.includes('imported-design-on')) onAir.push(k);
      expect(onAir, 'one slide on air before Out').toHaveLength(1);
      await page.getByTestId('verb-out').click();
      await expect(air.locator(`g[data-noacg-role~="slide/${onAir[0]}"]`).first(), 'the slide stays up under the exit').toHaveClass(/imported-design-on/);
      await page.getByTestId('verb-take').click();
      await showing('1');
      break;
    }
    case 'crawl': {
      // CRAWL (TL6, Rules K1 to K6): the items print as one run, twice over, and travel right to
      // left inside the window; Scroll speed sets the pace; a new list keeps moving from where it
      // is; an empty list leaves the drawn text where it was drawn.
      const crawl = role(air, 'crawl');
      // How far the run has travelled: the offset of the group that moves it (the text's own box
      // also holds the copy laid before its start, which a new list lengthens).
      const left = () => crawl.evaluate((el) => (el.parentNode as SVGGElement).transform.baseVal.consolidate()?.matrix.e ?? 0);
      const items = await fieldFor(air, 'Items');
      await page.getByTestId(`cue-field-${items}`).fill('Doors open at 18:00 in the main hall\nParking opens at the east gate');
      await page.getByTestId('verb-update').click();
      await expect(crawl).toHaveText(/Doors open at 18:00 in the main hall.*Parking opens at the east gate.*Doors open/);
      await expect(crawl.locator('xpath=../..'), 'clipped to its window').toHaveAttribute('clip-path', /url\(#noacg-crawl-/);
      // Units a second, as the median of five tenths: one of them may straddle the loop's wrap.
      const pace = async () => {
        const steps: number[] = [];
        let at = await left();
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(100);
          const now = await left();
          steps.push((at - now) * 10);
          at = now;
        }
        return steps.sort((x, y) => x - y)[2];
      };
      const normal = await pace();
      expect(normal, 'it travels right to left').toBeGreaterThan(5);
      // K3: three seconds into the run, a longer list keeps moving from where it is; started
      // again from where it was drawn, it would jump back about three seconds' travel.
      await page.waitForTimeout(2_000);
      const before = await left();
      await page.getByTestId(`cue-field-${items}`).fill('Doors open at 18:00 in the main hall\nParking opens at the east gate\nThe bar closes at midnight');
      await page.getByTestId('verb-update').click();
      await expect(crawl).toHaveText(/The bar closes at midnight/);
      expect(Math.abs((await left()) - before), 'a new list keeps moving from where it is').toBeLessThan(normal * 1.5);
      const speed = await fieldFor(air, 'Scroll speed (%)');
      await page.getByTestId(`cue-field-${speed}`).fill('200');
      await page.getByTestId('verb-update').click();
      await expect.poll(pace, { message: 'Scroll speed 200 doubles the pace' }).toBeGreaterThan(normal * 1.5);
      await page.getByTestId(`cue-field-${speed}`).fill('100');
      await page.getByTestId('verb-update').click();
      await expect.poll(pace, { message: 'back to 100, back to the pace it started at' }).toBeLessThan(normal * 1.3);
      await checkAir(page, air, `${t.slug}-2-crawling`);
      await page.getByTestId(`cue-field-${items}`).fill('');
      await page.getByTestId('verb-update').click();
      await expect.poll(async () => Math.abs(await pace()), { message: 'an empty list stands still' }).toBeLessThan(1);
      break;
    }
    case 'wordcloud': {
      // WORD CLOUD (TL6, Rules W1 to W4): each staged word takes its slot, the most-sent larger,
      // the rest hide; a long word stays inside its slot; an empty list hides every slot.
      const slots = namedTexts(t.slug).filter((n) => /^Word \d+$/.test(n)).length;
      const slot = (n: number) => role(air, `word/${n}`);
      const size = (n: number) => slot(n).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const words = await fieldFor(air, 'Words');
      await fieldFor(air, 'Question');
      await page.getByTestId(`cue-field-${words}`).fill('Pizza | 9\nTacos | 4\nSushi | 2');
      await page.getByTestId('verb-update').click();
      await expect(slot(1)).toHaveText('Pizza');
      await expect(slot(3)).toHaveText('Sushi');
      for (let n = 1; n <= slots; n++) await expect(slot(n), `slot ${n}`).toHaveClass(n <= 3 ? /imported-design-on/ : /^(?!.*imported-design-on)/);
      const [s1, s2, s3] = [await size(1), await size(2), await size(3)];
      expect(s1 / s3, 'Sushi, the least sent, is drawn at half its slot').toBeGreaterThan(1.4);
      expect(s2, 'Tacos sits between').toBeLessThan(s1);
      await checkAir(page, air, `${t.slug}-2-fewer`);
      await page.getByTestId(`cue-field-${words}`).fill('Extraordinarily | 3\nTacos | 2\nSushi | 1');
      await page.getByTestId('verb-update').click();
      await expect(slot(1)).toHaveText('Extraordinarily');
      await checkAir(page, air, `${t.slug}-3-long`);
      // W4: a word no size down to the floor can fit into its slot is reported on Words.
      const over = () => air.locator('svg').first().evaluate(() => (window as unknown as { noacgTextOverflow(): string[] }).noacgTextOverflow());
      await page.getByTestId(`cue-field-${words}`).fill('Pizza | 3\nTacos | 2\nPneumonoultramicroscopicsilicovolcanoconiosis | 1');
      await page.getByTestId('verb-update').click();
      await expect.poll(over, { message: 'the long word is reported' }).toContain(words);
      await page.getByTestId(`cue-field-${words}`).fill('Pizza | 3\nTacos | 2\nSushi | 1');
      await page.getByTestId('verb-update').click();
      await expect.poll(over, { message: 'and no longer once it is gone' }).not.toContain(words);
      await page.getByTestId(`cue-field-${words}`).fill('');
      await page.getByTestId('verb-update').click();
      for (let n = 1; n <= slots; n++) await expect(slot(n)).not.toHaveClass(/imported-design-on/);
      break;
    }
    case 'lineup': {
      // QUESTION QUEUE (TL6, the Lineup as it is): Next guest lights each question in turn and
      // greys the ones answered, Previous guest goes back, a row's own button jumps to it, and
      // Nobody on clears it.
      const rows = namedTexts(t.slug).filter((n) => /^Guest \d+$/.test(n)).length;
      const state = async (now: number) => {
        for (let k = 1; k <= rows; k++) {
          await expect(role(air, `guest.now/${k}`), `row ${k} ${k === now ? 'is on' : 'is not on'}`).toHaveClass(k === now ? /imported-design-on/ : /^(?!.*imported-design-on)/);
          await expect(role(air, `guest.done/${k}`), `row ${k} ${k < now ? 'is done' : 'is not done'}`).toHaveClass(k < now ? /imported-design-on/ : /^(?!.*imported-design-on)/);
        }
      };
      const press = (event: string) => page.getByTestId(`cue-action-${event}`);
      await state(0);
      await press('nextGuest').click();
      await state(1);
      await press('nextGuest').click();
      await state(2);
      await checkAir(page, air, `${t.slug}-2-second`);
      await press('previousGuest').click();
      await state(1);
      await press(`guest${rows}`).click();
      await state(rows);
      await expect(press('nextGuest'), 'Next guest is greyed on the last row').toBeDisabled();
      await press('nobodyOn').click();
      await state(0);
      // The list edits like any field: a question retyped long fits its row.
      await page.getByTestId(`cue-field-${await fieldFor(air, 'Guest 2')}`).fill('Which of the songs you play tonight did you write first, and where were you?');
      await page.getByTestId('verb-update').click();
      await checkAir(page, air, `${t.slug}-3-long`);
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
  // BESIDE THE RECIPE (TL5: Scorebug, Match status): each drawn choice through its buttons, and a
  // match clock that counts up from Start, holds on Pause and goes back on Reset.
  if (t.recipe !== 'choice') for (const name of choiceNames(t.slug)) await walkChoice(page, air, t, name);
  if (hasMatchClock(t)) {
    const readout = air.locator('.imported-design-clock');
    await expect(readout).toHaveAttribute('data-count', 'up');
    await expect(readout).toHaveText('0:00');
    await page.getByTestId('cue-action-clock_start').click();
    await expect(readout).not.toHaveText('0:00', { timeout: 4_000 });
    await page.getByTestId('cue-action-clock_pause').click();
    const held = await readout.textContent();
    await page.waitForTimeout(1_100);
    await expect(readout).toHaveText(held!);
    await page.getByTestId('cue-action-clock_reset').click();
    await expect(readout).toHaveText('0:00');
  }
  if (t.recipe !== 'alert') await page.getByTestId('verb-out').click();
  page.off('pageerror', onError);
  expect(errors, `${t.name}: no page errors`).toEqual([]);
}

/** Every export target's package of a production's first graphic, as text files by path. */
async function exportPackages(page: Page, production: string, sampleData: Record<string, string>): Promise<Record<string, Record<string, string>>> {
  return page.evaluate(async ({ production, sampleData }) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const { EXPORT_TARGETS } = await __noacgImport('/src/export/registry.ts');
    const template = shows.loadShows().find((s: { name: string }) => s.name === production)!.graphics[0].template;
    const out: Record<string, Record<string, string>> = {};
    for (const target of EXPORT_TARGETS) {
      const zip = await target.build(template, { sampleData, graphicUsage: 'both' });
      const files: Record<string, string> = {};
      for (const name of Object.keys(zip.files)) if (!zip.files[name].dir && /\.(html|js|mjs|css|json)$/.test(name)) files[name] = await zip.file(name)!.async('string');
      out[target.id] = files;
    }
    return out;
  }, { production, sampleData });
}

/** One package's graphic page with its own css and js inlined, as its folder would serve it. */
function inlined(files: Record<string, string>): string {
  const html = Object.keys(files).find((n) => n.endsWith('.html') && !/control|panel|index|controller/i.test(n.split('/').pop()!))!;
  const dir = html.slice(0, html.lastIndexOf('/') + 1);
  const at = (ref: string) => files[dir + ref.replace(/^\.\//, '')];
  return files[html]
    .replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, ref) => (at(ref) !== undefined ? `<style>${at(ref)}</style>` : tag))
    .replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (tag, a, ref) => (at(ref) !== undefined ? `<script${a}>${at(ref).replace(/<\/script>/gi, '<\\/script>')}</script>` : tag));
}

/** Serve one OGraf package's files from a fake origin, as a renderer fetches them. */
function serveOgrafFiles(page: Page, origin: string, files: Record<string, string>) {
  const root = Object.keys(files).find((n) => n.endsWith('graphic.mjs'))!.replace(/graphic\.mjs$/, '');
  return page.route(`${origin}**`, (route) => {
    const body = files[root + new URL(route.request().url()).pathname.replace(/^\//, '')];
    return body == null ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body });
  });
}

// ONE BATCHED SWEEP (spec "Tests and budget"): the templates run in batches by route, each
// template still walked whole and checked on air exactly as before, so a batch shares one
// browser page instead of one test per template. A batch holds what fits the 120 s ceiling.
const BATCH = 5;
// A score walk presses +1 up to 100, so three scoreboards fill a batch.
const BATCH_OF: Record<string, number> = { score: 3 };
const routeOf = (t: Template) => t.recipe ?? (t.contract ? `contract:${t.contract}` : pictureSlots(t.slug).length ? 'pictures' : 'plain');
const batches: { label: string; items: Template[] }[] = [];
for (const route of [...new Set(templates.map(routeOf))]) {
  const items = templates.filter((t) => routeOf(t) === route);
  const size = BATCH_OF[route] ?? BATCH;
  for (let i = 0; i < items.length; i += size) batches.push({ label: route, items: items.slice(i, i + size) });
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
  // Reduced motion: asked for while the warning pulses, the pulse stops on the next beat and the
  // look stays lit; zero lights Time up with nothing moving.
  await page.getByTestId('verb-out').click();
  await page.getByTestId('verb-take').click();
  await expect.poll(async () => (await motion('warning')).move, { timeout: 6_000 }).toBe('pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => motion('warning')).toMatchObject({ move: null, opacity: 1 });
  await expect(role(air, 'warning')).toHaveClass(/imported-design-on/);
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
  const packages = await exportPackages(page, `${t.name} template`, short);
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
      inkscape: validateOgrafOfflineCompatibility({ ...template, html: template.html.replace('<svg ', '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" ') }).errors,
      credits: validateOgrafOfflineCompatibility({ ...template, js: `${template.js}\nfunction noacgCreditsRoll() {}` }).errors,
    };
  }, `${t.name} template`);
  expect(gate.own, 'the imported countdown may be sought').toEqual([]);
  expect(gate.fetched).toContain('External network dependencies are not available during deterministic rendering.');
  expect(gate.lookalike).toContain('External network dependencies are not available during deterministic rendering.');
  expect(gate.inkscape, 'any namespace an editor declares is a name').toEqual([]);
  expect(gate.credits).toContain('An imported credits roll starts once its fonts have loaded, which a seek cannot replay; export it for live use.');

  const serveOgraf = (origin: string, files: Record<string, string>) => serveOgrafFiles(page, origin, files);

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
    const origin = `http://${id}-motion.local/`;
    await serveOgraf(origin, packages[id]);
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
  const manifest = JSON.parse(files[Object.keys(files).find((n) => n.endsWith('.ograf.json'))!]);
  expect(manifest.supportsNonRealTime, 'the countdown is offered for non-real time').toBe(true);
  await serveOgraf('http://ograf-seek.local/', files);
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

// TL5'S MECHANISMS IN EVERY EXPORT TARGET (AC-7, spec "Exports"): a vote row's own count, and a
// choice that starts on the option drawn visible and is never empty. Each package is loaded as its
// host loads it and driven as its host drives it (update and play; the overlay plays its baked
// data; OGraf and LiveOS load, playAction and updateAction).
test('Vote results with counts, Poll result, Alert level, Winner card and Scorebug: the count, the typed figures, the starting level, the reveal and a choice beside the score play in every export target', async ({ page, context }) => {
  test.setTimeout(120_000);
  type Look = { lit: boolean; text: string } | null;
  const targets = ['spx', 'casparcg', 'h2r', 'html-overlay', 'ograf', 'liveos'];

  /** Import a template, take it, and read the field ids its titles compiled to. */
  const prepare = async (slug: string, titles: string[]) => {
    const t = templates.find((entry) => entry.slug === slug)!;
    await importTemplate(page, t);
    await page.getByTestId('verb-take').click();
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    const ids: Record<string, string> = {};
    for (const title of titles) ids[title] = await fieldFor(air, title);
    await page.getByTestId('verb-out').click();
    return { production: `${t.name} template`, ids };
  };

  /** Load one package, send it `data` (the overlay plays the data it was built with), and read
   *  each role's look and text; then, where the host can, send `next` and read again. */
  const play = async (id: string, files: Record<string, string>, data: Record<string, string>, next: Record<string, string> | null, roles: string[]) => {
    const read = (body: ParentNode, names: string[]) => Object.fromEntries(names.map((n) => {
      const node = body.querySelector(`[data-noacg-role~="${n}"]`);
      return [n, node ? { lit: node.classList.contains('imported-design-on'), text: (node.textContent ?? '').trim() } : null];
    }));
    if (id === 'ograf' || id === 'liveos') {
      const origin = `http://${id}-${Math.random().toString(36).slice(2, 8)}.local/`;
      await serveOgrafFiles(page, origin, files);
      await installGraphicBody(page);
      return page.evaluate(async ({ origin, data, next, roles, readSrc }) => {
        const readIn = new Function(`return (${readSrc})`)() as (body: ParentNode, names: string[]) => Record<string, Look>;
        const mod = await import(`${origin}graphic.mjs`);
        const tag = `tl5-${origin.replace(/\W/g, '')}`;
        customElements.define(tag, mod.default);
        const el = document.createElement(tag) as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown>; updateAction(p: unknown): Promise<unknown>; dispose(): Promise<unknown> };
        document.body.appendChild(el);
        await el.load({ data, renderType: 'realtime', renderCharacteristics: {} });
        await el.playAction({});
        await new Promise((r) => setTimeout(r, 600));
        const first = readIn(graphicBody(el), roles);
        let second = null;
        if (next) {
          await el.updateAction({ data: { ...data, ...next } });
          await new Promise((r) => setTimeout(r, 600));
          second = readIn(graphicBody(el), roles);
        }
        await el.dispose();
        return { first, second };
      }, { origin, data, next, roles, readSrc: read.toString() });
    }
    const view = await context.newPage();
    await view.setContent(inlined(files), { waitUntil: 'load' });
    if (id !== 'html-overlay') {
      await view.evaluate((d) => {
        const w = window as unknown as { update(raw: string): void; play(): void };
        w.update(JSON.stringify(d));
        w.play();
      }, data);
    }
    await view.waitForTimeout(600);
    const first = await view.evaluate(({ roles, readSrc }) => (new Function(`return (${readSrc})`)() as (b: ParentNode, n: string[]) => Record<string, Look>)(document, roles), { roles, readSrc: read.toString() });
    let second = null;
    if (next && id !== 'html-overlay') {
      await view.evaluate((d) => (window as unknown as { update(raw: string): void }).update(JSON.stringify(d)), { ...data, ...next });
      await view.waitForTimeout(600);
      second = await view.evaluate(({ roles, readSrc }) => (new Function(`return (${readSrc})`)() as (b: ParentNode, n: string[]) => Record<string, Look>)(document, roles), { roles, readSrc: read.toString() });
    }
    await view.close();
    return { first, second };
  };

  // Vote results: each row prints its own count, shown with the shares (Live figures here, since
  // a host that only sends data reaches no Show result).
  const vote = await prepare('vote-results-counts', ['Options', 'Live figures']);
  const voteData = { [vote.ids.Options]: 'Coast | 3\nForest | 1', [vote.ids['Live figures']]: 'live' };
  const votePackages = await exportPackages(page, vote.production, voteData);
  expect(Object.keys(votePackages).sort()).toEqual([...targets].sort());
  for (const id of targets) {
    const seen = await play(id, votePackages[id], voteData, null, ['count/1', 'count/2', 'percent/1']);
    expect(seen.first, `${id}: each row's count with its share`).toEqual({
      'count/1': { lit: true, text: '3' },
      'count/2': { lit: true, text: '1' },
      'percent/1': { lit: true, text: '75%' },
    });
  }

  // Poll result: typed rows show their figures from the start, with Live figures left as built.
  const poll = await prepare('poll-result', ['Options']);
  const pollData = { [poll.ids.Options]: 'Saturday | 3\nSunday | 1' };
  const pollPackages = await exportPackages(page, poll.production, pollData);
  for (const id of targets) {
    const seen = await play(id, pollPackages[id], pollData, null, ['percent/1', 'percent/2']);
    expect(seen.first, `${id}: the typed figures show at once`).toEqual({ 'percent/1': { lit: true, text: '75%' }, 'percent/2': { lit: true, text: '25%' } });
  }

  // Winner card: Reveal is a step on the walk, so a page host's Continue (`next`) reveals it and
  // OGraf and LiveOS run it as their `reveal` custom action; the celebration is a switch, so every
  // host raises it by data (its field set to on). The overlay plays the data it was built with.
  const winner = await prepare('winner-card', ['The reveal', 'Celebration']);
  const winnerData = { [winner.ids['The reveal']]: 'Jordan Okafor' };
  const partyOn = { [winner.ids.Celebration]: 'on' };
  const winnerPackages = await exportPackages(page, winner.production, winnerData);
  const celebration = ['cover', 'secret', 'switch.celebration.on'];
  const frame = (looks: Record<string, Look> | null) => looks && { lit: celebration.filter((n) => looks[n]?.lit), name: looks.secret?.text };
  for (const id of ['spx', 'casparcg', 'h2r']) {
    const view = await context.newPage();
    await view.setContent(inlined(winnerPackages[id]), { waitUntil: 'load' });
    const read = () => view.evaluate((names) => ({
      lit: names.filter((n) => document.querySelector(`[data-noacg-role~="${n}"]`)?.classList.contains('imported-design-on')),
      name: (document.querySelector('[data-noacg-role~="secret"]')?.textContent ?? '').trim(),
    }), celebration);
    const send = (d: Record<string, string>) => view.evaluate((v) => (window as unknown as { update(raw: string): void }).update(JSON.stringify(v)), d);
    await send(winnerData);
    await view.evaluate(() => (window as unknown as { play(): void }).play());
    await expect.poll(read, { message: `${id}: sealed` }).toEqual({ lit: ['cover'], name: 'Jordan Okafor' });
    await view.evaluate(() => (window as unknown as { next(): void }).next());
    await expect.poll(read, { message: `${id}: Continue reveals` }).toEqual({ lit: ['secret'], name: 'Jordan Okafor' });
    await send({ ...winnerData, ...partyOn });
    await expect.poll(read, { message: `${id}: the celebration by data` }).toEqual({ lit: ['secret', 'switch.celebration.on'], name: 'Jordan Okafor' });
    await send({ ...winnerData, [winner.ids.Celebration]: 'off' });
    await expect.poll(read, { message: `${id}: and away again` }).toEqual({ lit: ['secret'], name: 'Jordan Okafor' });
    await view.close();
  }
  {
    const seen = await play('html-overlay', winnerPackages['html-overlay'], winnerData, null, celebration);
    expect(frame(seen.first), 'html-overlay: plays sealed').toEqual({ lit: ['cover'], name: 'Jordan Okafor' });
  }
  for (const id of ['ograf', 'liveos']) {
    const origin = `http://${id}-winner.local/`;
    await serveOgrafFiles(page, origin, winnerPackages[id]);
    await installGraphicBody(page);
    const steps = await page.evaluate(async ({ origin, id, data, on, names }) => {
      const mod = await import(`${origin}graphic.mjs`);
      customElements.define(`${id}-winner-under-test`, mod.default);
      const el = document.createElement(`${id}-winner-under-test`) as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown>; customAction(p: unknown): Promise<unknown>; updateAction(p: unknown): Promise<unknown>; dispose(): Promise<unknown> };
      document.body.appendChild(el);
      await el.load({ data, renderType: 'realtime', renderCharacteristics: {} });
      await el.playAction({});
      const lit = async () => {
        await new Promise((r) => setTimeout(r, 600));
        return names.filter((n) => graphicBody(el).querySelector(`[data-noacg-role~="${n}"]`)?.classList.contains('imported-design-on'));
      };
      const out = [await lit()];
      await el.customAction({ id: 'reveal', payload: {} });
      out.push(await lit());
      await el.updateAction({ data: { ...data, ...on } });
      out.push(await lit());
      await el.dispose();
      return out;
    }, { origin, id, data: winnerData, on: partyOn, names: celebration });
    expect(steps, `${id}: sealed, revealed, celebrating`).toEqual([['cover'], ['secret'], ['secret', 'switch.celebration.on']]);
  }

  // Alert level: it starts on Advisory with nothing sent, and a level sent as data shows alone.
  const alert = await prepare('alert-level', ['Level']);
  const levels = ['advisory', 'watch', 'warning', 'emergency'].map((key) => `choice.level.option/${key.toUpperCase()}`);
  const alertPackages = await exportPackages(page, alert.production, {});
  const lit = (looks: Record<string, Look> | null) => looks && Object.entries(looks).filter(([, l]) => l?.lit).map(([n]) => n);
  for (const id of targets) {
    const seen = await play(id, alertPackages[id], {}, { [alert.ids.Level]: 'emergency' }, levels);
    expect(lit(seen.first), `${id}: the band starts on Advisory`).toEqual([levels[0]]);
    if (id !== 'html-overlay') expect(lit(seen.second), `${id}: Emergency sent as data shows alone`).toEqual([levels[3]]);
  }

  // Scorebug: a choice beside a full recipe (the score) and a match clock, one table and one
  // runtime: it starts on First, and Interval sent as data shows alone.
  const bug = await prepare('scorebug', ['Period']);
  const periods = ['FIRST', 'INTERVAL', 'SECOND'].map((key) => `choice.period.option/${key}`);
  const bugPackages = await exportPackages(page, bug.production, {});
  for (const id of targets) {
    const seen = await play(id, bugPackages[id], {}, { [bug.ids.Period]: 'interval' }, periods);
    expect(lit(seen.first), `${id}: the bug starts on First`).toEqual([periods[0]]);
    if (id !== 'html-overlay') expect(lit(seen.second), `${id}: Interval sent as data shows alone`).toEqual([periods[1]]);
  }
});

// TL5 group 5 (AC-7): Clear is data (the choice's field set empty), so every host clears a verdict;
// Hold on air and Take it off are operator events, which OGraf and LiveOS offer as a custom action and a page
// host receives through NoaCG's own control channel (`noacgDispatch`, what the Control panel sends).
/** Every export target, by id. */
const EXPORT_IDS = ['spx', 'casparcg', 'h2r', 'html-overlay', 'ograf', 'liveos'];

/** A template imported into its own production, with the field ids of the titles asked for. */
async function prepareExport(page: Page, slug: string, titles: string[]): Promise<{ production: string; ids: Record<string, string> }> {
  const t = templates.find((entry) => entry.slug === slug)!;
  await importTemplate(page, t);
  await page.getByTestId('verb-take').click();
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const ids: Record<string, string> = {};
  for (const title of titles) ids[title] = await fieldFor(air, title);
  await page.getByTestId('verb-out').click();
  return { production: `${t.name} template`, ids };
}

type Host = {
  lit(names: string[]): Promise<string[]>;
  shown(): Promise<boolean>;
  /** A role's text and its drawn width (getBBox), or null where the package draws no such role. */
  read(name: string): Promise<{ text: string; width: number } | null>;
  /** Where a role's layer starts on screen (its left edge), or null where none is drawn. */
  left(name: string): Promise<number | null>;
  update(d: Record<string, string>): Promise<void>;
  event(name: string): Promise<void>;
  close(): Promise<void>;
};

/** Load one package as its host does and play it with `data`. */
async function packageHost(page: Page, context: BrowserContext, id: string, files: Record<string, string>, data: Record<string, string>): Promise<Host> {
  if (id === 'ograf' || id === 'liveos') {
    const origin = `http://${id}-${Math.random().toString(36).slice(2, 8)}.local/`;
    const tag = `g5-${origin.replace(/\W/g, '')}`;
    await serveOgrafFiles(page, origin, files);
    await installGraphicBody(page);
    await page.evaluate(async ({ origin, tag, data }) => {
      const mod = await import(`${origin}graphic.mjs`);
      customElements.define(tag, mod.default);
      const el = document.createElement(tag) as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
      el.id = tag;
      document.body.appendChild(el);
      await el.load({ data, renderType: 'realtime', renderCharacteristics: {} });
      await el.playAction({});
    }, { origin, tag, data });
    type El = HTMLElement & { updateAction(p: unknown): Promise<unknown>; customAction(p: unknown): Promise<unknown>; dispose(): Promise<unknown> };
    return {
      lit: (names) => page.evaluate(({ tag, names }) => names.filter((n) => graphicBody(document.getElementById(tag)!).querySelector(`[data-noacg-role~="${n}"]`)?.classList.contains('imported-design-on')), { tag, names }),
      shown: () => page.evaluate((tag) => getComputedStyle(graphicBody(document.getElementById(tag)!).querySelector('.imported-design')!).opacity !== '0', tag),
      read: (name) => page.evaluate(({ tag, name }) => {
        const el = graphicBody(document.getElementById(tag)!).querySelector(`[data-noacg-role~="${name}"]`) as SVGGraphicsElement | null;
        return el ? { text: (el.textContent ?? '').trim(), width: el.getBBox().width } : null;
      }, { tag, name }),
      left: (name) => page.evaluate(({ tag, name }) => graphicBody(document.getElementById(tag)!).querySelector(`[data-noacg-role~="${name}"]`)?.getBoundingClientRect().left ?? null, { tag, name }),
      update: (d) => page.evaluate(({ tag, d }) => (document.getElementById(tag) as El).updateAction({ data: d }).then(() => undefined), { tag, d }),
      event: (name) => page.evaluate(({ tag, name }) => (document.getElementById(tag) as El).customAction({ id: name, payload: {} }).then(() => undefined), { tag, name }),
      close: () => page.evaluate((tag) => (document.getElementById(tag) as El).dispose().then(() => undefined), tag),
    };
  }
  const view = await context.newPage();
  await view.setContent(inlined(files), { waitUntil: 'load' });
  const w = (fn: string, arg?: unknown) => view.evaluate(({ fn, arg }) => (window as unknown as Record<string, (a?: unknown) => void>)[fn](arg), { fn, arg });
  if (id !== 'html-overlay') {
    await w('update', JSON.stringify(data));
    await w('play');
  }
  return {
    lit: (names) => view.evaluate((names) => names.filter((n) => document.querySelector(`[data-noacg-role~="${n}"]`)?.classList.contains('imported-design-on')), names),
    shown: () => view.evaluate(() => getComputedStyle(document.querySelector('.imported-design')!).opacity !== '0'),
    read: (name) => view.evaluate((name) => {
      const el = document.querySelector(`[data-noacg-role~="${name}"]`) as SVGGraphicsElement | null;
      return el ? { text: (el.textContent ?? '').trim(), width: el.getBBox().width } : null;
    }, name),
    left: (name) => view.evaluate((name) => document.querySelector(`[data-noacg-role~="${name}"]`)?.getBoundingClientRect().left ?? null, name),
    update: (d) => w('update', JSON.stringify(d)),
    event: (name) => w('noacgDispatch', name),
    close: () => view.close(),
  };
}

test('Verdict card and Chat highlight: Clear and Hold on air play in every export target', async ({ page, context }) => {
  test.setTimeout(120_000);
  // Verdict card: a verdict sent as data shows alone, and the empty value (Clear's) takes it away.
  const verdict = await prepareExport(page, 'verdict-card', ['Verdict']);
  const looks = ['TRUE', 'FALSE', 'MISLEADING'].map((key) => `choice.verdict.option/${key}`);
  const verdictPackages = await exportPackages(page, verdict.production, { [verdict.ids.Verdict]: 'false' });
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, verdictPackages[id], { [verdict.ids.Verdict]: 'false' });
    await expect.poll(() => h.lit(looks), { message: `${id}: False shows alone` }).toEqual([looks[1]]);
    if (id !== 'html-overlay') {
      await h.update({ [verdict.ids.Verdict]: '' });
      await expect.poll(() => h.lit(looks), { message: `${id}: cleared` }).toEqual([]);
    }
    await h.close();
  }

  // Chat highlight: unheld it clears itself after the eight seconds in every host (SPX, OGraf and
  // the overlay, one of each kind of package); held (CasparCG, H2R, LiveOS) it stays up past them,
  // and Take it off (`dismiss`) then clears it.
  const chat = await prepareExport(page, 'chat-highlight', []);
  const chatPackages = await exportPackages(page, chat.production, {});
  const held = new Set(['casparcg', 'h2r', 'liveos']);
  const hosts = await Promise.all(EXPORT_IDS.map(async (id) => [id, await packageHost(page, context, id, chatPackages[id], {})] as const));
  for (const [id, h] of hosts) await expect.poll(() => h.shown(), { message: `${id}: on air` }).toBe(true);
  await page.waitForTimeout(1_000);              // the entrance settles: Hold leaves the on-air state
  for (const [id, h] of hosts) if (held.has(id)) await h.event('hold');
  await page.waitForTimeout(9_500);
  for (const [id, h] of hosts) expect(await h.shown(), held.has(id) ? `${id}: held past the eight seconds` : `${id}: clears itself`).toBe(held.has(id));
  for (const [id, h] of hosts) {
    if (held.has(id)) {
      await h.event('dismiss');
      await expect.poll(() => h.shown(), { message: `${id}: Take it off clears it` }).toBe(false);
    }
    await h.close();
  }
});

test('Milestone track and Quiz show: tiers and rows in use play in every export target', async ({ page, context }) => {
  test.setTimeout(120_000);
  // MILESTONE TRACK (Rules M2-M5): three lines and Current 15 as data. Two tiers reached, the third
  // segment half run, the fourth tier hidden; then Current 30 reaches the third, where the host
  // sends data (the overlay plays its baked data only).
  const track = await prepareExport(page, 'milestone-track', ['Milestones', 'Current']);
  const tiers = { [track.ids.Milestones]: 'A | 5\nB | 10\nC | $20', [track.ids.Current]: '15' };
  const trackPackages = await exportPackages(page, track.production, tiers);
  const reached = ['1', '2', '3', '4'].map((k) => `tier.reached/${k}`);
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, trackPackages[id], tiers);
    await expect.poll(() => h.lit(reached), { message: `${id}: the first two tiers reached` }).toEqual(reached.slice(0, 2));
    expect(await h.lit(['tier/3', 'tier/4', 'tier.row/4']), `${id}: three tiers listed`).toEqual(['tier/3']);
    expect((await h.read('tier.figure/3'))?.text, `${id}: the figure as typed`).toBe('$20');
    const full = drawnWidth('milestone-track', 'Segment 3');
    await expect.poll(async () => ((await h.read('tier.bar/3'))?.width ?? 0) / full, { message: `${id}: halfway from 10 to 20` }).toBeCloseTo(0.5, 2);
    if (id !== 'html-overlay') {
      await h.update({ ...tiers, [track.ids.Current]: '30' });
      await expect.poll(() => h.lit(reached), { message: `${id}: the third reached by data` }).toEqual(reached.slice(0, 3));
    }
    await h.close();
  }

  // QUIZ SHOW (Rules Q1-Q3): Answer D empty as data, so row D is not in use; typed as data, it is.
  const quiz = await prepareExport(page, 'quiz-show', ['Answer D']);
  const three = { [quiz.ids['Answer D']]: '' };
  const quizPackages = await exportPackages(page, quiz.production, three);
  const rows = ['A', 'B', 'C', 'D'].map((k) => `answer.row/${k}`);
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, quizPackages[id], three);
    await expect.poll(() => h.lit(rows), { message: `${id}: three rows in use` }).toEqual(rows.slice(0, 3));
    if (id !== 'html-overlay') {
      await h.update({ [quiz.ids['Answer D']]: 'Mercury' });
      await expect.poll(() => h.lit(rows), { message: `${id}: Answer D typed, its row is in use` }).toEqual(rows);
    }
    await h.close();
  }
});

test('Rotating ticker and Question queue: the slides take turns, Hold keeps one, and the questions move, in every export target', async ({ page, context }) => {
  test.setTimeout(120_000);
  // ROTATION (Rules T1 to T4): in every host slide 1 is up at the take and slide 2 six seconds
  // later, by the graphic's own timer. Held where the host sends events (every host but the
  // overlay, which only plays), it outlasts the next six seconds; Resume moves on to slide 3.
  const ticker = await prepareExport(page, 'ticker-rotate', []);
  const tickerPackages = await exportPackages(page, ticker.production, {});
  const slides = ['slide/1', 'slide/2', 'slide/3'];
  // One host at a time, each read at once: slide 1 lasts six seconds from its own take. Then every
  // host is held the moment it reaches slide 2, so none can run on to slide 3 before its Hold.
  const hosts: (readonly [string, Host])[] = [];
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, tickerPackages[id], {});
    await expect.poll(() => h.lit(slides), { message: `${id}: slide 1 at the take` }).toEqual(['slide/1']);
    hosts.push([id, h] as const);
  }
  await Promise.all(hosts.map(async ([id, h]) => {
    await expect.poll(() => h.lit(slides), { message: `${id}: slide 2 after six seconds`, timeout: 15_000, intervals: [100] }).toEqual(['slide/2']);
    if (id === 'html-overlay') return;
    await h.event('hold');
    await page.waitForTimeout(7_000);
    expect(await h.lit(slides), `${id}: held on slide 2`).toEqual(['slide/2']);
    await h.event('resume');
    await expect.poll(() => h.lit(slides), { message: `${id}: Resume moves on` }).toEqual(['slide/3']);
  }));
  for (const [, h] of hosts) await h.close();

  // QUESTION QUEUE (the Lineup): who is on is the On now field, so every host that sends data
  // moves it; On now 2 puts the second question on and the first done. Next guest and Previous
  // guest are the cue editor's presses on that field (the batch walk).
  const queue = await prepareExport(page, 'question-queue', ['On now']);
  const second = { [queue.ids['On now']]: '2' };
  const queuePackages = await exportPackages(page, queue.production, second);
  const marks = ['guest.now/1', 'guest.now/2', 'guest.done/1'];
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, queuePackages[id], second);
    await expect.poll(() => h.lit(marks), { message: `${id}: the second on, the first done` }).toEqual(['guest.now/2', 'guest.done/1']);
    if (id !== 'html-overlay') {
      await h.update({ [queue.ids['On now']]: '1' });
      await expect.poll(() => h.lit(marks), { message: `${id}: back to the first` }).toEqual(['guest.now/1']);
    }
    await h.close();
  }
});

test('Ticker crawl and Word cloud: the crawl travels and the staged words fill their slots in every export target', async ({ page, context }) => {
  test.setTimeout(120_000);
  // CRAWL (K8): the run travels in every host, and a new Items list sent as data reaches it.
  const crawl = await prepareExport(page, 'ticker-crawl', ['Items', 'Scroll speed (%)']);
  const first = { [crawl.ids.Items]: 'Doors open at 18:00\nParking at the east gate' };
  const crawlPackages = await exportPackages(page, crawl.production, first);
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, crawlPackages[id], first);
    await expect.poll(async () => (await h.read('crawl'))?.text ?? '', { message: `${id}: the items as one run` }).toContain('Parking at the east gate');
    const a = (await h.left('crawl')) ?? 0;
    await expect.poll(async () => a - ((await h.left('crawl')) ?? 0), { message: `${id}: it travels right to left` }).toBeGreaterThan(3);
    if (id !== 'html-overlay') {
      await h.update({ [crawl.ids.Items]: 'The bar closes at midnight' });
      await expect.poll(async () => (await h.read('crawl'))?.text ?? '', { message: `${id}: a new list as data` }).toContain('The bar closes at midnight');
      // Scroll speed as data re-times the run: 400% is well past twice the pace.
      const pace = async () => {
        const steps: number[] = [];
        let at = (await h.left('crawl')) ?? 0;
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(100);
          const now = (await h.left('crawl')) ?? 0;
          steps.push((at - now) * 10);
          at = now;
        }
        return steps.sort((x, y) => x - y)[2];
      };
      const slow = await pace();
      await h.update({ [crawl.ids.Items]: 'The bar closes at midnight', [crawl.ids['Scroll speed (%)']]: '400' });
      await expect.poll(pace, { message: `${id}: Scroll speed as data` }).toBeGreaterThan(slow * 2);
    }
    await h.close();
  }

  // WORD CLOUD (W6): staged Words as data fill the first slots and hide the rest in every host.
  const cloud = await prepareExport(page, 'word-cloud', ['Words']);
  const staged = { [cloud.ids.Words]: 'Pizza | 9\nTacos | 4\nSushi | 2' };
  const cloudPackages = await exportPackages(page, cloud.production, staged);
  const slots = ['word/1', 'word/2', 'word/3', 'word/4'];
  for (const id of EXPORT_IDS) {
    const h = await packageHost(page, context, id, cloudPackages[id], staged);
    await expect.poll(() => h.lit(slots), { message: `${id}: three words staged` }).toEqual(slots.slice(0, 3));
    expect((await h.read('word/1'))?.text, `${id}: the most-sent first`).toBe('Pizza');
    if (id !== 'html-overlay') {
      await h.update({ [cloud.ids.Words]: 'Calm | 1' });
      await expect.poll(() => h.lit(slots), { message: `${id}: one word as data` }).toEqual(['word/1']);
    }
    await h.close();
  }
});
