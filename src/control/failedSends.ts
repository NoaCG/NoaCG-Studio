// WHEN A VERB'S SEND FAILS: whether it is sent again, what the operator is told, and when the
// telling stops.
//
// Measured on 2026-09-29: the production database stopped answering at 06:42 UTC and restarted,
// and until 06:45 every Take came back with PostgREST's own words, "Could not query the database
// for the schema cache. Retrying." Three things were wrong with what the operator then saw. Nothing
// was sent again, so even the last seconds of the outage cost a manual resend. The notice quoted a
// server message nobody operating a show can act on. And the notice stayed up after the operator
// did send it again and it aired everywhere: a quiz question on air under "Take is on this monitor
// only".
//
// Plain functions over plain data, importing nothing, so scripts/failed-sends.test.mjs runs them
// in Node.

/**
 * WHEN A FAILED SEND IS SENT AGAIN, and why it stops so soon.
 *
 * Only a send the server did not ANSWER goes again: no connection at all, the gateway's 502 to
 * 504 and 520 to 527, PostgREST's 503 while its database restarts, or a statement the database
 * cancelled on its timeout. Each of those either never reached the database or was rolled back
 * there, and a command that did land twice is still applied once, because every surface
 * reconciles on the id the command carries (commandRoads.ts). A command the server REFUSED - the
 * rate limit, a revoked slug - is an answer, and sending it again cannot change it.
 *
 * The window is short on purpose. The picture is already on the sender's own monitor, so every
 * other screen catching up a second or two late beats never; but a Take airing half a minute
 * after it was pressed is a new mistake, so no attempt starts later than RESEND_WINDOW_MS after
 * the press. A multi-minute outage still ends in the notice, which is the honest ending.
 */
export const RESEND_DELAYS_MS = [400, 1000, 2000] as const;
export const RESEND_WINDOW_MS = 4000;

/**
 * HOW LONG ONE ATTEMPT MAY TAKE before it is abandoned, and why the window above is not enough.
 *
 * The window stops attempts from STARTING late; it did nothing about one already in flight.
 * Measured (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6): a Take whose request was held 6 s in the
 * browser, as a slow uplink or a queue in front of the database would hold it, committed after
 * the Out pressed 1.5 s behind it. Air ended with the graphic up while the operator's page said
 * nothing was on air, and nobody was told.
 *
 * So each attempt is abandoned - its request cancelled, its answer ignored - 1.5 s after it
 * starts, and never later than the window's end. The number: a healthy send answers in 68 ms
 * (p95 227 ms, slowest seen 242 ms), so 1.5 s is six times the slowest healthy answer and leaves
 * room for a phone on a poor link, where a tighter cut would abandon sends that were landing and
 * tell the operator they had not. It is half the database's own `anon` statement timeout (3 s;
 * 8 s signed in), which is what used to end a hung attempt. And it spaces the attempts so that
 * a hung send makes two inside the window (0-1.5 s, 1.9-3.4 s), with the resend starting after
 * a correction pressed as quickly as the one measured, which then stops it (`stillNewest`).
 * An abandoned attempt counts as unanswered: it is sent again inside the window, or ends in the
 * notice.
 *
 * WHAT THIS CANNOT DO: an attempt whose request already reached the server can still commit
 * after it was abandoned, because cancelling a request on this side does not roll anything back
 * over there (PostgREST's own queue for a database connection included). A double commit still
 * airs once (the minted id, commandRoads.ts); a late commit is closed only by a server-side
 * check, the per-graphic revision compare of Phase 6 Step 2.
 */
export const ATTEMPT_TIMEOUT_MS = 1500;

/** The least time left in the window that a resend is started with: the slowest healthy answer
 *  measured (242 ms). An attempt with less would be cancelled before it could be answered, while
 *  its request might still reach the server and commit late. */
export const MIN_ATTEMPT_MS = 250;

/**
 * A PRESS SENT UNTIL IT LANDS (#2655, docs/work-specs/live-publishing/evidence/fix-2655.md R1, R2).
 *
 * The window above gave up 4 s after the press. On hosted staging's slow spells (p95 39 s) that
 * lost Takes: 8 of 163, 4 of 233, 19 of 51 with five people. A press the numbered road can take
 * twice without airing twice (seqSend.ts `heldPress`, R4's proof) is instead sent again with no
 * end, until an answer, its own row heard back, a later press that replaces its graphic, All out,
 * or the operator's Stop sending. Its first HELD_SHORT_ATTEMPTS attempts are cut at
 * ATTEMPT_TIMEOUT_MS as before; every later one at HELD_ATTEMPT_MS, the signed-in statement
 * timeout, and they start RESEND_EVERY_MS apart, so a slow spell gets at most one new copy of it
 * per 12 s: a copy the page abandons still waits in the server's queue (R8).
 */
export const HELD_SHORT_ATTEMPTS = 4;
export const HELD_ATTEMPT_MS = 8000;
export const RESEND_EVERY_MS = 4000;

/** What the operator reads when the server did not answer, in place of the server's own words. */
export const UNANSWERED = 'the server did not answer';

/** An Error for a send the server did not answer, carrying the plain sentence. */
export function unansweredError(): Error {
  return Object.assign(new Error(UNANSWERED), { unanswered: true });
}

/** The words a press ends with when the operator stopped sending it, or pressed All out (R6, R7a). */
export const STOPPED = 'sending stopped';

/** An Error for a press the operator stopped: unanswered as far as anyone knows, so it is owed and a
 *  copy already on its way that lands is still recognised (`heard`). Never sent again. */
export function stoppedError(): Error {
  return Object.assign(new Error(STOPPED), { unanswered: true, stopped: true });
}

export function isStopped(e: unknown): boolean {
  return (e as { stopped?: unknown } | null)?.stopped === true;
}

/** An Error for a held press whose outcome is unknown (R6a): a copy may have landed or may still
 *  land, so it is owed like an unanswered send, but it is not sent again. */
export function maybeLandedError(message: string): Error {
  return Object.assign(new Error(message), { unread: true, maybeLanded: true });
}

export function isMaybeLanded(e: unknown): boolean {
  return (e as { maybeLanded?: unknown } | null)?.maybeLanded === true;
}

export function isUnanswered(e: unknown): boolean {
  return (e as { unanswered?: unknown } | null)?.unanswered === true;
}

/** Whether a failed send may still commit: nobody answered it, or its answer was never read
 *  (seqSend.ts `unread`). Its row heard later is then a landing. */
export function isUncertain(e: unknown): boolean {
  return isUnanswered(e) || (e as { unread?: unknown } | null)?.unread === true;
}

/** Whether an RPC's answer means the server did not answer it: status 0 is no response at all. */
export function unansweredStatus(status: number, code?: string): boolean {
  return status === 0 || status >= 502 || code === '57014';
}

/** Who asks a protocol-2 resolve: a page that SENDS (an operator's), or one that only follows (a
 *  renderer's), which gives up on the new road after `timeoutsBeforeAbsent` statement timeouts. */
export type SeqRoadAsker = { sends: true } | { sends: false; timeoutsBeforeAbsent: number };

/** Refusals in a row (`isRefusal`) before a page that sends gives up on the new road: several of
 *  the resolve's backoffs, so a blip passes and a lasting fault still leaves the page working. */
export const REFUSALS_BEFORE_ABSENT = 5;

/** An answered error that counts toward giving up on the new road: not one nobody answered, and not
 *  a sign-in that lapsed (401: the client refreshes it), which says nothing about the server. */
export function isRefusal(status: number, code?: string): boolean {
  return !unansweredStatus(status, code) && status !== 401;
}

/**
 * WHAT ONE FAILED PROTOCOL-2 RESOLVE DECIDES (hostedControl.ts `askSeqRoad`): `absent` puts the
 * page on today's road, by row id, for the rest of its life; `ask-again` decides nothing.
 *
 * Today's road has no per-graphic order: a press abandoned on its way that commits late airs over
 * a later Take, so a page there shows it (`UnorderedSends`) and sends nothing on its own, and no
 * press goes that way before this verdict (hostedControl.ts `roadDecided`). A page
 * that sends goes there at once only on PostgREST's "no such function", and otherwise only after
 * REFUSALS_BEFORE_ABSENT refusals in a row; one transient 500 used to cost it its order for good,
 * without a word (#1697). Never once the road has answered: a page that sends does not change
 * protocol mid-session. A page that only follows loses no order on today's road, so any answer
 * decides there, as do its timeouts (its rule from before #1697, unchanged).
 */
export function seqRoadVerdict(
  status: number,
  code: string | undefined,
  inRow: { timeouts: number; refusals: number },
  asker: SeqRoadAsker,
  answeredBefore: boolean,
): 'absent' | 'ask-again' {
  if (asker.sends) {
    if (answeredBefore) return 'ask-again';
    if (code === 'PGRST202') return 'absent';
    return isRefusal(status, code) && inRow.refusals >= REFUSALS_BEFORE_ABSENT ? 'absent' : 'ask-again';
  }
  if (code === '57014') return inRow.timeouts >= asker.timeoutsBeforeAbsent ? 'absent' : 'ask-again';
  return unansweredStatus(status, code) ? 'ask-again' : 'absent';
}

/**
 * The Error a control RPC's failure is thrown as. A server that did not answer says so in its own
 * words - a gateway's HTML page, PostgREST's schema-cache notice - none of which an operator can
 * act on, so those become UNANSWERED and the console keeps the original. A refusal keeps its
 * message, which is the server's answer.
 */
export function rpcFailure(rpc: string, error: { message: string; code?: string }, status: number): Error {
  if (!unansweredStatus(status, error.code)) return new Error(error.message);
  console.warn(`[control] ${rpc}: ${status} ${error.code ?? ''} ${error.message.slice(0, 200)}`);
  return unansweredError();
}

/**
 * Send, and send again on the schedule above while the server does not answer, the window is
 * open, and no NEWER send has gone out for the same graphics. That last rule keeps order: a Take
 * still being retried when the operator presses Out on its graphic stops trying, because landing
 * after the Out would put the graphic back on air. Each attempt is abandoned at its own deadline
 * (ATTEMPT_TIMEOUT_MS, and never past the window), and `send` is handed the signal that cancels
 * its request then, and the attempt's number (0 first: a later one follows an unanswered one).
 * The error thrown is the last attempt's.
 *
 * A HELD press (`held`, #2655 R2) has no window: its deadline is ignored, and after the listed
 * delays it is sent again every RESEND_EVERY_MS, its later attempts cut at HELD_ATTEMPT_MS.
 * `stop` ends any press at once, an attempt in flight or a wait between two: its reason is the
 * error thrown (`stoppedError`, or the last attempt's for a press a later one replaced).
 */
export async function sendWithResend(
  send: (signal: AbortSignal, attempt: number) => Promise<void>,
  opts: {
    /** Epoch ms after which no attempt starts or runs on: the press plus RESEND_WINDOW_MS. */
    deadline: number;
    stillNewest: () => boolean;
    /** Sent until it lands (#2655): no deadline, the long schedule above. */
    held?: boolean;
    /** Aborted: no further attempt, and the one in flight is abandoned now. */
    stop?: AbortSignal;
    /** Aborted: no further attempt, and a wait between two ends now, but the attempt in flight
     *  still gets its answer (its own row was heard: the answer says what it skipped). */
    settled?: AbortSignal;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    /** Calls `fire` after `ms` unless the returned cancel is called first. */
    timer?: (ms: number, fire: () => void) => () => void;
  },
): Promise<void> {
  const now = opts.now ?? Date.now;
  const timer = opts.timer ?? ((ms: number, fire: () => void) => {
    const id = setTimeout(fire, ms);
    return () => clearTimeout(id);
  });
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => timer(ms, resolve)));
  const stop = opts.stop;
  // A copy per press: one stop ends many presses, and each writes what it carried onto its error
  // (hostedControl.ts), so a shared reason would hand one press's ids to another.
  const stopped = (last: unknown) =>
    stop?.reason instanceof Error ? Object.assign(new Error(stop.reason.message), stop.reason) : last ?? stoppedError();
  let last: unknown = null;
  for (let attempt = 0; ; attempt += 1) {
    if (stop?.aborted) throw stopped(last);
    const ms = opts.held
      ? attempt < HELD_SHORT_ATTEMPTS ? ATTEMPT_TIMEOUT_MS : HELD_ATTEMPT_MS
      : Math.min(ATTEMPT_TIMEOUT_MS, opts.deadline - now());
    try {
      await attemptWithin((signal) => send(signal, attempt), ms, timer, stop);
      return;
    } catch (e) {
      last = e;
      if (stop?.aborted) throw stopped(e);
      const wait = RESEND_DELAYS_MS[attempt] ?? (opts.held ? RESEND_EVERY_MS : undefined);
      if (!isUnanswered(e) || wait === undefined) throw e;
      if (!opts.held && now() + wait + MIN_ATTEMPT_MS > opts.deadline) throw e;
      if (!opts.stillNewest() || opts.settled?.aborted) throw e;
      await abortable(abortable(sleep(wait), stop), opts.settled);
      if (stop?.aborted) throw stopped(e);
      if (opts.settled?.aborted) throw e;
      if (!opts.stillNewest()) throw e;
    }
  }
}

/** `wait`, or as soon as `stop` aborts, whichever is first. */
function abortable(wait: Promise<void>, stop?: AbortSignal): Promise<void> {
  if (!stop) return wait;
  return new Promise<void>((resolve) => {
    if (stop.aborted) return resolve();
    const done = () => {
      stop.removeEventListener('abort', done);
      resolve();
    };
    stop.addEventListener('abort', done);
    void wait.then(done);
  });
}

/** One attempt, abandoned after `ms` or when `stop` aborts: its request is cancelled and whatever
 *  it answers later is ignored, so a transport that never answers (or ignores the signal) still
 *  ends the attempt. */
function attemptWithin(
  send: (signal: AbortSignal) => Promise<void>,
  ms: number,
  timer: (ms: number, fire: () => void) => () => void,
  stop?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  let cancel = () => {};
  let unlisten = () => {};
  const expired = new Promise<never>((_, reject) => {
    const end = () => {
      controller.abort();
      reject(unansweredError());
    };
    cancel = timer(Math.max(0, ms), end);
    if (stop) {
      stop.addEventListener('abort', end);
      unlisten = () => stop.removeEventListener('abort', end);
    }
  });
  return Promise.race([send(controller.signal), expired]).finally(() => {
    cancel();
    unlisten();
  });
}

/**
 * WHAT A SURFACE STILL OWES THE SCREENS after sends failed, so the notice saying so comes down
 * when, and only when, every graphic it was about has since been sent and landed.
 *
 * A later send landing is not by itself the all-clear. A Take of ANOTHER graphic landing says
 * nothing about the one that failed, which is still on this monitor and on no other screen, and
 * taking the notice down then would hide exactly that. So each failure is remembered with the
 * graphics it carried, and the notices are released together once none of them is owed.
 *
 * A FAILED SEND CAN STILL LAND (ATTEMPT_TIMEOUT_MS above, WHAT THIS CANNOT DO): both attempts
 * abandoned on a slow link, and the server committed one anyway. Its row then comes back to this
 * page carrying the ids the press minted, and that settles the graphic as surely as an answer
 * would (`heard`). Seen on hosted staging (#917): without it the notice said "on this monitor
 * only" for a Take that was on air. Only the NEWEST failure of a graphic is owed by its ids, so
 * an older failed press landing late never clears a later one that is still owed.
 */
interface SendDebts {
  /** A send carrying these items failed. Each item's `msg.oid`, when it has one, is how its row
   *  is recognised if it commits after all. */
  failed(items: readonly { graphic: string; msg?: unknown }[], notice: string): void;
  /** A send carrying these items landed. Returns the notice line's next state: cleared if it
   *  still shows a failure this settled (on its own, or inside a folder's summary of its cues),
   *  and untouched while anything is still owed or once the line has moved on.
   *  A graphic whose failed send REPLACED it (a `play` or `stop`: a Take, an Out) is settled only
   *  by a landed send that replaces it too: an Update landing after a lost Take leaves the Take
   *  owed (#2655 R7). An item without its command counts as replacing. */
  landed(items: readonly { graphic: string; msg?: unknown }[]): (shown: string | null) => string | null;
  /** These commands came back from the server (a row, or its broadcast). When one is a failed
   *  send's own, its graphic is settled: the notice line's next state as `landed` returns it, or
   *  null when nothing changed. */
  heard(items: readonly { graphic: string; msg?: unknown }[]): ((shown: string | null) => string | null) | null;
  /** How many graphics are still owed: a failed send of theirs that nothing has settled yet. */
  owed(): number;
}

/** commandRoads.ts `oidOf`, restated because this file imports nothing. */
const oidIn = (msg: unknown): string | null => {
  const oid = (msg as { oid?: unknown } | null | undefined)?.oid;
  return typeof oid === 'string' && oid.length > 0 ? oid : null;
};

/** Whether this command replaces its graphic's state rather than modifying it (#2655 R7): a Take's
 *  `play` or an Out's `stop`. Restated from seqSend.ts `REPLACING`, because this file imports nothing. */
const replacing = (msg: unknown): boolean => {
  const t = (msg as { t?: unknown } | null | undefined)?.t;
  return t === 'play' || t === 'stop';
};

export function createSendDebts(): SendDebts {
  /** Per graphic, the failed sends it still owes: the ids each carried (none, when it carried none)
   *  and whether it replaced the graphic. A newer failure that replaces the graphic makes every
   *  older one moot; a newer one that only modifies it makes older modifying ones moot and keeps a
   *  replacing one (#2655 R7: an Update after a lost Take does not stand in for the Take). */
  const owed = new Map<string, { oids: Set<string>; replaced: boolean }[]>();
  let notices: string[] = [];
  const unchanged = (shown: string | null) => shown;
  const settle = () => {
    if (owed.size > 0 || notices.length === 0) return unchanged;
    const settled = notices;
    notices = [];
    return (shown: string | null) => (shown !== null && settled.some((s) => shown.includes(s)) ? null : shown);
  };
  const keep = (graphic: string, debts: { oids: Set<string>; replaced: boolean }[]) => {
    if (debts.length > 0) owed.set(graphic, debts);
    else owed.delete(graphic);
  };
  return {
    failed(items, notice) {
      const newest = new Map<string, { oids: Set<string>; replaced: boolean }>();
      for (const item of items) {
        const debt = newest.get(item.graphic) ?? { oids: new Set<string>(), replaced: false };
        const oid = oidIn(item.msg);
        if (oid) debt.oids.add(oid);
        if (replacing(item.msg)) debt.replaced = true;
        newest.set(item.graphic, debt);
      }
      for (const [graphic, debt] of newest) {
        keep(graphic, debt.replaced ? [debt] : [...(owed.get(graphic) ?? []).filter((d) => d.replaced), debt]);
      }
      notices.push(notice);
    },
    landed(items) {
      const replaces = new Set(items.filter((item) => !('msg' in item) || replacing(item.msg)).map((item) => item.graphic));
      for (const graphic of new Set(items.map((item) => item.graphic))) {
        keep(graphic, replaces.has(graphic) ? [] : (owed.get(graphic) ?? []).filter((d) => d.replaced));
      }
      return settle();
    },
    heard(items) {
      let any = false;
      for (const item of items) {
        const oid = oidIn(item.msg);
        const debts = owed.get(item.graphic);
        if (!oid || !debts) continue;
        const left = debts.filter((d) => !d.oids.has(oid));
        if (left.length === debts.length) continue;
        keep(item.graphic, left);
        any = true;
      }
      return any ? settle() : null;
    },
    owed: () => owed.size,
  };
}

/** Why a bound press call did not land (#2617, productionDataApi.ts `adjustProductionDataBySlug`).
 *  `retry`: nothing was recorded, send it again. `refused`: the server answered no to the whole
 *  call. `missing`: a database without migration 0125. */
export type BoundPressFailure = Error & { press: 'retry' | 'refused' | 'missing' };

/** Errors the server answers when the call wrote nothing and may simply be sent again: a statement,
 *  lock or connection timeout, the command budget, a serialization retry. */
const RESEND_CODES = new Set(['57014', '55P03', '23514', '40001', '40P01', '53300', '08006', '08001', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);

export function boundPressFailure(error: { message: string; code?: string } | null, status: number): BoundPressFailure {
  const code = error?.code;
  // By code first: PostgREST answers a refusal (42501) with 401 to a signed-out caller, so a 401
  // goes again only for a lapsed sign-in, which the client refreshes. A gateway's timeout (408) or
  // rate limit (429) recorded nothing, so it goes again too.
  const press: BoundPressFailure['press'] =
    code === 'PGRST202' ? 'missing'
    : code !== undefined && RESEND_CODES.has(code) ? 'retry'
    : code === '42501' || code === '22023' || code === 'P0001' ? 'refused'
    : status === 0 || status >= 500 || status === 401 || status === 408 || status === 429 ? 'retry'
    : 'refused';
  return Object.assign(new Error(error?.message ?? `Request failed (${status})`), { press });
}

