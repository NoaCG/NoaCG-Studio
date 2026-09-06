// The user-authored GENERATION SPEC behind the AI step's "More control" panel: category,
// data fields, visual direction, fonts, and animation intent as TYPED data. The spec rides
// GenerateContext.spec into the harness, where it PINS the matching DesignSpec decisions
// (the model stops inventing what the user already decided) and feeds the coder path's
// structured briefing (src/ai/spec/specPrompt.ts). A prompt-only user never creates one —
// every field is optional and an empty spec injects nothing.
//
// It lives in the model layer (not src/ai) because SavedProject and GraphicDoc persist it —
// the schema is data, the AI-category REGISTRY that interprets it stays in src/ai/spec.
//
// The vocabulary deliberately reuses the platform's single sources of truth: FieldKind
// (fieldModel.ts), AnimPresetId/AnimSpeed (wizard.ts), EasingId (easings.ts), CustomFont
// (fonts.ts). No parallel enums.

import type { FieldKind } from './fieldModel';
import type { CustomFont } from './fonts';
import type { EasingId } from './easings';
import type { AnimPresetId, AnimSpeed, ExtraFieldSpec, LineSpec } from './templateVocabulary';

/** The AI category ids. The union lives HERE (the persisted schema references it); each id's
 *  REGISTRY entry — names, template links, suggested fields, workflow rules — lives in
 *  src/ai/spec/categories.ts. The compiler keeps the two in step: a registry entry with an
 *  id outside this union fails the build. */
export type AiCategoryId =
  | 'lower-third'
  | 'title'
  | 'topic-card'
  | 'breaking'
  | 'ticker'
  | 'scoreboard'
  | 'stats-panel'
  | 'player-card'
  | 'versus'
  | 'quiz'
  | 'poll'
  | 'qa-card'
  | 'countdown'
  | 'schedule'
  | 'leaderboard'
  | 'quote'
  | 'sponsor-bug'
  | 'social-bug'
  | 'progress-goal'
  | 'starting-soon'
  | 'end-credits';

// ── Fields ───────────────────────────────────────────────────────────────────

/** One editable data field the user asks the graphic to carry. Compiles into real SPX
 *  DataFields: the first text fields become the visible lines, the rest extra fields. */
export interface SpecFieldDef {
  /** Stable local id (list keys / reordering) — never serialized into the template. */
  id: string;
  /** Operator-facing label, e.g. "Home team". */
  label: string;
  kind: FieldKind;
  /** How the field should be used in the design (fed to the AI, shown as a hint). */
  description?: string;
  /** Example / default value shown in the design. */
  example?: string;
}

// ── Animation ────────────────────────────────────────────────────────────────

export type AnimationIntensity = 'subtle' | 'broadcast' | 'energetic' | 'dramatic';

/** Deterministic mapping from an intensity card onto the existing motion knobs — speed
 *  (AnimSpeed) × an easing family. An explicit speed/easing pick always overrides it. */
export const INTENSITY_PRESETS: Record<AnimationIntensity, { speed: AnimSpeed; easing: EasingId; blurb: string }> = {
  subtle:    { speed: 0.75, easing: 'sine', blurb: 'Calm and understated — slower moves, gentle curves.' },
  broadcast: { speed: 1,    easing: 'auto', blurb: 'Confident broadcast standard — the preset’s own tuned feel.' },
  energetic: { speed: 1.5,  easing: 'back', blurb: 'Fast and snappy — quick moves with a lively overshoot.' },
  dramatic:  { speed: 1,    easing: 'expo', blurb: 'Big and cinematic — sharp accelerations, weighty arrivals.' },
};

export interface SpecAnimation {
  /** Entrance preset (the existing preset bank — model/wizard.ts AnimPresetId). */
  inPresetId?: AnimPresetId;
  /** Exit preset, when it should differ from the entrance's own out choreography. */
  outPresetId?: AnimPresetId;
  /** State-change style for machine-bearing graphics (blocks/animData TRANSITION_STYLES). */
  transition?: string;
  intensity?: AnimationIntensity;
  /** Explicit knobs — win over the intensity mapping. */
  speed?: AnimSpeed;
  easing?: EasingId;
  /** Reveal further lines on the operator's Continue press. */
  steps?: boolean;
}

/** The motion knobs a SpecAnimation resolves to (explicit picks win over intensity). */
export function resolveSpecMotion(a?: SpecAnimation): { speed?: AnimSpeed; easing?: EasingId } {
  if (!a) return {};
  const base = a.intensity ? INTENSITY_PRESETS[a.intensity] : undefined;
  return {
    speed: a.speed ?? base?.speed,
    easing: a.easing ?? base?.easing,
  };
}

// ── Fonts ────────────────────────────────────────────────────────────────────

/** A font decision: a bundled font id OR an uploaded font (embedded as a template asset). */
export interface FontChoice {
  fontId?: string;
  customFont?: CustomFont;
  /** Where/how this font should be used ("headlines only", "all numerals"). */
  note?: string;
}

export interface SpecFonts {
  /** The design's main face — fully wired on every path (--font-heading / @font-face). */
  primary?: FontChoice;
  /** Optional supporting faces. Embedded as assets + taught to the coder; the house style
   *  has ONE root font var, so on catalog assemblies these are available, not applied. */
  secondary?: FontChoice;
  numeric?: FontChoice;
}

/** Every uploaded font in the spec (assets + @font-face injection + usage validation). */
export function specCustomFonts(spec: GenerationSpec | null | undefined): CustomFont[] {
  if (!spec?.fonts) return [];
  return [spec.fonts.primary, spec.fonts.secondary, spec.fonts.numeric]
    .map((c) => c?.customFont)
    .filter((f): f is CustomFont => Boolean(f));
}

// ── The spec ─────────────────────────────────────────────────────────────────

export interface GenerationSpec {
  /** Additive-optional versioning (root AGENTS.md rule 6): bump only on a breaking shape
   *  change, migrating on read in loadSpecDraft/normalizeSpec. */
  version: 1;
  /** 'auto' = let the design stage infer the category from the brief (surfaced editable). */
  category: AiCategoryId | 'auto';
  /** True when `category` was inferred by the AI rather than picked by the user. */
  categoryInferred?: boolean;
  fields: SpecFieldDef[];
  /** Chosen or described visual style. */
  styleNotes?: string;
  /** Intended mood/atmosphere. */
  mood?: string;
  /** What must NOT be copied from the references. */
  avoidNotes?: string;
  /** Brand colours (same shape as DesignSpec.palette — one accent + a neutral system). */
  brandColors?: { accent: string; text: string; textDim: string; panel: string } | null;
  fonts?: SpecFonts;
  animation?: SpecAnimation;
}

export function emptyGenerationSpec(): GenerationSpec {
  return { version: 1, category: 'auto', fields: [] };
}

/** True when the user authored nothing — the harness then behaves exactly as before. */
export function specIsEmpty(spec: GenerationSpec | null | undefined): boolean {
  if (!spec) return true;
  return (
    spec.category === 'auto' &&
    spec.fields.length === 0 &&
    !spec.styleNotes?.trim() &&
    !spec.mood?.trim() &&
    !spec.avoidNotes?.trim() &&
    !spec.brandColors &&
    !spec.fonts?.primary && !spec.fonts?.secondary && !spec.fonts?.numeric &&
    !spec.animation?.inPresetId && !spec.animation?.outPresetId && !spec.animation?.transition &&
    !spec.animation?.intensity && !spec.animation?.speed && !spec.animation?.easing &&
    spec.animation?.steps === undefined
  );
}

// ── Compiling fields into the wizard vocabulary ──────────────────────────────

/** The visible text lines: the first `max` text-ish fields, in order. */
export function specLines(spec: GenerationSpec, max: number): LineSpec[] {
  return spec.fields
    .filter((f) => f.kind === 'text' || f.kind === 'lines')
    .slice(0, max)
    .map((f) => ({ title: f.label, sample: f.example || f.label }));
}

/** SPX ftype for a spec field. Kinds outside the broadcast field policy's four extra-field
 *  types clamp to textfield on catalog assemblies — the coder path receives the true kind
 *  through the prompt and may use dropdown for a genuinely constrained choice. */
function extraFtype(kind: FieldKind): ExtraFieldSpec['ftype'] {
  switch (kind) {
    case 'lines': return 'textarea';
    case 'number': return 'number';
    case 'image': return 'filelist';
    default: return 'textfield';
  }
}

/** The remaining fields as extra (non-line) SPX fields. */
export function specExtraFields(spec: GenerationSpec, max: number): ExtraFieldSpec[] {
  const lineIds = new Set(specLines(spec, max).map((l) => l.title));
  const taken = new Set<string>();
  const extras: ExtraFieldSpec[] = [];
  for (const f of spec.fields) {
    const isLine = (f.kind === 'text' || f.kind === 'lines') && lineIds.has(f.label) && !taken.has(f.label);
    if (isLine) {
      taken.add(f.label);
      continue;
    }
    extras.push({ title: f.label, ftype: extraFtype(f.kind), value: f.example ?? '' });
  }
  return extras;
}

// ── Normalization + the localStorage draft ───────────────────────────────────

/** Read any persisted spec into the current shape (the migrate-on-read seam). */
export function normalizeSpec(raw: unknown): GenerationSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const spec = raw as Partial<GenerationSpec>;
  if (spec.version !== 1) return null; // unknown version: degrade to "no spec", never crash
  return {
    ...emptyGenerationSpec(),
    ...spec,
    version: 1,
    category: spec.category ?? 'auto',
    fields: Array.isArray(spec.fields) ? spec.fields.filter((f) => f && typeof f.label === 'string') : [],
  };
}

const DRAFT_KEY = 'spx-gfx-ai-spec-draft';

/** The wizard's cross-session draft: closing the wizard must not lose the setup. */
export function loadSpecDraft(): GenerationSpec | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normalizeSpec(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSpecDraft(spec: GenerationSpec): void {
  try {
    if (specIsEmpty(spec)) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(spec));
  } catch {
    /* quota — the draft is a convenience, never worth an error */
  }
}

export function clearSpecDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
