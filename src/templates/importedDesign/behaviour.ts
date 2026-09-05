// THE BEHAVIOUR COMPILER for imported artwork (docs/SVG_BEHAVIOUR_PLAN.md §5-§7).
//
// A recipe (templates/behaviours/) says what a behaviour IS; a BINDING says which of the
// artwork's layers play its roles; this module turns the two into everything `assembleImportedSvg`
// needs - the stamps, the owned fields and their holders, the table, the runtime, the extra path
// steps, the type `attachMachine` compiles - once, for every recipe. Before it, each behaviour was
// a module of its own that hand-wrote all seven of those things (docs/GRAPHIC_BEHAVIOUR_PLAN.md
// §10-§13 record what each found); the five findings together are the decomposition this file
// implements (docs/SVG_BEHAVIOUR_PLAN.md §1).
//
// PHASE 1 (2026-09-05): the quiz goes through the compiler. The vote, the score tracker and the
// countdown still go through their modules until phase 2 ports them; `boundBehaviour` is the seam
// both roads meet at, and svg.ts asks for a bound module and stops caring which road it took.

import type { SpxField } from '../../model/types';
import type { FieldKind } from '../../model/fieldModel';
import type {
  DesignSvg,
  DesignSvgBehaviour,
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
import { clearDrawnHiding } from './drawnState';
import { PREFIX } from './shared';
import {
  importedPollType,
  markPollLayers,
  pollBehaviourCss,
  pollBehaviourFields,
  pollBehaviourHtml,
  pollBehaviourJs,
  pollLayerIds,
  withPollSteps,
} from './pollBehaviour';
import {
  importedScoreType,
  markScoreLayers,
  scoreBehaviourCss,
  scoreBehaviourFields,
  scoreBehaviourHtml,
  scoreBehaviourJs,
  scoreLayerIds,
  withScoreSteps,
} from './scoreBehaviour';
import {
  importedTimerType,
  markTimerLayers,
  timerBehaviourCss,
  timerBehaviourFields,
  timerBehaviourHtml,
  timerBehaviourJs,
  timerLayerIds,
  withTimerSteps,
} from './timerBehaviour';

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
   *  compiler stamps ROLES rather than ids and claims none; the module road still claims its. */
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
  if (behaviour.kind === 'quiz') return compileBinding(artworkFields, quizBinding(behaviour));
  if (behaviour.kind === 'poll') return pollModule(behaviour);
  if (behaviour.kind === 'timer') return timerModule(behaviour);
  return scoreModule(behaviour);
}

/** The quiz's persisted shape as a binding. The rows are the answers, lettered in row order. */
function quizBinding(quiz: DesignSvgQuizBehaviour): BehaviourBinding {
  const keys = quiz.answers.map((_, i) => String.fromCharCode(65 + i));
  const perRow = (pick: (row: DesignSvgQuizBehaviour['rows'][number]) => string | undefined) =>
    Object.fromEntries(keys.flatMap((key, i) => (quiz.rows[i] && pick(quiz.rows[i]) ? [[key, pick(quiz.rows[i])!]] : [])));
  return {
    recipe: 'quiz',
    rows: keys,
    fields: { question: quiz.question, answer: Object.fromEntries(keys.map((key, i) => [key, quiz.answers[i]])) },
    layers: {
      'answer.selected': perRow((r) => r.selected),
      'answer.correct': perRow((r) => r.correct),
      'answer.wrong': perRow((r) => r.wrong),
      ...(quiz.locked ? { locked: quiz.locked } : {}),
    },
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
    Object.assign(kinds, recipe.artworkKinds?.(ctx) ?? {});
    const data: BehaviourData = { version: 1, recipe: recipe.id, paint: recipe.paint(ctx) };
    if (Object.keys(options).length > 0) data.options = options;
    if (recipe.rows) data.rows = { [recipe.rows.role]: rows };
    if (Object.keys(fields).length > 0) data.fields = fields;
    if (Object.keys(kinds).length > 0) data.kinds = kinds;
    return data;
  };
  const withClock = (): boolean => {
    const kinds = table().kinds ?? {};
    return Object.values(kinds).some((spec) => spec.kind === 'clock');
  };

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
            // The designer switched this layer off to see their base look; the stylesheet
            // hides it now, so the file's own display/visibility would fight the rule.
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

// ── The module road (phase 2 ports these three to recipes) ───────────────────────────────────

function pollModule(poll: DesignSvgPollBehaviour): BoundBehaviour {
  return {
    layerIds: pollLayerIds(poll),
    fieldCount: pollBehaviourFields(0).length,
    markLayers: (root) => markPollLayers(root, poll),
    css: pollBehaviourCss,
    fields: (from) => pollBehaviourFields(from),
    html: (from) => pollBehaviourHtml(from),
    js: (from) => pollBehaviourJs(poll, from),
    updateHook: `  if (typeof paintPollState === 'function') paintPollState();  // the live vote's tally (below)`,
    steps: withPollSteps,
    type: (svg) => importedPollType(svg),
  };
}

function timerModule(timer: DesignSvgTimerBehaviour): BoundBehaviour {
  return {
    layerIds: timerLayerIds(),
    fieldCount: timerBehaviourFields(0).length,
    markLayers: (root) => markTimerLayers(root, timer),
    css: timerBehaviourCss,
    fields: (from) => timerBehaviourFields(from),
    html: (from) => timerBehaviourHtml(from),
    js: (from) => timerBehaviourJs(timer, from),
    updateHook: `  if (typeof paintTimerState === 'function') paintTimerState();  // the drawn countdown states (below)`,
    steps: withTimerSteps,
    type: (svg) => importedTimerType(svg),
  };
}

function scoreModule(score: DesignSvgScoreBehaviour): BoundBehaviour {
  return {
    layerIds: scoreLayerIds(score),
    fieldCount: scoreBehaviourFields().length,
    markLayers: (root) => markScoreLayers(root, score),
    css: scoreBehaviourCss,
    fields: () => scoreBehaviourFields(),
    html: () => scoreBehaviourHtml(),
    js: () => scoreBehaviourJs(score),
    updateHook: `  if (typeof paintScoreState === 'function') paintScoreState();  // the drawn score states (below)`,
    steps: withScoreSteps,
    type: (svg) => importedScoreType(svg, score),
  };
}

/** Kept for the wizard's summary line while the module road exists. */
export type { DesignSvgBehaviour };
