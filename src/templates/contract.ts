// THE TEMPLATE CONTRACT: what every catalog design declares and every wizard surface reads. A
// TemplateVariant is a tasteful, hand-tuned design that generates a complete SpxTemplate from the
// user's WizardOptions; every option has a default so `variant.create({})` renders for live
// previews, and the generated code is the source of truth afterwards - the wizard never runs
// again on an existing project. The assembler ids and categories, the options the flow collects,
// the curated palettes, the field plans, the style choices and the option/field resolvers live
// here, next to the catalog they describe. The vocabulary types are kernel
// (model/templateVocabulary.ts, re-exported below); the Import-graphic road's own shapes
// (`DesignSvg*`, `DesignArt`) live in importedDesign/designTypes.ts and appear here only as
// members of WizardOptions - deliberately, since a WizardOptions member has to be visible from
// the contract.

import type { Resolution, SpxField, SpxTemplate, AssetFile } from '../model/types';
import { DEFAULT_GRAPHICS_FORMAT, DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import type { CustomFont, StyleTag } from '../model/fonts';
import type { LineSpec, ExtraFieldSpec, Zone9, Palette, AnimPresetId, AnimSpeed } from '../model/templateVocabulary';
import type { EasingId } from '../model/easings';
import type { DesignArt, DesignSvg } from './importedDesign/designTypes';

// ── Categories (the full catalog; lower thirds, info cards, end credits, and tickers live) ──

export interface CategoryInfo {
  id: AssemblerId;
  name: string;
  /** How many designs this category will hold when complete. */
  plannedCount: number;
  /** False until the category's variants exist — shown as "coming soon" in the wizard. */
  available: boolean;
  description: string;
  /**
   * Wizard grouping: the live-show must-haves vs the more specialised graphics — plus
   * 'imported', which the category grid deliberately never renders (CategoryStep lists the
   * two browsable groups). An imported design has nothing to browse: it does not exist until
   * the user brings their own artwork, so the Import Graphic entry is its only way in.
   */
  group: 'essentials' | 'specials' | 'imported';
}

/**
 * The ASSEMBLER/ROUTING id — which code builds a template and which field contract it uses
 * (catalog buckets, field plans, hidden-config lists all key on it). It is NOT a taxonomy:
 * the user-facing discovery categories are `GraphicCategoryId` in model/taxonomy.ts, declared
 * per variant in templates/meta.ts. Renamed from `AssemblerId` (2026-08-11) because the
 * old name kept inviting attempts to merge the two — they answer different questions
 * (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18): several assemblers feed one graphic category and
 * one assembler's variants scatter across several. Never render these ids in UI.
 */
export type AssemblerId =
  | 'lower-third'
  | 'info-card'
  | 'end-credits'
  | 'starting-soon'
  | 'game-timer'
  | 'scoreboard'
  | 'ticker'
  | 'alert'
  | 'public-info'
  | 'infographic'
  | 'corner-bug'
  | 'versus'
  | 'quiz'
  | 'frame'
  | 'transition'
  // The competition pack (docs/COMPETITION_PACK.md): esports, competition, result and
  // reveal graphics. Four categories, one shared assembler (templates/competition).
  | 'esports-score'
  | 'matchup'
  | 'results-board'
  | 'reveal'
  | 'poll'
  | 'audience'
  | 'stream-notification'
  | 'imported-design';

export const CATEGORIES: CategoryInfo[] = [
  // Essentials — the graphics almost every live show needs.
  { id: 'lower-third',   name: 'Lower thirds',            plannedCount: 86, available: true,  description: 'Names, titles, and straps over the action.', group: 'essentials' },
  { id: 'ticker',        name: 'Tickers',                 plannedCount: 20, available: true , description: 'Scrolling news, info, and index strips.', group: 'essentials' },
  { id: 'scoreboard',    name: 'Scoreboards',             plannedCount: 20, available: true , description: 'Scorebugs, match boards, status and event cards.', group: 'essentials' },
  { id: 'info-card',     name: 'Info cards',              plannedCount: 18, available: true,  description: 'Full / half screen cards — info, readings, quotes and ceremony.', group: 'essentials' },
  // These two carry the TAXONOMY's wording on purpose: they hold exactly the designs their
  // browse tile does (ss01-13, cr01-12), so a user meeting the same set twice must read the
  // same name both times. The description carries the nuance the tile name drops.
  { id: 'starting-soon', name: 'Holding & break screens', plannedCount: 13, available: true , description: 'Starting soon, breaks, technical pauses and sign-offs.', group: 'essentials' },
  { id: 'end-credits',   name: 'Credits & thanks',        plannedCount: 12, available: true , description: 'Credit rolls, name walls, sponsor boards and schedules.', group: 'essentials' },
  { id: 'corner-bug',    name: 'Bugs & corner logos',     plannedCount: 36, available: true , description: 'Persistent marks: logos, idents, live status, sponsors, chips.', group: 'essentials' },
  // Specials — for particular formats and moments.
  { id: 'infographic',   name: 'Infographics',            plannedCount: 29, available: true , description: 'Stats, polls, bars, schedules, goals, fixtures.', group: 'specials' },
  { id: 'game-timer',    name: 'Game show timer',         plannedCount: 4,  available: true , description: 'Countdowns and clocks for game formats.', group: 'specials' },
  { id: 'versus',        name: 'Versus cards',            plannedCount: 2,  available: true , description: 'Full-frame match-up cards — two sides meet.', group: 'specials' },
  { id: 'frame',         name: 'Camera frames',           plannedCount: 4,  available: true , description: 'Surrounds for webcams, interviews, split screens and screen shares.', group: 'specials' },
  { id: 'transition',    name: 'Transitions',             plannedCount: 4,  available: true , description: 'Full-frame stingers and wipes that cover a cut, then clear.', group: 'specials' },
  // The competition pack — esports, competition, result and reveal graphics.
  { id: 'esports-score', name: 'Esports scoreboards',     plannedCount: 8,  available: true , description: 'Series scorebugs, map / round indicators and veto boards.', group: 'specials' },
  { id: 'matchup',       name: 'Match-ups & competitors', plannedCount: 10, available: true , description: 'Match-ups with a winner pick, head-to-heads, player cards.', group: 'specials' },
  { id: 'results-board', name: 'Results & standings',     plannedCount: 14, available: true , description: 'Rosters, turn orders, standings, timing, results and brackets.', group: 'specials' },
  { id: 'reveal',        name: 'Reveals',                 plannedCount: 12, available: true , description: 'Nominees and winners, verdicts, award and launch reveals.', group: 'specials' },
  { id: 'quiz',          name: 'Quiz graphics',           plannedCount: 12, available: true , description: 'Game-show questions with two, three or four answers.', group: 'specials' },
  { id: 'poll',          name: 'Live votes',              plannedCount: 4,  available: true , description: 'Audience polls and votes — open, close, result, winner.', group: 'specials' },
  { id: 'audience',      name: 'Audience & questions',    plannedCount: 20, available: true , description: 'Viewer questions, Q&A, chat highlights, queues, requests.', group: 'specials' },
  { id: 'stream-notification', name: 'Stream notifications', plannedCount: 4, available: true, description: 'Followers, members, donations, gifts and raids in one queued event format.', group: 'specials' },
  // The public-service pack (docs/PUBLIC_SERVICE_PACK.md).
  { id: 'alert',         name: 'Alerts & warnings',       plannedCount: 10, available: true , description: 'Breaking news, weather warnings, emergency and status notices.', group: 'specials' },
  { id: 'public-info',   name: 'Public information',      plannedCount: 9,  available: true , description: 'Official notices, instructions, disclaimers — in one or two languages.', group: 'specials' },
  // Not browsable — reached only by importing artwork (see CategoryInfo.group).
  { id: 'imported-design', name: 'Imported design',       plannedCount: 1,  available: true , description: 'Your own artwork with text fields on top.', group: 'imported' },
];

// ── Wizard options (every choice the flow collects) ─────────────────────────

// The vocabulary types (a line, an extra field, a zone, a palette, an animation preset and its
// speed) are kernel and live in model/templateVocabulary.ts; they are re-exported here so a
// design reads one file.
export type { LineSpec, LineStyle, ExtraFieldSpec, Zone9, Palette, AnimPresetId, AnimSpeed } from '../model/templateVocabulary';

export interface AnimationChoice {
  presetId: AnimPresetId;
  /** Multiplier on animSpeed: 0.6 slower · 1 normal · 1.8 faster (see AnimSpeed). */
  speed: AnimSpeed;
  /** Easing preset ('auto' = the animation preset's hand-tuned pair). See model/easings.ts. */
  easing: EasingId;
  /** SPX multi-step: line 1 first, further lines revealed on Continue / next(). */
  steps: boolean;
}

export interface WizardOptions {
  resolution?: Resolution;
  fps?: number;
  /** Visible text lines, up to the variant's maxLines (the design adapts). Defaults to
   *  the variant's suggested lines. */
  lines?: LineSpec[];
  /** Extra non-visual fields appended to the SPX definition. */
  extraFields?: ExtraFieldSpec[];
  /**
   * Values for a GRAPHIC TYPE's non-line fields, keyed by the type's own LOGICAL field key
   * (`{ correctAnswer: 'C' }`) - never by `fN`, which is positional and would break the moment
   * a field was inserted. Lines are what a graphic SAYS; this is the rest of what makes it the
   * graphic that was asked for: which answer is correct, how long the countdown runs, what the
   * poll's options are.
   *
   * Only a TYPE-COMPILED variant can honour it, because only a type declares logical keys and
   * the kind to clamp each value against (`variantsFromType`). A hand-written variant ignores
   * it, which is the honest answer rather than a guess at what its `fN` ids mean. Every value
   * is clamped to what its field declares and an illegal one is DROPPED, so the design's own
   * default survives instead of the graphic acquiring an option nobody offers.
   */
  content?: Record<string, string>;
  /** Answers to the variant's declared `styleChoices`, by key. An unknown key, or a value the
   *  variant does not offer, is DROPPED rather than honoured — the design's own default then
   *  stands, which is the same posture `content` takes. */
  styleChoices?: Record<string, string>;
  palette?: Palette;
  fontId?: string;
  /** A user-imported font (embedded as an asset) — takes precedence over fontId. */
  customFont?: CustomFont;
  /** Whole-graphic size multiplier written as --scale (S 0.8 · M 1 · L 1.25 — StyleStep's SIZES). */
  sizeScale?: number;
  /** Text-only size multiplier written as --type-scale (S 0.85 · M 1 · L 1.2 — TYPE_SIZE_STEPS). */
  typeScale?: number;
  zone?: Zone9;
  /** Pixel offsets added after zone anchoring. */
  nudge?: { x: number; y: number };
  animation?: Partial<AnimationChoice>;
  /** Images from the "Import graphics" entry (already stored as data-URL assets). */
  importedImages?: AssetFile[];
  /** Relative path of the imported image to place in the variant's logo slot. */
  logoAssetPath?: string;
  /** Whether an 'optional'-logo design should include its logo slot (field + <img>).
   *  Unset falls back to "an image was provided"; 'built-in' designs always have one. */
  logoEnabled?: boolean;
  /** Mark the logo's `<img>` as ink-KNOCKED - it carries `.{prefix}-logo--knocked` and the
   *  caller supplies the recolour rule.
   *
   *  It is a class rather than the CSS itself because the class is a CONTRACT: `assetIntegrity.ts`
   *  admits a filter on a protected picture only on this selector and only in the exact knock
   *  shape, so the one alteration the platform may make to a customer's mark is expressible and
   *  nothing else is (docs/NOACG_PRO_PLAN.md §17). Only NoaCG Pro's composer sets it today. */
  logoInkKnocked?: boolean;
  /** The artwork that IS the graphic (the Import Graphic flow's imported-design category).
   *  Its natural size decides the design's size, so it is measured at import, not guessed. */
  designArt?: DesignArt;
  /** The SVG that IS the graphic (the Import Graphic flow's SVG road,
   *  docs/SVG_IMPORT_PLAN.md): sanitized markup with its chosen text layers to bind. */
  designSvg?: DesignSvg;
  /**
   * PREVIEW ONLY: keep the import-time `data-noacg-candidate` bookkeeping markers in the
   * emitted markup, so the mapping step's hover highlight has a handle on the layer a
   * checklist row means (plan §6a step 1 - the preview IS the step's one canvas, because it
   * is the only one carrying the fit runtime). The wizard preview passes it; `create()` on
   * the way to a real project never does, so a saved or exported graphic is unchanged.
   */
  previewMarkers?: boolean;
}

/** WizardOptions with every default resolved — what variant builders actually receive. */
export interface ResolvedOptions {
  resolution: Resolution;
  fps: number;
  lines: LineSpec[];
  extraFields: ExtraFieldSpec[];
  /** Every style choice the variant declares, resolved to a legal value — so a design reads
   *  `o.styleChoices.emphasis` without a fallback of its own. A variant that declares none
   *  gets `{}`. */
  styleChoices: Record<string, string>;
  palette: Palette;
  fontId: string;
  customFont: CustomFont | null;
  sizeScale: number;
  typeScale: number;
  zone: Zone9;
  nudge: { x: number; y: number };
  animation: AnimationChoice;
  importedImages: AssetFile[];
  logoAssetPath: string | null;
  logoEnabled: boolean;
  logoInkKnocked: boolean;
  /** The design's own placement for the shared mark slot, or null to keep the category answer.
   *  Carried rather than resolved here: the default lives with the code that draws the slot,
   *  so this layer never has to know which categories place a mark beside their words. */
  markPlacement: MarkPlacement | null;
  designArt: DesignArt | null;
  designSvg: DesignSvg | null;
  /** See `WizardOptions.previewMarkers` — preview-only, never on the create path. */
  previewMarkers: boolean;
}

// ── Template variants ────────────────────────────────────────────────────────

/** A variant's logo capability: 'built-in' = the design always carries a logo slot
 *  (corner bugs, credits), 'optional' = the wizard offers a logo toggle (+ upload),
 *  'none' = the design has no sensible place for one. */
export type LogoSupport = 'none' | 'optional' | 'built-in';

/** Where the shared mark slot sits: a leading column beside the design's stack (costs width,
 *  never height - the strap rule), or a header band above the words (costs height, which a card
 *  can afford and a strap cannot). See `TemplateVariant.markPlacement`. */
export type MarkPlacement = 'beside' | 'band';

/**
 * What FIELD-STRUCTURE changes a design supports - the wizard offers EXACTLY this, nothing
 * arbitrary (docs/GOALS_ARCHIVE.md "Student release" step 5).
 *
 * - 'lines': the standard line contract - lines addable/removable between min and maxLines,
 *   each becoming its own `fN` element (shared/standard.ts's mask idiom).
 * - 'fixed': a CLOSED field contract (a scoreboard's cells, a quiz's answer rows). Titles
 *   and sample values stay editable; the field COUNT does not. Before this, the wizard
 *   rendered add/remove here anyway and the assembler silently ignored them.
 * - 'list': the design's runtime BUILDS its rows from ONE textarea field (the repeating-data
 *   doctrine, src/templates/AGENTS.md - a ticker's items, a credits roll). The wizard offers
 *   a rows editor over that one field's value; never more fields.
 */
export type FieldPlan =
  | { kind: 'lines'; min: number }
  | { kind: 'fixed'; reason: string }
  | {
      kind: 'list';
      itemLabel: string;
      itemHint: string;
      maxItems?: number;
      /**
       * How the ONE source field is PRESENTED. Both edit the same value.
       *
       * `rows` (the default) gives one input per line, with add and remove. Right when a line
       * IS an item - a ticker's headlines are independent, short, and reordered by hand.
       *
       * `paste` gives a single textarea. Right when the lines have STRUCTURE ACROSS them and
       * the list arrives from somewhere else: a credit roll is a role and the people under it,
       * copied out of a document or a spreadsheet. A rows grid cannot even accept that paste -
       * sixty lines have nowhere to go - and it shows one box per name, which is exactly the
       * "a field per person" shape the category exists to avoid.
       */
      editor?: 'rows' | 'paste';
      /**
       * One sentence naming this list's TEXT FORMAT, shown under the editor beside the
       * generic explanation of what a list field is.
       *
       * A list category's one field carries a format - end credits have "a colon ends a role",
       * a ticker has "a colon ends a kicker" - and a format nobody is told about is a format
       * nobody uses. The step is where a person decides whether the template is any good, so
       * it is where the format has to be stated, not only in docs/.
       */
      formatNote?: string;
    };

/**
 * The per-CATEGORY field plans that differ from the standard line contract. A category's
 * field structure is its assembler's contract (one shared assembler per category), so the
 * declaration lives in ONE table rather than on dozens of variant files; a variant that
 * genuinely deviates can override via `TemplateVariant.fieldPlan`. Categories not named here
 * keep the standard 'lines' plan - the behavior they always had.
 */
const CATEGORY_FIELD_PLANS: Partial<Record<AssemblerId, FieldPlan>> = {
  // One hidden textarea IS the rundown of items; the runtime rebuilds the strip from it.
  // A row stays one item - a ticker's stories are short and reordered by hand - and the one
  // mark it carries is the kicker (docs/TICKERS.md).
  ticker: {
    kind: 'list',
    itemLabel: 'Ticker items',
    itemHint: 'SPORT: United win 3-0',
    formatNote:
      'A colon ends a KICKER - the tag a story is filed under, drawn in the accent colour. ' +
      'Put one on its own row and every row under it carries it, until a blank row. ' +
      'A row with no colon is just a story, which is what every ticker was before.',
  },
  // The whole roll in ONE field: a colon ends a role, the lines beneath it are its people
  // (docs/END_CREDITS.md). Never a field per person.
  'end-credits': {
    kind: 'list',
    editor: 'paste',
    itemLabel: 'Credits',
    itemHint: '# PRODUCTION\nDirector: Alex Rivera\nCamera Operators:\nJonas Berg\nLena Fors',
  },
  // Question + answer rows + the correct-answer marker: a machine drives them as one unit.
  quiz: { kind: 'fixed', reason: 'A quiz board is question + its answer rows — a fixed set its state machine drives.' },
  // Team names, scores, period, clock: the cells are the design.
  scoreboard: { kind: 'fixed', reason: 'A scoreboard is its cells — team names, scores and clock are the design itself.' },
  'game-timer': { kind: 'fixed', reason: 'A game clock is its readouts — the fields are the design itself.' },
  'starting-soon': { kind: 'fixed', reason: 'A countdown is its readouts — the fields are the design itself.' },
};

/** Resolve a variant's field plan: its own declaration, else its category's, else the
 *  standard line contract. THE one rule every field-offering surface asks. */
export function fieldPlanOf(variant: Pick<TemplateVariant, 'category' | 'fieldPlan'>): FieldPlan {
  return variant.fieldPlan ?? CATEGORY_FIELD_PLANS[variant.category] ?? { kind: 'lines', min: 1 };
}

/**
 * A design decision the DESIGN owns and the user picks, offered as a segmented row in the
 * wizard's Style step.
 *
 * It exists for the choice that is neither a palette nor a size nor a zone - a genuine fork in
 * how the design composes, where both answers are correct for different shows and neither is a
 * different design. cr01's emphasis is the first: a credit is a role and the people who did it,
 * and which of the two is the headline flips the whole roll. Shipping that as two catalog
 * entries would put two near-identical cards in Browse with nothing to choose between them.
 *
 * The values are STYLE, never content: a choice may pick class names and custom properties, and
 * must never change which fields the graphic has or what its machine does - those are a graphic
 * TYPE's business, and the control page an operator gets is generated from them.
 */
export interface StyleChoiceSpec {
  /** Stable key the design reads back out of `ResolvedOptions.styleChoices`. */
  key: string;
  /** The row's label in the Style step. */
  title: string;
  /** One line under the label, when the labels alone do not say what changes. */
  help?: string;
  /** The answers, in the order they are offered. The first is not the default; `value` is. */
  options: { value: string; label: string }[];
  /** The answer a design that is never touched ships with. Must be one of `options`. */
  value: string;
}

export interface TemplateVariant {
  /** e.g. "lt01". */
  id: string;
  /** The GRAPHIC TYPE this variant is a design of (templates/types/), when it has one — the
   *  back-pointer Phase 4's node editor and Phase 5's control generator look up. Absent on a
   *  hand-written variant that no type has claimed yet. */
  typeId?: string;
  category: AssemblerId;
  name: string;
  styleTag: StyleTag;
  description: string;
  /** How many visible text lines the design supports (1–5). */
  maxLines: number;
  /** This design's field-structure contract, when it deviates from its category's (see
   *  fieldPlanOf - absent means the category's plan, else the standard line contract). */
  fieldPlan?: FieldPlan;
  /** Suggested lines used as the wizard's starting point (and preview defaults). */
  suggestedLines: LineSpec[];
  /** Design decisions this design hands to the user, offered in the Style step. Absent (the
   *  case for almost every design) means the Style step shows exactly what it always did. */
  styleChoices?: StyleChoiceSpec[];
  /** Logo capability — drives the wizard's logo toggle, the import flow, and filtering. */
  logo: LogoSupport;
  /**
   * What an `optional`-logo design does when nobody has decided — the same tri-state
   * `defaultSteps` uses (null = the design decides), and for the same reason: it is the design
   * that knows whether its composition was drawn around a mark.
   *
   * A closing roll conventionally ends on one, so cr01 asks for it; the user can still switch
   * it off, which is the whole point. Absent falls back to "an image was provided", which is
   * what every optional design did before this existed.
   *
   * Reach for `optional` + this, never `built-in`, unless the design genuinely cannot be drawn
   * without a mark. `built-in` renders the toggle CHECKED AND DISABLED - a graphic nobody can
   * export without a logo slot - and that was never a decision any design should make for a
   * broadcaster.
   */
  defaultLogo?: boolean;
  /**
   * WHAT that image slot is for, when the design's slot is not a brand mark.
   *
   * `logo` answers "does this design take an image field"; it does not answer "what kind of
   * image", and the two got conflated because for almost every design the answer is the same.
   * Measured 2026-08-09 (`benchmarks/lite/BRAND-AUDIT-2026-08-09.md`), one design in the
   * catalog is a counter-example strong enough to need the distinction: ls25's slot is RELEASE
   * ARTWORK — square by nature, correctly `object-fit: cover`, and titled "Cover artwork" in
   * the field list. Judged as a mark well it fails for cropping, and the cropping is right.
   *
   * A `mark` well holds something that must appear exactly as uploaded (no crop, no radius,
   * no distortion — `src/ai/assetIntegrity.ts` enforces this the moment the upload is marked
   * "use it as it is"). A `picture` well holds content, which a design may legitimately crop
   * to its own shape.
   *
   * ADDITIVE OPTIONAL and absent means `mark`, so every existing variant reads exactly as it
   * did. Nothing persists a variant, so there is no migration to write (root AGENTS.md rule 6
   * is about SAVED formats).
   */
  imageSlot?: 'mark' | 'picture';
  /**
   * WHERE this design puts the shared mark slot, when the category's own answer is wrong for it.
   *
   * PLACEMENT IS A PROPERTY OF THE DESIGN, NOT OF THE CATEGORY (owner, 2026-08-21: *"I cannot
   * give you hard rules on where to place a logo. It depends on the design."*). It had been one
   * line in `logoSlot.ts` - `beside = prefix === 'lower-third'` - so every design in a category
   * inherited the same answer and no design could disagree. That was fine while only lower
   * thirds carried marks and became a real limit the moment other types opted in
   * (`docs/MARK_CAPABILITY_AUDIT.md`).
   *
   * `beside` puts the mark in a leading column, vertically centred on the design's whole stack -
   * which costs the graphic WIDTH and no height, the rule a strap lives by. `band` puts it above
   * the words as a header row, which is what a card or a full-frame screen usually wants.
   *
   * ADDITIVE OPTIONAL, and absent keeps the category's answer, so every existing design emits
   * exactly what it emitted before. Choosing one is a drawing decision: a design that asks for
   * `beside` in a narrow panel spends width it may not have, and one that asks for `band` on a
   * strap spends height, which `e2e/catalog/mark-height.spec.ts` will refuse.
   */
  markPlacement?: MarkPlacement;
  /** Animation presets that suit this design (first = default). */
  animationPresets: AnimPresetId[];
  /**
   * Whether the design starts in multi-step mode (SPX Continue reveals one line per press).
   * Absent = off, which is what every design did before this existed.
   *
   * It is a CAPABILITY like `animationPresets[0]`, not a preference: a numbered process card
   * or a checklist is a stepped graphic by construction — created single-step it shows its
   * ending on the first frame — while a name strap is not. The wizard's steps toggle still
   * wins wherever the user touches it; this only decides what an untouched `create({})`
   * produces, which is also what the previews, the sweeps and the AI see.
   */
  defaultSteps?: boolean;
  defaultPalette: Palette;
  defaultFontId: string;
  defaultZone: Zone9;
  /** Build the complete template. Every option is optional — defaults come from the variant. */
  create(options?: WizardOptions): SpxTemplate;
}

// ── Curated palettes (one accent + neutral system; see DESIGN_LANGUAGE.md) ──

export const PALETTES: Palette[] = [
  // NoaCG house (the brand system: void panel, one amber accent — BRAND-MANUAL §3)
  { id: 'noacg',    name: 'NoaCG Amber',  styleTags: ['noacg'],   accent: '#f6a623', text: '#ffffff', textDim: 'rgba(183,188,196,0.95)', panel: 'rgba(10, 12, 16, 0.86)' },
  // Minimal
  { id: 'ivory',    name: 'Ivory',        styleTags: ['minimal'], accent: '#e8c547', text: '#ffffff', textDim: 'rgba(255,255,255,0.72)', panel: 'rgba(12, 14, 18, 0.92)' },
  { id: 'porcelain',name: 'Porcelain',    styleTags: ['minimal'], accent: '#0f1115', text: '#0f1115', textDim: 'rgba(15,17,21,0.65)',    panel: 'rgba(250, 250, 248, 0.96)' },
  { id: 'signal',   name: 'Signal Red',   styleTags: ['minimal', 'sport'], accent: '#e63946', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)', panel: 'rgba(10, 12, 16, 0.92)' },
  // Sport
  { id: 'volt',     name: 'Volt',         styleTags: ['sport'],   accent: '#c8f31d', text: '#ffffff', textDim: 'rgba(255,255,255,0.75)', panel: 'rgba(8, 10, 14, 0.94)' },
  { id: 'inferno',  name: 'Inferno',      styleTags: ['sport'],   accent: '#ff5a1f', text: '#ffffff', textDim: 'rgba(255,255,255,0.75)', panel: 'rgba(12, 8, 8, 0.94)' },
  { id: 'royal',    name: 'Royal',        styleTags: ['sport', 'glass'], accent: '#3d6bff', text: '#ffffff', textDim: 'rgba(255,255,255,0.72)', panel: 'rgba(8, 10, 20, 0.94)' },
  // Editorial (the magazine/newsroom voice — printed-page colour: one ink, one paper)
  // The accent is measured, not picked by eye: editorial designs put it on SMALL tracked caps,
  // and a deeper vermilion (#d1462f) lands at 4.2:1 on the ink panel — under the 4.5:1 a caption
  // needs. This one clears it at ~5.2:1 without becoming orange.
  { id: 'vermilion',name: 'Vermilion',    styleTags: ['editorial'], accent: '#e2593f', text: '#ffffff', textDim: 'rgba(255,255,255,0.66)', panel: 'rgba(16, 15, 14, 0.90)' },
  { id: 'broadsheet',name: 'Broadsheet',  styleTags: ['editorial', 'minimal'], accent: '#1f3a5f', text: '#14161a', textDim: 'rgba(20,22,26,0.62)', panel: 'rgba(245, 243, 238, 0.96)' },
  // Cinematic (documentary colour: bone and ember over a scrim — never a saturated accent)
  { id: 'noir',     name: 'Noir',         styleTags: ['cinematic'], accent: '#e8e2d6', text: '#ffffff', textDim: 'rgba(255,255,255,0.62)', panel: 'rgba(0, 0, 0, 0.55)' },
  { id: 'ember',    name: 'Ember',        styleTags: ['cinematic'], accent: '#e0a458', text: '#ffffff', textDim: 'rgba(255,255,255,0.62)', panel: 'rgba(10, 8, 6, 0.55)' },
  // Glass
  { id: 'frost',    name: 'Frost',        styleTags: ['glass'],   accent: '#7dd3fc', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)',  panel: 'rgba(255, 255, 255, 0.10)' },
  { id: 'orchid',   name: 'Orchid',       styleTags: ['glass'],   accent: '#c084fc', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)',  panel: 'rgba(255, 255, 255, 0.10)' },
  { id: 'mint',     name: 'Mint',         styleTags: ['glass', 'minimal'], accent: '#34d399', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)', panel: 'rgba(255, 255, 255, 0.10)' },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

// ── Defaults resolver ────────────────────────────────────────────────────────

/** Fill every missing option with the variant's tasteful default. */
/** Every declared style choice, answered. A value the variant does not offer is dropped, so a
 *  stale saved draft or a hand-built option object degrades to the design's own default rather
 *  than to a class name nothing in the stylesheet answers. */
export function resolveStyleChoices(
  variant: Pick<TemplateVariant, 'styleChoices'>,
  picked: Record<string, string> | undefined,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  (variant.styleChoices ?? []).forEach((choice) => {
    const answer = picked?.[choice.key];
    const legal = choice.options.some((option) => option.value === answer);
    resolved[choice.key] = legal ? (answer as string) : choice.value;
  });
  return resolved;
}

export function resolveOptions(variant: TemplateVariant, options: WizardOptions = {}): ResolvedOptions {
  // An EXPLICIT lines array is honoured as given — including an empty one (an imported
  // design creates bare: its fields are added in the editor's Data tab). Only an absent
  // value falls back to the variant's suggestions.
  const lines = (options.lines ?? variant.suggestedLines).slice(0, variant.maxLines);
  return {
    resolution: options.resolution ?? DEFAULT_GRAPHICS_RESOLUTION,
    fps: options.fps ?? DEFAULT_GRAPHICS_FORMAT.fps,
    lines,
    extraFields: options.extraFields ?? [],
    styleChoices: resolveStyleChoices(variant, options.styleChoices),
    palette: options.palette ?? variant.defaultPalette,
    fontId: options.fontId ?? variant.defaultFontId,
    customFont: options.customFont ?? null,
    sizeScale: options.sizeScale ?? 1,
    typeScale: options.typeScale ?? 1,
    zone: options.zone ?? variant.defaultZone,
    nudge: options.nudge ?? { x: 0, y: 0 },
    animation: {
      presetId: options.animation?.presetId ?? variant.animationPresets[0],
      speed: options.animation?.speed ?? 1,
      easing: options.animation?.easing ?? 'auto',
      steps: options.animation?.steps ?? variant.defaultSteps ?? false,
    },
    importedImages: options.importedImages ?? [],
    logoAssetPath: options.logoAssetPath ?? null,
    logoEnabled:
      variant.logo === 'built-in' ||
      (variant.logo === 'optional' &&
        (options.logoEnabled ?? variant.defaultLogo ?? !!options.logoAssetPath)),
    logoInkKnocked: options.logoInkKnocked ?? false,
    markPlacement: variant.markPlacement ?? null,
    designArt: options.designArt ?? null,
    designSvg: options.designSvg ?? null,
    previewMarkers: options.previewMarkers ?? false,
  };
}

/** Fields (fN ids) generated from lines + extras — lines first (rundown preview uses f0/f1). */
export function fieldsFromOptions(o: ResolvedOptions): SpxField[] {
  const fields: SpxField[] = o.lines.map((line, i) => ({
    field: `f${i}`,
    ftype: 'textfield',
    title: line.title,
    value: line.sample,
  }));
  o.extraFields.forEach((extra, i) => {
    fields.push({
      field: `f${o.lines.length + i}`,
      ftype: extra.ftype,
      title: extra.title,
      value: extra.value,
      // Image fields ("filelist") list the project's images/ folder in SPX.
      ...(extra.ftype === 'filelist' ? { assetfolder: './images/', extension: 'png' } : {}),
    });
  });
  return fields;
}
