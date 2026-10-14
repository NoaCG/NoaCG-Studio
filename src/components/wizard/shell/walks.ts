/**
 * THE WIZARD'S WALKS, AS DATA (docs/work-specs/wizard-structure/spec.md section 2).
 *
 * Every walk is a list of steps, and each step says what it IS (`StepId`), what the rail calls
 * it, what it is for, and which of the shell's shared furniture it carries: the live preview,
 * the footer's brand chooser, "Skip to finish", and whether it needs the catalog loaded. The
 * shell renders the step whose id is on screen and asks these functions what its footer, rail
 * and preview do there, so a walk's rules are read in one place and tested in Node
 * (scripts/wizard-walks.test.mjs) rather than spelled as index comparisons across the shell.
 *
 * A step's URL name is its TITLE, slugged, never its index or its id: the import walk carries an
 * extra Images step, so index 3 is Fields on one walk and Style on another, and a history entry
 * written by one walk would mean a different step when another read it back. Two ids may share
 * a title: the SVG walk's mapping step (`map`) is "Fields" on the rail and in the URL.
 */
import type { SummaryStepKey } from '../steps/FinishStep';

/** Which walk the wizard is on. Each one has its own step list below. */
export type WizardMode = 'template' | 'import' | 'design' | 'svg' | 'file' | 'ai' | 'video';

/** What a step is, whatever index it sits at in its walk. */
export type StepId =
  | 'start'
  | 'browse'
  | 'kit'
  | 'images'
  | 'template'
  | 'fields'
  | 'style'
  | 'animation'
  | 'finish'
  | 'create'
  | 'video'
  | 'artwork'
  | 'prepare'
  | 'text'
  | 'map'
  | 'file';

export interface WalkStep {
  id: StepId;
  /** The rail's label; slugged, the step's name in the URL. */
  title: string;
  /** What the step is FOR, in the reader's words: the second line of its rail entry
   *  (re-design/handoff.md §2). A family is a TYPEFACE, never a font (docs/DESIGN_LANGUAGE.md §0). */
  sub: string;
  /** The live preview shows here, once there is a graphic to show. */
  preview: boolean;
  /** The footer's brand chooser is offered here, once there are brands. Only where the brand can
   *  reach the graphic (owner, 2026-09-03): the walks that once formed `BRAND_MODES`. A video's
   *  fields and a dropped template file have nowhere to put a palette or a typeface. */
  brand: boolean;
  /** The footer offers "Skip to finish" here: from the step the walk first has a graphic on. */
  skip: boolean;
  /** The step lists or builds on catalog designs, so it waits for the catalog to load. */
  catalog: boolean;
}

export interface WalkSpec {
  mode: WizardMode;
  /** The template walk of a KIT: the same six steps, with the words that would be wrong changed. */
  kit: boolean;
  steps: readonly WalkStep[];
  titles: readonly string[];
  /** Each step's URL name, index for index. */
  slugs: readonly string[];
  /** The Animation step's index. The walks without one (ai, file, video) keep 4, the template
   *  walk's, because the kit's moves (still inline in the shell until the kit phase) read it in
   *  whatever walk a kit plan is carried into. */
  animStep: number;
  /** Finish's index; one past the last step on the one walk without a Finish (video). */
  finishStep: number;
  /** The last step a backward rail jump reaches without a picked design. */
  designBy: number;
  /** Where each of Finish's read-back rows goes back to: the step it was decided on. Null on the
   *  walks whose Finish has no such rows. */
  summary: Readonly<Record<SummaryStepKey, StepId>> | null;
}

/** A step's name in the URL: its title, slugged. */
export function stepSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

type Furniture = 'preview' | 'brand' | 'skip' | 'catalog';

function step(id: StepId, title: string, sub: string, ...has: Furniture[]): WalkStep {
  return {
    id,
    title,
    sub,
    preview: has.includes('preview'),
    brand: has.includes('brand'),
    skip: has.includes('skip'),
    catalog: has.includes('catalog'),
  };
}

function walkSpec(
  mode: WizardMode,
  steps: WalkStep[],
  extra: { kit?: boolean; designBy: number; summary: WalkSpec['summary'] },
): WalkSpec {
  const animation = steps.findIndex((s) => s.id === 'animation');
  const finish = steps.findIndex((s) => s.id === 'finish');
  return {
    mode,
    kit: extra.kit ?? false,
    steps,
    titles: steps.map((s) => s.title),
    slugs: steps.map((s) => stepSlug(s.title)),
    animStep: animation >= 0 ? animation : 4,
    finishStep: finish >= 0 ? finish : steps.length,
    designBy: extra.designBy,
    summary: extra.summary,
  };
}

const START = step('start', 'Start', 'Choose mode');
const EDIT = ['preview', 'brand', 'skip', 'catalog'] as const;
const FINISH_CATALOG = step('finish', 'Finish', 'Name & save', 'preview', 'brand', 'catalog');
const FINISH_ARTWORK = step('finish', 'Finish', 'Name & save', 'preview', 'brand');

// The catalog flow browses ONE faceted step (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12). Every
// catalog-shaped walk ends on FINISH: the graphic is named there and the one branch is taken.
const TEMPLATE = walkSpec(
  'template',
  [
    START,
    step('browse', 'Browse', 'Pick a design', ...EDIT),
    step('fields', 'Fields', 'Operator inputs', ...EDIT),
    step('style', 'Style', 'Colors & typeface', ...EDIT),
    step('animation', 'Animation', 'In & out motion', ...EDIT),
    FINISH_CATALOG,
  ],
  { designBy: 1, summary: { design: 'browse', format: 'browse', fields: 'fields', look: 'style', motion: 'animation' } },
);

// A KIT borrows the template walk's six steps and changes only the words that would be wrong: the
// design step is where the KIT is chosen, the three editing steps edit whichever graphic of it is
// open, and the last step is the kit's hub. Its own Create is the action, so it never skips.
const KIT = walkSpec(
  'template',
  [
    START,
    step('kit', 'Kit', 'Pick the kit', 'preview', 'brand', 'catalog'),
    step('fields', 'Fields', 'Operator inputs', 'preview', 'brand', 'catalog'),
    step('style', 'Style', 'Colors & typeface', 'preview', 'brand', 'catalog'),
    step('animation', 'Animation', 'In & out motion', 'preview', 'brand', 'catalog'),
    step('finish', 'Finish', 'All graphics & save', 'preview', 'brand', 'catalog'),
  ],
  { kit: true, designBy: 1, summary: { design: 'kit', format: 'kit', fields: 'fields', look: 'style', motion: 'animation' } },
);

// The images continuation: pictures first, then a design around them (logo-slot designs first).
const IMPORT = walkSpec(
  'import',
  [
    START,
    step('images', 'Images', 'Add pictures'),
    step('template', 'Template', 'Pick a design', ...EDIT),
    step('fields', 'Fields', 'Operator inputs', ...EDIT),
    step('style', 'Style', 'Colors & typeface', ...EDIT),
    step('animation', 'Animation', 'In & out motion', ...EDIT),
    FINISH_CATALOG,
  ],
  { designBy: 2, summary: { design: 'template', format: 'template', fields: 'fields', look: 'style', motion: 'animation' } },
);

// AI has no configuring steps of its own (the result IS the configuration), so its Finish sits
// right after the working step.
const AI = walkSpec(
  'ai',
  [START, step('create', 'Create', 'Describe it', 'preview', 'brand'), step('finish', 'Finish', 'Name & save', 'preview')],
  { designBy: 2, summary: null },
);

const VIDEO = walkSpec('video', [START, step('video', 'Video', 'Brief & format')], { designBy: 2, summary: null });

// Import graphic is a SETUP flow, not a second editor: bring the artwork in, prepare it (erase
// baked-in text, pick how it meets long text), PLACE editable text on it, choose the in/out
// animation, and finish (docs/IMPORT_MVP.md).
const DESIGN = walkSpec(
  'design',
  [
    START,
    step('artwork', 'Design', 'Your artwork', 'preview', 'brand', 'skip'),
    step('prepare', 'Prepare', 'Erase & scale', 'preview', 'brand', 'skip'),
    step('text', 'Text', 'Place fields', 'preview', 'brand', 'skip'),
    step('animation', 'Animation', 'In & out motion', 'preview', 'brand', 'skip'),
    FINISH_ARTWORK,
  ],
  { designBy: 2, summary: { design: 'artwork', format: 'artwork', fields: 'prepare', look: 'text', motion: 'animation' } },
);

// A layered SVG dropped on that same zone has nothing to erase and nothing to place, so its walk
// swaps Prepare and Text for ONE mapping step: which layers the operator can edit
// (docs/SVG_IMPORT_PLAN.md §2). There is no Look step: the SVG carries its own look.
const SVG = walkSpec(
  'svg',
  [
    START,
    step('artwork', 'Design', 'Your artwork', 'preview', 'brand', 'skip'),
    step('map', 'Fields', 'Map text layers', 'preview', 'brand', 'skip'),
    step('animation', 'Animation', 'In & out motion', 'preview', 'brand', 'skip'),
    FINISH_ARTWORK,
  ],
  { designBy: 2, summary: { design: 'artwork', format: 'artwork', fields: 'map', look: 'map', motion: 'animation' } },
);

// A finished template (.html / .zip) dropped on that zone already declares its fields and motion,
// so its walk is two stops: the file, then where it goes. A MODE rather than a branch of the
// design walk, so the rail never offers steps that cannot apply to it.
const FILE = walkSpec(
  'file',
  [START, step('file', 'Template file', 'Your graphic', 'preview'), step('finish', 'Finish', 'Name & save', 'preview')],
  { designBy: 2, summary: null },
);

const WALKS: Record<WizardMode, WalkSpec> = {
  template: TEMPLATE,
  import: IMPORT,
  design: DESIGN,
  svg: SVG,
  file: FILE,
  ai: AI,
  video: VIDEO,
};

/** The active walk. One function, so the rail and the URL never disagree about a step. */
export function walkOf(mode: WizardMode, kitWalk: boolean): WalkSpec {
  return mode === 'template' && kitWalk ? KIT : WALKS[mode];
}

/** The index of step `id` in `walk`, or -1. */
export function stepIndex(walk: WalkSpec, id: StepId): number {
  return walk.steps.findIndex((s) => s.id === id);
}

/** The index of the step a URL names, or -1 for a name this walk does not have. */
export function slugIndex(walk: WalkSpec, slug: string | null): number {
  return slug === null ? -1 : walk.slugs.indexOf(slug);
}

/** The rail position of `step`, or -1 when it is past the walk's end. */
export function railIndex(walk: WalkSpec, step: number): number {
  return step < walk.steps.length ? step : -1;
}

/** Back (-1) or Next (+1) from `step`; a move past either end stays put. */
export function stepAfter(walk: WalkSpec, step: number, delta: number): number {
  const target = railIndex(walk, step) + delta;
  return target >= 0 && target < walk.steps.length ? target : step;
}

/** The step Finish's read-back row `key` returns to, or null on a walk without the rows. */
export function summaryStep(walk: WalkSpec, key: SummaryStepKey): number | null {
  return walk.summary ? stepIndex(walk, walk.summary[key]) : null;
}

/** Does the live preview show on `step`? A BUILT kit previews only the open graphic's editing
 *  steps: its Kit step is a picker over whole sets, and its Finish is the hub laying them out. */
export function previewOn(walk: WalkSpec, step: number, kitBuilt: boolean): boolean {
  if (walk.mode === 'template' && kitBuilt) return step >= 2 && step < walk.finishStep;
  return walk.steps[step]?.preview ?? false;
}

/** Is the footer's brand chooser offered on `step`? */
export function offersBrand(walk: WalkSpec, step: number): boolean {
  return walk.steps[step]?.brand ?? false;
}

/** Does the step on screen need the catalog? */
export function needsCatalogOn(walk: WalkSpec, step: number): boolean {
  return walk.steps[step]?.catalog ?? false;
}

/** Is "Skip to finish" offered on `step`? The template walk offers it to one graphic only: on
 *  the Community packs shelf each card's Install is the step's one action. */
export function offersSkip(walk: WalkSpec, step: number, buildMode: string): boolean {
  return (walk.steps[step]?.skip ?? false) && (walk.mode !== 'template' || buildMode === 'one');
}

/** What the footer's Next needs before it moves on from a step. */
export interface ProceedState {
  buildMode: string;
  /** A kit and at least one of its graphics are picked. */
  kitBrowseReady: boolean;
  /** The draft names a design (`draft.variantId`). */
  designPicked: boolean;
  /** The draft names a category. */
  category: boolean;
  /** Pictures the images walk has added. */
  images: number;
  /** A template file has been read. */
  file: boolean;
}

/** May the footer's Next leave `step`? Every step not named here holds a default already. */
export function canProceed(walk: WalkSpec, step: number, s: ProceedState): boolean {
  switch (walk.steps[step]?.id) {
    case 'browse':
    case 'kit':
      return s.buildMode === 'kit' ? s.kitBrowseReady : s.designPicked;
    case 'file':
      return s.file;
    case 'images':
      return s.images > 0 && s.category;
    case 'artwork':
      return s.category;
    case 'template':
    case 'prepare':
    case 'map':
      return s.designPicked;
    default:
      return true;
  }
}

/** What the rail needs to decide whether an entry is a jump target. */
export interface RailState {
  onShelf: boolean;
  kitBuilt: boolean;
  designPicked: boolean;
}

/** Can the rail jump from `step` to `target`? Backward always, except past the design step with
 *  no design. FORWARD only in the template walk once a design is picked (docs/GOALS_ARCHIVE.md
 *  "Student release" step 6): every later step holds a default, so "the template is good
 *  enough" must not cost four Next presses, while the other walks' steps build state a jump
 *  would skip. A BUILT kit is complete, so every entry is a target. */
export function railJump(walk: WalkSpec, step: number, target: number, s: RailState): boolean {
  if (s.onShelf && target > step) return false;
  if (s.kitBuilt) return true;
  if (target > step) return walk.mode === 'template' && s.designPicked;
  return !(target > walk.designBy && !s.designPicked);
}
