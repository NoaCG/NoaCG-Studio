import { test, expect } from '@playwright/test';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE } from '../_catalogScope';

// A STAGED GRAPHIC DOES NOT CHANGE SIZE WHEN THE OPERATOR TYPES MORE.
//
// `width: fit-content` (DESIGN_LANGUAGE §5) is the catalog's default and is only half right. On a
// NAMEPLATE it is the broadcast convention - each guest gets a strap cut to their name. On a BOARD
// it is a defect: the same panel is back all evening with different content, and an audience reads
// a graphic that re-sizes itself as a graphic that is broken. A scorebug is the worst case, because
// the operator does not even have to act for it to move - `update()` writes names and scores while
// the graphic is ON AIR.
//
// The fix is a STAGE: the design declares the width it was drawn for (`stageWidth`, emitted through
// `stageWidthCss`) and the text lives inside it. This gate is what keeps that true. Without it the
// 25 scoreboard stages are 25 numbers nothing re-measures, and the next person to widen a chip or
// add a cell would put the movement back with every check in the repo green - which is exactly how
// the mark-height failure next door happened.
//
// WHICH DESIGNS IT COVERS IS READ OFF THE RENDERED PANEL, never a list kept in this file: a design
// is STAGED when its box carries the `--stage-width` custom property that `stageBoxCss` emits. That
// makes the gate grow by itself - the next category to flip is covered the day it flips, and a
// design that loses its stage stops being asserted rather than failing confusingly. A list here
// would shrink silently as the catalog grew and still read as full coverage.
//
// The FIRST version of this gate inferred the stage from the CSS instead - "a `-box` rule that
// declares a width and never says `fit-content`" - and its first run called cr09, a credits column,
// a board. "Declares some width" is not the same claim as "declares a stage", which is why the
// marker property exists rather than being inferred.
//
// LAYOUT WIDTH, not the painted rectangle. sb21 leans its panel (`transform: skewX(-6deg)`), so its
// bounding rect widens as the box gets TALLER - it reported a 3px move on the first run purely
// because a longer name wrapped. The stage is a layout contract, and `offsetWidth` is the number
// that contract is about; a transform is the design drawing, not the panel re-sizing.
//
// THE COMPARISON IS THE DESIGN AGAINST ITSELF, at two lengths of its OWN sample text - a name stays
// name-shaped and a question stays question-shaped. The claim is not "a board is N pixels wide", it
// is that the number does not move. `scripts/footprint-stability-sweep.mjs` is the diagnostic that
// says by how much and on which element; this is the gate that says whether it may happen at all.
//
// WIDTH ONLY, and that is a deliberate half. Height is the other half of the contract and is not
// built yet: nine scoreboards still grow taller when a name wraps to a second row, and alert,
// public-info, quiz and results-board move ONLY vertically. Asserting height today would fail on
// designs no mechanism can yet hold. When reserved rows and `fitPlacedText` land, the height axis
// belongs in this same test - not in a second one.
//
// NO play(), deliberately, for the same reason mark-height.spec.ts gives: a preset sets its
// from-values when play() runs, so an unplayed graphic is already at its final LAYOUT, and
// measuring a mid-entrance frame would read a transform's scale as a width.

/** How many staged designs exist today. A drop below this means the detection stopped matching. */
const STAGED_FLOOR = 25;

interface Row {
  id: string;
  cat: string;
  short: number | null;
  long: number | null;
}

test(`a staged graphic keeps its width whatever the operator types${SCOPE_NOTE}`, async ({ page }) => {
  test.setTimeout(240_000);
  await toApp(page);

  const rows: Row[] = await page.evaluate(async (only: string[] | null) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    // The two ends of one rundown, derived from each field's OWN sample so the field keeps its
    // role. Same derivation as scripts/footprint-stability-sweep.mjs, so the gate and the
    // diagnostic cannot disagree about what "short" and "long" mean.
    const FILL = ['Wisniewska', 'district', 'provisional', 'afternoon', 'coverage', 'regional'];
    const fieldText = (sample: string, end: 'short' | 'long'): string => {
      const t = String(sample || '').trim();
      if (!t) return t;
      if (end === 'short') {
        const words = t.split(/\s+/);
        return words.slice(0, Math.max(1, Math.round(words.length * 0.4))).join(' ');
      }
      const target = Math.max(t.length + 8, Math.round(t.length * 1.7));
      let out = t;
      for (let i = 0; out.length < target; i++) out += ` ${FILL[i % FILL.length]}`;
      return out;
    };

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'opacity:0;pointer-events:none;';
    document.body.appendChild(frame);

    // Render one design at one end of the range and measure its staged panel. `undefined` means
    // this design hugs and is not this gate's business; `null` means it claims a stage and the
    // panel could not be measured, which IS a failure.
    const widthAt = async (
      template: unknown,
      end: 'short' | 'long',
    ): Promise<number | null | undefined> => {
      frame.srcdoc = composeDocument(template as never);
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow as (Window & {
        update?: (d: string) => void;
        SPXGCTemplateDefinition?: { DataFields?: { field: string; ftype: string; value: string }[] };
      }) | null;
      if (!win) return null;
      // Through update(), the path an operator's text takes. Only prose fields are driven: a
      // number, a dropdown, a colour or a filelist is not the operator typing, and a sentence in a
      // dropdown that names the graphic's own states would break the design rather than test it.
      const fields = win.SPXGCTemplateDefinition?.DataFields ?? [];
      const data: Record<string, string> = {};
      for (const fd of fields) {
        if (fd.ftype === 'textfield' || fd.ftype === 'textarea') data[fd.field] = fieldText(fd.value, end);
      }
      try {
        if (Object.keys(data).length) win.update?.(JSON.stringify(data));
      } catch { /* a broken lifecycle still lays out - measure what is there */ }
      await win.document.fonts.ready;    // a fallback face measures to a different width
      await new Promise((resolve) => setTimeout(resolve, 60));
      // The panel that carries the marker, read through the FRAME's own window: a custom property
      // is resolved by the document that owns the element.
      for (const el of Array.from(win.document.querySelectorAll('div'))) {
        if (win.getComputedStyle(el).getPropertyValue('--stage-width').trim()) {
          return (el as HTMLElement).offsetWidth;   // layout width: a lean is drawing, not re-sizing
        }
      }
      return undefined;
    };

    const out: Row[] = [];
    for (const [cat, variants] of Object.entries(CATALOG)) {
      for (const variant of variants ?? []) {
        if (only && !only.includes((variant as { id: string }).id)) continue;   // the affected slice
        const template = (variant as { create: (o: Record<string, unknown>) => unknown }).create({});
        const short = await widthAt(template, 'short');
        if (short === undefined) continue;          // hugs by design - not this gate's business
        out.push({ id: (variant as { id: string }).id, cat, short, long: (await widthAt(template, 'long')) ?? null });
      }
    }
    frame.remove();
    return out;
  }, ONLY_DESIGNS);

  // Never vacuous: a regex or a selector that silently stopped matching would otherwise pass this
  // test with an empty set, and an empty set is indistinguishable from a perfect catalog.
  // Unscoped, an empty set is indistinguishable from a perfect catalog, so the detection itself
  // is asserted. Under an explicit scope the count is whatever was asked for.
  if (!ONLY_DESIGNS) {
    expect(rows.length, 'no staged designs were detected - has the `-box` width contract changed?')
      .toBeGreaterThanOrEqual(STAGED_FLOOR);
  }
  const unmeasurable = rows.filter((r) => r.short === null || r.long === null);
  expect(unmeasurable.map((r) => r.id), 'no `-box` element found').toEqual([]);

  // ── The rule ──────────────────────────────────────────────────────────────────────────────
  // One pixel of tolerance for sub-pixel rounding, and not a pixel more: a stage that moves is a
  // stage that is not doing its job, however small the move.
  const moved = rows
    .filter((r) => Math.abs(r.long! - r.short!) > 1)
    .map((r) => ({ id: r.id, cat: r.cat, short: r.short, long: r.long }));
  expect(
    moved,
    'These graphics declare a stage and still change width with the operator\'s text. The stage is '
      + 'the room the design was drawn for; something inside it is pushing the panel wider instead '
      + 'of fitting. Run `node scripts/footprint-stability-sweep.mjs <category>` to see which '
      + 'element carries the move, then give that element the room rather than taking it from the '
      + 'panel (see `templates/declare-fixed-footprints-through-emit-them`).',
  ).toEqual([]);
});
