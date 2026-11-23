// needs: browser
// guards: src/templates/importedDesign/creditsArtwork.ts
// guards: src/templates/importedDesign/creditsRoll.ts
// guards: src/templates/importedDesign/svg.ts
// guards: docs/tutorials/template-library/SVG/end-credits-full-roll.svg
// guards: src/components/wizard/import/stageMeasure.ts
//
// END CREDITS THAT ROLL THE WHOLE ARTWORK (`wholeArtwork`; the Rules are
// docs/work-specs/svg-template-library/evidence/full-roll.md). The owner's ask: a logo, a plate or
// anything else drawn in the file rolls with the credits as one picture. The library's
// "End credits, full roll" is built with and without the flag and played on a blank page: every
// drawn element keeps its distance to every other one through the roll (R1), the extent is what
// paints (R7), Out freezes rather than hides (R5), a re-fit mid-roll measures at rest (R11), a
// picture swap keeps rolling (R6), a staggered In is waited out layer by layer (R6), and the flag
// means nothing to any other engine (R3). The import step's evidence for the Rolls default (R8) is
// measured on drawings laid out as the step lays them out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ARTWORK = readFileSync(fileURLToPath(new URL('../e2e/fixtures/credits-artwork.svg', import.meta.url)), 'utf8');
const TEMPLATE = readFileSync(fileURLToPath(new URL('../docs/tutorials/template-library/SVG/end-credits-full-roll.svg', import.meta.url)), 'utf8');
// The same file with what must NOT count towards the extent (R7) - an artboard rectangle with no
// fill, a transparent plate, a hidden one and a transparent hit area, each reaching far beyond the
// drawing - what MUST count although its box is flat (a stroked rule under the plate, whose stroke
// paints past its box), and a second live text the fit ladder owns (R11).
const PADDED = TEMPLATE.replace(
  '<g id="Board"',
  '<rect id="Artboard" width="1920" height="6000" fill="none"/><rect id="Ghost" y="-3000" width="10" height="9000" opacity="0"/><rect id="Hidden" y="-3000" width="10" height="9000" visibility="hidden"/><rect id="Hit" y="-3000" width="1920" height="9000" fill="#000" fill-opacity="0"/><line id="Rule" x1="860" y1="2040" x2="1060" y2="2040" stroke="#2E5BFF" stroke-width="8"/><g id="Board"',
).replace('</g>\n</svg>', '<text id="Tagline" x="960" y="1990" text-anchor="middle" font-size="24" fill="#8FA8FF">A NoaCG production</text>\n  </g>\n</svg>');

/** Runs in the browser: each build, and the answers that need no document of their own. */
function inPage({ template, padded, artwork: artworkSvg }) {
  const { NOACG_SVG: R, NOACG_IMPORTED: I, NOACG_ROLL: C, NOACG_COMPOSE: P } = window;
  const designOf = (markup, behaviour) => {
    const imp = R.importSvgMarkup(markup);
    const fields = imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
    const images = imp.images.map((c) => ({ candidateId: c.id, title: c.label }));
    const credits = fields.findIndex((f) => f.title === 'Credits');
    return { markup: imp.markup, width: imp.width, height: imp.height, fields, images, outlines: [], fonts: [], behaviour: behaviour(credits) };
  };
  const artwork = (whole) => (credits) => ({ kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits }, options: { artwork: true }, ...(whole ? { wholeArtwork: true } : {}) });
  const build = (design, presetId) => {
    const tpl = I.IMPORTED_SVG.create({ designSvg: design, ...(presetId ? { animation: { presetId } } : {}) });
    return { js: tpl.js, css: tpl.css, fields: tpl.fields, doc: P.composeDocument(tpl) };
  };
  const whole = designOf(template, artwork(true));
  const text = designOf(template, artwork(false));
  // The flag on a binding that does not build the artwork engine (the editable roll) changes nothing.
  const editable = designOf(template, (credits) => ({ kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits }, wholeArtwork: true }));
  const editablePlain = designOf(template, (credits) => ({ kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits } }));
  // R8's drawn-outside evidence, as the import step reads it off its own render of each drawing.
  const outside = (markup, creditsLabel) => {
    const imp = R.importSvgMarkup(markup);
    const stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;left:0;top:0;width:960px';
    stage.innerHTML = imp.markup;
    stage.querySelector('svg').setAttribute('width', '960');
    stage.querySelector('svg').removeAttribute('height');
    document.body.appendChild(stage);
    try {
      return window.NOACG_STAGE.drawnOutsideArtboard(stage, [imp.candidates.find((c) => c.label === creditsLabel).id]);
    } finally {
      stage.remove();
    }
  };
  const below = (markup, extra) => markup.replace('</svg>', `${extra}</svg>`);
  const backdrop = '<rect x="-20" y="-20" width="1960" height="1120" fill="#0F1729"/>';
  const unseen = '<rect y="1500" width="400" height="400" fill="none"/><rect y="1500" width="400" height="400" fill="#fff" opacity="0"/><rect y="1500" width="400" height="400" fill="#fff" fill-opacity="0"/><rect y="1500" width="400" height="400" fill="#fff" style="display:none"/>';
  const logo = '<path d="M900 1300h120v80H900z" fill="#2E5BFF"/>';
  const evidence = {
    template: outside(template, 'Credits'),
    textOnly: outside(artworkSvg, 'Programme text'),
    bledBackdrop: outside(below(artworkSvg, backdrop), 'Programme text'),
    unseen: outside(below(artworkSvg, backdrop + unseen), 'Programme text'),
    logoBelow: outside(below(artworkSvg, backdrop + logo), 'Programme text'),
  };
  return {
    evidence,
    staggered: build({ ...whole }, 'design-stagger'),
    whole: build(whole),
    text: build(text),
    padded: build(designOf(padded, artwork(true))),
    engines: { whole: C.isWholeArtworkCredits(whole), text: C.isWholeArtworkCredits(text), editable: C.isWholeArtworkCredits(editable) },
    editableSame: JSON.stringify(build(editable).js) === JSON.stringify(build(editablePlain).js),
  };
}

/** Plays one build: rest, take, three poses, a re-fit, a picture swap, Out and a second take. */
async function play(context, built) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setContent(built.doc);
    await page.evaluate(() => document.fonts.ready);
    const boxes = () => {
      const art = document.querySelector('svg.imported-design-art');
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom };
      };
      return {
        frame: box(document.body),
        logo: box(art.querySelectorAll('image')[0]),
        endLogo: box(art.querySelectorAll('image')[1]),
        panel: box(art.querySelector('[id="Panel"]')),
        credits: box(art.querySelector('.imported-design-credits')),
        rule: art.querySelector('[id="Rule"]') ? box(art.querySelector('[id="Rule"]')) : null,
        scale: art.getScreenCTM().d,
      };
    };
    const rest = await page.evaluate(() => {
      const art = document.querySelector('svg.imported-design-art');
      const tagline = [...art.querySelectorAll('text')].find((t) => t.textContent === 'A NoaCG production');
      return {
        wrapper: !!art.querySelector(':scope > .imported-design-credits-travel[data-noacg-whole]'),
        rootKids: [...art.children].map((k) => k.localName),
        tagline: tagline ? tagline.outerHTML : null,
      };
    });
    await page.evaluate(() => window.play());
    // Polled on a timer: a page in the background gets no animation frames to poll on.
    await page.waitForFunction(() => !!(window.noacgCreditsLast && window.noacgCreditsTween), null, { timeout: 15000, polling: 100 });
    const pose = (at) => page.evaluate(([at, read]) => {
      window.noacgCreditsTween.pause();
      window.noacgCreditsTween.progress(at);
      return new Function(`return (${read})();`)();
    }, [at, boxes.toString()]);
    const start = await pose(0);
    const mid = await pose(0.5);
    const end = await pose(1);
    const last = await page.evaluate(() => ({ ...window.noacgCreditsLast }));
    // R11: a re-fit with everything rolled out of the frame measures the artwork at rest.
    const refit = await page.evaluate(() => {
      const art = document.querySelector('svg.imported-design-art');
      const travel = art.querySelector('.imported-design-credits-travel');
      const before = travel.getAttribute('transform');
      let seen = 'unset';
      const measured = window.measureSvgBudgets;
      window.measureSvgBudgets = function () {
        seen = travel.getAttribute('transform');
        return measured.apply(this, arguments);
      };
      window.refitSvgText();
      window.measureSvgBudgets = measured;
      const tagline = [...art.querySelectorAll('text')].find((t) => t.textContent === 'A NoaCG production');
      return { before, after: travel.getAttribute('transform'), seen, tagline: tagline ? tagline.outerHTML : null };
    });
    // R6: the operator replaces a picture mid-roll; the roll keeps going and the picture rides it.
    const swap = await page.evaluate(() => {
      window.noacgCreditsTween.progress(0.5);
      const field = (window.SPXGCTemplateDefinition.DataFields ?? []).find((f) => f.ftype === 'filelist');
      const tween = window.noacgCreditsTween;
      window.update(JSON.stringify({ [field.field]: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }));
      const image = document.getElementById(field.field);
      return { sameTween: window.noacgCreditsTween === tween, inside: !!image.closest('.imported-design-credits-travel') };
    });
    // R5: Out freezes the pose and lets the graphic's Out play; Take hides first, then rolls again.
    const out = await page.evaluate(() => {
      const travel = document.querySelector('.imported-design-credits-travel');
      const pose = travel.getAttribute('transform');
      window.stopCreditsRoll();
      const frozen = { tween: window.noacgCreditsTween, pose: travel.getAttribute('transform') === pose, hidden: travel.hasAttribute('data-noacg-stopped') };
      window.noacgCreditsRoll();
      const retakeHidden = travel.hasAttribute('data-noacg-stopped');
      // R13: a snap, with that take still waiting to start, rests the artwork at its drawn pose,
      // visible, with nothing left to start or move.
      window.noacgSnap(null, { timers: false });
      return { frozen, retakeHidden, snapped: { pose: travel.getAttribute('transform'), hidden: travel.hasAttribute('data-noacg-stopped'), tween: window.noacgCreditsTween, start: window.noacgCreditsStart } };
    });
    return { errors, rest, start, mid, end, last, refit, swap, out };
  } finally {
    await page.close();
  }
}

/** R6: a staggered In, with one wrapped layer still moving past the In's own length, holds the roll
 *  back, hidden, until that layer lands. */
async function playStaggered(context, built) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setContent(built.doc);
    await page.evaluate(() => document.fonts.ready);
    const layers = await page.evaluate(() => {
      window.play();
      // A wrapped layer's own In, still running well after the box's: the plate.
      const plate = document.querySelector('svg.imported-design-art [id="Panel"]');
      window.noacgHeldIn = window.gsap.to(plate, { opacity: 1, duration: 30 });
      return (window.NOACG_ANIM.steps[0].duration);
    });
    await page.waitForTimeout(layers * 1000 + 1200);
    const held = await page.evaluate(() => ({
      tween: window.noacgCreditsTween,
      hidden: document.querySelector('.imported-design-credits-travel').hasAttribute('data-noacg-stopped'),
    }));
    await page.evaluate(() => window.noacgHeldIn.progress(1));
    await page.waitForFunction(() => !!window.noacgCreditsTween, null, { timeout: 15000, polling: 100 });
    const rolled = await page.evaluate(() => !document.querySelector('.imported-design-credits-travel').hasAttribute('data-noacg-stopped'));
    return { errors, held, rolled };
  } finally {
    await page.close();
  }
}

const R = await withBundledPage(
  [
    ['assets/svgImport.ts', 'NOACG_SVG'],
    ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
    ['templates/importedDesign/creditsRoll.ts', 'NOACG_ROLL'],
    ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
    ['components/wizard/import/stageMeasure.ts', 'NOACG_STAGE'],
  ].map(([rel, globalName]) => ({ entry: `${SRC}${rel}`, globalName })),
  async (page) => {
    const out = await page.evaluate(inPage, { template: TEMPLATE, padded: PADDED, artwork: ARTWORK });
    const context = await page.context().browser().newContext({ viewport: { width: 1920, height: 1080 } });
    try {
      out.played = await play(context, out.whole);
      out.paddedPlayed = await play(context, out.padded);
      out.staggeredPlayed = await playStaggered(context, out.staggered);
    } finally {
      await context.close();
    }
    return out;
  },
);

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.75, `${what}: ${a} vs ${b}`);

test('the flag builds the whole roll only on the fixed-artwork engine (R3), and the text roll stays its own', () => {
  assert.deepEqual(R.engines, { whole: true, text: false, editable: false });
  assert.ok(R.whole.js.includes("travel.setAttribute('data-noacg-whole', '');"));
  assert.ok(!R.text.js.includes('data-noacg-whole') && R.text.js.includes('function creditsArtwork()'));
  assert.ok(R.editableSame, 'an editable binding with the flag builds what it built without it');
  // No table word: the roll is design-owned JS, outside NOACG_BEHAVIOUR (R9).
  assert.equal(R.whole.js.match(/var NOACG_BEHAVIOUR_READS = .*$/m)?.[0], R.text.js.match(/var NOACG_BEHAVIOUR_READS = .*$/m)?.[0]);
  // The operator still gets the two pictures and Scroll speed; the credits text stays artwork.
  assert.deepEqual(R.whole.fields.map((f) => [f.title, f.ftype]), [['Credits', 'hidden'], ['Logo', 'filelist'], ['End logo', 'filelist'], ['Scroll speed (%)', 'number']]);
});

test('everything drawn rolls as one picture, from below the frame to above it (R1)', () => {
  const P = R.played;
  assert.deepEqual(P.errors, []);
  assert.ok(P.rest.wrapper, 'one wrapper holds the drawing');
  assert.ok(!P.rest.rootKids.includes('g') || P.rest.rootKids.filter((k) => k === 'g').length === 1, `only the wrapper is a group at the root: ${P.rest.rootKids}`);
  assert.equal(P.last.whole, true);
  // The plate is the top and the bottom of what paints.
  near(P.start.panel.top, P.start.frame.bottom, 'starts just below the frame');
  near(P.end.panel.bottom, P.end.frame.top, 'ends just above the frame');
  for (const at of [P.start, P.mid, P.end]) {
    near(at.logo.top - at.credits.top, P.start.logo.top - P.start.credits.top, 'the logo keeps its distance to the text');
    near(at.endLogo.top - at.credits.top, P.start.endLogo.top - P.start.credits.top, 'so does the end logo');
    near(at.panel.top - at.credits.top, P.start.panel.top - P.start.credits.top, 'so does the plate');
  }
  near(P.mid.panel.top, (P.start.panel.top + P.end.panel.top) / 2, 'a constant pace');
  // The pace is the text roll's: 90 px a second in a 1080 frame at Scroll speed 100 (R4).
  near(P.last.duration, P.last.distance / 90, 'the authored pace');
});

test('only what paints sets the extent (R7)', () => {
  const Q = R.paddedPlayed;
  assert.deepEqual(Q.errors, []);
  near(Q.start.panel.top, Q.start.frame.bottom, 'an empty artboard, transparent and hidden plates and a hit area add nothing at the start');
  // The rule under the plate paints last: the roll ends when its stroke (4 units below its flat
  // box) has cleared the top, not when the plate has.
  near(Q.end.rule.top + 4 * Q.end.scale, Q.end.frame.top, 'a flat stroked rule ends the roll, stroke included');
  near(Q.last.distance, R.played.last.distance + (Q.start.rule.top + 4 * Q.start.scale - Q.start.panel.bottom), 'the distance grows by the rule alone');
});

test('a re-fit while rolled measures at rest and puts the roll back (R11)', () => {
  const F = R.paddedPlayed.refit;
  assert.equal(F.seen, null, 'measured with no roll offset');
  assert.equal(F.after, F.before, 'the pose is restored');
  assert.equal(F.tagline, R.paddedPlayed.rest.tagline, 'the live text fits as it did at rest');
});

test('a picture swapped mid-roll rides it; Out freezes; Take hides then rolls again; a snap rests it (R5, R6, R13)', () => {
  const P = R.played;
  assert.deepEqual(P.swap, { sameTween: true, inside: true });
  assert.deepEqual(P.out.frozen, { tween: null, pose: true, hidden: false });
  assert.equal(P.out.retakeHidden, true);
  assert.deepEqual(P.out.snapped, { pose: null, hidden: false, tween: null, start: null });
});

test('a staggered In holds the roll back, hidden, until every wrapped layer has landed (R6)', () => {
  const S = R.staggeredPlayed;
  assert.deepEqual(S.errors, []);
  assert.deepEqual(S.held, { tween: null, hidden: true }, 'a layer still coming in: no roll yet, nothing shown');
  assert.equal(S.rolled, true, 'once it lands, the roll starts');
});

test('the Rolls default reads what is drawn off the artboard, as the roll reads it (R8)', () => {
  assert.deepEqual(R.evidence, {
    template: true, // the end logo and the plate run below the artboard
    textOnly: false, // only the credits text runs past it
    bledBackdrop: false, // a backdrop bled past every edge stays put
    unseen: false, // nothing that paints nothing counts
    logoBelow: true, // an unnamed logo drawn below: the owner's case
  });
});
