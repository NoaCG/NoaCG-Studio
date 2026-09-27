// This spec iterates the CATALOG, so a design added anywhere under src/templates/ must select it.
// Until 2026-08-08 it was reachable from no template path and ten designs landed with every
// branch gate green; e2e-affected.test.mjs now pins that every catalog importer covers src/templates/.
// covers: src/templates/**

import { test, expect } from '@playwright/test';

const FRAME_IDS = ['fr05', 'fr06', 'fr07', 'fr08', 'fr09', 'fr10', 'fr11', 'fr12', 'fr13', 'fr14'];
const TRANSITION_IDS = ['tr05', 'tr06', 'tr07', 'tr08', 'tr09', 'tr10'];

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toBeVisible();
});

test('every holding and ending scene paints an opaque full-frame background with idle motion', async ({ page }) => {
  const report = await page.evaluate(async () => {
    const [{ CATALOG }, { composeDocument }, { parseAnimData }, { validateTemplate }] = await Promise.all([
      import('/src/templates/catalog.ts'),
      import('/src/preview/composeDocument.ts'),
      import('/src/blocks/animData.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const out: Array<Record<string, unknown>> = [];
    for (const category of ['starting-soon', 'end-credits'] as const) {
      for (const variant of CATALOG[category] ?? []) {
        const template = variant.create({});
        const frame = document.createElement('iframe');
        frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${template.resolution.width}px;` +
          `height:${template.resolution.height}px;border:0;`;
        await new Promise<void>((resolve, reject) => {
          frame.onload = () => resolve();
          frame.onerror = () => reject(new Error(`failed to load ${variant.id}`));
          frame.srcdoc = composeDocument(template);
          document.body.appendChild(frame);
        });
        const doc = frame.contentDocument!;
        const root = doc.querySelector(category === 'starting-soon' ? '.starting-soon' : '.credits')!;
        const background = doc.querySelector(
          category === 'starting-soon' ? '.starting-soon-background' : '.credits-background',
        )!;
        const ambientSelector = category === 'starting-soon' ? '.starting-soon-ambient' : '.credits-ambient';
        const rootRect = root.getBoundingClientRect();
        const bgRect = background.getBoundingClientRect();
        const bgColor = getComputedStyle(background).backgroundColor;
        const data = parseAnimData(template.js);
        const loopSelectors = (data?.steps ?? []).flatMap((step) => Object.keys(step.loops ?? {}));
        const validation = validateTemplate(template);
        out.push({
          id: variant.id,
          errors: validation.errors.map((issue) => issue.message),
          fullRoot: Math.abs(rootRect.width - template.resolution.width) < 0.5 &&
            Math.abs(rootRect.height - template.resolution.height) < 0.5,
          fullBackground: Math.abs(bgRect.width - template.resolution.width) < 0.5 &&
            Math.abs(bgRect.height - template.resolution.height) < 0.5,
          opaque: bgColor !== 'rgba(0, 0, 0, 0)',
          ambientLoop: loopSelectors.includes(ambientSelector),
        });
        frame.remove();
      }
    }
    return out;
  });

  expect(report.length).toBeGreaterThan(20);
  expect(report.filter((item) =>
    (item.errors as string[]).length || !item.fullRoot || !item.fullBackground || !item.opaque || !item.ambientLoop,
  )).toEqual([]);
});

test('structural frames keep exact transparent source holes, safe labels, and portrait geometry', async ({ page }) => {
  const report = await page.evaluate(async (ids) => {
    const [{ variantById }, { composeDocument }, { validateTemplate }] = await Promise.all([
      import('/src/templates/catalog.ts'),
      import('/src/preview/composeDocument.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const out: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      const resolution = id === 'fr14'
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
      const template = variantById(id)!.create({ resolution });
      const frame = document.createElement('iframe');
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${resolution.width}px;` +
        `height:${resolution.height}px;border:0;`;
      await new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error(`failed to load ${id}`));
        frame.srcdoc = composeDocument(template);
        document.body.appendChild(frame);
      });
      const doc = frame.contentDocument!;
      const rootRect = doc.querySelector('.frame')!.getBoundingClientRect();
      const windows = [...doc.querySelectorAll<HTMLElement>('.frame-window')];
      const plates = [...doc.querySelectorAll<HTMLElement>('.frame-plate')];
      const windowRects = windows.map((element) => element.getBoundingClientRect());
      const platesInside = plates.every((element) => {
        const r = element.getBoundingClientRect();
        return r.left >= -0.5 && r.top >= -0.5 &&
          r.right <= resolution.width + 0.5 && r.bottom <= resolution.height + 0.5;
      });
      const platesPositioned = plates.every((element) => {
        const style = getComputedStyle(element);
        const r = element.getBoundingClientRect();
        return style.position === 'absolute' && r.left > resolution.width * 0.025 &&
          r.top > resolution.height * 0.15;
      });
      const overlap = windowRects.some((a, index) => windowRects.slice(index + 1).some((b) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5,
      ));
      const validation = validateTemplate(template);
      out.push({
        id,
        errors: validation.errors.map((issue) => issue.message),
        fullRoot: Math.abs(rootRect.width - resolution.width) < 0.5 &&
          Math.abs(rootRect.height - resolution.height) < 0.5,
        windows: windows.length,
        transparent: windows.every((element) => getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)'),
        pathHoles: (doc.querySelector('.frame-matte-fill')?.getAttribute('d')?.match(/M/g) ?? []).length - 1,
        overlap,
        platesInside,
        platesPositioned,
        verticalRatio: id === 'fr14' ? windowRects[0].width / windowRects[0].height : null,
      });
      frame.remove();
    }
    return out;
  }, FRAME_IDS);

  expect(report.map((item) => item.id)).toEqual(FRAME_IDS);
  expect(report.filter((item) =>
    (item.errors as string[]).length || !item.fullRoot || !item.transparent ||
    item.windows !== item.pathHoles || item.overlap || !item.platesInside || !item.platesPositioned,
  )).toEqual([]);
  expect(report.find((item) => item.id === 'fr14')?.verticalRatio).toBeCloseTo(9 / 16, 2);
});

test('premium transitions cover every edge, self-clear, replay, and recover by snap', async ({ page }) => {
  const report = await page.evaluate(async (ids) => {
    const [{ variantById }, { composeDocument }, { parseAnimData }, { validateMachine }] = await Promise.all([
      import('/src/templates/catalog.ts'),
      import('/src/preview/composeDocument.ts'),
      import('/src/blocks/animData.ts'),
      import('/src/blocks/animMachine.ts'),
    ]);
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const out: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      const template = variantById(id)!.create({});
      const data = parseAnimData(template.js)!;
      const group = data.machine!.groups[0];
      const coverState = group.defaultPath![0];
      const exitState = group.defaultPath![group.defaultPath!.length - 1];
      const timer = group.transitions.find((transition) => transition.trigger === 'timer');
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;';
      await new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error(`failed to load ${id}`));
        frame.srcdoc = composeDocument(template);
        document.body.appendChild(frame);
      });
      const win = frame.contentWindow as unknown as {
        play: () => void;
        noacgSnap: (assignment: Record<string, string> | null, options: { timers: boolean }) => void;
        gsap: { globalTimeline: { timeScale: (value: number) => void } };
      };
      const doc = frame.contentDocument!;
      const root = doc.querySelector<HTMLElement>('.transition')!;
      const visible = () => parseFloat(getComputedStyle(root).opacity) > 0.1;

      win.noacgSnap({ [group.id]: coverState }, { timers: false });
      await wait(20);
      const panelRect = doc.querySelector('.transition-panel')!.getBoundingClientRect();
      const cutCovered = visible() && panelRect.left <= 0 && panelRect.top <= 0 &&
        panelRect.right >= 1920 && panelRect.bottom >= 1080;
      win.noacgSnap(null, { timers: false });
      const snapReset = !visible();

      win.gsap.globalTimeline.timeScale(20);
      const run = async () => {
        win.play();
        let shown = false;
        for (let i = 0; i < 40 && !shown; i++) {
          shown = visible();
          if (!shown) await wait(20);
        }
        let cleared = false;
        for (let i = 0; i < 100 && !cleared; i++) {
          await wait(20);
          cleared = !visible();
        }
        return shown && cleared;
      };
      const firstRun = await run();
      const resetRect = doc.querySelector('.transition-panel')!.getBoundingClientRect();
      const offAirReset = resetRect.left >= -0.5 && resetRect.top >= -0.5 &&
        resetRect.right <= 1920.5 && resetRect.bottom <= 1080.5;
      const replayed = await run();
      out.push({
        id,
        machine: validateMachine(data),
        timerToExit: timer?.from === coverState && timer?.to === exitState && (timer.after ?? 0) > 0,
        cutCovered,
        snapReset,
        firstRun,
        offAirReset,
        replayed,
      });
      frame.remove();
    }
    return out;
  }, TRANSITION_IDS);

  expect(report.map((item) => item.id)).toEqual(TRANSITION_IDS);
  expect(report.filter((item) => {
    const machine = item.machine as { errors: string[]; warnings: string[] };
    return machine.errors.length || machine.warnings.length || !item.timerToExit ||
      !item.cutCovered || !item.snapReset || !item.firstRun || !item.offAirReset || !item.replayed;
  })).toEqual([]);
});

test('the focused full-frame set passes the live runtime bench', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = ['ss04', 'ss08', 'cr06', 'cr09', 'fr05', 'fr10', 'fr14', ...TRANSITION_IDS];
  const report = await page.evaluate(async (variantIds) => {
    const [{ variantById }, { benchTemplateRuntime }] = await Promise.all([
      import('/src/templates/catalog.ts'),
      import('/src/validation/runtimeBench.ts'),
    ]);
    const out = [];
    for (const id of variantIds) {
      const template = variantById(id)!.create(
        id === 'fr14' ? { resolution: { width: 1080, height: 1920 } } : {},
      );
      const result = await benchTemplateRuntime(template, { timeoutMs: 20_000 });
      out.push({ id, errors: result.errors.map((issue) => `${issue.rule}: ${issue.message}`) });
    }
    return out;
  }, ids);

  expect(report.filter((item) => item.errors.length)).toEqual([]);
});
