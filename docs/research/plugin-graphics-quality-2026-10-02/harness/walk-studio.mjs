// Drives the local NoaCG studio the way a user would after the agent hands over a zip: Import
// graphics -> add to a new production -> the production's Playout page, then runs a list of
// operator steps (fill a field, press Take/Update/Next/Out or a declared control) and saves
// screenshots of the whole page and of the PROGRAM monitor.
// Usage: node walk-studio.mjs <zip> <steps.json> <outDir>
import { chromium } from 'file:///C:/claude/NoaCG-Studio/.claude/worktrees/agent-ac88e8174d9853a2e/cli/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [zip, stepsFile, outDir] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.NOACG_URL || 'http://localhost:5240';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const log = [];
page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') log.push('console.error: ' + m.text()); });
const tid = (id) => page.locator(`[data-testid="${id}"]`);

try {
  await page.goto(base + '/app#/new');
  await page.getByText('Import graphics', { exact: true }).first().click();
  await page.locator('input[type=file]').first().setInputFiles(zip);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByPlaceholder('Untitled production').fill('Plugin walk');
  await page.getByText('Add to the production and go live').click();
  await page.getByRole('button', { name: 'Add it and go there' }).click();
  await page.waitForURL(/#\/production\//, { timeout: 15000 });
  await page.waitForTimeout(1500);

  let n = 0;
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    else if (s.click) await tid(s.click).click();
    else if (s.button) await page.getByRole('button', { name: s.button, exact: !!s.exact }).first().click();
    else if (s.fill) await tid('cue-field-' + s.fill).fill(s.value);
    else if (s.check !== undefined) await tid('cue-field-' + s.check).setChecked(!!s.on);
    else if (s.select) await tid('cue-field-' + s.select).getByRole('button', { name: s.value, exact: true }).click();
    else if (s.key) await page.keyboard.press(s.key);
    else if (s.shot) {
      n += 1;
      const stem = `${String(n).padStart(2, '0')}-${s.shot}`;
      await page.screenshot({ path: path.join(outDir, stem + '-page.jpg'), type: 'jpeg', quality: 80 });
      await tid('program-stage').screenshot({ path: path.join(outDir, stem + '-program.png') });
      log.push('shot ' + stem);
    } else if (s.text) {
      log.push(s.text + ': ' + (await tid(s.from || 'control-area').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
    }
  }
} catch (e) {
  log.push('FAILED: ' + e.message.split('\n')[0]);
  await page.screenshot({ path: path.join(outDir, 'failure.jpg'), type: 'jpeg', quality: 70 });
} finally {
  fs.writeFileSync(path.join(outDir, 'walk-log.txt'), log.join('\n') + '\n');
  console.log(log.join('\n'));
  await browser.close();
}
