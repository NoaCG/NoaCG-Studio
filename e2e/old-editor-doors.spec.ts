import { test, expect, type Page } from '@playwright/test';
import { switchToAdvancedMode } from './_create';

// The default studio has no door to the old code editor (owner, 2026-09-21: "Let's not have any
// links to the old editor anymore because we have the new one"). These are the three doors that
// sat outside the wizard and the control page: the new editor's "Existing editor" button, the
// video workspace's back-to-graphics button and the Brands section's Apply. Each one either
// lands on the new editor or Home, or shows only in Advanced mode, which keeps the code editor
// reachable for the people it is for.
//
// Every test here runs in the DEFAULT studio (no enableAdvancedMode before the goto), and
// `toggle-code` is the marker for AppShell: only the old editor's topbar carries it.

async function expectNoOldEditor(page: Page) {
  await expect(page.getByTestId('toggle-code')).toHaveCount(0);
  expect(page.url()).not.toMatch(/#\/?$|#\/graphic/);
}

test('the new editor offers no code-editor door until Advanced mode is on', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ef-open-code-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Existing editor' })).toHaveCount(0);

  // Advanced mode keeps the code reachable: the same header grows the door on the flip.
  await switchToAdvancedMode(page);
  await expect(page.getByTestId('ef-open-code-editor')).toBeVisible();
});

test('back to graphics from the video workspace lands on Home, not the code editor', async ({ page }) => {
  await page.goto('/app#/video');
  await expect(page.getByTestId('video-shell')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('back-to-graphics').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page).toHaveURL(/#\/home\/graphics$/);
  await expect(page.getByTestId('home-nav-graphics')).toHaveClass(/(^| )active( |$)/);
  await expectNoOldEditor(page);
});

test("a brand's Apply lands on the new editor with the working graphic retinted", async ({ page }) => {
  await page.goto('/app#/home/looks');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30000 });
  // Seed a working graphic with an accent to retint, and one saved brand, through the model:
  // the subject is where Apply lands, not how a brand is made (brand-editor.spec.ts and
  // library.spec.ts cover that).
  await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { addLook, captureLookFromTemplate } = await import('/src/model/packets.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const variant = variantsFor('lower-third').find((v) => v.name === 'Hairline')!;
    useTemplateStore.getState().applyTemplate(variant.create({}), { resetSampleData: true });
    const look = captureLookFromTemplate(useTemplateStore.getState().template);
    addLook('Doors look', { ...look, palette: { ...look.palette, accent: '#12e29a' } });
    await commitDurableWrites();
  });
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('home-nav-looks').click();

  await page.locator('.lib-row', { hasText: 'Doors look' }).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\?editor=foundation#\/editor-foundation$/);
  await expectNoOldEditor(page);
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('#12e29a');
});
