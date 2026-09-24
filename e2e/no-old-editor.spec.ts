import { expect, test, type Page } from '@playwright/test';
import { pickDesign } from './_browse';

// NOBODY CAN REACH THE OLD CODE EDITOR (owner, 2026-09-24).
//
// The old editor (src/components/AppShell.tsx) stays in the repository until the new editor has
// taken over what is worth keeping, but no route, door or setting opens it. The reason this file
// exists is a classroom: Advanced mode was a setting in the BROWSER, not the account, so one
// student ticking it on a shared lab computer sent every later student into the old editor. The
// owner reproduced it on noacg.studio: with the setting on, the wizard's ✕ opened AppShell.
//
// So every test here boots with that stored setting, `advancedMode: true` in "spx-gfx-prefs",
// exactly as such a computer holds it, and every test ends by asserting that the old editor
// never entered the DOM at any moment. A MutationObserver records it rather than a final
// look, because a surface painted for one frame and replaced is still a surface a student saw
// (the same reasoning as route-transition-flash.spec.ts).

const PREFS_KEY = 'spx-gfx-prefs';

/** Two markers only AppShell renders: its topbar's code toggle and its centre stage. */
const OLD_EDITOR = '[data-testid="toggle-code"], [data-testid="center-stage"]';

/**
 * Boot every page load of this test with the stored Advanced mode a lab computer carries (a
 * version-1 record, written before the prefs format was stamped), and record whether the old
 * editor ever enters the DOM. Must run before the first goto.
 */
async function bootLikeTheLabComputer(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, marker }) => {
      // Guarded whole: an init script also runs in the sandboxed preview iframes, where touching
      // storage throws and there is no app surface to watch.
      try {
        if (window.top !== window) return;
        const prefs = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
        delete prefs.v;
        localStorage.setItem(key, JSON.stringify({ ...prefs, advancedMode: true }));
        const w = window as unknown as { __oldEditorSeen?: boolean };
        w.__oldEditorSeen = false;
        const scan = () => {
          if (document.querySelector(marker)) w.__oldEditorSeen = true;
        };
        new MutationObserver(scan).observe(document, { childList: true, subtree: true });
      } catch {
        /* opaque-origin frame */
      }
    },
    { key: PREFS_KEY, marker: OLD_EDITOR },
  );
}

/** The old editor must not be on screen now, and must never have been since this page loaded. */
async function expectOldEditorNeverShown(page: Page): Promise<void> {
  await expect(page.locator(OLD_EDITOR)).toHaveCount(0);
  const seen = await page.evaluate(() => (window as unknown as { __oldEditorSeen?: boolean }).__oldEditorSeen);
  expect(seen, 'the old code editor (AppShell) entered the DOM').toBe(false);
}

/** Seed one saved library graphic through the model (the control page needs a record). */
async function seedGraphic(page: Page, name = 'Lab lower third'): Promise<string> {
  return page.evaluate(async (graphicName) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: graphicName, packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    await commitDurableWrites();
    return doc.id;
  }, name);
}

/** Make this browser a RETURNING reader: an autosaved working project, so the startup wizard
 *  does not auto-open and a bare boot has to choose a surface of its own. */
async function seedAutosavedProject(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { saveProject } = await import('/src/model/project.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const template = variantsFor('lower-third')[0].create({});
    saveProject(template, template, { graphicId: null, dirty: false });
    await commitDurableWrites();
  });
}

/** A real BOOT onto `url`, not a same-document hash change: leave the app first. */
async function boot(page: Page, url: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(url);
}

test.beforeEach(async ({ page }) => {
  await bootLikeTheLabComputer(page);
});

test('the wizard ✕ and Escape land on Home, and the front page has no Blank card', async ({ page }) => {
  // A first-ever visit: the startup wizard opens over Home.
  await page.goto('/app');
  const wizard = page.getByTestId('creation-wizard');
  await expect(wizard).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/#\/new$/);

  // Three starting points and no Blank: its only outcome was the old editor.
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.locator('[data-entry="ai"]')).toBeVisible();
  await expect(page.locator('[data-entry="import-graphic"]')).toBeVisible();
  await expect(page.locator('[data-entry="blank"]')).toHaveCount(0);

  // ✕ lands on Home, and Home's topbar has no way back into an editor.
  await wizard.locator('.gallery-close').click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('home-continue-editing')).toHaveCount(0);

  // Escape is the ✕'s twin: from the front page it leaves, and it leaves to Home too.
  await page.getByTestId('home-new-project').click();
  await expect(wizard).toBeVisible();
  await expect(page).toHaveURL(/#\/new$/);
  await page.keyboard.press('Escape');
  await expect(wizard).toBeHidden();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId('home-page')).toBeVisible();

  // A step URL naming the retired Blank step opens no such step.
  await page.goto('/app#/new/step/blank-project');
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('blank-step')).toHaveCount(0);

  await expectOldEditorNeverShown(page);
});

test('Settings has no Advanced mode switch', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('home-settings').click();
  const settings = page.getByTestId('settings');
  await expect(settings).toBeVisible();
  // The dialog's own sections are all there; only the switch is gone.
  await expect(settings.locator('[data-section="workflow"]')).toBeVisible();
  await expect(page.getByTestId('advanced-mode-toggle')).toHaveCount(0);
  await expect(settings.getByText(/advanced mode/i)).toHaveCount(0);
  await expect(settings.getByText(/code editor/i)).toHaveCount(0);
  await expectOldEditorNeverShown(page);
});

test('Finish offers a production, an export and the new editor, and no code editor', async ({ page }) => {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  // No footer control creates straight into code on any step.
  await expect(page.getByRole('button', { name: 'Create project', exact: true })).toHaveCount(0);
  await page.getByTestId('wz-skip-to-finish').click();

  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  await expect(page.getByTestId('wz-finish-edit-artwork')).toBeVisible();
  await expect(page.getByTestId('wz-finish-editor')).toHaveCount(0);
  await expect(page.getByText('Open in the code editor')).toHaveCount(0);

  // "Edit this graphic" is the one editor door, and it is the NEW editor.
  await page.getByTestId('wz-finish-edit-artwork').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\?editor=foundation#\/editor-foundation$/);
  await expectOldEditorNeverShown(page);
});

test('a saved graphic opens from Home onto its control page, and edits in the new editor', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await seedGraphic(page);
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('home-nav-graphics').click();

  const row = page.locator('.lib-row', { hasText: 'Lab lower third' });
  await expect(row.getByTestId('open-graphic')).toHaveAttribute('title', 'Open to preview, edit data and operate');
  await row.getByTestId('open-graphic').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await expect(page).toHaveURL(/#\/control\//);

  // The control page's editor door goes to the new editor, holding this graphic.
  await page.getByTestId('control-open-editor').click();
  const guard = page.getByTestId('confirm-switch');
  const editor = page.getByTestId('editor-foundation');
  await expect(guard.or(editor)).toBeVisible({ timeout: 30_000 });
  if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('.ef-current-graphic')).toHaveText('Lab lower third');

  // The new editor's header has no "Existing editor" door; Home is its way out.
  await expect(page.getByTestId('ef-open-code-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Existing editor' })).toHaveCount(0);
  await expectOldEditorNeverShown(page);
});

test('a stale #/graphic/<id> opens that graphic\'s control page, at boot and in the app', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const id = await seedGraphic(page);

  // At boot: the link an agent's `noacg save` still prints, opened in a fresh tab.
  await boot(page, `/app#/graphic/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`#/control/${id}$`));
  await expect(page.locator('.tpl-name')).toContainText('Lab lower third');

  // In the app: the same link pasted into the address bar of a tab already open on Home.
  await page.getByTestId('control-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  // Home's recent-graphics card names the category, as the Graphics list does, not its id.
  await expect(page.getByTestId('shelf-graphic').first().locator('.muted')).toContainText('Lower third');
  await page.evaluate((graphicId) => {
    window.location.hash = `#/graphic/${graphicId}`;
  }, id);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/control/${id}$`));

  // A graphic this browser does not have is the control page's own "not found", never an editor.
  await boot(page, '/app#/graphic/no-such-graphic');
  await expect(page.getByText('Graphic not found')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/#\/control\/no-such-graphic$/);
  // The message spans the page, not the 190px nav column of Home's grid it once fell into.
  const lookup = await page.getByTestId('control-lookup').boundingBox();
  expect(lookup!.width, 'the lookup state sits in a narrow column').toBeGreaterThan(600);
  await expectOldEditorNeverShown(page);
});

test('/app, /app#/ and a hash the app does not own all land on Home', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await seedAutosavedProject(page);

  // A returning reader's bare boot, and `#/`, which parses as the editor route.
  await boot(page, '/app');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/#\/home$/);
  await boot(page, '/app#/');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/#\/home$/);

  // A fragment the router does not know also parses as the editor route. It renders Home, and
  // the fragment is LEFT ALONE: a sign-in or reset token arrives exactly this way, and
  // rewriting the URL would destroy it (App.tsx, bootMayRewriteUrl).
  await boot(page, '/app#not-a-route');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).hash).toBe('#not-a-route');

  // The video workspace's Graphics button lands on Home's Graphics list.
  await page.goto('/app#/video');
  await expect(page.getByTestId('video-shell')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('back-to-graphics').click();
  await expect(page).toHaveURL(/#\/home\/graphics$/);
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expectOldEditorNeverShown(page);
});

test('the old editor\'s module is never even loaded', async ({ page }) => {
  // App.tsx does not import AppShell, so the dev server is never asked for it: not at boot, and
  // not on the way through the wizard to Home. A request here means something imports it again
  // and every visitor downloads it (the production bundle is measured in the row's handoff).
  const requested: string[] = [];
  page.on('request', (request) => {
    if (/\/src\/components\/AppShell\.tsx/.test(request.url())) requested.push(request.url());
  });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(requested).toEqual([]);
});

test('?diag=1 and the boot watchdog still work', async ({ page }) => {
  // The inline connection check renders with main.tsx standing down.
  await page.goto('/app?diag=1');
  await expect(page.getByTestId('diag-root')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('diag-row-app')).toHaveAttribute('data-status', 'PASS', { timeout: 10_000 });
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);

  // A boot that never mounts paints app.html's plain-HTML diagnosis instead of a white screen.
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await boot(page, '/app?bootTimeoutMs=600');
  await expect(page.locator('[data-noacg-boot-fallback]')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Run the connection check' })).toHaveAttribute('href', '/app?diag=1');
});

test('prefs: a version-1 record drops advancedMode on read, and a newer version is read-only', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async (key) => {
    const { loadPrefs, savePrefs, PREFS_VERSION } = await import('/src/model/prefs.ts');

    // Nothing stored: the defaults, and READING writes nothing.
    localStorage.removeItem(key);
    const fresh = loadPrefs();
    const storedAfterFreshRead = localStorage.getItem(key);

    // Version 1: no stamp, the retired switch on, and a real preference beside it.
    localStorage.setItem(key, JSON.stringify({ advancedMode: true, libraryView: 'list' }));
    const migrated = loadPrefs() as unknown as Record<string, unknown>;
    const storedAfterRead = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;

    // A LOWER stamp is not a newer build's record: it migrates like version 1 and stays writable.
    localStorage.setItem(key, JSON.stringify({ v: 1, advancedMode: true, spaceMode: 'preview-then-take' }));
    const lower = loadPrefs() as unknown as Record<string, unknown>;
    savePrefs({ libraryView: 'list' });
    const lowerAfterSave = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;

    // A record a NEWER build wrote: read as the defaults, and never written over.
    const future = JSON.stringify({ v: PREFS_VERSION + 1, libraryView: 'list', somethingNew: 1 });
    localStorage.setItem(key, future);
    const fromFuture = loadPrefs();
    savePrefs({ libraryView: 'list' });
    const futureAfterSave = localStorage.getItem(key);

    // And this build's own format round-trips.
    localStorage.setItem(key, JSON.stringify({ v: PREFS_VERSION, libraryView: 'list' }));
    savePrefs({ spaceMode: 'preview-then-take' });
    const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;

    return { PREFS_VERSION, fresh, storedAfterFreshRead, migrated, storedAfterRead, lower, lowerAfterSave, fromFuture, future, futureAfterSave, current };
  }, PREFS_KEY);

  expect(result.PREFS_VERSION).toBe(2);
  expect(result.fresh.libraryView).toBe('grid');
  expect(result.storedAfterFreshRead).toBeNull();
  expect(result.migrated).not.toHaveProperty('advancedMode');
  expect(result.migrated.libraryView).toBe('list');
  // The migration is written back on first read, so the retired value leaves the browser.
  expect(result.storedAfterRead).not.toHaveProperty('advancedMode');
  expect(result.storedAfterRead.v).toBe(2);
  expect(result.storedAfterRead.libraryView).toBe('list');
  expect(result.lower).not.toHaveProperty('advancedMode');
  expect(result.lower.spaceMode).toBe('preview-then-take');
  expect(result.lowerAfterSave).toMatchObject({ v: 2, libraryView: 'list', spaceMode: 'preview-then-take' });
  expect(result.lowerAfterSave).not.toHaveProperty('advancedMode');
  expect(result.fromFuture.libraryView).toBe('grid');
  expect(result.futureAfterSave).toBe(result.future);
  expect(result.current).toMatchObject({ v: 2, libraryView: 'list', spaceMode: 'preview-then-take' });
});
