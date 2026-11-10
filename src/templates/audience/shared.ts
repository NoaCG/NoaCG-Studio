// Audience scaffolding — the graphics that put the AUDIENCE on screen: the viewer question, the
// Q&A card, the chat highlight, the moderator's question queue, and the community or prayer
// request. Talk shows, livestreams, podcasts, webinars, churches and conferences all run these,
// and on air they are one object seen from five angles: a panel, a label saying what kind of
// message this is, the message itself, and a line saying who sent it and from where.
//
// ONE CATEGORY, FIVE FORMS. A form declares its FIELDS and the runtime it needs; the assembler
// is the same for all five. That is what keeps the attribution rules, the long-message
// handling, the style contract and the export path written once.
//
// Structure contract (a form draws the parts it needs and no others):
//   <div class="audience">                 root — zone positioned; opacity:0 until play()
//     <div class="audience-box">           the panel; presets tween this
//       [<div class="audience-accent">]    the family's accent bar, where it has one
//       [<div class="audience-kicker"><span id="fN">…</span></div>]   what kind of message
//       [<div class="audience-mask"><span class="audience-question" id="fN">…</span></div>]
//       [<div class="audience-answer">…</div>]        the Q&A card's answer (revealed on Continue)
//       [<div id="audience-queue"></div>]             the queue's rows, rendered at runtime
//       [<div class="audience-by">                    who sent it, and from where
//          <span class="audience-asker" id="fN">…</span>
//          <span class="audience-anon">Anonymous</span>
//          <span class="audience-sep"></span>
//          <span class="audience-source" id="fN">…</span>
//        </div>]
//     </div>
//   </div>
//
// THE PLATFORM IS TEXT, NEVER A LOGO. "Where this came from" is an ordinary operator field, so
// the same card serves YouTube, Twitch, Zoom, a church app, a webinar tool or a stack of paper
// slips handed up from the room. Baking in one platform's mark would make the graphic wrong for
// every other, would date, and would put someone else's trademark in a template the user owns.
//
// AND EVERY FORM IS FULLY USABLE BY HAND. Nothing here reads a chat API: an operator types the
// message, the name and the source into ordinary SPX fields, exactly as they type a lower
// third. A future integration would fill the same fields; it is not a precondition for any of it.

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  DATA_SOURCE_CLASS,
  dataSourceCss,
  documentHtml,
  maxTextWidthCss,
  stageBoxCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  zoneCssText,
} from '../shared/base';
import { composeRefine, convertToDataRegion } from '../shared/standard';
import { stageFitRuntimeJs } from '../shared/stageFit';
import type { AnimData, AnimStep } from '../../blocks/animData';
import type { PresetConfig } from '../lowerThirds/animPresets';
import { audiencePresetById } from './audiencePresets';
import { AUDIENCE_ATTRIBUTION_JS, AUDIENCE_JOIN_JS, AUDIENCE_QUEUE_JS, AUDIENCE_WORDS_JS } from './audienceRuntime';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

// ── Forms ────────────────────────────────────────────────────────────────────

/** One declared field of a form: its operator-facing title, its starting text, and its type. */
export interface AudienceLine {
  title: string;
  sample: string;
  /** 'textarea' for the queue's list; everything else is a plain text field. */
  ftype?: SpxField['ftype'];
}

export interface AudienceForm {
  id: 'question' | 'qa' | 'chat' | 'queue' | 'request' | 'join' | 'words';
  /** The fields, in emission order — they compile to f0…fN positionally. */
  lines: AudienceLine[];
  /** One-line comment describing the root in the generated HTML. */
  rootComment: string;
  /** A field held in a HIDDEN source div instead of being rendered directly (the queue's list,
   *  which the runtime turns into rows; the Join card's link, which it turns into a QR code). */
  hiddenSourceField?: string;
  /** What the hidden source holds, said in the generated HTML beside it. */
  hiddenSourceComment?: string;
  /** The runtime call that repaints what the form derives from its fields, run on load, on
   *  update() and on play() (the queue's rows, the Join card's code). */
  repaint?: string;
  /** The comment beside that call in update() and play(), padding included. */
  repaintNote?: string;
  /** Extra design-owned runtime this form needs, emitted OUTSIDE the marked region. */
  runtimeJs?: string;
  /** A middle step this form authors on the default path (the Q&A card's answer reveal). */
  refine?: (ease: string) => (data: AnimData) => AnimData;
}

/**
 * The Q&A card's answer as a real STEP, inserted just before Out.
 *
 * This one is pure keyframes with a `reveals`, not a lifecycle call: the answer is a fixed
 * element, so there is nothing data-dependent about revealing it. That matters — the
 * interpreter pre-hides press-revealed layers and `noacgSnap` replays the walk's keyframes, so
 * snapping straight to the answered state shows the answer, and settling the graphic in the
 * editor shows it too. A call would have done neither.
 *
 * Authoring it as data is also what makes SPX's `steps: '2'` DERIVED: question + answer + Out is
 * three steps, and the timeline computes the Continue count as steps − 1.
 */
function withAnswerStep(ease: string) {
  return (data: AnimData): AnimData => {
    const answer: AnimStep = {
      name: 'Answer',
      duration: 0.5,
      ease,
      reveals: ['.audience-answer'],
      layers: {
        '.audience-answer': {
          opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }],
          y: [{ time: 0, value: 14 }, { time: 0.5, value: 0 }],
        },
      },
    };
    const steps = [...data.steps];
    steps.splice(steps.length - 1, 0, answer); // before the Out step
    return { ...data, steps };
  };
}

/** VIEWER QUESTION — one question on screen, with who asked it and where it came from. */
export const QUESTION_FORM: AudienceForm = {
  id: 'question',
  rootComment: 'Viewer question — the label, the question, and who sent it.',
  lines: [
    { title: 'Label', sample: 'VIEWER QUESTION' },
    { title: 'Question', sample: 'How do you decide which stories make the top of the show?' },
    { title: 'Asked by', sample: 'Priya N.' },
    { title: 'Source', sample: 'YouTube live chat' },
  ],
};

/** Q&A CARD — the question, then the answer on Continue. */
export const QA_FORM: AudienceForm = {
  id: 'qa',
  rootComment: 'Q&A card — the question now, the answer on Continue.',
  lines: [
    { title: 'Label', sample: 'AUDIENCE Q&A' },
    { title: 'Question', sample: 'What advice would you give someone starting out today?' },
    { title: 'Answer', sample: 'Say yes to the unglamorous jobs — that is where the craft is learned.' },
    { title: 'Asked by', sample: 'Marcus T.' },
    { title: 'Source', sample: 'Zoom Q&A' },
  ],
  refine: withAnswerStep,
};

/** CHAT HIGHLIGHT — a comment pulled out of the chat, leading with who said it. */
export const CHAT_FORM: AudienceForm = {
  id: 'chat',
  rootComment: 'Chat highlight — the handle, where they said it, and what they said.',
  lines: [
    { title: 'Handle', sample: '@rivergirl' },
    { title: 'Source', sample: 'Twitch chat' },
    { title: 'Comment', sample: 'This is the best show you have done all year.' },
  ],
};

/** QUESTION QUEUE — the moderator's running order, with one question live. */
export const QUEUE_FORM: AudienceForm = {
  id: 'queue',
  rootComment: 'Question queue — the running order, with one question live.',
  hiddenSourceField: 'f0',
  hiddenSourceComment:
    'Hidden queue source — SPX writes field f0 here; the runtime renders it as rows.\n         One entry per line, written "Question | Name | Source". Name and source are optional.',
  repaint: 'audienceQueueRebuild();',
  repaintNote: "          // fresh rows from the operator's list",
  runtimeJs: AUDIENCE_QUEUE_JS,
  lines: [
    {
      title: 'Queue',
      ftype: 'textarea',
      sample: [
        'How do you decide which stories make the top of the show? | Priya N. | YouTube',
        'Will the series be available outside the UK? | | Webinar chat',
        'What is the one tool you could not work without? | Marcus T. | Zoom Q&A',
        'Any advice for someone starting out today? | Ana R. | In the room',
      ].join('\n'),
    },
    { title: 'Heading', sample: 'QUESTIONS UP NEXT' },
    // The word BETWEEN the two numbers of the position readout ("3 of 12"). It is one word,
    // and it is the only English left in a graphic whose every other string an operator
    // types — which is exactly the kind of thing that strands a template at a broadcaster
    // who works in another language. The numbers stay the runtime's.
    { title: 'Position word', sample: 'of' },
  ],
};

/** JOIN CARD: the QR code and the short link viewers join by (templates/audience/joinCard.ts). */
export const JOIN_FORM: AudienceForm = {
  id: 'join',
  rootComment: 'Join card: a QR code drawn from the Join link, what to do, and the link.',
  hiddenSourceField: 'f2',
  hiddenSourceComment:
    'Hidden join source: SPX writes field f2 here; the runtime draws it as a QR code and shows it without https://. Empty draws nothing.',
  repaint: 'audienceJoinPaint();',
  repaintNote: '                  // what the form draws from its fields',
  runtimeJs: AUDIENCE_JOIN_JS,
  lines: [
    { title: 'Label', sample: 'JOIN IN' },
    { title: 'Call to action', sample: 'Scan to answer on your phone' },
    // A graphic's own text may hold no absolute URL (the publish gate), so the sample has no
    // scheme; Add Join card to rundown writes the real link into the cue, not the graphic.
    { title: 'Join link', sample: 'noacg.studio/j/your-show' },
  ],
};

/** WORD CLOUD: the words a Word question gathered, sized by how many phones sent each
 *  (templates/audience/wordCloud.ts; interaction spec AC-14). */
export const WORDS_FORM: AudienceForm = {
  id: 'words',
  rootComment: 'Word cloud: the question, and the words the audience sent, sized by how many sent each.',
  hiddenSourceField: 'f2',
  hiddenSourceComment:
    'Hidden words source: SPX writes field f2 here, one "word | count" line each, most first; the runtime draws them as a cloud. Empty draws nothing.',
  repaint: 'audienceWordsPaint();',
  repaintNote: '                 // what the form draws from its fields',
  runtimeJs: AUDIENCE_WORDS_JS,
  lines: [
    { title: 'Label', sample: 'YOUR WORDS' },
    { title: 'Question', sample: 'Sum up tonight in one word' },
    {
      title: 'Words',
      ftype: 'textarea',
      sample: ['Brilliant | 18', 'Tense | 11', 'Electric | 9', 'Proud | 7', 'Loud | 6', 'Joyful | 5', 'Nervous | 4', 'Unforgettable | 3', 'Fun | 3', 'Epic | 2', 'Wild | 2', 'Classy | 1'].join('\n'),
    },
  ],
};

/** COMMUNITY REQUEST — a prayer or community request, with who sent it and from where. */
export const REQUEST_FORM: AudienceForm = {
  id: 'request',
  rootComment: 'Community request — the label, the request, and who sent it.',
  lines: [
    { title: 'Label', sample: 'PRAYER REQUEST' },
    { title: 'Request', sample: 'Please pray for my mother as she recovers from surgery this week.' },
    { title: 'From', sample: 'The Okafor family' },
    { title: 'Where', sample: 'Leeds' },
  ],
};

// ── The assembler ────────────────────────────────────────────────────────────

export interface AudienceDesign {
  /**
   * THE STAGE WIDTH, in px at 1080p: the room this graphic was drawn for (`stageBoxCss` in
   * shared/base.ts carries the whole contract).
   *
   * With one declared, the panel stops hugging the operator's text and the text lives inside
   * it instead - which is what a BOARD needs, because the same panel is on air with different
   * content all evening and an audience reads a graphic that re-sizes itself as a broken one.
   * The number holds a realistic worst case; shorter content leaves reserved room where the
   * anchor already reads.
   */
  stageWidth?: number;
  /** Inner HTML of .audience — must contain .audience-box and the parts the form needs. */
  html: string;
  /** Variant CSS. Colors via the :root vars, sizes via calc(* var(--scale)). */
  css: string;
  /** Whether the design includes a .audience-accent element. */
  hasAccent: boolean;
  /** JS defining renderQueueRow(entry, index) — the markup for one queued question. Only the
   *  queue form needs it; it is design-owned for the same reason a ticker's item builder is,
   *  since the row's shape is part of the look. */
  rowBuilderJs?: string;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface AudienceMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

/**
 * The shared message CSS — the contract half of the look.
 *
 * THE LONG-MESSAGE RULE. Audience text is the one thing on a broadcast graphic whose length
 * nobody controls: a viewer writes what they want, and a 400-character question would grow the
 * card off the top of the frame. So the message CLAMPS at a line count the design sets through
 * `--message-lines`, with the browser's own ellipsis. Clamping rather than scrolling, wrapping
 * forever, or shrinking the type: an ellipsis is VISIBLE, so the operator can see that a
 * question was too long and shorten it, where silent overflow or a silently smaller face just
 * looks like the graphic is broken.
 */
const MESSAGE_CSS = `/* ── The message contract: audience text is as long as the audience made it. ── */

/* An audience graphic is a READING BLOCK — a message, who sent it, and where from — so its
   contents read left-to-right whatever edge of the frame the card is anchored to. The zone rule
   sets text-align from the anchor, which is right for a title card and wrong here: at a centre
   or right anchor it would centre the message while the attribution row (a flex line) stayed
   left, and pull a queue's rows away from their live markers. The card sits where the zone
   says; only its contents opt out. */
.audience-box {
  text-align: left;
}

.audience-mask {
  overflow: hidden;                /* the message animates in from behind this mask */
}
.audience-question {
  display: -webkit-box;            /* the clamp below needs the box layout mode… */
  -webkit-box-orient: vertical;    /* …stacking the lines */
  -webkit-line-clamp: var(--message-lines, 4);  /* a very long message ends in an ellipsis */
  line-clamp: var(--message-lines, 4);          /* the standard spelling, for browsers that have it */
  overflow: hidden;                /* what the clamp cuts is hidden, ellipsis and all */
  overflow-wrap: break-word;       /* break a very long unbroken word rather than overflow */
}`;

/** The complete field list for a form, with the wizard's own titles and text where it has them. */
function audienceFields(form: AudienceForm, o: ResolvedOptions): SpxField[] {
  return form.lines.map((line, i): SpxField => ({
    field: `f${i}`,
    ftype: line.ftype ?? 'textfield',
    title: o.lines[i]?.title || line.title,
    // `??` rather than `||`: an EMPTY value is a real choice here. A question with no name is
    // the anonymous case, and the attribution runtime is built to render it — replacing it with
    // the sample name would hide the very case the design exists to handle.
    value: o.lines[i]?.sample ?? line.sample,
  }));
}

/** The audience runtime: the standard scaffold plus the attribution pass every form runs. */
function audienceRuntimeJs(name: string, form: AudienceForm, animationBlock: string): string {
  const rebuild = form.repaint ? `\n  ${form.repaint}${form.repaintNote ?? ''}` : '';
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

// update(data): SPX sends field values as JSON, e.g. {"f1":"…","f2":"Priya N."}.
// Each value is written into the element whose id matches the field name (f0 -> id="f0"),
// then the card re-reads its own attribution so a missing name or source renders cleanly.
//
// Data changes no STATE here: writing a new question does not advance, reveal or reset
// anything (docs/STATE_MACHINE_SCHEMA.md §3). It only changes what the card says.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }${rebuild}
  audienceAttribution();
  // Designs on a stage hold their lines to the rows they were drawn for (no-op otherwise).
  if (typeof fitStagedText === 'function') fitStagedText();
}

// play(): take the graphic on air — run the entrance timeline.
function play() {
  gsap.killTweensOf('*');          // stop any animation that is still running
  audienceAttribution();           // the card may have been re-typed while it was off air${rebuild}
  buildInTimeline();
}

// stop(): take the graphic off air — run the exit timeline.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance one step along the default path.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

// Read the attribution once on load, so the preview is right before the first update().
// This file loads in <head>, before the card exists — wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { ${form.repaint ? `${form.repaint} ` : ''}audienceAttribution(); });
} else {
  ${form.repaint ? `${form.repaint}\n  ` : ''}audienceAttribution();          // DOM already parsed (e.g. an inline preview build)
}

${animationBlock}
`;
}

/** Build the complete audience SpxTemplate. */
export function assembleAudience(
  meta: AudienceMeta,
  form: AudienceForm,
  design: AudienceDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts), resolved by the caller. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  // A quoted message reads best on a measure wider than a strap and narrower than a full card.
  // A word cloud is a board: it needs the width of one.
  const maxTextWidth = Math.round(o.resolution.width * (form.id === 'queue' ? 0.5 : form.id === 'words' ? 0.7 : 0.44));
  const fields = audienceFields(form, o);
  const hidden = form.hiddenSourceField
    ? fields.find((f) => f.field === form.hiddenSourceField)
    : undefined;

  // The Q&A card's Continue reveals the answer, so it ships two phases; everything else is
  // a single-step graphic. Either way the count is DERIVED again after the conversion.
  const settings = baseSettings(meta, o, { steps: form.refine ? '2' : '1' });

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- ${form.rootComment} -->
  <div class="audience">
${design.html}${
      hidden
        ? `
    <!-- ${form.hiddenSourceComment ?? `Hidden source: SPX writes field ${hidden.field} here.`} -->
    <div id="${hidden.field}" class="${DATA_SOURCE_CLASS}">${hidden.value}</div>`
        : ''
    }
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.audience {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── Auto-fit: the panel hugs its text and wraps instead of overflowing. ── */
.audience-box {
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this panel was drawn for')
      : "  width: fit-content;              /* the panel hugs the message */"
  }
  max-width: ${maxTextWidthCss(o.resolution, maxTextWidth)};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}

${MESSAGE_CSS}
${hidden ? `\n${dataSourceCss}\n` : ''}
/* ── Design ── */
${design.css}
`;

  const preset = audiencePresetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'audience',
    lineCount: form.lines.length,
    hasAccent: design.hasAccent,
    // Which optional parts this design actually draws — the preset writes motion for these and
    // nothing else, so no form ever carries a phantom timeline layer.
    parts: [...new Set(Array.from(design.html.matchAll(/\b(audience-[a-z0-9-]+)\b/g), (m) => m[1]))].sort(),
    steps: false, // a » press per line is not how any of these graphics work
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const extraJs = [AUDIENCE_ATTRIBUTION_JS, design.rowBuilderJs, form.runtimeJs]
    .filter(Boolean)
    .join('\n\n');
  const js = audienceRuntimeJs(meta.name, form, `${extraJs}\n\n${preset.emit(cfg)}`);
  const jsWithStage = design.stageWidth
    ? `${js}

${stageFitRuntimeJs('audience')}`
    : js;

  const template: SpxTemplate = {
    name: meta.name,
    type: 'audience',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js: jsWithStage,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: fields
      .filter((f) => f.ftype === 'textfield')
      .map((f) => ({ id: f.field, type: 'text' as const, label: f.title, fieldId: f.field, text: f.value, styles: {} })),
  };

  // Timeline v2: the preset's region becomes the NOACG_ANIM data block, and a form that has a
  // second phase (the Q&A answer) authors it as a real middle step on top.
  // A step-adding refinement must run BEFORE the machine compiles, because the machine derives
  // its default path from the final step list (shared/standard.ts composeRefine).
  return convertToDataRegion(template, composeRefine(form.refine?.(ease.easeIn), refine));
}

/** The authoring API for audience variant modules. */
export function defineAudienceVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: AudienceMeta,
  form: AudienceForm,
  buildDesign: (o: ResolvedOptions) => AudienceDesign,
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
      return assembleAudience(meta, form, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}

/** The wizard LineSpecs a form's fields start from — the variant's `suggestedLines`. */
export function formLines(form: AudienceForm): { title: string; sample: string }[] {
  return form.lines.map((l) => ({ title: l.title, sample: l.sample }));
}
