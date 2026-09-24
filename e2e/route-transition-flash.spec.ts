import { expect, test, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

// NO SURFACE IS EVER PAINTED THAT THE BOOT WAS NEVER GOING TO LAND ON.
//
// Owner walk 2026-08-28: "going to the Playout client flashes the canvas editor in the
// background. This is the same effect when I go from the landing page to the Wizard: it
// flashes some other screen underneath... It's very annoying."
//
// The cause was App.tsx choosing the boot surface in a `useEffect`. An effect runs after the
// first commit has been PAINTED, so a bare `/app` rendered `<AppShell/>` (because '' still
// parsed as the editor), painted the whole canvas editor, and only then rewrote the route to
// Home. Measured on a production build at 4x CPU throttle: one full frame of the editor, on
// top, on a boot whose destination was always Home. App.tsx now decides at module load.
//
// WHY A MutationObserver AND NOT A SCREENSHOT. The defect is one frame long, so sampling -
// rAF, screenshots, a screencast - can miss it and pass a broken build. Every surface here
// is a React subtree that has to be INSERTED to be painted, so recording each marker the
// first time it enters the DOM catches the flash whatever the frame timing was: an editor
// that never mounts can never have been shown. That makes the assertion exact rather than
// probabilistic, which is what a one-frame defect needs.

// Every top-level surface /app can render, each by an identity of its own rather than by a
// layout class - `.home-body` is borrowed by the graphic control page, so it cannot say WHICH
// screen was painted, while HomePage's own `home-page` testid can. The video shell is here for
// completeness: a boot that paints it before correcting itself is the same defect in the other
// editor, and a marker set that omits it would record nothing at all and pass.
const MARKERS: Array<[string, string]> = [
  ['[data-testid="center-stage"]', 'editor'],
  ['[data-testid="video-shell"]', 'video'],
  ['[data-testid="creation-wizard"]', 'wizard'],
  ['[data-testid="production-page"]', 'production'],
  ['[data-testid="home-page"]', 'home'],
];

/** Record, in order, every top-level surface that ever enters the DOM. Must run before the
 *  first goto - it is an init script, and the first commit is what it exists to watch. */
async function recordSurfaces(page: Page): Promise<void> {
  await page.addInitScript((markers: Array<[string, string]>) => {
    // The WHOLE body is guarded: an init script also runs inside the sandboxed preview
    // iframes (allow-scripts without allow-same-origin), where touching the document this
    // way can throw - and an uncaught error there lands in the page-error listeners some
    // specs assert empty. There is no app surface to watch in such a frame.
    try {
      const w = window as unknown as { __surfaces?: string[] };
      if (w.__surfaces) return;
      const seen: string[] = [];
      w.__surfaces = seen;
      const scan = () => {
        for (const [selector, name] of markers) {
          if (!seen.includes(name) && document.querySelector(selector)) seen.push(name);
        }
      };
      new MutationObserver(scan).observe(document, { childList: true, subtree: true });
      scan();
    } catch {
      /* opaque-origin frame: nothing here to observe */
    }
  }, MARKERS);
}

const surfaces = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __surfaces?: string[] }).__surfaces ?? []);

/** A real page load of `url`. A goto whose URL differs from the current one only by its HASH
 *  is a SAME-DOCUMENT navigation - no reload, no module load, so no boot to measure at all.
 *  about:blank in between is what makes the next goto a real one. */
async function boot(page: Page, url: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(url);
}

/** Whichever surface this boot landed on - the wizard has no `.topbar`, the shells do. */
const booted = (page: Page) => page.locator('[data-testid="creation-wizard"], .topbar').first();

/** Leave this browser profile looking like a RETURNING reader's: an autosaved project exists,
 *  which is what makes `galleryOpen` start false and the bare '' boot mean Home. */
async function seedAutosavedProject(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(booted(page)).toBeVisible();
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { saveProject } = await import('/src/model/project.ts');
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread);
  });
  await settleDurableWrites(page);
}

test('a returning reader booting /app never sees the editor on the way to Home', async ({ page }) => {
  await seedAutosavedProject(page);
  await recordSurfaces(page);
  await boot(page, '/app');
  await expect(page.getByTestId('home-page')).toBeVisible();
  // Home is the destination, so Home is the only surface that may ever have existed.
  expect(await surfaces(page)).toEqual(['home']);
});

test('a first-ever visit to /app opens the wizard and never paints the editor', async ({ page }) => {
  // Deliberately NO autosaved project: this is the wizard-first boot of somebody who has never
  // used the product. Its route is still settled by an effect a frame late, but the surface under
  // that frame is HOME now, never the old code editor, which no route renders any more (owner,
  // 2026-09-24). The wizard opens in the same first commit and covers it.
  await recordSurfaces(page);
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page).toHaveURL(/#\/new$/);
  const seen = await surfaces(page);
  expect(seen).toContain('wizard');
  expect(seen).not.toContain('editor');
});

test('a deep link to a production never opens under the startup wizard', async ({ page }) => {
  // Deliberately NO autosaved project: the startup wizard would open on a bare boot, so this
  // pins the half of the boot decision that suppresses it for a deep link.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  const id = await page.evaluate(async () => {
    const { createShowNamed } = await import('/src/model/shows.ts');
    return createShowNamed('Flash repro').id;
  });
  await settleDurableWrites(page);

  await recordSurfaces(page);
  await boot(page, '/app#/production/' + id);
  await expect(page.getByTestId('production-page')).toBeVisible();
  expect(await surfaces(page)).toEqual(['production']);
});

test('a navigation inside the boot window never strands the startup wizard', async ({ page }) => {
  // THE BOOT DECISION IS MADE AT MODULE LOAD, AND THE FIRST RENDER IS A LATER MOMENT. main.tsx
  // imports App only after the durable store has hydrated and then renders a concurrent root,
  // so mounting the studio sits between decideBootRoute reading `window.location.hash` and the
  // effects that act on the route React is showing. A URL that moves inside that window used to
  // leave the startup wizard - open by galleryOpen's initial value, owned by no route - full
  // screen over the surface the reader actually asked for, with no way past it. CI found it as
  // a 60 s click into the wizard's backdrop; it is a STUCK state, not a flash.
  //
  // Deliberately NO autosaved project, so the startup wizard is what opens. The window is
  // widened with CPU throttling rather than a sleep, and it opens exactly at
  // `__noacgBootStage === 'mounted'`: main.tsx sets that flag the moment render() is CALLED.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.goto('/app', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => (window as unknown as { __noacgBootStage?: string }).__noacgBootStage === 'mounted',
  );
  await page.goto('/app#/home', { waitUntil: 'commit' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  await expect(page.getByTestId('home-page')).toBeVisible();
  // Home being VISIBLE proves nothing on its own - Playwright's visibility does not consider
  // occlusion, and the wizard is a full-screen SIBLING of the surface. What has to be true is
  // that nothing covers it.
  await expect(page.locator('.gallery-backdrop.wz-full')).toHaveCount(0);
});

test('a boot decision never rewrites a fragment the app does not own', async ({ page }) => {
  // Supabase's implicit flow hands the session back in the FRAGMENT - Google sign-in and every
  // password-reset link return to `/app#access_token=...&type=recovery` (backend/auth.ts's
  // OAUTH_REDIRECT). `parseRoute` reads any fragment it does not recognise as the editor, so a
  // boot redirect that did not check would replace the hash with `#/home` before the Supabase
  // client is ever constructed: the token is gone, no session is established, and the password
  // reset dialog never opens. Offline (no backend) nothing consumes the fragment either way -
  // what is pinned here is that the app does not DESTROY it.
  await seedAutosavedProject(page);
  const fragment = '#access_token=pinned-by-this-spec&type=recovery';
  await boot(page, '/app' + fragment);
  await expect(booted(page)).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe(fragment);
});

test('a FIRST-EVER visit on a reset link keeps the fragment too', async ({ page }) => {
  // The case above cannot reach the second URL writer. With an autosaved project `galleryOpen`
  // starts false, and the first-visit redirect - the one boot decision still made from an
  // effect - only fires when it is true. So the browser that matters here is the one that has
  // never made anything: a reader who asks for a password reset and opens the link on a new
  // device. NO seeding, deliberately.
  //
  // That effect used to stamp `#/new` over the token a frame after the module-load guard had
  // left it alone, which loses the session exactly as a rewrite at module load would.
  const fragment = '#access_token=pinned-by-this-spec&type=recovery';
  await boot(page, '/app' + fragment);
  await expect(booted(page)).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe(fragment);
});
