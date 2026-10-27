// THE PRODUCTION LOOK AT PLAYOUT (docs/work-specs/playout-adjustments/spec.md, phase 3).
//
// A production's look (model/shows.ts `look`, a `ProjectBrand`) is captured automatically, so it
// reaches air only once somebody turns it on (`lookApplied`). Then it is the WIDEST scope of every
// graphic's style: a cue's own exception over its graphic's default over the look, key by key
// (control/cueAdjust.ts `effectiveAdjust`), and `keepStyle` at either scope keeps it out. Nothing
// here is written into a template: the look travels as the applied appearance's `:root` variables
// and faces, like any other style, and turning it off removes it on the next Take or Update.
//
// A look reaches a graphic only where its stylesheet paints with the property (`styleReach`,
// `cssPaintsWith`): an imported SVG takes nothing and keeps its "as designed" line, team colours
// (`--team-a`, `--team-b`) and alert severities are not contract variables, so they stay.
//
// Pure and Node-tested (scripts/production-look.test.mjs).

import { readAdjust, readFont, styleValue, STYLE_VARS, type FontRef } from '../model/adjust.ts';
import { cssPaintsWith, parseCssColor, relativeLuminance } from '../model/cssVars.ts';
import type { ProjectBrand } from '../model/brand';
import { COLOUR_VARS, SVG_DESIGN_MARKER, faceOf, styleContextFor, styleReach, type ImportedFace, type StyleContext } from './cueStyle.ts';
import type { AssetFile } from '../model/types.ts';
import { contentHash } from '../model/contentHash.ts';
import type { LookLayer } from './cueAdjust.ts';

/** The look a production's graphics take: its `look` while it is on, else none. */
export function productionLookOf(show: { look?: ProjectBrand; lookApplied?: true } | null | undefined): ProjectBrand | null {
  return show?.lookApplied && show.look ? show.look : null;
}

/** The look to turn on: the saved brand `brandId` names (copied, so the production never depends on
 *  the library again), else the captured `look`, else none. */
export function lookToActivate(show: { look?: ProjectBrand; brandId?: string }, saved: readonly { id: string; brand: ProjectBrand }[]): ProjectBrand | null {
  const named = show.brandId ? saved.find((b) => b.id === show.brandId)?.brand : undefined;
  return named ? structuredClone(named) : (show.look ?? null);
}

/** Where the look's imported face file travels: under its own folder, never at a pool graphic's
 *  path, and named by its bytes. Import paths come from the file name (model/fonts.ts
 *  `fontAssetPath`), so a brand's font and a different pool font, or two brands' fonts, can share
 *  one; at one path a stage keeps the first bytes it read, and the other font would stand in. */
export const LOOK_FONT_DIR = 'fonts/look/';
const lookPaths = new Map<string, string>();
function lookAssetPath(asset: { path: string; data?: unknown }): string {
  const file = asset.path.replace(/^fonts\//, '');
  if (typeof asset.data !== 'string') return `${LOOK_FONT_DIR}${file}`;
  let hash = lookPaths.get(asset.data);
  if (hash === undefined) {
    hash = contentHash(asset.data);
    if (lookPaths.size > 8) lookPaths.clear();
    lookPaths.set(asset.data, hash);
  }
  return `${LOOK_FONT_DIR}${hash}/${file}`;
}

/** The imported faces a scope's Type row offers: never the look's own face to pick. The look gives
 *  it already, and a record naming it would keep a path that only the current look carries, so a
 *  replaced look would leave that record pointing at nothing. While it is the face in effect
 *  (`inEffect`, the row's `i:<family>|<path>` key) it stays listed, so the row reads it; choosing
 *  the option already chosen writes nothing. */
export function pickableFaces(imported: readonly ImportedFace[], inEffect?: string): ImportedFace[] {
  return imported.filter((f) => !f.assetPath.startsWith(LOOK_FONT_DIR) || `i:${f.family}|${f.assetPath}` === inEffect);
}

/** The face a look names, as a record reference (model/adjust.ts `readFont`), or undefined. */
export function lookFontRef(look: ProjectBrand): FontRef | undefined {
  if (look.customFont) {
    const ref = readFont({ family: look.customFont.family, assetPath: lookAssetPath(look.customFont.asset) });
    return ref && ref !== 'designed' ? ref : undefined;
  }
  return look.fontId ? { fontId: look.fontId } : undefined;
}

/** The look as one scope of the fold, before any graphic: the four colours, the shape tokens a
 *  record may set (the heading weight among them), and the face. A value that could leave its
 *  declaration is dropped (`styleValue`), as a record's is. */
export function lookLayerOf(look: ProjectBrand): LookLayer {
  const vars: Record<string, string> = {};
  const set = (k: string, v: unknown) => {
    if (styleValue(v) && v.trim() !== '') vars[k] = v.trim();
  };
  set('accent', look.palette.accent);
  set('text-color', look.palette.text);
  set('text-dim', look.palette.textDim);
  set('panel-bg', look.palette.panel);
  for (const [k, v] of Object.entries(look.tokens ?? {})) if (STYLE_VARS.includes(k)) set(k, v);
  const font = lookFontRef(look);
  return { ...(Object.keys(vars).length > 0 ? { vars } : {}), ...(font ? { font } : {}) };
}

/** THE LOOK ON ONE GRAPHIC: only what its stylesheet paints with, so a graphic that paints none of
 *  it (an imported SVG) takes nothing and sends nothing. Undefined for nothing. */
export function lookLayerFor(layer: LookLayer, template: { css: string; js: string }): LookLayer | undefined {
  const reach = styleReach(template);
  const vars: Record<string, string> = {};
  const artwork = template.js.includes(SVG_DESIGN_MARKER);
  for (const [k, v] of Object.entries(layer.vars ?? {})) {
    const paints =
      k === 'display-weight' ? reach.weight : (COLOUR_VARS as readonly string[]).includes(k) ? (reach.colours as string[]).includes(k) : !artwork && cssPaintsWith(template.css, k);
    if (paints) vars[k] = v;
  }
  const font = reach.family ? layer.font : undefined;
  if (Object.keys(vars).length === 0 && !font) return undefined;
  return { ...(Object.keys(vars).length > 0 ? { vars } : {}), ...(font ? { font } : {}) };
}

/** THE LOOK ON EACH POOL GRAPHIC of a production while it is on, by pool graphic id (the fold's
 *  `lookFor`), or undefined when it is off. `templates` are the pool's, in pool order. */
export function lookForOf(
  show: { look?: ProjectBrand; lookApplied?: true; graphics: readonly { id: string }[] } | null | undefined,
  templates: readonly { css: string; js: string }[],
): ((graphicId: string) => LookLayer | undefined) | undefined {
  const look = productionLookOf(show);
  if (!look || !show) return undefined;
  const layer = lookLayerOf(look);
  const byId = new Map(show.graphics.map((g, i) => [g.id, templates[i] ? lookLayerFor(layer, templates[i]) : undefined] as const));
  return (graphicId) => byId.get(graphicId);
}

/** THE LOOK'S IMPORTED FACE, as the fold resolves faces, and the one place its bytes come from: the
 *  look's own copy (`customFont.asset`, at `lookAssetPath`), so a brand's imported typeface reaches
 *  a production whose graphics never shipped it. On or off: a look sent and then turned off stays
 *  on air until the next Take or Update, and a rebuilt monitor or reloaded output still needs its
 *  bytes. Null for a bundled face. */
export function lookImportedFace(show: { look?: ProjectBrand } | null | undefined): { face: ImportedFace; asset: AssetFile } | null {
  const look = show?.look;
  const ref = look && lookFontRef(look);
  if (!look?.customFont || !ref || 'fontId' in ref) return null;
  return { face: { family: ref.family, assetPath: ref.assetPath }, asset: { ...look.customFont.asset, path: ref.assetPath } };
}

/** The faces the Look panel counts and weighs a look with, on or off: the pool's, and the look's
 *  own imported face, so a brand picked while the look is off reads what it will reach. */
export function lookPanelImported(look: ProjectBrand, imported: readonly ImportedFace[]): ImportedFace[] {
  const ref = lookFontRef(look);
  if (!ref || 'fontId' in ref || imported.some((f) => f.family === ref.family && f.assetPath === ref.assetPath)) return [...imported];
  return [...imported, { family: ref.family, assetPath: ref.assetPath }];
}

/** A production's style context: its pool's imported faces, the look's imported face beside them
 *  (on or off: the look layer's face must resolve and its weights be known), and the look on each
 *  graphic while it is on (`lookForOf`). */
export function lookStyleContext(
  show: { look?: ProjectBrand; lookApplied?: true; graphics: readonly { id: string }[] } | null | undefined,
  templates: readonly { css: string; js: string; assets: readonly { path: string }[] }[],
): StyleContext {
  const ctx = styleContextFor(templates, lookForOf(show, templates));
  const own = lookImportedFace(show);
  if (!own || ctx.imported.some((f) => f.family === own.face.family && f.assetPath === own.face.assetPath)) return ctx;
  return { ...ctx, imported: [...ctx.imported, own.face] };
}

/** The pool with the look's imported face beside it, where a surface reads a face's bytes by path
 *  (`assetDataIn`, `withAppearanceFaces`). */
export function withLookAssets<T extends { assets: readonly AssetFile[] }>(show: { look?: ProjectBrand; lookApplied?: true } | null | undefined, pool: readonly T[]): (T | { css: string; assets: AssetFile[] })[] {
  const own = lookImportedFace(show);
  return own && !pool.some((t) => t.assets.some((a) => a.path === own.asset.path)) ? [...pool, { css: '', assets: [own.asset] }] : [...pool];
}

/** Whether the published output still lacks the look's imported face: the graphic Publish carries
 *  it with (the first) reads differently now from what was published. Another change since the
 *  last Publish, an accent say, says nothing about the face. Unknown digests: unknown, false. */
export function lookFaceUnpublished(
  show: { look?: ProjectBrand; publishedAt?: string; graphics: readonly { name: string }[] },
  local: Readonly<Record<string, string>>,
  published: Readonly<Record<string, string>> | null | undefined,
): boolean {
  const first = show.graphics[0];
  if (!show.publishedAt || !lookImportedFace(show) || !first || !published || !(first.name in published) || !(first.name in local)) return false;
  return local[first.name] !== published[first.name];
}

/** A published payload's graphics with the look's imported face carried once, by the first
 *  graphic, unless one already ships that file: every stage reads a face's bytes from any graphic
 *  of the production (output/stage.ts `assetData`). */
export function withLookFaceIn<G extends { assets: readonly { path: string; data: string }[] }>(graphics: readonly G[], asset: AssetFile): G[] {
  if (!graphics[0] || typeof asset.data !== 'string' || graphics.some((g) => g.assets.some((a) => a.path === asset.path))) return [...graphics];
  return [{ ...graphics[0], assets: [...graphics[0].assets, { path: asset.path, data: asset.data }] }, ...graphics.slice(1)];
}

/** One pool graphic as the Look panel counts it. */
export interface LookPoolGraphic {
  name: string;
  template: { css: string; js: string };
}

/** THE REACH, PER PROPERTY, OVER THE POOL: how many graphics the look's typeface reaches (the face
 *  must resolve and the graphic paint with `--font-heading`) and how many its accent reaches,
 *  counted separately, over every graphic of the pool; and the graphics it reaches not at all. */
export interface LookReach {
  pool: number;
  type: number;
  accent: number;
  /** Graphics the look reaches in nothing: their type and colour are the artwork's own. */
  untouched: string[];
}

export function lookReach(pool: readonly LookPoolGraphic[], look: ProjectBrand, imported: readonly ImportedFace[]): LookReach {
  const layer = lookLayerOf(look);
  const faceResolves = !!faceOf(layer.font, imported);
  let type = 0;
  let accent = 0;
  const untouched: string[] = [];
  for (const g of pool) {
    const on = lookLayerFor(layer, g.template);
    if (on?.font && faceResolves) type += 1;
    if (on?.vars?.accent) accent += 1;
    if (!on) untouched.push(g.name);
  }
  return { pool: pool.length, type, accent, untouched };
}

/** A scope that keeps its own style out of the look (`keepStyle`). */
export interface LookException {
  graphic: string;
  /** The cue's label, or null for the graphic's default. */
  cue: string | null;
}

/** Every exception in the production: each pool graphic and each cue whose record keeps its style. */
export function lookExceptions(show: { graphics: readonly { id: string; name: string; adjust?: unknown }[]; cues?: readonly { sourceId?: string; label: string; adjust?: unknown; source?: string }[] }): LookException[] {
  const keeps = (raw: unknown) => {
    const r = readAdjust(raw);
    return r.status === 'ok' && !!r.record.keepStyle;
  };
  const out: LookException[] = [];
  for (const g of show.graphics) if (keeps(g.adjust)) out.push({ graphic: g.name, cue: null });
  for (const c of show.cues ?? []) {
    if (c.source === 'playout' || !keeps(c.adjust)) continue;
    const g = show.graphics.find((x) => x.id === c.sourceId);
    if (g) out.push({ graphic: g.name, cue: c.label });
  }
  return out;
}

/** A LIGHT PANEL is a change of tone: allowed, and warned, since most designs are drawn for dark
 *  panels (docs/CATALOG_VARIETY.md §5: a dark-to-light change breaks 148 of 459 designs). */
export function lightPanel(look: ProjectBrand): boolean {
  const panel = parseCssColor(look.palette.panel);
  return !!panel && relativeLuminance(panel) > 0.5;
}

/** What a send to on-air graphics came to, in one line: "Look sent to 3 graphics on air", or the
 *  partial count first, "2 of 3 updated; Quiz board went off air". */
export function lookSentWords(
  r: { of: number; updated: number; gone: readonly string[]; changed: readonly string[]; failed: readonly { graphic: string; note: string }[] },
  /** The published output does not hold the look's imported face yet: a send carries no font file,
   *  so it draws the fallback there until the next Publish. */
  faceUnpublished = false,
): string {
  const words = sentWords(r);
  return faceUnpublished && r.updated > 0 ? `${words} Publish changes for the published output to show its typeface.` : words;
}

function sentWords(r: Parameters<typeof lookSentWords>[0]): string {
  if (r.of === 0) return 'No graphic is on air, so nothing was sent.';
  if (r.updated === r.of) return r.of === 1 ? 'Look sent to the graphic on air.' : `Look sent to ${r.of} graphics on air.`;
  const why = [
    ...(r.gone.length > 0 ? [`${r.gone.join(', ')} went off air`] : []),
    ...(r.changed.length > 0 ? [`${r.changed.join(', ')} took another cue`] : []),
    ...r.failed.map((f) => `${f.graphic}: ${f.note}`),
  ];
  return `${r.updated} of ${r.of} updated; ${why.join('; ')}`;
}
