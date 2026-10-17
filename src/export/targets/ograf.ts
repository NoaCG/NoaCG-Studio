import { scriptKind } from '../../model/scriptKind';
import { prepareOutRuntime } from '../../blocks/animMigration';
// OGraf export: packages the template as an EBU OGraf v1 Graphic — a manifest
// (<slug>.ograf.json) plus a JS entry point (graphic.mjs) exporting a Web Component that
// wraps the template's own play()/stop()/update() runtime. Spec:
// https://ograf.ebu.io/v1/specification/docs/Specification.html
// The generated .mjs stays readable, mirroring the 1:1 philosophy of the SPX exporters.

import JSZip from 'jszip';
import gsapSource from '../../assets/gsap.min.js?raw';
import { flexGapShimSource } from '../../assets/flexGapSupport';
import lottieSource from '../../assets/lottie.min.js?raw';
import { inlineAssetRefs, isLottieAsset, parseDataUrl } from '../../assets/assetUtils';
import { templateUsesLottie } from '../../assets/lottieSupport';
import { ANIM_CALL_NAME_RE, animSounds, parseAnimData, type AnimStep } from '../../blocks/animData';
import { SOUND_RUNTIME_JS } from '../../assets/graphicSoundRuntime';
import { hasProductionSound } from '../../assets/productionSounds';
import { eventButtons, kindForField, type ControlButton } from '../../control/controlModel';
import { stripLiveData } from '../../control/liveData';
import { stripRealtimeControl } from '../../control/realtimeControl';
import { sourceHash } from '../../model/contentHash';
import type { Ftype, SpxField, SpxTemplate, TemplateType } from '../../model/types';
import { RENDER_RUNTIME_JS, GSAP_DETACH_JS } from '../../render/runtimeScript';
import { addReferencedFonts, projectFormatReadme } from '../common';
import { slug } from '../../model/slug';
import { fieldReferenceMd } from '../fieldReference';
import type { ExportTarget, GraphicUsage } from '../registry';
import { spxLayerFor } from './spxStarter';
import { SPX_TYPED_JS } from '../spxText';
import { OGRAF_SCHEMA_URL, validateOgrafManifest, validateOgrafPackage } from './ografSchema';

export { OGRAF_SCHEMA_URL, validateOgrafManifest, validateOgrafPackage };

// ── Manifest ─────────────────────────────────────────────────────────────────

/** Map an SPX ftype to the JSON-schema type of the OGraf data property. */
function schemaType(ftype: Ftype): 'string' | 'number' | 'boolean' {
  if (ftype === 'number') return 'number';
  if (ftype === 'checkbox') return 'boolean';
  return 'string';
}

/**
 * A field's default, TYPED as the schema declares it. SPX field values are always strings, and
 * OGraf's gdd/basic-types.json types `default` by the property's own `type` — so a checkbox
 * declared `"type": "boolean"` with the string `"true"` is an invalid manifest, and the kind of
 * mismatch a host either rejects outright or silently coerces into something else on air.
 * `true`/`false` is the on/off wire form the field reference already documents.
 */
function schemaDefault(field: SpxField): string | number | boolean {
  if (field.ftype === 'number') return Number(field.value) || 0;
  if (field.ftype === 'checkbox') return /^(?:true|1|yes|on|checked)$/i.test(field.value.trim());
  return field.value;
}

/**
 * A field's control in the standard's own vocabulary (gdd/gdd-types.json): the GDD type any
 * controller draws its input from, with what that type requires - a select's `enum` and labels,
 * an image path's extensions, a colour's pattern and its default spelt the way the pattern reads.
 * ograf-form, the reference controller's form, draws a colour picker, a text area or an image
 * path from these where it would otherwise draw a text box.
 *
 * Null where the JSON type already says it all (a number, a checkbox, an input-only value) and
 * where no GDD type can hold the field: a dropdown with no items has no `enum`, and a colour the
 * author wrote as a name or `rgba()` fits neither hex pattern.
 */
function gddFor(f: SpxField): Record<string, unknown> | null {
  switch (f.ftype) {
    case 'textfield':
      return { gddType: 'single-line' };
    case 'textarea':
      return { gddType: 'multi-line' };
    case 'dropdown':
      return f.items?.length
        ? {
            gddType: 'select',
            enum: f.items.map((i) => i.value),
            gddOptions: { labels: Object.fromEntries(f.items.map((i) => [i.value, i.text])) },
          }
        : null;
    case 'filelist':
      return {
        gddType: 'file-path/image-path',
        gddOptions: { extensions: (f.extension || 'png').split(',').map((e) => e.trim().replace(/^\./, '')).filter(Boolean) },
      };
    case 'color': {
      const hex = hexColor(f.value);
      if (!hex) return null;
      return hex.length === 9
        ? { gddType: 'color-rrggbbaa', pattern: '^#[0-9a-f]{8}$', default: hex }
        : { gddType: 'color-rrggbb', pattern: '^#[0-9a-f]{6}$', default: hex };
    }
    default:
      return null;
  }
}

/** A CSS hex colour as the GDD colour types write it, lower case with every digit spelt out, or null. */
function hexColor(value: string): string | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  const digits = m[1].length <= 4 ? [...m[1]].map((d) => d + d).join('') : m[1];
  return `#${digits.toLowerCase()}`;
}

/** One field as a GDD property: its JSON type, title, typed default and GDD type. */
function fieldProperty(f: SpxField): Record<string, unknown> {
  return { type: schemaType(f.ftype), title: f.title || f.field, default: schemaDefault(f), ...gddFor(f) };
}

/** The control kinds a property's JSON type already gives back without a hint. */
const TYPED_KINDS = new Set(['text', 'number', 'toggle']);

/**
 * Build the OGraf data schema from the template's DataFields (one property per fN).
 *
 * The JSON-schema `type` is a 3-way collapse (string / number / boolean); the CONTROL kind the
 * property came from - a line list, a colour, an image path - is said with the standard's GDD
 * type (`gddFor`). Only a field no GDD type can hold (a colour that is not hex, a dropdown with no
 * items) keeps the per-property `v_noacg.kind` vendor hint (spec: vendor fields are `v_`-prefixed
 * and allowed in every manifest object), so a reader that knows NoaCG still gets it back exactly.
 */
function dataSchema(fields: SpxField[]) {
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    if (!['textfield', 'textarea', 'number', 'dropdown', 'filelist', 'checkbox', 'color', 'hidden'].includes(f.ftype)) continue;
    const property = fieldProperty(f);
    const kind = kindForField(f);
    const spx = spxFieldHint(f);
    properties[f.field] = {
      ...property,
      ...(f.ftype === 'hidden' ? { hidden: true } : {}),
      ...(kind && !('gddType' in property) && !TYPED_KINDS.has(kind) ? { v_noacg: { kind } } : {}),
      ...(spx ? { v_spx: spx } : {}),
    };
  }
  return { type: 'object', properties };
}

/**
 * The per-property `v_spx` hint: the SPX field type the field already is, so SPX 1.4's OGraf
 * import (`addOgrafTemplateToProfile` in SPX's routes/routes-application.js) draws the
 * operator's own control - a dropdown with its items, a colour picker, a text area, a file
 * list - instead of the text box it draws for any string without one. A checkbox carries none:
 * SPX's own boolean conversion is the one that writes its value as "1"/"0", while the hint path
 * would copy the typed `true` verbatim. Other renderers ignore the key (spec: `v_` vendor data).
 */
function spxFieldHint(f: SpxField): Record<string, unknown> | null {
  if (f.ftype === 'checkbox') return null;
  if (f.ftype === 'dropdown') return { ftype: 'dropdown', items: (f.items ?? []).map((i) => ({ text: i.text, value: i.value })) };
  if (f.ftype === 'filelist') {
    return { ftype: 'filelist', assetfolder: f.assetfolder || './images/', extension: f.extension || 'png' };
  }
  return { ftype: f.ftype };
}

/**
 * The manifest-level `v_spx` block: the layer and out mode SPX 1.4 copies into its template
 * definition on import. Without it SPX writes the layer `"NaN"` (its `max5(undefined)` is the
 * truthy string "NaN", so the `|| "1"` default never applies) and Play shows nothing, in
 * silence (docs/SPX_ON_A_REAL_SERVER.md §3). The layer is the one the native SPX export gives
 * the same graphic (`spxLayerFor`), so the two packages land alike, inside SPX Solo's five.
 * SPX also bakes this layer into every custom-action button it generates. The out mode is the
 * graphic's own (`manual`, `none`, or the hold in ms), so SPX times a graphic that leaves by
 * itself as its native package does.
 */
function spxManifestHint(template: SpxTemplate): Record<string, string> {
  const layer = String(spxLayerFor(template));
  const out = /^(\d+|none)$/.test(template.settings.out ?? '') ? template.settings.out : 'manual';
  return { playlayer: layer, webplayout: layer, out };
}

/**
 * The hold in ms of a graphic set to leave by itself (the SPX `out` setting as a number), else
 * null: `manual` waits for Stop and `none` stays.
 */
function timedOutMs(template: SpxTemplate): number | null {
  return /^\d+$/.test(template.settings.out ?? '') ? Number(template.settings.out) : null;
}

/**
 * The entrance's length in ms, read off the graphic's own timeline as `actionDurations` reads it,
 * or null for a timeline we cannot read (hand-written GSAP), which the Graphic then measures.
 * The hold of a graphic that leaves by itself starts when its entrance has landed.
 */
function entranceMs(template: SpxTemplate): number | null {
  const data = parseAnimData(template.js);
  if (!data || data.steps.length < 2) return null;
  const speed = data.speed > 0 ? data.speed : 1;
  return Math.max(0, Math.round((data.steps[0].duration / speed) * 1000));
}

/**
 * The state machine's operator events as OGraf custom actions (spec §2 Action). The list is
 * the SAME merge every control surface renders (controlModel eventButtons — declared labels
 * from `machine.controls`, plain buttons for undeclared events), so an OGraf host offers
 * exactly what the Control tab does. An event's payload fields become the action's payload
 * schema, titled from the template's own fields.
 */
function customActions(template: SpxTemplate): Array<Record<string, unknown>> {
  // The payload keys ARE field ids, so each one is declared as its own field is in the data
  // schema (`fieldProperty`) — a number field described as a string would have the host's
  // generated form send text where the graphic expects a number.
  const byId = new Map(template.fields.map((f) => [f.field, f]));
  return eventButtons(template.js).map((button: ControlButton) => ({
    id: button.event,
    name: button.label,
    ...(button.section ? { description: `${button.section} — fires the "${button.event}" event.` } : {}),
    // The button's grouping, its destructive flag and its adjust deltas have no standard
    // carrier; they ride the per-action vendor object so a NoaCG reader
    // (control/ografContract.ts) rebuilds the operator surface exactly, and any other renderer
    // ignores it. An ADJUSTED field (a goal's +1) is ALSO a payload property of the action's
    // schema: a generic OGraf host offers it as an input to the action, which is honest - the
    // action takes a new score - and a NoaCG host computes it from the delta instead. A SET
    // field (a score board's "New game" putting a score back to 0) rides the same way and for
    // the same reason: the action really does take a new score, and only a NoaCG host knows
    // which figure the button declares.
    // An ADDED list (a puzzle's Reveal letter) rides the same way again: the action takes the new
    // list, and only a NoaCG host knows which box the line comes from.
    ...(button.section || button.destructive || button.adjust || button.set || button.add || button.remove
      ? {
          v_noacg: {
            ...(button.section ? { section: button.section } : {}),
            ...(button.destructive ? { destructive: true } : {}),
            ...(button.adjust ? { adjust: button.adjust } : {}),
            ...(button.set ? { set: button.set } : {}),
            ...(button.add ? { add: button.add } : {}),
            ...(button.remove ? { remove: button.remove } : {}),
          },
        }
      : {}),
    // `schema` is ALWAYS written, and `null` is a statement rather than a gap: the spec makes
    // the field explicitly nullable, and null means "this action takes no parameters". Omitting
    // it instead leaves a host unable to tell an action that needs no input from one whose
    // author forgot to describe it — so a generated operator form has to guess whether to draw
    // anything. Our own reader (control/ografContract.ts) treats both the same way, but a
    // stranger's does not have to.
    ...(button.payload?.length || button.adjust || button.set || button.add || button.remove
      ? {
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              [
                ...(button.payload ?? []),
                ...Object.keys(button.adjust ?? {}),
                ...Object.keys(button.set ?? {}),
                ...Object.keys(button.add ?? {}),
                ...Object.keys(button.remove ?? {}),
              ].map((key) => {
                const field = byId.get(key);
                return [
                  key,
                  field ? fieldProperty(field) : { type: 'string', title: key },
                ];
              }),
            ),
          },
        }
      : { schema: null }),
  }));
}

/**
 * `actionDurations` — how long each action animates, in milliseconds, read off the graphic's
 * OWN timeline rather than guessed. A playout host uses these to pre-roll a take and to know
 * when a step has landed, so they are worth emitting exactly: `steps[i]` is the timeline of
 * default-path waypoint `i` (the positional binding), which is the same `i` OGraf calls a
 * step, and the last step is the exit — the duration of `stopAction`.
 *
 * Speed-relative seconds become wall-clock ms by dividing by the block's `speed` knob, the
 * same arithmetic the interpreter does at playback.
 *
 * Omitted entirely for a template whose timeline we cannot read (hand-written GSAP, an
 * imported foreign template): the spec's answer to "unknown" is to say nothing, not to guess.
 * A custom action's duration DOES depend on where the machine is when it fires, so those are
 * declared `-1` — the spec's own value for dynamic.
 */
function actionDurations(template: SpxTemplate, stepCount: number, actionIds: string[]): Array<Record<string, unknown>> {
  const data = parseAnimData(template.js);
  if (!data || data.steps.length < 2) return [];
  const speed = data.speed > 0 ? data.speed : 1;
  const ms = (seconds: number) => Math.max(0, Math.round((seconds / speed) * 1000));
  const steps = data.steps;
  const perStep: Array<{ step: number; duration: number }> = [];
  for (let i = 0; i < stepCount && i < steps.length - 1; i++) perStep.push({ step: i, duration: ms(steps[i].duration) });
  const exit = ms(steps[steps.length - 1].duration);
  const hold = timedOutMs(template);
  return [
    {
      type: 'playAction',
      // The action-level value is the fallback for any step the list below does not name. A
      // graphic with no steps plays its entrance, its hold and its exit in this one action.
      duration: hold !== null ? (entranceMs(template) ?? 0) + hold + exit : perStep[0]?.duration ?? 0,
      ...(perStep.length ? { steps: perStep } : {}),
    },
    { type: 'stopAction', duration: exit },
    // update() writes field values into the DOM; nothing animates on a data change.
    { type: 'updateAction', duration: 0 },
    ...actionIds.map((id) => ({ type: 'customAction', customActionId: id, duration: -1 })),
  ];
}

/**
 * `renderRequirements` — the canvas and frame rate the graphic was AUTHORED for. Declared as
 * `ideal` rather than `exact`: the spec treats these as matching constraints, and an exact
 * 1920×1080 would read as "refuse to render me anywhere else" for a graphic that scales
 * perfectly well. This states the authored format (the same statement the package README and
 * the `noacg-project-format` meta tag carry) without excluding a renderer.
 */
function renderRequirements(template: SpxTemplate): Array<Record<string, unknown>> {
  return [
    {
      resolution: {
        width: { ideal: template.resolution.width },
        height: { ideal: template.resolution.height },
      },
      frameRate: { ideal: template.fps },
    },
  ];
}

/**
 * The manifest `id` — and, because a real renderer uses it that way, a legal CUSTOM ELEMENT NAME.
 *
 * The spec only says an id is any unicode except "/", so `hairline` reads as conformant. It is
 * not loadable. SuperFly.tv's OGraf server — the community renderer the EBU's own README points
 * at — registers the Graphic with `customElements.define(manifest.id, class)`, and the HTML
 * standard requires such a name to start with an ASCII lowercase letter and to contain a hyphen.
 * Our slugs are lowercase with UNDERSCORE separators, so every NoaCG package failed that call
 * with `"hairline" is not a valid custom element name` before the graphic was ever mounted.
 * Nothing in the manifest schema catches it; it is a spec-legal id that no browser can register.
 *
 * The `noacg-` prefix supplies the required hyphen whatever the design is called, guarantees the
 * leading letter (a graphic named "3 Up" slugs to `3_up`), and keeps the id off the HTML
 * standard's reserved names. It is also the namespace the spec's reverse-DNS recommendation is
 * really asking for, in the shape a browser can take. Folder and file names keep the plain slug:
 * they follow the SPX and CasparCG conventions, and the id has never had to match them.
 */
export function ografGraphicId(name: string): string {
  return `noacg-${slug(name).replace(/_/g, '-')}`;
}

/**
 * NoaCG's OWN vendor block on the manifest - `v_noacg`, the standard's extension mechanism
 * (every manifest object admits `v_`-prefixed fields) used for exactly what plain OGraf cannot
 * express about a NoaCG-made Graphic and nothing more:
 *
 *  - `type`: the NoaCG graphic type (a `TemplateType`), which an SPX/OGraf file has no slot
 *    for and the import lane otherwise has to guess (`blank`);
 *  - `source`: where the EDITABLE sources sit in this package when it carries them - the SPX
 *    layout files (`<slug>.html`, `css/template.css`, `js/template.js`) from which the manifest
 *    and `graphic.mjs` were generated. A package with sources is both a valid OGraf Graphic and
 *    an editable NoaCG workspace; renderers ignore the sources, NoaCG ignores the generated half;
 *  - `sourceHash`: the sources' content hash at generation time, so a reader can tell a fresh
 *    package from one whose sources were edited after the generated half was written (a stale
 *    `graphic.mjs` is the one way the two halves can disagree);
 *  - `generator`: who wrote the package.
 *
 * Everything else a round trip needs already lives in the sources themselves (the definition
 * with its DataFields and playout settings, the NOACG_ANIM machine) or in standard fields.
 * Deliberately NOT a manifest of its own: the format IS OGraf, this is a sticker on it.
 */
export interface NoacgVendorBlock {
  format: 'noacg-graphic';
  version: 1;
  type: TemplateType;
  source?: { html: string; css: string; js: string };
  sourceHash: string;
  generator: string;
}

/** The SPX-layout source paths a dual package writes (export/noacgPackage.ts). */
export function noacgSourcePaths(template: SpxTemplate): NonNullable<NoacgVendorBlock['source']> {
  return { html: `${slug(template.name)}.html`, css: 'css/template.css', js: 'js/template.js' };
}

/**
 * The vendor block for a template. `source` only when the package carries the sources, and
 * then `sourceHash` is the hash of those FILES AS WRITTEN (the caller reads them back off the
 * zip and passes it) - not of the in-memory template, because the packaged html also carries
 * the project-format meta and the control receiver that the importer strips again, and a hash
 * that a round trip cannot reproduce detects nothing. Without sources it hashes the template.
 */
export function noacgVendorBlock(
  template: SpxTemplate,
  opts: { source?: NoacgVendorBlock['source']; sourceHash?: string } = {},
): NoacgVendorBlock {
  return {
    format: 'noacg-graphic',
    version: 1,
    type: template.type,
    ...(opts.source ? { source: opts.source } : {}),
    sourceHash: opts.sourceHash ?? sourceHash(template),
    generator: 'noacg-studio',
  };
}

/** One manifest `thumbnails[]` entry (spec §2): a PNG/JPG/GIF/webp the package contains. */
export interface OgrafThumbnail {
  file: string;
  resolution?: { width: number; height: number };
}

export interface OgrafManifestOptions {
  /** NoaCG's vendor block (`v_noacg`). Absent = plain OGraf, exactly as before. */
  noacg?: NoacgVendorBlock;
  /** Preview images the PACKAGE carries (the caller writes the files; `addOgrafPackage`
   *  checks they exist). Absent = no `thumbnails` field. */
  thumbnails?: OgrafThumbnail[];
}

/** The .ograf.json manifest (required fields per spec §2 + the field-driven data schema). */
/**
 * The manifest's `stepCount`, which the Graphic's step walk uses too. A graphic set to leave by
 * itself after N ms is `0`, the standard's graphic that animates in and out by itself: its
 * playAction plays the entrance, holds N ms and plays the exit, as the studio preview, SPX and
 * the HTML overlay do with no operator pressing Continue, so the walk's further steps are not
 * offered. Every other graphic is the default path's length, at least 1: NoaCG's "it stays"
 * (`out: 'none'`) never leaves, which is 1, not 0. `-1` is an unknown count, and a default path
 * is a fixed list.
 */
function ografStepCount(template: SpxTemplate): number {
  if (timedOutMs(template) !== null) return 0;
  return Math.max(1, Number(template.settings.steps) || 1);
}

/**
 * THE STEP WALK, ONE COPY for both of the Graphic's clocks: the real-time `_playAction` and the
 * non-real-time document's scheduled actions (`offlineDocument`) run this same source, so the two
 * cannot drift. They had: only the real-time copy stopped when a machine's arrow took the graphic
 * off air, and only the other refused to play from off air towards a step below 0. Plain ES5, as
 * the non-real-time copy runs as a classic script in its render frame.
 *
 * From `step` (-1 = off air) towards OGraf's target (`goto`, else `step + delta`, delta 1 by
 * default): the first play runs the entrance, which shows step 0; each further step is the
 * template's next(), which RETURNS what it started, or null when a machine declines the move (off
 * its default path, or nothing left but the exit), and a refusal ends the walk so the pointer
 * never runs ahead of the graphic; a press that took the graphic off air (a machine may author
 * the arrow INTO its exit) ends it at -1; and a target past the last step plays the exit, the
 * OGraf step model's "go to the end". Answers the step the graphic is on, -1 once it has left.
 * `ografOffAir` is the machine's answer to "has it left": every group back at its initial state.
 *
 * `ografEntranceMs` is the entrance's length when the export could not read it (`entranceMs`):
 * read off a paused throwaway copy of the entrance timeline as the HTML overlay reads it, 0 when
 * there is none or GSAP reports one that loops forever.
 */
const STEP_WALK_JS = `function ografPlayStep(step, params, count, graphic) {
  var target = params.goto != null && params.goto >= 0 ? params.goto : step + (params.delta != null ? params.delta : 1);
  if (step < 0) { graphic.play(); step = 0; }
  while (step < target && step < count - 1) {
    if (!graphic.next()) break;
    step += 1;
    if (graphic.offAir()) return -1;
  }
  if (target >= count) { graphic.stop(); return -1; }
  return step;
}
function ografOffAir(groups, offStates) {
  return Object.keys(groups).every(function (id) { return groups[id] === offStates[id]; });
}
function ografEntranceMs(build) {
  if (typeof build !== 'function') return 0;
  var probe = build();
  if (!probe || typeof probe.duration !== 'function') return 0;
  probe.pause();
  var seconds = probe.duration();
  probe.kill();
  return seconds >= 1e7 ? 0 : seconds * 1000;
}`;

/**
 * Each state group's off-air (initial) state, so the walk can tell when a press took the graphic
 * off air by itself. Empty for a template with no machine: such a graphic never reports off air.
 */
function offStatesOf(template: SpxTemplate): Record<string, string> {
  const machine = parseAnimData(template.js)?.machine;
  return Object.fromEntries((machine?.groups ?? []).map((g) => [g.id, g.initial]));
}

export function buildOgrafManifest(
  template: SpxTemplate,
  usage: GraphicUsage = 'live',
  opts: OgrafManifestOptions = {},
): Record<string, unknown> {
  const stepCount = ografStepCount(template);
  const actions = customActions(template);
  const durations = actionDurations(template, stepCount, actions.map((a) => a.id as string));
  const data = parseAnimData(template.js);
  const hasSounds = hasProductionSound(template.js) || (data && animSounds(data).some(s => s.enabled));
  return {
    $schema: OGRAF_SCHEMA_URL,
    id: ografGraphicId(template.name),
    version: '1.0.0',
    name: template.name,
    description: template.settings.description || template.name,
    main: 'graphic.mjs',
    supportsRealTime: usage !== 'post-production',
    supportsNonRealTime: usage !== 'live',
    schema: dataSchema(template.fields),
    stepCount,
    ...(actions.length ? { customActions: actions } : {}),
    ...(durations.length ? { actionDurations: durations } : {}),
    renderRequirements: renderRequirements(template),
    ...(opts.thumbnails?.length ? { thumbnails: opts.thumbnails } : {}),
    ...(opts.noacg ? { v_noacg: opts.noacg } : {}),
    ...(hasSounds ? { v_noacg_audio: { version: 1, requires: 'web-audio', receivingHostRehearsal: true } } : {}),
    v_spx: spxManifestHint(template),
  };
}

export interface OgrafOfflineCompatibility {
  compatible: boolean;
  errors: string[];
  warnings: string[];
}

/** Conservative target-specific gate. Non-real-time is advertised only for templates whose
 * authored NoaCG timeline can be replayed against the shared virtual clock. */
export function validateOgrafOfflineCompatibility(template: SpxTemplate): OgrafOfflineCompatibility {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!parseAnimData(template.js)) {
    errors.push('Post-production export requires a readable NOACG_ANIM timeline.');
  }
  const source = `${template.html}\n${template.css}\n${template.js}`;
  if (/https?:\/\//i.test(source.replace(OGRAF_SCHEMA_URL, '')) || /(?:src|href)\s*=\s*["']\/\//i.test(source)) {
    errors.push('External network dependencies are not available during deterministic rendering.');
  }
  if (/\bMath\.random\s*\(|\bcrypto\.(?:getRandomValues|randomUUID)\s*\(/.test(template.js)) {
    errors.push('Unseeded randomness is not deterministic.');
  }
  if (/<(?:video|audio)\b/i.test(template.html)) {
    errors.push('Media playback is not seekable in OGraf non-real-time mode.');
  }
  const soundData = parseAnimData(template.js);
  if (hasProductionSound(template.js) || (soundData && animSounds(soundData).some(s => s.enabled))) errors.push('Enabled sound attachments require real-time audio. Disable sounds for a silent post-production export.');
  if (/(?:^|[;{])\s*animation(?:-name)?\s*:/im.test(template.css)) {
    errors.push('CSS animations are wall-clock driven; move this motion into the NoaCG timeline.');
  }
  if (/\b(?:fetch|WebSocket|EventSource)\s*\(/.test(stripRealtimeControl(stripLiveData(template.js.replace(SOUND_RUNTIME_JS, ''))))) {
    errors.push('Live-only network code remains after removing NoaCG live-control blocks.');
  }
  if (/\belement\.animate\s*\(|\.animate\s*\(\s*\[/.test(template.js)) {
    errors.push('Web Animations API calls are not controlled by the NoaCG seek clock.');
  }
  if (templateUsesLottie(template)) {
    warnings.push('Lottie is driven by the virtual frame clock; verify the exported package in the target renderer.');
  }
  return { compatible: errors.length === 0, errors, warnings };
}

// ── The Web Component entry point ────────────────────────────────────────────

/** Visible markup plus inert data blocks, scoped to this graphic rather than the host head. */
function bodyContent(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const body = m ? m[1] : html;
  const scripts = /<script\b([^>]*)>[\s\S]*?<\/script>/gi;
  const head = m ? /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '' : '';
  const data = [...head.matchAll(scripts)].filter(tag => scriptKind(tag[1]) === 'data').map(tag => tag[0]);
  const markup = body.replace(scripts, (tag, attrs: string) => scriptKind(attrs) === 'data' ? tag : '');
  return [...data, markup.trim()].join('\n');
}

/** The markup embedded in graphic.mjs is injected into the HOST page, whose base URL is
 *  the renderer's — not the package folder — so a relative data-lottie path would resolve
 *  against the wrong place. Inline the Lottie JSON assets as data: URLs at export time;
 *  the template's bootstrap decodes them without any network call. (Image/font refs
 *  resolve relative to the host page too, but OGraf hosts conventionally serve the
 *  package's folder as the page context; the Lottie inline removes the one hard failure.) */
function templateHtmlForModule(template: SpxTemplate): string {
  const lottieAssets = template.assets.filter((a) => isLottieAsset(a.path));
  return lottieAssets.length ? inlineAssetRefs(template.html, lottieAssets) : template.html;
}

function scriptSafe(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

/** Isolated document used only for non-real-time seeks. Rebuilding it for every request is
 * the reset boundary that makes backward and shuffled seeks independent of prior frames. */
function offlineDocument(template: SpxTemplate, lib: OgrafLibPaths = DEFAULT_LIB): string {
  const js = stripRealtimeControl(stripLiveData(template.js));
  const lottie = templateUsesLottie(template)
    ? `<script src="${lib.lottie}"></script>`
    : '';
  // A graphic set to leave by itself schedules its exit on this document's virtual clock, so a
  // seek past the hold renders it gone, as the real-time Graphic is.
  const bridge = `
${STEP_WALK_JS}
var __ografStep = -1;
var __ografOutMs = ${timedOutMs(template)};
var __ografEntranceMs = ${entranceMs(template)};
var __ografExit = null;
var __ografOffStates = ${JSON.stringify(offStatesOf(template))};
var __ografGraphic = {
  play: function () { play(); },
  next: function () { return next(); },
  stop: function () { stop(); },
  offAir: function () {
    return typeof noacgMachineState === 'function' && ografOffAir(noacgMachineState().groups, __ografOffStates);
  }
};
window.__noacgScheduledAction = function (entry) {
  if (!entry || !entry.action) return;
  var action = entry.action;
  var params = action.params || {};
  if (action.type === 'updateAction') {
    update(JSON.stringify(params.data || {}));
    return;
  }
  if (__ografExit !== null) { clearTimeout(__ografExit); __ografExit = null; }
  if (action.type === 'stopAction') {
    stop(); __ografStep = -1; return;
  }
  if (action.type === 'customAction') {
    if (typeof noacgDispatch === 'function') noacgDispatch(params.id, params.payload);
    return;
  }
  if (action.type !== 'playAction') return;
  if (__ografOutMs !== null) {
    var wait = (__ografEntranceMs !== null ? __ografEntranceMs : ografEntranceMs(typeof buildInTimeline === 'function' ? buildInTimeline : null)) + __ografOutMs;
    play(); __ografStep = 0;
    __ografExit = setTimeout(function () { __ografExit = null; stop(); __ografStep = -1; }, wait);
    return;
  }
  __ografStep = ografPlayStep(__ografStep, params, ${ografStepCount(template)}, __ografGraphic);
};`;
  return `<!doctype html><html><head>
<meta name="color-scheme" content="light">
<base href="__NOACG_BASE__">
<style>html,body{width:${template.resolution.width}px;height:${template.resolution.height}px;overflow:hidden;margin:0;background:transparent}${template.css}</style>
<script>${scriptSafe(RENDER_RUNTIME_JS)}</script>
<script src="${lib.flexGap}"></script>
<script src="${lib.gsap}"></script>
<script>${scriptSafe(GSAP_DETACH_JS)}</script>${lottie}
</head><body>${bodyContent(templateHtmlForModule(template))}
<script>${scriptSafe(js)}</script>
<script>${scriptSafe(bridge)}</script>
</body></html>`;
}

/** Where the bundled libraries sit inside the package, relative to `graphic.mjs`. The plain
 *  OGraf package keeps them under `lib/`; the dual package (export/noacgPackage.ts) shares the
 *  SPX layout's `js/` copies instead of shipping GSAP twice. */
export interface OgrafLibPaths {
  gsap: string;
  lottie: string;
  /** The flex-gap shim for an older playout engine (src/assets/flexGapSupport.ts). */
  flexGap: string;
}
const DEFAULT_LIB: OgrafLibPaths = { gsap: 'lib/gsap.min.js', lottie: 'lib/lottie.min.js', flexGap: 'lib/flex-gap-shim.js' };

// ── The stylesheet, re-addressed from the document to the graphic's canvas ───────────────────

/** The closing quote of the string that opens at `at` (escapes honoured); `css.length` if unclosed. */
function closingQuote(css: string, at: number): number {
  const quote = css[at];
  for (let i = at + 1; i < css.length; i += 1) {
    if (css[i] === '\\') {
      i += 1;
      continue;
    }
    if (css[i] === quote) return i;
  }
  return css.length;
}

/** The `)` closing an unquoted `url(` that opens at `at`; `css.length` if it never closes. */
function closingUrl(css: string, at: number): number {
  const end = css.indexOf(')', at);
  return end === -1 ? css.length : end;
}

/**
 * Index of the first of `chars` at or after `from`, skipping comments, quoted strings and the
 * inside of an unquoted `url(...)` - a `data:image/svg+xml,<svg>{` value is legal CSS, and a
 * brace in it is not a block brace.
 */
function indexOutside(css: string, from: number, chars: string): number {
  for (let i = from; i < css.length; i += 1) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      i = closingQuote(css, i);
      continue;
    }
    if (/^url\(\s*[^\s"')]/i.test(css.slice(i, i + 6))) {
      i = closingUrl(css, i + 4);
      continue;
    }
    if (chars.includes(c)) return i;
  }
  return -1;
}

/** The `}` matching the `{` at `open`; the end of the text if the block never closes. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    const j = indexOutside(css, i, '{}');
    if (j === -1) return css.length;
    if (css[j] === '{') depth += 1;
    else if ((depth -= 1) === 0) return j;
    i = j + 1;
  }
  return css.length;
}

/**
 * A selector list split on its top-level commas. A comma inside `:is(a, b)`, `[title="a,b"]` or a
 * comment stays where it is - and a comment is skipped as a comment, so an apostrophe in
 * `/* don't *\/` is not the start of a string.
 */
export function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (c === '/' && list[i + 1] === '*') {
      const end = list.indexOf('*/', i + 2);
      i = end === -1 ? list.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      i = closingQuote(list, i);
      continue;
    }
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/** The `)` matching the `(` at `open` (strings skipped); `sel.length` if it never closes. */
function matchingParen(sel: string, open: number): number {
  let depth = 0;
  for (let i = open; i < sel.length; i += 1) {
    const c = sel[i];
    if (c === '"' || c === "'") {
      i = closingQuote(sel, i);
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')' && (depth -= 1) === 0) return i;
  }
  return sel.length;
}

/** A document-level compound - `html`, `body`, `:root`, type selectors being case-insensitive -
 *  with its own suffixes (`.dark`, `[lang]`, `:not(.x)`), which the element keeps. */
const DOC_COMPOUND = /^(?:html|body|:root)(?![\w-])((?:\.[\w-]+|#[\w-]+|\[[^\]]*\]|:[\w-]+(?:\([^()]*\))?)*)/i;
/** The combinator between two compounds. */
const COMBINATOR = /^(?:\s*[>~+]\s*|\s+)/;
/** A selector-list pseudo-class at the head of a selector: its arguments are the selectors. */
const HEAD_LIST_PSEUDO = /^:(is|where)\(/i;
/** A document token anywhere else in a selector (`.a :not(body)`), outside strings and brackets. */
const DOC_TOKEN = /(^|[\s>+~(,])(?:html|body|:root)(?![\w-])/gi;

/** Every document token after the head replaced by the element, strings and brackets left alone. */
function replaceDocTokens(sel: string, self: string): string {
  let out = '';
  let start = 0;
  for (let i = 0; i < sel.length; i += 1) {
    const c = sel[i];
    const skipTo = c === '"' || c === "'" ? closingQuote(sel, i) : c === '[' ? sel.indexOf(']', i) : -1;
    if (skipTo === -1 && c !== '[') continue;
    const end = skipTo === -1 ? sel.length : skipTo;
    out += sel.slice(start, i).replace(DOC_TOKEN, `$1${self}`) + sel.slice(i, end + 1);
    start = end + 1;
    i = end;
  }
  return out + sel.slice(start).replace(DOC_TOKEN, `$1${self}`);
}

/**
 * The leading run of document compounds - `body`, `html > body`, `html.dark body`, `:root` -
 * collapsed onto the element with its suffixes kept, followed by the rest of the selector; null
 * when the selector does not start on the document.
 */
function scopeHead(sel: string, self: string): string | null {
  let at = 0;
  let suffixes = '';
  for (;;) {
    const compound = DOC_COMPOUND.exec(sel.slice(at));
    if (!compound) break;
    suffixes += compound[1];
    at += compound[0].length;
    const combinator = COMBINATOR.exec(sel.slice(at));
    if (!combinator || !DOC_COMPOUND.test(sel.slice(at + combinator[0].length))) break;
    at += combinator[0].length;
  }
  return at === 0 ? null : `${self}${suffixes}${replaceDocTokens(sel.slice(at), self)}`;
}

/** One trimmed selector, re-addressed to the graphic's element. */
function scopeSelector(sel: string, self: string): string {
  // A nested `&` selector is not ours to rewrite.
  if (sel.startsWith('&')) return sel;
  // The universal reset applies to the graphic's element and everything inside it.
  if (sel === '*') return `${self}, ${self} *`;
  // `:is(:root, .x) .y`: the arguments are the selectors, each re-addressed on its own.
  const listPseudo = HEAD_LIST_PSEUDO.exec(sel);
  if (listPseudo) {
    const close = matchingParen(sel, listPseudo[0].length - 1);
    const inner = sel.slice(listPseudo[0].length, close);
    return `:${listPseudo[1]}(${scopeSelectorList(inner, self)})${replaceDocTokens(sel.slice(close + 1), self)}`;
  }
  // `body`, `html, body`, `:root`, `body .x`: the document's own elements ARE the graphic's.
  const head = scopeHead(sel, self);
  if (head) return head;
  // Everything else lives inside the graphic.
  return `${self} ${replaceDocTokens(sel, self)}`;
}

/** A selector list, each part re-addressed; the whitespace around the list is kept, the parts
 *  are joined house-style, and a part that became the same selector as an earlier one
 *  (`html, body`, `body, html, .x`) is written once. */
function scopeSelectorList(list: string, self: string): string {
  const lead = /^\s*/.exec(list)![0];
  const trail = /\s*$/.exec(list)![0];
  const parts = splitSelectors(list.trim()).map((part) => part.trim()).filter(Boolean);
  const unique = [...new Set(parts.map((part) => scopeSelector(part, self)))];
  return lead + unique.join(', ') + trail;
}

/** The at-rules whose block holds style rules of its own (and so is rewritten inside). */
const GROUPING_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'scope', 'document', 'starting-style']);

/**
 * The template's stylesheet, re-addressed from the DOCUMENT to the graphic's own element.
 *
 * A template is written as a page: `html, body` sizes the canvas and sets the typeface every
 * heading inherits, `*` resets margins, `:root` carries the style contract. Under SPX and
 * CasparCG that is exactly right, because the template IS the document. An OGraf Graphic is a
 * component in a RENDERER's document. Injected into its light DOM, as graphic.mjs did before the
 * shadow mount, those same rules restyled the host page - forced its body to 1920x1080, hid its
 * overflow, made it transparent, changed its font, zeroed every margin on it - and with two
 * graphics on two layers the last one loaded won. Inside the graphic's shadow root they match
 * nothing at all, because `html`, `body` and `:root` are the renderer's. Same shape as the ids
 * and the font paths before it (docs/OGRAF.md): correct where the template owns the page, wrong
 * the moment it is a component. Pinned by e2e/ograf-conformance.spec.ts.
 *
 * So the document's elements become the graphic's canvas: `body`, `html` and `:root` are
 * rewritten to `self`, `*` to the canvas and its descendants, and every other selector is
 * nested under it. `self` is a `:where()` selector, which has NO specificity, so the cascade
 * inside the graphic is untouched (`p` still loses to `.x`, the reset still loses to
 * everything). Comments,
 * strings, `@font-face`, `@keyframes` and block-less at-rules pass through verbatim; grouping
 * at-rules (`@media`, `@supports`, ...) are rewritten inside. The studio's code is untouched;
 * only what the package injects is re-addressed - the same treatment the font paths get.
 */
export function scopeCssToGraphic(css: string, self: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const stop = indexOutside(css, i, '{;');
    if (stop === -1) {
      out += css.slice(i);
      break;
    }
    // A block-less at-rule (`@import ...;`, `@layer a;`) ends at its semicolon.
    if (css[stop] === ';') {
      out += css.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    const close = matchingBrace(css, stop);
    const head = css.slice(i, stop);
    // Leading whitespace and comments stay where they are; the prelude is what follows them.
    const lead = /^(?:\s|\/\*[\s\S]*?\*\/)*/.exec(head)![0];
    const prelude = head.slice(lead.length);
    const inner = css.slice(stop + 1, close);
    let scopedPrelude = prelude;
    let scopedInner = inner;
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? '';
      if (GROUPING_AT_RULES.has(name)) scopedInner = scopeCssToGraphic(inner, self);
    } else {
      scopedPrelude = scopeSelectorList(prelude, self);
    }
    out += lead + scopedPrelude + '{' + scopedInner + css.slice(close, close + 1);
    i = close + 1;
  }
  return out;
}

/** The selector a package's stylesheet is scoped under: this design's canvas, at zero specificity. */
export function graphicSelfSelector(template: SpxTemplate): string {
  return `:where([data-noacg-graphic="${ografGraphicId(template.name)}"])`;
}

/** Every style rule's selector list in a parsed sheet, grouping at-rules walked, nested rules skipped. */
function styleRuleSelectors(rules: CSSRuleList): string[] {
  const out: string[] = [];
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) out.push(rule.selectorText);
    else if ('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) out.push(...styleRuleSelectors((rule as CSSGroupingRule).cssRules));
  }
  return out;
}

/** Every style rule's selector list in a stylesheet's text, as the browser's own parser reads it. */
function parseSelectors(css: string): string[] {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return styleRuleSelectors(sheet.cssRules);
}

/**
 * The export's FAIL-CLOSED gate on the rewrite: the scoped stylesheet is parsed by the browser's
 * own CSS parser, and the export refuses if any style rule's selector does not start with the
 * graphic's element, or if the rewrite lost a rule the original had (a selector the rewrite made
 * unparseable is dropped by the parser rather than reported). A hand-rolled walker has shapes it
 * has not met yet; this turns each of them from silent wrong output into an export that says so.
 * Returns the sheet it checked.
 */
export function assertScopedCss(original: string, scoped: string, self: string): string {
  if (typeof CSSStyleSheet === 'undefined') {
    throw new Error('OGraf export: the scoped stylesheet can only be verified where a CSS parser exists (a browser).');
  }
  const before = parseSelectors(original);
  const after = parseSelectors(scoped);
  if (after.length !== before.length) {
    throw new Error(`OGraf export: scoping the stylesheet changed its rule count (${before.length} -> ${after.length}) - a rewritten selector no longer parses.`);
  }
  // A part is scoped when it starts on the element, or is a head `:is()`/`:where()` whose every
  // argument does (`:is(S, S .x) .y` is how `:is(:root, .x) .y` comes back).
  const isScoped = (part: string): boolean => {
    if (part.startsWith(self)) return true;
    const head = HEAD_LIST_PSEUDO.exec(part);
    if (!head) return false;
    const close = matchingParen(part, head[0].length - 1);
    return splitSelectors(part.slice(head[0].length, close)).every((arg) => isScoped(arg.trim()));
  };
  const leaks = after.flatMap((list) => splitSelectors(list).map((part) => part.trim()).filter((part) => !isScoped(part)));
  if (leaks.length) {
    throw new Error(`OGraf export: ${leaks.length} rule(s) would still address the renderer's document: ${leaks.slice(0, 5).join(' | ')}`);
  }
  return scoped;
}

// ── The markup's own document-wide carriers ─────────────────────────────────────────────────

/** A reference to an id inside CSS or an attribute value: `url(#x)`. */
const URL_REF = /(url\(\s*['"]?#)([^'")\s]+)/gi;

/** `url(#id)` references in a piece of CSS or an attribute, each renamed id swapped for its new one. */
function renameUrlRefs(text: string, renames: Map<string, string>): string {
  if (!renames.size) return text;
  return text.replace(URL_REF, (whole, lead: string, id: string) => (renames.has(id) ? lead + renames.get(id) : whole));
}

/** A whole-token test for `word` in a text: not part of a longer identifier or id. */
function namesToken(text: string, word: string): boolean {
  return new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text);
}

/**
 * The ids the markup REFERENCES - a gradient, a clip path, a mask, a pattern or a `<use>` target -
 * renamed to this design's own (`SVGID_1_` becomes `SVGID_1_--noacg-quiz-board`), references
 * with them. The map of what was renamed comes back for the stylesheet's own references.
 *
 * Every Illustrator file names its first gradient `SVGID_1_`, and a reference resolves to the
 * FIRST element with that id in the document, so with two imported designs in one renderer the
 * second painted with the first one's gradient and lost it when the first was taken off air
 * (issue #789). An id is left as authored when anything else may look it up: a field's id, an id
 * the template's code names, or an id a selector names.
 */
function isolateMarkupIds(root: DocumentFragment, template: SpxTemplate, suffix: string): Map<string, string> {
  const sheets = Array.from(root.querySelectorAll('style'), (s) => s.textContent ?? '');
  const isHref = (attr: Attr) => /^(?:xlink:)?href$/i.test(attr.name) && attr.value.startsWith('#');
  const elements = Array.from(root.querySelectorAll('*'));
  const referenced = new Set<string>();
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      if (isHref(attr)) referenced.add(attr.value.slice(1));
      for (const m of attr.value.matchAll(URL_REF)) referenced.add(m[2]);
    }
  }
  for (const sheet of sheets) for (const m of sheet.matchAll(URL_REF)) referenced.add(m[2]);
  const renames = new Map<string, string>();
  if (!referenced.size) return renames;
  const fields = new Set(template.fields.map((f) => f.field));
  const selectors = parseSelectors([template.css, ...sheets].join('\n')).join('\n');
  const named = (id: string) => fields.has(id) || namesToken(template.js, id) || namesToken(selectors, `#${id}`);
  for (const el of elements) {
    if (el.id && referenced.has(el.id) && !named(el.id)) renames.set(el.id, `${el.id}--${suffix}`);
  }
  if (!renames.size) return renames;
  for (const el of elements) {
    if (renames.has(el.id)) el.id = renames.get(el.id)!;
    for (const attr of Array.from(el.attributes)) {
      const ref = isHref(attr) ? attr.value.slice(1) : null;
      if (ref !== null) attr.value = `#${renames.get(ref) ?? ref}`;
      else attr.value = renameUrlRefs(attr.value, renames);
    }
    if (el.localName === 'style') el.textContent = renameUrlRefs(el.textContent ?? '', renames);
  }
  return renames;
}

/** A stylesheet re-addressed to the graphic's element, then checked by the browser's parser. */
function scopeChecked(css: string, self: string): string {
  return assertScopedCss(css, scopeCssToGraphic(css, self), self);
}

/** The at-rules Chromium applies only from the document's own stylesheets, never from a shadow tree's. */
const DOCUMENT_AT_RULES = new Set(['font-face', 'property']);

/**
 * A stylesheet split in two: its `@font-face` and `@property` rules, and everything else. Inside a
 * shadow tree Chromium ignores both (measured: the face never registers and the text airs in the
 * fallback, the property keeps no initial value), so graphic.mjs hands them to the renderer's
 * `<head>`. A rule inside a grouping at-rule (`@supports`, `@media`) is lifted with its
 * group around it; comments and the rest of the sheet stay where they were.
 */
function liftDocumentRules(css: string): { css: string; lifted: string } {
  let kept = '';
  const lifted: string[] = [];
  let i = 0;
  while (i < css.length) {
    const stop = indexOutside(css, i, '{;');
    if (stop === -1) {
      kept += css.slice(i);
      break;
    }
    if (css[stop] === ';') {
      kept += css.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    const close = matchingBrace(css, stop);
    const head = css.slice(i, stop);
    const lead = /^(?:\s|\/\*[\s\S]*?\*\/)*/.exec(head)![0];
    const prelude = head.slice(lead.length);
    const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
    if (DOCUMENT_AT_RULES.has(name)) {
      kept += lead;
      lifted.push(css.slice(i + lead.length, close + 1));
    } else if (GROUPING_AT_RULES.has(name)) {
      const inner = liftDocumentRules(css.slice(stop + 1, close));
      if (inner.lifted) lifted.push(`${prelude}{${inner.lifted}}`);
      kept += head + '{' + inner.css + css.slice(close, close + 1);
    } else {
      kept += css.slice(i, close + 1);
    }
    i = close + 1;
  }
  return { css: kept, lifted: lifted.join('\n') };
}

/** A stylesheet's rules as the browser's own parser reads them: the ones a shadow tree ignores,
 *  and every other rule (style rules and their nested rules, keyframes); grouping wrappers apart. */
function ruleKinds(css: string): { document: number; other: number } {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const out = { document: 0, other: 0 };
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule || rule instanceof CSSPropertyRule) out.document += 1;
      else if (rule instanceof CSSStyleRule) {
        out.other += 1;
        walk(rule.cssRules);
      } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules);
      else out.other += 1;
    }
  };
  walk(sheet.cssRules);
  return out;
}

/**
 * The export's FAIL-CLOSED gate on the lift, as `assertScopedCss` is on the rewrite: read by the
 * browser's own parser, what stays holds no @font-face or @property rule and every other rule it
 * had, and what is lifted holds exactly those rules. A sheet the lift splits wrongly would air
 * in the fallback face with no error anywhere, so the export refuses instead.
 */
function assertLifted(original: string, split: { css: string; lifted: string }): { css: string; lifted: string } {
  if (typeof CSSStyleSheet === 'undefined') {
    throw new Error('OGraf export: the lifted stylesheet can only be verified where a CSS parser exists (a browser).');
  }
  const [before, kept, lifted] = [original, split.css, split.lifted].map(ruleKinds);
  if (kept.document || lifted.other || lifted.document !== before.document || kept.other !== before.other) {
    throw new Error(`OGraf export: lifting @font-face and @property out of the shadow tree changed the stylesheet (${JSON.stringify({ before, kept, lifted })}).`);
  }
  return split;
}

/**
 * The design's markup and stylesheet as graphic.mjs injects them, every document-wide carrier
 * kept to the graphic's own canvas.
 *
 * The stylesheet is re-addressed and checked (`scopeCssToGraphic`, `assertScopedCss`), and the
 * MARKUP's own carriers get the same treatment. An imported SVG carries the artwork's own `<style>` inside the inline `<svg>`, with
 * Illustrator's shared class names (`.st0`, `.cls-1`) and ids, and a hand-written template may
 * carry a `<style>` in its body. In a renderer's light DOM, where graphic.mjs mounted the design
 * before the shadow root, every such sheet and id was document-wide wherever it sat, so two
 * imported designs on two layers recoloured or hid each other's shapes (issue #789). So the
 * referenced ids become this design's own (`isolateMarkupIds`), and every `<style>` is
 * re-addressed to the canvas and checked exactly as the template's stylesheet is. Inside the
 * shadow root both are tree-scoped already, so the two rewrites are redundant there but harmless,
 * and dropping them is a separate simplification. The markup is PARSED for this, the way the
 * renderer parses it, so a sheet's entities, CDATA and comments and a self-closing `<style/>` in
 * SVG mean what they mean on air. Markup with neither a style nor a renamed id comes back byte
 * for byte.
 *
 * The `@font-face` and `@property` rules of the stylesheet and of every markup `<style>`, in
 * document order, come back on their own as `head` (`liftDocumentRules`): a shadow tree applies
 * neither.
 */
export function graphicSources(template: SpxTemplate): { html: string; css: string; head: string } {
  const self = graphicSelfSelector(template);
  const markup = bodyContent(templateHtmlForModule(template));
  const holder = document.createElement('template');
  holder.innerHTML = markup;
  const renames = isolateMarkupIds(holder.content, template, ografGraphicId(template.name));
  const head: string[] = [];
  const lift = (css: string) => {
    const split = assertLifted(css, liftDocumentRules(css));
    if (split.lifted) head.push(split.lifted);
    return split.css;
  };
  const css = lift(scopeChecked(renameUrlRefs(template.css, renames), self));
  const styles = Array.from(holder.content.querySelectorAll('style'));
  for (const style of styles) style.textContent = lift(scopeChecked(style.textContent ?? '', self));
  return {
    html: styles.length || renames.size ? holder.innerHTML : markup,
    css,
    head: head.join('\n'),
  };
}

/**
 * Names `graphic.mjs` declares at MODULE scope, which the hand-over below must never emit.
 *
 * The hand-over writes a bare identifier - `window.foo = (typeof foo === 'function') ? foo : …`
 * - inside `initTemplate`, so a name the wrapper also declares resolves up the scope chain to
 * the WRAPPER's function and the timeline would fire that instead of the template's. Skipping
 * such a name leaves it exactly as it behaves today, which is a silent no-op, rather than
 * calling the wrong function. Keep this in step with the declarations in `graphicModule`.
 */
const WRAPPER_BINDINGS = new Set([
  'ensureGsap', 'ensureFlexGap', 'ensureLottie', 'packageUrl', 'substitute', 'withPackageUrls', 'withPackagePaths',
  'scopedDocument', 'standIn', 'scopedListeners', 'scopedTimers', 'scopedWindow', 'scopedGsap', 'initTemplate', 'Graphic',
  'ografPlayStep', 'ografOffAir', 'ografEntranceMs', 'spxTyped',
]);

/**
 * Reserved words. `ANIM_CALL_NAME_RE` guarantees a bare IDENTIFIER, which is all the
 * interpreter's `window[name]` needs because there the name is a string. Here it is emitted as
 * CODE, so `window.delete = (typeof delete === 'function') ? …` is a SyntaxError and the whole
 * package stops parsing - a data quirk that is harmless everywhere else would make the graphic
 * fail to load at all.
 */
const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'await',
]);

/**
 * Every function name this graphic's TIMELINE fires by string: a step's lifecycle `calls` and
 * its measured-motion `dynamics` builders, on the default path and inside every state's own
 * timeline.
 *
 * The interpreter resolves both through `window[name]` and never through eval - that rule is
 * absolute (`ANIM_CALL_NAME_RE` in blocks/animData.ts states it). Under SPX and CasparCG the
 * template owns the page, so a top-level `function noacgRepaint()` IS `window.noacgRepaint`
 * and a bare name is enough. Inside an OGraf Graphic the same code runs inside `initTemplate`,
 * where those declarations are LOCAL - so the list is what `scopedWindow` has to be handed for
 * the timeline to keep working.
 *
 * Three kinds of name are dropped, and dropping one leaves it behaving exactly as it does
 * today: anything that is not a bare identifier (the data cannot legally carry one, and it
 * would reach the emitted code as code), a reserved word, and a name the wrapper itself
 * declares.
 */
function timelineFunctionNames(template: SpxTemplate): string[] {
  const data = parseAnimData(template.js);
  if (!data) return [];
  const stateTimelines = (data.machine?.groups ?? []).flatMap((g) =>
    g.states.map((s) => s.timeline).filter((t): t is AnimStep => !!t),
  );
  const names = new Set<string>();
  for (const step of [...data.steps, ...stateTimelines]) {
    for (const call of step.calls ?? []) names.add(call.call);
    for (const dynamic of step.dynamics ?? []) names.add(dynamic.build);
  }
  return [...names]
    .filter((name) => ANIM_CALL_NAME_RE.test(name) && !RESERVED_WORDS.has(name) && !WRAPPER_BINDINGS.has(name))
    .sort();
}

/** graphic.mjs: a readable Web Component wrapping the template's own runtime. */
function graphicModule(template: SpxTemplate, lib: OgrafLibPaths = DEFAULT_LIB): string {
  const stepCount = ografStepCount(template);
  const machine = parseAnimData(template.js)?.machine;
  const timelineNames = timelineFunctionNames(template);
  const offStates = offStatesOf(template);
  // The main group's walk + id and the manifest's custom-action ids: what customAction()
  // accepts, and how the wrapper re-derives its step pointer after an event moved the
  // machine (an event may land ON a waypoint — the pointer must follow the graphic).
  const mainGroup = machine?.groups[0] ?? null;
  const mainGroupId = mainGroup?.id ?? null;
  const mainPath = mainGroup?.defaultPath ?? [];
  const actionIds = customActions(template).map((a) => a.id as string);
  const graphicId = ografGraphicId(template.name);
  const self = graphicSelfSelector(template);
  // The markup and stylesheet, re-addressed to the canvas and checked by the browser's parser -
  // the export refuses rather than ship a rule that would reach the renderer's page.
  const sources = graphicSources(template);
  const usesLottie = templateUsesLottie(template);
  const ensureLottieFn = usesLottie
    ? `

// The bundled Lottie player, loaded the same way (this graphic uses a Lottie animation).
function ensureLottie() {
  if (window.lottie) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const prevDefine = window.define;
    window.define = undefined;
    const restore = () => { window.define = prevDefine; };
    const s = document.createElement('script');
    s.src = new URL('./${lib.lottie}', import.meta.url).href;
    s.onload = () => { restore(); resolve(undefined); };
    s.onerror = () => { restore(); reject(new Error('Could not load ${lib.lottie}')); };
    document.head.appendChild(s);
  });
}`
    : '';
  return `// ${template.name} — OGraf v1 Graphic, generated by NoaCG Studio.
// Authored project format: ${projectFormatReadme(template)}. The package keeps this canvas and timing.
// The original template runtime (play/stop/update/next) is embedded unchanged inside
// initTemplate(); this Web Component maps the OGraf actions onto it.

// GSAP ships as a classic (UMD) script, so it is loaded via a <script> tag — importing
// it as an ES module would leave the global \`gsap\` undefined. If the HOST page has an
// AMD loader (window.define.amd — e.g. anything embedding Monaco), the UMD would register
// there instead of on window, so define is hidden while the script executes.
function ensureGsap() {
  if (window.gsap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const prevDefine = window.define;
    window.define = undefined;
    const restore = () => { window.define = prevDefine; };
    const s = document.createElement('script');
    s.src = new URL('./${lib.gsap}', import.meta.url).href;
    s.onload = () => { restore(); resolve(undefined); };
    s.onerror = () => { restore(); reject(new Error('Could not load ${lib.gsap}')); };
    document.head.appendChild(s);
  });
}

// The flex-gap shim, loaded the same way: on a host engine without flexbox gap it puts the
// template's gaps back as margins; on any current renderer it exits at its first line.
function ensureFlexGap() {
  if (window.__noacgFlexGapShim) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./${lib.flexGap}', import.meta.url).href;
    s.onload = () => resolve(undefined);
    s.onerror = () => reject(new Error('Could not load ${lib.flexGap}'));
    document.head.appendChild(s);
  });
}${ensureLottieFn}

const TEMPLATE_HTML = ${JSON.stringify(sources.html)};

// This design's manifest id, stamped at load() as data-noacg-graphic on the element and on the
// canvas inside its shadow root. Every rule in TEMPLATE_CSS is scoped under that attribute (the
// studio's \`html, body\` and \`:root\` ARE the canvas), so the design lays out against its own
// canvas, and the renderer's page, which no rule inside a shadow tree reaches anyway, stays as it was.
const GRAPHIC_ID = ${JSON.stringify(graphicId)};

// The canvas is the element in the shadow root that carries the attribute (see _claimCanvas):
// the box the template's \`html, body\` rule describes, made a block (all: initial makes it
// display:inline, where width and height do nothing) and the containing block its design
// positions against, clipped like the page it was authored on.
// Injected ahead of the template's own rules, which then re-state the canvas exactly as the
// non-real-time document's <head> does for its own body, at zero specificity.
// The same box also keeps the RENDERER's page out of the graphic. The template was authored as
// a whole document, whose root inherits nothing; here the canvas would inherit the host's text
// settings through the element, and SPX's renderer sets \`body, html { font-size: 3em }\`, which
// grew a scorebug's bar to four times its height (docs/SPX_ON_A_REAL_SERVER.md §3). So the canvas
// starts from every property's initial value, as a document root does, except the three a
// renderer uses to hide or disable a whole layer; and its descendants keep the browser's own box
// model and overflow wherever a zero-specificity rule would take them. Outside SVG only, for
// overflow: an SVG element's \`overflow\` attribute is author-level and \`revert\` would discard
// it. Any rule of the template's own comes later or weighs more, so it still wins.
const GRAPHIC_BOX_CSS = ${JSON.stringify(
    `${self} { all: initial; visibility: inherit; pointer-events: inherit; cursor: inherit; display: block; position: relative; width: ${template.resolution.width}px; height: ${template.resolution.height}px; overflow: hidden; }\n` +
      `${self} :where(*) { box-sizing: revert; margin: revert; padding: revert; }\n` +
      `${self} :where(:not(svg, svg *)) { overflow: revert; }`,
  )};

// The element itself, seen from inside its shadow root: a block of the authored size, the
// containing block, clipped. Any rule of the renderer's own on the element beats this one whatever
// its specificity, a universal reset included, so a renderer that sizes or hides its layers still
// does; nothing of the renderer's reaches the canvas inside but what the canvas inherits, and it
// starts from initial values.
const HOST_CSS = ${JSON.stringify(
    `:host { display: block; position: relative; width: ${template.resolution.width}px; height: ${template.resolution.height}px; overflow: hidden; }`,
  )};

// The design's @font-face and @property rules, lifted at export out of the stylesheet and the
// markup's own <style> blocks: Chromium applies neither from inside a shadow tree. They go in the
// renderer's <head>, in one <style data-noacg-fonts>, put there by the first copy of this design
// to load and taken out with the last copy to be disposed. The module is one per design, so its
// count is the design's.
const HEAD_CSS = ${JSON.stringify(sources.head)};
let headStyle = null;
let headHolders = 0;

const TEMPLATE_CSS = ${JSON.stringify(sources.css)};

// The package's own base URL. A Graphic is a COMPONENT inside the renderer's page, not the
// page itself, so a relative \`fonts/inter.woff2\` in the injected CSS resolves against the
// RENDERER's document — which is somebody else's directory. Under SPX and CasparCG the
// template IS the document and the same path is correct, which is why this is invisible until
// a real OGraf renderer loads the package: the font 404s, \`font-display: swap\` paints the
// fallback, and the graphic airs in the wrong typeface with no error anywhere. Every relative
// resource is therefore resolved against this module before injection. (The non-real-time
// document does the same job with a <base href>; it has its own document to put one in.)
const PACKAGE_BASE = new URL('./', import.meta.url).href;

/** Absolute-ise one reference, leaving anything already absolute (or a data: URL) alone. */
function packageUrl(ref) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\\/\\/|#)/i.test(ref)) return ref;
  return new URL(ref, PACKAGE_BASE).href;
}

// Each rewrite substitutes the REFERENCE inside the match it was found in, rather than rebuilding
// the surrounding syntax — quoting and spacing survive untouched, and this file never contains a
// literal reference of its own for a package scanner to trip over.
const substitute = (whole, ref) => {
  const trimmed = ref.trim();
  const resolved = packageUrl(trimmed);
  return resolved === trimmed ? whole : whole.replace(trimmed, resolved);
};

const withPackageUrls = {
  css: (css) => css.replace(/url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/gi, (whole, _q, ref) => substitute(whole, ref)),
  html: (html) => html.replace(/\\b(?:src|href|poster|data)\\s*=\\s*(['"])([^'"]+)\\1/gi, (whole, _q, ref) => substitute(whole, ref)),
};

// A file-list field's value is a path inside the package (\`./images/logo.png\`), which is also the
// form SPX's own file list hands back; resolved against the renderer's page it 404s and the
// image goes blank on air (docs/SPX_ON_A_REAL_SERVER.md §10). Only a relative path with a folder
// and an extension is resolved, so an empty value or a file list's "none" means what it said.
const FILE_FIELDS = ${JSON.stringify(template.fields.filter((f) => f.ftype === 'filelist').map((f) => f.field))};
function withPackagePaths(data) {
  const out = Object.assign({}, data);
  for (const key of FILE_FIELDS) {
    const value = typeof out[key] === 'string' ? out[key].trim() : '';
    if (/^(?:\\.{1,2}\\/)*[\\w.-]+\\/[^\\s?#]*\\.[a-z0-9]+$/i.test(value)) out[key] = packageUrl(value);
  }
  return out;
}

// SPX 1.4 HTML-escapes every value it plays, OGraf items too, before handing them to load() and
// updateAction(), so "Anna O'Brien & Sons" aired as "Anna O&#039;Brien &amp; Sons" and a line
// break as a literal "&lt;br&gt;" (issue #1047, docs/SPX_ON_A_REAL_SERVER.md §13). The SPX-layout
// packages undo that once (src/export/spxText.ts), and this is the same rule. It applies only
// after a load() that carried SPX's own rundownData, which no other renderer sends, so values
// from any other host are used exactly as sent.
${SPX_TYPED_JS}

// Non-real-time rendering runs in an isolated, virtual-clock document. The document is
// recreated for every seek, so no prior playback, timer, GSAP state, or seek order can leak.
const OFFLINE_DOCUMENT = ${JSON.stringify(offlineDocument(template, lib))};

// Each state group's off-air state. Empty when this graphic has no state machine.
const OFF_STATES = ${JSON.stringify(offStates)};

// The step walk playAction runs, the same source the non-real-time document runs.
${STEP_WALK_JS}

// The manifest's stepCount, and the hold in ms of a graphic set to leave by itself (null when it
// waits for stopAction or stays), which declares stepCount 0. Its hold starts once the entrance
// has landed, ENTRANCE_MS after play (null when the export could not read the timeline).
const STEP_COUNT = ${stepCount};
const OUT_MS = ${timedOutMs(template)};
const ENTRANCE_MS = ${entranceMs(template)};

// The machine's custom-action vocabulary (the manifest's customActions[].id list), plus the
// main group's walk — how the wrapper re-derives its step pointer after an event moved the
// machine. All empty when this graphic has no state machine.
const CUSTOM_ACTION_IDS = ${JSON.stringify(actionIds)};
// The functions this graphic's timeline fires by name (see scopedWindow below).
const TIMELINE_FUNCTIONS = ${JSON.stringify(timelineNames)};
const MAIN_GROUP_ID = ${JSON.stringify(mainGroupId)};
const MAIN_PATH = ${JSON.stringify(mainPath)};

/**
 * A \`document\` scoped to ONE mounted Graphic.
 *
 * The field convention is one element per field, addressed as \`getElementById('fN')\` — the
 * same ids in every design NoaCG makes, because under SPX a template owns its page and there
 * is nothing to collide with. An OGraf renderer is the opposite arrangement: every layer is a
 * Web Component in ONE document, so a second Graphic's \`#f0\` is a duplicate of the first's,
 * \`document.getElementById\` answers with whichever is earlier in the document, and updating
 * the graphic on layer 1 rewrites the graphic on layer 0. Measured exactly that way against
 * SuperFly.tv's OGraf server (docs/OGRAF.md); class prefixes scope the CSS but not the ids.
 *
 * The template's code is still what the editor shows: only the \`document\` it sees is scoped,
 * by being a parameter of the function its body runs in. Lookups resolve inside this Graphic,
 * and its \`body\` and \`documentElement\` ARE this Graphic's canvas - where the stylesheet's
 * canvas box and \`:root\` variables now live, so a template that measures \`body.clientWidth\`
 * or reads \`--scale\` off the root element gets its own canvas and its own contract, not the
 * renderer's page (and a measuring probe it appends to \`body\` lands inside the graphic, in
 * the graphic's font). Its \`head\` is where the template's own document-level additions go: the
 * shadow root, so a <style> the template appends there styles its own tree, as it styled its own
 * page under SPX.
 *
 * Its loading state is the graphic's own too. A template's script runs while its page is still
 * loading, so its DOM-ready code (\`if (document.readyState === 'loading')
 * addEventListener('DOMContentLoaded', ...)\`) waits until the whole script has run. A renderer's
 * page loaded long before the Graphic did, so through to the real document that code ran at once,
 * in the middle of the script, before the code below it had set what it reads: sb21's spotlight
 * repaint read a machine its animation region had not made yet, and load() answered 500 (issue
 * #964). So \`readyState\` answers 'loading' and the DOMContentLoaded listeners wait until
 * \`loaded()\`, which _load() calls once \`initTemplate\` has run: the order a page gives them.
 *
 * Any other listener it adds, on the document or on the page's font set (\`fonts\`, the same set,
 * whose \`ready\` waits for the graphic's faces too), is recorded by \`scopedListeners\` and removed at
 * dispose(), as its page would have taken it away.
 *
 * Everything else on document (createElement) passes straight through to the real one.
 * Which is which is not a hand-kept list: scripts/ograf-document-members.test.mjs reads every
 * member the template runtimes use and fails on one that is neither scoped here nor decided as a
 * pass-through there.
 */
function scopedDocument(root, head, listeners) {
  let waiting = [];
  const own = listeners.on(document);
  const scoped = {
    getElementById: (id) => root.querySelector('[id="' + String(id).replace(/"/g, '\\\\"') + '"]'),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    body: root,
    documentElement: root,
    head: head,
    get readyState() {
      return waiting ? 'loading' : document.readyState;
    },
    addEventListener(type, listener, options) {
      if (!waiting || type !== 'DOMContentLoaded') own.addEventListener(type, listener, options);
      else if (listener) waiting.push(listener);
    },
    removeEventListener(type, listener, options) {
      if (waiting && type === 'DOMContentLoaded') waiting = waiting.filter((held) => held !== listener);
      else own.removeEventListener(type, listener, options);
    },
    fonts: document.fonts && standIn(document.fonts, listeners.on(document.fonts)),
  };
  const doc = standIn(document, scoped);
  // The template's page has loaded: its DOMContentLoaded listeners run, in the order it added
  // them. One that throws fails the load, as the same code failed it when it ran at once.
  const loaded = () => {
    const listeners = waiting;
    waiting = null;
    const event = new Event('DOMContentLoaded');
    for (const listener of listeners) {
      if (typeof listener === 'function') listener.call(doc, event);
      else if (typeof listener.handleEvent === 'function') listener.handleEvent(event);
    }
  };
  return { doc, loaded };
}

// A stand-in for a page object that answers \`members\` itself and passes the rest through, a
// method bound to the real object and a write made on it, because a host method or setter refuses
// any other receiver (\`document.fonts.onloadingdone = ...\` would throw).
function standIn(target, members) {
  return new Proxy(target, {
    get(real, key) {
      if (key in members) return members[key];
      const value = real[key];
      return typeof value === 'function' ? value.bind(real) : value;
    },
    set(real, key, value) {
      real[key] = value;
      return true;
    },
  });
}

/**
 * The event listeners and observers of ONE mounted Graphic, for the reason \`scopedTimers\` gives:
 * a template's listeners end with its page, and a renderer's page outlives every Graphic on it. An
 * imported SVG design refits its text on the font set's \`loadingdone\` and watches its art with a
 * ResizeObserver, and the sound runtime ends itself on the window's \`pagehide\`. Each held a
 * disposed graphic, and the refit ran on its detached canvas whenever a later graphic loaded a
 * face (issue #998).
 *
 * So a listener the template adds through its scoped document, the font set or its window (\`on\`)
 * is recorded until it removes it, an observer it makes (\`observers\`, parameters of
 * \`initTemplate\` like the timers) until it disconnects it, and \`clear()\`, which dispose() calls,
 * undoes the rest. A listener is removed by hand rather than through an AbortSignal, which an older
 * renderer engine (CasparCG 2.3's Chromium 71) does not take.
 */
function scopedListeners() {
  const added = [];
  const observing = new Set();
  // A listener is the same one when its target, type, function and capture flag are, as the DOM
  // counts it: added twice it is there once.
  const recorded = (target, type, listener, options) => {
    const capture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const at = added.findIndex((l) => l.target === target && l.type === type && l.listener === listener && l.capture === capture);
    return { at, capture };
  };
  const on = (target) => ({
    addEventListener(type, listener, options) {
      target.addEventListener(type, listener, options);
      const { at, capture } = recorded(target, type, listener, options);
      if (listener && at < 0) added.push({ target, type, listener, capture });
    },
    removeEventListener(type, listener, options) {
      target.removeEventListener(type, listener, options);
      const { at } = recorded(target, type, listener, options);
      if (at >= 0) added.splice(at, 1);
    },
  });
  const tracked = (Observer) => Observer && class extends Observer {
    constructor(...args) {
      super(...args);
      observing.add(this);
    }
    disconnect() {
      observing.delete(this);
      super.disconnect();
    }
  };
  const observers = {
    ResizeObserver: tracked(window.ResizeObserver),
    MutationObserver: tracked(window.MutationObserver),
    IntersectionObserver: tracked(window.IntersectionObserver),
  };
  const clear = () => {
    for (const l of added.splice(0)) l.target.removeEventListener(l.type, l.listener, l.capture);
    for (const observer of Array.from(observing)) observer.disconnect();
  };
  return { on, observers, clear };
}

/**
 * The timers of ONE mounted Graphic: \`setTimeout\`, \`setInterval\`, \`requestAnimationFrame\` and
 * their clears, handed to the template as parameters of \`initTemplate\` (a bare call in its code
 * would otherwise resolve to the global) and on its scoped window.
 *
 * Under SPX and CasparCG a template's timers end with its page. A renderer's page outlives every
 * Graphic on it, so a countdown's \`setInterval(tickClock, 250)\` went on ticking into a graphic
 * dispose() had taken off the page (issue #989). So each timer is recorded until it fires or is
 * cleared, and \`clear()\`, which dispose() calls, stops whatever is left. A timeout or interval
 * is recorded with the clear that stops it, because a page's clock may refuse the other one
 * (Playwright's does). The template's own clears pass through exactly as it called them.
 */
function scopedTimers() {
  const pending = new Map();
  const frames = new Set();
  const timers = {
    setTimeout(handler, ms, ...args) {
      const id = window.setTimeout(typeof handler === 'function'
        ? function () { pending.delete(id); return handler.apply(this, arguments); }
        : handler, ms, ...args);
      pending.set(id, 'clearTimeout');
      return id;
    },
    setInterval(...args) {
      const id = window.setInterval(...args);
      pending.set(id, 'clearInterval');
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
      window.clearTimeout(id);
    },
    clearInterval(id) {
      pending.delete(id);
      window.clearInterval(id);
    },
    requestAnimationFrame(callback) {
      const id = window.requestAnimationFrame(function () { frames.delete(id); return callback.apply(this, arguments); });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
      window.cancelAnimationFrame(id);
    },
  };
  const clear = () => {
    pending.forEach((clearer, id) => window[clearer](id));
    frames.forEach((id) => window.cancelAnimationFrame(id));
  };
  return { timers, clear };
}

/**
 * A \`window\` scoped to ONE mounted Graphic.
 *
 * The animation interpreter fires a step's lifecycle CALLS and its measured-motion BUILDERS by
 * name - \`window[name]\`, never eval. Under SPX the template owns the page, so its top-level
 * \`function noacgRepaint()\` IS \`window.noacgRepaint\` and the name is enough. Here the same
 * code runs inside \`initTemplate\`, so those declarations are local and the renderer's window
 * knows nothing about them. The names below are therefore handed to this object; everything
 * else - gsap, getComputedStyle, the viewport - reads through to the real window.
 *
 * MEASURED, not guessed: driven in SuperFly.tv's OGraf server on 2026-09-09, an imported quiz
 * board's select, lock and reveal each answered 200 and moved the machine, and not one of the
 * designer's drawn states ever lit, because every timeline call resolved to \`undefined\` in
 * silence (docs/OGRAF.md). A graphic that says 200 and paints nothing is the worst answer a
 * Graphic can give a renderer, so this is not an optimisation.
 *
 * A WRITE lands here rather than on the renderer's page, which is the isolation
 * \`scopedDocument\` gives the ids: the SPX definition object and the stage-fit caches a
 * template parks on window are per-graphic, so two designs on two layers cannot overwrite each
 * other's.
 *
 * \`document\` is answered here too, with the graphic's scoped document: hand-written code that
 * reaches the page as \`window.document.getElementById('f0')\` would otherwise find the
 * renderer's first #f0, which is the neighbour's when another graphic mounted first. So are the
 * timers, listeners and observers, with the graphic's own (\`scopedTimers\`, \`scopedListeners\`),
 * so a \`window.setTimeout\` or \`window.addEventListener\` ends at dispose() as a bare one does.
 *
 * ONE READ IS REWRITTEN, and only one: a host METHOD - \`getComputedStyle\`, \`matchMedia\`,
 * \`fetch\` - throws when it is called with any receiver but the real window, so it is handed
 * back bound. Nothing else is, because a bound function carries none of the original's own
 * properties: binding \`Date\` would make \`window.Date.now()\` "undefined is not a function",
 * and binding gsap would drop every method hanging off it. Host methods are exactly the native
 * functions with no \`prototype\`, which is what tells the two apart.
 */
function scopedWindow(names, doc, globals) {
  const own = Object.create(null);
  for (const name of names) own[name] = undefined;
  own.document = doc;
  Object.assign(own, globals);
  const isHostMethod = (fn) =>
    !fn.prototype && /\\[native code\\]/.test(Function.prototype.toString.call(fn));
  return new Proxy(window, {
    get(target, key) {
      if (key in own) return own[key];
      const value = target[key];
      return typeof value === 'function' && isHostMethod(value) ? value.bind(target) : value;
    },
    set(target, key, value) {
      own[key] = value;
      return true;
    },
    has(target, key) {
      return key in own || key in target;
    },
  });
}

/**
 * A \`gsap\` scoped to ONE mounted Graphic, for the reason \`scopedDocument\` gives.
 *
 * The template's runtime clears its own animation with \`gsap.killTweensOf('*')\` before it
 * plays, resets or exits, and under SPX the page is the template's, so \`'*'\` is its own
 * elements. GSAP resolves a selector string against the renderer's WHOLE document, so in a
 * renderer the second Graphic's Play killed the first one's entrance and left it half drawn on
 * air - measured in SPX 1.4.1 with a quiz and a scorebug played 0.8 s apart
 * (docs/SPX_ON_A_REAL_SERVER.md §10). So a string target given to GSAP's own target-taking
 * calls is resolved inside this Graphic (the canvas itself included, being the template's
 * \`html\` and \`body\`), and so is each string in an array target, which the competition
 * reveals pass (\`gsap.set(['.reveal-subject', '.reveal-note'], ...)\`); element targets and
 * everything else are GSAP itself.
 *
 * A TIMELINE resolves its own string targets the same document-wide way, and the animation
 * interpreter and the catalog's presets build every entrance and exit as \`tl.set('.x', ...)\`,
 * \`tl.fromTo('.x-box', ...)\`. Two imported designs share their class names (\`imported-design\`),
 * so the second one's entrance also drove the first one's root (issue #789). So a timeline this
 * gsap makes resolves its string targets inside this Graphic too.
 *
 * Every tween, timeline and delayed call it starts is recorded in \`made\`, so dispose() can stop
 * them: a step's timeline goes on firing its calls after its elements' tweens are killed, into a
 * graphic that is no longer there.
 */
function scopedGsap(root, made) {
  const real = window.gsap;
  const own = (targets) => {
    if (Array.isArray(targets)) return targets.flatMap(own);
    if (typeof targets !== 'string') return targets;
    const inside = Array.from(root.querySelectorAll(targets));
    return root.matches(targets) ? [root].concat(inside) : inside;
  };
  const mine = (animation) => {
    made.add(animation);
    return animation;
  };
  const tweens = ['to', 'from', 'fromTo', 'set'];
  const scoped = Object.create(null);
  for (const name of tweens) {
    scoped[name] = (targets, ...rest) => mine(real[name](own(targets), ...rest));
  }
  for (const name of ['killTweensOf', 'getTweensOf', 'isTweening', 'quickSetter', 'quickTo']) {
    scoped[name] = (targets, ...rest) => real[name](own(targets), ...rest);
  }
  scoped.delayedCall = (...args) => mine(real.delayedCall(...args));
  scoped.timeline = (...args) => {
    const tl = mine(real.timeline(...args));
    for (const name of tweens) {
      const method = tl[name];
      tl[name] = function (targets, ...rest) { return method.call(this, own(targets), ...rest); };
    }
    return tl;
  };
  // getProperty reads ONE element; given a string it takes the first match, given a list it fails.
  scoped.getProperty = (target, ...rest) => {
    if (typeof target !== 'string') return real.getProperty(target, ...rest);
    const first = own(target)[0];
    return first ? real.getProperty(first, ...rest) : undefined;
  };
  return new Proxy(real, {
    get(target, key) {
      return key in scoped ? scoped[key] : target[key];
    },
  });
}

// initTemplate(): runs the template's own JS AFTER the markup is in the DOM and returns
// its runtime entry points. The code inside is exactly what the editor shows — the
// \`document\`, \`window\` and \`gsap\` parameters shadow the global ones so its lookups stay
// inside this Graphic, and the timer, listener and observer parameters so dispose() can undo what
// it starts on the page. The code runs in a function of its own inside this one, so a declaration
// of its own under one of those names (\`const requestAnimationFrame = window.requestAnimationFrame\`)
// shadows the parameter, as on a page it shadows the global, instead of stopping the whole module
// from parsing. It keeps this function's indentation, so its own multi-line strings read exactly
// as written.
function initTemplate(document, window, gsap, {
  setTimeout, setInterval, clearTimeout, clearInterval, requestAnimationFrame, cancelAnimationFrame,
  addEventListener, removeEventListener, ResizeObserver, MutationObserver, IntersectionObserver,
}) {
  window.noacgResolveSound = packageUrl;
  return (function () {
${template.js.replace(/^/gm, '  ')}

  // THE TIMELINE'S OWN VOCABULARY, handed to the scoped window above. Every name here is one
  // the graphic's animation data fires by string, and each is declared by the template's code
  // just above — local to this function, which is why window has to be told about them.
  //
  // A name the template does NOT declare lexically keeps whatever is already on the scoped
  // window, because assigning the function to window directly is the other spelling a template
  // may use for the same thing (validation accepts both) and that assignment has already landed
  // here. Writing undefined over it would reintroduce the silent no-op this whole block exists
  // to remove. Where neither spelling defined it, the value stays undefined and the interpreter
  // skips the call, exactly as it does under SPX.
${
  timelineNames.length
    ? timelineNames
        .map((name) => `  window.${name} = (typeof ${name} === 'function') ? ${name} : window.${name};`)
        .join('\n')
    : '  // (this graphic\'s timeline names no function)'
}

  // The machine globals ride along when the template has a state machine, so the wrapper can
  // ASK where the graphic is instead of assuming its own step pointer stayed in step — and
  // DISPATCH the operator events the manifest declares as custom actions.
  return {
    play: play, stop: stop, update: update, next: next,
    // The entrance timeline's builder, which a graphic set to leave by itself measures its wait by.
    entrance: (typeof buildInTimeline === 'function') ? buildInTimeline : null,
    machineState: (typeof noacgMachineState === 'function') ? noacgMachineState : null,
    dispatch: (typeof noacgDispatch === 'function') ? noacgDispatch : null,
    // How a skipAnimation action lands instantly: noacgSnap() composes a state's settled pose
    // with GSAP callbacks suppressed. Absent on a template with no state machine.
    snap: (typeof noacgSnap === 'function') ? noacgSnap : null,
    soundPrepare: (typeof noacgSoundPrepare === 'function') ? noacgSoundPrepare : null,
    soundStatus: (typeof noacgSoundStatus === 'function') ? noacgSoundStatus : null,
    soundQuiet: (typeof noacgSoundSetQuiet === 'function') ? noacgSoundSetQuiet : null,
    soundDispose: (typeof noacgSoundDispose === 'function') ? noacgSoundDispose : null,
    // The contract's text writer: values go in as text, so after SPX escaped them every one is
    // decoded, not only the file-list paths.
    asText: typeof setFieldValue === 'function'
  };
  })();
}

class Graphic extends HTMLElement {
  constructor() {
    super();
    // OGraf §"Concurrency": a Graphic MUST accept an action call at any time, even while a
    // previous action's Promise is still pending, and MUST NOT ignore it. Every action runs
    // through this one chain, so overlapping calls are honoured in arrival order instead of
    // interleaving their DOM writes (and, in non-real-time mode, instead of two seeks
    // rebuilding the render frame on top of each other).
    this._chain = Promise.resolve();
    this._runtime = null;
    this._renderType = 'realtime';
    this._initialData = {};
    this._fromSpx = false;
    this._schedule = [];
    this._step = -1;
    this._exit = null;
    this._disposed = false;
    this._made = null;
    this._endTemplate = null;
    this._holdsHead = false;
  }

  // Queue one action and report its outcome as a ReturnPayload. A thrown error becomes a 500
  // rather than a rejected Promise: the spec models failure as an HTTP-style status code, and
  // a renderer awaiting an action should get something it can log, not an unhandled rejection.
  _serial(run) {
    const settled = this._chain.then(
      () => run(),
      () => run(),
    ).catch((err) => ({ statusCode: 500, statusMessage: String((err && err.message) || err) }));
    this._chain = settled.then(() => undefined);
    return settled;
  }

  // Actions only make sense between a completed load() and dispose().
  _notReady() {
    if (this._disposed) return { statusCode: 409, statusMessage: 'This Graphic has been disposed.' };
    if (this._renderType === 'non-realtime') return null; // the offline path holds no runtime
    if (!this._runtime) return { statusCode: 409, statusMessage: 'load() has not completed yet.' };
    return null;
  }

  // skipAnimation: the action still happens, it just lands instantly. The template's own
  // runtime knows how — noacgSnap() composes a state's settled pose by replaying the route to
  // it with GSAP callbacks suppressed — so re-snapping to wherever the action left the machine
  // IS the finished frame. Pointers move synchronously inside the runtime, so by the time an
  // action returns, "where the machine is" is already the destination. A template with no
  // state machine (hand-written GSAP) falls back to forcing running tweens to their end.
  _settle() {
    if (this._runtime && this._runtime.snap && this._runtime.machineState) {
      this._runtime.snap(this._runtime.machineState().groups);
      return;
    }
    if (window.gsap) {
      window.gsap.globalTimeline.getChildren(true, true, true).forEach(function (tl) { tl.progress(1); });
    }
  }

  // Declared async although each one already returns _serial()'s Promise: every OGraf action is
  // awaited by the renderer, and the keyword is how a reader (and a package checker) sees that
  // from the signature instead of having to follow _serial. Behaviour is unchanged.
  async load(params) { return this._serial(() => this._load(params || {})); }
  async dispose() { return this._serial(() => this._dispose()); }
  async playAction(params) { return this._soundAction(params, () => this._playAction(params || {})); }
  async stopAction(params) { return this._soundAction(params, () => this._stopAction(params || {})); }
  async updateAction(params) { return this._serial(() => this._updateAction(params || {})); }
  async customAction(params) { return this._soundAction(params, () => this._customAction(params || {})); }
  async goToTime(params) { return this._serial(() => this._goToTime(params || {})); }
  async setActionsSchedule(params) { return this._serial(() => this._setActionsSchedule(params || {})); }

  _soundAction(params, action) {
    return this._serial(async () => {
      const sound = this._runtime && this._runtime.soundQuiet;
      if (sound && params && params.skipAnimation) sound(true);
      try { return await action(); }
      finally { if (sound && params && params.skipAnimation) sound(false); }
    });
  }

  // The element hosts the canvas. It is stamped with the attribute, and its open shadow root -
  // attached by the first load() and reused by every later one - gets ONE stylesheet, holding the
  // element's box and the canvas box the design lays out against followed by whatever the caller
  // injects, then ONE canvas element carrying the same attribute, which every scoped rule keys
  // on. Both mount paths (real-time and non-real-time) claim it the same way, so neither can
  // drift. Returns the canvas.
  _claimCanvas(css) {
    this.setAttribute('data-noacg-graphic', GRAPHIC_ID);
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = HOST_CSS + '\\n' + GRAPHIC_BOX_CSS + (css ? '\\n' + css : '');
    root.appendChild(style);
    const canvas = document.createElement('div');
    canvas.setAttribute('data-noacg-graphic', GRAPHIC_ID);
    root.appendChild(canvas);
    return canvas;
  }

  // Everything this Graphic put on the page: its shadow root, none before the first load().
  _tree() {
    return this.shadowRoot;
  }

  // HEAD_CSS goes into the renderer's <head> with the first copy of this design to load, and out
  // with the last one.
  _holdHeadCss() {
    if (this._holdsHead || !HEAD_CSS) return;
    this._holdsHead = true;
    if (headHolders++ === 0) {
      headStyle = document.createElement('style');
      headStyle.setAttribute('data-noacg-fonts', GRAPHIC_ID);
      headStyle.textContent = withPackageUrls.css(HEAD_CSS);
      document.head.appendChild(headStyle);
    }
  }

  _releaseHeadCss() {
    if (!this._holdsHead) return;
    this._holdsHead = false;
    if (--headHolders === 0) {
      headStyle.remove();
      headStyle = null;
    }
  }

  // Inject the template's style + markup into this element's shadow root (the template's own
  // getElementById lookups keep working exactly as in SPX, through the scoped document). The
  // stylesheet is scoped to the attribute _claimCanvas() stamps, and the canvas is the page it was
  // authored for. The markup becomes the canvas's own children, as it was the body's, with no
  // wrapper, so a \`body > .x\` rule and a read of \`document.body.children\` find the design's
  // top-level elements, and only them. Returns the canvas, the template's scoped document and
  // the function that ends its loading.
  _mountTemplate(listeners) {
    const canvas = this._claimCanvas(withPackageUrls.css(TEMPLATE_CSS));
    this._holdHeadCss();
    canvas.insertAdjacentHTML('beforeend', withPackageUrls.html(TEMPLATE_HTML));
    return { canvas, ...scopedDocument(canvas, this.shadowRoot, listeners) };
  }

  async _load(params) {
    if (this._runtime || this._frame) await this._dispose();
    this._disposed = false;
    this._renderType = params.renderType || 'realtime';
    this._fromSpx = Boolean(params.rundownData);
    this._initialData = Object.assign({}, params.data || {});
    this._schedule = [];
    if (this._renderType === 'non-realtime') {
      await this._renderOfflineFrame(0);
      return { statusCode: 200 };
    }
    await ensureGsap();
    await ensureFlexGap();${usesLottie ? '\n    await ensureLottie();' : ''}
    // A load that fails anywhere past this point takes down what it mounted and answers 500.
    try {
      const { timers, clear: clearTimers } = scopedTimers();
      const listeners = scopedListeners();
      this._endTemplate = () => { clearTimers(); listeners.clear(); };
      const { canvas, doc, loaded } = this._mountTemplate(listeners);
      this._made = new WeakSet();
      const globals = Object.assign({}, timers, listeners.on(window), listeners.observers);
      this._runtime = initTemplate(doc, scopedWindow(TIMELINE_FUNCTIONS, doc, globals), scopedGsap(canvas, this._made), globals);
      // The template's script has run, so its page has loaded and its DOM-ready code runs now.
      loaded();
      if (this._runtime.soundPrepare) await this._runtime.soundPrepare();
      const audioError = this._runtime.soundStatus && this._runtime.soundStatus();
      if (audioError) throw new Error(audioError);
    } catch (e) {
      await this._dispose();
      return { statusCode: 500, statusMessage: String(e.message || e) };
    }
    this._step = -1; // not on air yet
    if (params && params.data) this._runtime.update(JSON.stringify(this._asSent(params.data)));
    return { statusCode: 200 };
  }

  async _dispose() {
    this._cancelExit();
    if (this._runtime && this._runtime.soundDispose) this._runtime.soundDispose();
    // What the template's code started on the page: a countdown's interval would go on ticking, and
    // a font-set listener would go on refitting a canvas that is no longer there.
    if (this._endTemplate) this._endTemplate();
    this._endTemplate = null;
    const tree = this._tree();
    const gsap = window.gsap;
    if (gsap) {
      // Everything this Graphic's runtime started on GSAP's clock: a step's timeline would go on
      // firing its calls into a graphic that is no longer there.
      const made = this._made;
      if (made) gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => { if (made.has(animation)) animation.kill(); });
      // Only this Graphic's own elements: '*' is document-wide, and a renderer mounts every
      // layer in one document, so clearing layer 1 froze the graphic still on air on layer 0.
      if (tree) gsap.killTweensOf(tree.querySelectorAll('*'));
    }
    if (this._frame) { this._frame.remove(); this._frame = null; }
    if (tree) tree.innerHTML = '';
    this.removeAttribute('data-noacg-graphic');
    this._releaseHeadCss();
    this._made = null;
    this._runtime = null;
    this._schedule = [];
    this._step = -1;
    this._disposed = true;
    return { statusCode: 200 };
  }

  async _setActionsSchedule(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    this._schedule = Array.isArray(params.schedule) ? params.schedule.slice() : [];
    return { statusCode: 200 };
  }

  async _goToTime(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    if (this._renderType !== 'non-realtime') {
      return { statusCode: 409, statusMessage: 'goToTime() requires load({renderType:"non-realtime"}).' };
    }
    var timestamp = Math.max(0, Number(params.timestamp) || 0);
    await this._renderOfflineFrame(timestamp);
    return { statusCode: 200 };
  }

  async _renderOfflineFrame(timestamp) {
    if (this._frame) this._frame.remove();
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'OGraf non-real-time frame');
    frame.style.cssText = 'display:block;border:0;width:100%;height:100%;background:transparent';
    var tree = this._tree();
    if (tree) tree.innerHTML = '';
    // The same canvas box as the real-time path, so the 100% x 100% frame has a size to fill.
    this._claimCanvas().appendChild(frame);
    this._frame = frame;
    var ready = new Promise(function (resolve, reject) {
      frame.onload = resolve;
      frame.onerror = function () { reject(new Error('Could not initialize the OGraf render frame.')); };
    });
    var base = new URL('./', import.meta.url).href;
    frame.srcdoc = OFFLINE_DOCUMENT.replace('__NOACG_BASE__', base);
    await ready;
    var win = frame.contentWindow;
    var doc = frame.contentDocument;
    if (!win || !doc || !win.__noacgRender) throw new Error('OGraf non-real-time runtime did not initialize.');
    await win.__noacgRender.prepare({ epochMs: 0, fps: ${template.fps}, data: this._initialData });
    win.__noacgRender.setSchedule(this._schedule.map(function (entry) {
      return { atMs: Math.max(0, Number(entry.timestamp) || 0), action: 'scheduled', payload: entry };
    }));
    win.__noacgRender.seek(timestamp);
    this._offlineTimestamp = timestamp;
    this._offlineStep = typeof win.__ografStep === 'number' ? win.__ografStep : -1;
    if (doc.fonts) await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map(function (img) {
      return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    }));
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
    var errors = win.__noacgRender.getErrors();
    if (errors.length) throw new Error('OGraf non-real-time render failed: ' + errors.join('; '));
  }

  async _updateAction(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    if (this._renderType === 'non-realtime') {
      await this._applyOfflineAction('updateAction', params);
      return { statusCode: 200 };
    }
    this._runtime.update(JSON.stringify(this._asSent(params.data || {})));
    if (params.skipAnimation) this._settle();
    return { statusCode: 200 };
  }

  async _playAction(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    if (this._renderType === 'non-realtime') {
      await this._applyOfflineAction('playAction', params);
      return { statusCode: 200, currentStep: this._currentStep(this._offlineStep) };
    }
    this._cancelExit();
    const runtime = this._runtime;
    if (OUT_MS !== null) return this._playTimed(runtime, params);
    this._step = ografPlayStep(this._step, params, STEP_COUNT, {
      play: () => runtime.play(),
      next: () => runtime.next(),
      stop: () => runtime.stop(),
      offAir: () => this._offAir(),
    });
    if (params.skipAnimation) this._settle();
    return { statusCode: 200, currentStep: this._currentStep(this._step) };
  }

  // A graphic set to leave by itself (stepCount 0): every playAction plays the entrance, holds
  // OUT_MS, then plays the exit through the action chain, as the studio preview, SPX and the HTML
  // overlay do. A later play, stop or custom action, or dispose(), cancels the exit still waiting.
  // An update does not: it moves nothing, so a corrected name still leaves on time.
  _playTimed(runtime, params) {
    const entrance = ENTRANCE_MS !== null ? ENTRANCE_MS : ografEntranceMs(runtime.entrance);
    const wait = (params.skipAnimation ? 0 : entrance) + OUT_MS;
    runtime.play();
    this._step = 0;
    if (params.skipAnimation) this._settle();
    const exit = setTimeout(() => this._serial(() => {
      if (this._exit !== exit) return { statusCode: 200 }; // an action since then cancelled it
      this._exit = null;
      runtime.stop();
      this._step = -1;
      return { statusCode: 200 };
    }), wait);
    this._exit = exit;
    return { statusCode: 200, currentStep: undefined };
  }

  _cancelExit() {
    if (this._exit !== null) clearTimeout(this._exit);
    this._exit = null;
  }

  // The ReturnPayload's step: none off air, and none ever for a graphic with no steps.
  _currentStep(step) {
    return STEP_COUNT > 0 && step >= 0 ? step : undefined;
  }

  // A real-time payload as the template should get it: as typed when SPX escaped it, with the
  // file-list paths resolved inside the package.
  _asSent(data) {
    return withPackagePaths(this._fromSpx ? spxTyped(data, this._runtime.asText, FILE_FIELDS) : data);
  }

  // True when the graphic's state machine says every group is back at its initial state.
  // Templates without a machine never report off air here — their behaviour is unchanged.
  _offAir() {
    if (!this._runtime || !this._runtime.machineState) return false;
    return ografOffAir(this._runtime.machineState().groups, OFF_STATES);
  }

  async _stopAction(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    if (this._renderType === 'non-realtime') {
      await this._applyOfflineAction('stopAction', params);
      return { statusCode: 200 };
    }
    this._cancelExit();
    this._runtime.stop();
    this._step = -1;
    if (params.skipAnimation) this._settle();
    return { statusCode: 200 };
  }

  async _customAction(params) {
    const notReady = this._notReady();
    if (notReady) return notReady;
    if (this._renderType === 'non-realtime') {
      if (CUSTOM_ACTION_IDS.indexOf(params.id) === -1) {
        return { statusCode: 400, statusMessage: 'This graphic defines no custom action "' + params.id + '".' };
      }
      await this._applyOfflineAction('customAction', params);
      return { statusCode: 200, currentStep: this._currentStep(this._offlineStep) };
    }
    const id = params.id;
    if (!this._runtime || !this._runtime.dispatch || CUSTOM_ACTION_IDS.indexOf(id) === -1) {
      return { statusCode: 400, statusMessage: 'This graphic defines no custom action "' + id + '".' };
    }
    this._cancelExit();
    // Fire the operator event through the template's own SERIAL queue. The payload is the
    // flat {field: value} map the action's schema declares — applied only if the machine
    // accepts the event (the structural guard), exactly like every other control surface.
    this._runtime.dispatch(id, params.payload || undefined);
    // The event may have moved the machine — follow it. On the walk, the pointer becomes
    // that waypoint's index; off air (an arrow into the exit) it clears; a branch state
    // keeps the last on-path pointer (the walk resumes from there).
    if (this._runtime.machineState) {
      if (this._offAir()) {
        this._step = -1;
      } else if (MAIN_GROUP_ID) {
        const at = MAIN_PATH.indexOf(this._runtime.machineState().groups[MAIN_GROUP_ID]);
        if (at !== -1) this._step = at;
      }
    }
    if (params.skipAnimation) this._settle();
    return { statusCode: 200, currentStep: this._currentStep(this._step) };
  }

  async _applyOfflineAction(type, params) {
    this._schedule.push({
      timestamp: this._offlineTimestamp || 0,
      action: { type: type, params: params || {} }
    });
    await this._renderOfflineFrame(this._offlineTimestamp || 0);
  }
}

export default Graphic;
`;
}

// ── The package builder (shared with the LiveOS target) ─────────────────────

/**
 * Write the complete OGraf Graphic package (manifest, graphic.mjs, bundled GSAP, fonts,
 * assets — everything except a README) into `root`, and return the manifest it wrote. The manifest is validated against the
 * spec's own schema rules BEFORE it is written, and the finished package is then checked to
 * contain every file the manifest names — so conformance is a build gate every target built
 * on this package inherits, rather than something a reviewer has to remember. The LiveOS
 * target reuses this verbatim: LiveOS's HTML5 graphics engine is OGraf-compliant.
 */
export interface OgrafPackageOptions {
  /** Where the bundled libraries go (and where `graphic.mjs` loads them from). Default `lib/`;
   *  the dual package passes the SPX layout's `js/` so one GSAP copy serves both halves. */
  lib?: OgrafLibPaths;
  /** NoaCG's `v_noacg` vendor block. Absent = plain OGraf, exactly as before. */
  noacg?: NoacgVendorBlock;
  /** A preview raster to ship as the manifest's `thumbnails[0]` - the bridge's bench shot.
   *  `data` is the image bytes (a Blob, raw bytes, or a base64 string). */
  thumbnail?: { file: string; data: Blob | Uint8Array | string; width: number; height: number };
}

export async function addOgrafPackage(
  root: JSZip,
  template: SpxTemplate,
  usage: GraphicUsage = 'live',
  opts: OgrafPackageOptions = {},
): Promise<Record<string, unknown>> {
  template = { ...template, js: prepareOutRuntime(template.js) };
  if (usage !== 'live') {
    const compatibility = validateOgrafOfflineCompatibility(template);
    if (!compatibility.compatible) {
      throw new Error(`OGraf post-production compatibility: ${compatibility.errors.join(' ')}`);
    }
  }
  const lib = opts.lib ?? DEFAULT_LIB;
  const thumbnails: OgrafThumbnail[] = opts.thumbnail
    ? [{ file: opts.thumbnail.file, resolution: { width: opts.thumbnail.width, height: opts.thumbnail.height } }]
    : [];
  const manifest = buildOgrafManifest(template, usage, { noacg: opts.noacg, thumbnails });
  const errors = validateOgrafManifest(manifest);
  if (errors.length) throw new Error(`OGraf manifest invalid: ${errors.join(' ')}`);

  // Every path this package contains, package-relative — what the manifest's `main` and any
  // thumbnail have to resolve against. Collected as we write rather than read back off the
  // zip, whose keys carry the enclosing project folder.
  const packaged: string[] = [];
  const write = (path: string, data: string | Blob | Uint8Array, options?: JSZip.JSZipFileOptions) => {
    packaged.push(path);
    root.file(path, data, options);
  };

  write(`${slug(template.name)}.ograf.json`, JSON.stringify(manifest, null, 2));
  write('graphic.mjs', graphicModule(template, lib));
  // The ID table travels with every package (LiveOS inherits it here too): an OGraf host's
  // data keys ARE these field ids, and only the package can say what each one means.
  write(
    'FIELDS.md',
    fieldReferenceMd(
      template,
      'These ids are the keys of the OGraf data object — the same names the manifest schema ' +
        'declares, and what `updateAction({ data })` carries.',
    ),
  );
  write(lib.gsap, gsapSource);
  write(lib.flexGap, flexGapShimSource);
  if (templateUsesLottie(template)) write(lib.lottie, lottieSource);
  if (opts.thumbnail) {
    const { file, data } = opts.thumbnail;
    if (typeof data === 'string') write(file, data, { base64: true });
    else write(file, data);
  }
  await addReferencedFonts(root, template);
  for (const asset of template.assets) {
    if (typeof asset.data === 'string') {
      const parsed = parseDataUrl(asset.data);
      if (parsed) write(asset.path, parsed.base64, { base64: true });
      else write(asset.path, asset.data);
    } else {
      write(asset.path, asset.data);
    }
  }

  const missing = validateOgrafPackage(manifest, packaged);
  if (missing.length) throw new Error(`OGraf package incomplete: ${missing.join(' ')}`);
  return manifest;
}

// ── SPX 1.4 ───────────────────────────────────────────────────────────────────

/** The file an SPX project loads to make its OGraf custom-action buttons work. */
export const SPX_CUSTOM_ACTIONS_FILE = 'spx-custom-actions.js';

/**
 * SPX 1.4.1 turns each manifest custom action into a controller button whose click runs
 * `customActionHandler('<id>', '<layer>')`, and defines no such function anywhere, so every
 * button throws (docs/SPX_ON_A_REAL_SERVER.md §3). Everything behind it exists: the server
 * forwards a `customAction` playout command to the renderers, and the renderer calls the
 * graphic's `customAction({ id })`. This file is the missing function, loaded by the project's
 * own script setting in SPX, outside the graphic: the Graphic stays plain OGraf and never reaches
 * into the page that hosts it.
 *
 * The layer SPX bakes into the call is the one the manifest declared at import and never changes
 * after, so the handler prefers the layer of the rundown item the button sits in. SPX's route
 * never answers the request, so it is abandoned once sent rather than holding one of the
 * browser's few connections to the server. If SPX ever ships its own handler, that one wins.
 */
export const SPX_CUSTOM_ACTIONS_JS = `// NoaCG Studio: makes SPX 1.4's OGraf custom-action buttons work.
// Load it once per project: project settings, "Javascript function library of this project",
// /templates/<the folder holding this package>/${SPX_CUSTOM_ACTIONS_FILE}
(function () {
  if (typeof window.customActionHandler === 'function') return;
  window.customActionHandler = function (id, layer) {
    var button = window.event && window.event.target;
    var item = button && button.closest ? button.closest('.itemrow') : null;
    var field = item ? item.querySelector('[name="RundownItem[webplayout]"]') : null;
    var webplayout = (field && field.value) || layer;
    var abort = typeof AbortController === 'function' ? new AbortController() : null;
    fetch('/gc/playout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'customAction', id: id, webplayout: webplayout }),
      signal: abort ? abort.signal : undefined
    }).catch(function () {});
    if (abort) setTimeout(function () { abort.abort(); }, 2000);
  };
})();
`;

/** The README's SPX section: what SPX 1.4.1 does with this package, measured on a real server. */
function spxReadmeMd(template: SpxTemplate, manifest: Record<string, unknown>): string {
  const layer = (manifest.v_spx as { webplayout: string }).webplayout;
  const actions = (manifest.customActions as Array<{ name: string; schema: unknown }> | undefined) ?? [];
  const needValues = actions.filter((a) => a.schema).map((a) => a.name);
  return (
    `\n## In SPX 1.4\n\n` +
    `Put this folder under SPX's ASSETS/templates folder, make an OGRAF-format project and add\n` +
    `${slug(template.name)}.ograf.json to it. The graphic lands on layer ${layer} and its fields arrive as SPX's own\n` +
    `controls. Play, Continue and Stop work.\n\n` +
    `Update does nothing in SPX 1.4.1. To change a graphic on air, Save, then Stop and Play.\n` +
    (actions.length
      ? `\nSPX 1.4.1 draws a button for each custom action but ships nothing behind it. This package\n` +
        `carries ${SPX_CUSTOM_ACTIONS_FILE} for that. Once per project, open the project's settings, enter\n` +
        `/templates/<the folder holding this package>/${SPX_CUSTOM_ACTIONS_FILE} as the project's Javascript\n` +
        `function library, save, and open the rundown again. Any NoaCG package's copy serves them all.\n` +
        (needValues.length
          ? `SPX sends no values with an action, so these fire without the values they take: ${needValues.join(', ')}.\n`
          : '')
      : '')
  );
}

// ── The target ────────────────────────────────────────────────────────────────

export const ografTarget: ExportTarget = {
  id: 'ograf',
  label: 'OGraf (EBU) export',
  description: 'An OGraf v1 Graphic: manifest + Web Component wrapping this template — for OGraf-compatible renderers.',
  successMessage: '✓ Exported. Load the unzipped folder in an OGraf-compatible renderer.',
  async build(template, ctx) {
    const zip = new JSZip();
    const root = zip.folder(slug(template.name))!;
    const usage = ctx?.graphicUsage ?? 'live';
    const manifest = await addOgrafPackage(root, template, usage);
    const live = usage !== 'post-production';
    if (live && manifest.customActions) root.file(SPX_CUSTOM_ACTIONS_FILE, SPX_CUSTOM_ACTIONS_JS);
    root.file(
      'README.md',
      `# ${template.name} — OGraf Graphic\n\nGenerated by NoaCG Studio.\n\n` +
        `Load the manifest (${slug(template.name)}.ograf.json) in any OGraf v1 compatible renderer.\n` +
        `Actions map to the embedded template runtime: load/updateAction → update(), playAction → play()/next(), stopAction → stop().\n` +
        `When the graphic carries a state machine, its operator events are declared as customActions in the manifest — customAction({id, payload}) fires them through the template's own serial event queue, payload applied only if the machine accepts the event.\n` +
        (live ? spxReadmeMd(template, manifest) : ''),
    );
    return zip;
  },
};
