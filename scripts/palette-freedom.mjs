// The PALETTE FREEDOM instrument: can every catalog design really take arbitrary colours on
// the elements that carry its look, or is it welded to the palette it was drawn in?
//
// Why this exists: the platform's promise is that the `:root` style contract retints the whole
// graphic (DESIGN_LANGUAGE §2, "everything colorable goes through :root custom properties").
// Nothing measured it. A source scan cannot: a design can declare every token and still paint
// its reading surface with a literal, or assume a DARK panel under light text so hard that a
// light palette makes it unreadable. Both are only visible in the rendered graphic.
//
// It renders every variant TWICE at 1920x1080 — once at its own defaults, once under a hostile
// palette that inverts the tonal assumption (near-white panel, near-black text) and carries a
// loud accent no design was drawn around — then reads back, for every visible element:
//
//   accentReach   how many painted properties actually moved to the new accent
//   staleAccent   painted properties still showing the design's ORIGINAL accent
//   staleSurface  reading surfaces still showing their original panel colour
//   contrast      every text run's ratio against its composited backdrop, both times
//
// A design is WELDED when the hostile palette leaves colour behind (stale) or when it loses
// contrast the default palette had (the tonal assumption).
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/palette-freedom.mjs
//   node scripts/palette-freedom.mjs --json out.json
//   node scripts/palette-freedom.mjs lower-third
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const only = args.find((a) => !a.startsWith('--') && a !== jsonOut) || null;

/**
 * The hostile palette. Porcelain's tonal shape (a light panel with dark text is a real, shipped
 * option) with an accent no family was drawn around, so "the accent moved" is unambiguous.
 */
const HOSTILE = {
  id: 'probe-hostile',
  name: 'Probe',
  styleTags: [],
  accent: '#ff2ea6',
  text: '#12141a',
  textDim: 'rgba(18,20,26,0.70)',
  panel: 'rgba(250,250,248,0.96)',
};

/** What a broadcast graphic sits over when nothing else is behind it (model/cssVars.ts). */
const BACKDROP = [16, 18, 22];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__wiz = await import('/src/model/wizard.ts');
});

const targets = await page.evaluate(
  (only) =>
    window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({
        id: v.id,
        cat: c.id,
        name: v.name,
        family: v.styleTag,
        accent: v.defaultPalette.accent,
        panel: v.defaultPalette.panel,
      })),
    ),
  only,
);
if (!targets.length) {
  console.error(only ? `No variants for category "${only}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}

await page.evaluate((consts) => {
  const { BACKDROP } = consts;

  /** Parse any computed colour into [r,g,b,a]; computed values are always rgb()/rgba(). */
  const rgba = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[, /]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (c) => {
    const f = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /** Near-equal in 8-bit space: a rounded computed value is not always byte-identical. */
  const near = (a, b, tol = 10) => a && b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

  window.__measure = (frame) => {
    const w = frame.contentWindow;
    const doc = frame.contentDocument;
    const paints = [];
    const texts = [];
    for (const el of doc.body.querySelectorAll('*')) {
      const cs = w.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      // Opacity is inherited through the entrance; a settled graphic sits at 1.
      let node = el, alpha = 1;
      while (node && node !== doc.body) { alpha *= parseFloat(w.getComputedStyle(node).opacity); node = node.parentElement; }
      if (!(alpha > 0.05)) continue;

      for (const prop of ['background-color', 'border-top-color', 'border-left-color', 'color', 'fill', 'stroke']) {
        const c = rgba(cs.getPropertyValue(prop));
        if (!c || c[3] === 0) continue;
        if (prop.startsWith('border') && cs.getPropertyValue(prop.replace('-color', '-style')) === 'none') continue;
        paints.push({ prop, c });
      }
      const shadow = cs.boxShadow;
      if (shadow && shadow !== 'none') {
        for (const m of shadow.matchAll(/rgba?\([^)]+\)/g)) {
          const c = rgba(m[0]);
          if (c && c[3] > 0) paints.push({ prop: 'box-shadow', c });
        }
      }
      const bgImage = cs.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        for (const m of bgImage.matchAll(/rgba?\([^)]+\)/g)) {
          const c = rgba(m[0]);
          if (c && c[3] > 0) paints.push({ prop: 'background-image', c });
        }
      }

      // Text runs: this element paints its OWN text.
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const fg = rgba(cs.color);
      if (!fg) continue;
      // Composite every ancestor background under it, ending on the broadcast backdrop.
      let bg = BACKDROP.slice();
      const stack = [];
      let a = el;
      while (a && a !== doc.documentElement) {
        const acs = w.getComputedStyle(a);
        const c = rgba(acs.backgroundColor);
        if (c && c[3] > 0) stack.push(c);
        // A gradient scrim is a real backdrop; take its darkest stop as the honest worst case.
        const gi = acs.backgroundImage;
        if (gi && gi !== 'none') {
          const stops = [...gi.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter((x) => x && x[3] > 0);
          if (stops.length) stack.push(stops.reduce((min, s) => (lum(over(s, BACKDROP)) < lum(over(min, BACKDROP)) ? s : min)));
        }
        a = a.parentElement;
      }
      for (const c of stack.reverse()) bg = over(c, bg);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      texts.push({
        sel: el.id ? '#' + el.id : (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase()),
        ratio: Math.round(contrast(over([...fg], bg), bg) * 100) / 100,
        need: large ? 3 : 4.5,
        px: Math.round(size),
        text: el.textContent.trim().slice(0, 24),
      });
    }
    return { paints, texts };
  };

  window.__near = near;
  window.__rgba = rgba;

  window.__scan = async (batch, hostile) => {
    document.body.innerHTML = '';
    const frames = batch.map(({ id }) => {
      const v = window.__cat.variantById(id);
      const f = document.createElement('iframe');
      f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
      try {
        f.srcdoc = window.__comp.composeDocument(v.create(hostile ? { palette: hostile } : {}));
      } catch (e) {
        f.dataset.err = String((e && e.message) || e);
      }
      document.body.appendChild(f);
      return { id, f };
    });
    await new Promise((r) => setTimeout(r, 900));
    for (const { f } of frames) {
      try { f.contentWindow.play && f.contentWindow.play(); } catch { /* no play() is not this gate's finding */ }
    }
    await new Promise((r) => setTimeout(r, 2400));
    return frames.map(({ id, f }) => {
      if (f.dataset.err) return { id, err: f.dataset.err };
      try {
        return { id, ...window.__measure(f) };
      } catch (e) {
        return { id, err: 'READ:' + String((e && e.message) || e) };
      }
    });
  };
}, { BACKDROP });

// Six 1920x1080 iframes at a time: enough to amortise the settle wait, small enough that the
// sweep stays inside the RAM one browser-driving job is allowed (root AGENTS.md).
const BATCH = 6;
const base = new Map();
const swapped = new Map();
for (let i = 0; i < targets.length; i += BATCH) {
  const slice = targets.slice(i, i + BATCH);
  const ids = slice.map((t) => ({ id: t.id }));
  for (const r of await page.evaluate(([b]) => window.__scan(b, null), [ids])) base.set(r.id, r);
  for (const r of await page.evaluate(([b, h]) => window.__scan(b, h), [ids, HOSTILE])) swapped.set(r.id, r);
  process.stdout.write(`\r  measured ${Math.min(i + BATCH, targets.length)}/${targets.length}`);
}
process.stdout.write('\n');
await browser.close();

// ── Verdicts ────────────────────────────────────────────────────────────────────────────
const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const nearRgb = (a, b, tol = 12) => a && b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const HOSTILE_RGB = hex(HOSTILE.accent);

const rows = [];
for (const t of targets) {
  const b = base.get(t.id), s = swapped.get(t.id);
  if (!b || !s || b.err || s.err) {
    rows.push({ ...t, err: (b && b.err) || (s && s.err) || 'missing' });
    continue;
  }
  const originalAccent = hex(t.accent);
  const accentReach = s.paints.filter((p) => nearRgb(p.c, HOSTILE_RGB)).length;
  const staleAccent = s.paints.filter((p) => nearRgb(p.c, originalAccent)).length;
  const baseAccentUse = b.paints.filter((p) => nearRgb(p.c, originalAccent)).length;

  const failsBase = b.texts.filter((x) => x.ratio < x.need);
  const failsSwap = s.texts.filter((x) => x.ratio < x.need);
  const keyBase = new Set(failsBase.map((x) => x.sel + '|' + x.text));
  const newFails = failsSwap.filter((x) => !keyBase.has(x.sel + '|' + x.text));

  rows.push({
    ...t,
    baseAccentUse,
    accentReach,
    staleAccent,
    staleList: [...new Set(s.paints.filter((p) => nearRgb(p.c, originalAccent)).map((p) => p.prop))],
    textRuns: s.texts.length,
    failsBase: failsBase.length,
    failsSwap: failsSwap.length,
    newFails: newFails.map((x) => ({ sel: x.sel, ratio: x.ratio, need: x.need, px: x.px, text: x.text })),
  });
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

const ok = rows.filter((r) => !r.err);
const noAccentReach = ok.filter((r) => r.baseAccentUse > 0 && r.accentReach === 0);
const stale = ok.filter((r) => r.staleAccent > 0);
const regressed = ok.filter((r) => r.newFails.length > 0);

console.log(`\nPALETTE FREEDOM — ${ok.length} designs measured, ${rows.length - ok.length} failed to build/read`);
console.log(`  the new accent never reaches the graphic:      ${noAccentReach.length}`);
console.log(`  the ORIGINAL accent survives the swap:         ${stale.length}`);
console.log(`  text that read at defaults stops reading:      ${regressed.length}`);
console.log(`  clean on all three:                            ${ok.filter((r) => !noAccentReach.includes(r) && !stale.includes(r) && !regressed.includes(r)).length}`);

const group = (list, key) => {
  const m = new Map();
  for (const r of list) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
if (stale.length) {
  console.log('\nORIGINAL ACCENT SURVIVES — by category:');
  for (const [c, n] of group(stale, 'cat')) console.log(`  ${c.padEnd(19)} ${n}`);
  for (const r of stale.slice(0, 25)) console.log(`   ${r.id.padEnd(7)} ${r.cat.padEnd(17)} ${r.family.padEnd(10)} ${r.staleAccent}x on ${r.staleList.join(',')}`);
}
if (regressed.length) {
  console.log('\nCONTRAST LOST UNDER THE NEW PALETTE — by category:');
  for (const [c, n] of group(regressed, 'cat')) console.log(`  ${c.padEnd(19)} ${n}`);
  for (const r of regressed.slice(0, 30)) {
    const worst = r.newFails.sort((a, b) => a.ratio - b.ratio)[0];
    console.log(`   ${r.id.padEnd(7)} ${r.cat.padEnd(17)} ${r.family.padEnd(10)} ${r.newFails.length} run(s), worst ${worst.ratio}:1 (needs ${worst.need}) on ${worst.sel} "${worst.text}"`);
  }
}
if (noAccentReach.length) {
  console.log('\nNEW ACCENT NEVER ARRIVES:');
  for (const r of noAccentReach) console.log(`   ${r.id.padEnd(7)} ${r.cat.padEnd(17)} ${r.family} (default palette painted ${r.baseAccentUse} accent surface(s))`);
}
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.length} — first: ${pageErrors[0]}`);

process.exit(0);
