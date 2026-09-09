// DECLARED template metadata — the small hand-authored sliver of the discovery facets
// (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §11). Everything derivable is computed in
// templateMeta.ts; this file holds only what no canonical source can answer: which graphic
// category a template is, its subtype, its information structure, and what each field MEANS.
//
// Resolution order (templateMeta.ts): VARIANT_META[variant.id] → TYPE_META[variant.typeId]
// → CATEGORY_DEFAULT_META[variant.category]. The fallback is always single-valued
// (proposal §4), so a variant nobody has described yet still browses sanely.

import type { AssemblerId } from '../model/wizard';
import type {
  CapabilityId,
  CoverageClass,
  FieldSemantic,
  GraphicCategoryId,
  OccasionId,
  StructureId,
} from '../model/taxonomy';

export interface DeclaredTemplateMeta {
  /** The ONE primary graphic category (predictable browsing). */
  category: GraphicCategoryId;
  /** From the category's controlled subtype list. */
  subtype?: string;
  structures: StructureId[];
  /** Overrides the category's default coverage class (proposal §8). */
  coverage?: CoverageClass;
  /** Field meanings. For typed variants keyed by the type's LOGICAL field key; the
   *  positional array form serves unclaimed variants (index = line index). */
  semantics?: Record<string, FieldSemantic>;
  positionalSemantics?: FieldSemantic[];
  /** Capabilities no derivation can see (proposal §7) — most derive in templateMeta.ts. */
  extraCapabilities?: CapabilityId[];
}

// ── Per-type declarations (cover the 48 type-compiled designs) ──────────────

export const TYPE_META: Record<string, DeclaredTemplateMeta> = {
  'lower-third': {
    category: 'lower-third', subtype: 'speaker', structures: ['name-role'],
    semantics: { name: 'name', title: 'role' },
  },
  'sponsor-bug': {
    category: 'bug', subtype: 'sponsor', structures: ['corner-chip', 'logo-text'],
    semantics: { caption: 'headline', logo: 'logo' },
  },
  'social-bug': {
    category: 'bug', subtype: 'social-handle', structures: ['corner-chip', 'single-line'],
    semantics: { handle: 'social-handle', platform: 'source' },
  },
  'event-notification': {
    category: 'notification', subtype: 'event-notification', structures: ['image-text', 'multi-line'],
    coverage: 'overlay',
    semantics: {
      eventLabel: 'headline',
      actor: 'name',
      amount: 'amount',
      message: 'description',
      avatar: 'image',
    },
    extraCapabilities: ['operator-states', 'image-upload', 'pause-resume'],
  },

  // ── The identity family (templates/types/identityBugs.ts) ──────────────────
  // All eight are `bug` graphics; the subtype is what an operator would call each one.
  'station-bug': {
    category: 'bug', subtype: 'station', structures: ['corner-chip', 'logo-text'],
    semantics: { channel: 'organization', show: 'topic', logo: 'logo' },
  },
  'live-bug': {
    category: 'bug', subtype: 'live', structures: ['corner-chip', 'single-line'],
    // The three mode words are operator copy, not three separate meanings: each is the
    // headline this bug shows while it is in that state.
    semantics: {
      status: 'headline', liveWord: 'headline', replayWord: 'headline', standbyWord: 'headline',
    },
    // The machine's three modes are the graphic's point — see identityBugs.ts.
    extraCapabilities: ['operator-states'],
  },
  'logo-bug': {
    category: 'bug', subtype: 'logo-only', structures: ['corner-chip', 'image-text'],
    semantics: { logo: 'logo' },
  },
  'sponsor-strip': {
    category: 'bug', subtype: 'sponsor', structures: ['strip', 'logo-text'],
    semantics: { kicker: 'headline', sponsor1: 'logo', sponsor2: 'logo', sponsor3: 'logo' },
  },
  'sponsor-rotator': {
    category: 'bug', subtype: 'sponsor', structures: ['corner-chip', 'logo-text'],
    semantics: { kicker: 'headline', sponsor1: 'logo', sponsor2: 'logo', sponsor3: 'logo' },
    // It advances on its own AND the operator can hold or skip it.
    extraCapabilities: ['sponsor-rotation', 'operator-states'],
  },
  'event-bug': {
    category: 'bug', subtype: 'event', structures: ['corner-chip', 'logo-text'],
    semantics: { event: 'headline', detail: 'description', logo: 'logo' },
  },
  'award-bug': {
    category: 'bug', subtype: 'award', structures: ['corner-chip', 'logo-text'],
    // Inverted hierarchy: the award word is the label, the category is what you read.
    semantics: { award: 'headline', category: 'topic', logo: 'logo' },
  },
  'status-chip': {
    category: 'bug', subtype: 'location', structures: ['corner-chip', 'single-line'],
    semantics: { place: 'location', status: 'headline' },
  },
  'countdown': {
    category: 'timer', subtype: 'countdown', structures: ['single-line'],
    semantics: { label: 'headline', minutes: 'duration' },
    extraCapabilities: ['countdown', 'pause-resume'],
  },
  // A TIMER, not a scoreboard. The speaking-timer type rides the scoreboard ASSEMBLER — the
  // one built for design-owned fields and a two-sided board — but what a chair reaches for it
  // by is a clock, so this is where that disagreement is settled. `assembler !== browse
  // category` is exactly what this file exists for (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18).
  'speaking-timer': {
    category: 'timer', subtype: 'speaking-timer', structures: ['two-person', 'strip'],
    semantics: {
      round: 'topic',
      sideA: 'team', speakerA: 'name',
      sideB: 'team', speakerB: 'name',
      clockA: 'duration', clockB: 'duration',
      allowance: 'duration', allowanceWord: 'description',
      penalty: 'duration',
    },
    extraCapabilities: ['countdown', 'operator-states', 'pause-resume'],
  },
  'topic-card': {
    category: 'topic', subtype: 'topic', structures: ['multi-line'],
    semantics: { heading: 'headline', line1: 'description', line2: 'description' },
  },
  'title-card': {
    category: 'title', subtype: 'session-title', structures: ['multi-line'],
    semantics: { title: 'headline', kicker: 'topic', subtitle: 'description' },
  },
  'agenda': {
    category: 'list', subtype: 'agenda', structures: ['rows'],
    semantics: { rows: 'items', heading: 'headline' },
    extraCapabilities: ['repeating'],
  },
  'poll': {
    category: 'poll-quiz', subtype: 'poll-result', structures: ['bars'],
    semantics: { options: 'items', question: 'question' },
    extraCapabilities: ['poll-states', 'repeating'],
  },
  'holding-screen': {
    category: 'holding', subtype: 'starting', structures: ['full-panel'], coverage: 'full',
    semantics: { title: 'headline', show: 'topic', minutes: 'duration' },
    extraCapabilities: ['countdown', 'loop'],
  },
  'ticker': {
    category: 'ticker', subtype: 'rotator', structures: ['strip'], coverage: 'strip',
    semantics: { items: 'items', label: 'headline' },
    extraCapabilities: ['ticker', 'repeating', 'loop', 'pause-resume', 'operator-states'],
  },
  'scoreboard': {
    category: 'scoreboard', subtype: 'match-score', structures: ['strip', 'logo-text'],
    semantics: { teamA: 'team', scoreA: 'score', teamB: 'team', scoreB: 'score' },
    extraCapabilities: ['score-controls', 'clock', 'pause-resume', 'operator-states'],
  },
  'podium-score': {
    category: 'scoreboard', subtype: 'podium', structures: ['strip', 'multi-person'],
    // Positional over the type's field order (heading, then name/score × 4); the trailing
    // spotlight index has no honest semantic and falls through to the default.
    semantics: {
      heading: 'headline',
      name1: 'name', score1: 'score',
      name2: 'name', score2: 'score',
      name3: 'name', score3: 'score',
      name4: 'name', score4: 'score',
    },
    extraCapabilities: ['score-controls', 'operator-states'],
  },
  'quiz-board': {
    category: 'poll-quiz', subtype: 'quiz-question', structures: ['rows', 'full-panel'],
    coverage: 'panel',
    semantics: {
      question: 'question', answerA: 'answer', answerB: 'answer', answerC: 'answer',
      answerD: 'answer', correctAnswer: 'answer', selectedAnswer: 'answer',
    },
    extraCapabilities: ['quiz-states', 'operator-states', 'multi-step'],
  },

  // ── The title / topic / information pack (templates/pack4/) ─────────────────
  // The seven shapes the opener and the topic card were being made to stand in for. Each names
  // the graphic CATEGORY an operator would browse it under — a now/next card is not a title, a
  // notice is not a topic — so they scatter across topic / quote / info / alert / list rather
  // than piling into one 'info' bucket.
  'now-next': {
    category: 'topic', subtype: 'now-playing', structures: ['multi-line'],
    semantics: { nowLabel: 'headline', now: 'topic', nowMeta: 'description', nextLabel: 'headline', next: 'topic' },
  },
  'headline-card': {
    category: 'quote', subtype: 'headline', structures: ['multi-line'],
    semantics: { kicker: 'topic', headline: 'headline', body: 'description', source: 'source' },
  },
  'process-steps': {
    category: 'info', subtype: 'step', structures: ['multi-line'],
    semantics: { heading: 'headline', step1: 'description', step2: 'description', step3: 'description', step4: 'description' },
    // Stepped by construction — the reveal is the graphic (TemplateVariant.defaultSteps).
    extraCapabilities: ['multi-step'],
  },
  'notice-card': {
    category: 'alert', subtype: 'notice', structures: ['multi-line'],
    semantics: { label: 'headline', headline: 'headline', body: 'description', action: 'description', contact: 'source' },
    // The parallel `level` group escalates and stands down while on air (briefings.ts).
    extraCapabilities: ['alert-state', 'operator-states'],
  },
  'statement-card': {
    category: 'quote', subtype: 'quote', structures: ['multi-line'],
    semantics: { label: 'headline', primary: 'description', secondary: 'description', attribution: 'source' },
  },
  'key-facts': {
    category: 'info', subtype: 'explainer', structures: ['rows'],
    semantics: { facts: 'items', heading: 'headline' },
    extraCapabilities: ['repeating'],
  },
  'recap-card': {
    category: 'list', subtype: 'order', structures: ['rows'],
    semantics: { items: 'items', heading: 'headline' },
    extraCapabilities: ['repeating'],
  },
  // ── The gap-list pack (types/commerce.ts, goals.ts, transitions.ts) ──
  'product-card': {
    category: 'product', subtype: 'product-card', structures: ['image-text', 'multi-line'],
    semantics: { product: 'headline', price: 'price', was: 'price', saving: 'discount', detail: 'description', image: 'image' },
  },
  'offer-card': {
    category: 'product', subtype: 'price', structures: ['multi-line'],
    semantics: { kicker: 'headline', offer: 'discount', detail: 'description', code: 'description', ends: 'date' },
  },
  'listing-card': {
    category: 'product', subtype: 'lot-bid', structures: ['image-text', 'multi-line'],
    semantics: { title: 'headline', meta: 'description', valueLabel: 'description', value: 'price', status: 'description', image: 'image' },
  },
  'qr-card': {
    category: 'cta', subtype: 'qr', structures: ['image-text', 'multi-line'],
    semantics: { headline: 'headline', address: 'url', detail: 'description', code: 'qr-content' },
  },
  'call-to-action': {
    category: 'cta', subtype: 'follow', structures: ['single-line', 'multi-line'],
    semantics: { action: 'headline', target: 'url', detail: 'description' },
  },
  'goal-meter': {
    category: 'progress', subtype: 'donation-goal', structures: ['bars'],
    semantics: { raised: 'amount', goal: 'amount', label: 'headline', unit: 'description' },
  },
  'milestone-track': {
    category: 'progress', subtype: 'milestone', structures: ['bars'],
    semantics: { milestones: 'items', current: 'amount', label: 'headline' },
  },
  'transition': {
    category: 'transition', subtype: 'stinger', structures: ['full-panel'], coverage: 'full',
    semantics: { label: 'headline' },
  },
  // ── The timing tower (templates/types/competitionBoards.ts) ────────────────
  //
  // The one results-board type with a declaration of its own. The others take the category
  // fallback ('leaderboard'), which is right for them and wrong for this: a tower is a live
  // session, not a settled table, and 'timing-tower' is the subtype an operator — or a search
  // that has to ground a brief — actually reaches for.
  'timing-tower': {
    category: 'results', subtype: 'timing-tower', structures: ['rows', 'side-panel'],
    semantics: { title: 'headline', subtitle: 'description', order: 'items' },
    // The focus moves and the flag falls while the graphic is on air, and the running order
    // is retyped underneath both.
    extraCapabilities: ['repeating', 'operator-states', 'live-data'],
  },

  // ── The public-service pack (templates/alerts, templates/publicInfo) ────────
  // Neither type gets a graphic category of its own. An alert IS the `alert` category — the
  // same tile pack4's notice-card already browses under, which is the point: two designs of
  // the same graphic must not land on two tiles. The two-language notice is a TRANSLATION,
  // which is what the `caption` category's 'translation' subtype is for.
  'alert-level': {
    category: 'alert', subtype: 'warning', structures: ['strip', 'multi-line'],
    semantics: { headline: 'headline', detail: 'description', source: 'source' },
    // The four severity states are the graphic's point (types/alertLevel.ts).
    extraCapabilities: ['alert-state', 'operator-states'],
  },
  'public-notice': {
    category: 'caption', subtype: 'translation', structures: ['multi-line'], coverage: 'panel',
    semantics: {
      heading1: 'headline', notice1: 'description',
      heading2: 'headline', notice2: 'description', source: 'source',
    },
    // The languages take turns on the graphic's own timer, and the operator can hold one.
    extraCapabilities: ['operator-states'],
  },
};

// ── Per-variant declarations (the ~30 unclaimed hand-written designs where the
// ── category fallback would be wrong — proposal §4's split table) ───────────

export const VARIANT_META: Record<string, DeclaredTemplateMeta> = {
  // infographic split (§4): the fallback for the category is 'stats'.
  ig01: { category: 'stats', subtype: 'stat-panel', structures: ['single-line', 'bars'], positionalSemantics: ['headline', 'percentage'] },
  ig03: { category: 'results', subtype: 'leaderboard', structures: ['rows'], positionalSemantics: ['headline', 'items'], extraCapabilities: ['repeating'] },
  ig04: { category: 'poll-quiz', subtype: 'poll-result', structures: ['bars'], positionalSemantics: ['percentage', 'answer', 'question'], extraCapabilities: ['poll-states'] },
  ig05: { category: 'progress', subtype: 'donation-goal', structures: ['bars'], positionalSemantics: ['amount', 'amount', 'topic'], extraCapabilities: ['progress'] },
  // The nine candidate fields, then the board's own two headings (its title and the status
  // flag beside it) — both operator fields, so the same board serves any count night.
  ig07: { category: 'poll-quiz', subtype: 'vote', structures: ['bars', 'rows'], positionalSemantics: ['name', 'organization', 'percentage', 'name', 'organization', 'percentage', 'name', 'organization', 'percentage', 'headline', 'topic'], extraCapabilities: ['poll-states'] },
  // The ELECTION NIGHT mini-pack (ig34-ig36). They file under three different categories on
  // purpose: a seat board IS a results board, a majority meter is a progress graphic that
  // happens to be about seats, and a turnout dial is a statistic. An operator on a count night
  // reaches for each of them by that word, not by "election" - and the programme format
  // ('election-night') is what actually gathers them, which is ranking, not filing.
  ig34: { category: 'results', subtype: 'seat-count', structures: ['bars', 'rows'], positionalSemantics: ['items', 'organization', 'topic', 'topic'], extraCapabilities: ['repeating'] },
  ig35: { category: 'progress', subtype: 'progress-bar', structures: ['bars', 'single-line'], positionalSemantics: ['score', 'score', 'score', 'organization'], extraCapabilities: ['progress'] },
  ig36: { category: 'stats', subtype: 'stat-panel', structures: ['single-line'], positionalSemantics: ['percentage', 'headline', 'percentage', 'topic'] },
  // The WEATHER mini-pack (lt62 / ig37 / bug37). Its field TITLES are the Production Data API
  // contract (scripts/weather-feed.mjs addresses them by label - see each design's header), and
  // it files by what each graphic IS: a current-conditions strap is a locator lower third, a
  // forecast board is a statistics panel, a temperature chip is a location bug. The 'weather'
  // PROGRAMME FORMAT is what gathers them - ranking, not filing (the election pack's rule).
  lt62: { category: 'lower-third', subtype: 'locator', structures: ['multi-line'], positionalSemantics: ['location', 'amount', 'description', 'description'] },
  ig37: { category: 'stats', subtype: 'stat-panel', structures: ['grid', 'multi-line'], positionalSemantics: ['headline', 'date', 'amount', 'amount', 'description', 'date', 'amount', 'amount', 'description', 'date', 'amount', 'amount', 'description'] },
  // The count-night SIDE RAIL. It files under results beside ig34 for the same reason - an
  // operator reaches for it as a results board - but its structure is declared as a side panel,
  // which is the placement that makes it a different graphic from the centre-frame boards.
  ig38: { category: 'results', subtype: 'vote-result', structures: ['side-panel', 'rows'], coverage: 'panel', positionalSemantics: ['items', 'topic', 'headline', 'description', 'topic'], extraCapabilities: ['repeating'] },
  // The two-column stat list. It files as a statistics panel rather than under results: the
  // rows are figures being stated, not a contest being reported, and an operator reaches for it
  // by "the key figures board". TABLE is the structure that separates it from the facts boards
  // (ig14-ig17), which set a term over its explanation and have no second column at all.
  ig39: { category: 'stats', subtype: 'stat-panel', structures: ['table', 'rows'], positionalSemantics: ['items', 'headline', 'date', 'source', 'date'], extraCapabilities: ['repeating'] },
  bug37: { category: 'bug', subtype: 'location', structures: ['corner-chip'], positionalSemantics: ['amount', 'location'] },
  // info-card split (§4): card04 turned out to be a QUOTE card (Quote + Name + Role) — the
  // quote category's first catalog content, found by the factory's schema-length assertion.
  card04: { category: 'quote', subtype: 'quote', structures: ['multi-line', 'name-role'], positionalSemantics: ['description', 'name', 'role'] },
  // The gap-list pack's four TYPELESS cards (docs/PACK_TAXONOMY.md, "known limitations"): a
  // family whose field COUNT varies cannot be one graphic type, so these stayed hand-written —
  // and a hand-written info-card falls to the category default, which files a venue marker and
  // a partner board as 'explainer'. Declared here so they browse as what they are.
  // card46/47 are LOCATION cards: the pin is a drawn marker over an operator-supplied picture,
  // never a plotted coordinate, which is why 'map-pin' and not 'map'.
  card46: { category: 'map', subtype: 'map-pin', structures: ['image-text', 'multi-line'], positionalSemantics: ['location', 'location', 'description', 'image'] },
  card47: { category: 'map', subtype: 'map-pin', structures: ['multi-line'], positionalSemantics: ['location', 'location', 'description'] },
  // card48/49 are SPONSOR boards — a strip of four slots and a 3 x 2 grid of six. Neither
  // rotates (the ticker type is the one that cycles, and it earns it with a real machine).
  card48: { category: 'sponsor', subtype: 'logo-strip', structures: ['strip', 'logo-text'], positionalSemantics: ['headline', 'logo', 'logo', 'logo', 'logo'] },
  card49: { category: 'sponsor', subtype: 'panel', structures: ['grid', 'logo-text'], positionalSemantics: ['headline', 'description', 'logo', 'logo', 'logo', 'logo', 'logo', 'logo'] },
  // Editorial and cinematic information systems. Typed variants are overridden only where the
  // design's editorial job is more precise than its reusable field contract.
  card59: { category: 'title', subtype: 'segment-title', structures: ['multi-line'], semantics: { title: 'headline', kicker: 'topic', subtitle: 'description' } },
  card60: { category: 'topic', subtype: 'coming-up', structures: ['multi-line'], semantics: { nowLabel: 'headline', now: 'topic', nowMeta: 'description', nextLabel: 'headline', next: 'topic' } },
  card61: { category: 'quote', subtype: 'fact-check', structures: ['multi-line'], semantics: { kicker: 'topic', headline: 'headline', body: 'description', source: 'source' } },
  card62: { category: 'info', subtype: 'explainer', structures: ['multi-line'], semantics: { kicker: 'topic', headline: 'headline', body: 'description', source: 'source' } },
  card64: { category: 'results', subtype: 'results-table', structures: ['table', 'rows'], positionalSemantics: ['headline', 'items', 'items', 'items', 'source'] },
  card65: { category: 'sponsor', subtype: 'sponsor-read', structures: ['multi-line'], positionalSemantics: ['headline', 'description', 'description', 'source'] },
  card66: { category: 'caption', subtype: 'caption', structures: ['strip', 'multi-line'], coverage: 'strip', positionalSemantics: ['name', 'description', 'source'] },
  card67: { category: 'topic', subtype: 'chapter', structures: ['multi-line'], semantics: { title: 'headline', kicker: 'topic', subtitle: 'description' } },
  card70: { category: 'bug', subtype: 'location', structures: ['multi-line'], coverage: 'overlay', positionalSemantics: ['location', 'location', 'description'] },
  card71: { category: 'caption', subtype: 'lyrics', structures: ['strip', 'multi-line'], coverage: 'strip', positionalSemantics: ['description', 'description', 'source'] },

  // ── The SPECIALIST lower thirds (templates/lowerThirds/specialist, ls01…ls40) ──
  //
  // These are declared per variant rather than left to the lower-third fallback, because the
  // fallback's single value is exactly what they are not: it calls every strap a two-field
  // 'speaker' with a 'name-role' structure, which would file a two-person interview strap, a
  // squad-number tag and a world clock as the same graphic. The subtype and structure here are
  // what let Browse tell them apart, and the positional semantics are what make the card's
  // field summary read truthfully ("Name · Role · Name · Role", not "Name · Role · Org").
  //
  // Interview — two people, equal billing.
  ls01: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'role', 'name', 'role'] },
  ls02: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'role', 'name', 'role'] },
  ls03: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'role', 'name', 'role'] },
  // Host & guest — the same two-person structure, deliberately unequal billing.
  ls04: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'role', 'name', 'role'] },
  ls05: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'role', 'name', 'role'] },
  // Commentary — the booth, named as a unit under its own header.
  ls06: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'multi-line'], positionalSemantics: ['headline', 'name', 'role', 'name', 'role'] },
  ls07: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'single-line'], positionalSemantics: ['headline', 'name', 'name'] },
  // Sport — the athlete.
  ls08: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'multi-line'], positionalSemantics: ['score', 'name', 'role', 'team'] },
  ls09: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'table'], positionalSemantics: ['name', 'team', 'score', 'score', 'score'] },
  ls10: { category: 'lower-third', subtype: 'name-tag', structures: ['logo-text', 'name-role'], positionalSemantics: ['name', 'role', 'team'] },
  // Esports — tags, handles and the desk.
  ls11: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'multi-line'], positionalSemantics: ['team', 'name', 'role', 'organization'] },
  ls12: { category: 'lower-third', subtype: 'speaker', structures: ['name-role'], positionalSemantics: ['social-handle', 'name', 'role'] },
  ls13: { category: 'lower-third', subtype: 'two-person', structures: ['two-person', 'name-role'], positionalSemantics: ['name', 'social-handle', 'name', 'social-handle'] },
  // Worship — the register that must not interrupt.
  ls14: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['role', 'name', 'organization'] },
  ls15: { category: 'lower-third', subtype: 'speaker', structures: ['multi-line', 'name-role'], positionalSemantics: ['topic', 'source', 'name', 'role'] },
  ls16: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['topic', 'name', 'role'] },
  // Academic — the person and the institution behind them.
  ls17: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['name', 'role', 'role', 'organization'] },
  ls18: { category: 'lower-third', subtype: 'speaker', structures: ['logo-text', 'name-role'], positionalSemantics: ['name', 'role', 'organization'] },
  ls19: { category: 'lower-third', subtype: 'speaker', structures: ['multi-line', 'name-role'], positionalSemantics: ['topic', 'name', 'organization', 'time'] },
  // Politics — the party colour is the identity.
  ls20: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'multi-line'], positionalSemantics: ['organization', 'name', 'location', 'percentage'] },
  ls21: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role'], positionalSemantics: ['name', 'organization', 'location'] },
  ls22: { category: 'lower-third', subtype: 'speaker', structures: ['name-role'], positionalSemantics: ['name', 'role', 'organization'] },
  // Analysis — marking interpretation, and marking expertise.
  ls23: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['headline', 'name', 'role', 'topic'] },
  ls24: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['topic', 'name', 'role'] },
  // Music — the track, the billing, and the programme.
  ls25: { category: 'lower-third', subtype: 'name-tag', structures: ['image-text', 'multi-line'], positionalSemantics: ['topic', 'name', 'description'] },
  ls26: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'multi-line'], positionalSemantics: ['name', 'topic', 'location'] },
  ls27: { category: 'lower-third', subtype: 'name-tag', structures: ['multi-line', 'name-role'], positionalSemantics: ['score', 'topic', 'name', 'duration'] },
  // Live & location — where, and when.
  ls28: { category: 'lower-third', subtype: 'live-tag', structures: ['single-line', 'multi-line'], positionalSemantics: ['headline', 'location', 'location'] },
  ls29: { category: 'lower-third', subtype: 'locator', structures: ['name-role', 'multi-line'], positionalSemantics: ['location', 'name', 'role'] },
  // ls30's fourth field is the hidden UTC offset the clock runtime reads — an input-only
  // value, but a real DataField, so the positional array has to account for it.
  ls30: { category: 'lower-third', subtype: 'locator', structures: ['single-line', 'multi-line'], positionalSemantics: ['location', 'time', 'description', 'duration'] },
  // Creator — handles and stream identity.
  ls31: { category: 'lower-third', subtype: 'name-tag', structures: ['multi-line', 'single-line'], positionalSemantics: ['name', 'description', 'social-handle', 'social-handle', 'social-handle'] },
  ls32: { category: 'lower-third', subtype: 'name-tag', structures: ['name-role', 'multi-line'], positionalSemantics: ['social-handle', 'name', 'headline', 'amount'] },
  // Broadcast journalism — straps whose subject is the WORDS or their status, not the person.
  ls33: { category: 'lower-third', subtype: 'speaker', structures: ['multi-line', 'name-role'], positionalSemantics: ['headline', 'name', 'role'] },
  ls34: { category: 'lower-third', subtype: 'speaker', structures: ['multi-line'], positionalSemantics: ['topic', 'description', 'topic', 'description'] },
  ls35: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['topic', 'name', 'location'] },
  // ls36's fourth field is the hidden UTC offset the clock runtime reads — an input-only
  // value, but a real DataField, so the positional array has to account for it.
  ls36: { category: 'lower-third', subtype: 'locator', structures: ['multi-line', 'single-line'], positionalSemantics: ['location', 'location', 'time', 'duration'] },
  ls37: { category: 'lower-third', subtype: 'live-tag', structures: ['single-line', 'multi-line'], positionalSemantics: ['topic', 'headline'] },
  ls38: { category: 'lower-third', subtype: 'live-tag', structures: ['multi-line'], positionalSemantics: ['topic', 'headline', 'time'] },
  ls39: { category: 'lower-third', subtype: 'name-tag', structures: ['multi-line'], positionalSemantics: ['answer', 'headline', 'source'] },
  ls40: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['name', 'organization', 'role', 'topic'] },
  // The creator strap whose avatar is a real image field - so it declares the picture slot the
  // other two creator designs (ls31, ls32) have no room for.
  ls41: { category: 'lower-third', subtype: 'name-tag', structures: ['image-text', 'multi-line'], positionalSemantics: ['social-handle', 'social-handle', 'topic'], extraCapabilities: ['image-upload'] },

  // ── The PUBLIC-SERVICE pack's tickers (tk11…tk17, tk20) ────────────────────
  //
  // The ticker fallback calls every strip a 'news-ticker', which is right for the wire strips
  // it was written for and wrong for these: a travelling crawl, an index board and a
  // double-decker are three things an operator picks between by name. tk18/tk19 are compiled
  // by the `ticker` TYPE and browse as 'rotator' from there.
  tk11: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'topic', 'source', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  tk12: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'headline', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  tk13: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'headline', 'topic', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  tk14: { category: 'ticker', subtype: 'market-ticker', structures: ['strip'], positionalSemantics: ['items', 'headline', 'topic', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop', 'live-data'] },
  tk15: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'headline', 'source', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  tk16: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'headline', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  tk17: { category: 'ticker', subtype: 'crawl', structures: ['strip'], positionalSemantics: ['items', 'headline', 'source', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  // The double-decker holds the current story STILL above the crawl, which is what makes it a
  // news ticker rather than one more crawl.
  tk20: { category: 'ticker', subtype: 'news-ticker', structures: ['strip', 'multi-line'], positionalSemantics: ['items', 'topic', 'headline', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },
  // The markets double-decker: the same held-still deck over a crawl, filed as a MARKET ticker
  // because that is the word an operator reaches for it by.
  tk22: { category: 'ticker', subtype: 'market-ticker', structures: ['strip', 'multi-line'], positionalSemantics: ['items', 'topic', 'headline', 'speed'], extraCapabilities: ['ticker', 'repeating', 'loop'] },

  // ── The PUBLIC-SERVICE pack's alerts (templates/alerts) ────────────────────
  //
  // al01/al02/al04 take the `alert-level` TYPE_META above unchanged. The three declared here
  // are the ones whose SHAPE differs from the flat band: a contained corner panel, a
  // met-office card, and the card that takes the whole frame.
  al03: { category: 'alert', subtype: 'warning', structures: ['multi-line'], coverage: 'panel', semantics: { headline: 'headline', detail: 'description', source: 'source' }, extraCapabilities: ['alert-state', 'operator-states'] },
  al05: { category: 'alert', subtype: 'warning', structures: ['multi-line'], coverage: 'panel', semantics: { headline: 'headline', detail: 'description', source: 'source' }, extraCapabilities: ['alert-state', 'operator-states'] },
  al06: { category: 'alert', subtype: 'emergency', structures: ['full-panel', 'multi-line'], coverage: 'full', semantics: { headline: 'headline', detail: 'description', source: 'source' }, extraCapabilities: ['alert-state', 'operator-states'] },
  // The four single-state notices. None carries a severity flag, so none claims 'alert-state':
  // the capability facet has to mean the graphic really offers the ladder.
  al07: { category: 'alert', subtype: 'status', structures: ['strip', 'multi-line'], positionalSemantics: ['description', 'description'] },
  al08: { category: 'alert', subtype: 'status', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description'], extraCapabilities: ['clock'] },
  al09: { category: 'alert', subtype: 'breaking', structures: ['strip', 'multi-line'], positionalSemantics: ['topic', 'headline', 'source'] },
  al10: { category: 'alert', subtype: 'notice', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'time'] },
  al11: { category: 'alert', subtype: 'breaking', structures: ['strip', 'multi-line'], positionalSemantics: ['topic', 'headline', 'source'] },
  al13: { category: 'alert', subtype: 'breaking', structures: ['strip', 'multi-line'], positionalSemantics: ['topic', 'headline', 'topic', 'time'] },

  // ── The PUBLIC-SERVICE pack's public information (templates/publicInfo) ────
  //
  // These SCATTER, which is why every one of them is declared. An official notice is an alert
  // in everything but tone; a numbered instruction and a page of small print are information
  // cards; a bilingual panel is a translation; a source label is a corner bug. Filing all nine
  // under one tile would have put pi01 on a different tile from pack4's notice-card, which is
  // the same graphic. pi08/pi09 come from the `public-notice` TYPE_META above.
  pi01: { category: 'alert', subtype: 'notice', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'organization'] },
  pi02: { category: 'info', subtype: 'step', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'description', 'description', 'organization'], extraCapabilities: ['multi-step'] },
  pi03: { category: 'bug', subtype: 'source', structures: ['corner-chip', 'single-line'], coverage: 'overlay', positionalSemantics: ['source', 'description'] },
  pi04: { category: 'info', subtype: 'disclaimer', structures: ['strip'], coverage: 'strip', positionalSemantics: ['description', 'source'] },
  pi05: { category: 'alert', subtype: 'notice', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'description', 'organization'] },
  pi06: { category: 'info', subtype: 'explainer', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'description', 'organization'] },
  pi07: { category: 'caption', subtype: 'translation', structures: ['multi-line'], coverage: 'panel', positionalSemantics: ['headline', 'description', 'headline', 'description', 'organization'] },
  pi10: { category: 'bug', subtype: 'source', structures: ['corner-chip', 'multi-line'], coverage: 'overlay', positionalSemantics: ['source', 'description'] },

  // ── The TYPOGRAPHIC VOICES pack (docs/CATALOG_VARIETY.md §3, "what is missing entirely") ──
  //
  // Declared where the design's fields are NOT what its category's fallback assumes. The
  // lower-third fallback reads every strap as name / role / organization, and none of these
  // three is: a byline leads with its section, a poster billing splits one name across two
  // fields, and the quiet strap's third line is a show rather than an employer. The four cards
  // are titles and topics rather than the 'explainer' an undeclared info card falls back to.
  lt59: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['topic', 'name', 'role', 'organization'] },
  lt60: { category: 'lower-third', subtype: 'speaker', structures: ['name-role', 'multi-line'], positionalSemantics: ['name', 'role', 'topic'] },
  lt61: { category: 'lower-third', subtype: 'name-tag', structures: ['multi-line', 'name-role'], positionalSemantics: ['topic', 'name', 'name', 'description'] },
  // The THREE SHAPE designs (docs/CATALOG_WORK_QUEUE.md §1). Their structures are declared
  // because the shape IS the discovery fact about them: 99 of 103 lower thirds are an inset
  // horizontal plate, and 'strip' / 'side-panel' are how someone browsing for a band or a
  // standing column finds the three that are not. Their semantics are declared for the usual
  // reason - none of the three ends on the 'organization' the category fallback assumes.
  lt63: { category: 'lower-third', subtype: 'speaker', structures: ['strip', 'name-role'], positionalSemantics: ['name', 'role', 'location'] },
  lt64: { category: 'lower-third', subtype: 'speaker', structures: ['side-panel', 'multi-line'], positionalSemantics: ['topic', 'name', 'role', 'organization'] },
  lt66: { category: 'lower-third', subtype: 'speaker', structures: ['corner-chip', 'name-role'], positionalSemantics: ['topic', 'name', 'role'] },
  lt67: { category: 'lower-third', subtype: 'speaker', structures: ['media-frame', 'name-role'], positionalSemantics: ['topic', 'name', 'role'] },
  card80: { category: 'title', subtype: 'segment-title', structures: ['multi-line'], positionalSemantics: ['topic', 'headline', 'description', 'source'] },
  card81: { category: 'title', subtype: 'session-title', structures: ['multi-line'], positionalSemantics: ['topic', 'headline', 'description'] },
  // The index ("03") is an ORDINAL, and the semantic vocabulary has no ordinal: 'topic' is the
  // nearest honest answer (it is the chapter marker), and it is better than leaving the card on
  // the info fallback, which would read the poster's topic word as a description.
  card82: { category: 'topic', subtype: 'topic', structures: ['multi-line'], positionalSemantics: ['topic', 'headline', 'description'] },
  card83: { category: 'title', subtype: 'show-open', structures: ['multi-line'], positionalSemantics: ['headline', 'headline', 'headline', 'description'] },
  // The holding fallback's third field is a DURATION; on both of these it is the countdown's
  // LABEL, and ss19 is a break card rather than a front door. Both run to the FULL field list,
  // not just the visible lines: the starting-soon assembler appends the clock's own fields after
  // them (a 'minutes' number, and a wall-clock start time on ss18), and the factory gate compares
  // a declaration against the compiled schema rather than against the line count.
  ss18: { category: 'holding', subtype: 'starting', structures: ['full-panel'], coverage: 'full', positionalSemantics: ['headline', 'description', 'headline', 'duration', 'time'], extraCapabilities: ['countdown', 'loop'] },
  ss19: { category: 'holding', subtype: 'break', structures: ['full-panel'], coverage: 'full', positionalSemantics: ['headline', 'topic', 'description', 'duration'], extraCapabilities: ['countdown', 'loop'] },
  ss20: { category: 'holding', subtype: 'starting', structures: ['full-panel'], coverage: 'full', positionalSemantics: ['topic', 'headline', 'description', 'location', 'duration'], extraCapabilities: ['countdown', 'loop'] },
};

// ── Per-assembler fallback (single-valued, proposal §4) ─────────────────────

export const CATEGORY_DEFAULT_META: Record<AssemblerId, DeclaredTemplateMeta | null> = {
  'lower-third': {
    category: 'lower-third', subtype: 'speaker', structures: ['name-role'],
    positionalSemantics: ['name', 'role', 'organization', 'description', 'description'],
  },
  'ticker': {
    category: 'ticker', subtype: 'news-ticker', structures: ['strip'],
    positionalSemantics: ['items', 'headline'],
    extraCapabilities: ['ticker', 'repeating', 'loop'],
  },
  'alert': {
    category: 'alert', subtype: 'warning', structures: ['strip', 'multi-line'],
    positionalSemantics: ['headline', 'description', 'source'],
  },
  // Single-valued, like every fallback — the nine shipped designs each declare what they
  // really are in VARIANT_META above, and an information card is what an undeclared one is
  // most likely to be.
  'public-info': {
    category: 'info', subtype: 'explainer', structures: ['multi-line'], coverage: 'panel',
    positionalSemantics: ['headline', 'description', 'description', 'description', 'organization'],
  },
  'scoreboard': {
    category: 'scoreboard', subtype: 'match-score', structures: ['strip', 'logo-text'],
    positionalSemantics: ['team', 'score', 'team', 'score'],
    extraCapabilities: ['score-controls'],
  },
  'info-card': {
    category: 'info', subtype: 'explainer', structures: ['multi-line'],
    positionalSemantics: ['headline', 'description', 'description', 'description', 'description'],
  },
  'starting-soon': {
    category: 'holding', subtype: 'starting', structures: ['full-panel'], coverage: 'full',
    positionalSemantics: ['headline', 'topic', 'duration'],
    extraCapabilities: ['countdown', 'loop'],
  },
  'end-credits': {
    category: 'credits', subtype: 'end-credits', structures: ['rows'], coverage: 'full',
    positionalSemantics: ['items', 'headline', 'logo'],
    extraCapabilities: ['repeating'],
  },
  'corner-bug': {
    category: 'bug', subtype: 'sponsor', structures: ['corner-chip', 'logo-text'],
    positionalSemantics: ['headline', 'logo'],
  },
  'infographic': {
    category: 'stats', subtype: 'stat-panel', structures: ['bars'],
    positionalSemantics: ['headline', 'percentage'],
  },
  'game-timer': {
    category: 'timer', subtype: 'countdown', structures: ['single-line'],
    positionalSemantics: ['headline', 'duration'],
    extraCapabilities: ['countdown'],
  },
  'versus': {
    category: 'reveal', subtype: 'versus', structures: ['two-person', 'full-panel'], coverage: 'full',
    positionalSemantics: ['team', 'team', 'headline', 'logo', 'logo'],
  },
  'quiz': {
    category: 'poll-quiz', subtype: 'quiz-question', structures: ['rows', 'full-panel'],
    positionalSemantics: ['question', 'answer', 'answer', 'answer', 'answer', 'answer'],
    extraCapabilities: ['quiz-states', 'multi-step'],
  },
  'frame': {
    category: 'frame', subtype: 'webcam', structures: ['media-frame'], coverage: 'frame',
    positionalSemantics: ['headline', 'name'],
  },
  'transition': {
    category: 'transition', subtype: 'stinger', structures: ['full-panel'], coverage: 'full',
    positionalSemantics: ['headline'],
  },
  'esports-score': {
    category: 'scoreboard', subtype: 'simple-score', structures: ['strip', 'logo-text'],
    positionalSemantics: ['team', 'score', 'team', 'score'],
  },
  'matchup': {
    category: 'reveal', subtype: 'versus', structures: ['two-person', 'full-panel'], coverage: 'full',
    positionalSemantics: ['team', 'team', 'headline'],
  },
  'results-board': {
    category: 'results', subtype: 'leaderboard', structures: ['table', 'rows'],
    positionalSemantics: ['items', 'headline'],
  },
  'reveal': {
    category: 'reveal', subtype: 'winner', structures: ['full-panel'], coverage: 'full',
    positionalSemantics: ['headline', 'name'],
  },
  'poll': {
    category: 'poll-quiz', subtype: 'vote', structures: ['rows', 'full-panel'],
    positionalSemantics: ['headline', 'items'],
  },
  'audience': {
    category: 'question', subtype: 'viewer-question', structures: ['multi-line'],
    positionalSemantics: ['question', 'name', 'source'],
  },
  'stream-notification': {
    category: 'notification', subtype: 'event-notification', structures: ['image-text', 'multi-line'],
    coverage: 'overlay',
    positionalSemantics: ['headline', 'name', 'amount', 'description', 'image'],
    extraCapabilities: ['operator-states', 'image-upload', 'pause-resume'],
  },
  'imported-design': null, // user content — never browsable
};

// ── Facet I: what a design is FOR (model/taxonomy.ts OCCASIONS) ─────────────
//
// DECLARED SEPARATELY FROM `DeclaredTemplateMeta`, on purpose. That resolution is
// winner-takes-all — a VARIANT_META entry replaces the type's and the category's answer
// wholesale — so folding occasions into it would mean restating a design's category, structures
// and semantics just to say what moment it is for. Four sign-off cards would have had to be
// re-declared from scratch to gain one word, and the first time somebody got that restatement
// slightly wrong the design would browse as something it is not. An occasion is orthogonal to
// what a graphic IS, so it resolves on its own: the variant's list, else its type's, else NONE.
//
// UNDECLARED IS THE DEFAULT AND COSTS NOTHING. A design with no occasion has an empty list and
// behaves exactly as it did before this facet existed — it is simply not reachable by a moment
// word. Declare only what a design honestly IS for; a guess here is worse than a gap, because a
// wrong moment puts a graphic in front of somebody at the wrong point in their show.

/** Occasions declared for every variant a graphic TYPE compiles. */
export const TYPE_OCCASIONS: Record<string, OccasionId[]> = {
  // The four holding screens the clock type compiles are all front doors (types/clocks.ts).
  'holding-screen': ['pre-show'],
  // The type exists because a show has to end somewhere (types/signOff.ts).
  'sign-off': ['sign-off'],
  // Now / next — the card whose whole job is saying what comes after this (types/briefings.ts).
  'now-next': ['coming-up'],
};

/** Occasions declared per design, for the hand-written ones and to override a type's. */
export const VARIANT_OCCASIONS: Record<string, OccasionId[]> = {
  // ── Before the show ──
  ss05: ['pre-show'], // counts to a wall-clock start time
  ss10: ['pre-show'], // "Service Begins Soon"
  ss11: ['pre-show'], // the venue hold, counting to the ticketed time
  ss18: ['pre-show'],
  ss20: ['pre-show'],
  ss21: ['pre-show'],
  // A running order held as a board is what a channel shows BEFORE the first item, even though
  // it is built on the credits assembler — the occasion follows the moment, not the machinery.
  cr05: ['pre-show'],

  // ── During a break ──
  ss06: ['break'], // "Short Break", the house BRB card
  ss07: ['break'], // "Intermission"
  ss12: ['break'], // "Back Shortly"
  ss19: ['break'], // the break card as a poster
  // The between-items hold is both: the show has paused, and the card says what is next.
  ss13: ['break', 'coming-up'],

  // ── Something has gone wrong ──
  // Deliberately no countdown on any of these: nobody can promise when a fault ends.
  ss08: ['technical-problem'], // "Please Stand By"
  al07: ['technical-problem'], // the calm technical-difficulty strip
  al10: ['technical-problem'], // the house standby card

  // ── The end of the show ──
  ss09: ['sign-off'], // "Thanks for Watching" — the owner's own example
  cr01: ['sign-off'],
  cr02: ['sign-off'],
  cr03: ['sign-off'],
  cr04: ['sign-off'],
  cr06: ['sign-off'],
  cr13: ['sign-off'],
  // NOT declared, and the gaps are the honest half of this table: cr07 (a thank-you wall reads
  // as well mid-telethon as at the end), cr08 / cr09 / cr12 (sponsor acknowledgement runs
  // whenever the contract says), cr11 (a memorial roll — the `memorial` programme format is
  // what gathers it, not a moment). A design nobody can place stays unplaced.
};

/** Field ids that are hidden CONFIG inputs, excluded from the visible-field buckets
 *  (proposal §6.1). Keyed by wizard category because these are fixed per-category field
 *  contracts (self-assembled categories). */
export const HIDDEN_CONFIG_FIELDS: Partial<Record<AssemblerId, string[]>> = {
  'game-timer': ['f1'],
  'starting-soon': ['f2'],
  'quiz': ['f5', 'f6'],
};

/**
 * Every title the OPERATOR SPEED control ships under, across the categories that scroll.
 *
 * It is a config input like the ones above and is left out of the visible-field buckets for the
 * same reason, but it cannot be listed there: those are fixed ids per category, and a speed
 * field is APPENDED, so it lands on `f2` or `f3` depending on how many caps the design draws.
 * Its title is the fixed thing about it, so that is what identifies it.
 *
 * THE ASSEMBLERS READ THESE RATHER THAN SPELLING THEM AGAIN (`templates/tickers/shared.ts`,
 * `templates/endCredits/shared.ts` — each maps its own motion presets onto these strings). A
 * second copy would drift on the day somebody renames one, and the only symptom would be a
 * Browse card quietly counting a control as a thing the operator has to write.
 *
 * Named for what the design DOES, so an operator reads the control page instead of translating
 * it: a roll and a marquee scroll, a crawl crawls, a paged board and a flip strip hold.
 */
export const SPEED_FIELD_TITLES = {
  scroll: 'Scroll speed (%)',
  crawl: 'Crawl speed (%)',
  page: 'Page speed (%)',
  item: 'Item speed (%)',
} as const;

/** The same four as a set, for asking "is this field the speed control?". */
export const SPEED_FIELD_TITLE_SET: ReadonlySet<string> = new Set(Object.values(SPEED_FIELD_TITLES));
