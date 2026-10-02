// Drive the pattern fixture (contract.md §5e) in headless Chrome and print what each pattern does.
// Run from the repository root after `npm --prefix cli ci`:
//   node docs/research/plugin-graphics-quality-2026-10-02/evidence/d1-runs/pattern-bench-drive.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../../../cli/package.json'));
const { chromium } = require('playwright-core');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, 'pattern-bench-package', 'pattern_bench.html')).href);
const wait = (ms) => page.waitForTimeout(ms);
const look = async (label) => {
  const s = await page.evaluate(() => ({
    groups: noacgMachineState().groups,
    placeShown: getComputedStyle(document.getElementById('f1').parentNode).display !== 'none',
    score: document.getElementById('f2').textContent,
    timer: document.querySelector('.graphic-timer').textContent,
    status: document.querySelector('.graphic-status').textContent,
  }));
  console.log(label.padEnd(44), JSON.stringify(s));
};

await page.evaluate(() => { update({ f0: 'Anna Virtanen', f1: '', f2: '0', f3: '3', f4: 'FINAL' }); play(); });
await wait(1500); await look('take, Place empty');
await page.evaluate(() => update({ f1: 'Oulu' })); await wait(200); await look('update Place = Oulu');
await page.evaluate(() => update({ f1: '  ' })); await wait(200); await look('update Place = spaces');
await page.evaluate(() => noacgDispatch('goal', { f2: '1' })); await wait(300); await look('goal (self-loop group)');
await page.evaluate(() => noacgDispatch('timerStart')); await wait(1300); await look('timerStart, 1.3 s');
await wait(2600); await look('3.9 s: timer ended itself');
await wait(2500); await look('6.4 s: timer arrow back to idle');
await page.evaluate(() => noacgDispatch('final')); await wait(500); await look('final');
await page.evaluate(() => update({ f4: 'LOPPU' })); await wait(200); await look('update word f4 = LOPPU');
await page.evaluate(() => noacgDispatch('goal', { f2: '2' })); await wait(300); await look('goal in final state');
await page.evaluate(() => noacgDispatch('timerStart')); await wait(300);
await page.evaluate(() => play()); await wait(1500); await look('re-take mid-timer, in final');
await wait(3500); await look('3.5 s later: no stray timerEnd');
await browser.close();
