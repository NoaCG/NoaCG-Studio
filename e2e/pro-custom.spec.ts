// covers: src/ai/pro/custom/**
//
// THE CUSTOM LANE's engine, pinned OFFLINE at its pure seams (src/ai/pro/custom/loop.ts).
//
// The lane is flag-gated server-side (`AI_PRO_CUSTOM_ENABLED`, default off) and its full walk
// spends money, so what CI can honestly pin is the part that must never drift while the flag
// is off: the stop rule (fail-closed is the contract), which findings block, and the exact
// conversation shape the bench measures with - because a paid round's evidence is only about
// the product while the product holds the same conversation.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.locator('.topbar').waitFor();
});

test('the stop rule is fail-closed: findings at the budget refuse, and only clean delivers', async ({ page }) => {
  const verdicts = await page.evaluate(async () => {
    const { loopVerdict } = await import('/src/ai/pro/custom/loop.ts');
    return {
      cleanFirst: loopVerdict([], 1, 4),
      dirtyMid: loopVerdict(['legibility-contrast: too low'], 2, 4),
      dirtyLast: loopVerdict(['legibility-contrast: too low'], 4, 4),
      cleanLast: loopVerdict([], 4, 4),
    };
  });
  expect(verdicts.cleanFirst).toBe('delivered');
  expect(verdicts.dirtyMid).toBe('iterate');
  // THE CONTRACT: a spent budget with findings is a REFUSAL carrying them - never a delivery.
  // §22's deliver-signal leak (12 of 24 "delivered-clean" aired) is the class this pins shut.
  expect(verdicts.dirtyLast).toBe('refused');
  expect(verdicts.cleanLast).toBe('delivered');
});

test('every validation error blocks, legibility findings block whatever their severity, bench chatter does not', async ({ page }) => {
  const blocked = await page.evaluate(async () => {
    const { blockingFindings } = await import('/src/ai/pro/custom/loop.ts');
    return blockingFindings({
      ok: false,
      errors: [{ rule: 'spx-definition', message: 'broken' }],
      warnings: [
        // §22.1's first named leak: a collision/legibility finding demoted to advisory is the
        // killer class let back in - these BLOCK whatever severity the bench gave them.
        { rule: 'legibility-text-size', message: 'under the floor' },
        { rule: 'pro-plate-legibility', message: 'fails the bright plate' },
        // Ordinary bench teaching stays advisory, or the lane never delivers anything.
        { rule: 'bench-editability', message: 'chatty note' },
      ],
    });
  });
  expect(blocked).toHaveLength(3);
  expect(blocked[0]).toContain('spx-definition');
  expect(blocked.some((f: string) => f.includes('legibility-text-size'))).toBe(true);
  expect(blocked.some((f: string) => f.includes('pro-plate-legibility'))).toBe(true);
  expect(blocked.some((f: string) => f.includes('bench-editability'))).toBe(false);
});

test('the iteration message holds findings first, all three files, and an image only when a frame exists', async ({ page }) => {
  const shapes = await page.evaluate(async () => {
    const { iterationMessage } = await import('/src/ai/pro/custom/loop.ts');
    const template = { html: '<div>H</div>', css: '.x{}', js: 'var j=1;' };
    const bare = iterationMessage(['finding-one: detail'], template);
    const seen = iterationMessage(['finding-one: detail'], template,
      { mediaType: 'image/png', base64: 'AAAA' });
    return {
      bareBlocks: bare.length,
      seenBlocks: seen.length,
      text: bare[0].type === 'text' ? bare[0].text : '',
      imageType: seen[1]?.type,
    };
  });
  expect(shapes.bareBlocks).toBe(1);
  expect(shapes.seenBlocks).toBe(2);
  expect(shapes.imageType).toBe('image');
  // Findings before files - they are the contract, the frame is evidence.
  expect(shapes.text.indexOf('finding-one')).toBeGreaterThan(-1);
  expect(shapes.text.indexOf('finding-one')).toBeLessThan(shapes.text.indexOf('=== index.html ==='));
  for (const marker of ['=== index.html ===', '=== template.css ===', '=== template.js ===']) {
    expect(shapes.text).toContain(marker);
  }
});

test('the first-round message carries the field contract, the no-logo rule, and the design rules', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const { customUserMessage } = await import('/src/ai/pro/custom/loop.ts');
    const blocks = customUserMessage(
      {
        brief: 'A weather panel for a late bulletin.',
        fields: [
          { title: 'City', sample: 'Helsinki' },
          { title: 'Temperature', sample: '-14°' },
        ],
      },
      { target: 'tv', mode: 'standard' },
    );
    return blocks.map((b) => (b.type === 'text' ? b.text : b.type));
  });
  const first = message[0];
  expect(first).toContain('f0 (City)');
  expect(first).toContain('f1 (Temperature)');
  // The §22.1 ruling: the platform owns mark placement - the model is told, every round.
  expect(first).toContain('Do NOT place a brand mark');
  // The canonical design rules ride the user message as their own block.
  expect(message).toHaveLength(2);
});
