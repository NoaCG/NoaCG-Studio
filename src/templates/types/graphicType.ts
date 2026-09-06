// The GRAPHIC TYPE contract (docs/GRAPHIC_TYPES.md).
//
// A type says WHAT a graphic is — its structure, its fields, its state groups and default
// path, and the events an operator can send it — independently of what it looks like. A
// design says what it looks like. Phase 3's catalog is types × themes, Phase 4's node editor
// edits any type's graph, and Phase 5 generates a control page from the machine; all three
// need the type to be the thing that knows.
//
// A type is a DECLARATION, not a second way to build a template. `variantsFromType` compiles
// one into ordinary TemplateVariants that go through the category's existing assembler, so
// `variant.create(options) -> SpxTemplate` remains the single contract the wizard, the AI, the
// sweeps and every spec already speak.
//
// THE RULE THAT KEEPS THIS SMALL: persist a machine only when the derived one is wrong.
// deriveMachine already gives every template a correct one-group linear machine, so a type
// with no branches, no parallel groups and no event overrides compiles to NO machine key and
// emits exactly what it emitted before. Most types are in that class, and that is the design
// working rather than a shortcut.

import type { AnimData, AnimGroup, AnimMachine, AnimState, AnimStep, AnimTransition, AnimLayerTracks, MachineControl } from '../../blocks/animData';
import { isAnimData, parseAnimData } from '../../blocks/animData';
import { allOperatorEvents, deriveMachine, MAIN_GROUP_ID, spxSteps } from '../../blocks/animMachine';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { writeAnimData } from '../shared/animRuntime';
import type { FieldKind, FieldOption } from '../../model/fieldModel';
import type { SpxField, SpxTemplate } from '../../model/types';
import type { TemplatePart } from '../../model/structure';
import type { StyleTag } from '../../model/fonts';
import { fieldPlanOf } from '../../model/wizard';
import type {
  AnimPresetId,
  LineSpec,
  LogoSupport,
  MarkPlacement,
  Palette,
  ResolvedOptions,
  AssemblerId,
  TemplateVariant,
  Zone9,
} from '../../model/wizard';

// ── Structure ────────────────────────────────────────────────────────────────

/** One element a type PROMISES its designs will carry. The machine, the control events and
 *  (later) a theme name parts logically, so none of them has to know a design's CSS. */
export interface TypePart {
  /** The logical name everything else references: 'accent', 'rows', 'optionA'. */
  id: string;
  /** A single-token selector, the model/structure.ts registry rule. */
  selector: string;
  kind: TemplatePart['kind'];
  /** A required part missing from a design is a compile error, not a silent no-op. */
  required: boolean;
}

/**
 * A LINE part is always optional, and a `required: true` on one is a trap.
 *
 * `create()` re-checks the required parts on EVERY call, and a design is index-safe (maskLine
 * emits nothing for a line the caller left out, so a cleared field takes no space — the whole
 * premise of the info-card pack). So creating with fewer lines than a required line's index —
 * which the catalog sweep does deliberately, a two-line create to test wrapping — legitimately
 * emits fewer `#fN` elements, and a required one then makes `create()` THROW instead of
 * degrading. Only STRUCTURAL parts a design always emits regardless of line count (the box, a
 * divider, an alert wash) may be required; a line part is documented but optional. That a design
 * emits its lines at all at the full field set is proven by the fields gate and by the
 * `create({})` the conformance spec runs — not by making a partial create throw.
 */
export const optionalLine = (id: string, selector: string): TypePart => ({
  id,
  selector,
  kind: 'line',
  required: false,
});

export interface TypeStructure {
  /** The class prefix contract ('lower-third'); what detectPrefix keys off. */
  prefix: string;
  /** The category whose assembler and design builders this type reuses. */
  category: AssemblerId;
  parts: TypePart[];
}

// ── Fields ───────────────────────────────────────────────────────────────────

/**
 * A field, named LOGICALLY. `fN` ids are positional and get assigned at compile time, so a
 * type never writes one down and inserting a field renumbers nothing it references.
 *
 * `role` routes the field into the plumbing that already exists for its shape — it is about
 * WHERE the value lives in the markup, never about who may edit it:
 *  - `line`   a visible text line (fieldsFromOptions numbers these f0..n-1, so they compile first);
 *  - `data`   an operator value with its own element (a score, a rows source);
 *  - `hidden` input-only, in a display:none holder (a countdown's minutes);
 *  - `logo`   the image slot (shared/logoSlot.ts owns the markup, and computes its id from the
 *             count of everything else — so these compile LAST).
 *
 * The CONTROL a field gets comes from `kind` alone, for every role. A duration sits in a
 * display:none holder because printing "5" on the graphic would be meaningless, not because
 * the operator is not the one who types it — they are, which is what "input-only" means.
 */
export interface TypeField {
  key: string;
  label: string;
  kind: FieldKind;
  value: string;
  role: 'line' | 'data' | 'hidden' | 'logo';
  options?: FieldOption[];
}

/**
 * SPX ftype for a field kind. The broadcast field policy (src/templates/CLAUDE.md) keeps
 * dropdown/checkbox/color for genuinely constrained choices — a type opting into one is
 * making that claim deliberately.
 *
 * `role` is deliberately NOT read here. It used to short-circuit to ftype `hidden` for the
 * hidden role, which conflated two different things: SPX's `hidden` ftype takes a field AWAY
 * from the operator (controlModel.ts skips it on every operator surface), while the role only
 * says the value has no visible element of its own. A countdown's duration is typed by the
 * operator like any other value, so it compiles to its kind's control.
 */
function ftypeFor(field: TypeField): SpxField['ftype'] {
  switch (field.kind) {
    case 'lines': return 'textarea';
    case 'number': return 'number';
    case 'image': return 'filelist';
    case 'select': return 'dropdown';
    case 'toggle': return 'checkbox';
    case 'color': return 'color';
    default: return 'textfield';
  }
}

/**
 * Compile a type's fields to SPX DataFields, assigning f0..fN in declaration order. Throws
 * when the declaration order would desync those ids from the assembler that will emit them —
 * a type is our own code, so a wrong order is a bug to fail on, not a runtime surprise.
 */
export function typeFieldsToSpx(fields: TypeField[]): SpxField[] {
  const lastLine = fields.map((f) => f.role).lastIndexOf('line');
  const firstNonLine = fields.findIndex((f) => f.role !== 'line');
  if (lastLine >= 0 && firstNonLine >= 0 && firstNonLine < lastLine) {
    throw new Error('GraphicType: every `line` field must come before the others (fieldsFromOptions numbers lines f0..n-1).');
  }
  const logoAt = fields.findIndex((f) => f.role === 'logo');
  if (logoAt >= 0 && logoAt !== fields.length - 1) {
    throw new Error('GraphicType: the `logo` field must be declared last (applyLogoSlot derives its id from the field count).');
  }
  return fields.map((field, i) => {
    const spx: SpxField = { field: `f${i}`, ftype: ftypeFor(field), title: field.label, value: field.value };
    if (field.kind === 'image') {
      spx.assetfolder = './images/';
      spx.extension = 'png';
    }
    if (field.options) spx.items = field.options.map((o) => ({ text: o.label, value: String(o.value) }));
    return spx;
  });
}

/** The `fN` id a logical key compiled to — what a control event's payload resolves through. */
export function fieldIdFor(fields: TypeField[], key: string): string | null {
  const at = fields.findIndex((f) => f.key === key);
  return at < 0 ? null : `f${at}`;
}

/** The type's line fields as wizard LineSpecs (the suggested-lines starting point).
 *  `samples` is the promoted design's own starting text, by logical key — see TypeDesign. */
export function typeLines(fields: TypeField[], samples?: Record<string, string>): LineSpec[] {
  return fields
    .filter((f) => f.role === 'line')
    .map((f) => ({ title: f.label, sample: samples?.[f.key] ?? f.value }));
}

// ── The machine ──────────────────────────────────────────────────────────────

/** A state's timeline, named in LOGICAL parts and with the ease declared by ROLE. `reveals`
 *  and `hides` are absent by construction: they are the ordered walk's mechanics and are
 *  invalid on an inline timeline, so a type simply cannot write one. */
export type TypeTimeline = Omit<AnimStep, 'layers' | 'reveals' | 'hides' | 'ease'> & {
  ease: 'in' | 'out';
  layers: Record<string, AnimLayerTracks>;
};

/** A waypoint on the derived default path, addressed by position (-1 = the exit) because a
 *  type cannot know the state ids deriveMachine will fold out of the step names. */
export interface WaypointRef {
  waypoint: number;
}

export type TypeEndpoint = string | WaypointRef;

export interface TypeEdge {
  from: TypeEndpoint;
  to: TypeEndpoint;
  trigger: 'operator' | 'timer';
  /** operator only. Never a reserved built-in ('play'/'stop'). */
  event?: string;
  /** timer only: speed-relative seconds after the from-state's entry timeline settles. */
  after?: number;
}

/** An off-path state. `timeline: null` is POSE-ONLY — entering it plays nothing. */
export interface TypeBranch {
  id: string;
  name?: string;
  timeline: TypeTimeline | null;
  edges: TypeEdge[];
}

/** A parallel group: a small independent graph with its own pointer. These are declared
 *  literally — nothing derives them, and the shape gate forbids them a default path. */
export interface TypeGroup {
  id: string;
  initial: string;
  states: TypeBranch[];
}

export interface TypeMachine {
  main?: {
    id?: string;
    /** The event on the arrow from waypoint i to i+1. Missing entries default to 'next'. */
    pathEvents?: string[];
    /** Author the arrow INTO the exit, so `next` alone takes the graphic off air. Default
     *  false = exact parity with a graphic that has no machine at all. */
    exitOnNext?: boolean;
    /**
     * Extra arrows BETWEEN waypoints of the default path — the one thing `branches` cannot
     * express, because a branch's edges always have the branch at one end.
     *
     * The case that needed it is the transition type: a stinger covers the frame, holds, and
     * clears ITSELF after a beat, which is a `timer` arrow from waypoint 0 straight to the
     * exit. Modelling that as a branch would have meant inventing an off-path "cleared" state
     * that duplicates the exit — a second way to be off air, which the schema's "reset is two
     * operations, never conflated" instinct is exactly against.
     *
     * Endpoints are the ordinary WaypointRef/id pair, so `{ waypoint: 0 } → { waypoint: -1 }`
     * reads as "from the entrance to the exit" whatever the step count resolves to.
     */
    edges?: TypeEdge[];
    branches?: TypeBranch[];
  };
  parallel?: TypeGroup[];
}

// ── Control events ───────────────────────────────────────────────────────────

/** What Phase 5 turns into a button. It lives on the TYPE rather than on each transition
 *  because one event is often authored on several arrows (a quiz's `select` on three), and
 *  the label belongs to the event, not to any one arrow. */
export interface TypeControlEvent {
  event: string;
  label: string;
  order?: number;
  /** Groups buttons on a control surface ('Clock', 'Answer'). */
  section?: string;
  /** Logical field keys whose values RIDE this event, applied only if it is accepted. */
  payload?: string[];
  /** Logical field keys whose current value, MOVED by the delta, rides this event - a goal's
   *  `{ scoreA: 1 }`. The surface computes the new figure and it rides as ordinary payload, so
   *  the score changes exactly when the animation the event plays does, and not otherwise. */
  adjust?: Record<string, number>;
  /** Logical field keys the press SETS to the declared figure - a score board's "New game"
   *  putting every score back to 0. The third member of the payload family: `payload` rides a
   *  field as it reads, `adjust` rides it moved, and only this one can express a reset. */
  set?: Record<string, string>;
  /** Logical LIST field keys the press ADDS A LINE TO, each mapped to the logical field whose
   *  current value is the line - a puzzle board's `{ revealed: 'guess' }`. The fourth member, the
   *  list twin of `adjust`: the surface appends the source to the list and the whole list rides as
   *  payload. The list must be a `lines` field; the source may be any field. */
  add?: Record<string, string>;
  /** The honest inverse of `add`, for an undo: the last line equal to the source comes out. */
  remove?: Record<string, string>;
  destructive?: boolean;
}

// ── The type ─────────────────────────────────────────────────────────────────

/** The wizard-facing capabilities a compiled variant carries. */
export interface TypeCapabilities {
  maxLines: number;
  logo: LogoSupport;
  animationPresets: AnimPresetId[];
  defaultZone: Zone9;
  /** Whether this graphic is STEPPED by construction — a numbered process, a checklist, a
   *  reveal that only makes sense one press at a time (TemplateVariant.defaultSteps). Absent
   *  = off, so every existing type compiles exactly what it compiled before. */
  defaultSteps?: boolean;
}

/** One look. Phase 2 ships one per type (the house theme); Phase 3 makes this array the
 *  types × themes matrix without the type shape changing. */
export interface TypeDesign {
  /** The catalog variant id this design ships as. Promoting an existing variant KEEPS its id. */
  id: string;
  name: string;
  description: string;
  styleTag: StyleTag;
  palette: Palette;
  fontId: string;
  /**
   * This design's own starting text, by the type's LOGICAL field key. A type declares one set
   * of field values, but a design is written around its own: the shot-clock countdown says
   * "SHOT CLOCK", not the type's "ROUND 1", and the stat card says "87%", not a poll question.
   * Without this a promoted design arrives in the wizard showing text it was never designed
   * around — which is what "promotion changes a design's identity, not what a user sees"
   * forbids.
   *
   * Unlike the theme-token override map, entries here are NOT conformance debt to be driven to
   * zero: a sample is supposed to suit its design. Only keys the design actually differs on
   * need listing; anything absent falls through to the type's value.
   */
  samples?: Record<string, string>;
  /**
   * This design's own motion vocabulary, when it differs from the type's. Same escape hatch as
   * `samples`, for the same reason: a type declares one list, but a design is authored around
   * its own — lt05's lean is drawn to survive the snap-stinger slam, and card03's glass panel
   * was tuned for pop-spring.
   *
   * The FIRST entry is the default, so this is not a cosmetic list: `resolveOptions` falls back
   * to `animationPresets[0]`, and the wizard offers only what the list contains. Without this a
   * promoted design defaults to a preset it was never designed for and loses the one it was —
   * card02's snap-stinger stopped being reachable at all, and sb02 "Quiet Score" (minimal)
   * defaulted to a sport stinger because its type's other design happened to be a sport one.
   *
   * The drift is invisible to every mechanical check, which is why it survived: `create({})`
   * resolves the preset from the design's OWN variant record, so the emitted code — and every
   * baseline taken from it — never moves. Only the wizard, the Inspector and the AI's legal-
   * preset set read the compiled list. `graphic-types.spec.ts` now checks it directly.
   */
  animationPresets?: AnimPresetId[];
  /**
   * Where this design sits, when it differs from the type's. The same escape hatch again, for
   * the third capability that is really a property of the design: a type says a sponsor bug is
   * "parked in a corner", but WHICH corner is a drawing decision — bug01's frosted tile is
   * authored for the top-right safe area, and the type was moving it to the top-left.
   */
  defaultZone?: Zone9;
  /**
   * Whether this design starts stepped, when it differs from the type's answer. The fourth
   * capability that is really a property of the design: a notice card and a checklist can be
   * the same TYPE of graphic — words in a panel — while only one of them is meaningless
   * without its presses.
   */
  defaultSteps?: boolean;
  /**
   * Whether THIS DESIGN draws a mark, when it differs from the type's answer - the fifth
   * capability that is really a property of the design, and the one the 2026-08-21 mark ruling
   * made necessary (`docs/MARK_CAPABILITY_AUDIT.md`).
   *
   * THE TYPE PERMITS; THE DESIGN IMPLEMENTS. A type saying `logo: 'optional'` is a statement that
   * nothing about this KIND of graphic excludes a mark - the owner's rule that a mark is forbidden
   * only by a genuine type constraint, never by an authoring default. Whether a particular design
   * has anywhere sensible to put one is a drawing decision, and it belongs to the design.
   *
   * `graphic-types.spec.ts` is what forced the distinction rather than any argument here: flipping
   * `countdownType` to `optional` silently re-capabilitied gt01, gt02, gt05 and gt06, which were
   * authored without a slot, and the promotion check caught all four by name.
   */
  logo?: LogoSupport;
  /**
   * WHERE this design puts the mark, when its category default is wrong for it. The companion
   * to `logo` above: that one says whether a design draws a mark at all, this says where it
   * goes, and both are the DESIGN's to answer (owner, 2026-08-21 - placement depends on the
   * design, so the platform holds no rule about it). Absent keeps the category default.
   */
  markPlacement?: MarkPlacement;
  /**
   * Why this design belongs to THIS type, when a mechanical signal says it might not.
   *
   * The semantics gate (docs/GRAPHIC_TYPES.md §5) is the one that cannot be automated: lt01
   * into social-bug matched on parts, fields and count, and was still the wrong graphic. What
   * CAN be automated is the SIGNAL — a design whose own variant labels its lines differently
   * from the type's field labels ("Name" vs "Handle") is exactly that case.
   * `scripts/factory.mjs` raises it; this field is the author's acknowledgement that the
   * difference was read and is intended. Absent, a raised signal fails the batch.
   */
  semantics?: string;
  /** Build the template. A type reuses its category's existing assembler here — it never
   *  grows an assembly path of its own. */
  create(type: GraphicType, options?: Parameters<TemplateVariant['create']>[0]): SpxTemplate;
}

export interface GraphicType {
  id: string;
  name: string;
  description: string;
  /**
   * The structural coverage this type promises, stated where the NAME promises more — the
   * AI router's scope note (src/ai/structuralIntent.ts). A "Bracket" is single-elimination
   * only, so a double-elimination brief must not be adapted onto it; without this note the
   * router has no way to know, because nothing mechanical in the declaration encodes it
   * (the rounds parse from one textarea at any depth — the limit is semantic).
   *
   * Same doctrine as the machine: declare one only when the name's implied scope is wrong.
   * A lower third's name promises exactly what the type carries, so it declares nothing.
   * Phrase it as what IS covered followed by what is NOT ("One single-elimination tree …
   * No losers bracket, no double elimination") — the router's intent stage quotes it
   * verbatim to the model.
   */
  structuralScope?: string;
  /** How many of the 60 reference formats need this graphic — Phase 3's pack input. */
  frequency?: number;
  structure: TypeStructure;
  fields: TypeField[];
  machine: TypeMachine;
  controls: TypeControlEvent[];
  capabilities: TypeCapabilities;
  designs: TypeDesign[];
}

// ── Compiling the machine ────────────────────────────────────────────────────

const selectorFor = (type: GraphicType, part: string): string =>
  type.structure.parts.find((p) => p.id === part)?.selector ?? part;

/** Resolve a timeline's logical layer names to selectors. */
function resolveTimeline(type: GraphicType, tl: TypeTimeline, easeIn: string, easeOut: string): AnimStep {
  const layers: Record<string, AnimLayerTracks> = {};
  for (const [part, tracks] of Object.entries(tl.layers)) layers[selectorFor(type, part)] = tracks;
  const { ease, ...rest } = tl;
  return { ...rest, ease: ease === 'out' ? easeOut : easeIn, layers };
}

function resolveEndpoint(endpoint: TypeEndpoint, path: string[]): string {
  if (typeof endpoint === 'string') return endpoint;
  const at = endpoint.waypoint < 0 ? path.length + endpoint.waypoint : endpoint.waypoint;
  return path[at] ?? path[path.length - 1];
}

function toTransition(edge: TypeEdge, path: string[]): AnimTransition {
  const t: AnimTransition = {
    from: resolveEndpoint(edge.from, path),
    to: resolveEndpoint(edge.to, path),
    trigger: edge.trigger,
  };
  if (edge.event !== undefined) t.event = edge.event;
  if (edge.after !== undefined) t.after = edge.after;
  return t;
}

/**
 * Compile a type's machine declaration against the animation data the assembler produced.
 *
 * The main group's default path is DERIVED, never declared: its length must equal the step
 * count, and the step count depends on the preset, the line count and the steps flag, so any
 * literal path a type wrote down would be wrong for some options. We take deriveMachine's
 * answer — which is also what the runtime derives, so editor and playout agree by
 * construction — and then layer the type's declarations onto it.
 *
 * Returns null when the type added nothing, meaning the derived machine is already correct
 * and the template should carry no machine key at all.
 */
export function compileMachine(
  type: GraphicType,
  data: AnimData,
  ease: { easeIn: string; easeOut: string },
): AnimData['machine'] | null {
  const spec = type.machine;
  const branches = spec.main?.branches ?? [];
  const pathEdges = spec.main?.edges ?? [];
  const parallel = spec.parallel ?? [];
  const wantsMain =
    !!spec.main?.pathEvents?.length ||
    !!spec.main?.exitOnNext ||
    branches.length > 0 ||
    pathEdges.length > 0;
  if (!wantsMain && parallel.length === 0) return null;

  const derived = deriveMachine(data);
  const main: AnimGroup = JSON.parse(JSON.stringify(derived.groups[0]));
  // The derived machine materialises the lifecycle play/stop edges, but a COMPILED machine
  // must not persist them: they are fully derivable (parseAnimData injects them on read, at
  // their canonical sort positions), and "persist a machine only when the derived one is
  // wrong" — writing derivable edges here would be exactly the redundancy that rule forbids.
  main.transitions = main.transitions.filter((t) => t.trigger !== 'lifecycle');
  const path = main.defaultPath ?? [];
  if (spec.main?.id) main.id = spec.main.id;

  // Rename the walk's arrows to the type's own event vocabulary. Only OPERATOR arrows are
  // the walk's — the derived machine also carries the materialised lifecycle play/stop
  // edges, whose events are reserved and must never be renamed.
  const pathEvents = spec.main?.pathEvents ?? [];
  for (let i = 0; i < pathEvents.length; i++) {
    const [from, to] = [path[i], path[i + 1]];
    const edge = main.transitions.find((t) => t.from === from && t.to === to && t.trigger === 'operator');
    if (edge && pathEvents[i]) edge.event = pathEvents[i];
  }

  // The operator arrow into the exit — the derived walk deliberately has none (stop() plays
  // the exit; the lifecycle stop edge on that pair is stop's own and never fires on next),
  // so a type that wants `next` to take the graphic off air opts in here.
  if (spec.main?.exitOnNext && path.length >= 2) {
    const [from, to] = [path[path.length - 2], path[path.length - 1]];
    if (!main.transitions.some((t) => t.from === from && t.to === to && t.trigger !== 'lifecycle')) {
      main.transitions.push({ from, to, trigger: 'operator', event: 'next' });
    }
  }

  // Arrows between waypoints (see TypeMachine.main.edges) — added before the branches so a
  // path edge is never shadowed by a branch that happens to name the same pair.
  for (const edge of pathEdges) main.transitions.push(toTransition(edge, path));

  for (const branch of branches) {
    const state: AnimState = { id: branch.id };
    if (branch.name) state.name = branch.name;
    if (branch.timeline) state.timeline = resolveTimeline(type, branch.timeline, ease.easeIn, ease.easeOut);
    main.states.push(state);
    for (const edge of branch.edges) main.transitions.push(toTransition(edge, path));
  }

  const groups: AnimGroup[] = [main];
  for (const group of parallel) {
    groups.push({
      id: group.id,
      initial: group.initial,
      states: group.states.map((s) => {
        const state: AnimState = { id: s.id };
        if (s.name) state.name = s.name;
        if (s.timeline) state.timeline = resolveTimeline(type, s.timeline, ease.easeIn, ease.easeOut);
        return state;
      }),
      transitions: group.states.flatMap((s) => s.edges.map((e) => toTransition(e, path))),
    });
  }
  const machine: AnimMachine = { groups };
  const controls = compileControls(type, machine);
  if (controls.length > 0) machine.controls = controls;
  return machine;
}

/**
 * The type's control declarations, resolved into the persisted machine (Phase 5): logical
 * payload keys become the `fN` ids they compiled to, and an entry whose event no arrow
 * carries is dropped (its button would fire nothing). The result travels INSIDE the template,
 * so an exported control page keeps its labels with no type registry to ask.
 */
function compileControls(type: GraphicType, machine: AnimMachine): MachineControl[] {
  const authored = allOperatorEvents(machine);
  const out: MachineControl[] = [];
  for (const declared of type.controls) {
    if (!authored.includes(declared.event)) continue;
    const control: MachineControl = { event: declared.event, label: declared.label };
    if (declared.order !== undefined) control.order = declared.order;
    if (declared.section !== undefined) control.section = declared.section;
    if (declared.payload !== undefined) {
      const resolved = declared.payload.map((key) => {
        const id = fieldIdFor(type.fields, key);
        if (!id) throw new Error(`GraphicType "${type.id}": control "${declared.event}" names an unknown payload field "${key}".`);
        return id;
      });
      if (resolved.length > 0) control.payload = resolved;
    }
    if (declared.adjust !== undefined) {
      const adjust: Record<string, number> = {};
      for (const [key, delta] of Object.entries(declared.adjust)) {
        const id = fieldIdFor(type.fields, key);
        if (!id) throw new Error(`GraphicType "${type.id}": control "${declared.event}" adjusts an unknown field "${key}".`);
        const field = type.fields.find((f) => f.key === key);
        if (field?.kind !== 'number') throw new Error(`GraphicType "${type.id}": control "${declared.event}" adjusts "${key}", which is not a number field.`);
        adjust[id] = delta;
      }
      if (Object.keys(adjust).length > 0) control.adjust = adjust;
    }
    if (declared.set !== undefined) {
      const set: Record<string, string> = {};
      for (const [key, value] of Object.entries(declared.set)) {
        const id = fieldIdFor(type.fields, key);
        if (!id) throw new Error(`GraphicType "${type.id}": control "${declared.event}" sets an unknown field "${key}".`);
        set[id] = value;
      }
      if (Object.keys(set).length > 0) control.set = set;
    }
    // `add` and `remove`: the list must be a `lines` field (a line is appended to it, so anything
    // else would be "moved" from whatever a newline does to its text), the source any field.
    for (const member of ['add', 'remove'] as const) {
      const declaredMap = declared[member];
      if (declaredMap === undefined) continue;
      const verb = member === 'add' ? 'adds to' : 'removes from';
      const resolved: Record<string, string> = {};
      for (const [key, sourceKey] of Object.entries(declaredMap)) {
        const id = fieldIdFor(type.fields, key);
        if (!id) throw new Error(`GraphicType "${type.id}": control "${declared.event}" ${verb} an unknown field "${key}".`);
        const field = type.fields.find((f) => f.key === key);
        if (field?.kind !== 'lines') throw new Error(`GraphicType "${type.id}": control "${declared.event}" ${verb} "${key}", which is not a lines field.`);
        const source = fieldIdFor(type.fields, sourceKey);
        if (!source) throw new Error(`GraphicType "${type.id}": control "${declared.event}" ${verb} "${key}" from an unknown field "${sourceKey}".`);
        resolved[id] = source;
      }
      if (Object.keys(resolved).length > 0) control[member] = resolved;
    }
    if (declared.destructive !== undefined) control.destructive = declared.destructive;
    out.push(control);
  }
  return out;
}

/**
 * Attach a type's compiled machine to an assembled template.
 *
 * A promoted design's builder lives inside its category's closure, so the type creates the
 * template the ordinary way and the machine goes on afterwards. That is also why this is the
 * one mechanism for all types: it needs nothing exported from any category, and a type that
 * declares no machine gets its template back untouched, byte for byte.
 *
 * The easing comes from the data itself — the entrance step's curve and the exit step's — so a
 * branch state moves like the graphic it belongs to whatever the wizard picked.
 *
 * This THROWS on an off-shape result, deliberately unlike convertToDataRegion's quiet degrade.
 * That degrades because its input may be a hand-written region; here the input is our own
 * declaration compiled by our own code, and degrading would ship a graphic whose control page
 * has buttons that do nothing. Every catalog variant gets created by the bench spec, so a
 * broken type is a red build rather than a shipped surprise.
 */
export function attachMachine(type: GraphicType, template: SpxTemplate): SpxTemplate {
  const data = parseAnimData(template.js);
  if (!data) return template;
  const ease = {
    easeIn: data.steps[0]?.ease ?? 'power2.out',
    easeOut: data.steps[data.steps.length - 1]?.ease ?? 'power2.in',
  };
  const machine = compileMachine(type, data, ease);
  if (!machine) return template; // the derived machine is already right — persist nothing
  const next: AnimData = { ...data, machine };
  if (!isAnimData(next)) {
    throw new Error(`GraphicType "${type.id}": the compiled machine is off-shape — check its branches and parallel groups.`);
  }
  const js = writeAnimData(template.js, next);
  if (!js) throw new Error(`GraphicType "${type.id}": could not write the compiled machine into the template.`);
  const settings = { ...template.settings, steps: String(spxSteps(next)) };
  return {
    ...template,
    js,
    settings,
    html: replaceDefinitionInHtml(template.html, settings, template.fields),
  };
}

// ── Compiling to variants ────────────────────────────────────────────────────

/** Every part the type promised, checked against what the design actually emitted. */
export function missingParts(type: GraphicType, template: SpxTemplate): string[] {
  return type.structure.parts
    .filter((p) => p.required)
    .filter((p) => {
      const token = p.selector.slice(1);
      const re = p.selector.startsWith('#')
        ? new RegExp(`id="${token}"`)
        : new RegExp(`class="[^"]*\\b${token}\\b[^"]*"`);
      return !re.test(template.html) && !re.test(template.js);
    })
    .map((p) => `${p.id} (${p.selector})`);
}

/**
 * Write the caller's line text into the compiled template's declared line fields.
 *
 * Every assembler that builds its fields FROM `o.lines` has already done this, and the pass
 * is then a no-op writing the same values back. The ones that do not are the fixed-contract
 * families - quiz boards and every scoreboard - whose fields come from a baked content
 * declaration the assembler owns; they emit their design's default answers whatever the
 * caller asked for. Measured 2026-08-09 across the registry: nine types declared between
 * three and six line fields and carried NONE of them, which is how a generated quiz came back
 * with the catalog's own planets question and four planets as its answers.
 *
 * It is a post-pass rather than a change to those assemblers because the mapping it needs -
 * declared line field i is the template's i-th field - is the TYPE's contract, and the type is
 * the only thing that holds both halves. It writes the definition value and the element's
 * static text TOGETHER, so the operator's control page and the pre-play frame cannot disagree
 * about what the graphic says. (This is `blocks/edit.ts`'s `setFieldDefault` written out rather
 * than imported: `blocks/edit` imports the standard assembler, so reaching for it from here
 * closes an import cycle through the catalog - which loads at module scope and takes the whole
 * app's AI step down with it.)
 *
 * TITLES are deliberately not written: a fixed contract's labels are the type's own, and the
 * dropdowns that address its rows by letter are declared against them.
 */
function withLineValues(type: GraphicType, template: SpxTemplate, lines: LineSpec[]): SpxTemplate {
  const lineCount = type.fields.filter((f) => f.role === 'line').length;
  const values = type.fields.map((_f, i) => (i < lineCount ? lines[i]?.sample : undefined));
  return withFieldValues(template, values);
}

/**
 * Write the caller's CONTENT into the compiled template's non-line fields, by the type's own
 * LOGICAL keys (`correctAnswer`, `durationMinutes`), never by `fN` - positional ids are the
 * compiler's business and a caller writing one would break the moment a field was inserted.
 *
 * Lines are what a graphic SAYS; content is the rest of what makes it the graphic that was
 * asked for. A quiz board declares which answer is correct, a countdown its duration, a live
 * poll its options - all `role: 'data'` or `'hidden'`, none of them reachable through `lines`.
 * Without this channel a generated quiz carries the right question and the right four answers
 * and still marks the chassis's own default row correct, which is a wrong graphic that every
 * gate calls valid.
 *
 * **Every value is CLAMPED against the field's own declaration, and an illegal one is DROPPED
 * rather than written.** A `select` takes only a value (or label) it actually offers - which is
 * what keeps a machine that addresses its rows by letter addressable - a `number` only a finite
 * number, a `toggle` only a boolean word. An unknown key is dropped too. This is the harness's
 * standing rule that an out-of-range value clamps to the nearest legal one instead of costing
 * the generation, applied to the one surface where a wrong value is not a visual defect but an
 * operator lie: a correct-answer field naming a row that does not exist reveals nothing at all.
 */
function withContentValues(
  type: GraphicType,
  template: SpxTemplate,
  content: Record<string, string>,
): SpxTemplate {
  const values = type.fields.map((field) => {
    // Lines have their own channel, and the logo slot is an asset path (`logoAssetPath`).
    if (field.role === 'line' || field.role === 'logo') return undefined;
    if (!Object.prototype.hasOwnProperty.call(content, field.key)) return undefined;
    return legalFieldValue(field, content[field.key]);
  });
  return withFieldValues(template, values);
}

/** One content value, clamped to what its field declares - or undefined when nothing legal
 *  remains, which drops the write and leaves the design's own default in place. */
function legalFieldValue(field: TypeField, raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return undefined;
  const value = String(raw).trim();
  switch (field.kind) {
    case 'select': {
      // Matched against the field's OWN options, by value first and then by the label the
      // operator reads - a model answering "B" for an option labelled B is right either way.
      const match = field.options?.find(
        (o) => o.value.toLowerCase() === value.toLowerCase() || o.label.toLowerCase() === value.toLowerCase(),
      );
      return match?.value;
    }
    case 'number':
      return Number.isFinite(Number(value)) && value !== '' ? String(Number(value)) : undefined;
    case 'toggle': {
      if (/^(true|yes|on|1)$/i.test(value)) return 'true';
      if (/^(false|no|off|0)$/i.test(value)) return 'false';
      return undefined;
    }
    case 'color':
      return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\([\d\s.,%]+\)$/i.test(value) ? value : undefined;
    case 'image':
      // Refused outright: an image field's value is an asset PATH, and a path with no bytes
      // behind it is the dangling-reference defect - an export that packages a reference
      // nothing satisfies, silent until playout. An image arrives as an asset
      // (`importedImages` / `logoAssetPath`), never as a content string.
      return undefined;
    default:
      // Text and multi-line text: any string, including a deliberately empty one (clearing a
      // field is a real edit). Bounded so a runaway value cannot become the template.
      return value.slice(0, 2000);
  }
}

/**
 * Write values into the compiled template's fields BY POSITION - `undefined` leaves a field
 * exactly as the assembler emitted it.
 *
 * The definition value and the element's static text are written TOGETHER, so the operator's
 * control page and the pre-play frame cannot disagree about what the graphic says. (This is
 * `blocks/edit.ts`'s `setFieldDefault` written out rather than imported: `blocks/edit` imports
 * the standard assembler, so reaching for it from here closes an import cycle through the
 * catalog - which loads at module scope and takes the whole app's AI step down with it.)
 *
 * TITLES are deliberately never written: a fixed contract's labels are the type's own, and the
 * dropdowns that address its rows by letter are declared against them.
 */
function withFieldValues(template: SpxTemplate, values: readonly (string | undefined)[]): SpxTemplate {
  const fields = template.fields.map((f, i) => (values[i] === undefined ? f : { ...f, value: values[i] as string }));
  if (fields.every((f, i) => f.value === template.fields[i].value)) return template;

  let html = replaceDefinitionInHtml(template.html, template.settings, fields);
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === undefined || value === template.fields[i]?.value) continue;
    // The static text inside the element with this id (a visible <span> or a hidden source
    // <div>). [^<]* also matches newlines, so multi-line sources are covered.
    html = html.replace(
      new RegExp(`(<(?:span|div)\\b[^>]*\\bid="${template.fields[i].field}"[^>]*>)[^<]*`),
      (_m, open: string) => `${open}${escapeLineText(value)}`,
    );
  }
  return { ...template, html, fields };
}

/** Minimal HTML text escaping for content written into an element's body. */
function escapeLineText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Compile a type into the catalog variants its designs ship as. */
export function variantsFromType(type: GraphicType): TemplateVariant[] {
  return type.designs.map((design) => {
    const variant: TemplateVariant = {
      id: design.id,
      typeId: type.id,
      category: type.structure.category,
      name: design.name,
      styleTag: design.styleTag,
      description: design.description,
      // Line CAPACITY can never sit below the number of line fields the type declares. It is
      // hand-authored, and where the two disagreed the smaller number won everywhere a caller
      // clamps to it: `specToTemplate` slices an AI spec's lines to `maxLines`, so a quiz board
      // declaring five line fields and a capacity of 1 threw four answers away before
      // `create()` ever saw them. Deriving the floor means a type that grows a line field
      // cannot silently start blanking it.
      maxLines: Math.max(type.capabilities.maxLines, type.fields.filter((f) => f.role === 'line').length),
      suggestedLines: typeLines(type.fields, design.samples),
      logo: design.logo ?? type.capabilities.logo,
      ...(design.markPlacement ? { markPlacement: design.markPlacement } : {}),
      // The design's own vocabulary wins where it has one — see TypeDesign.animationPresets.
      animationPresets: design.animationPresets ?? type.capabilities.animationPresets,
      defaultPalette: design.palette,
      defaultFontId: design.fontId,
      defaultZone: design.defaultZone ?? type.capabilities.defaultZone,
      defaultSteps: design.defaultSteps ?? type.capabilities.defaultSteps,
      create(options) {
        // A caller may legitimately pass FEWER lines than the type declares (an AI spec
        // or Lite decision for a one-line lower third). A type-compiled design cannot
        // drop a declared field - the field list IS the type - so the gap is filled here.
        // WITH WHAT depends on the type's field plan, and the two answers are opposites:
        //
        // - a 'lines' plan shrinks, so the gap rides along as EMPTY text - the field exists
        //   and stays operator-editable, and an empty value takes no space (the :empty mask
        //   rule). Without this pad the missing-parts gate below throws on a request the
        //   platform doctrine says must CLAMP, never fail (the benchmark's one-line brief).
        // - a FIXED plan cannot shrink: a quiz board with two of its four answers blanked is
        //   not a smaller quiz, it is a broken one. The gap keeps the design's OWN default.
        const declared = typeLines(type.fields, design.samples);
        const plan = fieldPlanOf({ category: type.structure.category });
        const requested = options?.lines;
        const lines = requested && requested.length > 0 && requested.length < declared.length
          ? [
              ...requested,
              ...declared.slice(requested.length).map((line) => (
                plan.kind === 'fixed' ? line : { title: line.title, sample: '' }
              )),
            ]
          : requested;
        const template = attachMachine(type, design.create(type, lines ? { ...options, lines } : options));
        const missing = missingParts(type, template);
        if (missing.length > 0) {
          throw new Error(`GraphicType "${type.id}": design "${design.id}" is missing required parts: ${missing.join(', ')}.`);
        }
        const withLines = withLineValues(type, template, lines ?? declared);
        return options?.content ? withContentValues(type, withLines, options.content) : withLines;
      },
    };
    return variant;
  });
}

/**
 * The catalog variant a type compiles to when its only design is THIS one - the seam a design
 * that is not in the type's own list (a Pro composition, the neutral scaffold) compiles through.
 *
 * The type is SPREAD rather than mutated: `TYPES` is module-scope state the whole catalog reads,
 * and pushing a per-call design onto a registered type would put it into everybody's browse grid.
 * Lives here beside `variantsFromType` because templates, ai and the bridge all need it and the
 * lower layers may not import the higher ones.
 */
export function variantFromType(type: GraphicType, design: TypeDesign): TemplateVariant {
  const [variant] = variantsFromType({ ...type, designs: [design] });
  return variant;
}

/**
 * The type's SETUP fields: the non-line values that are decided when the graphic is BUILT,
 * as against the ones an operator sends it while it is on air.
 *
 * The distinction is DERIVED from the machine rather than declared a second time, because the
 * machine already draws it. This model's whole answer to combinatorial states is "the moment is
 * a state, what it is about is DATA" - a pick rides in as an event's PAYLOAD - so a field named
 * in `machine.controls[].payload` is live state by construction: the contestant's answer, the
 * highlighted row, the focused competitor, the verdict. Nobody has picked one yet at create,
 * and offering it there would invite an author to set a value the first operator event
 * overwrites.
 *
 * Everything else non-line is a genuine build-time decision - which answer is correct, the club
 * colours, how long the countdown runs, the word this broadcaster puts on the live flag - and
 * every one of them was previously reachable only after creation, in the editor's Data tab.
 *
 * Image fields are excluded: their value is an asset path, so they are offered where the asset
 * itself can be supplied, never as a value to type.
 */
export function setupFields(type: GraphicType): TypeField[] {
  const live = new Set((type.controls ?? []).flatMap((control) => control.payload ?? []));
  return type.fields.filter(
    (f) => f.role !== 'line' && f.role !== 'logo' && f.kind !== 'image' && !live.has(f.key),
  );
}

/** The main group's id for a type — what noacgMachineState() keys its pointer by. */
export function mainGroupId(type: GraphicType): string {
  return type.machine.main?.id ?? MAIN_GROUP_ID;
}

/** A type's field defaults as the sample values an assembler's options carry. */
export function typeOptionLines(type: GraphicType, o: ResolvedOptions): LineSpec[] {
  return o.lines.length > 0 ? o.lines : typeLines(type.fields);
}
