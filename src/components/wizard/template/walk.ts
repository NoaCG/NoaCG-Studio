/**
 * THE TEMPLATE ROAD'S WALKS: one graphic from the catalog, and a KIT of them
 * (docs/work-specs/wizard-structure/spec.md D6).
 *
 * Both walks are written here with the rules they answer differently from the other walks
 * (shell/walks.ts builds them and asks them). A change to how the template road gates its steps
 * is made in this file and pinned in scripts/wizard-walks.test.mjs; the shell only asks.
 *
 * The rules read the walk's state, never a value the shell computed for them, so a rule that
 * starts reading another field of the walk needs no shell edit either.
 */
import type { Furniture, StepDef, StepId, WalkDef, WalkRules } from '../shell/walks';

const step = (id: StepId, title: string, sub: string, ...has: Furniture[]): StepDef => ({ id, title, sub, has });

const START = step('start', 'Start', 'Choose mode');
const EDIT = ['preview', 'brand', 'skip', 'catalog'] as const;
// A kit's own Create is the action, so its steps never offer "Skip to finish".
const KIT_EDIT = ['preview', 'brand', 'catalog'] as const;

// Browse showing the Community packs shelf: each card's Install is the step's only action.
const isShelf: WalkRules['isShelf'] = (walk, at, s) => {
  const id = walk.steps[at]?.id;
  return (id === 'browse' || id === 'kit') && s.buildMode === 'community';
};

const RULES: Partial<WalkRules> = {
  // The design step needs a design picked, or for a kit a kit and at least one of its graphics.
  // Every later step holds a default already.
  canProceed(walk, at, s) {
    const id = walk.steps[at]?.id;
    if (id !== 'browse' && id !== 'kit') return true;
    return s.buildMode === 'kit' ? !!s.kitPack && s.kitSelected.length > 0 : !!s.draft.variantId;
  },
  isShelf,
  // FORWARD jumps unlock once a design is picked (docs/GOALS_ARCHIVE.md "Student release" step
  // 6): every later step holds a tasteful default, so "the template is good enough" must not
  // cost four Next presses. A BUILT kit is complete, so every entry is a target. Backward always,
  // except past the design step with no design.
  railJump(walk, at, target, s) {
    if (target > at && isShelf(walk, at, s)) return false;
    if (s.kit) return true;
    if (target > at) return !!s.draft.variantId;
    return !(target > walk.designBy && !s.draft.variantId);
  },
  // A BUILT kit previews only the open graphic's editing steps: its Kit step is a picker over
  // whole sets, and its Finish is the hub laying them out.
  previewOn(walk, at, s) {
    if (s.kit) return at >= 2 && at < walk.finishStep;
    return walk.steps[at]?.preview ?? false;
  },
  // "Skip to finish" is for one graphic: a kit's Create, and the shelf's Install, are the action.
  offersSkip: (walk, at, s) => (walk.steps[at]?.skip ?? false) && s.buildMode === 'one',
};

// The catalog flow browses ONE faceted step (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12). Every
// catalog-shaped walk ends on FINISH: the graphic is named there and the one branch is taken.
export const TEMPLATE_WALK: WalkDef = {
  mode: 'template',
  steps: [
    START,
    step('browse', 'Browse', 'Pick a design', ...EDIT),
    step('fields', 'Fields', 'Operator inputs', ...EDIT),
    step('style', 'Style', 'Colors & typeface', ...EDIT),
    step('animation', 'Animation', 'In & out motion', ...EDIT),
    step('finish', 'Finish', 'Name & save', 'preview', 'brand', 'catalog'),
  ],
  designBy: 1,
  summary: { design: 'browse', format: 'browse', fields: 'fields', look: 'style', motion: 'animation' },
  rules: RULES,
};

// A KIT borrows the template walk's six steps and changes only the words that would be wrong: the
// design step is where the KIT is chosen, the three editing steps edit whichever graphic of it is
// open, and the last step is the kit's hub.
export const KIT_WALK: WalkDef = {
  mode: 'template',
  kit: true,
  steps: [
    START,
    step('kit', 'Kit', 'Pick the kit', ...KIT_EDIT),
    step('fields', 'Fields', 'Operator inputs', ...KIT_EDIT),
    step('style', 'Style', 'Colors & typeface', ...KIT_EDIT),
    step('animation', 'Animation', 'In & out motion', ...KIT_EDIT),
    step('finish', 'Finish', 'All graphics & save', ...KIT_EDIT),
  ],
  designBy: 1,
  summary: { design: 'kit', format: 'kit', fields: 'fields', look: 'style', motion: 'animation' },
  rules: RULES,
};
