// TEMPLATE TAXONOMY — the facet id registries behind Start-from-template discovery
// (docs/TEMPLATE_TAXONOMY_PROPOSAL.md). Pure data: stable kebab-case ids + display labels.
//
// The rule that shapes this file (proposal §2): a facet value is DERIVED from an existing
// canonical source wherever one exists, and declared only where none does. This file holds the
// id vocabularies and the small declared tables (per-preset motion, style aliases); the
// per-template derivation lives in src/templates/templateMeta.ts, the declared per-template
// sliver in src/templates/meta.ts. Display labels live here so renames and localization never
// touch stored ids.

import type { AnimPresetId } from './wizard';
import type { StyleTag } from './fonts';

// ── Facet A: programme families and formats ─────────────────────────────────

export type ProgrammeFamilyId =
  | 'sports' | 'gaming' | 'creator' | 'news' | 'talk' | 'business'
  | 'education' | 'entertainment' | 'commerce' | 'ceremony' | 'civic' | 'wellness';

export interface ProgrammeFamily {
  id: ProgrammeFamilyId;
  name: string;
}

export const FAMILIES: ProgrammeFamily[] = [
  { id: 'sports',        name: 'Sports' },
  { id: 'gaming',        name: 'Esports & gaming' },
  { id: 'creator',       name: 'Streaming & creator' },
  { id: 'news',          name: 'News & current affairs' },
  { id: 'talk',          name: 'Talk & podcasts' },
  { id: 'business',      name: 'Business & corporate' },
  { id: 'education',     name: 'Education & training' },
  { id: 'entertainment', name: 'Music, stage & entertainment' },
  { id: 'commerce',      name: 'Commerce & fundraising' },
  { id: 'ceremony',      name: 'Faith & ceremony' },
  { id: 'civic',         name: 'Public info & professional' },
  { id: 'wellness',      name: 'Health & wellness' },
];

export type ProgrammeFormatId =
  | 'sports-broadcast' | 'amateur-sports'
  | 'esports-tournament' | 'gaming-stream' | 'tabletop'
  | 'just-chatting' | 'irl-travel' | 'watch-party' | 'coding-stream' | 'art-stream'
  | 'craft-stream' | 'beauty-stream' | 'cooking-stream' | 'bts-production'
  | 'news-live' | 'election-night' | 'weather' | 'debate' | 'press-conference'
  | 'talk-show' | 'podcast' | 'live-qa' | 'remote-interview' | 'morning-show'
  | 'radio-style' | 'book-launch'
  | 'webinar' | 'conference' | 'town-hall' | 'product-launch' | 'virtual-event' | 'finance-live'
  | 'lecture' | 'school-tv' | 'academic-conference' | 'workshop'
  | 'concert' | 'award-show' | 'theatre' | 'dj-set' | 'quiz-show' | 'reality'
  | 'red-carpet' | 'fashion-show'
  | 'live-shopping' | 'auction' | 'real-estate' | 'fundraiser'
  | 'church-service' | 'graduation' | 'wedding' | 'memorial'
  | 'council-meeting' | 'emergency-info' | 'public-cam' | 'medical-info' | 'legal-info'
  | 'fitness' | 'meditation' | 'nature-cam';

export interface ProgrammeFormat {
  id: ProgrammeFormatId;
  family: ProgrammeFamilyId;
  name: string;
  /** The VERBATIM row value in live_format_graphics_needs.xlsx — the same string
   *  `packs.ts` formats use. The factory asserts a 1:1 mapping between this list and the
   *  union of pack formats, so the two 60-item lists cannot drift. */
  sheetName: string;
}

export const FORMATS: ProgrammeFormat[] = [
  { id: 'sports-broadcast',    family: 'sports',        name: 'Sports broadcast',        sheetName: 'Sports broadcast / match coverage' },
  { id: 'amateur-sports',      family: 'sports',        name: 'Amateur & local sports',  sheetName: 'Local sports / amateur sports' },
  { id: 'esports-tournament',  family: 'gaming',        name: 'Esports tournament',      sheetName: 'Esports tournament' },
  { id: 'gaming-stream',       family: 'gaming',        name: 'Gaming livestream',       sheetName: 'Gaming livestream' },
  { id: 'tabletop',            family: 'gaming',        name: 'Tabletop & board games',  sheetName: 'Tabletop RPG / board game stream' },
  { id: 'just-chatting',       family: 'creator',       name: 'Just Chatting',           sheetName: 'Just Chatting / personality stream' },
  { id: 'irl-travel',          family: 'creator',       name: 'Travel & IRL',            sheetName: 'Travel / IRL stream' },
  { id: 'watch-party',         family: 'creator',       name: 'Watch party & reactions', sheetName: 'Watch party / reaction stream' },
  { id: 'coding-stream',       family: 'creator',       name: 'Tech & coding',           sheetName: 'Tech support / coding livestream' },
  { id: 'art-stream',          family: 'creator',       name: 'Art & design',            sheetName: 'Art / design livestream' },
  { id: 'craft-stream',        family: 'creator',       name: 'Craft & maker',           sheetName: 'Craft / maker livestream' },
  { id: 'beauty-stream',       family: 'creator',       name: 'Beauty & makeup',         sheetName: 'Beauty / makeup livestream' },
  { id: 'cooking-stream',      family: 'creator',       name: 'Cooking & food',          sheetName: 'Cooking show / food livestream' },
  { id: 'bts-production',      family: 'creator',       name: 'Behind the scenes',       sheetName: 'Behind-the-scenes production stream' },
  { id: 'news-live',           family: 'news',          name: 'News livestream',         sheetName: 'News / current affairs livestream' },
  { id: 'election-night',      family: 'news',          name: 'Election night',          sheetName: 'Election night / results program' },
  { id: 'weather',             family: 'news',          name: 'Weather',                 sheetName: 'Weather broadcast / climate update' },
  { id: 'debate',              family: 'news',          name: 'Debate',                  sheetName: 'Debate / political discussion' },
  { id: 'press-conference',    family: 'news',          name: 'Press conference',        sheetName: 'Press conference' },
  { id: 'talk-show',           family: 'talk',          name: 'Talk show & panel',       sheetName: 'Talk show / panel discussion' },
  { id: 'podcast',             family: 'talk',          name: 'Podcast & videocast',     sheetName: 'Podcast livestream / videocast' },
  { id: 'live-qa',             family: 'talk',          name: 'Live Q&A / AMA',          sheetName: 'Live Q&A / AMA' },
  { id: 'remote-interview',    family: 'talk',          name: 'Remote interview',        sheetName: 'Remote interview show' },
  { id: 'morning-show',        family: 'talk',          name: 'Magazine & morning show', sheetName: 'Magazine show / morning show' },
  { id: 'radio-style',         family: 'talk',          name: 'Radio-style stream',      sheetName: 'Radio-style livestream with video' },
  { id: 'book-launch',         family: 'talk',          name: 'Book launch & authors',   sheetName: 'Book launch / author event' },
  { id: 'webinar',             family: 'business',      name: 'Webinar',                 sheetName: 'Webinar / expert presentation' },
  { id: 'conference',          family: 'business',      name: 'Conference & seminar',    sheetName: 'Conference / seminar stream' },
  { id: 'town-hall',           family: 'business',      name: 'Town hall & internal',    sheetName: 'Corporate town hall / internal broadcast' },
  { id: 'product-launch',      family: 'business',      name: 'Product launch & keynote', sheetName: 'Product launch / keynote' },
  { id: 'virtual-event',       family: 'business',      name: 'Virtual event',           sheetName: 'Virtual event / metaverse event' },
  { id: 'finance-live',        family: 'business',      name: 'Finance & markets',       sheetName: 'Finance / market livestream' },
  { id: 'lecture',             family: 'education',     name: 'Lecture & class',         sheetName: 'Education / lecture livestream' },
  { id: 'school-tv',           family: 'education',     name: 'Student & school TV',     sheetName: 'Student production / school TV' },
  { id: 'academic-conference', family: 'education',     name: 'Academic conference',     sheetName: 'Academic conference livestream' },
  { id: 'workshop',            family: 'education',     name: 'Workshop & training',     sheetName: 'Hybrid workshop / training session' },
  { id: 'concert',             family: 'entertainment', name: 'Concert & live music',    sheetName: 'Music performance / concert livestream' },
  { id: 'award-show',          family: 'entertainment', name: 'Award show & gala',       sheetName: 'Award show / gala' },
  { id: 'theatre',             family: 'entertainment', name: 'Theatre & performance',   sheetName: 'Theatre / live performance stream' },
  { id: 'dj-set',              family: 'entertainment', name: 'DJ set & club',           sheetName: 'DJ set / club stream' },
  { id: 'quiz-show',           family: 'entertainment', name: 'Quiz & game show',        sheetName: 'Quiz / game show livestream' },
  { id: 'reality',             family: 'entertainment', name: 'Reality & house stream',  sheetName: 'Reality-style livestream / house stream' },
  { id: 'red-carpet',          family: 'entertainment', name: 'Red carpet & premiere',   sheetName: 'Red carpet / premiere stream' },
  { id: 'fashion-show',        family: 'entertainment', name: 'Fashion show',            sheetName: 'Fashion show livestream' },
  { id: 'live-shopping',       family: 'commerce',      name: 'Live shopping',           sheetName: 'Live commerce / shopping stream' },
  { id: 'auction',             family: 'commerce',      name: 'Auction',                 sheetName: 'Auction livestream' },
  { id: 'real-estate',         family: 'commerce',      name: 'Real estate',             sheetName: 'Real estate / property livestream' },
  { id: 'fundraiser',          family: 'commerce',      name: 'Fundraiser & telethon',   sheetName: 'Charity telethon / fundraising stream' },
  { id: 'church-service',      family: 'ceremony',      name: 'Church service',          sheetName: 'Religious service / church livestream' },
  { id: 'graduation',          family: 'ceremony',      name: 'Graduation & ceremony',   sheetName: 'Graduation / ceremony stream' },
  { id: 'wedding',             family: 'ceremony',      name: 'Wedding',                 sheetName: 'Wedding / private event livestream' },
  { id: 'memorial',            family: 'ceremony',      name: 'Funeral & memorial',      sheetName: 'Funeral / memorial livestream' },
  { id: 'council-meeting',     family: 'civic',         name: 'Council & public meeting', sheetName: 'Municipal council / public meeting' },
  { id: 'emergency-info',      family: 'civic',         name: 'Emergency information',   sheetName: 'Emergency information stream' },
  { id: 'public-cam',          family: 'civic',         name: 'Public & security cam',   sheetName: 'Security / surveillance-style public stream' },
  { id: 'medical-info',        family: 'civic',         name: 'Medical & health',        sheetName: 'Medical / health livestream' },
  { id: 'legal-info',          family: 'civic',         name: 'Legal & public information', sheetName: 'Legal / public information livestream' },
  { id: 'fitness',             family: 'wellness',      name: 'Fitness & workout',       sheetName: 'Fitness / workout class' },
  { id: 'meditation',          family: 'wellness',      name: 'Meditation & ambient',    sheetName: 'Meditation / ambient livestream' },
  { id: 'nature-cam',          family: 'wellness',      name: 'Animal & nature cam',     sheetName: 'Animal cam / nature cam' },
];

export function formatsBySheetName(): Map<string, ProgrammeFormat> {
  return new Map(FORMATS.map((f) => [f.sheetName, f]));
}

// ── Facet B: graphic categories ─────────────────────────────────────────────

export type GraphicCategoryId =
  | 'lower-third' | 'bug' | 'title' | 'topic' | 'info' | 'question' | 'quote'
  | 'scoreboard' | 'results' | 'stats' | 'timer' | 'ticker' | 'alert' | 'list'
  | 'poll-quiz' | 'progress' | 'product' | 'cta' | 'sponsor' | 'frame' | 'holding'
  | 'credits' | 'caption' | 'reveal' | 'map' | 'transition' | 'notification';

/** Where a category's graphics sit on the canvas, as a DEFAULT — a design overrides it the
 *  same way it overrides defaultZone (proposal §8). */
export type CoverageClass = 'overlay' | 'strip' | 'panel' | 'full' | 'frame';

export interface GraphicCategory {
  id: GraphicCategoryId;
  name: string;
  /** Controlled subtype ids — a template declares at most one. Never free-form. */
  subtypes: string[];
  coverage: CoverageClass;
  /** 'all' = relevant to every programme format (ranked below genuine format matches).
   *  Absent = relevance derives from pack membership (templateMeta.ts). */
  relevance?: 'all';
}

export const GRAPHIC_CATEGORIES: GraphicCategory[] = [
  { id: 'lower-third', name: 'Lower thirds',            subtypes: ['speaker', 'two-person', 'name-tag', 'locator', 'live-tag'], coverage: 'overlay', relevance: 'all' },
  // 'logo-only', 'event' and 'location' joined the list with the identity-bug pack
  // (templates/types/identityBugs.ts): a mark with no caption at all, the conference /
  // festival / fixture ident, and the where-are-we chip are distinct graphics an operator
  // reaches for by name, and none of them is a sponsor, a station or an award.
  // 'source' joined with the public-service pack: an attribution chip ("Source: …", and when
  // the figure was measured) is a persistent corner mark like the rest of this family, and it
  // is none of the marks already listed — it credits the CONTENT, not the broadcaster.
  { id: 'bug',         name: 'Bugs & corner logos',     subtypes: ['sponsor', 'station', 'live', 'logo-only', 'event', 'award', 'location', 'source', 'social-handle'], coverage: 'overlay', relevance: 'all' },
  { id: 'title',       name: 'Titles & openers',        subtypes: ['show-open', 'session-title', 'segment-title', 'event-title'], coverage: 'panel' },
  { id: 'topic',       name: 'Topic & chapter cards',   subtypes: ['topic', 'chapter', 'now-playing', 'coming-up'], coverage: 'panel' },
  // 'disclaimer' joined with the public-service pack: legal small print is information the
  // broadcaster is REQUIRED to show, which is a different graphic from an explainer even
  // though both are words on a panel.
  { id: 'info',        name: 'Information cards',       subtypes: ['explainer', 'spec', 'key-term', 'step', 'checklist', 'fact', 'disclaimer'], coverage: 'panel' },
  { id: 'question',    name: 'Questions & chat',        subtypes: ['viewer-question', 'qa-card', 'chat-highlight', 'queue'], coverage: 'panel' },
  { id: 'quote',       name: 'Quotes & statements',     subtypes: ['quote', 'scripture', 'excerpt', 'headline', 'fact-check'], coverage: 'panel' },
  // 'podium' joined with the podium board (types/podiumScore.ts): a game show's contestant
  // scores are not a two-team duel and not a retyped list — up to four name-over-points
  // columns with per-player steppers is its own graphic an operator reaches for by name.
  { id: 'scoreboard',  name: 'Scoreboards',             subtypes: ['match-score', 'simple-score', 'podium', 'round-indicator'], coverage: 'overlay' },
  // 'timing-tower' is its own subtype rather than one more leaderboard: a leaderboard is a
  // claim about a finished set of results and a tower is the session happening, which is a
  // different graphic in shape, in placement and in how long it stays on air. Filing it under
  // 'leaderboard' is what a July 2026 AI bench discovered the hard way — with nothing in the
  // catalog resembling a tower, every model asked for one produced a lower third.
  { id: 'results',     name: 'Results & standings',     subtypes: ['results-table', 'leaderboard', 'timing-tower', 'bracket', 'seat-count', 'vote-result', 'final-score'], coverage: 'panel' },
  { id: 'stats',       name: 'Statistics & data',       subtypes: ['stat-panel', 'kpi', 'chart', 'heatmap', 'trend'], coverage: 'panel' },
  { id: 'timer',       name: 'Timers & clocks',         subtypes: ['countdown', 'count-up', 'clock', 'interval', 'speaking-timer', 'deal-timer'], coverage: 'overlay', relevance: 'all' },
  { id: 'ticker',      name: 'Tickers & crawls',        subtypes: ['news-ticker', 'market-ticker', 'crawl', 'rotator'], coverage: 'strip' },
  { id: 'alert',       name: 'Alerts & status',         subtypes: ['breaking', 'warning', 'emergency', 'status', 'notice'], coverage: 'strip' },
  { id: 'list',        name: 'Lists & schedules',       subtypes: ['agenda', 'schedule', 'lineup', 'setlist', 'ingredients', 'program', 'order'], coverage: 'panel' },
  { id: 'poll-quiz',   name: 'Polls, voting & quizzes', subtypes: ['poll-result', 'vote', 'quiz-question', 'answer-board'], coverage: 'panel' },
  { id: 'progress',    name: 'Goals & progress',        subtypes: ['donation-goal', 'progress-bar', 'milestone', 'stock-level'], coverage: 'overlay' },
  { id: 'product',     name: 'Products & commerce',     subtypes: ['product-card', 'price', 'lot-bid', 'property', 'comparison'], coverage: 'panel' },
  { id: 'cta',         name: 'Calls to action & QR',    subtypes: ['qr', 'link', 'follow', 'donate', 'buy'], coverage: 'overlay', relevance: 'all' },
  { id: 'sponsor',     name: 'Sponsor & partner panels', subtypes: ['panel', 'logo-strip', 'sponsor-read', 'rotation'], coverage: 'panel', relevance: 'all' },
  { id: 'frame',       name: 'Frames & layouts',        subtypes: ['webcam', 'split-screen', 'reaction', 'visualizer', 'background', 'screen-share'], coverage: 'frame', relevance: 'all' },
  { id: 'holding',     name: 'Holding & break screens', subtypes: ['starting', 'ending', 'brb', 'break', 'intermission'], coverage: 'full', relevance: 'all' },
  { id: 'credits',     name: 'Credits & thanks',        subtypes: ['end-credits', 'thank-you', 'donor-wall', 'role-credits'], coverage: 'full' },
  { id: 'caption',     name: 'Captions & lyrics',       subtypes: ['lyrics', 'surtitle', 'translation', 'caption'], coverage: 'strip' },
  { id: 'reveal',      name: 'Reveals & matchups',      subtypes: ['versus', 'winner', 'nominee', 'before-after', 'sold'], coverage: 'full' },
  { id: 'map',         name: 'Maps & location',         subtypes: ['map', 'map-pin', 'route', 'weather-map', 'zone-map'], coverage: 'panel' },
  { id: 'transition',  name: 'Stingers & wipes',        subtypes: ['stinger', 'replay-wipe'], coverage: 'full' },
  { id: 'notification', name: 'Stream notifications',   subtypes: ['event-notification'], coverage: 'overlay' },
];

export function graphicCategoryById(id: GraphicCategoryId): GraphicCategory {
  const found = GRAPHIC_CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown graphic category "${id}"`);
  return found;
}

// The old per-assembler browse fallback table (`OLD_CATEGORY_FALLBACK`) is gone: the same
// single-valued mapping lives as real declared meta in templates/meta.ts
// `CATEGORY_DEFAULT_META`, which is total over `AssemblerId` — this copy had no consumers.

// ── Category groups — the browse SHELF over facet B ─────────────────────────
//
// Ten user-facing shelves over the 27 graphic categories. The categories stay the precise
// vocabulary everything machine-facing speaks — declared meta, search aliases, the AI's
// retrieval, the factory's assertions — but 27 rows is a wall to browse, so the Browse step
// leads with these and offers the member categories as a second, optional narrowing.
//
// The grouping is derived from what the CATALOG actually holds (counts as of 2026-08-16,
// 458 browsable designs), not from taxonomy symmetry: every shelf holds 23-82 designs.
// Two memberships lean on evidence already in this file's alias table: "countdown" resolves
// to timer + holding (so those share a shelf), and a stream notification is an alert-shaped
// popup, not a persistent mark (so it shelves with alerts, not bugs).
//
// A group NEVER selects behaviour: playout controls are generated from the machine and the
// fields inside the template (docs/CONTROL_LAYER.md), and nothing at playout reads a category
// or a group. This is browse furniture only.

export type CategoryGroupId =
  | 'lower-thirds' | 'bugs' | 'cards' | 'tickers' | 'scores'
  | 'audience' | 'data' | 'breaks' | 'commerce' | 'frames';

export interface CategoryGroup {
  id: CategoryGroupId;
  name: string;
  /** Member categories, in GRAPHIC_CATEGORIES order — derived from CATEGORY_GROUP_OF. */
  categories: GraphicCategoryId[];
}

const CATEGORY_GROUP_LABELS: Record<CategoryGroupId, string> = {
  'lower-thirds': 'Lower thirds',
  bugs: 'Bugs & corner logos',
  cards: 'Titles & cards',
  tickers: 'Tickers & alerts',
  scores: 'Scores, results & reveals',
  audience: 'Polls, quizzes & questions',
  data: 'Lists & data',
  breaks: 'Timers, breaks & credits',
  commerce: 'Sponsors & commerce',
  frames: 'Frames & stingers',
};

/** Which shelf each category sits on — TOTAL over GraphicCategoryId (the PRESET_MOTION
 *  pattern), so a new category cannot ship without a browse home: leaving it out of this
 *  record is a type error, not a runtime fallback. One home each, by construction. */
export const CATEGORY_GROUP_OF: Record<GraphicCategoryId, CategoryGroupId> = {
  'lower-third': 'lower-thirds',
  bug: 'bugs',
  title: 'cards',
  topic: 'cards',
  info: 'cards',
  quote: 'cards',
  ticker: 'tickers',
  alert: 'tickers',
  caption: 'tickers',
  notification: 'tickers',
  scoreboard: 'scores',
  results: 'scores',
  reveal: 'scores',
  'poll-quiz': 'audience',
  question: 'audience',
  list: 'data',
  stats: 'data',
  progress: 'data',
  map: 'data',
  timer: 'breaks',
  holding: 'breaks',
  credits: 'breaks',
  sponsor: 'commerce',
  product: 'commerce',
  cta: 'commerce',
  frame: 'frames',
  transition: 'frames',
};

const CATEGORY_GROUP_ORDER: CategoryGroupId[] = [
  'lower-thirds', 'bugs', 'cards', 'tickers', 'scores',
  'audience', 'data', 'breaks', 'commerce', 'frames',
];

export const CATEGORY_GROUPS: CategoryGroup[] = CATEGORY_GROUP_ORDER.map((id) => ({
  id,
  name: CATEGORY_GROUP_LABELS[id],
  categories: GRAPHIC_CATEGORIES.filter((c) => CATEGORY_GROUP_OF[c.id] === id).map((c) => c.id),
}));

export function categoryGroupById(id: CategoryGroupId): CategoryGroup {
  const found = CATEGORY_GROUPS.find((g) => g.id === id);
  if (!found) throw new Error(`Unknown category group "${id}"`);
  return found;
}

// ── Facet C: structures ─────────────────────────────────────────────────────

export type StructureId =
  | 'single-line' | 'multi-line' | 'name-role' | 'image-text' | 'logo-text'
  | 'two-person' | 'multi-person' | 'rows' | 'table' | 'grid' | 'bars'
  | 'full-panel' | 'strip' | 'corner-chip' | 'side-panel' | 'media-frame';

export const STRUCTURE_LABELS: Record<StructureId, string> = {
  'single-line': 'Single line',
  'multi-line': 'Multi-line text',
  'name-role': 'Name + role',
  'image-text': 'Image + text',
  'logo-text': 'Logo + text',
  'two-person': 'Two people',
  'multi-person': 'Several people',
  'rows': 'Repeating rows',
  'table': 'Table',
  'grid': 'Grid',
  'bars': 'Bars & meters',
  'full-panel': 'Full-screen panel',
  'strip': 'Horizontal strip',
  'corner-chip': 'Corner chip',
  'side-panel': 'Vertical panel',
  'media-frame': 'Video / webcam frame',
};

// ── Facet D: field semantics ────────────────────────────────────────────────

export type FieldSemantic =
  | 'name' | 'role' | 'organization' | 'headline' | 'description' | 'topic'
  | 'question' | 'answer' | 'score' | 'team' | 'price' | 'discount' | 'percentage'
  | 'location' | 'date' | 'time' | 'duration' | 'url' | 'social-handle'
  | 'qr-content' | 'image' | 'logo' | 'items' | 'source' | 'amount';

export const SEMANTIC_LABELS: Record<FieldSemantic, string> = {
  name: 'Name', role: 'Role', organization: 'Organization', headline: 'Headline',
  description: 'Description', topic: 'Topic', question: 'Question', answer: 'Answer',
  score: 'Score', team: 'Team', price: 'Price', discount: 'Discount',
  percentage: 'Percentage', location: 'Location', date: 'Date', time: 'Time',
  duration: 'Duration', url: 'URL', 'social-handle': 'Social handle',
  'qr-content': 'QR content', image: 'Image', logo: 'Logo', items: 'Items',
  // ONE WORD EACH. These two carried a slash ("Source / platform", "Amount / total") to cover
  // both readings at once, and every surface that prints them puts them in a SENTENCE — the
  // Browse card's field summary reads "name + description + source / platform", and the plural
  // form of "Amount / total" came out as "2 amount / totals". A label that cannot be said out
  // loud is not a label.
  source: 'Source', amount: 'Amount',
};

// ── Facet E: capabilities ───────────────────────────────────────────────────

export type CapabilityId =
  | 'multi-step' | 'operator-states' | 'loop' | 'countdown' | 'count-up' | 'clock'
  | 'score-controls' | 'progress' | 'repeating' | 'ticker' | 'poll-states'
  | 'quiz-states' | 'winner-reveal' | 'alert-state' | 'image-upload' | 'logo-upload'
  | 'qr' | 'live-data' | 'sponsor-rotation' | 'pause-resume';

export interface CapabilityInfo {
  id: CapabilityId;
  name: string;
  /** Offered as a Browse filter checkbox. The rest stay searchable metadata until they
   *  have catalog mass (proposal §7). */
  filter: boolean;
}

export const CAPABILITIES: CapabilityInfo[] = [
  { id: 'multi-step',       name: 'Step-by-step reveal',        filter: true },
  { id: 'operator-states',  name: 'Operator-controlled states', filter: false },
  { id: 'loop',             name: 'Automatic loop',             filter: true },
  { id: 'countdown',        name: 'Countdown',                  filter: true },
  { id: 'count-up',         name: 'Count-up',                   filter: false },
  { id: 'clock',            name: 'Clock',                      filter: true },
  { id: 'score-controls',   name: 'Score controls',             filter: true },
  { id: 'progress',         name: 'Progress bar',               filter: true },
  { id: 'repeating',        name: 'Repeating list',             filter: true },
  { id: 'ticker',           name: 'Ticker / marquee',           filter: false },
  { id: 'poll-states',      name: 'Poll & voting states',       filter: false },
  { id: 'quiz-states',      name: 'Correct / incorrect states', filter: false },
  { id: 'winner-reveal',    name: 'Winner reveal',              filter: false },
  { id: 'alert-state',      name: 'Alert state',                filter: false },
  { id: 'image-upload',     name: 'Image upload',               filter: true },
  { id: 'logo-upload',      name: 'Logo upload',                filter: true },
  { id: 'qr',               name: 'QR code',                    filter: false },
  { id: 'live-data',        name: 'Live-updating data',         filter: false },
  { id: 'sponsor-rotation', name: 'Sponsor rotation',           filter: false },
  { id: 'pause-resume',     name: 'Pause / resume',             filter: false },
];

// ── Facet F: placement ──────────────────────────────────────────────────────

export type PlacementId =
  | 'full-screen' | 'lower' | 'upper' | 'left' | 'right' | 'center' | 'corner'
  | 'side-panel' | 'background' | 'frame';

export const PLACEMENT_LABELS: Record<PlacementId, string> = {
  'full-screen': 'Full screen', lower: 'Lower screen', upper: 'Upper screen',
  left: 'Left', right: 'Right', center: 'Center', corner: 'Corner',
  'side-panel': 'Side panel', background: 'Background', frame: 'Frame',
};

/** Zone-movable coverage classes match every placement they can reach; the fixed classes
 *  answer for themselves. Proposal §8. */
export const COVERAGE_PLACEMENTS: Record<CoverageClass, PlacementId[]> = {
  overlay: ['lower', 'upper', 'left', 'right', 'center', 'corner'],
  strip: ['lower', 'upper'],
  panel: ['center', 'left', 'right', 'lower', 'upper', 'side-panel'],
  full: ['full-screen'],
  frame: ['frame', 'background'],
};

// ── Facet G: visual style ───────────────────────────────────────────────────

/**
 * User-facing labels for the style families — the filter IS the families (proposal §9); the
 * brief's adjectives are search aliases below.
 *
 * ONE PLAIN WORD EACH, and the pairing is deliberately gone. The labels used to be adjective
 * pairs ("Bold & on-air", "Sport & energetic", "Minimal & clean") and the owner read the row
 * cold on 2026-08-26: "I get the AI slop feeling with those names… it makes me feel that it's
 * AI-generated and not genuine. We don't want any hype AI words here anywhere." A pair reads
 * as copywriting because the second half is always an adjective doing no work — the family is
 * already named by the first. That reverses proposal §19's "the house family stays labelled
 * Bold & on-air", which was recorded as a taste call with no evidence either way; this is the
 * evidence.
 *
 * These are the same six words the older Template step has printed all along
 * (components/wizard/steps/TemplateStep.tsx), which now reads them from here rather than
 * keeping a second copy — two vocabularies for one facet is how a rename half-lands.
 */
export const STYLE_FAMILY_LABELS: Record<StyleTag, string> = {
  minimal: 'Minimal',
  editorial: 'Editorial',
  cinematic: 'Cinematic',
  sport: 'Sport',
  glass: 'Glass',
  noacg: 'NoaCG',
};

// ── Facet H: motion ─────────────────────────────────────────────────────────

export type MotionIntensity = 'none' | 'subtle' | 'medium' | 'strong';

export const INTENSITY_LABELS: Record<MotionIntensity, string> = {
  none: 'None', subtle: 'Subtle', medium: 'Medium', strong: 'Strong',
};

export type MotionStyleId =
  | 'reveal' | 'wipe' | 'slide' | 'pop' | 'scale' | 'blur' | 'roll' | 'loop' | 'flip';

export const MOTION_STYLE_LABELS: Record<MotionStyleId, string> = {
  reveal: 'Reveal', wipe: 'Wipe', slide: 'Slide', pop: 'Pop', scale: 'Scale',
  blur: 'Blur', roll: 'Roll', loop: 'Loop', flip: 'Flip',
};

export interface PresetMotion {
  intensity: MotionIntensity;
  styles: MotionStyleId[];
}

/** The one declared motion table (proposal §10): every preset's intensity + style tags.
 *  A template's motion facet derives from its offered presets; its default intensity is
 *  its default preset's. Kept total over AnimPresetId so adding a preset without a row is
 *  a type error, not silent metadata rot. */
export const PRESET_MOTION: Record<AnimPresetId, PresetMotion> = {
  'slide-up':          { intensity: 'medium', styles: ['slide'] },
  'slide-down':        { intensity: 'medium', styles: ['slide'] },
  'slide-left':        { intensity: 'medium', styles: ['slide'] },
  'slide-right':       { intensity: 'medium', styles: ['slide'] },
  'line-reveal':       { intensity: 'subtle', styles: ['reveal'] },
  'mask-wipe':         { intensity: 'medium', styles: ['wipe', 'reveal'] },
  'pop-spring':        { intensity: 'medium', styles: ['pop', 'scale'] },
  'snap-stinger':      { intensity: 'strong', styles: ['slide'] },
  'blur-in':           { intensity: 'subtle', styles: ['blur'] },
  'fade':              { intensity: 'subtle', styles: ['reveal'] },
  'flip-3d':           { intensity: 'strong', styles: ['flip'] },
  'credits-roll':      { intensity: 'subtle', styles: ['roll'] },
  'credits-pages':     { intensity: 'subtle', styles: ['reveal'] },
  'credits-crawl':     { intensity: 'subtle', styles: ['roll', 'loop'] },
  'ticker-marquee':    { intensity: 'subtle', styles: ['loop', 'slide'] },
  'ticker-flip':       { intensity: 'medium', styles: ['flip', 'loop'] },
  'ticker-rotate':     { intensity: 'medium', styles: ['loop', 'reveal'] },
  'hold-loop':         { intensity: 'subtle', styles: ['loop', 'scale'] },
  'timer-run':         { intensity: 'medium', styles: ['pop'] },
  'timer-line-reveal': { intensity: 'subtle', styles: ['reveal'] },
  'vs-slam':           { intensity: 'strong', styles: ['slide', 'pop'] },
  'vs-glide':          { intensity: 'medium', styles: ['slide'] },
  'count-up':          { intensity: 'medium', styles: ['reveal'] },
  'bars-grow':         { intensity: 'medium', styles: ['scale', 'reveal'] },
  'ring-fill':         { intensity: 'medium', styles: ['reveal'] },
  'rows-cascade':      { intensity: 'medium', styles: ['reveal', 'slide'] },
  'quiz-reveal':       { intensity: 'medium', styles: ['reveal', 'pop'] },
  'design-fade':       { intensity: 'subtle', styles: ['reveal'] },
  'design-slide':      { intensity: 'medium', styles: ['slide'] },
  'design-pop':        { intensity: 'medium', styles: ['pop', 'scale'] },
  'design-blur':       { intensity: 'subtle', styles: ['blur'] },
  'design-stagger':    { intensity: 'medium', styles: ['reveal', 'slide'] },
  'goal-ring':         { intensity: 'medium', styles: ['reveal'] },
  'milestone-run':     { intensity: 'medium', styles: ['reveal', 'pop'] },
  'frame-draw':        { intensity: 'medium', styles: ['reveal'] },
  'frame-fade':        { intensity: 'subtle', styles: ['reveal'] },
  'frame-slide':       { intensity: 'medium', styles: ['slide'] },
  'transition-slam':   { intensity: 'strong', styles: ['slide', 'pop'] },
  'transition-wipe':   { intensity: 'strong', styles: ['wipe'] },
  'transition-sweep':  { intensity: 'strong', styles: ['slide', 'wipe'] },
  'transition-iris':   { intensity: 'strong', styles: ['scale'] },
  'transition-spin':   { intensity: 'strong', styles: ['scale', 'flip'] },
  'comp-rise':         { intensity: 'medium', styles: ['slide'] },
  'comp-impact':       { intensity: 'strong', styles: ['pop', 'slide'] },
  'comp-bloom':        { intensity: 'medium', styles: ['scale', 'pop'] },
  'comp-cascade':      { intensity: 'medium', styles: ['reveal', 'slide'] },
  'poll-open':         { intensity: 'medium', styles: ['scale', 'reveal'] },
  'audience-rise':     { intensity: 'medium', styles: ['slide'] },
  'audience-slide':    { intensity: 'medium', styles: ['slide'] },
  'credits-loop':      { intensity: 'subtle', styles: ['roll', 'loop'] },
  'credits-board':     { intensity: 'subtle', styles: ['reveal'] },
  'hold-still':        { intensity: 'subtle', styles: ['reveal'] },
};

// ── Complexity ──────────────────────────────────────────────────────────────

export type Complexity = 'simple' | 'standard' | 'advanced';

export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  simple: 'Simple', standard: 'Standard', advanced: 'Advanced',
};

// ── Facet I: occasion — the MOMENT this graphic is for ──────────────────────
//
// Every other facet answers what a graphic IS (category, structure, coverage), what SHOW it
// belongs to (programme format) or what it LOOKS like (style family). None of them answers the
// question a confused person actually arrives with: *what part of my show is this for?*
//
// The owner asked for this on the 2026-08-28 walk, with an example: "if they're searching for a
// specific 'thanks for watching', they might not find it if we don't mention that... so if
// someone is confused and not really sure what they want, they can find guidance." The same walk
// ruled STYLE LABELS the wrong tool for it — "if I want a nice-looking graphic for my late-night
// show, which one of these do I choose? It's not really helping that much" — so occasion is its
// own axis and is deliberately NOT another adjective on the card.
//
// THE AXIS IS A CLOCK. Every value is a moment in a broadcast, in the order they happen: before
// it starts, what is next, a pause, something has gone wrong, the end. That is what keeps this
// list closed — a value that is not a moment has nowhere to sit.
//
// ── THE RULE FOR ADMITTING A NEW OCCASION (all three, or it does not go in) ─────
//
//   1. IT IS A MOMENT ON THE SHOW'S CLOCK. Not a form (that is the graphic category — a lower
//      third is not a moment), not a show type (that is the programme format — an award show is
//      not a moment), not a look (that is the style family). If you cannot say when in a
//      broadcast it happens, it is not an occasion.
//   2. A CONFUSED PERSON TYPES IT AS THEIR WHOLE QUESTION, and the phrases they would type are
//      declared with it, below. An occasion nobody types is a filing word; filing words belong
//      to the category tree, which is already there.
//   3. AT LEAST THREE SHIPPED DESIGNS HONESTLY HAVE IT (gated in `validateTaxonomy`), and no
//      single existing facet value already gathers them. The one deliberate exception is a
//      moment on the same clock as an occasion already admitted — `break` is served only by
//      holding screens today and its category's subtype list could almost carry it, but
//      splitting one axis across two facets is exactly the rot this list exists to prevent.
//
// And a ceiling, also gated: EIGHT. A show's clock has a handful of moments on it; a list past
// eight has stopped being a clock and become the free text the whole facet model refuses.
//
// WHAT WAS CONSIDERED AND REFUSED, so the next reader does not re-litigate it: `show-open` (the
// `title` category's `show-open` / `session-title` subtypes already gather every opener — rule
// 3), `awards`, `fundraiser`, `memorial`, `graduation`, `wedding` (all programme FORMATS
// already — rule 1), `breaking-news` and `sponsor-read` (purpose words the alias table already
// fans across forms, proposal §20.3 — rule 3).

export type OccasionId = 'pre-show' | 'coming-up' | 'break' | 'technical-problem' | 'sign-off';

export interface Occasion {
  id: OccasionId;
  /** The user-facing name of the moment. */
  name: string;
  /**
   * THE WORDS A CONFUSED PERSON TYPES. Every phrase is folded into the alias table (below), so
   * it reaches the designs that declare this occasion and nothing else — an alias is the one
   * mechanism in this file that can point a whole PHRASE at a facet, which is why the occasion
   * lives here and not in the loose word index. Putting these in the text index instead would
   * mean "the", "back" and "show" scoring designs, which is the uncontrolled-adjective failure
   * the facet model refuses (proposal §11).
   */
  phrases: string[];
}

/** The five moments, in the order they happen on air. */
export const OCCASIONS: Occasion[] = [
  {
    id: 'pre-show',
    name: 'Before the show',
    phrases: [
      'starting soon', 'before the show', 'pre show', 'preshow', 'waiting screen', 'holding screen',
      'countdown to start', 'doors open', 'we start soon', 'show starts soon',
    ],
  },
  {
    id: 'coming-up',
    name: 'What is next',
    phrases: ['coming up', 'up next', 'what is next', 'whats next', 'now and next', 'later in the show'],
  },
  {
    id: 'break',
    name: 'During a break',
    phrases: [
      'be right back', 'brb', 'back shortly', 'back soon', 'back in five', 'short break',
      'intermission', 'interval', 'halftime', 'half time', 'commercial break',
    ],
  },
  {
    id: 'technical-problem',
    name: 'Something has gone wrong',
    phrases: [
      'technical difficulties', 'technical difficulty', 'technical problem', 'please stand by',
      'stand by', 'standby', 'sorry for the interruption', 'we are having problems',
    ],
  },
  {
    id: 'sign-off',
    name: 'The end of the show',
    phrases: [
      'thanks for watching', 'thank you for watching', 'sign off', 'signoff', 'sign out',
      'goodbye', 'good bye', 'bye for now', 'see you next time', 'end card', 'end screen',
      'stream ending', 'stream is over', 'that is all', 'offline',
    ],
  },
];

export const OCCASION_LABELS: Record<OccasionId, string> = Object.fromEntries(
  OCCASIONS.map((o) => [o.id, o.name]),
) as Record<OccasionId, string>;

export function occasionById(id: OccasionId): Occasion {
  const found = OCCASIONS.find((o) => o.id === id);
  // Unreachable through the union type; a guard for data that arrives from a publish payload.
  if (!found) throw new Error(`unknown occasion "${id}"`);
  return found;
}

// ── Search aliases ──────────────────────────────────────────────────────────

/** What an alias expands to. An alias may resolve to a SET of values across facets —
 *  when a producer's word legitimately spans categories, search fans out rather than
 *  forcing the taxonomy's internal boundary onto the user (proposal §14). */
export interface AliasTargets {
  categories?: GraphicCategoryId[];
  /** Controlled subtype ids within the categories above — lets a precise word ("sponsor",
   *  "station id") rank the right SUBTYPE rather than boosting a whole category equally. */
  subtypes?: string[];
  structures?: StructureId[];
  formats?: ProgrammeFormatId[];
  families?: ProgrammeFamilyId[];
  styles?: StyleTag[];
  /** The MOMENT the phrase names (facet I). Filled automatically from each occasion's own
   *  `phrases` — declare it here by hand only to give an existing alias an occasion it should
   *  also carry, the way "intermission" is both the holding category and the break moment. */
  occasions?: OccasionId[];
}

/**
 * NORMALIZE A SEARCH PHRASE — lowercase, strip combining marks, trim.
 *
 * It lives here rather than in `templates/search.ts` because the ALIAS KEYS have to be folded
 * exactly the way a typed query is: search normalizes the query before it looks a key up, so a
 * table written with the diacritics a Swede or a Finn actually types ("ämne", "siirtymä") would
 * match nothing at all if its keys kept theirs. One function used by both sides is what makes
 * "declare the word the way it is spelled" safe.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').trim();
}

/** The ENGLISH table. Keys are matched as whole phrases before tokenizing. Grown from
 *  observation, reviewed like config; every target must be an existing facet id — the table
 *  cannot invent taxonomy. Merged with the locale tables below into `ALIASES`. */
const ALIASES_EN: Record<string, AliasTargets> = {
  // graphic-category vocabulary
  'name graphic': { categories: ['lower-third'] },
  'name card': { categories: ['lower-third'] },
  'name tag': { categories: ['lower-third'] },
  'nameplate': { categories: ['lower-third'] },
  'strap': { categories: ['lower-third'] },
  'super': { categories: ['lower-third'] },
  'chyron': { categories: ['lower-third'] },
  'l3': { categories: ['lower-third'] },
  'corner logo': { categories: ['bug'] },
  'watermark': { categories: ['bug'], subtypes: ['logo-only', 'station'] },
  'dog': { categories: ['bug'], subtypes: ['logo-only', 'station'] },
  'station id': { categories: ['bug'], subtypes: ['station'] },
  'ident': { categories: ['bug'], subtypes: ['station', 'event'] },
  // The size adjectives a student reaches for when they mean a full-frame title. Token-AND is
  // exact, so "big title" matched NOTHING even though "title" matched 71 - no design is both
  // "big" (Big Stat) and "title". A producer's phrase for a graphic is precisely what this
  // table is for, so it is answered here rather than by loosening the AND.
  'big title': { categories: ['title'] },
  'large title': { categories: ['title'] },
  'full screen title': { categories: ['title'] },
  'fullscreen title': { categories: ['title'] },
  'handle': { categories: ['bug'], subtypes: ['social-handle'] },
  'viewer question': { categories: ['question'] },
  'chat question': { categories: ['question'] },
  'ama': { categories: ['question'], formats: ['live-qa'] },
  'verse': { categories: ['quote'] },
  'scripture': { categories: ['quote'] },
  'bible': { categories: ['quote'] },
  'score': { categories: ['scoreboard'] },
  'scorebug': { categories: ['scoreboard'] },
  'score box': { categories: ['scoreboard'] },
  'standings': { categories: ['results'] },
  'league table': { categories: ['results'] },
  'leaderboard': { categories: ['results'] },
  // Live-timing vocabulary. Every one of these is a producer's word for the same graphic, and
  // none of them used to reach anything: "timing tower" matched no template in the catalog and
  // the search fell through to whatever else the words touched.
  'timing tower': { categories: ['results'], subtypes: ['timing-tower'] },
  'timing screen': { categories: ['results'], subtypes: ['timing-tower'] },
  'live timing': { categories: ['results'], subtypes: ['timing-tower'] },
  'lap times': { categories: ['results'], subtypes: ['timing-tower'] },
  'split times': { categories: ['results'], subtypes: ['timing-tower'] },
  'race positions': { categories: ['results'], subtypes: ['timing-tower'] },
  'start list': { categories: ['results'], subtypes: ['timing-tower'] },
  'bracket': { categories: ['results'] },
  'clock': { categories: ['timer'] },
  'stopwatch': { categories: ['timer'] },
  'timer': { categories: ['timer'] },
  'countdown': { categories: ['timer', 'holding'] },
  'crawl': { categories: ['ticker'] },
  'marquee': { categories: ['ticker'] },
  'headline bar': { categories: ['ticker'] },
  'breaking': { categories: ['alert', 'ticker'] },
  'breaking news': { categories: ['alert', 'ticker'] },
  // public-service vocabulary (docs/PUBLIC_SERVICE_PACK.md)
  'emergency': { categories: ['alert'], subtypes: ['emergency'] },
  'warning': { categories: ['alert'], subtypes: ['warning'] },
  'weather warning': { categories: ['alert'], subtypes: ['warning'] },
  'evacuation': { categories: ['alert'], subtypes: ['emergency'] },
  'service status': { categories: ['alert'], subtypes: ['status'] },
  'public notice': { categories: ['alert', 'info'], subtypes: ['notice'] },
  'advisory': { categories: ['alert', 'info'] },
  'disclaimer': { categories: ['info'], subtypes: ['disclaimer'] },
  'small print': { categories: ['info'], subtypes: ['disclaimer'] },
  'instructions': { categories: ['info'], subtypes: ['step'] },
  'source label': { categories: ['bug'], subtypes: ['source'] },
  'attribution': { categories: ['bug'], subtypes: ['source'] },
  'bilingual': { categories: ['caption'], subtypes: ['translation'] },
  'translation': { categories: ['caption'], subtypes: ['translation'] },
  'agenda': { categories: ['list'] },
  'schedule': { categories: ['list'] },
  'running order': { categories: ['list'] },
  'rundown': { categories: ['list'] },
  'lineup': { categories: ['list'] },
  'vote': { categories: ['poll-quiz'] },
  'voting': { categories: ['poll-quiz'] },
  'poll': { categories: ['poll-quiz'] },
  'survey': { categories: ['poll-quiz'] },
  'quiz': { categories: ['poll-quiz'] },
  'donation bar': { categories: ['progress'] },
  'goal bar': { categories: ['progress'] },
  'fundraising meter': { categories: ['progress'] },
  'sub goal': { categories: ['progress'] },
  'price card': { categories: ['product'] },
  'offer': { categories: ['product'] },
  'deal': { categories: ['product'] },
  'sale': { categories: ['product'] },
  'qr': { categories: ['cta'] },
  'link card': { categories: ['cta'] },
  // PURPOSE WORDS FAN ACROSS THE FORMS THAT SERVE THEM. The category says what a graphic IS
  // (a corner mark, a panel, a strip); a purpose is what it is FOR, and the same purpose is
  // served by several forms — a sponsor is a bug AND a panel, a fundraiser is a meter AND a
  // call to action. Measured 2026-08-27: "sponsor" already reached both (44 bugs, 3 panels),
  // and "donate"/"fundraiser"/"follow us" reached nothing at all, because only the Swedish and
  // Finnish sides of those words had been declared. A purpose that names one form is the
  // failure this rule exists to prevent — see §20 of the taxonomy proposal.
  'sponsor': { categories: ['bug', 'sponsor'], subtypes: ['sponsor'] },
  'partner': { categories: ['bug', 'sponsor'], subtypes: ['sponsor'] },
  'donate': { categories: ['cta', 'progress'], subtypes: ['donate', 'donation-goal'] },
  'donation': { categories: ['progress', 'cta'], subtypes: ['donation-goal', 'donate'] },
  'fundraiser': { categories: ['progress', 'cta'], subtypes: ['donation-goal'] },
  'charity': { categories: ['progress', 'cta'], subtypes: ['donation-goal'] },
  'follow us': { categories: ['cta', 'bug'], subtypes: ['follow', 'social-handle'] },
  'subscribe': { categories: ['cta'], subtypes: ['follow'] },
  'starting soon': { categories: ['holding'] },
  'brb': { categories: ['holding'] },
  'be right back': { categories: ['holding'] },
  'intermission': { categories: ['holding'] },
  'stream ending': { categories: ['holding'] },
  'outro': { categories: ['credits', 'holding'], occasions: ['sign-off'] },
  'roll': { categories: ['credits'] },
  'credit roll': { categories: ['credits'] },
  // The rest of the end-of-programme vocabulary. Plain "credit"/"credits" already reaches the
  // whole shelf through the category NAME in the text index, so it is deliberately not an
  // alias — consuming the word would cost the design called Credit Reel its name-weight lead
  // and flatten thirteen designs into catalog order. These are the phrases that reached
  // nothing or the wrong thing when measured on 2026-08-26: "crew", "special thanks",
  // "end titles" and "supporters" returned NO template at all, and "closing credits" and
  // "rolling credits" each returned exactly one, from a loose two-word text match.
  'closing credits': { categories: ['credits'], occasions: ['sign-off'] },
  'rolling credits': { categories: ['credits'], occasions: ['sign-off'] },
  'end titles': { categories: ['credits'], occasions: ['sign-off'] },
  'crew': { categories: ['credits'] },
  'cast list': { categories: ['credits'] },
  'special thanks': { categories: ['credits'] },
  'supporters': { categories: ['credits'] },
  'patrons': { categories: ['credits'] },
  'lyrics': { categories: ['caption'] },
  'surtitles': { categories: ['caption'] },
  'subtitles': { categories: ['caption'] },
  'versus': { categories: ['reveal'] },
  'vs': { categories: ['reveal'] },
  'head to head': { categories: ['reveal'] },
  'matchup': { categories: ['reveal'] },
  'face-off': { categories: ['reveal'] },
  'award': { categories: ['reveal', 'results', 'bug'], subtypes: ['award'] },
  'winner': { categories: ['reveal', 'results'], subtypes: ['winner'] },
  'trophy': { categories: ['reveal', 'bug'], subtypes: ['award'] },
  'stinger': { categories: ['transition'] },
  'wipe': { categories: ['transition'] },
  // structure vocabulary
  'two person': { structures: ['two-person'] },
  'double': { structures: ['two-person'] },
  'dual': { structures: ['two-person'] },
  'interview strap': { structures: ['two-person'], categories: ['lower-third'] },
  // programme vocabulary
  'church': { formats: ['church-service'] },
  'worship': { formats: ['church-service'] },
  'sermon': { formats: ['church-service'] },
  'football': { families: ['sports'] },
  'soccer': { families: ['sports'] },
  'motorsport': { families: ['sports'] },
  'racing': { families: ['sports'] },
  'cycling': { families: ['sports'] },
  'swimming': { families: ['sports'] },
  'athletics': { families: ['sports'] },
  'basketball': { families: ['sports'] },
  'hockey': { families: ['sports'] },
  'handball': { families: ['sports'] },
  'twitch': { families: ['creator'] },
  'streamer': { families: ['creator'] },
  'obs': { families: ['creator'] },
  // style adjectives → the style families (proposal §9). Editorial and cinematic are now
  // real families, so their adjectives point at them; the neighbouring looks still fan out
  // to the family that best carries them.
  'corporate': { styles: ['minimal', 'editorial'] },
  'editorial': { styles: ['editorial'] },
  'magazine': { styles: ['editorial'] },
  'newsroom': { styles: ['editorial', 'minimal'] },
  'masthead': { styles: ['editorial'] },
  'broadcast news': { styles: ['editorial', 'minimal'] },
  'flat': { styles: ['minimal'] },
  'light': { styles: ['minimal'] },
  'esports look': { styles: ['sport'] },
  'energetic': { styles: ['sport'] },
  'bold': { styles: ['sport', 'noacg'] },
  'luxury': { styles: ['glass'] },
  'elegant': { styles: ['glass'] },
  'cinematic': { styles: ['cinematic'] },
  'documentary': { styles: ['cinematic'] },
  'film': { styles: ['cinematic'] },
  'title card': { styles: ['cinematic'] },
  'futuristic': { styles: ['glass'] },
  'tech': { styles: ['glass'] },
  'glass': { styles: ['glass'] },
  'playful': { styles: ['noacg'] },
  'youthful': { styles: ['noacg'] },
};

// ── Swedish and Finnish search vocabulary ───────────────────────────────────
//
// WHY THESE EXIST AT ALL. The catalog is written in English and the text index is built from
// English names, English category labels and English field titles, so a Nordic word had nothing
// to match: measured 2026-08-27 with `scripts/spike-search-journey.mjs`, 38 of the 40 terms a
// Swedish or Finnish student would actually type returned ZERO designs. The two that returned
// anything were worse than zero — "logo" is spelled the same in Finnish and returned 203 designs
// across four shelves, and Swedish "paus" (a break) prefix-matched the English word "pause" in
// scoreboard descriptions and returned scoreboards.
//
// The tables are declared in the spelling a person TYPES ("ämne", "siirtymä") and merged with
// their keys folded through `normalizeSearchText` — the same fold search runs over the query, so
// the two meet. Declaring them pre-folded would work and would be unreadable, and an
// unreviewable table is how a wrong target survives.
//
// THE CONSUMES-ITS-PHRASE RULE APPLIES HERE TOO (see ParsedQuery.aliasPhrases in
// templates/search.ts): an alias is STRIPPED from the query, so a key that is also an English
// word the catalog uses would silently delete that word's text matches. That is why bare 'logo',
// 'text' and 'super' are NOT keys in these tables even though they are the Finnish or Swedish
// word too — 'kanavalogo' and 'logga' carry the same meaning and collide with nothing.
//
// A plural is its own key. The English fold strips a trailing s/es, which does nothing for
// Swedish -ar/-er/-or or Finnish -t/-set, so where a plural is what people type it is declared.

/** SWEDISH. Broadcast-desk vocabulary, not dictionary translations: what a Swedish-speaking
 *  student or an SVT/Yle operator writes in the box. */
const ALIASES_SV: Record<string, AliasTargets> = {
  // lower thirds — the single most-typed thing in the box
  'namnskylt': { categories: ['lower-third'] },
  'namnskyltar': { categories: ['lower-third'] },
  'namnplatta': { categories: ['lower-third'] },
  'namnruta': { categories: ['lower-third'] },
  'presentationsskylt': { categories: ['lower-third'] },
  'namn och titel': { categories: ['lower-third'] },
  'namn': { categories: ['lower-third'] },
  'gäst': { categories: ['lower-third'], subtypes: ['speaker'] },
  'intervju': { categories: ['lower-third'], structures: ['two-person'] },
  'plats': { categories: ['lower-third', 'bug'], subtypes: ['locator', 'location'] },
  'direkt': { categories: ['bug'], subtypes: ['live'] },
  // bugs and corner marks
  'kanallogga': { categories: ['bug'], subtypes: ['station'] },
  'logga': { categories: ['bug'], subtypes: ['logo-only', 'station'] },
  'hörnlogga': { categories: ['bug'] },
  'vattenstämpel': { categories: ['bug'], subtypes: ['logo-only'] },
  'kanalmärke': { categories: ['bug'], subtypes: ['station'] },
  'källa': { categories: ['bug'], subtypes: ['source'] },
  // titles, topics, cards
  'titel': { categories: ['title'] },
  'titelskylt': { categories: ['title'] },
  'programtitel': { categories: ['title'] },
  'vinjett': { categories: ['title'], subtypes: ['show-open'] },
  'öppning': { categories: ['title'], subtypes: ['show-open'] },
  'ämne': { categories: ['topic'] },
  'ämnesskylt': { categories: ['topic'] },
  'kapitel': { categories: ['topic'], subtypes: ['chapter'] },
  'rubrik': { categories: ['topic', 'title'] },
  'härnäst': { categories: ['topic'], subtypes: ['coming-up'] },
  'nu spelas': { categories: ['topic'], subtypes: ['now-playing'] },
  'faktaruta': { categories: ['info'], subtypes: ['fact'] },
  'infokort': { categories: ['info'] },
  'fakta': { categories: ['info'], subtypes: ['fact'] },
  'förklaring': { categories: ['info'], subtypes: ['explainer'] },
  'citat': { categories: ['quote'] },
  'bibelvers': { categories: ['quote'], subtypes: ['scripture'] },
  // questions and audience
  'fråga': { categories: ['question'] },
  'frågor': { categories: ['question'] },
  'tittarfråga': { categories: ['question'], subtypes: ['viewer-question'] },
  'chattfråga': { categories: ['question'], subtypes: ['chat-highlight'] },
  'omröstning': { categories: ['poll-quiz'] },
  'röstning': { categories: ['poll-quiz'] },
  'enkät': { categories: ['poll-quiz'] },
  'frågesport': { categories: ['poll-quiz'], subtypes: ['quiz-question'] },
  // scores and results
  'poängtavla': { categories: ['scoreboard'] },
  'resultattavla': { categories: ['scoreboard'] },
  'matchklocka': { categories: ['scoreboard'] },
  'ställning': { categories: ['scoreboard'] },
  'poäng': { categories: ['scoreboard'] },
  'resultattabell': { categories: ['results'] },
  'ligatabell': { categories: ['results'] },
  'tabell': { categories: ['results'] },
  'slutresultat': { categories: ['results'], subtypes: ['final-score'] },
  'resultat': { categories: ['results'] },
  'placeringar': { categories: ['results'] },
  'startlista': { categories: ['results'], subtypes: ['timing-tower'] },
  'mellantider': { categories: ['results'], subtypes: ['timing-tower'] },
  'statistik': { categories: ['stats'] },
  'vinnare': { categories: ['reveal'], subtypes: ['winner'] },
  'duell': { categories: ['reveal'], subtypes: ['versus'] },
  // time
  'nedräkning': { categories: ['timer', 'holding'], subtypes: ['countdown'] },
  'klocka': { categories: ['timer'] },
  'tidtagning': { categories: ['timer'] },
  'taltid': { categories: ['timer'], subtypes: ['speaking-timer'] },
  // strips
  'nyhetsband': { categories: ['ticker'] },
  'löpband': { categories: ['ticker'] },
  'textband': { categories: ['ticker'] },
  'textremsa': { categories: ['caption'], subtypes: ['caption'] },
  'nyhetsflash': { categories: ['alert'], subtypes: ['breaking'] },
  'varning': { categories: ['alert'], subtypes: ['warning'] },
  'larm': { categories: ['alert'], subtypes: ['emergency'] },
  'viktigt meddelande': { categories: ['alert'], subtypes: ['emergency'] },
  'undertexter': { categories: ['caption'], subtypes: ['caption'] },
  'textning': { categories: ['caption'], subtypes: ['caption'] },
  'låttext': { categories: ['caption'], subtypes: ['lyrics'] },
  'översättning': { categories: ['caption'], subtypes: ['translation'] },
  // lists and data
  'körschema': { categories: ['list'] },
  'dagordning': { categories: ['list'], subtypes: ['agenda'] },
  'schema': { categories: ['list'], subtypes: ['schedule'] },
  'låtlista': { categories: ['list'], subtypes: ['setlist'] },
  'karta': { categories: ['map'] },
  // breaks and credits
  // Swedish for a break. It is declared not only because it was missing but because the word
  // was actively WRONG without it: 'paus' folds to a prefix of the English "pause", which
  // scoreboard descriptions use for the clock, so it returned 24 scoreboards. Consuming the
  // phrase is what stops that accidental prefix match.
  'paus': { categories: ['holding'], occasions: ['break'] },
  'pausskärm': { categories: ['holding'], occasions: ['break'] },
  'strax tillbaka': { categories: ['holding'], subtypes: ['brb'], occasions: ['break'] },
  'strax börjar vi': { categories: ['holding'], subtypes: ['starting'], occasions: ['pre-show'] },
  'sändningen börjar snart': { categories: ['holding'], subtypes: ['starting'], occasions: ['pre-show'] },
  'mellanakt': { categories: ['holding'], subtypes: ['intermission'], occasions: ['break'] },
  'eftertexter': { categories: ['credits'], occasions: ['sign-off'] },
  'sluttexter': { categories: ['credits'], occasions: ['sign-off'] },
  'medverkande': { categories: ['credits'], subtypes: ['role-credits'] },
  'tack till': { categories: ['credits'], subtypes: ['thank-you'] },
  'rulltext': { categories: ['credits'], subtypes: ['end-credits'], occasions: ['sign-off'] },
  // commerce
  'samarbetspartner': { categories: ['sponsor', 'bug'], subtypes: ['sponsor'] },
  'prisskylt': { categories: ['product'], subtypes: ['price'] },
  'erbjudande': { categories: ['product'] },
  'insamlingsmätare': { categories: ['progress'], subtypes: ['donation-goal'] },
  'donera': { categories: ['cta'], subtypes: ['donate'] },
  'länk': { categories: ['cta'], subtypes: ['link'] },
  'följ oss': { categories: ['cta'], subtypes: ['follow'] },
  // frames and transitions
  'övergång': { categories: ['transition'] },
  'svep': { categories: ['transition'], subtypes: ['replay-wipe'] },
  'ram': { categories: ['frame'] },
  'webbkamera': { categories: ['frame'], subtypes: ['webcam'] },
  'delad skärm': { categories: ['frame'], subtypes: ['split-screen'] },
  'bakgrund': { categories: ['frame'], subtypes: ['background'] },
  'notis': { categories: ['notification'] },
  // programme vocabulary
  'fotboll': { families: ['sports'] },
  'ishockey': { families: ['sports'] },
  'innebandy': { families: ['sports'] },
  'handboll': { families: ['sports'] },
  'friidrott': { families: ['sports'] },
  'gudstjänst': { formats: ['church-service'] },
  'predikan': { formats: ['church-service'] },
  'kyrka': { formats: ['church-service'] },
  'skoltv': { formats: ['school-tv'] },
  'föreläsning': { formats: ['lecture'] },
  'valvaka': { formats: ['election-night'] },
  'nyheter': { families: ['news'] },
  // ── 2026-08-28 owner walk: the words a working broadcaster actually TYPES, not category
  // translations. The owner searched `namnplansch` and got nothing — the first table carried
  // dictionary-adjacent terms, so this sweep adds the everyday words and control-room slang
  // per major category. Same rules as above: no key that is also an English word the catalog
  // uses (an alias CONSUMES its phrase and would delete that word's text matches).
  'namnplansch': { categories: ['lower-third'] },
  'namnbricka': { categories: ['lower-third'] },
  'namnremsa': { categories: ['lower-third'] },
  'skylt': { categories: ['lower-third', 'title'] },
  'plansch': { categories: ['title', 'info'] },
  'stoppur': { categories: ['timer'] },
  'pausbild': { categories: ['holding'], subtypes: ['break'], occasions: ['break'] },
  'reklampaus': { categories: ['holding'], subtypes: ['break'], occasions: ['break'] },
  'testbild': { categories: ['holding'], occasions: ['technical-problem'] },
  'topplista': { categories: ['results'], subtypes: ['leaderboard'] },
  'resultatlista': { categories: ['results'], subtypes: ['results-table'] },
  'tablå': { categories: ['list'], subtypes: ['schedule'] },
};

/** FINNISH. Same rule: the words a Finnish control room uses, not literal translations. */
const ALIASES_FI: Record<string, AliasTargets> = {
  // lower thirds
  'nimikyltti': { categories: ['lower-third'] },
  'nimiplanssi': { categories: ['lower-third'] },
  'nimitieto': { categories: ['lower-third'] },
  'alapalkki': { categories: ['lower-third'] },
  'tekstiplanssi': { categories: ['lower-third'] },
  'nimi ja titteli': { categories: ['lower-third'] },
  'juonto': { categories: ['lower-third'] },
  'juontaja': { categories: ['lower-third'], subtypes: ['speaker'] },
  'nimi': { categories: ['lower-third'] },
  'vieras': { categories: ['lower-third'], subtypes: ['speaker'] },
  'haastattelu': { categories: ['lower-third'], structures: ['two-person'] },
  'paikka': { categories: ['lower-third', 'bug'], subtypes: ['locator', 'location'] },
  'suora': { categories: ['bug'], subtypes: ['live'] },
  // bugs
  'kanavalogo': { categories: ['bug'], subtypes: ['station'] },
  'kanavatunnus': { categories: ['bug'], subtypes: ['station'] },
  'nurkkalogo': { categories: ['bug'], subtypes: ['logo-only'] },
  'vesileima': { categories: ['bug'], subtypes: ['logo-only'] },
  'lähde': { categories: ['bug'], subtypes: ['source'] },
  // titles, topics, cards
  'otsikko': { categories: ['title', 'topic'] },
  'otsikkoplanssi': { categories: ['title'] },
  'aloitusplanssi': { categories: ['title'], subtypes: ['show-open'] },
  'ohjelman nimi': { categories: ['title'] },
  'aihe': { categories: ['topic'] },
  'aiheplanssi': { categories: ['topic'] },
  'luku': { categories: ['topic'], subtypes: ['chapter'] },
  'seuraavaksi': { categories: ['topic'], subtypes: ['coming-up'] },
  'nyt soi': { categories: ['topic'], subtypes: ['now-playing'] },
  'tietoisku': { categories: ['info'], subtypes: ['explainer'] },
  'faktalaatikko': { categories: ['info'], subtypes: ['fact'] },
  'ohje': { categories: ['info'], subtypes: ['step'] },
  'sitaatti': { categories: ['quote'] },
  'lainaus': { categories: ['quote'] },
  'raamatunkohta': { categories: ['quote'], subtypes: ['scripture'] },
  // questions and audience
  'kysymys': { categories: ['question'] },
  'kysymykset': { categories: ['question'] },
  'katsojakysymys': { categories: ['question'], subtypes: ['viewer-question'] },
  'äänestys': { categories: ['poll-quiz'], subtypes: ['vote'] },
  'kysely': { categories: ['poll-quiz'], subtypes: ['poll-result'] },
  'gallup': { categories: ['poll-quiz'], subtypes: ['poll-result'] },
  'tietovisa': { categories: ['poll-quiz'], subtypes: ['quiz-question'] },
  // scores and results
  'tulostaulu': { categories: ['scoreboard'] },
  'pistetaulu': { categories: ['scoreboard'] },
  'ottelukello': { categories: ['scoreboard'] },
  'tilanne': { categories: ['scoreboard'] },
  'pisteet': { categories: ['scoreboard'] },
  'tulokset': { categories: ['results'] },
  'tulostaulukko': { categories: ['results'], subtypes: ['results-table'] },
  'sarjataulukko': { categories: ['results'], subtypes: ['leaderboard'] },
  'lopputulokset': { categories: ['results'], subtypes: ['final-score'] },
  'sijoitukset': { categories: ['results'] },
  'lähtölista': { categories: ['results'], subtypes: ['timing-tower'] },
  'väliajat': { categories: ['results'], subtypes: ['timing-tower'] },
  'tilastot': { categories: ['stats'] },
  'voittaja': { categories: ['reveal'], subtypes: ['winner'] },
  'vastakkain': { categories: ['reveal'], subtypes: ['versus'] },
  // time
  'ajastin': { categories: ['timer'] },
  'kello': { categories: ['timer'] },
  'lähtölaskenta': { categories: ['timer', 'holding'], subtypes: ['countdown'] },
  'ajanotto': { categories: ['timer'] },
  'puheaika': { categories: ['timer'], subtypes: ['speaking-timer'] },
  // strips
  'uutisnauha': { categories: ['ticker'] },
  'tekstinauha': { categories: ['ticker'] },
  'juoksutusteksti': { categories: ['ticker'], subtypes: ['crawl'] },
  'uutissalama': { categories: ['alert'], subtypes: ['breaking'] },
  'varoitus': { categories: ['alert'], subtypes: ['warning'] },
  'hälytys': { categories: ['alert'], subtypes: ['emergency'] },
  'hätätiedote': { categories: ['alert'], subtypes: ['emergency'] },
  'tiedote': { categories: ['alert', 'info'], subtypes: ['notice'] },
  'tekstitys': { categories: ['caption'], subtypes: ['caption'] },
  'tekstitykset': { categories: ['caption'], subtypes: ['caption'] },
  'sanoitukset': { categories: ['caption'], subtypes: ['lyrics'] },
  'käännös': { categories: ['caption'], subtypes: ['translation'] },
  // lists and data
  'ajolista': { categories: ['list'] },
  'aikataulu': { categories: ['list'], subtypes: ['schedule'] },
  'esityslista': { categories: ['list'], subtypes: ['agenda'] },
  'soittolista': { categories: ['list'], subtypes: ['setlist'] },
  'kartta': { categories: ['map'] },
  // breaks and credits
  'tauko': { categories: ['holding'], occasions: ['break'] },
  'taukokuva': { categories: ['holding'], subtypes: ['break'], occasions: ['break'] },
  'alkaa pian': { categories: ['holding'], subtypes: ['starting'], occasions: ['pre-show'] },
  'palaamme pian': { categories: ['holding'], subtypes: ['brb'], occasions: ['break'] },
  'lähetys alkaa': { categories: ['holding'], subtypes: ['starting'], occasions: ['pre-show'] },
  'lopputekstit': { categories: ['credits'], occasions: ['sign-off'] },
  'tekijät': { categories: ['credits'], subtypes: ['role-credits'] },
  'kiitokset': { categories: ['credits'], subtypes: ['thank-you'] },
  'esiintyjät': { categories: ['credits'], subtypes: ['role-credits'] },
  // commerce
  'sponsori': { categories: ['sponsor', 'bug'], subtypes: ['sponsor'] },
  'yhteistyökumppani': { categories: ['sponsor', 'bug'], subtypes: ['sponsor'] },
  'hinta': { categories: ['product'], subtypes: ['price'] },
  'tarjous': { categories: ['product'] },
  'tuotekortti': { categories: ['product'], subtypes: ['product-card'] },
  'keräysmittari': { categories: ['progress'], subtypes: ['donation-goal'] },
  'lahjoita': { categories: ['cta'], subtypes: ['donate'] },
  'linkki': { categories: ['cta'], subtypes: ['link'] },
  'seuraa meitä': { categories: ['cta'], subtypes: ['follow'] },
  // frames and transitions
  'siirtymä': { categories: ['transition'] },
  'pyyhkäisy': { categories: ['transition'], subtypes: ['replay-wipe'] },
  'kehys': { categories: ['frame'] },
  'webbikamera': { categories: ['frame'], subtypes: ['webcam'] },
  'jaettu ruutu': { categories: ['frame'], subtypes: ['split-screen'] },
  'tausta': { categories: ['frame'], subtypes: ['background'] },
  'ilmoitus': { categories: ['notification'] },
  // programme vocabulary
  'jalkapallo': { families: ['sports'] },
  'jääkiekko': { families: ['sports'] },
  'salibandy': { families: ['sports'] },
  'käsipallo': { families: ['sports'] },
  'yleisurheilu': { families: ['sports'] },
  'jumalanpalvelus': { formats: ['church-service'] },
  'saarna': { formats: ['church-service'] },
  'kirkko': { formats: ['church-service'] },
  'koulu-tv': { formats: ['school-tv'] },
  'luento': { formats: ['lecture'] },
  'vaalivalvojaiset': { formats: ['election-night'] },
  'uutiset': { families: ['news'] },
  // ── 2026-08-28 owner walk: broadcast slang and everyday words (the Swedish table's sibling
  // sweep). "tg" is what a Finnish control room calls a lower third — short for
  // tekstigrafiikka, and the owner's own word for it; "planssi" is the generic word for a
  // full-frame card, which the -planssi compounds above already lean on.
  'tg': { categories: ['lower-third'] },
  'tekstigrafiikka': { categories: ['lower-third'] },
  'kyltti': { categories: ['lower-third'] },
  'planssi': { categories: ['title', 'info'] },
  'sekuntikello': { categories: ['timer'] },
  'laskuri': { categories: ['timer', 'progress'] },
  'pistetilanne': { categories: ['scoreboard'] },
  'tuloslista': { categories: ['results'], subtypes: ['results-table'] },
  'väliaika': { categories: ['holding'], subtypes: ['intermission', 'break'], occasions: ['break'] },
  'mainoskatko': { categories: ['holding'], subtypes: ['break'], occasions: ['break'] },
  'kreditit': { categories: ['credits'], occasions: ['sign-off'] },
  // Short for tietovisa. Consuming it also ends an accidental prefix match: bare "visa" used
  // to reach the frame designs through the English "visualizer" (the 'paus' pattern).
  'visa': { categories: ['poll-quiz'] },
};

/** Union the targets of two entries for the same phrase. A key that means the same graphic in
 *  two languages is the ordinary case; a key that collides ACROSS languages must not silently
 *  lose one side's meaning, which is what a plain object spread would do. */
function mergeAliasTargets(a: AliasTargets, b: AliasTargets): AliasTargets {
  const union = <T>(x?: T[], y?: T[]): T[] | undefined =>
    (!x && !y ? undefined : [...new Set([...(x ?? []), ...(y ?? [])])]);
  return {
    categories: union(a.categories, b.categories),
    subtypes: union(a.subtypes, b.subtypes),
    structures: union(a.structures, b.structures),
    formats: union(a.formats, b.formats),
    families: union(a.families, b.families),
    styles: union(a.styles, b.styles),
    occasions: union(a.occasions, b.occasions),
  };
}

/** Facet I as alias entries: every occasion's own phrases, pointing at it. Built rather than
 *  written into the tables below, so a phrase declared on the occasion cannot fail to reach it —
 *  the declaration IS the alias. Merged like any other table, so a phrase that already means
 *  something ("intermission" = the holding category) keeps that meaning and gains the moment. */
const ALIASES_OCCASION: Record<string, AliasTargets> = Object.fromEntries(
  OCCASIONS.flatMap((occasion) => occasion.phrases.map((phrase) => [phrase, { occasions: [occasion.id] }])),
);

/**
 * THE ONE alias table search reads, in three languages, keyed on the NORMALIZED phrase.
 *
 * Built rather than written out so each locale table stays readable in its own spelling while
 * the folding that makes the lookup work happens in exactly one place.
 */
export const ALIASES: Record<string, AliasTargets> = (() => {
  const out: Record<string, AliasTargets> = {};
  for (const table of [ALIASES_EN, ALIASES_SV, ALIASES_FI, ALIASES_OCCASION]) {
    for (const [phrase, targets] of Object.entries(table)) {
      const key = normalizeSearchText(phrase);
      out[key] = key in out ? mergeAliasTargets(out[key], targets) : targets;
    }
  }
  return out;
})();
