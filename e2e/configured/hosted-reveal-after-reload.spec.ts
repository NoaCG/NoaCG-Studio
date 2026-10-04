import { publishProduction } from '../_publish';
import { test, expect, type FrameLocator, type Page, type Route } from '@playwright/test';
import { dropSvg, intoProduction, QUIZ_SVG } from '../_svg-import';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

// A RELOADED HOSTED TAB REVEALS WHAT IT SHOWS. The hosted control page is how a second operator
// or a phone drives a class quiz, and a phone reloads. Row C's rehearsal found a Reveal from a
// reloaded tab that did not light the right verdict on air; row G traced that to a Take airing
// the shared buffer's stale key (src/components/control/ownStaged.ts) and to the reloaded
// PROGRAM monitor replaying the entrance, and fixed both. This spec keeps the question itself
// honest, round after round on one production: after the reload, do the tab's own PROGRAM
// monitor, the key its editor shows and the renderer (OBS) agree on the verdict?
//
// Its first run found a road G's fix left open. Reveal correct CARRIES the key the cue shows, and
// a reloaded tab shows the shared staged buffer. A key aired by a Take or an Update reached that
// buffer only when the typing debounce ran out, so a reload inside that window brought the tab
// back on the older key and the Reveal lit it on air. Pressing Take or Update now stages the
// typing at once (HostedControlPage `flushTyping`). The rekey round holds that window open by
// construction (the reload comes about 100 ms after the Update, the debounce is 400 ms), and
// without the fix it went red on all three repeats of configured run 36278592787.
//
// Three ways a class reaches the reload, one per round:
//   settled - locked, the renderer has reported it, a moment passes, then the reload;
//   fast    - the reload the instant the lock is on air, before the renderer has reported it.
//             That report lags by design, so the round holds it back (fault injection) and the
//             tab boots on the previous question's report. The monitor has to replay the log
//             rows after that report, as the renderer's own recovery does; it used to rebuild
//             the previous reveal and light the old key (configured run 36279794719);
//   rekey   - locked on one key, the key corrected and Updated on air, and the reload the
//             moment that Update has landed, so the aired key is not the one the cue was taken
//             with and the tab has had no time to spare.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

const WIRE = { timeout: 30_000 };
// Both report RPCs: `control_output_report` on the id road, `control_output_report_seq` on the
// numbered log (migration 0071), whichever the renderer negotiated with this server.
const REPORT_RPC = '**/rpc/control_output_report*';
const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Letter = (typeof LETTERS)[number];
type Variant = 'settled' | 'fast' | 'rekey';
const VARIANTS: Variant[] = ['settled', 'fast', 'rekey'];
const ROUNDS = VARIANTS.length;

/** Which row's verdict is lit in one picture of the board, or null when none is. */
async function litCorrect(frame: FrameLocator): Promise<Letter | null> {
  for (const l of LETTERS) {
    const cls = await frame
      .locator(`[data-noacg-role~="answer.correct/${l}"]`)
      .getAttribute('class', { timeout: 2_000 })
      .catch(() => null);
    if (cls && /imported-design-on/.test(cls)) return l;
  }
  return null;
}

async function openHosted(page: Page, slug: string): Promise<void> {
  await page.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(page.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('hosted-select-cue').filter({ hasText: 'Quiz board' }).first().click();
}

test('a hosted tab reloaded mid-quiz reveals on air exactly the verdict it shows', async ({ page, context }) => {
  test.setTimeout(180_000 + ROUNDS * 90_000);
  const errors: string[] = [];
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);

  const showName = `Reveal Reload ${Date.now()}`;
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await intoProduction(page, 'Quiz board', showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', WIRE);
  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === name);
    return { control: show?.hostedSlug ?? null, output: show?.outputSlug ?? null };
  }, showName);
  expect(slugs.control, 'publishing must mint a hosted control slug').toBeTruthy();
  expect(slugs.output).toBeTruthy();

  // OBS is up for the whole show, the way a class runs it.
  const output = await context.newPage();
  output.on('pageerror', (e) => errors.push(`[output] ${e.message}`));
  await output.goto(`/output?production=${encodeURIComponent(slugs.output!)}&debug=1`);
  const air = output.frameLocator('iframe[title="Quiz board"]');

  const tab = await context.newPage();
  tab.on('pageerror', (e) => errors.push(`[hosted] ${e.message}`));
  await openHosted(tab, slugs.control!);
  const monitor = tab.frameLocator('[data-testid="hosted-program-stage"] iframe[title="Quiz board"]');

  const rounds: string[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const variant = VARIANTS[round % VARIANTS.length];
    // A different key every round, and never the one before it, so a verdict left over from the
    // previous round or a stale key can never pass for the right one.
    const key = LETTERS[(round * 3 + 2) % 4];
    const pick = LETTERS[(LETTERS.indexOf(key) + 1) % 4];
    const takenKey = variant === 'rekey' ? LETTERS[(LETTERS.indexOf(key) + 2) % 4] : key;
    const tag = `round ${round + 1} (${variant}, key ${key})`;

    // FAULT INJECTION for the fast round: the renderer's state reports are held for the whole
    // round, so the report the reloaded tab reads is the PREVIOUS question's, the way it is for
    // real inside the renderer's 800 ms report debounce (src/output/main.ts).
    const heldReports: Route[] = [];
    if (variant === 'fast') await output.route(REPORT_RPC, (r) => void heldReports.push(r));

    await tab.getByTestId(`hosted-field-f5-opt-${takenKey}`).click();
    await tab.getByTestId(`hosted-field-f6-opt-${pick}`).click();
    await tab.getByTestId('hosted-take-cue').click();
    await expect(tab.getByTestId('hosted-live-chip'), tag).toContainText('Quiz board', WIRE);
    await tab.getByRole('button', { name: /Select answer/ }).click();
    // This round's pick on air, unlocked, before the lock: the previous round's picture is gone.
    await expect(air.locator(`[data-noacg-role~="answer.selected/${pick}"]`), tag).toHaveClass(/imported-design-on/, WIRE);
    await expect(air.locator('[data-noacg-role~="locked"]'), tag).not.toHaveClass(/imported-design-on/);
    await tab.getByRole('button', { name: /Lock it in/ }).click();
    await expect(air.locator('[data-noacg-role~="locked"]'), tag).toHaveClass(/imported-design-on/, WIRE);
    if (variant === 'settled') await tab.waitForTimeout(3_000);
    if (variant === 'rekey') {
      // The key is corrected ON AIR while locked, and the tab reloads the moment the Update has
      // landed. That used to be inside the typing debounce, so the shared buffer never saw the
      // new key: the tab came back on the old one, and its Reveal carried the old one to air.
      // The Update's OWN response: air learns of the Lock from the broadcast, so the Lock's
      // response can still be on its way here.
      const updated = tab.waitForResponse(
        (r) => r.url().includes('/rpc/control_send') && r.ok() && (r.request().postData() ?? '').includes('"update"'),
      );
      await tab.getByTestId(`hosted-field-f5-opt-${key}`).click();
      await tab.getByTestId('hosted-update-cue').click();
      await updated;
      await tab.waitForTimeout(100);
    }

    await tab.reload();
    await expect(tab.getByTestId('hosted-control-page'), tag).toBeVisible({ timeout: 60_000 });
    await tab.getByTestId('hosted-select-cue').filter({ hasText: 'Quiz board' }).first().click();
    // The tab comes back knowing the quiz is locked, on the key that is on air.
    await expect.soft(tab.getByTestId('hosted-state-chip'), tag).toContainText('Locked', WIRE);
    await expect.soft(tab.getByTestId(`hosted-field-f5-opt-${key}`), tag).toHaveAttribute('aria-pressed', 'true');
    const reveal = tab.getByRole('button', { name: /Reveal correct/ });
    await expect.soft(reveal, tag).toBeEnabled(WIRE);

    if (await reveal.isEnabled()) {
      await reveal.click();
      await expect.soft(air.locator(`[data-noacg-role~="answer.correct/${key}"]`), tag).toHaveClass(/imported-design-on/, WIRE);
      await expect.soft(monitor.locator(`[data-noacg-role~="answer.correct/${key}"]`), tag).toHaveClass(/imported-design-on/, WIRE);
      // …and it stays that way past the monitor's next state reply.
      await tab.waitForTimeout(2_000);
    }
    const onAir = await litCorrect(air);
    const onTab = await litCorrect(monitor);
    rounds.push(`${tag}: air ${onAir ?? 'none'}, tab ${onTab ?? 'none'}`);
    expect.soft(onAir, `${tag}: the verdict on air`).toBe(key);
    expect.soft(onTab, `${tag}: the verdict on the reloaded tab's PROGRAM monitor`).toBe(key);
    if (variant === 'fast') {
      // Held through the whole round, so everything the tab knew came from the log, never from
      // a fresh report. A round that held nothing would have proved nothing.
      expect(heldReports.length, `${tag}: the renderer's reports were held`).toBeGreaterThan(0);
      // Released BEFORE the unroute, which settles any route it still holds on its own.
      for (const r of heldReports.splice(0)) await r.continue();
      await output.unroute(REPORT_RPC);
    }

    await tab.getByTestId('hosted-out-cue').click();
    await expect(tab.getByTestId('hosted-live-chip'), tag).toContainText('nothing on air', WIRE);
  }
  console.log('[reveal after reload]\n' + rounds.join('\n'));
  expect(errors).toEqual([]);

  await tab.close();
  await output.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
