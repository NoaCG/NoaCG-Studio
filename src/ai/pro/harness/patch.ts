// THE GRAPHIC PATCH - the constrained representation a model edits (docs/PRO_HARNESS_PLAN.md §4).
//
// The model never returns a whole template. The platform scaffolds one - the type's fields,
// machine, controls and runtime on a valid spine (templates/types/neutralDesign.ts), or the
// typeless spine for declared fields - and the model is handed exactly THREE writable regions:
//
//   css        the design stylesheet, applied under a marker so a later patch REPLACES the
//              previous one rather than stacking on it. The cascade wins over the spine's plain
//              CSS, which is the freedom; the `:root` contract, `@font-face` and the reset stay
//              the platform's, which is what keeps the result Style-panel editable.
//   boxHtml    the markup INSIDE `<div class="PREFIX-box">`. Every field element `id="fN"` the
//              spine declared must survive exactly once; nothing else about it is fixed.
//   animation  the marked ANIMATION region, in the AUTHORING grammar every catalog preset is
//              written in (plain GSAP - `buildInTimeline` / `buildOutTimeline`). The workbench
//              converts it to NoaCG's keyframe data afterwards (convertEmittedRegion), the same
//              importer every wizard category goes through.
//
// Everything else - the SPX definition, the field ids, the lifecycle globals, the runtime
// outside the markers, the machine - is not reachable from a patch at all. This is the measured
// ranking from docs/DESIGN_PRINCIPLES.md applied to the whole graphic: a contract the model
// cannot break is one it cannot get wrong. `applyPolish` (src/ai/polish.ts) has enforced the css
// + root-html half of this since the harness existed; this module widens it to the animation
// region and reads the prefix from the scaffold instead of the DOM, so it runs in Node.
//
// Pure module: string work only. The DOM-bearing checks (does it render, does it bench) belong
// to the workbench's inspection, which runs after every accepted patch.

import type { SpxTemplate } from '../../../model/types.js';

export interface GraphicPatch {
  css?: string;
  boxHtml?: string;
  animation?: string;
}

export type PatchResult =
  | { ok: true; template: SpxTemplate; changed: boolean }
  | { ok: false; reasons: string[] };

/** The marker the design css lands under. One block, replaced per round. */
export const DESIGN_CSS_MARKER = '/* == PRO HARNESS DESIGN (the design layer the harness wrote; the :root contract above is the platform\'s) == */';

export const ANIMATION_OPEN = '/* == ANIMATION';
export const ANIMATION_CLOSE = '/* == END ANIMATION == */';

/** CSS a patch may never carry: the platform owns the contract these would rewrite, and a
 *  network reference would break the self-contained export. Read as INSPECTION of what the
 *  patch touches, not a style opinion. */
const CSS_REFUSALS: { test: RegExp; reason: string }[] = [
  { test: /:root\s*\{/, reason: 'the `:root` contract is the platform\'s - change colours by using its variables, not by redeclaring them' },
  { test: /@font-face/i, reason: '`@font-face` is bundled by the platform; pick a face through the type\'s font id' },
  { test: /@import/i, reason: '`@import` would reach the network; the export is self-contained' },
  { test: /url\(\s*['"]?\s*(https?:)?\/\//i, reason: 'a remote `url()` would reach the network; the export is self-contained' },
  { test: /<\s*script/i, reason: 'a stylesheet carries no script' },
  { test: /expression\s*\(/i, reason: 'CSS expressions are not CSS' },
];

/** JS the animation region may never carry - the converter cannot read it, and the region
 *  would then ship read-only on the timeline (src/ai/AGENTS.md, the authoring grammar). */
const ANIMATION_REFUSALS: { test: RegExp; reason: string }[] = [
  { test: /getBoundingClientRect|scrollWidth|scrollHeight|offsetWidth|offsetHeight|clientWidth|clientHeight/, reason: 'no DOM measurement inside the region - measured motion is a runtime builder, never a keyframe' },
  { test: /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie|\beval\s*\(|new\s+Function/, reason: 'the region is motion only - no network, storage or code building' },
  { test: /\bconst\b|\blet\b|=>|`/, reason: 'ES5 only in template.js (CasparCG\'s embedded Chromium): `var`, `function`, quoted strings' },
];

const HTML_REFUSALS: { test: RegExp; reason: string }[] = [
  { test: /<\s*script/i, reason: 'markup carries no script; behaviour lives in the runtime the platform owns' },
  { test: /\son[a-z]+\s*=/i, reason: 'no inline event handlers - the operator drives the graphic through update()/play()/next()' },
  { test: /style\s*=\s*"[^"]*display\s*:\s*none/i, reason: 'never hide with an inline style - the editor clears inline styles; hide with a class rule (`noacg-data-source`)' },
  { test: /<\s*(iframe|object|embed|link|meta)\b/i, reason: 'no embedded documents or head elements inside the box' },
];

function refusals(text: string, table: { test: RegExp; reason: string }[]): string[] {
  return table.filter((r) => r.test.test(text)).map((r) => r.reason);
}

/** Field ids the spine declares, from the html. Regex on purpose: this module runs where there
 *  is no DOM, and `id="fN"` is a fixed idiom the whole product writes. */
export function fieldIdsIn(html: string): string[] {
  return [...html.matchAll(/\bid="(f\d+)"/g)].map((m) => m[1]);
}

/**
 * The character range of the content INSIDE `<div class="PREFIX-box">…</div>`, walking nested
 * divs so an inner `</div>` does not end the box early. Null when the spine is not there.
 */
export function boxInnerRange(html: string, prefix: string): { start: number; end: number } | null {
  const open = new RegExp(`<div\\s+class="${escapeRegExp(prefix)}-box"\\s*>`, 'i');
  const m = open.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(html))) {
    if (t[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return { start, end: t.index };
    } else if (!/\/>$/.test(t[0])) {
      depth += 1;
    }
  }
  return null;
}

/** The marked ANIMATION region's range in template.js, markers included. */
export function animationRange(js: string): { start: number; end: number } | null {
  const start = js.indexOf(ANIMATION_OPEN);
  if (start < 0) return null;
  const closeAt = js.indexOf(ANIMATION_CLOSE, start);
  if (closeAt < 0) return null;
  return { start, end: closeAt + ANIMATION_CLOSE.length };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace the harness's design block (or append the first one). The spine's own css stays. */
export function withDesignCss(css: string, design: string): string {
  const at = css.indexOf(DESIGN_CSS_MARKER);
  const base = at >= 0 ? css.slice(0, at).replace(/\s+$/, '') : css.replace(/\s+$/, '');
  return `${base}\n\n${DESIGN_CSS_MARKER}\n${design.trim()}\n`;
}

/**
 * Apply a patch to a scaffolded template, refusing anything that reaches past the three
 * writable regions. Every reason is a sentence the model can act on; a refused patch costs no
 * render, and the loop feeds the reasons back as `harness` findings.
 */
export function applyGraphicPatch(template: SpxTemplate, prefix: string, patch: GraphicPatch): PatchResult {
  const reasons: string[] = [];
  let { html, css, js } = template;
  let changed = false;

  if (patch.css !== undefined) {
    if (!patch.css.trim()) reasons.push('css: an empty stylesheet patch changes nothing - leave the field out instead');
    reasons.push(...refusals(patch.css, CSS_REFUSALS).map((r) => `css: ${r}`));
    if (!reasons.length) {
      const next = withDesignCss(css, patch.css);
      changed = changed || next !== css;
      css = next;
    }
  }

  if (patch.boxHtml !== undefined) {
    const range = boxInnerRange(html, prefix);
    if (!range) {
      reasons.push(`boxHtml: the spine's <div class="${prefix}-box"> is not in the document - the scaffold is the only thing that writes it`);
    } else {
      reasons.push(...refusals(patch.boxHtml, HTML_REFUSALS).map((r) => `boxHtml: ${r}`));
      const original = html.slice(range.start, range.end);
      for (const id of new Set(fieldIdsIn(original))) {
        const count = (patch.boxHtml.match(new RegExp(`\\bid="${id}"`, 'g')) ?? []).length;
        if (count !== 1) reasons.push(`boxHtml: field element id="${id}" must appear exactly once (found ${count}) - the operator's value has nowhere else to go`);
      }
      for (const id of new Set(fieldIdsIn(patch.boxHtml))) {
        if (!fieldIdsIn(original).includes(id)) reasons.push(`boxHtml: id="${id}" is not a field the graphic declares - fields are the platform's, add them through the scaffold`);
      }
      if (!reasons.length) {
        const next = html.slice(0, range.start) + `\n${patch.boxHtml.trim()}\n` + html.slice(range.end);
        changed = changed || next !== html;
        html = next;
      }
    }
  }

  if (patch.animation !== undefined) {
    const range = animationRange(js);
    if (!range) {
      reasons.push('animation: the template has no marked ANIMATION region to replace');
    } else {
      const body = patch.animation;
      reasons.push(...refusals(body, ANIMATION_REFUSALS).map((r) => `animation: ${r}`));
      if (!/function\s+buildInTimeline\s*\(/.test(body)) reasons.push('animation: the region must define `function buildInTimeline()` returning a gsap.timeline()');
      if (!/function\s+buildOutTimeline\s*\(/.test(body)) reasons.push('animation: the region must define `function buildOutTimeline()` returning a gsap.timeline()');
      if (!reasons.length) {
        const inner = body.includes(ANIMATION_OPEN) ? body.trim() : `${ANIMATION_OPEN} (generated — the Animation panel rewrites this block) == */\n${body.trim()}\n${ANIMATION_CLOSE}`;
        const next = js.slice(0, range.start) + inner + js.slice(range.end);
        changed = changed || next !== js;
        js = next;
      }
    }
  }

  if (patch.css === undefined && patch.boxHtml === undefined && patch.animation === undefined) {
    reasons.push('an empty patch changes nothing - name at least one of css, boxHtml or animation');
  }

  if (reasons.length) return { ok: false, reasons };
  return { ok: true, template: { ...template, html, css, js }, changed };
}

/** What the model is shown of the scaffold: the three regions it may write, and nothing it may
 *  not. Bounded so a large spine cannot flood a cheap model's context. */
export function describeWritableRegions(template: SpxTemplate, prefix: string, maxChars = 6000): string {
  const box = boxInnerRange(template.html, prefix);
  const anim = animationRange(template.js);
  const boxText = box ? template.html.slice(box.start, box.end).trim() : '(no box found)';
  const animText = anim ? template.js.slice(anim.start, anim.end).trim() : '(no animation region found)';
  const cssAt = template.css.indexOf(DESIGN_CSS_MARKER);
  const spineCss = (cssAt >= 0 ? template.css.slice(0, cssAt) : template.css).trim();
  const designCss = cssAt >= 0 ? template.css.slice(cssAt + DESIGN_CSS_MARKER.length).trim() : '(none yet)';
  const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars)}\n/* … clipped … */` : s);
  return [
    `Prefix: "${prefix}". Root <div class="${prefix}"> holds <div class="${prefix}-box">.`,
    `Field elements you must keep, each exactly once: ${fieldIdsIn(boxText).map((id) => `id="${id}"`).join(', ') || '(none inside the box)'}.`,
    '',
    '=== boxHtml (inside the box; yours to rewrite) ===',
    clip(boxText),
    '',
    '=== spine css (read-only: the :root contract, the reset, the plain spine) ===',
    clip(spineCss),
    '',
    '=== design css (yours; replaced whole on each patch) ===',
    clip(designCss),
    '',
    '=== animation (yours; the authoring grammar - var animSpeed/easeIn/easeOut, buildInTimeline(), buildOutTimeline(), tl.set/to/fromTo with literal values) ===',
    clip(animText),
  ].join('\n');
}
