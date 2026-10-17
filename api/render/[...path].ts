// The light /api/render routes in one function (see docs/DEPLOYMENT.md for the function budget).
//
// start.ts and cleanup.ts stay FUNCTIONS OF THEIR OWN and are deliberately absent here.
// start carries maxDuration 300 AND includeFiles for the Remotion bundle; merging it in would
// ship that bundle to every status poll and pay its cold start on each one. cleanup is the
// cron target, also at 300.

import { apiError } from '../_lib/http.js';
import cancel from '../_lib/renderRoutes/cancel.js';
import complete from '../_lib/renderRoutes/complete.js';
import file from '../_lib/renderRoutes/file.js';
import status from '../_lib/renderRoutes/status.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = { cancel, complete, file, status };

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/render\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'No such route.', 404);
  },
};
