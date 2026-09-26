// Vite dev middleware for /api/data - the Production Data API (docs/DATA_API.md).
//
// Same shape as meDevPlugin: the integrator's route exists in development exactly as in
// production, the REAL handler runs in both, and there is deliberately NO route list here -
// the catch-all owns the closed dispatch table. This is also what lets a broadcaster demo loop
// (scripts/data-api-demo.mjs) be rehearsed against a local dev server carrying a real .env
// before a deploy exists, and what the offline e2e spec drives to pin the refusal shapes.

/** @returns {import('vite').Plugin} */
export function dataApiPlugin() {
  return {
    name: 'noacg-data-api',
    configureServer(server) {
      server.middlewares.use('/api/data', (req, res) => {
        void handle(server, req, res);
      });
    },
  };
}

async function handle(server, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host ?? 'localhost'}/api/data/${route}${query ? '?' + query : ''}`;
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

    const mod = await server.ssrLoadModule('/api/data/[...path].ts');
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    server.config.logger.error(`[data-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'Request failed.' } }));
  }
}
