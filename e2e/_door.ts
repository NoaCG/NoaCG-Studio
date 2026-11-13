import type { BrowserContext } from '@playwright/test';

// THE DOOR IN A DOCUMENT THE APP DID NOT BOOT. Specs reach app modules through
// `__noacgImport('/src/…ts')`, which src/app/e2eModules.ts installs when an app page boots. A spec
// that serves its own HTML (a blank probe page, `setContent`, a harness standing in for an entry)
// has no app boot, so the door is missing there. This puts the browser's own `import()` of the
// same URL in every document of the context first, which is exactly what those specs did before;
// an app page then installs its own door over it as it boots, as it would without this.
export function installDoor(context: BrowserContext): Promise<void> {
  return context.addInitScript(() => {
    const w = window as unknown as { __noacgImport?: (path: string) => Promise<unknown> };
    if (!w.__noacgImport) w.__noacgImport = (path) => import(path);
  });
}
