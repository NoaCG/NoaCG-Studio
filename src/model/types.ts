// Core data model for NoaCG Studio.
//
// The *template* is the single source of truth. The editor edits html / css / js
// directly; `fields` and `settings` are parsed from the SPXGCTemplateDefinition that
// lives inside the HTML (see model/spxDefinition.ts). Exporters transform this clean
// template into a packaged SPX zip without changing how the graphic behaves.

// ── Project metadata ────────────────────────────────────────────────────────

/** High-level graphic category, used for gallery grouping and future visual tools. */
export type TemplateType =
  | 'lower-third'
  | 'info-card'
  | 'end-credits'
  | 'ticker'
  /** An urgent on-air notice — breaking news, a weather warning, an emergency instruction.
   *  Distinct from an info card because urgency is the format: the graphic leads with a
   *  severity flag and is read in one glance. */
  | 'alert'
  /** A public-information panel — official notices, disclaimers, source labels, municipal /
   *  medical / legal information, and multilingual versions of the same. Calm where an alert
   *  is urgent; the two share nothing but their audience. */
  | 'public-info'
  | 'fullscreen'
  | 'bug'
  | 'countdown'
  | 'scoreboard'
  | 'info-box'
  | 'starting-soon'
  | 'infographic'
  | 'quiz'
  /** Chrome AROUND the picture — a webcam surround, a two-up interview, a split screen. */
  | 'frame'
  /** A full-frame moment that covers the picture so a cut can happen underneath. */
  | 'transition'
  /** The competition pack (src/templates/competition — docs/COMPETITION_PACK.md): the
   *  esports scorebug, the match-up / competitor card, the results board, and the reveal. */
  | 'esports-score'
  | 'matchup'
  | 'results-board'
  | 'reveal'
  /** A live vote board — the poll while it is happening (templates/poll). */
  | 'poll'
  /** An audience message on screen — question, Q&A, chat, queue, request (templates/audience). */
  | 'audience'
  | 'stream-notification'
  /** A design the user made elsewhere (a flat image) with text fields placed on top. */
  | 'imported-design'
  /** A full-frame still, faded in and out — the production page's picture upload
   *  (src/templates/picture.ts). Generated on demand, never a catalog design. */
  | 'picture'
  | 'blank';

/** The KIND word an operator reads at a glance beside a graphic's name — production pool
 *  rows, cue rundown lines, dashboard layer chips, library rows. Singular and short on
 *  purpose: it sits NEXT TO the user's own name for the graphic, which stays the primary
 *  identity; this only answers "what sort of graphic is that". Total over TemplateType so
 *  a new type without a word is a compile error, not a raw id leaking onto a chip. */
export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  'lower-third': 'Lower third',
  'info-card': 'Info card',
  'end-credits': 'Credits',
  'ticker': 'Ticker',
  'alert': 'Alert',
  'public-info': 'Public info',
  'fullscreen': 'Full screen',
  'bug': 'Bug',
  'countdown': 'Timer',
  'scoreboard': 'Scoreboard',
  'info-box': 'Info box',
  'starting-soon': 'Holding',
  'infographic': 'Infographic',
  'quiz': 'Quiz',
  'frame': 'Frame',
  'transition': 'Transition',
  'esports-score': 'Esports score',
  'matchup': 'Match-up',
  'results-board': 'Results',
  'reveal': 'Reveal',
  'poll': 'Live vote',
  'audience': 'Audience',
  'stream-notification': 'Notification',
  'imported-design': 'Imported',
  'picture': 'Picture',
  // `blank` is the NEUTRAL type: the editor's empty start, and every typeless graphic an
  // external agent authors against the contract (docs/AGENT_CLI.md). Those are finished,
  // operable graphics, so the word they carry beside their name is "Custom", never "Blank" -
  // the type id stays `blank` (it is persisted, and playout loses nothing on it).
  'blank': 'Custom',
};

/** Assembler PREFIXES whose word differs from any TemplateType id — for surfaces that only
 *  hold a graphic's CODE (the hosted dashboard reads the published payload, where the kind
 *  is derived via detectPrefix rather than stored). */
const PREFIX_KIND_LABELS: Record<string, string> = {
  'game-timer': 'Timer',
  'credits': 'Credits',
  'corner-bug': 'Bug',
  'versus': 'Versus',
};

/** The kind word for a TemplateType OR a detected code prefix; an unknown id humanises
 *  rather than leaking kebab-case onto a chip. */
export function graphicKindLabel(idOrPrefix: string): string {
  const known =
    TEMPLATE_TYPE_LABELS[idOrPrefix as TemplateType] ?? PREFIX_KIND_LABELS[idOrPrefix];
  if (known) return known;
  const text = idOrPrefix.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

import type { Resolution } from './projectFormat.js';
export type { AspectPreset, Resolution } from './projectFormat.js';
export { ASPECTS, FPS_OPTIONS, RESOLUTIONS } from './projectFormat.js';

// ── Layer model (structural foundation for future visual editing) ─────────────
//
// Layers describe the visual elements in structured form so building blocks and
// AI can reason about the template without parsing the HTML string. The code
// editor remains the primary editing interface; these are metadata only.

export type LayerType = 'text' | 'image' | 'container' | 'rect';

export interface TemplateLayer {
  /** Matches the HTML element id (e.g. "f0", "logo"). */
  id: string;
  type: LayerType;
  /** Human-readable label shown in future visual tools ("Name field", "Logo"). */
  label: string;
  /** Links to SpxField.field when the element displays a data field value. */
  fieldId?: string;
  /** Initial / static text content (for text layers). */
  text?: string;
  /** Key CSS properties as a plain object (for seeding future inspector panels). */
  styles: Record<string, string>;
  animIn?: 'fade' | 'slide' | 'none';
  animOut?: 'fade' | 'slide' | 'none';
}

// ── SPX field model ──────────────────────────────────────────────────────────

/** All SPX DataField types ("ftype"). Verified against docs.spxgraphics.com. */
export type Ftype =
  | 'textfield'
  | 'textarea'
  | 'dropdown'
  | 'filelist'
  | 'number'
  | 'checkbox'
  | 'color'
  | 'button'
  | 'instruction'
  | 'caption'
  | 'hidden'
  | 'divider'
  | 'spacer';

/** ftypes that actually carry editable operator data we feed to update(). */
export const DATA_FTYPES: Ftype[] = [
  'textfield',
  'textarea',
  'dropdown',
  'filelist',
  'number',
  'checkbox',
  'color',
  'hidden',
];

export interface SpxDropdownItem {
  text: string;
  value: string;
}

/** A single SPX DataField definition entry. */
export interface SpxField {
  field: string; // unique id, e.g. "f0"
  ftype: Ftype;
  title: string;
  value: string; // default / sample value
  prvar?: string; // project variable (shared across templates)
  items?: SpxDropdownItem[]; // dropdown
  assetfolder?: string; // filelist
  extension?: string; // filelist
  fcall?: string; // button
  descr?: string; // button
}

/** Playout / display settings from SPXGCTemplateDefinition (minus DataFields). */
export interface SpxSettings {
  description: string;
  playserver: string;
  playchannel: string;
  playlayer: string;
  webplayout: string;
  out: string; // "manual" | "none" | milliseconds
  steps: string; // number of animation phases
  dataformat: string; // "json" (default) | "xml"
  uicolor: string; // "1".."7"
}

/** A binary/relative asset bundled with the template (image, font, video...). */
export interface AssetFile {
  path: string; // relative path inside the package, e.g. "assets/logo.png"
  data: Blob | string; // bytes, or a data URL / text
  /** Audio bytes live in the account asset store, never in a production row. */
  audio?: SoundAssetRef;
}

export interface SoundAssetRef {
  hash: string;
  name: string;
  bytes: number;
  mime: string;
  /** Private user-assets object, assigned by cloud sync/publication. */
  storageKey?: string;
}

export interface GraphicSoundBinding {
  id: string;
  asset: string;
  enabled: boolean;
  mode: 'one-shot' | 'loop';
  levelDb: number;
}

export interface ProductionSounds {
  v: 1;
  assets: SoundAssetRef[];
  /** graphic, or picture:<logical asset path>. Cues contain neither this map nor bytes. */
  visuals: Record<string, {
    topology: string;
    bindings: Record<string, GraphicSoundBinding>;
    quiz?: { selected: string; correct: string; selectionState: string; revealState: string };
  }>;
}

// ── Main template type ───────────────────────────────────────────────────────

/** The full template — the source of truth edited in the app. */
export interface SpxTemplate {
  name: string;
  type: TemplateType;
  resolution: Resolution;
  fps: number;
  html: string; // body structure + <script id="spx-template-definition"> block
  css: string;
  js: string; // clean play(), stop(), update(data), next()
  fields: SpxField[]; // parsed view of the definition (source of truth = the code)
  settings: SpxSettings;
  assets: AssetFile[];
  /** Structured element descriptions — metadata for building blocks and future visual tools. */
  layers: TemplateLayer[];
}

/** A proposed change to the template (from AI or building blocks). */
export interface TemplateChange {
  summary: string; // human-readable description of what changed
  template: SpxTemplate; // the resulting template if applied
  explanation?: string; // optional teaching note ("explain" action)
}

export const DEFAULT_SETTINGS: SpxSettings = {
  description: 'Lower third',
  playserver: 'OVERLAY',
  playchannel: '1',
  playlayer: '1',
  webplayout: '1',
  out: 'manual',
  steps: '0',
  dataformat: 'json',
  uicolor: '7',
};
