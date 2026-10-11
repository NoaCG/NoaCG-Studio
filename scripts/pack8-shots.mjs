// Capture the public-service pack (tickers / alerts / public information) as settled
// on-air frames, plus the alert severity ramp and the language rotator's two states.
//
//   node scripts/pack8-shots.mjs <out-dir>          (dev server must be running)
//
// Deliberately not part of the e2e suite: it produces evidence to LOOK at, it does not
// assert. The assertions live in e2e/public-service.spec.ts.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { outDir } from './out-dir.mjs';

const out = outDir(process.argv[2], 'pack8-out', 'Usage: node scripts/pack8-shots.mjs [out-dir]');
mkdirSync(out, { recursive: true });
const port = execSync('node scripts/dev-port.mjs', { windowsHide: true }).toString().trim();
const base = `http://localhost:${port}`;

const IDS = [
  'tk11', 'tk12', 'tk13', 'tk14', 'tk15', 'tk16', 'tk17', 'tk18', 'tk19', 'tk20', 'tk21',
  'al01', 'al02', 'al03', 'al04', 'al05', 'al06', 'al07', 'al08', 'al09', 'al10', 'al11', 'al12',
  'pi01', 'pi02', 'pi03', 'pi04', 'pi05', 'pi06', 'pi07', 'pi08', 'pi09', 'pi10',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${base}/app`);
await page.keyboard.press('Escape');
await page.waitForSelector('.topbar');

// The graphic itself, in its own frame, over a mid-grey card so translucency is visible.
await page.evaluate(() => {
  document.body.innerHTML =
    '<div style="width:1920px;height:1080px;background:' +
    'linear-gradient(115deg,#5b6472 0%,#39414d 42%,#7d6a55 100%)">' +
    '<iframe id="stage" style="width:1920px;height:1080px;border:0" ></iframe></div>';
});

async function render(id, { events = [], settleMs = 900 } = {}) {
  await page.evaluate(async ([variantId, evs]) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const tpl = variantById(variantId).create({});
    const frame = document.getElementById('stage');
    await new Promise((res) => { frame.onload = res; frame.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 120));
    const w = frame.contentWindow;
    w.play();
    for (const ev of evs) { await new Promise((r) => setTimeout(r, 500)); w.noacgDispatch(ev); }
  }, [id, events]);
  await page.waitForTimeout(settleMs);
}

for (const id of IDS) {
  await render(id);
  await page.screenshot({ path: join(out, `${id}.png`) });
  process.stdout.write(`${id} `);
}

// The alert severity ramp: the same graphic at each of its four levels.
for (const level of ['watch', 'warning', 'emergency']) {
  await render('al01', { events: [level] });
  await page.screenshot({ path: join(out, `al01-${level}.png`) });
  process.stdout.write(`al01-${level} `);
}

// The language rotator's second language (the timer swaps at 7s; the event is instant).
await render('pi08', { events: ['lang2'], settleMs: 1200 });
await page.screenshot({ path: join(out, 'pi08-lang2.png') });

console.log('\nwrote', IDS.length + 4, 'frames to', out);
await browser.close();
