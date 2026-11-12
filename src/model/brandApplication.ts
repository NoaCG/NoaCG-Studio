import type { SpxTemplate } from './types';
import { applyLookToTemplate, brandSlotField, type SavedLook } from './packets';
import { getCssVariable, listCssVariables, setCssVariable } from './cssVars';
import { ensureFontFace, fontByStack } from './fonts';

/** Reapplication is a three-way comparison against the last undoable application. */
export function applyDocumentBrand(template: SpxTemplate, look: SavedLook): SpxTemplate {
  const previous = template.brandApplication;
  if (previous && (previous.v !== 1 || !previous.values || typeof previous.lookId !== 'string')) {
    throw new Error('This brand application belongs to a newer editor. Its graphic is unchanged.');
  }
  const slot = brandSlotField(template);
  const logo = previous?.logo;
  const currentAsset = slot ? template.assets.find(a => a.path === String(slot.value)) : undefined;
  const logoOverridden = !!logo && (slot?.field !== logo.field || String(slot.value) !== logo.value ||
    currentAsset?.path !== logo.path || currentAsset?.data !== logo.data);
  const offered = applyLookToTemplate(template, logoOverridden ? { ...look.brand, logo: undefined } : look.brand);
  let css = offered.css;
  for (const [name, applied] of Object.entries(previous?.values ?? {})) {
    const current = getCssVariable(template.css, name);
    if (current !== null && current !== applied && getCssVariable(css, name) !== null) {
      css = setCssVariable(css, name, current);
      if (name.startsWith('font-')) css = ensureFontFace(css, fontByStack(current));
    }
  }
  // Retain custom font declarations when a local typeface override still reads them.
  for (const face of template.css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const family = /font-family\s*:\s*([^;]+)/.exec(face[0])?.[1]?.trim();
    if (family && css.includes(family) && !css.includes(face[0])) css = face[0] + '\n' + css;
  }
  const nextSlot = brandSlotField(offered);
  const nextAsset = nextSlot ? offered.assets.find(a => a.path === String(nextSlot.value)) : undefined;
  return { ...offered, css, brandApplication: { v: 1, lookId: look.id,
    values: Object.fromEntries(listCssVariables(offered.css).map(v => [v.name, v.value])),
    ...(logoOverridden && logo ? { logo } : nextSlot && nextAsset ? {
      logo: { field: nextSlot.field, value: String(nextSlot.value), path: nextAsset.path, data: nextAsset.data },
    } : {}) } };
}
