// The light /api/ai routes in one function (see docs/DEPLOYMENT.md for the function budget).
//
// api/ai/generate.ts stays a FUNCTION OF ITS OWN and is deliberately absent from this table:
// it carries maxDuration 300 and reads bodies up to 12 MB, and folding it in here would give
// every cheap config/models call the same heavy configuration.

import { apiError } from '../_lib/http.js';
import config from '../_lib/aiRoutes/config.js';
import consent from '../_lib/aiRoutes/consent.js';
import credentials from '../_lib/aiRoutes/credentials.js';
import models from '../_lib/aiRoutes/models.js';
import { PRO_ROUTES } from '../_lib/pro/router.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

// Hosted Pro's three paths join this table as SINGLE SEGMENTS (`pro-status`, …) rather than as
// a nested `pro/` router. A `[...path].ts` function here routes exactly one segment - measured
// on production, see api/_lib/pro/router.ts - so `/api/ai/pro/status` never reaches any code at
// all. Nesting would cost a FUNCTION, and two spare against the Hobby cap is not headroom.
const ROUTES: Record<string, Handler> = { config, consent, credentials, models, ...PRO_ROUTES };

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'No such route.', 404);
  },
};
