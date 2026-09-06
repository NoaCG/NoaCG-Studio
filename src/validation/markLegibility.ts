// CAN THE BRAND MARK ACTUALLY BE SEEN?
//
// The owner's blind value-gate ballot (2026-08-14, `docs/AI_LITE_BRAND_PLAN.md` §2.2) failed on
// this and almost nothing else: a knockout mark on a light package painted white ink on a white
// panel, and the graphic shipped looking like a lower third with no logo at all. It failed on the
// GENERATED arm and on the hand-branded WIZARD arm equally - the owner's words, "white on white
// will never work... we should have all these obvious rules already".
//
// Two facts made that possible, and this module answers both:
//
//   · `logo_ink_unreadable_on_surface` (src/ai/lite/contract.ts) is RECORDED and nothing is done
//     with it. That was a deliberate §3.7 decision - the painted well was worse than the defect -
//     but recording is not telling, and the ledger is not a place a user looks.
//   · the wizard's own branding records nothing at all: `variant.create()` puts the mark where the
//     design says and no gate downstream ever asks whether it can be read there.
//
// So the question is asked of the RENDERED graphic, which is the only place it can be answered:
// the mark's ink is the user's file, the surface under it is the design's decision composited
// with the user's palette, and neither one alone predicts the pair. `scripts/ai-lite-brand-audit.mjs`
// has measured exactly this since 2026-08-09 - over CATALOG chassis with FIXTURE marks. This is the
// same measurement moved to where the user's own graphic passes.
//
// It REPORTS and never repairs. §3.7 ruled out both available repairs (drop the customer's mark,
// or paste a plate over the design), and the remaining honest move is to say so while the person
// choosing the colours is still there to choose differently.

import { probeMarkElement } from '../assets/assetInfo';
import { BROADCAST_BACKDROP, contrastRatio, parseCssColor, type CssColor } from '../model/cssVars';
import type { SpxTemplate } from '../model/types';
import { composeDocument } from '../preview/composeDocument';

/**
 * A transparent mark composites its ink straight onto the surface, so WCAG's non-text floor
 * applies to it as a graphical object: 3:1. Same number as the brand audit's `inkContrast`, and
 * deliberately the same - two floors for one question is how a gate starts disagreeing with the
 * bench that verifies it.
 */
export const MARK_INK_CONTRAST_FLOOR = 3;

/**
 * A mark carrying its OWN field is NOT JUDGED HERE, and the reason is a measurement rather than a
 * preference. It cannot vanish - the worst it can do is fail to separate from a surface close to
 * its own tone - and luminance is the wrong instrument for that: swept over all 23 mark-capable
 * lower thirds (2026-08-14), a blue crest on `ls10`'s red accent tile measured 1.21:1 and was
 * rendered and looked at, and it reads perfectly, because blue and red separate by HUE while
 * their luminances nearly match. Two of 23 designs were flagged that way and both were wrong.
 *
 * A gate whose false positives are the designs that carry a crest BEST would teach authors to
 * ignore it, which costs more than the case it catches. The transparent-ink case below has no
 * such ambiguity: composited ink at 1.1:1 is not there at all, at any hue.
 */

export interface MarkLegibilityFinding {
  /** How to name the mark to a human: its field id when it has one, else its file name. */
  id: string;
  /** The measured contrast between the mark's ink and the surface behind it, 1-21. */
  ratio: number;
  /** The floor that ratio failed. */
  floor: number;
}

/** A grey with the same RELATIVE LUMINANCE as the measured ink.
 *
 *  Contrast depends on luminance alone, so this reproduces the ink's ratio exactly while keeping
 *  the arithmetic itself in `model/cssVars.ts` - the repo has one contrast function and this is
 *  not going to be the second. (Inverts the sRGB transfer the probe applied.) */
function greyOfLuminance(luminance: number): CssColor {
  const l = Math.max(0, Math.min(1, luminance));
  const channel = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  const v = Math.round(channel * 255);
  return { r: v, g: v, b: v, a: 1, form: 'rgb' };
}

/** Every colour the surface under `el` might be, outermost first: each ancestor's background
 *  colour, plus every stop of a background IMAGE (a scrim is a real surface, and which end of it
 *  the mark sits over is not knowable from the box alone - so every stop is a candidate and the
 *  caller takes the worst). Ends at the broadcast backdrop, the same stand-in the Style panel's
 *  own contrast readout uses. */
function surfaceCandidates(el: Element, win: Window): CssColor[] {
  const layers: CssColor[][] = [];
  let node: Element | null = el.parentElement;
  while (node && node !== el.ownerDocument.documentElement) {
    const cs = win.getComputedStyle(node);
    const layer: CssColor[] = [];
    const bg = parseCssColor(cs.backgroundColor);
    if (bg && bg.a > 0) layer.push(bg);
    const image = cs.backgroundImage;
    if (image && image !== 'none') {
      for (const match of image.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi)) {
        const stop = parseCssColor(match[0]);
        if (stop && stop.a > 0) layer.push(stop);
      }
    }
    if (layer.length) layers.push(layer);
    node = node.parentElement;
  }
  if (!layers.length) return [BROADCAST_BACKDROP];
  // One candidate per stop, each composited over the backdrop by `contrastRatio` itself. Nested
  // translucent ancestors are approximated by their own colour rather than by the whole stack:
  // the mark sits on the innermost surface, and taking the worst candidate below keeps the
  // approximation on the safe side of the answer.
  return layers.flat();
}

/** Is this `<img>` a brand MARK, or a picture the design is allowed to crop?
 *
 *  `object-fit: cover` is the picture-well signature (ls25's release artwork is square by nature
 *  and correctly cropped - judging it as a mark reports a defect the design does not have; see
 *  `TemplateVariant.imageSlot`). A hidden or unpainted image is not judged at all. */
function isMarkImage(img: HTMLImageElement, win: Window): boolean {
  const cs = win.getComputedStyle(img);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  if (cs.objectFit === 'cover') return false;
  const box = img.getBoundingClientRect();
  return box.width > 1 && box.height > 1;
}

/**
 * Judge every mark in an already-rendered graphic. Pure measurement: no repair, no DOM writes.
 *
 * `doc`/`win` are a same-origin rendered template (the runtime bench's own iframe, or the hidden
 * one `checkMarkLegibility` mounts). An image whose pixels cannot be read - an exotic codec, a
 * hardened browser - is SILENTLY skipped: unknown is a legitimate answer, and a finding the
 * method cannot support is worse than none.
 */
export function markLegibilityFindings(doc: Document, win: Window): MarkLegibilityFinding[] {
  const findings: MarkLegibilityFinding[] = [];
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (!isMarkImage(img, win)) continue;
    const probe = probeMarkElement(img);
    if (!probe || probe.backing === 'own-field') continue;
    const ink = greyOfLuminance(probe.inkLuminance);
    // The WORST surface it could be sitting on. A mark that survives every candidate is safe
    // whichever one it is actually over; one that fails the worst is the case worth naming.
    const ratio = surfaceCandidates(img, win)
      .reduce((worst, surface) => Math.min(worst, contrastRatio(ink, surface)), Infinity);
    if (!Number.isFinite(ratio) || ratio >= MARK_INK_CONTRAST_FLOOR) continue;
    findings.push({
      id: img.id || img.getAttribute('src')?.split('/').pop()?.slice(0, 40) || 'the logo',
      ratio: Math.round(ratio * 100) / 100,
      floor: MARK_INK_CONTRAST_FLOOR,
    });
  }
  return findings;
}

/**
 * The same question asked of a TEMPLATE rather than of an already-rendered frame: mount it
 * offscreen, let it settle, measure, take it down again.
 *
 * The runtime bench has a rendered document already and calls `markLegibilityFindings` directly.
 * The WIZARD has neither - its live preview iframe deliberately carries no `allow-same-origin`
 * (`WizardPreview.tsx`), so its pixels cannot be read from the app at all - and the wizard is
 * exactly where the ballot's failure was authored by hand. So it gets its own throwaway frame.
 *
 * No `play()`: the settled pose is what a mark's legibility is about, and an entrance tween
 * would have this measuring a mark mid-flight. Returns [] anywhere without a DOM.
 */
export async function checkMarkLegibility(template: SpxTemplate): Promise<MarkLegibilityFinding[]> {
  if (typeof document === 'undefined') return [];
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${template.resolution.width}px;`
    + `height:${template.resolution.height}px;border:0;visibility:visible;`;
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.onerror = () => resolve();
      frame.srcdoc = composeDocument(template);
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return [];
    // Fonts move layout, and a missing one must not hang the caller - the same capped wait the
    // runtime bench uses.
    await Promise.race([
      doc.fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => { setTimeout(resolve, 1200); }),
    ]);
    await new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); });
    return markLegibilityFindings(doc, win);
  } catch {
    return [];
  } finally {
    frame.remove();
  }
}

/** The sentence a person reads. One place, because the bench and the wizard must not describe
 *  the same measurement in two ways. */
export function markLegibilityMessage(finding: MarkLegibilityFinding): string {
  // `f2` is an SPX field id: precise for a bench row, meaningless to the person choosing a
  // palette in the wizard - and this sentence is read in both places. So the id appears only
  // when it is a name rather than a slot number.
  const subject = /^f\d+$/.test(finding.id) ? 'The logo' : `The logo (${finding.id})`;
  return `${subject} is close to invisible where the design places it - ${finding.ratio}:1 against `
    + `a floor of ${finding.floor}:1. Its ink has no background of its own, so it composites `
    + 'straight onto that surface: a knockout mark on a light package, or a dark mark on a dark '
    + 'one, is simply not there. Use the other version of the mark, or a palette it can read on.';
}
