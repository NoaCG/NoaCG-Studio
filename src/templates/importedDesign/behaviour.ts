// THE BEHAVIOUR COMPILER for imported artwork (docs/SVG_BEHAVIOUR_PLAN.md §5-§7).
//
// A recipe (templates/behaviours/) says what a behaviour IS; a BINDING says which of the
// artwork's layers play its roles; this module turns the two into everything `assembleImportedSvg`
// needs - the stamps, the owned fields and their holders, the table, the runtime, the extra path
// steps, the type `attachMachine` compiles - once, for every recipe. Before it, each behaviour was
// a module of its own that hand-wrote all seven of those things (docs/GRAPHIC_BEHAVIOUR_PLAN.md
// §10-§13 record what each found); the five findings together are the decomposition this file
// implements (docs/SVG_BEHAVIOUR_PLAN.md §1). The four modules are gone; what each behaviour IS
// now reads in one declaration each, and adding a behaviour adds a declaration.
//
// The wizard still holds a binding in the per-recipe shapes it grew one at a time
// (`DesignSvgBehaviour` in model/wizard.ts); the adapters at the bottom of this file turn each of
// those into the one `BehaviourBinding` the compiler reads. A generic binding member for the
// recipes the wizard does not yet have pickers for arrives with the switches (phase 3).

import type { SpxField } from '../../model/types';
import type { FieldKind } from '../../model/fieldModel';
import type {
  DesignSvg,
  DesignSvgPollBehaviour,
  DesignSvgQuizBehaviour,
  DesignSvgScoreBehaviour,
  DesignSvgTimerBehaviour,
} from '../../model/wizard';
import type { AnimData, AnimStep } from '../../blocks/animData';
import { BEHAVIOUR_ROLE_ATTR, roleToken, type BehaviourData, type FieldKindSpec } from '../../blocks/behaviourData';
import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import type { GraphicType, TypeField } from '../types/graphicType';
import { DATA_SOURCE_CLASS } from '../shared/base';
import type { RecipeContext, RecipeField } from '../behaviours/recipe';
import { REPAINT_CALL } from '../behaviours/recipe';
import { recipeById } from '../behaviours/registry';
import { behaviourDataJs, behaviourRuntimeJs, LOOK_CLASS, lookCss } from './behaviourRuntime';
import { countdownIndex } from './artworkFields';
import { PREFIX } from './shared';

// ── The module interface (the seam svg.ts speaks) ────────────────────────────────────────────

/**
 * Everything `assembleImportedSvg` needs from a behaviour, with the binding already applied.
 *
 * `from` is the index the behaviour's own fields start at - always the artwork's field count,
 * because the behaviour's fields sit AFTER the artwork's. That order is load-bearing: the type
 * shim mirrors it so a control's payload resolves to the right `fN`.
 */
export interface BoundBehaviour {
  /** Every id the behaviour stamps, so the binder moves a designer's colliding id aside. The
   *  compiler stamps ROLES rather than ids and claims none - kept on the seam because the
   *  binder's `taken` set reads it, and a later road may claim ids again. */
  layerIds: string[];
  /** How many operator fields it adds after the artwork's own. DERIVED, never typed: this
   *  number reserves the behaviour's `fN` ids in the binder's `taken` set, and written by hand
   *  it goes stale the moment a behaviour appends a field - silently, on air. */
  fieldCount: number;
  /** Stamp the picked drawings. Called from the markup bind, while the candidate markers are
   *  still in place - that is what they are for. */
  markLayers(root: Element): void;
  /** The stylesheet part the behaviour needs, or '' for none. */
  css: string;
  fields(from: number): SpxField[];
  /** Hidden holders SPX writes into. Input-only values, never drawn. */
  html(from: number): string;
  js(from: number): string;
  /** The line update() runs after writing the fields, so a data write never erases a look the
   *  machine still holds and a snap recovery repaints from the machine rather than the screen. */
  updateHook: string;
  /** The extra steps the arc needs on the DEFAULT PATH - a lifecycle beat has to be authored as
   *  data, or SPX's `steps` would say one and stop sending Continue. */
  steps(data: AnimData): AnimData;
  /** The type `attachMachine` compiles onto the finished template. */
  type(svg: DesignSvg): GraphicType;
}

// ── The binding (the compiler's input) ───────────────────────────────────────────────────────

/**
 * Which of the artwork's layers play a recipe's roles. A FIELD role binds an index into the
 * artwork's field list (the operator types it); a LAYER role binds a candidate id (the runtime
 * owns it). A per-row role binds one per row key.
 */
export interface BehaviourBinding {
  recipe: string;
  options?: Record<string, string | number | boolean>;
  /** The row keys, in row order, for a recipe with rows. */
  rows?: string[];
  fields: Record<string, number | Record<string, number>>;
  layers: Record<string, string | Record<string, string>>;
}

/**
 * The bound module for a design, or null when the artwork carries no behaviour - which is the
 * ordinary in/out graphic the importer has always produced, and still the common case.
 *
 * `artworkFields` is what the artwork's own layers compile to (artworkFields.ts) - the compiler
 * mirrors their order and kinds in the type shim, and takes the operator's own titles from them.
 */
export function boundBehaviour(svg: DesignSvg, artworkFields: SpxField[]): BoundBehaviour | null {
  const behaviour = svg.behaviour;
  if (!behaviour) return null;
  return compileBinding(artworkFields, bindingOf(svg));
}

/** The wizard's per-recipe shape as the one binding the compiler reads. */
export function bindingOf(svg: DesignSvg): BehaviourBinding {
  const behaviour = svg.behaviour!;
  if (behaviour.kind === 'quiz') return quizBinding(behaviour);
  if (behaviour.kind === 'poll') return voteBinding(behaviour);
  if (behaviour.kind === 'timer') return countdownBinding(svg, behaviour);
  return scoreBinding(behaviour);
}

/** Per-row layer bindings from a list of rows, skipping the rows the designer left undrawn. */
function perRow<R>(keys: string[], rows: R[], pick: (row: R) => string | undefined): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key, i) => {
    const id = rows[i] ? pick(rows[i]) : undefined;
    return id ? [[key, id]] : [];
  }));
}

/** Layer bindings whose layer may be absent, written once. */
function layers(entries: Record<string, string | Record<string, string> | undefined>): BehaviourBinding['layers'] {
  return Object.fromEntries(
    Object.entries(entries).filter(([, v]) => v !== undefined && (typeof v === 'string' ? v !== '' : Object.keys(v).length > 0)),
  ) as BehaviourBinding['layers'];
}

/** The quiz: the answers are the rows, lettered in row order. */
function quizBinding(quiz: DesignSvgQuizBehaviour): BehaviourBinding {
  const keys = quiz.answers.map((_, i) => String.fromCharCode(65 + i));
  return {
    recipe: 'quiz',
    rows: keys,
    fields: { question: quiz.question, answer: Object.fromEntries(keys.map((key, i) => [key, quiz.answers[i]])) },
    layers: layers({
      'answer.selected': perRow(keys, quiz.rows, (r) => r.selected),
      'answer.correct': perRow(keys, quiz.rows, (r) => r.correct),
      'answer.wrong': perRow(keys, quiz.rows, (r) => r.wrong),
      locked: quiz.locked,
    }),
  };
}

/** The score tracker: the teams are the rows, numbered; names and figures are fields. */
function scoreBinding(score: DesignSvgScoreBehaviour): BehaviourBinding {
  const keys = score.rows.map((_, i) => String(i + 1));
  return {
    recipe: 'score',
    rows: keys,
    fields: {
      team: Object.fromEntries(keys.map((key, i) => [key, score.rows[i].name])),
      score: Object.fromEntries(keys.map((key, i) => [key, score.rows[i].score])),
    },
    layers: layers({ 'team.flash': perRow(keys, score.rows, (r) => r.flash), final: score.final }),
  };
}

/** The countdown: the clock is the artwork field bound as the countdown - found, never asked. */
function countdownBinding(svg: DesignSvg, timer: DesignSvgTimerBehaviour): BehaviourBinding {
  const clock = countdownIndex(svg);
  return {
    recipe: 'countdown',
    fields: clock === -1 ? {} : { clock },
    layers: layers({ bar: timer.bar, warning: timer.warning, paused: timer.paused, expired: timer.expired }),
  };
}

/** The live vote: the options are the rows, numbered; nothing is a field the operator types. */
function voteBinding(poll: DesignSvgPollBehaviour): BehaviourBinding {
  const keys = poll.rows.map((_, i) => String(i + 1));
  return {
    recipe: 'vote',
    rows: keys,
    fields: {},
    layers: layers({
      question: poll.question,
      option: perRow(keys, poll.rows, (r) => r.label),
      bar: perRow(keys, poll.rows, (r) => r.bar),
      percent: perRow(keys, poll.rows, (r) => r.value),
      winner: perRow(keys, poll.rows, (r) => r.winner),
      total: poll.total,
      badge: poll.badge,
    }),
  };
}

// ── The compiler ─────────────────────────────────────────────────────────────────────────────

/** SPX ftype for an owned field's kind - the type registry's own mapping, restated for the one
 *  place owned fields are emitted before a type exists. */
function ftypeFor(kind: FieldKind): SpxField['ftype'] {
  switch (kind) {
    case 'lines': return 'textarea';
    case 'number': return 'number';
    case 'image': return 'filelist';
    case 'select': return 'dropdown';
    case 'toggle': return 'checkbox';
    case 'color': return 'color';
    default: return 'textfield';
  }
}

function at<T>(map: Record<string, T | Record<string, T>> | undefined, role: string, key?: string): T | undefined {
  const value = map?.[role];
  if (value === undefined) return undefined;
  if (typeof value === 'object' && value !== null) return key === undefined ? undefined : (value as Record<string, T>)[key];
  return key === undefined ? (value as T) : undefined;
}

/**
 * Strip whatever the designer used to hide a layer, so the look class is the only thing deciding
 * whether it shows. The designer hid the layer to see their base look; the stylesheet hides it
 * now, so the file's own display/visibility would fight the rule that shows it. Two of the three
 * forms are handled here - the attribute and the inline style. The third, a CLASS whose rule lives
 * in the file's own `<style>` block, is Illustrator's default export shape and is handled at
 * import (`hiddenClasses` in assets/svgImport.ts).
 */
export function clearDrawnHiding(el: Element): void {
  el.removeAttribute('display');
  el.removeAttribute('visibility');
  const style = el.getAttribute('style');
  if (!style) return;
  const kept = style
    .split(';')
    .filter((d) => !/^\s*(display|visibility)\s*:/i.test(d))
    .join(';');
  if (kept.trim()) el.setAttribute('style', kept);
  else el.removeAttribute('style');
}

/** Compile one recipe against one binding. */
export function compileBinding(artworkFields: SpxField[], binding: BehaviourBinding): BoundBehaviour {
  const recipe = recipeById(binding.recipe);
  if (!recipe) throw new Error(`Behaviour: no recipe "${binding.recipe}".`);
  const rows = binding.rows ?? [];
  const from = artworkFields.length;
  const options: RecipeContext['options'] = {
    ...Object.fromEntries((recipe.options ?? []).map((o) => [o.key, o.default])),
    ...(binding.options ?? {}),
  };
  // Owned fields are declared in terms of the context, and the context resolves owned fields -
  // so the list is filled in after the context exists. Nothing in `fields()` may ask for an
  // owned field's id, and nothing does: the fields are what the ids are minted for.
  let owned: RecipeField[] = [];
  const ownedIndex = (key: string): number => owned.findIndex((f) => f.key === key);
  const ctx: RecipeContext = {
    rows,
    options,
    fieldId: (role, key) => {
      const index = at(binding.fields, role, key);
      if (index !== undefined) return `f${index}`;
      const own = ownedIndex(role);
      return own === -1 ? null : `f${from + own}`;
    },
    fieldKey: (role, key) => {
      const index = at(binding.fields, role, key);
      if (index !== undefined) return `svg${index}`;
      return ownedIndex(role) === -1 ? null : role;
    },
    label: (role, key) => {
      const index = at(binding.fields, role, key);
      const title = index === undefined ? '' : artworkFields[index]?.title?.trim() ?? '';
      if (title) return title;
      const declared = recipe.roles.find((r) => r.id === role)?.label ?? role;
      return key ? `${declared} ${key}` : declared;
    },
    bound: (role, key) => at(binding.layers, role, key) !== undefined || at(binding.fields, role, key) !== undefined,
  };
  owned = recipe.fields(ctx);

  const lookRoles = new Set(recipe.roles.filter((r) => r.kind === 'layer' && r.paint?.includes('look')).map((r) => r.id));
  const table = (): BehaviourData => {
    const fields: NonNullable<BehaviourData['fields']> = {};
    for (const role of recipe.roles.filter((r) => r.kind === 'field')) {
      if (role.perRow) {
        const byKey = Object.fromEntries(rows.flatMap((key) => {
          const id = ctx.fieldId(role.id, key);
          return id ? [[key, id]] : [];
        }));
        if (Object.keys(byKey).length > 0) fields[role.id] = byKey;
      } else {
        const id = ctx.fieldId(role.id);
        if (id) fields[role.id] = id;
      }
    }
    for (const field of owned) fields[field.key] = ctx.fieldId(field.key)!;
    const kinds: Record<string, FieldKindSpec> = {};
    for (const field of owned) if (field.spec) kinds[ctx.fieldId(field.key)!] = field.spec;
    for (const [id, spec] of Object.entries(recipe.artworkKinds?.(ctx) ?? {})) {
      // A parameter the recipe could not resolve (an optional companion field) is left out
      // rather than written as "undefined".
      kinds[id] = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as FieldKindSpec;
    }
    const data: BehaviourData = { version: 1, recipe: recipe.id, paint: recipe.paint(ctx) };
    if (Object.keys(options).length > 0) data.options = options;
    if (recipe.rows) data.rows = { [recipe.rows.role]: rows };
    if (Object.keys(fields).length > 0) data.fields = fields;
    if (Object.keys(kinds).length > 0) data.kinds = kinds;
    return data;
  };
  const withClock = (): boolean => Object.values(table().kinds ?? {}).some((spec) => spec.kind === 'clock');

  return {
    layerIds: [],
    fieldCount: owned.length,
    markLayers: (root) => {
      for (const role of recipe.roles.filter((r) => r.kind === 'layer')) {
        const keys = role.perRow ? rows : [undefined];
        for (const key of keys) {
          const candidateId = at(binding.layers, role.id, key);
          if (!candidateId) continue;
          const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
          if (!el) continue;
          // A SPACE-SEPARATED list of tokens, like the growth stamp: one layer may play two
          // roles, and a plain setAttribute would let the second erase the first.
          const tokens = (el.getAttribute(BEHAVIOUR_ROLE_ATTR) ?? '').split(/\s+/).filter(Boolean);
          const token = roleToken(role.id, key);
          if (!tokens.includes(token)) tokens.push(token);
          el.setAttribute(BEHAVIOUR_ROLE_ATTR, tokens.join(' '));
          if (lookRoles.has(role.id)) {
            const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
            if (!own.includes(LOOK_CLASS)) own.push(LOOK_CLASS);
            el.setAttribute('class', own.join(' '));
            clearDrawnHiding(el);
          }
        }
      }
    },
    css: lookRoles.size > 0 ? lookCss : '',
    fields: (start) =>
      owned.map((field, i) => {
        const spx: SpxField = { field: `f${start + i}`, ftype: ftypeFor(field.kind), title: field.label, value: field.value };
        if (field.options) spx.items = field.options.map((o) => ({ text: o.label, value: String(o.value) }));
        return spx;
      }),
    html: (start) =>
      owned.length === 0
        ? ''
        : `
    <!-- The behaviour's own values. SPX writes them here; the rules in template.js read them.
         None of these is ever drawn - the artwork's own layers are what the audience sees. -->
${owned.map((field, i) => `    <div id="f${start + i}" class="${DATA_SOURCE_CLASS}">${field.value}</div>`).join('\n')}`,
    js: () => `\n${behaviourDataJs(table())}${behaviourRuntimeJs(withClock())}`,
    updateHook: `  if (typeof noacgRepaintData === 'function') noacgRepaintData();  // the behaviour's looks, gauges and readouts (below)`,
    steps: (data) => {
      const path = recipe.path?.(ctx);
      if (!path) return data;
      const repaint = { time: 0, call: REPAINT_CALL };
      const steps = data.steps.map((s, i) =>
        i === 0
          ? {
              ...s,
              ...(path.entrance ? { name: path.entrance } : {}),
              // The entrance repaints too: every look starts hidden and the runtime's memory
              // starts empty, so something has to put the board in a known state on arrival.
              calls: [...(path.entranceCalls ?? []).map((call) => ({ time: 0, call })), repaint, ...(s.calls ?? [])],
            }
          : { ...s },
      );
      const extra: AnimStep[] = (path.steps ?? []).map((step) => ({
        name: step.name,
        duration: step.duration,
        ease: data.steps[data.steps.length - 1]?.ease ?? 'power2.in',
        calls: [repaint],
        layers: {},
      }));
      steps.splice(steps.length - 1, 0, ...extra);
      return { ...data, steps };
    },
    type: () => {
      const numeric = new Set(artworkFields.filter((f) => f.ftype === 'number').map((f) => f.field));
      const artwork: TypeField[] = artworkFields.map((f, i) => ({
        key: `svg${i}`,
        label: f.title,
        // A team's figure and a clock's minutes compile as numbers, which is what lets a control
        // carry an `adjust` through them: `compileControls` refuses a delta on anything else.
        kind: numeric.has(f.field) ? 'number' : 'text',
        value: '',
        role: 'data',
      }));
      return {
        id: `imported-${recipe.id}`,
        name: `Imported ${recipe.name.toLowerCase()}`,
        description: recipe.description,
        // The artwork IS the structure. Nothing is required, because the author's own drawing is
        // what the parts would name and we did not draw it - `missingParts` has nothing to check.
        structure: { prefix: PREFIX, category: recipe.category, parts: [] },
        // The artwork's own fields first, then the owned ones, mirroring the template's real
        // field order: `fieldIdFor` resolves a control's payload key by INDEX in this array.
        fields: [
          ...artwork,
          ...owned.map((f): TypeField => ({ key: f.key, label: f.label, kind: f.kind, value: f.value, role: 'data', ...(f.options ? { options: f.options } : {}) })),
        ],
        machine: recipe.machine(ctx),
        controls: recipe.controls(ctx),
        capabilities: { maxLines: 1, logo: 'none', animationPresets: [], defaultZone: recipe.defaultZone },
        designs: [],
      };
    },
  };
}
