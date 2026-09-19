// The CATALOG SAMENESS instrument: how much of the catalog is one design decision repeated?
//
// Why this exists: "the catalog reads as one product" was a taste verdict, and the note that
// recorded it (docs/LOOKS_AND_PALETTES.md) measured only the three DECLARED axes - style family,
// palette, typeface. Those are the axes a design record carries, not the axes an eye reads. This
// reads the EMITTED code instead: what the stylesheet paints, what the markup builds, and what
// the NOACG_ANIM block moves. Free - no model calls, no renders (docs/CATALOG_VARIETY.md).
//
// It reports four things, in the order the argument needs them:
//   1. the declared axes, and how welded they are to each other
//   2. the LOOK VECTOR - fourteen decisions a viewer can see - and how much of each is explained
//      by the style family versus by the graphic category (this is the finding)
//   3. the MOTION VOCABULARY - which layers move on which properties, line count collapsed
//   4. the ORPHANS - designs no kit can offer - bucketed by mechanism and measured for
//      distinctness against the designs a kit CAN offer
//
// Usage (dev server must be running for this checkout - scripts/dev-port.mjs):
//   node scripts/catalog-sameness.mjs
//   node scripts/catalog-sameness.mjs --json out.json
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;

// ── Read the live registry, the same way scripts/factory.mjs does ────────────────────────
const PROBE = `(async () => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { PACKS } = await import('/src/templates/packs.ts');
  const { kitChoices } = await import('/src/templates/kit.ts');
  const { TYPES } = await import('/src/templates/types/registry.ts');

  const variants = [];
  for (const [category, list] of Object.entries(CATALOG)) {
    for (const v of list ?? []) {
      let emitted = null, error = null;
      try {
        const t = v.create({});
        emitted = { html: t.html, css: t.css, js: t.js };
      } catch (e) { error = String((e && e.message) || e); }
      variants.push({
        id: v.id, name: v.name, category, styleTag: v.styleTag,
        palette: v.defaultPalette?.id ?? null, fontId: v.defaultFontId ?? null,
        zone: v.defaultZone ?? null, presets: v.animationPresets ?? null,
        logo: v.logo ?? null, emitted, error,
      });
    }
  }

  // What the kit picker can put in front of a user, in ANY look - the KIT_MATRIX_GAPS
  // "offered" number, asked through the resolver the create path runs.
  const families = ['minimal', 'sport', 'glass', 'noacg', 'editorial', 'cinematic', 'sticker', 'showtime', 'arcade'];
  const reachable = new Set();
  for (const pack of PACKS) {
    for (const fam of families) {
      try { for (const c of kitChoices(pack, fam)) reachable.add(c.variant.id); } catch { /* an unresolvable look is KIT_MATRIX_GAPS' finding, not this one's */ }
    }
  }

  // WHAT THE STOREFRONT SHOWS FIRST, per category, through the REAL browse engine rather than a
  // guess at its order. Browse renders a PAGE of twelve, so for most people the first twelve ARE
  // the category (docs/GOALS_ARCHIVE.md "Student release" step 11).
  const { browseTemplates, NO_BROWSE_FILTERS } = await import('/src/templates/search.ts');
  const { GRAPHIC_CATEGORIES } = await import('/src/model/taxonomy.ts');
  const firstPage = {};
  for (const cat of GRAPHIC_CATEGORIES) {
    try {
      const outcome = browseTemplates({ ...NO_BROWSE_FILTERS, category: cat.id });
      const shown = [...(outcome.best ?? []), ...(outcome.also ?? [])];
      firstPage[cat.id] = { name: cat.name, total: shown.length, page: shown.slice(0, 12).map((r) => r.variant.id) };
    } catch (e) {
      firstPage[cat.id] = { name: cat.name, error: String((e && e.message) || e) };
    }
  }

  return {
    variants,
    firstPage,
    reachable: [...reachable],
    packs: PACKS.map((p) => ({ id: p.id, family: p.family ?? null, paletteId: p.paletteId ?? null, types: p.types ?? [], extras: p.extras ?? [] })),
    types: TYPES.map((t) => ({ id: t.id, category: t.structure?.category ?? null, designs: (t.designs ?? []).map((d) => d.id) })),
  };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
let data;
try {
  await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Escape');
  data = await page.evaluate(PROBE + '()');
} catch (e) {
  console.error(`Could not reach the app at http://localhost:${devPort()}. Start the dev server first.`);
  console.error(String(e.message ?? e));
  await browser.close();
  process.exit(2);
} finally {
  await browser.close();
}

const { variants, packs, types } = data;
const reachable = new Set(data.reachable);
const broken = variants.filter((v) => v.error);
if (broken.length) console.error(`WARNING: ${broken.length} variants failed to build: ${broken.map((v) => v.id).join(' ')}`);
const built = variants.filter((v) => v.emitted);

// ── Small helpers ────────────────────────────────────────────────────────────────────────
const tally = (items) => {
  const m = new Map();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n, total) => `${round((100 * n) / total)}%`;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const uniq = (a) => [...new Set(a)];

/** Flat rule list. Generated CSS has no nesting, so a regex parse is exact here. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripComments(css)))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    const decls = new Map();
    for (const part of m[2].split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const prop = part.slice(0, i).trim();
      if (prop) decls.set(prop, part.slice(i + 1).trim().replace(/\s+/g, ' '));
    }
    out.push({ selector, decls });
  }
  return out;
}
// The design's own class prefix: the FIRST class of the FIRST element in <body>.
//
// `[^"]*` before the closing quote is load-bearing. Without it the pattern only matched a
// SINGLE-class root, so a root written `<div class="credits credits--editorial">` was skipped
// and the lazy scan landed on the next single-class div instead — the category's full-frame
// `.credits-background`. Both full-frame categories write their root that way, so all 13
// end-credits and all 19 starting-soon designs read back with the same two values: the box
// lookup found the background's opaque literal (panel `solid-literal`) and the painted-parts
// scan matched only the background itself (`['-root']`). 32 designs, one look, no signal.
const prefixOf = (v) => v.emitted.html.match(/<body>[\s\S]*?<div class="([a-z0-9-]+)[^"]*"/)?.[1] ?? v.category;
const pxOf = (s) => { const m = String(s).match(/(-?[\d.]+)\s*px/); return m ? Number(m[1]) : null; };
const bucket = (n, steps) => {
  if (n == null) return 'na';
  for (const s of steps) if (n <= s) return String(s);
  return `>${steps[steps.length - 1]}`;
};
/** Shannon entropy of a count list, in bits. */
const H = (counts) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return total ? -counts.reduce((a, c) => a + (c / total) * Math.log2(c / total), 0) : 0;
};

// ── 1. The declared axes ─────────────────────────────────────────────────────────────────
const triples = tally(built.map((v) => `${v.styleTag}/${v.palette}/${v.fontId}`));
const cum = (t, n) => t.slice(0, n).reduce((a, b) => a + b[1], 0);

console.log(`\n═══ 1. THE DECLARED AXES — ${built.length} designs ═══`);
console.log(`families ${uniq(built.map((v) => v.styleTag)).length} · palettes in use ${uniq(built.map((v) => v.palette)).length} · typefaces in use ${uniq(built.map((v) => v.fontId)).length}`);
console.log(`distinct (family, palette, typeface) triples: ${triples.length}`);
console.log(`  top 4 cover ${cum(triples, 4)} designs (${pct(cum(triples, 4), built.length)}) · top 6 ${pct(cum(triples, 6), built.length)}`);
for (const [t, n] of triples.slice(0, 6)) console.log(`    ${String(n).padStart(3)}  ${t}`);
for (const [label, key] of [['palette', 'palette'], ['typeface', 'fontId']]) {
  const marg = H(tally(built.map((v) => v[key])).map(([, n]) => n));
  let cond = 0;
  for (const f of uniq(built.map((v) => v.styleTag))) {
    const m = built.filter((v) => v.styleTag === f);
    cond += (m.length / built.length) * H(tally(m.map((v) => v[key])).map(([, n]) => n));
  }
  console.log(`  the family explains ${round(100 * (1 - cond / marg))}% of the ${label} choice (H ${round(marg, 2)} -> ${round(cond, 2)} bits)`);
}

// ── 2. The look vector ───────────────────────────────────────────────────────────────────
/** What the eye reads off a design's reading surface. */
function panelKind(bg) {
  if (!bg || bg === 'transparent' || bg === 'none') return 'none';
  if (/gradient/.test(bg)) return /transparent|,\s*0\s*\)/.test(bg) ? 'scrim' : 'gradient';
  if (/var\(--panel-bg/.test(bg)) return 'panel-token';
  if (/var\(--accent/.test(bg)) return 'accent-fill';
  const m = bg.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((x) => Number(x.trim()));
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return 'none';
    const light = (p[0] + p[1] + p[2]) / 3 > 128;
    return a >= 0.95 ? (light ? 'solid-light' : 'solid-dark') : (light ? 'glass-light' : 'tint-dark');
  }
  return /^#/.test(bg) ? 'solid-literal' : 'other';
}

const looks = built.map((v) => {
  const prefix = prefixOf(v);
  const rs = rules(v.emitted.css).filter((r) => !r.selector.startsWith(':root') && !r.selector.startsWith('html') && r.selector !== '*');
  const body = stripComments(v.emitted.css);
  const collect = (prop) => rs.flatMap((r) => (r.decls.has(prop) ? [r.decls.get(prop)] : []));
  const sizes = collect('font-size').map(pxOf).filter((n) => n != null);
  const radii = collect('border-radius').map(pxOf).filter((n) => n != null);

  let boxBg = '';
  for (const target of [`.${prefix}-box`, `.${prefix}`]) {
    for (const r of rs) {
      if (r.selector.split(',').map((s) => s.trim()).includes(target)) {
        boxBg = r.decls.get('background') ?? r.decls.get('background-color') ?? boxBg;
      }
    }
    if (boxBg) break;
  }

  // The design's drawn furniture: every part of its own that paints something.
  const painted = new Set();
  for (const r of rs) {
    const paints = ['background', 'background-color', 'border', 'border-left', 'border-right', 'border-top', 'border-bottom', 'clip-path', 'box-shadow']
      .some((p) => r.decls.has(p) && !/^(none|transparent)$/.test(r.decls.get(p)));
    if (!paints) continue;
    for (const sel of r.selector.split(',').map((s) => s.trim())) {
      const m = sel.match(new RegExp(`\\.${prefix}(-[a-z0-9-]+)?`));
      if (m) painted.add(m[1] ?? '-root');
    }
  }

  const vec = {
    panel: panelKind(boxBg),
    radius: /var\(--panel-radius/.test(body) ? 'token' : bucket(radii.length ? Math.max(...radii) : 0, [0, 4, 10, 18, 28, 999]),
    blur: /backdrop-filter/.test(body) ? 'yes' : 'no',
    skew: /skew[XY]?\(/.test(body) ? 'yes' : 'no',
    clip: /clip-path/.test(body) ? 'yes' : 'no',
    gradient: /linear-gradient|radial-gradient|conic-gradient/.test(body) ? 'yes' : 'no',
    layout: (() => {
      const d = new Set(collect('display').filter((x) => x !== 'none' && x !== 'inline-block'));
      return d.has('grid') ? 'grid' : d.has('flex') ? 'flex' : 'block';
    })(),
    columns: /grid-template-columns/.test(body) ? 'yes' : 'no',
    caps: /text-transform:\s*uppercase/.test(body) ? 'yes' : 'no',
    displayPx: bucket(sizes.length ? Math.max(...sizes) : null, [26, 34, 42, 52, 64, 80, 110]),
    sizeSteps: bucket(new Set(sizes).size, [1, 2, 3, 4, 6, 9]),
    weights: bucket(new Set(collect('font-weight')).size, [1, 2, 3, 4]),
    trackings: bucket(new Set(collect('letter-spacing')).size, [0, 1, 2, 3, 5]),
    parts: bucket(painted.size, [0, 1, 2, 3, 5, 8]),
  };
  return { id: v.id, name: v.name, category: v.category, family: v.styleTag, zone: v.zone, painted: [...painted].sort(), vec, sig: Object.values(vec).join('|') };
});
const lookById = new Map(looks.map((l) => [l.id, l]));
const AXES = Object.keys(looks[0].vec);

// SELF-CHECK: a whole category painting the SAME parts is a blind instrument, not a finding.
//
// This is the generic form of the bug that hid end-credits and starting-soon for a release
// (docs/CATALOG_VARIETY.md, "How it was measured"): the parts scan was matching a wrapper's
// class rather than the design's, so every design in both categories reported the same one
// part - and nothing said so, because the other twelve axes still varied and the numbers just
// read as a very uniform category. `painted` is the axis to watch precisely because it is the
// one derived from the prefix: no two designs of the same category have ever drawn exactly the
// same furniture, so a category-wide tie means the scan is looking at the wrong element.
//
// Checked against the blind run it was written for: it fires on both categories there and on
// nothing at all once the prefix is read correctly.
for (const cat of uniq(looks.map((l) => l.category))) {
  const ls = looks.filter((l) => l.category === cat);
  if (ls.length < 3 || uniq(ls.map((l) => l.painted.join('+'))).length !== 1) continue;
  console.error(`WARNING: all ${ls.length} ${cat} designs paint exactly [${ls[0].painted.join(', ')}].`);
  console.error("  That is the instrument, not the catalog - check that prefixOf() found this");
  console.error('  category\'s own class prefix rather than a wrapper element around it.');
}

console.log(`\n═══ 2. THE LOOK VECTOR — fourteen decisions a viewer can see ═══`);
console.log('axis        values  most common          explained by FAMILY   by CATEGORY');
for (const a of AXES) {
  const t = tally(looks.map((l) => l.vec[a]));
  const marg = H(t.map(([, n]) => n));
  const condOn = (key) => {
    let s = 0;
    for (const k of uniq(looks.map((l) => l[key]))) {
      const m = looks.filter((l) => l[key] === k);
      s += (m.length / looks.length) * H(tally(m.map((l) => l.vec[a])).map(([, n]) => n));
    }
    return s;
  };
  const fam = marg ? round(100 * (1 - condOn('family') / marg)) : 0;
  const cat = marg ? round(100 * (1 - condOn('category') / marg)) : 0;
  console.log(`  ${a.padEnd(10)} ${String(t.length).padStart(3)}    ${`${t[0][0]} ${pct(t[0][1], looks.length)}`.padEnd(20)} ${String(fam).padStart(14)}%  ${String(cat).padStart(10)}%`);
}

// ── 3. The motion vocabulary ─────────────────────────────────────────────────────────────
function animOf(v) {
  const js = v.emitted.js;
  const start = js.indexOf('var NOACG_ANIM = ');
  if (start < 0) return null;
  const open = js.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) {
      try { return JSON.parse(js.slice(open, i + 1)); } catch { return null; }
    }
  }
  return null;
}
const vocabOf = (v) => {
  const a = animOf(v);
  if (!a) return '';
  const prefix = prefixOf(v);
  const role = (sel) => sel.replace(new RegExp(prefix, 'g'), '').replace(/#f\d+/g, '#line').replace(/-(\d+)\b/g, '-N');
  // Repeated line tracks collapse: a 3-line and a 5-line design that move the same way ARE
  // the same decision, which is what a viewer sees.
  return (a.steps ?? []).map((s) => {
    const layers = uniq(Object.entries(s.layers ?? {}).map(([sel, t]) => `${role(sel)}:${Object.keys(t).sort().join('+')}`)).sort();
    return `${s.name}[${layers.join('|')}]`;
  }).join(' >> ');
};
const vocab = new Map(built.map((v) => [v.id, vocabOf(v)]));
const vocabTally = tally([...vocab.values()]);
console.log(`\n═══ 3. MOTION ═══`);
console.log(`distinct motion vocabularies: ${vocabTally.length} across ${built.length} designs`);
console.log(`  top 5 cover ${pct(cum(vocabTally, 5), built.length)} · top 10 ${pct(cum(vocabTally, 10), built.length)} · top 20 ${pct(cum(vocabTally, 20), built.length)} · used once ${vocabTally.filter(([, n]) => n === 1).length}`);
for (const [k, n] of vocabTally.slice(0, 5)) {
  const cats = tally(built.filter((v) => vocab.get(v.id) === k).map((v) => v.category));
  console.log(`    ${String(n).padStart(3)}  ${k.slice(0, 84)}`);
  console.log(`         ${cats.map(([c, x]) => `${c}x${x}`).join(' ')}`);
}
console.log(`  distinct DEFAULT presets (presets[0]): ${tally(built.map((v) => (v.presets ?? [])[0] ?? 'none')).length}`);
console.log(`  ease pairs: ${tally(built.map((v) => (animOf(v)?.steps ?? []).map((s) => s.ease).join(' -> '))).slice(0, 4).map(([k, n]) => `${k} (${n})`).join(' · ')}`);

// ── 4. Typography and drawn vocabulary ───────────────────────────────────────────────────
const faceUse = new Map();
for (const v of built) {
  for (const m of stripComments(v.emitted.css).matchAll(/url\("fonts\/([a-z0-9-]+)\.woff2"\)/g)) {
    faceUse.set(m[1], (faceUse.get(m[1]) ?? 0) + 1);
  }
}
console.log(`\n═══ 4. TYPOGRAPHY AND DRAWN VOCABULARY ═══`);
console.log(`typefaces emitted anywhere: ${faceUse.size} · chosen as a design's own typeface: ${uniq(built.map((v) => v.fontId)).length}`);
for (const [f, n] of [...faceUse.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(17)} emitted ${String(n).padStart(3)} · chosen by ${built.filter((v) => v.fontId === f).length}`);
}
const feature = (re) => built.filter((v) => re.test(stripComments(v.emitted.css))).length;
for (const [label, re] of [
  ['uppercase anywhere', /text-transform:\s*uppercase/],
  ['pill or circle (999px / 50%)', /border-radius:\s*(999px|50%)/],
  ['clip-path', /clip-path/],
  ['skew', /skew[XY]?\(/],
  ['rotate', /rotate\(/],
  ['conic or radial gradient', /conic-gradient|radial-gradient/],
  ['repeating gradient (texture)', /repeating-linear-gradient/],
  ['mask', /(^|[^-])mask(-image)?:/m],
  ['mix-blend-mode', /mix-blend-mode/],
  ['grid columns', /grid-template-columns/],
  ['writing-mode (vertical type)', /writing-mode/],
  ['background image (not a gradient)', /background-image:\s*url/],
]) console.log(`  ${label.padEnd(34)} ${String(feature(re)).padStart(3)}  ${pct(feature(re), built.length)}`);
console.log(`  ${'<svg> in the markup'.padEnd(34)} ${String(built.filter((v) => /<svg/i.test(v.emitted.html)).length).padStart(3)}`);
console.log(`  ${'<img> at defaults'.padEnd(34)} ${String(built.filter((v) => /<img/i.test(v.emitted.html)).length).padStart(3)}`);

// ── 5. Orphans ───────────────────────────────────────────────────────────────────────────
const typeOf = new Map();
for (const t of types) for (const id of t.designs) typeOf.set(id, t);
const catsWithType = new Set(types.map((t) => t.category));
const orphans = built.filter((v) => !reachable.has(v.id));
const mechanism = (v) =>
  ['editorial', 'cinematic', 'sticker', 'showtime', 'arcade'].includes(v.styleTag) ? 'A. a Browse-only family no kit resolves'
    : typeOf.has(v.id) ? 'B. a sibling of a type whose family cell another design holds'
      : !catsWithType.has(v.category) ? 'C. a category with no graphic type at all'
        : 'D. a type-less design no pack lists as an extra';

console.log(`\n═══ 5. ORPHANS — designs no kit can offer ═══`);
console.log(`${orphans.length} of ${built.length} (${pct(orphans.length, built.length)})`);
for (const [k, n] of tally(orphans.map(mechanism)).sort()) {
  const m = orphans.filter((v) => mechanism(v) === k);
  console.log(`  ${String(n).padStart(3)}  ${k}`);
  console.log(`       ${tally(m.map((v) => v.category)).map(([c, x]) => `${c}:${x}`).join(' ')}`);
}

// Distinctness: how far is each orphan from the nearest design a kit CAN offer, against the
// same measure taken among the reachable designs themselves.
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const i = [...A].filter((x) => B.has(x)).length;
  return i / (A.size + B.size - i || 1);
};
const distance = (a, b) => 1 - (
  0.5 * (AXES.filter((k) => a.vec[k] === b.vec[k]).length / AXES.length)
  + 0.2 * jaccard(a.painted, b.painted)
  + 0.2 * (vocab.get(a.id) === vocab.get(b.id) ? 1 : 0)
  + 0.1 * (a.zone === b.zone ? 1 : 0)
);
const reachLooks = looks.filter((l) => reachable.has(l.id));
const nearestIn = (l, pool) => pool.filter((r) => r.id !== l.id).map((r) => ({ r, d: distance(l, r) })).sort((a, b) => a.d - b.d)[0];

const orphanNN = [], reachNN = [];
const orphanRows = [];
for (const l of looks) {
  const pool = reachLooks.filter((r) => r.category === l.category);
  if (pool.length < (reachable.has(l.id) ? 2 : 1)) continue;
  const n = nearestIn(l, pool);
  if (!n) continue;
  if (reachable.has(l.id)) reachNN.push(n.d);
  else { orphanNN.push(n.d); orphanRows.push({ l, n }); }
}
const band = (d) => (d < 0.10 ? 'identical' : d < 0.25 ? 'near-duplicate' : d < 0.45 ? 'a real variation' : 'a different direction');
const bandsOf = (list) => ['identical', 'near-duplicate', 'a real variation', 'a different direction']
  .map((b) => `${b} ${pct(list.filter((d) => band(d) === b).length, list.length)}`).join(' · ');
const med = (a) => round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)], 2);
console.log(`\ndistance to the nearest design of the same category (0 = the same decisions):`);
console.log(`  designs a kit CAN offer:    median ${med(reachNN)}  ${bandsOf(reachNN)}`);
console.log(`  orphans:                    median ${med(orphanNN)}  ${bandsOf(orphanNN)}`);
console.log('\nthe orphans furthest from anything a kit offers:');
for (const { l, n } of orphanRows.sort((a, b) => b.n.d - a.n.d).slice(0, 15)) {
  console.log(`  ${round(n.d, 2).toString().padEnd(5)} ${l.id.padEnd(7)} ${l.category.padEnd(15)} ${l.family.padEnd(10)} ${l.name.slice(0, 24).padEnd(25)} nearest ${n.r.id}`);
}
console.log('the orphans closest to something a kit offers:');
for (const { l, n } of orphanRows.sort((a, b) => a.n.d - b.n.d).slice(0, 15)) {
  console.log(`  ${round(n.d, 2).toString().padEnd(5)} ${l.id.padEnd(7)} ${l.category.padEnd(15)} ${l.family.padEnd(10)} ${l.name.slice(0, 24).padEnd(25)} nearest ${n.r.id}`);
}

// ── 5b. Do the families separate? ────────────────────────────────────────────────────────
// Each family's distance to itself (the diagonal) is its internal variety. An off-diagonal at or
// below a family's own diagonal means the two are not visually separate at all.
const fams = uniq(looks.map((l) => l.family));
console.log(`\n═══ 5b. DO THE FAMILIES SEPARATE? — median nearest-neighbour distance, same category ═══`);
console.log(`${''.padEnd(11)}${fams.map((f) => f.slice(0, 9).padStart(10)).join('')}`);
for (const a of fams) {
  const row = fams.map((b) => {
    const ds = [];
    for (const x of looks.filter((l) => l.family === a)) {
      const pool = looks.filter((y) => y.family === b && y.category === x.category && y.id !== x.id);
      if (pool.length) ds.push(Math.min(...pool.map((y) => distance(x, y))));
    }
    return ds.length ? String(med(ds)).padStart(10) : '-'.padStart(10);
  });
  console.log(a.padEnd(11) + row.join(''));
}

// ── 6. A type's own family designs ───────────────────────────────────────────────────────
const spread = [];
for (const t of types) {
  const ds = t.designs.map((id) => lookById.get(id)).filter(Boolean);
  if (ds.length < 2) continue;
  const pairs = [];
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) pairs.push(distance(ds[i], ds[j]));
  spread.push({ id: t.id, n: ds.length, mean: pairs.reduce((a, b) => a + b, 0) / pairs.length, sameMotion: uniq(ds.map((d) => vocab.get(d.id))).length === 1 });
}
spread.sort((a, b) => a.mean - b.mean);
console.log(`\n═══ 6. ONE GRAPHIC IN FOUR SKINS? — a type's own family designs ═══`);
console.log(`types measured ${spread.length} · median spread ${med(spread.map((s) => s.mean))}`);
console.log(`  under 0.25 apart (four skins of one graphic): ${spread.filter((s) => s.mean < 0.25).length}`);
console.log(`  at or over 0.45 (genuinely different graphics): ${spread.filter((s) => s.mean >= 0.45).length}`);
console.log(`  types whose every family design moves IDENTICALLY: ${spread.filter((s) => s.sameMotion).length}`);
console.log(`  tightest: ${spread.slice(0, 8).map((s) => `${s.id} ${round(s.mean, 2)}`).join(' · ')}`);

// ── 7. Kit coherence ─────────────────────────────────────────────────────────────────────
const byId = new Map(built.map((v) => [v.id, v]));
let extras = 0, offFamily = 0;
for (const p of packs) {
  extras += p.extras.length;
  offFamily += p.extras.filter((e) => (byId.get(e)?.styleTag ?? p.family) !== p.family).length;
}
console.log(`\n═══ 7. KIT COHERENCE ═══`);
console.log(`packs ${packs.length} · declaring a paletteId: ${packs.filter((p) => p.paletteId).length}`);
console.log(`extras across all packs: ${extras} · whose family differs from the pack's: ${offFamily} (${pct(offFamily, extras)})`);
console.log(`graphic types ${types.length} · designs attached to a type ${types.reduce((a, t) => a + t.designs.length, 0)} · designs belonging to no type ${built.length - types.reduce((a, t) => a + t.designs.length, 0)}`);


// ── 5. WHAT THE FIRST PAGE SHOWS ─────────────────────────────────────────────────────────
//
// Browse renders a PAGE of twelve, not the catalog, so for most people the first twelve ARE
// the category. The owner read two shelves side by side on 2026-08-21 and named the split:
// Statistics & data was "genuinely different… options to choose from actually", while "we have
// that problem with the lower thirds right now that when you open it up all the graphics there
// look the same".
//
// This measures that, per category, on the SAME look vector section 2 uses: how many distinct
// signatures the first page carries, against how many the whole category has. A category whose
// page is far poorer than its shelf is one whose ORDER is the problem, not its designs - and
// that is a different fix from drawing more designs.
//
// READ THIS NUMBER WITH ITS BLINDNESS IN MIND - it has already produced a false negative. It
// scores the LOWER-THIRDS first page at 11 distinct looks out of 12, as varied as any shelf
// here, and the owner looking at that same page said the graphics "all look the same". The
// owner is right and the vector is blind: its fourteen axes are CSS DECISIONS (radius, blur,
// skew, clip, tracking, weight counts) and at card size an eye reads PALETTE and SILHOUETTE.
// All twelve lower thirds are a dark slab with white text and an amber accent, and this vector
// has no axis for any of that. The stats shelf it was compared against carries a giant
// percentage, a lime table, a red dial and a cream printed panel - different shapes, and light
// backgrounds as well as dark. So REORDERING BY THIS SIGNATURE WOULD CHANGE NOTHING A PERSON
// SEES, and the axis that would is measured off the rendered card, not off the stylesheet.
// `node scripts/spike-shelf-look.mjs <out-dir>` captures the shelves, so the comparison stays
// one look rather than one argument.
//
// READ THE NUMBER WITH ITS BLINDNESS IN MIND, because this section already produced a false
// negative. It scores the lower-thirds first page at 11 distinct looks out of 12 - as varied as
// any shelf here - and the owner looking at that same page said the graphics "all look the
// same". The owner is right and the vector is blind: its fourteen axes are CSS DECISIONS
// (radius, blur, skew, clip, tracking, weight counts), and at card size an eye reads PALETTE and
// SILHOUETTE. All twelve lower thirds are a dark slab with white text and an amber accent, and
// the vector has no axis for any of that; the stats shelf it was compared against carries a
// giant percentage, a lime table, a red dial and a cream printed panel - different shapes, and
// light backgrounds as well as dark. Reordering by THIS signature would therefore change
// nothing a person sees. `node scripts/spike-shelf-look.mjs <out>` captures the shelves so the
// comparison stays one look rather than one argument.
console.log(`
═══ 5. THE FIRST PAGE — what a category shows before anyone scrolls ═══`);
console.log('category                 page  looks  shelf  looks  page/shelf');
const pageRows = [];
for (const [id, fp] of Object.entries(data.firstPage ?? {})) {
  if (fp.error || !fp.page) continue;
  const pageLooks = uniq(fp.page.map((v) => lookById.get(v)?.sig).filter(Boolean)).length;
  const shelf = looks.filter((l) => fp.page.includes(l.id) || l.category === id);
  const shelfIds = uniq([...fp.page, ...shelf.map((l) => l.id)]);
  const shelfLooks = uniq(shelfIds.map((v) => lookById.get(v)?.sig).filter(Boolean)).length;
  const shown = Math.min(12, fp.page.length);
  if (shown === 0) continue;
  // Variety DENSITY, not a raw count: a twelve-card page can only ever carry twelve looks, so
  // comparing counts across a 12-design shelf and a 60-design one would punish the big shelf
  // for being big. What is asked is how much of the variety it HAS reaches the fold.
  const density = pageLooks / shown;
  const shelfDensity = shelfLooks / Math.max(1, shelfIds.length);
  pageRows.push({ id, name: fp.name, shown, pageLooks, shelfSize: shelfIds.length, shelfLooks, density, shelfDensity });
}
pageRows.sort((a, b) => a.density - b.density);
for (const r of pageRows) {
  const flag = r.density < 0.5 ? '  ← one design repeated' : r.density < 0.75 ? '  ← thin' : '';
  console.log(
    `${r.name.padEnd(24)} ${String(r.shown).padStart(4)} ${String(r.pageLooks).padStart(6)} ` +
    `${String(r.shelfSize).padStart(6)} ${String(r.shelfLooks).padStart(6)} ` +
    `${(r.density * 100).toFixed(0).padStart(9)}%${flag}`,
  );
}
const worst = pageRows[0];
if (worst) {
  console.log(
    `
THINNEST FIRST PAGE: ${worst.name} - ${worst.pageLooks} distinct looks across ${worst.shown} cards, ` +
    `from a shelf holding ${worst.shelfLooks} across ${worst.shelfSize}.`,
  );
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    looks,
    vocab: Object.fromEntries(vocab),
    orphans: orphans.map((v) => ({ id: v.id, category: v.category, family: v.styleTag, mechanism: mechanism(v) })),
    typeSpread: spread,
  }, null, 1));
  console.log(`\nwrote ${jsonOut}`);
}
