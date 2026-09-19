// The graphic-type registry (docs/GRAPHIC_TYPES.md).
//
// A type declares what a graphic IS; its designs are the looks it ships as. Registering one
// here is what puts its designs in the catalog — `catalog.ts` merges `typeVariants()` over the
// hand-written lists, replacing BY ID where a type promotes an existing variant, so a promoted
// design keeps its id everywhere it is already referenced (the AI's variant enum, saved
// preferences, the sweeps).

import type { AssemblerId, TemplateVariant } from '../../model/wizard';
import { variantsFromType, type GraphicType } from './graphicType';
import { lowerThirdType } from './lowerThird';
import { socialBugType, sponsorBugType } from './bugs';
import {
  headlineCardType,
  noticeCardType,
  nowNextType,
  processStepsType,
  statementCardType,
} from './briefings';
import { titleCardType, topicCardType } from './cards';
import { keyFactsType, recapType } from './lists';
import { listingCardType, offerCardType, productCardType, qrCardType } from './commerce';
import { callToActionType, goalMeterType, milestoneTrackType } from './goals';
import { agendaType, pollType } from './dataBoards';
import { livePollType } from './livePoll';
import {
  chatHighlightType,
  communityRequestType,
  qaCardType,
  questionQueueType,
  viewerQuestionType,
} from './audience';
import { countdownType, holdingScreenType } from './clocks';
import { speakingTimerType } from './speakingTimer';
import { esportsScoreType, mapRoundType } from './esports';
import { headToHeadType, matchupType, playerCardType } from './matchups';
import { bracketType, rosterType, standingsType, timingTowerType } from './competitionBoards';
import { awardRevealType, nomineeRevealType, verdictCardType, winnerCardType } from './reveals';
import { quizBoardType } from './quizBoard';
import { quizShowType } from './quizShow';
import { duelScoreType } from './duelScore';
import { threeAnswerBoardType, twoAnswerBoardType } from './answerBoard';
import { scoreboardType } from './scoreboard';
import { podiumScoreType } from './podiumScore';
import { fixturesType } from './sportsBoards';
import { matchBoardType, matchEventType, matchStatusType, scorebugType } from './sportsBugs';
import { tickerType } from './ticker';
import { IDENTITY_BUG_TYPES } from './identityBugs';
import { transitionType } from './transitions';
import { alertLevelType } from './alertLevel';
import { publicNoticeType } from './publicNotice';
import { eventNotificationType } from './eventNotification';
import { signOffType } from './signOff';

/** Every registered type, in the reference data's frequency order (the count is how many of
 *  the 60 reference formats ask for that graphic). The last three of the original twelve earn
 *  their place by what they prove rather than by frequency: a scoreboard for parallel groups,
 *  a ticker for timer-driven motion, a quiz board for the far end of the model. The IDENTITY
 *  family (identityBugs.ts) follows: the small persistent marks — idents, live status, logo
 *  marks, sponsor strips and rotations, event and award marks, location chips. */
export const TYPES: GraphicType[] = [
  lowerThirdType,     // 52/60
  sponsorBugType,     // 37/60
  countdownType,      // 30/60
  topicCardType,      // 29/60
  titleCardType,      // 23/60
  agendaType,         // 22/60
  socialBugType,      // 17/60
  pollType,           // 13/60
  holdingScreenType,  //  9/60
  signOffType,        // the closing card - one hold, no authored machine
  tickerType,         //  8/60
  scoreboardType,     //  5/60 — but the type that proves parallel groups
  speakingTimerType,  // the debating board: two clocks, one floor (agent round 2026-08-22)
  podiumScoreType,    // the game-show board: per-contestant steppers + the roster's spotlight arc
  quizBoardType,      // the flagship
  quizShowType,       // the show board: pick, reveal, and an answer count that is a field
  duelScoreType,      // the two-player score strip a quiz show keeps up all evening
  // ── The title / topic / information pack ──
  // These have no frequency count: the reference sheet asked "which graphics does this
  // format need", and it named the OPENER and the TOPIC card, which the two types above
  // already cover. Everything below is a shape those two were being made to stand in for —
  // a now/next card is not a title card with different words, and a process shown all at once
  // is not a process. They earn their place by being a different graphic, not by frequency.
  nowNextType,        // now playing / coming up
  headlineCardType,   // headline + body
  processStepsType,   // steps, processes, checklists — the pack's stepped type
  noticeCardType,     // public information + safety — the pack's state machine
  statementCardType,  // long text, and a second language
  keyFactsType,       // key facts / explainers — a list board, like the agenda
  recapType,          // recap / action items — a list board, like the agenda
  // The identity family: station ident, live status, logo mark, sponsor strip, sponsor
  // rotation, event ident, award mark, location chip — four looks each.
  ...IDENTITY_BUG_TYPES,
  // Not in the reference data's frequency list — it earns its place the way the last three
  // above do, by what it proves: a graphic whose whole content is its lifecycle. A stinger
  // covers the frame, holds for the cut, and clears ITSELF on a timer.
  transitionType,
  // The gap-list types (docs/PACK_TAXONOMY.md, "what the sheet asks for that no type covers").
  // Each is one field contract several looks share, which is the other half of what a type is
  // for — none of them needs a machine, and none of them declares one.
  callToActionType,   // the ask: follow · donate · register · buy, as one graphic
  productCardType,    // live commerce: the thing, its price, what it was
  offerCardType,      // the discount announced on its own
  listingCardType,    // an auction lot / property / resource and its live value
  goalMeterType,      // the gap list's most-asked-for: two numbers, everything else derived
  milestoneTrackType, // the tier rail — a different question from the goal meter
  qrCardType,         // a scannable code the operator supplies, beside the address in words
  // The COMPETITION PACK (docs/COMPETITION_PACK.md) — esports, competition, result and
  // reveal graphics. They come after the reference-frequency list because they answer a
  // different question: not "what does every show need" but "what does a competition need".
  esportsScoreType,
  mapRoundType,
  matchupType,
  headToHeadType,
  playerCardType,
  rosterType,
  standingsType,
  bracketType,
  // The live half of the same question the standings board answers after the fact: what the
  // order IS while the session is still running. It earns its place by what no other type
  // could stand in for — a full-harness AI bench asked four models for a motorsport timing
  // tower and every one of them produced a lower third, because the nearest catalog match to
  // "a narrow column of positions" was a strap.
  timingTowerType,
  nomineeRevealType,
  verdictCardType,
  winnerCardType,
  awardRevealType,
  threeAnswerBoardType, // the same arc at three rows…
  twoAnswerBoardType,   // …and at two: the pick is data, so the machine never changed
  livePollType,       // the vote WHILE it happens — the type that closes itself on a timer
  // The AUDIENCE family (types/audience.ts): what the people watching sent in. Two of the five
  // carry no machine at all, which is the "persist a machine only when the derived one is
  // wrong" rule showing its work.
  viewerQuestionType,
  qaCardType,
  chatHighlightType,
  questionQueueType,
  communityRequestType,
  // The PUBLIC-SERVICE pair (docs/PUBLIC_SERVICE_PACK.md). Neither is in the 60-format
  // reference sheet's frequency ranking — that sheet counts show FORMATS, and an emergency
  // broadcast is a moment inside one rather than a format of its own. They earn their place
  // the way the last three above do, by what they prove: a parallel group whose states are the
  // graphic's MEANING (the severity a viewer acts on) rather than its choreography, and one
  // whose states are the LANGUAGE the message is currently in.
  alertLevelType,
  publicNoticeType,
  eventNotificationType,
  // ── The SPORTS pack (docs/SPORTS_PACK.md). Five types covering what a live sports
  // broadcast keeps on air, from a district-league phone stream to a stadium show. They
  // earn their place by coverage rather than by the reference sheet's frequency: that sheet
  // counts FORMATS, and "sports broadcast" is one row hiding a dozen graphics. The pack's
  // lineup, standings and head-to-head boards were DROPPED rather than shipped - roster,
  // standings and head-to-head above already are those graphics.
  scorebugType,       // the strip that stays on air, with the match clock
  matchBoardType,     // the full scoreboard, with the period breakdown
  matchStatusType,    // where the match stands - and the final score
  matchEventType,     // substitutions, bookings, penalties, goals (the pack's timer)
  fixturesType,       // upcoming matches and results, on one board
];

export function typeById(id: string): GraphicType | undefined {
  return TYPES.find((t) => t.id === id);
}

/** The types that build on a category's assembler. */
export function typesFor(category: AssemblerId): GraphicType[] {
  return TYPES.filter((t) => t.structure.category === category);
}

/** Every type's designs, compiled to variants and grouped by category. */
export function typeVariants(): Partial<Record<AssemblerId, TemplateVariant[]>> {
  const out: Partial<Record<AssemblerId, TemplateVariant[]>> = {};
  for (const type of TYPES) {
    for (const variant of variantsFromType(type)) {
      (out[variant.category] ??= []).push(variant);
    }
  }
  return out;
}

/**
 * Merge type-compiled variants into the hand-written catalog. A compiled variant REPLACES a
 * hand-written one with the same id, in place — promotion must not move a design's position in
 * the browse grid or mint a second id for the same graphic. Anything new is appended.
 */
export function mergeCatalog(
  handWritten: Partial<Record<AssemblerId, TemplateVariant[]>>,
  compiled: Partial<Record<AssemblerId, TemplateVariant[]>>,
): Partial<Record<AssemblerId, TemplateVariant[]>> {
  const merged: Partial<Record<AssemblerId, TemplateVariant[]>> = { ...handWritten };
  for (const [category, variants] of Object.entries(compiled) as [AssemblerId, TemplateVariant[]][]) {
    const existing = [...(merged[category] ?? [])];
    for (const variant of variants) {
      const at = existing.findIndex((v) => v.id === variant.id);
      if (at >= 0) existing[at] = variant;
      else existing.push(variant);
    }
    merged[category] = existing;
  }
  return merged;
}
