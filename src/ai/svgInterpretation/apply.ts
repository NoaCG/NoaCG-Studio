// Apply an SVG proposal without overriding the author (docs/work-specs/jev-svg-import/spec.md,
// row 5, AC-4 and AC-5).
//
// One pure function over a NEUTRAL view of the import draft: per layer row its `on`, `kind` and
// `title`, and the behaviour as one proposal component. The draft itself (src/components/wizard/
// import/draft.ts) builds that view, calls this, and writes back what it returns; the layer rules
// keep src/ai from importing the wizard, so the draft's shapes never cross in here. The rules are
// A1-A11 in docs/work-specs/jev-svg-import/evidence/phase-05.md; each step below names its rule.
//
// THREE VIEWS. `current` is the draft as it stands. `reference` is what the last accepted apply
// left as the proposal's, or what the drop gave: a current value equal to its reference is
// untouched, any other is a correction, and a correction always wins (A3, A4). The result lists
// the values to write, the reference to keep, the open intent keys and the corrections that won.

import { BEHAVIOUR_RECIPES } from '../../templates/behaviours/registry';
import {
  COUNTDOWN_CAPABILITY,
  intentCapability,
  type SvgProposalComponent,
  type SvgProposalError,
  type SvgProposalInventory,
  type SvgRecipeRoles,
  type SvgUnresolvedIntent,
} from './contract.ts';
import { validateSvgProposal } from './validate.ts';

/** One layer row of the draft, as a proposal decides it. `kind` is present on text rows only. */
export interface SvgRowAnswer {
  on: boolean;
  kind?: 'text' | 'countdown';
  title: string;
}

export interface SvgAnswers {
  /** Every text, picture and outline row, by layer id. */
  rows: Readonly<Record<string, SvgRowAnswer>>;
  /** The behaviour as one component, or null for none. */
  component: SvgProposalComponent | null;
}

/** One value to write on one row. */
export interface SvgRowWrite {
  layer: string;
  attr: keyof SvgRowAnswer;
  value: SvgRowAnswer[keyof SvgRowAnswer];
}

export interface SvgApplyInput {
  inventory: SvgProposalInventory;
  current: SvgAnswers;
  /** Per row, the value that is the proposal's rather than a correction (A3). */
  reference: Readonly<Record<string, SvgRowAnswer>>;
  /** The behaviour differs from its reference. Decided by the draft on its own shapes, because
   *  a recipe option the component cannot express (an unticked Lock) is still a correction. */
  behaviourCorrected: boolean;
  /** The intent keys the reference left open. */
  open: readonly SvgUnresolvedIntent[];
  /** Defaults to what today's draft can hold (A2). */
  capabilities?: readonly string[];
}

export type SvgApplyResult =
  | {
      ok: true;
      writes: SvgRowWrite[];
      /** The behaviour to hold: the proposal's (possibly with picks a correction refused), or
       *  null with `replaceBehaviour` false when the author's stays. */
      component: SvgProposalComponent | null;
      replaceBehaviour: boolean;
      /** One past the highest row the proposal picked, so a row whose only pick gave way to a
       *  correction stays as an empty row rather than vanishing. */
      rowCount: number;
      /** The rows' reference after this apply: each written value, each corrected value's old
       *  reference. */
      referenceRows: Record<string, SvgRowAnswer>;
      /** The intent keys still open (A8). */
      decisions: SvgUnresolvedIntent[];
      /** The corrections that won over the proposal: `t0.on`, `behaviour`. */
      kept: string[];
    }
  | { ok: false; errors: SvgProposalError[] };

/** The recipe role table, from the recipe declarations (src/templates/behaviours), so the
 *  contract never copies them. Built once: the registry is fixed at load. */
export const SVG_RECIPE_ROLES: Readonly<Record<string, SvgRecipeRoles>> = Object.fromEntries(BEHAVIOUR_RECIPES.map((r) => [r.id, {
    ...(r.instanced ? { instanced: true } : {}),
    ...(r.rows ? { rowsMax: r.rows.max } : {}),
    roles: Object.fromEntries(r.roles.map((role) => [role.id, {
      kind: role.kind,
      ...(role.pool ? { pool: role.pool } : {}),
      ...(role.perRow ? { perRow: true } : {}),
      ...(role.countdown ? { countdown: true } : {}),
    }])),
  }]));

/** A2: what today's draft can hold. One behaviour, so only full recipes; the countdown field;
 *  the quiz's existing Lock and reveal options. */
export const SVG_DRAFT_CAPABILITIES: readonly string[] = [
  ...BEHAVIOUR_RECIPES.filter((r) => !r.instanced).map((r) => r.id),
  COUNTDOWN_CAPABILITY,
  intentCapability('quiz', 'lock', 'lock'),
  intentCapability('quiz', 'reveal', 'manual'),
  intentCapability('quiz', 'reveal', 'automatic'),
];

const ATTRS = ['on', 'kind', 'title'] as const;

const set = (rows: Record<string, SvgRowAnswer>, layer: string, attr: keyof SvgRowAnswer, value: unknown) => {
  (rows[layer] as unknown as Record<string, unknown>)[attr] = value;
};

export function applySvgProposal(proposal: unknown, input: SvgApplyInput): SvgApplyResult {
  const recipes = SVG_RECIPE_ROLES;
  // A1: row 4's validator decides whether the proposal may be used at all.
  const verdict = validateSvgProposal(proposal, {
    inventory: input.inventory,
    recipes,
    capabilities: input.capabilities ?? SVG_DRAFT_CAPABILITIES,
  });
  if (!verdict.ok) return verdict;
  // A2: the draft holds one behaviour. Only full recipes are offered, so the validator's
  // one-full-recipe guard has already refused a second component.
  const accepted = verdict.proposal;

  const { current, reference } = input;
  const next: Record<string, SvgRowAnswer> = Object.fromEntries(Object.entries(current.rows).map(([id, r]) => [id, { ...r }]));
  const nextRef: Record<string, SvgRowAnswer> = Object.fromEntries(Object.entries(reference).map(([id, r]) => [id, { ...r }]));
  const kept = new Set<string>();
  /** `layer.attr` values the proposal wrote. */
  const taken = new Set<string>();
  const corrected = (layer: string, attr: keyof SvgRowAnswer) => current.rows[layer]?.[attr] !== reference[layer]?.[attr];

  // A4: per value, the proposal writes only what is untouched.
  for (const [i, d] of accepted.fields.entries()) {
    const row = current.rows[d.layer];
    if (!row || !reference[d.layer]) {
      return { ok: false, errors: [{ code: 'unknown-layer', at: `fields[${i}].layer`, detail: 'the draft holds no row for this layer' }] };
    }
    for (const attr of ATTRS) {
      const value = d[attr];
      if (value === undefined) continue;
      if (corrected(d.layer, attr)) {
        if (row[attr] !== value) kept.add(`${d.layer}.${attr}`);
        continue;
      }
      set(next, d.layer, attr, value);
      set(nextRef, d.layer, attr, value);
      taken.add(`${d.layer}.${attr}`);
    }
  }
  /** Put a value the proposal wrote back to what the draft held, because a correction wins. */
  const revert = (layer: string, attr: keyof SvgRowAnswer) => {
    set(next, layer, attr, current.rows[layer][attr]);
    set(nextRef, layer, attr, reference[layer][attr]);
    taken.delete(`${layer}.${attr}`);
  };

  // A5: the behaviour is one answer, replaced only when untouched.
  const replaceBehaviour = !input.behaviourCorrected;
  const proposed = accepted.components[0] ?? null;
  if (!replaceBehaviour && !sameComponent(proposed, current.component)) kept.add('behaviour');
  const active = replaceBehaviour ? proposed : current.component;

  // A7: a proposal pick or decision never fights a kept correction.
  let picks = active?.picks ?? [];
  if (active) {
    const roles = recipes[active.recipe]?.roles ?? {};
    const text = new Set(input.inventory.candidates.map((c) => c.id));
    picks = picks.filter((pick) => {
      const role = roles[pick.role];
      const row = next[pick.layer];
      if (!role || !row) return true;
      // Which attribute the pick needs, and whether the row's value conflicts with it.
      const needs: { attr: 'on' | 'kind'; bad: boolean }[] = [];
      if (role.kind === 'field' && !role.countdown) needs.push({ attr: 'on', bad: !row.on }, { attr: 'kind', bad: row.kind === 'countdown' });
      if (role.countdown) needs.push({ attr: 'kind', bad: row.kind !== 'countdown' });
      if (role.kind === 'layer' && text.has(pick.layer)) needs.push({ attr: 'on', bad: row.on });
      for (const { attr, bad } of needs) {
        if (!bad) continue;
        if (replaceBehaviour && corrected(pick.layer, attr)) {
          // The pick is the proposal's and the row's value is the author's: the pick goes.
          kept.add(`${pick.layer}.${attr}`);
          return false;
        }
        if (!replaceBehaviour && taken.has(`${pick.layer}.${attr}`)) {
          // The pick is the author's and the value the proposal's: the value goes.
          revert(pick.layer, attr);
          kept.add('behaviour');
        }
      }
      return true;
    });
  }

  // A6: one ticked countdown, checked last, after A7 may have put an author's back. The
  // proposal's countdown gives way to a kept one.
  const countdowns = () => Object.keys(next).filter((id) => next[id].on && next[id].kind === 'countdown');
  for (let rows = countdowns(); rows.length > 1; rows = countdowns()) {
    const theirs = rows.find((id) => taken.has(`${id}.kind`) || taken.has(`${id}.on`));
    if (!theirs) break;
    revert(theirs, taken.has(`${theirs}.kind`) ? 'kind' : 'on');
    for (const id of rows) if (id !== theirs && !taken.has(`${id}.kind`)) kept.add(`${id}.kind`);
  }

  const writes: SvgRowWrite[] = [];
  for (const key of taken) {
    const dot = key.lastIndexOf('.');
    const layer = key.slice(0, dot);
    const attr = key.slice(dot + 1) as keyof SvgRowAnswer;
    // Every value the proposal holds, changed or not: replacing the behaviour may disarm a
    // countdown the proposal keeps, and the draft writes it back (A6).
    writes.push({ layer, attr, value: next[layer][attr] });
  }
  return {
    ok: true,
    writes,
    component: replaceBehaviour && active ? { ...active, picks } : replaceBehaviour ? null : current.component,
    replaceBehaviour,
    rowCount: (active?.picks ?? []).reduce((n, p) => (p.row === undefined ? n : Math.max(n, p.row + 1)), 0),
    referenceRows: nextRef,
    // A8: the open keys are the proposal's when its behaviour is held, the reference's otherwise.
    decisions: replaceBehaviour ? verdict.unresolved.map((u) => ({ ...u })) : input.open.map((u) => ({ ...u })),
    kept: [...kept].sort(),
  };
}

/** Two components say the same thing: one recipe, the same picks in any order, the same intent.
 *  The id is the proposer's own name for it. */
function sameComponent(a: SvgProposalComponent | null, b: SvgProposalComponent | null): boolean {
  if (!a || !b) return a === b;
  const picks = (c: SvgProposalComponent) => c.picks.map((p) => `${p.role}#${p.row ?? ''}=${p.layer}`).sort().join(' ');
  const intent = (c: SvgProposalComponent) => Object.entries(c.intent).map(([k, v]) => `${k}=${v}`).sort().join(' ');
  return a.recipe === b.recipe && picks(a) === picks(b) && intent(a) === intent(b);
}
