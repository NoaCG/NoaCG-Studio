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

/** What the operator reads when the server did not answer, in place of the server's own words. */
export const UNANSWERED = 'the server did not answer';

/** An Error for a send the server did not answer, carrying the plain sentence. */
export function unansweredError(): Error {
  return Object.assign(new Error(UNANSWERED), { unanswered: true });
}

export function isUnanswered(e: unknown): boolean {
  return (e as { unanswered?: unknown } | null)?.unanswered === true;
}

/** Whether an RPC's answer means the server did not answer it: status 0 is no response at all. */
export function unansweredStatus(status: number, code?: string): boolean {
  return status === 0 || status >= 502 || code === '57014';
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
 * its request then. The error thrown is the last attempt's.
 */
export async function sendWithResend(
  send: (signal: AbortSignal) => Promise<void>,
  opts: {
    /** Epoch ms after which no attempt starts or runs on: the press plus RESEND_WINDOW_MS. */
    deadline: number;
    stillNewest: () => boolean;
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
  for (let attempt = 0; ; attempt += 1) {
    try {
      await attemptWithin(send, Math.min(ATTEMPT_TIMEOUT_MS, opts.deadline - now()), timer);
      return;
    } catch (e) {
      const wait = RESEND_DELAYS_MS[attempt];
      if (!isUnanswered(e) || wait === undefined || now() + wait + MIN_ATTEMPT_MS > opts.deadline) throw e;
      await sleep(wait);
      if (!opts.stillNewest()) throw e;
    }
  }
}

/** One attempt, abandoned after `ms`: its request is cancelled and whatever it answers later is
 *  ignored, so a transport that never answers (or ignores the signal) still ends the attempt. */
function attemptWithin(
  send: (signal: AbortSignal) => Promise<void>,
  ms: number,
  timer: (ms: number, fire: () => void) => () => void,
): Promise<void> {
  const controller = new AbortController();
  let cancel = () => {};
  const expired = new Promise<never>((_, reject) => {
    cancel = timer(Math.max(0, ms), () => {
      controller.abort();
      reject(unansweredError());
    });
  });
  return Promise.race([send(controller.signal), expired]).finally(cancel);
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
   *  and untouched while anything is still owed or once the line has moved on. */
  landed(items: readonly { graphic: string }[]): (shown: string | null) => string | null;
  /** These commands came back from the server (a row, or its broadcast). When one is a failed
   *  send's own, its graphic is settled: the notice line's next state as `landed` returns it, or
   *  null when nothing changed. */
  heard(items: readonly { graphic: string; msg?: unknown }[]): ((shown: string | null) => string | null) | null;
}

/** commandRoads.ts `oidOf`, restated because this file imports nothing. */
const oidIn = (msg: unknown): string | null => {
  const oid = (msg as { oid?: unknown } | null | undefined)?.oid;
  return typeof oid === 'string' && oid.length > 0 ? oid : null;
};

export function createSendDebts(): SendDebts {
  /** Per graphic owed, the ids its newest failed send carried (none, when it carried none). */
  const owed = new Map<string, Set<string>>();
  let notices: string[] = [];
  const unchanged = (shown: string | null) => shown;
  const settle = () => {
    if (owed.size > 0 || notices.length === 0) return unchanged;
    const settled = notices;
    notices = [];
    return (shown: string | null) => (shown !== null && settled.some((s) => shown.includes(s)) ? null : shown);
  };
  return {
    failed(items, notice) {
      const newest = new Map<string, Set<string>>();
      for (const item of items) {
        const oids = newest.get(item.graphic) ?? new Set<string>();
        const oid = oidIn(item.msg);
        if (oid) oids.add(oid);
        newest.set(item.graphic, oids);
      }
      for (const [graphic, oids] of newest) owed.set(graphic, oids);
      notices.push(notice);
    },
    landed(items) {
      for (const item of items) owed.delete(item.graphic);
      return settle();
    },
    heard(items) {
      let any = false;
      for (const item of items) {
        const oid = oidIn(item.msg);
        if (oid && owed.get(item.graphic)?.has(oid)) {
          owed.delete(item.graphic);
          any = true;
        }
      }
      return any ? settle() : null;
    },
  };
}
