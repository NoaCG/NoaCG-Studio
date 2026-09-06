// LAYER NAMES AS THE SHORTCUT (docs/SVG_BEHAVIOUR_PLAN.md §3b, §7b).
//
// A designer who names layers the plain way opens the mapping step with the binding filled in.
// Naming is never the door - every role is a picker - so this module only PROPOSES, and it
// proposes from ONE tokenizer and ONE scorer over every recipe's role words (words.json), where
// before it each behaviour carried its own regexes and an order-sensitive dispatcher decided
// which one spoke first. Two filed defects came out of that (docs/backlog/): a heading called
// "Options" read as option S, and "Answer 1" always read as a quiz because the quiz was asked
// first. Both fall out of the rules below.
//
// THE TOKENIZER. A name is words separated by spaces, underscores or dashes. A ROW KEY is a token
// that is a single letter or a whole number, and a name has a key only when exactly one token is
// one: `Answer A`, `A selected`, `Team 1 Score`, `Score 10`. The rest is the HEAD, which a per-row
// role's words are matched against. `Options` has no key token, so it is not row S; `Score 10`
// is row 10, never row 1. A role without rows is matched against the whole name.
//
// THE SCORER. Every recipe is scored against the same inventory. A recipe is ELIGIBLE when it has
// DISTINCTIVE evidence - a role words.json marks as evidence of THIS behaviour rather than any
// (a bar for the vote, a numeric figure for the score, a drawn moment for the quiz or the
// countdown) - on at least the recipe's minimum row count where the role repeats. Among the
// eligible, the most distinctive evidence wins, then the most roles matched, then declaration
// order. A file that satisfies no recipe proposes nothing, which stays the common case.
//
// `scripts/behaviour-docs.mjs` carries a plain-JS twin of `rowTokenOf` so the docs' example names
// can be checked against the same words without a TypeScript runtime; keep the two in step.

import type { SvgImportResult } from '../../assets/svgImport';
import type { BehaviourRecipe, RecipeRole } from './recipe';
import { BEHAVIOUR_RECIPES } from './registry';

/** The tokenizer's two rules, written once: what separates tokens, and what a key token is. */
const TOKEN_GAP = /[\s_-]+/;
const KEY_TOKEN = /^(?:[A-Za-z]|\d+)$/;

/** A layer name split into its row KEY and the HEAD the role words are matched against. */
export function rowTokenOf(label: string): { key: string | null; head: string } {
  const tokens = label.trim().split(TOKEN_GAP).filter(Boolean);
  const keys = tokens.filter((t) => KEY_TOKEN.test(t));
  if (keys.length !== 1) return { key: null, head: label.trim() };
  const key = keys[0].toUpperCase();
  return { key, head: tokens.filter((t) => t !== keys[0]).join(' ') };
}

/** The same name for another row: `Answer A` with key `C` is `Answer C`. A name with no key
 *  token (or several) is returned as it is. Lives beside the tokenizer so the two cannot drift. */
export function withRowKey(label: string, key: string): string {
  if (rowTokenOf(label).key === null) return label;
  return label
    .trim()
    .split(TOKEN_GAP)
    .filter(Boolean)
    .map((t) => (KEY_TOKEN.test(t) ? key : t))
    .join(' ');
}

/** Does this name play this role? Returns the row key for a per-row role, `''` for a role
 *  without rows, null for no match. `weak` marks a match that binds the role but is not evidence. */
export function matchRole(role: RecipeRole, label: string): { key: string; weak: boolean } | null {
  const { key, head } = rowTokenOf(label);
  if (role.perRow) {
    if (key === null) return null;
    if (role.words.test(head)) return { key, weak: false };
    if (role.weak?.test(head)) return { key, weak: true };
    return null;
  }
  if (role.words.test(label)) return { key: '', weak: false };
  if (role.weak?.test(label)) return { key: '', weak: true };
  return null;
}

/** A binding proposed from names alone: candidate ids by role, per row where the role repeats. */
export interface ProposedBinding {
  recipe: string;
  /** Row keys in row order (letters alphabetically, numbers numerically). */
  rows: string[];
  fields: Record<string, string | Record<string, string>>;
  layers: Record<string, string | Record<string, string>>;
  /** How much of THIS behaviour's own evidence the names carry, and how many roles matched. */
  distinctive: number;
  matched: number;
}

interface Layer {
  id: string;
  label: string;
  pool: 'text' | 'drawn';
  numeric: boolean;
  clock: boolean;
}

function inventory(svg: SvgImportResult): Layer[] {
  return [
    ...svg.candidates.map((c) => ({ id: c.id, label: c.label, pool: 'text' as const, numeric: c.numeric, clock: c.clock })),
    ...svg.groups.map((g) => ({ id: g.id, label: g.label, pool: 'drawn' as const, numeric: false, clock: false })),
    ...svg.shapes.map((s) => ({ id: s.id, label: s.label, pool: 'drawn' as const, numeric: false, clock: false })),
  ];
}

function sortKeys(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort((a, b) => {
    const na = /^\d+$/.test(a);
    const nb = /^\d+$/.test(b);
    if (na && nb) return Number(a) - Number(b);
    if (na !== nb) return na ? 1 : -1;
    return a.localeCompare(b);
  });
}

/**
 * Propose a binding for ONE recipe, or null when the names carry no distinctive evidence of it.
 *
 * ONE LAYER, ONE JOB: a name matching several roles takes the LAST one in declaration order, so a
 * recipe declares its roles from the general to the specific (`Team 1 Score` is a score, not a
 * team). A role is filled from its own pool only - a text layer never becomes a drawn moment, and
 * a group never becomes a field. A per-row role's key has to be one of the recipe's rows, which
 * are the keys its ROW role matched: a stray `Winner 9` on a three-option board binds nothing.
 */
export function proposeBinding(svg: SvgImportResult, recipe: BehaviourRecipe): ProposedBinding | null {
  const layers = inventory(svg);
  const roleOf = new Map<string, { role: RecipeRole; key: string; weak: boolean }>();
  for (const role of recipe.roles) {
    if (role.countdown) continue; // bound by the row's kind, never by a name
    for (const layer of layers) {
      const pool = role.kind === 'field' ? 'text' : role.pool ?? 'drawn';
      if (layer.pool !== pool) continue;
      if (role.numeric && !layer.numeric) continue;
      const match = matchRole(role, layer.label);
      if (match) roleOf.set(layer.id, { role, key: match.key, weak: match.weak });
    }
  }
  // The rows are the keys the ROW role matched, capped at the recipe's maximum in row order.
  let rows: string[] = [];
  if (recipe.rows) {
    const keys = [...roleOf.values()].filter((m) => m.role.id === recipe.rows!.role).map((m) => m.key);
    rows = sortKeys(keys).slice(0, recipe.rows.max);
  }
  const fields: ProposedBinding['fields'] = {};
  const bound: ProposedBinding['layers'] = {};
  let distinctive = 0;
  let matched = 0;
  const strong = new Map<string, Set<string>>();
  for (const [id, m] of roleOf) {
    const target = m.role.kind === 'field' ? fields : bound;
    if (m.role.perRow) {
      if (!rows.includes(m.key)) continue;
      const byKey = (target[m.role.id] as Record<string, string> | undefined) ?? {};
      if (byKey[m.key]) continue; // the first layer with this key keeps it
      byKey[m.key] = id;
      target[m.role.id] = byKey;
    } else {
      if (target[m.role.id]) continue;
      target[m.role.id] = id;
    }
    matched++;
    if (!m.weak && m.role.distinctive) {
      const seen = strong.get(m.role.id) ?? new Set<string>();
      seen.add(m.key);
      strong.set(m.role.id, seen);
    }
  }
  // The clock is the one field bound by KIND: exactly one clock-shaped layer, as armTimerClock
  // arms it. Evidence for the countdown comes from its drawn moments, never from the clock alone
  // (a scorebug draws a match clock and is not a countdown).
  const clockRole = recipe.roles.find((r) => r.countdown);
  if (clockRole) {
    const clocks = svg.candidates.filter((c) => c.clock);
    if (clocks.length !== 1) return null;
    fields[clockRole.id] = clocks[0].id;
    matched++;
  }
  for (const [roleId, keys] of strong) {
    const role = recipe.roles.find((r) => r.id === roleId)!;
    if (role.perRow ? keys.size >= (recipe.rows?.min ?? 1) : keys.size > 0) distinctive += keys.size;
  }
  if (distinctive === 0) return null;
  if (recipe.rows && rows.length < recipe.rows.min) return null;
  return { recipe: recipe.id, rows, fields, layers: bound, distinctive, matched };
}

/** The best proposal over every recipe, or null - the common case, and the default. */
export function bestProposal(svg: SvgImportResult): ProposedBinding | null {
  let best: ProposedBinding | null = null;
  for (const recipe of BEHAVIOUR_RECIPES) {
    // An instanced recipe is proposed from its PREFIX (`proposeExtras`), never from evidence.
    if (recipe.instanced) continue;
    const proposal = proposeBinding(svg, recipe);
    if (!proposal) continue;
    if (!best || proposal.distinctive > best.distinctive || (proposal.distinctive === best.distinctive && proposal.matched > best.matched)) {
      best = proposal;
    }
  }
  return best;
}

/** A hidden layer's explicit role, from the two prefixes the docs teach (§3c): `show:Sponsor` is a
 *  switch named Sponsor; `choice:Status/Live` is the Live option of a choice named Status. */
export type ExtraPrefix = { kind: 'switch'; name: string } | { kind: 'choice'; group: string; option: string };

export function extraPrefixOf(label: string): ExtraPrefix | null {
  const show = /^show:\s*(.+)$/i.exec(label.trim());
  if (show && show[1].trim()) return { kind: 'switch', name: show[1].trim() };
  const choice = /^choice:\s*([^/]+)\/(.+)$/i.exec(label.trim());
  if (choice && choice[1].trim() && choice[2].trim()) return { kind: 'choice', group: choice[1].trim(), option: choice[2].trim() };
  return null;
}

/** The switches and choices the layer names declare outright - every hidden group whose name
 *  carries a prefix. Never required: the mapping step offers the same two answers on every
 *  hidden layer that no recipe claimed. */
export function proposeExtras(svg: SvgImportResult): { candidateId: string; prefix: ExtraPrefix }[] {
  return svg.groups.flatMap((g) => {
    const prefix = extraPrefixOf(g.label);
    return prefix ? [{ candidateId: g.id, prefix }] : [];
  });
}
