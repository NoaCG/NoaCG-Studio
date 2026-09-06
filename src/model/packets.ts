// Looks, plus the RETIRED packet store's read seam.
//
//   - Looks: named brand looks (palette + font + style family) that can be applied to
//     the current graphic, set as the project brand for new graphics, and shared as a
//     .json file. Fully live.
//   - Packets (PACKAGES) are RETIRED (docs/GOALS_ARCHIVE.md "Student release" step 3): the one
//     grouping is a PRODUCTION (model/shows.ts). No UI reads or writes packages and the
//     'packet' sync kind is gone; stored rows - local and cloud - stay inert rather than
//     being destroyed. What remains here is the READ seam library.ts's v1 migration needs
//     (loadAllPackets + upsertPacket: a pre-library packet found in localStorage still gets
//     its embedded graphics extracted), the SavedGraphic shape shows.ts pools reuse, and
//     the look capture helpers.

import { getCssVariable, setCssVariable } from './cssVars';
import {
  FONTS,
  customFontFaceCss,
  customFontStack,
  fontById,
  fontFaceCss,
  fontFormatForExt,
  fontStack,
  ensureFontFace,
  ensureNumericFontFace,
  fontByStack,
  numericFontStack,
  type CustomFont,
} from './fonts';
import { getDefaultBrandId, hydrateBrand, loadLegacyBrand, type ProjectBrand } from './brand';
import { TOKEN_VARS } from './themeTokens';
import { replaceDefinitionInHtml } from './spxDefinition';
import type { SpxField, SpxTemplate, TemplateType } from './types';
import { extOf, isFontAsset } from '../assets/assetUtils';
import { durable } from './durableStore';
import { uuid } from './id';

// ── Packets (graphics collections) ───────────────────────────────────────────

export interface SavedGraphic {
  id: string;
  name: string;
  type: TemplateType;
  savedAt: string; // ISO date
  template: SpxTemplate;
  /**
   * The LIBRARY record this copy was taken from (model/library.ts GraphicDoc.id), when the
   * document was a saved graphic. Additive and optional - a copy without it stays valid; it
   * is what lets a show's hosted control page find the graphic's saved ENTRIES
   * (control/hostedControl.ts). Not an ownership link: the copy is still a copy.
   */
  graphicId?: string;
  /**
   * The PLAYOUT LAYER this graphic airs on, inside a production pool (docs/PLAYOUT_DASHBOARD.md
   * §5). A number the operator types - CasparCG offers 1-100 - defaulting to `DEFAULT_PLAYOUT_LAYER`.
   * It is both the SPX/CasparCG playout layer an export declares and the browser output's paint
   * order (higher = in front).
   *
   * ADDITIVE OPTIONAL (root AGENTS.md rule 6): absent means "never chosen", read as the default,
   * so every production saved before this field keeps working and no migration is needed. It is
   * meaningful only inside a `Show.graphics` pool; a library copy simply carries it along.
   *
   * It replaced a layer DERIVED from pool position, which the operator moved with ↑/↓ arrows -
   * an ordering game for something CasparCG states as a plain number.
   */
  layer?: number;
}

export interface Packet {
  id: string;
  name: string;
  /**
   * LEGACY EMBEDDED GRAPHICS (pre-library, docs/SAVED_CONTENT_MODEL.md). Version 2 packets are
   * FOLDERS: graphics live in the library (model/library.ts) pointing back via `packageId`, and
   * this array stays empty. Any embedded graphic found here (a v1 record, or one written by an
   * older build) is extracted into the library on read (library.ts migrateEmbeddedGraphics).
   * Kept as a real array — never undefined — so an older build reading a v2 packet still works.
   */
  graphics: SavedGraphic[];
  /** 2 = folder-over-the-library shape. Absent = v1 (embedded graphics, migrated on read). */
  version?: number;
  /** When the packet last changed (ISO). Bumped on every mutation; drives Era-5 cloud sync (LWW). */
  updatedAt: string;
  /**
   * Soft-delete tombstone: a deleted packet is hidden from the UI but kept (with its payload
   * stripped) so the deletion propagates to other devices via cloud sync, instead of the row
   * resurrecting from another device's stale copy. Purged after a grace period.
   */
  deleted?: boolean;
}

const PACKETS_KEY = 'spx-gfx-packets';
const LOOKS_KEY = 'spx-gfx-looks';

/** Record ids must be valid UUIDs — they become the cloud `documents.id` (uuid PK). */
function newId(): string {
  return uuid();
}

function nowIso(): string {
  return new Date().toISOString();
}

// A FIXED timestamp used to back-fill records saved before updatedAt existed (pre-Era-5). It must
// be a constant, not now(): a fresh now() on every read makes such a record look freshly-edited
// each sync, so it would be re-pushed forever and could wrongly win conflicts. A stable old value
// means it converges (both sides agree) and loses last-write-wins to any real dated edit.
const BACKFILL_TS = '1970-01-01T00:00:00.000Z';

// The sync layer (Era 5.2) listens for local data changes to schedule a cloud push. It is safe for
// sync's own pull-writes to fire this too: the sync is idempotent, so the extra pass it schedules
// finds nothing to do and settles.
function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spx-data-changed'));
  }
}

function loadList<T>(key: string): T[] {
  try {
    return JSON.parse(durable.getItem(key) ?? '[]') as T[];
  } catch {
    return [];
  }
}

/** Persist; returns an error message when the browser storage quota is hit. */
function saveList(key: string, list: unknown): string | null {
  try {
    durable.setItem(key, JSON.stringify(list));
    notifyDataChanged();
    return null;
  } catch {
    return 'Browser storage is full — remove a graphic (large fonts/images count) or export and delete a packet.';
  }
}

/** All packets INCLUDING tombstones — for the sync engine. Back-fills a stable sync timestamp. */
export function loadAllPackets(): Packet[] {
  return loadList<Packet>(PACKETS_KEY).map((p) => (p.updatedAt ? p : { ...p, updatedAt: BACKFILL_TS }));
}

/**
 * Insert or replace a whole packet by id. The one remaining WRITER: library.ts's v1
 * migration uses it to rewrite an old packet as `graphics: [] + version: 2` after
 * extracting its embedded graphics. Nothing else writes packages any more.
 */
export function upsertPacket(packet: Packet): void {
  const all = loadAllPackets();
  const i = all.findIndex((p) => p.id === packet.id);
  if (i >= 0) all[i] = packet;
  else all.push(packet);
  saveList(PACKETS_KEY, all);
}

// ── Looks (named brand looks) ────────────────────────────────────────────────

export interface SavedLook {
  id: string;
  name: string;
  brand: ProjectBrand;
  /** When the look last changed (ISO). Set on save; drives Era-5 cloud sync (LWW). */
  updatedAt: string;
  /** Soft-delete tombstone (hidden from the UI, kept so the delete syncs). See Packet.deleted. */
  deleted?: boolean;
}

/** All looks INCLUDING tombstones — for the sync engine. Back-fills a stable sync timestamp. */
export function loadAllLooks(): SavedLook[] {
  return loadList<SavedLook>(LOOKS_KEY).map((l) => (l.updatedAt ? l : { ...l, updatedAt: BACKFILL_TS }));
}

/** Live looks for the UI (tombstones hidden). */
export function loadLooks(): SavedLook[] {
  return loadAllLooks().filter((l) => !l.deleted);
}

/**
 * The DEFAULT brand's payload - what new graphics start from where something must choose one -
 * or null when no brand is the default, or when the look the pointer names is gone (deleted on
 * another device, say, in which case it resolves to nothing rather than to something arbitrary).
 *
 * It lives HERE rather than in `model/brand.ts` because a brand IS a look: resolving the pointer
 * means reading this store, and brand.ts importing it back would be an import cycle the
 * dependency gate refuses. brand.ts owns the pointer and the payload's shape; this owns the
 * records.
 */
export function loadBrand(): ProjectBrand | null {
  const id = getDefaultBrandId();
  if (!id) return null;
  const look = loadLooks().find((l) => l.id === id);
  if (!look?.brand?.palette || !look.brand.styleTag) return null;
  return hydrateBrand({ ...look.brand, updatedAt: look.brand.updatedAt ?? look.updatedAt });
}

export function addLook(name: string, brand: ProjectBrand): SavedLook[] {
  createLook(name, brand);
  return loadLooks();
}

/** Same write, returning the RECORD. Anything that must then point at what it just made needs
 *  the id (the brand creator's "use this for new graphics", model/brand.ts `setDefaultBrand`),
 *  and re-finding it by name in the list is a guess whenever two brands share one. */
export function createLook(name: string, brand: ProjectBrand): SavedLook {
  const look: SavedLook = { id: newId(), name: name.trim() || 'Untitled look', brand, updatedAt: nowIso() };
  const all = loadAllLooks();
  all.push(look);
  saveList(LOOKS_KEY, all);
  return look;
}

/**
 * Insert or replace a whole look by id (used by the Era-5 storage seam's put('look'), incl. a
 * pulled tombstone). Preserves the given id and deleted flag.
 */
export function upsertLook(look: SavedLook): void {
  const all = loadAllLooks();
  const i = all.findIndex((l) => l.id === look.id);
  if (i >= 0) all[i] = look;
  else all.push(look);
  saveList(LOOKS_KEY, all);
}

/** Delete = tombstone so the delete syncs (see deletePacket). */
export function deleteLook(lookId: string): SavedLook[] {
  const all = loadAllLooks();
  const look = all.find((l) => l.id === lookId);
  if (look) {
    look.deleted = true;
    look.updatedAt = nowIso();
  }
  saveList(LOOKS_KEY, all);
  return all.filter((l) => !l.deleted);
}

/**
 * Drop local tombstones whose updatedAt is older than `beforeIso`. The sync controller calls this
 * with the SAME cutoff it uses to purge the cloud, so a delete is dropped from BOTH sides at once
 * and can't be re-pulled. Writes only when something is actually removed.
 */
export function purgeOldTombstones(beforeIso: string): void {
  const fresh = <T extends { deleted?: boolean; updatedAt: string }>(x: T) => !x.deleted || x.updatedAt >= beforeIso;
  const packets = loadAllPackets();
  const keptP = packets.filter(fresh);
  if (keptP.length !== packets.length) saveList(PACKETS_KEY, keptP);
  const looks = loadAllLooks();
  const keptL = looks.filter(fresh);
  if (keptL.length !== looks.length) saveList(LOOKS_KEY, keptL);
}

/** Import a shared .json look file (shape-checked). Returns the new list or an error. */
export function importLook(json: string): { looks: SavedLook[] | null; error: string | null } {
  try {
    const parsed = JSON.parse(json) as Partial<SavedLook>;
    const brand = parsed.brand as ProjectBrand | undefined;
    if (!parsed.name || !brand?.palette?.accent || !brand.styleTag) {
      return { looks: null, error: 'Not a valid look file (missing name / palette / style).' };
    }
    return { looks: addLook(parsed.name, brand), error: null };
  } catch {
    return { looks: null, error: 'Could not read that file as JSON.' };
  }
}

// ── Capturing + applying a look ──────────────────────────────────────────────

/** The generated @font-face block both bundled and imported fonts carry. */
const FONT_BLOCK_RE = /\/\* (?:Bundled open-source|Imported) font[\s\S]*?\}/;

/**
 * Read the CURRENT template's look (colors straight from its :root vars — including any
 * Style-panel tweaks — plus its font). Falls back to the saved project brand.
 */
export function captureLookFromTemplate(template: SpxTemplate): ProjectBrand {
  // The STYLE FAMILY is the one thing a template's own code cannot say (nothing in the HTML
  // records which catalog family it came from), so it is borrowed from whatever brand the app
  // already considers current — the default brand, and failing that the retired anonymous
  // record a person's earlier Creates left behind (model/brand.ts). Neither existing means the
  // family degrades to 'minimal', which costs nothing but Browse ranking order.
  const brand = loadBrand() ?? loadLegacyBrand();
  const css = template.css;
  const val = (name: string, fallback: string) => getCssVariable(css, name) ?? fallback;

  // The font: match the css font-family against the bundled registry, else treat it as
  // an imported font whose file lives in the template's assets.
  const family = (css.match(/font-family:\s*"([^"]+)"/) || [])[1];
  const bundled = FONTS.find((f) => f.family === family);
  let customFont: CustomFont | null = null;
  if (!bundled && family) {
    const asset = template.assets.find((a) => isFontAsset(a.path));
    if (asset && typeof asset.data === 'string') {
      // Whether this face carries tabular figures was MEASURED when it was imported, and the
      // answer is already written into the template as `--font-numeric`: pointing at the
      // heading face means it can hold a number's width, anything else means it could not.
      // Reading it back beats re-measuring — the file may not be loaded on this device.
      const numeric = getCssVariable(css, 'font-numeric');
      customFont = {
        family,
        format: fontFormatForExt(extOf(asset.path)),
        asset,
        ...(numeric ? { tabularFigures: numeric.includes('--font-heading') } : {}),
      };
    }
  }

  return {
    styleTag: brand?.styleTag ?? 'minimal',
    palette: {
      id: 'captured',
      name: 'Captured',
      styleTags: [brand?.styleTag ?? 'minimal'],
      accent: val('accent', brand?.palette.accent ?? '#3aa0ff'),
      text: val('text-color', brand?.palette.text ?? '#ffffff'),
      textDim: val('text-dim', brand?.palette.textDim ?? 'rgba(255,255,255,0.7)'),
      panel: val('panel-bg', brand?.palette.panel ?? 'rgba(12,14,18,0.92)'),
    },
    fontId: bundled?.id ?? null,
    customFont,
    tokens: captureShapeTokens(css),
  };
}

/**
 * The SHAPE tokens this template declares, keyed by var name. Absent when it declares none —
 * an undefined `tokens` and an empty one mean different things to a reader, and "this design
 * had no shape to give" is the honest one.
 *
 * `--font-numeric` is skipped: it is DERIVED from the typeface in use, so carrying it would
 * push this design's numeric face onto a target whose own face needs a different answer
 * (model/fonts.ts `numericFontStack` decides that per graphic, and `applyLookToTemplate`
 * already recomputes it from the font the look carries).
 */
function captureShapeTokens(css: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const varName of Object.values(TOKEN_VARS)) {
    const name = varName.replace(/^--/, '');
    if (name === 'font-numeric') continue;
    const value = getCssVariable(css, name);
    if (value !== null) out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Retint an EXISTING template with a look: rewrite the :root color vars and swap the
 * marked @font-face block (bundled or imported). Only the style contract is touched —
 * the user's own code stays intact.
 */
export function applyLookToTemplate(template: SpxTemplate, brand: ProjectBrand): SpxTemplate {
  let css = template.css;
  const setIf = (name: string, value: string) => {
    if (getCssVariable(css, name) !== null) css = setCssVariable(css, name, value);
  };
  setIf('accent', brand.palette.accent);
  setIf('text-color', brand.palette.text);
  setIf('text-dim', brand.palette.textDim);
  setIf('panel-bg', brand.palette.panel);

  let assets = template.assets;
  if (FONT_BLOCK_RE.test(css)) {
    // `--font-numeric` follows the heading face wherever it is written: a look that swapped one
    // without the other would leave a graphic's clock in a typeface nobody measured, and a
    // number that changes width is the failure the token exists to prevent (model/fonts.ts).
    if (brand.customFont) {
      css = css.replace(FONT_BLOCK_RE, customFontFaceCss(brand.customFont));
      setIf('font-heading', customFontStack(brand.customFont));
      setIf('font-numeric', numericFontStack(brand.customFont));
      css = ensureNumericFontFace(css, brand.customFont);
      // The look carries its font file — bundle it into this template too.
      assets = [...assets.filter((a) => a.path !== brand.customFont!.asset.path), brand.customFont.asset];
    } else if (brand.fontId) {
      const font = fontById(brand.fontId);
      css = css.replace(FONT_BLOCK_RE, fontFaceCss(font));
      setIf('font-heading', fontStack(font));
      setIf('font-numeric', numericFontStack(font));
      // A sibling numeric face has to ship with the look, or the retinted graphic points at a
      // font file the package never writes.
      css = ensureNumericFontFace(css, font);
    }
  }

  // The SHAPE half, applied LAST so the typeface swap above has already settled `--font-label`
  // and `--font-numeric` before a carried kicker face overrides one of them.
  //
  // `setIf` is doing the load-bearing work: only a token the RECEIVING design already declares
  // is written. A design that reads no `--panel-radius` must not acquire one from a look — it
  // would be a variable nothing consumes, which is the dead-knob failure the whole token
  // contract is built to avoid (templates/shared/base.ts `tokenVarsCss`).
  for (const [name, value] of Object.entries(brand.tokens ?? {})) {
    setIf(name, value);
    // A carried kicker face may name a bundled family this template has never bundled.
    if (name === 'font-label') css = ensureFontFace(css, fontByStack(value), '--font-label points at this face.');
  }

  // ── THE MARK, INTO A SLOT THE GRAPHIC ALREADY HAS ───────────────────────────────────────
  //
  // Same rule as creation (docs/BRAND_PLAN.md decision 2): where the design drew a place for a
  // logo the brand's mark goes in it, and where it did not, NOTHING is invented - no floating
  // overlay, no grafted field. A graphic with no slot comes back with its html, its fields and
  // its asset list exactly as they arrived, which is what makes "apply a brand" safe to press on
  // anything - including a graphic whose picture slot holds a presenter (see the titles below).
  let html = template.html;
  let fields = template.fields;
  const slot = brand.logo ? logoFieldOf(template) : null;
  if (brand.logo && slot) {
    const path = brand.logo.path;
    html = html.replace(slot.tag, markTag(slot.tag, path));
    fields = fields.map((f) => (f.field === slot.field.field ? { ...f, value: path } : f));
    // The definition block is the operator's copy of that value - leaving it behind would show
    // the mark on the canvas and an empty file picker in the control panel.
    html = replaceDefinitionInHtml(html, template.settings, fields);
    assets = [...assets.filter((a) => a.path !== path), brand.logo];
  }

  return { ...template, html, css, fields, assets };
}

/**
 * The picture slots that hold the ORGANISATION'S OWN MARK, by the title the design gives the
 * field. A brand's logo goes in one of these and nowhere else.
 *
 * THE CLASS IS NOT ENOUGH, and assuming it was is how this nearly shipped wrong. Every image
 * slot in the catalog wears `.{prefix}-logo` - including `ls41`'s round presenter AVATAR and
 * `ls25`'s square COVER ARTWORK - so matching on the class alone would replace an operator's
 * headshot with a channel mark and rewrite their file value in the definition block. The two
 * families this list leaves out are left out for different reasons and both are deliberate:
 *
 *   · a slot for a PERSON, a PRODUCT or a PICTURE (`Avatar`, `Photo`, `Cover artwork`,
 *     `Product image`, `QR image`) holds content the operator chose, never a brand;
 *   · a slot for SOMEBODY ELSE'S mark (`Team A logo`, `Sponsor 1`, `Partner 2`, `Club crest`,
 *     `Tournament crest`) is a third party's identity, and a channel putting its own mark
 *     there would be stating something untrue on air.
 *
 * A title this list does not know is left alone, which is the honest answer to a guess about
 * somebody else's markup: a MISS costs the person one drag-and-drop, and a wrong WRITE costs
 * them a graphic they have to notice is wrong.
 */
const BRAND_SLOT_TITLES = [
  'logo',
  'channel mark',
  'institution logo',
  'institution mark',
  'production mark',
  'masthead',
];

/**
 * The template's BRAND slot, or null when it has none - the same question `applyLookToTemplate`
 * asks, exported so a surface that has just applied a brand can put the mark on screen without
 * re-deciding which field was the slot (components/home/sections/LooksSection.tsx).
 */
export function brandSlotField(template: SpxTemplate): SpxField | null {
  return logoFieldOf(template)?.field ?? null;
}

/**
 * The template's BRAND slot: a filelist field titled as the organisation's own mark whose
 * `<img id="fN">` wears a `…-logo` class, plus the exact tag text so the caller can rewrite it
 * without re-finding it. Null when the graphic has no such slot.
 */
function logoFieldOf(template: SpxTemplate): { field: SpxField; tag: string } | null {
  for (const field of template.fields) {
    if (field.ftype !== 'filelist') continue;
    if (!BRAND_SLOT_TITLES.includes(field.title.trim().toLowerCase())) continue;
    const tag = new RegExp(`<img[^>]*\\bid="${field.field}"[^>]*>`).exec(template.html)?.[0];
    if (tag && /\bclass="[^"]*-logo\b/.test(tag)) return { field, tag };
  }
  return null;
}

/** The same `<img>` with the mark in it: `src` written, and the empty-slot `display: none`
 *  removed - a design hides its slot inline while it holds no file (templates/shared/logoSlot.ts),
 *  so leaving that behind would bundle the logo and show nothing. */
function markTag(tag: string, path: string): string {
  const shown = tag.replace(/\s*style="display:\s*none"/, '');
  return /\bsrc="[^"]*"/.test(shown)
    ? shown.replace(/\bsrc="[^"]*"/, `src="${path}"`)
    : shown.replace(/<img/, `<img src="${path}"`);
}
