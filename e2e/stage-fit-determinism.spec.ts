import { test, expect } from '@playwright/test';
import * as rules from '../scripts/rules.mjs';

// THE STAGE RESERVE MUST BE A PROPERTY OF THE DESIGN, NOT OF THE MACHINE.
//
// A staged graphic measures its own lines once at load and remembers the room each one had
// (`src/templates/shared/stageFit.ts`, docs/FOOTPRINT_STABILITY.md). That reserve is written into
// the template as an inline `height` / `min-height` and stays there, so it is not a private
// implementation detail: it is part of what the graphic ships, what `e2e/catalog-baseline.spec.ts`
// fingerprints, and what an exported package puts on air.
//
// Twice it turned out to be a measurement of the MOMENT instead of the design, and both times the
// symptom was the same - the catalog baseline failing under a loaded machine with a DIFFERENT set
// of elements each run, which is a race rather than drift (2026-08-23/24):
//
//  1. A line inside a CSS-ANIMATED ancestor reads its height back through that ancestor's
//     composited matrix. gt04's clock sits in a badge carrying a 2.2s `translateY` float, and its
//     height measured 399.9999694824219 on one frame and 400.0000305175781 on the next. The
//     reserve is a `Math.ceil`, so the design shipped 400px or 401px depending on which frame the
//     fit happened to land on.
//  2. The recalibration that runs once the webfonts arrive re-measures every line "from scratch" -
//     but it left the panel's own `min-height` in place while doing it, so the FALLBACK-face pass
//     became a floor under the real one. Whether the fallback pass saw the real face at all is
//     decided by whether the woff2 had arrived by DOMContentLoaded, which is a property of the
//     machine's load. Measured on the alert strip: a 189px reserve held against a real 188.5px,
//     and the four severity tiles sized inside that panel moved with it.
//
// So this spec asks the property directly, in two independent ways, and it is deliberately NOT a
// fingerprint comparison: it is platform-free (no rasterized geometry is compared against a
// recorded number, only against this same run's other readings), so it guards on every runner
// while the render baseline can only compare on the platform that recorded it.

/**
 * The probes. A short list rather than the whole catalog, because each one pays a deliberate
 * font stall - but a list picked by MEASUREMENT: `al01` and `gt04` are the two designs whose
 * reserves the two races above were actually caught on, and the rest are every other variant whose
 * render fingerprint moved when the races were removed, so they are the catalog's known
 * reserve-sensitive designs. `stage-fit-honesty` covers the whole catalog for the honesty of the
 * reserve; this one covers whether the same reserve comes back twice.
 */
const PROBES: { id: string; why: string }[] = [
  { id: 'al01', why: 'severity tiles sized inside the panel reserve - the min-height floor' },
  { id: 'gt04', why: 'the clock sits in a badge with a running float - the composited-rect noise' },
  { id: 'gt02', why: 'reserve moved when the races were removed' },
  { id: 'sb23', why: 'reserve moved when the races were removed' },
  { id: 'sb25', why: 'reserve moved when the races were removed' },
  { id: 'ss15', why: 'reserve moved when the races were removed' },
  { id: 'ss20', why: 'reserve moved when the races were removed' },
  { id: 'card62', why: 'reserve moved when the races were removed' },
  { id: 'card76', why: 'reserve moved when the races were removed' },
];

/** What a design SHIPS as its reserve: every remembered room, and the inline styles that hold it. */
const RESERVES = `(async (ids, recalibrations) => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const all = [];
  for (const variants of Object.values(CATALOG)) for (const v of variants ?? []) all.push(v);
  const out = [];

  const path = (el) => {
    const parts = [];
    for (var n = el; n && n.nodeType === 1 && n.tagName !== 'BODY'; n = n.parentNode) {
      const cls = typeof n.className === 'string' && n.className.trim()
        ? '.' + n.className.trim().split(/\\s+/).join('.') : '';
      parts.unshift(n.tagName.toLowerCase() + cls);
    }
    return parts.join('>');
  };
  // The reserve as it stands: the remembered room plus the two inline properties that hold it.
  const read = (doc) => {
    const rows = [];
    for (const el of doc.body.querySelectorAll('*')) {
      const room = el.getAttribute('data-stage-room');
      const self = el.getAttribute('data-stage-selfh');
      if (room === null && self === null && !el.style.minHeight && !el.style.height) continue;
      rows.push(path(el) + ' room=' + room + ' selfh=' + self +
        ' height=' + (el.style.height || '-') + ' minHeight=' + (el.style.minHeight || '-'));
    }
    return rows;
  };

  for (const id of ids) {
    const variant = all.find((v) => v.id === id);
    const rec = { id, found: !!variant, staged: false, passes: [] };
    if (!variant) { out.push(rec); continue; }
    let frame = null;
    try {
      const tpl = variant.create({});
      rec.staged = tpl.js.indexOf('function fitStagedText') >= 0;
      if (!rec.staged) { out.push(rec); continue; }
      frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;border:0;width:' +
        tpl.resolution.width + 'px;height:' + tpl.resolution.height + 'px;';
      await new Promise((res, rej) => {
        frame.onload = res;
        frame.onerror = () => rej(new Error('the iframe failed to load'));
        frame.srcdoc = composeDocument(tpl);
        document.body.appendChild(frame);
      });
      const win = frame.contentWindow, doc = frame.contentDocument;
      const ready = await Promise.race([
        doc.fonts.ready.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 10000)),
      ]);
      if (!ready) throw new Error(id + ': the webfonts never arrived');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      rec.passes.push(read(doc));

      // RECALIBRATE, on successive frames, with the design's animations still running - which is
      // the point. Every pass measures the same unchanged layout, so every pass owes the same
      // answer; a reserve read off a composited rect does not give one.
      for (let i = 0; i < recalibrations; i++) {
        await new Promise((r) => win.requestAnimationFrame(r));
        for (const el of doc.body.querySelectorAll('*')) {
          el.removeAttribute('data-stage-room');
          el.removeAttribute('data-stage-fill');
          el.removeAttribute('data-stage-selfh');
          el.removeAttribute('data-stage-selffill');
          el.style.height = '';
          el.style.minHeight = '';
        }
        win.__noacgStageFaceRatios = {};
        win.stageCalibrated = false;   // measure the design's own rows, as the load-time pass does
        win.fitStagedText();
        rec.passes.push(read(doc));
      }
    } catch (e) { rec.error = String(e); }
    finally { if (frame) frame.remove(); }
    out.push(rec);
  }
  return out;
})(` + JSON.stringify(PROBES.map((p) => p.id)) + `, RECALIBRATIONS)`;

interface Reserves {
  id: string;
  found: boolean;
  staged: boolean;
  passes: string[][];
  error?: string;
}

async function reserves(page: import('@playwright/test').Page, recalibrations: number): Promise<Reserves[]> {
  return (await page.evaluate(CAPTURE(recalibrations))) as Reserves[];
}

const CAPTURE = (recalibrations: number): string =>
  RESERVES.replace('RECALIBRATIONS', String(recalibrations));

/** The line the failure prints: which rows disagreed, not just that something did. */
function firstDisagreement(a: string[], b: string[]): string {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `\n    one run: ${a[i] ?? '<missing>'}\n    other:   ${b[i] ?? '<missing>'}`;
  }
  return '';
}

test('the probe list still describes the catalog', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const got = await reserves(page, 0);
  // A renamed or unstaged design must fail here rather than quietly stop being probed - the same
  // rule the mark-height exceptions follow: a stale entry fails, it does not excuse itself.
  expect(
    got.filter((r) => !r.found).map((r) => r.id),
    'A probed design is gone from the catalog. Replace it with one that still exercises the ' +
      'same reserve (see the PROBES notes) rather than deleting the row.',
  ).toEqual([]);
  expect(
    got.filter((r) => r.found && !r.staged).map((r) => r.id),
    'A probed design no longer emits the stage-fit runtime, so it no longer guards anything. ' +
      'Replace it with a staged design that does.',
  ).toEqual([]);
});

test('a reserve is the same number every time it is measured', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // Six recalibrations on six consecutive frames. A reserve taken off a composited rect flips
  // between two whole pixels from one frame to the next, so a single re-read would catch it only
  // half the time; six make the disagreement certain rather than likely.
  const got = await reserves(page, 6);
  expect(got.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`)).toEqual([]);

  const unstable: string[] = [];
  for (const rec of got) {
    const first = rec.passes[0] ?? [];
    for (const pass of rec.passes.slice(1)) {
      if (JSON.stringify(pass) === JSON.stringify(first)) continue;
      unstable.push(`${rec.id}${firstDisagreement(first, pass)}`);
      break;
    }
  }
  expect(
    unstable,
    'A staged design measured its own unchanged layout twice and reserved a different amount of ' +
      'room. The reserve is written into the template as an inline height, so this is what the ' +
      'graphic ships - and it is why e2e/catalog-baseline.spec.ts failed with a drifting element ' +
      'set under load. The two ways stageFit.ts has got this wrong: measuring the reserve off the ' +
      'VISUAL rect, so an animated ancestor\'s transform lands in it (stageLayoutHeight is the ' +
      'answer), and re-measuring while the other lines are still PINNED from the previous pass ' +
      '(stageUnpin). Do not re-record a baseline over it. ' +
      rules.text('templates/measure-stage-reserves-layout-dimensions-never'),
  ).toEqual([]);
});

test('a reserve does not depend on when the webfonts arrive', async ({ browser }) => {
  test.setTimeout(300_000);

  // The two orderings the recalibration has to survive: the face already in hand when the design's
  // first pass runs, and the face still on the wire so that pass measures the fallback. Nine
  // hundred milliseconds is comfortably past DOMContentLoaded on any runner, so this is an
  // ordering the test IMPOSES rather than one it hopes for.
  const runs: string[][][] = [];
  for (const delay of [0, 900]) {
    const context = await browser.newContext();
    if (delay) {
      await context.route('**/fonts/*.woff2', async (route) => {
        await new Promise((r) => setTimeout(r, delay));
        return route.continue();
      });
    }
    const page = await context.newPage();
    await page.goto('/app');
    await page.keyboard.press('Escape');
    const got = await reserves(page, 0);
    expect(got.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`)).toEqual([]);
    runs.push(got.map((r) => r.passes[0] ?? []));
    await context.close();
  }

  const moved: string[] = [];
  PROBES.forEach((probe, i) => {
    const [fast, slow] = [runs[0][i], runs[1][i]];
    if (JSON.stringify(fast) === JSON.stringify(slow)) return;
    moved.push(`${probe.id} (${probe.why})${firstDisagreement(fast, slow)}`);
  });
  expect(
    moved,
    'A staged design reserved different room depending on how fast the webfonts arrived. The ' +
      'recalibration on document.fonts.ready must clear EVERY number the first pass left behind, ' +
      'the panel min-height included (stageFit.ts) - otherwise the fallback face becomes a floor ' +
      'under the real one and the machine decides what the graphic ships.',
  ).toEqual([]);
});
