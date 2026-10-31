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

/** A plain object: parsed JSON, or a literal. One that inherits from anything else could hand
 *  validation a value it does not own, so it is refused as a shape. */
const isRecord = (v: unknown): v is Rec => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
const COMPONENT_ID = new RegExp(`^[a-z][a-z0-9-]{0,${SVG_PROPOSAL_LIMITS.idChars - 1}}$`);
/** A control character, or a Unicode line or paragraph separator: a title is one line. */
const hasControl = (s: string) => [...s].some((ch) => { const c = ch.codePointAt(0) ?? 0; return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029; });

export function validateSvgProposal(input: unknown, context: SvgProposalContext): SvgProposalVerdict {
  const errors: SvgProposalError[] = [];
  const fail = (code: SvgProposalErrorCode, at: string, detail: string) => { errors.push({ code, at, detail }); };
  const own = (v: Rec, key: string) => Object.prototype.hasOwnProperty.call(v, key);

  /** R6: a key outside the schema is refused, never ignored. */
  const onlyKeys = (v: Rec, at: string, allowed: readonly string[]) => {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) fail('unexpected-key', at, `key "${key.slice(0, SVG_PROPOSAL_LIMITS.idChars)}"`);
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
      if (!known(layer)) fail('unknown-layer', `${at}.layer`, `no layer "${layer}" in the inventory`);
      else if (!candidate && !pictures.has(layer) && !outlines.has(layer)) fail('wrong-layer-kind', `${at}.layer`, `"${layer}" is a drawing, not a text, picture or outline layer`);
      else if (candidate?.outsideCanvas && field.on) fail('wrong-layer-kind', `${at}.layer`, `"${layer}" lies outside the artboard and stays artwork`);
    }
    // R6 + R4: the kind belongs to text candidates; a countdown needs a clock-shaped one.
    if (own(raw, 'kind')) {
      if (raw.kind !== 'text' && raw.kind !== 'countdown') fail('invalid-value', `${at}.kind`, 'expected text or countdown');
      else if (layer !== null && known(layer) && !candidate) fail('invalid-value', `${at}.kind`, 'only a text layer has a kind');
      else {
        field.kind = raw.kind;
        if (raw.kind === 'countdown') {
          if (!allowed.has(COUNTDOWN_CAPABILITY)) fail('unsupported-capability', `${at}.kind`, COUNTDOWN_CAPABILITY);
          else if (candidate && !candidate.clock) fail('unsupported-capability', `${at}.kind`, `"${layer}" is not clock-shaped`);
          if (field.on) countdowns += 1;
        }
      }
    } else if (candidate) fail('invalid-value', `${at}.kind`, 'a text layer needs its kind');
    if (own(raw, 'title')) {
      const t = raw.title;
      if (typeof t !== 'string' || t.trim().length === 0 || t.length > SVG_PROPOSAL_LIMITS.titleChars || hasControl(t)) {
        fail('invalid-value', `${at}.title`, `expected one line of at most ${SVG_PROPOSAL_LIMITS.titleChars} characters`);
      } else field.title = t;
    }
    // R3: one decision per layer.
    if (layer !== null) {
      if (decision.has(layer)) fail('conflicting-ownership', `${at}.layer`, `"${layer}" is decided twice`);
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
  let fullRecipes: string[] = [];
  list(input.components, 'components', SVG_PROPOSAL_LIMITS.components).forEach((raw, ci) => {
    const at = `components[${ci}]`;
    if (!isRecord(raw)) { fail('invalid-shape', at, 'expected an object'); return; }
    onlyKeys(raw, at, ['id', 'recipe', 'picks', 'intent']);
    let cid = '';
    if (typeof raw.id !== 'string' || !COMPONENT_ID.test(raw.id)) fail('invalid-value', `${at}.id`, 'expected a lower-case id');
    else if (componentIds.has(raw.id)) fail('duplicate-component', `${at}.id`, `"${raw.id}" is used twice`);
    else { cid = raw.id; componentIds.add(cid); }

    // R4: the recipe must be declared and allowed.
    const recipeId = idString(raw.recipe, `${at}.recipe`);
    const roles = recipeId !== null && Object.prototype.hasOwnProperty.call(context.recipes, recipeId) ? context.recipes[recipeId] : undefined;
    if (recipeId !== null) {
      if (!roles) fail('unsupported-capability', `${at}.recipe`, `no recipe "${recipeId}"`);
      else if (!allowed.has(recipeId)) fail('unsupported-capability', `${at}.recipe`, recipeId);
      else if (!roles.instanced) fullRecipes = [...fullRecipes, recipeId];
    }

    const picks: SvgProposalPick[] = [];
    list(raw.picks, `${at}.picks`, SVG_PROPOSAL_LIMITS.picks).forEach((p, pi) => {
      const pat = `${at}.picks[${pi}]`;
      if (!isRecord(p)) { fail('invalid-shape', pat, 'expected an object'); return; }
      onlyKeys(p, pat, ['role', 'layer', 'row']);
      const roleId = idString(p.role, `${pat}.role`);
      const layer = idString(p.layer, `${pat}.layer`);
      const pick: SvgProposalPick = { role: roleId ?? '', layer: layer ?? '' };
      const role = roleId !== null && roles && Object.prototype.hasOwnProperty.call(roles.roles, roleId) ? roles.roles[roleId] : undefined;
      if (roleId !== null && roles && !role) fail('unknown-role', `${pat}.role`, `"${recipeId}" declares no role "${roleId}"`);
      // R1: a per-row role takes a row inside the recipe's limit; a graphic-level one none.
      if (own(p, 'row')) {
        const max = roles?.rowsMax ?? 0;
        if (!Number.isInteger(p.row) || (p.row as number) < 0 || (p.row as number) >= max) fail('invalid-value', `${pat}.row`, `expected a row below ${max}`);
        else if (role && !role.perRow) fail('invalid-value', `${pat}.row`, `"${roleId}" is not a per-row role`);
        else pick.row = p.row as number;
      } else if (role?.perRow) fail('invalid-value', `${pat}.row`, `"${roleId}" needs its row`);
      if (layer !== null) {
        // R1: the layer exists and suits the role's pool.
        const pool = role?.pool ?? (role?.kind === 'field' ? 'text' : undefined);
        if (!known(layer)) fail('unknown-layer', `${pat}.layer`, `no layer "${layer}" in the inventory`);
        else if (pool === 'text' && !text.has(layer)) fail('wrong-layer-kind', `${pat}.layer`, `"${roleId}" takes a text layer`);
        else if (pool === 'drawn' && !drawn.has(layer)) fail('wrong-layer-kind', `${pat}.layer`, `"${roleId}" takes a group or shape`);
        else if (text.get(layer)?.outsideCanvas) fail('wrong-layer-kind', `${pat}.layer`, `"${layer}" lies outside the artboard and stays artwork`);
        // R3: one claim per layer across every component and role.
        const claim = `${cid || at}/${roleId ?? '?'}${pick.row === undefined ? '' : `#${pick.row}`}`;
        const earlier = claimedBy.get(layer);
        if (earlier) fail('conflicting-ownership', `${pat}.layer`, `"${layer}" is claimed by ${earlier} and ${claim}`);
        else claimedBy.set(layer, claim);
        // R3: the role's kind says whether the layer is also an operator field.
        const d = decision.get(layer);
        if (role?.kind === 'field' && d && !d.on) fail('conflicting-ownership', `${pat}.layer`, `"${roleId}" is an operator field but "${layer}" is decided off`);
        if (role?.kind === 'layer' && d?.on && text.has(layer)) fail('conflicting-ownership', `${pat}.layer`, `"${roleId}" is a display target but "${layer}" is decided an operator field`);
      }
      picks.push(pick);
    });

    // R5 + R4: every intent key present, each a listed value, each specific one allowed.
    const keys = recipeId !== null && Object.prototype.hasOwnProperty.call(SVG_INTENT, recipeId) ? SVG_INTENT[recipeId] : {};
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
        else if (value !== 'default' && recipeId !== null && !allowed.has(intentCapability(recipeId, key, value))) {
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
