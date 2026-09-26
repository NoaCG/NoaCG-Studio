import { test, expect } from '@playwright/test';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE, categoryOutOfScope } from '../_catalogScope';
import * as rules from '../../scripts/rules.mjs';

// A STRAP SPENDS WIDTH, NEVER HEIGHT - measured over every mark-capable lower third, not just the
// six that take the shared slot.
//
// The rule and its arithmetic live in src/templates/shared/logoSlot.ts; e2e/wizard-logo.spec.ts
// pins it for the SHARED slot, through the wizard, on one design. That left the eighteen designs
// that hand-author their own slot guarded by nothing a gate runs: `overflow-sweep` measures a box
// escaping the frame and a box clipping itself, never a box growing, and
// `scripts/spike-mark-clearance-sweep.mjs` is a free script somebody has to remember to run. That
// asymmetry is exactly how the 2026-08-15 finding happened - four hand-authored designs had been
// growing 5-37% taller with a mark, two of them breaking a name across two rows, while every gate
// in the repo stayed green.
//
// WHY THE COMPARISON IS BARE-VS-MARKED rather than an absolute: these designs have no common
// height, and the claim is not "a strap is under N pixels" - it is that adding a mark does not
// change the number. Each design is therefore its own control, rendered twice.
//
// TWO MARK SHAPES, because the two failures are opposite. A SQUARE crest is the shape that fills a
// well and finds a well taller than the words; a PORTRAIT one is the shape that sets a row's height
// through its own aspect, which is why the shared slot caps the mark rather than fixing it. A
// design can pass with one and fail with the other.
//
// NO play(), deliberately. A preset sets its from-values when play() runs, so an unplayed graphic
// is already at its final LAYOUT - and measuring a mid-entrance frame would read a transform's
// scale as a height. Verified against the played sweep: identical numbers on all five designs
// checked by hand (ls29 139/139, ls17 130/130, lt49 138->155, lt53 139->146, lt11 147/147).

/**
 * The designs allowed to grow, each argued in its own source. Both draw a TINTED SQUARE well -
 * real furniture rather than an invisible centring box - sized against the four lines the board is
 * built for, where the words are 157px and the well costs nothing. Bounding either one means
 * breaking the square or shrinking the mark on the content it was drawn against.
 *
 * The list is checked in BOTH directions below: an entry that has stopped growing is a stale
 * exception and must be deleted, not left to excuse a design it no longer describes.
 */
const MAY_GROW: Record<string, string> = {
  lt49: 'Glass Board - a rounded 105px well inside the card\'s own radius',
  lt53: 'House Board - a 96px square lifted off the house void',
};

/** A 1:1 crest and a 1:2 portrait mark, inline so the gate needs no fixture file. */
const MARKS = {
  square: `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">'
    + '<rect width="256" height="256" fill="#1f4f9c"/></svg>',
    'utf8',
  ).toString('base64')}`,
  portrait: `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="256">'
    + '<rect width="128" height="256" fill="#1f4f9c"/></svg>',
    'utf8',
  ).toString('base64')}`,
};

interface Row {
  id: string;
  bare: number | null;
  marked: Record<string, number | null>;
}

test(`a mark never makes a lower third taller${SCOPE_NOTE}`, async ({ page }) => {
  // Before the app boots - see long-value-containment.spec.ts; this spec is lower-thirds-only too.
  test.skip(categoryOutOfScope('lower-third'), 'no lower third is in scope');
  test.setTimeout(240_000);
  await toApp(page);

  const rows: Row[] = await page.evaluate(async ({ marks, only }: { marks: typeof MARKS; only: string[] | null }) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    // The calibrated probe: the two lines every spacing and clearance reading in this catalog is
    // measured on. A design drawn for more lines renders fewer, which is a supported state - and
    // the state a fixed-height well fails in, because that is when the words are shortest.
    const lines = [
      { title: 'Name', sample: 'Alexandra Riva' },
      { title: 'Role', sample: 'Chief Political Correspondent' },
    ];
    const path = 'images/mark.svg';

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'opacity:0;pointer-events:none;';
    document.body.appendChild(frame);

    const strapHeight = async (
      variant: { create: (o: Record<string, unknown>) => unknown },
      data: string | null,
    ): Promise<number | null> => {
      const options = data
        ? { logoEnabled: true, logoAssetPath: path, importedImages: [{ path, data }] }
        : {};
      frame.srcdoc = composeDocument(variant.create({ lines, ...options }) as never);
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow as (Window & { update?: (d: string) => void }) | null;
      if (!win) return null;
      // Through update(), the path an operator's text takes. No play(): see the header.
      try {
        win.update?.(JSON.stringify({ f0: lines[0].sample, f1: lines[1].sample }));
      } catch { /* a broken lifecycle still lays out - measure what is there */ }
      await win.document.fonts.ready;      // a fallback face measures to a different height
      await new Promise((resolve) => setTimeout(resolve, 60));
      const box = frame.contentDocument?.querySelector('.lower-third-box');
      return box ? Math.round(box.getBoundingClientRect().height) : null;
    };

    const out = [];
    // Off the CATALOG's own capability, never a list kept in this file: a target set that shrinks
    // when a design is added reads as full coverage while covering less.
    for (const variant of (CATALOG['lower-third'] ?? []).filter((v) => v.logo !== 'none')) {
      if (only && !only.includes(variant.id)) continue;   // the affected slice (e2e/_catalogScope.ts)
      const row: { id: string; bare: number | null; marked: Record<string, number | null> } = {
        id: variant.id,
        bare: await strapHeight(variant as never, null),
        marked: {},
      };
      for (const [shape, data] of Object.entries(marks)) {
        row.marked[shape] = await strapHeight(variant as never, data);
      }
      out.push(row);
    }
    frame.remove();
    return out;
  }, { marks: MARKS, only: ONLY_DESIGNS });

  // Never vacuous: a filter or a selector that silently stopped matching would otherwise pass
  // this test with an empty set. Twenty-four designs carry a mark today.
  if (!ONLY_DESIGNS) expect(rows.length, 'no mark-capable lower thirds were measured').toBeGreaterThanOrEqual(20);
  const unmeasurable = rows.filter((r) => r.bare === null
    || Object.values(r.marked).some((h) => h === null));
  expect(unmeasurable.map((r) => r.id), 'no .lower-third-box found').toEqual([]);

  // ── The rule ────────────────────────────────────────────────────────────────────────────
  const grew = rows.filter((r) => Object.values(r.marked).some((h) => h! > r.bare! + 1));
  const offenders = grew.filter((r) => !(r.id in MAY_GROW)).map((r) => ({
    id: r.id,
    bare: r.bare,
    marked: r.marked,
  }));
  expect(
    offenders,
    'A mark made these straps TALLER. Either the mark\'s own furniture is taller than the words '
      + '(bound it - and if the design draws real furniture it can afford, argue that in its own '
      + 'source and add it to MAY_GROW), or the mark\'s column came out of a capped text measure '
      + 'and the words needed the height (widen that cap by the mark\'s column). '
      + '`node scripts/spike-mark-clearance-sweep.mjs` says which of the two it is.',
  ).toEqual([]);

  // ── …and the exception list, checked from the other side ────────────────────────────────
  // An allowlist nobody re-measures becomes a list of designs no rule applies to. An entry that
  // has stopped growing has been fixed or redrawn, and its argument in the source is now describing
  // something that is not happening.
  // AN ALLOWLIST CHECKED FROM THE OTHER SIDE READS EVERY ENTRY IT DID NOT MEASURE AS STALE, so a
  // run scoped to one design would report the whole list - which is not the list going stale, it
  // is the run not having looked. Under a scope the question is asked only of entries this run
  // actually measured, so it keeps its meaning (an entry in the slice that stopped growing is
  // still caught); a FULL run asks it of every entry exactly as before, which is what catches an
  // entry whose design has left the catalog or lost its mark slot.
  const measured = new Set(rows.map((r) => r.id));
  const stale = Object.keys(MAY_GROW).filter(
    (id) => (!ONLY_DESIGNS || measured.has(id)) && !grew.some((r) => r.id === id),
  );
  expect(
    stale,
    'These are listed in MAY_GROW but no longer grow. Delete the entry and the exception note in '
      + 'the design\'s own source - the rule covers them now. '
      + rules.text('templates/verify-shared-marks-both-square-portrait'),
  ).toEqual([]);
});
