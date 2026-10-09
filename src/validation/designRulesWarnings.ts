// THE PRODUCT FACE OF THE DESIGN RULES (docs/DESIGN_RULES_PLAN.md §5 R4).
//
// The ratified severity policy (owner, 2026-08-19): HARD where the MACHINE decides, WARNING
// where a HUMAN decides. The AI iterate loop keeps its blocking findings; on every PRODUCT
// surface - the editor's export panel, an import, a community publish - the same measurements
// land as WARNINGS ONLY, in plain language with the viewing context stated, and export never
// blocks on them. The catalog keeps its separate 20px hard type-floor gate unchanged
// (scripts/type-floor.mjs); the 312 audit-indicted designs stay shipped and simply carry the
// same warning every other surface does.
//
// The MEASUREMENT is `readabilityCheck.ts` / `tickerCheck.ts` - one instrument for the loop
// and the product, so the two can never disagree about what was measured. This module only
// rephrases the structured findings for a person, and states which viewing profile each
// warning was computed under (the same graphic warns differently for a phone than for a TV).

import {
  resolveLegibility,
  type ProjectLegibility,
  type ResolvedLegibility,
  type TextRole,
} from '../model/designRules';
import { composeDocument } from '../preview/composeDocument';
import type { SpxTemplate } from '../model/types';
import { DATA_SOURCE_CLASS } from '../templates/shared/base';
import type { ValidationIssue } from './validateTemplate';
import { isMarkImage } from './markLegibility';
import { measureReadability, type ReadabilityFinding } from './readabilityCheck';
import { measureTickerMargins } from './tickerCheck';

/** At most this many legibility warnings per run - a wall of near-identical rows teaches
 *  people to stop reading the panel, which costs more than the tail it hides. */
const MAX_WARNINGS = 8;

const px = (n: number) => `${Math.round(n)}px`;

/**
 * THE DISHONEST ZERO, reported instead of returned (#840). An empty warning list is what a clean
 * graphic gets, so it must only ever mean "measured, nothing wrong". When the frame could not be
 * read, or held field text the readability rules read none of (every field hidden or faded at
 * the measured pose), this rule says so. It is one warning like the rest of this module, so the
 * readiness report's legibility row and the export panel say "not checked" instead of nothing.
 */
export const LEGIBILITY_UNMEASURED = 'legibility-unmeasured';

const unmeasured = (why: string): ValidationIssue => ({
  rule: LEGIBILITY_UNMEASURED,
  message: `Legibility was not checked: ${why}.`,
});

const NOT_RENDERED = 'the graphic could not be rendered for measuring';

/** Field types whose value is text a viewer reads. `hidden` carries data, not words. */
const READ_FTYPES = new Set(['textfield', 'textarea', 'number']);

/** Whether a declared text field holds text on screen in this frame - something to read. A
 *  `noacg-data-source` holder is never on screen: the runtime paints its value elsewhere (the
 *  end-credits rows, a clock), so its text is not text the viewer was meant to read there. */
function hasFieldText(doc: Document, template: SpxTemplate): boolean {
  return template.fields.some((f) => {
    if (!READ_FTYPES.has(f.ftype)) return false;
    const el = doc.getElementById(f.field);
    return Boolean(el && !el.closest(`.${DATA_SOURCE_CLASS}`) && (el.textContent?.trim().length ?? 0) >= 2);
  });
}

/** The brand mark's field: a file field shown as a loaded `<img>` that is a mark rather than a
 *  cropped picture well, by the same test the mark-legibility check uses. An empty slot has no
 *  mark to hold to the safe area. */
function markFieldOf(doc: Document, template: SpxTemplate): string | null {
  const win = doc.defaultView;
  if (!win) return null;
  for (const f of template.fields) {
    if (f.ftype !== 'filelist') continue;
    const el = doc.getElementById(f.field);
    if (el?.tagName !== 'IMG') continue;
    const img = el as HTMLImageElement;
    if (img.complete && img.naturalWidth > 0 && isMarkImage(img, win)) return f.field;
  }
  return null;
}

/** How the copy names where the graphic will be watched, per profile. The size sentence
 *  embeds this; every other rule states it as a suffix. */
function viewingPhrase(legibility: ResolvedLegibility): string {
  const { profile, note } = legibility.target;
  switch (profile) {
    case 'streaming': return 'a streaming overlay watched on a desktop screen';
    case 'mobile': return 'phone screens';
    case 'venue': return 'venue screens (sized as TV viewing for now)';
    case 'custom': return note ? `your viewing setup (${note})` : 'your viewing setup';
    default: return 'TV viewing distance';
  }
}

const ROLE_WORD: Record<TextRole, string> = {
  primary: 'Primary text',
  secondary: 'Supporting text',
  fine: 'Fine print',
  decorative: 'Decorative text',
};

/**
 * WHICH SIZE RULE A FINDING BELONGS TO, by the role it was measured against.
 *
 * The three legibility choices move the SECONDARY floors and barely touch the primary one -
 * standard puts supporting text and fine print at 1.85% with a warning band to 2.2%, safe puts
 * them at 5% and 4% with no band at all, and relaxed demotes the lot. So a person choosing
 * between those three is choosing about supporting text, and a single `legibility-size` rule
 * could not tell them which of their findings their choice governs.
 *
 * It stays a WARNING on every product surface, exactly like its sibling: this splits a report,
 * it does not add a gate. Both ids keep the `legibility-` prefix, which is the whole selector
 * the custom lane's blocking set uses (ai/pro/custom/loop.ts), so nothing there changes either.
 */
function sizeRuleFor(role: TextRole | undefined): string {
  return role === 'primary' ? 'legibility-size' : 'legibility-secondary-size';
}

/** The plain-language sentence for one measured finding, or null for the codes the product
 *  deliberately does not surface (weight, hairlines, the decorative-assumption note - loop
 *  instruments, not the ratified product set). */
function productMessage(f: ReadabilityFinding, legibility: ResolvedLegibility): { rule: string; message: string } | null {
  const where = viewingPhrase(legibility);
  const suffix = ` (computed for ${where})`;
  switch (f.code) {
    case 'text-under-size-floor': {
      if (f.fontPx === undefined || f.floorPx === undefined) return null;
      return {
        rule: sizeRuleFor(f.role),
        message: `${ROLE_WORD[f.role ?? 'secondary']} ("${f.snippet}") is ${px(f.fontPx)} - smaller than the `
          + `~${px(f.floorPx)} we recommend for ${where}. Fine for close screens; may be hard to read from a couch.`,
      };
    }
    case 'text-size-warning-band': {
      if (f.fontPx === undefined || f.warnPx === undefined) return null;
      return {
        rule: sizeRuleFor(f.role),
        message: `${ROLE_WORD[f.role ?? 'secondary']} ("${f.snippet}") is ${px(f.fontPx)} - a little under the `
          + `~${px(f.warnPx)} we prefer for ${where}. Readable, but ${px(f.warnPx)}+ reads more comfortably.`,
      };
    }
    case 'text-low-contrast': {
      if (f.ratio === undefined || f.ratioFloor === undefined) return null;
      return {
        rule: 'legibility-contrast',
        message: `"${f.snippet}" reads at ${f.ratio.toFixed(2)}:1 against the surface behind it - under the `
          + `${f.ratioFloor}:1 we recommend for on-air text. It may disappear on some screens.${suffix}`,
      };
    }
    case 'text-unprotected-over-video':
      return {
        rule: 'legibility-protection',
        message: `"${f.snippet}" sits straight over the picture with no panel, shadow or outline behind it - `
          + `it will be hard to read over busy footage.${suffix}`,
      };
    case 'text-outside-safe-area':
      return {
        rule: 'legibility-safe-area',
        message: `Field text "${f.snippet}" sits outside the broadcast safe area - some TVs and broadcast `
          + `chains crop close to the edge, so it can be cut off.${suffix}`,
      };
    case 'mark-outside-safe-area':
      return {
        rule: 'legibility-safe-area',
        message: `The brand mark sits outside the broadcast safe area - some TVs and broadcast chains crop `
          + `close to the edge, so it can be cut off.${suffix}`,
      };
    default:
      return null;
  }
}

/**
 * The design-rules warnings for an already-rendered frame. `doc` is a settled same-origin
 * render (the runtime bench's iframe, or the throwaway frame `checkTemplateLegibility`
 * mounts). Pure measurement + phrasing; never blocks anything. Empty means measured and clean:
 * a frame it could not read returns `LEGIBILITY_UNMEASURED` instead.
 */
export function designRulesWarnings(
  doc: Document,
  template: SpxTemplate,
  settings?: ProjectLegibility | null,
): ValidationIssue[] {
  const legibility = resolveLegibility(settings);
  if (!doc.defaultView || !doc.body) return [unmeasured(NOT_RENDERED)];
  const { width, height } = template.resolution;
  const report = measureReadability(doc, {
    mode: legibility.mode,
    target: legibility.target,
    width,
    height,
    // What the graphic is decides what its lead line must reach (owner ruling 2026-09-08). The
    // template knows, so the product surface never has to guess - and a corner bug stops being
    // told its 21px mark should be 50px.
    category: template.type ?? null,
    markFieldId: markFieldOf(doc, template),
  });
  const issues: ValidationIssue[] = [];
  // Static design text (a LIVE tag, a label) can be read while every operator field is faded
  // out, so the question is whether any FIELD text was read.
  if (!report.readings.some((r) => r.fieldBound) && hasFieldText(doc, template)) {
    issues.push(unmeasured('none of its text was visible when it was measured'));
  }
  // The ticker-margin rule holds tickers only, and the template says what it is - the same
  // ruling as the lead-line target above. Inferring a crawl from declared motion held counters
  // and bars on wide infographics and results boards to it (#873), and a lower third anchored
  // left is not an off-centre ticker. Its row is kept clear of the cap: it is a different
  // problem from the readability rows, and an eighth contrast row hid it on a shipped ticker.
  const tickerIssues: ValidationIssue[] = template.type === 'ticker'
    ? measureTickerMargins(doc).findings.map((finding) => ({
      rule: 'legibility-ticker-margins',
      message: `${finding.detail} (computed for ${viewingPhrase(legibility)})`,
    }))
    : [];
  for (const finding of report.findings) {
    if (issues.length >= MAX_WARNINGS - tickerIssues.length) break;
    const msg = productMessage(finding, legibility);
    if (msg) issues.push(msg);
  }
  issues.push(...tickerIssues);
  return issues.slice(0, MAX_WARNINGS);
}

/**
 * The same warnings asked of a TEMPLATE rather than a rendered frame: mount it offscreen,
 * let it settle, measure, take it down (the `checkMarkLegibility` pattern). For surfaces
 * with no runtime bench - the editor's export panel and the community publish dialog.
 * No `play()`: the settled pose preserves layout (the root hides via opacity, which keeps
 * geometry), and an entrance tween would have this measuring text mid-flight. Anywhere it
 * cannot mount or read the frame, including without a DOM, it says so with
 * `LEGIBILITY_UNMEASURED` rather than returning the empty list a clean graphic gets.
 */
export async function checkTemplateLegibility(
  template: SpxTemplate,
  settings?: ProjectLegibility | null,
): Promise<ValidationIssue[]> {
  if (typeof document === 'undefined') return [unmeasured(NOT_RENDERED)];
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
    if (!doc) return [unmeasured(NOT_RENDERED)];
    await Promise.race([
      doc.fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => { setTimeout(resolve, 1200); }),
    ]);
    // Two frames for the first paint to land - CAPPED, because a page that is hidden, occluded
    // or in a background tab throttles requestAnimationFrame to never. Uncapped, this promise
    // simply never settled there: the export panel rendered zero legibility warnings, and
    // nothing distinguished that from a graphic with no legibility problems. Measured
    // 2026-09-17 driving the app with the browser pane hidden - a design that genuinely warns
    // twice showed nothing, while the same measurement called directly returned both rows.
    await Promise.race([
      new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
      new Promise<void>((resolve) => { setTimeout(resolve, 300); }),
    ]);
    return designRulesWarnings(doc, template, settings);
  } catch {
    return [unmeasured(NOT_RENDERED)];
  } finally {
    frame.remove();
  }
}
