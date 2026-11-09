// THE PHONE PAGE'S LOOK, THE QR CODE AND THE JOIN CARD, on a blank page (interaction spec, phase 2).
// covers: src/audience/{joinSurface,joinColours,joinQr,audienceBrand}.ts
// covers: src/templates/audience/{joinCard,audienceRuntime,shared}.ts, src/templates/shared/qrEncoder.min.js
//
//   AC-5: the studio's QR code (SVG and PNG) decodes to the short link.
//   AC-6: the join surface shows the look's colours, font, logo, title and waiting text; a
//         low-contrast palette still meets WCAG AA; a broken logo shows no broken image; a failing
//         custom font falls back with the layout intact; a replaced or removed logo takes effect
//         on the next read.
//   AC-11: the Join card draws a QR that decodes to its Join link, live and exported with no network.
//
// Each QR is read from PIXELS by e2e/_qr.ts, as a phone camera would read it.

import { test, expect, type Frame, type Page } from '@playwright/test';
import { qrReader } from './_qr';

const LINK = 'https://noacg.studio/j/friday-night-live';
const PHONE = { width: 390, height: 844 };

/** A blank page on the app's origin with join.html's own page colours, the join surface loaded. */
async function phonePage(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.route('**/join-surface-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0b0b0d;color:#f4f4f5}</style><body><main id="join"></main></body>',
    }),
  );
  await page.goto('/join-surface-probe');
}

/**
 * Mount the surface over a client whose view the test sets (`window.__view`), and keep the handle
 * as `window.__join`. `round` picks what is live: none, an Open question or a Multiple choice one.
 */
async function mount(page: Page, view: Record<string, unknown>, round: 'none' | 'open' | 'choice' = 'none'): Promise<void> {
  await page.evaluate(
    async ({ view, round }) => {
      const { mountJoinSurface } = await import('/src/audience/joinSurface.ts');
      const state =
        round === 'none'
          ? { open: false, mode: 'waiting', round: null, prompt: '', presenter: { current: null, next: null } }
          : {
              open: true,
              mode: round === 'open' ? 'question' : 'poll',
              prompt: round === 'open' ? 'What should we ask the panel?' : 'Who wins tonight?',
              presenter: { current: null, next: null },
              round: {
                id: 'r1', kind: round === 'open' ? 'open' : 'poll', question: '', revision: 1, openedAt: '', closedAt: null, correctOption: null,
                options: round === 'open' ? [] : ['The home side', 'The visitors', 'A draw after extra time'],
              },
            };
      const w = window as unknown as { __view: Record<string, unknown>; __join: { refresh(): void } };
      w.__view = { productionName: 'Friday Night Live', state, mine: [], myVote: null, ...view };
      w.__join = mountJoinSurface(document.getElementById('join')!, {
        load: async () => w.__view as never,
        submit: async () => ({ ok: true, error: null }),
        vote: async () => ({ ok: true, error: null }),
      }, { poll: false });
    },
    { view, round },
  );
  await expect(page.locator('.nj-title')).toBeVisible();
}

/** A small PNG logo as a data URL, drawn in the page. */
const logoDataUrl = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 120, 40);
    return canvas.toDataURL('image/png');
  }, colour);

/** Every text and edge on the page with its contrast against what it sits on (WCAG 2). */
function contrastReport(page: Page) {
  return page.evaluate(() => {
    const parse = (v: string): number[] => (v.match(/[\d.]+/g) ?? []).map(Number);
    const over = (top: number[], under: number[]) => {
      const a = top.length > 3 ? top[3] : 1;
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a));
    };
    const lum = (c: number[]) =>
      c.slice(0, 3).reduce((sum, v, i) => {
        const s = v / 255;
        const lin = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        return sum + lin * [0.2126, 0.7152, 0.0722][i];
      }, 0);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The opaque colour behind an element: its ancestors' fills laid over the page. */
    const behind = (el: Element | null): number[] => {
      const chain: number[][] = [];
      for (let n = el; n && n instanceof HTMLElement; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg.length >= 3 && (bg.length === 3 || bg[3] > 0)) chain.push(bg);
      }
      let colour = [11, 11, 13];
      for (const layer of chain.reverse()) colour = over(layer, colour);
      return colour;
    };
    const out: { what: string; ratio: number; need: number }[] = [];
    const text = (selector: string) =>
      document.querySelectorAll(selector).forEach((el) => {
        if (!(el as HTMLElement).innerText.trim()) return;
        const style = getComputedStyle(el);
        if (Number(style.opacity) < 1) throw new Error(`${selector} is dimmed by opacity`);
        const own = parse(style.backgroundColor);
        const bg = own.length >= 3 && (own.length === 3 || own[3] > 0) ? behind(el) : behind(el.parentElement);
        const fg = over(parse(style.color), bg);
        out.push({ what: `text ${selector}`, ratio: ratio(fg, bg), need: 4.5 });
      });
    const edge = (selector: string) =>
      document.querySelectorAll(selector).forEach((el) => {
        const style = getComputedStyle(el);
        const bg = behind(el.parentElement);
        // A focused field draws its edge as the focus outline (its border goes transparent).
        const line = document.activeElement === el ? style.outlineColor : style.borderTopColor;
        out.push({ what: `edge ${selector}${document.activeElement === el ? ':focus' : ''}`, ratio: ratio(over(parse(line), bg), bg), need: 3 });
      });
    text('.nj-title');
    text('.nj-prompt');
    text('.nj-waiting');
    text('.nj-label');
    text('.nj-opt > span:last-child');
    text('.nj-key');
    text('.nj-send:not([disabled])');
    text('.nj-note');
    text('.nj-mine li');
    edge('.nj-card');
    edge('.nj-opt');
    edge('.nj-send:not([disabled])');
    edge('.nj input[type=text], .nj textarea');
    return out;
  });
}

test.describe('the phone page carries the production look (AC-6)', () => {
  test('colours, font, logo, title and waiting text appear', async ({ page }) => {
    await phonePage(page);
    const logo = await logoDataUrl(page, '#ff3366');
    await mount(page, {
      brand: {
        accent: '#ff3366', text: '#ffffff', panel: '#202040', font: '"Oswald", Arial, sans-serif',
        logo, title: 'Quiz Night', waiting: 'Back after the break',
      },
    });
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    await expect(page.locator('.nj-waiting')).toHaveText('Back after the break');
    const img = page.locator('img.nj-logo');
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(120);
    const look = await page.evaluate(async () => {
      await document.fonts.ready;
      const root = document.getElementById('join')!;
      return {
        font: getComputedStyle(root).fontFamily,
        accent: root.style.getPropertyValue('--nj-accent'),
        text: getComputedStyle(document.querySelector('.nj-waiting')!).color,
        oswald: document.fonts.check('16px Oswald'),
      };
    });
    expect(look.font).toContain('Oswald');
    expect(look.oswald, 'the bundled face is loaded, not only named').toBe(true);
    expect(look.accent).toBe('rgb(255, 51, 102)');

    // The look's colours where they pass, so a branded page is the brand's, not a safe grey.
    await page.evaluate(() => {
      const w = window as unknown as { __view: { state: unknown }; __join: { refresh(): void } };
      w.__view.state = {
        open: true, mode: 'question', prompt: 'What should we ask the panel?', presenter: { current: null, next: null },
        round: { id: 'r1', kind: 'open', question: '', options: [], revision: 1, openedAt: '', closedAt: null, correctOption: null },
      };
      w.__join.refresh();
    });
    await expect(page.locator('.nj-prompt')).toHaveText('What should we ask the panel?');
    expect(await page.locator('.nj-prompt').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('.nj-card').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 32, 64)');
  });

  test('without a look or page settings, the page shows the production name and the default waiting text', async ({ page }) => {
    await phonePage(page);
    await mount(page, { brand: null });
    await expect(page.locator('.nj-title')).toHaveText('Friday Night Live');
    await expect(page.locator('.nj-waiting')).toHaveText(/^Not taking part right now/);
    await expect(page.locator('img')).toHaveCount(0);
  });

  for (const [name, brand] of [
    ['dark on dark', { accent: '#1a1a1a', text: '#222222', panel: '#1c1c1c' }],
    ['light on light', { accent: '#ffff66', text: '#f0f0f0', panel: '#ffffff' }],
    ['a mid grey that passes nowhere', { accent: '#777777', text: '#6a6a6a', panel: 'rgba(120,120,120,.9)' }],
  ] as const) {
    test(`a low-contrast palette still meets AA: ${name}`, async ({ page }) => {
      await phonePage(page);
      for (const round of ['none', 'open', 'choice'] as const) {
        await page.evaluate(() => {
          (window as unknown as { __join?: { destroy(): void } }).__join?.destroy();
        });
        await mount(page, { brand: { ...brand, font: null, title: 'Low contrast', waiting: 'Waiting for the next question' }, mine: [{ id: 'm1', body: 'An earlier answer', createdAt: '' }] }, round);
        if (round === 'open') await page.locator('#nj-body').fill('A sentence to send');
        if (round === 'choice') {
          // A picked option, so the accent fill and its text are on the page too.
          await page.evaluate(() => {
            const w = window as unknown as { __view: { myVote: number }; __join: { refresh(): void } };
            w.__view.myVote = 1;
            w.__join.refresh();
          });
          await expect(page.locator('.nj-opt[aria-pressed=true]')).toHaveCount(1);
        }
        const report = await contrastReport(page);
        expect(report.length, `${round}: something was measured`).toBeGreaterThanOrEqual(3);
        const failing = report.filter((r) => r.ratio < r.need);
        expect(failing, `${name}, ${round}: every text 4.5:1 and every edge 3:1`).toEqual([]);
      }
    });
  }

  test('a broken logo URL shows the title and no broken image', async ({ page }) => {
    await phonePage(page);
    await page.route('**/broken-logo.png', (route) => route.fulfill({ status: 404, body: 'not here' }));
    // Never painted until it loads: watch every logo the page ever shows.
    await page.evaluate(() => {
      const w = window as unknown as { __shown: boolean };
      w.__shown = false;
      new MutationObserver(() => {
        const img = document.querySelector('img.nj-logo') as HTMLImageElement | null;
        if (img && getComputedStyle(img).visibility !== 'hidden') w.__shown = true;
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    const url = new URL('/broken-logo.png', page.url()).href;
    await mount(page, { brand: { accent: null, text: null, panel: null, font: null, logo: url, title: 'Quiz Night' } });
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    // A later read with the same URL does not try it again.
    await page.evaluate(() => (window as unknown as { __join: { refresh(): void } }).__join.refresh());
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    await expect(page.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __shown: boolean }).__shown)).toBe(false);
  });

  test('a failing custom font falls back to the system font with the layout intact', async ({ page }) => {
    await phonePage(page);
    await page.route('**/missing-face.woff2', (route) => route.fulfill({ status: 404, body: '' }));
    const layout = async () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const root = document.documentElement;
        const boxes = [...document.querySelectorAll('.nj-title, .nj-prompt, .nj-opt, .nj-card')].map((el) => el.getBoundingClientRect());
        return {
          overflow: root.scrollWidth - root.clientWidth,
          outside: boxes.filter((b) => b.left < 0 || b.right > window.innerWidth).length,
          optionHeights: [...document.querySelectorAll('.nj-opt')].map((el) => el.getBoundingClientRect().height),
          face: document.fonts.check('16px "Missing Face"'),
        };
      });
    await page.addStyleTag({ content: '@font-face { font-family: "Missing Face"; src: url("/missing-face.woff2") format("woff2"); }' });
    await mount(page, { brand: { accent: null, text: null, panel: null, font: '"Missing Face", system-ui, sans-serif' } }, 'choice');
    await page.evaluate(() => document.fonts.load('16px "Missing Face"').catch(() => null));
    const missing = await layout();
    expect(missing.overflow, 'no sideways scroll').toBeLessThanOrEqual(0);
    expect(missing.outside, 'nothing past the screen edge').toBe(0);
    expect(Math.min(...missing.optionHeights), 'every option keeps its thumb size').toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('join')!).fontFamily)).toContain('system-ui');
  });

  test('replacing and removing the logo take effect on the next read', async ({ page }) => {
    await phonePage(page);
    const first = await logoDataUrl(page, '#ff0000');
    const second = await logoDataUrl(page, '#0000ff');
    await mount(page, { brand: { accent: null, text: null, panel: null, font: null, logo: first } });
    const img = page.locator('img.nj-logo');
    await expect(img).toHaveAttribute('src', first);
    await expect(img).toBeVisible();
    const next = (logo: string | null) =>
      page.evaluate((l) => {
        const w = window as unknown as { __view: { brand: { logo: string | null } }; __join: { refresh(): void } };
        w.__view = { ...w.__view, brand: { ...w.__view.brand, logo: l } };
        w.__join.refresh();
      }, logo);
    await next(second);
    await expect(img).toHaveAttribute('src', second);
    await expect(img).toBeVisible();
    await next(null);
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.locator('.nj-title')).toHaveText('Friday Night Live');
  });
});

test('the studio QR code decodes to the short link, as SVG and as PNG (AC-5)', async ({ page, browser }) => {
  const reader = await qrReader(browser);
  try {
    await phonePage(page);
    await page.setViewportSize({ width: 800, height: 800 });
    const png = await page.evaluate(async (link) => {
      const { qrSvg, qrPng } = await import('/src/audience/joinQr.ts');
      const host = document.createElement('div');
      host.id = 'qr';
      host.style.cssText = 'width:400px;height:400px';
      host.innerHTML = qrSvg(link);
      (host.firstElementChild as SVGElement).style.cssText = 'width:100%;height:100%;display:block';
      document.body.prepend(host);
      const blob = await qrPng(link);
      const bytes = new Uint8Array(await blob!.arrayBuffer());
      let s = '';
      bytes.forEach((b) => (s += String.fromCharCode(b)));
      return btoa(s);
    }, LINK);
    expect(await reader.read(await page.locator('#qr').screenshot()), 'the SVG').toBe(LINK);
    expect(await reader.read(Buffer.from(png, 'base64')), 'the downloaded PNG').toBe(LINK);
  } finally {
    await reader.close();
  }
});

test.describe('the Join card draws its QR from its Join link (AC-11)', () => {
  /** Build the Join card with this link, as Add Join card to rundown does. */
  const template = (page: Page, link: string) =>
    page.evaluate(async (l) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const variant = variantById('jc01')!;
      const lines = variant.suggestedLines.map((line) => (line.title === 'Join link' ? { ...line, sample: l } : line));
      return variant.create({ lines });
    }, link);

  /** Play the card in this document and wait for its entrance to land. Play is queued in the
   *  graphic's own event queue, so the wait is on what the page shows, not on a timeline handle. */
  const settle = async (frame: Page | Frame) => {
    await frame.evaluate(() => (window as unknown as { play(): void }).play());
    await frame.waitForFunction(() => {
      const box = document.querySelector('.audience-box');
      const root = document.querySelector('.audience');
      const g = (window as unknown as { gsap: { globalTimeline: { getChildren(a: boolean, b: boolean, c: boolean): { isActive(): boolean }[] } } }).gsap;
      return !!box && !!root && getComputedStyle(root).opacity === '1' && getComputedStyle(box).opacity === '1'
        && g.globalTimeline.getChildren(true, true, false).every((t) => !t.isActive());
    });
  };

  test('live: the rendered card decodes to its link, follows an update, and an empty link draws nothing', async ({ page, browser }) => {
    const reader = await qrReader(browser);
    try {
      await phonePage(page);
      await page.setViewportSize({ width: 1920, height: 1080 });
      const tpl = await template(page, LINK);
      // As the studio's monitors load it: the preview document in an iframe on the app's origin.
      await page.evaluate(async (t) => {
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const f = document.createElement('iframe');
        f.id = 'card';
        f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0';
        document.body.appendChild(f);
        await new Promise((res) => {
          f.onload = res;
          f.srcdoc = composeDocument(t as never);
        });
      }, tpl);
      const card = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
      await card.waitForFunction(() => typeof (window as unknown as { play?: unknown }).play === 'function');
      await settle(card);
      const qr = page.frameLocator('#card').locator('#audience-join-qr');
      await expect(qr.locator('svg')).toHaveCount(1);
      expect(await reader.read(await qr.screenshot())).toBe(LINK);
      await expect(page.frameLocator('#card').locator('.audience-join-url')).toHaveText('noacg.studio/j/friday-night-live');

      // A new link is data: update() redraws the code, nothing else moves.
      const other = 'https://noacg.studio/j/quiz-2026';
      await card.evaluate((l) => (window as unknown as { update(d: unknown): void }).update({ f2: l }), other);
      expect(await reader.read(await qr.screenshot())).toBe(other);

      await card.evaluate(() => (window as unknown as { update(d: unknown): void }).update({ f2: '' }));
      await expect(qr).toBeHidden();
      await expect(qr.locator('svg')).toHaveCount(0);
      await expect(page.frameLocator('#card').locator('.audience-join-url')).toBeHidden();
    } finally {
      await reader.close();
    }
  });

  test('exported: the single-file card, opened with no network, still draws the same code', async ({ page, browser }) => {
    const reader = await qrReader(browser);
    try {
      await phonePage(page);
      const tpl = await template(page, LINK);
      const html = await page.evaluate(async (t) => {
        const { composeSelfContainedHtml } = await import('/src/export/selfContained.ts');
        return composeSelfContainedHtml(t as never);
      }, tpl);
      expect(html).not.toMatch(/<script[^>]+src=/i);
      const offline = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
      const card = await offline.newPage();
      const requests: string[] = [];
      card.on('request', (r) => {
        if (!r.url().startsWith('data:')) requests.push(r.url());
      });
      await card.route('**/*', (route) => route.abort());
      await card.setContent(html);
      await card.waitForFunction(() => typeof (window as unknown as { play?: unknown }).play === 'function');
      await settle(card);
      expect(await reader.read(await card.locator('#audience-join-qr').screenshot())).toBe(LINK);
      expect(requests, 'nothing was fetched').toEqual([]);
      await offline.close();
    } finally {
      await reader.close();
    }
  });
});
