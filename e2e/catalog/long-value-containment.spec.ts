import { test, expect } from '@playwright/test';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE, categoryOutOfScope } from '../_catalogScope';

// A GRAPHIC MUST STILL FIT THE PICTURE WHEN THE OPERATOR TYPES A LONG NAME.
//
// This gate exists because of two defects that every other gate in the repo passed, in designs
// that had just been reviewed, measured and merged.
//
// The first is the reason it was written. lt65 "Edge Rail" set its type with `writing-mode`, so
// it hugged its text VERTICALLY - and nothing in the catalog caps that axis, because until that
// design nothing set type on it. At its own 17-character sample it looked correct and measured
// correct; at 51 its rail ran from y=-5 to y=1085 on a 1080-high frame with its text at 39-1051,
// against a safe band of 86-961. That design was later WITHDRAWN for an unrelated and better
// reason - a name set vertically is a name nobody reads - so the case it exposed no longer ships.
// The lesson it paid for is the one this file encodes.
//
// The second is why the file is still here with that design gone: the same sweep caught lt63
// "Broadsheet Band" putting its dateline 5.5px past the safe edge, through a mechanism nothing
// about turned type - a tracked label's layout box carries a letter-space after its final glyph.
// One long value found two unrelated faults in two designs, which is the argument for the gate
// rather than for either fix.
//
// `type-floor`, `overflow-sweep`, `field-coverage`, `numerals`, the catalog calibration tripwire
// and both baselines were green through all of it. They render each design's OWN sample text, and
// a sample is chosen by the person who drew the design - which makes it the one input guaranteed
// to flatter it. `footprint-stability.spec.ts` next door does drive long text, but it asserts that
// a STAGED panel keeps its width; a hugging design is out of its scope by construction, and every
// lower third except one hugs.
//
// WHAT IS ASSERTED IS THE SAFE AREA, and the threshold was chosen by measuring rather than by
// guessing - the first draft of this file asserted the FRAME and is the reason the rule below
// about mutation-testing is written in the past tense.
//
// It reads the TEXT's extent and ignores the panel behind it, which is the owner's ruling of
// 2026-08-23: *decorative bars and backgrounds may extend beyond the safe area or bleed to the
// frame edge; text, logos and other essential information must remain safe.* lt63 "Broadsheet
// Band" bleeds its paper to both frame edges on purpose and must keep passing; what it may not do
// is put a WORD out there.
//
// THE FRAME IS THE WRONG THRESHOLD, and believing otherwise cost this file a rewrite. It was
// picked on the assumption that designs already ship text outside the safe inset, so a safe-area
// assertion would be a gate nobody could keep green. That assumption was never measured, and it
// was false: driven with the 51-character name below, every lower third measured keeps its text
// on the FRAME - including the rail this gate was written for, which left the picture while its
// words stayed just inside it. A frame assertion therefore passed the mutation test it was
// supposed to fail. At the safe area the same sweep returned exactly two, both of them new and
// both settled in the commit that added this file. The stricter claim was the affordable one all
// along; the lax one was unfalsifiable.
//
// MUTATION-TESTED, which is the only reason to believe the paragraph above. Removing lt63's
// trailing reserve turns this red naming lt63; with it in place, and with the whole category
// driven, it is green.

/** The horizontal safe inset, as `zoneDecls` computes it (shared/base.ts): 6.25% a side. */
const SAFE_X = 0.0625;
/** The vertical insets, likewise - deliberately asymmetric, and not a typo. */
const SAFE_TOP = 0.08;
const SAFE_BOTTOM = 0.11;
//
// WHICH DESIGNS IT COVERS IS READ OFF THE CATALOG, never a list kept in this file, for the same
// reason `footprint-stability.spec.ts` selects on its marker: a list here would silently stop
// growing while the catalog did, and still read as full coverage.
//
// NO play(), deliberately - the same reason mark-height.spec.ts gives. A preset sets its
// from-values when play() runs, so an unplayed graphic already sits at its final LAYOUT, and
// measuring a mid-entrance frame reads a transform as a position.

/**
 * 51 characters, and every character of that length is load-bearing. It is a real name shape
 * (given, hyphenated family, territorial suffix) rather than a lorem string, so it carries the
 * word boundaries a wrapping design needs; and it is the exact value that took lt65 off frame,
 * so a regression reproduces the original defect rather than something adjacent.
 */
const LONG_NAME = 'BARTHOLOMEW RAVENSWORTH-FITZGERALD OF NORTHUMBERLAND';

interface Row {
  id: string;
  name: string;
  /** Text extent as a fraction of the frame; null when the design drew no measurable line. */
  top: number | null;
  bottom: number | null;
  left: number | null;
  right: number | null;
}

test(`a lower third keeps its text on the frame when the operator types a long name${SCOPE_NOTE}`, async ({ page }) => {
  // Before the app boots: this spec only ever measures lower thirds, so a slice holding none of
  // them would otherwise pay a dev-server catalog import to measure zero rows.
  test.skip(categoryOutOfScope('lower-third'), 'no lower third is in scope');
  test.setTimeout(300_000);
  await toApp(page);

  const rows: Row[] = await page.evaluate(async ({ longName, only }: { longName: string; only: string[] | null }) => {
    const { CATALOG } = await __noacgImport('/src/templates/catalog.ts');
    const { composeDocument } = await __noacgImport('/src/preview/composeDocument.ts');

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;overflow:hidden';
    const frame = document.createElement('iframe');
    // Rendered at full 1920x1080 and scaled down for the viewport: the layout must be measured at
    // the resolution the design was drawn for, and a CSS transform does not change layout.
    frame.style.cssText = 'width:1920px;height:1080px;border:0;display:block;transform:scale(0.25);transform-origin:0 0';
    host.appendChild(frame);
    document.body.appendChild(host);

    const out: Row[] = [];
    for (const variant of CATALOG['lower-third'] ?? []) {
      if (only && !only.includes(variant.id)) continue;   // the affected slice (e2e/_catalogScope.ts)
      // The operator's longest realistic value goes in the FIRST line, which is the name on every
      // design in this category. Every other line keeps the design's own sample, so exactly one
      // variable moves and a failure names the axis it moved on.
      const lines = (variant.suggestedLines ?? []).map((line, i) => (
        i === 0 ? { ...line, sample: longName } : line
      ));
      let html: string;
      try {
        html = composeDocument(variant.create({ lines }));
      } catch {
        out.push({ id: variant.id, name: variant.name, top: null, bottom: null, left: null, right: null });
        continue;
      }
      await new Promise((resolve) => {
        frame.onload = resolve;
        frame.srcdoc = html;
      });
      // Let webfonts settle: the face decides how long the words are, and measuring against a
      // fallback would read a different design.
      await frame.contentWindow!.document.fonts?.ready;
      await new Promise((resolve) => setTimeout(resolve, 120));

      const doc = frame.contentDocument!;
      const spans = [...doc.querySelectorAll('.lower-third-mask > span')]
        .filter((el) => (el.textContent ?? '').trim() !== '');
      if (spans.length === 0) {
        out.push({ id: variant.id, name: variant.name, top: null, bottom: null, left: null, right: null });
        continue;
      }
      const rects = spans.map((el) => el.getBoundingClientRect());
      out.push({
        id: variant.id,
        name: variant.name,
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
      });
    }
    host.remove();
    return out;
  }, { longName: LONG_NAME, only: ONLY_DESIGNS });

  const measured = rows.filter((r) => r.top !== null);
  // The detection itself has to be asserted, or an evaluate that silently returned nothing would
  // read exactly like a category with no defects in it.
  // Unscoped, an empty result reads exactly like a category with no defects in it, so the
  // detection itself is asserted. Under an explicit scope the count is whatever was asked for.
  if (!ONLY_DESIGNS) expect(measured.length, 'lower thirds measured').toBeGreaterThan(90);

  const safeLeft = 1920 * SAFE_X;
  const safeRight = 1920 - safeLeft;
  const safeTop = 1080 * SAFE_TOP;
  const safeBottom = 1080 - 1080 * SAFE_BOTTOM;
  const unsafe = measured.filter((r) => (
    r.top! < safeTop || r.bottom! > safeBottom || r.left! < safeLeft || r.right! > safeRight
  ));
  const report = unsafe
    .map((r) => `${r.id} ${r.name}: text ${Math.round(r.left!)},${Math.round(r.top!)} `
      + `-> ${Math.round(r.right!)},${Math.round(r.bottom!)} `
      + `(safe area ${safeLeft},${safeTop} -> ${safeRight},${safeBottom})`)
    .join('\n');
  expect(report, `${unsafe.length} of ${measured.length} lower thirds put text outside the safe `
    + `area with a ${LONG_NAME.length}-character name`).toBe('');
});
