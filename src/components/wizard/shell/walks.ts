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
 * A walk answers its own rules (`WalkRules`) over the walk's state; the defaults below serve the
 * walks without rules of their own. The template road's two walks, one graphic and a kit, are
 * written with their rules in `template/walk.ts`, so a change to how that road gates its steps
 * is made there and never here or in the shell.
 *
 * A step's URL name is its TITLE, slugged, never its index or its id: the import walk carries an
 * extra Images step, so index 3 is Fields on one walk and Style on another, and a history entry
 * written by one walk would mean a different step when another read it back. Two ids may share
 * a title: the SVG walk's mapping step (`map`) is "Fields" on the rail and in the URL.
 */
import type { SummaryStepKey } from '../steps/FinishStep';
import { KIT_WALK, TEMPLATE_WALK } from '../template/walk';
import type { WalkState } from './walkState';

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

/** The shared furniture a step carries. */
export type Furniture = 'preview' | 'brand' | 'skip' | 'catalog';

/** A step as written: its id, its words, and the furniture it carries. */
export interface StepDef {
  id: StepId;
  title: string;
  sub: string;
  has: readonly Furniture[];
}

/** The rules a walk answers for itself, over the walk's state. */
export interface WalkRules {
  /** May the footer's Next leave `step`? */
  canProceed(walk: WalkSpec, step: number, s: WalkState): boolean;
  /** Can the rail jump from `step` to `target`? */
  railJump(walk: WalkSpec, step: number, target: number, s: WalkState): boolean;
  /** Does the live preview show on `step`, once there is a graphic to show? */
  previewOn(walk: WalkSpec, step: number, s: WalkState): boolean;
  /** Is "Skip to finish" offered on `step`? */
  offersSkip(walk: WalkSpec, step: number, s: WalkState): boolean;
  /** Is `step` a shelf whose cards each carry the step's one action? The footer's Next, its
   *  brand chooser, the preview, the format read-back and the rail's forward jumps stand down. */
  isShelf(walk: WalkSpec, step: number, s: WalkState): boolean;
}

/** A walk as written: its steps, the facts the shell cannot derive from them, its own rules. */
export interface WalkDef {
  mode: WizardMode;
  /** The template walk of a KIT: the same six steps, with the words that would be wrong changed. */
  kit?: boolean;
  steps: readonly StepDef[];
  /** The last step a backward rail jump reaches without a picked design. */
  designBy: number;
  /** Where each of Finish's read-back rows goes back to. Null on a Finish without the rows. */
  summary: Readonly<Record<SummaryStepKey, StepId>> | null;
  /** The rules this walk answers differently from the defaults. */
  rules?: Partial<WalkRules>;
}

export interface WalkSpec {
  mode: WizardMode;
  kit: boolean;
  steps: readonly WalkStep[];
  titles: readonly string[];
  /** Each step's URL name, index for index. */
  slugs: readonly string[];
  /** The Animation step's index. The walks without one (ai, file, video) keep 4, the template
   *  walk's: a number no step of theirs answers to, since a kit never leaves the template walk. */
  animStep: number;
  /** Finish's index; one past the last step on the one walk without a Finish (video). */
  finishStep: number;
  /** The last step a backward rail jump reaches without a picked design. */
  designBy: number;
  /** Where each of Finish's read-back rows goes back to: the step it was decided on. Null on the
   *  walks whose Finish has no such rows. */
  summary: Readonly<Record<SummaryStepKey, StepId>> | null;
  rules: WalkRules;
}

/** A step's name in the URL: its title, slugged. */
export function stepSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** What a walk answers when it has no rule of its own. */
const DEFAULT_RULES: WalkRules = {
  // Every step not named here holds a default already.
  canProceed(walk, step, s) {
    switch (walk.steps[step]?.id) {
      case 'file':
        return !!s.importedFile;
      case 'images':
        return s.draft.importedImages.length > 0 && !!s.draft.category;
      case 'artwork':
        return !!s.draft.category;
      case 'template':
      case 'prepare':
      case 'map':
        return !!s.draft.variantId;
      default:
        return true;
    }
  },
  // Backward always, except past the design step with no design; never forward: these walks'
  // steps build state a jump would skip.
  railJump: (walk, step, target, s) => target <= step && !(target > walk.designBy && !s.draft.variantId),
  previewOn: (walk, step) => walk.steps[step]?.preview ?? false,
  offersSkip: (walk, step) => walk.steps[step]?.skip ?? false,
  isShelf: () => false,
};

/** Build a walk from what is written about it. */
export function walkSpec(def: WalkDef): WalkSpec {
  const steps: WalkStep[] = def.steps.map(({ id, title, sub, has }) => ({
    id,
    title,
    sub,
    preview: has.includes('preview'),
    brand: has.includes('brand'),
    skip: has.includes('skip'),
    catalog: has.includes('catalog'),
  }));
  const animation = steps.findIndex((s) => s.id === 'animation');
  const finish = steps.findIndex((s) => s.id === 'finish');
  return {
    mode: def.mode,
    kit: def.kit ?? false,
    steps,
    titles: steps.map((s) => s.title),
    slugs: steps.map((s) => stepSlug(s.title)),
    animStep: animation >= 0 ? animation : 4,
    finishStep: finish >= 0 ? finish : steps.length,
    designBy: def.designBy,
    summary: def.summary,
    rules: { ...DEFAULT_RULES, ...def.rules },
  };
}

const step = (id: StepId, title: string, sub: string, ...has: Furniture[]): StepDef => ({ id, title, sub, has });

const START = step('start', 'Start', 'Choose mode');
const EDIT = ['preview', 'brand', 'skip', 'catalog'] as const;
const FINISH_CATALOG = step('finish', 'Finish', 'Name & save', 'preview', 'brand', 'catalog');
const FINISH_ARTWORK = step('finish', 'Finish', 'Name & save', 'preview', 'brand');

// The images continuation: pictures first, then a design around them (logo-slot designs first).
const IMPORT = walkSpec({
  mode: 'import',
  steps: [
    START,
    step('images', 'Images', 'Add pictures'),
    step('template', 'Template', 'Pick a design', ...EDIT),
    step('fields', 'Fields', 'Operator inputs', ...EDIT),
    step('style', 'Style', 'Colors & typeface', ...EDIT),
    step('animation', 'Animation', 'In & out motion', ...EDIT),
    FINISH_CATALOG,
  ],
  designBy: 2,
  summary: { design: 'template', format: 'template', fields: 'fields', look: 'style', motion: 'animation' },
});

// AI has no configuring steps of its own (the result IS the configuration), so its Finish sits
// right after the working step.
const AI = walkSpec({
  mode: 'ai',
  steps: [START, step('create', 'Create', 'Describe it', 'preview', 'brand'), step('finish', 'Finish', 'Name & save', 'preview')],
  designBy: 2,
  summary: null,
});

const VIDEO = walkSpec({ mode: 'video', steps: [START, step('video', 'Video', 'Brief & format')], designBy: 2, summary: null });

// Import graphic is a SETUP flow, not a second editor: bring the artwork in, prepare it (erase
// baked-in text, pick how it meets long text), PLACE editable text on it, choose the in/out
// animation, and finish (docs/IMPORT_MVP.md).
const DESIGN = walkSpec({
  mode: 'design',
  steps: [
    START,
    step('artwork', 'Design', 'Your artwork', 'preview', 'brand', 'skip'),
    step('prepare', 'Prepare', 'Erase & scale', 'preview', 'brand', 'skip'),
    step('text', 'Text', 'Place fields', 'preview', 'brand', 'skip'),
    step('animation', 'Animation', 'In & out motion', 'preview', 'brand', 'skip'),
    FINISH_ARTWORK,
  ],
  designBy: 2,
  summary: { design: 'artwork', format: 'artwork', fields: 'prepare', look: 'text', motion: 'animation' },
});

// A layered SVG dropped on that same zone has nothing to erase and nothing to place, so its walk
// swaps Prepare and Text for ONE mapping step: which layers the operator can edit
// (docs/SVG_IMPORT_PLAN.md §2). There is no Look step: the SVG carries its own look.
const SVG = walkSpec({
  mode: 'svg',
  steps: [
    START,
    step('artwork', 'Design', 'Your artwork', 'preview', 'brand', 'skip'),
    step('map', 'Fields', 'Map text layers', 'preview', 'brand', 'skip'),
    step('animation', 'Animation', 'In & out motion', 'preview', 'brand', 'skip'),
    FINISH_ARTWORK,
  ],
  designBy: 2,
  summary: { design: 'artwork', format: 'artwork', fields: 'map', look: 'map', motion: 'animation' },
});

// A finished template (.html / .zip) dropped on that zone already declares its fields and motion,
// so its walk is two stops: the file, then where it goes. A MODE rather than a branch of the
// design walk, so the rail never offers steps that cannot apply to it.
const FILE = walkSpec({
  mode: 'file',
  steps: [START, step('file', 'Template file', 'Your graphic', 'preview'), step('finish', 'Finish', 'Name & save', 'preview')],
  designBy: 2,
  summary: null,
});

const TEMPLATE = walkSpec(TEMPLATE_WALK);
const KIT = walkSpec(KIT_WALK);

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

/** Is the footer's brand chooser offered on `step`? */
export function offersBrand(walk: WalkSpec, step: number): boolean {
  return walk.steps[step]?.brand ?? false;
}

/** Does the step on screen need the catalog? */
export function needsCatalogOn(walk: WalkSpec, step: number): boolean {
  return walk.steps[step]?.catalog ?? false;
}

/** May the footer's Next leave `step`? The walk's own rule. */
export function canProceed(walk: WalkSpec, step: number, s: WalkState): boolean {
  return walk.rules.canProceed(walk, step, s);
}

/** Can the rail jump from `step` to `target`? The walk's own rule. */
export function railJump(walk: WalkSpec, step: number, target: number, s: WalkState): boolean {
  return walk.rules.railJump(walk, step, target, s);
}

/** Does the live preview show on `step`? The walk's own rule. */
export function previewOn(walk: WalkSpec, step: number, s: WalkState): boolean {
  return walk.rules.previewOn(walk, step, s);
}

/** Is "Skip to finish" offered on `step`? The walk's own rule. */
export function offersSkip(walk: WalkSpec, step: number, s: WalkState): boolean {
  return walk.rules.offersSkip(walk, step, s);
}

/** Is `step` a shelf whose cards carry its one action? The walk's own rule. */
export function isShelf(walk: WalkSpec, step: number, s: WalkState): boolean {
  return walk.rules.isShelf(walk, step, s);
}
