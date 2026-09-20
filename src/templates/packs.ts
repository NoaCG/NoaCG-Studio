// TEMPLATE PACKS — the taxonomy axis of the types × themes catalog (docs/PACK_TAXONOMY.md).
//
// A pack is a CURATED SUBSET of graphic types in a fitting style family: the answer to "I run
// a church stream / an esports night / an election program — which graphics do I need?". The
// 60 reference formats in live_format_graphics_needs.xlsx each map to exactly one pack, and
// that mapping IS the taxonomy document's machine-readable half.
//
// A pack is PURE CONFIG, and that is the point (Phase 3's "catalog growth is a config change"):
// across the PRODUCTION families every (type, family) cell already has a shipped, gate-checked
// design, so declaring a pack requires no new template work — `resolvePack` just looks the
// cells up in the live registry. A NEW pack is one entry in this array. A new THEME is
// deliberately NOT config: it needs twelve designs and a FAMILY_TOKENS row before a pack could
// point at it, and `validatePacks` would say so.
//
// **"The matrix is full" is true of FOUR families, not six** — and as of 2026-08-08 those four
// are genuinely full: every registered type ships a noacg, minimal, sport and glass design, so
// every pack below resolves in all four looks. Before that day, seventeen of twenty-one did
// (docs/KIT_MATRIX_GAPS.md measured it; ten designs closed the gap).
//
// Editorial and cinematic cover 6 and 5 types. They are real STYLE families — their own designs,
// FAMILY_TOKENS row and Browse chip — but they are BROWSE families, not KIT families: almost no
// graphic TYPE ships a design in them, so no pack resolves into either. That is a deliberate
// state, not debt: filling them means ~118 new designs each, and a kit is not the only thing a
// style family is for. Anything resolving a pack must therefore MEASURE which families work
// (`familiesFor` in wizard/steps/KitPicker.tsx) rather than assume all six do.
//
// `scripts/factory.mjs` validates all of this on every run: every type id resolves, every
// extra exists in the catalog, and the 60 formats are covered exactly once. Editing this file
// cannot silently break the taxonomy.
//
// One limit worth knowing: the cell check (`validatePacks`) only tests each pack's OWN
// declared `family`. It says nothing about the other five, which is why the gate stayed green
// the whole time the header above claimed six families' worth of cells were filled. The
// factory's own probe has always counted "12 types x 4 families" — the two disagreed, and the
// header was the wrong one.

import type { StyleTag } from '../model/fonts';
import { typeById, TYPES } from './types/registry';

export interface TemplatePack {
  id: string;
  name: string;
  /** Who this pack is for, in the wizard's voice. */
  description: string;
  /** The DEFAULT look, and a taste pick rather than a constraint: a pack re-resolves into any
   *  family whose cells its types fill. That is MOST of the production families for most packs,
   *  but never all six and not the same set for every pack — Match Day and Esports resolve in
   *  two, editorial and cinematic in none (see the header). Ask `resolvePack`, don't assume. */
  family: StyleTag;
  /**
   * The ONE palette every kit graphic is CREATED with (docs/GOALS_ARCHIVE.md "Student release" step
   * 7) — the unified look a coherent show demands. A style family is not one palette (the
   * measured fact: newsroom's own defaults mixed signal, ivory, frost and noacg), so a pack
   * that claims production-readiness names its palette and the kit create imposes it on
   * every graphic. Absent = each design keeps its own default — the pre-step-7 behavior the
   * uncurated packs (and their pinned specs, e.g. esports' Volt) still rely on.
   */
  paletteId?: string;
  /** GraphicType ids, in curated order (the order a rundown would reach for them). */
  types: string[];
  /** Catalog variants OUTSIDE the type registry that belong in the kit (end credits, the
   *  versus card). Validated against the live catalog by the factory. */
  extras?: string[];
  /**
   * The reference formats this pack serves — VERBATIM row values from
   * live_format_graphics_needs.xlsx. Every format appears in exactly one pack.
   *
   * A DISCIPLINE pack (the sports packs below) declares an EMPTY list on purpose. The
   * reference sheet counts formats, and it has one row for "Sports broadcast / match coverage"
   * and one for "Local sports / amateur sports" — both already owned by Match Day. A football
   * kit and a tennis kit are not new formats; they are the same format cut for a sport whose
   * clock counts the other way and whose score is kept in sets. Claiming a format twice would
   * be a taxonomy error (`validatePacks` catches it), and inventing rows the sheet does not
   * have would make the count meaningless.
   */
  formats: string[];
}

/** The Excel's row count. The factory asserts the packs below cover exactly this many
 *  formats with no duplicates, so a taxonomy edit cannot quietly drop or double-map one. */
export const REFERENCE_FORMAT_COUNT = 60;

export const PACKS: TemplatePack[] = [
  {
    id: 'match-day',
    name: 'Match Day',
    description: 'Scorebug, clock, line-up, standings and the full-time card — the live sports kit.',
    family: 'sport',
    types: [
      // The sports pack's five types (docs/SPORTS_PACK.md), then the older generic scoreboard.
      'scorebug', 'match-board', 'match-status', 'match-event', 'fixtures',
      'scoreboard', 'countdown', 'lower-third', 'ticker', 'sponsor-bug', 'title-card', 'holding-screen',
      'now-next', 'notice-card',
      // The identity marks a match feed leaves up: the fixture ident, the live/replay status,
      // the sponsor bar, and the venue chip for pitchside cameras.
      'event-bug', 'live-bug', 'sponsor-strip', 'status-chip',
      // The competition pack's sports half (docs/COMPETITION_PACK.md).
      'roster', 'standings', 'winner-card',
      'sign-off',
    ],
    extras: [
      // The specialist straps a match feed is drawn for: the commentary pair as a block and
      // as a rail, and the three ways coverage names a player — by squad number, by the
      // stat line that justifies the cutaway, and by the club whose badge leads the card.
      'ls06', 'ls07', 'ls08', 'ls09', 'ls10',
      // The other scores crawling under this one, and the card a rain delay or a
      // postponement goes to — which an intermission screen is not: it says WHEN.
      'tk13', 'al10',
      'vs01', 'cr03', 'ss11', 'cr12',
    ],
    formats: ['Sports broadcast / match coverage', 'Local sports / amateur sports'],
  },
  // ── The DISCIPLINE packs (docs/SPORTS_PACK.md) ──
  // Each is the same eight sports types cut for one sport's habits — which clock direction the
  // scorebug wants, whether the score is kept in periods or sets, whether a lineup is a squad
  // or a start list — plus the supporting graphics that sport actually uses. They claim no
  // reference formats: see `TemplatePack.formats`.
  //
  // They are refinements of Match Day, and being cut that way is what left them unable to run a
  // show on their own: measured 2026-08-08 (docs/KIT_MATRIX_GAPS.md), all nine were pure match
  // furniture — no opener, nothing that puts a sentence on screen. Every kit ships the CORE SIX
  // regardless of genre (a lower third, an opener, an info card, a ticker or bug, a countdown or
  // hold, a closing card), so `title-card` and `key-facts` are in all nine below. Both resolve in
  // all four production families, so this costs no template work and narrows no pack's looks.
  {
    id: 'football',
    name: 'Football',
    description: 'Count-up clock, subs and cards, the league table and the weekend results.',
    family: 'sport',
    types: [
      'scorebug', 'match-event', 'match-status',
      'fixtures', 'match-board',
      'lower-third', 'sponsor-bug', 'countdown', 'holding-screen',
      'title-card', 'key-facts',
      'sign-off',
    ],
    extras: ['vs01'],
    formats: [],
  },
  {
    id: 'ice-hockey',
    name: 'Ice Hockey',
    description: 'Period clock counting down, penalties, the period breakdown and the standings.',
    family: 'sport',
    types: [
      'scorebug', 'match-board', 'match-event', 'match-status',
      'fixtures',
      'lower-third', 'sponsor-bug', 'holding-screen',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'basketball',
    name: 'Basketball',
    description: 'Quarter clock, the quarter-by-quarter board, team stats and the conference table.',
    family: 'sport',
    types: [
      'scorebug', 'match-board',
      'match-status', 'match-event', 'fixtures',
      'lower-third', 'sponsor-bug', 'countdown',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'handball',
    name: 'Handball',
    description: 'Half clock, two-minute suspensions, the squad list and the group table.',
    family: 'glass',
    types: [
      'scorebug', 'match-event', 'match-board', 'match-status',
      'fixtures',
      'lower-third', 'sponsor-bug', 'holding-screen',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'racket-sports',
    name: 'Racket Sports',
    description: 'Set-by-set scoring, the head-to-head, the draw and the order of play.',
    family: 'glass',
    types: [
      'match-board', 'scorebug', 'match-status',
      'fixtures',
      'lower-third', 'sponsor-bug', 'agenda',
      // A rain break and a suspended session are this pack's normal state, so the hold and the
      // countdown to resumption are core here rather than optional.
      'title-card', 'key-facts', 'countdown', 'holding-screen',
      'sign-off',
    ],
    extras: ['vs02'],
    formats: [],
  },
  {
    id: 'motorsport',
    name: 'Motorsport',
    description: 'The live timing tower, the championship standings, session results and a countdown.',
    family: 'sport',
    types: [
      // The tower leads: it is the graphic a session is actually covered with, and until it
      // existed this pack was standing in for it with a fixtures board.
      'timing-tower',
      'fixtures', 'match-status',
      'countdown', 'scorebug',
      'lower-third', 'sponsor-bug', 'ticker', 'holding-screen',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'athletics',
    name: 'Athletics',
    description: 'Start lists, live splits, heat results, the medal table and a field-event countdown.',
    family: 'glass',
    types: [
      // A heat in progress is a timing tower with the times measured at a split.
      'timing-tower',
      'fixtures', 'match-status',
      'countdown', 'scorebug',
      'lower-third', 'agenda', 'sponsor-bug',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'combat-sports',
    name: 'Combat Sports',
    description: 'Round clock, the fight card, the tale of the tape and the decision.',
    family: 'glass',
    types: [
      'match-status', 'scorebug', 'match-event',
      'fixtures', 'countdown',
      'lower-third', 'sponsor-bug', 'holding-screen',
      'title-card', 'key-facts',
      'sign-off',
    ],
    extras: ['vs02'],
    formats: [],
  },
  {
    id: 'club-sports',
    name: 'Club & School Sports',
    description: 'The amateur kit: full club names, no crests needed, and nothing that costs bitrate.',
    family: 'minimal',
    types: [
      'scorebug', 'match-status', 'match-board',
      'fixtures', 'match-event',
      'lower-third', 'holding-screen', 'countdown', 'sponsor-bug',
      'title-card', 'key-facts',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'esports',
    name: 'Esports',
    description: 'A complete Volt tournament package: pre-show, desk, match, replay, results and sponsors.',
    family: 'sport',
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
      // Pre-match drafting needs the new operator-driven veto board as well as the live map
      // ladder. The three straps identify players, the commentary pair and the analysis desk.
      'mr04', 'ls11', 'ls06', 'ls13',
      // The two-caster split, in this kit's own Volt look (an extra never follows the family
      // the kit is built in, so it is only ever offered where it already matches).
      'fr03',
      // Tournament-wide score and sponsor rails remain readable while play stays visible.
      'tk13', 'cr12',
    ],
    formats: ['Esports tournament'],
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'Starting-soon, straps, topic cards and handles — the streamer starter kit.',
    family: 'noacg',
    types: [
      'holding-screen', 'lower-third', 'topic-card', 'social-bug', 'sponsor-bug', 'countdown', 'poll',
      'now-next', 'process-steps',
      // A creator's own identity: the channel ident, a live/standby mark for stream breaks,
      // and the logo-only bug for the hours where nothing else should be on screen.
      'station-bug', 'live-bug', 'logo-bug',
      // A stream's audience IS the show: the chat strap and the live vote are as core here
      // as the strap is, and the question card is what a Just Chatting segment runs on.
      'chat-highlight', 'live-poll', 'viewer-question',
      // The follower / member / donation / gift / raid alert. Its own template-owned queue is
      // what makes a burst of events survive, so a creator kit without it is a kit that drops
      // the graphic the stream is most often asked for.
      'event-notification',
      'sign-off',
      'goal-meter', 'milestone-track', 'call-to-action',
    ],
    extras: [
      // The webcam surround, in the house look this kit is built in. A frame cannot be a graphic
      // TYPE (its field count follows its camera count - docs/GRAPHIC_TYPES.md), so it can only
      // reach a kit as an extra, and an extra carries its OWN look - hence in-family only.
      'fr01',
      // A co-stream names two people in the house look, the handle row is the graphic a
      // creator ends on, and the identity card carries the sub/donation goal a subathon or
      // a telethon exists for.
      'ls03', 'ls31', 'ls32',
      // A solo operator's two failure graphics: the fault that needs a reassurance line, and
      // the standby card that says when they are back.
      'al07', 'al10',
      'ss06', 'ss08', 'ss09', 'ss12',
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
    ],
  },
  {
    id: 'newsroom',
    name: 'Newsroom',
    description: 'Anchor straps, the wire ticker, headline and topic cards for news programs.',
    family: 'minimal',
    // The unified desk look (step 7): every kit graphic is created in Ivory, so the strap,
    // the crawls and the cards read as ONE broadcast rather than four palettes.
    paletteId: 'ivory',
    types: [
      'lower-third', 'ticker', 'topic-card', 'title-card', 'agenda', 'sponsor-bug',
      'headline-card', 'key-facts', 'notice-card',
      // The newsroom's own furniture: the channel ident that never leaves, the live/replay
      // status a news desk is obliged to be honest about, and the location chip for reporters.
      'station-bug', 'live-bug', 'status-chip',
      // The public-service pair (docs/PUBLIC_SERVICE_PACK.md). This is the desk that runs
      // them: the severity ladder is what an emergency broadcast IS, and the two-language
      // notice retires the "multilingual cards are fields" stand-in the mapping recorded.
      'alert-level', 'public-notice',
      // The hold a news desk actually runs on - a bulletin waiting to start, a feed that has
      // dropped. It was covered by the `ss08` extra alone, which happens to be minimal and so
      // happens to match this kit's look; the type follows whatever look the kit is built in.
      'holding-screen',
      'sign-off',
    ],
    extras: [
      // The news desk's specialist straps, ALL in-family since step 7 (the measured audit
      // found ls24 glass, ls29 noacg, ls30 glass riding a minimal kit): the remote two-box
      // interview, the kicker that marks comment as comment, the LIVE flag as its own
      // element, the debate podium for election nights, and the press-conference lectern.
      'ls01', 'ls23', 'ls28', 'ls21', 'ls17',
      // The crawls, one per job the `ticker` type's own design does not do: caps framing the
      // travel, a strip along the TOP while the lower third is busy, market deltas, the
      // opaque notice crawl, the breaking dot, a bilingual split — and the index strip +
      // status rotator standing in for the off-family split deck and world clock. (NOT
      // tk10: the ticker TYPE already resolves to Wire Rotator in this family, and the
      // name-keyed pool would silently merge the duplicate.)
      'tk11', 'tk12', 'tk14', 'tk15', 'tk16', 'tk17', 'tk04', 'tk18',
      // The breaking banner (its kicker is a field, not a state), the numbered emergency
      // instructions, and the source label a press conference is obliged to carry.
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
    ],
  },
  {
    id: 'election',
    name: 'Election',
    description: 'Result bars, candidate straps and the count ticker for civic broadcasts.',
    family: 'minimal',
    types: [
      'poll', 'lower-third', 'ticker', 'title-card', 'agenda', 'countdown',
      'headline-card', 'key-facts',
      // Results night runs from many places at once: a location chip per feed, and a status
      // mark that says plainly whether a shot is live or a replay.
      'status-chip', 'live-bug',
      // The live vote carries the count as it comes in and calls a leader; the static poll
      // board above it is the finished result.
      'live-poll',
      // A civic broadcast is frequently obliged to carry its notices in two languages, and
      // the rotator is the honest way to do that in one strip's worth of screen.
      'public-notice',
      'sign-off',
    ],
    extras: [
      // Civic coverage reads the party colour first: the result bar, the symmetric podium
      // strap a debate places twice, and the everyday affiliation strap. The analysis
      // kicker rides along because results night runs on interpretation.
      'ls20', 'ls21', 'ls22', 'ls23',
      // The council's own paperwork put on screen: the notice crawl, the public and
      // municipal notices (reference and deadline in their own chip), and the two-language
      // panel a bilingual jurisdiction runs everything through.
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
    id: 'talk-show',
    name: 'Talk Show',
    description: 'Guest straps, topic and question cards, polls — panels, podcasts and Q&As.',
    family: 'glass',
    // The unified studio look (step 7): everything in Frost, so the straps, cards and
    // audience surfaces read as one show rather than frost/orchid/noacg/ivory at once.
    paletteId: 'frost',
    types: [
      'lower-third', 'topic-card', 'poll', 'agenda', 'social-bug', 'sponsor-bug', 'countdown',
      'key-facts', 'recap-card',
      // A show ident for the corner, and a sponsor rotation for the partners a podcast or
      // panel show reads out between segments.
      'station-bug', 'sponsor-rotator',
      // The whole audience-interaction set: a live Q&A is this pack's own format.
      'viewer-question', 'qa-card', 'chat-highlight', 'question-queue', 'live-poll',
      'sign-off',
    ],
    extras: [
      // The panel's own straps, ALL in-family since step 7 (the measured audit found ls05
      // and ss06 noacg and card52 ivory riding a glass kit): the two-card remote interview,
      // the guest-over-host pair, the specialist's subject tag, and the now-playing strap a
      // radio-with-video show needs (the topic card had been standing in for it).
      'ls02', 'ls04', 'ls24', 'ls25',
      // The two-up interview surround, in this kit's own Frost look.
      'fr02',
      // The coming-up card replaces the off-family Studio Pair (ls04 already carries that
      // job), the glass Reading Card replaces the ivory Quotation, and Intermission
      // replaces the noacg Short Break beside the kept Back Shortly.
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
    id: 'corporate',
    name: 'Corporate Events',
    description: 'Agendas, speaker straps, session titles and polls for webinars and keynotes.',
    family: 'minimal',
    types: [
      'agenda', 'lower-third', 'countdown', 'title-card', 'topic-card', 'poll', 'holding-screen',
      'now-next', 'process-steps', 'recap-card', 'key-facts',
      // A conference stream identifies the event and its sponsors more than anything else:
      // the session ident in the corner, and the partner strip along the bottom.
      'event-bug', 'sponsor-strip',
      // Webinar and conference Q&A: the moderator's queue and the answered card.
      'question-queue', 'qa-card', 'viewer-question', 'live-poll',
      'sign-off',
      'qr-card',
    ],
    extras: [
      // The speaker credits a conference actually runs on: post-nominals as their own
      // field, the institution's mark on the card, the session strap that leads with the
      // talk for people joining mid-track, and the expert's field for medical and legal.
      'ls17', 'ls18', 'ls19', 'ls24',
      // The screen-share surround with a presenter inset - the layout a webinar spends most of
      // its runtime in, in this kit's own Clean look.
      'fr04',
      // The two notices a webinar runs more than any graphic it was planned with, and the
      // small print the medical and legal formats are obliged to carry: the disclaimer at
      // the floor, and the health advisory with its helpline in a band of its own.
      'al07', 'al08', 'pi04', 'pi06',
      'ss13', 'cr05', 'cr07', 'cr09',
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
    ],
  },
  {
    id: 'classroom',
    name: 'Classroom',
    description: 'Quiz board, verdicts, timers, lesson cards and a score table for teaching streams.',
    family: 'noacg',
    types: [
      'quiz-board', 'countdown', 'lower-third', 'topic-card', 'agenda', 'scoreboard',
      'process-steps', 'key-facts', 'recap-card',
      // A school or university stream keeps its institution's mark up, and nothing else.
      'logo-bug',
      // A ruling on an answer is the quiz board's other half (docs/COMPETITION_PACK.md).
      'verdict-card', 'standings',
      // Two- and three-answer boards for true/false and three-way rounds, plus the class vote.
      'answer-board-2', 'answer-board-3', 'live-poll', 'viewer-question',
      'sign-off',
    ],
    extras: [
      // The lecturer's credit, and the school or department mark a student production is
      // usually required to carry.
      'ls17', 'ls18',
      // cr01 replaced the retired cr10 (2026-08-28): the awards/name roll a school stream
      // ends on is the classic roll with Emphasis on the name's half of the line.
      'cr01', 'card58', 'ss13',
    ],
    formats: [
      'Education / lecture livestream',
      'Student production / school TV',
      'Quiz / game show livestream',
    ],
  },
  // THE QUIZ SHOW KIT, and the first kit in the three GAME-SHOW families (sticker, showtime,
  // arcade - model/fonts.ts). It is a whole two-player game show in one look: the opener, the
  // host and contestant strap, the quiz board whose answer count is a field, the running score,
  // an answer clock, a how-to-play card, the show mark and the closing card.
  //
  // It resolves in exactly those three looks and no others, because `quiz-show` and `duel-score`
  // ship designs only there - which is the point: the looks were drawn as a set, and the picker
  // measures what resolves rather than assuming (KitPicker `familiesFor`).
  //
  // It declares NO paletteId on purpose. A pack palette is imposed on every graphic the kit
  // creates, and this kit re-resolves into three families whose palettes share nothing: Tangerine
  // on the marquee would be cream text on a cream panel. Each design's own default already IS
  // its family's palette, so the kit arrives in one look without one.
  //
  // And it claims no format: the sheet's "Quiz / game show livestream" row is Classroom's, and a
  // format belongs to exactly one pack (see `TemplatePack.formats`).
  {
    id: 'quiz-show',
    name: 'Quiz Show',
    description: 'A two-player game show in one look: opener, quiz board, running score, answer clock, rules card, straps and the closing card.',
    family: 'sticker',
    types: [
      'title-card', 'lower-third',
      'quiz-show', 'duel-score', 'countdown',
      'key-facts', 'logo-bug',
      'sign-off',
    ],
    formats: [],
  },
  {
    id: 'church',
    name: 'Church & Ceremony',
    description: 'Service titles, scripture cards, program schedule and a quiet countdown.',
    family: 'minimal',
    types: [
      'title-card', 'lower-third', 'topic-card', 'holding-screen', 'countdown', 'agenda',
      'statement-card',
      // The congregation's or family's own mark, and the ident for the service, ceremony or
      // memorial being streamed — both quiet enough to leave up for an hour.
      'logo-bug', 'event-bug',
      // The request card and the question card — a service reads both from the congregation.
      'community-request', 'viewer-question', 'question-queue',
      'sign-off',
    ],
    extras: [
      // The three worship straps, and the reason this pack needed its own: a sermon credit
      // that fades rather than snaps, a reading where the reference outranks the reader,
      // and the ceremony strap that names the part of the programme being delivered.
      'ls14', 'ls15', 'ls16',
      // The side-by-side two-language panel, for a congregation that worships in two. The
      // statement card above covers the same need as a STATEMENT; this is the notice form.
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
  {
    id: 'stage',
    name: 'Stage & Music',
    description: 'Artist straps, setlist cards, intermission screens for performances and galas.',
    family: 'glass',
    types: [
      'title-card', 'lower-third', 'holding-screen', 'countdown', 'social-bug', 'agenda', 'ticker',
      'now-next', 'statement-card', 'notice-card',
      // A gala runs on two marks: which award is being given, and which festival or stage
      // this is.
      'award-bug', 'event-bug',
      'sign-off',
      'nominee-reveal', 'award-reveal',
    ],
    extras: [
      // The billing straps, and getting them the right way round is this pack's whole job:
      // artist-led for a performance, track-led for a set, the numbered item for a recital
      // programme — plus the guest-over-host pair a red carpet interviews arrivals with.
      'ls04', 'ls25', 'ls26', 'ls27',
      // A delayed set is not an intermission: an intermission screen announces a planned
      // break, the standby card admits an unplanned one and says when.
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
    id: 'shopping',
    name: 'Shopping',
    description: 'Product cards, deal timers and the offer ticker for live commerce.',
    family: 'noacg',
    types: [
      'topic-card', 'countdown', 'lower-third', 'ticker', 'title-card', 'sponsor-bug',
      'key-facts',
      // Live commerce is brand-dense: a partner strip for the show's sponsors, and a rotation
      // for the ones that cycle through a long selling block.
      'sponsor-strip', 'sponsor-rotator',
      'sign-off',
      'product-card', 'offer-card', 'listing-card', 'qr-card', 'call-to-action',
    ],
    // No specialist strap here on purpose: the pack is drawn for interview duos, athletes,
    // clergy, academics, politicians and performers, and a selling host is named by an
    // ordinary lower third. The commerce cards (card38-card49) are this pack's own graphics.
    // The disclaimer strip is the exception the public-service pack supplied: price, shipping
    // and affiliate small print is a legal obligation on a selling stream, not decoration.
    extras: ['pi04', 'ss06', 'ss12', 'cr12'],
    formats: [
      'Live commerce / shopping stream',
      'Cooking show / food livestream',
      'Auction livestream',
      'Real estate / property livestream',
      'Beauty / makeup livestream',
    ],
  },
  {
    id: 'wellness',
    name: 'Wellness',
    description: 'Interval timers, session titles and calm holding screens for movement and rest.',
    family: 'minimal',
    types: [
      'countdown', 'holding-screen', 'topic-card', 'lower-third', 'social-bug',
      'process-steps',
      // A class or an ambient stream keeps one quiet mark on screen and nothing more.
      'logo-bug',
      'sign-off',
    ],
    // Same as Shopping: an instructor is named by an ordinary strap, and forcing a
    // specialist one in would only make the kit harder to read. What this pack DID need is
    // the health pair — the "consult a professional" disclaimer a fitness class carries, and
    // the advisory whose helpline sits in its own high-contrast band, which is the one
    // graphic a meditation or mental-health stream must be able to put up without designing.
    extras: ['pi04', 'pi06', 'ss08', 'ss09', 'card52'],
    formats: [
      'Fitness / workout class',
      'Meditation / ambient livestream',
      'Animal cam / nature cam',
    ],
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
 * Resolve a pack's types against the live registry. Throws on an unknown type or an unfilled
 * cell — a pack pointing at a design that does not exist is a config error, and config errors
 * fail loudly (the same doctrine as attachMachine).
 */
export function resolvePack(pack: TemplatePack): PackCell[] {
  return pack.types.map((typeId) => {
    const type = typeById(typeId);
    if (!type) throw new Error(`Pack "${pack.id}": unknown graphic type "${typeId}".`);
    const design = type.designs.find((d) => d.styleTag === pack.family);
    if (!design) {
      throw new Error(`Pack "${pack.id}": type "${typeId}" has no ${pack.family} design — the matrix cell is empty.`);
    }
    return { typeId, designId: design.id };
  });
}

/**
 * Every problem with the pack config, as strings (empty = valid). `knownVariantIds` is the
 * merged catalog's id set, passed in by the caller (the factory) so this module never has to
 * import the catalog it is a view over.
 */
/**
 * THE CORE SIX - what every kit owes a show, whatever its genre (docs/PACK_TAXONOMY.md).
 *
 * A kit does not need every category in the catalog; it needs to be complete enough to RUN one.
 * Measured 2026-08-08 (docs/KIT_MATRIX_GAPS.md), nine kits were not: the discipline packs were
 * pure match furniture with no opener, nothing that puts a sentence on screen and no way to end,
 * because they were cut as refinements of Match Day rather than as kits in their own right.
 *
 * Each role lists the TYPES that satisfy it. An `extras` entry does NOT count, deliberately: a
 * type resolves per family and so follows the look the kit was built in, while an extra is a
 * fixed variant id carrying its own. A kit whose closing card is an off-family extra is exactly
 * the incoherence `paletteId` was introduced to fix, one layer down.
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

export function validatePacks(knownVariantIds?: string[]): string[] {
  const problems: string[] = [];
  const typeIds = new Set(TYPES.map((t) => t.id));

  const seenPackIds = new Set<string>();
  const formatOwner = new Map<string, string>();
  for (const pack of PACKS) {
    if (seenPackIds.has(pack.id)) problems.push(`duplicate pack id "${pack.id}"`);
    seenPackIds.add(pack.id);

    for (const typeId of pack.types) {
      if (!typeIds.has(typeId)) {
        problems.push(`pack "${pack.id}" references unknown type "${typeId}"`);
        continue;
      }
      const type = typeById(typeId);
      if (type && !type.designs.some((d) => d.styleTag === pack.family)) {
        problems.push(`pack "${pack.id}": type "${typeId}" has no ${pack.family} design`);
      }
    }

    if (knownVariantIds) {
      const known = new Set(knownVariantIds);
      for (const extra of pack.extras ?? []) {
        if (!known.has(extra)) problems.push(`pack "${pack.id}" extra "${extra}" is not in the catalog`);
      }
    }

    for (const [role, satisfiedBy] of Object.entries(CORE_SIX)) {
      if (!satisfiedBy.some((typeId) => pack.types.includes(typeId))) {
        problems.push(
          `pack "${pack.id}" ships no ${role} - the core six is what makes a kit able to run a ` +
            `show (one of: ${satisfiedBy.join(', ')})`,
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
