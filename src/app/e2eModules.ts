// HOW A BROWSER SPEC REACHES THE APP'S OWN MODULES, on the dev server and on the e2e build.
//
// Specs read and drive the app's state from inside the page (`page.evaluate`), through the very
// module instances the app runs: the store a spec writes must be the store the UI renders. On
// the dev server every source file has its own URL, so a spec could write `import('/src/x.ts')`.
// A bundle has no such URLs, so the browser suite could not run against a build, and a build
// boots in under a third of the dev server's time (run #1967: 488 ms against 1,592 ms to Home).
//
// `window.__noacgImport('/src/x.ts')` is the one door that works on both:
// - the e2e build (`npm run build:e2e`) answers from src/e2eRegistry.ts, generated from the specs'
//   literal imports (scripts/e2e-module-registry.mjs). The build emits it as its own entry at a
//   fixed URL (E2E_REGISTRY_URL, vite.config.ts), loaded on the first call, importing each module
//   statically. The bundle holds each module once, so a spec gets the instance the page imported,
//   never a second copy, on every page: the app, /output, /join, /ograf and /bridge alike.
// - the dev server answers with the browser's own `import()` of the same URL (no `?import`), which
//   is what the specs did before, so nothing changes there.
// - a production build gets neither: `__NOACG_E2E__` (set only by the build mode) and DEV are
//   both false there, so the first line below returns and the bundler drops the rest.

declare global {
  interface Window {
    __noacgImport?: (path: string) => Promise<unknown>;
  }
}

/** Where the e2e build serves src/e2eRegistry.ts (vite.config.ts names the entry's file). */
export const E2E_REGISTRY_URL = '/assets/e2eRegistry.js';

/** Installs the door. Each page entry calls it once, first. */
export function installE2eModules(): void {
  if (!import.meta.env.DEV && !(typeof __NOACG_E2E__ === 'boolean' && __NOACG_E2E__)) return;
  // NOT `import(path)` written here. On the dev server Vite rewrites a dynamic import whose argument
  // is not a literal into `import(path + '?import')`, a different URL, so the page would evaluate
  // every module a second time and a spec would drive a store nothing renders (e2e/AGENTS.md, the
  // ghost store). In the build the bundler would try to resolve the registry URL itself, and its
  // preload wrapper would inject the registry's stylesheets into the page. A function built at run
  // time is invisible to both and asks the browser for exactly the URL given.
  const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
  if (import.meta.env.DEV) {
    window.__noacgImport = load;
    return;
  }
  window.__noacgImport = async (path) => {
    const { MODULES, LAZY } = (await load(E2E_REGISTRY_URL)) as {
      MODULES: Record<string, unknown>;
      LAZY: Record<string, () => Promise<unknown>>;
    };
    if (path in MODULES) return MODULES[path];
    if (path in LAZY) return LAZY[path]();
    throw new Error(`${path} is not in the e2e build's module registry (scripts/e2e-module-registry.mjs)`);
  };
}
