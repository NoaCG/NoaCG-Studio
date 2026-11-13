// guards: src/model/brandApplication.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadWizardModule } from './wizard-load.mjs';
const load = name => loadWizardModule(path.resolve(name));
const { applyDocumentBrand } = await load('src/model/brandApplication.ts');
const F = await load('src/model/fonts.ts');
const C = await load('src/model/cssVars.ts');
const palette = { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: '#16bb99', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' };
const look = (id, fontId, customFont = null) => ({ id, name: id, updatedAt: '2026-11-12T00:00:00Z', brand: { styleTag: 'minimal', palette, fontId, customFont } });
const face = F.fontById('oswald');
const base = { name: 'Numeric fixture', type: 'scoreboard', resolution: { width: 1920, height: 1080 }, fps: 25,
  html: '<h1>Harbour</h1><span class="number">11</span>', js: '', fields: [], assets: [],
  css: F.fontFaceCss(face) + `\n:root { --font-heading: ${F.fontStack(face)}; --font-numeric: ${F.numericFontStack(face)}; --accent: #16bb99; }\nh1 { font-family: var(--font-heading); } .number { font-family: var(--font-numeric); font-variant-numeric: tabular-nums; }` };
const bytes = file => 'data:font/woff2;base64,' + readFileSync(`public/fonts/${file}`).toString('base64');
const font = (family, file) => ({ family, format: 'woff2', asset: { path: 'fonts/brand.woff2', data: bytes(file) } });

test('a retained heading recomputes its derived numeric face even when both old headings share a sibling', () => {
  const a = applyDocumentBrand(base, look('a', 'oswald'));
  const anton = F.fontById('anton');
  const local = { ...a, css: F.ensureNumericFontFace(F.ensureFontFace(C.setCssVariable(C.setCssVariable(a.css, 'font-heading', F.fontStack(anton)), 'font-numeric', F.numericFontStack(anton)), anton), anton) };
  const next = applyDocumentBrand(local, look('b', 'inter'));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.fontStack(anton));
  assert.equal(C.getCssVariable(next.css, 'font-numeric'), F.numericFontStack(anton));
  assert.ok(next.css.includes('fonts/anton.woff2')); assert.ok(next.css.includes('fonts/saira.woff2'));
  assert.deepEqual(applyDocumentBrand(next, look('b', 'inter')), next);
});
for (const sameFamily of [false, true]) test(`a retained custom face keeps real bytes across path${sameFamily ? ' and family' : ''} collisions and repeated application`, () => {
  const localFont = font('Local Harbour', 'saira.woff2');
  const a = applyDocumentBrand(base, look('a', 'oswald'));
  const local = { ...a, css: C.setCssVariable(C.setCssVariable(F.customFontFaceCss(localFont) + '\n' + a.css, 'font-heading', F.customFontStack(localFont)), 'font-numeric', F.numericFontStack(localFont)), assets: [localFont.asset] };
  const incoming = font(sameFamily ? localFont.family : 'Incoming Harbour', 'inter.woff2');
  const next = applyDocumentBrand(local, look('b', null, incoming));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.customFontStack(localFont));
  assert.equal(next.assets.find(a => a.path === localFont.asset.path)?.data === localFont.asset.data, true, 'local face byte identity');
  const retainedFace = [...next.css.matchAll(/@font-face\s*\{[^}]*\}/g)].filter(m => m[0].includes(`"${localFont.family}"`));
  assert.ok(retainedFace.length > 0); assert.ok(retainedFace.every(m => m[0].includes(`"${localFont.asset.path}"`)), 'a retained family binds only its own bytes');
  assert.deepEqual(applyDocumentBrand(next, look('b', null, incoming)), next, 'reapply is idempotent');
  assert.equal(C.getCssVariable(next.css, 'font-numeric'), F.numericFontStack(localFont));
});


test('a byte-only local font override survives, while an untouched face takes the explicitly reapplied brand', () => {
  const original = font('Harbour Face', 'saira.woff2'), incoming = font('Incoming Face', 'inter.woff2');
  const a = applyDocumentBrand(base, look('a', null, original));
  const localBytes = bytes('anton.woff2');
  const local = { ...a, assets: a.assets.map(asset => asset.path === original.asset.path ? { ...asset, data: localBytes } : asset) };
  const next = applyDocumentBrand(local, look('b', null, incoming));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.customFontStack(original));
  assert.equal(next.assets.find(a => a.path === original.asset.path)?.data === localBytes, true);
  const untouched = applyDocumentBrand(a, look('b', null, incoming));
  assert.equal(C.getCssVariable(untouched.css, 'font-heading'), F.customFontStack(incoming));
  assert.equal(untouched.assets.find(a => a.path === incoming.asset.path)?.data === incoming.asset.data, true);
});

for (const collidePath of [false, true]) test(`a local imported face named Inter survives an incoming bundled Inter${collidePath ? ' at the same fixed path' : ''}`, () => {
  const localFont = font('Inter', 'saira.woff2');
  if (collidePath) localFont.asset.path = 'fonts/inter.woff2';
  const a = applyDocumentBrand(base, look('a', 'oswald'));
  const local = { ...a, css: C.setCssVariable(C.setCssVariable(F.customFontFaceCss(localFont) + '\n' + a.css, 'font-heading', F.customFontStack(localFont)), 'font-numeric', F.numericFontStack(localFont)), assets: [localFont.asset] };
  const next = applyDocumentBrand(local, look('b', 'inter'));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.customFontStack(localFont));
  assert.equal(C.getCssVariable(next.css, 'font-numeric'), F.numericFontStack(localFont));
  assert.ok(F.importedFontFamilies(next.css).includes(localFont.family), 'imported face remains classified as imported');
  const kept = next.assets.find(a => a.data === localFont.asset.data);
  assert.ok(kept); assert.ok(next.css.includes(`url("${kept.path}")`));
  assert.deepEqual(applyDocumentBrand(next, look('b', 'inter')), next);
});
test('a retained numeric sibling cannot be rebound by an incoming custom family', () => {
  const a = applyDocumentBrand(base, look('a', 'oswald')), anton = F.fontById('anton');
  const local = { ...a, css: F.ensureFontFace(C.setCssVariable(C.setCssVariable(a.css, 'font-heading', F.fontStack(anton)), 'font-numeric', F.numericFontStack(anton)), anton) };
  const incoming = font('Saira', 'inter.woff2');
  const next = applyDocumentBrand(local, look('b', null, incoming));
  assert.equal(C.getCssVariable(next.css, 'font-numeric'), F.numericFontStack(anton));
  assert.ok([...next.css.matchAll(/@font-face\s*\{[^}]*\}/g)].filter(m => m[0].includes('"Saira"')).every(m => !m[0].includes('fonts/brand')));
  assert.deepEqual(applyDocumentBrand(next, look('b', null, incoming)), next);
});
test('an unmodified label receives the incoming custom face while a colliding local heading keeps its own bytes', () => {
  const localFont = font('Harbour Face', 'saira.woff2'), incoming = font(localFont.family, 'inter.woff2');
  const a = applyDocumentBrand({ ...base, css: base.css.replace('--accent:', '--font-label: "Inter", Arial, sans-serif; --accent:') }, look('a', 'oswald'));
  const local = { ...a, css: C.setCssVariable(C.setCssVariable(F.customFontFaceCss(localFont) + '\n' + a.css, 'font-heading', F.customFontStack(localFont)), 'font-numeric', F.numericFontStack(localFont)), assets: [localFont.asset] };
  const b = look('b', null, incoming); b.brand.tokens = { 'font-label': F.customFontStack(incoming) };
  const next = applyDocumentBrand(local, b);
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.customFontStack(localFont));
  const label = C.getCssVariable(next.css, 'font-label'); assert.match(label, /Harbour Face Brand/);
  const added = next.assets.find(a => a.data === incoming.asset.data); assert.ok(added); assert.notEqual(added.path, localFont.asset.path);
  assert.ok([...next.css.matchAll(/@font-face\s*\{[^}]*\}/g)].some(m => m[0].includes(label.split(',')[0]) && m[0].includes(added.path)));
  assert.deepEqual(applyDocumentBrand(next, b), next);
});

test('an incoming custom file cannot shadow an unchanged bundled font URL', () => {
  const inter = F.fontById('inter');
  const source = { ...base, css: F.ensureFontFace(base.css.replace(/:root\s*\{/, `:root { --font-body: ${F.fontStack(inter)};`), inter) };
  const incoming = font('Inter', 'saira.woff2'); incoming.asset.path = 'fonts/inter.woff2';
  const next = applyDocumentBrand(source, look('first', null, incoming));
  assert.equal(C.getCssVariable(next.css, 'font-body'), F.fontStack(inter));
  assert.equal(next.assets.some(asset => asset.path === 'fonts/inter.woff2'), false, 'protected bundled URL still resolves to bundled bytes');
  assert.ok(next.assets.some(asset => asset.data === incoming.asset.data), 'incoming custom file still ships');
  assert.deepEqual(applyDocumentBrand(next, look('first', null, incoming)), next);
});

test('a serialization-only asset key order change does not become a local font override', () => {
  const original = font('Harbour Face', 'saira.woff2');
  const a = applyDocumentBrand(base, look('a', null, original));
  const roundTrip = { ...a, assets: a.assets.map(asset => ({ data: asset.data, path: asset.path })) };
  const next = applyDocumentBrand(roundTrip, look('b', 'inter'));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.fontStack(F.fontById('inter')));
});

test('distinct CSS family names do not become a collision through bundled-font lookup normalization', () => {
  const body = font('Harbour Face', 'saira.woff2'); body.asset.path = 'fonts/body.woff2';
  const incoming = font('HarbourFace', 'inter.woff2'); incoming.asset.path = 'fonts/heading.woff2';
  const source = { ...base, css: base.css.replace(/:root\s*\{/, `:root { --font-body: ${F.customFontStack(body)};`) + '\n' + F.customFontFaceCss(body), assets: [body.asset] };
  const next = applyDocumentBrand(source, look('first', null, incoming));
  assert.equal(C.getCssVariable(next.css, 'font-heading'), F.customFontStack(incoming));
  assert.equal(C.getCssVariable(next.css, 'font-body'), F.customFontStack(body));
  assert.equal(next.assets.find(a => a.path === body.asset.path)?.data === body.asset.data, true);
});
