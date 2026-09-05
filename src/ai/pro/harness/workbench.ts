// THE WORKBENCH - what the harness's tools DO, behind an interface, so the loop runs the same
// wherever the platform's own functions can be reached (docs/PRO_HARNESS_PLAN.md §4.3).
//
// The tools a model calls (tools.ts) are thin: they validate an argument, call one of these
// methods, and shape the answer. Everything that needs the platform - the type registry, the
// scaffold, the runtime bench, the instruments, a rasteriser - lives behind this interface, and
// three implementations are expected:
//
//   * the BENCH workbench (scripts/pro-harness-spike.mjs): Playwright over the dev server, the
//     same measure core `pro-iterate-spike.mjs` runs, with real screenshots;
//   * the BRIDGE workbench (later): the `/bridge` page's own functions - scaffold, validate,
//     bench, readiness, compose - driven headless, which is what the `noacg` CLI already does;
//   * the PRODUCT workbench (later): the wizard's injected validator and iframe, findings-only
//     until a rasteriser exists in the browser.
//
// A fake implementation drives the zero-token control in scripts/pro-harness.test.mjs, which
// is what proves the LOOP - gating, stop rules, budget - without a browser or a model.

import type { SpxTemplate } from '../../../model/types.js';
import type { Finding, FindingInput } from './findings.js';
import type { GraphicPatch } from './patch.js';

/**
 * What a graphic type MEANS and how it is OPERATED - the half of the knowledge split that is
 * per type (`typeSemantics.ts` reads it from the registry; the interface lives here so the pure
 * loop never imports the catalog). Nothing in it is design guidance.
 */
export interface TypeSemantics {
  id: string;
  name: string;
  description: string;
  /** The category assembler the type builds through - which spine the scaffold takes. */
  category: string;
  prefix: string;
  fields: { key: string; label: string; kind: string; role: string; sample: string }[];
  /** Operator events, in control-surface order, with what they carry. */
  events: { event: string; label: string; section?: string; carries?: string }[];
  /** How many Continue presses the default path answers (1 = a plain Take/Out graphic). */
  steps: number;
  defaultZone: string;
  logo: string;
  /** What the type covers and what it does not - the router's scope note, when one is declared. */
  scope?: string;
  /** Broadcast workflow notes from the AI category registry, when a category maps to this type. */
  workflowNotes?: string;
}

/** The semantics as the model reads them - short, and operational rather than aesthetic. */
export function describeTypeSemantics(s: TypeSemantics): string {
  const lines = [
    `Type ${s.id} - ${s.name}: ${s.description}`,
    'Fields (the operator\'s inputs, compiled in this order):',
    ...s.fields.map((f) => `- ${f.key} (${f.label}) ${f.kind}, ${f.role}; sample "${f.sample}"`),
  ];
  lines.push(s.events.length
    ? `Operator events (the buttons the control panel will show): ${s.events.map((e) => `${e.label}${e.carries ? ` (${e.carries})` : ''}`).join(', ')}.`
    : 'Operator events: Take, Update, Next, Out only (the implicit lifecycle machine).');
  lines.push(`Default path: ${s.steps} step(s). Default zone: ${s.defaultZone}. Logo slot: ${s.logo}.`);
  if (s.scope) lines.push(`Scope: ${s.scope}`);
  if (s.workflowNotes) lines.push(`On air: ${s.workflowNotes}`);
  return lines.join('\n');
}

export interface ScaffoldRequest {
  /** A registered type id - the scaffold takes its fields, machine, controls and runtime. */
  typeId?: string;
  /** Typeless: the fields the graphic carries, in operator order. */
  fields?: { label: string; kind: 'text' | 'lines' | 'number' | 'image' | 'color' | 'select' | 'toggle'; value?: string }[];
  name: string;
  zone?: string;
  fontId?: string;
  palette?: { accent: string; panel: string; text: string; textDim: string };
}

export interface Scaffold {
  template: SpxTemplate;
  /** The class prefix the spine was built with - what a patch's boxHtml is located by. */
  prefix: string;
  fields: { id: string; label: string; kind: string; sample: string }[];
  /** How many `next()` presses the default path answers. */
  steps: number;
  notes: string[];
}

export interface RenderedFrame {
  kind: 'hold' | 'long' | 'edge' | 'step';
  step?: number;
  /** The frame as the model may see it - downscaled, JPEG. Absent where the workbench cannot
   *  rasterise (the product today). */
  image?: { mediaType: string; base64: string };
}

export interface Inspection {
  /** Everything measured, normalized - blocking and advisory. */
  findings: Finding[];
  frames: RenderedFrame[];
  /** The readiness rows the CLI prints, when the workbench computes them. */
  readiness?: { label: string; state: string }[];
  /** What the inspection itself cost (a critic call), so the loop's ledger is complete. */
  costUsd: number;
}

export interface InspectOptions {
  /** Return frames the model (and the critic) can look at. Off = findings only. */
  capture: boolean;
}

export interface FinishResult {
  /** Where the graphic went - a library id, a file path, or nothing (the caller keeps the
   *  template). */
  location?: string;
  template: SpxTemplate;
}

export interface Workbench {
  listTypes(): Promise<{ id: string; name: string; description: string; fields: number; events: number }[]>;
  describeType(id: string): Promise<TypeSemantics | null>;
  scaffold(request: ScaffoldRequest): Promise<Scaffold>;
  /** Apply a patch to the current template: the pure guard (patch.ts) plus whatever platform
   *  normalization follows it - today, converting an authored ANIMATION region to keyframe data. */
  apply(template: SpxTemplate, prefix: string, patch: GraphicPatch): Promise<{ ok: true; template: SpxTemplate; changed: boolean } | { ok: false; reasons: string[] }>;
  /** Render, validate, bench, measure: the deterministic gate plus the instruments. The ONE
   *  place a measured defect becomes a finding; the critic (critique.ts) is the loop's, not the
   *  workbench's, because it spends a model call and the loop owns the budget. */
  inspect(template: SpxTemplate, prefix: string, options: InspectOptions): Promise<Inspection>;
  finish(template: SpxTemplate, name: string): Promise<FinishResult>;
}

/** Convenience for workbench implementations: the shapes every instrument's output is read
 *  into. Kept here so the bench and the product read a `{rule, message}` the same way. */
export function fromValidation(
  issues: readonly { rule: string; message: string }[],
  severity: Finding['severity'],
  frame?: Finding['frame'],
): FindingInput[] {
  return issues.map((i) => ({
    code: i.rule,
    severity,
    source: i.rule.startsWith('bench-') ? 'runtime' : i.rule.startsWith('legibility-') || i.rule.startsWith('rules-') ? 'rules' : 'static',
    ...(frame ? { frame } : {}),
    ...(locusOf(i.message) ? { locus: locusOf(i.message) } : {}),
    message: i.message,
  }));
}

/** The field id or selector a bench message names, when it names one - the locus that makes the
 *  finding's identity stable across two renders of the same defect. */
export function locusOf(message: string): string | undefined {
  const field = /#?\b(f\d+)\b/.exec(message);
  if (field) return field[1];
  const selector = /(\.[a-z][a-z0-9-]*(?:-[a-z0-9]+)*)/i.exec(message);
  return selector ? selector[1] : undefined;
}
