// gate: factory
// needs: browser
// guards: src/validation/readabilityCheck.ts, src/templates/scoreboards/sb01.ts
//
// WHAT IS BEHIND THE TEXT - both directions of the legibility-protection rule.
//
// The rule warns when informational text "sits on a transparent stack over the picture with no
// visible protection". Until 2026-09-16 it warned that about the HOME and AWAY names on the
// shipped sb01 scoreboard, whose own screenshot shows them on a solid near-black slab: the
// chassis paints that slab on `.scoreboard-box::before`, because a preset tweens the element
// itself and the -8deg lean has to live on a layer no preset can flatten. A pseudo-element is
// not a DOM ancestor, so the backing walk read every ancestor as transparent and cried wolf
// about our own catalog - which is how a student learns to stop reading the gate.
//
// Widening a gate is the move that quietly blinds it, so this file pins the OTHER direction
// harder than the fix. The positive cases are two (sb01, and a hand-built ::after slab); the
// rest are pseudo-elements that paint an opaque background and are still NOT a backing - a
// sliver of an accent edge, a layer that paints OVER the words, one that generates no box, one
// too translucent to hide footage, one transformed off the text, and one whose host is not
// positioned so we cannot say where it lands. Every one of those must still warn.
//
// It also pins the measurement that the widening unlocks: with a slab resolved, text is held to
// the CONTRAST floor it was previously exempt from, and dark-on-dark now blocks.
//
// The DOM is the point - the rule reads `getComputedStyle(host, '::before')`, used box values
// and transform matrices, none of which exist outside a real engine. The fixtures are measured
// in the page itself; sb01 goes through the real composer in BOTH poses the product measures a
// graphic in, because they are different documents: settled, as the runtime bench behind
// `noacg validate` sees it, and composed-and-left-alone, as the editor's export panel does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/templates/catalog.ts', import.meta.url)), globalName: 'NOACG_CATALOG' },
  { entry: fileURLToPath(new URL('../src/preview/composeDocument.ts', import.meta.url)), globalName: 'NOACG_COMPOSE' },
  { entry: fileURLToPath(new URL('../src/validation/readabilityCheck.ts', import.meta.url)), globalName: 'NOACG_READ' },
];

/** The design whose slab exposed this - the first scoreboard a stranger scaffolds. */
const CHASSIS = 'sb01';

/**
 * The hand-built fixtures, each one line of CSS away from the one before it. `panel` is the
 * host, `f0` is field-bound text (informational whatever its size, so no case here depends on
 * a floor number), and `backed` is what the fixture claims: true means the text is on a slab.
 */
const FIXTURES = [
  {
    name: 'a slab on ::before, behind the text',
    backed: true,
    css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #0a0c10; }`,
  },
  {
    name: 'a slab on ::after, behind the text',
    backed: true,
    css: `.panel::after { content: ''; position: absolute; inset: 0; z-index: -1; background: #0a0c10; }`,
  },
  {
    name: 'nothing behind the text at all',
    backed: false,
    css: ``,
  },
  {
    // The shape that would blind the check: an opaque layer on z-index 0 paints ON TOP of the
    // host's in-flow text. Reading it as a backing would score hidden words as legible.
    name: 'an opaque ::before painted over the text (no negative layer)',
    backed: false,
    css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: 0; background: #0a0c10; }`,
  },
  {
    // sb01's own accent edge is exactly this: `.scoreboard-accent::after`, 10px wide.
    name: 'an accent edge that covers a sliver, not the text',
    backed: false,
    css: `.panel::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 10px; z-index: -1; background: #0a0c10; }`,
  },
  {
    name: 'a styled ::before that generates no box',
    backed: false,
    css: `.panel::before { position: absolute; inset: 0; z-index: -1; background: #0a0c10; }`,
  },
  {
    name: 'a ::before too translucent to hide footage',
    backed: false,
    css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(10, 12, 16, 0.2); }`,
  },
  {
    name: 'a ::before transformed clear of the text',
    backed: false,
    css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #0a0c10; transform: translateX(900px); }`,
  },
  {
    // A stated limit rather than a defect: with a static host the pseudo's containing block is
    // some ancestor we have not measured, so the check refuses instead of guessing.
    name: 'a slab whose host is not positioned',
    backed: false,
    css: `.panel { position: static; } .panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #0a0c10; }`,
  },
];

/** Measure one fixture in the test page itself. Runs in the browser. */
const MEASURE_FIXTURE = ({ css, ink }) => {
  document.getElementById('fx')?.remove();
  const host = document.createElement('div');
  host.id = 'fx';
  host.innerHTML = `<style>
    body { margin: 0; background: transparent; }
    .panel { position: relative; margin: 200px; padding: 30px 60px; width: 640px; }
    .panel span { font-size: 60px; font-weight: 800; color: ${ink}; }
    ${css}
  </style>
  <div class="panel"><span id="f0">MATCHDAY</span></div>`;
  document.body.appendChild(host);
  const report = window.NOACG_READ.measureReadability(document, {
    width: 1920, height: 1080, mode: 'standard', target: { profile: 'tv' },
  });
  const reading = report.readings.find((r) => r.snippet === 'MATCHDAY');
  return {
    codes: report.findings.map((f) => f.code),
    contrast: reading ? reading.contrast : null,
  };
};

/**
 * Mount a catalog design through the real composer and measure it in BOTH poses the product
 * measures it in. They are not the same document, and a backing that resolves in one and not
 * the other would fix half the complaint:
 *
 *   `hold`   - settled with its own field defaults, the way the runtime bench behind
 *              `noacg validate` sees a graphic (preview/settleGraphic.ts);
 *   `panel`  - composed and left alone, no settle and no play, which is exactly what the
 *              editor's export panel does (designRulesWarnings.ts `checkTemplateLegibility`)
 *              and the surface the warning is read on.
 *
 * Runs in the browser.
 */
const MEASURE_VARIANT = async (id) => {
  const variant = window.NOACG_CATALOG.variantById(id);
  if (!variant) return { error: `no variant ${id}` };
  const template = variant.create({});
  const data = Object.fromEntries(
    template.fields
      .filter((f) => ['textfield', 'textarea', 'number'].includes(f.ftype))
      .map((f) => [f.field, String(f.value ?? '')]),
  );
  const mount = async (srcdoc, settles) => {
    document.getElementById('fx')?.remove();
    document.body.style.margin = '0';
    const frame = document.createElement('iframe');
    frame.id = 'fx';
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;visibility:visible;';
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.srcdoc = srcdoc;
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    if (settles) await new Promise((resolve) => setTimeout(resolve, 1200)); // the bootstrap waits on fonts
    else {
      // Both waits capped, exactly as checkTemplateLegibility caps them - a throttled page
      // stops firing requestAnimationFrame, and this file must not carry the bug it guards.
      await Promise.race([doc.fonts.ready, new Promise((resolve) => { setTimeout(resolve, 1200); })]);
      await Promise.race([
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        new Promise((resolve) => { setTimeout(resolve, 300); }),
      ]);
    }
    const report = window.NOACG_READ.measureReadability(doc, {
      width: 1920, height: 1080, mode: 'standard', target: { profile: 'tv' }, category: template.type,
    });
    return {
      findings: report.findings.map((f) => ({ code: f.code, detail: f.detail })),
      readings: report.readings,
    };
  };
  return {
    hold: await mount(window.NOACG_COMPOSE.composeDocument(template, { settleWithData: JSON.stringify(data) }), true),
    panel: await mount(window.NOACG_COMPOSE.composeDocument(template), false),
  };
};

// One browser for the whole file - launching it is the expensive part.
const measured = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const fixtures = [];
  for (const fixture of FIXTURES) {
    fixtures.push({
      ...fixture,
      onWhite: await page.evaluate(MEASURE_FIXTURE, { css: fixture.css, ink: '#ffffff' }),
    });
  }
  return {
    fixtures,
    // The same slab with text barely distinguishable from it: the contrast rule can only reach
    // this once a backing resolves, so it is the proof that the widening MEASURES rather than
    // merely falls silent.
    darkOnSlab: await page.evaluate(MEASURE_FIXTURE, {
      css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #0a0c10; }`,
      ink: '#16181c',
    }),
    // The two ends of the band every shipped palette lives in: `--panel-bg` is translucent in
    // all fourteen curated palettes, 0.86 to 0.96 for most and 0.55 for the two cinematic ones.
    nearSolidSlab: await page.evaluate(MEASURE_FIXTURE, {
      css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(8, 10, 14, 0.94); }`,
      ink: '#ffffff',
    }),
    scrimSlab: await page.evaluate(MEASURE_FIXTURE, {
      css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(0, 0, 0, 0.55); }`,
      ink: '#ffffff',
    }),
    // A translucent panel still has to be able to FAIL, or the compositing above would just be
    // a softer way of going quiet: same near-black panel as `darkOnSlab`, same barely-there ink.
    translucentUnreadable: await page.evaluate(MEASURE_FIXTURE, {
      css: `.panel::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(10, 12, 16, 0.94); }`,
      ink: '#16181c',
    }),
    chassis: await page.evaluate(MEASURE_VARIANT, CHASSIS),
  };
});

test('the house scoreboard is not warned about a panel it paints', () => {
  const { chassis } = measured;
  assert.equal(chassis.error, undefined, 'the chassis failed to mount');
  for (const [pose, report] of Object.entries(chassis)) {
    const unprotected = report.findings.filter((f) => f.code === 'text-unprotected-over-video');
    assert.deepEqual(
      unprotected.map((f) => f.detail),
      [],
      `${CHASSIS} (${pose}) paints its slab on .scoreboard-box::before; nothing on it is over bare picture`,
    );
    assert.equal(
      report.findings.filter((f) => f.code === 'text-low-contrast').length,
      0,
      `${CHASSIS} (${pose}) reads white on near-black - resolving its slab must not invent a contrast failure`,
    );
  }
});

test('the scoreboard team names are measured against the slab, not skipped', () => {
  for (const [pose, report] of Object.entries(measured.chassis)) {
    const names = report.readings.filter((r) => /^(HOME|AWAY)$/.test(r.snippet));
    assert.equal(names.length, 2, `both team names should be read (${pose})`);
    for (const name of names) {
      assert.ok(
        typeof name.contrast === 'number' && name.contrast > 10,
        `"${name.snippet}" (${pose}) resolved contrast ${name.contrast} - the near-black slab should read well past 10:1`,
      );
    }
  }
});

test('a pseudo-element backs text only when it is opaque, behind it, and covers it', () => {
  for (const fixture of measured.fixtures) {
    const warned = fixture.onWhite.codes.includes('text-unprotected-over-video');
    assert.equal(
      warned,
      !fixture.backed,
      fixture.backed
        ? `${fixture.name}: backed text was still warned about`
        : `${fixture.name}: this is NOT a backing, and the warning went missing`,
    );
    assert.equal(
      typeof fixture.onWhite.contrast === 'number',
      fixture.backed,
      `${fixture.name}: a contrast ratio should be reported exactly when a backing resolves`,
    );
  }
});

test('text on a slab it barely clears now fails the contrast floor', () => {
  const { codes, contrast } = measured.darkOnSlab;
  assert.ok(typeof contrast === 'number' && contrast < 2, `expected a near-invisible ratio, got ${contrast}`);
  assert.ok(
    codes.includes('text-low-contrast'),
    `dark ink on a dark ::before slab should block on contrast, got ${codes.join(', ') || 'no findings'}`,
  );
});

test('a translucent panel still counts as a panel', () => {
  // The band every shipped palette lives in. What is pinned here is the PROTECTION verdict -
  // a panel at 0.94 and a scrim at 0.55 are both panels, and neither text is over bare picture.
  // What is deliberately NOT pinned is the RATIO: both are measured as if the panel were solid,
  // which over-reports the 0.55 case badly. That is a pre-existing property of the backing walk
  // on the element path, it moves 14 shipped designs across a blocking floor to change, and it
  // is written up in https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/a-translucent-panel-is-measured-as-if-it-were-solid.md rather
  // than altered here - a false-positive fix is no place to smuggle in a severity ruling.
  for (const [name, m] of [['0.94 panel', measured.nearSolidSlab], ['0.55 scrim', measured.scrimSlab]]) {
    assert.ok(
      !m.codes.includes('text-unprotected-over-video'),
      `${name}: a translucent panel is still a panel, and must not be called bare picture`,
    );
    assert.equal(typeof m.contrast, 'number', `${name}: a backing resolved, so a ratio is owed`);
  }
  // A translucent panel must still be able to FAIL, or accepting one would be a way of going
  // quiet: the same near-black panel as `darkOnSlab`, at 0.94, with the same barely-there ink.
  const hidden = measured.translucentUnreadable;
  assert.ok(
    hidden.codes.includes('text-low-contrast'),
    `near-invisible ink on a 0.94 panel must block (${hidden.contrast}:1), got ${hidden.codes.join(', ') || 'no findings'}`,
  );
});
