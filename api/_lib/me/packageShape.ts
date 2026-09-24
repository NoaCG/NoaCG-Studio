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
import { SHAPE_LIMITS } from './graphicShape.js';

/** Caps a whole package adds on top of the per-graphic ones in SHAPE_LIMITS. The body itself is
 *  read at most 4 MB (packages.ts), so the per-graphic caps still bound the total. */
export const PACKAGE_LIMITS = {
  graphics: 40,
  description: 500,
  cues: 400,
  cueLabel: 120,
  cueValues: 200,
  cueNote: 500,
} as const;

/** The one thing a template's HTML must visibly carry - tested by PRESENCE, never by parsing. */
const DEFINITION_MARKER = /SPXGCTemplateDefinition\s*=/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTemplateType = (v: unknown): v is TemplateType => typeof v === 'string' && v in TEMPLATE_TYPE_LABELS;

/** One cue as the format carries it. `graphic` is only present on a top-level rundown row. */
interface ShapedCue {
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
}

/** The narrowed pack, ready to store as the row's body. */
export interface ShapedPackage {
  format: 'noacg-pack';
  version: 1;
  name: string;
  description: string;
  graphics: ShapedGraphic[];
  cues?: ShapedCue[];
}

export type PackageShapeResult = { ok: true; pack: ShapedPackage } | { ok: false; reason: string };

/** A cue row, or the reason it is not one. `withGraphic` is set for the top-level rundown. */
function shapeCue(raw: unknown, where: string, withGraphic: boolean): ShapedCue | string {
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

  const graphics: ShapedGraphic[] = [];
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
    if (!isTemplateType(g.type)) return { ok: false, reason: `"${gName}" has an unknown graphic type.` };
    const html = typeof g.html === 'string' ? g.html : '';
    const css = typeof g.css === 'string' ? g.css : '';
    const js = typeof g.js === 'string' ? g.js : '';
    if (!html.trim() || !DEFINITION_MARKER.test(html)) return { ok: false, reason: `"${gName}" carries no SPXGCTemplateDefinition in its HTML.` };
    if (html.length > SHAPE_LIMITS.html || css.length > SHAPE_LIMITS.css || js.length > SHAPE_LIMITS.js) {
      return { ok: false, reason: `"${gName}" exceeds the template size limits.` };
    }

    const shaped: ShapedGraphic = { name: gName, type: g.type, html, css, js };
    if (g.layer !== undefined) {
      if (typeof g.layer !== 'number' || !Number.isInteger(g.layer) || g.layer < 1 || g.layer > 100) {
        return { ok: false, reason: `"${gName}": \`layer\` must be a whole number from 1 to 100.` };
      }
      shaped.layer = g.layer;
    }
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
    if (g.cues !== undefined) {
      if (!Array.isArray(g.cues)) return { ok: false, reason: `"${gName}": \`cues\` must be an array.` };
      const cues: ShapedCue[] = [];
      for (const [j, c] of g.cues.entries()) {
        const cue = shapeCue(c, `"${gName}" cue ${j + 1}`, false);
        if (typeof cue === 'string') return { ok: false, reason: cue };
        cues.push(cue);
      }
      perGraphicCues += cues.length;
      if (cues.length) shaped.cues = cues;
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

  return {
    ok: true,
    pack: {
      format: 'noacg-pack',
      version: 1,
      name,
      description,
      graphics,
      ...(rundown?.length ? { cues: rundown } : {}),
    },
  };
}

function isSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 16 && v <= 8192;
}
