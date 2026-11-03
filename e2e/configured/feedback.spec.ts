// covers: src/feedback/**, src/components/feedback/**, src/backend/feedback.ts, api/_lib/feedbackStore.ts

import { test, expect, type Page, type Request } from '@playwright/test';
import { SUPABASE_URL } from './_helpers';

// The beta feedback flow, with a backend configured and NO account - which is the case that
// matters most, because the editor has no login wall and most people who would tell us something
// have never signed in.
//
// EVERY WALK STARTS IN THE WIZARD, deliberately. The door used to exist only in the EDITOR
// shell, the one surface the student release demotes behind Advanced mode, so these specs had
// to open the editor to reach it and each carried a note that a wizard-only student could not
// send feedback at all. That gap is closed (handoff §3), and starting here is what keeps it
// closed.
//
// EVERY REQUEST IS INTERCEPTED. The configured dev server points at the real Supabase project, so
// letting these POSTs through would put test rows in the operator's actual inbox. Fulfilling them
// here also lets the spec assert what the browser SENT, which is the part with a rule attached:
// the submission carries a rating, enumerated reasons and the user's words, and it must never
// carry a prompt, a brief, a template or a page URL.

interface Sent {
  kind?: string;
  sentiment?: string;
  reasons?: string[];
  message?: string;
  area?: string;
  visitorId?: string;
}

/** The wizard's own door. The shell behind the full-screen wizard mounts a second one - they
 *  are different areas reporting different things - so anything meaning ONE of them says which
 *  through `data-area` (see components/feedback/BetaFeedback.tsx). */
const wizardFeedback = (page: Page) =>
  page.locator('[data-testid="beta-feedback-open"][data-area="wizard"]');

test.describe('beta feedback (configured, anonymous)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');

  test('a note reaches the endpoint, and carries nothing it should not', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/me/feedback', async (route, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recorded: true }),
      });
    });

    // Straight into the default studio - no Advanced mode. The door used to exist ONLY in the
    // editor shell, the surface the student release demotes, so reaching it meant opening the
    // editor first and the release's own user could not send feedback at all. It is on the
    // wizard header and the Home topbar now (handoff §3), so this walks the shortest real path.
    await page.goto('/app');
    await expect(page.getByTestId('creation-wizard')).toBeVisible();

    await wizardFeedback(page).click();
    await expect(page.getByTestId('beta-feedback-dialog')).toBeVisible();

    // THE FIRST CLICK IS THE SUBMISSION. Nothing after it is required, which is the whole shape
    // of the flow - so the request must already be in flight before any reason is picked.
    await page.getByTestId('feedback-negative').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].kind).toBe('beta');
    expect(sent[0].sentiment).toBe('negative');
    expect(sent[0].reasons).toEqual([]);

    // A negative rating OFFERS the reasons; a positive one does not (see the second test).
    await expect(page.getByTestId('feedback-why')).toBeVisible();
    await page.getByTestId('feedback-reason-confusing').click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1].reasons).toEqual(['confusing']);

    await page.getByTestId('feedback-message').fill('The export button was hard to find.');
    await page.getByTestId('feedback-send').click();
    await expect.poll(() => sent.length).toBe(3);
    expect(sent[2].message).toBe('The export button was hard to find.');
    expect(sent[2].area).toBe('wizard');

    // What must NOT be in any of them. The endpoint drops unknown keys, but the browser must not
    // be sending them in the first place - a field that leaves the machine has already left it.
    for (const body of sent) {
      for (const forbidden of ['prompt', 'brief', 'template', 'html', 'css', 'js', 'url', 'assets']) {
        expect(body, `submission must not carry ${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  test('a positive rating asks nothing further', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/me/feedback', async (route, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });

    await page.goto('/app');
    await expect(page.getByTestId('creation-wizard')).toBeVisible();
    await wizardFeedback(page).click();
    await page.getByTestId('feedback-positive').click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].sentiment).toBe('positive');
    // "This was good" is already complete. Asking why would turn the cheap half of the flow into
    // the expensive one, so the reason picker is negative-only by design.
    await expect(page.getByTestId('feedback-why')).toHaveCount(0);
    await expect(page.getByTestId('feedback-ack')).toBeVisible();
  });

  test('the dialog closes without sending anything', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/me/feedback', async (route) => {
      calls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });

    await page.goto('/app');
    await expect(page.getByTestId('creation-wizard')).toBeVisible();
    await wizardFeedback(page).click();
    await expect(page.getByTestId('beta-feedback-dialog')).toBeVisible();

    // Opening the sheet and thinking better of it must cost nothing. Escape is the same door.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('beta-feedback-dialog')).toHaveCount(0);
    expect(calls).toBe(0);
  });

  test('Home has its own door, and it reports Home', async ({ page }) => {
    // The other half of handoff §3. It matters that the AREA follows the surface: the whole
    // point of the field is telling "the wizard confused me" from "I could not find my saved
    // graphic", and one door reporting the other's area would merge them silently.
    const sent: Sent[] = [];
    await page.route('**/api/me/feedback', async (route, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });

    await page.goto('/app#/home');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await page.locator('[data-testid="beta-feedback-open"][data-area="home"]').click();
    await page.getByTestId('feedback-positive').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].area).toBe('home');
  });

  test('the sheet wears the shared header shape', async ({ page }) => {
    // handoff §6, and not a nit: this sheet used to close with a labelled button one gap after
    // the title, held there by a `.spacer` div that flexed nowhere. The eye finds ✕ by CORNER,
    // and a close control that moves with the title's length is the exact defect §6 names.
    await page.goto('/app');
    await expect(page.getByTestId('creation-wizard')).toBeVisible();
    await wizardFeedback(page).click();

    const close = page.getByTestId('beta-feedback-close');
    await expect(close).toHaveClass(/gallery-close/);
    const geometry = await page.getByTestId('beta-feedback-dialog').evaluate((el) => {
      const headerEl = el.querySelector('.wz-header')!;
      const header = headerEl.getBoundingClientRect();
      const button = el.querySelector('[data-testid="beta-feedback-close"]')!.getBoundingClientRect();
      const title = el.querySelector('.wz-header strong')!.getBoundingClientRect();
      return {
        size: [Math.round(button.width), Math.round(button.height)],
        gapToRight: Math.round(header.right - button.right),
        // The shared header's own right padding IS "hard right" — a fixed number here is a
        // second, competing definition of the same edge (it was 20 against a 28px padding,
        // so this assertion could only ever have failed).
        padRight: Math.round(parseFloat(getComputedStyle(headerEl).paddingRight)),
        // Hard right means far from the title, not one gap after it.
        clearOfTitle: button.left - title.right,
        headerWidth: header.width,
      };
    });
    expect(geometry.size).toEqual([32, 32]);
    expect(geometry.gapToRight).toBe(geometry.padRight);
    expect(geometry.clearOfTitle).toBeGreaterThan(geometry.headerWidth * 0.3);
  });
});
