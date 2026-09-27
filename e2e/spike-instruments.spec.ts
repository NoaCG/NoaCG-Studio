// The bench-only spike instruments. They never gate a user flow, but they are what a paid
// round's numbers MEAN - and the panel-overflow blindness (docs/NOACG_PRO_PLAN.md §15.6) is
// exactly the class that builds green and reports a defect as its opposite.
// covers: src/ai/spike/**
//
// The design rules as a PRODUCT property (docs/DESIGN_RULES_PLAN.md §5 R4): the canonical module,
// the shared measurement instruments (moved out of the spike so product and bench read one code),
// and the warn-first product warnings. src/model and src/validation are CORE (full suite), but
// under the sprint focus that escalation runs the focus set - so the spec is in the focus set
// (`// focus`) as well, and this line documents the pairing.
// covers: src/{model/designRules.ts,validation/{designRulesWarnings,readabilityCheck,tickerCheck}.ts}
//
// The mark PROBE is read by the Lite legibility gate and by Pro's mark-field trigger, and the
// trigger rests entirely on `inkSpread` separating one ink from several.
// covers: src/assets/assetInfo.ts
//
// The spacing instrument must count content that ESCAPES its panel.
//
// THE DEFECT (docs/NOACG_PRO_PLAN.md §15.6, first item). Panel membership was geometric
// containment alone, so a name hanging off the edge of its panel was not counted as the panel's
// content at all: it was dropped from the union, the children that stayed home were measured
// against the far edge, and the WORST overflow of the instruments round reported the ROOMIEST
// padding. Phase A's own numbers inherit that blindness unless it is closed first.
//
// FOUR TESTS, because an overflow check that can only prove it fires is satisfied by one that
// flags everything, and because "outside the panel" and "cut off inside it" are different
// defects that the layout box cannot tell apart:
//   1. a well-formed panel stays quiet, and its padding is measured off its real content;
//   2. the same panel with one line hanging off the right raises `text-escapes-panel`, names
//      the side and the pixels, and reports the padding on that side as NEGATIVE;
//   3. the same overflow CLIPPED by a mask stays quiet - the text is cut off, not on the
//      picture, and only the visual rect can say so;
//   4. a decorative member running past the edge is recorded but raises nothing - a bleed is a
//      composition, and an instrument that fails one teaches designs to be timid.
//
// The fixtures are hand-laid geometry rather than catalog designs on purpose: this pins the
// MEASUREMENT, and a catalog design would move the numbers every time someone restyles it.
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

interface Escape { desc: string; side: string; px: number; isText: boolean }
interface Spacing {
  panel: string | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  escapes: Escape[];
  findings: { code: string; detail: string }[];
}

/**
 * The panel: 600x220 at (100,100). Its content is an accent, a name and a role, and every case
 * below varies ONE thing about the name - its width, whether a mask clips it, or whether it is
 * text at all.
 */
function fixture(options: { nameWidth: number; clip: boolean; decorativeBleed?: boolean }): string {
  const nameBox = `position:absolute;left:60px;top:30px;width:${options.nameWidth}px;height:70px;`
    + 'font:700 60px/70px Arial, sans-serif;color:#fff;white-space:nowrap';
  const name = options.clip
    // The house `.PREFIX-mask { overflow: hidden }` shape: the line lays out past its mask and
    // is painted cut off at the panel's edge.
    ? `<div style="position:absolute;left:60px;top:30px;width:520px;height:70px;overflow:hidden">
         <div id="f0" style="width:${options.nameWidth}px;height:70px;font:700 60px/70px Arial, sans-serif;color:#fff;white-space:nowrap">Alexandra Riva</div>
       </div>`
    : `<div id="f0" style="${nameBox}">Alexandra Riva</div>`;
  // A decorative member with no text of its own, running 90px past the panel's right edge.
  const bleed = options.decorativeBleed
    ? '<div style="position:absolute;left:560px;top:180px;width:230px;height:8px;background:#f6a623"></div>'
    : '';
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:#333">
  <div id="panel" style="position:absolute;left:100px;top:100px;width:600px;height:220px;background:#101216">
    <div style="position:absolute;left:24px;top:30px;width:8px;height:160px;background:#f6a623"></div>
    ${name}
    <div id="f1" style="position:absolute;left:60px;top:130px;width:400px;height:30px;font:500 24px/30px Arial, sans-serif;color:#ccc">Chief Political Correspondent</div>
    ${bleed}
  </div>
</body></html>`;
}

async function measure(page: Page, html: string): Promise<{ spacing: Spacing; panelFill: number | null }> {
  return page.evaluate(async (doc) => {
    document.getElementById('spike-fixture')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'spike-fixture';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = doc;
    await new Promise((resolve) => { frame.onload = resolve; });
    const inner = frame.contentDocument as Document;
    await inner.fonts.ready;
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts');
    const spacing = measureSpacing(inner);
    const proportion = measureProportion(inner);
    frame.remove();
    return { spacing, panelFill: proportion.panelFill };
  }, html) as Promise<{ spacing: Spacing; panelFill: number | null }>;
}

/** A transparent-ink wordmark, the shape most channels bring. */
const WORDMARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">'
  + '<rect x="0" y="26" width="64" height="14" fill="#ffffff"/>'
  + '<text x="90" y="76" font-family="Arial" font-size="58" font-weight="700" fill="#ffffff">Meridian</text></svg>';

/** The same wordmark drawn in TWO inks - the shape a coloured logo has. */
const COLOURED_MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
  + '<circle cx="128" cy="128" r="96" fill="#ff7a1a"/>'
  + '<circle cx="128" cy="128" r="48" fill="#ffc838"/></svg>';

// THE MEASUREMENT THAT DECIDES WHETHER A MARK GETS A READING FIELD
// (docs/NOACG_PRO_PLAN.md §15.8). A mean ink luminance flagged three marks in the first Phase A
// round; the owner's blind read and a rendered A/B agreed with exactly one of them, and both
// false positives were one full-colour roundel that reads perfectly. `inkSpread` is what tells
// the two apart, and the whole trigger rests on the gap between them staying wide.
test.describe('a single-ink mark and a coloured one separate by their ink spread', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  test('one ink measures near zero, several measure far above the floor', async ({ page }) => {
    const measured = await page.evaluate(async ([single, coloured]) => {
      const { probeMark } = await import('/src/assets/assetInfo.ts');
      const probe = async (svg: string) =>
        probeMark({ path: 'images/mark.svg', data: `data:image/svg+xml;base64,${btoa(svg)}` });
      return {
        single: (await probe(single))?.inkSpread,
        coloured: (await probe(coloured))?.inkSpread,
      };
    }, [WORDMARK, COLOURED_MARK]);

    // The floor the composer uses is 0.05, read off the fixture marks (0.0004 and 0.0021 for a
    // single ink, 0.2053 for the roundel). Asserted as a BAND on each side rather than as the
    // constant, so a drift that narrows the gap fails here instead of quietly re-enabling the
    // false positive.
    expect(measured.single).toBeLessThan(0.01);
    expect(measured.coloured).toBeGreaterThan(0.1);
  });
});

test.describe('the platform seats a mark against the words, not against empty grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  // THE DEFECT the owner failed twice (docs/NOACG_PRO_PLAN.md §15.6): "name in the top right,
  // logo centred, empty space underneath". The seat spanned a fixed nine rows so the mark would
  // centre against any design's text stack - and nine rows means EIGHT row gaps, so a box that
  // declared `gap: 20px` for its two text rows got 160px of empty grid beneath them. The mark
  // centred over the void, the words were pushed to the top, and the panel came out a third
  // taller than its content.
  test('the seated control is centred on its own content', async ({ page }) => {
    const measured = await page.evaluate(async (svg) => {
      const { seatedMarkControlAnchor } = await import('/src/ai/spike/anchors.ts');
      const { probeMark } = await import('/src/assets/assetInfo.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
      const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
      const probe = await probeMark({ path: 'images/mark.svg', data: dataUrl });
      if (!probe) return { error: 'the mark did not probe' };
      const anchor = seatedMarkControlAnchor({
        id: 'meridian',
        name: 'Meridian',
        world: 'a regional news channel',
        typeface: 'inter',
        palette: [{ name: 'Gold', hex: '#c8a24a', note: 'the accent' }],
        mark: { path: 'images/mark.svg', dataUrl, probe },
      });

      document.getElementById('spike-fixture')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'spike-fixture';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      frame.srcdoc = composeDocument(anchor.template);
      await new Promise((resolve) => { frame.onload = resolve; });
      const inner = frame.contentDocument as Document;
      await inner.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const spacing = measureSpacing(inner, { markFieldId: anchor.markFieldId ?? null });
      frame.remove();
      // The design declares two text rows, so the seat spans two.
      return { spacing, spansTwoRows: /grid-row:\s*1\s*\/\s*span 2\b/.test(anchor.template.css) };
    }, WORDMARK);

    expect(measured.error).toBeUndefined();
    expect(measured.spansTwoRows).toBe(true);
    const pad = measured.spacing?.padding;
    expect(pad).toBeTruthy();
    // The behavioural half: a panel sitting evenly on its own content. Measured at 4.38x before
    // the fix, which is what the instrument reported as `padding-lopsided`.
    expect(pad!.bottom / pad!.top).toBeLessThan(1.25);
    expect(measured.spacing?.findings.map((f) => f.code)).not.toContain('padding-lopsided');
  });
});

test.describe('a docked mark is measured by its INK, not by the well it sits in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  // THE FALSE POSITIVES THIS CLOSES, and they were the GOOD designs. `mark-crowded` fired on
  // lt07 (0.22), lt41 and ls10 - three of the designs that carry a crest best - because each
  // draws the mark inside a well and expresses the brand manual's clear space as the image's own
  // PADDING. `getBoundingClientRect` reports the border box, so that clear space sat INSIDE the
  // thing being measured and the gap to the text was nearly zero by construction. Swept over the
  // 24 mark-capable lower thirds, the ink box moves exactly those three and leaves the other 21
  // untouched (scripts/spike-mark-clearance-sweep.mjs).
  //
  // TWO SIDES, because a check that can only prove it stopped firing is satisfied by one that
  // never fires: the same geometry with the padding moved OUT of the image must still be caught.
  // THE GEOMETRY, stated because every reading falls straight out of it. The image's INK is an
  // `ink`px square at x 40 (120px unless a case says otherwise); `padding` grows its border box
  // symmetrically around that ink, and the text always starts `gap` past the border box's right
  // edge - which is what a well drawn as image padding does. So the ink stands `padding + gap`
  // off the words while the border box stands exactly `gap` off them, and the two boxes disagree
  // by the padding alone. `ink` is the third knob, and it moves ONLY the mark: it is what tells a
  // unit that divides by the mark apart from one that divides by the type.
  const markFixture = (options: { padding: number; gap: number; ink?: number }): string => {
    const ink = options.ink ?? 120;
    const size = ink + options.padding * 2;
    const textLeft = 40 + size + options.gap;
    return `<!doctype html><html><head><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:#333">
  <div id="panel" style="position:absolute;left:100px;top:100px;width:700px;height:${Math.max(260, size + 80)}px;background:#101216">
    <img id="f2" alt="" style="position:absolute;left:40px;top:40px;width:${size}px;height:${size}px;
         padding:${options.padding}px;box-sizing:border-box"
         src="data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#f6a623"/></svg>')}" />
    <div id="f0" style="position:absolute;left:${textLeft}px;top:50px;width:220px;height:60px;font:700 48px/60px Arial, sans-serif;color:#fff">Alexandra Riva</div>
    <div id="f1" style="position:absolute;left:${textLeft}px;top:120px;width:220px;height:30px;font:500 24px/30px Arial, sans-serif;color:#ccc">Correspondent</div>
  </div>
</body></html>`;
  };

  async function markGap(page: Page, html: string) {
    return page.evaluate(async (doc) => {
      document.getElementById('spike-fixture')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'spike-fixture';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      frame.srcdoc = doc;
      await new Promise((resolve) => { frame.onload = resolve; });
      const inner = frame.contentDocument as Document;
      await inner.fonts.ready;
      const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
      // Read BEFORE the frame leaves the DOM: a live CSSStyleDeclaration empties the moment its
      // iframe is detached, and every length then parses as 0 - an inset of nothing, reported as
      // a measurement.
      const out = measureSpacing(inner, { markFieldId: 'f2' });
      frame.remove();
      return { markGap: out.markGap, codes: out.findings.map((f) => f.code), findings: out.findings };
    }, html) as Promise<{ markGap: number | null; codes: string[]; findings: { code: string; detail: string }[] }>;
  }

  test('clear space carried as the image\'s own padding is COUNTED, not swallowed', async ({ page }) => {
    // 30px of padding plus a 10px gap: the ink stands 40px off the words, and the primary type
    // size is the heading's 48px, so 40/48 = 0.83 - clear of the 0.35 floor. Measured on the
    // BORDER box the identical design stands 10px off = 0.21 and is called cramped, which is the
    // lt07 reading in a fixture.
    const measured = await markGap(page, markFixture({ padding: 30, gap: 10 }));
    expect(measured.markGap).toBeCloseTo(0.83, 2);
    expect(measured.codes).not.toContain('mark-crowded');
  });

  test('…and a mark that really is crammed is still caught', async ({ page }) => {
    // No padding at all, 10px of gap: 10/48 = 0.21. Nothing about the ink box excuses this.
    const measured = await markGap(page, markFixture({ padding: 0, gap: 10 }));
    expect(measured.markGap).toBeCloseTo(0.21, 2);
    expect(measured.codes).toContain('mark-crowded');
    // The finding carries ALL THREE raw numbers, because a ratio alone cannot say which of
    // several things happened - and the mark's height in particular is the one the unit used to
    // be, which is how ls18 came to be flagged for being generous (MARK_GAP_FLOOR_RATIO).
    const detail = measured.findings.find((f) => f.code === 'mark-crowded')!.detail;
    expect(detail).toContain('10px from 48px type, mark 120px');
  });

  test('a mark given room by a TALL design is not called crowded for it', async ({ page }) => {
    // THE ARTIFACT THE UNIT CHANGE CLOSES, as a fixture: the same 40px of clear space that
    // passes above, beside a mark twice the height. Under the old mark-height unit this reads
    // 40/240 = 0.17 and was flagged; under the type-size unit it is the identical 0.83 the
    // first test asserts, because the gap and the type did not move - only the mark did.
    //
    // This is the ls18 pair in miniature: it was called crowded at 22px of clear space while
    // lt08 passed at exactly 22px, on nothing but a taller mark.
    const measured = await markGap(page, markFixture({ padding: 30, gap: 10, ink: 240 }));
    expect(measured.markGap).toBeCloseTo(0.83, 2);
    expect(measured.codes).not.toContain('mark-crowded');
    // …and the mark's height is still REPORTED, so a reader can see it is a tall mark. Asserted
    // through the adrift-free clean case by re-reading the raw pair off the crowded twin below.
    const crowded = await markGap(page, markFixture({ padding: 0, gap: 10, ink: 240 }));
    expect(crowded.codes).toContain('mark-crowded');
    expect(crowded.findings.find((f) => f.code === 'mark-crowded')!.detail)
      .toContain('mark 240px');
  });
});

test.describe('the spacing instrument sees content that escapes its panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  test('a panel whose content stays inside reports positive padding and no escape', async ({ page }) => {
    const { spacing, panelFill } = await measure(page, fixture({ nameWidth: 400, clip: false }));

    expect(spacing.panel).toBe('div#panel');
    expect(spacing.escapes).toEqual([]);
    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    // Measured off the real content: left 24px, right 600-(60+400)=140px, both positive.
    expect(spacing.padding?.left).toBeGreaterThan(0);
    expect(spacing.padding?.right).toBeGreaterThan(0);
    expect(panelFill).toBeGreaterThan(0);
    expect(panelFill).toBeLessThanOrEqual(1);
  });

  test('a line hanging off the panel is named, with its side and its pixels', async ({ page }) => {
    // 1200px wide from x=60 inside a 600px panel: 660px out through the right edge.
    const { spacing, panelFill } = await measure(page, fixture({ nameWidth: 1200, clip: false }));

    expect(spacing.panel).toBe('div#panel');
    const escaped = spacing.findings.filter((f) => f.code === 'text-escapes-panel');
    expect(escaped).toHaveLength(1);
    expect(escaped[0].detail).toContain('div#f0');
    expect(escaped[0].detail).toContain('right');

    expect(spacing.escapes).toHaveLength(1);
    expect(spacing.escapes[0]).toMatchObject({ desc: 'div#f0', side: 'right', isText: true });
    expect(spacing.escapes[0].px).toBeCloseTo(660, 0);

    // THE ORIGINAL DEFECT: this side used to read as the roomiest padding in the round.
    expect(spacing.padding?.right).toBeLessThan(0);
    // …and the panel is now honestly reported as too small for what it holds.
    expect(panelFill).toBeGreaterThan(1);
  });

  test('the same overflow CLIPPED by a mask is not an escape - it is cut off', async ({ page }) => {
    const { spacing } = await measure(page, fixture({ nameWidth: 1200, clip: true }));

    expect(spacing.panel).toBe('div#panel');
    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    expect(spacing.escapes).toEqual([]);
    expect(spacing.padding?.right).toBeGreaterThan(0);
  });

  test('a decorative member bleeding past the edge is recorded, not flagged', async ({ page }) => {
    const { spacing } = await measure(page, fixture({ nameWidth: 400, clip: false, decorativeBleed: true }));

    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    expect(spacing.escapes).toHaveLength(1);
    expect(spacing.escapes[0]).toMatchObject({ side: 'right', isText: false });
    expect(spacing.escapes[0].px).toBeCloseTo(190, 0);
    // A bleed does not move the padding either: the union is the content that stayed home.
    expect(spacing.padding?.right).toBeGreaterThan(0);
  });
});
