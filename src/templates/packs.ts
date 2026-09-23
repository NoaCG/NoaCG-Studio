// TEMPLATE PACKS - the KITS a user starts a production from (docs/PACK_TAXONOMY.md).
//
// A kit is a collection of graphics for one kind of production: the answer to "I run a church
// stream / an esports night / an election program - which graphics do I need?". It has ONE
// Style (`family`, plus an optional `paletteId`), a STARTER of about ten graphics that arrive
// ticked, and a larger LIBRARY (`types` + `extras`) the user can add from. The 60 reference
// formats in live_format_graphics_needs.xlsx each map to exactly one kit, and that mapping IS
// the taxonomy document's machine-readable half.
//
// A kit is PURE CONFIG: every (type, family) cell it names already has a shipped, gate-checked
// design, so `resolvePack` only looks the cells up in the live registry. A NEW kit is one entry
// in this array. A new STYLE FAMILY is deliberately not config: it needs a design per type and a
// FAMILY_TOKENS row before a kit could point at it, and `validatePacks` would say so.
//
// ONE STYLE PER KIT (decided 2026-09-23). A kit used to re-resolve into any family its types
// filled, behind a "Look" select, which made every kit four kits. Now the family is the kit's
// Style and nothing re-resolves it. The user still restyles freely inside the wizard - palette,
// typeface, sizes, motion - per graphic or across the whole kit, and that is the `:root`
// contract, not a different set of designs. Visual variety across the gallery comes from the
// kits themselves: no two share both a family and a palette.
//
// `scripts/factory.mjs` validates all of this on every run: every type id resolves in its kit's
// family, every extra exists in the catalog, every starter can run a show, and the 60 formats
// are covered exactly once. Editing this file cannot silently break the taxonomy.

import type { StyleTag } from '../model/fonts';
import { typeById, TYPES } from './types/registry';

export interface TemplatePack {
  id: string;
  name: string;
  /** Who this kit is for, in the wizard's voice. */
  description: string;
  /** THE kit's Style family. Every type in `types` must ship a design in it. */
  family: StyleTag;
  /**
   * The ONE palette the kit's graphics are CREATED with - the unified look a coherent show
   * demands. A style family is not one palette (newsroom's own design defaults mixed signal,
   * ivory, frost and noacg), so a kit names its palette and the kit create imposes it on every
   * graphic the palette is drawn for (`Palette.styleTags`). An off-family extra keeps its own
   * default: a light Porcelain panel on a glass strap would be a mistake, not a look. Absent =
   * each design keeps its own default, which is right where the look is authored into the
   * designs themselves (Esports' Volt, the three game-show families).
   */
  paletteId?: string;
  /**
   * The graphics TICKED when a user picks this kit: `KitChoice` keys (a type id, or
   * `extra:<designId>`). About ten - enough to run the show, few enough to read at a glance.
   * The FIRST is the kit's signature graphic and its card's cover picture, so the gallery shows
   * what each kit is rather than eight title cards; the rest follow in rundown order.
   * Everything else in the library is one tick away.
   */
  starter: string[];
  /** The kit's LIBRARY of GraphicType ids, in curated order (the order a rundown would reach
   *  for them). The starter's types are a subset. */
  types: string[];
  /** Catalog variants OUTSIDE the type registry that belong in the kit's library (end credits,
   *  the versus card, the specialist straps). Validated against the live catalog by the
   *  factory. An extra carries its own look, so only an in-family one may be in the starter. */
  extras?: string[];
  /**
   * The reference formats this kit serves - VERBATIM row values from
   * live_format_graphics_needs.xlsx. Every format appears in exactly one kit, so a kit may
   * declare none: Showtime Quiz and Arcade Quiz serve the same format Sticker Quiz owns.
   */
  formats: string[];
}

/** The Excel's row count. The factory asserts the kits below cover exactly this many
 *  formats with no duplicates, so a taxonomy edit cannot quietly drop or double-map one. */
export const REFERENCE_FORMAT_COUNT = 60;

/** The eight graphics of a two-player game show, shared by the three quiz kits. The quiz
 *  board leads: it is the graphic the show is, and so each quiz kit's cover. */
const QUIZ_SHOW_TYPES = [
  'quiz-show', 'title-card', 'lower-third',
  'duel-score', 'countdown',
  'key-facts', 'logo-bug',
  'sign-off',
];

export const PACKS: TemplatePack[] = [
  {
    // Match Day and the nine discipline packs (Football, Ice Hockey, Basketball, Handball,
    // Racket Sports, Motorsport, Athletics, Combat Sports, Club & School) in one kit. The
    // disciplines were the same match types cut for one sport's habits; the habits themselves
    // (which way the clock counts, periods or sets) are FIELDS of those types, so one library
    // carries every sport and the timing tower joins it for the racing ones.
    id: 'sports',
    name: 'Sports',
    description: 'Scorebug, match events, fixtures and the table - live match coverage for any sport.',
    family: 'sport',
    // One broadcast blue across the set; the designs' own defaults mixed volt, inferno and red.
    paletteId: 'royal',
    // The player strap leads: at cover size a scorebug is a thin strip, and the strap reads as
    // sport from across the room.
    starter: [
      'lower-third', 'scorebug', 'title-card', 'match-event', 'fixtures', 'standings',
      'countdown', 'sponsor-bug', 'key-facts', 'sign-off',
    ],
    types: [
      'title-card', 'lower-third', 'scorebug', 'match-event', 'match-status', 'match-board',
      'fixtures', 'standings', 'roster', 'scoreboard', 'timing-tower',
      'countdown', 'holding-screen', 'now-next', 'agenda', 'key-facts', 'notice-card',
      // The identity marks a match feed leaves up: the fixture ident, the live/replay status,
      // the sponsor bar, and the venue chip for pitchside cameras.
      'sponsor-bug', 'event-bug', 'live-bug', 'sponsor-strip', 'status-chip', 'ticker',
      'winner-card', 'sign-off',
    ],
    extras: [
      // The specialist straps a match feed is drawn for: the commentary pair as a block and
      // as a rail, and the three ways coverage names a player - by squad number, by the
      // stat line that justifies the cutaway, and by the club whose badge leads the card.
      'ls06', 'ls07', 'ls08', 'ls09', 'ls10',
      // The other scores crawling under this one, and the card a rain delay or a
      // postponement goes to - which an intermission screen is not: it says WHEN.
      'tk13', 'al10',
      // The versus cards for the match-up reveal (vs02 is the one the fight card and the
      // racket draw used), the results roll, the half-time hold and the sponsor board.
      'vs01', 'vs02', 'cr03', 'ss11', 'cr12',
    ],
    formats: ['Sports broadcast / match coverage', 'Local sports / amateur sports'],
  },
  {
    // The complete Volt tournament package. Its library is intentionally larger than a
    // competition-only collection: opener and holds, running order, identity and status marks,
    // player and caster straps, sponsor placements, a self-clearing cut transition, map veto,
    // live series and map operation, fixtures, standings, bracket and champion reveal.
    id: 'esports',
    name: 'Esports',
    description: 'A Volt tournament package: pre-show, match-up, live series, results and sponsors.',
    family: 'sport',
    starter: [
      'matchup', 'title-card', 'holding-screen', 'lower-third', 'esports-score', 'map-round',
      'standings', 'notice-card', 'sponsor-bug', 'sign-off',
    ],
    types: [
      // Open and hold the show before the first server is live, then keep the running order
      // readable between series.
      'title-card', 'holding-screen', 'countdown', 'now-next', 'agenda', 'notice-card',
      // Persistent tournament furniture: identity, playout state and commercial marks.
      'station-bug', 'live-bug', 'event-bug', 'status-chip',
      'lower-third', 'social-bug', 'sponsor-bug', 'sponsor-strip', 'sponsor-rotator',
      // A self-clearing cut cover whose editable label serves MATCH, REPLAY and HIGHLIGHTS.
      'transition',
      // Competition flow from match announcement through live operation.
      'matchup', 'head-to-head', 'player-card', 'roster',
      'esports-score', 'map-round', 'match-event', 'match-status', 'fixtures',
      // Desk and post-match coverage.
      'standings', 'bracket', 'ticker', 'scoreboard', 'winner-card',
      'sign-off',
    ],
    extras: [
      // Pre-match drafting needs the operator-driven veto board as well as the live map
      // ladder. The three straps identify players, the commentary pair and the analysis desk.
      'mr04', 'ls11', 'ls06', 'ls13',
      // The two-caster split, in this kit's own Volt look.
      'fr03',
      // Tournament-wide score and sponsor rails remain readable while play stays visible.
      'tk13', 'cr12',
    ],
    formats: ['Esports tournament'],
  },
  {
    id: 'talk-show',
    name: 'Talk Show',
    description: 'Guest straps, topic and question cards, polls - panels, podcasts and Q&As.',
    family: 'glass',
    // The unified studio look: everything in Frost, so the straps, cards and audience
    // surfaces read as one show rather than frost/orchid/noacg/ivory at once.
    paletteId: 'frost',
    starter: [
      'lower-third', 'topic-card', 'viewer-question', 'qa-card', 'poll', 'key-facts',
      'countdown', 'station-bug', 'social-bug', 'sign-off',
    ],
    types: [
      'lower-third', 'topic-card', 'poll', 'agenda', 'social-bug', 'sponsor-bug', 'countdown',
      'key-facts', 'recap-card',
      // A show ident for the corner, and a sponsor rotation for the partners a podcast or
      // panel show reads out between segments.
      'station-bug', 'sponsor-rotator',
      // The whole audience-interaction set: a live Q&A is this kit's own format.
      'viewer-question', 'qa-card', 'chat-highlight', 'question-queue', 'live-poll',
      'sign-off',
    ],
    extras: [
      // The panel's own straps, all in-family: the two-card remote interview, the
      // guest-over-host pair, the specialist's subject tag, and the now-playing strap a
      // radio-with-video show needs.
      'ls02', 'ls04', 'ls24', 'ls25',
      // The two-up interview surround, in this kit's own Frost look.
      'fr02',
      // The coming-up card, the glass Reading Card, Intermission and Back Shortly.
      'card19', 'card35', 'ss07', 'ss12',
    ],
    formats: [
      'Talk show / panel discussion',
      'Podcast livestream / videocast',
      'Live Q&A / AMA',
      'Remote interview show',
      'Magazine show / morning show',
      'Radio-style livestream with video',
      'Book launch / author event',
    ],
  },
  {
    id: 'newsroom',
    name: 'Newsroom',
    description: 'Anchor straps, the wire ticker, headline cards and alerts for news programs.',
    family: 'minimal',
    // The unified desk look: every kit graphic is created in Ivory, so the strap, the crawls
    // and the cards read as ONE broadcast rather than four palettes.
    paletteId: 'ivory',
    starter: [
      'headline-card', 'title-card', 'lower-third', 'ticker', 'key-facts', 'live-bug',
      'station-bug', 'alert-level', 'holding-screen', 'sign-off',
    ],
    types: [
      'lower-third', 'ticker', 'topic-card', 'title-card', 'agenda', 'sponsor-bug',
      'headline-card', 'key-facts', 'notice-card',
      // The newsroom's own furniture: the channel ident that never leaves, the live/replay
      // status a news desk is obliged to be honest about, and the location chip for reporters.
      'station-bug', 'live-bug', 'status-chip',
      // The public-service pair (docs/PUBLIC_SERVICE_PACK.md): the severity ladder is what an
      // emergency broadcast IS, and the two-language notice carries an obligation in one strip.
      'alert-level', 'public-notice',
      // The hold a news desk actually runs on - a bulletin waiting to start, a feed that has
      // dropped.
      'holding-screen',
      'sign-off',
    ],
    extras: [
      // The news desk's specialist straps: the remote two-box interview, the kicker that marks
      // comment as comment, the LIVE flag as its own element, the debate podium for election
      // nights, and the press-conference lectern.
      'ls01', 'ls23', 'ls28', 'ls21', 'ls17',
      // The crawls, one per job the `ticker` type's own design does not do: caps framing the
      // travel, a strip along the TOP while the lower third is busy, market deltas, the
      // opaque notice crawl, the breaking dot, a bilingual split - and the index strip +
      // status rotator. (NOT tk10: the ticker TYPE already resolves to Wire Rotator in this
      // family, and the name-keyed pool would silently merge the duplicate.)
      'tk11', 'tk12', 'tk14', 'tk15', 'tk16', 'tk17', 'tk04', 'tk18',
      // The breaking banner, the numbered emergency instructions, and the source label a
      // press conference is obliged to carry.
      'al09', 'pi02', 'pi03',
      'ss08', 'card52',
    ],
    formats: [
      'News / current affairs livestream',
      'Weather broadcast / climate update',
      'Finance / market livestream',
      'Security / surveillance-style public stream',
      'Press conference',
      'Emergency information stream',
      // School TV is a newsroom in miniature: an anchor strap, a ticker and a headline card.
      'Student production / school TV',
    ],
  },
  {
    id: 'election',
    name: 'Election',
    description: 'Result bars, the live count, candidate straps and the ticker for civic broadcasts.',
    family: 'minimal',
    // Results night reads in one hard red, set apart from the newsroom's Ivory desk.
    paletteId: 'signal',
    starter: [
      'poll', 'title-card', 'lower-third', 'live-poll', 'ticker', 'headline-card', 'key-facts',
      'countdown', 'live-bug', 'sign-off',
    ],
    types: [
      'poll', 'lower-third', 'ticker', 'title-card', 'agenda', 'countdown',
      'headline-card', 'key-facts',
      // Results night runs from many places at once: a location chip per feed, and a status
      // mark that says plainly whether a shot is live or a replay.
      'status-chip', 'live-bug',
      // The live vote carries the count as it comes in and calls a leader; the static poll
      // board above it is the finished result.
      'live-poll',
      // A civic broadcast is frequently obliged to carry its notices in two languages.
      'public-notice',
      'sign-off',
    ],
    extras: [
      // Civic coverage reads the party colour first: the result bar, the symmetric podium
      // strap a debate places twice, and the everyday affiliation strap. The analysis
      // kicker rides along because results night runs on interpretation.
      'ls20', 'ls21', 'ls22', 'ls23',
      // The council's own paperwork put on screen: the notice crawl, the public and
      // municipal notices, and the two-language panel a bilingual jurisdiction runs on.
      'tk15', 'pi01', 'pi05', 'pi07',
      'card52', 'cr05',
    ],
    formats: [
      'Election night / results program',
      'Debate / political discussion',
      'Municipal council / public meeting',
    ],
  },
  {
    // Corporate Events and Classroom in one kit: a keynote, a webinar and a lecture run on the
    // same furniture - an agenda, a speaker strap, a session title, a Q&A - and the classroom's
    // quiz and answer boards stay in the library for a training session that tests its room.
    id: 'corporate',
    name: 'Corporate Event',
    description: 'Agendas, speaker straps, session titles and Q&A for keynotes, webinars and lectures.',
    family: 'minimal',
    // Clean minimal in a green accent, apart from the newsroom's Ivory and the election's red.
    // Not a light-paper palette: most minimal cards set their type straight over the picture,
    // and dark ink there disappears (measured on the kit's own hub).
    paletteId: 'mint',
    starter: [
      'agenda', 'title-card', 'lower-third', 'topic-card', 'key-facts', 'now-next',
      'countdown', 'event-bug', 'qa-card', 'sign-off',
    ],
    types: [
      'agenda', 'lower-third', 'countdown', 'title-card', 'topic-card', 'poll', 'holding-screen',
      'now-next', 'process-steps', 'recap-card', 'key-facts',
      // A conference stream identifies the event and its sponsors more than anything else.
      'event-bug', 'sponsor-strip', 'logo-bug',
      // Webinar and conference Q&A: the moderator's queue and the answered card.
      'question-queue', 'qa-card', 'viewer-question', 'live-poll',
      'qr-card',
      // The classroom half: the quiz board and its two- and three-answer siblings, the ruling
      // on an answer, and the score table.
      'quiz-board', 'answer-board-2', 'answer-board-3', 'verdict-card', 'scoreboard', 'standings',
      'sign-off',
    ],
    extras: [
      // The speaker credits a conference actually runs on: post-nominals as their own field,
      // the institution's mark on the card, the session strap that leads with the talk, and
      // the expert's field for medical and legal.
      'ls17', 'ls18', 'ls19', 'ls24',
      // The screen-share surround with a presenter inset - where a webinar spends its runtime.
      'fr04',
      // The two notices a webinar runs more than any graphic it was planned with, and the
      // small print the medical and legal formats are obliged to carry.
      'al07', 'al08', 'pi04', 'pi06',
      'ss13', 'cr05', 'cr07', 'cr09',
      // The awards or name roll a school stream ends on, and the graduate card.
      'cr01', 'card58',
    ],
    formats: [
      'Webinar / expert presentation',
      'Conference / seminar stream',
      'Corporate town hall / internal broadcast',
      'Product launch / keynote',
      'Virtual event / metaverse event',
      'Medical / health livestream',
      'Legal / public information livestream',
      'Behind-the-scenes production stream',
      'Academic conference livestream',
      'Hybrid workshop / training session',
      'Education / lecture livestream',
    ],
  },
  {
    // Creator, Shopping and Wellness in one kit. All three are one person on camera running
    // their own stream; what differs is which cards they reach for, so the commerce cards and
    // the calm holds are in the library rather than in kits of their own.
    id: 'creator',
    name: 'Creator Stream',
    description: 'Starting-soon, straps, alerts, chat and polls - the streamer kit, shop cards included.',
    family: 'noacg',
    paletteId: 'noacg',
    starter: [
      'holding-screen', 'lower-third', 'topic-card', 'process-steps', 'social-bug',
      'event-notification', 'chat-highlight', 'live-poll', 'countdown', 'sign-off',
    ],
    types: [
      'holding-screen', 'lower-third', 'topic-card', 'social-bug', 'sponsor-bug', 'countdown', 'poll',
      'now-next', 'process-steps', 'title-card', 'key-facts', 'ticker',
      // A creator's own identity: the channel ident, a live/standby mark for stream breaks,
      // and the logo-only bug for the hours where nothing else should be on screen.
      'station-bug', 'live-bug', 'logo-bug',
      // A stream's audience IS the show: the chat strap, the live vote and the question card.
      'chat-highlight', 'live-poll', 'viewer-question',
      // The follower / member / donation / gift / raid alert, with its own template-owned queue.
      'event-notification',
      'goal-meter', 'milestone-track', 'call-to-action',
      // The live-commerce set: product, offer and listing cards, the scan-to-buy card, and
      // the partner strip and rotation a long selling block cycles through.
      'product-card', 'offer-card', 'listing-card', 'qr-card', 'sponsor-strip', 'sponsor-rotator',
      'sign-off',
    ],
    extras: [
      // The webcam surround, in the house look this kit is built in.
      'fr01',
      // A co-stream names two people in the house look, the handle row is the graphic a
      // creator ends on, and the identity card carries the sub/donation goal.
      'ls03', 'ls31', 'ls32',
      // A solo operator's two failure graphics: the fault that needs a reassurance line, and
      // the standby card that says when they are back.
      'al07', 'al10',
      'ss06', 'ss08', 'ss09', 'ss12', 'cr12',
      // The small print a selling or fitness stream is obliged to carry: the disclaimer strip
      // and the health advisory whose helpline sits in its own band.
      'pi04', 'pi06', 'card52',
    ],
    formats: [
      'Gaming livestream',
      'Just Chatting / personality stream',
      'Travel / IRL stream',
      'Watch party / reaction stream',
      'Tech support / coding livestream',
      'Art / design livestream',
      'Craft / maker livestream',
      'Tabletop RPG / board game stream',
      'Reality-style livestream / house stream',
      'Charity telethon / fundraising stream',
      'Live commerce / shopping stream',
      'Cooking show / food livestream',
      'Auction livestream',
      'Real estate / property livestream',
      'Beauty / makeup livestream',
      'Fitness / workout class',
      'Meditation / ambient livestream',
      'Animal cam / nature cam',
    ],
  },
  {
    id: 'stage',
    name: 'Stage & Awards',
    description: 'Artist straps, setlists, intermissions, nominees and the winner - concerts and galas.',
    family: 'glass',
    // Glass in violet, so it never reads as the Talk Show's Frost studio.
    paletteId: 'orchid',
    starter: [
      'nominee-reveal', 'title-card', 'lower-third', 'holding-screen', 'countdown', 'now-next',
      'statement-card', 'award-reveal', 'event-bug', 'sign-off',
    ],
    types: [
      'title-card', 'lower-third', 'holding-screen', 'countdown', 'social-bug', 'agenda', 'ticker',
      'now-next', 'statement-card', 'notice-card',
      // A gala runs on two marks: which award is being given, and which festival or stage
      // this is.
      'award-bug', 'event-bug',
      'nominee-reveal', 'award-reveal',
      'sign-off',
    ],
    extras: [
      // The billing straps, the right way round: artist-led for a performance, track-led for a
      // set, the numbered item for a recital programme, and the guest-over-host pair a red
      // carpet interviews arrivals with.
      'ls04', 'ls25', 'ls26', 'ls27',
      // A delayed set is not an intermission: the standby card admits an unplanned break.
      'al10',
      'cr02', 'cr09', 'cr12', 'ss07', 'ss11', 'card56',
    ],
    formats: [
      'Music performance / concert livestream',
      'Award show / gala',
      'Theatre / live performance stream',
      'DJ set / club stream',
      'Red carpet / premiere stream',
      'Fashion show livestream',
    ],
  },
  {
    id: 'ceremony',
    name: 'Worship & Ceremony',
    description: 'Service titles, readings, the order of service and a quiet countdown.',
    family: 'glass',
    // Soft glass in a calm green: the quietest register in the gallery, for services, weddings
    // and memorials. Not a light-paper palette - a statement card has no panel of its own, and
    // dark ink over the picture would disappear.
    paletteId: 'mint',
    starter: [
      'statement-card', 'title-card', 'lower-third', 'topic-card', 'agenda', 'countdown',
      'holding-screen', 'logo-bug', 'sign-off',
    ],
    types: [
      'title-card', 'lower-third', 'topic-card', 'holding-screen', 'countdown', 'agenda',
      'statement-card',
      // The congregation's or family's own mark, and the ident for the service, ceremony or
      // memorial being streamed - both quiet enough to leave up for an hour.
      'logo-bug', 'event-bug',
      // The request card and the question card - a service reads both from the congregation.
      'community-request', 'viewer-question', 'question-queue',
      'sign-off',
    ],
    extras: [
      // The three worship straps: a sermon credit that fades rather than snaps, a reading where
      // the reference outranks the reader, and the ceremony strap that names the part of the
      // programme being delivered.
      'ls14', 'ls15', 'ls16',
      // The side-by-side two-language panel, for a congregation that worships in two.
      'pi07',
      'cr01', 'cr05', 'cr11', 'ss07', 'ss10', 'card50', 'card51', 'card54', 'card55', 'card57',
    ],
    formats: [
      'Religious service / church livestream',
      'Graduation / ceremony stream',
      'Wedding / private event livestream',
      'Funeral / memorial livestream',
    ],
  },
  // THE THREE QUIZ KITS - the game-show families (sticker, showtime, arcade - model/fonts.ts).
  // Each is a whole two-player game show in one look: the opener, the host and contestant strap,
  // the quiz board whose answer count is a field, the running score, an answer clock, a
  // how-to-play card, the show mark and the closing card. The eight types ship designs only in
  // these three families, and they were drawn as sets, so each look is its own kit.
  //
  // None declares a paletteId: each design's own default already IS its family's palette.
  {
    id: 'sticker-quiz',
    name: 'Sticker Quiz',
    description: 'A bright, hand-cut game show: quiz board, running score, answer clock and straps.',
    family: 'sticker',
    starter: [...QUIZ_SHOW_TYPES],
    types: [...QUIZ_SHOW_TYPES],
    formats: ['Quiz / game show livestream'],
  },
  {
    id: 'showtime-quiz',
    name: 'Showtime Quiz',
    description: 'A marquee-lit Saturday-night game show: quiz board, score, clock and straps.',
    family: 'showtime',
    starter: [...QUIZ_SHOW_TYPES],
    types: [...QUIZ_SHOW_TYPES],
    formats: [],
  },
  {
    id: 'arcade-quiz',
    name: 'Arcade Quiz',
    description: 'A neon cabinet game show: quiz board, score, clock and straps.',
    family: 'arcade',
    starter: [...QUIZ_SHOW_TYPES],
    types: [...QUIZ_SHOW_TYPES],
    formats: [],
  },
];

export function packById(id: string): TemplatePack | undefined {
  return PACKS.find((p) => p.id === id);
}

/** One resolved cell of a pack: the design that ships for (type, family). */
export interface PackCell {
  typeId: string;
  designId: string;
}

/**
 * Resolve a kit's types against the live registry in its own family. Throws on an unknown
 * type or an unfilled cell - a kit pointing at a design that does not exist is a config error,
 * and config errors fail loudly (the same doctrine as attachMachine).
 */
export function resolvePack(pack: Pick<TemplatePack, 'id' | 'family' | 'types'>): PackCell[] {
  return pack.types.map((typeId) => {
    const type = typeById(typeId);
    if (!type) throw new Error(`Pack "${pack.id}": unknown graphic type "${typeId}".`);
    const design = type.designs.find((d) => d.styleTag === pack.family);
    if (!design) {
      throw new Error(`Pack "${pack.id}": type "${typeId}" has no ${pack.family} design - the matrix cell is empty.`);
    }
    return { typeId, designId: design.id };
  });
}

/**
 * THE CORE SIX - what every kit's STARTER owes a show, whatever its genre (docs/PACK_TAXONOMY.md).
 *
 * A kit does not need every category in the catalog; the set a user gets by default needs to be
 * complete enough to RUN one. Measured 2026-08-08 (docs/KIT_MATRIX_GAPS.md), nine kits were not:
 * the discipline packs were pure match furniture with no opener, nothing that puts a sentence on
 * screen and no way to end.
 *
 * Each role lists the TYPES that satisfy it. An `extras` entry does NOT count, deliberately: a
 * type resolves in the kit's family, while an extra is a fixed variant id carrying its own look.
 */
const CORE_SIX: Record<string, readonly string[]> = {
  'lower third': ['lower-third'],
  'opener or topic card': ['title-card', 'topic-card'],
  'info or bullet card': [
    'key-facts', 'headline-card', 'recap-card', 'process-steps', 'statement-card',
    'notice-card', 'public-notice',
  ],
  'ticker or bug': [
    'ticker', 'sponsor-bug', 'station-bug', 'live-bug', 'logo-bug', 'event-bug', 'social-bug',
    'award-bug', 'status-chip', 'sponsor-strip', 'sponsor-rotator',
  ],
  'countdown or holding card': ['countdown', 'holding-screen'],
  'closing card': ['sign-off'],
};

/** A starter is "about ten": enough to run a show, few enough to read at a glance. */
export const STARTER_MIN = 6;
export const STARTER_MAX = 12;

/**
 * Every problem with the kit config, as strings (empty = valid). `variantStyleTags` maps the
 * merged catalog's ids to their style family, passed in by the caller (the factory) so this
 * module never has to import the catalog it is a view over.
 */
export function validatePacks(variantStyleTags?: ReadonlyMap<string, StyleTag>): string[] {
  const problems: string[] = [];
  const typeIds = new Set(TYPES.map((t) => t.id));

  const seenPackIds = new Set<string>();
  const formatOwner = new Map<string, string>();
  for (const pack of PACKS) {
    if (seenPackIds.has(pack.id)) problems.push(`duplicate pack id "${pack.id}"`);
    seenPackIds.add(pack.id);

    // The library's types, each resolving in THE kit's family.
    const resolved = new Map<string, string>();
    for (const typeId of pack.types) {
      if (!typeIds.has(typeId)) {
        problems.push(`pack "${pack.id}" references unknown type "${typeId}"`);
        continue;
      }
      const design = typeById(typeId)?.designs.find((d) => d.styleTag === pack.family);
      if (!design) problems.push(`pack "${pack.id}": type "${typeId}" has no ${pack.family} design`);
      else resolved.set(typeId, design.id);
    }
    if (new Set(pack.types).size !== pack.types.length) problems.push(`pack "${pack.id}" lists a type twice`);

    // The library's extras: in the catalog, never twice, and never a design a type already
    // resolves to (the production pool is name-keyed, so the duplicate would silently merge).
    const extras = pack.extras ?? [];
    if (new Set(extras).size !== extras.length) problems.push(`pack "${pack.id}" lists an extra twice`);
    const typeDesigns = new Set(resolved.values());
    for (const extra of extras) {
      if (variantStyleTags && !variantStyleTags.has(extra)) {
        problems.push(`pack "${pack.id}" extra "${extra}" is not in the catalog`);
      }
      if (typeDesigns.has(extra)) {
        problems.push(`pack "${pack.id}" extra "${extra}" is already the design one of its types resolves to`);
      }
    }

    // The starter: about ten, all from the library, all in the kit's own Style.
    const library = new Set([...pack.types, ...extras.map((id) => `extra:${id}`)]);
    if (pack.starter.length < STARTER_MIN || pack.starter.length > STARTER_MAX) {
      problems.push(
        `pack "${pack.id}" starts with ${pack.starter.length} graphics - a starter is ` +
          `${STARTER_MIN} to ${STARTER_MAX}`,
      );
    }
    if (new Set(pack.starter).size !== pack.starter.length) problems.push(`pack "${pack.id}" starter lists a graphic twice`);
    for (const key of pack.starter) {
      if (!library.has(key)) {
        problems.push(`pack "${pack.id}" starter "${key}" is not in its library (types or extra:<id>)`);
        continue;
      }
      if (key.startsWith('extra:') && variantStyleTags) {
        const tag = variantStyleTags.get(key.slice('extra:'.length));
        if (tag && tag !== pack.family) {
          problems.push(`pack "${pack.id}" starter "${key}" is ${tag}, not the kit's ${pack.family} Style`);
        }
      }
    }

    for (const [role, satisfiedBy] of Object.entries(CORE_SIX)) {
      if (!satisfiedBy.some((typeId) => pack.starter.includes(typeId))) {
        problems.push(
          `pack "${pack.id}" starter has no ${role} - the core six is what makes the default ` +
            `set able to run a show (one of: ${satisfiedBy.join(', ')})`,
        );
      }
    }

    for (const format of pack.formats) {
      const owner = formatOwner.get(format);
      if (owner) problems.push(`format "${format}" is mapped by both "${owner}" and "${pack.id}"`);
      formatOwner.set(format, pack.id);
    }
  }

  if (formatOwner.size !== REFERENCE_FORMAT_COUNT) {
    problems.push(`the packs map ${formatOwner.size} formats; the reference sheet has ${REFERENCE_FORMAT_COUNT}`);
  }
  return problems;
}
