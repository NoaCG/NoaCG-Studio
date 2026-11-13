import { execSync } from 'node:child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { claimDevPorts, reservesPorts, writeLaunchConfig } from './scripts/dev-port.mjs';
import { panelBackendPlugin } from './scripts/panelBackendPlugin.mjs';
import { catalogIndexPlugin } from './scripts/catalogIndexPlugin.mjs';
import { skewProtectionPlugin } from './scripts/skewProtectionPlugin.mjs';
import { renderApiPlugin } from './scripts/renderDevPlugin.mjs';
import { aiApiPlugin } from './scripts/aiDevPlugin.mjs';
import { eventsApiPlugin } from './scripts/eventsDevPlugin.mjs';
import { meApiPlugin } from './scripts/meDevPlugin.mjs';
import { dataApiPlugin } from './scripts/dataDevPlugin.mjs';
import { renderLatestHtml, renderUpdatesHtml } from './scripts/whats-new.mjs';
import { renderNowHtml, renderRoadmapHtml } from './scripts/roadmap.mjs';
import { renderSiteChrome } from './scripts/site-nav.mjs';
import { AGENT_PROMPT_MARKER, renderAgentPrompt } from './scripts/agent-prompt.mjs';
import { appCleanUrl } from './scripts/app-clean-url.mjs';

// NoaCG Studio — dev/build config.
// Twelve pages: index.html is the static public landing at "/", docs.html is the public docs
// home at "/docs" (static, indexed, no React), app.html is the editor at
// "/app", output.html is
// the browser-output renderer at "/output" (capability URL, docs/CLOUD_PLAYOUT.md §3),
// join.html is the public AUDIENCE page at "/join" (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5),
// ograf.html is the public FREE OGRAF STARTERS page at "/ograf" (docs/OGRAF.md), and
// bridge.html is the headless BRIDGE at "/bridge" the `noacg` CLI / MCP server drives
// (noindex, docs/AGENT_CLI.md), and downloads.html is the public DOWNLOADS page at "/downloads"
// (static, indexed): NoaCG Bridge, the Companion module and the NoaCG CLI, the tools you install. whats-new.html
// ("/whats-new") and roadmap.html ("/roadmap") are public pages whose lists are generated at
// build from docs/whats-new/ and docs/GOALS.md (generatedPages below).
// Vercel serves the clean URLs via cleanUrls (vercel.json); this tiny plugin gives the dev
// and preview servers the same ones. Terms and Privacy are public pages for the optional
// hosted service. `?raw` imports bundle GSAP + template snippets.
// The routing itself is scripts/app-clean-url.mjs, so a test can serve a built page with the same rules.

/**
 * THE PAGES WHOSE LISTS ARE GENERATED: What's new from the notes in docs/whats-new/, and the
 * roadmap from docs/GOALS.md with its public wording. Each page holds a marker comment that this
 * replaces, in the dev server on every request and in the build once. The render functions throw
 * when a note is not fit to publish or the roadmap is out of step with GOALS, so neither page can
 * be built from bad input; the same checks also run as build gates (scripts/whats-new.mjs,
 * scripts/roadmap.mjs), so the refusal reads the same from the command line.
 */
const GENERATED: Record<string, () => string> = {
  '<!--whats-new:updates-->': () => renderUpdatesHtml(),
  '<!--roadmap:columns-->': () => renderRoadmapHtml(),
  // The landing's What's new section: the newest update and the roadmap's Now items.
  '<!--whats-new:latest-->': () => renderLatestHtml(),
  '<!--roadmap:now-->': () => renderNowHtml(),
  // The coding-agent prompt, on Downloads and in the docs (scripts/agent-prompt.mjs).
  [AGENT_PROMPT_MARKER]: () => renderAgentPrompt(),
};

function generatedPages(): Plugin {
  return {
    name: 'generated-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        let out = html;
        for (const [marker, render] of Object.entries(GENERATED)) {
          if (out.includes(marker)) out = out.replace(marker, () => render());
        }
        // The top bar and the footer, one of each for every public page (scripts/site-nav.mjs).
        return renderSiteChrome(out, ctx.path);
      },
    },
  };
}

/**
 * RESERVE THIS CHECKOUT'S DEV PORT WHEN, AND ONLY WHEN, A SERVER IS ABOUT TO LISTEN
 * (scripts/dev-port.mjs). Not for `vite build`, and not for a middleware-mode server - the build's
 * prerender and several tests load this config through `createServer` and never bind a port. A
 * port the server was TOLD (`--port`, as the Playwright configs and dev-worktree pass) is the one
 * reserved, or the start fails loudly; with none, the reservation decides. Until 2026-10-08 this
 * file asked for the port while building its config object, so every build and every test that
 * loaded it held a port for the worktree's whole life.
 */
function devPortReservation(): Plugin {
  return {
    name: 'noacg-dev-port',
    config(config, { command, isPreview }) {
      if (command !== 'serve' || config.server?.middlewareMode) return;
      const asked = isPreview ? config.preview?.port : config.server?.port;
      // A preview with no port named keeps Vite's own default where no reservation is involved
      // (the primary checkout, a DEV_PORT override), so `npm run preview` beside `npm run dev`
      // still works there.
      if (isPreview && asked == null && !reservesPorts()) return;
      const record = claimDevPorts({ port: asked ?? null });
      // Keep the Claude preview launch config pointing at the port just reserved.
      writeLaunchConfig();
      const port = asked ?? record.port;
      return isPreview ? { preview: { port, strictPort: true } } : { server: { port, strictPort: true } };
    },
  };
}

/**
 * THE BUILD A PAGE REPORTS (src/control/livePath.ts `LIVE_BUILD`): the short commit, so a renderer
 * on air can say which deploy it was loaded from. Vercel hands the commit in the build env; a local
 * build or dev server asks the checkout; neither means `dev`.
 */
function buildStamp(): string {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      // not a checkout: `dev` below
    }
  }
  return sha ? sha.slice(0, 7) : 'dev';
}

const KEEP_NAMES = { function: true, class: true };

export default defineConfig(({ command, mode }) => {
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
  // THE E2E BUILD (`npm run build:e2e`, served to the browser suite): the app as users get it,
  // plus the source-module registry specs reach through (src/app/e2eModules.ts).
  const e2e = mode === 'e2e';
  return {
    define: {
      __NOACG_BUILD__: JSON.stringify(buildStamp()),
      ...(e2e ? { 'import.meta.env.VITE_E2E_MODULES': JSON.stringify('1') } : {}),
    },
    // renderApiPlugin mounts the real api/render handlers on the dev server, so the cloud
    // render loop runs fully offline (local Remotion executor) during development.
    plugins: [
      devPortReservation(),
      react(),
      appCleanUrl(),
      generatedPages(),
      renderApiPlugin(),
      aiApiPlugin(),
      eventsApiPlugin(),
      meApiPlugin(),
      dataApiPlugin(),
      // /panel.json: where the Companion module finds this app's backend (scripts/panelBackendPlugin.mjs).
      panelBackendPlugin(),
      // /catalog-index.json: the catalog the remote MCP connector reads (scripts/catalogIndexPlugin.mjs).
      catalogIndexPlugin(),
      // ?dpl=<deployment id> on every built file reference, on a Vercel build with Skew Protection
      // on, so an open page keeps loading its own deploy (scripts/skewProtectionPlugin.mjs).
      skewProtectionPlugin(),
    ],
    // strictPort: the port is this checkout's identity (playwright + the dev scripts derive
    // the same number), so failing loudly beats silently drifting onto a neighbour's port. The
    // number itself is reserved by devPortReservation() above, at the moment a server starts.
    // open: skipped on CI runners — there is no browser to open, only Playwright's.
    // watch: off for a server a Playwright config starts (playwright.config.ts,
    // playwright.catalog.config.ts, playwright.live.config.ts and playwright.endurance.config.ts
    // each set NOACG_E2E_SERVER; a new config that starts its own server needs it too), so a
    // source edit mid-run causes no reloads and no second module copies. With watching on, Vite
    // stamps the app's imports with ?t=, while a spec's `import('/src/...')` asks for the bare URL
    // and gets a second copy whose store nothing renders (#1897). A file first requested after
    // an edit is still read fresh from disk.
    server: { strictPort: true, open: !process.env.CI, ...(process.env.NOACG_E2E_SERVER ? { watch: null } : {}) },
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
      outDir: e2e ? 'dist-e2e' : 'dist',
      // The e2e build keeps function and class names UNMANGLED, which is not the `keepNames`
      // above: the identifiers themselves keep their source spelling, so call sites and `.name`
      // agree. The suite's fault injectors pick a write out by the function names on its stack
      // (e2e/_saveMatrix.ts, e2e/editor-projects.spec.ts); minified names would match nothing.
      // File names do not survive: a match on one (`saveActions.ts` in e2e/_saveMatrix.ts) must
      // move to a function name before the suite runs on this build.
      rollupOptions: {
        ...(e2e ? { output: { minify: { mangle: { keepNames: KEEP_NAMES }, compress: { keepNames: KEEP_NAMES } } } } : {}),
        input: {
          landing: 'index.html',
          docs: 'docs.html',
          app: 'app.html',
          output: 'output.html',
          join: 'join.html',
          terms: 'terms.html',
          privacy: 'privacy.html',
          ograf: 'ograf.html',
          bridge: 'bridge.html',
          downloads: 'downloads.html',
          whatsNew: 'whats-new.html',
          roadmap: 'roadmap.html',
        },
      },
    },
  };
});
