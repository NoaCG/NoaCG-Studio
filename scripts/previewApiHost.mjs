// THE api/ ROUTES ON `vite preview`, the same handlers the dev server mounts.
//
// The dev plugins (aiDevPlugin, renderDevPlugin, eventsDevPlugin, meDevPlugin, dataDevPlugin) mount
// the REAL api/ handlers and load them with the dev server's `ssrLoadModule`, so the offline
// browser suite talks to the same code production runs. A preview server serves a built app and has
// no module loader of its own, so a suite run against a built app would meet a 404 on every /api
// route. This gives each plugin the three things it uses from a dev server -
// `middlewares`, `config` and `ssrLoadModule` - on a preview server. The loader is ONE middleware-mode
// Vite server per preview server, made on the first api request and closed with the preview.
// `configFile: false` keeps the app's config out of it: it only transforms api/ modules, which read
// process.env and need none of the app's plugins (React, the generated pages, skew protection).

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
      // Not the dev server's dependency cache: this runs under `vite preview` (NODE_ENV production)
      // beside the e2e suite's dev server (scripts/catalogIndexPlugin.mjs says why that matters).
      cacheDir: path.join(repoRoot, 'node_modules/.vite-preview-api'),
      appType: 'custom',
      logLevel: 'error',
      server: { middlewareMode: true, hmr: false, watch: null },
    }));
    // A loader that failed to start is not kept: the next request tries again.
    loader.catch(() => { loader = null; });
    return loader;
  };
  preview.httpServer.once('close', () => { if (loader) loader.then((server) => server.close(), () => {}); });
  host = {
    middlewares: preview.middlewares,
    config: preview.config,
    /** @param {string} id */
    ssrLoadModule: async (id) => (await load()).ssrLoadModule(id),
  };
  hosts.set(preview, host);
  return host;
}
