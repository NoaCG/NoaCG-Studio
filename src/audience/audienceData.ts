// THE SUPABASE AUDIENCE PROVIDER — the second implementation of `AudienceBackend`
// (docs/INTERACTIVE_PLAYOUT_PLAN.md, "Audience backend design"; migration 0035).
//
// It is a thin client over twelve slug-keyed SECURITY DEFINER RPCs. There are no table reads
// and no table writes here, because there are no table policies to reach: authorization is
// "you hold this capability", which is what lets a viewer's phone and an account-free hosted
// operator page both work.
//
// THE CAPABILITY SPLIT IS IN THE CONSTRUCTOR, not in a comment. A provider built for the join
// page holds only a join slug and physically cannot call `list`; one built for an operator
// surface holds only the control slug and cannot resolve the join view. The interface has both
// halves because it describes the whole plane; a given instance is granted one of them.
//
// **Nothing here writes to `control_events`.** That is the structural half of "nothing
// viewer-written airs without an operator": there is no method on this object that reaches the
// command log, so no bug in a calling surface can put a submission on air.
//
// POLLING, NOT REALTIME (decided in the plan, and it is not a performance opinion): realtime
// `postgres_changes` filters rows by the SUBSCRIBER's RLS, and these tables deliberately have no
// SELECT policy at all — slug authorization cannot be expressed to it. So each surface polls at
// the cadence its job needs.

import type { ChatVoteOutcome } from './chatVotes.ts';
import { getSupabase } from '../backend/supabase';
import { isBackendConfigured, loadBackendConfig } from '../backend/config';
import {
  AUDIENCE_LIMITS,
  OPERATOR_ADD_MAX,
  OPERATOR_SETTLE_MAX,
  QUESTION_CLOSED,
  clampProvenance,
  openRoundOf,
  clampSubmission,
  type AudienceBrand,
  type AudienceRound,
  type AudienceState,
  type AudienceStatus,
  type AudienceSubmission,
  type AudienceTally,
  type JoinView,
  type ObservableAudience,
  type SubmitResult,
} from './audienceTypes';

/** How often each surface asks, in ms. The join page adds jitter and pauses when hidden. */
export const AUDIENCE_POLL = {
  /** A viewer's page: it is waiting for the operator to open or change the question. */
  join: 5_000,
  /** The moderation inbox: fast enough that a question feels like it arrived, not appeared. */
  inbox: 4_000,
  /** A tally while a round is open — the only number that moves second by second. */
  tally: 2_000,
} as const;

/** What a surface may be granted. Exactly one of these is normally set. */
export interface AudienceCapabilities {
  /** A viewer's capability: the public join URL. */
  joinSlug?: string;
  /** An operator's capability: the SAME hosted-control slug they already hold. */
  controlSlug?: string;
}

/** One refusal, in one voice. A backend that explains precisely why it said no is an oracle,
 *  and the server keeps its answers generic for that reason — so does this. */
const REFUSED = 'That could not be sent right now.';

interface JoinRow {
  production_name: string;
  state: {
    open?: boolean;
    mode?: AudienceState['mode'];
    prompt?: string;
    round?: {
      id: string;
      kind: AudienceRound['kind'];
      question: string;
      options: string[];
      openedAt: string;
      /** 0111; absent from a server that has not run it. */
      revision?: number;
    } | null;
  };
  brand: AudienceBrand | null;
  mine: { id: string; body: string; createdAt: string }[];
  my_vote: number | null;
}

interface SubmissionRow {
  id: string;
  created_at: string;
  author: string;
  body: string;
  broadcast_author: string;
  broadcast_body: string;
  anonymize: boolean;
  status: AudienceStatus;
  shortlisted: boolean;
  used_at: string | null;
  skipped_at: string | null;
  /** 0095's provenance columns; absent from a server that has not run it. */
  external_id?: string | null;
  source?: string | null;
  reference?: string | null;
  /** 0098's mark on a used candidate whose row left its source. */
  withdrawn_at?: string | null;
  /** 0111's round the message was filed under. */
  round_id?: string | null;
}

interface RoundRow {
  id: string;
  kind: AudienceRound['kind'];
  question: string;
  options: unknown;
  correct_option: number | null;
  opened_at: string;
  closed_at: string | null;
  /** 0111. */
  question_id?: string | null;
  revision?: number;
}

function readRound(row: RoundRow): AudienceRound {
  return {
    id: row.id,
    kind: row.kind,
    questionId: row.question_id ?? null,
    revision: Number(row.revision ?? 1),
    question: row.question,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctOption: row.correct_option,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function readSubmission(row: SubmissionRow): AudienceSubmission {
  return {
    id: row.id,
    createdAt: row.created_at,
    author: row.author,
    body: row.body,
    broadcastAuthor: row.broadcast_author,
    broadcastBody: row.broadcast_body,
    anonymize: row.anonymize,
    status: row.status,
    shortlisted: row.shortlisted,
    usedAt: row.used_at,
    externalId: row.external_id ?? null,
    source: row.source ?? null,
    reference: row.reference ?? null,
    withdrawnAt: row.withdrawn_at ?? null,
    roundId: row.round_id ?? null,
  };
}

/** A single row out of an RPC that returns a one-row TABLE (PostgREST hands back an array). */
function one<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

/**
 * The join resolve, read with a plain request rather than through the Supabase client.
 *
 * It is the phone page's first read, on venue wifi (interaction spec AC-5: the live question
 * visible within 3 seconds at 1.6 Mbps and 563 ms latency). The client library is the largest
 * thing the page would load and adds a round trip of its own, so a phone loads it only when it
 * sends. The request is the one the client makes for this call: the same function, the public
 * key in `apikey` and as the bearer, so the database sees the same caller. Any failure reads as
 * nothing to show, as before.
 */
async function joinRead(slug: string, device: string): Promise<JoinRow | null> {
  const cfg = loadBackendConfig();
  if (!isBackendConfigured(cfg)) throw new Error('This build has no cloud backend.');
  try {
    const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/rest/v1/rpc/audience_join_by_slug`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_join_slug: slug, p_device: device }),
    });
    return res.ok ? one<JoinRow>(await res.json()) : null;
  } catch {
    return null;
  }
}

/** The state the join page starts from and falls back to: a closed door, honestly described. */
const CLOSED: AudienceState = {
  open: false,
  mode: 'waiting',
  round: null,
  prompt: '',
  presenter: { current: null, next: null },
};

export function createSupabaseAudience(caps: AudienceCapabilities): ObservableAudience {
  const listeners: Array<() => void> = [];
  const changed = () => listeners.forEach((cb) => cb());

  /** The capability a call needs, or a refusal naming NEITHER slug. */
  const join = (): string => {
    if (!caps.joinSlug) throw new Error(REFUSED);
    return caps.joinSlug;
  };
  const control = (): string => {
    if (!caps.controlSlug) throw new Error('This surface has no audience control capability.');
    return caps.controlSlug;
  };

  const client = async () => {
    const sb = await getSupabase();
    // An offline build reaching a Supabase provider is a wiring mistake, not a runtime state:
    // every surface picks the local provider when `isBackendConfigured()` is false.
    if (!sb) throw new Error('This build has no cloud backend.');
    return sb;
  };

  /** A viewer-facing write: one boolean, one generic message, never a server string.
   *  `PromiseLike`, not `Promise` — a Supabase query builder is thenable, not a real promise. */
  const attempt = async (run: () => PromiseLike<{ error: unknown }>): Promise<SubmitResult> => {
    try {
      const { error } = await run();
      // The one refusal that says what it is (0111): the round closed or changed under the phone.
      if (error && /question has closed/.test(String((error as { message?: unknown }).message ?? ''))) {
        return { ok: false, error: QUESTION_CLOSED, closed: true };
      }
      return error ? { ok: false, error: REFUSED } : { ok: true, error: null };
    } catch {
      return { ok: false, error: REFUSED };
    }
  };

  /** An operator-facing read/write: the surface shows what went wrong, because the operator
   *  owns the production and an unexplained failure mid-show is worse than a blunt one. */
  const operator = async <T>(
    run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T> => {
    const { data, error } = await run();
    if (error) throw new Error(error.message);
    return data as T;
  };

  const stateFrom = (raw: unknown, rounds: AudienceRound[]): AudienceState => {
    const s = (raw ?? {}) as {
      open?: boolean;
      mode?: AudienceState['mode'];
      prompt?: string;
      presenter?: { current?: unknown; next?: unknown };
    };
    // The pointers come back as submission ids or nulls. An empty string is the same thing as
    // null here (0035 stores `''` for "cleared" on the way in), and normalizing it once means
    // no surface has to know that.
    const pointer = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
    const round = openRoundOf(rounds);
    return {
      // Open only while a round is (R18), the same reading the join resolve makes.
      open: s.open === true && round !== null,
      mode: round ? s.mode ?? 'waiting' : 'waiting',
      prompt: s.prompt ?? '',
      round,
      presenter: { current: pointer(s.presenter?.current), next: pointer(s.presenter?.next) },
    };
  };

  // Named, not `this`: two methods compose others, and a surface that destructures a method off
  // this object would otherwise get one that silently loses its own provider.
  const api: ObservableAudience = {
    // ── The viewer's half ───────────────────────────────────────────────────────────────────
    async joinView(deviceToken: string): Promise<JoinView> {
      const row = await joinRead(join(), deviceToken);
      // An unknown slug, a deleted production and a switched-off feature all look alike on
      // purpose: the join URL is a capability, and a page that distinguishes them is a probe.
      if (!row) return { productionName: '', state: CLOSED, brand: null, mine: [], myVote: null };
      const round = row.state?.round ?? null;
      return {
        productionName: row.production_name ?? '',
        state: {
          open: row.state?.open === true,
          mode: row.state?.mode ?? 'waiting',
          prompt: row.state?.prompt ?? '',
          // The presenter pointers are on the capability discipline's own list of things a join
          // resolve must never return (docs/INTERACTIVE_PLAYOUT_PLAN.md). 0035 does not send
          // them; hard-coding empty here means a server that one day did would still not reach
          // a viewer's page - the same belt-and-braces as the answer key on the next line.
          presenter: { current: null, next: null },
          // The server never sends the answer key; this restates that rather than trusting it.
          round: round
            ? {
                id: round.id,
                kind: round.kind,
                // The phone never needs the question id; it sends the round and its revision.
                questionId: null,
                revision: Number(round.revision ?? 1),
                question: round.question,
                options: Array.isArray(round.options) ? round.options : [],
                correctOption: null,
                openedAt: round.openedAt,
                closedAt: null,
              }
            : null,
        },
        brand: row.brand ?? null,
        mine: Array.isArray(row.mine) ? row.mine : [],
        myVote: row.my_vote ?? null,
      };
    },

    async submit(deviceToken, author, body, target): Promise<SubmitResult> {
      if (!body.trim()) return { ok: false, error: 'Nothing to send.' };
      const sb = await client();
      const result = await attempt(() =>
        sb.rpc('audience_submit', {
          p_join_slug: join(),
          p_device: deviceToken,
          // Clamped here as well as in the trigger: a phone should not send 200 kB to be told
          // no, and the counter under the box has to agree with what actually lands.
          p_author: author.trim().slice(0, AUDIENCE_LIMITS.author),
          p_body: body.trim().slice(0, AUDIENCE_LIMITS.body),
          // The round and revision the phone READ (0111, R6): never a question id it could choose.
          p_round: target.roundId,
          p_revision: target.revision,
        }),
      );
      if (result.ok) changed();
      return result;
    },

    async vote(deviceToken, roundId, option, revision): Promise<SubmitResult> {
      const sb = await client();
      const result = await attempt(() =>
        sb.rpc('audience_vote', {
          p_join_slug: join(),
          p_device: deviceToken,
          p_round: roundId,
          p_option: option,
          p_revision: revision,
        }),
      );
      if (result.ok) changed();
      return result.ok || result.closed ? result : { ok: false, error: 'That vote could not be counted.' };
    },

    // ── The operator's half ─────────────────────────────────────────────────────────────────
    async list(): Promise<AudienceSubmission[]> {
      const sb = await client();
      const rows = await operator<SubmissionRow[] | null>(() =>
        sb.rpc('audience_list', { p_slug: control() }),
      );
      return (rows ?? []).map(readSubmission);
    },

    async addCandidates(items): Promise<AudienceSubmission[]> {
      if (items.length > OPERATOR_ADD_MAX) throw new Error(`At most ${OPERATOR_ADD_MAX} messages at a time.`);
      const wire = items
        .filter((i) => i.body.trim())
        .map((i) => {
          const p = clampProvenance(i);
          return {
            ...clampSubmission(i.author ?? '', i.body),
            external_id: p.externalId,
            source: p.source,
            reference: p.reference,
            round_id: i.roundId ?? null,
          };
        });
      if (wire.length === 0) return [];
      const sb = await client();
      // The OPERATOR door (0095), keyed on the control slug like every operator call: not the
      // viewer's `audience_submit`, whose join slug, open round and per-device caps are a viewer's.
      const rows = await operator<SubmissionRow[] | null>(() =>
        sb.rpc('audience_operator_add', { p_slug: control(), p_items: wire }),
      );
      changed();
      return (rows ?? []).map(readSubmission);
    },

    async settleImported(prefix, present): Promise<void> {
      if (present.length > OPERATOR_SETTLE_MAX) throw new Error(`At most ${OPERATOR_SETTLE_MAX} rows at a time.`);
      if (!prefix) return;
      const sb = await client();
      // 0098: the same rule as the local provider, under one lock on the server, so a second
      // operator's page sees what the reading page settled.
      const settled = await operator<number | null>(() =>
        sb.rpc('audience_operator_settle', { p_slug: control(), p_prefix: prefix, p_present: present }),
      );
      if (settled) changed();
    },

    async update(id, patch): Promise<void> {
      const sb = await client();
      // The allowlist, restated in the client's own vocabulary. `author` and `body` are not in
      // the patch type and are not mapped here either — the original is immutable in both
      // implementations and in the database, which is three places agreeing rather than one.
      const wire: Record<string, unknown> = {};
      if (patch.broadcastAuthor !== undefined) wire.broadcast_author = patch.broadcastAuthor;
      if (patch.broadcastBody !== undefined) wire.broadcast_body = patch.broadcastBody;
      if (patch.anonymize !== undefined) wire.anonymize = patch.anonymize;
      if (patch.status !== undefined) wire.status = patch.status;
      if (patch.shortlisted !== undefined) wire.shortlisted = patch.shortlisted;
      if (patch.usedAt !== undefined) wire.used_at = patch.usedAt;
      if (Object.keys(wire).length === 0) return;
      await operator(() => sb.rpc('audience_update', { p_slug: control(), p_id: id, p_patch: wire }));
      changed();
    },

    async getState(): Promise<AudienceState> {
      const sb = await client();
      // An EMPTY patch is the read (migration 0035): the same capability check, no rev bump.
      const [raw, rounds] = await Promise.all([
        operator<unknown>(() => sb.rpc('audience_set_join', { p_slug: control(), p_patch: {} })),
        api.rounds(),
      ]);
      return stateFrom(raw, rounds);
    },

    async setState(patch): Promise<AudienceState> {
      const sb = await client();
      const wire: Record<string, unknown> = {};
      // 0035's allowlist takes `presenter` as an OBJECT of id-or-null, and validates each value
      // against the uuid shape before it is stored - so a cleared pointer travels as null, never
      // as the empty string the read side tolerates.
      if (patch.presenter !== undefined) {
        wire.presenter = { current: patch.presenter.current, next: patch.presenter.next };
      }
      const raw = await operator<unknown>(() =>
        sb.rpc('audience_set_join', { p_slug: control(), p_patch: wire }),
      );
      changed();
      return stateFrom(raw, await api.rounds());
    },

    async readPage(): Promise<AudienceBrand | null> {
      const sb = await client();
      // An EMPTY patch is the read (0035): the same capability check, no rev bump. `operator`
      // throws on an error, so a failed read is never taken for "no page yet".
      const raw = await operator<unknown>(() => sb.rpc('audience_set_join', { p_slug: control(), p_patch: {} }));
      return ((raw ?? {}) as { brand?: AudienceBrand | null }).brand ?? null;
    },

    async setPage(brand): Promise<void> {
      const sb = await client();
      await operator<unknown>(() => sb.rpc('audience_set_join', { p_slug: control(), p_patch: { brand } }));
    },

    async goLive(question): Promise<AudienceRound> {
      const sb = await client();
      // One transaction on the server (0111, R3): the other round closes, this one opens, the
      // state points at it.
      const row = await operator<RoundRow | null>(() =>
        sb.rpc('audience_go_live', {
          p_slug: control(),
          p_question: {
            id: question.id,
            type: question.type,
            text: question.text,
            ...(question.type === 'choice' ? { options: (question.options ?? []).slice(0, AUDIENCE_LIMITS.options) } : {}),
          },
        }),
      );
      if (!row) throw new Error('The question could not go live.');
      changed();
      return readRound(row);
    },

    async stop(roundId): Promise<AudienceState> {
      const sb = await client();
      const raw = await operator<unknown>(() => sb.rpc('audience_stop', { p_slug: control(), p_round: roundId }));
      changed();
      return stateFrom(raw, await api.rounds());
    },

    async clearResults(questionId): Promise<AudienceRound | null> {
      const sb = await client();
      const row = await operator<RoundRow | null>(() =>
        sb.rpc('audience_clear_results', { p_slug: control(), p_question: questionId }),
      );
      changed();
      return row ? readRound(row) : null;
    },

    async tally(roundId: string): Promise<AudienceTally> {
      const sb = await client();
      type TallyRow = { round_id: string; counts: number[]; total: number; phone_counts?: number[]; chat_counts?: number[] };
      const rows = await operator<TallyRow[] | null>(() => sb.rpc('audience_tally', { p_slug: control(), p_round: roundId }));
      const row = one<TallyRow>(rows);
      if (!row) return { roundId, counts: [], total: 0 };
      return {
        roundId: row.round_id,
        counts: Array.isArray(row.counts) ? row.counts : [],
        total: Number(row.total ?? 0),
        // 0113: the same counts by source.
        ...(Array.isArray(row.phone_counts) && Array.isArray(row.chat_counts) ? { phone: row.phone_counts, chat: row.chat_counts } : {}),
      };
    },

    async chatVotes(roundId, votes): Promise<ChatVoteOutcome> {
      const sb = await client();
      const { data, error } = await sb.rpc('audience_operator_votes', {
        p_slug: control(),
        p_round: roundId,
        p_items: votes.map((v) => ({ voter: v.voter, option: v.option, at: v.at })),
      });
      if (error && /question has closed/.test(error.message)) return { counted: 0, closed: true };
      if (error) throw new Error(error.message);
      return { counted: Number(data ?? 0) };
    },

    async rounds(): Promise<AudienceRound[]> {
      const sb = await client();
      const rows = await operator<RoundRow[] | null>(() =>
        sb.rpc('audience_rounds_list', { p_slug: control() }),
      );
      return (rows ?? []).map(readRound);
    },

    /**
     * The change signal, which for this provider is a POLL plus the writes we made ourselves.
     * A local write notifies immediately so the operator's own click never waits four seconds
     * for its own effect; the poll is what brings in everybody else's.
     */
    onChange(cb: () => void): () => void {
      listeners.push(cb);
      const timer = window.setInterval(() => {
        // Nothing is fetched here — the subscriber refetches. Which is the point: one timer
        // per provider, and each surface reads exactly what it renders.
        if (document.visibilityState !== 'hidden') cb();
      }, AUDIENCE_POLL.inbox);
      return () => {
        window.clearInterval(timer);
        const at = listeners.indexOf(cb);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };
  return api;
}

/** The presenter view (its own slug, read-only) — deliberately NOT part of `AudienceBackend`:
 *  it is a third capability with a third audience, and folding it into the operator interface
 *  would hand every presenter tablet the moderation methods. */
export interface PresenterView {
  productionName: string;
  mode: string;
  current: { author: string; body: string } | null;
  next: { author: string; body: string } | null;
}

export async function presenterBySlug(presenterSlug: string): Promise<PresenterView | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('audience_presenter_by_slug', {
    p_presenter_slug: presenterSlug,
  });
  if (error) return null;
  const row = one<{
    production_name: string;
    mode: string;
    current_item: { author: string; body: string } | null;
    next_item: { author: string; body: string } | null;
  }>(data);
  if (!row) return null;
  return {
    productionName: row.production_name ?? '',
    mode: row.mode ?? 'waiting',
    current: row.current_item ?? null,
    next: row.next_item ?? null,
  };
}
