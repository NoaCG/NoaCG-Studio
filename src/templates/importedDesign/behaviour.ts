// THE BEHAVIOUR COMPILER for imported artwork (docs/SVG_BEHAVIOUR_PLAN.md §5-§7).
//
// A recipe (templates/behaviours/) says what a behaviour IS; a BINDING says which of the
// artwork's layers play its roles; this module turns the two into everything `assembleImportedSvg`
// needs - the stamps, the owned fields and their holders, the table, the runtime, the extra path
// steps, the type `attachMachine` compiles - once, for every recipe. Before it, each behaviour was
// a module of its own that hand-wrote all seven of those things (docs/GRAPHIC_BEHAVIOUR_PLAN.md
// §10-§13 record what each found); the five findings together are the decomposition this file
// implements (docs/SVG_BEHAVIOUR_PLAN.md §1). Adding a behaviour adds a declaration.
//
// A GRAPHIC MAY CARRY SEVERAL (plan §7c). At most one FULL recipe - the quiz, the score tracker,
// the vote, the countdown, each of which owns the default path - plus any number of INSTANCED
// micro-recipes (a switch per hidden layer, a choice per set of exclusive looks), each namespaced
// by its own name so their roles, fields, groups and events cannot collide. Every part compiles
// the same way; `composeParts` merges them into one table, one runtime and one machine, which is
// the composition the machine has always allowed and the binding never did.
//
// The wizard still holds a full recipe's binding in the per-recipe shapes it grew one at a time
// (`DesignSvgBehaviour` in model/wizard.ts) and the micro-recipes as `DesignSvg.extras`; the
// adapters at the bottom turn each into the one `BehaviourBinding` the compiler reads.

import type { SpxField } from '../../model/types';
import type { FieldKind } from '../../model/fieldModel';
import type {
  DesignSvg,
  DesignSvgExtra,
  DesignSvgRecipeBehaviour,
  DesignSvgPollBehaviour,
  DesignSvgQuizBehaviour,
  DesignSvgScoreBehaviour,
  DesignSvgTimerBehaviour,
} from '../../model/wizard';
import type { AnimData, AnimStep } from '../../blocks/animData';
import { BEHAVIOUR_ROLE_ATTR, roleToken, type BehaviourData, type FieldKindSpec, type PaintRule } from '../../blocks/behaviourData';
import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import type { GraphicType, TypeControlEvent, TypeField, TypeMachine } from '../types/graphicType';
import { DATA_SOURCE_CLASS } from '../shared/base';
import type { BehaviourRecipe, RecipeContext, RecipeField, RecipePath } from '../behaviours/recipe';
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
  /** An INSTANCED recipe's own name ("Sponsor", "Status") - the operator's word for it, and the
   *  namespace its roles, fields, group and events live under. */
  name?: string;
  options?: Record<string, string | number | boolean>;
  /** The row keys, in row order, for a recipe with rows. */
  rows?: string[];
  /** What each row is CALLED where the key is not the word (a choice's options). */
  rowLabels?: Record<string, string>;
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
  const bindings = bindingsOf(svg);
  return bindings.length === 0 ? null : composeParts(artworkFields, bindings);
}

/** Every binding a design carries: the full recipe's, then the extras in the order they were
 *  declared. The wizard's per-recipe shapes become the one binding the compiler reads. */
export function bindingsOf(svg: DesignSvg): BehaviourBinding[] {
  const out: BehaviourBinding[] = [];
  const behaviour = svg.behaviour;
  if (behaviour?.kind === 'quiz') out.push(quizBinding(behaviour));
  else if (behaviour?.kind === 'poll') out.push(voteBinding(behaviour));
  else if (behaviour?.kind === 'timer') out.push(countdownBinding(svg, behaviour));
  else if (behaviour?.kind === 'score') out.push(scoreBinding(behaviour));
  else if (behaviour?.kind === 'recipe') out.push(recipeBinding(behaviour));
  for (const extra of svg.extras ?? []) out.push(extraBinding(extra));
  return out;
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
    ...(quiz.options ? { options: quiz.options } : {}),
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

/** Any other recipe, as the wizard persisted it - its rows already keyed, its field roles
 *  already indices, so the generic shape is the binding with nothing translated. */
function recipeBinding(behaviour: DesignSvgRecipeBehaviour): BehaviourBinding {
  const fields: BehaviourBinding['fields'] = {};
  for (const [role, value] of Object.entries(behaviour.fields ?? {})) {
    // An index below zero is a pick the wizard could not resolve to a ticked row; it binds nothing.
    if (typeof value === 'number') {
      if (value >= 0) fields[role] = value;
      continue;
    }
    const byKey = Object.fromEntries(Object.entries(value).filter(([, i]) => i >= 0));
    if (Object.keys(byKey).length > 0) fields[role] = byKey;
  }
  return {
    recipe: behaviour.recipe,
    ...(behaviour.options ? { options: behaviour.options } : {}),
    ...(behaviour.rows ? { rows: behaviour.rows } : {}),
    fields,
    layers: layers(
      Object.fromEntries(
        Object.entries(behaviour.layers).map(([role, value]) =>
          typeof value === 'string' ? [role, value] : [role, Object.fromEntries(Object.entries(value).filter(([, id]) => !!id))],
        ),
      ),
    ),
  };
}

/** A choice option's row KEY: its label as one upper-case token, unique within the choice. */
export function optionKey(label: string, taken: Set<string>): string {
  const base = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'OPTION';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

/** A switch or a choice, as the wizard persisted it. */
function extraBinding(extra: DesignSvgExtra): BehaviourBinding {
  if (extra.kind === 'switch') {
    return { recipe: 'switch', name: extra.name, fields: {}, layers: { on: extra.layer } };
  }
  const taken = new Set<string>();
  const keyed = extra.options.map((o) => ({ ...o, key: optionKey(o.label, taken) }));
  return {
    recipe: 'choice',
    name: extra.name,
    rows: keyed.map((o) => o.key),
    rowLabels: Object.fromEntries(keyed.map((o) => [o.key, o.label])),
    fields: {},
    layers: { option: Object.fromEntries(keyed.map((o) => [o.key, o.layer])) },
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

/** An instance's name as a lower-case token for roles (`sponsor`) and as a bare identifier
 *  for machine group ids and events (`sponsor`, `q_2`), which the machine's shape gate requires. */
function slugOf(name: string): { slug: string; ident: string } {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  const ident = slug.replace(/-/g, '_').replace(/^(\d)/, '_$1');
  return { slug, ident };
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

/** One recipe compiled against one binding, before the parts are merged. */
interface CompiledPart {
  recipe: BehaviourRecipe;
  owned: RecipeField[];
  /** The `fN` of each owned field, in order. */
  ownedIds: string[];
  markLayers(root: Element): void;
  hasLooks: boolean;
  table: BehaviourData;
  machine: TypeMachine;
  controls: TypeControlEvent[];
  path: RecipePath | undefined;
}

/**
 * Compile one recipe against one binding. `offset` is where its owned fields start, counted
 * from the artwork's field count - the parts before it own the ids in between.
 */
function compilePart(artworkFields: SpxField[], binding: BehaviourBinding, offset: number): CompiledPart {
  const recipe = recipeById(binding.recipe);
  if (!recipe) throw new Error(`Behaviour: no recipe "${binding.recipe}".`);
  const rows = binding.rows ?? [];
  const from = artworkFields.length + offset;
  const options: RecipeContext['options'] = {
    ...Object.fromEntries((recipe.options ?? []).map((o) => [o.key, o.default])),
    ...(binding.options ?? {}),
  };
  const name = binding.name?.trim() || recipe.name;
  const { slug, ident } = slugOf(name);
  // An instanced recipe lives under its own name; a full recipe's words are its own.
  const ns = (id: string): string => (recipe.instanced ? `${recipe.id}.${slug}.${id}` : id);
  const nsId = (id: string): string => (recipe.instanced ? `${ident}_${id}` : id);
  // Owned fields are declared in terms of the context, and the context resolves owned fields -
  // so the list is filled in after the context exists. Nothing in `fields()` may ask for an
  // owned field's id, and nothing does: the fields are what the ids are minted for.
  let owned: RecipeField[] = [];
  // By key for a graphic-level owned field; by role AND row for one the recipe owns per row.
  const ownedIndex = (key: string, row?: string): number =>
    row === undefined ? owned.findIndex((f) => f.key === key && !f.row) : owned.findIndex((f) => f.row?.role === key && f.row.key === row);
  const ctx: RecipeContext = {
    rows,
    options,
    name,
    slug,
    ns,
    nsId,
    fieldId: (role, key) => {
      const index = at(binding.fields, role, key);
      if (index !== undefined) return `f${index}`;
      const own = ownedIndex(role, key);
      return own === -1 ? null : `f${from + own}`;
    },
    fieldKey: (role, key) => {
      const index = at(binding.fields, role, key);
      if (index !== undefined) return `svg${index}`;
      const own = ownedIndex(role, key);
      return own === -1 ? null : owned[own].key;
    },
    label: (role, key) => {
      if (key !== undefined && binding.rowLabels?.[key]) return binding.rowLabels[key];
      const index = at(binding.fields, role, key);
      const title = index === undefined ? '' : artworkFields[index]?.title?.trim() ?? '';
      if (title) return title;
      const declared = recipe.roles.find((r) => r.id === role)?.label ?? role;
      return key ? `${declared} ${key}` : declared;
    },
    bound: (role, key) => at(binding.layers, role, key) !== undefined || at(binding.fields, role, key) !== undefined,
  };
  owned = recipe.fields(ctx);
  const ownedIds = owned.map((_, i) => `f${from + i}`);

  const lookRoles = new Set(recipe.roles.filter((r) => r.kind === 'layer' && r.paint?.includes('look')).map((r) => r.id));
  const fields: NonNullable<BehaviourData['fields']> = {};
  for (const role of recipe.roles.filter((r) => r.kind === 'field')) {
    if (role.perRow) {
      const byKey = Object.fromEntries(rows.flatMap((key) => {
        const id = ctx.fieldId(role.id, key);
        return id ? [[key, id]] : [];
      }));
      if (Object.keys(byKey).length > 0) fields[ns(role.id)] = byKey;
    } else {
      const id = ctx.fieldId(role.id);
      if (id) fields[ns(role.id)] = id;
    }
  }
  for (const [i, field] of owned.entries()) {
    // A per-row owned field joins its ROLE's map, so a rule's `revealed:is:on` is asked of the
    // row the look belongs to; a graphic-level one is mapped by its key.
    if (field.row) {
      const byKey = (fields[field.row.role] as Record<string, string> | undefined) ?? {};
      byKey[field.row.key] = ownedIds[i];
      fields[field.row.role] = byKey;
    } else fields[field.key] = ownedIds[i];
  }
  const kinds: Record<string, FieldKindSpec> = {};
  for (const [i, field] of owned.entries()) if (field.spec) kinds[ownedIds[i]] = field.spec;
  for (const [id, spec] of Object.entries(recipe.artworkKinds?.(ctx) ?? {})) {
    // A parameter the recipe could not resolve (an optional companion field) is left out
    // rather than written as "undefined".
    kinds[id] = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as FieldKindSpec;
  }
  const table: BehaviourData = { version: 1, recipe: recipe.id, paint: recipe.paint(ctx) };
  if (recipe.instanced) table.recipe = `${recipe.id}:${name}`;
  if (Object.keys(options).length > 0) table.options = options;
  if (recipe.rows && rows.length > 0) table.rows = { [ns(recipe.rows.role)]: rows };
  if (Object.keys(fields).length > 0) table.fields = fields;
  if (Object.keys(kinds).length > 0) table.kinds = kinds;

  return {
    recipe,
    owned,
    ownedIds,
    hasLooks: lookRoles.size > 0,
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
          const token = roleToken(ns(role.id), key);
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
    table,
    machine: recipe.machine(ctx),
    controls: recipe.controls(ctx),
    path: recipe.path?.(ctx),
  };
}

/** Compile one binding on its own - the shape the specs and the validator reason about. */
export function compileBinding(artworkFields: SpxField[], binding: BehaviourBinding): BoundBehaviour {
  return composeParts(artworkFields, [binding]);
}

/**
 * Compile every binding and merge the parts into the one module svg.ts speaks.
 *
 * ONE FULL RECIPE AT MOST: the default path is the SPX walk, and two recipes that both want to
 * name its entrance or splice a step into it would be two walks. Instanced recipes never touch
 * the path, so any number compose; a second full recipe is refused here rather than emitting a
 * machine two arcs fight over.
 */
export function composeParts(artworkFields: SpxField[], bindings: BehaviourBinding[]): BoundBehaviour {
  const parts: CompiledPart[] = [];
  let offset = 0;
  for (const binding of bindings) {
    const part = compilePart(artworkFields, binding, offset);
    parts.push(part);
    offset += part.owned.length;
  }
  const full = parts.filter((p) => !p.recipe.instanced);
  if (full.length > 1) {
    throw new Error(`Behaviour: a graphic carries one full recipe at most (${full.map((p) => p.recipe.id).join(', ')}).`);
  }
  const owned = parts.flatMap((p) => p.owned);
  const withClock = parts.some((p) => Object.values(p.table.kinds ?? {}).some((spec) => spec.kind === 'clock'));

  const table = (): BehaviourData => {
    const merged: BehaviourData = {
      version: 1,
      // The full recipe names the table; a graphic of switches alone is named by the first.
      recipe: (full[0] ?? parts[0]).table.recipe,
      paint: parts.flatMap((p) => p.table.paint as PaintRule[]),
    };
    if (parts.length > 1) merged.parts = parts.map((p) => p.table.recipe);
    const options = Object.assign({}, ...parts.map((p) => p.table.options ?? {}));
    if (Object.keys(options).length > 0) merged.options = options;
    const rows = Object.assign({}, ...parts.map((p) => p.table.rows ?? {}));
    if (Object.keys(rows).length > 0) merged.rows = rows;
    const fields = Object.assign({}, ...parts.map((p) => p.table.fields ?? {}));
    if (Object.keys(fields).length > 0) merged.fields = fields;
    const kinds = Object.assign({}, ...parts.map((p) => p.table.kinds ?? {}));
    if (Object.keys(kinds).length > 0) merged.kinds = kinds;
    return merged;
  };

  return {
    layerIds: [],
    fieldCount: owned.length,
    markLayers: (root) => {
      for (const part of parts) part.markLayers(root);
    },
    css: parts.some((p) => p.hasLooks) ? lookCss : '',
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
    js: () => `\n${behaviourDataJs(table())}${behaviourRuntimeJs(withClock)}`,
    updateHook: `  if (typeof noacgRepaintData === 'function') noacgRepaintData();  // the behaviour's looks, gauges and readouts (below)`,
    steps: (data) => {
      const paths = parts.map((p) => p.path).filter((p): p is RecipePath => !!p);
      if (paths.length === 0) return data;
      const repaint = { time: 0, call: REPAINT_CALL };
      const entrance = paths.find((p) => p.entrance)?.entrance;
      const entranceCalls = paths.flatMap((p) => p.entranceCalls ?? []);
      const steps = data.steps.map((s, i) =>
        i === 0
          ? {
              ...s,
              ...(entrance ? { name: entrance } : {}),
              // The entrance repaints too: every look starts hidden and the runtime's memory
              // starts empty, so something has to put the board in a known state on arrival.
              calls: [...entranceCalls.map((call) => ({ time: 0, call })), repaint, ...(s.calls ?? [])],
            }
          : { ...s },
      );
      const extra: AnimStep[] = paths.flatMap((p) => p.steps ?? []).map((step) => ({
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
      const lead = full[0] ?? parts[0];
      const machine: TypeMachine = {
        ...(full[0]?.machine.main ? { main: full[0].machine.main } : {}),
        parallel: parts.flatMap((p) => p.machine.parallel ?? []),
      };
      return {
        id: `imported-${parts.map((p) => p.recipe.id).join('-')}`,
        name: `Imported ${lead.recipe.name.toLowerCase()}`,
        description: lead.recipe.description,
        // The artwork IS the structure. Nothing is required, because the author's own drawing is
        // what the parts would name and we did not draw it - `missingParts` has nothing to check.
        structure: { prefix: PREFIX, category: lead.recipe.category, parts: [] },
        // The artwork's own fields first, then every part's owned ones in order, mirroring the
        // template's real field order: `fieldIdFor` resolves a control's payload key by INDEX.
        fields: [
          ...artwork,
          ...owned.map((f): TypeField => ({ key: f.key, label: f.label, kind: f.kind, value: f.value, role: 'data', ...(f.options ? { options: f.options } : {}) })),
        ],
        machine,
        controls: parts.flatMap((p) => p.controls),
        capabilities: { maxLines: 1, logo: 'none', animationPresets: [], defaultZone: lead.recipe.defaultZone },
        designs: [],
      };
    },
  };
}
