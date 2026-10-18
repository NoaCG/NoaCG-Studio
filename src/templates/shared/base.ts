// The generic template assembler — everything that is the SAME for every category
// (lower thirds, info cards, end credits, tickers, …): heading font resolution
// (imported font wins over bundled), the :root style contract, the reset/canvas CSS,
// scale + max-text-width math, 9-zone positioning, the document skeleton, the SPX
// settings, and the JS runtime scaffold around the marked ANIMATION region.
//
// A category module (e.g. templates/lowerThirds/shared.ts) composes these pieces and
// adds its own structure contract (.lower-third / .info-card / .credits / .ticker) and motion module.

import { DEFAULT_SETTINGS, type Resolution, type SpxSettings } from '../../model/types';
import {
  customFontFaceCss,
  customFontStack,
  fontById,
  fontFaceCss,
  fontStack,
  numericFaceFor,
  numericFontFaceCss,
  numericFontStack,
  type BundledFont,
} from '../../model/fonts';
import { TOKEN_VARS, type ThemeTokens, tokenVarsCss } from '../../model/themeTokens';
import type { ResolvedOptions, Zone9 } from '../../model/wizard';

// ── Fonts ────────────────────────────────────────────────────────────────────

/** The heading font's @font-face rule + CSS stack (imported font wins over bundled). */
export function resolveHeadingFont(o: ResolvedOptions): { face: string; stack: string } {
  if (o.customFont) {
    return { face: customFontFaceCss(o.customFont), stack: customFontStack(o.customFont) };
  }
  const bundled = fontById(o.fontId);
  return { face: fontFaceCss(bundled), stack: fontStack(bundled) };
}

/**
 * What `--font-numeric` resolves to for THIS graphic's chosen heading font: the heading face
 * where it has tabular figures, the mono stack where it does not (model/fonts.ts).
 *
 * An imported font carries a MEASURED flag only if it was imported after the flag existed; an
 * older one reads as unknown, which `numericFontStack` treats as "cannot" - so its numbers get
 * the mono fallback rather than a face nobody checked.
 */
export function resolveNumericStack(o: ResolvedOptions): string {
  return numericFontStack(o.customFont ?? fontById(o.fontId));
}

/** The bundled face those numbers need shipped, or null when they just follow the heading. */
export function resolveNumericFace(o: ResolvedOptions): BundledFont | null {
  return numericFaceFor(o.customFont ?? fontById(o.fontId));
}

// ── Size math ────────────────────────────────────────────────────────────────

/** One knob drives size choice AND resolution scaling (designs author px at 1080p). */
export function computeScale(o: ResolvedOptions): number {
  const resFactor = Math.min(o.resolution.width / 1920, o.resolution.height / 1080);
  return +(o.sizeScale * resFactor).toFixed(3);
}

/** The auto-fit cap: boxes never grow past this — text wraps to new rows instead. */
export function computeMaxTextWidth(res: Resolution): number {
  return Math.round(Math.min(res.width * 0.42, res.width - 2 * (res.width * 0.0625)));
}

/**
 * The auto-fit cap as emitted CSS. The measure follows --scale, so resizing the graphic
 * (Style panel size, canvas corner handle) widens the box instead of wrapping the same
 * pixel width tighter — but it never grows past the frame's horizontal safe area.
 * `maxPx` is the category cap at this resolution's default scale; dividing by the
 * resolution factor normalizes it to "px per unit of --scale" (--scale already carries
 * that factor, see computeScale).
 */
export function maxTextWidthCss(res: Resolution, maxPx: number): string {
  const resFactor = Math.min(res.width / 1920, res.height / 1080);
  const perScaleUnit = Math.round(maxPx / resFactor);
  const safeMax = Math.round(res.width - 2 * (res.width * 0.0625));
  // TWO declarations, not one. CSS `min()` arrived in Chromium 79 and CasparCG's older LTS
  // builds are behind that, where a lone `min()` value makes the browser drop the whole
  // max-width and the panel stops wrapping at the safe area entirely. The static safe-area cap
  // goes first as the classic cascade fallback: an old engine keeps it and still wraps inside
  // the frame, a current one takes the scaling version on the line below. This is ONE function
  // and every category's auto-fit cap comes through it, which is why the whole catalogue clears
  // that bar from here (src/validation/engineSupport.ts is what measures it).
  return `${safeMax}px;  /* fallback: no CSS min() before Chromium 79 (older CasparCG) */
  max-width: min(calc(${perScaleUnit}px * var(--scale)), ${safeMax}px)`;
}

/**
 * THE STAGE WIDTH: a board's panel width, stated by the design instead of taken from the text.
 *
 * `width: fit-content` (the auto-fit pattern, DESIGN_LANGUAGE §5) is right for a NAMEPLATE —
 * each guest gets a strap cut to their name, which is the broadcast convention. It is wrong for
 * a BOARD, where the same panel comes back with different content all evening: measured
 * 2026-08-20 over the whole registry (`scripts/footprint-stability-sweep.mjs`), 264 of the 314
 * board designs change size with ordinary operator text, by a median of 46 to 550px. An audience
 * reads that as the graphic breaking, even when every individual frame is correct.
 *
 * A stage is the room the design was drawn for; the text lives inside it and never sets it.
 * `stagePx` is that width at 1080p and the design's own default `--scale`, so the number a
 * design declares is the number its author saw. It is emitted the same way the wrap cap is:
 * scale-aware, clamped to the horizontal safe area, and never past it.
 *
 * THE `--stage-width` MARKER IS PART OF THE CONTRACT, not decoration. It is how a machine tells a
 * staged panel from a hugging one: "declares some width" is not the same claim, and inferring the
 * stage from that alone reads a credits column (cr09) as a board it is not.
 * `e2e/catalog/footprint-stability.spec.ts` selects its targets on this property, so a design that
 * is staged is asserted and a design that is not is left alone — and it is ordinary readable CSS
 * in the user's own file either way, which is the house rule for anything we emit.
 *
 * WHERE THE SLACK GOES is emitted with it, because it is the other half of the same fix. A hugging
 * panel has no slack: the box IS the content, and the anchor zone decides where that box sits.
 * Give the same panel a stage and short content leaves room over — and if nothing says otherwise,
 * all of it piles up on one side, moving the content that used to sit on the anchor. It would be a
 * poor trade to stop the panel edges moving by moving the words instead. So the slack is
 * distributed the way the ANCHOR already reads: a left zone keeps its content left with the room
 * opening to its right, a right zone keeps it right, a centre zone splits the room evenly. At the
 * design's own content everything is exactly where it already was. (`justify-content` is inert on
 * a block box, which lays its children out by its own rules — harmless, and right the moment such
 * a design becomes a flex row.)
 *
 * WHY IT IS NOT SIMPLY THE CATEGORY'S WRAP CAP. The cap is a maximum for text, not a width for
 * furniture — every holding screen draws a panel, and handing all twenty the 70% cap as a stage
 * would repaint the category as a row of identical slabs. A design declares the width it was
 * drawn at; the cap only ever clamps it.
 */
export function stageBoxCss(res: Resolution, stagePx: number, zone: Zone9, what: string): string {
  const resFactor = Math.min(res.width / 1920, res.height / 1080);
  const perScaleUnit = Math.round(stagePx / resFactor);
  const safeMax = Math.round(res.width - 2 * (res.width * 0.0625));
  const justify = zone.endsWith('-left') ? 'flex-start' : zone.endsWith('-right') ? 'flex-end' : 'center';
  // TWO width declarations, the same doctrine as `maxTextWidthCss` above and for the same reason:
  // CSS `min()` is Chromium 79 and CasparCG's older LTS builds are behind it, where a lone
  // `min()` makes the browser drop the declaration entirely. Here that failure is worse than a
  // missing cap — the panel would fall back to `auto` and stretch — so the static width goes
  // first as the classic cascade fallback and a current engine takes the scaling line below.
  return `  --stage-width: ${perScaleUnit}px;      /* ${what} — this panel's width is the design's, never the text's */
  width: ${Math.min(perScaleUnit, safeMax)}px;  /* fallback: no CSS min() before Chromium 79 (older CasparCG) */
  width: min(calc(${perScaleUnit}px * var(--scale)), ${safeMax}px);
  box-sizing: border-box;          /* the declared width includes the panel's own padding */
  justify-content: ${justify};       /* short content leaves the room where the anchor already reads */`;
}

/**
 * A `mask-image` declaration and its prefixed twin, in that order.
 *
 * Same doctrine as the auto-fit cap above, for the same reason. The unprefixed mask shorthand
 * is Chromium 120, which is newer than EVERY embedded playout engine we ship to — OBS 30 and
 * vMix 27 render with a Chromium 103 CEF, and even CasparCG 2.4 is on 117. On all of them the
 * declaration is dropped in silence and the masked texture appears at full extent instead of
 * fading out. `-webkit-mask-image` has been supported since Chromium 1 and is still honoured by
 * current engines, so writing it first costs one line and nothing else: an old engine keeps it,
 * a current one takes the standard spelling below. The standard property stays because it is
 * the one Firefox implements, and SPX renders in the operator's own browser.
 *
 * One function, so a category that adds a mask cannot forget the twin — the failure mode is
 * invisible on every machine that develops this catalogue.
 */
export function maskImageCss(value: string, comment: string): string {
  return `-webkit-mask-image: ${value};  /* the prefixed twin: no unprefixed mask before Chromium 120 (every embedded playout engine) */
  mask-image: ${value};  /* ${comment} */`;
}

// ── Positioning: 9 zones snapped to safe areas ───────────────────────────────

export interface ZoneDecl {
  prop: string;
  value: string;
  comment: string;
}

/**
 * The full set of positioning declarations for an anchor zone (unused sides explicitly
 * reset so re-positioning an existing template fully overrides the previous zone).
 */
export function zoneDecls(zone: Zone9, nudge: { x: number; y: number }, res: Resolution): ZoneDecl[] {
  const hInset = Math.round(res.width * 0.0625); // ≈ classic 120 px side inset at 1920
  const topInset = Math.round(res.height * 0.08);
  const bottomInset = Math.round(res.height * 0.11);

  const [v, h] = zone.split('-') as ['top' | 'mid' | 'bottom', 'left' | 'center' | 'right'];
  const decls: ZoneDecl[] = [];
  const transforms: string[] = [];

  if (h === 'left') decls.push({ prop: 'left', value: `${hInset + nudge.x}px`, comment: 'inset from the left edge (safe area)' });
  if (h === 'right') decls.push({ prop: 'right', value: `${hInset - nudge.x}px`, comment: 'inset from the right edge (safe area)' });
  if (h === 'center') {
    decls.push({ prop: 'left', value: `calc(50% + ${nudge.x}px)`, comment: 'anchored to the horizontal center' });
    transforms.push('translateX(-50%)');
  }
  if (v === 'top') decls.push({ prop: 'top', value: `${topInset + nudge.y}px`, comment: 'inset from the top edge' });
  if (v === 'bottom') decls.push({ prop: 'bottom', value: `${bottomInset - nudge.y}px`, comment: 'inset from the bottom — wrapped text grows upward' });
  if (v === 'mid') {
    decls.push({ prop: 'top', value: `calc(50% + ${nudge.y}px)`, comment: 'anchored to the vertical center' });
    transforms.push('translateY(-50%)');
  }
  // Explicitly reset whatever this zone doesn't use, so zone changes fully override.
  const used = new Set(decls.map((d) => d.prop));
  for (const side of ['left', 'right', 'top', 'bottom']) {
    if (!used.has(side)) decls.push({ prop: side, value: 'auto', comment: 'not used by this anchor zone' });
  }
  decls.push({
    prop: 'transform',
    value: transforms.length > 0 ? transforms.join(' ') : 'none',
    comment: transforms.length > 0 ? 'center on the anchor point' : 'no centering needed',
  });
  const align = h === 'right' ? 'right' : h === 'center' ? 'center' : 'left';
  decls.push({ prop: 'text-align', value: align, comment: 'lines align toward the anchor edge' });
  return decls;
}

/** Pretty CSS text for the zone declarations (used in freshly generated templates). */
export function zoneCssText(zone: Zone9, nudge: { x: number; y: number }, res: Resolution): string {
  return zoneDecls(zone, nudge, res)
    // Freshly generated code omits the explicit "auto"/"none" resets for readability.
    .filter((d) => !(d.value === 'auto' || (d.prop === 'transform' && d.value === 'none')))
    .map((d) => `  ${d.prop}: ${d.value};`.padEnd(35) + `/* ${d.comment} */`)
    .join('\n');
}

// ── CSS building blocks ──────────────────────────────────────────────────────

/** The :root style contract — the variables the Style panel (and the user) retint.
 *  `opts.typeScale: false` omits the text-only knob: an imported design sizes each placed
 *  line from its own rule and reads no `--type-scale`, and the Style panel keys the "Text
 *  size" section on the var's presence — declaring it there would show a dead control.
 *
 *  `opts.tokens` + `opts.consumerCss` add the SHAPE half of the contract (model/themeTokens.ts):
 *  panel treatment, radius, shadow, accent geometry, the label face. Only the tokens the
 *  stylesheet actually reads are emitted — same reason as the `--type-scale` exception above,
 *  so a design that consumes no tokens emits exactly what it always did. */
export function rootVarsCss(
  o: ResolvedOptions,
  headingStack: string,
  scale: number,
  opts: { typeScale?: boolean; tokens?: ThemeTokens; consumerCss?: string } = {},
): string {
  const typeScaleLine =
    opts.typeScale === false
      ? ''
      : `\n  --type-scale: ${o.typeScale};                  /* text-only size multiplier (on top of --scale) */`;
  // `--font-numeric` is the one token that follows the CHOSEN typeface rather than the family,
  // so the family default is replaced here with the answer for the face actually in use.
  const tokens = opts.tokens && { ...opts.tokens, fontNumeric: resolveNumericStack(o) };
  const tokenLines = tokens && opts.consumerCss ? tokenVarsCss(tokens, opts.consumerCss) : '';
  // When that answer is a bundled SIBLING rather than the heading face, its bytes have to ship
  // too. Emitted here because this is the one place that knows the token was declared at all -
  // a design that reads no numbers gets neither the variable nor the extra font file.
  const numericFace = tokenLines.includes(TOKEN_VARS.fontNumeric) ? resolveNumericFace(o) : null;
  const numericFaceBlock =
    numericFace && !opts.consumerCss?.includes(`fonts/${numericFace.file}`)
      ? `\n\n${numericFontFaceCss(numericFace)}`
      : '';
  return `/* ── Style contract: change these variables to retint the whole graphic. ── */
:root {
  --accent: ${o.palette.accent};           /* the one accent color */
  --text-color: ${o.palette.text};          /* primary text */
  --text-dim: ${o.palette.textDim};  /* secondary text (title line) */
  --panel-bg: ${o.palette.panel};  /* the panel behind the text */
  --font-heading: ${headingStack};  /* the graphic's typeface */
  --scale: ${scale};                  /* whole-graphic size multiplier (also handles resolution) */${typeScaleLine}${tokenLines ? `\n${tokenLines}` : ''}
}${numericFaceBlock}`;
}

/** Reset + transparent canvas at the output resolution. */
export function resetCanvasCss(res: Resolution): string {
  return `/* Reset and a transparent canvas (broadcast graphics render over video). */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${res.width}px;
  height: ${res.height}px;
  overflow: hidden;                /* nothing ever scrolls on air */
  background: transparent;
  font-family: var(--font-heading);
}`;
}

// ── Document + runtime skeletons ─────────────────────────────────────────────

/** The full HTML document around a category's body markup. */
export function documentHtml(args: { title: string; definitionBlock: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${args.title}</title>

  <!-- GSAP animation library (bundled locally — no internet needed at playout). -->
  <script src="js/gsap.min.js"></script>

  <!-- Template styles and logic. -->
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>

  <!-- SPX template definition: the data fields shown to the operator. -->
  ${args.definitionBlock}
</head>
<body>
${args.body}
</body>
</html>
`;
}

/** SPX playout settings shared by generated templates. */
export function baseSettings(meta: { name: string; uicolor: string }, o: ResolvedOptions, extra?: Partial<SpxSettings>): SpxSettings {
  return {
    ...DEFAULT_SETTINGS,
    description: meta.name,
    playlayer: '7',
    webplayout: '7',
    steps: o.animation.steps && o.lines.length > 1 ? String(o.lines.length) : '1',
    uicolor: meta.uicolor,
    ...extra,
  };
}

/**
 * The speed knob, read from wherever the template keeps it. Design-owned runtime code lives
 * OUTSIDE the marked ANIMATION region, so it must never reach for the region's `animSpeed`
 * variable directly — that variable only exists in a legacy emit. This helper is the one
 * sanctioned reader (src/templates/CLAUDE.md, "Template runtime rule").
 */
export const motionSpeedJs = `// motionSpeed(): the template's speed knob. The NOACG_ANIM data block owns it; a legacy
// animSpeed variable is honored too, and hand-written animation code defaults to 1.
function motionSpeed() {
  if (typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.speed) return NOACG_ANIM.speed;
  if (typeof animSpeed !== 'undefined' && animSpeed) return animSpeed;
  return 1;
}`;

// ── Hidden data sources ────────────────────────────────────────────────────────

/**
 * The class that hides a data-source holder — a `<div id="fN">` SPX writes into and the
 * runtime reads, never drawn on screen (a countdown's minutes, a ticker's item list, a
 * chart's data lines, a quiz's correct letter, a clock's UTC offset).
 *
 * Hide it with the STYLESHEET rule below, deliberately NOT an inline `style="display: none"`:
 * the editor returns a graphic to its resting state by clearing GSAP's inline properties across
 * the whole root subtree (the editor's reset, components/editorFoundation/runtime.ts), which wipes the style
 * attribute — and an inline-hidden holder then comes back VISIBLE on the canvas. A CSS rule
 * cannot be cleared that way, so the holder stays hidden in the editor, in SPX, and in every
 * export. This is the general form of cornerBug/statusParts.ts STATUS_SOURCE_CSS.
 */
export const DATA_SOURCE_CLASS = 'noacg-data-source';

/** The stylesheet rule that hides every data-source holder. Emit it once per template that
 *  carries one — see DATA_SOURCE_CLASS for why it is a rule and never an inline style. */
export const dataSourceCss = `/* Hidden data sources — holders SPX writes into and the runtime reads, never drawn.
   The rule lives in the stylesheet on purpose: an inline display:none would be wiped by the
   editor's entrance reset (it clears inline props) and the value would appear on screen. */
.${DATA_SOURCE_CLASS} {
  display: none;                   /* input only: written by SPX, read by JS, never rendered */
}`;

/**
 * The teachable field writer shared by every category's update(): text into text elements,
 * image PATHS into <img id="fN"> elements (SPX image fields — ftype "filelist" — send the
 * picked file's path, e.g. "images/logo.png").
 */
export const setFieldValueJs = `// Write one field value into its element. Text fields get plain
// text (operator input never runs as HTML); an <img id="fN"> gets the value as its image path.
function setFieldValue(el, value) {
  if (el.tagName === 'IMG') {
    if (value) { el.src = value; el.style.display = ''; }
    else { el.removeAttribute('src'); el.style.display = 'none'; }  // empty = show the design's placeholder
    // The img's parent gets .has-image so the CSS can hide a placeholder mark, resize, etc.
    if (el.parentNode && el.parentNode.classList) el.parentNode.classList.toggle('has-image', !!value);
  } else if (el.tagName === 'image') {
    // An SVG picture slot (an imported design's own <image> layer): swap its href. Empty
    // restores the picture the designer drew, so an untouched field changes nothing.
    if (!el.hasAttribute('data-orig-href')) el.setAttribute('data-orig-href', el.getAttribute('href') || '');
    el.setAttribute('href', value || el.getAttribute('data-orig-href'));
  } else {
    el.textContent = value;
  }
}`;

/**
 * The escapeHtml helper every rebuild runtime needs. A category that renders operator text
 * through `innerHTML` (a ticker's items, a credits roll's rows, a table's cells) MUST run the
 * text through this first: field values are not always typed by the operator - a show-chat
 * feed writes what a member of the audience sent in - so unescaped markup in a field would run
 * as code inside the graphic.
 */
export const ESCAPE_HTML_JS = `// escapeHtml(): rows below are built with innerHTML — operator text is escaped first, so
// input like "Team <3" reads as text and never runs as markup.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}`;

/** The JS runtime scaffold: SPX entry points around the marked ANIMATION region. */
/**
 *  adds the one line a staged design needs in update(). It is CONDITIONAL because a
 * hugging design never emits the runtime it would call, and an unconditional guard put a dead
 * line into 176 templates that had no business changing - the byte-identical-code baseline
 * exists to catch exactly that kind of quiet churn in the user's own file.
 */
export function runtimeJs(name: string, animationBlock: string, staged = false): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

// update(data): SPX sends field values as JSON, e.g. {"f0":"Ada","f1":"Engineer"}.
// Each value is written into the element whose id matches the field name (f0 -> id="f0").
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  // Designs that fit text to a fixed slot re-measure here (no-op otherwise).
  if (typeof fitPlacedText === 'function') fitPlacedText();${staged ? `
  // …and a staged design holds its lines to the rows it was drawn for.
  fitStagedText();` : ''}
}

// play(): take the graphic on air — run the entrance timeline.
function play() {
  gsap.killTweensOf('*');          // stop any animation that is still running
  buildInTimeline();
}

// stop(): take the graphic off air — run the exit timeline.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance the graphic one step along its default path. Returns the
// timeline it started, or null when there is nothing to advance to (a single-step graphic, or
// a state machine that refused the move) — a playout wrapper must not move its own step
// pointer past a refusal.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

${animationBlock}
`;
}
