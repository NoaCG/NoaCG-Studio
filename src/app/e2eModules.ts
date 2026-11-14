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
//   literal imports (scripts/e2e-module-registry.mjs). It is one chunk loaded on the first call, importing each
//   module statically, and the bundle holds each module once, so a spec gets the instance the
//   app imported, never a second copy.
// - the dev server answers with the browser's own `import()` of the same URL (no `?import`), which
//   is what the specs did before, so nothing changes there.
// - a production build gets neither: `__NOACG_E2E__` (set only by the build mode) and DEV are
//   both false there, so the first line below returns and the bundler drops the rest.

declare global {
  interface Window {
    __noacgImport?: (path: string) => Promise<unknown>;
  }
}

type Registry = () => Promise<{ MODULES: Record<string, unknown>; LAZY: Record<string, () => Promise<unknown>> }>;

/** `registry` is src/e2eRegistry.ts's loader on the e2e build and null otherwise. main.tsx passes
 *  it, because the registry reaches components/ and only the UI region may import that. */
export function installE2eModules(registry: Registry | null): void {
  if (!import.meta.env.DEV && !(typeof __NOACG_E2E__ === 'boolean' && __NOACG_E2E__)) return;
  if (registry) {
    window.__noacgImport = async (path) => {
      const { MODULES, LAZY } = await registry();
      if (path in MODULES) return MODULES[path];
      if (path in LAZY) return LAZY[path]();
      throw new Error(`${path} is not in the e2e build's module registry (scripts/e2e-module-registry.mjs)`);
    };
  } else if (import.meta.env.DEV) {
    // NOT `import(path)` written here: Vite rewrites a dynamic import whose argument is not a
    // literal into `import(path + '?import')`, a different URL, so the page would evaluate every
    // module a second time and a spec would drive a store nothing renders (e2e/AGENTS.md, the
    // ghost store). A function built at run time is invisible to that rewrite and asks for the
    // URL itself, the one the app's own imports use. Dev server only: production never gets here.
    window.__noacgImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
  }
}
