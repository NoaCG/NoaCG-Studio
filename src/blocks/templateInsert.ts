// INSERT A TEMPLATE GRAPHIC into the current project — the "Add template graphic" action.
// Pure (template, variant) => template, like every block: the caller applies the result via
// ONE applyTemplate, so the whole insertion is one undo step.
//
// The donor template (variant.create()) is a complete standalone document, so a naive splice
// would collide on every shared name. The merge therefore NAMESPACES everything it takes:
//
// - class prefix:   .lower-third…  ->  .lower-third-2…  (a unique suffix off the donor prefix)
// - field ids:      donor f0..fk   ->  the current template's next free fN..
// - style contract: the donor's :root variables are RE-SCOPED onto the inserted root
//   (#gfx-…), so its palette/typeface/scale keep working through CSS custom-property
//   inheritance without retinting the host graphic
// - the reset/canvas CSS and the donor's runtime scaffold are dropped — one document, one
//   runtime (the host's interpreter tweens the merged keyframes)
// - the donor's own state machine is dropped: the inserted graphic participates like any
//   element — visible from the start, or revealed as a step of the host's default path —
//   which is exactly what keeps ONE timeline/state system in the project.
//
// What survives: the donor's visual subtree (tagged data-gfx with a unique id, so it is a
// selectable, animatable registry part), its data fields (renumbered, still driven by the
// shared update()), its fonts, and its WHOLE step run — In/Out remapped and merged into the
// host's entrance/exit (or into a brand-new step when the graphic arrives as one), and every
// MIDDLE step of the donor added as its own step on the host's default path, contiguously
// after wherever the run starts. A donor's second beat often finishes a move its first beat
// began, so the steps stay adjacent: host presses are never interleaved into the middle of
// the donor's choreography.
//
// NOT insertable, honestly refused: templates whose motion or content depends on
// design-owned runtime code outside the marked region (clocks, measured tickers/credits,
// quiz reveals). The gate is code-derived — step `calls`/`dynamics` in the donor data, or
// functions beyond the standard scaffold in the donor JS — never a category list.

import type { SpxField, SpxTemplate } from '../model/types';
import type { TemplateVariant } from '../model/wizard';
import { detectPrefix } from '../model/structure';
import { replaceDefinitionInHtml } from '../model/spxDefinition';
import { ANIMATION_MARK_CLOSE, ANIMATION_MARK_OPEN } from '../templates/lowerThirds/animPresets';
import { writeAnimData } from '../templates/shared/animRuntime';
import { parseAnimData, type AnimData, type AnimLayerTracks, type AnimStep } from './animData';
import { addStep, renameStep } from './animEdit';
import { spxSteps } from './animMachine';
import { addLayer, appendCss, insertGraphicHtml, nextFieldId } from './edit';

export type InsertPlacement = 'start' | 'new-step';

export type InsertResult = { template: SpxTemplate; selector: string } | { error: string };

/** The JS functions every generated scaffold defines — anything beyond these is
 *  design-owned runtime the merge cannot carry. */
// The functions every assembled template gets from the shared assembler rather than from its own
// design. They are not "design-owned runtime code", so they must not block an insertion.
//
// The `stage*` / `fit*` group is the stage fit (templates/shared/stageFit.ts), emitted for every
// design that declares a stageWidth. It is safe to merge for a reason worth stating: the merged
// file declares these twice and the later declaration wins, but they read the panels they act on
// from a shared registry rather than a baked-in selector, so the surviving copy still fits BOTH
// graphics. Without that, allowing them here would mean the inserted graphic silently stopped
// being fitted - green tests, quietly wrong output. The measurement helpers beside them
// (`stageTextWidth`, `stageContentWidth`) hold no state at all, and `stageFaceHeight` caches its
// per-face ratios on the window for the same reason the box list lives there.
//
// ADDING A FUNCTION TO shared/stageFit.ts MEANS ADDING IT HERE. Leave it out and every insertion
// involving a staged graphic is refused as "design-owned runtime" - which is what five
// e2e/template-insert.spec.ts cases caught when the stage fit grew these three.
const SCAFFOLD_FUNCTIONS = new Set([
  'setFieldValue', 'update', 'play', 'stop', 'next', 'motionSpeed',
  'stageFitBoxes', 'stagedLines', 'stageLineHeight', 'stageFaceHeight', 'stageTextWidth',
  'stageContentWidth', 'stageLayoutHeight', 'fitStagedText', 'fitOneStagedLine', 'stageUnpin',
  'holdStageHeight', 'holdOneStageBox', 'drawnBoxOf',
]);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Function names defined OUTSIDE the marked ANIMATION region of a template's JS. */
function outsideRegionFunctions(js: string): string[] {
  const start = js.indexOf(ANIMATION_MARK_OPEN);
  const end = js.indexOf(ANIMATION_MARK_CLOSE);
  const outside =
    start !== -1 && end !== -1 ? js.slice(0, start) + js.slice(end + ANIMATION_MARK_CLOSE.length) : js;
  const names: string[] = [];
  for (const m of outside.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.push(m[1]);
  return names;
}

/**
 * Why this variant cannot be inserted into an existing project, or null when it can.
 * Code-derived from the donor it would actually produce.
 */
export function insertBlocker(donor: SpxTemplate, donorData: AnimData | null): string | null {
  if (!donorData) return 'this template has no editable animation data block';
  const measured = donorData.steps.some((s) => (s.calls?.length ?? 0) > 0 || (s.dynamics?.length ?? 0) > 0);
  if (measured) {
    return 'its motion runs design-owned runtime code (a clock or measured motion), which cannot merge into another graphic';
  }
  const extra = outsideRegionFunctions(donor.js).filter((n) => !SCAFFOLD_FUNCTIONS.has(n));
  if (extra.length > 0) {
    return `it carries its own runtime code (${extra.slice(0, 3).join(', ')}${extra.length > 3 ? ', …' : ''}), which cannot merge into another graphic`;
  }
  return null;
}

/** A unique namespace off the donor prefix: lower-third-2, -3, … not present in the host. */
function uniqueNamespace(current: SpxTemplate, donorPrefix: string): string {
  let n = 2;
  let ns = `${donorPrefix}-${n}`;
  while (current.html.includes(ns) || current.css.includes(ns) || current.js.includes(ns)) {
    ns = `${donorPrefix}-${++n}`;
  }
  return ns;
}

/** A unique data-gfx id for the inserted root, from the variant's name. */
function uniqueGfxId(html: string, variantName: string): string {
  const stem = variantName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'graphic';
  const base = `gfx-${stem}`;
  let id = base;
  let n = 2;
  while (new RegExp(`\\bid=["']${id}["']`).test(html)) id = `${base}-${n++}`;
  return id;
}

/** Rewrite every donor field id in `text` to its remapped id. Applied in DESCENDING donor
 *  index order (the mapping is strictly increasing, so replaced ids never re-match). */
function remapFieldIds(text: string, mapping: Array<{ from: number; to: string }>): string {
  let out = text;
  for (const { from, to } of [...mapping].sort((a, b) => b.from - a.from)) {
    out = out.replace(new RegExp(`(?<![\\w-])f${from}(?![0-9])`, 'g'), to);
  }
  return out;
}

/** Strip the donor's reset/canvas CSS (one document already has one) — the emitted
 *  `* { … }` + `html, body { … }` pair with its comment header. */
function stripResetCss(css: string): string {
  return css.replace(
    /\/\* Reset and a transparent canvas[\s\S]*?\*\/\s*\*\s*\{[^}]*\}\s*html,\s*body\s*\{[^}]*\}\s*/,
    '',
  );
}

/**
 * The host's name for one of the donor's middle steps. Every step name in a project is the
 * operator's word for a press, so an inserted run says WHOSE press it is: a donor step the
 * author actually named keeps that name behind the graphic's ("Scores - Table in"), while a
 * default "Step 2" becomes the graphic's own ordinal ("Scores 2" — its second beat, counted
 * from its In), since carrying the donor's numbering into a path that already has its own
 * would name two different presses the same thing.
 */
function middleStepName(variantName: string, donorName: string, index: number): string {
  return /^Step \d+$/.test(donorName.trim())
    ? `${variantName} ${index + 2}`
    : `${variantName} - ${donorName.trim()}`;
}

/** Merge one layers map into a step (selectors are namespaced, so keys cannot collide). */
function mergeLayers(step: AnimStep, layers: Record<string, AnimLayerTracks>) {
  for (const [selector, tracks] of Object.entries(layers)) step.layers[selector] = tracks;
}

/** Scale a step's keyframe times from the donor's speed base to the host's, so a motion
 *  authored at donor speed keeps its real-seconds feel. */
function scaleTimes(layers: Record<string, AnimLayerTracks>, factor: number) {
  if (factor === 1) return;
  for (const tracks of Object.values(layers)) {
    for (const kfs of Object.values(tracks)) {
      for (const kf of kfs) kf.time = +(kf.time * factor).toFixed(3);
    }
  }
}

/** Build the donor the merge lifts from — the same `create()` the wizard's Create button
 *  calls, with the one option that changes its STEP RUN (line-by-line reveal). */
export function buildDonor(variant: TemplateVariant, steps = false): SpxTemplate {
  return variant.create({ animation: { steps } });
}

/**
 * Insert `variant`'s graphic into `current`. `placement` decides participation:
 * 'start' merges the donor's In/Out into the host's entrance and exit; 'new-step' adds a
 * named step to the default path that reveals the graphic (its Out still joins the exit).
 * `steps` builds the donor with its line-by-line reveal, and every step of that run joins
 * the host's default path after the placement point.
 */
export function insertTemplateGraphic(
  current: SpxTemplate,
  variant: TemplateVariant,
  opts: { placement: InsertPlacement; steps?: boolean },
): InsertResult {
  const curData = parseAnimData(current.js);
  if (!curData) {
    return { error: 'this project has no editable animation data block — open a data-block project (every catalog template is one)' };
  }

  const donor = buildDonor(variant, opts.steps ?? false);
  const donorData = parseAnimData(donor.js);
  const blocked = insertBlocker(donor, donorData);
  if (blocked) return { error: blocked };

  const donorPrefix = detectPrefix(donor.html);
  if (!donorPrefix) return { error: 'this template has no standard structure contract to lift out' };

  // ── Namespacing ────────────────────────────────────────────────────────────
  const ns = uniqueNamespace(current, donorPrefix);
  const prefixRe = new RegExp(escapeRe(donorPrefix), 'g');
  const base = parseInt(nextFieldId(current.fields).slice(1), 10);
  const donorFields = [...donor.fields].sort(
    (a, b) => parseInt(a.field.slice(1), 10) - parseInt(b.field.slice(1), 10),
  );
  const fieldMap = donorFields.map((f, i) => ({ from: parseInt(f.field.slice(1), 10), to: `f${base + i}` }));
  const rewrite = (text: string) => remapFieldIds(text.replace(prefixRe, ns), fieldMap);

  // ── The visual subtree, tagged as a registry part ──────────────────────────
  const doc = new DOMParser().parseFromString(donor.html, 'text/html');
  const rootEl = doc.querySelector(`.${donorPrefix}`);
  if (!rootEl) return { error: 'this template has no root element to lift out' };
  const gfxId = uniqueGfxId(current.html, variant.name);
  let subtree = rewrite(rootEl.outerHTML);
  subtree = subtree.replace(/^<([a-zA-Z][\w-]*)\s/, `<$1 id="${gfxId}" data-gfx `);
  const newIds = fieldMap.map((m) => m.to);
  const htmlSnippet =
    `  <!-- Inserted template graphic: ${variant.name}` +
    `${newIds.length > 0 ? ` (fields ${newIds.join(', ')})` : ''} — its styles are scoped under #${gfxId}. -->\n` +
    `  ${subtree}`;

  // ── CSS: strip the reset, re-scope :root onto the inserted root ────────────
  let donorCss = stripResetCss(rewrite(donor.css));
  donorCss = donorCss.replace(/:root\s*\{/g, `#${gfxId} {`);
  donorCss = donorCss.trim();

  // ── Fields: renumbered, titles marked so the operator can tell them apart ──
  const newFields: SpxField[] = donorFields.map((f, i) => ({
    ...f,
    field: `f${base + i}`,
    title: `${f.title} (${variant.name})`,
  }));
  const fields = [...current.fields, ...newFields];

  // ── Animation: remap the donor's whole step run into the host's data ───────
  const speedFactor = (curData.speed || 1) / (donorData!.speed || 1);
  const donorSteps = donorData!.steps;
  const lastDonor = donorSteps.length - 1;
  const donorIn = clone(donorSteps[0]);
  const donorOut = clone(donorSteps[lastDonor]);
  const donorMiddles = donorSteps.slice(1, lastDonor).map(clone);
  const rewriteKeys = <T,>(map: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(map).map(([sel, v]) => [rewrite(sel), v]));
  /** A donor step's layers, namespaced and re-timed onto the host's speed base. */
  const prepLayers = (layers: Record<string, AnimLayerTracks>) => {
    const out = rewriteKeys(layers);
    scaleTimes(out, speedFactor);
    return out;
  };
  const scaled = (seconds: number) => +(seconds * speedFactor).toFixed(3);
  const inLayers = prepLayers(donorIn.layers);
  const outLayers = prepLayers(donorOut.layers);

  let data = clone(curData);
  // Where the donor's step run starts — the placement choice, in one index.
  let runAt: number;
  if (opts.placement === 'new-step') {
    const added = addStep(data);
    if (!added) return { error: 'could not add a step to this timeline' };
    data = added;
    runAt = data.steps.length - 2; // the fresh step sits just before Out
    data = renameStep(data, runAt, variant.name) ?? data;
    const step = data.steps[runAt];
    step.duration = scaled(donorIn.duration);
    if (donorIn.ease) step.ease = donorIn.ease;
    mergeLayers(step, inLayers);
    (step.reveals ??= []).push(`#${gfxId}`);
  } else {
    runAt = 0;
    const entrance = data.steps[0];
    entrance.duration = Math.max(entrance.duration, scaled(donorIn.duration));
    mergeLayers(entrance, inLayers);
  }
  // The donor root sits outside the host root and keeps its CSS-hidden rest state.
  // The host interpreter reveals only its own root, so this root needs explicit data too.
  const arrival = data.steps[runAt];
  arrival.layers[`#${gfxId}`] = { opacity: opts.placement === 'new-step'
    ? [{ time: 0, value: 0 }, { time: Math.min(arrival.duration, (curData.speed || 1) / current.fps), value: 1 }]
    : [{ time: 0, value: 1 }] };
  // Ambient loops (a breathing pulse) are pure data — carry the In step's along.
  if (donorIn.loops) {
    const step = data.steps[runAt];
    step.loops = { ...step.loops, ...rewriteKeys(donorIn.loops) };
  }

  // The donor's MIDDLE steps become the host's next steps, in order, right after the run's
  // start: each is a press on the default path, so a multi-step graphic keeps its reveals
  // instead of collapsing into its entrance.
  for (const [i, mid] of donorMiddles.entries()) {
    const at = runAt + 1 + i;
    const added = addStep(data, at);
    if (!added) return { error: 'could not add the steps this graphic needs to this timeline' };
    data = added;
    data = renameStep(data, at, middleStepName(variant.name, mid.name, i)) ?? data;
    const step = data.steps[at];
    step.duration = scaled(mid.duration);
    if (mid.ease) step.ease = mid.ease;
    mergeLayers(step, prepLayers(mid.layers));
    if (mid.loops) step.loops = { ...step.loops, ...rewriteKeys(mid.loops) };
    // `reveals`/`hides` are selectors like every other — they ride through the same
    // namespace rewrite, so the donor's press-by-press reveal order survives intact.
    const reveals = (mid.reveals ?? []).map(rewrite);
    if (reveals.length > 0) step.reveals = [...(step.reveals ?? []), ...reveals];
    const hides = (mid.hides ?? []).map(rewrite);
    if (hides.length > 0) step.hides = [...(step.hides ?? []), ...hides];
  }

  const exit = data.steps[data.steps.length - 1];
  exit.duration = Math.max(exit.duration, scaled(donorOut.duration));
  mergeLayers(exit, outLayers);
  // Hold the inserted root through its children's exit and clear it at the same boundary.
  exit.layers[`#${gfxId}`] = { opacity: [{ time: 0, value: 1 }, { time: exit.duration, value: 1 }] };
  (exit.hides ??= []).push(`#${gfxId}`);

  const js = writeAnimData(current.js, data);
  if (!js) return { error: 'could not write the merged animation data' };

  // ── Assemble: html + css + definition + assets + layer metadata ────────────
  const settings = { ...current.settings, steps: String(spxSteps(data)) };
  let html = insertGraphicHtml(current.html, htmlSnippet);
  html = replaceDefinitionInHtml(html, settings, fields);
  const css = appendCss(current.css, `Inserted graphic: ${variant.name}`, donorCss);
  const assets = [
    ...current.assets,
    ...donor.assets.filter((a) => !current.assets.some((c) => c.path === a.path)),
  ];

  let next: SpxTemplate = { ...current, html, css, js, fields, settings, assets };
  next = addLayer(next, { id: gfxId, type: 'container', label: variant.name, styles: {} });
  return { template: next, selector: `#${gfxId}` };
}
