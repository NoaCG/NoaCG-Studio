// NoaCG Lite's one serverless function (see docs/DEPLOYMENT.md for the function budget).
//
// The handlers live in api/_lib/lite/, which is not routed and so costs nothing against the
// deployment's function cap. Paths, methods and bodies are unchanged.
//
// The table is CLOSED and the unknown-path answer is the Lite vocabulary's own 404, not a bare
// one: this endpoint is reached by the browser client, which expects a LiteError shape.

import { liteError } from '../../_lib/aiLiteHttp.js';
import generations from '../../_lib/lite/generations.js';
import judge from '../../_lib/lite/judge.js';
import outcome from '../../_lib/lite/outcome.js';
import status from '../../_lib/lite/status.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = { generations, judge, outcome, status };

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/lite\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : liteError('invalid_request', 'No such Lite route.', 404);
  },
};
