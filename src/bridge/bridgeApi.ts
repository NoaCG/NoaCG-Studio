// THE BRIDGE API - the platform's own functions, composed for a headless driver.
//
// `/bridge` (bridge.html + main.ts) exposes this module on `window.noacgBridge` so the `noacg`
// CLI and MCP server (docs/AGENT_CLI.md) can drive it through Playwright's `page.evaluate`:
// scaffold a graphic from a type, validate + bench one, compose the document the CLI screenshots,
// read and write the dual graphic package, derive the operator surface, mint the library record.
// Everything here is the code the studio itself runs - the type registry, `publishGate`, the
// runtime bench, `composeDocument`, the exporters, the importer, the control generator - so an
// external agent is validated by the deployment it will save into, never by a copy. The page
// holds no account, no key and no store; it answers questions about bytes it was handed.
//
// PROTOCOL: `hello()` reports `{channel, v}` - the player-host idiom (one spec module, a numeric
// version on the wire, additive fields never bump, a breaking change bumps). A CLI refuses a `v`
// it does not speak with an upgrade message rather than half-working - the pack format's posture,
// because a human can act on it.

import JSZip from 'jszip';
import { parseAnimData } from '../blocks/animData';
import { animationBreach } from '../blocks/animationRegion';
import { publishGate } from '../community/gate';
import { eventButtons, fieldDescriptors, machineStateGroups, type ControlButton } from '../control/controlModel';
import { ografContract } from '../control/ografContract';
import { buildGraphicPackage } from '../export/noacgPackage';
import { readOgrafPackage, type OgrafPackageRead, type PackageFiles } from '../export/targets/ografImport';
import type { FieldDescriptor } from '../model/fieldModel';
import { newGraphicDoc, type GraphicDocBase } from '../model/graphicDoc';
import { importZipTemplate, type ImportedTemplateResult } from '../model/importTemplate';
import { replaceDefinitionInHtml } from '../model/spxDefinition';
import type { SpxTemplate } from '../model/types';
import { paletteById, type WizardOptions, type Zone9 } from '../model/wizard';
import { packGraphicEntry, type PackGraphicFile } from '../packs/graphicsPack';
import { composeDocument } from '../preview/composeDocument';
import { ANIMATION_MARK_OPEN } from '../templates/lowerThirds/animPresets';
import { convertToDataRegion } from '../templates/shared/standard';
import { typeFieldsToSpx, variantFromType, variantsFromType, type GraphicType } from '../templates/types/graphicType';
import { hasNeutralDesign, neutralDesignFor, neutralSpineFor, type NeutralFieldSpec } from '../templates/types/neutralDesign';
import { TYPES, typeById } from '../templates/types/registry';
import { engineHeadline, engineReports, scanEngineSupport, type EngineReport } from '../validation/engineSupport';
import { readinessRows, unclaimedFindings, type ReadinessRow } from '../validation/readiness';
import { benchTemplateRuntime, mergeResults } from '../validation/runtimeBench';
import { typeFloorFor } from '../validation/typeFloor';
import type { ValidationIssue, ValidationResult } from '../validation/validateTemplate';
import { hostTagFor, ografHostDocument, type OgrafHostOptions } from './ografHost';

export const BRIDGE_CHANNEL = 'noacg-bridge' as const;
/** Bump on a BREAKING change to any function below; additive fields never bump. */
export const BRIDGE_V = 1 as const;

export interface BridgeHello {
  channel: typeof BRIDGE_CHANNEL;
  v: typeof BRIDGE_V;
  /** The deployment's commit marker (dist/version.json), null on a dev server. */
  app: { commit: string; ref: string } | null;
  origin: string;
}

export async function hello(): Promise<BridgeHello> {
  let app: BridgeHello['app'] = null;
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { commit?: unknown; ref?: unknown };
      if (typeof json.commit === 'string') app = { commit: json.commit, ref: typeof json.ref === 'string' ? json.ref : '' };
    }
  } catch {
    /* a dev server has no version.json - honest null */
  }
  return { channel: BRIDGE_CHANNEL, v: BRIDGE_V, app, origin: location.origin };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BridgeTypeSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  prefix: string;
  fields: Array<{ key: string; label: string; kind: string; value: string; role: string; ftype: string; options?: Array<{ label: string; value: string }> }>;
  /** The operator events the type's machine carries (its buttons), with declared labels. */
  events: Array<{
    event: string;
    label: string;
    section?: string;
    payload?: string[];
    adjust?: Record<string, number>;
    set?: Record<string, string>;
    add?: Record<string, string>;
    remove?: Record<string, string>;
  }>;
  designs: Array<{ id: string; name: string; description: string; styleTag: string }>;
  /** Whether `scaffold({type, design:'neutral'})` is available for this type. */
  neutral: boolean;
  capabilities: { maxLines: number; logo: string; defaultZone: string; defaultSteps: boolean };
}

/** Operator events named anywhere in the type's machine declaration. */
function declaredEvents(machine: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(machine)) machine.forEach((m) => declaredEvents(m, out));
  else if (machine && typeof machine === 'object') {
    const m = machine as Record<string, unknown>;
    if (m.trigger === 'operator' && typeof m.event === 'string') out.add(m.event);
    Object.values(m).forEach((v) => declaredEvents(v, out));
  }
  return out;
}

function summarize(type: GraphicType): BridgeTypeSummary {
  const spx = typeFieldsToSpx(type.fields);
  const declared = new Map(type.controls.map((c) => [c.event, c]));
  const events = [...declaredEvents(type.machine)].map((event) => {
    const c = declared.get(event);
    return {
      event,
      label: c?.label ?? event,
      ...(c?.section ? { section: c.section } : {}),
      ...(c?.payload?.length ? { payload: c.payload } : {}),
      ...(c?.adjust && Object.keys(c.adjust).length ? { adjust: c.adjust } : {}),
      ...(c?.set && Object.keys(c.set).length ? { set: c.set } : {}),
      ...(c?.add && Object.keys(c.add).length ? { add: c.add } : {}),
      ...(c?.remove && Object.keys(c.remove).length ? { remove: c.remove } : {}),
    };
  });
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    category: type.structure.category,
    prefix: type.structure.prefix,
    fields: type.fields.map((f, i) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      value: f.value,
      role: f.role,
      ftype: spx[i].ftype,
      ...(f.options ? { options: f.options.map((o) => ({ label: o.label, value: String(o.value) })) } : {}),
    })),
    events,
    designs: type.designs.map((d) => ({ id: d.id, name: d.name, description: d.description, styleTag: d.styleTag })),
    neutral: hasNeutralDesign(type),
    capabilities: {
      maxLines: type.capabilities.maxLines,
      logo: type.capabilities.logo,
      defaultZone: type.capabilities.defaultZone,
      defaultSteps: !!type.capabilities.defaultSteps,
    },
  };
}

export function types(): BridgeTypeSummary[] {
  return TYPES.map(summarize);
}

// ── Scaffold ─────────────────────────────────────────────────────────────────

/** Style knobs a scaffold may take - every one optional, every one a plain default otherwise. */
export interface ScaffoldStyle {
  /** A catalog palette id (model/wizard.ts PALETTES). */
  palette?: string;
  fontId?: string;
  zone?: Zone9;
  sizeScale?: number;
  typeScale?: number;
  resolution?: { width: number; height: number };
  fps?: number;
}

export type ScaffoldRequest =
  | {
      /** A registered graphic type id (`types()`). */
      type: string;
      /** A design id of that type, or `'neutral'` for the unstyled spine. Default: the first design. */
      design?: string;
      name?: string;
      /** Starting values by the type's LOGICAL field keys (lines and content alike). */
      values?: Record<string, string>;
      style?: ScaffoldStyle;
    }
  | {
      /** A typeless graphic: the fields it needs, nothing else. */
      fields: NeutralFieldSpec[];
      name?: string;
      style?: ScaffoldStyle;
    };

export interface ScaffoldResult {
  template: SpxTemplate;
  /** What the scaffold brought and what the author must keep - teaching notes, not rules. */
  notes: string[];
}

function styleOptions(style: ScaffoldStyle | undefined): WizardOptions {
  if (!style) return {};
  const o: WizardOptions = {};
  if (style.palette) o.palette = paletteById(style.palette);
  if (style.fontId) o.fontId = style.fontId;
  if (style.zone) o.zone = style.zone;
  if (style.sizeScale) o.sizeScale = style.sizeScale;
  if (style.typeScale) o.typeScale = style.typeScale;
  if (style.resolution) o.resolution = { ...style.resolution, label: `${style.resolution.width}×${style.resolution.height}` };
  if (style.fps) o.fps = style.fps;
  return o;
}

export function scaffold(req: ScaffoldRequest): ScaffoldResult {
  if ('fields' in req) {
    const template = neutralSpineFor(req.fields, { ...styleOptions(req.style), name: req.name });
    return {
      template,
      notes: [
        'Typeless graphic (type "blank"): every field you declared is an operator input; the implicit lifecycle machine gives Take/Update/Next/Out. No category is consulted anywhere.',
        'Keep the structure contract - the root, one `.graphic-box`, one `.graphic-mask` per line, the `id="fN"` ids - and the :root variables; everything else is yours.',
      ],
    };
  }
  const type = typeById(req.type);
  if (!type) {
    throw new Error(`Unknown graphic type "${req.type}". Known types: ${TYPES.map((t) => t.id).join(', ')}.`);
  }
  const designId = req.design ?? type.designs[0]?.id;
  let variant;
  const notes: string[] = [];
  if (designId === 'neutral') {
    const design = neutralDesignFor(type);
    if (!design) {
      throw new Error(
        `The "${type.id}" type has no neutral scaffold yet (its category "${type.structure.category}" builds with its own assembler). ` +
          `Start from one of its designs instead: ${type.designs.map((d) => d.id).join(', ')}.`,
      );
    }
    variant = variantFromType(type, design);
    notes.push('Neutral scaffold: the type\'s fields, machine, controls and runtime on a plain spine. The look is a placeholder - design it.');
  } else {
    variant = variantsFromType(type).find((v) => v.id === designId);
    if (!variant) {
      throw new Error(`"${designId}" is not a design of "${type.id}". Designs: ${type.designs.map((d) => d.id).join(', ')}${hasNeutralDesign(type) ? ', neutral' : ''}.`);
    }
    notes.push(`Catalog chassis "${variant.name}": a proven composition to restyle or to keep.`);
  }
  const values = req.values ?? {};
  const lineFields = type.fields.filter((f) => f.role === 'line');
  const anyLine = lineFields.some((f) => f.key in values);
  const content: Record<string, string> = {};
  for (const f of type.fields) {
    if (f.role !== 'line' && f.key in values) content[f.key] = values[f.key];
  }
  const options: WizardOptions = {
    ...styleOptions(req.style),
    ...(anyLine ? { lines: lineFields.map((f) => ({ title: f.label, sample: values[f.key] ?? f.value })) } : {}),
    ...(Object.keys(content).length ? { content } : {}),
  };
  const template = variant.create(options);
  const events = [...declaredEvents(type.machine)];
  if (events.length) {
    notes.push(`The type's state machine travels inside js/template.js (the marked ANIMATION region's NOACG_ANIM block): operator events ${events.join(', ')} become control-panel buttons. Keep the interpreter below the data untouched; edit the keyframe DATA for different motion.`);
  } else {
    notes.push('No explicit machine: the implicit lifecycle machine (Take/Update/Next/Out) drives it.');
  }
  notes.push('Keep every `id="fN"` the SPX definition declares, the `.<prefix>-box` / `-mask` structure and the :root variables; restyle everything else.');
  return { template: req.name ? withName(template, req.name) : template, notes };
}

/**
 * Name a scaffolded template IN ITS SOURCES, not only on the record. The package's name is read
 * back from the html (`<title>`, then the SPX definition's `description`) every time the bridge
 * re-reads the folder - `noacg validate` regenerates from exactly that read - so a name that sat
 * only on `template.name` was lost on the first round trip: the regenerated package took the
 * design's own name, wrote a SECOND `<slug>.html` + `<slug>.ograf.json` beside the first, and the
 * folder stopped being one graphic. Found by walking a scaffolded package through validate
 * (2026-08-22); pinned by e2e/bridge.spec.ts.
 */
function withName(template: SpxTemplate, name: string): SpxTemplate {
  const settings = { ...template.settings, description: name };
  const titleText = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = replaceDefinitionInHtml(template.html, settings, template.fields);
  html = /<title[^>]*>[^<]*<\/title>/i.test(html)
    ? html.replace(/(<title[^>]*>)[^<]*(<\/title>)/i, `$1${titleText}$2`)
    : html.replace(/<head([^>]*)>/i, `<head$1>\n  <title>${titleText}</title>`);
  return { ...template, name, settings, html };
}

// ── Normalize (an authored ANIMATION region -> NoaCG's keyframe data) ────────

export interface NormalizeResult {
  template: SpxTemplate;
  /** True when the marked region was in the AUTHORING shape (GSAP builders) and was converted
   *  to the NOACG_ANIM data block + interpreter - the same conversion every wizard create and
   *  every in-app AI emit goes through. False = already data-shaped, or not convertible. */
  converted: boolean;
  /** Whether the region is data-shaped AFTER this call (timeline-editable in the studio). */
  dataRegion: boolean;
  note: string;
}

/**
 * Ground a hand-authored template the way the studio grounds every emit: a marked ANIMATION
 * region written as plain GSAP builders (`buildInTimeline`/`buildOutTimeline` - what a coding
 * agent naturally writes) is converted into NoaCG's keyframe DATA block + interpreter through
 * the same parity-proven importer the wizard categories use at create
 * (`templates/shared/standard.ts convertToDataRegion`), so the studio's timeline and Style
 * panel can edit it. An already data-shaped region passes through untouched; a region the
 * importer cannot read keeps the author's code byte-identical - honest hand-crafted output the
 * timeline renders read-only. Mirrors `src/ai/claudeProvider.ts convertEmittedRegion`.
 */
export function normalize(template: SpxTemplate): NormalizeResult {
  if (parseAnimData(template.js)) {
    return { template, converted: false, dataRegion: true, note: 'The ANIMATION region is already NoaCG keyframe data (timeline-editable).' };
  }
  const attempt: SpxTemplate = { ...template, js: template.js.replace(/\/\* == ANIMATION[^\n]*?== \*\//, () => ANIMATION_MARK_OPEN) };
  convertToDataRegion(attempt);
  if (parseAnimData(attempt.js)) {
    return {
      template: attempt,
      converted: true,
      dataRegion: true,
      note: 'Converted the authored GSAP builders inside the ANIMATION markers into the NOACG_ANIM keyframe data block + interpreter (timeline-editable). Edit the DATA for different motion; never the interpreter.',
    };
  }
  // NAME THE PRECONDITION, NEVER THE GRAMMAR. This used to hand back a list of things the
  // converter cannot read, which is no help to an agent whose region contains none of them: on
  // 2026-09-06 the identical sentence in the Pro Harness cost a correct timeline four rounds and
  // $0.072, and the whole defect was two absent `var` lines (docs/AI_ATTEMPTS.md). `animationBreach`
  // walks the importer's own checks in the importer's own order and quotes the first unmet one.
  const breach = animationBreach(template.js);
  return {
    template,
    converted: false,
    dataRegion: false,
    note: breach
      ? `The ANIMATION region could not be converted to keyframe data: ${breach} The graphic still plays and exports; the studio timeline shows its motion read-only.`
      : 'The ANIMATION region met every declaration the importer requires, so what it cannot read is inside a tween - use literal values only, durations as N / animSpeed, and no DOM measurement. The graphic still plays and exports; the studio timeline shows its motion read-only.',
  };
}

// ── Validate ─────────────────────────────────────────────────────────────────

const EDITABILITY_RULE = 'bench-editability';

/** Residual editability findings on an unconvertible region become warnings: the template
 *  plays and exports, the studio timeline just reads its motion read-only (the harness's own
 *  posture, `src/ai/claudeProvider.ts demoteEditability`). */
function demoteEditability(v: ValidationResult): ValidationResult {
  const demoted = v.errors.filter((e) => e.rule === EDITABILITY_RULE);
  if (!demoted.length) return v;
  const errors = v.errors.filter((e) => e.rule !== EDITABILITY_RULE);
  return { ok: errors.length === 0, errors, warnings: [...v.warnings, ...demoted] };
}

export interface BridgeValidateOptions {
  /** Run the live runtime bench (default true). False = the static gate only. */
  bench?: boolean;
  /** The house EDITABILITY contract (prefix box, readable NOACG_ANIM, :root vars) as errors
   *  (default true - a graphic NoaCG cannot edit is a lesser deliverable; pass false for a
   *  graphic meant to be playable but not editable in the studio). A hand-authored region the
   *  converter could not read is not failed over it: those findings demote to warnings. */
  houseContract?: boolean;
  timeoutMs?: number;
}

export interface BridgeValidation {
  ok: boolean;
  /** The static gate (publishGate: validateTemplate + the share-safety screen). */
  gate: ValidationResult;
  /** The live bench, or null with `benchSkipped` saying why. */
  bench: ValidationResult | null;
  benchSkipped: string | null;
  merged: ValidationResult;
  readiness: ReadinessRow[];
  unclaimed: ValidationIssue[];
  engines: EngineReport[];
  engineHeadline: string;
  /** The findings as teaching lines - the shape the in-app repair loop hands a model. */
  text: string;
}

const categoryFor = (template: SpxTemplate): string => (template.type === 'bug' ? 'corner-bug' : template.type);

export async function validate(template: SpxTemplate, opts: BridgeValidateOptions = {}): Promise<BridgeValidation> {
  const gate = publishGate(template);
  const unsafe = gate.errors.filter((e) => e.rule.startsWith('unsafe-js'));
  let bench: ValidationResult | null = null;
  let benchSkipped: string | null = null;
  if (opts.bench === false) benchSkipped = 'not requested';
  else if (unsafe.length) {
    // Fail closed: the bench EXECUTES the template, and the share-safety screen just said it
    // reaches for the network, storage, code building or another frame. Teach; do not run.
    benchSkipped = `the safety screen refused to execute this template (${unsafe.map((u) => u.rule).join(', ')})`;
  } else {
    bench = await benchTemplateRuntime(template, {
      timeoutMs: opts.timeoutMs ?? 20_000,
      houseContract: opts.houseContract ?? true,
      fieldPaints: true,
      typeFloorPx: typeFloorFor(categoryFor(template)),
    });
    // A region that is honestly hand-crafted (no keyframe data, and nothing to convert) is not a
    // failure over panel editability - the in-app harness's own rule after conversion had its chance.
    if (!parseAnimData(template.js)) bench = demoteEditability(bench);
  }
  const merged = bench ? mergeResults(gate, bench) : gate;
  const support = scanEngineSupport(template);
  const lines = [
    ...merged.errors.map((e) => `- ERROR ${e.rule}: ${e.message}`),
    ...merged.warnings.map((w) => `- WARN ${w.rule}: ${w.message}`),
  ];
  if (benchSkipped) lines.push(`- NOTE bench-skipped: ${benchSkipped}`);
  return {
    ok: merged.ok,
    gate,
    bench,
    benchSkipped,
    merged,
    readiness: readinessRows(merged, bench !== null),
    unclaimed: unclaimedFindings(merged),
    engines: engineReports(support),
    engineHeadline: engineHeadline(support),
    text: lines.join('\n'),
  };
}

// ── Inspect (the operator surface) ───────────────────────────────────────────

export interface BridgeInspection {
  descriptors: FieldDescriptor[];
  buttons: ControlButton[];
  /** Snap-able state groups (a NoaCG template with an explicit machine); empty otherwise. */
  stateGroups: Array<{ id: string; states: Array<{ id: string; name: string }> }>;
  steps: { count: number; stepped: boolean };
  notes: string[];
}

/** The operator surface a graphic gets - derived from the graphic's own contract, never a category. */
export function inspect(input: { template?: SpxTemplate; manifest?: unknown }): BridgeInspection {
  if (input.template) {
    const t = input.template;
    const count = Math.max(1, Number(t.settings.steps) || 1);
    return {
      descriptors: fieldDescriptors(t.fields),
      buttons: eventButtons(t.js),
      stateGroups: machineStateGroups(t.js),
      steps: { count, stepped: count > 1 },
      notes: ['Derived from the SPX DataFields (inputs) and the NOACG_ANIM machine (buttons) inside the template - the same generator every NoaCG control surface renders.'],
    };
  }
  const c = ografContract(input.manifest);
  return { descriptors: c.descriptors, buttons: c.buttons, stateGroups: [], steps: c.steps, notes: c.notes };
}

// ── Compose (what the CLI screenshots) ───────────────────────────────────────

/** Every data field at its definition default - the settle recipe the thumbnails use. */
export function defaultData(template: SpxTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.ftype === 'button' || f.ftype === 'instruction' || f.ftype === 'caption' || f.ftype === 'divider' || f.ftype === 'spacer') continue;
    out[f.field] = String(f.value ?? '');
  }
  return out;
}

/** The stress frame: every text doubled, every number widened - the bench's own stress recipe
 *  in data form, so a screenshot shows what a long name and a big score do to the design. */
export function stressData(template: SpxTemplate): Record<string, string> {
  const out = defaultData(template);
  for (const f of template.fields) {
    if (!(f.field in out)) continue;
    const v = out[f.field];
    if (f.ftype === 'textfield') out[f.field] = v ? `${v} ${v}`.slice(0, 96) : 'Stress value stress value';
    else if (f.ftype === 'textarea') out[f.field] = v ? `${v}\n${v}` : 'Stress line one\nStress line two\nStress line three';
    else if (f.ftype === 'number') out[f.field] = '888';
    else if (f.ftype === 'dropdown' && f.items?.length) out[f.field] = f.items.reduce((a, b) => (b.value.length > a.length ? b.value : a), f.items[0].value);
  }
  return out;
}

/**
 * The runnable document for a state: `'off'` (nothing settled - what a keyed graphic shows
 * before its cue, which should be nothing), `'onair'` (settled with the defaults), `'stress'`,
 * or an explicit data object. The CLI renders it in a second page and screenshots it.
 */
export function compose(template: SpxTemplate, state: 'off' | 'onair' | 'stress' | Record<string, string> = 'onair'): string {
  if (state === 'off') return composeDocument(template);
  const data = state === 'onair' ? defaultData(template) : state === 'stress' ? stressData(template) : state;
  return composeDocument(template, { settleWithData: JSON.stringify(data) });
}

// ── Packages ─────────────────────────────────────────────────────────────────

export interface PackageRead {
  /** 'noacg' = our dual package (sources + v_noacg); 'spx' = an SPX/html zip; 'ograf' = a
   *  third-party OGraf package with no NoaCG sources. */
  kind: 'noacg' | 'spx' | 'ograf';
  imported: ImportedTemplateResult | null;
  ograf: OgrafPackageRead | null;
}

const TEXT_EXT = /\.(json|mjs|js|css|html?|md|txt|svg|xml)$/i;

/** Read any package zip: a NoaCG dual package, an SPX zip, or a stranger's OGraf Graphic. */
export async function readPackage(bytes: ArrayBuffer | Uint8Array, fileName = 'package.zip'): Promise<PackageRead> {
  const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer : bytes;
  const zip = await JSZip.loadAsync(buffer);
  const files: Map<string, string | Uint8Array> = new Map();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    files.set(path, TEXT_EXT.test(path) ? await entry.async('string') : await entry.async('uint8array'));
  }
  const ograf = readOgrafPackage(files as PackageFiles);
  // No html at all = a pure OGraf Graphic (or not a graphic package); the importer's throw is
  // that answer, not an error here.
  const imported: ImportedTemplateResult | null = await importZipTemplate(fileName, buffer).catch(() => null);
  if (!imported && !ograf) throw new Error('Not a graphic package: no .html entry and no .ograf.json manifest.');
  const kind: PackageRead['kind'] = imported ? (ograf?.noacg ? 'noacg' : 'spx') : 'ograf';
  return { kind, imported, ograf };
}

export interface ExportPackageOptions {
  /** A PNG for the manifest's `thumbnails` - base64 bytes plus its pixel size. */
  thumbnail?: { base64: string; width: number; height: number };
}

/** The dual package as zip bytes (export/noacgPackage.ts). */
export async function exportPackage(template: SpxTemplate, opts: ExportPackageOptions = {}): Promise<Uint8Array> {
  const zip = await buildGraphicPackage(template, {
    thumbnail: opts.thumbnail
      ? { file: 'thumbnail.png', data: opts.thumbnail.base64, width: opts.thumbnail.width, height: opts.thumbnail.height }
      : undefined,
  });
  return zip.generateAsync({ type: 'uint8array' });
}

/** One graphic as the pack file's entry - the save API's payload (packs/graphicsPack.ts). */
export function packEntry(template: SpxTemplate, opts: { name?: string; layer?: number } = {}): Promise<PackGraphicFile> {
  return packGraphicEntry(template, opts);
}

/** The library record for a template (model/graphicDoc.ts - the same shape the studio saves). */
export function graphicDoc(
  template: SpxTemplate,
  opts: { name: string; folder?: string; origin?: { tool: string; version?: string } },
): GraphicDocBase {
  return newGraphicDoc(template, {
    name: opts.name,
    ...(opts.folder ? { folder: opts.folder } : {}),
    origin: opts.origin ?? { tool: 'noacg-cli' },
  });
}

// ── The OGraf host (third-party packages) ────────────────────────────────────

export { hostTagFor };
export function ografHost(opts: OgrafHostOptions): string {
  return ografHostDocument(opts);
}

/** Everything the page installs on `window.noacgBridge`. */
export const bridgeApi = {
  BRIDGE_CHANNEL,
  BRIDGE_V,
  hello,
  types,
  scaffold,
  normalize,
  validate,
  inspect,
  defaultData,
  stressData,
  compose,
  readPackage,
  exportPackage,
  packEntry,
  graphicDoc,
  ografHost,
  hostTagFor,
};

export type BridgeApi = typeof bridgeApi;
