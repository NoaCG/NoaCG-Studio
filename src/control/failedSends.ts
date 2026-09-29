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
 * after the Out would put the graphic back on air. The error thrown is the last attempt's.
 */
export async function sendWithResend(
  send: () => Promise<void>,
  opts: {
    /** Epoch ms after which no attempt starts: the press plus RESEND_WINDOW_MS. */
    deadline: number;
    stillNewest: () => boolean;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      await send();
      return;
    } catch (e) {
      const wait = RESEND_DELAYS_MS[attempt];
      if (!isUnanswered(e) || wait === undefined || now() + wait > opts.deadline) throw e;
      await sleep(wait);
      if (!opts.stillNewest()) throw e;
    }
  }
}

/**
 * WHAT A SURFACE STILL OWES THE SCREENS after sends failed, so the notice saying so comes down
 * when, and only when, every graphic it was about has since been sent and landed.
 *
 * A later send landing is not by itself the all-clear. A Take of ANOTHER graphic landing says
 * nothing about the one that failed, which is still on this monitor and on no other screen, and
 * taking the notice down then would hide exactly that. So each failure is remembered with the
 * graphics it carried, and the notices are released together once none of them is owed.
 */
interface SendDebts {
  failed(items: readonly { graphic: string }[], notice: string): void;
  /** A send carrying these items landed. Returns the notice line's next state: cleared if it
   *  still shows a failure this settled (on its own, or inside a folder's summary of its cues),
   *  and untouched while anything is still owed or once the line has moved on. */
  landed(items: readonly { graphic: string }[]): (shown: string | null) => string | null;
}

export function createSendDebts(): SendDebts {
  const owed = new Set<string>();
  let notices: string[] = [];
  const unchanged = (shown: string | null) => shown;
  return {
    failed(items, notice) {
      for (const item of items) owed.add(item.graphic);
      notices.push(notice);
    },
    landed(items) {
      for (const item of items) owed.delete(item.graphic);
      if (owed.size > 0 || notices.length === 0) return unchanged;
      const settled = notices;
      notices = [];
      return (shown) => (shown !== null && settled.some((s) => shown.includes(s)) ? null : shown);
    },
  };
}
