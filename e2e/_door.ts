import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';
import { E2E_REGISTRY_URL } from '../src/app/e2eModules';

// THE DOOR IN A DOCUMENT NO PAGE ENTRY BOOTED. Specs reach app modules through
// `__noacgImport('/src/…ts')`, which every page entry installs as it boots
// (src/app/e2eModules.ts). A spec that serves its own HTML (a blank probe page, `setContent`, a
// harness standing in for an entry) or visits a page with no entry script (the landing page, docs)
// has no boot, so the door is missing there. This puts a fallback door in every document of the
// context first; a page entry then installs its own over it, as it would without this.
//
// - On the dev server the fallback is the browser's own `import()` of the same URL, exactly what
//   those specs did before.
// - On the e2e build (NOACG_E2E_ON_BUILD=1) no /src URL exists, so the fallback answers from the
//   build's registry entry, as the page entries' own door does.
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

let checked: string | null | undefined;

/** The registry entry's URL on the e2e build, null on the dev server. The first call reads the
 *  build manifest and refuses a build where loading the registry would boot a page entry. */
export function registryUrl(): string | null {
  if (checked !== undefined) return checked;
  if (process.env.NOACG_E2E_ON_BUILD !== '1') return (checked = null);
  type Chunk = { file: string; isEntry?: boolean; imports?: string[] };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(root, 'dist-e2e/.vite/manifest.json'), 'utf8')) as Record<string, Chunk>;
  const entry = manifest['src/e2eRegistry.ts'];
  if (entry?.file !== E2E_REGISTRY_URL.slice(1)) {
    throw new Error(`dist-e2e has no registry at ${E2E_REGISTRY_URL} (found ${entry?.file ?? 'none'}): run \`npm run build:e2e\``);
  }
  const seen = new Set<string>();
  const walk = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (chunk?.isEntry) throw new Error(`the e2e registry imports the page entry ${key}, so a door call would boot it (vite.config.ts preserveEntrySignatures)`);
    for (const next of chunk?.imports ?? []) walk(next);
  };
  for (const next of entry.imports ?? []) walk(next);
  return (checked = E2E_REGISTRY_URL);
}
