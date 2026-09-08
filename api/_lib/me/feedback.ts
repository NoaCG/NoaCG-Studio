// POST /api/me/feedback - the one place a user can tell us something in their own words.
//
// It answers `{ recorded: true }` to every well-formed request AND to every dropped one, which
// is the same discipline api/events.ts applies for a stricter reason here. Two of them:
//
//   1. A person who just told us their graphic was unusable must not then be shown an error.
//      The whole flow is optional and one click deep; a failure surfacing in it converts a
//      person willing to help into a person who will not bother again.
//   2. A response that distinguished "stored" from "dropped" would be an oracle for which
//      generation ids exist, since the store checks ownership before attaching context. The
//      Lite judge endpoint answers identically for a missing record and someone else's record
//      for exactly this reason (src/ai/AGENTS.md).
//
// AUTH IS OPTIONAL, and this is the route where that matters most. The editor has no login wall
// (`root/keep-studio-open-there-login-wall`) and on this instance 114 browsers have visited
// against six
// accounts - a feedback channel only signed-in users could reach would be a channel almost
// nobody reaches. The account, when there is one, comes from the TOKEN and never from the body:
// a caller cannot file feedback as somebody else.

import { bearerToken, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { checkFeedbackRateLimit } from '../rateLimit.js';
import { feedbackRow, recordFeedback } from '../feedbackStore.js';
import type { FeedbackResponse } from '../../../src/feedback/contract.js';

/** Comfortably above a 2000-character message plus its enumerated fields, and small enough that
 *  the route can never become an upload path. */
const MAX_BODY_BYTES = 8_000;

const recorded = (): Response => json({ recorded: true } satisfies FeedbackResponse);

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;
    // Pre-body, like every other burst gate here: refuse a hammering client before parsing.
    if (checkFeedbackRateLimit(req)) return recorded();

    let body: unknown;
    try {
      body = await readJson<unknown>(req, MAX_BODY_BYTES);
    } catch {
      return recorded();
    }

    const row = feedbackRow(body);
    if (!row) return recorded();

    const user = await verifyUser(bearerToken(req));
    // Awaited so a serverless instance cannot be frozen before the write lands, and unable to
    // fail the request either way - recordFeedback swallows and logs.
    await recordFeedback(row, user?.userId ?? null);
    return recorded();
  },
};
