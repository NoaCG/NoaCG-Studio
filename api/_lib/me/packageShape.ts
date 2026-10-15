// The PURE shape guard on the package door's payload (docs/AGENT_SAVE.md §7). Shape only, never
// execution - the same posture as graphicShape.ts, for the same reason: this function holds the
// service key, so it never parses, evaluates or validates the template CODE inside a package.
// The code is judged where it runs in a sandbox: the bridge's gate before the CLI uploads, and
// the studio's own `installPack` gate (validateTemplate per graphic) when the user presses
// Install.
//
// The payload is a graphics pack FILE (`noacg-pack` v1, src/packs/graphicsPack.ts) - exactly
// what `noacg pack --out` writes, so a package uploaded from a terminal and a package imported
// from a file are one format. The guard answers "is this a pack of legal shape and size", and
// narrows it to the keys the format names; anything else is dropped, never stored.

import { TEMPLATE_TYPE_LABELS, type TemplateType } from '../../../src/model/types.js';
import { SHAPE_LIMITS, shapeOrigin } from './graphicShape.js';
import type { GraphicOrigin } from '../../../src/model/graphicDoc.js';
import type { ProductionRequest } from '../../../src/model/productionDelivery.js';

/** Caps a whole package adds on top of the per-graphic ones in SHAPE_LIMITS. The body itself is
 *  read at most 4 MB (packages.ts), so the per-graphic caps still bound the total. */
export const PACKAGE_LIMITS = {
  graphics: 40,
  description: 500,
  cues: 400,
  cueLabel: 120,
  cueValues: 200,
  cueNote: 500,
  /** A recipe's ids (type, design, palette, font) and a value's key. */
  recipeId: 80,
  recipeValue: 5000,
  brandColor: 100,
  brandTokens: 40,
} as const;

/** A catalog id as the index writes them. */
const CATALOG_ID = /^[a-z0-9][a-z0-9-]*$/i;

/** The one thing a template's HTML must visibly carry - tested by PRESENCE, never by parsing. */
const DEFINITION_MARKER = /SPXGCTemplateDefinition\s*=/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTemplateType = (v: unknown): v is TemplateType => typeof v === 'string' && v in TEMPLATE_TYPE_LABELS;

/** One cue as the format carries it. `graphic` is only present on a top-level rundown row. */
export interface ShapedCue {
  graphic?: string;
  label: string;
  values: Record<string, string>;
  note?: string;
}

/** One graphic entry of the pack file, narrowed. */
interface ShapedGraphic {
  name: string;
  type: TemplateType;
  layer?: number;
  html: string;
  css: string;
  js: string;
  assets?: Array<{ path: string; data: string }>;
  resolution?: { width: number; height: number };
  fps?: number;
  cues?: ShapedCue[];
  /** The tool that built it and the delivered item's identity (graphicDoc.ts GraphicOrigin), so an
   *  Install can find a copy of this graphic a save already delivered. */
  origin?: GraphicOrigin;
}

/** A RECIPE entry (src/packs/graphicsPack.ts PackRecipeFile): a catalog design named by ids,
 *  built by the studio at install. No code travels, so there is none to size. */
interface ShapedRecipe {
  name: string;
  recipe: { type: string; design: string; palette?: string; font?: string; values?: Record<string, string> };
  layer?: number;
  cues?: ShapedCue[];
}

/** The pack's brand (src/packs/graphicsPack.ts PackBrand): a saved look as data. */
interface ShapedBrand {
  id?: string;
  name: string;
  look: Record<string, unknown>;
}

/** The narrowed pack, ready to store as the row's body. */
export interface ShapedPackage {
  format: 'noacg-pack';
  version: 1;
  name: string;
  description: string;
  graphics: Array<ShapedGraphic | ShapedRecipe>;
  cues?: ShapedCue[];
  brand?: ShapedBrand;
}

export type PackageShapeResult = { ok: true; pack: ShapedPackage } | { ok: false; reason: string };

/** A cue row, or the reason it is not one. `withGraphic` is set for the top-level rundown. */
export function shapeCue(raw: unknown, where: string, withGraphic: boolean): ShapedCue | string {
  if (!isRecord(raw)) return `${where} is not an object.`;
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label || label.length > PACKAGE_LIMITS.cueLabel) return `${where} needs a label of 1-${PACKAGE_LIMITS.cueLabel} characters.`;
  const values: Record<string, string> = {};
  if (raw.values !== undefined) {
    if (!isRecord(raw.values)) return `${where}: \`values\` must be an object of strings.`;
    const entries = Object.entries(raw.values);
    if (entries.length > PACKAGE_LIMITS.cueValues || entries.some(([, v]) => typeof v !== 'string')) {
      return `${where}: \`values\` must hold at most ${PACKAGE_LIMITS.cueValues} string values.`;
    }
    for (const [k, v] of entries) values[k] = v as string;
  }
  if (raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.length > PACKAGE_LIMITS.cueNote)) {
    return `${where}: \`note\` must be a string of at most ${PACKAGE_LIMITS.cueNote} characters.`;
  }
  const cue: ShapedCue = { label, values, ...(typeof raw.note === 'string' && raw.note ? { note: raw.note } : {}) };
  if (withGraphic) {
    if (typeof raw.graphic !== 'string' || !raw.graphic.trim()) return `${where} must name the graphic it cues.`;
    cue.graphic = raw.graphic.trim();
  }
  return cue;
}

/**
 * Is `body` a version-1 graphics pack of legal shape and size? Returns it NARROWED to the keys
 * the format names, or the reason it is not.
 */
export function packageSaveShape(body: unknown): PackageShapeResult {
  if (!isRecord(body) || body.format !== 'noacg-pack') return { ok: false, reason: 'The body must be a NoaCG graphics pack (`format: "noacg-pack"`).' };
  if (body.version !== 1) return { ok: false, reason: 'Only version 1 graphics packs are accepted.' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > SHAPE_LIMITS.name) return { ok: false, reason: `\`name\` must be 1-${SHAPE_LIMITS.name} characters.` };
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > PACKAGE_LIMITS.description) return { ok: false, reason: `\`description\` must be at most ${PACKAGE_LIMITS.description} characters.` };

  const rawGraphics = body.graphics;
  if (!Array.isArray(rawGraphics) || rawGraphics.length === 0) return { ok: false, reason: 'The package holds no graphics.' };
  if (rawGraphics.length > PACKAGE_LIMITS.graphics) return { ok: false, reason: `A package holds at most ${PACKAGE_LIMITS.graphics} graphics.` };

  const graphics: Array<ShapedGraphic | ShapedRecipe> = [];
  const names = new Set<string>();
  let perGraphicCues = 0;
  for (const [i, g] of rawGraphics.entries()) {
    const where = `Graphic ${i + 1}`;
    if (!isRecord(g)) return { ok: false, reason: `${where} is not an object.` };
    const gName = typeof g.name === 'string' ? g.name.trim() : '';
    if (!gName || gName.length > SHAPE_LIMITS.name) return { ok: false, reason: `${where} needs a name of 1-${SHAPE_LIMITS.name} characters.` };
    // The production pool keys on the name, so two graphics sharing one would collapse into one.
    if (names.has(gName)) return { ok: false, reason: `Two graphics are both named "${gName}".` };
    names.add(gName);
    if (g.layer !== undefined && (typeof g.layer !== 'number' || !Number.isInteger(g.layer) || g.layer < 1 || g.layer > 100)) {
      return { ok: false, reason: `"${gName}": \`layer\` must be a whole number from 1 to 100.` };
    }
    const cues: ShapedCue[] = [];
    if (g.cues !== undefined) {
      if (!Array.isArray(g.cues)) return { ok: false, reason: `"${gName}": \`cues\` must be an array.` };
      for (const [j, c] of g.cues.entries()) {
        const cue = shapeCue(c, `"${gName}" cue ${j + 1}`, false);
        if (typeof cue === 'string') return { ok: false, reason: cue };
        cues.push(cue);
      }
      perGraphicCues += cues.length;
    }
    const playout = { ...(typeof g.layer === 'number' ? { layer: g.layer } : {}), ...(cues.length ? { cues } : {}) };

    if (g.recipe !== undefined) {
      const recipe = shapeRecipe(g.recipe, gName);
      if (typeof recipe === 'string') return { ok: false, reason: recipe };
      graphics.push({ name: gName, recipe, ...playout });
      continue;
    }
    if (!isTemplateType(g.type)) return { ok: false, reason: `"${gName}" has an unknown graphic type.` };
    const html = typeof g.html === 'string' ? g.html : '';
    const css = typeof g.css === 'string' ? g.css : '';
    const js = typeof g.js === 'string' ? g.js : '';
    if (!html.trim() || !DEFINITION_MARKER.test(html)) return { ok: false, reason: `"${gName}" carries no SPXGCTemplateDefinition in its HTML.` };
    if (html.length > SHAPE_LIMITS.html || css.length > SHAPE_LIMITS.css || js.length > SHAPE_LIMITS.js) {
      return { ok: false, reason: `"${gName}" exceeds the template size limits.` };
    }

    const origin = shapeOrigin(g.origin);
    if (typeof origin === 'string') return { ok: false, reason: `"${gName}": ${origin}` };
    const shaped: ShapedGraphic = { name: gName, type: g.type, html, css, js, ...playout, ...(origin ? { origin } : {}) };
    if (g.assets !== undefined) {
      if (!Array.isArray(g.assets) || g.assets.length > SHAPE_LIMITS.assetCount) return { ok: false, reason: `"${gName}": at most ${SHAPE_LIMITS.assetCount} assets.` };
      let bytes = 0;
      const assets: Array<{ path: string; data: string }> = [];
      for (const a of g.assets) {
        if (!isRecord(a) || typeof a.path !== 'string' || typeof a.data !== 'string') return { ok: false, reason: `"${gName}": every asset must be { path, data } strings.` };
        if (!a.path || a.path.length > SHAPE_LIMITS.assetPath || a.path.includes('..') || a.path.startsWith('/')) return { ok: false, reason: `"${gName}": asset path "${a.path}" is not a relative package path.` };
        if (!a.data.startsWith('data:')) return { ok: false, reason: `"${gName}": asset "${a.path}" must be inlined as a data URL.` };
        bytes += a.data.length;
        assets.push({ path: a.path, data: a.data });
      }
      if (bytes > SHAPE_LIMITS.assetsTotal) return { ok: false, reason: `"${gName}": inlined assets exceed ${SHAPE_LIMITS.assetsTotal} characters.` };
      if (assets.length) shaped.assets = assets;
    }
    if (g.resolution !== undefined) {
      const r = g.resolution;
      if (!isRecord(r) || !isSize(r.width) || !isSize(r.height)) return { ok: false, reason: `"${gName}": \`resolution\` needs a width and height between 16 and 8192.` };
      shaped.resolution = { width: r.width, height: r.height };
    }
    if (g.fps !== undefined) {
      if (typeof g.fps !== 'number' || !Number.isFinite(g.fps) || g.fps <= 0 || g.fps > 240) return { ok: false, reason: `"${gName}": \`fps\` must be a positive number.` };
      shaped.fps = g.fps;
    }
    graphics.push(shaped);
  }

  // The optional whole-show rundown: ordered across graphics, naming each by pool name.
  let rundown: ShapedCue[] | undefined;
  if (body.cues !== undefined) {
    if (!Array.isArray(body.cues)) return { ok: false, reason: '`cues` must be an array.' };
    if (body.cues.length && perGraphicCues) return { ok: false, reason: 'Use either a top-level `cues` rundown or per-graphic cues, not both.' };
    rundown = [];
    for (const [i, c] of body.cues.entries()) {
      const cue = shapeCue(c, `Cue ${i + 1}`, true);
      if (typeof cue === 'string') return { ok: false, reason: cue };
      if (!names.has(cue.graphic!)) return { ok: false, reason: `Cue ${i + 1} points at "${cue.graphic}", which is not a graphic in this package.` };
      rundown.push(cue);
    }
  }
  if (perGraphicCues + (rundown?.length ?? 0) > PACKAGE_LIMITS.cues) return { ok: false, reason: `A package carries at most ${PACKAGE_LIMITS.cues} cues.` };

  let brand: ShapedBrand | undefined;
  if (body.brand !== undefined) {
    const shaped = shapeBrand(body.brand);
    if (typeof shaped === 'string') return { ok: false, reason: shaped };
    brand = shaped;
  }

  return {
    ok: true,
    pack: {
      format: 'noacg-pack',
      version: 1,
      name,
      description,
      graphics,
      ...(rundown?.length ? { cues: rundown } : {}),
      ...(brand ? { brand } : {}),
    },
  };
}

/** A recipe of catalog ids and string values, or the reason it is not one. Whether the ids exist
 *  is answered where the catalog is: the connector checks them against the index before it
 *  stores a package, and the studio's build refuses an unknown one at install. */
function shapeRecipe(raw: unknown, gName: string): ShapedRecipe['recipe'] | string {
  if (!isRecord(raw)) return `"${gName}": \`recipe\` must be an object.`;
  const id = (v: unknown) => typeof v === 'string' && v.length <= PACKAGE_LIMITS.recipeId && CATALOG_ID.test(v);
  if (!id(raw.type) || !id(raw.design)) return `"${gName}": a recipe needs a catalog \`type\` and \`design\` id.`;
  for (const key of ['palette', 'font'] as const) {
    if (raw[key] !== undefined && !id(raw[key])) return `"${gName}": the recipe's \`${key}\` must be a catalog id.`;
  }
  const recipe: ShapedRecipe['recipe'] = { type: raw.type as string, design: raw.design as string };
  if (typeof raw.palette === 'string') recipe.palette = raw.palette;
  if (typeof raw.font === 'string') recipe.font = raw.font;
  if (raw.values !== undefined) {
    if (!isRecord(raw.values)) return `"${gName}": the recipe's \`values\` must be an object of strings.`;
    const entries = Object.entries(raw.values);
    if (
      entries.length > PACKAGE_LIMITS.cueValues ||
      entries.some(([k, v]) => k.length > PACKAGE_LIMITS.recipeId || typeof v !== 'string' || v.length > PACKAGE_LIMITS.recipeValue)
    ) {
      return `"${gName}": the recipe's \`values\` must hold at most ${PACKAGE_LIMITS.cueValues} strings of at most ${PACKAGE_LIMITS.recipeValue} characters.`;
    }
    if (entries.length) recipe.values = Object.fromEntries(entries) as Record<string, string>;
  }
  return recipe;
}

const isDataAsset = (v: unknown): v is { path: string; data: string } =>
  isRecord(v) &&
  typeof v.path === 'string' &&
  v.path.length > 0 &&
  v.path.length <= SHAPE_LIMITS.assetPath &&
  !v.path.includes('..') &&
  !v.path.startsWith('/') &&
  typeof v.data === 'string' &&
  v.data.startsWith('data:');

/** The pack's brand narrowed to a look's own keys (model/brand.ts ProjectBrand), or the reason
 *  it is not one. Its font file and logo are data URLs and count against the assets cap. */
function shapeBrand(raw: unknown): ShapedBrand | string {
  const bad = "The package's `brand` must be { name, look } with a look's palette, font and logo.";
  if (!isRecord(raw) || !isRecord(raw.look)) return bad;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > SHAPE_LIMITS.name) return bad;
  if (raw.id !== undefined && (typeof raw.id !== 'string' || raw.id.length > PACKAGE_LIMITS.recipeId)) return bad;
  const look = raw.look;
  const p = look.palette;
  const color = (v: unknown) => typeof v === 'string' && v.length <= PACKAGE_LIMITS.brandColor;
  if (!isRecord(p) || ![p.accent, p.text, p.textDim, p.panel].every(color)) return bad;
  const palette = {
    id: typeof p.id === 'string' ? p.id.slice(0, PACKAGE_LIMITS.recipeId) : 'custom',
    name: typeof p.name === 'string' ? p.name.slice(0, SHAPE_LIMITS.name) : 'Brand',
    styleTags: Array.isArray(p.styleTags) ? p.styleTags.filter((t) => typeof t === 'string' && t.length <= 40).slice(0, 10) : [],
    accent: p.accent,
    text: p.text,
    textDim: p.textDim,
    panel: p.panel,
  };
  let bytes = 0;
  let customFont: Record<string, unknown> | null = null;
  if (look.customFont !== undefined && look.customFont !== null) {
    const f = look.customFont;
    if (!isRecord(f) || typeof f.family !== 'string' || f.family.length > SHAPE_LIMITS.name || typeof f.format !== 'string' || f.format.length > 20 || !isDataAsset(f.asset)) return bad;
    customFont = { family: f.family, format: f.format, asset: { path: f.asset.path, data: f.asset.data }, ...(typeof f.tabularFigures === 'boolean' ? { tabularFigures: f.tabularFigures } : {}) };
    bytes += f.asset.data.length;
  }
  if (look.logo !== undefined && !isDataAsset(look.logo)) return bad;
  if (isDataAsset(look.logo)) bytes += look.logo.data.length;
  if (bytes > SHAPE_LIMITS.assetsTotal) return `The brand's font and logo exceed ${SHAPE_LIMITS.assetsTotal} characters.`;
  let tokens: Record<string, string> | undefined;
  if (look.tokens !== undefined) {
    if (!isRecord(look.tokens)) return bad;
    const entries = Object.entries(look.tokens).filter(([k, v]) => k.length <= 40 && typeof v === 'string' && v.length <= 200);
    if (entries.length > PACKAGE_LIMITS.brandTokens) return bad;
    if (entries.length) tokens = Object.fromEntries(entries) as Record<string, string>;
  }
  return {
    ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
    name,
    look: {
      styleTag: typeof look.styleTag === 'string' ? look.styleTag.slice(0, 40) : 'minimal',
      palette,
      fontId: typeof look.fontId === 'string' && look.fontId.length <= PACKAGE_LIMITS.recipeId ? look.fontId : null,
      customFont,
      ...(tokens ? { tokens } : {}),
      ...(isDataAsset(look.logo) ? { logo: { path: look.logo.path, data: look.logo.data } } : {}),
    },
  };
}

function isSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 16 && v <= 8192;
}

export type ProductionShapeResult = { ok: true; request: ProductionRequest } | { ok: false; reason: string };

/**
 * A set delivery's PRODUCTION destination (graphicSets.ts, docs/AGENT_SAVE.md §11): a name, each
 * graphic's layer in the set's order, and an ordered rundown naming the set's graphics - the same
 * limits as a package's, since it is the same production a package would install. `names` are the
 * set's graphic names in order; a production tells its graphics apart by name, so they must differ.
 */
export function productionRequestShape(raw: unknown, names: string[]): ProductionShapeResult {
  if (!isRecord(raw)) return { ok: false, reason: '`production` must be an object with the production\'s `name`.' };
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > SHAPE_LIMITS.name) return { ok: false, reason: `\`production.name\` must be 1-${SHAPE_LIMITS.name} characters.` };
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) return { ok: false, reason: `Two graphics are both named "${twice}" - a production tells its graphics apart by name.` };
  let layers: number[] | undefined;
  if (raw.layers !== undefined) {
    if (!Array.isArray(raw.layers) || raw.layers.length > names.length || raw.layers.some((l) => typeof l !== 'number' || !Number.isInteger(l) || l < 1 || l > 100)) {
      return { ok: false, reason: '`production.layers` must list at most one whole number from 1 to 100 per graphic, in the set\'s order.' };
    }
    layers = raw.layers as number[];
  }
  const cues: ProductionRequest['cues'] = [];
  if (raw.cues !== undefined) {
    if (!Array.isArray(raw.cues) || raw.cues.length > PACKAGE_LIMITS.cues) return { ok: false, reason: `\`production.cues\` must be a list of at most ${PACKAGE_LIMITS.cues} cues.` };
    for (const [i, c] of raw.cues.entries()) {
      const cue = shapeCue(c, `Production cue ${i + 1}`, true);
      if (typeof cue === 'string') return { ok: false, reason: cue };
      if (!names.includes(cue.graphic!)) return { ok: false, reason: `Production cue ${i + 1} points at "${cue.graphic}", which is not a graphic in this set.` };
      cues.push({ graphic: cue.graphic!, label: cue.label, values: cue.values, ...(cue.note ? { note: cue.note } : {}) });
    }
  }
  return { ok: true, request: { name, ...(layers?.length ? { layers } : {}), ...(cues.length ? { cues } : {}) } };
}
