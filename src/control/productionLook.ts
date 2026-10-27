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

/** The face a look names, as a record reference (model/adjust.ts `readFont`), or undefined. */
export function lookFontRef(look: ProjectBrand): FontRef | undefined {
  if (look.customFont) {
    const ref = readFont({ family: look.customFont.family, assetPath: look.customFont.asset.path });
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

/** THE LOOK'S IMPORTED FACE while the look is on, as the fold resolves faces, and the one place its
 *  bytes come from: the look's own copy (`customFont.asset`), so a brand's imported typeface reaches
 *  a production whose graphics never shipped it. Null for a bundled face, or the look off. */
export function lookImportedFace(show: { look?: ProjectBrand; lookApplied?: true } | null | undefined): { face: ImportedFace; asset: AssetFile } | null {
  const look = productionLookOf(show);
  const ref = look && lookFontRef(look);
  if (!look?.customFont || !ref || 'fontId' in ref) return null;
  return { face: { family: ref.family, assetPath: ref.assetPath }, asset: look.customFont.asset };
}

/** A production's style context: its pool's imported faces, the look's imported face beside them,
 *  and the look on each graphic (`lookForOf`). */
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
export function lookSentWords(r: { of: number; updated: number; gone: readonly string[]; changed: readonly string[]; failed: readonly { graphic: string; note: string }[] }): string {
  if (r.of === 0) return 'No graphic is on air, so nothing was sent.';
  if (r.updated === r.of) return r.of === 1 ? 'Look sent to the graphic on air.' : `Look sent to ${r.of} graphics on air.`;
  const why = [
    ...(r.gone.length > 0 ? [`${r.gone.join(', ')} went off air`] : []),
    ...(r.changed.length > 0 ? [`${r.changed.join(', ')} took another cue`] : []),
    ...r.failed.map((f) => `${f.graphic}: ${f.note}`),
  ];
  return `${r.updated} of ${r.of} updated; ${why.join('; ')}`;
}
