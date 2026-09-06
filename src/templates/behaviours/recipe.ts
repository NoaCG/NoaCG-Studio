// A BEHAVIOUR RECIPE - one behaviour as a DECLARATION (docs/SVG_BEHAVIOUR_PLAN.md §7).
//
// Before this existed, every behaviour that could be attached to imported artwork was a module:
// its own pickers, its own name matcher, its own emitted paint JS, its own class pair. Five of
// them proved the same decomposition five times (plan §1), so what varies is written down here
// as data and everything else - the stamping, the runtime, the type shim, the table - is done
// once, by `importedDesign/behaviour.ts`. A recipe declares:
//
//   * ROLES  - what a layer IS to the behaviour: a field the operator types, or a drawn LAYER
//              the runtime shows (a look), scales (a gauge) or writes into (a readout);
//   * ROWS   - the one keyed repetition a behaviour may have (answers A-F, teams 1-8);
//   * FIELDS - the hidden holders it owns (an answer key, a warning threshold, a wire);
//   * MACHINE, CONTROLS - the same `TypeMachine` / `TypeControlEvent[]` a catalog type declares;
//   * PAINT  - when each look shows, what each gauge scales by, what each readout prints, in the
//              two-slot condition grammar of blocks/behaviourData.ts. No expression, ever.
//
// A recipe adds NO emitted JavaScript. That is the test of the whole design: a behaviour that
// needs a line of JS is a behaviour the runtime's field-kind vocabulary cannot yet describe, and
// the kind is what gets added (importedDesign/behaviourRuntime.ts), once, for every recipe.

import type { FieldKind, FieldOption } from '../../model/fieldModel';
import words from './words.json';
import type { AssemblerId, Zone9 } from '../../model/wizard';
import type { AnimCall } from '../../blocks/animData';
import type { FieldKindSpec, PaintRule } from '../../blocks/behaviourData';
import type { TypeControlEvent, TypeMachine } from '../types/graphicType';

/** One role a recipe asks the artwork for. */
export interface RecipeRole {
  /** The role's id: lower-case words joined by dots (`answer.selected`). Also the stamp. */
  id: string;
  /** The word the mapping step and the docs use for it. */
  label: string;
  /** `field`: a text or picture layer the operator edits, bound as `fN` by the importer.
   *  `layer`: a drawing the runtime owns - stamped, never a field. */
  kind: 'field' | 'layer';
  /** Layer roles: which paint mechanisms the recipe applies to it. A role painted as a `look`
   *  starts hidden and is shown by its rules; a `gauge` or `write` layer stays as drawn. */
  paint?: ('look' | 'gauge' | 'write')[];
  /** One per row of the recipe's row set. */
  perRow?: boolean;
  /** A binding without it is not usable, and the mapping step says so. */
  required?: boolean;
  /** Field roles: the artwork field must hold a plain figure (a score), or be bound as the
   *  countdown (a clock). */
  numeric?: boolean;
  countdown?: boolean;
  /** The words a designer may name the layer with - the shortcut, never the door. Matched
   *  against the layer's label with the row key already stripped (naming.ts). */
  words: RegExp;
  /** Names that bind the role but are NOT evidence of this behaviour: an option row is an answer
   *  row on a student's quiz, and a quiz's answer row on a vote board, so `option` fills the
   *  quiz's answers without ever being what makes a file a quiz. */
  weak?: RegExp;
  /** Which inventory a LAYER role is picked from: a text layer, or a group or rectangle. */
  pool?: 'text' | 'drawn';
  /** Evidence of THIS behaviour rather than any: a bar for the vote, a numeric team figure for
   *  the score board. The offer preselects a recipe only on distinctive evidence. */
  distinctive?: boolean;
}

/** One recipe's entry in words.json. */
interface WordsEntry {
  name: string;
  verbs: string;
  buttons: string;
  rows?: { role: string; keys: 'letters' | 'numbers'; min: number; max: number; teach: string };
  roles: Array<{
    id: string;
    label: string;
    kind: 'field' | 'layer';
    paint?: ('look' | 'gauge' | 'write')[];
    perRow?: boolean;
    required?: boolean;
    numeric?: boolean;
    countdown?: boolean;
    distinctive?: boolean;
    pool?: 'text' | 'drawn';
    words: string;
    weak?: string;
    teach: string;
    also?: string[];
    what: string;
  }>;
}

/** The role words of every recipe, as the table declares them (words.json). */
export const BEHAVIOUR_WORDS = words as unknown as Record<string, WordsEntry>;

/** A recipe's roles, compiled from words.json - the one place a role word is written. Compiled
 *  ONCE per recipe: the mapping step asks for them per picker per render, and a role's regexes
 *  are the same objects whoever asks. Callers never mutate the array. */
const ROLES_BY_RECIPE = new Map<string, RecipeRole[]>();
export function rolesOf(recipeId: string): RecipeRole[] {
  const cached = ROLES_BY_RECIPE.get(recipeId);
  if (cached) return cached;
  const entry = BEHAVIOUR_WORDS[recipeId];
  if (!entry) throw new Error(`Behaviour: words.json has no entry for "${recipeId}".`);
  const roles = entry.roles.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    ...(r.paint ? { paint: r.paint } : {}),
    ...(r.perRow ? { perRow: true } : {}),
    ...(r.required ? { required: true } : {}),
    ...(r.numeric ? { numeric: true } : {}),
    ...(r.countdown ? { countdown: true } : {}),
    ...(r.distinctive ? { distinctive: true } : {}),
    ...(r.pool ? { pool: r.pool } : {}),
    words: new RegExp(r.words, 'i'),
    ...(r.weak ? { weak: new RegExp(r.weak, 'i') } : {}),
  }));
  ROLES_BY_RECIPE.set(recipeId, roles);
  return roles;
}

/** A recipe's row declaration from words.json. */
export function rowsOf(recipeId: string): BehaviourRecipe['rows'] {
  const rows = BEHAVIOUR_WORDS[recipeId]?.rows;
  return rows ? { role: rows.role, keys: rows.keys, min: rows.min, max: rows.max } : undefined;
}

/** A hidden holder the recipe owns, compiled after the artwork's own fields. */
export interface RecipeField {
  /** The logical key controls refer to (`selectedAnswer`). */
  key: string;
  /** The operator-facing title. A title another surface FINDS (the vote's wire) is a contract. */
  label: string;
  kind: FieldKind;
  value: string;
  options?: FieldOption[];
  /** What the runtime should treat it as, when it is more than plain text. */
  spec?: FieldKindSpec;
}

/** One extra step on the DEFAULT PATH (a quiz's Reveal, a vote's Result): a lifecycle beat that
 *  has to be a real step, or SPX's `steps` would say one and stop sending Continue. */
export interface RecipePathStep {
  name: string;
  duration: number;
}

export interface RecipePath {
  /** What the entrance step is called - the state chip reads it ("Question", "Voting"). */
  entrance?: string;
  /** Calls the entrance runs at time 0, before the repaint (a clock reset). */
  entranceCalls?: string[];
  /** Steps spliced in front of the exit, in order. */
  steps?: RecipePathStep[];
}

/** What a recipe's declaration functions are handed. */
export interface RecipeContext {
  /** The row keys, in row order - empty for a recipe without rows. */
  rows: string[];
  /** An INSTANCED recipe's own name ("Sponsor"), the operator's word for it; a full recipe's
   *  display name otherwise. */
  name: string;
  /** The name as a lower-case token. */
  slug: string;
  /** Namespace a role or field key by the instance (`switch.sponsor.on`); the identity for a
   *  full recipe. Every instanced recipe writes its roles, owned field keys and rule tokens
   *  through this, so two instances on one graphic cannot collide. */
  ns(id: string): string;
  /** The same for a machine GROUP id or an EVENT, which the machine's shape gate requires to be
   *  a bare identifier (`sponsor_show`). */
  nsId(id: string): string;
  /** The `fN` a role compiled to (per row when `key` is given), or null when unbound. */
  fieldId(role: string, key?: string): string | null;
  /** The LOGICAL key of that field in the type shim, for controls' payload/adjust/set. */
  fieldKey(role: string, key?: string): string | null;
  /** The operator's own label for a bound field role (the team layer's name), or a fallback. */
  label(role: string, key?: string): string;
  /** Whether a layer role is bound at all (per row when `key` is given). */
  bound(role: string, key?: string): boolean;
  /** The recipe's options as chosen, with the declaration's defaults filled in. */
  options: Record<string, string | number | boolean>;
}

export interface RecipeOption {
  key: string;
  label: string;
  /** What ticking it does, in the author's words - the mapping step's ⓘ. */
  hint: string;
  default: boolean;
}

export interface BehaviourRecipe {
  id: string;
  name: string;
  description: string;
  /** A recipe a graphic may carry SEVERAL of, each under its own name (a switch, a choice). It
   *  never touches the default path, and its roles, fields, group and events are namespaced by
   *  the compiler through `ctx.ns` / `ctx.nsId`. A full recipe (the quiz) is one per graphic. */
  instanced?: boolean;
  /** The category whose assembler conventions the compiled type reuses (the structure prefix
   *  is always the imported design's). */
  category: AssemblerId;
  defaultZone: Zone9;
  /** The one keyed repetition: which role is the row, how keys are spelled, and the bounds. */
  rows?: { role: string; keys: 'letters' | 'numbers'; min: number; max: number };
  roles: RecipeRole[];
  options?: RecipeOption[];
  fields(ctx: RecipeContext): RecipeField[];
  path?(ctx: RecipeContext): RecipePath;
  machine(ctx: RecipeContext): TypeMachine;
  controls(ctx: RecipeContext): TypeControlEvent[];
  paint(ctx: RecipeContext): PaintRule[];
  /** Field kinds for ARTWORK fields the recipe reads (a team's figure as a `number` in the
   *  score's `moved` group, the clock). Recipe-owned fields carry theirs on the field. */
  artworkKinds?(ctx: RecipeContext): Record<string, FieldKindSpec>;
}

/** The runtime's one repaint entry point, appended to every recipe state's timeline. */
export const REPAINT_CALL = 'noacgRepaint';

/** Row keys for a recipe's row set. */
export function rowKeys(style: 'letters' | 'numbers', count: number): string[] {
  return Array.from({ length: count }, (_, i) => (style === 'letters' ? String.fromCharCode(65 + i) : String(i + 1)));
}

/**
 * A catalog machine's calls, filtered to the ones this recipe's template can honour, with the
 * runtime's repaint appended to every state. The catalog's `applySelection` paints a row the
 * catalog drew; on artwork we did not draw the paint is the table's, so the name is dropped
 * rather than left to resolve to nothing at fire time.
 */
export function withRepaint(machine: TypeMachine, keep: string[] = []): TypeMachine {
  const calls = (existing: AnimCall[] | undefined): AnimCall[] => [
    ...(existing ?? []).filter((c) => keep.includes(c.call)),
    { time: 0, call: REPAINT_CALL },
  ];
  const timeline = (tl: { calls?: AnimCall[]; layers: Record<string, unknown> } | null, name: string) =>
    tl
      ? { ...tl, calls: calls(tl.calls), layers: {} }
      // A pose-only catalog state plays nothing on entry, so a look that depends on it would
      // never repaint. Give it the smallest timeline that fires the repaint.
      : { name, duration: 0.2, ease: 'out' as const, calls: calls(undefined), layers: {} };
  return {
    main: machine.main
      ? {
          ...machine.main,
          branches: (machine.main.branches ?? []).map((b) => ({
            ...b,
            timeline: timeline(b.timeline as never, b.name ?? b.id) as never,
          })),
        }
      : undefined,
    parallel: (machine.parallel ?? []).map((g) => ({
      ...g,
      states: g.states.map((s) => ({ ...s, timeline: timeline(s.timeline as never, s.name ?? s.id) as never })),
    })),
  };
}
