// HARDWARE PANELS, GRAPHIC ACTIONS (docs/work-specs/playout-companion-actions/spec.md, E6.1;
// docs/work-specs/hardware-panel-control/protocol.md §10): what an answering page advertises a panel
// may press on each pool graphic, and how it judges such a press before the one dispatcher runs it.
// Pure, so the page and a Node test read one answer (scripts/panel-feedback.test.mjs).
//
// A capability is a control the generated panel already draws for that graphic (a ⚡ control, each
// option of a one-press pick, a ± live number), named by a stable id, never by its label or its row.
// Its target is the POOL GRAPHIC: a press resolves to the cue live on that graphic's layer
// (control/liveControls.ts `liveSelection`), never the page's selection, and runs through
// control/graphicVerbs.ts like the block's own button. Argument descriptors are E1's typed nodes
// (model/ografTyped.ts), so a native option and a foreign OGraf action argument are one model; a
// foreign action is advertised as a DESCRIPTOR ONLY and never invoked here.
//
// Old modules read every feedback payload's `v` and stop at a number they do not know, so the
// `actions` and `settled` events carry `av` (the actions protocol) and no `v`: an old module ignores
// them, and a panel presses a graphic action only after a page advertised it.
//
// Runtime imports carry `.ts` so Node resolves them; everything else is a type.

import type { FieldDescriptor } from '../model/fieldModel';
import type { ArrangedControl, ArrangedControls, ControlButton } from './controlModel';
import { pickButton } from './liveControls.ts';
import { describeOgraf, readJson, validateActionArgs, type TypedNode } from '../model/ografTyped.ts';

/** The graphic-actions protocol. The panel protocol stays 1 for every existing message and verb. */
export const ACTIONS_PROTOCOL = 2;

/** The verb a graphic action travels as, through `panel_press` (supabase/migrations/0103). */
export const ACTION_VERB = 'graphic-action';

/** At most this many graphics, and capabilities per graphic, go to a panel (`more` says so). */
export const ACTION_GRAPHICS_MAX = 32;
export const ACTION_CAPS_MAX = 48;

/** The relay's bounds, the same numbers as `panel_action_fault` in 0103: an argument object's JSON
 *  text, and how deep its containers nest (the object itself is level 1). */
export const ACTION_ARGS_MAX_CHARS = 4096;
export const ACTION_ARGS_MAX_DEPTH = 8;

/** A capability id: its kind, then the control's own name (an event, a field, a foreign action). */
export const CAP_ID = /^(event|step|foreign):\P{Cc}{1,96}$/u;
/** A graphic name, a cue id: what `panel_press` admits as `target` and `instance`. */
const TEXT_128 = /^\P{Cc}{0,128}$/u;

export type CapabilityKind = 'event' | 'step' | 'foreign';

/** One thing a panel may press on one graphic. */
export interface PanelCapability {
  id: string;
  kind: CapabilityKind;
  /** The word the operator reads on the page (ARRANGE's name, the field's label). */
  label: string;
  /** Where the page draws it: pinned above the fold, in a section, or behind More. */
  place: 'pinned' | 'section' | 'more';
  section?: string;
  /** The argument object's schema (E1's model), or null for a press that takes none. */
  args: TypedNode | null;
  /** A pick's option words, in the page's order, and the option air shows now. */
  options?: { value: string; label: string }[];
  active?: string;
  /** Whether the page would take this press now, and why not. */
  allowed: boolean;
  note?: string;
  /** False for a foreign descriptor: advertised, never run (E6.2 invokes them). */
  invocable: boolean;
}

/** One pool graphic as a panel sees it. */
export interface PanelGraphic {
  graphic: string;
  /** Pinned on this production's pages: preset material only, never authority. */
  pinned: boolean;
  /** The cue live on its layer (the instance a press names), or null off air. */
  live: string | null;
  cue: string | null;
  caps: PanelCapability[];
}

export interface PanelActions {
  /** `panel_press` relays graphic actions (0103 applied); false on an older database. */
  relay: boolean;
  graphics: PanelGraphic[];
}

export const NO_ACTIONS: PanelActions = { relay: false, graphics: [] };

// ── What a page advertises ──────────────────────────────────────────────────────────────────────

/** The argument object a one-press pick takes: its option, one of the declared values. */
export const optionArgs = (values: readonly string[]): TypedNode => ({
  path: '',
  type: 'object',
  closed: true,
  properties: [{ key: 'option', required: true, node: { path: 'option', type: 'string', enum: [...values] } }],
});

/** The argument object a ± live number takes: one step down or up, as the page's two buttons. */
export const STEP_ARGS: TypedNode = {
  path: '',
  type: 'object',
  closed: true,
  properties: [{ key: 'delta', required: true, node: { path: 'delta', type: 'integer', enum: [-1, 1] } }],
};

export interface GraphicControls {
  graphic: string;
  pinned: boolean;
  /** The cue live on the graphic's layer, as `liveSelection` resolves it, and its label. */
  live: string | null;
  cue: string | null;
  /** The panel exactly as the page arranges it (controlModel `arrangeControls`, picks included). */
  arranged: ArrangedControls;
  /** The ± live numbers the page draws (liveControls `liveNumberFields`). */
  numbers: readonly FieldDescriptor[];
  /** The page's own greying: whether a control would fire now (`isEventLegal` and the values
   *  rule), and whether the numbers would step (the live cue is one this page holds). */
  legal: (event: string) => boolean;
  stepping: boolean;
  /** What air shows, for a pick's active option. */
  aired: Record<string, string> | null;
}

const offAir = (graphic: string) => `${graphic} is off air`;

/**
 * A NATIVE GRAPHIC'S CAPABILITIES: every control its live block draws, in the block's order
 * (pinned, the sections, More), then its ± numbers. Labels, options and greying are the page's own,
 * so a panel and the screen cannot disagree about what a press is or whether it would go.
 */
export function graphicCapabilities(g: GraphicControls): PanelCapability[] {
  const live = !!g.live;
  const caps: PanelCapability[] = [];
  const control = (c: ArrangedControl, place: PanelCapability['place'], section?: string) => {
    const allowed = live && g.legal(c.button.event);
    const note = !live ? offAir(g.graphic) : allowed ? undefined : `${c.label} cannot fire in the graphic's state now`;
    const options = c.options?.options;
    caps.push({
      id: `event:${c.button.event}`,
      kind: 'event',
      label: c.label,
      place,
      ...(section ? { section } : {}),
      args: options ? optionArgs(options.map((o) => o.value)) : null,
      ...(options ? { options: options.map((o) => ({ value: o.value, label: o.label })) } : {}),
      ...(options && g.aired?.[c.options!.field] !== undefined ? { active: g.aired[c.options!.field] } : {}),
      allowed,
      ...(note ? { note } : {}),
      invocable: true,
    });
  };
  for (const c of g.arranged.pinned) control(c, 'pinned');
  for (const [section, controls] of g.arranged.sections) for (const c of controls) control(c, 'section', section);
  for (const c of g.arranged.more) control(c, 'more');
  for (const d of g.numbers) {
    const allowed = live && g.stepping;
    const note = !live ? offAir(g.graphic) : allowed ? undefined : `The cue on ${g.graphic} is not one this page holds`;
    caps.push({ id: `step:${d.key}`, kind: 'step', label: d.label, place: 'section', args: STEP_ARGS, allowed, ...(note ? { note } : {}), invocable: true });
  }
  return caps.filter((c) => CAP_ID.test(c.id)).slice(0, ACTION_CAPS_MAX);
}

/** One pool graphic as a panel sees it, or null when it has nothing to press or a name the relay
 *  cannot carry (a graphic with no live controls draws no block either). */
export function panelGraphic(g: GraphicControls): PanelGraphic | null {
  if (!g.graphic || !TEXT_128.test(g.graphic)) return null;
  const caps = graphicCapabilities(g);
  return caps.length > 0 ? { graphic: g.graphic, pinned: g.pinned, live: g.live, cue: g.cue, caps } : null;
}

/** A foreign action a manifest declares that cannot be offered, and why. */
export interface ForeignRefusal {
  action: string;
  reason: string;
}

/**
 * A FOREIGN OGraf PACKAGE'S ACTIONS AS DESCRIPTORS (E1's model, `describeOgraf`): each custom
 * action with its typed argument schema, never invocable here. An action whose arguments use
 * something E1 does not carry (a note at or under its schema) is refused with that reason rather
 * than offered with a plausible form, as is one whose id cannot be a capability id.
 */
export function foreignCapabilities(manifest: unknown): { caps: PanelCapability[]; refused: ForeignRefusal[] } {
  const described = describeOgraf(manifest);
  const declared = (manifest as { customActions?: unknown } | null)?.customActions;
  const caps: PanelCapability[] = [];
  const refused: ForeignRefusal[] = [];
  for (const action of described.actions) {
    const id = `foreign:${action.id}`;
    // E1 notes an action by its place in the manifest's list.
    const index = Array.isArray(declared) ? declared.findIndex((raw) => (raw as { id?: unknown } | null)?.id === action.id) : -1;
    const prefix = `customActions[${index}]`;
    const note = described.notes.find((n) => n.at === prefix || n.at.startsWith(`${prefix}.`) || n.at.startsWith(`${prefix}[`));
    const unsupported = action.args && hasUnsupported(action.args);
    if (!CAP_ID.test(id)) refused.push({ action: action.id, reason: 'its id is not one a panel can name' });
    else if (note || unsupported) refused.push({ action: action.id, reason: note?.reason ?? 'its arguments use a schema feature this version does not carry' });
    else caps.push({ id, kind: 'foreign', label: action.name, place: 'section', args: action.args, allowed: false, note: 'Foreign actions are not pressed from a panel yet', invocable: false });
  }
  return { caps, refused };
}

function hasUnsupported(node: TypedNode): boolean {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'unsupported') return true;
    for (const p of n.properties ?? []) stack.push(p.node);
    if (n.items) stack.push(n.items);
  }
  return false;
}

export interface ActionsMeta {
  actionsVer: number;
  page: string;
  claim: number;
}

/** The `actions` feedback event (protocol §10.2): no `v`, so a module that predates it ignores it. */
export function wireActions(a: PanelActions, m: ActionsMeta) {
  return {
    av: ACTIONS_PROTOCOL,
    actionsVer: m.actionsVer,
    page: m.page,
    claim: m.claim,
    relay: a.relay,
    graphics: a.graphics.slice(0, ACTION_GRAPHICS_MAX),
    more: a.graphics.length > ACTION_GRAPHICS_MAX,
  };
}

export function actionsChanged(prev: PanelActions | null, next: PanelActions): boolean {
  return !prev || JSON.stringify(prev) !== JSON.stringify(next);
}

// ── A relayed graphic action ────────────────────────────────────────────────────────────────────

export interface ActionPress {
  /** The pool graphic. */
  target: string;
  /** The `actionsVer` the key was drawn from. */
  seen: number;
  pressId: string;
  claim: number;
  cap: string;
  /** The cue the key showed live on the graphic ('' off air). */
  instance: string;
  args: Record<string, unknown>;
  panel: { id: string; label: string };
}

/**
 * Read a relayed `graphic-action` press, or null when it is not one. The bounds are the relay's own,
 * checked again here because this page is the second boundary (AC-3). Linear in the payload: the
 * argument object is walked once, iteratively, by E1's `readJson`, before its text is measured.
 */
export function readActionPress(p: unknown): ActionPress | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  if (o.verb !== ACTION_VERB || o.v !== ACTIONS_PROTOCOL) return null;
  if (typeof o.target !== 'string' || !o.target || !TEXT_128.test(o.target)) return null;
  if (typeof o.instance !== 'string' || !TEXT_128.test(o.instance)) return null;
  if (typeof o.cap !== 'string' || !CAP_ID.test(o.cap)) return null;
  if (typeof o.seen !== 'number' || !Number.isInteger(o.seen) || o.seen < 0) return null;
  if (typeof o.press_id !== 'string' || typeof o.claim !== 'number') return null;
  const args = o.args ?? {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return null;
  if (readJson(args, ACTION_ARGS_MAX_DEPTH) !== null || JSON.stringify(args).length > ACTION_ARGS_MAX_CHARS) return null;
  const panel = (o.panel ?? {}) as Record<string, unknown>;
  return {
    target: o.target,
    seen: o.seen,
    pressId: o.press_id,
    claim: o.claim,
    cap: o.cap,
    instance: o.instance,
    args: args as Record<string, unknown>,
    panel: { id: typeof panel.id === 'string' ? panel.id : '', label: typeof panel.label === 'string' ? panel.label : 'A panel' },
  };
}

/** The last published actions, by `actionsVer`, as the panel state's ring is (panelFeedback.ts). */
export class ActionsRing {
  readonly #size: number;
  readonly #by = new Map<number, PanelActions>();
  constructor(size = 64) {
    this.#size = size;
  }
  put(ver: number, a: PanelActions): void {
    this.#by.set(ver, a);
    while (this.#by.size > this.#size) this.#by.delete(this.#by.keys().next().value as number);
  }
  get(ver: number): PanelActions | undefined {
    return this.#by.get(ver);
  }
}

export type ActionOutcome = 'stale' | 'not-allowed' | 'not-here' | 'invalid';

/** A press the page may run: the graphic, the capability as advertised now, its arguments. */
export interface ActionRun {
  graphic: string;
  cap: PanelCapability;
  args: Record<string, unknown>;
}

/** What a page offers a panel: its graphic actions now, and how its one dispatcher runs one. */
export interface PanelOffer {
  list: () => Omit<PanelActions, 'relay'>;
  act: (run: ActionRun) => Promise<PressDone>;
}

/** What one graphic action came to once the dispatcher answered (control/graphicVerbs.ts). */
export interface PressDone {
  outcome: 'accepted' | 'refused' | 'failed' | 'unknown';
  note?: string;
}

const sameDeclaration = (a: PanelCapability, b: PanelCapability) => a.kind === b.kind && JSON.stringify(a.args) === JSON.stringify(b.args);

/**
 * JUDGE A GRAPHIC ACTION (protocol §10.4) against what the page advertises now and what the key
 * was drawn from. The claim and the press id are the caller's, as for every press. A capability is
 * found by its id only, so a saved key is never rebound by label or position; one the graphic no
 * longer declares, or declares differently, is stale; the instance the key showed must still be
 * the cue live on the layer; the arguments must validate against the declared schema.
 */
export function judgeAction(press: ActionPress, now: PanelActions, then: PanelActions | undefined): { refused: ActionOutcome; note: string } | { run: ActionRun } {
  if (!then) return { refused: 'stale', note: 'the key was drawn too long ago' };
  const graphic = now.graphics.find((g) => g.graphic === press.target);
  if (!graphic) return { refused: 'stale', note: `${press.target} is no longer in the production` };
  const cap = graphic.caps.find((c) => c.id === press.cap);
  const drawn = then.graphics.find((g) => g.graphic === press.target)?.caps.find((c) => c.id === press.cap);
  if (!cap) return { refused: 'stale', note: `that action is no longer on ${press.target}` };
  if (!drawn || !sameDeclaration(cap, drawn)) return { refused: 'stale', note: `${cap.label} changed on ${press.target} since the key was drawn` };
  if (!cap.invocable) return { refused: 'not-here', note: `${cap.label} cannot be pressed from a panel` };
  if ((graphic.live ?? '') !== press.instance) {
    return graphic.live ? { refused: 'stale', note: `the cue on ${press.target} changed` } : { refused: 'not-allowed', note: offAir(press.target) };
  }
  const args = Object.keys(press.args).length === 0 && !cap.args ? undefined : press.args;
  const errors = validateActionArgs({ id: cap.id, name: cap.label, args: cap.args }, args);
  if (errors.length > 0) return { refused: 'invalid', note: `${cap.label}: ${errors[0].at ? `${errors[0].at} ` : ''}${errors[0].reason}` };
  if (!cap.allowed) return { refused: 'not-allowed', note: cap.note ?? `${cap.label} is not allowed right now` };
  return { run: { graphic: press.target, cap, args: press.args } };
}

/** What a capability presses, from the graphic's declared controls: the event button (a pick's
 *  option set, as the page's own option button), or the field and step of a ± number. */
export function capabilityPress(
  run: ActionRun,
  buttons: readonly ControlButton[],
  pickOf: (button: ControlButton) => { field: string; options: { label: string; value: string }[] } | null,
): { event: ControlButton } | { step: string; delta: number } | null {
  const [kind, name] = [run.cap.kind, run.cap.id.slice(run.cap.id.indexOf(':') + 1)];
  if (kind === 'step') return { step: name, delta: run.args.delta as number };
  if (kind !== 'event') return null;
  const button = buttons.find((b) => b.event === name);
  if (!button) return null;
  const group = pickOf(button);
  return { event: group ? pickButton(button, group, String(run.args.option)) : button };
}
