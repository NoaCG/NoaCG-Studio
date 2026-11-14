import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';

// THE DOOR IN A DOCUMENT THE APP DID NOT BOOT. Specs reach app modules through
// `__noacgImport('/src/…ts')`, which src/app/e2eModules.ts installs when an app page boots. A spec
// that serves its own HTML (a blank probe page, `setContent`, a harness standing in for an entry)
// or visits a page that installs no door (the landing page, docs) has no app boot, so the door is
// missing there. This puts a fallback door in every document of the context first; an app page
// then installs its own over it as it boots, as it would without this.
//
// - On the dev server the fallback is the browser's own `import()` of the same URL, exactly what
//   those specs did before.
// - On the e2e build (NOACG_E2E_ON_BUILD=1) no /src URL exists. The fallback loads the app's own
//   registry chunk (src/e2eRegistry.ts, found through the build manifest) with a plain
//   `import()`, so it shares the page's chunks and module instances and, unlike the app's own
//   lazy load, injects no stylesheet.
export function installDoor(context: BrowserContext): Promise<void> {
  return context.addInitScript((registryUrl) => {
    const w = window as unknown as { __noacgImport?: (path: string) => Promise<unknown> };
    if (w.__noacgImport) return;
    w.__noacgImport = registryUrl
      ? async (path) => {
          const { MODULES, LAZY } = (await import(registryUrl)) as {
            MODULES: Record<string, unknown>;
            LAZY: Record<string, () => Promise<unknown>>;
          };
          if (path in MODULES) return MODULES[path];
          if (path in LAZY) return LAZY[path]();
          throw new Error(`${path} is not in the e2e build's module registry (scripts/e2e-module-registry.mjs)`);
        }
      : (path) => import(path);
  }, registryUrl());
}

let cached: string | null | undefined;

/** The built registry chunk's URL on the e2e build, null on the dev server. */
export function registryUrl(): string | null {
  if (cached !== undefined) return cached;
  if (process.env.NOACG_E2E_ON_BUILD !== '1') return (cached = null);
  type Chunk = { file: string; isEntry?: boolean; imports?: string[] };
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'dist-e2e/.vite/manifest.json'), 'utf8')) as Record<string, Chunk>;
  const entry = manifest['src/e2eRegistry.ts'];
  if (!entry) throw new Error('dist-e2e has no src/e2eRegistry.ts chunk: run `npm run build:e2e`');
  // Loading the registry must not boot a page: none of its static imports may be an entry chunk.
  const seen = new Set<string>();
  const walk = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (chunk?.isEntry) throw new Error(`the e2e registry imports the page entry ${key}, so a door call would boot it (vite.config.ts preserveEntrySignatures)`);
    for (const next of chunk?.imports ?? []) walk(next);
  };
  for (const next of entry.imports ?? []) walk(next);
  return (cached = `/${entry.file}`);
}
