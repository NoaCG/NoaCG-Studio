import type { AssetFile, SpxTemplate } from './types';
import { applyLookToTemplate, brandSlotField, type SavedLook } from './packets';
import { getCssVariable, listCssVariables, setCssVariable } from './cssVars';
import { customFontFaceCss, ensureFontFace, ensureNumericFontFace, fontById, fontByStack, fontFaceCss, numericFaceFor, numericFontStack } from './fonts';
import { uniqueAssetPath } from '../assets/assetUtils';

type FontPackage = NonNullable<NonNullable<SpxTemplate['brandApplication']>['fonts']>[number];
interface IncomingFace { family: string; css: string; assets: AssetFile[] }
const firstFamily = (value: string) => (/^\s*"([^"]+)"/.exec(value) ?? /^\s*'([^']+)'/.exec(value) ?? /^\s*([^,]+)/.exec(value))?.[1]?.trim() ?? '';
const sameFamily = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
function resolvedFont(css: string, value: string, writers?: Set<string>): string | null {
  const seen = new Set<string>();
  while (/^var\(--[\w-]+\)$/.test(value) && !seen.has(value)) {
    seen.add(value); const name = value.slice(6, -1);
    if (writers?.has(name)) return null;
    value = getCssVariable(css, name) ?? value;
  }
  return value;
}
function faces(css: string) {
  return [...css.matchAll(/(?:\/\* (?:Bundled open-source|Imported) font[^*]*\*\/\s*)?@font-face\s*\{[^}]*\}/g)]
    .map(m => ({ css: m[0], family: firstFamily(/font-family\s*:\s*([^;]+)/.exec(m[0])?.[1] ?? '') }));
}
const urls = (css: string) => [...css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map(m => m[1].replace(/^\.\//, ''));
function fontPackage(template: SpxTemplate, family: string): FontPackage {
  const css = faces(template.css).filter(face => sameFamily(face.family, family)).map(face => face.css);
  const paths = new Set(css.flatMap(urls));
  return { family, css, assets: template.assets.filter(asset => paths.has(asset.path)) };
}
const assetIdentity = (assets: AssetFile[]) => JSON.stringify(assets.map(({ path, data }) => ({ path, data })).sort((a, b) => a.path.localeCompare(b.path)));
const fontIdentity = (font: FontPackage) => JSON.stringify(font.css) + assetIdentity(font.assets);
function matchesFont(font: FontPackage, incoming: IncomingFace) {
  const bodies = (css: string[]) => [...new Set(css.map(rule => rule.slice(rule.indexOf('@font-face')).replace(/font-family\s*:\s*[^;]+;/, 'font-family: __face__;')))].sort();
  return JSON.stringify(bodies(font.css)) === JSON.stringify(bodies(faces(incoming.css).map(face => face.css))) &&
    assetIdentity(font.assets) === assetIdentity(incoming.assets);
}
function nextFontPath(asset: AssetFile, existing: AssetFile[]) {
  return uniqueAssetPath(asset.path.split('/').pop()!, existing, asset.path.split('/').slice(1, -1).join('/'));
}
/** Moving a retained file rewrites the old source before the incoming bundled path exists. */
function moveFont(template: SpxTemplate, asset: AssetFile): SpxTemplate {
  const path = nextFontPath(asset, template.assets), rewrite = (text: string) => text.split(asset.path).join(path);
  return { ...template, html: rewrite(template.html), css: rewrite(template.css), js: rewrite(template.js),
    fields: template.fields.map(field => typeof field.value === 'string' ? { ...field, value: rewrite(field.value) } : field),
    assets: template.assets.map(old => old.path === asset.path ? { ...old, path } : old) };
}
function incomingFaces(look: SavedLook): IncomingFace[] {
  const main = look.brand.customFont ?? (look.brand.fontId ? fontById(look.brand.fontId) : null);
  const bundled = [main && numericFaceFor(main), ...Object.entries(look.brand.tokens ?? {}).filter(([name]) => name.startsWith('font-')).map(([, value]) => fontByStack(value))].filter(face => face !== null);
  const incoming: IncomingFace[] = bundled.map(face => ({ family: face.family, css: fontFaceCss(face), assets: [] }));
  if (look.brand.customFont) incoming.unshift({ family: look.brand.customFont.family, css: customFontFaceCss(look.brand.customFont), assets: [look.brand.customFont.asset] });
  else if (look.brand.fontId) { const font = fontById(look.brand.fontId); incoming.unshift({ family: font.family, css: fontFaceCss(font), assets: [] }); }
  return incoming.filter((face, i) => incoming.findIndex(other => sameFamily(other.family, face.family)) === i);
}
function aliasFor(template: SpxTemplate, incoming: IncomingFace, retained: FontPackage[]) {
  const protectedName = (family: string) => retained.some(font => sameFamily(font.family, family));
  const prefix = `${incoming.family} Brand`;
  // Reuse this incoming face's prior alias so explicit reapplication is idempotent.
  const prior = faces(template.css).find(face => (face.family === prefix || face.family.startsWith(prefix + ' ')) && !protectedName(face.family) && matchesFont(fontPackage(template, face.family), incoming));
  if (prior) return prior.family;
  let family = prefix, n = 1;
  while (protectedName(family) || faces(template.css).some(face => sameFamily(face.family, family))) family = `${prefix} ${++n}`;
  return family;
}

/** Reapplication compares complete effective font packages, never independent font strings. */
export function applyDocumentBrand(template: SpxTemplate, look: SavedLook): SpxTemplate {
  const previous = template.brandApplication;
  if (previous && (previous.v !== 1 || !previous.values || typeof previous.lookId !== 'string' || previous.fonts !== undefined && !Array.isArray(previous.fonts))) throw new Error('This brand application belongs to a newer editor. Its graphic is unchanged.');
  const overrides = new Map(Object.entries(previous?.values ?? {}).flatMap(([name, applied]) => {
    const current = getCssVariable(template.css, name);
    return current !== null && current !== applied ? [[name, current] as const] : [];
  }));
  for (const font of previous?.fonts ?? []) {
    if (fontIdentity(fontPackage(template, font.family)) === fontIdentity(font)) continue;
    for (const name of Object.keys(previous!.values).filter(name => name.startsWith('font-'))) {
      const current = getCssVariable(template.css, name);
      if (current && sameFamily(firstFamily(resolvedFont(template.css, current)!), font.family)) overrides.set(name, current);
    }
  }
  const writers = new Set(Object.keys(look.brand.tokens ?? {}).filter(name => name.startsWith('font-')));
  if (look.brand.customFont || look.brand.fontId) { writers.add('font-heading'); writers.add('font-numeric'); }
  const protectedValues = listCssVariables(template.css).filter(v => v.name.startsWith('font-') &&
    (overrides.has(v.name) || !writers.has(v.name) && resolvedFont(template.css, v.value, writers) !== null || v.name === 'font-numeric' && overrides.has('font-heading')));
  const families = [...new Set(protectedValues.map(v => firstFamily(resolvedFont(template.css, v.value)!)))];
  let prepared = template, brand = look.brand;
  // The bundled file names are fixed. Move a retained uploaded file out of their way first.
  const bundledPaths = new Set(incomingFaces(look).filter(face => !face.assets.length).flatMap(face => urls(face.css)));
  for (const asset of families.flatMap(family => fontPackage(prepared, family).assets)) if (bundledPaths.has(asset.path) && prepared.assets.some(old => old.path === asset.path)) prepared = moveFont(prepared, asset);
  const retained = families.map(family => fontPackage(prepared, family));
  const protectedAssets = [...new Map(retained.flatMap(font => font.assets).map(asset => [asset.path, asset])).values()];
  const protectedPaths = [...new Set(retained.flatMap(font => font.css.flatMap(urls)))];
  if (brand.customFont && protectedPaths.includes(brand.customFont.asset.path) && !protectedAssets.some(old => old.path === brand.customFont!.asset.path && old.data === brand.customFont!.asset.data)) {
    const asset = brand.customFont.asset, identical = prepared.assets.find(old => old.data === asset.data);
    const reserved = [...prepared.assets, ...protectedPaths.map(path => ({ path, data: '' }))];
    brand = { ...brand, customFont: { ...brand.customFont, asset: { ...asset, path: identical?.path ?? nextFontPath(asset, reserved) } } };
  }
  const slot = brandSlotField(template), logo = previous?.logo;
  const currentAsset = slot ? template.assets.find(a => a.path === String(slot.value)) : undefined;
  const logoOverridden = !!logo && (slot?.field !== logo.field || String(slot.value) !== logo.value || currentAsset?.path !== logo.path || currentAsset?.data !== logo.data);
  if (logoOverridden) brand = { ...brand, logo: undefined };
  const offered = applyLookToTemplate(prepared, brand), incoming = incomingFaces({ ...look, brand });
  let css = offered.css;
  const appliedFamilies = new Map<string, string>();
  for (const face of incoming) {
    const collision = retained.some(font => sameFamily(font.family, face.family) && !matchesFont(font, face));
    const family = collision ? aliasFor(prepared, face, retained) : face.family;
    appliedFamilies.set(face.family, family);
    if (!collision) continue;
    const paths = new Set(urls(face.css));
    for (const rule of faces(css)) if (sameFamily(rule.family, face.family) && urls(rule.css).some(path => paths.has(path))) css = css.replace(rule.css, rule.css.replace(/font-family\s*:\s*[^;]+;/, `font-family: "${family}";`));
    for (const variable of listCssVariables(css)) if (writers.has(variable.name) && sameFamily(firstFamily(variable.value), face.family)) css = setCssVariable(css, variable.name, variable.value.replace(firstFamily(variable.value), family));
  }
  const proposed = { ...offered, css };
  for (const [name, current] of overrides) {
    if (getCssVariable(css, name) === null) continue;
    css = setCssVariable(css, name, current);
    const family = firstFamily(resolvedFont(prepared.css, current)!);
    if (name.startsWith('font-') && !fontPackage(prepared, family).assets.length) css = ensureFontFace(css, fontByStack(resolvedFont(prepared.css, current)!));
  }
  if (overrides.has('font-heading') && getCssVariable(prepared.css, 'font-numeric') !== null) {
    const value = resolvedFont(prepared.css, overrides.get('font-heading')!)!, family = firstFamily(value);
    const heading = fontPackage(prepared, family).assets.length ? null : fontByStack(value);
    css = setCssVariable(css, 'font-numeric', heading ? numericFontStack(heading) : getCssVariable(prepared.css, 'font-numeric')!);
    if (heading) css = ensureNumericFontFace(css, heading);
  }
  // Keep imported-font markers after the incoming block: the picker still knows they are
  // imported, and the next brand application finds its own main block first.
  for (const face of retained.flatMap(font => font.css)) if (!css.includes(face)) css += '\n' + face;
  const assets = [...offered.assets.filter(asset => !protectedAssets.some(old => old.path === asset.path)), ...protectedAssets];
  const nextSlot = brandSlotField(offered), nextAsset = nextSlot ? offered.assets.find(a => a.path === String(nextSlot.value)) : undefined;
  return { ...offered, css, assets, brandApplication: { v: 1, lookId: look.id,
    values: Object.fromEntries(listCssVariables(proposed.css).map(v => [v.name, v.value])),
    fonts: incoming.map(face => fontPackage(proposed, appliedFamilies.get(face.family)!)),
    ...(logoOverridden && logo ? { logo } : nextSlot && nextAsset ? { logo: { field: nextSlot.field, value: String(nextSlot.value), path: nextAsset.path, data: nextAsset.data } } : {}) } };
}
