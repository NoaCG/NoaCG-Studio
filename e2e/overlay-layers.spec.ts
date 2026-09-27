// covers: none - its subject, the layer scale in src/styles/base.css, is CORE: a change there runs
// the full suite, or the focus set this spec is in
//
// WHAT PAINTS OVER WHAT. It belongs to the sprint because of the failure that produced it:
// a corner notice outranked every dialog in the app, so an undecided first-time visitor
// could not press the wizard's own "Add it and go there" - the student's last click before
// a production. The offline suite is also the only tier that can hold this: the banner that
// caused it exists only on a configured deployment, which is why it went unseen until the
// scheduled configured run failed on it.
// focus

import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';

// THE LAYER SCALE (src/styles/base.css): what is allowed to paint over what.
//
// A dialog claims the whole app, so nothing the user did not ask for may sit on top of one.
// That held by luck until 2026-09-03, when the analytics consent banner's bare `z-index: 1200`
// was measured against the dialog layer's bare 140 and won over all sixteen of the app's
// dialogs. An undecided visitor could not press the wizard's "Add it and go there" at all, and
// the scheduled configured suite failed on that exact click (issue #50). Six configured specs
// had already been taught to answer the banner before driving anything, each recording the
// overlap as somebody else's problem.
//
// The scale has two claims to keep, and losing either one is a bug:
//   - a notice must not take a click from a DIALOG - what broke;
//   - a notice must still be READABLE over the full-screen wizard, which is a page and not a
//     question. It is opaque, so "below dialogs" applied to it too would hide the consent
//     banner for the whole of a first visit - `/app` opens that wizard immediately.
// One test each, plus a stylesheet audit that fails on the next bare number.

/** Everything allowed at or above the modal layer, and why each one has earned it. */
const ABOVE_MODAL_IS_INTENDED = [
  '.gallery-backdrop', // the modal layer itself - every dialog in the app wears it
  '.gallery-backdrop.wz-over', // a dialog raised over another dialog
  '.auth-gate', // the sign-in card, which the dialog under it is usually what asked for
];

interface LayerRule {
  selector: string;
  raw: string;
  value: number | null;
}

/**
 * Every z-index the app's own stylesheet declares, resolved through the scale's tokens.
 *
 * Scoped to OUR css: Vite tags each imported file's <style> with `data-vite-dev-id`, so a
 * dependency's sheet (Monaco ships its own high layers) can never be read as our finding. A
 * value this cannot resolve is kept with `value: null` rather than dropped - a declaration the
 * audit cannot read is the thing the audit exists to catch, not a reason to look away.
 */
async function declaredLayers(page: Page): Promise<{ sheets: number; rules: LayerRule[] }> {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const rules: { selector: string; raw: string; value: number | null }[] = [];
    let sheets = 0;

    const resolve = (raw: string): number | null => {
      const token = raw.match(/^var\((--[\w-]+)\)$/);
      const literal = token ? rootStyle.getPropertyValue(token[1]).trim() : raw.trim();
      return /^-?\d+$/.test(literal) ? Number.parseInt(literal, 10) : null;
    };

    const walk = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        const grouping = rule as CSSRule & { cssRules?: CSSRuleList };
        if (grouping.cssRules) walk(grouping.cssRules);
        const style = (rule as CSSStyleRule).style;
        if (!style) continue;
        const raw = style.getPropertyValue('z-index').trim();
        if (!raw || raw === 'auto') continue;
        rules.push({ selector: (rule as CSSStyleRule).selectorText ?? '', raw, value: resolve(raw) });
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      const id = (sheet.ownerNode as HTMLElement | null)?.getAttribute?.('data-vite-dev-id') ?? '';
      const from = id || sheet.href || '';
      if (!/[/\\]src[/\\]/.test(from) || from.includes('node_modules')) continue;
      try {
        sheets += 1;
        walk(sheet.cssRules);
      } catch {
        // A cross-origin sheet cannot be read; ours always can.
      }
    }
    return { sheets, rules };
  });
}

/** The one selector part an allow-list entry may be, rather than any selector containing it. */
function isAllowed(selectorText: string): boolean {
  return selectorText
    .split(',')
    .map((part) => part.trim())
    .every((part) => ABOVE_MODAL_IS_INTENDED.includes(part));
}

test('the layer scale: nothing the user did not ask for outranks a dialog', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // The scale is defined and ordered. Read from the live document rather than the file, so a
  // token deleted or shadowed further down the cascade fails here too.
  const scale = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const read = (n: string) => Number.parseInt(s.getPropertyValue(n).trim(), 10);
    return {
      fullscreen: read('--z-fullscreen-surface'),
      notice: read('--z-notice'),
      popover: read('--z-popover'),
      modal: read('--z-modal'),
      modalOver: read('--z-modal-over'),
      authGate: read('--z-auth-gate'),
    };
  });
  expect(Object.values(scale).every(Number.isFinite)).toBe(true);
  expect(scale.fullscreen).toBeLessThan(scale.notice);
  expect(scale.notice).toBeLessThan(scale.popover);
  expect(scale.popover).toBeLessThan(scale.modal);
  expect(scale.modal).toBeLessThan(scale.modalOver);
  expect(scale.modalOver).toBeLessThan(scale.authGate);

  const { sheets, rules } = await declaredLayers(page);
  // A run that read no stylesheet has not proved anything. It means the harness is looking at
  // bundled CSS (`vite preview`, a deployment) where Vite's per-file dev ids do not exist -
  // which must say so rather than read as "the app lost its layer scale". Dev serves the 30
  // parts as few sheets, not thirty: styles/index.css @imports them and Vite inlines it.
  expect(sheets, 'no source stylesheet was readable - is this a bundled build rather than the dev server?').toBeGreaterThan(0);
  // The sweep that found the 1200 read ~40 declarations; a handful means the filter ate the
  // stylesheet rather than that the stylesheet is clean.
  expect(rules.length).toBeGreaterThan(20);

  // Nothing the audit cannot read: `var(--x, 100)` and `calc(...)` are numbers answering to
  // nothing again, which is the shape this guard exists to stop.
  const unreadable = rules.filter((r) => r.value === null);
  expect(
    unreadable.map((r) => `${r.selector} { z-index: ${r.raw} }`),
    'a z-index must be a plain number or a bare var(--token) from the scale, so it can be audited',
  ).toEqual([]);

  const trespassers = rules.filter((r) => r.value! >= scale.modal).filter((r) => !isAllowed(r.selector));
  expect(
    trespassers.map((r) => `${r.selector} { z-index: ${r.raw} }`),
    'a floating surface may not outrank the modal layer - put it on the scale in src/styles/base.css',
  ).toEqual([]);

  // And no floating surface writes a bare number: the scale only holds if things join it.
  const bareNumbers = rules.filter((r) => !r.raw.startsWith('var(')).filter((r) => r.value! >= scale.fullscreen);
  expect(
    bareNumbers.map((r) => `${r.selector} { z-index: ${r.raw} }`),
    'a surface at or above the full-screen layer must read its z-index from the scale, not a literal',
  ).toEqual([]);
});

/**
 * Mount both notices. Neither can be DRIVEN offline - the consent banner only exists on a
 * configured deployment (components/AnalyticsConsentBanner.tsx returns null otherwise) and the
 * storage-health notice needs a failed durable store - so this is real markup wearing the real
 * classes, and the CSS under test is the same CSS.
 */
async function mountNotices(page: Page, box: { x: number; y: number; width: number; height: number } | null) {
  await page.evaluate((over) => {
    for (const cls of ['analytics-consent', 'storage-health-notice']) {
      const el = document.createElement('aside');
      el.className = cls;
      el.dataset.testid = cls;
      el.innerHTML = '<div><strong>Notice</strong></div>';
      if (over) {
        // Parked ON the target, with a box that covers it outright. Whether the corner a notice
        // normally sits in happens to reach a given dialog's footer is a question about viewport
        // height, and pinning THAT would pass on a tall runner while a laptop still lost the
        // click. Overlap is the premise here, not the subject - so it is made certain, and
        // asserted below rather than assumed.
        el.style.left = `${over.x - 30}px`;
        el.style.top = `${over.y - 30}px`;
        el.style.width = `${over.width + 60}px`;
        el.style.height = `${over.height + 60}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
      document.body.appendChild(el);
    }
  }, box);
  await expect(page.getByTestId('analytics-consent')).toBeVisible();
  await expect(page.getByTestId('storage-health-notice')).toBeVisible();
}

/** What the user's pointer would actually hit at this point, as a list of classes upward. */
async function topmostAt(page: Page, x: number, y: number): Promise<string[]> {
  return page.evaluate(({ px, py }) => {
    const out: string[] = [];
    let el = document.elementFromPoint(px, py);
    while (el) {
      if (el.className && typeof el.className === 'string') out.push(...el.className.split(/\s+/).filter(Boolean));
      el = el.parentElement;
    }
    return out;
  }, { px: x, py: y });
}

test('a corner notice cannot take a dialog button click away from the dialog', async ({ page }) => {
  // The walk from issue #50, up to the click that failed.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  await page.getByTestId('wz-finish-production-go').click();
  await expect(page.getByTestId('wz-finish-production-confirm')).toBeVisible();

  // A dialog raised over the wizard must be PORTALLED OUT of it, not nested. The wizard's
  // shell is a positioned, z-indexed box and so a stacking context: anything inside it is
  // clamped below the root-level notices however high its own z-index goes, which is issue #50
  // again in a place the numbers all look right. WizardConfirm portals; MapSvgFieldsStep's
  // "what should happen to these words?" dialog did not until 2026-09-03.
  const nested = await page.evaluate(() =>
    document.querySelectorAll('.gallery-backdrop.wz-full .gallery-backdrop').length,
  );
  expect(nested, 'a dialog over the wizard must be portalled to the body, not nested inside it').toBe(0);

  const go = page.getByTestId('wz-finish-production-confirm-go');
  const box = (await go.boundingBox())!;
  await mountNotices(page, box);

  // The premise, asserted: each notice really does cover the point the click lands on. Without
  // this the test can pass by missing the button entirely and prove nothing.
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const cls of ['analytics-consent', 'storage-health-notice']) {
    const rect = (await page.getByTestId(cls).boundingBox())!;
    expect(centre.x, `${cls} must cover the button`).toBeGreaterThan(rect.x);
    expect(centre.x).toBeLessThan(rect.x + rect.width);
    expect(centre.y).toBeGreaterThan(rect.y);
    expect(centre.y).toBeLessThan(rect.y + rect.height);
  }

  // The dialog's own backdrop is what the pointer finds, not either notice. Asserting the
  // POSITIVE matters: both notices are mounted at the same rect, so "the analytics one is not
  // topmost" would stay true with the storage one on top of the dialog.
  const hit = await topmostAt(page, centre.x, centre.y);
  expect(hit).toContain('wz-over');
  expect(hit).not.toContain('analytics-consent');
  expect(hit).not.toContain('storage-health-notice');

  await go.click({ timeout: 5_000 });
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
});

test('a notice is still readable over the full-screen wizard, which is a page and not a question', async ({ page }) => {
  // The other half of the scale. `/app` opens the wizard straight away and its shell is OPAQUE
  // (`.gallery-backdrop.wz-full` drops the blur and paints `--bg-2`), so a notice ranked below
  // it is not dimmed - it is gone. That would hide the consent banner for the whole of a first
  // visit, which is the only visit it exists for, and hide the storage warning during exactly
  // the boot it is warning about.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await mountNotices(page, null); // its own corner, unmoved

  for (const cls of ['analytics-consent', 'storage-health-notice']) {
    const rect = (await page.getByTestId(cls).boundingBox())!;
    const hit = await topmostAt(page, rect.x + rect.width / 2, rect.y + rect.height / 2);
    expect(hit, `${cls} is behind the wizard shell instead of on top of it`).toContain(cls);
  }
});
