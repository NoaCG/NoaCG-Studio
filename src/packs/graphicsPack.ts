// A downloadable GRAPHICS PACK — several finished templates that install as one production.
//
// The file format (`<name>.noacgpack.json`) is the look file's pattern scaled up
// (model/packets.ts `importLook`): one JSON document, everything inlined (assets are data
// URLs inside each template), downloadable from anywhere and importable offline. It exists so
// a complete news/show package can be shipped READY — imported into a production with its
// cue rundown and playout layers already set, operated from the production page with zero
// editing — without touching the wizard catalog or the template generators.
//
// This module owns the format: parsing/normalizing a pack file, validating every graphic
// through the ONE export gate (validation/validateTemplate.ts), and installing the set
// through the ONE multi-template save path (model/templateSet.ts). It lives outside
// src/model because the validation gate imports template machinery the model layer must not
// reach (docs/ARCHITECTURE.md).

import {
  DEFAULT_GRAPHICS_FORMAT,
  DEFAULT_GRAPHICS_RESOLUTION,
} from '../model/projectFormat';
import { commitDurableWrites } from '../model/durableStore';
import { parseDefinition } from '../model/spxDefinition';
import {
  addShowCue,
  graphicLayer,
  loadShows,
  setShowCues,
  setShowGraphicLayer,
  updateShowCue,
  setGraphicSounds,
  type Show,
} from '../model/shows';
import { loadGraphics, templateForSavedGraphic, resolveSavedGraphicDoc } from '../model/library';
import { isProductionSounds } from '../assets/productionSounds';
import { rememberSound, soundBlob, materializeSoundAssets, isSoundAssetRef } from '../assets/soundAssets';
import { fileToDataUrl as blobToDataUrl, dataUrlToBlob } from '../assets/assetUtils';
import { readSound } from '../assets/graphicSound';
import type { ProductionSounds, SoundAssetRef } from '../model/types';
import { saveTemplateSetToProduction, type ProductionDest } from '../model/templateSet';
import {
  DEFAULT_SETTINGS,
  TEMPLATE_TYPE_LABELS,
  type AssetFile,
  type SpxTemplate,
  type TemplateType,
} from '../model/types';
import { validateTemplate } from '../validation/validateTemplate';

/** A prepared cue shipped with a pack graphic — label + field values, ready to Take. */
export interface PackCue {
  label: string;
  values: Record<string, string>;
  note?: string;
}

/** One graphic of a pack, normalized: the full template plus its playout intent. */
export interface PackGraphic {
  sounds?: ProductionSounds;
  template: SpxTemplate;
  /** The playout layer the graphic installs on (1–100; back = low). */
  layer?: number;
  /** Prepared cues. The first REPLACES the auto-seeded default cue; the rest append. */
  cues: PackCue[];
}

/**
 * One graphic ENTRY of the pack FILE - the wire shape `buildPack` writes and `parsePack` reads
 * (`fields`/`settings` are never carried: the code is the source of truth). Named because it is
 * also the shape a single graphic travels in on its own: the bridge hands it to the CLI and the
 * save API accepts exactly one of these (docs/AGENT_CLI.md) - one wire shape, not a second one.
 */
export interface PackGraphicFile {
  sounds?: ProductionSounds;
  name: string;
  type: TemplateType;
  /** Playout layer 1-100 (back = low). Optional: a library graphic has no layer yet. */
  layer?: number;
  html: string;
  css: string;
  js: string;
  /** Inlined assets (data URLs), at the paths the markup uses. */
  assets?: Array<{ path: string; data: string }>;
  resolution?: { width: number; height: number };
  fps?: number;
  cues?: PackCue[];
}

/** One row of a pack's WHOLE-SHOW rundown: a cue addressing a graphic by pool name. */
export interface RundownCue extends PackCue {
  graphic: string;
}

/** A parsed, normalized pack — what `installPack` consumes. */
export interface GraphicsPack {
  soundAssets?: { ref: SoundAssetRef; data: string }[];
  name: string;
  description: string;
  graphics: PackGraphic[];
  /**
   * Optional top-level cue rundown, ORDERED ACROSS graphics (additive, format v1 - a pack
   * without it behaves exactly as before). Per-graphic cues can only append in pool order;
   * a real show walk interleaves graphics (bug up, round card, stats, bug again), which is
   * an ordering only one list can carry. Mutually exclusive with per-graphic `cues`.
   */
  rundown?: RundownCue[];
}

/** The format marker every pack file carries — a fast, honest "this is not a pack" answer
 *  for a template, a look, or an unrelated JSON dropped on the pack door. */
const PACK_FORMAT = 'noacg-pack';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A pack's `type` must be a real TemplateType — the label table is total over the union,
 *  so its keys ARE the runtime list of legal values. */
const isTemplateType = (v: unknown): v is TemplateType =>
  typeof v === 'string' && v in TEMPLATE_TYPE_LABELS;

/** Field values ride the wire as strings (the SPX update() contract) — keep only those. */
function stringValues(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Assets are `{ path, data }` with data-URL (or text) payloads, exactly `AssetFile`. */
function packAssets(v: unknown): AssetFile[] {
  if (!Array.isArray(v)) return [];
  const out: AssetFile[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const path = asString(entry.path);
    const data = asString(entry.data);
    if (path && data) out.push({ path, data });
  }
  return out;
}

/**
 * Parse a pack file's text into a normalized `GraphicsPack`.
 *
 * Refuses with a reason rather than coercing (the csv.ts doctrine): a malformed pack that
 * "mostly imports" would land a production with graphics missing and nothing saying so.
 * Template-level correctness (definition present, runtime entry points, machine shape) is
 * the validation gate's job — `installPack` runs it per graphic.
 */
export function parsePack(json: string): { pack: GraphicsPack | null; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { pack: null, error: 'That file is not readable JSON.' };
  }
  if (!isRecord(raw) || raw.format !== PACK_FORMAT) {
    return { pack: null, error: 'That file is not a NoaCG graphics pack.' };
  }
  if (raw.version !== 1 && raw.version !== 2) {
    return {
      pack: null,
      error: 'This pack was made with a newer version of NoaCG Studio — update to import it.',
    };
  }
  const name = asString(raw.name).trim();
  if (!name) return { pack: null, error: 'The pack has no name.' };
  if (!Array.isArray(raw.graphics) || raw.graphics.length === 0) {
    return { pack: null, error: 'The pack holds no graphics.' };
  }

  const graphics: PackGraphic[] = [];
  const soundAssets: NonNullable<GraphicsPack['soundAssets']> = [];
  if (raw.soundAssets !== undefined) {
    if (!Array.isArray(raw.soundAssets)) return {pack:null,error:'Unreadable pack sound assets.'};
    for (const a of raw.soundAssets) {
      if (!isRecord(a) || !isSoundAssetRef(a.ref) || typeof a.data !== 'string' || !/^data:[^,]*;base64,/.test(a.data)) return {pack:null,error:'Invalid pack sound asset.'};
      const { storageKey: _cloud, ...ref } = a.ref;
      soundAssets.push({ref,data:a.data});
    }
  }
  const seenNames = new Set<string>();
  for (const [i, entry] of raw.graphics.entries()) {
    const label = `Graphic ${i + 1}`;
    if (!isRecord(entry)) return { pack: null, error: `${label} is not an object.` };
    if (entry.sounds !== undefined && (!isProductionSounds(entry.sounds) || entry.sounds.assets.some(a=>!soundAssets.some(s=>s.ref.hash === a.hash && s.ref.bytes === a.bytes)))) return {pack:null,error:`${label} has invalid or missing sound assets.`};
    const graphicName = asString(entry.name).trim();
    if (!graphicName) return { pack: null, error: `${label} has no name.` };
    // The production pool replaces by NAME, so duplicate names would silently collapse two
    // pack graphics into one pool entry with the second one's code.
    if (seenNames.has(graphicName)) {
      return { pack: null, error: `Two graphics are both named “${graphicName}”.` };
    }
    seenNames.add(graphicName);
    if (!isTemplateType(entry.type)) {
      return { pack: null, error: `“${graphicName}” has an unknown graphic type.` };
    }
    const html = asString(entry.html);
    const css = asString(entry.css);
    const js = asString(entry.js);
    if (!html || !js) {
      return { pack: null, error: `“${graphicName}” is missing its HTML or JS.` };
    }

    // fields/settings are the parsed view of the definition inside the HTML — the code is
    // the source of truth, so the pack file never carries them separately.
    const parsed = parseDefinition(html);
    if (!parsed) {
      return {
        pack: null,
        error: `“${graphicName}” has no readable SPXGCTemplateDefinition in its HTML.`,
      };
    }

    let resolution = DEFAULT_GRAPHICS_RESOLUTION;
    if (isRecord(entry.resolution)) {
      const width = Number(entry.resolution.width) || DEFAULT_GRAPHICS_RESOLUTION.width;
      const height = Number(entry.resolution.height) || DEFAULT_GRAPHICS_RESOLUTION.height;
      resolution = { width, height, label: `${width}×${height}` };
    }

    const template: SpxTemplate = {
      name: graphicName,
      type: entry.type,
      resolution,
      fps: Number(entry.fps) || DEFAULT_GRAPHICS_FORMAT.fps,
      html,
      css,
      js,
      fields: parsed.fields,
      settings: parsed.settings ?? { ...DEFAULT_SETTINGS },
      assets: packAssets(entry.assets),
      layers: [],
    };

    const layerNum = Number(entry.layer);
    const cuesRaw = Array.isArray(entry.cues) ? entry.cues : [];
    const cues: PackCue[] = [];
    for (const cue of cuesRaw) {
      if (!isRecord(cue)) continue;
      const cueLabel = asString(cue.label).trim();
      if (!cueLabel) continue;
      cues.push({
        label: cueLabel,
        values: stringValues(cue.values),
        ...(asString(cue.note) ? { note: asString(cue.note) } : {}),
      });
    }

    graphics.push({
      template,
      ...(entry.sounds ? { sounds: { ...entry.sounds as ProductionSounds, assets: (entry.sounds as ProductionSounds).assets.map(a=>{ const {storageKey:_cloud,...ref}=a; return ref; }) } } : {}),
      ...(Number.isFinite(layerNum) && layerNum >= 1 && layerNum <= 100
        ? { layer: Math.round(layerNum) }
        : {}),
      cues,
    });
  }

  // The optional top-level rundown (ordered across graphics). One rundown per pack: a file
  // carrying BOTH forms would leave one of them silently ignored, so it is refused instead.
  const rundown: RundownCue[] = [];
  if (Array.isArray(raw.cues) && raw.cues.length) {
    if (graphics.some((g) => g.cues.length)) {
      return {
        pack: null,
        error: 'The pack carries both a top-level cue rundown and per-graphic cues — use one.',
      };
    }
    for (const [i, entry] of raw.cues.entries()) {
      if (!isRecord(entry)) return { pack: null, error: `Cue ${i + 1} is not an object.` };
      const graphic = asString(entry.graphic).trim();
      if (!seenNames.has(graphic)) {
        return {
          pack: null,
          error: `Cue ${i + 1} points at “${graphic || '?'}”, which is not a graphic in this pack.`,
        };
      }
      const cueLabel = asString(entry.label).trim();
      if (!cueLabel) return { pack: null, error: `Cue ${i + 1} has no label.` };
      rundown.push({
        graphic,
        label: cueLabel,
        values: stringValues(entry.values),
        ...(asString(entry.note) ? { note: asString(entry.note) } : {}),
      });
    }
  }

  return {
    pack: {
      name,
      description: asString(raw.description).trim(),
      graphics,
      ...(soundAssets.length ? {soundAssets} : {}),
      ...(rundown.length ? { rundown } : {}),
    },
    error: null,
  };
}

/**
 * Validate every graphic of a pack through the export gate. Returns the first failure as a
 * user-readable message naming the graphic, or null when the whole pack passes.
 */
export function validatePack(pack: GraphicsPack): string | null {
  for (const g of pack.graphics) {
    const result = validateTemplate(g.template);
    if (!result.ok) {
      const first = result.errors[0];
      return `“${g.template.name}” failed validation: ${first?.message ?? 'unknown error'}`;
    }
  }
  return null;
}

/**
 * Install a validated pack: every graphic to the library, pooled into one production
 * (model/templateSet.ts — the same claimed-write path the wizard's kit uses), then the
 * pack's playout intent applied on top: explicit layers, and the prepared cue rundown.
 *
 * Returns the production, THROWS with a user-readable message on any failure. Callers show
 * the message and navigate on the returned show — nothing here touches the editor.
 */
export async function installPack(pack: GraphicsPack, dest?: ProductionDest): Promise<Show> {
  const failure = validatePack(pack);
  if (failure) throw new Error(failure);
  for (const a of pack.soundAssets ?? []) {
    const blob = dataUrlToBlob(a.data);
    const asset = await readSound(new File([blob],a.ref.name,{type:a.ref.mime}));
    const ref = await rememberSound(asset);
    if (ref.hash !== a.ref.hash || ref.bytes !== a.ref.bytes) throw new Error(`Pack sound changed: ${a.ref.name}`);
  }

  const templates = pack.graphics.map((g) => g.template);
  const show = await saveTemplateSetToProduction(
    templates,
    pack.name,
    dest ?? { kind: 'new', name: pack.name },
  );

  // The pack's playout intent, applied over the defaults the pool assign gave. Pool entries
  // are found by NAME — `addGraphicToShow` keys the pool on it, and the parser refused
  // duplicates, so the lookup is exact.
  const installed = loadShows().find((s) => s.id === show.id);
  if (!installed) throw new Error('The production could not be read back after saving.');

  // The whole-show rundown, when the pack carries one: ONE ordered write (setShowCues).
  // A pool graphic the rundown never names keeps a seeded default cue at the end - the
  // rundown is the production's only list, so a row-less graphic would be unreachable.
  if (pack.rundown?.length) {
    const byName = new Map(installed.graphics.map((p) => [p.name, p]));
    const ordered = pack.rundown.map((cue) => ({
      sourceId: byName.get(cue.graphic)!.id,
      label: cue.label,
      values: cue.values,
      ...(cue.note ? { note: cue.note } : {}),
    }));
    const covered = new Set(pack.rundown.map((c) => c.graphic));
    for (const p of installed.graphics) {
      if (!covered.has(p.name)) ordered.push({ sourceId: p.id, label: p.name, values: {} });
    }
    const { error } = setShowCues(show.id, ordered);
    if (error) throw new Error(error);
  }

  for (const g of pack.graphics) {
    const pooled = installed.graphics.find((p) => p.name === g.template.name);
    if (!pooled) continue;
    if (g.sounds) { const result = setGraphicSounds(show.id,pooled.id,g.sounds,JSON.stringify(pooled.soundConfig ?? null)); if(result.error) throw new Error(result.error); }
    if (g.layer !== undefined) setShowGraphicLayer(show.id, pooled.id, g.layer);
    if (g.cues.length) {
      // Every new pool graphic arrives with one auto-seeded cue (docs/CLOUD_PLAYOUT.md §2).
      // The pack's FIRST cue takes that slot over rather than leaving a default beside it;
      // the rest append in order.
      const [first, ...rest] = g.cues;
      const seeded = loadShows()
        .find((s) => s.id === show.id)
        ?.cues?.find((c) => c.sourceId === pooled.id);
      if (seeded) {
        updateShowCue(show.id, seeded.id, {
          label: first.label,
          values: first.values,
          ...(first.note ? { note: first.note } : {}),
        });
      } else {
        addShowCue(show.id, pooled.id, first);
      }
      for (const cue of rest) addShowCue(show.id, pooled.id, cue);
    }
  }

  // One claim for the whole layer/cue pass — reporting success on the synchronous answer
  // would navigate to a production whose rundown never landed.
  const writeError = await commitDurableWrites();
  if (writeError) throw new Error(writeError);

  const final = loadShows().find((s) => s.id === show.id);
  return final ?? show;
}

/** An asset stored as a Blob has no JSON form — embed it, the way every export does. */
async function assetAsDataUrl(asset: AssetFile): Promise<AssetFile> {
  if (typeof asset.data === 'string') return asset;
  const data = await new Promise<string>((resolvePromise, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolvePromise(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(asset.data as Blob);
  });
  return { path: asset.path, data };
}

/**
 * Serialize a live production back into the pack file shape — the EXPORT half of the round
 * trip, which is what makes the format a way to share whole productions rather than a one-way
 * loader for shipped packs. Templates come from the LIBRARY (what actually ships — the same
 * resolution every production export uses); the cue rundown exports as the top-level ordered
 * list. The returned object stringifies straight into a `<name>.noacgpack.json`.
 */
/** One template as a pack-file graphic entry (assets inlined as data URLs). */
export async function packGraphicEntry(
  template: SpxTemplate,
  opts: { name?: string; layer?: number; cues?: PackCue[] } = {},
): Promise<PackGraphicFile> {
  template = await materializeSoundAssets(template);
  return {
    name: opts.name ?? template.name,
    type: template.type,
    ...(opts.layer !== undefined ? { layer: opts.layer } : {}),
    html: template.html,
    css: template.css,
    js: template.js,
    ...(template.assets.length
      ? {
          assets: (await Promise.all(template.assets.map(assetAsDataUrl))).map((a) => ({
            path: a.path,
            data: typeof a.data === 'string' ? a.data : '',
          })),
        }
      : {}),
    resolution: { width: template.resolution.width, height: template.resolution.height },
    fps: template.fps,
    ...(opts.cues?.length ? { cues: opts.cues } : {}),
  };
}

export async function buildPack(show: Show): Promise<Record<string, unknown>> {
  const library = loadGraphics();
  const graphics: PackGraphicFile[] = [];
  const soundAssets: NonNullable<GraphicsPack['soundAssets']> = [];
  for (const g of show.graphics) {
    const template = g.soundConfig ? resolveSavedGraphicDoc(g,library)?.template ?? g.template : templateForSavedGraphic(g, library);
    const entry = await packGraphicEntry(template, { name: g.name, layer: graphicLayer(g) });
    if (g.soundConfig) {
      if (!isProductionSounds(g.soundConfig)) throw new Error(`Unreadable sounds: ${g.name}`);
      entry.sounds = g.soundConfig;
      for (const ref of g.soundConfig.assets) if (!soundAssets.some(a=>a.ref.hash === ref.hash)) soundAssets.push({ref,data:await blobToDataUrl(await soundBlob(ref))});
    }
    graphics.push(entry);
  }
  const byId = new Map(show.graphics.map((g) => [g.id, g.name]));
  const cues = (show.cues ?? []).flatMap((cue) => {
    const graphic = byId.get(cue.sourceId);
    if (!graphic) return []; // an orphaned cue has nothing to import into
    return [
      {
        graphic,
        label: cue.label,
        values: { ...cue.values },
        ...(cue.note ? { note: cue.note } : {}),
      },
    ];
  });
  return {
    format: PACK_FORMAT,
    version: soundAssets.length ? 2 : 1,
    name: show.name,
    description: '',
    graphics,
    ...(soundAssets.length ? {soundAssets} : {}),
    ...(cues.length ? { cues } : {}),
  };
}

/** The download name: readable slug + the extension that says what the file is. */
export function packFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'pack'}.noacgpack.json`;
}
