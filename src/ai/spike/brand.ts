// PHASE 1 BRAND ROUND - the synthetic brand condition, and THE LOGO CONTRACT for a
// GENERATED design (docs/NOACG_PRO_PLAN.md §14 items 0 and 1, docs/PRO_PHASE1_HANDOFF.md).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition). Its only caller is
// scripts/pro-spike.mjs, through run.ts.
//
// Phase 0 proved the checkpoint can design a GENERIC lower third and the owner's verdict was
// that generic output is free-gallery material - Pro's premise is originality conditioned on a
// customer's own brand, which Phase 0 never measured. This file is that condition: an invented
// organisation's name, palette, typeface and REAL mark file (benchmarks/pro/v1/spike/brands.json),
// with the mark's shape, backing and ink MEASURED by `assets/assetInfo.ts` `probeMark` - the same
// content-free descriptor Lite sends (`LiteMarkDescriptor`), so the two tiers describe a mark in
// one vocabulary.
//
// THE LOGO CONTRACT, in one sentence: **the design declares the slot and the platform fills it;
// the model never places the mark.** That is Lite's proven shape (`LiteCatalogEntry.logoSlot`,
// gated by scripts/ai-lite-brand-audit.mjs against a rendered measurement) moved to a world with
// no catalog slot to declare:
//
//   - the DECLARATION is part of the emitted design itself - one `filelist` field bound to an
//     empty `<img id="fN">`, whose geometry and surface are the model's design decisions;
//   - the FILL is deterministic (`fillBrandMark`): bake the file's path into the img, set the
//     field's default, bundle the asset - the fillProLogoSlot recipe, running inside the ground
//     step so every repair round re-emits against a FILLED template;
//   - the GATE is a rendered measurement (`measureRenderedMark`), with the Lite brand audit's
//     own thresholds - because the one defect every deterministic Phase 0 gate passed was a
//     broken-image icon with its alt text showing, and a gate that reads markup instead of the
//     painted frame would pass it again.
//
// The MOTION half has no precedent anywhere (the owner asked for marks that "animate in a
// meaningful and smooth way"): the contract makes the slot part of the entrance/exit like any
// other element, `markMotionState` samples it through the virtual clock, and whether the motion
// is MEANINGFUL stays a human read of the strips - a measurement can only say whether it moved.

import { markShapeFromAspect } from '../lite/types';
import { fontById, fontFaceCss, fontStack } from '../../model/fonts';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { uniqueAssetPath } from '../../assets/assetUtils';
import type { MarkProbe } from '../../assets/assetInfo';
import type { SpxTemplate } from '../../model/types';

export interface SpikeBrandColor {
  name: string;
  hex: string;
  note: string;
}

/** One synthetic brand, as the fixture declares it and the runner measures it. */
export interface SpikeBrand {
  id: string;
  name: string;
  world: string;
  /** A src/model/fonts.ts id - resolved through the real registry, so a stale fixture throws. */
  typeface: string;
  palette: SpikeBrandColor[];
  mark: {
    /** The bundled asset path the fill writes (images/<file>). */
    path: string;
    /** The mark file as a data URL - what the asset carries and the preview shim resolves. */
    dataUrl: string;
    /** Measured by probeMark at run time, never hand-written (the supportingLineChars rule). */
    probe: MarkProbe;
  };
}

/** The same ink-word cuts the Lite client applies to the identical probe (lite/client.ts). */
export function inkWord(probe: MarkProbe): 'light' | 'dark' | 'mid' {
  return probe.inkLuminance >= 0.65 ? 'light' : probe.inkLuminance <= 0.35 ? 'dark' : 'mid';
}

/** The mark, described to the model in measured facts - shape bucket, backing, ink - in the
 *  vocabulary Lite already uses. Content-free: the pixels never enter the prompt. */
export function markFacts(probe: MarkProbe): string {
  const shape = markShapeFromAspect(probe.aspect);
  const aspect = probe.aspect >= 1
    ? `about ${probe.aspect.toFixed(1)}:1`
    : `about 1:${(1 / probe.aspect).toFixed(1)}`;
  const backing = probe.backing === 'own-field'
    ? 'it brings its own background field, so it reads on any surface'
    : 'its backing is transparent, so its ink composites onto whatever surface you design under it';
  const ink = probe.backing === 'own-field'
    ? ''
    : inkWord(probe) === 'light'
      ? ' Its ink is light (a knockout) - it needs a dark surface to read.'
      : inkWord(probe) === 'dark'
        ? ' Its ink is dark - it needs a light surface to read.'
        : ' Its ink is mid-tone - check the surface you give it keeps it legible.';
  return `a ${shape} (${aspect}); ${backing}.${ink}`;
}

/**
 * The brand section of the user message - identical in both arms, exactly as the exemplar
 * block is the only thing the arms may differ in.
 *
 * The typeface's @font-face is given VERBATIM: the coder prompt teaches no font mechanics
 * beyond the example (measured - src/ai/claudeProvider.ts teaches the :root vars and nothing
 * about @font-face), so the file name is a fact the model cannot guess and should not try.
 */
export function brandBlock(brand: SpikeBrand, options: { mark?: boolean } = {}): string {
  const font = fontById(brand.typeface);
  if (!font) throw new Error(`spike brand "${brand.id}": typeface ${brand.typeface} is not in the font registry`);
  const palette = brand.palette
    .map((c) => `- ${c.name} ${c.hex} - ${c.note}`)
    .join('\n');
  // NO MODEL-PLACED LOGOS on the custom-lane types (owner ruling, docs/NOACG_PRO_PLAN.md
  // §22.1 escape 2: the mark was the sweep's dominant cross-type defect - plates, floating
  // beside the composition, oversized, pushing layouts sideways). The brand still conditions
  // palette, type and world; mark placement is the platform's (the Phase A knock rule).
  if (options.mark === false) {
    return `## The customer's brand

This graphic is for ONE specific customer, and their identity must DRIVE the design - the
palette is the design's colour system, not a tint over someone else's. An answer that would
look the same for any other organisation has not answered this brief.

- Organisation: ${brand.name} - ${brand.world}.
- Palette (build the graphic's colour system from these; derive shades where you need them):
${palette}
- Typeface: ${font.family}. Set \`--font-heading\` to the stack below and include the @font-face
  verbatim in template.css - the file ships with the graphic:

\`\`\`css
${fontFaceCss(font)}
\`\`\`

  (the stack: \`--font-heading: ${fontStack(font)};\`)

This graphic carries NO brand mark: do not add an image field, a logo placeholder or any
reserved logo space - the platform owns mark placement and adds nothing here. The brand lives
in the palette, the type and the design's world.`;
  }
  return `## The customer's brand

This graphic is for ONE specific customer, and their identity must DRIVE the design - the
palette is the design's colour system, not a tint over someone else's. An answer that would
look the same for any other organisation has not answered this brief.

- Organisation: ${brand.name} - ${brand.world}.
- Palette (build the graphic's colour system from these; derive shades where you need them):
${palette}
- Typeface: ${font.family}. Set \`--font-heading\` to the stack below and include the @font-face
  verbatim in template.css - the file ships with the graphic:

\`\`\`css
${fontFaceCss(font)}
\`\`\`

  (the stack: \`--font-heading: ${fontStack(font)};\`)
- Brand mark: ${markFacts(brand.mark.probe)}

## The brand mark's slot (the platform fills it)

The customer's mark is a REAL file and the platform places it - you never draw the mark, never
guess its artwork, and never write its src. You declare WHERE it lives, and that declaration is
a design decision like any other:

- Add ONE image field to the SPX definition - \`"ftype": "filelist"\`, title "Logo" - after the
  text fields, bound to \`<img id="fN" class="…-logo" alt="">\` in the markup with NO src
  attribute. The platform bakes the file in before validation.
- DO NOT HIDE THE IMG YOURSELF. The empty state is already handled: \`setFieldValue\` sets
  \`display: none\` on the img inline when the field is cleared and removes it when a file
  arrives, so a \`display: none\` of your own in template.css is a mark that never appears -
  the design has to un-hide it with a rule, and a rule keyed one level off leaves the customer
  looking at an empty slot. If you want a layout that reacts to the mark's presence, key it on
  \`.has-image\`, which lands on the img's PARENT.
- THE PLATFORM PLACES AND SIZES THE MARK. It goes into a leading column of your box, beside
  the text and vertically centred, at a measured height with free width so a crest and a wide
  wordmark both read - and where its ink needs a reading surface, that column becomes the
  surface. So do not draw a plate, a card or a panel behind it, do not write its width or
  height, and do not build a container to hold it: an \`<img>\` with your own class on it is the
  whole declaration. Design the graphic around a mark that will be there; the seat is ours.
- Everything else about the mark is still yours - whether the composition leads with it or
  leans on the text, how much air the panel carries, what the mark sits NEXT to. The mark is
  the customer's and it arrives as-is: it is never cropped, rounded, filtered or unevenly
  scaled, by you or by us.
- The mark is part of the composition, so it is part of the motion: bring it in and out inside
  the ANIMATION region with the same intent as the text - it should arrive meaningfully and
  smoothly, never pop in unannounced and never just sit there while the rest of the graphic
  moves.`;
}

// ── The deterministic FILL ─────────────────────────────────────────────────────────────

export interface BrandFillReport {
  /** The filelist field the mark landed in, or null when the design declared no usable slot. */
  slotFieldId: string | null;
  /** The bundled asset path written into the img and the field. */
  path: string | null;
  /** The model wrote its own src despite the contract - repaired (replaced), and recorded,
   *  because a repair that hides the violation would un-measure the contract. */
  hadOwnSrc: boolean;
  /** `has-image` was stamped on the root and the box as well as wherever the runtime puts it
   *  (see the fill below). Null when no prefix could be read off the markup. */
  stampedHasImage?: boolean;
  /** What the platform decided the mark's ink should sit on, and why. */
  surface?: MarkSurfaceDecision;
  /** The platform moved the mark into its own leading column of the box. False when the markup
   *  gave it nowhere to move to (no readable prefix, or no `<img>` bound to the slot). */
  placed?: boolean;
  /** The mark left an empty container behind and it was removed with it - usually the plate the
   *  design had drawn around the mark, which would otherwise be stranded. */
  droppedEmptyWrapper?: boolean;
}

// ── THE MARK'S SURFACE IS THE PLATFORM'S (owner decision, 2026-08-13) ───────────────────
//
// Teaching the model to draw a good surface was written twice and measured once, and it moved
// the defect by nothing: 9/18 boxed untaught against 8/12 taught (docs/AI_ATTEMPTS.md). So the
// surface stops being a thing a model can get wrong. This is the same split Lite already ships
// and the same one the rest of this contract follows - the design declares the SLOT, the
// platform decides what goes under it, the model never draws it - mapped onto authored
// graphics: the model owns WHERE the mark sits and HOW BIG it is, because those are
// composition; the platform owns what its ink reads against, because that is legibility.
//
// The decision is deterministic and needs no rendering, which is what lets it run inside the
// fill (the ground step) rather than after a capture:
//
//   * an OWN-FIELD mark brings its own background and never needs one;
//   * a TRANSPARENT mark is compared against the panel the design DECLARES (`--panel-bg` in
//     its own `:root`), and a pair that already clears WCAG's 3:1 non-text floor is left alone
//     - a surface nothing needs is furniture;
//   * otherwise the platform draws a FIELD.
//
// The honest limit, stated rather than hidden: `--panel-bg` is what the design says its panel
// is, not necessarily what the mark lands on - a slot placed outside the box sits on the
// footage. When the token cannot be read the platform draws nothing and lets the rendered gate
// report `ink-contrast`, because adding furniture on a guess is a visible defect and a missed
// contrast finding is a reported one.

export type MarkSurface = 'none' | 'light-field' | 'dark-field';

export interface MarkSurfaceDecision {
  surface: MarkSurface;
  /** Why, in the vocabulary the ledger and the key print. */
  reason: string;
  /** The declared panel's contrast against the mark's ink, when both were readable. */
  contrast?: number;
}

/** The two neutrals, fixed rather than derived from the brand palette - exactly the reasoning
 *  `templates/shared/logoSlot.ts` `plateCss` already carries: the field exists BECAUSE the
 *  design's own surface is the wrong tone, so deriving it from that design is how it comes out
 *  wrong again. Both clear 3:1 against a pure white and a pure black mark with room to spare. */
export const MARK_FIELD_LIGHT = '#f2f4f7';
export const MARK_FIELD_DARK = '#12161c';

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function hexLuminance(hex: string): number {
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return relativeLuminance([
    parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16),
  ]);
}

/**
 * The WORST contrast the mark's ink gets against the panel the design declares - or null when
 * the declaration carries no colour at all (a bare `var()` chain).
 *
 * Two things this has to handle, because both are what designs actually write and the first
 * version of this gave up on both, leaving the whole mechanism inert on 11 of 15 generations:
 *
 *   * TRANSLUCENCY. `rgba(11, 14, 17, 0.92)` is a panel, not an unknown - the footage under it
 *     contributes 8%. So the tone is composited over the two extremes a broadcast background
 *     can be (black and white) and the WORSE result is used. Compositing in luminance rather
 *     than per channel is an approximation, and an acceptable one for a threshold this far from
 *     the boundary in every real case.
 *   * GRADIENTS. `linear-gradient(90deg, #FFC838, #FF7A1A)` is two tones, and a mark has to read
 *     on both, so every colour token in the declaration is evaluated and the worst wins.
 */
function worstPanelContrast(css: string, inkLuminance: number): number | null {
  const declared = css.match(/--panel-bg\s*:\s*([^;}]+)/)?.[1]?.trim();
  if (!declared) return null;
  const tones: { luminance: number; alpha: number }[] = [];
  for (const m of declared.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
    tones.push({ luminance: hexLuminance(m[1]), alpha: 1 });
  }
  for (const m of declared.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/gi)) {
    const parsed = parseColor(m[0]);
    if (parsed) tones.push({ luminance: relativeLuminance(parsed.rgb), alpha: parsed.alpha });
  }
  if (!tones.length) return null;
  let worst = Infinity;
  for (const tone of tones) {
    for (const backdrop of [0, 1]) {
      const composited = tone.alpha * tone.luminance + (1 - tone.alpha) * backdrop;
      worst = Math.min(worst, contrastRatio(inkLuminance, composited));
    }
  }
  return worst;
}

export function decideMarkSurface(css: string, probe: MarkProbe): MarkSurfaceDecision {
  if (probe.backing === 'own-field') {
    return { surface: 'none', reason: 'the mark brings its own field' };
  }
  const panel = worstPanelContrast(css, probe.inkLuminance);
  if (panel === null) {
    return { surface: 'none', reason: 'the design declares no readable --panel-bg - the rendered gate reports the contrast' };
  }
  if (panel >= MARK_INK_CONTRAST_FLOOR) {
    return { surface: 'none', reason: `the declared panel already reads at ${panel.toFixed(2)}:1`, contrast: panel };
  }
  // WHICH neutral is COMPUTED, never assumed from whether the ink is "light" or "dark". A
  // mid-tone mark is the case that breaks the assumption: the sunbeam roundel sits at 0.49, so
  // an ink<0.5 rule would hand it the light field it reads on at 1.8:1 instead of the dark one
  // it reads on at 9.4:1. Both are measured and the better one wins.
  const light = contrastRatio(probe.inkLuminance, hexLuminance(MARK_FIELD_LIGHT.slice(1)));
  const dark = contrastRatio(probe.inkLuminance, hexLuminance(MARK_FIELD_DARK.slice(1)));
  const surface: Exclude<MarkSurface, 'none'> = light >= dark ? 'light-field' : 'dark-field';
  const achieved = Math.max(light, dark);
  // An honest failure beats a silent one: if neither neutral clears the floor the field still
  // goes on (it is the best surface available) and the reason says the floor was not reached,
  // so the round can see a mark no fixed neutral can carry.
  const reason = achieved >= MARK_INK_CONTRAST_FLOOR
    ? `the declared panel reads at ${panel.toFixed(2)}:1, under the ${MARK_INK_CONTRAST_FLOOR}:1 floor - the field reads at ${achieved.toFixed(2)}:1`
    : `the declared panel reads at ${panel.toFixed(2)}:1 and NEITHER neutral clears the floor (best ${achieved.toFixed(2)}:1) - this mark needs a brand decision`;
  return { surface, reason, contrast: panel };
}

/**
 * Fill the declared slot with the brand's real mark - the fillProLogoSlot recipe (bake the
 * src, set the field's default, bundle the asset), minus the parts that need a compile report.
 *
 * Runs inside the spike's ground step, so a repair round re-emits against a filled template
 * and the validator (armed with the mark's path) screens the template the human will see.
 * Returns the template UNCHANGED (report only) when no filelist field binds to an <img> -
 * absence is the gate's finding, not the fill's.
 */
export function fillBrandMark(
  template: SpxTemplate,
  brand: SpikeBrand,
  // WHETHER THE PLATFORM PLACES THE MARK IS THE CALLER'S ANSWER, NOT A GUESS OFF THE CSS.
  //
  // The first version sniffed for `.{prefix}-box.has-image` and read it as "this design already
  // carries the catalog's slot, so leave its placement alone". It is not that signal at all:
  // EVERY generated design in the 2026-08-13 placement round wrote that rule - reacting to the
  // mark's presence is ordinary CSS - so the guard matched 11 of 11 and the platform placed
  // nothing, in a round run to measure placement. The caller always knows which it has: a
  // candidate is generated (place it), an anchor is a hand-authored catalog design whose slot
  // `applyLogoSlot` already drew (do not - laying a second grid over it took the mark-fill
  // control from CLEAN to `collision` with zero clear space).
  { place = true }: { place?: boolean } = {},
): { template: SpxTemplate; fill: BrandFillReport } {
  const slot = template.fields.find(
    (f) => f.ftype === 'filelist' && new RegExp(`<img\\b[^>]*\\bid="${f.field}"`).test(template.html),
  );
  if (!slot) return { template, fill: { slotFieldId: null, path: null, hadOwnSrc: false } };

  const wanted = brand.mark.path.split('/').pop() || 'mark.svg';
  const taken = template.assets.some((a) => a.path === `images/${wanted}`);
  const path = taken ? uniqueAssetPath(wanted, template.assets) : `images/${wanted}`;

  const fields = template.fields.map((f) => (f.field === slot.field ? { ...f, value: path } : f));
  let html = replaceDefinitionInHtml(template.html, template.settings, fields);

  let hadOwnSrc = false;
  html = html.replace(new RegExp(`<img\\b[^>]*\\bid="${slot.field}"[^>]*>`), (tag) => {
    if (/\bsrc\s*=/.test(tag)) {
      hadOwnSrc = true;
      tag = tag.replace(/\s*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/, '');
    }
    return tag.replace(/^<img\b/, `<img src="${path}"`);
  });

  const stamped = stampHasImage(html);
  html = stamped.html;

  const surface = decideMarkSurface(template.css, brand.mark.probe);
  const placed = place && stamped.prefix ? placeMark(html, stamped.prefix, slot.field) : null;
  if (placed?.placed) html = placed.html;

  const css = `${template.css}\n${filledMarkVisibilityCss(slot.field)}`
    + (placed?.placed ? `\n${markSlotCss(stamped.prefix as string, slot.field, surface.surface, placed.rows)}` : '');

  return {
    template: {
      ...template,
      html,
      css,
      fields,
      assets: [...template.assets, { path, data: brand.mark.dataUrl }],
    },
    fill: {
      slotFieldId: slot.field,
      path,
      hadOwnSrc,
      stampedHasImage: stamped.stamped,
      surface,
      placed: Boolean(placed?.placed),
      droppedEmptyWrapper: Boolean(placed?.droppedWrapper),
    },
  };
}

/**
 * THE PLATFORM PLACES THE MARK (owner decision, 2026-08-13 - "take placement too").
 *
 * This is the half that makes the surface drawable at all. Two attempts at painting a field
 * under a mark the MODEL had placed both failed, in different-looking ways with one cause: a
 * surface can only be a band of the composition if whoever draws it knows the composition.
 * Lite has always drawn one because Lite owns placement - `templates/shared/logoSlot.ts` puts
 * the mark in a grid column of a box it controls - so Pro takes the same thing.
 *
 * The model still DECLARES the slot: the filelist field and the `<img id="fN">` are its
 * emit, which is what keeps the SPX field contract the model's and the operator's. What moves
 * is WHERE that img sits - to the first column of the box - and the sizing, which comes with
 * placement because a column's width is a placement decision. The size is the catalog's own
 * audited recipe rather than a fresh guess (a fixed height with free width and a wordmark cap:
 * `benchmarks/lite/BRAND-AUDIT-2026-08-09.md`, the 56px-square finding).
 *
 * The surgery is a real DOM move rather than a regex, because "take this element out of
 * wherever it is and make it the first child of that one" is not a string operation and this
 * module already runs in a browser. A wrapper the mark leaves EMPTY is removed with it: the
 * model's own logo container usually carries the plate it drew, and leaving that behind would
 * strand exactly the floating rectangle this whole change exists to stop.
 */
function placeMark(
  html: string, prefix: string, fieldId: string,
): { html: string; placed: boolean; droppedWrapper: boolean; rows: number } {
  const unchanged = { html, placed: false, droppedWrapper: false, rows: 1 };
  if (typeof DOMParser === 'undefined') return unchanged;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const img = doc.getElementById(fieldId);
  const box = doc.querySelector(`.${CSS.escape(`${prefix}-box`)}`);
  if (!img || img.tagName !== 'IMG' || !box) return unchanged;

  const field = doc.createElement('div');
  field.className = 'noacg-mark-field';
  const oldParent = img.parentElement;
  field.appendChild(img);
  box.insertBefore(field, box.firstChild);

  // The container the mark came out of, when the mark was all it held.
  let droppedWrapper = false;
  if (oldParent && oldParent !== box && oldParent.children.length === 0
    && !(oldParent.textContent ?? '').trim()) {
    oldParent.remove();
    droppedWrapper = true;
  }
  // SERIALIZE THE WHOLE DOCUMENT, NOT THE BODY.
  //
  // This returned `doc.body.innerHTML` and it cost a $0.25 round: an SPX template's
  // `SPXGCTemplateDefinition` lives in a <script> outside the body, so every one of the twelve
  // generations came back without its definition and failed the contract - the field list the
  // operator drives the graphic by, deleted by the step that moves an image. The mark findings
  // in that round were the best yet and every template was invalid.
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : '';
  // HOW MANY ROWS THE TEXT ACTUALLY OCCUPIES - counted, never assumed.
  //
  // The slot below spans the text stack so the mark centres against it. That span used to be a
  // fixed `span 9` ("more rows than any design draws"), and the owner failed the seated control
  // twice on what it did: "name in the top right, logo centred, empty space underneath". Nine
  // rows means EIGHT row gaps, and a box that declared `gap: 20px` for its two text rows got
  // 160px of empty grid under them - the mark centred over the void, the words pushed to the
  // top, and the panel a third taller than its content (measured: a 4.38x top-to-bottom padding
  // imbalance, which the spacing instrument reported as `padding-lopsided`).
  //
  // The row count is a DOM fact and the platform is holding the DOM, so it is counted here.
  const rows = Math.max(1, box.children.length - 1);
  return { html: doctype + doc.documentElement.outerHTML, placed: true, droppedWrapper, rows };
}

/**
 * The platform's slot: a leading column of the box, and - when the mark's ink needs one - that
 * column IS the field.
 *
 * Copied in shape from `applyLogoSlot`'s beside layout, which the 2026-08-13 blind review made
 * the standing arrangement for lower thirds ("do not place a logo above or below; prefer
 * beside"), including the widened cap: the mark's column must not come out of the TEXT's
 * measure, which is the Lite audit's `logo-costs-text`.
 *
 * `align-self: stretch` is a grid item's DEFAULT here and it works, where the same property
 * did nothing inside the model's own flex container - because this time the platform owns the
 * container the property is answering. That is the whole reason a band is drawable now: the
 * field runs the full height of the text stack, so it reads as a segment of the panel rather
 * than a plate around the mark, and it no longer matches `bounding-box-well`.
 */
function markSlotCss(prefix: string, fieldId: string, surface: MarkSurface, rows: number): string {
  const fill = surface === 'light-field' ? MARK_FIELD_LIGHT
    : surface === 'dark-field' ? MARK_FIELD_DARK : null;
  const background = fill
    ? `\n  background: ${fill};             /* the field the mark's ink reads on - a fixed neutral,\n                                      never the palette whose tone already failed */`
    : '';
  return `/* == PLATFORM: the brand mark's slot. The design declares the field; the platform
   places it - a leading column beside the text, vertically centred, engaged through the
   .has-image class the shared runtime already toggles. The column is full height, so a mark
   that needs a reading surface gets a band of the composition rather than a plate. == */
.${prefix}-box.has-image {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);  /* the mark's own width, then the text */
  column-gap: calc(20px * var(--scale));
  align-items: center;
  /* Widened by the mark column's worst case so the mark never charges the text for its seat. */
  max-width: min(calc(1080px * var(--scale)), 1680px);
}
.${prefix}-box.has-image > *:not(.noacg-mark-field) {
  grid-column: 2;                  /* every text row keeps stacking in the second column */
}
.noacg-mark-field {
  grid-column: 1;
  grid-row: 1 / span ${rows};            /* exactly the rows the text occupies - centres the mark
                                      against the words. A fixed larger span buys the box that
                                      many ROW GAPS of empty grid underneath. */
  align-self: stretch;             /* FULL HEIGHT of the text stack: a field, not a box */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 calc(14px * var(--scale));  /* clear space either side, inside the field */${background}
}
#${fieldId} {
  height: calc(64px * var(--scale));  /* the mark's height is what a viewer reads it by */
  width: auto;                     /* …and its width follows its own proportions */
  max-width: calc(260px * var(--scale));  /* the cap a very wide rail letterboxes inside */
  object-fit: contain;             /* show the whole mark, never crop a wordmark */
}`;
}

/*
 * WHY THE DECISION SHIPS AND THE DRAWING DOES NOT (2026-08-13, measured twice).
 *
 * Deciding the surface needs nothing from the design's layout, so it is deterministic and it
 * is above. DRAWING one needs the design's layout to hold still, and it does not:
 *
 *   1. A wrapper with `align-self: stretch` and padding. The property computed to `stretch` on
 *      all three generations that needed a field and the USED height stayed the mark's own -
 *      the slot sits inside the design's own flex container and the mark's `height: 100%`
 *      makes the cross size circular. So the field came out hugging the mark, which is the
 *      defect it exists to remove, and its padding ate 24px of the mark on the way (two marks
 *      dropped under the minimum legible size).
 *   2. A `display: contents` wrapper painting the band from a bleeding `::before`. The mark
 *      kept its exact size, and the band landed in the wrong place entirely - with no box of
 *      its own the pseudo-element resolves against whatever ancestor happens to be positioned,
 *      so it painted a slab across the middle of the panel, over the text. And the rendered
 *      gate cannot see a pseudo-element at all: it walks real ancestors for a painted
 *      background, so even a correct band would have reported `ink-contrast` as a failure.
 *
 * The lesson both attempts teach is the same one, and it is about the SPLIT rather than the
 * CSS: a surface can only be "a band of the composition" if the platform knows the
 * composition. Lite can draw one because Lite owns the placement too - `applyLogoSlot` puts
 * the mark in a grid column of the box it controls. Taking the surface while leaving placement
 * to the model asks the platform to draw a shape inside a layout it has never seen.
 *
 * So the honest structural version is the fuller one: the platform owns the mark's PLACEMENT
 * as well as its surface. That is a bigger change than a fill-time CSS append and it takes
 * composition back from the model, which is a product decision rather than an implementation
 * one - docs/NOACG_PRO_PLAN.md §14 item 1 carries it.
 */

/**
 * THE FILLED MARK PAINTS. That is the contract, and this is the line that makes it true
 * rather than likely.
 *
 * Stamping `has-image` (above) rescues a design whose reveal rule is keyed one level too high,
 * but not one whose reveal targets the WRONG ELEMENT - `.PREFIX-logo-container.has-image {
 * display: flex }` sets the container's display and never un-hides the `<img>` inside it, so
 * the mark is gone no matter which ancestor carries the class. Both shapes start the same way:
 * the design writes `display: none` on the img "until an image is provided" and then has to
 * write a second rule to undo it, and the second rule is the one nothing in the prompt
 * describes.
 *
 * It is redundant code to begin with. `setFieldValue` sets and clears `display` INLINE on the
 * img, so the empty state never needed a stylesheet rule - which is also why this override is
 * safe: an operator clearing the field still gets the inline `display: none`, and inline wins.
 *
 * Scoped to the one filled id and appended last, so it outranks the design's own class rule by
 * specificity and order without touching anything else. `block` rather than `revert` because
 * the UA default for an img is inline, and a slot styled `height: 100%; width: auto;
 * object-fit: contain` is being drawn as a box.
 */
function filledMarkVisibilityCss(fieldId: string): string {
  return `/* == PLATFORM: the mark's slot is filled, so it must paint. The design's own
   "hidden until an image arrives" rule is redundant - the runtime sets display inline when the
   operator clears the field, and inline still wins over this. == */
#${fieldId} { display: block; }`;
}

/**
 * STAMP `has-image` ON THE ROOT AND THE BOX, so a design that keys its mark's reveal there
 * still shows the mark.
 *
 * The models have to guess where that class lands, because nothing tells them. The shared
 * runtime's `setFieldValue` - the helper the prompt says to copy verbatim - toggles it on the
 * img's PARENT (`templates/shared/base.ts`), while the prompt only says to use "the has-image
 * pattern from the example" and the neutral skeleton the example slot carries has no image
 * field in it at all. A prompt line pointing at an example that does not contain the thing is
 * dead teaching, and it failed the way dead teaching does: five of the ablation round's twelve
 * marks never painted, every one of them the same construction - the design hid its own
 * `<img>` by default and wrote `.PREFIX.has-image .PREFIX-logo { display: block }` to bring it
 * back, anchoring the class one level above where it actually appears.
 *
 * A mark that does not paint is worse than a mark on an ugly plate, so this repairs rather
 * than reports (the Lite rule: a legibility rule must repair, not refuse). Adding a class can
 * only ENABLE a rule the design already wrote, never hide anything - and the empty state is
 * unaffected, because the runtime sets `display: none` INLINE when the field is cleared, which
 * outranks any stylesheet reveal. The violation is still recorded: `hadOwnSrc` has a sibling
 * now, and a design needing the stamp is a design whose own selector was wrong.
 */
function stampHasImage(html: string): { html: string; stamped: boolean; prefix: string | null } {
  const prefix = html.match(/<div\s+class="([a-z][\w-]*)-box[\s"]/)?.[1] ?? null;
  if (!prefix) return { html, stamped: false, prefix };
  let out = html.replace(
    new RegExp(`<div\\s+class="${prefix}(?=["\\s])([^"]*)"`),
    (tag, rest: string) => (/\bhas-image\b/.test(rest) ? tag : `<div class="${prefix}${rest} has-image"`),
  );
  out = out.replace(
    new RegExp(`<div\\s+class="${prefix}-box(?=["\\s])([^"]*)"`),
    (tag, rest: string) => (/\bhas-image\b/.test(rest) ? tag : `<div class="${prefix}-box${rest} has-image"`),
  );
  return { html: out, stamped: out !== html, prefix };
}

// ── The rendered GATE ──────────────────────────────────────────────────────────────────
//
// The thresholds are the Lite brand audit's (scripts/ai-lite-brand-audit.mjs), so the two
// tiers hold a mark to one standard: minimum legible size, clear space as a ratio of the
// mark's own height, a 2% aspect tolerance, WCAG's 3:1 non-text floor for transparent ink
// (1.5:1 field separation for an own-field mark), and the 1080p title-safe box.

export const MARK_MIN_HEIGHT_PX = 32;
export const MARK_MIN_LOCKUP_WIDTH_PX = 96;
export const MARK_LOCKUP_ASPECT = 3;
export const MARK_CLEAR_RATIO = 0.25;
export const MARK_ASPECT_TOLERANCE = 0.02;
export const MARK_INK_CONTRAST_FLOOR = 3;
export const MARK_FIELD_SEPARATION_FLOOR = 1.5;
export const TITLE_SAFE = { left: 96, right: 1824, top: 54, bottom: 1026 } as const;

// ── The BOUNDING-BOX WELL (the 2026-08-13 round's named defect) ────────────────────────
//
// The owner's blind read, seven times over: a transparent mark sitting on a surface that
// hugs it "looks like a JPEG pasted on top - not acceptable" - while the SAME tone drawn as
// a real compositional element (a banner segment, an end cap) was praised twice. The
// distinction is measurable: a surface that tracks the mark's box on every side is a
// bounding box; one that extends into the composition is a design.
//
// CALIBRATED against that round's own labels (scripts/spike-well-calibrate.mjs, free - the
// code was saved): 7/7 owner-flagged items caught, 4/6 praised items clean. The two
// disagreements are the honest limit and the reason this REPORTS and never gates: the
// identical construction - a ~12px-margin gradient plate on a dark panel - was praised on
// `long-name` and `gradient-accent` and flagged on `news-public`. Same geometry, same tones,
// opposite verdicts; what changed is the brief's WORLD, which is a judgement no rect
// measures. The unambiguous end of the class (margins ~0: the well IS the mark's box, the
// B-08 case) is always a defect.
//
// A well may hug the mark by up to this margin relative to the mark's painted height on
// EVERY side before it reads as a bounding box; extending past it on ANY side (joining a
// panel, running to an edge) is integration.
export const WELL_HUG_RATIO = 0.6;

export interface RenderedMarkReport {
  /** Every failed check, in the audit's code vocabulary (not-painted, aspect-distorted,
   *  cropped, below-min-size, collision, clear-space, outside-box, outside-safe-area,
   *  ink-contrast, field-separation, no-slot). Empty = the mark passed the rendered gate. */
  findings: string[];
  /** The drawn mark size (after object-fit), when painted. */
  paintedW?: number;
  paintedH?: number;
  /** Clear space measured / required, and what sat nearest. */
  clearPx?: number;
  needClearPx?: number;
  nearest?: string;
  /** Ink contrast ratio against the surface the slot actually sits on, when derivable. */
  inkRatio?: number;
  surface?: string;
  notes: string[];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** The rgb and alpha of a computed `rgb()`/`rgba()` colour, null for any other form. Whether a
 *  fill is a SURFACE is not this function's question: that is `paintsSurface` in
 *  validation/surface.ts, shared by every instrument that asks. */
function parseColor(value: string): { rgb: [number, number, number]; alpha: number } | null {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return null;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** Whether an element paints anything of its own - text, a background, a border, an image.
 *  Tag names rather than instanceof throughout: iframe-realm elements fail instanceof against
 *  the host page's classes. Shared with the alignment-axis instrument (axisCheck.ts), because
 *  two definitions of "visible element" is how two measurements come to disagree. */
export function paints(el: Element, style: CSSStyleDeclaration): boolean {
  if (['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName)) return true;
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') return true;
  const bg = parseColor(style.backgroundColor);
  if (bg && bg.alpha > 0.05) return true;
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  if ((parseFloat(style.borderTopWidth) || 0) > 0 && style.borderTopStyle !== 'none') return true;
  if (style.boxShadow && style.boxShadow !== 'none') return true;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true;
  }
  return false;
}

/**
 * Measure the FILLED slot in the settled rendered frame. Pure DOM reads - the caller mounts
 * the document (the runner's hold capture) and passes its iframe document in.
 */
export function measureRenderedMark(doc: Document, fieldId: string, probe: MarkProbe): RenderedMarkReport {
  const report: RenderedMarkReport = { findings: [], notes: [] };
  const el = doc.getElementById(fieldId);
  const win = doc.defaultView;
  // tagName, not instanceof - the element lives in the iframe's realm, whose classes are
  // different objects from the host page's.
  if (!win || !el || el.tagName !== 'IMG') {
    report.findings.push('no-slot');
    return report;
  }
  const img = el as HTMLImageElement;
  const style = win.getComputedStyle(img);
  const rect = img.getBoundingClientRect();

  const hidden = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05;
  if (!img.naturalWidth || rect.width < 1 || rect.height < 1 || hidden) {
    report.findings.push('not-painted');
    return report;
  }

  // The drawn image inside the layout box, per object-fit - the audit's computation. The
  // default ('fill') stretches, which is exactly the distortion the as-is contract refuses.
  const natural = img.naturalWidth / Math.max(1, img.naturalHeight);
  const box = rect.width / Math.max(1, rect.height);
  const fit = style.objectFit || 'fill';
  let paintedW = rect.width;
  let paintedH = rect.height;
  if (fit === 'contain' || fit === 'scale-down') {
    if (box > natural) paintedW = rect.height * natural;
    else paintedH = rect.width / natural;
  } else if (fit === 'cover') {
    if (Math.abs(box - natural) / natural > MARK_ASPECT_TOLERANCE) report.findings.push('cropped');
  } else if (fit === 'none') {
    if (img.naturalWidth > rect.width || img.naturalHeight > rect.height) report.findings.push('cropped');
    paintedW = Math.min(rect.width, img.naturalWidth);
    paintedH = Math.min(rect.height, img.naturalHeight);
  } else if (Math.abs(box - natural) / natural > MARK_ASPECT_TOLERANCE) {
    report.findings.push('aspect-distorted');
  }
  report.paintedW = Math.round(paintedW);
  report.paintedH = Math.round(paintedH);

  if (probe.aspect > MARK_LOCKUP_ASPECT ? paintedW < MARK_MIN_LOCKUP_WIDTH_PX : paintedH < MARK_MIN_HEIGHT_PX) {
    report.findings.push('below-min-size');
  }

  // Clear space: the nearest painting element that is not an ancestor (a containing surface
  // is what the mark SITS on) and not the mark itself. Overlap is its own finding.
  const needClear = paintedH * MARK_CLEAR_RATIO;
  let clear = Infinity;
  let nearest = '';
  const all = doc.body.querySelectorAll('*');
  for (const other of all) {
    if (other === img || other.contains(img)) continue;
    if (img.contains(other)) continue;
    const os = (win as Window).getComputedStyle(other);
    if (os.display === 'none' || os.visibility === 'hidden' || parseFloat(os.opacity) < 0.05) continue;
    if (!paints(other, os)) continue;
    const r = other.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // An element whose box fully contains the mark is a surface, not a neighbour.
    if (r.left <= rect.left && r.right >= rect.right && r.top <= rect.top && r.bottom >= rect.bottom) continue;
    // Skip wrappers of painting CHILDREN only (their children are measured directly).
    const dx = Math.max(r.left - rect.right, rect.left - r.right, 0);
    const dy = Math.max(r.top - rect.bottom, rect.top - r.bottom, 0);
    const gap = Math.hypot(dx, dy);
    if (dx === 0 && dy === 0) {
      report.findings.push('collision');
      nearest = `${other.tagName.toLowerCase()}${other.id ? `#${other.id}` : ''}.${[...other.classList].join('.')}`;
      clear = 0;
      break;
    }
    if (gap < clear) {
      clear = gap;
      nearest = `${other.tagName.toLowerCase()}${other.id ? `#${other.id}` : ''}.${[...other.classList].join('.')}`;
    }
  }
  report.clearPx = Number.isFinite(clear) ? Math.round(clear * 10) / 10 : undefined;
  report.needClearPx = Math.round(needClear * 10) / 10;
  report.nearest = nearest || undefined;
  if (!report.findings.includes('collision') && Number.isFinite(clear) && clear < needClear) {
    report.findings.push('clear-space');
  }

  // Containment: inside the design's own -box (the structure spine names it) and title-safe.
  const boxEl = [...doc.querySelectorAll('[class]')].find((e) =>
    [...e.classList].some((c) => c.endsWith('-box'))) ?? null;
  if (boxEl && !boxEl.contains(img)) {
    report.notes.push('the slot sits outside the design box - placed deliberately or escaped; read the frame');
  } else if (boxEl) {
    const b = boxEl.getBoundingClientRect();
    if (rect.left < b.left - 1 || rect.right > b.right + 1 || rect.top < b.top - 1 || rect.bottom > b.bottom + 1) {
      report.findings.push('outside-box');
    }
  }
  if (rect.left < TITLE_SAFE.left || rect.right > TITLE_SAFE.right
    || rect.top < TITLE_SAFE.top || rect.bottom > TITLE_SAFE.bottom) {
    report.findings.push('outside-safe-area');
  }

  // THE BOUNDING-BOX SCREEN comes before the contrast read, because it decides what the
  // "surface" even is. Two shapes of the same defect on a transparent-backed mark:
  //
  //   - `mark-own-background`: the img ELEMENT paints its own background - the mark's
  //     transparency is defeated at the source, margin zero. Always a box, never a design.
  //   - `bounding-box-well`: the nearest painted ancestor hugs the mark on every side
  //     (within WELL_HUG_RATIO of the painted height). The same surface EXTENDED past that
  //     on any side - joining a panel, running out to an edge - is integration, which the
  //     owner praised on the same tone in the same round.
  if (probe.backing === 'transparent') {
    const ownBg = parseColor(style.backgroundColor);
    if (ownBg && ownBg.alpha >= 0.2) report.findings.push('mark-own-background');
  }

  // Ink contrast, from the DOM rather than the pixels: the first ancestor painting an opaque
  // enough background is the surface the ink composites onto. Honest limit: a gradient or
  // image surface, or bare footage, is reported rather than guessed.
  let surfaceLum: number | null = null;
  let surfaceDesc = '';
  let surfaceEl: Element | null = null;
  for (let p = img.parentElement; p && p !== doc.body; p = p.parentElement) {
    const ps = (win as Window).getComputedStyle(p);
    if (ps.backgroundImage && ps.backgroundImage !== 'none') {
      surfaceDesc = 'gradient-or-image';
      surfaceEl = p;
      break;
    }
    const bg = parseColor(ps.backgroundColor);
    if (bg && bg.alpha >= 0.5) {
      surfaceLum = relativeLuminance(bg.rgb);
      surfaceDesc = ps.backgroundColor;
      surfaceEl = p;
      break;
    }
  }
  if (probe.backing === 'transparent' && surfaceEl
    && !report.findings.includes('mark-own-background')) {
    const s = surfaceEl.getBoundingClientRect();
    const hug = WELL_HUG_RATIO * paintedH;
    const margins = [rect.left - s.left, s.right - rect.right, rect.top - s.top, s.bottom - rect.bottom];
    if (margins.every((m) => m <= hug)) {
      report.findings.push('bounding-box-well');
      report.notes.push(`well hugs the mark (margins ${margins.map((m) => Math.round(m)).join('/')}px`
        + ` vs ${Math.round(hug)}px allowed) - a surface should be a compositional element`);
    }
  }
  const floor = probe.backing === 'own-field' ? MARK_FIELD_SEPARATION_FLOOR : MARK_INK_CONTRAST_FLOOR;
  if (surfaceLum === null) {
    report.surface = surfaceDesc || 'none-found (over footage)';
    report.notes.push(probe.backing === 'own-field'
      ? 'own-field mark - reads on any surface'
      : 'no solid surface behind the mark - ink contrast is footage-dependent; read the frame');
  } else {
    // For an own-field mark the probe's "ink" already includes its own background, which is
    // exactly the tone that has to separate from the surface (the audit's field-separation).
    const ink = probe.inkLuminance;
    const ratio = (Math.max(ink, surfaceLum) + 0.05) / (Math.min(ink, surfaceLum) + 0.05);
    report.inkRatio = Math.round(ratio * 100) / 100;
    report.surface = surfaceDesc;
    if (ratio < floor) {
      report.findings.push(probe.backing === 'own-field' ? 'field-separation' : 'ink-contrast');
    }
  }

  return report;
}

/** The slot's animatable state at one virtual-clock sample - the runner reads it per entrance
 *  frame; "did it move at all" is derived, "was it meaningful" stays the human's question. */
export function markMotionState(doc: Document, fieldId: string): { opacity: number; transform: string } | null {
  const el = doc.getElementById(fieldId);
  if (!el) return null;
  const win = doc.defaultView;
  if (!win) return null;
  const style = win.getComputedStyle(el);
  // The slot may animate through a masked WRAPPER rather than on the img itself - fold the
  // ancestors' opacity/transform in, up to the design root, so wrapper motion still counts.
  let opacity = parseFloat(style.opacity);
  const transforms: string[] = [style.transform !== 'none' ? style.transform : ''];
  for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
    const ps = win.getComputedStyle(p);
    opacity *= parseFloat(ps.opacity) || 1;
    if (ps.transform && ps.transform !== 'none') transforms.push(ps.transform);
  }
  return { opacity: Math.round(opacity * 1000) / 1000, transform: transforms.filter(Boolean).join('|') };
}
