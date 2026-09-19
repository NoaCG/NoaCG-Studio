import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

/** One sample per animation frame: what `#root` held, and whether the wizard was in it. */
interface WizardFrame {
  root: string;
  wizard: boolean;
}
declare global {
  interface Window {
    __wzFrames?: WizardFrame[];
  }
}

// The wizard's SHELL — the header row, and the two ways out of it.
//
// Neither of these is about a step's content. The ✕ decides what "cancel" means once a mode
// has been chosen, and the step counter decides whether the header is telling the truth about
// a walk the reader has not picked yet. Both were reported by the owner against the shipped
// build, and both are invisible to every other spec here.

/** Open the wizard on its Entry step. A fresh context has no autosaved project, so /app
 *  auto-opens it. */
async function wizard(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
}

const counter = (page: Page) => page.getByTestId('wz-stepcount');

test('the step counter appears from the second step, counting the ACTIVE mode', async ({ page }) => {
  await wizard(page);

  // Entry has no answer to give: no mode is chosen, and the denominator is not the same
  // number for every door. "Step 1 / 6" there states a walk the reader has not picked.
  await expect(counter(page)).toHaveCount(0);

  await page.locator('[data-entry="template"]').click();
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*6/);
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(counter(page)).toHaveText(/Step\s*3\s*\/\s*6/);

  // Create with AI is a THREE-step walk, so a hard-coded 6 would be a lie on its own screen.
  await page.locator('.wz-header .gallery-close').click();
  await expect(page.locator('[data-entry="ai"]')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*3/);
});

test('the header keeps its shape whether or not the counter is there', async ({ page }) => {
  await wizard(page);

  // THE HEADER RULE (re-design/handoff.md §6, src/components/AGENTS.md): the ✕ is a 32px
  // bordered square hard right, ALWAYS last. Removing the counter cluster must not let two
  // auto margins split the row and park the ✕ mid-header — which is exactly what happens if
  // the `margin-left: auto` handoff between counter and button is written the obvious way.
  const geometry = async () => {
    const header = (await page.locator('.wz-header').boundingBox())!;
    const close = (await page.locator('.wz-header .gallery-close').boundingBox())!;
    return { gap: header.x + header.width - (close.x + close.width), w: close.width, h: close.height };
  };

  const onEntry = await geometry();
  expect(onEntry.w).toBe(32);
  expect(onEntry.h).toBe(32);

  await page.locator('[data-entry="template"]').click();
  await expect(counter(page)).toBeVisible();
  const onBrowse = await geometry();
  expect(onBrowse.w).toBe(32);
  // Same distance from the right edge with the counter present as without it.
  expect(Math.abs(onBrowse.gap - onEntry.gap)).toBeLessThan(1);
  // And the counter sits BEFORE it, never after.
  const count = (await counter(page).boundingBox())!;
  const close = (await page.locator('.wz-header .gallery-close').boundingBox())!;
  expect(count.x + count.width).toBeLessThanOrEqual(close.x);
});

test('✕ past Entry returns to the wizard front page, keeping the project format', async ({ page }) => {
  await wizard(page);
  await page.locator('[data-entry="template"]').click();

  // Change the format, then walk in far enough to have a real draft to lose.
  await page.locator('.wz-browse-format select').first().selectOption('9:16');
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(counter(page)).toHaveText(/Step\s*3\s*\/\s*6/);
  const format = await page.locator('.wz-rail-format').textContent();
  expect(format).toContain('9:16');

  await page.locator('.wz-header .gallery-close').click();

  // Back to Entry — NOT out of the wizard. Losing the whole surface to correct one wrong
  // turn is the fault this fixes.
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(counter(page)).toHaveCount(0);
  // The mode's own choices go with the mode: the header no longer names a design.
  await expect(page.locator('.wz-title-doc')).toHaveCount(0);

  // The FORMAT survives, because it is a property of the thing being made rather than of the
  // route taken to make it. Re-entering any mode finds it still set.
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-rail-format')).toHaveText(format!);
  // The design choice did not survive with it.
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
});

test('Escape goes exactly where the ✕ goes', async ({ page }) => {
  await wizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await expect(counter(page)).toBeVisible();

  // Two ways out of one surface that disagreed about where "out" is was the fault: a reader
  // who learns the ✕ rewinds and then loses the draft to the key beside it has been told two
  // different things by the same wizard.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(counter(page)).toHaveCount(0);

  // And from the front page it leaves, exactly as the ✕ does there.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('✕ on the Entry step still leaves the wizard', async ({ page }) => {
  await wizard(page);
  await page.locator('.wz-header .gallery-close').click();
  // Nowhere left to rewind to, so it closes exactly as it always did.
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('Home is one press from any step, and the logo is the front page', async ({ page }) => {
  await wizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await expect(counter(page)).toBeVisible();

  // TWO DOORS, TWO DESTINATIONS. The logo means the site's front page, as it does on the
  // editor's topbar and as a logo does everywhere else — before this there was no way back
  // to the public page from inside the studio at all. Home keeps its own button, because ✕
  // only rewinds to the wizard's front page and a reader mid-walk still needs their work.
  await expect(page.locator('.wz-header .brand-home')).toHaveAttribute('href', '/');

  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
});

test('the wizard shell answers a hover in amber, exactly as the entry cards do', async ({ page }) => {
  await wizard(page);

  // The owner's report: the cards inside the wizard light up and the chrome framing them
  // stays grey, so the controls on the product's primary door read as less alive than its
  // contents. No literal colour is written down here — the brand token is resolved at run
  // time and the CARDS are asserted against it first, so this stays a test of "the shell
  // answers like the cards" and survives a repaint of the palette.
  const border = (sel: string) =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s)!).borderColor, sel);

  // The border COLOUR the amber token resolves to, read off a throwaway element - the border
  // is transitioned, so reading a real control the instant it is hovered catches it mid-fade.
  const amber = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.borderColor = 'var(--accent)';
    document.body.append(probe);
    const value = getComputedStyle(probe).borderColor;
    probe.remove();
    return value;
  });

  // The reference: this is the answer the cards already gave, stated here so the assertions
  // below are pinned to the CARDS' behaviour and not merely to a token.
  await page.hover('.wz-entry-card');
  await expect.poll(() => border('.wz-entry-card')).toBe(amber);

  for (const sel of ['.wz-header .brand-home', '.wz-header .gallery-close', '.wz-header .wz-home']) {
    await page.hover(sel);
    await expect.poll(() => border(sel), { message: `${sel} should answer like an entry card` }).toBe(amber);
  }

  // The rail's steps are shell too, and they only exist once a mode is chosen.
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-dot').first()).toBeVisible();
  await page.hover('.wz-dot:not(:disabled)');
  await expect.poll(() => border('.wz-dot:not(:disabled)')).toBe(amber);
});

test('the wizard header and the Home topbar are the same bar, to the pixel', async ({ page }) => {
  // The wizard is FULL-SCREEN and opens OVER the Home page it was launched from - `.wz-modal`
  // covers the viewport and Home stays mounted underneath - so the brand lockup is not
  // re-drawn on a new page, it is REPLACED in its own corner. Any difference in where it lands
  // is a lurch on the one press a lecture audience watches. Measured before this was fixed:
  // the bar 53px against 69px, the logo at (20,14) against (32,22), all of it header padding.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  /** Whichever bar this surface wears, and where it puts the brand mark. */
  const bar = () =>
    page.evaluate(() => {
      const el = document.querySelector('.wz-header') ?? document.querySelector('.topbar')!;
      const logo = el.querySelector('.brand-home svg')!.getBoundingClientRect();
      return {
        height: Math.round(el.getBoundingClientRect().height),
        logoX: Math.round(logo.x),
        logoY: Math.round(logo.y),
      };
    });

  const inWizard = await bar();
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const onHome = await bar();

  // Not "close enough": both bars carry the same 32px content row and the same BrandLogo in the
  // same `.brand-home`, so identical padding is identical geometry. A delta here is the lurch.
  expect(inWizard).toEqual(onHome);

  // And the wizard's header is the one that moved. The ten-odd DIALOGS that borrow `.wz-header`
  // keep the roomier dialog padding, which is what the `.wz-wizard` scope on the rule protects -
  // without this, a later "simplify" that drops the scope passes the check above and silently
  // reshapes Settings, Save and Export too.
  await page.getByTestId('home-settings').click();
  const dialog = await page.evaluate(
    () => getComputedStyle(document.querySelector('.settings-modal .wz-header')!).padding,
  );
  expect(dialog).toBe('18px 28px');
});

test('a cold entry from the landing page paints nothing under the wizard', async ({ page }) => {
  // THE DEFECT, on every single entry into the app from the landing page: `#/new` rendered the
  // HOME dashboard under the full-screen wizard, and the wizard could not be in the frame that
  // painted — a store write made from an effect is scheduled, not flushed — so Home appeared
  // for a frame and was covered. It only reproduces for a RETURNING user (an autosaved project
  // is what leaves the wizard closed at first render), so the spec makes one first.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { saveProject } = await import('/src/model/project.ts');
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: null, dirty: false });
  });
  await settleDurableWrites(page);

  // Sample every painted frame of the next document, from before the app boots.
  await page.addInitScript(() => {
    const frames: WizardFrame[] = [];
    window.__wzFrames = frames;
    const sample = () => {
      frames.push({
        root: [...(document.getElementById('root')?.children ?? [])]
          .map((el) => el.className || el.tagName)
          .join(' | '),
        wizard: !!document.querySelector('[data-testid="creation-wizard"]'),
      });
      if (performance.now() < 15000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.goto('/');
  await page.getByRole('link', { name: /Start creating/i }).first().click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // There is no Home to preserve on a boot that LANDED here, so none is mounted at all.
  await expect(page.locator('.home-page')).toHaveCount(0);

  // And the wizard is in the FIRST frame the app paints - not the second.
  const frames = await page.evaluate(() => window.__wzFrames ?? []);
  const firstPaint = frames.findIndex((f) => f.root !== '');
  const firstWizard = frames.findIndex((f) => f.wizard);
  expect(firstPaint, 'the app never painted').toBeGreaterThanOrEqual(0);
  expect(
    firstWizard - firstPaint,
    `frames painted before the wizard existed: ${JSON.stringify(frames.slice(firstPaint, firstWizard + 1))}`,
  ).toBe(0);
});

test('every step is its own history entry, and step 0 still leaves', async ({ page }) => {
  // THE DEFECT: the whole wizard was ONE history entry, so browser Back from step four of six
  // left for the landing page and threw the walk away — on the product's primary door.
  await wizard(page);
  await expect(page).toHaveURL(/#\/new$/);

  await page.locator('[data-entry="template"]').click();
  await expect(page).toHaveURL(/#\/new\/step\/browse$/);
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page).toHaveURL(/#\/new\/step\/fields$/);
  await expect(counter(page)).toHaveText(/Step\s*3\s*\/\s*6/);

  // Back walks the walk, one step per press — never a dead press. (The live preview used to
  // add a history entry of its own on every rebuild; WizardPreview mounts a fresh frame per
  // document now precisely so these presses stay one-to-one.)
  await page.goBack();
  await expect(page).toHaveURL(/#\/new\/step\/browse$/);
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*6/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(counter(page)).toHaveCount(0);

  // Forward is the same walk in the other direction.
  await page.goForward();
  await expect(page).toHaveURL(/#\/new\/step\/browse$/);
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*6/);
});

test('a step URL is NAMED, so it survives a reload and an extra step cannot shift it', async ({ page }) => {
  // Named, never numbered: import mode carries an extra step, so index 3 is Fields on one walk
  // and Style on another. A reload has to land on the step the URL says.
  await page.goto('/app#/new/step/style');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(counter(page)).toHaveText(/Step\s*4\s*\/\s*6/);

  // A name this walk does not have degrades to the front page rather than to whatever step
  // happens to sit at some index.
  await page.goto('/app#/new/step/not-a-step');
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(counter(page)).toHaveCount(0);
});
