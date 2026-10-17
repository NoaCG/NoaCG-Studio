// Vite dev middleware for the real server-side AI gateway. Browser code always calls the
// same /api/ai routes in development and production; provider keys remain server-only.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFunctionTable, resolveApiRoute } from './apiRouteTable.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {import('vite').Plugin} */
export function aiApiPlugin() {
  // Read once at server start, like the tree it describes: adding a function under api/ is a
  // file the dev server has to restart to load anyway.
  const table = apiFunctionTable(repoRoot, 'api/ai');
  return {
    name: 'noacg-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', (req, res) => {
        void handle(server, table, req, res);
      });
    },
  };
}

// ── THERE IS NO ROUTE LIST HERE ANY MORE ─────────────────────────────────────────────────
//
// There was, and it hid a whole surface three times: the imported-graphic-analysis task shipped
// without its entries; hosted Pro was a dev 404 in every dev server and the entire e2e suite
// while production served it, so `loadProStatus` read "this deployment has no Pro" and the door
// never appeared; and `/api/ai/consent` has never been routed in development at all. A list
// somebody keeps in step is a second copy of the real table, and a second copy is how one of
// them quietly stops being served - which is the reasoning `meDevPlugin`
// already record. They can forward everything blindly because each mounts ONE function; api/ai
// mounts four, so the choice is DERIVED from the tree instead (scripts/apiRouteTable.mjs).
//
// An unknown NAME is therefore answered by the real dispatcher in its own vocabulary - Lite's
// LiteError, Pro's ProErrorBody, the light routes' apiError - exactly as in production, instead
// of by a bare shape the browser client has never seen. An unroutable DEPTH is refused here,
// because the platform refuses it before any code runs and a dev server that served it would be
// hiding the defect `npm run check:api-route-depth` exists to catch.

/** What the platform returns for a path it never routes. Vercel's own NOT_FOUND is an HTML page
 *  a dev server cannot reproduce; what matters is that it is a 404 and never a handler. */
function unrouted(res, route) {
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    error: {
      code: 'not_found',
      message: `no api/ai function routes ${route} - the deployment routes ONE segment past a `
        + '[...path] function (npm run check:api-route-depth)',
    },
  }));
}

async function handle(server, table, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');
    const target = resolveApiRoute(table, route);
    if (!target) {
      unrouted(res, route);
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host ?? 'localhost'}/api/ai/${route}${query ? '?' + query : ''}`;
    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        ]),
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    });

    const mod = await server.ssrLoadModule(target);
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    server.config.logger.error(`[ai-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'AI gateway error.' } }));
  }
}
