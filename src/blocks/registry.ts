// Building-block registry. Each block is a pure, deterministic transform that edits the
// visible HTML/CSS/JS so the user learns from the result. Blocks also append structured
// layer metadata to the template model (see edit.ts#addLayer). Blocks are grouped by category.
//
// Field convention: each data field "fN" maps to one element with id="fN" — SPX writes the
// field value straight into it. No hidden holders, no "_gfx" suffix.

import {
  addFieldToDefinition,
  addLayer,
  animationSelector,
  appendCss,
  applyAnimationClass,
  insertGraphicHtml,
  insertIntoFunction,
  nextFieldId,
  positionForNewElement,
  textCssRule,
} from './edit';
import type { Ftype, SpxField, SpxTemplate } from '../model/types';
import { NUMERIC_FIGURES } from '../templates/shared/numerals';

/** The editor tab a block wants shown after it applies (store/templateStore re-exports it). */
export type EditorTab = 'html' | 'css' | 'js';

export interface BuildingBlock {
  id: string;
  label: string;
  category: 'Structure' | 'Elements' | 'Fields' | 'Animation';
  description: string;
  /** Hierarchical menu location, e.g. ['Lower third'] or ['Animation','GSAP']. Derived from
   *  category when omitted. (It named a `BuildingBlockMenu` component until 2026-08-29; there
   *  has been no Blocks tab for some time - see this directory's AGENTS.md.) */
  path?: string[];
  /** Editor tab to jump to after applying, so the change is visible. Derived when omitted. */
  primaryTab?: EditorTab;
  /** Extra search keywords. */
  keywords?: string[];
  apply: (template: SpxTemplate) => SpxTemplate;
}

/**
 * Add a data field bound to a single visible element (id="fN"), positioned in the lower-left
 * action-safe area and styled with the rich, commented broadcast-text CSS. Shared by the
 * Text/Name/Title/Number blocks so every inserted field lands somewhere sensible, fully styled.
 */
function addStyledTextField(
  template: SpxTemplate,
  opts: { title: string; value: string; fontSize: number; fontWeight?: number; color?: string; ftype?: Ftype; cssExtra?: string },
): SpxTemplate {
  const id = nextFieldId(template.fields);
  const pos = positionForNewElement(template);
  let next = addFieldToDefinition(template, {
    field: id,
    ftype: opts.ftype ?? 'textfield',
    title: opts.title,
    value: opts.value,
  });
  const visible = `  <!-- ${opts.title} (${id}) — SPX writes field ${id} into this element. -->
  <div id="${id}" data-gfx>${opts.value}</div>`;
  next = { ...next, html: insertGraphicHtml(next.html, visible) };
  next = {
    ...next,
    css: appendCss(
      next.css,
      `${opts.title} (${id})`,
      textCssRule(`#${id}`, {
        left: pos.left,
        bottom: pos.bottom,
        fontSize: opts.fontSize,
        fontWeight: opts.fontWeight,
        color: opts.color,
        extra: opts.cssExtra,
      }),
    ),
  };
  next = addLayer(next, {
    id,
    type: 'text',
    label: opts.title,
    fieldId: id,
    text: opts.value,
    styles: { color: opts.color ?? '#ffffff', fontSize: `${opts.fontSize}px` },
  });
  return next;
}

/** Add a dropdown data field (operator picks from a list) bound to a positioned element. */
function addDropdownField(template: SpxTemplate): SpxTemplate {
  const id = nextFieldId(template.fields);
  const pos = positionForNewElement(template);
  const field: SpxField = {
    field: id,
    ftype: 'dropdown',
    title: `Choice ${id}`,
    value: 'one',
    items: [
      { text: 'Option one', value: 'one' },
      { text: 'Option two', value: 'two' },
      { text: 'Option three', value: 'three' },
    ],
  };
  let next = addFieldToDefinition(template, field);
  const visible = `  <!-- Dropdown field ${id} (operator picks from a list; value goes into id="${id}") -->
  <div id="${id}" data-gfx>one</div>`;
  next = { ...next, html: insertGraphicHtml(next.html, visible) };
  next = { ...next, css: appendCss(next.css, `Dropdown field ${id}`, textCssRule(`#${id}`, { left: pos.left, bottom: pos.bottom, fontSize: 32 })) };
  next = addLayer(next, { id, type: 'text', label: `Choice ${id}`, fieldId: id, text: 'one', styles: { color: '#ffffff', fontSize: '32px' } });
  return next;
}

export const BUILDING_BLOCKS: BuildingBlock[] = [
  // ----- Lower third (the most common starting point) -----
  {
    id: 'lt-name-title',
    label: 'Name + title',
    category: 'Structure',
    path: ['Lower third'],
    primaryTab: 'css',
    keywords: ['lower third', 'name', 'title', 'strap', 'nameplate'],
    description: 'A complete lower third: name + title with a bar and accent strip.',
    apply: (t) => {
      const idName = nextFieldId(t.fields);
      let next = addFieldToDefinition(t, { field: idName, ftype: 'textfield', title: 'Name', value: 'Firstname Lastname' });
      const idTitle = nextFieldId(next.fields);
      next = addFieldToDefinition(next, { field: idTitle, ftype: 'textfield', title: 'Title', value: 'Title / role' });
      const html = `  <!-- Lower third — name + title. SPX writes ${idName}/${idTitle} into the matching ids. -->
  <div class="lower3" data-gfx>
    <div class="lower3-bar">
      <div id="${idName}" class="lower3-name">Firstname Lastname</div>
      <div id="${idTitle}" class="lower3-title">Title / role</div>
    </div>
  </div>`;
      next = { ...next, html: insertGraphicHtml(next.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Lower third (block)',
          `/* Lower third — positioned in the lower-left action-safe area. */
.lower3 {
  position: absolute;          /* place freely on the canvas */
  left: 120px;                 /* inset from the left edge */
  bottom: 160px;               /* inset from the bottom edge */
}
/* The bar behind the text. */
.lower3-bar {
  display: inline-block;       /* shrink the bar to fit its text */
  padding: 14px 28px;          /* space inside the bar */
  background: linear-gradient(90deg, #0a3d62, #1e6fb8);  /* bar colour (try a solid colour or a brand var) */
  border-left: 8px solid #ffd32a;            /* accent strip — your brand colour */
  border-radius: 2px;          /* slightly rounded corners */
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);  /* lift the bar off the video */
}
/* Name — the headline line. */
.lower3-name {
  color: #ffffff;              /* text colour */
  font-family: "Open Sans", Arial, sans-serif;
  font-size: 46px;             /* large, readable */
  font-weight: 700;            /* bold */
  line-height: 1.1;            /* line spacing */
  white-space: nowrap;         /* keep on one line */
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);  /* legibility over video */
}
/* Title — the supporting line. */
.lower3-title {
  color: #cfe3ff;              /* slightly dimmer than the name */
  font-family: "Open Sans", Arial, sans-serif;
  font-size: 26px;
  font-weight: 400;            /* normal weight */
  letter-spacing: 0.02em;      /* subtle tracking */
  margin-top: 4px;             /* gap under the name */
}`,
        ),
      };
      next = addLayer(next, { id: 'lower3', type: 'container', label: 'Lower third', styles: { position: 'absolute', left: '120px', bottom: '160px' } });
      next = addLayer(next, { id: idName, type: 'text', label: 'Name', fieldId: idName, text: 'Firstname Lastname', styles: { color: '#ffffff', fontSize: '46px', fontWeight: '700' } });
      next = addLayer(next, { id: idTitle, type: 'text', label: 'Title', fieldId: idTitle, text: 'Title / role', styles: { color: '#cfe3ff', fontSize: '26px' } });
      return next;
    },
  },
  {
    id: 'lt-name',
    label: 'Name field',
    category: 'Structure',
    path: ['Lower third'],
    primaryTab: 'css',
    keywords: ['name', 'headline', 'person'],
    description: 'A bold name line, positioned and fully styled.',
    apply: (t) => addStyledTextField(t, { title: 'Name', value: 'Firstname Lastname', fontSize: 46, fontWeight: 700 }),
  },
  {
    id: 'lt-title',
    label: 'Title field',
    category: 'Structure',
    path: ['Lower third'],
    primaryTab: 'css',
    keywords: ['title', 'role', 'subtitle'],
    description: 'A lighter subtitle / role line, positioned and styled.',
    apply: (t) => addStyledTextField(t, { title: 'Title', value: 'Title / role', fontSize: 26, fontWeight: 400, color: '#cfe3ff' }),
  },

  // ----- Layouts -----
  {
    id: 'fullscreen',
    label: 'Fullscreen layout',
    category: 'Structure',
    path: ['Layouts'],
    primaryTab: 'css',
    description: 'Centered full-frame container for titles or fullscreen graphics.',
    apply: (t) => {
      const id = nextFieldId(t.fields);
      let next = addFieldToDefinition(t, { field: id, ftype: 'textfield', title: 'Headline', value: 'Fullscreen title' });
      const html = `  <!-- Fullscreen layout -->
  <div class="fullscreen" id="fs">
    <h1 class="fs-headline" id="${id}">Fullscreen title</h1>
  </div>`;
      next = { ...next, html: insertGraphicHtml(next.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Fullscreen layout (block)',
          `.fullscreen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.fs-headline { color: #fff; font-size: 96px; font-weight: 800; text-align: center; text-shadow: 0 4px 24px rgba(0,0,0,0.5); }`,
        ),
      };
      next = addLayer(next, { id: 'fs', type: 'container', label: 'Fullscreen', styles: { position: 'absolute', inset: '0' } });
      next = addLayer(next, { id, type: 'text', label: 'Headline', fieldId: id, text: 'Fullscreen title', styles: { color: '#fff', fontSize: '96px', fontWeight: '800' } });
      return next;
    },
  },
  // There is no 'countdown' block. One lived here until 2026-08-29 and was deleted rather than
  // repaired: nothing in the product could reach it (this registry's only importer is the offline
  // AI stub, which applies `fullscreen` and nothing else), and every line of it was wrong.
  // It DECREMENTED a counter once per `setInterval` tick instead of anchoring a deadline, so it
  // drifted late on any loaded machine and lost minutes in a background tab; it read its duration
  // field once at start and ignored every later Update; and it hid that field with an inline
  // `display:none`, which the editor's entrance reset clears (src/templates/AGENTS.md - the hider
  // must be a CSS class). src/templates/shared/clock.ts is the countdown that works: deadline-
  // anchored, re-armed by `clockDataUpdated()` when its own fields change, with an optional
  // wall-clock start time. A countdown wanted here again is that runtime, not a second copy.

  // ----- Boxes & lines -----
  {
    id: 'box',
    label: 'Background box',
    category: 'Elements',
    path: ['Boxes & lines'],
    primaryTab: 'css',
    keywords: ['box', 'panel', 'background', 'card', 'rectangle'],
    description: 'A panel/box to sit behind text or other elements.',
    apply: (t) => {
      const pos = positionForNewElement(t);
      const html = `  <!-- Background box — place text or other elements in front of it. -->
  <div class="box" data-gfx></div>`;
      let next = { ...t, html: insertGraphicHtml(t.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Background box (block)',
          `.box {
  position: absolute;          /* place freely on the canvas */
  left: ${pos.left}px;
  bottom: ${pos.bottom}px;
  width: 760px;                /* box size — adjust to fit your content */
  height: 200px;
  background: rgba(10, 14, 22, 0.88);  /* panel colour (semi-transparent over video) */
  border-left: 8px solid #3aa0ff;      /* accent strip — your brand colour */
  border-radius: 4px;          /* corner rounding */
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);  /* lift the box off the video */
}`,
        ),
      };
      next = addLayer(next, { id: 'box', type: 'rect', label: 'Background box', styles: { position: 'absolute', left: `${pos.left}px`, bottom: `${pos.bottom}px` } });
      return next;
    },
  },
  {
    id: 'accent-line',
    label: 'Accent line',
    category: 'Elements',
    path: ['Boxes & lines'],
    primaryTab: 'css',
    keywords: ['line', 'rule', 'underline', 'divider', 'accent'],
    description: 'A thin horizontal accent line / rule.',
    apply: (t) => {
      const pos = positionForNewElement(t);
      const html = `  <!-- Accent line / rule. -->
  <div class="accent-line" data-gfx></div>`;
      let next = { ...t, html: insertGraphicHtml(t.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Accent line (block)',
          `.accent-line {
  position: absolute;          /* place freely on the canvas */
  left: ${pos.left}px;
  bottom: ${pos.bottom}px;
  width: 480px;                /* line length */
  height: 6px;                 /* line thickness */
  background: #ffd32a;         /* line colour — your brand colour */
  border-radius: 3px;          /* round the ends */
}`,
        ),
      };
      next = addLayer(next, { id: 'accent-line', type: 'rect', label: 'Accent line', styles: { position: 'absolute', left: `${pos.left}px`, bottom: `${pos.bottom}px` } });
      return next;
    },
  },

  // ----- Logos & images -----
  {
    id: 'logo',
    label: 'Logo image',
    category: 'Elements',
    path: ['Logos & images'],
    primaryTab: 'html',
    keywords: ['logo', 'image', 'brand'],
    description: 'An <img> logo (set the src to a file in assets/).',
    apply: (t) => {
      const html = `  <!-- Logo (upload your file in the Brand tab, then set the src). -->
  <img class="logo" id="logo" src="assets/logo.png" alt="logo" data-gfx />`;
      let next = { ...t, html: insertGraphicHtml(t.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Logo (block)',
          `.logo {
  position: absolute;          /* place freely on the canvas */
  top: 80px;                   /* distance from the top edge */
  left: 120px;                 /* distance from the left edge */
  height: 120px;               /* logo size (width scales automatically) */
}`,
        ),
      };
      next = addLayer(next, { id: 'logo', type: 'image', label: 'Logo', styles: { position: 'absolute', top: '80px', left: '120px', height: '120px' } });
      return next;
    },
  },
  {
    id: 'bug',
    label: 'Corner bug',
    category: 'Elements',
    path: ['Logos & images'],
    primaryTab: 'html',
    keywords: ['bug', 'watermark', 'corner', 'logo'],
    description: 'A small persistent logo/bug in the top-right corner.',
    apply: (t) => {
      const html = `  <!-- Corner bug (persistent on-air logo). -->
  <img class="bug" id="bug" src="assets/bug.png" alt="bug" data-gfx />`;
      let next = { ...t, html: insertGraphicHtml(t.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Corner bug (block)',
          `.bug {
  position: absolute;          /* place freely on the canvas */
  top: 48px;                   /* distance from the top edge */
  right: 48px;                 /* distance from the right edge */
  height: 90px;                /* bug size */
  opacity: 0.95;               /* 0 transparent … 1 solid */
}`,
        ),
      };
      next = addLayer(next, { id: 'bug', type: 'image', label: 'Corner bug', styles: { position: 'absolute', top: '48px', right: '48px', height: '90px' } });
      return next;
    },
  },
  {
    id: 'image-caption',
    label: 'Image + caption',
    category: 'Elements',
    path: ['Logos & images'],
    primaryTab: 'css',
    keywords: ['image', 'photo', 'caption', 'credit'],
    description: 'An image with a caption line bound to a data field.',
    apply: (t) => {
      const id = nextFieldId(t.fields);
      const pos = positionForNewElement(t);
      let next = addFieldToDefinition(t, { field: id, ftype: 'textfield', title: 'Caption', value: 'Caption text' });
      const html = `  <!-- Image + caption. SPX writes the caption (${id}) into the matching id. -->
  <figure class="img-cap" data-gfx>
    <img class="img-cap-img" src="assets/photo.jpg" alt="" />
    <figcaption id="${id}" class="img-cap-text">Caption text</figcaption>
  </figure>`;
      next = { ...next, html: insertGraphicHtml(next.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Image + caption (block)',
          `.img-cap {
  position: absolute;          /* place freely on the canvas */
  left: ${pos.left}px;
  bottom: ${pos.bottom}px;
  margin: 0;
}
.img-cap-img {
  display: block;
  width: 420px;                /* image size */
  height: auto;
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
}
.img-cap-text {
  margin-top: 10px;            /* gap under the image */
  color: #ffffff;
  font-family: "Open Sans", Arial, sans-serif;
  font-size: 24px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);  /* legibility over video */
}`,
        ),
      };
      next = addLayer(next, { id, type: 'text', label: 'Caption', fieldId: id, text: 'Caption text', styles: { color: '#ffffff', fontSize: '24px' } });
      return next;
    },
  },

  // ----- Sport -----
  {
    id: 'score-row',
    label: 'Score row',
    category: 'Elements',
    path: ['Sport'],
    primaryTab: 'css',
    keywords: ['score', 'sport', 'teams', 'scoreboard'],
    description: 'Two-team inline score strip with four fields (names + scores).',
    apply: (t) => {
      const idA = nextFieldId(t.fields);
      let next = addFieldToDefinition(t, { field: idA, ftype: 'textfield', title: 'Team A name', value: 'TEAM A' });
      const idAS = nextFieldId(next.fields);
      next = addFieldToDefinition(next, { field: idAS, ftype: 'number', title: 'Team A score', value: '0' });
      const idB = nextFieldId(next.fields);
      next = addFieldToDefinition(next, { field: idB, ftype: 'textfield', title: 'Team B name', value: 'TEAM B' });
      const idBS = nextFieldId(next.fields);
      next = addFieldToDefinition(next, { field: idBS, ftype: 'number', title: 'Team B score', value: '0' });
      const html = `  <!-- Score row (SPX writes each field into the matching id) -->
  <div class="score-row" id="score-row">
    <span class="sr-name" id="${idA}">TEAM A</span>
    <span class="sr-score" id="${idAS}">0</span>
    <span class="sr-sep">:</span>
    <span class="sr-score" id="${idBS}">0</span>
    <span class="sr-name" id="${idB}">TEAM B</span>
  </div>`;
      next = { ...next, html: insertGraphicHtml(next.html, html) };
      next = {
        ...next,
        css: appendCss(
          next.css,
          'Score row (block)',
          `.score-row {
  position: absolute;
  left: 50%;
  top: 60px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 28px;
  background: #111827;
}
.sr-name  { color: #fff; font-size: 28px; font-weight: 600; letter-spacing: 0.08em; }
.sr-score { color: #fff; font-size: 40px; font-weight: 800; font-family: var(--font-numeric); font-variant-numeric: tabular-nums; }
.sr-sep   { color: rgba(255,255,255,0.4); font-size: 32px; }`,
        ),
      };
      next = addLayer(next, { id: 'score-row', type: 'container', label: 'Score row', styles: { position: 'absolute', left: '50%', top: '60px' } });
      next = addLayer(next, { id: idA, type: 'text', label: 'Team A name', fieldId: idA, text: 'TEAM A', styles: { color: '#fff', fontSize: '28px' } });
      next = addLayer(next, { id: idAS, type: 'text', label: 'Team A score', fieldId: idAS, text: '0', styles: { color: '#fff', fontSize: '40px', fontWeight: '800' } });
      next = addLayer(next, { id: idBS, type: 'text', label: 'Team B score', fieldId: idBS, text: '0', styles: { color: '#fff', fontSize: '40px', fontWeight: '800' } });
      next = addLayer(next, { id: idB, type: 'text', label: 'Team B name', fieldId: idB, text: 'TEAM B', styles: { color: '#fff', fontSize: '28px' } });
      return next;
    },
  },

  // ----- Fields -----
  {
    id: 'text-field',
    label: 'Text data field',
    category: 'Fields',
    path: ['Text & data'],
    primaryTab: 'css',
    keywords: ['text', 'field', 'data'],
    description: 'A new f# text field, positioned and fully styled (id="fN").',
    apply: (t) => addStyledTextField(t, { title: 'Text', value: 'Sample text', fontSize: 40 }),
  },
  {
    id: 'number-field',
    label: 'Number data field',
    category: 'Fields',
    path: ['Text & data'],
    primaryTab: 'css',
    keywords: ['number', 'score', 'counter'],
    description: 'A new f# number field (e.g. a score or counter), big tabular digits.',
    apply: (t) =>
      addStyledTextField(t, {
        title: 'Number',
        value: '0',
        fontSize: 64,
        fontWeight: 800,
        ftype: 'number',
        // The block goes into ANY template, so it may land somewhere with no --font-numeric
        // declared. An unresolvable var() there leaves font-family inherited, exactly as this
        // block behaved before the token existed - no regression, and a real guarantee inside
        // a catalog design (templates/shared/numerals.ts).
        // Only the FIRST line needs indenting: NUMERIC_FIGURES already carries the two spaces
        // on its continuation line, matching the rule indentation every template uses.
        cssExtra: `  ${NUMERIC_FIGURES}`,
      }),
  },
  {
    id: 'dropdown-field',
    label: 'Dropdown data field',
    category: 'Fields',
    path: ['Text & data'],
    primaryTab: 'css',
    keywords: ['dropdown', 'select', 'choice', 'options'],
    description: 'A new f# dropdown field with selectable options.',
    apply: addDropdownField,
  },

  // ----- Animation › CSS (learn CSS @keyframes; applied to your most recent element) -----
  {
    id: 'css-fade',
    label: 'Fade in',
    category: 'Animation',
    path: ['Animation', 'CSS'],
    primaryTab: 'css',
    keywords: ['fade', 'css', 'keyframes', 'opacity', 'animation'],
    description: 'CSS fade-in keyframe, applied to your most recent element (runs on load).',
    apply: (t) => {
      let next = {
        ...t,
        css: appendCss(
          t.css,
          'Fade in (CSS) — runs when the page loads',
          `@keyframes spxFadeIn {
  from { opacity: 0; }         /* start invisible */
  to   { opacity: 1; }         /* end fully visible */
}
/* Add class="fade-in" to any element to fade it in. */
.fade-in { animation: spxFadeIn 0.6s ease both; }`,
        ),
      };
      next = { ...next, html: applyAnimationClass(next.html, 'fade-in') };
      return next;
    },
  },
  {
    id: 'css-slide',
    label: 'Slide in',
    category: 'Animation',
    path: ['Animation', 'CSS'],
    primaryTab: 'css',
    keywords: ['slide', 'css', 'keyframes', 'transform', 'animation'],
    description: 'CSS slide-up keyframe, applied to your most recent element.',
    apply: (t) => {
      let next = {
        ...t,
        css: appendCss(
          t.css,
          'Slide in (CSS) — runs when the page loads',
          `@keyframes spxSlideIn {
  from { transform: translateY(40px); opacity: 0; }  /* start lower + invisible */
  to   { transform: translateY(0);    opacity: 1; }  /* settle into place */
}
/* Add class="slide-in" to any element to slide it up. */
.slide-in { animation: spxSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }`,
        ),
      };
      next = { ...next, html: applyAnimationClass(next.html, 'slide-in') };
      return next;
    },
  },
  {
    id: 'css-scale',
    label: 'Scale in',
    category: 'Animation',
    path: ['Animation', 'CSS'],
    primaryTab: 'css',
    keywords: ['scale', 'pop', 'css', 'keyframes', 'animation'],
    description: 'CSS scale/pop-in keyframe, applied to your most recent element.',
    apply: (t) => {
      let next = {
        ...t,
        css: appendCss(
          t.css,
          'Scale in (CSS) — runs when the page loads',
          `@keyframes spxScaleIn {
  from { transform: scale(0.92); opacity: 0; }  /* start slightly smaller + invisible */
  to   { transform: scale(1);    opacity: 1; }  /* pop to full size */
}
/* Add class="scale-in" to any element to pop it in. */
.scale-in { animation: spxScaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }`,
        ),
      };
      next = { ...next, html: applyAnimationClass(next.html, 'scale-in') };
      return next;
    },
  },

  // ----- Animation › GSAP (learn GSAP; tweens run on play()/stop()) -----
  {
    id: 'gsap-fade',
    label: 'Fade in/out',
    category: 'Animation',
    path: ['Animation', 'GSAP'],
    primaryTab: 'js',
    keywords: ['fade', 'gsap', 'opacity', 'play', 'stop'],
    description: 'GSAP fade: in on play(), out on stop() (targets your most recent element).',
    apply: (t) => {
      const sel = animationSelector(t.html);
      let js = insertIntoFunction(t.js, 'play', `gsap.from('${sel}', { opacity: 0, duration: 0.5, ease: 'power2.out' });`);
      js = insertIntoFunction(js, 'stop', `gsap.to('${sel}', { opacity: 0, duration: 0.4, ease: 'power2.in' });`);
      return { ...t, js };
    },
  },
  {
    id: 'gsap-slide',
    label: 'Slide in/out',
    category: 'Animation',
    path: ['Animation', 'GSAP'],
    primaryTab: 'js',
    keywords: ['slide', 'gsap', 'y', 'play', 'stop'],
    description: 'GSAP slide: up on play(), down on stop() (targets your most recent element).',
    apply: (t) => {
      const sel = animationSelector(t.html);
      let js = insertIntoFunction(t.js, 'play', `gsap.from('${sel}', { y: 40, opacity: 0, duration: 0.5, ease: 'power3.out' });`);
      js = insertIntoFunction(js, 'stop', `gsap.to('${sel}', { y: 40, opacity: 0, duration: 0.4, ease: 'power2.in' });`);
      return { ...t, js };
    },
  },
  {
    id: 'gsap-scale',
    label: 'Scale in/out',
    category: 'Animation',
    path: ['Animation', 'GSAP'],
    primaryTab: 'js',
    keywords: ['scale', 'pop', 'gsap', 'play', 'stop'],
    description: 'GSAP scale: pop in on play(), shrink out on stop() (targets your most recent element).',
    apply: (t) => {
      const sel = animationSelector(t.html);
      let js = insertIntoFunction(t.js, 'play', `gsap.from('${sel}', { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(1.6)' });`);
      js = insertIntoFunction(js, 'stop', `gsap.to('${sel}', { scale: 0.9, opacity: 0, duration: 0.4, ease: 'power2.in' });`);
      return { ...t, js };
    },
  },
  {
    id: 'gsap-pulse',
    label: 'Pulse',
    category: 'Animation',
    path: ['Animation', 'GSAP'],
    primaryTab: 'js',
    keywords: ['pulse', 'attention', 'gsap', 'yoyo'],
    description: 'GSAP attention pulse on play() (targets your most recent element).',
    apply: (t) => {
      const sel = animationSelector(t.html);
      const js = insertIntoFunction(
        t.js,
        'play',
        `gsap.to('${sel}', { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut' });`,
      );
      return { ...t, js };
    },
  },
];

export const BLOCK_CATEGORIES: BuildingBlock['category'][] = ['Structure', 'Elements', 'Fields', 'Animation'];
