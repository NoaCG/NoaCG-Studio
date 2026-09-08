// THE CALLER'S OWN SURFACE - one serverless function for everything a visitor may ask or tell
// us about themselves.
//
// Vercel counts a function per routed FILE and the deployment cap is twelve (docs/ADMIN.md §4),
// which this project has already hit once - api/ reached 29 files and production silently
// stopped deploying for four days. So this is the same catch-all shape every other area uses:
// the handlers live in api/_lib/me/, which is not routed and therefore free, and adding
// /api/me/feedback costs no slot at all. `entitlement` behaves exactly as before - same path,
// same method, same body.
//
// The dispatch table is CLOSED, and it is a lookup rather than a dynamic import: a segment from
// the URL must never reach a module specifier.
//
// AUTH IS OPTIONAL ON THE FIRST TWO ROUTES, and that is the point of grouping them. The editor
// has no login wall (`root/keep-studio-open-there-login-wall`), so "what may I do" and "here is
// what I
// think of it" both have to answer for someone who never signs in. Each handler decides what an
// anonymous caller gets; neither refuses one.
//
// The AGENT ACCESS routes (docs/AGENT_SAVE.md) are the exception, by their nature: `agent-keys`
// mints / lists / revokes the scoped keys a coding agent's CLI holds (a session consents; the
// key is minted through a one-time code), and `graphics` is the save door a key opens - both
// resolve a principal through api/_lib/principal.ts and refuse an anonymous caller. Both live
// here because they are things a visitor does ABOUT THEMSELVES, and because this catch-all is
// where they cost no function slot.

import { apiError } from '../_lib/http.js';
import entitlement from '../_lib/me/entitlement.js';
import feedback from '../_lib/me/feedback.js';
import agentKeys from '../_lib/me/agentKeys.js';
import graphics from '../_lib/me/graphics.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  entitlement,
  feedback,
  'agent-keys': agentKeys,
  graphics,
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/me\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'Not found', 404);
  },
};
