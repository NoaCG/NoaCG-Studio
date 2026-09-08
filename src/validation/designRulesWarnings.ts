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
import { parseAnimData } from '../blocks/animData';
import { allTimelines } from '../blocks/animMachine';
import { composeDocument } from '../preview/composeDocument';
import type { SpxTemplate } from '../model/types';
import type { ValidationIssue } from './validateTemplate';
import { measureReadability, type ReadabilityFinding } from './readabilityCheck';
import { measureTickerMargins } from './tickerCheck';

/** At most this many legibility warnings per run - a wall of near-identical rows teaches
 *  people to stop reading the panel, which costs more than the tail it hides. */
const MAX_WARNINGS = 8;

const px = (n: number) => `${Math.round(n)}px`;

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
 * mounts). Pure measurement + phrasing; never blocks anything.
 */
export function designRulesWarnings(
  doc: Document,
  template: SpxTemplate,
  settings?: ProjectLegibility | null,
): ValidationIssue[] {
  const legibility = resolveLegibility(settings);
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
  });
  const issues: ValidationIssue[] = [];
  for (const finding of report.findings) {
    const msg = productMessage(finding, legibility);
    if (msg) issues.push(msg);
    if (issues.length >= MAX_WARNINGS) break;
  }

  // The ticker-margin rule, only where a CRAWL exists: the widest painted band must also
  // carry (or contain) a measured-motion target, or the "band" is just a strap/panel whose
  // uneven margins are its design. A lower third anchored left is not an off-centre ticker.
  if (issues.length < MAX_WARNINGS && hasCrawlBand(doc, template)) {
    const ticker = measureTickerMargins(doc);
    for (const finding of ticker.findings) {
      issues.push({
        rule: 'legibility-ticker-margins',
        message: `${finding.detail} (computed for ${viewingPhrase(legibility)})`,
      });
    }
  }
  return issues.slice(0, MAX_WARNINGS);
}

/** True when the template declares measured motion (a NOACG_ANIM dynamics segment) whose
 *  target intersects a band spanning at least half the frame - the crawl signature. */
function hasCrawlBand(doc: Document, template: SpxTemplate): boolean {
  const data = parseAnimData(template.js);
  if (!data) return false;
  const selectors = new Set<string>();
  for (const step of allTimelines(data)) {
    for (const d of step.dynamics ?? []) if (d.target) selectors.add(d.target);
  }
  if (selectors.size === 0) return false;
  const frameWidth = doc.documentElement.clientWidth || template.resolution.width;
  for (const sel of selectors) {
    try {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        // The crawl's travel is horizontal when its content is wider than tall; a credits
        // roll travels vertically and has no side-margin contract to hold.
        const rect = el.getBoundingClientRect();
        const host = el.parentElement?.getBoundingClientRect();
        if ((host?.width ?? rect.width) >= frameWidth / 2 && rect.width >= rect.height) return true;
      }
    } catch {
      /* an exotic selector - leave it to the author */
    }
  }
  return false;
}

/**
 * The same warnings asked of a TEMPLATE rather than a rendered frame: mount it offscreen,
 * let it settle, measure, take it down (the `checkMarkLegibility` pattern). For surfaces
 * with no runtime bench - the editor's export panel and the community publish dialog.
 * No `play()`: the settled pose preserves layout (the root hides via opacity, which keeps
 * geometry), and an entrance tween would have this measuring text mid-flight. Returns []
 * anywhere without a DOM.
 */
export async function checkTemplateLegibility(
  template: SpxTemplate,
  settings?: ProjectLegibility | null,
): Promise<ValidationIssue[]> {
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
    if (!doc) return [];
    await Promise.race([
      doc.fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => { setTimeout(resolve, 1200); }),
    ]);
    await new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); });
    return designRulesWarnings(doc, template, settings);
  } catch {
    return [];
  } finally {
    frame.remove();
  }
}
