// THE ONE AUDIENCE BACKEND INTERFACE (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5 / D4).
//
// Everything the audience plane does — a viewer sending a question, an operator moderating it,
// a round opening, a vote arriving, a tally being read — goes through this one interface, and
// there are two implementations of it: `localAudience.ts` (in memory, with a submission
// simulator) and, when the backend lands, a Supabase one over the slug-keyed RPCs.
//
// The seam exists for two reasons and both are load-bearing:
//  - REHEARSAL. An operator has to be able to practise the whole moderation workflow with no
//    audience, no network and no account, which is the local provider driving the same UI.
//  - TESTABILITY. The offline e2e suite can drive the entire workflow, including submissions
//    arriving mid-show, without a backend to stand up.
//
// THE GOVERNING RULE, which this interface exists to make structural rather than remembered:
// **nothing viewer-written reaches Preview or Program without an explicit operator action.**
// There is deliberately no method here that airs anything. Airing is `addShowCue` plus the
// ordinary verbs, exactly as for any other cue — the audience plane hands over a cue's worth of
// text and stops there. A future provider cannot bypass that, because the interface gives it
// nowhere to write.

import type { ChatVote, ChatVoteOutcome } from './chatVotes.ts';

/** Where a submission is in moderation. `new` is the only state a viewer can put it in. */
export type AudienceStatus = 'new' | 'approved' | 'rejected';

/** What the audience is being asked for right now: `question` while an Open question is live,
 *  `poll` while a Multiple choice one is, `word` while a Word one is. `comment` and `quiz` are
 *  older states a join page may still read. */
export type AudienceMode = 'waiting' | 'question' | 'comment' | 'poll' | 'quiz' | 'word';

/**
 * One thing a viewer sent in.
 *
 * The ORIGINAL is immutable and the BROADCAST version is editable, which is the whole moderation
 * model: an operator tidies punctuation, trims a rambling question or drops a surname, and the
 * record still says what was actually sent. A moderation surface that edited the original in
 * place would destroy the only evidence of what a person wrote.
 */
export interface AudienceSubmission {
  id: string;
  /** ISO. Arrival order is what an inbox is sorted by. */
  createdAt: string;
  /** Exactly as sent. NEVER edited — not by the operator, not by a provider. */
  author: string;
  body: string;
  /** What would go on air. Starts as a copy of the original and is the operator's to change. */
  broadcastAuthor: string;
  broadcastBody: string;
  /** Air it without a name. Kept separate from clearing `broadcastAuthor` so the intent
   *  survives an edit and can be undone. */
  anonymize: boolean;
  status: AudienceStatus;
  /** Kept back for later — an operator's "maybe", which is not the same as approved. */
  shortlisted: boolean;
  /** ISO, once it has been prepared into a cue. What stops the same question being asked twice. */
  usedAt: string | null;
  /** Provenance, shown small beside the message and NEVER put on a graphic: the platform's own id
   *  for an imported item (what dedupes a re-import), a label such as "Pasted", and a private
   *  note such as a phone number. All optional; a pasted message needs none of them. */
  externalId?: string | null;
  source?: string | null;
  reference?: string | null;
  /** ISO, once its row left the source it was imported from (`settleImported`). Only a used
   *  candidate carries it: an unused one leaves the inbox instead. Absent or null = still there. */
  withdrawnAt?: string | null;
  /** The round this message was filed under: the live question's when a phone answered it, or the
   *  one the operator chose when pasting (interaction spec R7, R13). Never moved once set. Absent or
   *  null = no question. */
  roundId?: string | null;
}

/** One message an OPERATOR adds: pasted, or imported from a source. Body required, the rest
 *  optional. Never a viewer's write - that is `submit`, behind the join slug. */
export interface CandidateInput {
  author?: string;
  body: string;
  externalId?: string | null;
  source?: string | null;
  reference?: string | null;
  /** File it under this round (a round of this production), or under none. */
  roundId?: string | null;
}

/** The most an operator adds in one call (migration 0095's `audience_operator_add` bound). */
export const OPERATOR_ADD_MAX = 100;

/** Add any number of candidates through the operator door, OPERATOR_ADD_MAX a call, one call at
 *  a time. `stop` is asked between calls; a refusal throws with the calls before it landed. */
export async function addInChunks(
  backend: Pick<AudienceBackend, 'addCandidates'>,
  items: CandidateInput[],
  stop: () => boolean = () => false,
): Promise<AudienceSubmission[]> {
  const added: AudienceSubmission[] = [];
  for (let at = 0; at < items.length && !stop(); at += OPERATOR_ADD_MAX) {
    added.push(...(await backend.addCandidates(items.slice(at, at + OPERATOR_ADD_MAX))));
  }
  return added;
}

/** The most rows one source settles in a call (migration 0098's `audience_operator_settle`
 *  bound): a message Sheet is read whole, so this is the longest tab Messages follows. */
export const OPERATOR_SETTLE_MAX = 2_000;

/**
 * A question's ONE result (interaction spec, "Question lifecycle"; migration 0111): opened by Go
 * live, closed by Stop or by another question going live, reopened by Go live again with the same
 * count. `poll` is a Multiple choice question, `open` an Open one, `word` a Word one (one word per
 * phone, migration 0114); `quiz` is an older round.
 */
export interface AudienceRound {
  id: string;
  kind: 'poll' | 'quiz' | 'open' | 'word';
  /** The production question it belongs to (model/questions.ts), or null for an older round. */
  questionId: string | null;
  /** Moves when the snapshot can have changed (an edit going live, Clear results), never on a
   *  plain reopen. A phone sends the revision it read; a stale one is refused (R5, R6). */
  revision: number;
  question: string;
  /** At most 8. A vote is an INDEX into this list. */
  options: string[];
  /** Never returned to the join page. */
  correctOption: number | null;
  openedAt: string;
  closedAt: string | null;
}

/** The one open round among `rounds`, if any. What phones see follows it (R18). */
export function openRoundOf<R extends Pick<AudienceRound, 'closedAt'>>(rounds: readonly R[]): R | null {
  return rounds.find((r) => !r.closedAt) ?? null;
}

/** A round's counts, by option index. Counted on read over the votes' own primary key — there
 *  is no maintained counter column (hot-row conflicts, drift, no benefit at this scale). */
export interface AudienceTally {
  roundId: string;
  /** Phone and chat votes summed, by option: what a result cue carries. */
  counts: number[];
  total: number;
  /** The same counts apart, by source (interaction spec, "Chat votes"). Absent from a provider that
   *  cannot tell them apart; then every vote is a phone's. */
  phone?: number[];
  chat?: number[];
}

/**
 * Which submissions the PRESENTER is holding: what they are reading now, and what comes next.
 *
 * Ids, not text, because the broadcast version keeps being edited while a question sits in the
 * queue — a pointer follows those edits and a copy would go stale in someone's hand. It is
 * deliberately a third thing from the rundown: pointing at a question is telling a person what
 * to say, not putting anything on air, and `/join?pv=<slug>` resolves it under its own slug so
 * a presenter's tablet never holds an operator capability.
 *
 * `null` on either side is a real state (nothing queued), not an absence.
 */
export interface PresenterPointers {
  current: string | null;
  next: string | null;
}

/** What the join page is showing, and what the operator controls. */
export interface AudienceState {
  open: boolean;
  mode: AudienceMode;
  /** The currently open round, if any. */
  round: AudienceRound | null;
  /** What the join page says above its input — the operator's own words. */
  prompt: string;
  /** What the presenter is reading now and next. NEVER returned to the join page (the
   *  capability discipline in docs/INTERACTIVE_PLAYOUT_PLAN.md lists it by name). */
  presenter: PresenterPointers;
}

/**
 * The production's look, as much of it as a join page needs: it is the one surface a viewer
 * ever sees, and a plain white form beside a branded broadcast reads as somebody else's site.
 * Written at publish from `Show.look` (an owner write, not something a viewer's page can set).
 *
 * ADDITIVE OPTIONAL on `JoinView` — the local rehearsal provider carries none and renders in
 * the studio's own colours, which is honest: rehearsal is not air.
 */
export interface AudienceBrand {
  /** Colours as the look has them; null leaves the page's own. The page makes each readable. */
  accent: string | null;
  text: string | null;
  panel: string | null;
  /** A full CSS `font-family` value, or null to use the page's own stack. */
  font: string | null;
  /** The look's logo: a public https URL named by the production and the file's hash (published),
   *  or the look's own data URL (rehearsal). Absent or null shows no logo (interaction spec D4). */
  logo?: string | null;
  /** The page's title; absent or empty shows the production's name. */
  title?: string | null;
  /** What phones show while no question is live; absent or empty shows the default. */
  waiting?: string | null;
}

export { JOIN_PAGE_LIMITS } from '../model/joinPage.ts';

/** What phones show while no question is live, unless the operator wrote their own. */
export const JOIN_WAITING_DEFAULT = 'Not taking part right now. Keep this page open, it updates by itself.';

/** What a viewer sees when they resolve a join slug. Deliberately tiny: see the capability
 *  discipline in the plan — no show id, no other slug, no tallies, no correct answer. */
export interface JoinView {
  productionName: string;
  state: AudienceState;
  /** The production's colours, when it has published any. */
  brand?: AudienceBrand | null;
  /** What THIS device has already sent, so the page can say "thanks" rather than inviting a
   *  double post. Never anyone else's. */
  mine: { id: string; body: string; createdAt: string; roundId?: string | null }[];
  /** This device's current vote in the open round, so it can be shown as picked (and changed —
   *  the round's primary key is (round, device), so an upsert IS "change your mind"). */
  myVote: number | null;
}

export interface SubmitResult {
  ok: boolean;
  /** Generic on purpose. A submit endpoint that explains precisely why it refused is an oracle. */
  error: string | null;
  /** The round it was sent to has closed or changed (R6, R14): the page shows the new question and
   *  keeps what was typed. Whether a question is still live is not a secret, so this one refusal
   *  says what it is. */
  closed?: boolean;
}

/** What a phone page says when its send reached a round that has closed or changed. */
export const QUESTION_CLOSED = 'That question has closed.';

/** What a phone page says when it already sent its one word to this question (W3). */
export const WORD_ALREADY_SENT = 'You have already sent your word.';

/** What a phone page says when what it sent is not one word of at most 25 characters (W2). */
export const WORD_REFUSED = 'Send one word of at most 25 characters.';

/** Which round an answer or vote is for, as the phone read it (R6). */
export interface RoundTarget {
  roundId: string;
  revision: number;
}

/** What Go live sends: the question as it stands in the production's list. */
export interface QuestionLive {
  id: string;
  type: 'open' | 'choice' | 'word';
  text: string;
  options?: string[];
}

/**
 * THE INTERFACE. Two halves, and the split is the capability boundary: the `join*` methods are
 * what a VIEWER's page may call, everything else is what an OPERATOR's surface may call. A
 * provider implements both, but the two are never reachable from one place.
 */
export interface AudienceBackend {
  // ── The viewer's half (a join slug is the only capability) ────────────────────────────────
  joinView(deviceToken: string): Promise<JoinView>;
  /** An answer to the live Open question named by `target`, or this phone's one word to a live Word
   *  question; refused unless that round is open at that revision (R6), and a second word from
   *  the same phone is refused (W3). */
  submit(deviceToken: string, author: string, body: string, target: RoundTarget): Promise<SubmitResult>;
  /** A vote on the Multiple choice round `roundId` at `revision`. Sending again changes it. */
  vote(deviceToken: string, roundId: string, option: number, revision: number): Promise<SubmitResult>;

  // ── The operator's half (the control slug) ────────────────────────────────────────────────
  list(): Promise<AudienceSubmission[]>;
  /** Add operator-supplied candidates (paste, an import). They arrive `new`, like any message,
   *  and air only as a cue the operator prepares and Takes. At most OPERATOR_ADD_MAX per call;
   *  an item whose `externalId` is already in the inbox is skipped. Returns the rows added. */
  addCandidates(items: CandidateInput[]): Promise<AudienceSubmission[]>;
  /** One source's rows as they stand now (audience spec, "Identity"): of the candidates whose
   *  external id starts with `prefix`, an unused one not in `present` leaves the inbox, a used one
   *  is marked withdrawn and kept with its original, and a withdrawn one back in `present` is
   *  unmarked. Adds nothing: arrivals go through `addCandidates`. */
  settleImported(prefix: string, present: string[]): Promise<void>;
  /** Patch a submission. The allowlist is what makes the original immutable: `author` and
   *  `body` are NOT patchable, here or in any provider. */
  update(
    id: string,
    patch: Partial<Pick<AudienceSubmission, 'broadcastAuthor' | 'broadcastBody' | 'anonymize' | 'status' | 'shortlisted' | 'usedAt'>>,
  ): Promise<void>;
  /** The presenter pointers. What phones see moves only through `goLive` and `stop` (R18). */
  setState(patch: Partial<Pick<AudienceState, 'presenter'>>): Promise<AudienceState>;
  getState(): Promise<AudienceState>;
  /** What phones show around the question (the look, logo, title and waiting text), sent as one
   *  value and merged on the server. Only a published production has phones to send it to; the
   *  local provider has none, and the studio's own preview takes the page from the production. */
  setPage?(brand: AudienceBrand): Promise<void>;
  /** The page phones get now (null when there is none yet). Throws when it cannot be read. */
  readPage?(): Promise<AudienceBrand | null>;
  /** Put this question in front of every phone, in one step: any other open round closes, this
   *  question's round opens (made the first time, reopened after), and the state points at it
   *  (R3). Refused when its words differ from a result that has answers, or its type changed. */
  goLive(question: QuestionLive): Promise<AudienceRound>;
  /** Close `roundId` and show phones the waiting text, if that round is still the open one (R4). */
  stop(roundId: string): Promise<AudienceState>;
  /** Remove a question's answers and votes and move its revision on; refused while it is live
   *  (R9). Null when the question never went live. */
  clearResults(questionId: string): Promise<AudienceRound | null>;
  tally(roundId: string): Promise<AudienceTally>;
  rounds(): Promise<AudienceRound[]>;
  /** Chat votes into the open Multiple choice round `roundId` (interaction spec, "Chat votes";
   *  migration 0113): each voter's latest by platform time, only what was said after the round
   *  last went live. `closed` when the round is not the open one. At most CHAT_VOTES_MAX a call. */
  chatVotes?(roundId: string, votes: ChatVote[]): Promise<ChatVoteOutcome>;
}

/**
 * A provider a LIVE surface can subscribe to. Both implementations answer it and neither
 * surface has to know which it holds: the local one notifies from its own writes, the Supabase
 * one from a poll (the plan's decisive rejection of realtime — `postgres_changes` filters rows
 * by the SUBSCRIBER's RLS, and a slug-authorized page has no SELECT policy to filter by, so the
 * authorization simply cannot be expressed to realtime).
 */
export interface ObservableAudience extends AudienceBackend {
  /** Subscribe to any change. Returns the unsubscribe. */
  onChange(cb: () => void): () => void;
  /** Rehearsal only — present on the local provider, absent on the real one, so a surface
   *  offers the simulator exactly when it is meaningful. */
  simulate?(count?: number): unknown;
  /** Rehearsal votes onto the open round, by option index. Same rule as `simulate`: absent on
   *  the real provider, because a live production has an audience instead. It is what lets an
   *  operator watch a tally move before a show — and what lets the offline suite drive a vote
   *  all the way onto a graphic without a backend. */
  simulateVotes?(counts: number[]): unknown;
}

/**
 * What actually goes on air for a submission — the broadcast version, with the anonymise choice
 * applied. ONE function, so the moderation preview, the cue the operator makes and any future
 * presenter view cannot disagree about what "on air" means for a given row.
 *
 * The anonymous WORD is a caller's to supply: it is copy, and copy on air belongs to the
 * broadcaster (the audience category's own rule — src/templates/AGENTS.md).
 */
export function broadcastValues(
  submission: AudienceSubmission,
  anonymousLabel = 'Anonymous',
): { author: string; body: string } {
  const author = submission.anonymize ? anonymousLabel : submission.broadcastAuthor.trim();
  return { author: author || anonymousLabel, body: submission.broadcastBody.trim() };
}

/** The hard caps, in one place so the local provider, a future server trigger and the join
 *  page's own counter cannot disagree. 500 for a question is the owner's ratified number. */
export const AUDIENCE_LIMITS = { author: 40, body: 500, options: 8 } as const;

/** The three provenance fields, trimmed and capped as 0095 stores them; empty is absent. */
export function clampProvenance(item: Pick<CandidateInput, 'externalId' | 'source' | 'reference'>): {
  externalId: string | null;
  source: string | null;
  reference: string | null;
} {
  const one = (v: string | null | undefined, max: number) => {
    const t = (v ?? '').trim().slice(0, max);
    return t ? t : null;
  };
  return { externalId: one(item.externalId, 200), source: one(item.source, 60), reference: one(item.reference, 200) };
}

/** Trim and truncate exactly as a server-side guard trigger would, so the local provider is a
 *  faithful stand-in rather than a more permissive one. */
export function clampSubmission(author: string, body: string): { author: string; body: string } {
  return {
    author: author.trim().slice(0, AUDIENCE_LIMITS.author),
    body: body.trim().slice(0, AUDIENCE_LIMITS.body),
  };
}
