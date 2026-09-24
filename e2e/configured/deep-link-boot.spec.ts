import { test, expect } from '@playwright/test';
import { dismissWizard, haveCreds, settleSync, signIn, wipeMyGraphics } from './_helpers';

// THE DEEP LINK, AT BOOT (docs/AGENT_SAVE.md). `noacg save` prints
// `<origin>/app#/graphic/<id>` and promises it opens the graphic at once. The link is a boot
// input like any other, and a boot that cannot resolve it immediately used to REPLACE it with
// `#/home` - so the address, the only copy of it the reader was given, was gone a second after
// they clicked.
//
// Since 2026-09-24 the link opens that graphic's CONTROL page, because the old code editor it
// used to open is closed (e2e/no-old-editor.spec.ts). The address becomes `#/control/<id>`: the
// graphic's id is what must survive, and it does, in the control page's own route.
//
// WHY THIS FILE EXISTS RATHER THAN ONE MORE ASSERTION IN agent-access.spec.ts. That spec's step 4
// walks the same link and passes, and passed on the day production was measured failing it: it
// runs against a LOCAL DEV SERVER (playwright.live.config.ts) where the pull answers in
// milliseconds and a session is always warm, so it only ever exercised the lucky half of a race.
// The three tests below are built the other way round - each one MAKES the condition it is about:
//
//   1. no session at all, which is the state that can never resolve an id (tagged @production so
//      playwright.production.config.ts can run this one against https://noacg.studio itself,
//      where it needs no test account and deploy-verify.yml runs it on every deployment);
//   2. a real record, a browser that has not pulled it, and the cloud deliberately slowed - a
//      classroom on shared WiFi, supplied on purpose rather than hoped for;
//   3. the seam the defect lived in, on its own: a sync asked for while one is running.
//
// Measured on https://noacg.studio 2026-09-16. (1) failed every time, in 846 ms, for a record
// that existed perfectly well in the account. (2) did not reproduce on its own in four runs: the
// test account's library had shrunk since the 2026-09-10 report, so its whole pull now answers in
// about 300 ms where that report measured 5.0 s, and the window the coalescing return opened is
// exactly that long. A test that waits for a slow pull to happen is a test that stops testing the
// day the server gets quicker - so the delay here is APPLIED, not hoped for.

/** An id this account cannot have. The link's ADDRESS is the subject, not the record. */
const ABSENT_ID = '00000000-0000-4000-8000-0000000000de';

/**
 * How long every cloud read is held up in the slow-pull test. It COMPOUNDS, and by an amount the
 * test does not control: a pass lists the cloud first and then fetches each record it decides to
 * pull, so the wait is this delay times the number of round trips that pass needs. Four seconds
 * is already a twelve-second answer for the smallest case - far outside any window a boot could
 * win by luck - and the poll budget below is eight of them plus half a minute, which is room for
 * a library several records deeper than the one this account carries.
 */
const PULL_DELAY_MS = 4_000;

test.describe('deep-link boot', () => {
  test('a signed-out deep link keeps its address @production', async ({ page }) => {
    // NOT SIGNED IN is not the same as NOT THERE. The record behind a printed link usually
    // exists perfectly well - in the account this browser has never signed into - so the only
    // honest answer is to keep the address and ask. Replacing it with `#/home` destroys the one
    // copy of it the reader has, and no later sign-in can bring it back.
    await page.goto(`/app#/graphic/${ABSENT_ID}`);

    // The control page's own answer to "who are you": it asks for a sign-in. Waiting for it
    // rather than for a stopwatch is what makes this test deterministic - it is the first moment
    // the lookup has finished deciding.
    await expect(page.getByTestId('control-lookup')).toContainText('Sign in to open this panel', { timeout: 30_000 });
    expect(await page.evaluate(() => location.hash)).toBe(`#/control/${ABSENT_ID}`);

    // And it must still be there afterwards: the failure being pinned was a REPLACEMENT that
    // arrived late (846 ms on production), so an assertion that only looks early would miss it.
    await page.waitForTimeout(3_000);
    expect(await page.evaluate(() => location.hash)).toBe(`#/control/${ABSENT_ID}`);
  });

  test('a graphic saved elsewhere opens on its link, however slow the pull', async ({ browser, page }) => {
    test.skip(!haveCreds, 'needs E2E_EMAIL/E2E_PASSWORD');
    test.setTimeout(180_000);

    // THE READER'S BROWSER FIRST, settled: its library is complete as of now, which is what
    // makes the record that follows genuinely absent from it rather than merely late.
    await signIn(page);
    await dismissWizard(page); // signIn leaves the wizard open; the sync chip is underneath it
    await settleSync(page);

    // Somewhere else entirely - an agent's `noacg save`, or the same person's other machine -
    // a graphic appears in the account. A second context is the honest stand-in: it shares the
    // cloud and nothing else.
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    try {
      await signIn(other);
      await dismissWizard(other);
      await settleSync(other);
      const id = await other.evaluate(async () => {
        const { variantsFor } = await import('/src/templates/catalog.ts');
        const { createGraphic } = await import('/src/model/library.ts');
        const { syncNow } = await import('/src/backend/syncController.ts');
        const template = variantsFor('lower-third')[0].create({});
        const { doc } = createGraphic({ ...template, name: 'Deep link E2E' }, { name: 'Deep link E2E' });
        await syncNow();
        return doc.id;
      });
      expect(id).toMatch(/[0-9a-f-]{36}/);

      // THE LINK, opened as a full document load in a new tab of the reader's session - the
      // shape a person performs - with every cloud read held back. The app must WAIT for the
      // answer it asked for. Before this fix it asked and then read the reply it had not waited
      // for, which is a miss, which was a redirect to Home.
      const link = await page.context().newPage();
      await link.route(/\/rest\/v1\/documents/, async (route) => {
        if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, PULL_DELAY_MS));
        await route.continue();
      });
      await link.goto(`/app#/graphic/${id}`);
      // ONE POLL FOR BOTH ANSWERS, so a failure says which of them went wrong rather than only
      // that something did: the address, and whether the control page found the graphic. The
      // control page opens the record without replacing the working document, so there is no
      // unsaved-changes guard on this road any more.
      await expect
        .poll(
          () =>
            link.evaluate(() => ({
              hash: location.hash,
              found: !!document.querySelector('[data-testid="graphic-control-page"]'),
            })),
          { timeout: PULL_DELAY_MS * 8 + 30_000 },
        )
        .toEqual({ hash: `#/control/${id}`, found: true });
      await expect(link.locator('.tpl-name')).toContainText('Deep link E2E');
      await link.close();
    } finally {
      await wipeMyGraphics(other).catch(() => undefined);
      await elsewhere.close();
      await wipeMyGraphics(page).catch(() => undefined);
    }
  });

  test('a sync asked for during a pass waits for one that can see the new data', async ({ page }) => {
    test.skip(!haveCreds, 'needs E2E_EMAIL/E2E_PASSWORD');

    // THE SEAM THE DEFECT LIVED IN, pinned on its own. `syncNow()` coalesces - a second caller
    // during a running pass does not start a third - and it used to express that by returning an
    // ALREADY-RESOLVED promise. Every caller that wrote `await syncNow()` then looked again was
    // reading the library it had before it asked. Holding the cloud for two seconds makes the
    // difference impossible to miss: before the fix the second call returned in about a
    // millisecond, after it the call waits for a pass that started after it.
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);
    await page.route(/\/rest\/v1\/documents/, async (route) => {
      if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 2_000));
      await route.continue();
    });
    const waited = await page.evaluate(async () => {
      const { syncNow } = await import('/src/backend/syncController.ts');
      const first = syncNow(); // a pass is now in flight
      await new Promise((r) => setTimeout(r, 100));
      const started = performance.now();
      await syncNow(); // the caller this test is about
      const ms = performance.now() - started;
      await first;
      return ms;
    });
    expect(waited).toBeGreaterThan(1_000);
  });
});
