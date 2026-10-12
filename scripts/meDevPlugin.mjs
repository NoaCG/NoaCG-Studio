// Vite dev middleware for /api/me - what the caller may do, and what the caller thinks of it.
//
// Same shape as aiDevPlugin/adminDevPlugin: the browser calls the same route in development
// and production, and the REAL handler runs in both, so the degrade-to-defaults path and the
// always-204-shaped feedback answer are exercised locally rather than assumed.
//
// There is deliberately NO route list here. The catch-all owns the closed dispatch table, and
// a second copy in the dev server would be a second thing to keep in step - which is how a
// route ends up reachable in one environment and missing in the other. The same reasoning
// adminDevPlugin already records.
//
// The same goes for the PUBLIC paths vercel.json rewrites into this function (the remote MCP
// connector's `/mcp` and its protected resource metadata): they are read from vercel.json's own
// `rewrites`, so a path is served here exactly when production rewrites it. The request reaches
// the handler under its public path, and the catch-all names the route from either form.

import { readFileSync } from 'node:fs';

/** Literal rewrite sources whose destination is this function. */
export function meRewriteSources(vercelJson) {
  return (vercelJson.rewrites ?? [])
    .filter((r) => typeof r.destination === 'string' && r.destination.startsWith('/api/me/') && !/[:(*]/.test(r.source))
    .map((r) => r.source);
}

/** @returns {import('vite').Plugin} */
export function meApiPlugin() {
  return {
    name: 'noacg-me-api',
    configureServer(server) {
      const rewritten = new Set(meRewriteSources(JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))));
      server.middlewares.use((req, res, next) => {
        if (!rewritten.has((req.url ?? '/').split('?')[0])) return next();
        void handle(server, req, res);
      });
      server.middlewares.use('/api/me', (req, res) => {
        void handle(server, req, res);
      });
    },
  };
}

async function handle(server, req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    // connect strips a mount path from req.url; originalUrl is the request as it arrived.
    const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`;
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

    const mod = await server.ssrLoadModule('/api/me/[...path].ts');
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // The entitlement client treats any non-2xx as "use the defaults", so a dev-time fault
    // degrades the same way production would rather than blanking the catalog.
    server.config.logger.error(`[me-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'Request failed.' } }));
  }
}
