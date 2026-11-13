// THE api/ ROUTES ON `vite preview`, the same handlers the dev server mounts.
//
// The dev plugins (aiDevPlugin, renderDevPlugin, eventsDevPlugin, meDevPlugin, dataDevPlugin) mount
// the REAL api/ handlers and load them with the dev server's `ssrLoadModule`, so the offline
// browser suite talks to the same code production runs. A preview server serves a built app and has
// no module loader of its own, so a suite run against the e2e build (`npm run build:e2e`) would meet
// a 404 on every /api route. This gives each plugin the three things it uses from a dev server -
// `middlewares`, `config` and `ssrLoadModule` - on a preview server. The loader is ONE middleware-mode
// Vite server per preview server, made on the first api request and closed with the preview.
// `configFile: false` keeps the app's plugins out of it: it only transforms api/ modules, and the
// app's own plugins would reserve a dev port and mount these routes a second time.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hosts = new WeakMap();

/** @param {import('vite').PreviewServer} preview */
export function previewApiHost(preview) {
  let host = hosts.get(preview);
  if (host) return host;
  /** @type {Promise<import('vite').ViteDevServer> | null} */
  let loader = null;
  const load = () => {
    loader ??= import('vite').then(({ createServer }) => createServer({
      root: repoRoot,
      configFile: false,
      appType: 'custom',
      logLevel: 'error',
      server: { middlewareMode: true, hmr: false, watch: null },
    }));
    return loader;
  };
  preview.httpServer.once('close', () => { if (loader) void loader.then((server) => server.close()); });
  host = {
    middlewares: preview.middlewares,
    config: preview.config,
    /** @param {string} id */
    ssrLoadModule: async (id) => (await load()).ssrLoadModule(id),
  };
  hosts.set(preview, host);
  return host;
}
