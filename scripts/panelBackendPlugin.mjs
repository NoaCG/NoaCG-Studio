// /panel.json - where a hardware panel finds this app's backend (docs/work-specs/hardware-panel-control/
// protocol.md §7.1).
//
// The NoaCG Companion module asks for one thing, the NoaCG address (https://noacg.studio, or a
// self-hosted app's), and reads the Supabase URL and publishable key from here. Both are already
// public: every page of the app carries them in its bundle. Serving them from the app's own build
// configuration means a rotated publishable key, or a self-hosted backend, needs no module update.
//
// The dev and preview servers answer it from the environment Vite loaded; the build writes it into
// dist/. With no backend configured there is no file, and the module says the address has no panel
// backend.

import { loadEnv } from 'vite';

/** The file's body, or null when this build has no backend. Pure, for the test. */
export function panelBackendJson(env) {
  const url = env.VITE_SUPABASE_URL ?? '';
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) return null;
  return JSON.stringify({ v: 1, supabaseUrl: url, supabaseKey: key });
}

/** @returns {import('vite').Plugin} */
export function panelBackendPlugin() {
  let body = null;
  const serve = (server) => {
    server.middlewares.use('/panel.json', (req, res, next) => {
      if (req.url !== '/' && req.url !== '') return next();
      if (!body) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(body);
    });
  };
  return {
    name: 'noacg-panel-backend',
    configResolved(config) {
      // loadEnv already lets an inline variable win over the .env files, as the app's own env does.
      body = panelBackendJson(loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_'));
    },
    configureServer: serve,
    configurePreviewServer: serve,
    generateBundle() {
      if (body) this.emitFile({ type: 'asset', fileName: 'panel.json', source: body });
    },
  };
}

