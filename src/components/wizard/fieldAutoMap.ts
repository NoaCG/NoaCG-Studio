// THE MAPPING STEP EXPLAINS ITSELF, AND OFFERS TO DO THE REST
// (docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md).
//
// Three things the step needs from one place, all of them read off the SAME matcher that fills
// the pickers at drop (templates/behaviours/naming.ts over words.json), never off a hand-written
// copy of it:
//
//   1. `namesThatFill` - the layer name that WOULD have filled a picker, shown beside the picker
//      that stayed empty. Every name is checked through `matchRole` before it is shown, so a rule
//      the matcher stops honouring stops being taught the same moment.
//   2. `fillGap` - how many pickers are still empty, and whether the file holds layers nothing is
//      using that could fill them. That is the number behind "you have a lot of fields that are
//      not automatically mapped", and it costs no new measurement.
//   3. `proposeFill` - one press that fills the empty pickers, from the names first and then from
//      WHERE each layer sits on the artwork. Every pick carries a REASON in the reader's words,
//      because a wrong automatic binding on somebody's own artwork is worse than an empty picker:
//      what it chose is shown, and can be undone.
//
// The step owns the draft shapes (a quiz's rows, a score board's teams); this module speaks in
// PICKERS - one per box on the screen, named by the recipe's role id and its row key - and the
// two adapters at the bottom translate a behaviour draft to pickers and a fill back into it.

import { BEHAVIOUR_WORDS, rolesOf, rowKeys, rowsOf, type RecipeRole } from '../../templates/behaviours/recipe';
import { matchRole, withRowKey } from '../../templates/behaviours/naming';
import type { SvgBehaviourDraft } from './draft';

/** One box on the mapping step: which role it binds, for which row, from which inventory. */
export interface FillPicker {
  role: string;
  /** The row key (`A`, `2`), or undefined for a role without rows. */
  key?: string;
  value: string;
}

/** A layer as the fill sees it: what the picker lists, plus where it sits and what colour it is
 *  when the step could measure it (hidden layers are measured with their hiding lifted). */
export interface FillLayer {
  id: string;
  label: string;
  hidden?: boolean;
  numeric?: boolean;
  /** In the artwork's own px. Absent when the step could not measure this layer. */
  box?: { top: number; bottom: number; left: number; right: number } | null;
  /** Dominant fill as `rgb(r, g, b)`, when measured. */
  color?: string | null;
}

export interface FillPick {
  role: string;
  key?: string;
  candidateId: string;
  /** Why this layer, in the words shown under the picker. */
  reason: string;
}

/** The example name (`teach`) and synonyms (`also`) words.json prints for a role. */
function taughtNames(recipeId: string, roleId: string): string[] {
  const entry = BEHAVIOUR_WORDS[recipeId]?.roles.find((r) => r.id === roleId);
  return entry ? [entry.teach, ...(entry.also ?? [])] : [];
}

/**
 * The names that would fill this picker, first the one the docs teach. Each is put through the
 * matcher for THIS row before it is offered: a taught name the matcher would not read as this
 * role for this row is not shown, so the step can never teach a rule the code has dropped.
 */
export function namesThatFill(recipeId: string, roleId: string, rowKey?: string): string[] {
  const role = rolesOf(recipeId).find((r) => r.id === roleId);
  if (!role || role.countdown) return [];
  const out: string[] = [];
  for (const taught of taughtNames(recipeId, roleId)) {
    const name = rowKey ? withRowKey(taught, rowKey) : taught;
    const match = matchRole(role, name);
    if (!match || match.key !== (rowKey ?? '')) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The one line shown under an empty picker, or null for a role names cannot fill (the clock). */
export function nameHint(recipeId: string, roleId: string, rowKey?: string): string | null {
  const names = namesThatFill(recipeId, roleId, rowKey);
  return names.length > 0 ? `name it “${names[0]}”` : null;
}

// ── WHAT A ROLE MAY BE FILLED FROM ──

type Pool = 'text' | 'look' | 'gauge';

/** A field or a written text layer is filled from text; a `look` (a moment shown and hidden by
 *  the runtime) only from a HIDDEN drawing, because a visible one is the base look and binding
 *  it would hide the artwork; a `gauge` (a bar drawn full) from any drawing. */
function poolOf(role: RecipeRole): Pool {
  if (role.kind === 'field' || role.pool === 'text') return 'text';
  return role.paint?.includes('look') && !role.paint.includes('gauge') ? 'look' : 'gauge';
}

function candidatesFor(pool: Pool, text: FillLayer[], drawn: FillLayer[]): FillLayer[] {
  if (pool === 'text') return text;
  if (pool === 'look') return drawn.filter((l) => l.hidden);
  return drawn;
}

/** The boxes still empty (the clock's is bound by kind, never by a name, so it is never one),
 *  and every layer already in use - by a box, or by something other than these boxes (`taken`:
 *  a hidden group declared a switch or a choice), so it is neither counted as unused nor filled. */
function emptyAndClaimed(roles: RecipeRole[], pickers: FillPicker[], taken: string[]) {
  const claimed = new Set([...pickers.map((p) => p.value).filter(Boolean), ...taken]);
  const empty = pickers.filter((p) => !p.value && roles.some((r) => r.id === p.role && !r.countdown));
  return { empty, claimed };
}

/**
 * How many pickers are still empty, and how many unused layers the file holds that one of them
 * could take. The step shows its notice off these two numbers.
 */
export function fillGap(
  recipeId: string,
  pickers: FillPicker[],
  text: FillLayer[],
  drawn: FillLayer[],
  taken: string[] = [],
): { empty: number; spare: number } {
  const roles = rolesOf(recipeId);
  const { empty, claimed } = emptyAndClaimed(roles, pickers, taken);
  const pools = new Set(empty.map((p) => poolOf(roles.find((r) => r.id === p.role)!)));
  const spareIds = new Set<string>();
  for (const pool of pools) {
    for (const layer of candidatesFor(pool, text, drawn)) if (!claimed.has(layer.id)) spareIds.add(layer.id);
  }
  return { empty: empty.length, spare: spareIds.size };
}

// ── THE FILL ──

/** The two quiz moments whose colour is a convention worth reading: a green drawing on an answer
 *  row is its correct look, a red one its wrong look. Nothing else is read off a colour. */
const COLOUR_ROLES: Record<string, 'green' | 'red'> = { 'answer.correct': 'green', 'answer.wrong': 'red' };

function hueOf(color: string | null | undefined): 'green' | 'red' | null {
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color ?? '');
  if (!m) return null;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (g > r * 1.25 && g > b * 1.25) return 'green';
  // Strict on red so an amber highlight (246,166,35) reads as neither.
  if (r > g * 1.6 && r > b * 1.4) return 'red';
  return null;
}

const centre = (l: FillLayer) => (l.box ? (l.box.top + l.box.bottom) / 2 : null);
const height = (l: FillLayer) => (l.box ? l.box.bottom - l.box.top : 0);

/**
 * Fill the empty pickers, and say why for each. The ladder, most certain first:
 *
 *   1. NAMES, through the same matcher the drop used - a layer whose name reads as the role for
 *      this row. Reaches a picker the drop left empty when the reader chose the behaviour by hand.
 *   2. THE ROW TEXT (answers, teams, options): unused text layers top to bottom, one per empty row.
 *      A question, where the recipe has one, takes the topmost first.
 *   3. THE ROW'S OTHER TEXT (a team's figure, an option's percentage): the unused text layer that
 *      sits on that row - nearest vertical centre - a plain figure where the role asks for one.
 *   4. THE ROW'S DRAWINGS: an unused HIDDEN drawing whose centre sits on the row and reaches
 *      across its words. Several on one row are told apart by colour where the role has one
 *      (green is correct, red is wrong), else by the order the file draws them, in the recipe's
 *      role order. A bar (a gauge) is the widest drawing beside the row's words - never one that
 *      spans the words, which is the row's own plate.
 *   5. ONE LEFT, ONE BOX: a rowless drawing role is filled only when exactly one empty box and
 *      exactly one unused drawing of its pool remain. Anything less certain stays empty.
 *
 * Nothing here is a requirement: a pick the reader disagrees with is one select away from being
 * changed, and the reason under it says what the guess was made from.
 */
export function proposeFill(
  recipeId: string,
  pickers: FillPicker[],
  text: FillLayer[],
  drawn: FillLayer[],
  taken: string[] = [],
): FillPick[] {
  const roles = rolesOf(recipeId);
  const roleOf = (id: string) => roles.find((r) => r.id === id);
  const { empty, claimed } = emptyAndClaimed(roles, pickers, taken);
  const picks: FillPick[] = [];
  const take = (picker: FillPicker, layer: FillLayer, reason: string) => {
    picks.push({ role: picker.role, key: picker.key, candidateId: layer.id, reason });
    claimed.add(layer.id);
    empty.splice(empty.indexOf(picker), 1);
  };
  const spare = (pool: Pool) => candidatesFor(pool, text, drawn).filter((l) => !claimed.has(l.id));
  const fits = (role: RecipeRole, layer: FillLayer) => !role.numeric || !!layer.numeric;
  // A role that does not ask for a figure takes the words first: on a score board the "0" beside
  // "Home" is the figure, never the second team, and only once the words run out is a figure a
  // fair guess for a text role (a quiz whose answer is "1969").
  const wordsFirst = (role: RecipeRole, layers: FillLayer[]) =>
    role.numeric ? layers : [...layers.filter((l) => !l.numeric), ...layers.filter((l) => l.numeric)];

  // 1. Names.
  for (const picker of [...empty]) {
    const role = roleOf(picker.role)!;
    const layer = spare(poolOf(role)).find((l) => {
      const m = matchRole(role, l.label);
      return m !== null && m.key === (picker.key ?? '') && fits(role, l);
    });
    if (layer) take(picker, layer, `named “${layer.label}”`);
  }

  // The row anchors: the text layer each row is known by, bound or filled.
  const rowRoleId = rowsOf(recipeId)?.role;
  const anchorOf = (key: string): FillLayer | undefined => {
    const bound = pickers.find((p) => p.role === rowRoleId && p.key === key)?.value;
    const filled = picks.find((p) => p.role === rowRoleId && p.key === key)?.candidateId;
    return text.find((l) => l.id === (bound || filled));
  };
  // Top to bottom where the layers were measured; an unmeasured layer goes LAST, never first.
  const byTop = (a: FillLayer, b: FillLayer) => (centre(a) ?? Infinity) - (centre(b) ?? Infinity);
  const measured = text.some((l) => centre(l) != null);
  const topDown = (layers: FillLayer[]) => (measured ? [...layers].sort(byTop) : layers);
  const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

  // 2. The row text, and the question before it.
  const questionRole = roleOf('question');
  const question = questionRole && poolOf(questionRole) === 'text' && empty.find((p) => p.role === 'question');
  if (question) {
    const layer = wordsFirst(questionRole!, topDown(spare('text'))).find((l) => fits(questionRole!, l));
    if (layer) take(question, layer, measured ? 'the top text layer' : 'the first text layer in the file');
  }
  if (rowRoleId) {
    const rowRole = roleOf(rowRoleId)!;
    const rows = empty.filter((p) => p.role === rowRoleId);
    const order = topDown(text);
    for (const picker of rows) {
      const layer = wordsFirst(rowRole, topDown(spare('text'))).find((l) => fits(rowRole, l));
      if (!layer) break;
      const at = order.indexOf(layer) + 1;
      take(picker, layer, `the ${ordinal(at)} text layer ${measured ? 'from the top' : 'in the file'}`);
    }
  }

  // 3. The row's other text - the layer sitting on that row.
  for (const picker of [...empty]) {
    const role = roleOf(picker.role)!;
    if (!role.perRow || poolOf(role) !== 'text' || !picker.key) continue;
    const anchor = anchorOf(picker.key);
    const ac = anchor && centre(anchor);
    if (ac == null) continue;
    const onRow = spare('text')
      .filter((l) => fits(role, l) && centre(l) != null && Math.abs(centre(l)! - ac) <= Math.max(height(anchor!), 1) * 0.75)
      .sort((a, b) => Math.abs(centre(a)! - ac) - Math.abs(centre(b)! - ac));
    if (onRow[0]) take(picker, onRow[0], `the ${role.numeric ? 'figure' : 'text'} on row ${picker.key}`);
  }

  // 4. The row's drawings.
  const rowKeys = [...new Set(pickers.map((p) => p.key).filter((k): k is string => !!k))];
  const anchors = rowKeys.map((key) => ({ key, c: (() => { const a = anchorOf(key); return a ? centre(a) : null; })() }));
  // A drawing is ON a row when its centre sits within the row text's own height of that text's
  // centre and nearer to it than to any other row's. A LOOK must also reach across the words - a
  // row's highlight spans them; a "+1" stamp far to the right at the same height does not, and
  // binding it as the row's look would hide the stamp and light the wrong thing. A GAUGE is the
  // opposite: a bar sits BESIDE the words, and a drawing that spans them end to end is the row's
  // own plate, which scaled by a vote share would be the wrong thing moving.
  const rowOf = (layer: FillLayer, pool: 'look' | 'gauge'): string | null => {
    const c = centre(layer);
    if (c == null || !layer.box) return null;
    let best: { key: string; d: number } | null = null;
    for (const a of anchors) {
      if (a.c == null) continue;
      const d = Math.abs(a.c - c);
      if (!best || d < best.d) best = { key: a.key, d };
    }
    if (!best) return null;
    const gaps = anchors.filter((a) => a.c != null && a.key !== best!.key).map((a) => Math.abs(a.c! - c));
    const nearestOther = gaps.length > 0 ? Math.min(...gaps) : Infinity;
    const anchor = anchorOf(best.key);
    if (!anchor?.box) return null;
    const across = layer.box.left <= anchor.box.right && layer.box.right >= anchor.box.left;
    const spans = layer.box.left <= anchor.box.left && layer.box.right >= anchor.box.right;
    const fits = pool === 'look' ? across : !spans;
    return fits && best.d <= Math.max(height(anchor), 1) * 1.5 && best.d < nearestOther ? best.key : null;
  };
  for (const key of rowKeys) {
    for (const pool of ['look', 'gauge'] as const) {
      const boxes = empty.filter((p) => p.key === key && poolOf(roleOf(p.role)!) === pool);
      if (boxes.length === 0) continue;
      const here = spare(pool)
        .filter((l) => rowOf(l, pool) === key)
        .sort((a, b) => drawn.indexOf(a) - drawn.indexOf(b));
      if (here.length === 0) continue;
      // Colour first, for the roles that have one.
      const before = here.length;
      for (const picker of [...boxes]) {
        const want = COLOUR_ROLES[picker.role];
        if (!want) continue;
        const layer = here.find((l) => !claimed.has(l.id) && hueOf(l.color) === want);
        if (layer) {
          take(picker, layer, `the ${want} drawing on row ${key}`);
          boxes.splice(boxes.indexOf(picker), 1);
        }
      }
      const left = here.filter((l) => !claimed.has(l.id));
      if (left.length === 0) continue;
      if (pool === 'gauge') {
        // A bar is the widest drawing beside its row's words.
        const widest = [...left].sort((a, b) => (b.box!.right - b.box!.left) - (a.box!.right - a.box!.left))[0];
        take(boxes[0], widest, `the widest drawing beside row ${key}`);
        continue;
      }
      const total = left.length;
      boxes.forEach((picker, i) => {
        const layer = left[i];
        if (!layer) return;
        const why =
          total === 1
            ? before === 1
              ? `the hidden drawing on row ${key}`
              : `the drawing left on row ${key}`
            : `the ${ordinal(i + 1)} of ${total} hidden drawings on row ${key}`;
        take(picker, layer, why);
      });
    }
  }

  // 5. One left, one box.
  for (const pool of ['look', 'gauge', 'text'] as const) {
    const boxes = empty.filter((p) => !p.key && poolOf(roleOf(p.role)!) === pool);
    if (boxes.length !== 1) continue;
    const left = spare(pool).filter((l) => fits(roleOf(boxes[0].role)!, l));
    if (left.length === 1) take(boxes[0], left[0], pool === 'text' ? 'the one text layer left' : 'the one drawing left');
  }

  return picks;
}

// ── THE DRAFT, AS PICKERS, AND BACK ──

/** The text layer each row is known by, in row order: the answer, the team name, the option. */
function rowLayerIds(b: SvgBehaviourDraft): string[] {
  if (b.kind === 'quiz') return b.answers;
  if (b.kind === 'score') return b.rows.map((r) => r.name);
  if (b.kind === 'poll') return b.rows.map((r) => r.label);
  return [];
}

/**
 * THE KEY OF EACH ROW is the key the matcher READS off its own text layer - `Answer 1` is row 1,
 * `Answer B` is row B - because that is the key the drop binds moments by (naming.ts): a hint
 * that taught "A selected" beside a row named `Answer 1` would teach a name the import does not
 * read, and a fill that refused `1 selected` for it would refuse a name the import binds. A row
 * whose layer the matcher does not read as a row at all ("Group 7"), or a set of keys that
 * collide, falls back to the recipe's own positional keys (letters for the quiz, numbers for the
 * rest) - on such a board no key is honoured by name, and positional is the one a reader expects.
 */
export function rowKeysOf(b: SvgBehaviourDraft, text: FillLayer[]): string[] {
  const ids = rowLayerIds(b);
  const recipeId = recipeIdOf(b);
  const rows = rowsOf(recipeId);
  const rowRole = rows && rolesOf(recipeId).find((r) => r.id === rows.role);
  const positional = rowKeys(rows?.keys ?? 'numbers', ids.length);
  if (!rowRole) return positional;
  const named = ids.map((id, i) => {
    const label = text.find((l) => l.id === id)?.label;
    return (label && matchRole(rowRole, label)?.key) || positional[i];
  });
  return new Set(named).size === named.length ? named : positional;
}

/** Which recipe a draft is: the four shapes the wizard grew one at a time, or the generic one. */
export function recipeIdOf(b: SvgBehaviourDraft): string {
  return b.kind === 'poll' ? 'vote' : b.kind === 'timer' ? 'countdown' : b.kind === 'recipe' ? b.recipe : b.kind;
}

/** Every box of the behaviour, visited in the step's own order, each mapped to its next value. */
function mapBoxes(b: SvgBehaviourDraft, text: FillLayer[], f: (role: string, key: string | undefined, value: string) => string): SvgBehaviourDraft {
  const keys = rowKeysOf(b, text);
  if (b.kind === 'quiz') {
    return {
      ...b,
      question: f('question', undefined, b.question),
      answers: b.answers.map((a, i) => f('answer', keys[i], a)),
      rows: b.rows.map((r, i) => ({
        selected: f('answer.selected', keys[i], r.selected),
        correct: f('answer.correct', keys[i], r.correct),
        wrong: f('answer.wrong', keys[i], r.wrong),
      })),
      locked: f('locked', undefined, b.locked),
    };
  }
  if (b.kind === 'score') {
    return {
      ...b,
      rows: b.rows.map((r, i) => ({
        name: f('team', keys[i], r.name),
        score: f('score', keys[i], r.score),
        flash: f('team.flash', keys[i], r.flash),
      })),
      final: f('final', undefined, b.final),
    };
  }
  if (b.kind === 'poll') {
    return {
      ...b,
      question: f('question', undefined, b.question),
      rows: b.rows.map((r, i) => ({
        label: f('option', keys[i], r.label),
        bar: f('bar', keys[i], r.bar),
        value: f('percent', keys[i], r.value),
        winner: f('winner', keys[i], r.winner),
      })),
      total: f('total', undefined, b.total),
      badge: f('badge', undefined, b.badge),
    };
  }
  if (b.kind === 'timer') {
    return {
      ...b,
      bar: f('bar', undefined, b.bar),
      warning: f('warning', undefined, b.warning),
      paused: f('paused', undefined, b.paused),
      expired: f('expired', undefined, b.expired),
    };
  }
  const layers: Record<string, string> = {};
  for (const role of rolesOf(b.recipe)) {
    if (role.kind !== 'layer') continue;
    const value = f(role.id, undefined, b.layers[role.id] ?? '');
    if (value) layers[role.id] = value;
  }
  return { ...b, layers };
}

/** Every box the step shows for this behaviour, in the step's own order. */
export function pickersOf(b: SvgBehaviourDraft, text: FillLayer[]): FillPicker[] {
  const out: FillPicker[] = [];
  mapBoxes(b, text, (role, key, value) => {
    out.push({ role, key, value });
    return value;
  });
  return out;
}

const pickFor = (picks: FillPick[], role: string, key: string | undefined, value?: string) =>
  picks.find((p) => p.role === role && p.key === key && (value === undefined || p.candidateId === value));

/** The behaviour with the picks written into their EMPTY boxes; everything else untouched. */
export function withFill(b: SvgBehaviourDraft, picks: FillPick[], text: FillLayer[]): SvgBehaviourDraft {
  return mapBoxes(b, text, (role, key, value) => value || pickFor(picks, role, key)?.candidateId || '');
}

/** The behaviour with every box that STILL holds its pick emptied again - the Undo. A box the
 *  reader changed since keeps what they chose; so does everything the fill never touched. */
export function clearFill(b: SvgBehaviourDraft, picks: FillPick[], text: FillLayer[]): SvgBehaviourDraft {
  return mapBoxes(b, text, (role, key, value) => (pickFor(picks, role, key, value) ? '' : value));
}
