import { test, expect } from '@playwright/test';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE } from '../_catalogScope';
import * as rules from '../../scripts/rules.mjs';

// A MULTI-COLUMN BLOCK NEVER SPILLS ITS WORDS SIDEWAYS.
//
// CSS multicol has one failure mode that looks like nothing else in the catalog: given a DEFINITE
// height it stops balancing, fills column one to that height, then column two, and then keeps
// going into OVERFLOW COLUMNS to the RIGHT - laid out past the container's own box. A reveal mask
// (`overflow: hidden`, which every masked line in this catalog has) then hides them, so the
// operator's copy does not bleed a hair past the bottom where somebody would see it. It vanishes,
// silently, with the graphic looking finished.
//
// It is invisible to every other mechanism here as well. `fitStagedText` (shared/stageFit.ts) is
// the runtime that shrinks text back into the room a design gave it, and neither of its probes can
// see this: `scrollHeight` reports no vertical overflow because there genuinely is none, and the
// Range it measures the width with returns LINE BOXES, each one sitting inside a column and so
// narrower than the box it is spilling out of. The fit reports a comfortable fit while the words
// go missing.
//
// That is how issue #36 got in. card80's two-column standfirst settled 0.25px inside the height
// the fit pinned on it, at the design's OWN sample text - so this checkout balanced into two
// columns and the nightly's renderer opened a third, and the only thing that noticed was
// `overflow-sweep.mjs` reporting a new `.info-card-mask:x` clip against its baseline. A sweep
// signature is a thin thread to hang a silent-text-loss defect on, and it only ever measures the
// design's default words - the failure is far larger with an operator's.
//
// So this gate asserts the mechanism instead of the symptom, at the length where it actually
// bites: drive every design's prose fields with copy well past its own sample, then require that
// every multicol container in the catalog still fits its own width. WHICH DESIGNS IT COVERS IS
// READ OFF THE RENDERED PAGE - any element whose computed `column-count`/`column-width` is not
// `auto` - never a list kept here, so the next design to set a measure is covered the day it
// lands.
//
// NO play(), for the same reason mark-height.spec.ts gives: an unplayed graphic is already at its
// final LAYOUT, and a mid-entrance frame would read a transform as a width.

/** How many multicol containers the catalog has today. Zero would pass this gate vacuously. */
const MULTICOL_FLOOR = 1;

/** scrollWidth beats clientWidth by a pixel on rounded metrics without a column having opened. */
const TOLERANCE = 2;

interface Spill {
  id: string;
  cat: string;
  cls: string;
  columns: string;
  height: string;
  clientWidth: number;
  scrollWidth: number;
  text: string;
}

test(`a multi-column block keeps its columns inside its own width${SCOPE_NOTE}`, async ({ page }) => {
  test.setTimeout(300_000);
  await toApp(page);

  const result = await page.evaluate(async ({ tolerance, only }: { tolerance: number; only: string[] | null }) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    // Copy well past what the design was drawn for, derived from each field's OWN sample so the
    // field keeps its role - the same derivation footprint-stability.spec.ts uses at its long end,
    // pushed further because a two-column measure swallows a lot before it breaks.
    const FILL = ['Wisniewska', 'district', 'provisional', 'afternoon', 'coverage', 'regional'];
    const longer = (sample: string): string => {
      const t = String(sample || '').trim();
      if (!t) return t;
      const target = Math.max(t.length + 40, Math.round(t.length * 2.5));
      let out = t;
      for (let i = 0; out.length < target; i++) out += ` ${FILL[i % FILL.length]}`;
      return out;
    };

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'opacity:0;pointer-events:none;';
    document.body.appendChild(frame);

    const spills: Spill[] = [];
    let multicol = 0;

    for (const [cat, variants] of Object.entries(CATALOG)) {
      for (const variant of variants ?? []) {
        const id = (variant as { id: string }).id;
        if (only && !only.includes(id)) continue;   // the affected slice (e2e/_catalogScope.ts)
        const template = (variant as { create: (o: Record<string, unknown>) => unknown }).create({});
        // Cheap skip, taken off the emitted CSS before anything is rendered: a design that never
        // sets a measure cannot fail this, and rendering 500 designs and reading the computed
        // style of every element in them is the whole cost of this gate.
        const css = String((template as { css?: string }).css ?? '');
        if (!/\bcolumns?\s*:|\bcolumn-count\s*:|\bcolumn-width\s*:/.test(css)) continue;
        frame.srcdoc = composeDocument(template as never);
        await new Promise((resolve) => { frame.onload = resolve; });
        const win = frame.contentWindow as (Window & {
          update?: (d: string) => void;
          SPXGCTemplateDefinition?: { DataFields?: { field: string; ftype: string; value: string }[] };
        }) | null;
        const doc = frame.contentDocument;
        if (!win || !doc) continue;

        // CALIBRATE FIRST, THEN TYPE, and that order is the whole test. The stage runtime measures
        // each line's reserve from the design's OWN sample and re-measures once the webfonts land;
        // only after that does an operator's value count as "past the room". Drive update() before
        // the swap and the runtime calibrates against the long copy instead - the reserve becomes
        // whatever was typed, everything fits by construction, and this gate passes on a build that
        // is losing words. It did, on the first draft.
        await doc.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 120));

        // Through update(), the path an operator's text takes. Prose fields only: a number, a
        // colour or a dropdown is not the operator typing.
        const fields = win.SPXGCTemplateDefinition?.DataFields ?? [];
        const data: Record<string, string> = {};
        for (const fd of fields) {
          if (fd.ftype === 'textfield' || fd.ftype === 'textarea') data[fd.field] = longer(fd.value);
        }
        try {
          if (Object.keys(data).length) win.update?.(JSON.stringify(data));
        } catch { /* a broken lifecycle still lays out - measure what is there */ }
        await new Promise((resolve) => setTimeout(resolve, 120));

        for (const el of Array.from(doc.body.querySelectorAll('*'))) {
          const cs = win.getComputedStyle(el);
          if (cs.columnCount === 'auto' && cs.columnWidth === 'auto') continue;
          multicol += 1;
          const node = el as HTMLElement;
          if (node.scrollWidth - node.clientWidth <= tolerance) continue;
          spills.push({
            id,
            cat,
            cls: String(node.className || node.tagName).slice(0, 40),
            columns: `${cs.columnCount}/${cs.columnWidth}`,
            // The cause, nearly every time: something gave the container a definite height.
            height: node.style.height || cs.height,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            text: (node.textContent || '').trim().slice(0, 40),
          });
        }
      }
    }
    frame.remove();
    return { spills, multicol };
  }, { tolerance: TOLERANCE, only: ONLY_DESIGNS });

  // Never vacuous: if the detection stops matching, an empty set is indistinguishable from a
  // catalog with nothing to find.
  // Only unscoped: under an explicit scope, a slice with no multi-column design in it is the
  // ordinary case, not a detection that stopped matching.
  if (!ONLY_DESIGNS) {
    expect(
      result.multicol,
      'no multi-column container was found in the catalog - has the detection stopped matching?',
    ).toBeGreaterThanOrEqual(MULTICOL_FLOOR);
  }

  expect(
    result.spills,
    'These multi-column blocks laid their remaining rows out in OVERFLOW COLUMNS beside the box '
      + 'instead of reflowing inside it, so the reveal mask around them hides the operator\'s words '
      + 'entirely. The cause is almost always a definite height on the container - see the `height` '
      + 'in each row - which switches multicol out of balancing. Leave the height indefinite and '
      + 'let the stage fit shrink the type instead (src/templates/shared/stageFit.ts, "NEVER ON A '
      + 'MULTI-COLUMN BLOCK"). '
      + rules.text('templates/pin-reserve-height-multicolumn-text-block'),
  ).toEqual([]);
});
