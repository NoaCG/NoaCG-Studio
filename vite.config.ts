import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { devPort, writeLaunchConfig } from './scripts/dev-port.mjs';
import { renderApiPlugin } from './scripts/renderDevPlugin.mjs';
import { aiApiPlugin } from './scripts/aiDevPlugin.mjs';
import { eventsApiPlugin } from './scripts/eventsDevPlugin.mjs';
import { adminApiPlugin } from './scripts/adminDevPlugin.mjs';
import { meApiPlugin } from './scripts/meDevPlugin.mjs';
import { dataApiPlugin } from './scripts/dataDevPlugin.mjs';

// NoaCG Studio — dev/build config.
// Ten pages: index.html is the static public landing at "/", docs.html is the public docs
// home at "/docs" (static, indexed, no React), app.html is the editor at
// "/app", admin.html is the private admin surface at "/admin" (unlinked and noindex — it is
// a 404 for everyone the server does not recognise, see docs/ADMIN.md), output.html is
// the browser-output renderer at "/output" (capability URL, docs/CLOUD_PLAYOUT.md §3),
// join.html is the public AUDIENCE page at "/join" (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5),
// ograf.html is the public FREE OGRAF STARTERS page at "/ograf" (docs/OGRAF.md), and
// bridge.html is the headless BRIDGE at "/bridge" the `noacg` CLI / MCP server drives
// (noindex, docs/AGENT_CLI.md).
// Vercel serves the clean URLs via cleanUrls (vercel.json); this tiny plugin gives the dev
// and preview servers the same ones. Terms and Privacy are public pages for the optional
// hosted service. `?raw` imports bundle GSAP + template snippets.
const CLEAN_PAGES = ['/app', '/admin', '/output', '/join', '/terms', '/privacy', '/ograf', '/bridge', '/docs'] as const;

// `/join/<name>` — the READABLE join URL an operator reads out on air. Vercel serves it through
// a rewrite (vercel.json); the same shape has to work here, or a vanity link is testable only
// in production. The page reads the name off the path itself.
const PATH_PAGES = ['/join'] as const;

function appCleanUrl(): Plugin {
  const prepare = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
  ) => {
    // Preview iframes are deliberately sandboxed without allow-same-origin, so their origin
    // is opaque. Bundled OFL fonts are public static assets and need an explicit CORS response
    // to render there. Keep the allowance scoped to /fonts rather than every app response.
    if (req.url?.startsWith('/fonts/')) res.setHeader('Access-Control-Allow-Origin', '*');
    for (const page of CLEAN_PAGES) {
      if (req.url === page || req.url?.startsWith(page + '?')) {
        req.url = `${page}.html` + (req.url.slice(page.length) || '');
        break;
      }
      // The path form keeps the name in the URL the page reads it from, so the request is
      // rewritten to the entry WITHOUT the segment rather than to `${page}.html/<name>`.
      if (PATH_PAGES.includes(page as (typeof PATH_PAGES)[number]) && req.url?.startsWith(page + '/')) {
        req.url = `${page}.html`;
        break;
      }
    }
  };
  return {
    name: 'app-clean-url',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Keep the Claude preview launch config pointing at this checkout's port (worktrees get
  // their own — see scripts/dev-port.mjs). Serve-time only: builds shouldn't touch files.
  if (command === 'serve') writeLaunchConfig();
  if (command === 'serve') {
    // The dev server mounts the REAL api/ handlers (aiDevPlugin/renderApiPlugin), and they
    // read server-only configuration from process.env exactly as they do on Vercel — but
    // Vite loads .env files only into import.meta.env, never process.env. Fill the gap at
    // serve time so `AI_LITE_*`, provider keys, and the render config work locally the way
    // production works. Only MISSING keys are filled: an inline env var (or a Playwright
    // webServer.env override, e.g. the offline suite's blanked Supabase vars) always wins.
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
      if (!(key in process.env)) process.env[key] = value;
    }
  }
  return {
    // renderApiPlugin mounts the real api/render handlers on the dev server, so the cloud
    // render loop runs fully offline (local Remotion executor) during development.
    plugins: [
      react(),
      appCleanUrl(),
      renderApiPlugin(),
      aiApiPlugin(),
      eventsApiPlugin(),
      adminApiPlugin(),
      meApiPlugin(),
      dataApiPlugin(),
    ],
    // strictPort: the port is this checkout's identity (playwright + the dev scripts derive
    // the same number), so failing loudly beats silently drifting onto a neighbour's port.
    // open: skipped on CI runners — there is no browser to open, only Playwright's.
    server: { port: devPort(), strictPort: true, open: !process.env.CI },
    build: {
      // es2017, not es2020: CasparCG 2.3.x LTS (the common student/school install) embeds a
      // Chromium 71 CEF (CEF 3.3578 - read off libcef.dll and the output page's own `&debug=1`
      // line on the v2.3.3-lts-stable download, 2026-09-10; an earlier guess here said 63) that
      // cannot PARSE optional chaining / nullish coalescing. The output page died there with
      // "Uncaught SyntaxError: Unexpected token ?" on a real server.
      // Lowering the target transpiles the syntax across every bundle (runtime APIs are
      // shimmed in output.html, the one page those renderers load).
      target: 'es2017',
      // DO NOT turn on `keepNames` here. preview/composeDocument.ts serializes functions into the
      // preview document with `.toString()` and binds each one under `fn.name`, which is how the
      // emitted source's own call sites (minified along with it) still resolve. `keepNames`
      // restores `.name` to the SOURCE spelling while leaving those call sites minified, which is
      // exactly the mismatch that killed the editor's stage and Play button on the deployed site
      // in 2026-08 - and `scripts/check-preview-serialization.mjs` cannot see it, because the
      // source would still be correct.
      outDir: 'dist',
      rollupOptions: {
        input: {
          landing: 'index.html',
          docs: 'docs.html',
          app: 'app.html',
          admin: 'admin.html',
          output: 'output.html',
          join: 'join.html',
          terms: 'terms.html',
          privacy: 'privacy.html',
          ograf: 'ograf.html',
          bridge: 'bridge.html',
        },
      },
    },
  };
});
