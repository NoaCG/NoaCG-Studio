// The FLEX-GAP sweep: what an engine without flexbox `gap` does to every catalog design, and
// whether the shim in src/assets/flexGapShim.js puts it back exactly.
//
// WHY. Flex `gap` is Chromium 84. CasparCG 2.3.x - the LTS a school downloads today - renders on
// CEF 3.3578 (Chromium 71), where a flex gap is parsed and then ignored: the graphic airs with
// its spacing collapsed and nothing errors (the house scorebug read `HOME3` on a real 2.3.2
// server, 2026-09-10). A count of `gap:` lines is not the size of that problem: a gap in a GRID
// container is fine on 71, a gap beside one item is invisible, and a container the settled frame
// hides has no gap anyone sees. So this renders every design, settles it, and MEASURES.
//
// Three layouts per design, in a modern Chromium:
//   native    - the composed document as it is; the engine lays the gap out itself
//   collapsed - the same document with every flex gap zeroed after settle: what CEF 71 paints
//   shimmed   - a fresh copy with `window.NOACG_SIMULATE_NO_FLEX_GAP` set, so the shim runs as
//               it would on CEF 71 and zeroes the native gap itself
//
// Per design it reports the flex containers that carry a gap between two or more in-flow items
// (the real count), how many painted elements the collapse moves and by how far (how visible it
// is), and how many elements the shim leaves off native (its error). `--fail` exits 1 when any
// design's shim error exceeds the tolerance: that is the gate for editing the shim.
//
// Usage (dev server must be running for this checkout - scripts/dev-port.mjs):
//   node scripts/flex-gap-sweep.mjs                    # every design
//   node scripts/flex-gap-sweep.mjs scoreboard         # one category
//   node scripts/flex-gap-sweep.mjs --only sb01,lt01   # just these (scripts/catalog-scope.mjs)
//   node scripts/flex-gap-sweep.mjs --json out.json    # machine-readable rows
//   node scripts/flex-gap-sweep.mjs --fail             # exit 1 on any shim error past tolerance
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import { applyOnly, parseOnly } from './catalog-scope.mjs';
import { measured } from './measured.mjs';

// A moved element is one whose box shifts or resizes by more than this when the gap collapses;
// a shim error is a box the shim leaves further than this from native. Sub-pixel text metrics
// and antialias rounding sit under both.
const MOVE_TOLERANCE = 1.5;
const SHIM_TOLERANCE = 1;

const args = process.argv.slice(2);
const flagVal = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? { at, val: args[at + 1] ?? null } : { at: -1, val: null };
};
const { at: jsonAt, val: jsonOut } = flagVal('--json');
const shouldFail = args.includes('--fail');
const { ids: onlyIds, at: onlyAt, raw: onlyRaw } = parseOnly(args);
const consumed = new Set();
for (const [at, val] of [[jsonAt, jsonOut], [onlyAt, onlyRaw]]) {
  if (at >= 0) {
    consumed.add(at);
    if (val && !val.startsWith('--')) consumed.add(at + 1);
  }
}
const only = args.find((a, i) => !consumed.has(i) && !a.startsWith('--')) || null;

// `--expose-gc`: every design mounts two 1920x1080 documents, and a detached iframe's document
// lives until the next major GC. Left to Chromium's own schedule the page grew past 7 GB on a
// 16 GB laptop and the run thrashed; collecting after every batch keeps it flat.
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__wiz = await import('/src/model/wizard.ts');
});

const allTargets = await page.evaluate(
  (only) =>
    window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({ id: v.id, cat: c.id, name: v.name })),
    ),
  only,
);
const targets = await applyOnly(allTargets, onlyIds, 'flex-gap-sweep', page, () => browser.close());
if (!targets.length) {
  console.error(only ? `No variants for category "${only}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}
measured(targets.length, 'catalog variants');

await page.evaluate(
  ({ MOVE_TOLERANCE, SHIM_TOLERANCE }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const label = (el) =>
      typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/)[0]
        : el.id
          ? '#' + el.id
          : el.tagName.toLowerCase();
    const isFlex = (d) => d === 'flex' || d === 'inline-flex';
    const inFlow = (cs) => cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
    // Painted, as a viewer would judge it: no display:none / visibility:hidden / opacity 0 on the
    // element or any ancestor, and a box that is not empty.
    const painted = (el, w) => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = w.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || !(parseFloat(cs.opacity) > 0.03)) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width >= 1 || r.height >= 1;
    };
    const freeze = (w) => {
      // Ambient loops and CSS animations would put the three layouts at three phases; park them.
      try {
        if (w.gsap) {
          w.gsap.globalTimeline.pause();
          w.gsap.globalTimeline.getChildren(true, true, true).forEach((t) => {
            if (t.repeat && t.repeat() === -1) t.progress(0, true);
          });
        }
      } catch { /* a document without GSAP has nothing to park */ }
      const s = w.document.createElement('style');
      s.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
      w.document.head.appendChild(s);
    };
    const boxes = (w) =>
      Array.from(w.document.body.querySelectorAll('*')).map((el) => {
        const r = el.getBoundingClientRect();
        return { label: label(el), painted: painted(el, w), x: r.left, y: r.top, w: r.width, h: r.height };
      });
    // The containers that actually carry a gap between items - the number the whole sweep exists
    // to report - and the px each would lose on the main axis.
    const liveContainers = (w) => {
      const out = [];
      for (const el of w.document.body.querySelectorAll('*')) {
        const cs = w.getComputedStyle(el);
        if (!isFlex(cs.display)) continue;
        const rowGap = parseFloat(cs.rowGap) || 0;
        const colGap = parseFloat(cs.columnGap) || 0;
        if (!(rowGap > 0) && !(colGap > 0)) continue;
        const items = Array.from(el.children).filter((c) => inFlow(w.getComputedStyle(c)));
        if (items.length < 2) continue;
        const horizontal = cs.flexDirection.indexOf('row') === 0;
        const mainGap = horizontal ? colGap : rowGap;
        out.push({
          label: label(el),
          items: items.length,
          mainGap,
          losesPx: mainGap * (items.length - 1),
          wrap: cs.flexWrap !== 'nowrap',
          painted: painted(el, w),
        });
      }
      return out;
    };
    const collapse = (w) => {
      for (const el of w.document.body.querySelectorAll('*')) {
        if (!isFlex(w.getComputedStyle(el).display)) continue;
        el.style.setProperty('row-gap', '0px', 'important');
        el.style.setProperty('column-gap', '0px', 'important');
      }
    };
    const diff = (a, b, tolerance) => {
      if (a.length !== b.length) return { count: -1, max: 0, worst: null };
      let count = 0;
      let max = 0;
      let worst = null;
      for (let i = 0; i < a.length; i++) {
        if (!a[i].painted && !b[i].painted) continue;
        const d = Math.max(
          Math.abs(a[i].x - b[i].x),
          Math.abs(a[i].y - b[i].y),
          Math.abs(a[i].w - b[i].w),
          Math.abs(a[i].h - b[i].h),
        );
        if (d > tolerance) count++;
        if (d > max) {
          max = d;
          worst = a[i].label;
        }
      }
      return { count, max: Math.round(max * 10) / 10, worst };
    };

    window.__scan = async (batch) => {
      // Release the last batch's documents before mounting the next: blank each frame so its
      // document can go, then drop the frames, then collect.
      for (const f of document.querySelectorAll('iframe')) f.removeAttribute('srcdoc');
      document.body.innerHTML = '';
      if (window.gc) window.gc();
      const frames = batch.map(({ id }) => {
        const out = { id, err: null };
        const mount = (simulate) => {
          const f = document.createElement('iframe');
          f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
          try {
            const v = window.__cat.variantById(id);
            let doc = window.__comp.composeDocument(v.create({}));
            if (simulate) {
              // The flag has to be set before the shim runs; the shim sits at the end of <head>.
              const flag = '<script>window.NOACG_SIMULATE_NO_FLEX_GAP = true;</script>';
              doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => m + flag) : flag + doc;
            }
            f.srcdoc = doc;
          } catch (e) {
            out.err = String((e && e.message) || e);
          }
          document.body.appendChild(f);
          return f;
        };
        return { out, native: mount(false), shimmed: mount(true) };
      });
      await sleep(900);
      for (const { native, shimmed } of frames) {
        for (const f of [native, shimmed]) {
          try {
            f.contentWindow.play && f.contentWindow.play();
          } catch { /* a template without play() still lays out */ }
        }
      }
      // Settle: presets run ~1.2 s, steps and loops a little longer.
      await sleep(2400);
      return frames.map(({ out, native, shimmed }) => {
        if (out.err) return out;
        try {
          const nw = native.contentWindow;
          const sw = shimmed.contentWindow;
          freeze(nw);
          freeze(sw);
          const containers = liveContainers(nw);
          const before = boxes(nw);
          collapse(nw);
          nw.document.body.getBoundingClientRect(); // force the collapsed layout
          const collapsed = boxes(nw);
          const after = boxes(sw);
          const moved = diff(before, collapsed, MOVE_TOLERANCE);
          const shim = diff(before, after, SHIM_TOLERANCE);
          return {
            ...out,
            containers,
            painted: containers.filter((c) => c.painted).length,
            losesPx: Math.round(containers.filter((c) => c.painted).reduce((s, c) => s + c.losesPx, 0)),
            moved,
            shim,
          };
        } catch (e) {
          return { ...out, err: String((e && e.message) || e) };
        }
      });
    };
  },
  { MOVE_TOLERANCE, SHIM_TOLERANCE },
);

// Two iframes per design at 1920x1080, so the batch stays small. Progress is a LINE per batch,
// not a carriage return: the queue's log shows nothing of a `\r` line until the run ends.
const BATCH = 5;
const rows = [];
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  const part = await page.evaluate((b) => window.__scan(b), batch);
  for (const r of part) {
    const t = batch.find((x) => x.id === r.id);
    rows.push({ ...r, cat: t.cat, name: t.name });
  }
  console.log(`  measured ${rows.length}/${targets.length}`);
}
await browser.close();

// ── The report ─────────────────────────────────────────────────────────────────────────────
const broke = rows.filter((r) => r.err);
const ok = rows.filter((r) => !r.err);
const withGap = ok.filter((r) => r.painted > 0);
const visible = withGap.filter((r) => r.moved.count > 0);
const shimOff = ok.filter((r) => r.shim.count > 0 || r.shim.count === -1);
const containerCount = withGap.reduce((s, r) => s + r.painted, 0);
const worstMove = ok.reduce((m, r) => Math.max(m, r.moved.max), 0);

console.log(`\nFlex gap on an engine without it (Chromium < 84)`);
console.log(`  ${ok.length} designs rendered${broke.length ? `, ${broke.length} failed` : ''}`);
console.log(`  ${withGap.length} carry a flex gap between two or more painted items (${containerCount} containers)`);
console.log(`  ${visible.length} move visibly when it collapses (largest shift ${worstMove}px)`);
console.log(`  shim: ${ok.length - shimOff.length} designs within ${SHIM_TOLERANCE}px of native, ${shimOff.length} off\n`);

if (visible.length) {
  console.log('LARGEST COLLAPSES (px of spacing lost across painted containers):');
  for (const r of [...visible].sort((a, b) => b.losesPx - a.losesPx).slice(0, 15)) {
    console.log(`  ${String(r.losesPx).padStart(5)}px  ${r.id.padEnd(8)} ${r.name} - ${r.painted} containers, ${r.moved.count} boxes move, max ${r.moved.max}px`);
  }
}
if (shimOff.length) {
  console.log('\nSHIM OFF NATIVE:');
  for (const r of shimOff.sort((a, b) => b.shim.max - a.shim.max)) {
    const what = r.shim.count === -1 ? 'element count differs between the two documents' : `${r.shim.count} boxes off, max ${r.shim.max}px at ${r.shim.worst}`;
    console.log(`  ${r.id.padEnd(8)} ${r.name} - ${what}`);
  }
}
for (const r of broke) console.log(`  FAILED ${r.id}: ${r.err}`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ tolerance: { move: MOVE_TOLERANCE, shim: SHIM_TOLERANCE }, rows }, null, 2));
  console.log(`\nWrote ${jsonOut}`);
}

if (broke.length) process.exit(1);
process.exit(shouldFail && shimOff.length ? 1 : 0);
