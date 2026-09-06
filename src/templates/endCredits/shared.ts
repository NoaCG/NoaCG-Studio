// End-credits scaffolding. Credits are data-driven: ONE textarea field (f0) holds the whole
// credit list — a line ending in a colon is a role, every line beneath it is one of that
// role's names, "# Heading" opens a department, a blank line starts a new section — and f1
// holds the year/copyright line. The template's JS parses that text into rows at runtime, so
// the whole list is pasted and edited in the playout client, with no field per person and no
// code touched. The full rule set is on parseCredits below, and in docs/END_CREDITS.md.
//
// Structure contract:
//   <div class="credits">                 root — positioned by zone; opacity:0 until play()
//     <div class="credits-box">           the viewport (overflow hidden); presets fade this
//       <div id="credits-track">          rows injected by rebuildCredits()
//     </div>
//     hidden #f0 / #f1 sources SPX writes into (and #f2 when the design takes a logo)
//   </div>
// Every track ends with the .credits-end block: the year, and the mark if the design takes one.
//
// The logo is a VARIANT CAPABILITY, not a category fixture (`TemplateVariant.logo`, resolved
// into `o.logoEnabled`). A design that declares 'none' emits no f2 field, no hidden source and
// no logo lookup — the operator's control page then shows exactly the fields the graphic can
// actually use. renderEndBlock's second argument is `null` for the whole life of such a design.

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type AnimPresetId,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  dataSourceCss,
  documentHtml,
  ESCAPE_HTML_JS,
  maskImageCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  zoneCssText,
} from '../shared/base';
import type { PresetConfig } from '../lowerThirds/animPresets';
import type { AnimData } from '../../blocks/animData';
import { convertToDataRegion } from '../shared/standard';
import { creditsPresetById } from './creditsPresets';
import { creditsMotionJs } from './creditsMotion';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface CreditsDesign {
  /** Inner HTML of .credits — must contain .credits-box > #credits-track. */
  html: string;
  /** Variant CSS (.credits-box sizing, row styles, end-block styles). */
  css: string;
  /**
   * JS defining renderCreditRow(entry) and renderEndBlock(yearHtml, logoSrc) — the
   * variant's row markup. `logoSrc` is the picked image path, or null; a design whose variant
   * declares `logo: 'none'` never receives anything else, so it should not draw a placeholder
   * slot for a field it does not have. entry is one of
   *   { type: 'credit',  role, name }   one role paired with one name
   *   { type: 'heading', text }         a department heading
   *   { type: 'entry',   text }         a line belonging to no role (a name on a wall)
   * A builder must answer all three; see parseCredits in the runtime below.
   *
   * It may ALSO define renderCreditGroup(group) for `{ type: 'group', role, names[] }` — one
   * role and every name credited with it. That is the shape the parser actually produces, and
   * the shape a design needs to lay out five camera operators under one "Camera:", or to put a
   * role in a left column beside a stack of names. A design without one is served the group
   * flattened into the three row kinds above (creditGroupRows), so it keeps working unchanged.
   */
  rowBuilderJs: string;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface CreditsMeta {
  name: string;
  description: string;
  uicolor: string;
}

/** Paint the whole programme behind every ending/list design. */
function creditsBackgroundCss(family: TemplateVariant['styleTag']): string {
  const familyLight: Record<TemplateVariant['styleTag'], string> = {
    minimal: `radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.025), transparent 48%)`,
    editorial: `linear-gradient(90deg, transparent 0 9%, color-mix(in srgb, var(--accent) 25%, transparent) 9% 9.1%, transparent 9.1%),
    radial-gradient(circle at 74% 20%, rgba(255, 255, 255, 0.065), transparent 38%)`,
    cinematic: `linear-gradient(180deg, rgba(0, 0, 0, 0.78), transparent 24% 72%, rgba(0, 0, 0, 0.82)),
    radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 54%)`,
    sport: `linear-gradient(118deg, transparent 0 60%, color-mix(in srgb, var(--accent) 12%, transparent) 60% 74%, transparent 74%),
    linear-gradient(138deg, rgba(255, 255, 255, 0.04), transparent 38%)`,
    glass: `radial-gradient(circle at 22% 22%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 36%),
    radial-gradient(circle at 78% 74%, rgba(255, 255, 255, 0.08), transparent 40%)`,
    noacg: `radial-gradient(circle at 76% 26%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
    linear-gradient(126deg, transparent 0 64%, rgba(246, 166, 35, 0.05) 64% 64.25%, transparent 64.25%)`,
  };

  return `/* Opaque programme background - credits are an ending scene, not a floating card. */
.credits-background {
  position: absolute;              /* fills the output frame */
  inset: 0;                        /* edge to edge */
  overflow: hidden;                /* ambient light stays inside the programme */
  background-color: #070a0f;       /* guaranteed opaque neutral base */
  background-image: ${familyLight[family]};  /* one family-specific light treatment */
  pointer-events: none;            /* decorative only */
  will-change: transform, opacity; /* entrance and exit fade this layer */
}

.credits-ambient {
  position: absolute;              /* a soft light pool behind the list */
  inset: 4%;                       /* transform-safe inset keeps the idle field on canvas */
  background: radial-gradient(circle at 8% 84%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 66%);
  filter: blur(calc(42px * var(--scale)));  /* atmospheric, not a graphic shape */
  opacity: 0.7;                    /* restrained under long-form reading */
  will-change: transform;          /* the idle drift is transform-only */
}

.credits-grid {
  position: absolute;              /* full-frame structural texture */
  inset: 0;                        /* edge to edge */
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: calc(120px * var(--scale)) calc(120px * var(--scale));  /* slow visual rhythm */
  ${maskImageCss('linear-gradient(90deg, #000, transparent 74%)', 'texture stays quieter by the list edge')}
  opacity: ${family === 'sport' || family === 'noacg' ? '0.62' : '0.3'};  /* stronger for broadcast-control families */
}`;
}

/** The shared runtime: parse the credits text and rebuild the track (outside the markers). */
function creditsRuntimeJs(name: string, animationBlock: string, hasLogo: boolean): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

${ESCAPE_HTML_JS}

// parseCredits(text): the whole credit list is ONE pasted block of plain text, and there is
// one mark to learn — A COLON ENDS A ROLE. Everything else is a name.
//
//   Camera:              a ROLE. Every line beneath it, until the next role, is one of the
//   Jonas Berg           people credited with it. This is the whole reason the parser groups:
//   Lena Fors            a show has five camera operators under one "Camera:", and pairing
//   Petri Salo           each name with its own repeated role label is not how credits read.
//
//   Director: Alex Rivera     the same thing inline, for a role with a single name.
//   Director <TAB> Alex       what a paste out of a Google Doc table or a spreadsheet is.
//   Director | Alex           the original separator — still read, so older lists still work.
//   # PRODUCTION              a department heading, above a run of roles. A heading is MARKED
//                             or it is not a heading; nothing is promoted to one by position.
//   Alex Rivera               anything else is a NAME: it joins the role above it, or stands
//                             on its own when there is no role above it.
//   (blank line)              starts the next section.
//
// A semicolon is accepted wherever a colon is, because that is the mark other template
// systems used, and misremembering which one should not cost anybody an evening.
//
// Nothing is required. A list pasted with no marks at all reads as plain names and renders as
// a clean column — that floor is deliberate, because the first thing anyone does is paste.
//
// Every value here is escaped ON THE WAY OUT of the parser, because the row builders below
// concatenate it into innerHTML. Escaping at this ONE boundary is what makes the design's own
// renderCreditRow() safe to rewrite without having to remember the rule.

// The longest text accepted BEFORE a colon as a role label. Roles are short; sentences are
// not. Without this, "And now the moment we have all been waiting for:" becomes a job title.
var ROLE_LABEL_MAX = 48;

function parseCredits(text) {
  var sections = [];
  var current = [];        // the entries of the section being read
  var group = null;        // the open { type:'group', role, names } that a bare name joins

  function pushSection() {
    if (current.length) { sections.push(current); current = []; }
    group = null;                          // a section break also closes the open role
  }
  function openGroup(role) {
    group = { type: 'group', role: escapeHtml(role.trim()), names: [] };
    current.push(group);
  }

  text.split('\\n').forEach(function (raw) {
    var line = raw.trim();

    if (line === '') { pushSection(); return; }          // blank line -> new section

    if (line.charAt(0) === '#') {                        // "# PRODUCTION" -> department heading
      group = null;                                      // a heading closes the role above it
      current.push({ type: 'heading', text: escapeHtml(line.slice(1).trim()) });
      return;
    }

    // "Role | Name" or "Role<TAB>Name" — an explicit separator, so no length guard applies:
    // the operator has said outright which half is which.
    var split = line.split(/\\t|\\|/);
    if (split.length >= 2) {
      openGroup(split[0]);
      group.names.push(escapeHtml(split.slice(1).join(' ').trim()));
      return;
    }

    // The colon rule, in ONE branch: text before the colon is the role, whatever follows it on
    // the same line is that role's first name. "Camera:" simply has nothing after it, which is
    // what leaves the group open for the names on the lines beneath.
    var mark = line.search(/[:;]/);
    if (mark > 0 && mark <= ROLE_LABEL_MAX) {
      openGroup(line.slice(0, mark));
      var inlineName = line.slice(mark + 1).trim();
      if (inlineName) group.names.push(escapeHtml(inlineName));
      return;
    }

    // Anything else is a name: it joins the role above it, or stands alone when there is none.
    // Nothing here promotes a line to a heading on POSITION. An earlier version made the line
    // that opened a section into that section's heading, which meant the sentence almost every
    // credit roll ends on — "Special thanks to everyone who made this show possible" — was set
    // in accent caps at kicker size. A heading is marked or it is not a heading.
    if (group) group.names.push(escapeHtml(line));
    else current.push({ type: 'entry', text: escapeHtml(line) });
  });
  pushSection();
  return sections;
}

// creditGroupRows(group): the same group said in the ORIGINAL row vocabulary, for a design
// that has no renderCreditGroup(). The role and its first name become the credit row that
// design already draws; the remaining names follow as plain entries, which is what a column of
// names under one role looks like anyway. A role with no names at all is a heading.
function creditGroupRows(group) {
  if (group.names.length === 0) return [{ type: 'heading', text: group.role }];
  return group.names.map(function (name, i) {
    return i === 0
      ? { type: 'credit', role: group.role, name: name }
      : { type: 'entry', text: name };
  });
}

// rebuildCredits(): re-render the track from the hidden #f0 / #f1 / #f2 sources.
function rebuildCredits() {
  var track = document.getElementById('credits-track');
  var text = document.getElementById('f0').textContent;
  var year = document.getElementById('f1').textContent;
${hasLogo
      ? `  // The end-of-credits logo is the image field f2 — a path like "images/logo.png".
  // Empty means "no logo picked yet": the design shows its styled placeholder instead.
  var logo = document.getElementById('f2').textContent.trim() || null;`
      : `  // This design takes no logo (its variant declares logo: 'none'), so there is no f2
  // field to read and the end block is built without a mark.
  var logo = null;`}
  var html = '';
  parseCredits(text).forEach(function (section) {
    html += '<div class="credits-page">';     // one block per section (pages preset uses these)
    section.forEach(function (entry) {
      if (entry.type !== 'group') { html += renderCreditRow(entry); return; }
      // A design that draws GROUPS is handed the role and all of its names at once — the only
      // way "Camera:" over five names can lay out as one block, and the only way a two-column
      // design can put one role beside a stack of names. Every other design is served the same
      // group flattened into the row vocabulary it already speaks.
      if (typeof renderCreditGroup === 'function') { html += renderCreditGroup(entry); return; }
      creditGroupRows(entry).forEach(function (row) { html += renderCreditRow(row); });
    });
    html += '</div>';
  });
  // Both escaped: the year is written as markup and the logo path is written INTO an
  // src="..." attribute, so an unescaped quote in either would break out of it.
  html += renderEndBlock(escapeHtml(year), logo ? escapeHtml(logo) : null);
  track.innerHTML = html;
  fitBoardToFrame();               // a board re-fits itself to the frame after every rebuild
}

// fitBoardToFrame(): the price a BOARD pays for showing everything at once.
//
// A roll or a crawl can carry any amount of content because it travels past a fixed window.
// A board cannot: every line is on screen, so a long enough list grows past the frame and the
// last rows simply fall off the bottom, silently. That is the worst possible failure — the
// operator sees a full-looking board and never learns that three names are missing.
//
// So a board shrinks to fit instead. Every dimension in these designs is authored as
// calc(Npx * var(--scale)), which means ONE custom property scales the whole thing — no
// transform, so it can never fight the entrance the preset tweens onto the same element.
// Two passes, because shrinking narrows the box too and text can re-wrap.
//
// Only designs that mark themselves .credits-board opt in; a roll must never be shrunk.
function fitBoardToFrame() {
  var root = document.querySelector('.credits');
  var box = document.querySelector('.credits-box');
  if (!root || !box || !box.classList.contains('credits-board')) return;

  root.style.removeProperty('--scale');          // always measure at the authored size
  var base = parseFloat(getComputedStyle(root).getPropertyValue('--scale')) || 1;
  var maxHeight = document.documentElement.clientHeight * 0.92;   // inside the safe area
  var maxWidth = document.documentElement.clientWidth * 0.92;

  for (var pass = 0; pass < 2; pass++) {
    var height = box.scrollHeight;
    var width = box.scrollWidth;
    if (height <= maxHeight && width <= maxWidth) return;         // already fits
    var ratio = Math.min(maxHeight / height, maxWidth / width);
    var current = parseFloat(root.style.getPropertyValue('--scale')) || base;
    root.style.setProperty('--scale', (current * ratio).toFixed(3));
  }
}

// update(data): SPX sends field values as JSON; write them into the hidden sources,
// then rebuild the visible rows.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  rebuildCredits();
}

// play(): rebuild (fresh measurements), then run the motion.
function play() {
  gsap.killTweensOf('*');
  rebuildCredits();
  buildInTimeline();
}

// stop(): take the credits off air.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance one step along the default path. This design ships
// single-step, so it normally does nothing; it still funnels to the interpreter so a
// template that GROWS a step (or a state machine) stays drivable through the SPX contract.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

// Render once on load so the preview shows content before the first update().
// This file loads in <head>, before the credit elements exist — wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rebuildCredits);
} else {
  rebuildCredits();               // DOM already parsed (e.g. an inline preview build)
}
// A DOM-ready measurement measures the FALLBACK typeface; re-fit once the real one swaps in,
// or a board sized against Arial overflows the moment its own face arrives.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBoardToFrame);

${animationBlock}
`;
}

// The fallback list, written the way the field is meant to be written: roles end in a colon,
// and a role that credits several people simply has several names under it.
const CREDITS_SAMPLE = [
  '# PRODUCTION',
  'Director: Alex Rivera',
  'Producer: Sam Chen',
  '',
  '# CAMERA',
  'Director of Photography: Maria Santos',
  'Camera Operators:',
  'Jonas Berg',
  'Lena Fors',
  'Petri Salo',
  '',
  'Special thanks to everyone who made this show possible',
].join('\n');

/** The operator speed field's default, in percent of the design's authored pace. */
const SPEED_DEFAULT = '100';

/**
 * What the speed field is CALLED, per motion preset, and which presets have one at all.
 * The word has to match what the operator sees happen: a roll and a reel scroll, a crawl
 * crawls, and a one-pager swap does not move at all, so its speed is the reading time it
 * allows each page. The static board is absent on purpose: nothing there has a speed.
 */
const SPEED_FIELD_TITLE: Partial<Record<AnimPresetId, string>> = {
  'credits-roll': 'Scroll speed (%)',
  'credits-loop': 'Scroll speed (%)',
  'credits-crawl': 'Crawl speed (%)',
  'credits-pages': 'Page speed (%)',
};

/** Build the complete end-credits SpxTemplate. */
export function assembleCredits(meta: CreditsMeta, design: CreditsDesign, o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
  /** The variant's family selects the programme background's shape language. */
  family: TemplateVariant['styleTag'] = 'minimal',
): SpxTemplate {
  const font = resolveHeadingFont(o);
  const scale = computeScale(o);
  const backgroundCss = creditsBackgroundCss(family);

  // Credits fields: the multi-line credit list, the year line, and — only when the design
  // takes one — the end-block logo (an SPX image field; the operator picks a file from the
  // project's images/ folder). A design declaring logo: 'none' gets two fields, not three:
  // an operator control page must never offer a field the graphic cannot draw.
  const creditsText = o.lines[0]?.sample || CREDITS_SAMPLE;
  const yearText = o.lines[1]?.sample || '© 2026 Your Production';
  const hasLogo = o.logoEnabled;
  const logoPath = o.logoAssetPath ?? '';
  const fields: SpxField[] = [
    { field: 'f0', ftype: 'textarea', title: o.lines[0]?.title || 'Credits', value: creditsText },
    { field: 'f1', ftype: 'textfield', title: o.lines[1]?.title || 'Year / copyright', value: yearText },
    ...(hasLogo
      ? [{ field: 'f2', ftype: 'filelist', title: 'Logo', value: logoPath, assetfolder: './images/', extension: 'png' } as SpxField]
      : []),
  ];

  // The SPEED field, the operator's rather than the author's (owner walk 2026-08-28: "anything with
  // scrolling graphics should have a speed setting in the control panel"). A roll has to fit
  // whatever is under it, and that is decided at the desk with the graphic already on air.
  //
  // A PERCENTAGE of the pace the design ships at, defaulted to 100, so an untouched graphic
  // plays exactly as it always did and there is one obvious number to come back to. It is
  // appended LAST rather than slotted before the logo, so the logo keeps the id (f2) every
  // template that already exists uses for it. Input only: creditsSpeed() reads it and nothing
  // draws it, so it lives in a hidden holder like every other input-only value.
  //
  // The static board gets NO speed field. Nothing moves there, and an operator control page
  // must never offer a field the graphic cannot use: the same rule that makes the logo field
  // a variant capability rather than a category fixture.
  const speedTitle = SPEED_FIELD_TITLE[o.animation.presetId];
  const speedField = speedTitle ? `f${fields.length}` : null;
  if (speedField && speedTitle) {
    fields.push({ field: speedField, ftype: 'number', title: speedTitle, value: SPEED_DEFAULT });
  }

  const settings = baseSettings(meta, o, { steps: '1', playlayer: '4', webplayout: '4' });

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- ${meta.name}. Rows are built by rebuildCredits() from the hidden sources below. -->
  <div class="credits credits--${family}">
    <!-- Full-frame programme background. Ending scenes never float on transparency. -->
    <div class="credits-background" aria-hidden="true">
      <div class="credits-ambient"></div>
      <div class="credits-grid"></div>
    </div>
    <div class="credits-content">
${design.html}
    </div>
    <!-- Hidden data sources — SPX writes the field values here; JS renders them. -->
    <div id="f0" class="noacg-data-source">${creditsText}</div>
    <div id="f1" class="noacg-data-source">${yearText}</div>${hasLogo ? `
    <div id="f2" class="noacg-data-source">${logoPath}</div>` : ''}${speedField ? `
    <!-- ${speedField}: how fast this plays, as a percentage of the design's own pace.
         100 = as designed · 150 = half again as fast · 60 = a slow, ceremonial read.
         Input only: creditsSpeed() reads it, nothing ever draws it. -->
    <div id="${speedField}" class="noacg-data-source">${SPEED_DEFAULT}</div>` : ''}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: `${backgroundCss}\n${design.css}` })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.credits {
  position: absolute;
  left: 0;                         /* full-frame endings ignore anchor zones */
  top: 0;                          /* begin at the programme origin */
  width: ${o.resolution.width}px;  /* paint every horizontal pixel */
  height: ${o.resolution.height}px; /* paint every vertical pixel */
  overflow: hidden;                /* content and light stay inside the programme */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── Design ── */
.credits-content {
  position: absolute;              /* the list still honours its chosen safe-area zone */
${zoneCssText(o.zone, o.nudge, o.resolution)}
  z-index: 1;                      /* content always sits above the programme background */
}

${backgroundCss}

${design.css}

${dataSourceCss}
`;

  const preset = creditsPresetById(o.animation.presetId);
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'credits',
    lineCount: 2,
    hasAccent: false,
    steps: false,
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = creditsRuntimeJs(
    meta.name,
    `${design.rowBuilderJs}\n\n${creditsMotionJs(speedField)}\n\n${preset.emit(cfg)}`,
    hasLogo,
  );

  const template: SpxTemplate = {
    name: meta.name,
    type: 'end-credits',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: [],
  };

  // Timeline v2: convert the emitted region into the NOACG_ANIM data block. The box's fade
  // becomes ordinary keyframes; the measured travel rides across as a `dynamics` segment
  // naming its builder above (docs/DYNAMIC_MOTION_SCOPE.md). The builders themselves sit
  // outside the region and are untouched by the conversion.
  return convertToDataRegion(template, refine);
}

/** The authoring API for end-credits variant modules. */
export function defineCreditsVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: CreditsMeta,
  buildDesign: (o: ResolvedOptions) => CreditsDesign,
  /** Optional animation-data refinement (a graphic type's machine rides in here). It is
   *  built per create() because a type's compiled machine depends on the resolved options. */
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  const variant: TemplateVariant = {
    ...spec,
    create(options?: WizardOptions) {
      const o = resolveOptions(variant, options);
      const design = buildDesign(o);
      // The family lives on the variant, the overrides on the design — resolved here
      // because this is the only place that holds both.
      const tokens = resolveTokens(spec.styleTag, design.tokens);
      return assembleCredits(meta, design, o, refine?.(o), tokens, spec.styleTag);
    },
  };
  return variant;
}
