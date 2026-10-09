// covers: src/components/wizard/steps/{CommunityPacks,BrowseStep,SubmitPackSheet}.tsx, src/community/{packChecks,packSources}.ts, {packs/community/**,public/packs/community/**,scripts/build-production-pack.mjs}
//
// COMMUNITY PACKS (docs/work-specs/community-packs/spec.md): the template wizard's third
// category. Browse offers One graphic, A whole kit and Community packs; the shelf lists the
// seeded packs with a preview; Install puts the pack in as a ready production through
// `installPack`, with no editing step, and the production's graphic takes, reveals and goes out.
// Everything here runs offline against the built shelf under public/packs/community/.

import { test, expect, type Page } from '@playwright/test';

/** Frames for a person to look at, off by default: `NOACG_SHOTS=<dir>` writes the shelf. */
const SHOTS = process.env.NOACG_SHOTS ?? '';

async function openShelf(page: Page): Promise<void> {
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click();
  const modes = page.getByTestId('wz-buildmode');
  await expect(modes.locator('[data-build-mode]')).toHaveText([/One graphic/, /A whole kit/, /Community packs/]);
  await modes.locator('[data-build-mode="community"]').click();
  await expect(page.getByTestId('community-packs')).toBeVisible();
  // Offline there is no account, so the giving half of the shelf is absent, not disabled.
  await expect(page.getByTestId('submit-pack-open')).toHaveCount(0);
}

test('the shelf lists the seeded pub quiz, and Install opens a production whose graphic takes, reveals and goes out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openShelf(page);
  const card = page.locator('[data-community-pack="pub-quiz"]');
  await expect(card).toContainText('Pub Quiz');
  await expect(card).toContainText('by NoaCG');
  // The preview is a real picture that loaded, not a broken image.
  await expect
    .poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  // The shelf's Install is the step's only action: no Next and no Skip while it shows.
  await expect(page.locator('.wz-next')).toHaveCount(0);
  await expect(page.getByTestId('wz-skip-to-finish')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/community-shelf-desktop.png` });

  // The search above the branch filters the shelf.
  await page.getByLabel('Search community packs').fill('scoreboard');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: /Clear the search/ }).click();
  await expect(card).toBeVisible();

  // Install: straight to the production page with the pack's rundown - never the editor.
  await card.getByRole('button', { name: 'Install Pub Quiz' }).click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/#\/production\//);
  const rundown = page.getByTestId('select-cue');
  await expect(rundown).toHaveCount(4);
  await expect(rundown.first()).toContainText('Round 1 - question 1');

  // Take, Continue (the reveal), Out - the graphic on the PROGRAM monitor answers each.
  await rundown.first().click();
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Pub Quiz"]');
  await expect(program.locator('#f0')).toHaveText('Which planet is known as the Red Planet?');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Round 1 - question 1');
  await page.getByTestId('verb-next').click();
  await expect(program.locator('.quiz-option-2')).toHaveClass(/quiz-correct/);
  await expect(program.locator('.quiz-option-1')).toHaveClass(/quiz-dim/);
  await page.getByTestId('verb-out').first().click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // Install stamped where the graphic came from, so the submit picker never offers it as the
  // maker's own work (spec D7).
  const stamp = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { packSources } = await import('/src/community/packSources.ts');
    return {
      fromPack: loadGraphics().find((g) => g.name === 'Pub Quiz')?.fromPack ?? null,
      offered: packSources().flatMap((s) => s.graphics.map((g) => g.name)),
    };
  });
  expect(stamp.fromPack).toEqual({ id: 'pub-quiz', version: 1, author: 'NoaCG', name: 'Pub Quiz' });
  expect(stamp.offered).not.toContain('Pub Quiz');

  expect(errors).toEqual([]);
});

test('a pack of graphics: the checks refuse an outside font, placeholder text and a shared name, and an install gets one starter cue per graphic', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { checkPack, buildCommunityPack } = await import('/src/community/packChecks.ts');
    const { parsePack, installPack } = await import('/src/packs/graphicsPack.ts');
    const [first, second] = variantsFor('lower-third');
    const a = first.create({});
    const b = second.create({});
    const meta = { name: 'Two thirds', description: 'Two lower thirds', author: 'Someone' };
    const clean = checkPack({ ...meta, graphics: [{ name: 'A', template: a }, { name: 'B', template: b }] });
    const font = `@import url("https://fonts.googleapis.com/css2?family=Inter");\n`;
    const refused = checkPack({
      ...meta,
      description: ' ',
      graphics: [
        { name: 'A', template: { ...a, css: font + a.css } },
        { name: 'B', template: { ...b, html: `${b.html}<!-- Lorem ipsum -->` } },
        { name: 'b', template: b },
      ],
    });
    const file = await buildCommunityPack({ ...meta, graphics: [{ name: 'A', template: a }, { name: 'B', template: b }] });
    const { pack, error } = parsePack(JSON.stringify(file));
    if (!pack) throw new Error(error ?? 'unparsed');
    const show = await installPack(pack);
    return {
      clean,
      refused,
      license: file.license,
      author: file.author,
      rundown: pack.rundown ?? null,
      cues: (show.cues ?? []).length,
      graphics: show.graphics.map((g) => g.name),
    };
  });
  expect(result.clean).toEqual([]);
  expect(result.refused).toContainEqual({ message: 'Describe the pack in one line.' });
  expect(result.refused).toContainEqual(
    expect.objectContaining({ graphic: 'A', message: expect.stringContaining('fonts.googleapis.com') }),
  );
  expect(result.refused).toContainEqual({ graphic: 'B', message: 'It still holds placeholder text (lorem ipsum).' });
  expect(result.refused).toContainEqual({ graphic: 'b', message: 'Two graphics share this name. Rename one first.' });
  // A set of graphics, no rundown: the installed production seeds one starter cue per graphic.
  expect(result.license).toBe('CC-BY-4.0');
  expect(result.author).toBe('Someone');
  expect(result.rundown).toBeNull();
  expect(result.graphics).toEqual(['A', 'B']);
  expect(result.cues).toBe(2);
});

test('the shelf reads on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openShelf(page);
  const card = page.locator('[data-community-pack="pub-quiz"]');
  await expect(card).toBeVisible();
  // The card fits the screen: nothing runs off the right edge.
  const box = await card.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(375);
  await card.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/community-shelf-phone.png`, fullPage: true });
});
