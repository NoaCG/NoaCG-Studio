// Does a catalog design ABSORB a brand mark, or merely hold a file?
//
//   node scripts/ai-lite-brand-audit.mjs               # every logo-capable lower third
//   node scripts/ai-lite-brand-audit.mjs --lite        # the six audited NoaCG Lite chassis
//   node scripts/ai-lite-brand-audit.mjs --all         # every lower third, slot or not
//   node scripts/ai-lite-brand-audit.mjs --ids lt07,lt08
//   node scripts/ai-lite-brand-audit.mjs --marks badge-square,banner-wide
//   node scripts/ai-lite-brand-audit.mjs --check       # GATE: exit 1 on any failing pair
//   node scripts/ai-lite-brand-audit.mjs --json out.json
//
// SPENDS NO TOKENS. Needs the dev server (it renders the real templates through it).
//
// WHY THIS EXISTS. Lite has only ever been asked to REPRODUCE a template. The product promise
// is a channel's OWN graphic, which means adding something the catalog design never contained -
// and nothing in the tree measures whether an added mark landed coherently. Every existing gate
// is blind to it in a different way: `validateTemplate` asks whether the field exists,
// `overflow-sweep` asks whether a box escapes the frame (a logo squashed to a 4px strip does
// not), the runtime bench measures LAYOUT so it reads a perfectly placed <img> whatever the
// pixels inside it look like, `type-floor` measures font size, and `field-paint` asks only
// whether a field reaches any pixels at all. A mark can be present, bound, painted, on-frame,
// and still be crushed, cropped, invisible or sitting on top of the name.
//
// The method is `lite-line-capacity.mjs` inverted onto geometry: render the REAL template
// through the REAL assembler with a REAL mark in the slot, settle it, and read the painted
// result back. Nothing is inferred from the CSS - `object-fit`, the auto-fit cap, the panel
// padding and the family's radius all land in the measurement for free, and the one thing
// source reading gets reliably wrong is exactly the one that matters here: what a given
// ASPECT does inside a given slot.
//
// It also runs each chassis WITHOUT the logo first, so "the mark cost the name a second line"
// is a comparison rather than a guess.

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import {
  LITE_BRAND_MARKS,
  LITE_BRAND_MARKS_BY_ID,
  LITE_BRAND_PALETTES,
  LITE_BRAND_FIXTURE_VERSION,
} from './ai-lite-brand-fixtures.mjs';

// ── The thresholds, and why each number is that number ────────────────────────────────
//
// These are the MEASURABLE half of "coherent". Each one is a claim a render can refute.
const RULES = {
  // Minimum painted height for a mark-shaped logo (aspect <= 3:1). The brand manual's own
  // floor is 16px for a mark, which is a print/UI number: at 1080p that is 1.5% of frame
  // height and gone on a phone. Doubled, and stated in DESIGN PIXELS at 1920x1080.
  minMarkPx: 32,
  // Minimum painted WIDTH for a lockup (aspect > 3:1), taken verbatim from the brand manual's
  // "full lockup: 96px wide". A wide lockup fails on width long before it fails on height.
  minLockupPx: 96,
  // Clear space, as a fraction of the mark's own painted height. The manual says 1x for a
  // standalone placement; inside a strap that would be absurd, and a quarter of the mark's
  // height is the smallest gap that still reads as deliberate rather than as a collision.
  clearRatio: 0.25,
  // Aspect tolerance. Anything beyond this is the mark being stretched to fit a well.
  aspectTolerance: 0.02,
  // A TRANSPARENT mark composites its ink straight onto the surface, so WCAG's non-text
  // floor applies to it as a graphical object: 3:1.
  inkContrast: 3,
  // A mark carrying its OWN field cannot vanish - the worst it can do is fail to separate from
  // a surface close to its own colour. A far lower floor, and a different question; see the
  // `inkHex` / `fieldHex` pair in the fixture bank.
  fieldSeparation: 1.5,
  // Title-safe at 1080p: the 5% inset the position doctrine already uses.
  safe: { left: 96, right: 1824, top: 54, bottom: 1026 },
};

// The house amber. A brand palette carrying none of it must leave none of it on screen.
const HOUSE_AMBER = [246, 166, 35];

/**
 * The failure codes that depend on the PALETTE rather than on the design's drawn geometry.
 *
 * The split exists because the two halves are declarable in different ways. Whether a 10:1 rail
 * letterboxes to a hairline in a given slot is a fact about the slot and never changes; whether a
 * dark-ink mark reads on it depends on what colour the user's package paints that surface. A
 * chassis can therefore declare which SHAPES it holds as a fixed list, and answer the tone
 * question with one word about the surface - and neither claim goes stale when the other moves.
 */
const TONE_CODES = new Set(['ink-contrast', 'field-separation', 'brand-accent-verbatim']);
const geometryFailures = (failures) => failures.filter((code) => !TONE_CODES.has(code));
// The broadcast backdrop every contrast composite ends on (model/cssVars.ts).
const BACKDROP = [16, 18, 22];

const args = process.argv.slice(2);
const flagValue = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};
const jsonOut = flagValue('--json');
const idFilter = (flagValue('--ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const markFilter = (flagValue('--marks') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CATEGORY = flagValue('--category') ?? 'lower-third';
// By default each mark is paired with the palette a sensible user would bring it: a knockout
// mark with a dark package, a dark-ink mark with a light one. That is the FAVOURABLE pairing,
// and it is deliberately not the only one worth running - `--palette paper` forces every mark
// onto the light package, which is the case a knockout-only brand kit actually walks in with.
const FORCED_PALETTE = flagValue('--palette');
if (FORCED_PALETTE && !LITE_BRAND_PALETTES[FORCED_PALETTE]) {
  console.error(`Unknown --palette. Known: ${Object.keys(LITE_BRAND_PALETTES).join(', ')}`);
  process.exit(2);
}
const LITE_ONLY = args.includes('--lite');
const ALL = args.includes('--all');
const CHECK = args.includes('--check');

const MARKS = markFilter.length
  ? LITE_BRAND_MARKS.filter((m) => markFilter.includes(m.id))
  : LITE_BRAND_MARKS;
if (!MARKS.length) {
  console.error(`No marks matched --marks. Known ids: ${LITE_BRAND_MARKS.map((m) => m.id).join(', ')}`);
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__struct = await import('/src/model/structure.ts');
  window.__lite = await import('/src/ai/lite/contract.ts');
});

// The target set comes from the CATALOG's own `logo` capability, never from a list kept here:
// a gate holding its own copy of what it checks is checking its homework, and the copy goes
// stale the first time a design opts in.
const targets = await page.evaluate(
  ([category, lite, all, ids]) => {
    const pool = (window.__cat.CATALOG[category] || []).map((v) => ({
      id: v.id, name: v.name, family: v.styleTag, logo: v.logo,
      imageSlot: v.imageSlot ?? 'mark', maxLines: v.maxLines,
    }));
    if (ids.length) return pool.filter((v) => ids.includes(v.id));
    if (lite) {
      const liteIds = window.__lite.LITE_CATALOG.map((e) => e.variantId);
      return pool.filter((v) => liteIds.includes(v.id));
    }
    // A `picture` well is not a mark well: cropping release artwork to a square is the design
    // being right, and grading it against the mark rules reports a defect that is a feature
    // (model/wizard.ts `imageSlot`). Excluded by default and NAMED in the output, never
    // silently dropped - a target set that shrinks without saying so reads as full coverage.
    return all ? pool : pool.filter((v) => v.logo !== 'none' && v.imageSlot !== 'picture');
  },
  [CATEGORY, LITE_ONLY, ALL, idFilter],
);

if (!targets.length) {
  console.error(`No variants selected for category "${CATEGORY}".`);
  await browser.close();
  process.exit(2);
}

// ── The instrument checks ITSELF first ───────────────────────────────────────────────
//
// A mark whose artwork overflows its own viewBox is clipped before the product ever sees it,
// and the render then shows a cut-off logo that looks exactly like a placement defect. That is
// not hypothetical: `banner-wide` declared a 960-wide viewBox around a text run ending at 1242,
// and the 2026-08-09 brand round wrote the result up as the PRODUCT clipping a mark. A broken
// fixture does not read as a broken fixture; it reads as a broken product, and everything this
// script says afterwards is measured through it.
//
// So every mark is rendered alone and its ink bounding box compared with its own viewBox, before
// a single chassis is touched.
const markFaults = await page.evaluate((marks) => {
  const faults = [];
  for (const mark of marks) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0';
    host.innerHTML = atob(mark.data.split(',')[1]);
    document.body.appendChild(host);
    const svg = host.querySelector('svg');
    if (!svg) { faults.push(`${mark.id}: not an inline SVG`); host.remove(); continue; }
    const [, , vbW, vbH] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(/\s+/).map(Number);
    for (const node of svg.querySelectorAll('text, rect, path, circle')) {
      const box = node.getBBox();
      // A stroke paints outside the geometric box, so allow its half-width before complaining.
      const slack = (parseFloat(getComputedStyle(node).strokeWidth) || 0) / 2 + 0.5;
      if (box.x + box.width > vbW + slack || box.y + box.height > vbH + slack || box.x < -slack || box.y < -slack) {
        faults.push(`${mark.id}: <${node.tagName}> spans ${Math.round(box.x)}..${Math.round(box.x + box.width)} x `
          + `${Math.round(box.y)}..${Math.round(box.y + box.height)} outside its ${vbW}x${vbH} viewBox`);
      }
    }
    // The declared natural size has to be the viewBox, or every aspect this script computes is
    // measuring one mark and reporting another.
    if (vbW !== mark.natural.width || vbH !== mark.natural.height) {
      faults.push(`${mark.id}: declares natural ${mark.natural.width}x${mark.natural.height}, viewBox is ${vbW}x${vbH}`);
    }
    host.remove();
  }
  return faults;
}, LITE_BRAND_MARKS.map(({ id, data, natural }) => ({ id, data, natural })));

if (markFaults.length) {
  console.error('The MARK BANK is faulty - fix it before trusting anything below:');
  for (const fault of markFaults) console.error(`  x ${fault}`);
  await browser.close();
  process.exit(2);
}

// Say what the default target set left out, so a shrinking denominator is visible.
if (!ALL && !LITE_ONLY && !idFilter.length) {
  const excluded = await page.evaluate(
    (category) => (window.__cat.CATALOG[category] || [])
      .filter((v) => v.logo !== 'none' && (v.imageSlot ?? 'mark') === 'picture')
      .map((v) => v.id),
    CATEGORY,
  );
  if (excluded.length) {
    console.log(`Excluded ${excluded.length} picture well(s), not mark wells: ${excluded.join(', ')}.\n`);
  }
}

await page.evaluate(([rules, backdrop, houseAmber]) => {
  const rgba = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[, /]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const hexRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
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
  const near = (c, target, tol) =>
    Math.abs(c[0] - target[0]) <= tol && Math.abs(c[1] - target[1]) <= tol && Math.abs(c[2] - target[2]) <= tol;

  /** Straight-line separation between two rects; 0 means they touch or overlap. */
  const rectGap = (a, b) => {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return { gap: Math.hypot(dx, dy), overlaps: dx === 0 && dy === 0 };
  };

  /**
   * Where the IMAGE ITSELF is painted inside its own element box - which is not the element
   * box, and the difference is the whole defect class. A 10:1 lockup inside a square well set
   * to `object-fit: contain` paints a strip a tenth of the box's height; every layout gate in
   * the tree sees the box.
   */
  const paintedImageRect = (img, cs, natural) => {
    const box = img.getBoundingClientRect();
    const pad = (side) => parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0;
    const border = (side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
    const cw = Math.max(0, box.width - pad('left') - pad('right') - border('left') - border('right'));
    const ch = Math.max(0, box.height - pad('top') - pad('bottom') - border('top') - border('bottom'));
    const cx = box.left + pad('left') + border('left');
    const cy = box.top + pad('top') + border('top');
    const nw = natural.width, nh = natural.height;
    const fit = cs.objectFit || 'fill';

    let w = cw, h = ch, cropped = false, distorted = false;
    if (fit === 'contain' || fit === 'scale-down') {
      let scale = Math.min(cw / nw, ch / nh);
      if (fit === 'scale-down') scale = Math.min(1, scale);
      w = nw * scale; h = nh * scale;
    } else if (fit === 'cover') {
      const scale = Math.max(cw / nw, ch / nh);
      cropped = Math.abs(nw * scale - cw) > 1 || Math.abs(nh * scale - ch) > 1;
    } else if (fit === 'none') {
      w = Math.min(cw, nw); h = Math.min(ch, nh);
      cropped = nw > cw + 1 || nh > ch + 1;
    } else {
      distorted = Math.abs((cw / Math.max(ch, 0.001)) / (nw / nh) - 1) > rules.aspectTolerance;
    }
    // object-position, in the only two forms the catalog uses (a keyword pair or percentages).
    const posParts = String(cs.objectPosition || '50% 50%').split(/\s+/);
    const frac = (part, fallback) => {
      if (part === undefined) return fallback;
      if (part.endsWith('%')) return parseFloat(part) / 100;
      if (part === 'left' || part === 'top') return 0;
      if (part === 'right' || part === 'bottom') return 1;
      if (part === 'center') return 0.5;
      return fallback;
    };
    const left = cx + (cw - w) * frac(posParts[0], 0.5);
    const top = cy + (ch - h) * frac(posParts[1], 0.5);
    return {
      left, top, width: w, height: h, right: left + w, bottom: top + h,
      boxWidth: box.width, boxHeight: box.height, fit, cropped, distorted,
    };
  };

  /** The surface a rect is composited over: every ancestor background down to the backdrop. */
  const backdropUnder = (el, w) => {
    const stack = [];
    let node = el.parentElement;
    while (node && node !== el.ownerDocument.documentElement) {
      const cs = w.getComputedStyle(node);
      const bg = rgba(cs.backgroundColor);
      if (bg && bg[3] > 0) stack.push(bg);
      const image = cs.backgroundImage;
      if (image && image !== 'none') {
        const stops = [...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter((c) => c && c[3] > 0);
        // The darkest stop is the honest worst case for a light ink and the best case for a
        // dark one; a scrim is a real backdrop and reporting its mean would flatter both.
        if (stops.length) {
          stops.sort((a, b) => lum(over(a, backdrop)) - lum(over(b, backdrop)));
          stack.push(el.__wantsDark ? stops[stops.length - 1] : stops[0]);
        }
      }
      node = node.parentElement;
    }
    let bg = backdrop.slice();
    for (const c of stack.reverse()) bg = over(c, bg);
    return bg;
  };

  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  const renderFrame = async (variant, options) => {
    const template = variant.create(options);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
    frame.srcdoc = window.__comp.composeDocument(template);
    document.body.appendChild(frame);
    await settle(900);
    try { frame.contentWindow.play && frame.contentWindow.play(); } catch { /* no play() is fine */ }
    await settle(2400);
    return { frame, template };
  };

  /** Line counts for the first two TEXT fields - the identity pair a mark must not cost. */
  const identityLines = (frame) => {
    const w = frame.contentWindow, doc = frame.contentDocument;
    const fields = (w.SPXGCTemplateDefinition?.DataFields ?? [])
      .filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')
      .slice(0, 2);
    return fields.map((f) => {
      const el = doc.getElementById(f.field);
      if (!el) return { field: f.field, lines: 0 };
      const cs = w.getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return { field: f.field, lines: Math.max(1, Math.round(el.getBoundingClientRect().height / lh)) };
    });
  };

  window.__brandAudit = async (spec) => {
    document.body.innerHTML = '';
    const variant = window.__cat.variantById(spec.id);
    if (!variant) return { error: 'unknown variant' };
    const palette = {
      id: 'brand', name: 'Brand', styleTags: [variant.styleTag], ...spec.palette,
    };

    // Baseline: the same design, the same palette, NO logo. What the mark has to not damage.
    // Cached per (chassis, palette) - it does not depend on the mark, and re-rendering it once
    // per mark doubled the run for an answer that cannot have changed.
    window.__baselines = window.__baselines ?? new Map();
    const baseKey = `${spec.id}|${JSON.stringify(spec.palette)}`;
    let baseLines = window.__baselines.get(baseKey);
    if (!baseLines) {
      const base = await renderFrame(variant, { palette });
      baseLines = identityLines(base.frame);
      base.frame.remove();
      window.__baselines.set(baseKey, baseLines);
    }

    const { frame, template } = await renderFrame(variant, {
      palette,
      logoEnabled: true,
      logoAssetPath: spec.mark.path,
      importedImages: [{ path: spec.mark.path, data: spec.mark.data }],
    });
    const w = frame.contentWindow, doc = frame.contentDocument;
    const prefix = window.__struct.detectPrefix(template.html);

    const failures = [];
    const definition = w.SPXGCTemplateDefinition?.DataFields ?? [];
    const fileFields = definition.filter((f) => f.ftype === 'filelist').map((f) => f.field);
    const img = fileFields.map((id) => doc.getElementById(id)).find((el) => el && el.tagName === 'IMG')
      ?? doc.querySelector(`img.${prefix}-logo`);

    if (!fileFields.length) failures.push('no-slot-field');
    if (!img) {
      frame.remove();
      return { id: spec.id, markId: spec.mark.id, failures: [...failures, 'no-slot-element'], baseLines };
    }

    const cs = w.getComputedStyle(img);
    const painted = paintedImageRect(img, cs, spec.mark.natural);
    if (painted.width < 1 || painted.height < 1 || cs.display === 'none' || cs.visibility === 'hidden') {
      frame.remove();
      return { id: spec.id, markId: spec.mark.id, painted, failures: [...failures, 'not-painted'], baseLines };
    }

    // 1. The mark is not distorted, and not cropped.
    if (painted.distorted) failures.push('aspect-distorted');
    if (painted.cropped) failures.push('cropped');

    // 2. It is big enough to be a logo rather than a smudge. Which dimension decides is the
    //    MARK's own aspect: a wide lockup dies on width, a crest on height.
    const naturalAspect = spec.mark.natural.width / spec.mark.natural.height;
    const isLockup = naturalAspect > 3;
    const minOk = isLockup ? painted.width >= rules.minLockupPx : painted.height >= rules.minMarkPx;
    if (!minOk) failures.push('below-min-size');

    // 3. Clear space, and never a collision. Neighbours are painting elements that are neither
    //    the logo's ancestors nor its descendants; an ancestor panel legitimately contains it.
    const logoRect = { left: painted.left, top: painted.top, right: painted.right, bottom: painted.bottom };
    let nearest = Infinity, nearestSel = '', collides = '';
    for (const el of doc.body.querySelectorAll('*')) {
      if (el === img || el.contains(img) || img.contains(el)) continue;
      const ecs = w.getComputedStyle(el);
      if (ecs.display === 'none' || ecs.visibility === 'hidden') continue;
      const bg = rgba(ecs.backgroundColor);
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      const paints = ownText || (bg && bg[3] > 0.02) || (ecs.backgroundImage && ecs.backgroundImage !== 'none');
      if (!paints) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // An element that CONTAINS the whole logo is a surface, not a neighbour.
      if (r.left <= logoRect.left && r.top <= logoRect.top && r.right >= logoRect.right && r.bottom >= logoRect.bottom) continue;
      // Nor is the design's own ACCENT. Clear space asks whether the mark is crowded by
      // something competing with it; an accent is structural furniture fused to the panel's
      // edge, and every design gives its TEXT exactly the same distance from it. Counting it
      // said lt05 could hold only a rail - while the one frame this whole round judged GOOD was
      // a crest on lt05, at the very distance being called a failure. A threshold contradicted
      // by the picture it is supposed to predict is measuring the wrong neighbour, and moving
      // the number to fit would have hidden that instead of fixing it.
      if (el.classList.contains(`${prefix}-accent`)) continue;
      const sel = el.id ? `#${el.id}` : (typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase());
      const { gap, overlaps } = rectGap(logoRect, r);
      if (overlaps) { collides = collides || sel; continue; }
      if (gap < nearest) { nearest = gap; nearestSel = sel; }
    }
    const needClear = painted.height * rules.clearRatio;
    if (collides) failures.push('collision');
    else if (nearest < needClear) failures.push('clear-space');

    // 4. Inside the design's own box, and inside title-safe. A mark hanging off the panel is
    //    the "floating logo" defect, and neither the bench nor overflow-sweep reports it.
    const box = doc.querySelector(`.${prefix}-box`) ?? doc.querySelector(`.${prefix}`);
    const boxRect = box ? box.getBoundingClientRect() : null;
    if (boxRect && (logoRect.left < boxRect.left - 1 || logoRect.right > boxRect.right + 1
      || logoRect.top < boxRect.top - 1 || logoRect.bottom > boxRect.bottom + 1)) {
      failures.push('outside-box');
    }
    if (logoRect.left < rules.safe.left || logoRect.right > rules.safe.right
      || logoRect.top < rules.safe.top || logoRect.bottom > rules.safe.bottom) {
      failures.push('outside-safe-area');
    }

    // 5. The mark's ink reads against the surface the design actually gives it. This is the
    //    only question a knockout-only mark can fail on a pale package, and the reason `tone`
    //    is declared in the fixture rather than guessed back out of the pixels.
    const field = spec.mark.fieldHex ? hexRgb(spec.mark.fieldHex) : null;
    // Which side of a gradient scrim is the honest worst case depends on what has to read:
    // a light ink wants the scrim's palest stop under it, a dark ink its darkest.
    const judged = field ?? hexRgb(spec.mark.inkHex) ?? [255, 255, 255];
    img.__wantsDark = lum(judged) > 0.5;
    const surface = backdropUnder(img, w);
    const inkRatio = Math.round(contrast(judged, surface) * 100) / 100;
    const inkFloor = field ? rules.fieldSeparation : rules.inkContrast;
    if (inkRatio < inkFloor) failures.push(field ? 'field-separation' : 'ink-contrast');

    // 6. The accent came from the brand, and the house amber did not survive it.
    //
    // TWO rules, one scan, because they are the two halves of one question. The negative twin
    // (`house-accent-survives`) catches NoaCG's amber left behind at tolerance 12, which is
    // slack enough to catch a blend of it. The positive twin (`brand-accent-verbatim`,
    // docs/AI_LITE_BRAND_PLAN.md §3.1) asks whether the brand's OWN accent reached the frame,
    // and it is measured at TOLERANCE 0: "exactly the brand's colours" is the product claim,
    // so a near-miss is the defect, not a pass. Nothing else in the tree asks it - a graphic
    // that quietly lost its accent to a chassis default paints a perfectly valid frame, and
    // every existing rule here measures the MARK.
    const brandAccent = hexRgb(spec.palette.accent);
    let amber = '';
    let accentSeen = '';
    const sample = (c, where) => {
      if (!c || c[3] <= 0.2) return;
      if (near(c, houseAmber, 12)) amber = amber || where;
      if (brandAccent && near(c, brandAccent, 0)) accentSeen = accentSeen || where;
    };
    for (const el of doc.body.querySelectorAll('*')) {
      const ecs = w.getComputedStyle(el);
      if (ecs.display === 'none') continue;
      for (const prop of ['background-color', 'color', 'border-top-color', 'border-left-color', 'fill']) {
        sample(rgba(ecs.getPropertyValue(prop)), `${prop} on ${el.tagName.toLowerCase()}`);
      }
      const image = ecs.backgroundImage;
      if (image && image !== 'none') {
        for (const m of image.matchAll(/rgba?\([^)]+\)/g)) sample(rgba(m[0]), 'background-image stop');
      }
    }
    if (amber) failures.push('house-accent-survives');
    if (!accentSeen) failures.push('brand-accent-verbatim');

    // 7. The mark did not cost the identity lines their shape.
    const withLines = identityLines(frame);
    const costText = withLines.some((line, i) => baseLines[i] && line.lines > baseLines[i].lines);
    if (costText) failures.push('logo-costs-text');

    frame.remove();
    return {
      id: spec.id, markId: spec.mark.id, failures,
      painted: {
        w: Math.round(painted.width), h: Math.round(painted.height),
        boxW: Math.round(painted.boxWidth), boxH: Math.round(painted.boxHeight), fit: painted.fit,
      },
      clear: Number.isFinite(nearest) ? Math.round(nearest) : null,
      needClear: Math.round(needClear),
      nearestSel: collides || nearestSel,
      inkRatio,
      // The relative luminance of the surface the SLOT paints, composited down to the
      // broadcast backdrop. This is the fact a chassis can honestly declare about which marks
      // it can host: a mark's own colours are the user's, but the surface is the design's.
      surfaceLum: Math.round(lum(surface) * 1000) / 1000,
      amber,
      // Where the brand's exact accent landed, so a `brand-accent-verbatim` failure can be
      // read as "nowhere" rather than investigated from scratch.
      accent: accentSeen,
      baseLines, withLines,
    };
  };
}, [RULES, BACKDROP, HOUSE_AMBER]);

const results = [];
for (const target of targets) {
  for (const mark of MARKS) {
    const palette = LITE_BRAND_PALETTES[FORCED_PALETTE ?? (mark.tone === 'dark' ? 'paper' : 'meridian')];
    const row = await page.evaluate(
      (spec) => window.__brandAudit(spec),
      { id: target.id, mark, palette },
    );
    results.push({ ...target, mark: mark.id, ...row });
  }
}
// Read the declarations while the page is still alive - the gate below runs after the browser
// is gone, and a check that cannot reach its expected values would silently pass.
const declaredLogoSlots = await page.evaluate(() => Object.fromEntries(
  window.__lite.LITE_CATALOG.map((e) => [e.variantId, e.logoSlot ?? null]),
));
await browser.close();

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ version: LITE_BRAND_FIXTURE_VERSION, rules: RULES, results }, null, 1));
}

console.log(`Brand-mark absorption, measured at 1920x1080. Fixture bank v${LITE_BRAND_FIXTURE_VERSION}.`);
console.log(`Rules: mark >= ${RULES.minMarkPx}px tall, lockup >= ${RULES.minLockupPx}px wide, `
  + `clear space >= ${RULES.clearRatio} x painted height, transparent-mark ink >= `
  + `${RULES.inkContrast}:1, own-field mark >= ${RULES.fieldSeparation}:1, `
  + `aspect within ${RULES.aspectTolerance * 100}%, brand accent painted at tolerance 0.\n`);

console.log('chassis  logo      mark              painted    fit        clear/need  ink    verdict');
for (const r of results) {
  if (r.error) { console.log(`${r.id.padEnd(8)} ERROR: ${r.error}`); continue; }
  // The early-return rows (no slot, nothing painted) carry the raw measurement rather than the
  // rounded one, so read defensively - a table that prints `undefinedxundefined` reads as a
  // broken script rather than as the finding it is.
  const painted = Number.isFinite(r.painted?.w) ? `${r.painted.w}x${r.painted.h}`.padEnd(10) : '-'.padEnd(10);
  const fit = Number.isFinite(r.painted?.w) ? String(r.painted.fit).padEnd(10) : '-'.padEnd(10);
  const clear = r.clear === null || r.clear === undefined ? '-'.padEnd(11)
    : `${r.clear}/${r.needClear}`.padEnd(11);
  const ink = r.inkRatio === undefined ? '-'.padEnd(6) : `${r.inkRatio}`.padEnd(6);
  const verdict = r.failures.length ? r.failures.join(' ') : 'ok';
  console.log(
    `${r.id.padEnd(8)} ${String(r.logo).padEnd(9)} ${String(r.mark).padEnd(17)} ${painted} ${fit} ${clear} ${ink} ${verdict}`,
  );
}

const failing = results.filter((r) => r.error || r.failures?.length);
const byChassis = new Map();
for (const r of results) {
  const entry = byChassis.get(r.id) ?? { id: r.id, name: r.name, pass: 0, fail: 0 };
  if (r.error || r.failures?.length) entry.fail += 1; else entry.pass += 1;
  byChassis.set(r.id, entry);
}
const clean = [...byChassis.values()].filter((c) => c.fail === 0);

console.log(`\n${results.length - failing.length} of ${results.length} chassis/mark pairs absorbed the mark.`);
console.log(`Chassis clean on every mark: ${clean.length ? clean.map((c) => c.id).join(', ') : 'none'}.`);

const codes = new Map();
for (const r of failing) for (const code of r.failures ?? ['error']) codes.set(code, (codes.get(code) ?? 0) + 1);
if (codes.size) {
  console.log('\nFailures by cause:');
  for (const [code, n] of [...codes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${code}`);
}

// ── The declaration gate: LITE_CATALOG.logoSlot against this render ───────────────────
//
// Same contract as `supportingLineChars` and `lite-line-capacity.mjs --check`: the expected
// values live in `src/ai/lite/contract.ts`, never in a copy beside the gate, because a gate
// holding its own answers is checking its homework. `--lite --check` is the form that gates it.
function checkLiteDeclarations(declared) {
  const problems = [];
  for (const [id, claim] of Object.entries(declared)) {
    const rows = results.filter((r) => r.id === id);
    if (!rows.length) continue;
    // Declared in SHAPES, measured on fixtures: a shape counts as fitting only when EVERY
    // fixture of that shape landed. Two wordmarks differ only in ink, so they always agree
    // geometrically - but taking `some` here would let one bad sample of a future shape pass,
    // and the claim the model reads is "this slot holds that shape", not "sometimes does".
    const byShape = new Map();
    for (const row of rows) {
      const shape = LITE_BRAND_MARKS_BY_ID.get(row.mark)?.shape;
      if (!shape) continue;
      const ok = !geometryFailures(row.failures ?? ['error']).length;
      byShape.set(shape, (byShape.get(shape) ?? true) && ok);
    }
    const fits = [...byShape].filter(([, ok]) => ok).map(([shape]) => shape).sort();
    // Two distinct surface luminances across the run means the slot sits on a surface the
    // PALETTE paints (the run pairs marks with different packages); one dark reading means the
    // slot sits on the picture, and no palette can make it light.
    const lums = [...new Set(rows.map((r) => r.surfaceLum).filter((v) => typeof v === 'number'))];
    const surface = lums.length > 1 || lums.some((v) => v > 0.2) ? 'palette' : 'dark';

    if (!claim) {
      problems.push(`${id}: declares no logoSlot; measured surface ${surface}, fits ${fits.join(',') || 'nothing'}.`);
      continue;
    }
    if (claim.surface !== surface) {
      problems.push(`${id}: declares surface '${claim.surface}', measured '${surface}'.`);
    }
    const claimed = [...(claim.fits ?? [])].sort();
    const over = claimed.filter((m) => !fits.includes(m));
    const under = fits.filter((m) => !claimed.includes(m));
    // Asymmetric, like the line-capacity gate: a claim ABOVE the measurement is the defect,
    // because the model is told a mark shape will land and it does not.
    if (over.length) problems.push(`${id}: claims it fits ${over.join(',')} and does not.`);
    if (under.length) problems.push(`${id}: fits ${under.join(',')} and does not claim it - stale, so the design is under-used.`);
  }
  return problems;
}

if (CHECK) {
  let problems = [];
  // The declaration half needs the WHOLE bank at the default pairing, and refuses rather than
  // reports on a subset. Measured on two marks it called three chassis over-claiming for the
  // three it had not rendered, and read `surface` off a single palette - a gate that turns a
  // narrowed run into a list of imaginary defects is worse than one that declines to answer.
  if (LITE_ONLY && markFilter.length) {
    console.log('\n--check skipped the declaration gate: --marks narrows the bank, and `fits` '
      + 'can only be compared against a full run. Re-run without --marks.');
  } else if (LITE_ONLY && FORCED_PALETTE) {
    console.log('\n--check skipped the declaration gate: --palette pins one package, and '
      + '`surface` is read from the default pairing. Re-run without --palette.');
  } else if (LITE_ONLY) {
    problems = checkLiteDeclarations(declaredLogoSlots);
    for (const line of problems) console.log(`  x ${line}`);
    if (problems.length) {
      console.log(`\n${problems.length} declaration problem(s). Update logoSlot in src/ai/lite/contract.ts.`);
    } else {
      console.log('\nLITE_CATALOG.logoSlot agrees with the render on every audited chassis.');
    }
  }
  // WHAT FAILS THE RUN depends on which question was asked, and conflating the two would leave
  // a gate that can never go green.
  //
  // `--lite` asks "does LITE_CATALOG still describe the render". A failing PAIR there is usually
  // not a defect: lt02 cannot show a dark-ink mark because it has no panel to put one on, and
  // the declaration says exactly that. Holding the run red for it would mean a permanent red
  // that everyone learns to skip, which is worse than no gate.
  //
  // Every other form asks "does this chassis absorb a mark", and there a failing pair is the
  // finding.
  process.exitCode = (LITE_ONLY ? problems.length : failing.length || problems.length) ? 1 : 0;
  if (failing.length) {
    console.log(`\n${failing.length} failing pair(s)`
      + (LITE_ONLY
        ? ' - not a failure of this run: `--lite` gates the DECLARATION, and a tone limit a '
          + 'chassis honestly declares is a fact, not a defect. Re-read the table if a GEOMETRY '
          + 'code appears, because those are not declarable.'
        : '. A chassis is only fit for a Lite brand allowlist when it is clean on every mark '
          + 'shape - a slot that works for a crest and crushes a lockup is a slot the model would '
          + 'have to reason about, which is the decision this design removes.'));
  }
} else {
  console.log('\nRun with --check to gate. Nothing here spends tokens.');
}
