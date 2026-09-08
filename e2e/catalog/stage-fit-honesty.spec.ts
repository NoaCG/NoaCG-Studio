import { test, expect } from '@playwright/test';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE } from '../_catalogScope';

// A STAGED GRAPHIC SHIPS THE FONT SIZE ITS AUTHOR TYPED - at its own default sample, at least.
//
// `fitStagedText` (src/templates/shared/stageFit.ts) is the height half of the stage contract: a
// line is held to the room the design gave it, and text past that room shrinks rather than pushing
// the panel taller. That is right, and it stays right. This gate asserts the other side of it -
// that the shrink is only ever the OPERATOR's, never the design's own words shrinking themselves.
//
// It exists because the mechanism failed that way for weeks with every check in the repo green.
// The reserve was a LINE BOX (`getBoundingClientRect().height`, font-size x line-height) and the
// overflow test read a CONTENT box (`scrollHeight`, the face's own glyph box, about 1.2em on most
// faces whatever line-height says). Two different boxes, so any line whose line-height sat under
// its face's content ratio reported an overflow against the design's OWN default text and shrank
// permanently, at load, before an operator touched anything. Measured 2026-08-23 over the whole
// registry: 200 of 290 staged designs shipped smaller than they declare, worst -23%, one design
// typing 103px and airing 79px. No gate here noticed, because every one of them asked whether the
// PANEL moved and none asked whether the TEXT was the size the code says.
//
// WHICH DESIGNS IT COVERS IS READ OFF THE EMITTED RUNTIME, never a list kept in this file: a
// design is staged when its own window registered a box in `__noacgStageFitBoxes`, which is what
// `stageExtraJs` emits. The next category to flip is covered the day it flips.
//
// NO update() AND NO play(), deliberately. The claim is about the design's own sample - the words
// sitting in the emitted HTML, which is exactly the content the runtime calibrates against. Drive
// a field and the claim becomes "the operator's text fits", which is the opposite contract and is
// `footprint-stability.spec.ts`'s business.
//
// `scripts/stage-fit-sweep.mjs` is the diagnostic that says by how much, on which line and on
// which axis; this is the gate that says whether it may happen at all.

/** How many staged designs exist today. A drop below this means the detection stopped matching. */
const STAGED_FLOOR = 250;

/**
 * How far under its declared size a line may ship before this fails.
 *
 * The runtime's own fit test tolerates 0.5%, so a line can settle a fraction inside that without
 * anything having decided to shrink it; 1% leaves room for sub-pixel rounding on top and is still
 * far tighter than any of the failures this gate was written for (the smallest was 1.1%).
 */
const TOLERANCE = 0.99;

interface Shrunk {
  id: string;
  cat: string;
  cls: string;
  declared: number;
  shipped: number;
}

test(`a staged graphic ships the font size its CSS declares${SCOPE_NOTE}`, async ({ page }) => {
  test.setTimeout(300_000);
  await toApp(page);

  const result = await page.evaluate(async ({ tolerance, only }: { tolerance: number; only: string[] | null }) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'opacity:0;pointer-events:none;';
    document.body.appendChild(frame);

    const shrunk: Shrunk[] = [];
    let staged = 0;

    for (const [cat, variants] of Object.entries(CATALOG)) {
      for (const variant of variants ?? []) {
        const id = (variant as { id: string }).id;
        if (only && !only.includes(id)) continue;   // the affected slice (e2e/_catalogScope.ts)
        const template = (variant as { create: (o: Record<string, unknown>) => unknown }).create({});
        frame.srcdoc = composeDocument(template as never);
        await new Promise((resolve) => { frame.onload = resolve; });
        const win = frame.contentWindow as (Window & { __noacgStageFitBoxes?: string[] }) | null;
        const doc = frame.contentDocument;
        if (!win || !doc) continue;
        const selectors = win.__noacgStageFitBoxes ?? [];
        if (!selectors.length) continue;                 // hugs by design - not this gate's business
        // The runtime re-calibrates once the webfonts land, and the reserve it takes against the
        // FALLBACK face is not this design's - so the reading has to be taken after the swap.
        await doc.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 80));
        staged += 1;

        for (const selector of selectors) {
          for (const box of Array.from(doc.querySelectorAll(selector))) {
            for (const el of Array.from(box.querySelectorAll('*'))) {
              if (el.children.length) continue;          // not a leaf: its children carry the text
              if (!(el.textContent || '').trim()) continue;
              const node = el as HTMLElement;
              // The size the runtime SHIPPED: it writes its shrink as an inline font-size and
              // nothing else does, so an empty inline value is "this line was left alone".
              const inline = node.style.fontSize;
              const shipped = parseFloat(inline || win.getComputedStyle(node).fontSize);
              // The size the CSS DECLARES, read by lifting that override and letting the cascade
              // answer - so --scale, --type-scale and specificity are all already folded in.
              node.style.fontSize = '';
              const declared = parseFloat(win.getComputedStyle(node).fontSize);
              node.style.fontSize = inline;
              if (!declared || !shipped) continue;
              if (shipped / declared >= tolerance) continue;
              shrunk.push({
                id,
                cat,
                cls: String(node.className || '').slice(0, 40),
                declared: Number(declared.toFixed(2)),
                shipped: Number(shipped.toFixed(2)),
              });
            }
          }
        }
      }
    }
    frame.remove();
    return { shrunk, staged };
  }, { tolerance: TOLERANCE, only: ONLY_DESIGNS });

  // Never vacuous: a marker that silently stopped matching would otherwise pass this test with an
  // empty set, and an empty set is indistinguishable from a perfect catalog.
  // Only unscoped: a slice with no staged design in it is the ordinary case under a scope.
  if (!ONLY_DESIGNS) {
    expect(result.staged, 'no staged designs were detected - has the stage runtime stopped emitting?')
      .toBeGreaterThanOrEqual(STAGED_FLOOR);
  }

  expect(
    result.shrunk,
    'These staged graphics ship a smaller font than their CSS declares, at their OWN default text, '
      + 'with no operator input at all - so the size a designer typed is not the size that airs. '
      + 'Run `node scripts/stage-fit-sweep.mjs <category> --all` to see the line and the axis. The '
      + 'usual cause is the stage fit measuring the reserve in one box and the excess in another '
      + '(see `templates/measure-stage-reserves-layout-dimensions-never` and the header of '
      + 'shared/stageFit.ts).',
  ).toEqual([]);
});
