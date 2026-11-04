// KEYS ON A BEHAVIOUR GRAPHIC (#1982, docs/research/editor-behaviour-keys/README.md).
//
// An imported graphic with a behaviour carries a recipe: a machine, calls on its cues and the
// NOACG_BEHAVIOUR paint table a shipped runtime reads on air. The recipe writes a small, known
// set of (layer, property) pairs; everything else on the artwork is the user's to key. This module
// says which is which, as pure data: the sequence verdict (K1, K2), the recipe's claims on layers
// (K4, K5) and the proof an edit stayed inside the user's part (K7). `editorAnimation.ts` resolves
// the claims against the template's document.

import type { AnimData, AnimStep } from './animData';
import type { BehaviourData } from './behaviourData';
import { BEHAVIOUR_ROLE_ATTR, roleToken } from './behaviourData';

/** The refusal every key on a sequence the editor cannot prove free has always carried. */
export const SEQUENCE_REFUSAL = 'This sequence has calls, measured motion, loops or state-machine ownership. Canvas edits base placement; its animation is preserved.';
export const CREDITS_REFUSAL = 'The credits roll measures this artwork and moves it on air. It takes no keys; its roll is preserved.';
export const LOOK_REFUSAL = 'This graphic shows and hides this layer on air. It takes no keys; its look is preserved.';
export const GEOMETRY_REFUSAL = 'This graphic measures and moves this layer on air. It takes Opacity keys only; its placement is preserved.';

/** The calls whose writes are known and touch no keyable property of an artwork layer: the
 *  behaviour runtime's repaint (`REPAINT_CALL`; what it writes is the paint table's, claimed
 *  below) and its clock reset, the match clock's engine (`ENGINE_CALLS`) and the countdown
 *  clock's lifecycle (`startClock`, `stopClock`, added by `svg.ts` for a clock field) and its
 *  hold (`pauseClock`, `resumeClock`, kept by the countdown recipe) - field text and classes on
 *  the graphic root. Spelled here because blocks never import the template
 *  builders; `scripts/behaviour-keys.test.mjs` pins them to the builders' own names. */
export const KNOWN_CALLS: readonly string[] = ['noacgRepaint', 'noacgClockReset', 'startMatchClock', 'stopMatchClock', 'resetMatchClock', 'startClock', 'stopClock', 'pauseClock', 'resumeClock'];
/** The credits roll's calls: it rebuilds and measures the text it moves (K2). */
export const CREDITS_CALLS: readonly string[] = ['noacgCreditsRoll', 'stopCreditsRoll'];

/** The channels a layer whose geometry the recipe owns may still take (K5): its opacity. Any
 *  other track (position, scale, rotation, skew, a transform string, a filter, a clip) could
 *  move, resize or reshape what the recipe measures and moves. */
export const GEOMETRY_FREE_CHANNELS: readonly string[] = ['opacity', 'autoAlpha'];

/** Every timeline the data carries: the cues, then each machine state's own. */
function timelines(data: AnimData): AnimStep[] {
  return [...data.steps, ...(data.machine?.groups ?? []).flatMap(g => g.states.flatMap(s => s.timeline ? [s.timeline] : []))];
}

/** Whether the sequence is owned by something beyond plain keys: a machine, calls, measured
 *  motion or loops. A plain sequence needs none of this module. */
export function sequenceOwned(data: AnimData): boolean {
  return !!data.machine || timelines(data).some(step => step.calls?.length || step.dynamics?.length || Object.keys(step.loops ?? {}).length);
}

/**
 * K1, K2: null where keys may be authored on an owned sequence (a behaviour recipe whose every
 * writer is known), else the reason every key is refused. `table` is the parsed NOACG_BEHAVIOUR,
 * `runtime` whether the template carries the paint runtime that reads it.
 */
export function behaviourSequenceReason(data: AnimData, table: BehaviourData | null, runtime: boolean): string | null {
  const all = timelines(data);
  if (all.some(step => step.dynamics?.length || Object.keys(step.loops ?? {}).length)) return SEQUENCE_REFUSAL;
  const calls = all.flatMap(step => (step.calls ?? []).map(c => c.call));
  if (calls.some(call => CREDITS_CALLS.includes(call))) return CREDITS_REFUSAL;
  if (!runtime || !table) return SEQUENCE_REFUSAL;
  if (calls.some(call => !KNOWN_CALLS.includes(call))) return SEQUENCE_REFUSAL;
  // A machine state's own timeline is the recipe's; one that keys layers is motion this rule
  // does not model (K3). (A default-path state plays its cue and carries no timeline of its own.)
  const states = (data.machine?.groups ?? []).flatMap(g => g.states);
  if (states.some(s => Object.keys(s.timeline?.layers ?? {}).length || s.timeline?.reveals?.length || s.timeline?.hides?.length)) return SEQUENCE_REFUSAL;
  return null;
}

/** One claim the recipe holds on artwork layers: every element `selector` matches. `look`: the
 *  recipe shows and hides it (K4). `geometry`: it measures or moves its geometry, which a
 *  transform on it, inside it, or on a layer containing it inside the artwork would change (K5). */
export interface RecipeClaim { selector: string; kind: 'look' | 'geometry' }

/** The selector for every layer stamped with a role token. */
export const stamped = (token: string) => `[${BEHAVIOUR_ROLE_ATTR}~=${JSON.stringify(token)}]`;
/** The selector for one id, quoted so any id the table names is a valid selector. */
const byId = (id: string) => `[id=${JSON.stringify(id)}]`;
const ID = /^f\d+$/;
/** Every layer of the imported artwork (`.imported-design-art`, spelled here as blocks never
 *  import the template builders). */
export const ARTWORK = 'svg.imported-design-art, svg.imported-design-art *';

/** The keys a rule repeats over, as the runtime reads them: one row, a row set's keys, or none. */
function keysOf(table: BehaviourData, rule: { rows?: string; row?: string }): (string | null)[] {
  return rule.row ? [rule.row] : rule.rows ? table.rows?.[rule.rows] ?? [] : [null];
}
/** The field id a role compiled to for a row, as `noacgFieldFor` reads it. */
function fieldOf(table: BehaviourData, role: string, key: string | null): string | null {
  const mapped = table.fields?.[role];
  if (typeof mapped === 'string') return mapped;
  if (mapped && typeof mapped === 'object') return key && mapped[key] ? mapped[key] : null;
  return ID.test(role) ? role : null;
}
/** What plays a role for a row (`noacgRoleLayers`): its stamped layers and the field it compiled to. */
function roleLayers(table: BehaviourData, role: string, key: string | null): string[] {
  const field = fieldOf(table, role, key);
  return [stamped(roleToken(role, key)), ...(field ? [byId(field)] : [])];
}

/**
 * The recipe's claims on the artwork, read from its paint table. `drawn(token)` says whether the
 * designer drew a layer for a look token; where not, the runtime builds its own look around the
 * rule's anchor field, measured once (`noacgDefaultEl`), so that anchor's geometry is claimed.
 * Containment (K5) is wider than a gauge needs (it is measured in its own frame, `getBBox`) and
 * exactly what rows and slot anchors need (measured through every transform above them); one
 * rule is kept for all three.
 * A readout (`write`) claims nothing a key writes: the runtime sets only its text and ink.
 */
export function recipeClaims(table: BehaviourData, drawn: (token: string) => boolean): RecipeClaim[] {
  const claims: RecipeClaim[] = [];
  for (const rule of table.paint) {
    if ('look' in rule) {
      for (const key of keysOf(table, rule)) {
        const token = roleToken(rule.look, key);
        claims.push({ selector: stamped(token), kind: 'look' });
        // Its own look is drawn around the anchor's fit panel, which `svgFitContainer` finds
        // anywhere in the artwork at runtime and measures once, so every artwork layer's
        // geometry is claimed (the box around the artwork carries the drawn look with it).
        const anchor = rule.default && rule.anchor ? fieldOf(table, rule.anchor, key) : null;
        if (anchor && !drawn(token)) claims.push({ selector: ARTWORK, kind: 'geometry' });
      }
    } else if ('gauge' in rule) {
      for (const key of keysOf(table, rule)) claims.push({ selector: stamped(roleToken(rule.gauge, key)), kind: 'geometry' });
    } else if ('place' in rule) {
      for (const key of keysOf(table, rule)) {
        for (const selector of [...roleLayers(table, rule.place, key), ...roleLayers(table, rule.anchor, key)]) claims.push({ selector, kind: 'geometry' });
      }
    }
  }
  return claims;
}

/** How one claimed element stands to the layer a key would write. */
export type Relation = 'self' | 'inside' | 'contains' | 'none';

/**
 * K4, K5, K6: the reason a key on `channel` of a layer is refused, or null where the layer is the
 * user's. `relations` lists, for each claim, how each element it matches stands to the layer:
 * `self`, `inside` (the claimed element is inside the layer, within the artwork) or `contains`
 * (the layer is inside it).
 */
export function claimReason(claims: { claim: RecipeClaim; relations: Relation[] }[], channel: string): string | null {
  if (claims.some(({ claim, relations }) => claim.kind === 'look' && relations.includes('self'))) return LOOK_REFUSAL;
  if (!GEOMETRY_FREE_CHANNELS.includes(channel) && claims.some(({ claim, relations }) => claim.kind === 'geometry' && relations.some(r => r !== 'none'))) return GEOMETRY_REFUSAL;
  return null;
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/**
 * K7: throws unless `after` differs from `before` only in tracks `free(owner, channel)` allows, on
 * the cues (steps), plus Out's own length where a key past its end lengthened it. Everything else
 * - calls, the machine, other cue lengths and eases, spans, reveals, hides, root and speed - is
 * byte for byte the same.
 */
export function requireUserTracksOnly(before: AnimData, after: AnimData, free: (owner: string, channel: string) => boolean) {
  const refuse = () => { throw new Error('This edit would change what the behaviour owns. No keys changed.'); };
  const { steps: a, ...restA } = before, { steps: b, ...restB } = after;
  if (canonical(restA) !== canonical(restB) || a.length !== b.length) refuse();
  const out = a.length - 1;
  a.forEach((step, index) => {
    const { layers: la, duration: da, ...sa } = step, { layers: lb, duration: db, ...sb } = b[index];
    if (canonical(sa) !== canonical(sb)) refuse();
    if (da !== db && !(index === out && index > 0 && db > da)) refuse();
    for (const owner of new Set([...Object.keys(la), ...Object.keys(lb)])) {
      const ta = la[owner] ?? {}, tb = lb[owner] ?? {};
      for (const channel of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
        if (canonical(ta[channel] ?? []) !== canonical(tb[channel] ?? []) && !free(owner, channel)) refuse();
      }
    }
  });
}
