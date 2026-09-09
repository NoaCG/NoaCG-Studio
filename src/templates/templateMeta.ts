// DERIVED template metadata — the computed bulk of the discovery facets
// (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §11). Never hand-written: everything here is read
// off canonical sources (the compiled field schema, the type registry, the pack config,
// the preset motion table) and memoized per variant. The declared sliver it layers over
// lives in meta.ts.

import { DATA_FTYPES, type SpxField } from '../model/types';
import type { TemplateVariant } from '../model/wizard';
import { CATEGORIES } from '../model/wizard';
import type { StyleTag } from '../model/fonts';
import {
  ALIASES,
  CATEGORY_GROUP_OF,
  CATEGORY_GROUPS,
  COVERAGE_PLACEMENTS,
  FORMATS,
  GRAPHIC_CATEGORIES,
  graphicCategoryById,
  normalizeSearchText,
  OCCASIONS,
  PRESET_MOTION,
  type CapabilityId,
  type CategoryGroupId,
  type Complexity,
  type CoverageClass,
  type FieldSemantic,
  type GraphicCategoryId,
  type MotionIntensity,
  type MotionStyleId,
  type OccasionId,
  type PlacementId,
  type ProgrammeFamilyId,
  type ProgrammeFormatId,
} from '../model/taxonomy';
import {
  CATEGORY_DEFAULT_META,
  HIDDEN_CONFIG_FIELDS,
  SPEED_FIELD_TITLE_SET,
  TYPE_META,
  TYPE_OCCASIONS,
  VARIANT_META,
  VARIANT_OCCASIONS,
  type DeclaredTemplateMeta,
} from './meta';
import { PACKS } from './packs';
import { formatsBySheetName } from '../model/taxonomy';
import { variantsFor } from './catalog';

export interface FieldCounts {
  /** Operator-facing content fields — what the Browse buckets count (proposal §6.1). */
  visible: number;
  /** Everything operator-editable, hidden config inputs included. */
  total: number;
  text: number;
  number: number;
  image: number;
  logo: number;
  choice: number;
  repeating: number;
  /** Reachable visible-field range [min, max] — bucket matching is range intersection. */
  visibleRange: [number, number];
}

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: GraphicCategoryId;
  subtype?: string;
  structures: DeclaredTemplateMeta['structures'];
  coverage: CoverageClass;
  programmeFormats: ProgrammeFormatId[];
  programmeFamilies: ProgrammeFamilyId[];
  /** The moments this design is FOR (facet I). Empty for anything undeclared, which is most of
   *  the catalog and is not a defect — see the tables in meta.ts. */
  occasions: OccasionId[];
  fieldSchema: SpxField[];
  fieldSemantics: FieldSemantic[];
  fieldCounts: FieldCounts;
  capabilities: CapabilityId[];
  placements: PlacementId[];
  styleFamily: StyleTag;
  motion: { intensity: MotionIntensity; styles: MotionStyleId[] };
  complexity: Complexity;
}

// ── Declared-meta resolution (proposal §11's order) ─────────────────────────

function declaredFor(variant: TemplateVariant): DeclaredTemplateMeta | null {
  return (
    VARIANT_META[variant.id] ??
    (variant.typeId ? TYPE_META[variant.typeId] : undefined) ??
    CATEGORY_DEFAULT_META[variant.category]
  );
}

/** Facet I's own resolution: the variant's declaration, else its type's, else none. There is
 *  deliberately no category fallback — a category is a FORM, and every design of one form does
 *  not share one moment (half the holding shelf is a front door and half is a sign-off, which is
 *  the confusion this facet was added to end). */
function occasionsFor(variant: TemplateVariant): OccasionId[] {
  return VARIANT_OCCASIONS[variant.id] ?? (variant.typeId ? TYPE_OCCASIONS[variant.typeId] : undefined) ?? [];
}

/** Facet I's ceiling and floor — the two halves of its admission rule a gate can check.
 *  The reasoning behind both numbers is with OCCASIONS in model/taxonomy.ts. */
const MAX_OCCASIONS = 8;
const MIN_DESIGNS_PER_OCCASION = 3;

// ── Programme relevance (proposal §3) ───────────────────────────────────────
//
// A template is relevant to a format if the format's pack contains any TYPE whose graphic
// category matches the template's, or names the template's id in `extras`. Deriving
// through the CATEGORY (not the typeId) is what gives unclaimed hand-written variants the
// same relevance as their typed siblings. `relevance: 'all'` categories match everything,
// ranked below genuine matches by the search layer.

const typeIdsByCategory = new Map<GraphicCategoryId, string[]>();
for (const [typeId, meta] of Object.entries(TYPE_META)) {
  const list = typeIdsByCategory.get(meta.category) ?? [];
  list.push(typeId);
  typeIdsByCategory.set(meta.category, list);
}

function formatIdsForPack(packFormats: string[]): ProgrammeFormatId[] {
  const bySheet = formatsBySheetName();
  const ids: ProgrammeFormatId[] = [];
  for (const sheetName of packFormats) {
    const format = bySheet.get(sheetName);
    if (format) ids.push(format.id);
  }
  return ids;
}

function deriveFormats(variant: TemplateVariant, category: GraphicCategoryId): ProgrammeFormatId[] {
  if (graphicCategoryById(category).relevance === 'all') return FORMATS.map((f) => f.id);
  const categoryTypes = new Set(typeIdsByCategory.get(category) ?? []);
  const ids = new Set<ProgrammeFormatId>();
  for (const pack of PACKS) {
    const viaType = pack.types.some((t) => categoryTypes.has(t));
    const viaExtra = (pack.extras ?? []).includes(variant.id);
    if (viaType || viaExtra) for (const id of formatIdsForPack(pack.formats)) ids.add(id);
  }
  return [...ids];
}

// ── Field counts (proposal §6.1) ────────────────────────────────────────────

function isLogoField(field: SpxField): boolean {
  return field.ftype === 'filelist' && /logo/i.test(field.title);
}

/** The operator's SPEED control — a config input, not a thing the operator writes, so it is out
 *  of the visible-field buckets like the hidden ids beside it (`SPEED_FIELD_TITLES` in meta.ts
 *  says why an id cannot identify it). Without this a two-line marquee browses as "3 fields". */
function isSpeedField(field: SpxField): boolean {
  return field.ftype === 'number' && SPEED_FIELD_TITLE_SET.has(field.title);
}

function deriveFieldCounts(
  variant: TemplateVariant,
  fields: SpxField[],
  capabilities: Set<CapabilityId>,
): FieldCounts {
  const hiddenIds = new Set(HIDDEN_CONFIG_FIELDS[variant.category] ?? []);
  const content = fields.filter(
    (f) => DATA_FTYPES.includes(f.ftype) && !hiddenIds.has(f.field) && !isLogoField(f)
      && !isSpeedField(f),
  );
  const visible = content.length;
  // The reachable range: in the line-based categories the wizard lets lines shrink to 1
  // and grow to maxLines while extras stay constant; fixed-contract categories
  // (scoreboards, versus, quiz, ...) reach exactly what they ship.
  const defaultLines = Math.min(variant.suggestedLines.length, variant.maxLines);
  const growth = Math.max(0, variant.maxLines - defaultLines);
  const shrink = STEP_CATEGORIES.has(variant.category) ? Math.max(0, defaultLines - 1) : 0;
  return {
    visible,
    total: fields.length,
    text: content.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').length,
    number: content.filter((f) => f.ftype === 'number').length,
    image: content.filter((f) => f.ftype === 'filelist').length,
    logo: variant.logo === 'none' ? 0 : 1,
    choice: content.filter((f) => f.ftype === 'dropdown' || f.ftype === 'checkbox' || f.ftype === 'color').length,
    repeating: capabilities.has('repeating') ? 1 : 0,
    visibleRange: [Math.max(1, visible - shrink), visible + growth],
  };
}

// ── Capabilities (proposal §7: derived ∪ declared extras) ───────────────────

const LOOP_PRESETS = new Set(['hold-loop', 'ticker-marquee', 'ticker-flip', 'ticker-rotate', 'credits-crawl']);
const STEP_CATEGORIES = new Set(['lower-third', 'info-card']);

function deriveCapabilities(
  variant: TemplateVariant,
  declared: DeclaredTemplateMeta,
  fields: SpxField[],
): Set<CapabilityId> {
  const caps = new Set<CapabilityId>(declared.extraCapabilities ?? []);
  if (variant.logo !== 'none') caps.add('logo-upload');
  if (fields.some((f) => f.ftype === 'filelist' && !isLogoField(f))) caps.add('image-upload');
  if (STEP_CATEGORIES.has(variant.category) && variant.maxLines > 1) caps.add('multi-step');
  for (const preset of variant.animationPresets) {
    if (LOOP_PRESETS.has(preset)) caps.add('loop');
    if (preset === 'count-up') caps.add('count-up');
    if (preset === 'bars-grow' || preset === 'ring-fill') caps.add('progress');
  }
  return caps;
}

// ── Complexity (proposal §12.4) ─────────────────────────────────────────────

function deriveComplexity(capabilities: Set<CapabilityId>, visible: number): Complexity {
  // Advanced = a real state machine beyond the walk: operator events, quiz branches, or a
  // parallel clock group (pause/resume is the tell). Logo support deliberately does not count.
  if (
    capabilities.has('operator-states') ||
    capabilities.has('quiz-states') ||
    capabilities.has('pause-resume')
  ) {
    return 'advanced';
  }
  if (
    capabilities.has('multi-step') ||
    capabilities.has('countdown') ||
    capabilities.has('count-up') ||
    visible > 3
  ) {
    return 'standard';
  }
  return 'simple';
}

// ── The derivation, memoized per variant id ─────────────────────────────────

const metaCache = new Map<string, TemplateMeta | null>();

/** Compute (or return the cached) discovery metadata for one variant. Returns null for
 *  non-browsable content (imported designs). Calls `variant.create()` once to read the
 *  compiled default field schema — memoized, so the cost is paid on first Browse. */
export function templateMeta(variant: TemplateVariant): TemplateMeta | null {
  const cached = metaCache.get(variant.id);
  if (cached !== undefined) return cached;

  const declared = declaredFor(variant);
  if (!declared) {
    metaCache.set(variant.id, null);
    return null;
  }

  const fields = variant.create().fields;
  const capabilities = deriveCapabilities(variant, declared, fields);
  const fieldCounts = deriveFieldCounts(variant, fields, capabilities);
  const coverage = declared.coverage ?? graphicCategoryById(declared.category).coverage;
  const formats = deriveFormats(variant, declared.category);
  const families = [...new Set(FORMATS.filter((f) => formats.includes(f.id)).map((f) => f.family))];

  // Field semantics: positional array for unclaimed variants; for typed variants the
  // TYPE_META semantic map is authored in the type's field order (lines first, logo last —
  // the same order typeFieldsToSpx enforces), so its values line up positionally too.
  const byKey = declared.semantics ? Object.values(declared.semantics) : [];
  const semantics: FieldSemantic[] = fields.map(
    (_field: SpxField, i: number) => declared.positionalSemantics?.[i] ?? byKey[i] ?? 'description',
  );

  const defaultMotion = PRESET_MOTION[variant.animationPresets[0]];
  const motionStyles = [...new Set(variant.animationPresets.flatMap((p) => PRESET_MOTION[p]?.styles ?? []))];

  const meta: TemplateMeta = {
    id: variant.id,
    name: variant.name,
    description: variant.description,
    category: declared.category,
    subtype: declared.subtype,
    structures: declared.structures,
    coverage,
    programmeFormats: formats,
    programmeFamilies: families,
    occasions: occasionsFor(variant),
    fieldSchema: fields,
    fieldSemantics: semantics,
    fieldCounts,
    capabilities: [...capabilities],
    placements: COVERAGE_PLACEMENTS[coverage],
    styleFamily: variant.styleTag,
    motion: { intensity: defaultMotion?.intensity ?? 'medium', styles: motionStyles },
    complexity: deriveComplexity(capabilities, fieldCounts.visible),
  };
  metaCache.set(variant.id, meta);
  return meta;
}

/** Discovery metadata for every browsable catalog variant, in catalog order. */
export function allTemplateMeta(): { variant: TemplateVariant; meta: TemplateMeta }[] {
  const out: { variant: TemplateVariant; meta: TemplateMeta }[] = [];
  for (const category of CATEGORIES) {
    if (category.group === 'imported') continue;
    for (const variant of variantsFor(category.id)) {
      const meta = templateMeta(variant);
      if (meta) out.push({ variant, meta });
    }
  }
  return out;
}

/**
 * Every problem with the declared taxonomy metadata, as strings (empty = valid) — the
 * factory's meta assertions (proposal §17 stage 2): the format registry must map the pack
 * config's verbatim sheet names 1:1, every browsable variant must resolve a primary
 * category, declared subtypes must come from their category's controlled list, and a
 * positional semantics array must match its variant's compiled schema length (a field
 * insertion fails loudly instead of silently shifting every meaning by one) — and facet I's
 * ADMISSION RULE, which is a gate rather than a paragraph nobody reads (see OCCASIONS).
 */
export function validateTaxonomy(): string[] {
  const problems: string[] = [];
  // Derived ONCE: every check below walks the same catalog, and `allTemplateMeta` rebuilds its
  // array on each call.
  const entries = allTemplateMeta();

  // Category groups: CATEGORY_GROUP_OF is total by type (a category without a shelf is a
  // compile error), so the only runtime failure left is a group id nothing maps to.
  for (const group of CATEGORY_GROUPS) {
    if (group.categories.length === 0) problems.push(`category group "${group.id}" has no member categories`);
  }

  // Format-id ↔ verbatim-sheet bijection against the pack config.
  const bySheet = formatsBySheetName();
  const packSheets = new Set(PACKS.flatMap((p) => p.formats));
  for (const sheet of packSheets) {
    if (!bySheet.has(sheet)) problems.push(`pack format "${sheet}" has no taxonomy format id`);
  }
  for (const format of FORMATS) {
    if (!packSheets.has(format.sheetName)) {
      problems.push(`format "${format.id}" sheetName "${format.sheetName}" is in no pack`);
    }
  }
  if (bySheet.size !== FORMATS.length) problems.push('duplicate sheetName in the format registry');

  // Alias targets cannot invent taxonomy: every subtype an alias boosts must be a real
  // controlled subtype id (the same rule the category/structure/format targets already obey
  // by their union types — subtypes are plain strings, so they need an explicit check).
  const knownSubtypes = new Set(GRAPHIC_CATEGORIES.flatMap((c) => c.subtypes));
  for (const [alias, targets] of Object.entries(ALIASES)) {
    for (const sub of targets.subtypes ?? []) {
      if (!knownSubtypes.has(sub)) problems.push(`alias "${alias}": subtype "${sub}" is not a known subtype id`);
    }
  }

  // Facet I's rule, enforced. The vocabulary is only worth having while it stays a closed,
  // small list of real moments, so the two halves of the rule that a machine CAN check are
  // checked: the ceiling, and the three-design floor under every value. Prose alone would have
  // let the list grow one plausible word at a time into the free text the facet model refuses.
  if (OCCASIONS.length > MAX_OCCASIONS) {
    problems.push(`${OCCASIONS.length} occasions declared; the ceiling is ${MAX_OCCASIONS} (see OCCASIONS)`);
  }
  const occasionUse = new Map<OccasionId, number>(OCCASIONS.map((occasion) => [occasion.id, 0]));
  const browsableIds = new Set<string>();
  const compiledTypeIds = new Set<string>();
  for (const { variant, meta } of entries) {
    browsableIds.add(variant.id);
    if (variant.typeId) compiledTypeIds.add(variant.typeId);
    for (const id of meta.occasions) occasionUse.set(id, (occasionUse.get(id) ?? 0) + 1);
  }
  // A declaration for an id no browsable variant has is a typo that would otherwise declare
  // nothing at all, silently — the loudest possible failure mode for a table of ids.
  for (const id of Object.keys(VARIANT_OCCASIONS)) {
    if (!browsableIds.has(id)) problems.push(`VARIANT_OCCASIONS declares "${id}", which is not a browsable variant`);
  }
  // The same check on the type table, and it is the more dangerous of the two: a typo'd typeId
  // silently strips the occasion from every design that type compiles, and the three-design floor
  // can still pass on the hand-declared variants beside them — so the only symptom would be four
  // sign-off cards quietly missing from a "goodbye" search.
  for (const typeId of Object.keys(TYPE_OCCASIONS)) {
    if (!compiledTypeIds.has(typeId)) problems.push(`TYPE_OCCASIONS declares "${typeId}", which compiles no browsable variant`);
  }
  for (const [id, count] of occasionUse) {
    if (count < MIN_DESIGNS_PER_OCCASION) {
      problems.push(
        `occasion "${id}" is declared by ${count} design(s); the floor is ${MIN_DESIGNS_PER_OCCASION} ` +
          '(fewer than that is a design\'s own name, not a moment)',
      );
    }
  }
  // Every phrase an occasion declares has to actually reach it: the fold into ALIASES is what
  // makes the declaration the search behaviour, and a phrase that lost its target there would
  // fail silently — the word would simply return the wrong designs.
  for (const occasion of OCCASIONS) {
    for (const phrase of occasion.phrases) {
      const key = normalizeSearchText(phrase);
      if (!ALIASES[key]?.occasions?.includes(occasion.id)) {
        problems.push(`occasion "${occasion.id}": phrase "${phrase}" does not resolve to it through ALIASES`);
      }
    }
  }

  for (const { variant, meta } of entries) {
    const category = graphicCategoryById(meta.category);
    if (meta.subtype && !category.subtypes.includes(meta.subtype)) {
      problems.push(`${variant.id}: subtype "${meta.subtype}" is not in category "${category.id}"`);
    }
    const declared = VARIANT_META[variant.id];
    if (declared?.positionalSemantics && declared.positionalSemantics.length !== meta.fieldSchema.length) {
      problems.push(
        `${variant.id}: positional semantics length ${declared.positionalSemantics.length} != schema length ${meta.fieldSchema.length}`,
      );
    }
  }
  return problems;
}

/**
 * The Browse step's graphic-TYPE options: categories that actually have catalog content, with
 * counts — taxonomy-ahead-of-catalog categories are not offered (proposal §4).
 *
 * `hiddenIds` are the designs this visitor may not see (docs/ADMIN.md §7). They are excluded
 * here for the same reason `browseTemplates` drops them before scoring: a count including a
 * design nobody can pick is a number that will not match the result the option produces, and
 * the option now SHOWS that number ("Lower thirds · 82") rather than only ordering by it.
 */
export function browsableCategories(
  hiddenIds: readonly string[] = [],
): { category: GraphicCategoryId; name: string; count: number }[] {
  const hidden = hiddenIds.length ? new Set(hiddenIds) : null;
  const counts = new Map<GraphicCategoryId, number>();
  for (const { variant, meta } of allTemplateMeta()) {
    if (hidden?.has(variant.id)) continue;
    counts.set(meta.category, (counts.get(meta.category) ?? 0) + 1);
  }
  return GRAPHIC_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({
    category: c.id,
    name: c.name,
    count: counts.get(c.id) ?? 0,
  }));
}

/**
 * The Browse step's lead dropdown: the category GROUPS (the ten user-facing shelves over the
 * 27 categories — model/taxonomy.ts CATEGORY_GROUPS), each with its live catalog count. Same
 * rules as `browsableCategories`: entitlement-hidden designs are excluded so the printed
 * count always matches the result the option produces, and a group whose members have no
 * content renders no row. The member categories themselves become the group's refinement
 * chips, filtered from `browsableCategories` by CATEGORY_GROUP_OF.
 */
export function browsableGroups(
  hiddenIds: readonly string[] = [],
): { group: CategoryGroupId; name: string; count: number }[] {
  const counts = new Map<CategoryGroupId, number>();
  for (const tile of browsableCategories(hiddenIds)) {
    const group = CATEGORY_GROUP_OF[tile.category];
    counts.set(group, (counts.get(group) ?? 0) + tile.count);
  }
  return CATEGORY_GROUPS.filter((g) => counts.has(g.id)).map((g) => ({
    group: g.id,
    name: g.name,
    count: counts.get(g.id) ?? 0,
  }));
}
