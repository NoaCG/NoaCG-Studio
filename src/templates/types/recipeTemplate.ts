// A CATALOG RECIPE becomes a template here: a graphic type, one of its designs, optionally a
// catalog palette and a bundled font, and starting values by the type's LOGICAL field keys.
//
// Two doors take this one path, so the same recipe is the same graphic whichever way it came:
// the bridge's scaffold (src/bridge/bridgeApi.ts, docs/AGENT_CLI.md) and a pack's RECIPE entry
// (src/packs/graphicsPack.ts), which is how a chat client's package names catalog designs without
// any graphic code leaving or entering the server (docs/REMOTE_MCP_PLAN.md, key decision 5).

import { FONTS } from '../../model/fonts';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import type { AssetFile, SpxTemplate } from '../../model/types';
import { PALETTES, type WizardOptions, type TemplateVariant } from '../contract';
import { variantsFromType, type GraphicType } from './graphicType';

/** What a recipe names. Ids are the catalog index's (src/templates/catalogIndex.ts). */
export interface TemplateRecipe {
  type: string;
  design: string;
  palette?: string;
  font?: string;
  /** Starting values by the type's LOGICAL field keys (lines and content alike). */
  values?: Record<string, string>;
}

/** The wizard options a type's values become: line samples for its lines, content for the rest. */
export function designValueOptions(type: GraphicType, values: Record<string, string>): WizardOptions {
  const lineFields = type.fields.filter((f) => f.role === 'line');
  const anyLine = lineFields.some((f) => f.key in values);
  const content: Record<string, string> = {};
  for (const f of type.fields) {
    if (f.role !== 'line' && f.key in values) content[f.key] = values[f.key];
  }
  return {
    ...(anyLine ? { lines: lineFields.map((f) => ({ title: f.label, sample: values[f.key] ?? f.value })) } : {}),
    ...(Object.keys(content).length ? { content } : {}),
  };
}

/**
 * Name a template IN ITS SOURCES, not only on the record. The package's name is read back from
 * the html (`<title>`, then the SPX definition's `description`) every time the bridge re-reads a
 * folder, so a name that sat only on `template.name` was lost on the first round trip (found by
 * walking a scaffolded package through validate, 2026-08-22; pinned by e2e/bridge.spec.ts).
 */
export function nameTemplate(template: SpxTemplate, name: string): SpxTemplate {
  const settings = { ...template.settings, description: name };
  const titleText = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = replaceDefinitionInHtml(template.html, settings, template.fields);
  html = /<title[^>]*>[^<]*<\/title>/i.test(html)
    ? html.replace(/(<title[^>]*>)[^<]*(<\/title>)/i, `$1${titleText}$2`)
    : html.replace(/<head([^>]*)>/i, `<head$1>\n  <title>${titleText}</title>`);
  return { ...template, name, settings, html };
}

/** Whether a brand's MARK belongs in this design: the wizard's own rule (brandMarkFor) - never
 *  where the design drew no slot, never into a slot drawn for a picture or a person. */
function takesMark(variant: TemplateVariant): boolean {
  return variant.logo !== 'none' && variant.imageSlot !== 'picture';
}

/**
 * Build the template a recipe names, named `name`. A brand's `logo` goes into the design's logo
 * slot where it has one, as the wizard does with a brand chosen. Throws a sentence naming the
 * graphic for an id the catalog does not have: a recipe from a file is not trusted to be current.
 */
export async function templateFromRecipe(recipe: TemplateRecipe, name: string, logo?: AssetFile): Promise<SpxTemplate> {
  const { typeById } = await import('./registry');
  const type = typeById(recipe.type);
  if (!type) throw new Error(`“${name}” names the graphic type “${recipe.type}”, which this NoaCG does not have.`);
  const variant = variantsFromType(type).find((v) => v.id === recipe.design);
  if (!variant) throw new Error(`“${name}”: “${recipe.design}” is not a design of ${type.name}.`);
  const palette = recipe.palette ? PALETTES.find((p) => p.id === recipe.palette) : undefined;
  if (recipe.palette && !palette) throw new Error(`“${name}” names the palette “${recipe.palette}”, which this NoaCG does not have.`);
  if (recipe.font && !FONTS.some((f) => f.id === recipe.font)) throw new Error(`“${name}” names the font “${recipe.font}”, which this NoaCG does not have.`);
  const mark = logo && takesMark(variant) ? logo : undefined;
  const template = variant.create({
    ...(palette ? { palette } : {}),
    ...(recipe.font ? { fontId: recipe.font } : {}),
    ...(mark ? { logoEnabled: true, logoAssetPath: mark.path } : {}),
    ...designValueOptions(type, recipe.values ?? {}),
  });
  const withMark = mark ? { ...template, assets: [...template.assets.filter((a) => a.path !== mark.path), mark] } : template;
  return nameTemplate(withMark, name);
}
