// The BRAND: colours + typeface + shape + a logo, saved under a name and CHOSEN in the wizard.
//
// A brand is a `SavedLook` record (model/packets.ts) — named, cloud-synced, importable and
// exportable as a file. `ProjectBrand` below is the payload it carries, and this module owns
// two things about it: the payload's shape, and WHICH brand is the default for new graphics.
//
// ── THE ANONYMOUS RECORD RETIRED (docs/BRAND_PLAN.md §1 and decision 6, owner 2026-09-05) ────
//
// Until this landed there was one unnamed brand in localStorage (`spx-gfx-brand`) which every
// wizard Create silently overwrote with whatever had just been made, and the wizard's footer
// offered to copy it into the next graphic. It worked, and it read as inert, because the look it
// offered came from a graphic nobody had chosen: the person never named it, never saw it, and
// could not pick a different one.
//
// So the singleton is replaced by a POINTER. `defaultBrandId` names one of the saved looks, and
// `loadBrand()` resolves it. Create writes nothing. The pointer's only job is to preselect a
// brand where something has to choose one without asking (the Home row "Use for new graphics",
// and the star it lights); the wizard's own chooser still starts at None, because matching is an
// explicit act (docs/GOALS_ARCHIVE.md, "Project brand + match toggle").
//
// The old key is not destroyed. It is READ (`legacyBrandOffer`) so the brand creator can offer
// the last look a person's Creates happened to leave behind as something they can name and keep,
// and `captureLookFromTemplate` still falls back to it for a style family. It is never written
// again by the app — only by the cloud-sync seam, which still carries the row so a device that
// has one and a device that does not converge (src/backend/storage.ts).

import type { Palette } from './wizard';
import type { CustomFont, StyleTag } from './fonts';
import type { AssetFile } from './types';
import { registerAppFont } from './fonts';

export interface ProjectBrand {
  /** The style family of the graphic this look came from (used to sort its siblings first). */
  styleTag: StyleTag;
  /** The chosen palette — may be a custom one (id 'custom') or one captured off a graphic. */
  palette: Palette;
  /** Bundled font id, or null when an imported font is in use. */
  fontId: string | null;
  /** The imported font (with its embedded data-URL asset), if one is in use. */
  customFont: CustomFont | null;
  /**
   * The SHAPE half of the look: corner radius, backdrop blur, the panel's edge and lift,
   * accent weight and glow, the kicker face and both trackings, the heading weight
   * (model/themeTokens.ts `TOKEN_VARS`). Keyed by var name WITHOUT the leading dashes, the
   * same key `listCssVariables` reports.
   *
   * A brand is meant to make one design look like another design's sibling, and colour plus
   * typeface was never enough for that: a glass card and a sport slab share a palette and
   * still read as two products, because what actually separates them is radius, blur, edge
   * and accent weight. Those became editable in the Style surfaces before they could travel;
   * this is what lets a saved look carry them.
   *
   * ADDITIVE OPTIONAL, so no version bumps and nothing migrates (root AGENTS.md rule 6): a
   * brand written before this existed simply carries no shape and applies none. Only tokens
   * the RECEIVING design declares are written, so a look never grafts a variable onto a
   * design that reads no such thing.
   *
   * `--font-numeric` is deliberately NOT in here. It is derived from whichever typeface is in
   * use (model/fonts.ts `numericFontStack`), so carrying a captured one would push the source
   * design's numeric face onto a target whose own face needs a different answer.
   */
  tokens?: Record<string, string>;
  /**
   * The brand's MARK, as a data-URL asset at `images/<name>.<ext>` — the same shape a wizard
   * imported image has, so it drops straight into a design's logo slot with no conversion
   * (`brandPatch` writes it as the draft's `logoAssetPath`, and `applyLookToTemplate` writes it
   * into a graphic that already has a slot).
   *
   * ONE logo, deliberately (docs/BRAND_PLAN.md decision 3). A set — light, dark, monochrome —
   * is additive fields beside this one when it comes, which is why the field is a single asset
   * rather than a record keyed by ground.
   *
   * ADDITIVE OPTIONAL: a brand without one simply carries no mark, and a design with no slot
   * never grows one (decision 2 — nothing invents a place for a logo).
   */
  logo?: AssetFile;
  /**
   * "How should graphics in this brand look?" — free text the person writes for themselves.
   * Shown in the creator and in the chooser's tooltip. Level 2 feeds it to the AI brief
   * (docs/BRAND_PLAN.md §9); nothing reads it automatically today, which is why it is text and
   * not a vocabulary.
   */
  notes?: string;
  /**
   * When this brand was last written (ISO). Stamped by the look store; used by Era-5 cloud sync
   * for last-write-wins. Optional so brands built elsewhere (wizard, captured looks) need no
   * change — `loadBrand` back-fills legacy records.
   */
  updatedAt?: string;
}

/** The RETIRED anonymous record. Read for the creator's offer and for a style-family fallback;
 *  written only by the cloud-sync seam. */
const LEGACY_KEY = 'spx-gfx-brand';
/** The pointer: which saved look new graphics start from when something must choose. */
const DEFAULT_BRAND_KEY = 'spx-gfx-default-brand';
/** Set once the creator's "previous project look" offer has been taken or waved away. */
const LEGACY_DISMISSED_KEY = 'spx-gfx-brand-legacy-dismissed';

/**
 * The largest logo FILE a brand accepts, and why this number rather than a rounder one.
 *
 * The mark travels as a data URL INSIDE the synced record, and base64 costs a third: 300 KB of
 * file is about 400 KB of record, which still clears the 500 KB the sync layer warns at
 * (`supabaseProvider.ts` BODY_WARN_BYTES) with the palette, the tokens and an imported font's
 * metadata alongside it.
 *
 * MEASURED against real 512 px PNG marks rather than guessed (this repo's own, 2026-09-05):
 * a flat two-colour icon is 14.5 KB, the wordmark 34 KB, and the full-colour icon with its
 * gradient and glow 171 KB — so every honest 512 px mark passes with room to spare, and what
 * the limit actually catches is a 1024 px screenshot of one (532 KB here) or an untouched
 * camera export. SVG is preferred and is a fraction of any of these (0.7–1.3 KB measured).
 */
export const MAX_BRAND_LOGO_BYTES = 300_000;

/** The refusal for an oversized mark, or null when the file is fine. Stated as a size and a
 *  remedy, never as a bare "too large". */
export function brandLogoRefusal(bytes: number): string | null {
  if (bytes <= MAX_BRAND_LOGO_BYTES) return null;
  return (
    `That logo is ${Math.round(bytes / 1000)} KB. A logo this large slows every sync and every ` +
    `export — export it smaller (512 px is plenty) or as an SVG. The limit is ${MAX_BRAND_LOGO_BYTES / 1000} KB.`
  );
}

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-data-changed'));
}

/** Which saved look is the default for new graphics, or null when none has been chosen. */
export function getDefaultBrandId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_BRAND_KEY);
  } catch {
    return null;
  }
}

/** Point "new graphics" at a saved look (or at nothing, with null). */
export function setDefaultBrand(lookId: string | null): void {
  try {
    if (lookId) localStorage.setItem(DEFAULT_BRAND_KEY, lookId);
    else localStorage.removeItem(DEFAULT_BRAND_KEY);
    notifyDataChanged();
  } catch {
    // Storage full or unavailable — the pointer just won't persist. Non-fatal.
  }
}

/** Forget which brand is the default (the star goes out; no brand is deleted). */
export function clearDefaultBrand(): void {
  setDefaultBrand(null);
}

/** Make an imported font renderable in the builder UI again after a reload, and give a record
 *  saved before Era 5 a timestamp to sync on. Exported because the DEFAULT brand is resolved in
 *  `packets.ts` - a brand IS a look, and this module must not import the look store back or the
 *  two form an import cycle the dependency gate refuses. */
export function hydrateBrand(brand: ProjectBrand): ProjectBrand {
  if (!brand.updatedAt) brand.updatedAt = new Date().toISOString();
  if (brand.customFont && typeof brand.customFont.asset?.data === 'string') {
    registerAppFont(brand.customFont.family, brand.customFont.asset.data);
  }
  return brand;
}

/** `loadBrand()` - the default brand's payload - lives in `packets.ts` beside the look store it
 *  reads. See `hydrateBrand` above for why it cannot live here. */

// ── The retired anonymous record ─────────────────────────────────────────────

/** The old singleton, raw. The cloud-sync seam's read; also the style-family fallback for a
 *  look captured off a graphic before any brand exists. */
export function loadLegacyBrand(): ProjectBrand | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const brand = JSON.parse(raw) as ProjectBrand;
    if (!brand.palette || !brand.styleTag) return null;
    return hydrateBrand(brand);
  } catch {
    return null;
  }
}

/** Write the old singleton. The SYNC SEAM's put and nothing else — the app stopped writing this
 *  record when Create stopped overwriting it (see the header). */
export function saveLegacyBrand(brand: ProjectBrand): void {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...brand, updatedAt: new Date().toISOString() }));
    notifyDataChanged();
  } catch {
    // Storage full or unavailable — non-fatal.
  }
}

/** The sync seam's remove('brand'). */
export function clearLegacyBrand(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
    notifyDataChanged();
  } catch {
    // Non-fatal — nothing to remove or storage unavailable.
  }
}

/**
 * The look a person's earlier Creates left behind, offered ONCE in the brand creator as
 * something they can name and keep. Null once it has been taken or waved away, and null when
 * there never was one — so the offer is a line that appears for exactly the people it is for.
 */
export function legacyBrandOffer(): ProjectBrand | null {
  try {
    if (localStorage.getItem(LEGACY_DISMISSED_KEY)) return null;
  } catch {
    return null;
  }
  return loadLegacyBrand();
}

/** The offer is done with — taken as a brand, or waved away. */
export function dismissLegacyBrandOffer(): void {
  try {
    localStorage.setItem(LEGACY_DISMISSED_KEY, '1');
  } catch {
    // Non-fatal — the offer simply comes back next session.
  }
}
