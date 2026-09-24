// Lightweight, aggregated preference data: when the harness shows THREE alternatives and
// the user creates one, the choice is recorded as facet counters (chassis, category,
// density, palette, route, …) — chosen vs shown. The signal feeds the design-stage prompt
// as a SUBTLE tie-breaker only: it never overrides the brief, needs a minimum sample before
// it says anything, and reacts to ratios across many selections, never to one click.
//
// Local-only (localStorage), like telemetry. The staged/commit split exists because the
// user picks an option in the AI step but the real commitment is pressing "Create project"
// (a different component) — the step stages the choice, the create commits it.

import type { DesignSpec } from './designSpec';
import type { AiPath } from './provider';
import { accountKey } from '../model/accountScope';

const STORAGE_KEY = 'spx-gfx-ai-preferences';

/** How many committed selections before the hint says anything at all. */
const MIN_SELECTIONS = 8;
/** How many times a facet must have been SHOWN before its ratio is trusted. */
const MIN_SHOWN = 6;
/** How far above the expected 1-in-3 pick rate a facet must sit to be mentioned. */
const RATIO_THRESHOLD = 0.5;

interface PreferenceStore {
  selections: number;
  shown: Record<string, number>;
  chosen: Record<string, number>;
}

/** The comparable facets of one alternative (spec-first; route covers custom builds). */
export interface AlternativeFacets {
  route?: AiPath;
  category?: string;
  variantId?: string;
  paletteId?: string;
  density?: string;
  zone?: string;
  presetId?: string;
}

export function facetsOf(spec: DesignSpec | undefined, route: AiPath | undefined): AlternativeFacets {
  return {
    ...(route ? { route } : {}),
    ...(spec?.category ? { category: spec.category } : {}),
    ...(spec?.variantId ? { variantId: spec.variantId } : {}),
    ...(spec?.paletteId ? { paletteId: spec.paletteId } : spec?.palette ? { paletteId: 'custom' } : {}),
    ...(spec?.density ? { density: spec.density } : {}),
    ...(spec?.zone ? { zone: spec.zone } : {}),
    ...(spec?.animation?.presetId ? { presetId: spec.animation.presetId } : {}),
  };
}

const keysOf = (f: AlternativeFacets): string[] =>
  Object.entries(f).map(([facet, value]) => `${facet}:${value}`);

function read(): PreferenceStore {
  try {
    const raw = JSON.parse(localStorage.getItem(accountKey(STORAGE_KEY)) ?? '{}') as Partial<PreferenceStore>;
    return { selections: raw.selections ?? 0, shown: raw.shown ?? {}, chosen: raw.chosen ?? {} };
  } catch {
    return { selections: 0, shown: {}, chosen: {} };
  }
}

function write(store: PreferenceStore): void {
  try {
    localStorage.setItem(accountKey(STORAGE_KEY), JSON.stringify(store));
  } catch {
    // Preferences are best-effort — never in the user's way.
  }
}

// ── Stage on selection, commit on create ─────────────────────────────────────

let staged: { chosen: AlternativeFacets; shown: AlternativeFacets[] } | null = null;

/** Called by the AI step whenever an alternative is the current pick. Overwrites. */
export function stageSelection(chosen: AlternativeFacets, shown: AlternativeFacets[]): void {
  staged = { chosen, shown };
}

export function clearStagedSelection(): void {
  staged = null;
}

/** Called when the picked alternative actually becomes the project. */
export function commitStagedSelection(): void {
  if (!staged) return;
  const store = read();
  store.selections += 1;
  for (const alt of staged.shown) for (const key of keysOf(alt)) store.shown[key] = (store.shown[key] ?? 0) + 1;
  for (const key of keysOf(staged.chosen)) store.chosen[key] = (store.chosen[key] ?? 0) + 1;
  write(store);
  staged = null;
}

// ── The subtle hint for the design-stage prompt ───────────────────────────────

/**
 * A short aggregated-preference note for the spec system prompt, or null while the sample
 * is too small to mean anything. Deliberately weak wording: a tie-breaker, never a rule.
 */
export function preferenceHint(): string | null {
  const store = read();
  if (store.selections < MIN_SELECTIONS) return null;
  const liked: string[] = [];
  for (const [key, shownCount] of Object.entries(store.shown)) {
    if (shownCount < MIN_SHOWN) continue;
    const rate = (store.chosen[key] ?? 0) / shownCount;
    // Three alternatives → a facet picked at the base rate sits near 1/3.
    if (rate >= 1 / 3 + RATIO_THRESHOLD / 3) liked.push(`${key} (picked ${Math.round(rate * 100)}% of the times shown)`);
  }
  if (!liked.length) return null;
  return (
    `Aggregated preference data from this user's past picks (across ${store.selections} selections): ` +
    `${liked.slice(0, 4).join(', ')}. Treat this as a SUBTLE tie-breaker between otherwise equal ` +
    `directions — the brief, genre, and references always win, and variety still matters.`
  );
}

/** Debug/export surface (and the tests' seam). */
export function preferenceData(): PreferenceStore {
  return read();
}

export function clearPreferences(): void {
  write({ selections: 0, shown: {}, chosen: {} });
  staged = null;
}
