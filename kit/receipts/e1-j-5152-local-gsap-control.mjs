import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<svg width="960" height="270"><g id="owned" style="--base-anchor-x: -1500.000735px"><rect width="100" height="100"/></g></svg><div id="raw" style="--base-anchor-x: 40px"></div>');
  await page.addScriptTag({ content: readFileSync(new URL('../src/assets/gsap.min.js', import.meta.url), 'utf8') });
  const result = await page.evaluate(() => {
    const gsap = window.gsap, owned = document.getElementById('owned'), raw = document.getElementById('raw');
    const property = '__noacgPivotProbe', axis = '--base-anchor-x', units = 1000000;
    const read = () => parseFloat(getComputedStyle(owned).getPropertyValue(axis));
    Object.defineProperty(owned, property, { configurable: true, get: () => read() * units, set: value => owned.style.setProperty(axis, value / units + 'px') });
    raw.noacgAnchorX = 70;
    const before = gsap.getProperty(owned, property);
    const tween = gsap.timeline({ paused: true }).set('#owned', { [property]: -1500000735 }, 0)
      .to('#owned', { [property]: -1499999921, duration: 1, ease: 'none' }, 0);
    tween.render(.5, true, true);
    const midway = read(), getter = gsap.getProperty(owned, property);
    gsap.set(raw, { noacgAnchorX: 90 });
    gsap.killTweensOf('#owned');
    tween.render(.75, true, true);
    return { before, midway, getter, afterKill: read(), rawProperty: raw.noacgAnchorX, rawPivot: raw.style.getPropertyValue(axis), plugin: !!gsap.plugins[property] };
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.before !== -1500000735 || Math.abs(result.midway - -1500.000328) > 1e-10 || Math.abs(result.getter - -1500000328) > .001
    || result.afterKill !== result.midway || result.rawProperty !== 90 || result.rawPivot !== '40px' || result.plugin) process.exitCode = 1;
} finally { await browser.close(); }
