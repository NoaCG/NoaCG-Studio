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

/** Where a submission is in moderation. `new` is the only state a viewer can put it in. */
export type AudienceStatus = 'new' | 'approved' | 'rejected';

/** What the audience is being asked for right now. */
export type AudienceMode = 'waiting' | 'question' | 'comment' | 'poll' | 'quiz';

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
}

/** One message an OPERATOR adds: pasted, or imported from a source. Body required, the rest
 *  optional. Never a viewer's write - that is `submit`, behind the join slug. */
export interface CandidateInput {
  author?: string;
  body: string;
  externalId?: string | null;
  source?: string | null;
  reference?: string | null;
}

/** The most an operator adds in one call (migration 0095's `audience_operator_add` bound). */
export const OPERATOR_ADD_MAX = 100;

/** The most rows one source settles in a call (migration 0098's `audience_operator_settle`
 *  bound): a message Sheet is read whole, so this is the longest tab Messages follows. */
export const OPERATOR_SETTLE_MAX = 2_000;

/** One opened poll or quiz question (Phase 6 uses these; Phase 5 only has to carry them). */
export interface AudienceRound {
  id: string;
  kind: 'poll' | 'quiz';
  question: string;
  /** At most 8. A vote is an INDEX into this list. */
  options: string[];
  /** Never returned to the join page. */
  correctOption: number | null;
  openedAt: string;
  closedAt: string | null;
}

/** A round's counts, by option index. Counted on read over the votes' own primary key — there
 *  is no maintained counter column (hot-row conflicts, drift, no benefit at this scale). */
export interface AudienceTally {
  roundId: string;
  counts: number[];
  total: number;
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
  accent: string;
  text: string;
  panel: string;
  /** A full CSS `font-family` value, or null to use the page's own stack. */
  font: string | null;
}

/** What a viewer sees when they resolve a join slug. Deliberately tiny: see the capability
 *  discipline in the plan — no show id, no other slug, no tallies, no correct answer. */
export interface JoinView {
  productionName: string;
  state: AudienceState;
  /** The production's colours, when it has published any. */
  brand?: AudienceBrand | null;
  /** What THIS device has already sent, so the page can say "thanks" rather than inviting a
   *  double post. Never anyone else's. */
  mine: { id: string; body: string; createdAt: string }[];
  /** This device's current vote in the open round, so it can be shown as picked (and changed —
   *  the round's primary key is (round, device), so an upsert IS "change your mind"). */
  myVote: number | null;
}

export interface SubmitResult {
  ok: boolean;
  /** Generic on purpose. A submit endpoint that explains precisely why it refused is an oracle. */
  error: string | null;
}

/**
 * THE INTERFACE. Two halves, and the split is the capability boundary: the `join*` methods are
 * what a VIEWER's page may call, everything else is what an OPERATOR's surface may call. A
 * provider implements both, but the two are never reachable from one place.
 */
export interface AudienceBackend {
  // ── The viewer's half (a join slug is the only capability) ────────────────────────────────
  joinView(deviceToken: string): Promise<JoinView>;
  submit(deviceToken: string, author: string, body: string): Promise<SubmitResult>;
  vote(deviceToken: string, roundId: string, option: number): Promise<SubmitResult>;

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
  setState(patch: Partial<Pick<AudienceState, 'open' | 'mode' | 'prompt' | 'presenter'>>): Promise<AudienceState>;
  getState(): Promise<AudienceState>;
  openRound(round: Omit<AudienceRound, 'id' | 'openedAt' | 'closedAt'>): Promise<AudienceRound>;
  closeRound(roundId: string): Promise<void>;
  tally(roundId: string): Promise<AudienceTally>;
  rounds(): Promise<AudienceRound[]>;
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
