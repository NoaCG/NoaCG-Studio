// The PURE shape guard on the save door's payload (docs/AGENT_SAVE.md). Shape only, never
// execution: it decides whether a body is a library RECORD of the right SHAPE and SIZE, and it
// never parses, evaluates or validates the template CODE inside it.
//
// WHY NOT `parseDefinition` / `validateTemplate` / `parsePack` here. All three execute agent-
// authored code - `parseDefinition` runs the definition literal through `new Function`
// (src/model/spxDefinition.ts) - and this function holds the service key with `fetch` as a
// global. The code is judged only where it runs in a sandbox: the bridge's gate in the user's
// own browser before the CLI saves, and the app's own re-gate when the graphic is opened,
// published or exported. A record can be shaped right and still be a broken graphic; that is
// the library's ordinary condition (the editor saves broken drafts too).
//
// The payload is the LIBRARY RECORD the bridge built (`bridge.graphicDoc`, model/graphicDoc.ts
// `newGraphicDoc`): the CLI sends what the studio itself would have saved, fields already
// parsed in the browser, and the server re-stamps what a server must own (id, timestamps,
// origin) and stores nothing it did not check the shape of.

import { isGraphicDocShape, shapeOrigin, type GraphicDocBase } from '../../../src/model/graphicDoc.js';

export { shapeOrigin };
import { DEFAULT_SETTINGS, TEMPLATE_TYPE_LABELS, type TemplateType } from '../../../src/model/types.js';

/** The caps, in bytes of STRING LENGTH (a UTF-16 unit each - close enough to wire bytes for a
 *  cap, and free of an extra encode). The platform's own body cap is ~4.5 MB; the door reads at
 *  most 4 MB (graphics.ts); the sum of these is deliberately below that so a body that clears
 *  the read cannot then fail on an individual limit nobody can see. */
export const SHAPE_LIMITS = {
  name: 120,
  html: 1_500_000,
  css: 1_000_000,
  js: 1_000_000,
  assetsTotal: 3_000_000,
  assetCount: 40,
  assetPath: 200,
  fields: 200,
  entries: 200,
  entryValues: 200,
  folder: 80,
  originTool: 40,
  originVersion: 40,
} as const;

/** The one thing a template's HTML must visibly carry to be an SPX graphic at all - tested by
 *  PRESENCE (a regex), never by parsing. */
const DEFINITION_MARKER = /SPXGCTemplateDefinition\s*=/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTemplateType = (v: unknown): v is TemplateType => typeof v === 'string' && v in TEMPLATE_TYPE_LABELS;

export type ShapeResult = { ok: true; doc: GraphicDocBase } | { ok: false; reason: string };

/**
 * Is `body` a version-1 library record of legal shape and size? Returns the record NARROWED to
 * the keys the server will store (unknown top-level keys are dropped, not stored), or the reason.
 */
export function graphicSaveShape(body: unknown): ShapeResult {
  if (!isGraphicDocShape(body)) return { ok: false, reason: 'The body must be a version-1 NoaCG graphic record (the bridge\'s graphicDoc).' };
  const name = body.name.trim();
  if (!name || name.length > SHAPE_LIMITS.name) return { ok: false, reason: `\`name\` must be 1-${SHAPE_LIMITS.name} characters.` };
  if (!isTemplateType(body.type)) return { ok: false, reason: `Unknown graphic type "${String(body.type)}".` };

  const t = body.template as unknown as Record<string, unknown>;
  if (!isRecord(t)) return { ok: false, reason: '`template` must be an object.' };
  const html = t.html as string;
  const css = t.css as string;
  const js = t.js as string;
  if (!html.trim()) return { ok: false, reason: '`template.html` is empty.' };
  if (!DEFINITION_MARKER.test(html)) return { ok: false, reason: '`template.html` carries no SPXGCTemplateDefinition.' };
  if (html.length > SHAPE_LIMITS.html) return { ok: false, reason: `\`template.html\` exceeds ${SHAPE_LIMITS.html} characters.` };
  if (css.length > SHAPE_LIMITS.css) return { ok: false, reason: `\`template.css\` exceeds ${SHAPE_LIMITS.css} characters.` };
  if (js.length > SHAPE_LIMITS.js) return { ok: false, reason: `\`template.js\` exceeds ${SHAPE_LIMITS.js} characters.` };
  if (t.type !== body.type) return { ok: false, reason: '`template.type` must equal `type`.' };
  if (typeof t.name !== 'string') return { ok: false, reason: '`template.name` must be a string.' };

  const resolution = t.resolution;
  if (!isRecord(resolution) || !isSize(resolution.width) || !isSize(resolution.height)) {
    return { ok: false, reason: '`template.resolution` must carry a width and height between 16 and 8192.' };
  }
  if (typeof t.fps !== 'number' || !Number.isFinite(t.fps) || t.fps <= 0 || t.fps > 240) return { ok: false, reason: '`template.fps` must be a positive number.' };

  const fields = t.fields;
  if (!Array.isArray(fields) || fields.length > SHAPE_LIMITS.fields) return { ok: false, reason: `\`template.fields\` must be an array of at most ${SHAPE_LIMITS.fields}.` };
  for (const f of fields) {
    if (!isRecord(f) || typeof f.field !== 'string' || typeof f.ftype !== 'string') return { ok: false, reason: 'Every field must carry string `field` and `ftype`.' };
    if (f.value !== undefined && typeof f.value !== 'string') return { ok: false, reason: `Field "${f.field}" has a non-string value.` };
  }
  if (!isRecord(t.settings)) return { ok: false, reason: '`template.settings` must be an object.' };
  for (const [k, v] of Object.entries(t.settings)) {
    if (typeof v !== 'string') return { ok: false, reason: `Setting "${k}" must be a string.` };
  }
  if (!Array.isArray(t.layers)) return { ok: false, reason: '`template.layers` must be an array.' };

  const assets = t.assets;
  if (!Array.isArray(assets) || assets.length > SHAPE_LIMITS.assetCount) return { ok: false, reason: `\`template.assets\` must be an array of at most ${SHAPE_LIMITS.assetCount}.` };
  let assetBytes = 0;
  for (const a of assets) {
    if (!isRecord(a) || typeof a.path !== 'string' || typeof a.data !== 'string') return { ok: false, reason: 'Every asset must be { path, data } strings (a data URL).' };
    if (!a.path || a.path.length > SHAPE_LIMITS.assetPath || a.path.includes('..') || a.path.startsWith('/')) return { ok: false, reason: `Asset path "${a.path}" is not a relative package path.` };
    if (!a.data.startsWith('data:')) return { ok: false, reason: `Asset "${a.path}" must be inlined as a data URL.` };
    assetBytes += a.data.length;
  }
  if (assetBytes > SHAPE_LIMITS.assetsTotal) return { ok: false, reason: `Inlined assets exceed ${SHAPE_LIMITS.assetsTotal} characters in total.` };

  if (body.entries.length > SHAPE_LIMITS.entries) return { ok: false, reason: `\`entries\` must hold at most ${SHAPE_LIMITS.entries} rows.` };
  for (const e of body.entries) {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.label !== 'string' || !isRecord(e.values) || typeof e.updatedAt !== 'string') {
      return { ok: false, reason: 'Every entry must be { id, label, values, updatedAt }.' };
    }
    const values = Object.entries(e.values);
    if (values.length > SHAPE_LIMITS.entryValues || values.some(([, v]) => typeof v !== 'string')) {
      return { ok: false, reason: `Entry "${e.label}" must hold at most ${SHAPE_LIMITS.entryValues} string values.` };
    }
  }
  if (body.baseline !== undefined) {
    const b = body.baseline as unknown;
    if (!isRecord(b) || typeof b.html !== 'string' || typeof b.css !== 'string' || typeof b.js !== 'string') {
      return { ok: false, reason: '`baseline`, when present, must be a template.' };
    }
    if ((b.html as string).length > SHAPE_LIMITS.html || (b.css as string).length > SHAPE_LIMITS.css || (b.js as string).length > SHAPE_LIMITS.js) {
      return { ok: false, reason: '`baseline` exceeds the template size limits.' };
    }
  }
  if (body.folder !== undefined && (typeof body.folder !== 'string' || body.folder.length > SHAPE_LIMITS.folder)) {
    return { ok: false, reason: `\`folder\` must be a string of at most ${SHAPE_LIMITS.folder} characters.` };
  }
  const origin = shapeOrigin(body.origin);
  if (typeof origin === 'string') return { ok: false, reason: origin };

  // Narrow: only the keys the record shape names travel on. Nothing else is stored.
  const doc: GraphicDocBase = {
    version: 1,
    id: body.id,
    name,
    type: body.type,
    packageId: null,
    template: {
      name: t.name as string,
      type: body.type,
      resolution: {
        width: resolution.width as number,
        height: resolution.height as number,
        label: typeof resolution.label === 'string' ? resolution.label : `${resolution.width}×${resolution.height}`,
      },
      fps: t.fps as number,
      html,
      css,
      js,
      fields: fields as GraphicDocBase['template']['fields'],
      // Every setting the format declares is present, so a record saved from a terminal never
      // misses a key the editor reads; what the caller sent wins where it set one.
      settings: { ...DEFAULT_SETTINGS, ...(t.settings as Record<string, string>) } as GraphicDocBase['template']['settings'],
      assets: assets as GraphicDocBase['template']['assets'],
      layers: [],
    },
    ...(body.baseline ? { baseline: body.baseline } : {}),
    entries: body.entries,
    activeEntryId: typeof body.activeEntryId === 'string' ? body.activeEntryId : null,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    ...(typeof body.folder === 'string' && body.folder.trim() ? { folder: body.folder.trim() } : {}),
    ...(origin ? { origin } : {}),
  };
  return { ok: true, doc };
}

function isSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 16 && v <= 8192;
}
