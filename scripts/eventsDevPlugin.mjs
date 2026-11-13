// Vite dev middleware for POST /api/events (docs/FUNNEL_EVENTS.md), so the funnel route
// behaves in development and self-hosting exactly as it does on Vercel: same handler, same
// validation, same 204. Without it the browser's reports 404 locally, and a client change
// could only ever be checked against production.

import { previewApiHost } from './previewApiHost.mjs';

/** @returns {import('vite').Plugin} */
export function eventsApiPlugin() {
  const plugin = {
    name: 'noacg-events-api',
    configureServer(server) {
      server.middlewares.use('/api/events', (req, res) => {
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

async function handle(server, req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://${req.headers.host ?? 'localhost'}/api/events`, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        ]),
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    });

    const mod = await server.ssrLoadModule('/api/events.ts');
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer.byteLength ? buffer : undefined);
  } catch (error) {
    server.config.logger.error(`[events-api] ${error instanceof Error ? error.stack : error}`);
    // Still 204: the funnel must never surface as an error in a user's console, and that
    // contract should hold in development too, where a handler bug is most likely.
    res.statusCode = 204;
    res.end();
  }
}
