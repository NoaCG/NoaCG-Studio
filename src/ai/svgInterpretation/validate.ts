// Is this SVG proposal usable at all? (docs/work-specs/jev-svg-import/spec.md, row 4, AC-4)
//
// One pure function. It reads the proposal, the reader's inventory, the recipe role table and the
// capabilities the caller allows, and answers ALL OR NOTHING: accepted, with a normalized copy, or
// refused, with every error found. The rules are R1-R7 in
// docs/work-specs/jev-svg-import/evidence/phase-04.md; each check below names the one it enforces.
//
// It never reads the inventory's TEXT - samples, labels - only ids, kinds and flags, so what the
// artwork's words say cannot change the verdict (R6). It never fills a missing decision (R5) and
// never mutates its inputs (R7).

import {
  COUNTDOWN_CAPABILITY,
  RECIPE_DEFAULT,
  SVG_INTENT,
  SVG_PROPOSAL_LIMITS,
  SVG_PROPOSAL_VERSION,
  SVG_UNSUPPORTED_INTENT,
  UNRESOLVED,
  intentCapability,
  svgSourceRevision,
  type SvgProposal,
  type SvgProposalComponent,
  type SvgProposalContext,
  type SvgProposalError,
  type SvgProposalErrorCode,
  type SvgProposalField,
  type SvgProposalPick,
  type SvgProposalVerdict,
  type SvgUnresolvedIntent,
} from './contract.ts';

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const COMPONENT_ID = new RegExp(`^[a-z][a-z0-9-]{0,${SVG_PROPOSAL_LIMITS.idChars - 1}}$`);
/** A control or format character (bidi overrides, zero-width marks) or a line or paragraph
 *  separator: a title is one plain line that reads as it renders. */
const UNPLAIN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
/** What an error may repeat of the proposal: a value shaped like an id, nothing else. */
const ID_SHAPED = /^[A-Za-z0-9._:-]{1,32}$/;
const name = (v: string | null) => (v !== null && ID_SHAPED.test(v) ? `"${v}"` : '(not an id)');

export function validateSvgProposal(submitted: unknown, context: SvgProposalContext): SvgProposalVerdict {
  const errors: SvgProposalError[] = [];
  const fail = (code: SvgProposalErrorCode, at: string, detail: string) => { errors.push({ code, at, detail }); };

  /** R6: a key outside the schema is refused, never ignored. */
  const onlyKeys = (v: Rec, at: string, allowed: readonly string[]) => {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) fail('unexpected-key', at, `key ${name(key)}`);
  };
  const idString = (v: unknown, at: string): string | null => {
    if (typeof v !== 'string' || v.length === 0 || v.length > SVG_PROPOSAL_LIMITS.idChars) {
      fail('invalid-value', at, 'expected a non-empty id');
      return null;
    }
    return v;
  };
  const list = (v: unknown, at: string, max: number): unknown[] => {
    if (!Array.isArray(v)) { fail('invalid-shape', at, 'expected a list'); return []; }
    if (v.length > max) fail('invalid-value', at, `more than ${max} entries`);
    return v.slice(0, max);
  };

  // R7: validate a plain-data SNAPSHOT, read once. A getter or proxy cannot then answer one way
  // for the check and another for the normalized copy, and an inherited value is never read.
  let input: unknown;
  try {
    input = JSON.parse(JSON.stringify(submitted) ?? 'null');
  } catch {
    input = null;
  }
  if (!isRecord(input)) {
    fail('invalid-shape', '', 'expected an object');
    return { ok: false, errors };
  }
  onlyKeys(input, '', ['version', 'sourceRevision', 'fields', 'components']);
  if (input.version !== SVG_PROPOSAL_VERSION) fail('invalid-value', 'version', `expected ${SVG_PROPOSAL_VERSION}`);

  // R2: the revision is computed here, from the markup the caller holds, never taken from it.
  const current = svgSourceRevision(context.inventory.markup);
  if (typeof input.sourceRevision !== 'string') fail('invalid-shape', 'sourceRevision', 'expected a revision');
  else if (input.sourceRevision !== current) fail('stale-revision', 'sourceRevision', 'made from another revision of this artwork');

  const inv = context.inventory;
  const text = new Map(inv.candidates.map((c) => [c.id, c]));
  const pictures = new Set(inv.images.map((c) => c.id));
  const outlines = new Set(inv.outlines.map((c) => c.id));
  const drawn = new Set([...inv.groups.map((c) => c.id), ...inv.shapes.map((c) => c.id)]);
  const known = (layer: string) => text.has(layer) || pictures.has(layer) || outlines.has(layer) || drawn.has(layer);
  const allowed = new Set(context.capabilities);

  // ---- Field decisions ----
  const fields: SvgProposalField[] = [];
  const decision = new Map<string, SvgProposalField>();
  let countdowns = 0;
  list(input.fields, 'fields', SVG_PROPOSAL_LIMITS.fields).forEach((raw, i) => {
    const at = `fields[${i}]`;
    if (!isRecord(raw)) { fail('invalid-shape', at, 'expected an object'); return; }
    onlyKeys(raw, at, ['layer', 'on', 'kind', 'title']);
    const layer = idString(raw.layer, `${at}.layer`);
    if (typeof raw.on !== 'boolean') fail('invalid-value', `${at}.on`, 'expected true or false');
    const field: SvgProposalField = { layer: layer ?? '', on: raw.on === true };
    const candidate = layer === null ? undefined : text.get(layer);
    // R1: a field decision names a text, picture or outline candidate.
    if (layer !== null) {
      if (!known(layer)) fail('unknown-layer', `${at}.layer`, `no layer ${name(layer)} in the inventory`);
      else if (!candidate && !pictures.has(layer) && !outlines.has(layer)) fail('wrong-layer-kind', `${at}.layer`, `${name(layer)} is a drawing, not a text, picture or outline layer`);
      else if (candidate?.outsideCanvas && field.on) fail('wrong-layer-kind', `${at}.layer`, `${name(layer)} lies outside the artboard and stays artwork`);
    }
    // R6 + R4: the kind belongs to text candidates; a countdown needs a clock-shaped one.
    if (own(raw, 'kind')) {
      if (raw.kind !== 'text' && raw.kind !== 'countdown') fail('invalid-value', `${at}.kind`, 'expected text or countdown');
      else if (layer !== null && known(layer) && !candidate) fail('invalid-value', `${at}.kind`, 'only a text layer has a kind');
      else {
        field.kind = raw.kind;
        if (raw.kind === 'countdown') {
          if (!allowed.has(COUNTDOWN_CAPABILITY)) fail('unsupported-capability', `${at}.kind`, COUNTDOWN_CAPABILITY);
          else if (candidate && !candidate.clock) fail('unsupported-capability', `${at}.kind`, `${name(layer)} is not clock-shaped`);
          if (field.on) countdowns += 1;
        }
      }
    } else if (candidate) fail('invalid-value', `${at}.kind`, 'a text layer needs its kind');
    if (own(raw, 'title')) {
      const t = raw.title;
      if (typeof t !== 'string' || t.trim().length === 0 || t.length > SVG_PROPOSAL_LIMITS.titleChars || UNPLAIN.test(t)) {
        fail('invalid-value', `${at}.title`, `expected one line of at most ${SVG_PROPOSAL_LIMITS.titleChars} characters`);
      } else field.title = t;
    }
    // R3: one decision per layer.
    if (layer !== null) {
      if (decision.has(layer)) fail('conflicting-ownership', `${at}.layer`, `${name(layer)} is decided twice`);
      else decision.set(layer, field);
    }
    fields.push(field);
  });
  // R3: one countdown per graphic - the shared clock runtime drives one display.
  if (countdowns > 1) fail('conflicting-ownership', 'fields', `${countdowns} countdown fields; one graphic drives one`);

  // ---- Components ----
  const components: SvgProposalComponent[] = [];
  const unresolved: SvgUnresolvedIntent[] = [];
  const componentIds = new Set<string>();
  const claimedBy = new Map<string, string>();
  const fullRecipes: string[] = [];
  list(input.components, 'components', SVG_PROPOSAL_LIMITS.components).forEach((raw, ci) => {
    const at = `components[${ci}]`;
    if (!isRecord(raw)) { fail('invalid-shape', at, 'expected an object'); return; }
    onlyKeys(raw, at, ['id', 'recipe', 'picks', 'intent']);
    let cid = '';
    if (typeof raw.id !== 'string' || !COMPONENT_ID.test(raw.id)) fail('invalid-value', `${at}.id`, 'expected a lower-case id');
    else if (componentIds.has(raw.id)) fail('duplicate-component', `${at}.id`, `${name(raw.id)} is used twice`);
    else { cid = raw.id; componentIds.add(cid); }

    // R4: the recipe must be declared and allowed.
    const recipeId = idString(raw.recipe, `${at}.recipe`);
    const roles = recipeId !== null && own(context.recipes, recipeId) ? context.recipes[recipeId] : undefined;
    if (recipeId !== null) {
      if (!roles) fail('unsupported-capability', `${at}.recipe`, `no recipe ${name(recipeId)}`);
      else if (!allowed.has(recipeId)) fail('unsupported-capability', `${at}.recipe`, name(recipeId));
      else if (!roles.instanced) fullRecipes.push(recipeId);
    }

    const picks: SvgProposalPick[] = [];
    const slots = new Set<string>();
    list(raw.picks, `${at}.picks`, SVG_PROPOSAL_LIMITS.picks).forEach((p, pi) => {
      const pat = `${at}.picks[${pi}]`;
      if (!isRecord(p)) { fail('invalid-shape', pat, 'expected an object'); return; }
      onlyKeys(p, pat, ['role', 'layer', 'row']);
      const roleId = idString(p.role, `${pat}.role`);
      const layer = idString(p.layer, `${pat}.layer`);
      const pick: SvgProposalPick = { role: roleId ?? '', layer: layer ?? '' };
      const role = roleId !== null && roles && own(roles.roles, roleId) ? roles.roles[roleId] : undefined;
      if (roleId !== null && roles && !role) fail('unknown-role', `${pat}.role`, `${name(recipeId)} declares no role ${name(roleId)}`);
      // R1: a per-row role takes a row inside the recipe's limit; a graphic-level one none.
      if (own(p, 'row')) {
        const max = Math.min(roles?.rowsMax ?? 0, SVG_PROPOSAL_LIMITS.rows);
        const row = p.row;
        if (typeof row !== 'number' || !Number.isInteger(row) || row < 0 || row >= max) fail('invalid-value', `${pat}.row`, `expected a row below ${max}`);
        else if (role && !role.perRow) fail('invalid-value', `${pat}.row`, `${name(roleId)} is not a per-row role`);
        else pick.row = row;
      } else if (role?.perRow) fail('invalid-value', `${pat}.row`, `${name(roleId)} needs its row`);
      if (layer !== null) {
        // R1: the layer exists and suits the role's pool.
        const pool = role?.pool ?? (role?.kind === 'field' ? 'text' : undefined);
        if (!known(layer)) fail('unknown-layer', `${pat}.layer`, `no layer ${name(layer)} in the inventory`);
        else if (pool === 'text' && !text.has(layer)) fail('wrong-layer-kind', `${pat}.layer`, `${name(roleId)} takes a text layer`);
        else if (pool === 'drawn' && !drawn.has(layer)) fail('wrong-layer-kind', `${pat}.layer`, `${name(roleId)} takes a group or shape`);
        else if (text.get(layer)?.outsideCanvas) fail('wrong-layer-kind', `${pat}.layer`, `${name(layer)} lies outside the artboard and stays artwork`);
        // R3: one claim per layer across every component and role.
        const claim = `${cid || at}/${name(roleId)}${pick.row === undefined ? '' : `#${pick.row}`}`;
        const earlier = claimedBy.get(layer);
        if (earlier) fail('conflicting-ownership', `${pat}.layer`, `${name(layer)} is claimed by ${earlier} and ${claim}`);
        else claimedBy.set(layer, claim);
        // R3: the role's kind says whether the layer is also an operator field.
        const d = decision.get(layer);
        if (role?.kind === 'field' && d && !d.on) fail('conflicting-ownership', `${pat}.layer`, `${name(roleId)} is an operator field but ${name(layer)} is decided off`);
        if (role?.kind === 'field' && !role.countdown && d?.kind === 'countdown') fail('conflicting-ownership', `${pat}.layer`, `${name(roleId)} writes a field but ${name(layer)} is the countdown readout`);
        if (role?.countdown && d?.kind !== 'countdown') fail('conflicting-ownership', `${pat}.layer`, `${name(roleId)} is the countdown readout but ${name(layer)} is not decided a countdown`);
        if (role?.kind === 'layer' && d?.on && text.has(layer)) fail('conflicting-ownership', `${pat}.layer`, `${name(roleId)} is a display target but ${name(layer)} is decided an operator field`);
      }
      // R3: one layer per (role, row) slot.
      if (role) {
        const slot = `${roleId}#${pick.row ?? ''}`;
        if (slots.has(slot)) fail('conflicting-ownership', pat, `${name(roleId)}${pick.row === undefined ? '' : ` row ${pick.row}`} is bound twice`);
        slots.add(slot);
      }
      picks.push(pick);
    });

    // R5 + R4: every intent key present, each a listed value, each specific one allowed.
    const keys = recipeId !== null && own(SVG_INTENT, recipeId) ? SVG_INTENT[recipeId] : {};
    const intent: Record<string, string> = {};
    if (!isRecord(raw.intent)) fail('invalid-shape', `${at}.intent`, 'expected an object');
    else {
      onlyKeys(raw.intent, `${at}.intent`, Object.keys(keys));
      for (const [key, values] of Object.entries(keys)) {
        const value = own(raw.intent, key) ? raw.intent[key] : undefined;
        if (value === undefined) { fail('missing-intent', `${at}.intent.${key}`, `"${key}" is undecided only when it says ${UNRESOLVED}`); continue; }
        if (typeof value !== 'string' || !values.includes(value)) { fail('invalid-value', `${at}.intent.${key}`, `expected one of ${values.join(', ')}`); continue; }
        intent[key] = value;
        if (value === UNRESOLVED) unresolved.push({ component: cid, key });
        else if (value !== RECIPE_DEFAULT && recipeId !== null && !allowed.has(intentCapability(recipeId, key, value))) {
          fail('unsupported-capability', `${at}.intent.${key}`, intentCapability(recipeId, key, value));
        }
      }
      for (const rule of SVG_UNSUPPORTED_INTENT) {
        if (rule.recipe === recipeId && Object.entries(rule.when).every(([k, v]) => intent[k] === v)) {
          fail('unsupported-capability', `${at}.intent`, Object.entries(rule.when).map(([k, v]) => intentCapability(rule.recipe, k, v)).join(' with '));
        }
      }
    }
    components.push({ id: cid, recipe: recipeId ?? '', picks, intent });
  });
  // R3: the existing one-full-recipe guard.
  if (fullRecipes.length > 1) fail('conflicting-ownership', 'components', `${fullRecipes.join(', ')}: one full recipe per graphic`);

  // R7: all or nothing.
  if (errors.length > 0) return { ok: false, errors };
  const proposal: SvgProposal = { version: SVG_PROPOSAL_VERSION, sourceRevision: current, fields, components };
  return { ok: true, proposal, unresolved };
}
