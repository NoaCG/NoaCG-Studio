import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';

// RESTRICTED-NETWORK RESILIENCE (docs/GOALS.md "the SVG road"): a broadcaster demo died inside the
// wizard on a corporate network, and nothing said why. These specs pin the four guarantees
// that close that class of failure:
//
//   1. the wizard walk needs NO third-party host - and attempts none;
//   2. a WEDGED IndexedDB (an `open` that never answers - site-data policy, AV interception)
//      degrades on a timeout instead of parking the boot forever, says so, and creating
//      still works (model/durableStore.ts);
//   3. an IndexedDB that THROWS keeps the old silent localStorage fallback, now with the
//      honest notice;
//   4. a BLOCKED APP BUNDLE paints app.html's plain-HTML diagnosis instead of a white
//      screen, and /app?diag=1 (the inline connection check) runs with every chunk blocked
//      and names what the network broke.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Abort everything that leaves the dev server, recording what was attempted. */
async function blackholeThirdParty(page: Page): Promise<string[]> {
  const attempted: string[] = [];
  await page.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) => {
      attempted.push(route.request().url());
      return route.abort();
    },
  );
  return attempted;
}

/** Entry -> Browse -> skip to Finish -> the export door, which builds the graphic, saves it to
 *  the library and opens the export window over the wizard. The wizard must be open (it
 *  auto-opens on a first visit). It used to end on the old code editor's door, which is gone
 *  (e2e/no-old-editor.spec.ts); the export door runs the same create path and a save besides. */
async function walkTemplateCreate(page: Page): Promise<void> {
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();
}

test('the wizard walk completes with every third-party host blocked - and attempts none', async ({ page }) => {
  const attempted = await blackholeThirdParty(page);
  await page.goto('/app');
  await walkTemplateCreate(page);
  // Stronger than "survived": the walk never even asked for a third-party host, which is the
  // regression this spec exists to catch (a blocking CDN/font/analytics call sneaking into
  // the create path).
  expect(attempted).toEqual([]);
});

test('a wedged IndexedDB degrades on the boot timeout: the app opens, warns, and creating works', async ({ page }) => {
  await page.addInitScript(() => {
    // An `open` that never fires any event - the one failure openDatabase cannot turn into a
    // rejection. Guarded: this script also runs inside sandboxed srcdoc preview frames,
    // where touching indexedDB may throw (nothing there uses it).
    try {
      const idb = window.indexedDB;
      if (!idb) return;
      idb.open = function () {
        return {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
          readyState: 'pending',
          result: undefined,
          error: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        } as unknown as IDBOpenDBRequest;
      };
    } catch {
      /* opaque-origin frame */
    }
  });
  await page.goto('/app');
  // Boot waits out HYDRATE_TIMEOUT_MS (4 s), then mounts degraded - the whole point is that
  // this line does not time out.
  const notice = page.getByTestId('storage-health-notice');
  await expect(notice).toBeVisible({ timeout: 20000 });
  await expect(notice).toHaveAttribute('data-reason', 'timeout');
  await expect(notice).toContainText('Saved work could not be loaded');
  await walkTemplateCreate(page);
});

test('an IndexedDB that throws on open falls back to localStorage with the honest notice', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      const idb = window.indexedDB;
      if (!idb) return;
      idb.open = function () {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      };
    } catch {
      /* opaque-origin frame */
    }
  });
  await page.goto('/app');
  const notice = page.getByTestId('storage-health-notice');
  await expect(notice).toBeVisible({ timeout: 15000 });
  await expect(notice).toHaveAttribute('data-reason', 'open-failed');
  await expect(notice).toContainText('Browser storage is limited here');
});

test('a blocked app bundle paints the plain-HTML diagnosis instead of a white screen', async ({ page }) => {
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto('/app?bootTimeoutMs=600');
  await expect(page.locator('[data-noacg-boot-fallback]')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: 'Run the connection check' })).toHaveAttribute(
    'href',
    '/app?diag=1',
  );
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('the connection check passes locally and names a blocked third-party network', async ({ page }) => {
  await blackholeThirdParty(page);
  await page.goto('/app?diag=1');
  await expect(page.getByTestId('diag-root')).toBeVisible();
  // Local rows: a healthy browser + the dev server answer all of these.
  await expect(page.getByTestId('diag-row-app')).toHaveAttribute('data-status', 'PASS', { timeout: 10000 });
  await expect(page.getByTestId('diag-row-fonts')).toHaveAttribute('data-status', 'PASS', { timeout: 10000 });
  await expect(page.getByTestId('diag-row-api')).toHaveAttribute('data-status', 'PASS', { timeout: 10000 });
  await expect(page.getByTestId('diag-row-storage')).toHaveAttribute('data-status', 'PASS', { timeout: 10000 });
  await expect(page.getByTestId('diag-row-localstorage')).toHaveAttribute('data-status', 'PASS');
  await expect(page.getByTestId('diag-row-iframe')).toHaveAttribute('data-status', 'PASS', { timeout: 10000 });
  // The blocked third-party is DETECTED, not glossed: this row failing while the app rows
  // pass is exactly the screenshot a locked-down site sends us.
  await expect(page.getByTestId('diag-row-internet')).toHaveAttribute('data-status', 'FAIL', { timeout: 10000 });
  await expect(page.getByTestId('diag-copy')).toBeVisible();
  // The studio must NOT boot over the report (src/main.tsx stands down on ?diag).
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
});
