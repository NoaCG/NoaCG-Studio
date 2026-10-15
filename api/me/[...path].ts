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
// key is minted through a one-time code), `graphics` is the save door a key opens,
// `graphic-sets` the same for several graphics as one idempotent operation (§10),
// `packages` its whole-package sibling (a package waits on Home for Install), `deliveries` reads
// back what a key delivered and settles a package on Install (docs/AGENT_SAVE.md §9), and
// `community-packs` sends a pack for review to Community packs when the user asks - all six
// resolve a principal through api/_lib/principal.ts and refuse an anonymous caller. They live
// here because they are things a visitor does ABOUT THEMSELVES, and because this catch-all is
// where they cost no function slot.
//
// The REMOTE MCP CONNECTOR (docs/REMOTE_MCP_PLAN.md) lives here for the same reason: `/mcp` and
// `/.well-known/oauth-protected-resource/mcp` are vercel.json rewrites onto `mcp` and
// `oauth-protected-resource`, and `connectors` is the consent page's and Settings' side of it. A
// rewritten request may arrive under its public path or its destination, so both name the route.

import { apiError } from '../_lib/http.js';
import entitlement from '../_lib/me/entitlement.js';
import feedback from '../_lib/me/feedback.js';
import agentKeys from '../_lib/me/agentKeys.js';
import graphics from '../_lib/me/graphics.js';
import packages from '../_lib/me/packages.js';
import communityPacks from '../_lib/me/communityPacks.js';
import deliveries from '../_lib/me/deliveries.js';
import graphicSets from '../_lib/me/graphicSets.js';
import mcp, { MCP_PATH, PROTECTED_RESOURCE_PATH, protectedResource } from '../_lib/me/mcp.js';
import connectors from '../_lib/me/connectors.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  entitlement,
  feedback,
  'agent-keys': agentKeys,
  graphics,
  packages,
  'community-packs': communityPacks,
  deliveries,
  'graphic-sets': graphicSets,
  mcp,
  'oauth-protected-resource': protectedResource,
  connectors,
};

/** The public paths vercel.json rewrites into this function, by the route that serves them. */
const PUBLIC_PATHS: Record<string, string> = {
  [MCP_PATH]: 'mcp',
  [PROTECTED_RESOURCE_PATH]: 'oauth-protected-resource',
};

/** The route a request names: a public connector path, or the one segment under /api/me. */
function routeOf(pathname: string): string {
  return PUBLIC_PATHS[pathname] ?? pathname.replace(/^\/api\/me\/?/, '').split('/')[0];
}

export default {
  async fetch(req: Request): Promise<Response> {
    const handler = ROUTES[routeOf(new URL(req.url).pathname)];
    return handler ? handler.fetch(req) : apiError('not_found', 'Not found', 404);
  },
};
