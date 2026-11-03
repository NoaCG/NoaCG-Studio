// The imported-graphic-analysis task's one serverless function (see docs/DEPLOYMENT.md).
//
// Every path is a SINGLE SEGMENT under this prefix - `import-analysis`,
// `import-analysis-status`, `import-analysis-outcome`, `svg-interpretation` - and that is a platform constraint,
// not a naming style. Measured on production 2026-08-14: a `[...path].ts` function under api/
// routes exactly ONE segment. `/api/ai/tasks/import-analysis` reached this table and answered
// the app's own 405; `/api/ai/tasks/import-analysis/status` never reached any code at all and
// got the platform's `NOT_FOUND`. The full reasoning, and why the segment moves into the name
// instead of the area gaining another function, is in api/_lib/pro/router.ts - a nested path
// costs a FUNCTION against the Hobby cap of 12, and there are two spare.
//
// The dispatch key is therefore the FIRST segment after the prefix, never a joined path:
// anything deeper is a platform 404 that this code never sees, so treating it as a lookup key
// would only describe a route that does not exist. `scripts/check-api-route-depth.mjs` is the
// gate that keeps the browser client's URLs at this depth.

import { liteError } from '../../_lib/aiLiteHttp.js';
import analyze from '../../_lib/importAnalysis/analyze.js';
import outcome from '../../_lib/importAnalysis/outcome.js';
import status from '../../_lib/importAnalysis/status.js';
// Off until a qualified verdict: it refuses before reading anything (its file says why).
import svgInterpretation from '../../_lib/svgInterpretation/analyze.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  'import-analysis': analyze,
  'import-analysis-status': status,
  'import-analysis-outcome': outcome,
  'svg-interpretation': svgInterpretation,
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/tasks\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : liteError('invalid_request', 'No such task route.', 404);
  },
};
