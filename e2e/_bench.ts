import type { Page } from '@playwright/test';

// Shared by e2e/bench.spec.ts (fast fixtures + design-adjustment checks) and
// e2e/catalog/catalog-bench.spec.ts (the exhaustive per-variant calibration tripwire) - kept in
// one place so the two specs can't drift on what "bench()" means in-page.

export async function toApp(page: Page) {
  await page.goto('/app');
  await page.keyboard.press('Escape'); // close the creation wizard - these tests run in-page
}

// Runs in the page: the bench import + a minimal SpxTemplate factory for fixtures.
export const HELPERS = `
  async function bench(tpl, opts) {
    const { benchTemplateRuntime } = await __noacgImport('/src/validation/runtimeBench.ts');
    const res = await benchTemplateRuntime(tpl, opts);
    return { ok: res.ok, errors: res.errors, warnings: res.warnings };
  }
  function fixture(over) {
    return Object.assign({
      name: 'Bench fixture', type: 'blank',
      resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25,
      html: '',
      // Keyed-graphic contract (bench-preplay): nothing renders before play() - the root
      // starts CSS-hidden and FIXTURE_JS's play() reveals it with an inline override.
      css: '.fx { visibility: hidden; }',
      js: '', fields: [], settings: { steps: '1' }, assets: [], layers: [],
    }, over);
  }
  // The smallest honest runtime: root visibility toggles + field writes.
  const FIXTURE_JS =
    "window.update = function (data) {" +
    "  var v = JSON.parse(data);" +
    "  Object.keys(v).forEach(function (k) {" +
    "    var el = document.getElementById(k);" +
    "    if (el) el.textContent = v[k];" +
    "  });" +
    "};" +
    "window.play = function () { document.querySelector('.fx').style.visibility = 'visible'; };" +
    "window.stop = function () { document.querySelector('.fx').style.visibility = 'hidden'; };" +
    "window.next = function () {};";
  function doc(body) {
    return '<!DOCTYPE html><html><head><style>.fx{visibility:hidden}</style></head><body>' +
      body + '</body></html>';
  }
`;

export const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);
