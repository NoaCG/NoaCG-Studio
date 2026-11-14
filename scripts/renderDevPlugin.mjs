// Vite dev plugin: mounts the REAL api/render handlers on the dev server, so the full
// render loop (UI -> handlers -> local Remotion render -> download) runs offline with no
// Vercel. Handlers are fetch-style (Request -> Response) and are loaded through
// ssrLoadModule — same modules Vercel deploys, TS + HMR for free.

import { previewApiHost } from './previewApiHost.mjs';

/** @returns {import('vite').Plugin} */
export function renderApiPlugin() {
  const plugin = {
    name: 'noacg-render-api',
    configureServer(server) {
      server.middlewares.use('/api/render', (req, res) => {
        void handle(server, req, res);
      });
    },
    // The same routes on `vite preview`, for the e2e build (scripts/previewApiHost.mjs).
    configurePreviewServer(preview) {
      plugin.configureServer(previewApiHost(preview));
    },
  };
  return plugin;
}

const ROUTES = new Set(['start', 'status', 'cancel', 'complete', 'cleanup', 'file']);

async function handle(server, req, res) {
  try {
    // The mount strips the prefix: '/start?x' -> route 'start'.
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');
    if (!ROUTES.has(route)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'not_found', message: `no route ${route}` } }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const url = `http://${req.headers.host ?? 'localhost'}/api/render/${route}${query ? '?' + query : ''}`;
    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]),
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    });

    // start and cleanup are their own functions in production; the rest share one
    // catch-all. Resolve the SAME way here so dev exercises the real dispatcher.
    const standalone = route === 'start' || route === 'cleanup';
    const mod = await server.ssrLoadModule(
      standalone ? `/api/render/${route}.ts` : '/api/render/[...path].ts',
    );
    const response = await mod.default.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const out = Buffer.from(await response.arrayBuffer());
    res.end(out);
  } catch (err) {
    server.config.logger.error(`[render-api] ${err instanceof Error ? err.stack : err}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'render api error (see dev server log)' } }));
  }
}
