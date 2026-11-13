// HOW A BROWSER SPEC REACHES THE APP'S OWN MODULES, on the dev server and on the e2e build.
//
// Specs read and drive the app's state from inside the page (`page.evaluate`), through the very
// module instances the app runs: the store a spec writes must be the store the UI renders. On
// the dev server every source file has its own URL, so a spec could write `import('/src/x.ts')`.
// A bundle has no such URLs, so the browser suite could not run against a build, and a build
// boots in under a third of the dev server's time (run #1967: 488 ms against 1,592 ms to Home).
//
// `window.__noacgImport('/src/x.ts')` is the one door that works on both:
// - the e2e build (`npm run build:e2e`) answers from src/e2eRegistry.ts, generated from the specs
//   (scripts/e2e-module-registry.mjs). It is one chunk loaded on the first call, importing each
//   module statically, and the bundle holds each module once, so a spec gets the instance the
//   app imported, never a second copy.
// - the dev server answers with the browser's own `import()` of the same URL, which is what the
//   specs did before, so nothing changes there.
// - a production build gets neither: the flag compiles the registry out, and DEV is false.

declare global {
  interface Window {
    __noacgImport?: (path: string) => Promise<unknown>;
  }
}

const registry = import.meta.env.VITE_E2E_MODULES === '1' ? () => import('../e2eRegistry') : null;

export function installE2eModules(): void {
  if (registry) {
    window.__noacgImport = async (path) => {
      const { MODULES, LAZY } = await registry();
      if (path in MODULES) return MODULES[path];
      if (path in LAZY) return LAZY[path]();
      throw new Error(`${path} is not in the e2e build's module registry (scripts/e2e-module-registry.mjs)`);
    };
  } else if (import.meta.env.DEV) {
    window.__noacgImport = (path) => import(/* @vite-ignore */ path);
  }
}
