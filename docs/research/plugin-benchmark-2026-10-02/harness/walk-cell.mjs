// Walks one benchmark cell's package through the local NoaCG studio the way a user would after
// the agent hands over a zip: Import graphics -> a new production -> its Playout page. Then it
// measures which live controls the operator reaches without scrolling (1600x900 window), takes
// the graphic, runs the cell's own steps (fills and presses that exercise the brief), presses
// every declared action once, steps Next if the graphic has steps, and takes it out. It saves the
// whole page and the PROGRAM monitor at each point.
// Differs from ../plugin-graphics-quality-2026-10-02/harness/walk-studio.mjs in two ways: the
// action pass and the reach measurement are generic, so one script walks any cell's package.
// Usage: node walk-cell.mjs <zip> <outDir> [steps.json]
// NOACG_URL picks the studio (default http://localhost:5206, this benchmark's dev server).
// Playwright comes from this checkout's cli/node_modules (run `npm ci` in cli/ first).
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import(new URL('../../../../cli/node_modules/playwright-core/index.mjs', import.meta.url));
const [zip, outDir, stepsFile] = process.argv.slice(2);
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [];
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.NOACG_URL || 'http://localhost:5206';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const log = [];
page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') log.push('console.error: ' + m.text()); });
const tid = (id) => page.locator(`[data-testid="${id}"]`);
let n = 0;

async function shot(name, withPage = true) {
  n += 1;
  const stem = `${String(n).padStart(2, '0')}-${name}`;
  if (withPage) await page.screenshot({ path: path.join(outDir, stem + '-page.jpg'), type: 'jpeg', quality: 80 });
  await tid('program-stage').screenshot({ path: path.join(outDir, stem + '-program.png') });
  log.push('shot ' + stem);
}

// Which live controls are fully on screen with the page as it opens (no scrolling): the verbs,
// every declared action button and every live-number stepper. Clipping by a scrolling ancestor
// counts as off screen.
async function reach() {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) {
          const ar = a.getBoundingClientRect();
          if (r.top < ar.top || r.bottom > ar.bottom) return false;
        }
      }
      return true;
    };
    const sel = '[data-testid^="cue-action-"], [data-testid^="live-number-"], [data-testid="verb-take"], [data-testid="verb-update"], [data-testid="verb-next"], [data-testid="verb-out"]';
    return [...document.querySelectorAll(sel)].map((el) => ({
      id: el.getAttribute('data-testid'),
      label: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      onScreen: visible(el),
      top: Math.round(el.getBoundingClientRect().top),
    }));
  });
}

async function runStep(s) {
  if (s.wait) await page.waitForTimeout(s.wait);
  else if (s.click) await tid(s.click).click();
  else if (s.action) await tid('cue-action-' + s.action).click();
  else if (s.button) await page.getByRole('button', { name: s.button, exact: !!s.exact }).first().click();
  else if (s.fill) await tid('cue-field-' + s.fill).fill(s.value);
  else if (s.check !== undefined) await tid('cue-field-' + s.check).setChecked(!!s.on);
  else if (s.select) await tid('cue-field-' + s.select).getByRole('button', { name: s.value, exact: true }).click();
  else if (s.key) await page.keyboard.press(s.key);
  else if (s.shot) await shot(s.shot, s.page !== false);
}

try {
  await page.goto(base + '/app#/new');
  await page.getByText('Import graphics', { exact: true }).first().click();
  await page.locator('input[type=file]').first().setInputFiles(zip);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByPlaceholder('Untitled production').fill('Benchmark walk');
  await page.getByText('Add to the production and go live').click();
  await page.getByRole('button', { name: 'Add it and go there' }).click();
  await page.waitForURL(/#\/production\//, { timeout: 15000 });
  await page.waitForTimeout(1500);

  log.push('panel at load: ' + (await tid('control-area').innerText()).replace(/\s+/g, ' ').slice(0, 2000));
  const r = await reach();
  fs.writeFileSync(path.join(outDir, 'reach.json'), JSON.stringify(r, null, 2) + '\n');
  const off = r.filter((x) => !x.onScreen);
  log.push(`reach: ${r.length - off.length} of ${r.length} live controls on screen at load` + (off.length ? `; below the fold: ${off.map((x) => x.label).join(' | ')}` : ''));
  await shot('ready');

  await tid('verb-take').click();
  await page.waitForTimeout(2500);
  await shot('take');

  for (const s of steps) await runStep(s);

  // Press every declared action once, in panel order; a disabled one is retried on a later pass,
  // because some actions only open up after another (a timer stop after its start).
  const ids = await page.locator('[data-testid^="cue-action-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const pressed = new Set(steps.filter((s) => s.action).map((s) => 'cue-action-' + s.action));
  for (let pass = 0; pass < 3; pass += 1) {
    for (const id of ids) {
      if (pressed.has(id)) continue;
      const el = tid(id);
      if (!(await el.count()) || (await el.isDisabled())) continue;
      await el.click();
      pressed.add(id);
      await page.waitForTimeout(2200);
      await shot('action-' + id.replace('cue-action-', ''), false);
    }
  }
  const never = ids.filter((id) => !pressed.has(id));
  log.push(`actions: ${pressed.size} of ${ids.length} declared actions pressed` + (never.length ? `; never enabled: ${never.join(', ')}` : ''));
  await shot('after-actions');

  if ((await tid('verb-next').count()) && !(await tid('verb-next').isDisabled())) {
    await tid('verb-next').click();
    await page.waitForTimeout(2000);
    await shot('next', false);
  }
  await tid('verb-out').click();
  await page.waitForTimeout(2000);
  await shot('out', false);
} catch (e) {
  log.push('FAILED: ' + e.message.split('\n')[0]);
  await page.screenshot({ path: path.join(outDir, 'failure.jpg'), type: 'jpeg', quality: 70 });
} finally {
  fs.writeFileSync(path.join(outDir, 'walk-log.txt'), log.join('\n') + '\n');
  console.log(log.join('\n'));
  await browser.close();
}
