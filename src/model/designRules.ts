// THE DESIGN RULES - the one canonical module for on-air legibility constraints
// (docs/DESIGN_RULES_PLAN.md §2). Prompting, validation, instruments and tests all READ this;
// nothing copies its numbers. MODEL layer: pure, no DOM, importable by validation, ai,
// templates and the wizard (the entitlements/feedback precedent).
//
// THE STANDARD IS THE OWNER'S. The size table below was ratified 2026-08-18 as the broadcast
// minimum-size rule the blind reads kept asking for ("we need a minimum of what size text we
// can use on which screen - make a rule on the minimum sizes", docs/NOACG_PRO_PLAN.md §22.1
// escape 3). The catalog audit (benchmarks/design-rules/AUDIT-*.md) validates every number
// against shipped designs before anything hard-enforces; where the table and the audit
// disagree, the report says so and the table still wins - the evidence goes to the owner, the
// standard stays the owner's.
//
// RULES CONSTRAIN FAILURE, NEVER STYLE (owner brief §15): a small decorative flourish is
// legal, an unreadable score is not. Decorative text is exempt from size floors and still
// contrast-checked when it carries words.

/** Every rule scales off the SHORT side of the frame, so one table serves 16:9, 9:16 and 1:1. */
export function referenceSize(width: number, height: number): number {
  return Math.min(width, height);
}

/** What a piece of text IS to the viewer - the unit the size table is keyed by.
 *  primary: names, scores, clocks, headlines - the reason the graphic is on screen.
 *  secondary: titles, captions, context lines.
 *  fine: sources, fine print - discouraged, still floor-checked.
 *  decorative: ornament that happens to be text - exempt from size floors, contrast-checked. */
export type TextRole = 'primary' | 'secondary' | 'fine' | 'decorative';

/** 'standard' is the default; 'safe' is the "Guaranteed readable size" checkbox (default OFF).
 *  In safe mode the AI designs FOR big type - fewer fields, simpler composition - it never
 *  inflates a small layout. Persisted per project as an additive optional field (no version
 *  bump - AGENTS.md §5). */
export type LegibilityMode = 'standard' | 'safe';

/** Where the graphic will be WATCHED. Multiplies the size floors. 'venue' is a stub (alias of
 *  tv - distance math deferred, owner brief §19); 'custom' carries a free-text note to the
 *  prompt and multiplies as tv. Internal-only until the rules survive a read (wizard UI is R4). */
export type ViewingProfileId = 'tv' | 'streaming' | 'mobile' | 'venue' | 'custom';

export interface ViewingTarget {
  profile: ViewingProfileId;
  /** Only meaningful on 'custom': the author's own description of the environment, carried
   *  verbatim into the prompt block. */
  note?: string;
}

export const PROFILE_MULTIPLIER: Readonly<Record<ViewingProfileId, number>> = {
  tv: 1,
  streaming: 1.1,
  mobile: 1.25,
  venue: 1, // stub: treated as tv until viewing-distance math exists
  custom: 1,
};

/**
 * THE OWNER SIZE TABLE (ratified 2026-08-18), as fractions of the reference size.
 * A floor composes as `floor(role, mode) * profileMultiplier`.
 *
 * STANDARD: primary 4.6% (~50px @1080) hard; secondary and fine 1.85% (~20px) hard with a
 * warning band under 2.2% (~24px). 20px was chosen over 22 because shipped, owner-passed
 * designs sit at exactly 20px (lt27's supporting line).
 *
 * SAFE: the owner's three floors are primary 6% (band 6-10%), normal text 5%, secondary 4% -
 * mapped onto this module's roles as primary/secondary/fine ("normal text" is the secondary
 * role here; the owner's "secondary" is the fine role). In safe mode there is no warning band:
 * every floor is hard.
 */
export interface SizeFloorSpec {
  /** Hard floor as a fraction of the reference size. */
  hard: number;
  /** Warning band: at or above `hard` but under this warns. Null = no band. */
  warn: number | null;
}

export const SIZE_TABLE: Readonly<
  Record<LegibilityMode, Readonly<Record<Exclude<TextRole, 'decorative'>, SizeFloorSpec>>>
> = {
  standard: {
    primary: { hard: 0.046, warn: null },
    secondary: { hard: 0.0185, warn: 0.022 },
    fine: { hard: 0.0185, warn: 0.022 },
  },
  safe: {
    primary: { hard: 0.06, warn: null },
    secondary: { hard: 0.05, warn: null },
    fine: { hard: 0.04, warn: null },
  },
};

/**
 * Floors in CSS pixels at 1920x1080, keyed by `AssemblerId`.
 *
 * `corner-bug` is lower on purpose and is not a relaxation: a corner bug is a persistent
 * station mark read over minutes rather than a line read in four seconds, and the catalog's own
 * bugs are authored at that size. Everything else answers to the default.
 */
export const TYPE_FLOOR_PX: Readonly<Record<string, number>> = {
  'corner-bug': 16,
  default: 20,
};

/** The floor for a category. An unknown category takes the default rather than opting out -
 *  a new category must be readable before it is special. */
export function typeFloorFor(category: string | null | undefined): number {
  return (category && TYPE_FLOOR_PX[category]) || TYPE_FLOOR_PX.default;
}

/**
 * WHAT THE LEAD LINE MUST REACH, BY WHAT THE GRAPHIC IS FOR (owner ruling 2026-09-08:
 * "make it type-aware, not a universal 50px blocker").
 *
 * The 4.6% primary row above is the size a NAME STRAP must reach, and applying it to every
 * graphic's largest text was measured on 2026-09-08 as refusing **322 of 503 shipped designs** -
 * the 64th percentile of our own catalog, including 52 of 101 lower thirds, the category it was
 * written for. It also contradicted a floor this repo had already ratified: `typeFloor.ts` says a
 * corner bug may render at 16px because it "is a persistent station mark read over minutes rather
 * than a line read in four seconds", while this row demanded 49.68px of the same element. All 37
 * shipped bugs failed.
 *
 * The axis is `typeFloor.ts`'s own, and it is not identity but READING TIME:
 *
 * - PERSISTENT - a bug, a ticker, a dense board, an audience panel. Nothing leads it, by design;
 *   the viewer reads it over minutes or scans it. There is no prominence floor at all here, only
 *   the legibility floor the category already answers to (`typeFloorFor`), which is the number
 *   with the July 2026 catalog audit behind it.
 * - CARD - a lower third, an info card, a quiz board, an alert. Read in a few seconds, so its lead
 *   line clears a name-sized minimum. 28px @1080; the shipped p05 across these categories is
 *   27-38px and the lowest passing design is card64 at 29px.
 * - STATEMENT - a versus card, a holding screen, a transition, a clock. The whole graphic exists to
 *   land one line. 42px @1080; the shipped p05 across these is 45-120px.
 *
 * Measured against the catalog these three refuse **8 of 503** (1.6%), and each one is arguable:
 * a person's name at 12px on an imported design, "PRESENTED BY" at 20px, "Back shortly" at 30px on
 * a category whose designs run 64-280px. A floor that certifies the shipped work and still fires
 * is the point; `docs/OWNER_RULINGS.md` 2026-09-08 carries the ruling and the measurement.
 *
 * AN UNLISTED CATEGORY TAKES THE CARD BAND, never an exemption - the same doctrine `typeFloor.ts`
 * states as "a new category must be readable before it is special". Nothing here may return null.
 */
export const PERSISTENT_CATEGORIES: readonly string[] = [
  'corner-bug', 'ticker', 'audience', 'infographic', 'esports-score', 'public-info', 'scoreboard',
  'imported-design',
];

export const STATEMENT_CATEGORIES: readonly string[] = [
  'game-timer', 'versus', 'starting-soon', 'transition', 'reveal', 'matchup',
];

/** Ratios of the reference size: 28px and 42px at a 1080 short side. */
export const PRIMARY_BAND_RATIO = { card: 0.0259, statement: 0.0389 } as const;

/** Safe mode's primary band tops out here - guidance for the prompt, never a violation. */
export const SAFE_PRIMARY_TARGET_MAX_RATIO = 0.1;

export interface SizeFloorPx {
  hardPx: number;
  warnPx: number | null;
}

/** The composed floor in px for one role on one frame. Null for decorative (exempt). */
export function sizeFloorPx(
  role: TextRole,
  mode: LegibilityMode,
  target: ViewingTarget,
  width: number,
  height: number,
  category?: string | null,
): SizeFloorPx | null {
  if (role === 'decorative') return null;
  const ref = referenceSize(width, height);
  const spec = SIZE_TABLE[mode][role];
  const multiplier = PROFILE_MULTIPLIER[target.profile];
  // WHERE A CATEGORY NAMES ITS OWN NUMBER, THAT NUMBER GOVERNS EVERY INFORMATIONAL ROLE. A corner
  // bug's supporting line at 16px was refused by the universal 19.98% secondary row while
  // `TYPE_FLOOR_PX` said 16 was right for it - the same contradiction the primary row carried, and
  // the same argument settles it: what a bug may go down to is a property of being a bug, not of
  // which line in it you are looking at. Measured 2026-09-08: this is 18 of the 26 designs the
  // type-aware primary row alone still refused, and every one is a shipped corner bug.
  //
  // Safe mode keeps the owner's three flat floors as ratified - it is the deliberately
  // conservative mode, and a caller that asks for it is asking for one number.
  const named = category && Object.prototype.hasOwnProperty.call(TYPE_FLOOR_PX, category)
    ? TYPE_FLOOR_PX[category] / ref
    : null;
  const hard = mode !== 'standard'
    ? spec.hard
    : role === 'primary'
      ? primaryFloorRatio(category, ref)
      : named ?? spec.hard;
  return {
    hardPx: hard * ref * multiplier,
    warnPx: spec.warn === null ? null : spec.warn * ref * multiplier,
  };
}

/**
 * The lead line's floor for one category, as a ratio of the reference size.
 *
 * A PERSISTENT graphic gets its own legibility floor and no prominence floor on top - expressed
 * as a ratio of `ref` so it composes with the rest of the table, and read from the same
 * `TYPE_FLOOR_PX` the bench and the adjuster read so the two can never drift apart.
 */
function primaryFloorRatio(category: string | null | undefined, ref: number): number {
  const key = category ?? '';
  if (PERSISTENT_CATEGORIES.includes(key)) return typeFloorFor(key) / ref;
  if (STATEMENT_CATEGORIES.includes(key)) return PRIMARY_BAND_RATIO.statement;
  return PRIMARY_BAND_RATIO.card;
}

export type SizeStatus = 'pass' | 'warn' | 'fail' | 'exempt';

export interface SizeVerdict {
  status: SizeStatus;
  floor: SizeFloorPx | null;
}

export function checkTextSize(
  fontPx: number,
  role: TextRole,
  mode: LegibilityMode,
  target: ViewingTarget,
  width: number,
  height: number,
  category?: string | null,
): SizeVerdict {
  const floor = sizeFloorPx(role, mode, target, width, height, category);
  if (!floor) return { status: 'exempt', floor: null };
  if (fontPx < floor.hardPx) return { status: 'fail', floor };
  if (floor.warnPx !== null && fontPx < floor.warnPx) return { status: 'warn', floor };
  return { status: 'pass', floor };
}

// ── Weight ──────────────────────────────────────────────────────────────────────────────

/** Informational text renders at computed weight >= 400... */
export const WEIGHT_FLOOR = 400;
/** ...and >= 500 when it is small (under the warning-band ratio) or sits over unprotected
 *  video, where thin strokes dissolve into the picture. */
export const WEIGHT_FLOOR_PROTECTED = 500;
/** "Small" for the weight rule: the same ratio as the standard warning band (~24px @1080). */
export const SMALL_TEXT_RATIO = 0.022;

export function weightFloor(
  fontPx: number,
  width: number,
  height: number,
  overUnprotectedVideo: boolean,
): number {
  const ref = referenceSize(width, height);
  return fontPx < SMALL_TEXT_RATIO * ref || overUnprotectedVideo
    ? WEIGHT_FLOOR_PROTECTED
    : WEIGHT_FLOOR;
}

// ── Strokes ─────────────────────────────────────────────────────────────────────────────

/** A FUNCTIONAL stroke (a divider, a rule that separates content) thinner than this fraction
 *  of the reference (~3px @1080) smears through broadcast compression. WARN in v1:
 *  functional-vs-decorative is not deterministically decidable and the house style ships
 *  deliberate hairlines (docs/DESIGN_LANGUAGE.md). */
export const STROKE_FLOOR_RATIO = 0.0028;

export function strokeFloorPx(width: number, height: number): number {
  return STROKE_FLOOR_RATIO * referenceSize(width, height);
}

// ── Safe area ───────────────────────────────────────────────────────────────────────────

/** Field-bound text and brand marks stay this fraction inside EVERY edge (96/54px @1920x1080).
 *  HARD - the catalog's own 119px edge convention sits comfortably inside, so this breaks
 *  nothing shipped. Decoration is exempt: an accent may bleed off the frame on purpose. */
export const SAFE_AREA_INSET_RATIO = 0.05;

export function safeAreaInset(width: number, height: number): { x: number; y: number } {
  return { x: SAFE_AREA_INSET_RATIO * width, y: SAFE_AREA_INSET_RATIO * height };
}

// ── Contrast + protection ───────────────────────────────────────────────────────────────

export const CONTRAST_FLOOR_NORMAL = 4.5;
export const CONTRAST_FLOOR_LARGE = 3;
/** WCAG's large-text cut, expressed against the reference: ~24px @1080, or ~18.7px bold. */
export const LARGE_TEXT_RATIO = 0.022;
export const LARGE_TEXT_BOLD_RATIO = 0.0173;

export function contrastFloor(fontPx: number, weight: number, width: number, height: number): number {
  const ref = referenceSize(width, height);
  const large = fontPx >= LARGE_TEXT_RATIO * ref
    || (weight >= 700 && fontPx >= LARGE_TEXT_BOLD_RATIO * ref);
  return large ? CONTRAST_FLOOR_LARGE : CONTRAST_FLOOR_NORMAL;
}

/** Text whose backing is UNKNOWABLE (a transparent stack over the picture) must carry a
 *  protective treatment detectable from computed style - a panel, a text-shadow, a stroke, or
 *  a scrim gradient behind it. WARN in v1: the owner PASSED a panel-free minimalist anchor
 *  (lt27), so a hard fail would flag an owner-passed design on day one; the audit calibrates. */
export const PROTECTION_REQUIRED_OVER_UNKNOWABLE = true;

// ── Informational vs decorative classification (stated limitation, not hidden) ──────────

/** Field-bound text (`#fN`) and its adjacent labels are informational, ALWAYS. Standalone
 *  static text is informational when its rendered size reaches this fraction of the reference
 *  (~10px @1080); below it, it is classed decorative WITH A WARNING rather than silently -
 *  so a tiny ornament is exempt while an undersized real label still fails its floor. */
export const STATIC_INFORMATIONAL_MIN_RATIO = 0.009;

// ── Per-project legibility settings (R4 productize) ─────────────────────────────────────

/** What the wizard's two legibility controls mean, as ONE tri-state - they are mirrors and
 *  cannot both be on. 'relaxed' is the "Broadcast text sizes" toggle switched OFF: the size
 *  floors demote to warnings and the prompt says honestly that the customer wants a denser,
 *  smaller composition. 'safe' is the "Guaranteed readable size" checkbox switched ON (the
 *  LegibilityMode 'safe' table above). Absent = 'standard'. */
export type LegibilityFloors = 'relaxed' | 'safe';

/**
 * The per-project legibility settings, persisted as an ADDITIVE OPTIONAL field on
 * SavedProject and GraphicDoc (rule 6: additive fields never bump the version). The DEFAULT
 * state serializes to NOTHING - `normalizeLegibility` returns undefined for it - so an
 * untouched project's record is byte-identical to one saved before this existed.
 */
export interface ProjectLegibility {
  /** Where the graphic will be watched. Absent = tv. */
  viewing?: ViewingTarget;
  /** The size-floor tri-state. Absent = 'standard'. */
  floors?: LegibilityFloors;
}

/** The settings resolved for consumers: never absent, every default filled in. */
export interface ResolvedLegibility {
  target: ViewingTarget;
  mode: LegibilityMode;
  /** False only in 'relaxed' - the AI path's size floors demote to warnings, and the
   *  prompt carries the small-by-request note. A deliberate act with a paper trail. */
  floorsBlocking: boolean;
}

export function resolveLegibility(settings?: ProjectLegibility | null): ResolvedLegibility {
  return {
    target: settings?.viewing ?? { profile: 'tv' },
    mode: settings?.floors === 'safe' ? 'safe' : 'standard',
    floorsBlocking: settings?.floors !== 'relaxed',
  };
}

/** The persisted shape, or undefined when everything sits at the default - which is what
 *  keeps an untouched project serializing to nothing. A 'custom' note is kept only on the
 *  custom profile, where it means something. */
export function normalizeLegibility(settings?: ProjectLegibility | null): ProjectLegibility | undefined {
  if (!settings) return undefined;
  const profile = settings.viewing?.profile ?? 'tv';
  const note = profile === 'custom' ? settings.viewing?.note?.trim() || undefined : undefined;
  const viewing: ViewingTarget | undefined =
    profile === 'tv' && !note ? undefined : note ? { profile, note } : { profile };
  const floors = settings.floors;
  if (!viewing && !floors) return undefined;
  return { ...(viewing ? { viewing } : {}), ...(floors ? { floors } : {}) };
}

/** The user-facing words for each profile - one list, so the wizard select and any read-back
 *  cannot drift. 'venue' is honest about being a stub (treated as tv until distance math
 *  exists - owner brief §19). */
export const VIEWING_PROFILE_LABELS: ReadonlyArray<{ id: ViewingProfileId; label: string; hint: string }> = [
  { id: 'tv', label: 'TV', hint: 'living-room distance - the broadcast default' },
  { id: 'streaming', label: 'Streaming overlay', hint: 'desktop and laptop screens' },
  { id: 'mobile', label: 'Mobile', hint: 'phone screens - the largest floors' },
  { id: 'venue', label: 'Venue screen', hint: 'sized as TV for now; describe the room in a note' },
  { id: 'custom', label: 'Custom', hint: 'your own environment - the note travels to the AI' },
];

// ── The prompt block ────────────────────────────────────────────────────────────────────

const px = (n: number) => `${Math.round(n)}px`;

/**
 * The rules as PROSE for the model, generated from the constants above so prompt and
 * measurement cannot drift (one module, zero drift - owner brief §16). Rides the USER
 * message, never the frozen coder system prompt (the benchmark control, src/ai/AGENTS.md).
 */
export function designRulesPromptBlock(
  target: ViewingTarget,
  mode: LegibilityMode,
  format: { width: number; height: number },
  category?: string | null,
): string {
  const { width, height } = format;
  // THE MODEL IS TOLD THIS GRAPHIC'S OWN FLOOR, not the lowest one in the table. A floor a model
  // is told about becomes a target, so quoting the card band at a `versus` card would pull it from
  // 120px to 28px - the ruling that made the floor type-aware would then have cost quality
  // everywhere it did not need to. A caller with no category gets the card band, which is what
  // the gate will hold it to anyway.
  const primary = sizeFloorPx('primary', mode, target, width, height, category);
  const secondary = sizeFloorPx('secondary', mode, target, width, height);
  const fine = sizeFloorPx('fine', mode, target, width, height);
  if (!primary || !secondary || !fine) throw new Error('size table incomplete');
  const inset = safeAreaInset(width, height);
  const ref = referenceSize(width, height);

  const lines: string[] = [
    `BROADCAST LEGIBILITY RULES (${width}x${height}, viewed on ${target.profile}${target.note ? ` - ${target.note}` : ''}). These constrain failure, never style - within them, design freely:`,
    `- Primary text (names, scores, clocks, headlines) renders at ${px(primary.hardPx)} or larger.`
      + (mode === 'safe' ? ` Aim for ${px(primary.hardPx)}-${px(SAFE_PRIMARY_TARGET_MAX_RATIO * ref * PROFILE_MULTIPLIER[target.profile])}.` : ''),
    `- Supporting text (titles, captions, context) renders at ${px(secondary.hardPx)} or larger`
      + (secondary.warnPx !== null ? `; prefer ${px(secondary.warnPx)}+` : '')
      + `. Fine print at ${px(fine.hardPx)} or larger - and avoid fine print at all where you can.`,
    '- Decorative text (ornament that happens to be letters) is exempt from size floors but must still be legible against its backing if it carries words a viewer should read.',
    `- Informational text uses font-weight ${WEIGHT_FLOOR} or heavier; use ${WEIGHT_FLOOR_PROTECTED}+ when it is small (under ${px(SMALL_TEXT_RATIO * ref)}) or sits directly over video.`,
    `- Text contrast: at least ${CONTRAST_FLOOR_NORMAL}:1 against its backing (${CONTRAST_FLOOR_LARGE}:1 for large text). Text sitting on a transparent area over the picture MUST carry protection the viewer can see: a panel, a scrim gradient, a text-shadow or an outline.`,
    `- Keep every data field and any brand mark at least ${px(inset.x)} from the left/right edges and ${px(inset.y)} from the top/bottom edges (the safe area). Decorative shapes may bleed.`,
    `- Functional strokes (dividers, rules that separate content) are at least ${px(strokeFloorPx(width, height))} thick; purely decorative hairlines are fine.`,
    '- NOTHING may collide: no accent line or rule over text, no text over text, no element overlapping the brand mark. A collision is never acceptable on any graphic type.',
    '- A ticker/crawl band runs full-bleed or carries EQUAL side margins - never one margin.',
  ];
  if (mode === 'safe') {
    lines.push(
      '- GUARANTEED-READABLE MODE: design FOR big type from the start - fewer fields, a simpler composition, generous panels. Never shrink type to fit a busy layout; remove from the layout instead.',
    );
  }
  return lines.join('\n');
}

/**
 * The prompt block for a PROJECT's resolved legibility settings - what the product AI
 * surfaces render into the user message. Standard and safe modes are the rules block above
 * verbatim. 'relaxed' (the "Broadcast text sizes" toggle OFF) keeps the block as guidance
 * and states the owner-ratified honesty line: small-by-request is a deliberate act with a
 * paper trail, never a silent bypass.
 */
export function legibilityPromptBlock(
  legibility: ResolvedLegibility,
  format: { width: number; height: number },
): string {
  const block = designRulesPromptBlock(legibility.target, legibility.mode, format);
  if (legibility.floorsBlocking) return block;
  return (
    `${block}\n`
    + '- SIZE FLOORS RELAXED BY THE CUSTOMER: the customer explicitly wants a denser/smaller '
    + 'composition - keep it as legible as you can at their scale. The size floors above are '
    + 'guidance here, not hard limits; everything else still binds.'
  );
}
