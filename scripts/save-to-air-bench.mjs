// SAVE TO AIR, measured against the real deployment: the last hop of the agent road.
//
// The numbers we quote are 24.8 s for the seven authoring verbs and 9.3 s for `noacg save` into
// the live library. Nobody had ever timed the hop AFTER the library: a production's output URL, the thing
// a viewer actually sees. This script times it, end to end, against `https://noacg.studio` with
// the E2E test account - never a dev server, because R2.4 was already caught overclaiming on the
// strength of one (a dev server is not this).
//
// The walk, all of it driven:
//   1. `noacg scaffold` a scoreboard with this run's stamp in it, with the LOCAL build;
//   2. `noacg login`, consent pressed in the driven browser - the interactive handoff, not the
//      `--key` paste fallback, so the number reflects the login a room will actually run;
//   3. `noacg save` into the live library. The clock for R2.5 starts when it returns;
//   4. wait for the studio's own library to show it, then make a production of that one graphic
//      and publish it - the route `save` prints, with the editor never opened;
//   5. open the PUBLIC output URL and press TAKE; stop the clock when the graphic is on air
//      in the output page's own renderer (opacity, not text - the markup carries the values
//      either way, and the STAGE's opacity counts as much as the graphic's);
//   6. take it off and put it back, with the output page still open, for the number a show
//      actually repeats: one cue to air over a warm wire.
// Then it unpublishes, deletes both rows and revokes the key, because the account is shared and
// a production left published keeps its address and shadows the next run.
//
// It is browser-driving work and named `*bench*` on purpose, which is what puts it inside the
// `[\w-]*bench[\w-]*` family of `SWEEP_SCRIPTS` (scripts/command-match.mjs) without anybody having
// to list it - one such job per MACHINE. Queue it rather than running it beside a suite:
//   node scripts/jobs.mjs add "node scripts/save-to-air-bench.mjs" --cost 0.5
//
// Needs E2E_EMAIL / E2E_PASSWORD (read from .env, as playwright.live.config.ts does) and a CLI
// built from this checkout (`npm --prefix cli run build`). Nothing is published past `main`: it
// writes a graphic and a production to the throwaway test account and removes both.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { activeRuns, describeRuns, selfAndAncestors } from './e2e-runs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli', 'dist', 'index.js');
const origin = (process.env.NOACG_URL || 'https://noacg.studio').replace(/\/+$/, '');
const shots = path.join(root, 'test-results', 'save-to-air');
// Six digits of the clock would repeat every 16m40s, and a leftover production keeps its address,
// so a collision would hand this run the previous one's rows. Four random characters after it.
const stamp = `${String(Date.now()).slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
const graphicName = `Air probe ${stamp}`;
const showName = `Air probe show ${stamp}`;

const fileEnv = loadEnv('development', root, '');
const EMAIL = process.env.E2E_EMAIL || fileEnv.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD || fileEnv.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('save-to-air-bench: E2E_EMAIL / E2E_PASSWORD unset (put them in .env, as the live suite does).');
  process.exit(2);
}

// Wait for our turn on the machine, by process identity rather than by checkout - this script is
// itself one of the jobs the detector lists, so excluding only the caller's checkout would queue
// it behind itself (`scripts/cli-bench.mjs` measured that on 2026-08-22).
const mine = selfAndAncestors();
for (let waited = 0, runs = activeRuns({ excludePids: mine }); runs.length > 0; waited += 5, runs = activeRuns({ excludePids: mine })) {
  if (waited === 0) console.log(`[air] waiting for ${runs.length} browser-driving job(s):\n${describeRuns(runs)}`);
  else if (waited % 60 === 0) console.log(`[air] still waiting (${waited / 60} min)...`);
  await new Promise((done) => setTimeout(done, 5_000));
}

mkdirSync(shots, { recursive: true });
// One sandbox per run, holding two SIBLINGS: the graphic `scaffold` writes, and the credential
// store this run's key lives in (see `cliEnv` above). Siblings rather than nested, because
// `scaffold` refuses a target directory that is not empty and a config folder inside it counts.
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'noacg-air-'));
const work = path.join(sandbox, 'graphic');
const store = path.join(sandbox, 'config');
mkdirSync(work, { recursive: true });
mkdirSync(store, { recursive: true });
const marks = [];
const mark = (label) => {
  const at = Date.now();
  marks.push({ label, at });
  const previous = marks.length > 1 ? marks[marks.length - 2].at : at;
  console.log(`[air] ${label} (+${((at - previous) / 1000).toFixed(1)} s)`);
  return at;
};

/**
 * The environment every CLI child gets: this deployment, and a credential store of its own.
 *
 * The store is redirected into the run's temp directory and `NOACG_AGENT_KEY` is dropped, so the
 * key this walk mints lives and dies with the run. Without that, the bench reaches straight into
 * the machine's real credentials: the interactive login would overwrite whatever key is stored for
 * this deployment, `save` would silently use `NOACG_AGENT_KEY` instead of the one it just minted -
 * measuring a walk nobody made - and the `logout` in the cleanup would REVOKE that key on the
 * server, which for a CI key means killing it for everyone. `cli/test/unit.test.mjs` sandboxes
 * itself the same way and for the same reason.
 */
const cliEnv = () => {
  const env = { ...process.env, NOACG_URL: origin, APPDATA: store, XDG_CONFIG_HOME: store };
  delete env.NOACG_AGENT_KEY;
  return env;
};

/** Run the local CLI and give back its exit code, both streams and how long it took. */
function noacg(args, { json = true } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [cli, ...args, ...(json ? ['--json'] : [])], { env: cliEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      process.stderr.write(`    | ${d}`);
    });
    child.on('exit', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e), ms: Date.now() - started }));
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Advanced mode, before the first navigation - the posture every live spec drives the app in, so
// what this measures is the surface they cover. It has to be an init script because the pref is
// read at boot. Guarded because it also runs inside sandboxed preview iframes, where merely
// touching localStorage throws (e2e/_create.ts says the same thing at length).
await context.addInitScript(() => {
  try {
    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem('spx-gfx-prefs') ?? '{}');
    } catch {
      prefs = {};
    }
    if (prefs.advancedMode !== true) localStorage.setItem('spx-gfx-prefs', JSON.stringify({ ...prefs, advancedMode: true }));
  } catch {
    /* opaque-origin frame: nothing to persist */
  }
});
const page = await context.newPage();
let output = null;
let failure = null;

const shot = async (target, name) => {
  await target.screenshot({ path: path.join(shots, `${name}.png`) }).catch(() => undefined);
};

try {
  // ── Sign in on the hosted origin. Home rather than bare /app: a non-editor route closes the
  //    startup wizard by itself, so there is no modal backdrop to dismiss first. ──
  await page.goto(`${origin}/app#/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'No thanks' }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#auth-email').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#auth-email').fill(EMAIL);
  await page.locator('#auth-pass').fill(PASSWORD);
  await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 30_000 });
  mark('signed in');

  // ── Scaffold, with this run's stamp as the home team so the frame on air is identifiably ours. ──
  const scaffold = await noacg([
    'scaffold', '--type', 'scoreboard', '--design', 'neutral',
    // `--set` takes the type's LOGICAL field keys (bridgeApi.ts), so `teamA`, never "Team A".
    '--name', graphicName, '--set', `teamA=AIR ${stamp}`, '--out', work,
  ]);
  if (scaffold.code !== 0) throw new Error(`scaffold exited ${scaffold.code}: ${scaffold.stdout}${scaffold.stderr}`);
  mark(`scaffolded (${(scaffold.ms / 1000).toFixed(1)} s)`);

  // ── The interactive login, consent pressed in this browser. `--no-browser` because the page
  //    is opened here rather than in whatever browser the machine would launch. ──
  const login = spawn(process.execPath, [cli, 'login', '--no-browser', '--wait', '120'], { env: cliEnv() });
  let loginOut = '';
  let loginErr = '';
  const loginStarted = Date.now();
  login.stdout.setEncoding('utf8');
  login.stderr.setEncoding('utf8');
  login.stdout.on('data', (d) => {
    loginOut += d;
  });
  login.stderr.on('data', (d) => {
    loginErr += d;
  });
  const loginExit = new Promise((resolve) => login.on('exit', (code) => resolve({ code, at: Date.now() })));

  let consent = null;
  for (let i = 0; i < 300 && !consent; i++) {
    const m = new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/app\\?\\S+`).exec(loginErr);
    if (m) consent = m[0];
    else await new Promise((r) => setTimeout(r, 50));
  }
  if (!consent) throw new Error(`login printed no consent URL:\n${loginErr}`);
  await page.goto(consent, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('agent-consent').waitFor({ state: 'visible', timeout: 20_000 });
  const allowedAt = Date.now();
  await page.getByTestId('agent-consent-allow').click();
  const exited = await loginExit;
  if (exited.code !== 0) throw new Error(`login exited ${exited.code}:\n${loginOut}\n${loginErr}`);
  // The fix this run also exercises: the login exits with the consent tab still open.
  console.log(`[air] login exited ${((exited.at - allowedAt) / 1000).toFixed(2)} s after Allow, `
    + `${((exited.at - loginStarted) / 1000).toFixed(1)} s after it started, with the tab open`);
  mark('logged in');

  // ── SAVE. The R2.5 clock starts the moment this returns. ──
  const save = await noacg(['save', work]);
  if (save.code !== 0) throw new Error(`save exited ${save.code}: ${save.stdout}${save.stderr}`);
  const saved = JSON.parse(save.stdout);
  const savedAt = mark(`saved (${(save.ms / 1000).toFixed(1)} s) -> ${saved.url}`);

  // ── The library, first: the studio has to have the row before anything can add it to a
  //    production, and that wait belongs INSIDE this number rather than beside it. ──
  await page.goto(`${origin}/app#/home/graphics`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`graphic-row-${saved.id}`).waitFor({ state: 'visible', timeout: 90_000 });
  mark('the studio shows it in the library');

  // ── Home → Productions, which is the route `save` itself prints ("add it to a production from
  //    there") and the one a person takes: the link `save` gives lands on Home anyway, which is
  //    row SA's defect and not this number's business. The editor is never opened. ──
  await page.goto(`${origin}/app#/home/productions`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('new-production-name').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('new-production-name').fill(showName);
  await page.getByTestId('new-production').click();
  // Creating one lands you ON the production page - there is no list to click through. The row
  // fallback is for a build that only adds the card.
  const productionPage = page.getByTestId('production-page');
  await productionPage.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
    const row = page.locator('[data-testid^="production-row-"]', { hasText: showName });
    await row.waitFor({ state: 'visible', timeout: 15_000 });
    await row.getByTestId('open-production').click();
    await productionPage.waitFor({ state: 'visible', timeout: 30_000 });
  });
  mark('production made');

  // ── The saved graphic into it, from the library picker at the foot of the rundown. One cue,
  //    so it is the selected one and TAKE needs no rundown click. ──
  const pick = page.getByTestId('add-graphic-pick');
  await pick.waitFor({ state: 'visible', timeout: 20_000 });
  // The picker is built from the library the page loaded WITH, so a graphic that arrived in the
  // same second can be missing from it. One reload is the whole repair.
  for (let tries = 0; await pick.locator('option', { hasText: graphicName }).count() === 0; tries++) {
    if (tries >= 6) throw new Error(`"${graphicName}" never appeared in the production's library picker`);
    await new Promise((r) => setTimeout(r, 2_000));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await pick.waitFor({ state: 'visible', timeout: 20_000 });
  }
  await pick.selectOption({ label: graphicName });
  await page.getByTestId('add-graphic').click();
  await page.getByTestId('cue-editor').waitFor({ state: 'visible', timeout: 20_000 });
  mark('the saved graphic is in the production');

  await page.getByTestId('production-publish').click();
  await page.getByTestId('production-mode').filter({ hasText: 'SHOW' }).waitFor({ timeout: 60_000 });
  const links = page.getByTestId('production-links');
  await links.waitFor({ state: 'visible', timeout: 20_000 });
  const outputUrl = (
    await links
      .locator('.prod-link-item', { has: page.getByTestId('copy-output-url') })
      .locator('code.prod-url')
      .textContent()
  )?.trim();
  if (!outputUrl) throw new Error('the links popover showed no output URL');
  await page.getByTestId('production-links-toggle').click();
  mark(`published -> ${outputUrl}`);

  // ── The public output URL, in a context with no session at all: the viewer's side. ──
  const viewer = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  output = await viewer.newPage();
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.goto(`${outputUrl}${outputUrl.includes('?') ? '&' : '?'}debug=1`, { waitUntil: 'domcontentloaded' });

  /**
   * How visible the graphic is to somebody watching, as a single number.
   *
   * Two opacities multiply, and reading only the inner one is a false pass: a fresh output page
   * replays the rows it missed with the whole STAGE hidden (`stage.setVisible(false)`, 1200 ms
   * settle in src/output/main.ts), so the graphic can be played, opaque inside its own iframe,
   * and painting nothing a viewer could see. Measured that way once and the screenshot was black
   * while the poll said "on air". The stage carries no class, so it is reached as the sandboxed
   * iframe's parent - the frame itself must go through Playwright, since `allow-scripts` without
   * `allow-same-origin` puts its document out of the page's reach.
   */
  const stageOpacity = () =>
    output
      .evaluate(() => {
        const frame = document.querySelector('iframe');
        return frame?.parentElement ? Number(getComputedStyle(frame.parentElement).opacity) : 0;
      })
      .catch(() => 0);

  const visibility = async () => {
    const stage = await stageOpacity();
    if (!(stage > 0.9)) return 0;
    const inner = await output
      .frameLocator('iframe')
      .locator('.scoreboard')
      .evaluate((el) => Number(getComputedStyle(el).opacity))
      .catch(() => 0);
    return stage * inner;
  };

  // Let the page finish its boot catch-up before anything is taken: an output URL in a browser
  // source is opened once and left there, so a take that lands mid-recovery is not the thing a
  // show does. The stage has to be up for a clear 1.5 s, which outlasts the 1200 ms settle.
  const settleUntil = Date.now() + 30_000;
  for (let up = 0; up < 1500; ) {
    up = (await stageOpacity()) > 0.9 ? up + 200 : 0;
    if (Date.now() > settleUntil) throw new Error('the output page never settled with its stage up');
    await new Promise((r) => setTimeout(r, 200));
  }
  mark('the output URL is open and settled, with nothing on air');
  await shot(output, '1-output-empty');

  /** Poll until a viewer could actually see the graphic - the moment the entrance starts painting. */
  const onAir = async (timeoutMs = 60_000) => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      if ((await visibility()) > 0.9) return Date.now();
      if (Date.now() > until) throw new Error('the graphic never became visible on the output URL');
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  /**
   * Poll until the graphic is READABLE, which is a later moment than "on air" and the one a room
   * means. The root goes opaque as the entrance begins - the first screenshot of this walk caught
   * an empty panel with its accent bar, text still travelling under its mask - so the team name is
   * followed until it is opaque AND has stopped moving for two samples.
   */
  const readable = async (timeoutMs = 30_000) => {
    const name = output.frameLocator('iframe').locator('#f0');
    const until = Date.now() + timeoutMs;
    let previous = null;
    for (;;) {
      const now = await name
        .evaluate((el) => {
          const box = el.getBoundingClientRect();
          return {
            at: `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`,
            opacity: Number(getComputedStyle(el).opacity),
            text: (el.textContent ?? '').trim(),
          };
        })
        .catch(() => null);
      if (now && now.opacity > 0.9 && now.text && previous && previous === now.at) return Date.now();
      previous = now && now.opacity > 0.9 ? now.at : null;
      if (Date.now() > until) throw new Error('the graphic never settled into a readable frame');
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  // ── TAKE. Two stops: the entrance starting, and the frame a person can read. ──
  const takePressed = Date.now();
  await page.getByTestId('verb-take').click();
  const airAt = await onAir();
  marks.push({ label: 'on air (the entrance starts)', at: airAt });
  const readableAt = await readable();
  marks.push({ label: 'readable', at: readableAt });
  await shot(output, '2-output-on-air');
  await shot(page, '3-production-page');

  // ── The repeat a show actually makes: off, then on again, over a warm wire with the output
  //    page already open. This is the number to quote for a cue change during a broadcast.
  //
  //    The OUT has to be PROVEN, not slept through. `onAir()` is a level test, so pressing TAKE
  //    while the graphic is still up would return on the first poll and print the click latency
  //    as the time to air - a fabricated number indistinguishable from a real one. ──
  await page.getByTestId('verb-out').click();
  const offBy = Date.now() + 30_000;
  for (;;) {
    if ((await visibility()) < 0.05) break;
    if (Date.now() > offBy) throw new Error('the graphic never left air, so the second take cannot be timed');
    await new Promise((r) => setTimeout(r, 100));
  }
  const secondPress = Date.now();
  await page.getByTestId('verb-take').click();
  const secondAir = await onAir();
  const secondReadable = await readable();
  await shot(output, '4-output-second-take');

  const seconds = (from, to) => ((to - from) / 1000).toFixed(1);
  console.log('\n=== R2.5, the last hop, measured against %s ===', origin);
  console.log(`graphic "${graphicName}" -> production "${showName}" -> ${outputUrl}`);
  for (let i = 1; i < marks.length; i++) {
    console.log(`  ${marks[i].label}: +${seconds(marks[i - 1].at, marks[i].at)} s`);
  }
  console.log(`\n  SAVE RETURNED -> READABLE ON THE OUTPUT URL: ${seconds(savedAt, readableAt)} s`);
  console.log(`  (on air, entrance starting, at ${seconds(savedAt, airAt)} s. Driven, and it includes`
    + ' opening the output URL from cold and waiting out its 1.2 s boot settle - a browser source'
    + ' is opened once and left there)');
  console.log(`  of which the take itself: ${seconds(takePressed, airAt)} s to the entrance,`
    + ` ${seconds(takePressed, readableAt)} s to a readable frame`);
  console.log(`  a second take, warm, output page already open: ${seconds(secondPress, secondAir)} s`
    + ` to the entrance, ${seconds(secondPress, secondReadable)} s to a readable frame`);
  console.log(`  (login ${seconds(loginStarted, exited.at)} s, scaffold ${(scaffold.ms / 1000).toFixed(1)} s, save ${(save.ms / 1000).toFixed(1)} s)`);
} catch (e) {
  failure = e;
  console.error(`[air] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  await shot(page, 'failure-app');
  if (output) await shot(output, 'failure-output');
} finally {
  // ── Put the account back. A production left published keeps its address and shadows the next
  //    run; an unwiped graphic makes the next name-addressed read ambiguous. ──
  try {
    await page.getByTestId('verb-out').click({ timeout: 5_000 }).catch(() => undefined);
    await page.getByTestId('production-links-toggle').click({ timeout: 5_000 }).catch(() => undefined);
    await page.getByTestId('production-unpublish').click({ timeout: 5_000 }).catch(() => undefined);
    await page.getByTestId('production-mode').filter({ hasText: 'NOT PUBLISHED' }).waitFor({ timeout: 20_000 }).catch(() => undefined);

    await page.goto(`${origin}/app#/home/productions`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('[data-testid^="production-row-"]', { hasText: showName });
    if (await row.count()) {
      await row.getByRole('button', { name: /^Delete/ }).first().click();
      await row.getByRole('button', { name: 'Delete?' }).click();
    }
    await page.goto(`${origin}/app#/home/graphics`, { waitUntil: 'domcontentloaded' });
    const graphic = page.locator('[data-testid^="graphic-row-"]', { hasText: graphicName });
    if (await graphic.count()) {
      await graphic.first().getByTestId('row-menu').click();
      const del = page.getByTestId('delete-graphic');
      await del.click();
      await del.click();
    }
    console.log('[air] account cleaned: production unpublished and deleted, graphic deleted');
  } catch (e) {
    console.error(`[air] CLEANUP INCOMPLETE - "${showName}" / "${graphicName}" may still exist: ${e instanceof Error ? e.message : String(e)}`);
  }
  // The key is this machine's; revoking it on the deployment is what `logout` does by default.
  const out = await noacg(['logout']);
  console.log(`[air] logout exit ${out.code}: ${out.stdout.trim()}`);
  await context.close();
  await browser.close();
}

process.exit(failure ? 1 : 0);
