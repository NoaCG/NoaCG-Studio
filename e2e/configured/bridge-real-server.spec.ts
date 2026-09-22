import { test, expect, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dropSvg, intoExistingProduction, intoProduction, QUIZ_SVG, SCOREBUG_SVG } from '../_svg-import';
import { haveCreds, signIn } from './_helpers';

// THE REAL-SERVER WALK of NoaCG Bridge (docs/BRIDGE.md, milestone 1). Nothing is faked: a
// real NoaCG Bridge on 127.0.0.1:8899 (the built exe, or `noacg bridge`), a real CasparCG on
// this machine with its media scanner, the real backend for publishing. It runs only when asked
// for by name, because it drives a live playout channel:
//
//   BRIDGE_REAL=1 npx playwright test -c playwright.live.config.ts e2e/configured/bridge-real-server.spec.ts
//
// What it proves, in the order the owner would: the production's own quiz and scoreboard go on
// air through the Bridge with ONE command (the output URL on the channel) and are then revealed
// and scored from the dashboard over the command log, inside CasparCG's own browser; a template
// and a still from the server's own library are cued from the same rundown and taken, updated
// and taken off as one command each. After every step `PRINT 1` writes a full-frame PNG of the
// channel into the server's media folder, and each is copied to test-results/bridge-real/ -
// the evidence a person reads without watching a window.

const BRIDGE = 'http://127.0.0.1:8899';
const CASPAR = { host: '127.0.0.1', port: 5250 };
const MEDIA_DIR = process.env.CASPAR_MEDIA_DIR ?? 'C:\\casparcg\\casparcg-server-v2.5.0-stable-windows\\media';
const FRAMES = path.resolve('test-results/bridge-real');
const WIRE = { timeout: 30_000 };

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');
test.skip(!process.env.BRIDGE_REAL, 'BRIDGE_REAL=1 runs this against a real Bridge and a real CasparCG');

/** The token the Bridge minted on this machine - what pairing would have written. */
function bridgeToken(): string {
  const file = path.join(process.env.APPDATA ?? '', 'noacg', 'caspar-agent.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { token: string }).token;
}

/** One raw AMCP line through the Bridge's terminal route, from the test runner. */
async function amcp(page: Page, token: string, command: string): Promise<{ ok: boolean; status?: string; lines?: string[] }> {
  const res = await page.request.post(`${BRIDGE}/amcp`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { target: { adapter: 'casparcg', ...CASPAR }, command },
  });
  return (await res.json()) as { ok: boolean; status?: string; lines?: string[] };
}

/** PRINT the channel and keep the frame under a readable name. Returns the frame's byte size. */
async function frame(page: Page, token: string, name: string): Promise<number> {
  await page.waitForTimeout(1500);
  const before = new Set(readdirSync(MEDIA_DIR));
  const r = await amcp(page, token, 'PRINT 1');
  expect(r.ok, `PRINT 1: ${r.status}`).toBe(true);
  let fresh: string | undefined;
  for (let i = 0; i < 40 && !fresh; i++) {
    await page.waitForTimeout(250);
    fresh = readdirSync(MEDIA_DIR).find((f) => f.endsWith('.png') && !before.has(f));
  }
  expect(fresh, 'PRINT 1 wrote a PNG into the media folder').toBeTruthy();
  const src = path.join(MEDIA_DIR, fresh!);
  // The server closes the file a moment after listing it.
  await page.waitForTimeout(500);
  mkdirSync(FRAMES, { recursive: true });
  copyFileSync(src, path.join(FRAMES, `${name}.png`));
  const bytes = statSync(src).size;
  console.log(`[frame] ${name}: ${fresh} (${bytes} bytes)`);
  return bytes;
}

test('the Bridge airs the production, the dashboard reveals and scores it in CasparCG, and the server\'s own library is cued beside it', async ({ page }) => {
  test.setTimeout(420_000);
  const token = bridgeToken();
  expect(existsSync(MEDIA_DIR), `CasparCG media folder at ${MEDIA_DIR}`).toBe(true);

  // Paired, as the pairing page would have left it, before the app loads.
  await page.addInitScript(
    ([bridge, tok, caspar]) => {
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({ agentUrl: bridge, agentToken: tok, host: caspar.host, amcpPort: caspar.port, channel: 1, layer: 20, v: 1 }),
      );
    },
    [BRIDGE, token, CASPAR] as const,
  );

  // The server is really there: its own version string, through the Bridge.
  const version = await amcp(page, token, 'VERSION');
  expect(version.ok).toBe(true);
  console.log(`[server] ${version.lines?.[0]}`);
  // A clean channel to start from.
  await amcp(page, token, 'CLEAR 1');

  await signIn(page);
  await page.keyboard.press('Escape');
  // The analytics question a backend build asks once; declined, so it never covers the rundown's foot.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) await consent.getByRole('button', { name: 'No thanks' }).click();
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });

  // ── The production: an imported quiz and an imported scoreboard, published. ──
  const showName = `Bridge walk ${Date.now()}`;
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await intoProduction(page, 'Quiz board', showName);
  await page.goto('/app');
  await dropSvg(page, SCOREBUG_SVG);
  await intoExistingProduction(page, 'Team score', showName);
  await expect(page.getByTestId('select-cue')).toHaveCount(2);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', WIRE);

  // ── ONE command puts the production on the channel: the output URL, through the Bridge. ──
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await expect(page.getByTestId('caspar-air-target')).toContainText('1-20');
  await page.getByTestId('caspar-put-on-air').click();
  await expect(page.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok', WIRE);
  await expect(page.getByTestId('caspar-air-result')).toHaveText('✓ On 1-20');
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();
  // The renderer inside CasparCG boots and reports itself to the log; give it a breath.
  await page.waitForTimeout(6000);
  const empty = await frame(page, token, '01-output-url-loaded-nothing-on-air');

  // ── The quiz: key C, pick B, Take; then Select, Lock, Reveal - every one over the LOG, inside
  //    CasparCG's browser, with the Bridge sending nothing. ──
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Quiz board', WIRE);
  await page.waitForTimeout(2500);
  const question = await frame(page, token, '02-quiz-on-air');
  expect(question).toBeGreaterThan(empty);
  await page.getByRole('button', { name: /Select answer/ }).click();
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Locked', WIRE);
  await frame(page, token, '03-quiz-locked-on-B');
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Reveal', WIRE);
  await frame(page, token, '04-quiz-revealed-C');

  // ── The scoreboard beside it: Take, then +1 twice and -1 once from the dashboard. ──
  await page.getByTestId('select-cue').filter({ hasText: 'Team score' }).first().click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Team score', WIRE);
  await page.waitForTimeout(2000);
  await frame(page, token, '05-scoreboard-on-air-with-quiz');
  await page.getByTestId('live-number-f1-up').click();
  await page.getByTestId('live-number-f1-up').click();
  await page.getByTestId('live-number-f2-down').click();
  const score = page.frameLocator('[data-testid="program-stage"] iframe[title="Team score"]');
  await expect(score.locator('#f1')).toHaveText('4', WIRE);
  await frame(page, token, '06-score-4-0');

  // ── The server's own library: a template that lives on the box, cued from the same rundown. ──
  await page.getByTestId('add-from-server').click();
  await expect(page.getByTestId('playout-picker')).toBeVisible();
  const strap = page.locator('[data-testid="picker-row"][data-name="HOUSE_STRAP/HOUSE_STRAP"]');
  await expect(strap).toBeVisible(WIRE);
  const templates = await page.getByTestId('picker-row').count();
  console.log(`[server] TLS listed ${templates} templates`);
  await page.getByTestId('picker-field-ids').fill('f0, f1');
  await strap.getByTestId('picker-add').click();
  const strapCue = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await expect(strapCue).toContainText('Server template');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok', WIRE);
  await expect(page.getByTestId('playout-cue-status')).toContainText('2.5');
  await page.getByTestId('cue-field-f0').fill('NoaCG Bridge "walk"\nline two ä');
  await page.getByTestId('cue-field-f1').fill('Server template, CG ADD with JSON');
  await page.getByTestId('verb-take').click();
  await expect(strapCue).toContainText('ON AIR', WIRE);
  await expect(page.getByTestId('production-note')).toContainText('✓ Take: HOUSE_STRAP/HOUSE_STRAP', WIRE);
  await page.waitForTimeout(2500);
  await frame(page, token, '07-server-template-taken');
  await page.getByTestId('cue-field-f0').fill('Updated through CG UPDATE');
  await page.getByTestId('verb-update').click();
  await expect(page.getByTestId('production-note')).toContainText('✓ Update: HOUSE_STRAP/HOUSE_STRAP', WIRE);
  await page.waitForTimeout(1500);
  await frame(page, token, '08-server-template-updated');
  await page.getByTestId('verb-out').click();
  await expect(strapCue).not.toContainText('ON AIR', WIRE);
  await page.waitForTimeout(2500);
  await frame(page, token, '09-server-template-out');

  // ── A still from the media library, on the clip layer under everything. ──
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  const media = page.getByTestId('picker-row');
  await expect(media.first()).toBeVisible(WIRE);
  console.log(`[server] CLS listed ${await media.count()} media files`);
  const still = page.locator('[data-testid="picker-row"][data-name="JÄÄKIEKKO"]');
  await expect(still).toBeVisible();
  await still.getByTestId('picker-add').click();
  const stillCue = page.locator('.pd-cue', { hasText: 'JÄÄKIEKKO' });
  await expect(stillCue).toContainText('Server clip');
  await expect(stillCue.getByTestId('cue-layer')).toHaveText('L10');
  await page.getByTestId('verb-take').click();
  await expect(stillCue).toContainText('ON AIR', WIRE);
  await expect(page.getByTestId('production-note')).toContainText('✓ Take: JÄÄKIEKKO on 1-10', WIRE);
  await page.waitForTimeout(2000);
  await frame(page, token, '10-still-under-the-graphics');
  await page.getByTestId('verb-out').click();
  await expect(stillCue).not.toContainText('ON AIR', WIRE);

  // ── Everything off: the graphics over the log, the server items through the Bridge, and the
  //    output layer itself through the Bridge's one command. ──
  await page.getByTestId('verb-out-all').click();
  await page.waitForTimeout(2500);
  await page.getByTestId('production-links-toggle').click();
  await page.getByTestId('caspar-take-off-air').click();
  await expect(page.getByTestId('caspar-air-result')).toHaveText('✓ Off 1-20', WIRE);
  await page.waitForTimeout(1500);
  const cleared = await frame(page, token, '11-all-off');
  expect(cleared).toBeLessThan(question);

  await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) if (s.hostedSlug) await unpublishControlShow(s.id).catch(() => {});
  });
});
