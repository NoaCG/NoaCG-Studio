// Builds the catalog index (catalogIndex.ts) from the type registry's own declarations. Kept
// apart from the shape so api/, which reads the index, never compiles the registry's types and
// their DOM-using modules; scripts/catalogIndexPlugin.mjs calls this through Vite's SSR loader.

import type { GraphicType } from './types/graphicType';
import type { CategoryInfo } from './contract';
import type { Palette } from '../model/templateVocabulary';
import type { BundledFont } from '../model/fonts';
import type { CatalogIndex } from './catalogIndex';

export interface CatalogSources {
  types: readonly GraphicType[];
  categories: readonly CategoryInfo[];
  palettes: readonly Palette[];
  fonts: readonly BundledFont[];
}

/** The index, from the registry's declarations. Categories are the ones some type is in. */
export function buildCatalogIndex({ types, categories, palettes, fonts }: CatalogSources): CatalogIndex {
  const used = new Set(types.map((t) => t.structure.category));
  return {
    version: 1,
    categories: categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.structure.category,
      fields: t.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        ...(f.role === 'line' ? {} : { role: f.role }),
        ...(f.options?.length ? { options: f.options.map((o) => String(o.value)) } : {}),
      })),
      designs: t.designs.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        style: d.styleTag,
        palette: d.palette.id,
        font: d.fontId,
      })),
    })),
    palettes: palettes.map((p) => ({ id: p.id, name: p.name, accent: p.accent, text: p.text, panel: p.panel, styles: [...p.styleTags] })),
    fonts: fonts.map((f) => ({ id: f.id, family: f.family, styles: [...f.styleTags] })),
  };
}
