/**
 * THE WALK'S DURABLE STATE AND ITS TRANSITIONS (docs/work-specs/wizard-structure/spec.md
 * section 4, phase S5).
 *
 * One record holds what a walk IS: the draft, the mode and step, the Browse filters, the AI
 * result and thread, a dropped template file, the production the wizard opened for, the brand
 * chooser, the kit picker and the kit, and the two baselines "has work" and Continue read. The
 * shell keeps it in one `useReducer` over `reduce`; nothing else writes it.
 *
 * The five ways a walk begins or ends are `transition`'s intents, each with its own keep/clear
 * policy, and the differences between them are deliberate (section 4's table, as S1c decided
 * it). Each returns the next record AND what the intent does to the screen state the shell keeps
 * beside it (D2): the walk-back warning, the stretch demo and the kit's asks, the walk memory,
 * the held-walk flag. Every cell of that table is a Node test (scripts/wizard-walk-state.test.mjs).
 *
 * The walk memory - the walk a door finished, and the graphic it made - stays a REF in the shell
 * (D2): the save reads it across awaits, where a value captured at render would be stale under a
 * second press. The functions below take it as an argument and never hold it.
 */
import type { Route } from '../../../app/router';
import type { ProjectBrand } from '../../../model/brand';
import type { AiThread } from '../../../model/aiThread';
import type { GenerationSpec } from '../../../model/generationSpec';
import type { ImportedTemplateResult } from '../../../model/importTemplate';
import type { LibraryNameEntry, librarySaveEffect } from '../../../model/library';
import type { Show } from '../../../model/shows';
import type { SpxTemplate } from '../../../model/types';
import type { TemplateVariant } from '../../../model/wizard';
import { NO_BROWSE_FILTERS, type BrowseFilters } from '../../../templates/browseFilters';
import type { TemplatePack } from '../../../templates/packs';
import { initialDraft, mergeDraft, type DraftPatch, type WizardDraft } from '../draft/core';
import { brandClearPatch, brandOrClearPatch, brandPatch } from '../draft/template';
import { commitKitGraphic, rebrandKit, type KitPlan } from '../kitPlan';
import type { BuildMode } from '../steps/BrowseStep';
import { slugIndex, stepIndex, walkOf, type WizardMode } from './walks';

/** One entry in the footer's brand chooser: a saved brand, by the name its owner gave it.
 *
 *  It is a shape of its own rather than a `SavedLook` because one entry is NOT a saved record -
 *  a production that carries a captured look and has never chosen a brand is offered its own
 *  look under a synthetic id, so the chooser can show what the graphic is actually being created
 *  in instead of showing None over a preselected look. */
export interface BrandChoice {
  id: string;
  name: string;
  brand: ProjectBrand;
}

/** The synthetic entry above. Never a look id, so it can never collide with one. */
export const PRODUCTION_LOOK_ID = 'production-look';

/** The AI step's current result, previewed live like any draft. */
export type AiResultState = {
  template: SpxTemplate;
  valid: boolean;
  spec?: GenerationSpec | null;
  generationId?: string;
  /** Pipeline provenance — 'pro' marks a Pro-tier result for the activation event. */
  path?: string | null;
  /**
   * The whole PACKAGE this result belongs to, LEADING with `template` (§15.9): a Pro
   * generation renders ONE design language as every graphic type the user asked for, and a
   * set of several is finished into a PRODUCTION rather than opened as one project.
   */
  pack?: SpxTemplate[] | null;
} | null;

/** The graphic a finished walk left behind — what the warning NAMES, and what a second pass
 *  down the same walk must write over rather than duplicate. */
export interface MadeGraphic {
  name: string;
  /** The library record, when the door saved one (the editor door does not). */
  graphicId: string | null;
  /** The production it joined, by name, when it joined one. */
  production: string | null;
  /** Where the door LANDED the reader. Declining the walk back returns them exactly there,
   *  rather than to the Home page a plain wizard close would rewind to. Null when the door
   *  kept the wizard open (export), where there is nothing to walk back from. */
  landedOn: Route | null;
}

/**
 * THE WALK JUST FINISHED — everything needed to step back INTO it (
 * https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/back-to-the-wizard.md, entry point 1: "the draft is still in memory; this is undo the last
 * screen").
 *
 * The wizard wipes itself on every open ("Fresh wizard every time"), which is right for the
 * door marked "+ New graphic" and wrong for a reader who pressed Back thirty seconds after
 * creating and wanted the animation step. So the walk is snapshotted at the moment a door
 * closes the wizard, and offered back — behind a warning — when the reader returns to a STEP
 * url rather than to the wizard's front page.
 */
export interface FinishedWalk {
  draft: WizardDraft;
  mode: WizardMode;
  step: number;
  browseFilters: BrowseFilters;
  aiResult: AiResultState;
  aiThread: AiThread | null;
  importedFile: ImportedTemplateResult | null;
  contextProductionId: string | null;
  brandChoices: BrandChoice[];
  brandId: string | null;
  /** What the walk produced, filled in once the door has finished doing it. */
  made: MadeGraphic | null;
}

/** The walk the last door closed the wizard on, and the graphic this stretch of wizard made. */
export interface WalkMemory {
  finished: FinishedWalk | null;
  /** Set by the door that made it and carried across a walk-back until the wizard is opened
   *  fresh. It is what stops a second pass down the same walk minting a second library record
   *  under the same name, whether it came from a resume or from pressing Export twice. */
  made: MadeGraphic | null;
}

export interface WalkState {
  draft: WizardDraft;
  mode: WizardMode;
  step: number;
  /** Browse's facets live here, not in the step, so Back returns with them intact. */
  browseFilters: BrowseFilters;
  aiResult: AiResultState;
  /** The Create-with-AI conversation as it stands, committed to the created project. */
  aiThread: AiThread | null;
  /** A finished template file dropped on the Import graphic step — parsed, never rebuilt. */
  importedFile: ImportedTemplateResult | null;
  importedFileError: string | null;
  /** The production this open is FOR (one-shot from `pendingProductionId`; Finish preselects it). */
  contextProductionId: string | null;
  /** What the footer chooser offers, and which is chosen (null is None). The brand in force is
   *  DERIVED from the two (`brandOf`): two states saying which brand is in force could disagree. */
  brandChoices: BrandChoice[];
  brandId: string | null;
  /** The kit half of the Browse step, held here for the reason `browseFilters` is. */
  buildMode: BuildMode;
  kitPack: TemplatePack | null;
  kitSelected: string[];
  /** The kit under construction: its presence makes every step below one graphic OF A SET. */
  kit: KitPlan | null;
  /** The draft this walk started from, so "has work" means the reader changed something. */
  startDraft: WizardDraft | null;
  /** The furthest step reached since the walk's mode last changed: where Continue returns. Not
   *  the step at close, which browser Back has already rewound through every step to Entry. */
  lastStep: number;
}

/** The kit picker and the kit, back to "one graphic". */
const noKit = (): Pick<WalkState, 'buildMode' | 'kitPack' | 'kitSelected' | 'kit'> => ({
  buildMode: 'one',
  kitPack: null,
  kitSelected: [],
  kit: null,
});

/** A closed wizard's walk, before its first open. */
export function emptyWalk(): WalkState {
  return {
    draft: initialDraft(),
    mode: 'template',
    step: 0,
    browseFilters: NO_BROWSE_FILTERS,
    aiResult: null,
    aiThread: null,
    importedFile: null,
    importedFileError: null,
    contextProductionId: null,
    brandChoices: [],
    brandId: null,
    ...noKit(),
    startDraft: null,
    lastStep: 0,
  };
}

/** The brand in force: the chosen entry's, or none. */
export function brandOf(state: WalkState): ProjectBrand | null {
  return state.brandId ? state.brandChoices.find((b) => b.id === state.brandId)?.brand ?? null : null;
}

/**
 * The kit the walk on screen is building. A kit is the template walk's: when the reader goes back
 * to Entry and into another walk, the kit is HELD, untouched and acting on nothing, and it is
 * there again when they come back to the template walk. Only the close control's rewind, a fresh
 * open and a restore end it, as they end every other part of a walk.
 */
export function activeKit(state: WalkState): KitPlan | null {
  return state.mode === 'template' ? state.kit : null;
}

/** Is `step` one of the steps that edit the open kit graphic (the kit walk's Fields to Animation)?
 *  Only on the template walk. */
export function isKitEditStep(state: WalkState, step: number): boolean {
  return state.mode === 'template' && step >= 2 && step <= walkOf('template', true).animStep;
}

/** The kit with the open graphic's answers recorded - what every move away from it keeps. */
export function committedKit(state: WalkState, plan: KitPlan): KitPlan {
  return isKitEditStep(state, state.step) ? commitKitGraphic(plan, state.draft) : plan;
}

/**
 * Picking a design, from whichever door: a Browse card, the images walk's Template step, or a
 * `#/new/<id>` link. One patch, so the three cannot disagree. The logo, motion and steps
 * decisions belong to the picked design, so a new pick re-asks them rather than carrying the
 * last answer across; the chosen brand carries its look into every new graphic.
 */
export function pickPatch(variant: TemplateVariant, brand: ProjectBrand | null): DraftPatch {
  return {
    category: variant.category,
    variantId: variant.id,
    lines: variant.suggestedLines.map((l) => ({ ...l })),
    zone: null,
    logoEnabled: null,
    animation: { presetId: null, outPresetId: null, steps: null },
    ...brandOrClearPatch(brand),
  };
}

/**
 * Has the reader done anything in this walk that a fresh open would wipe? The same rule as the
 * working document's guard (saveActions `hasUnsavedWork`): compared with what the walk started
 * from. The project format alone is not work - a rewind keeps it over a discarded draft, and it
 * is one select to set again. A walk a door already made something of has nothing to lose.
 */
export function walkHasWork(state: WalkState, made: MadeGraphic | null = null): boolean {
  if (made) return false;
  if (state.aiResult || state.importedFile || state.kit || state.kitPack) return true;
  const base = state.startDraft ?? initialDraft();
  const { aspectId, resolutionId, fps, formatTouched } = base;
  return JSON.stringify({ ...state.draft, aspectId, resolutionId, fps, formatTouched }) !== JSON.stringify(base);
}

/** The walk as a door is about to act on it, for the reader to step back into. */
export function snapshotWalk(state: WalkState): FinishedWalk {
  return {
    draft: state.draft,
    mode: state.mode,
    step: state.step,
    browseFilters: state.browseFilters,
    aiResult: state.aiResult,
    aiThread: state.aiThread,
    importedFile: state.importedFile,
    contextProductionId: state.contextProductionId,
    brandChoices: state.brandChoices,
    brandId: state.brandId,
    made: null,
  };
}

/** The five ways a walk begins or ends (section 4). */
export type WalkIntent =
  /** The guard's Continue over a walk the reader LEFT: back on the furthest step it reached. */
  | { kind: 'continue' }
  /** A step URL opened with a finished walk in memory: the reader coming BACK into it. `live` is
   *  the working document's library record now, which the editor door's walk may have gained. */
  | { kind: 'restore'; walk: FinishedWalk; live: { id: string; name: string | null } | null }
  /** Any other open: a fresh walk, on the step the URL names when the template walk has it. */
  | {
      kind: 'fresh';
      routeStep: string | null;
      looks: BrandChoice[];
      productionId: string | null;
      show: Pick<Show, 'name' | 'look' | 'brandId'> | undefined;
    }
  /** The close control or Escape from a working step: back to Entry, the walk discarded. */
  | { kind: 'rewind' }
  /** The wizard closing. `left` is a close it did not make itself (Home, browser Back). */
  | { kind: 'close'; left: boolean; made: MadeGraphic | null };

/** What an intent does beside the record: the screen state and memory the shell keeps (D2). */
export interface Outcome {
  state: WalkState;
  /** The walk memory: kept, forgotten (this walk is over), or put back as a restored walk. */
  memory: 'keep' | 'forget' | WalkMemory;
  /** The walk-back warning: left as it is, taken down, or raised over this walk. */
  resumeAsk: 'keep' | 'clear' | FinishedWalk;
  /** The stretch demo line and the kit's transient UI (its two asks, its production name and
   *  its error line) go with the walk. The kit's busy flag is the save's, in every intent. */
  resetScreen: boolean;
  /** Forget which AI generation a door accepted (a ref, read when the wizard closes). */
  clearAcceptedAi: boolean;
  /** The held-walk flag: cleared on every open, set by a close that left work, else untouched. */
  held: boolean | null;
  /** The step the URL is replaced with: a restored walk shows the step it ENDED on. */
  replaceStep: string | null;
}

/**
 * The furthest step, kept as the shell kept it (one effect over mode and step): a new mode is
 * a new walk, with other steps, and it starts on the step the mode changed on - a dropped file
 * turns the design walk into the file walk without moving the reader.
 */
function reached(prev: WalkState, next: WalkState): WalkState {
  if (next.mode !== prev.mode) return next.lastStep === next.step ? next : { ...next, lastStep: next.step };
  return next.step > next.lastStep ? { ...next, lastStep: next.step } : next;
}

/** `state` with `changes`, or `state` itself when every change is the value already held. */
function settle(state: WalkState, changes: Partial<WalkState>): WalkState {
  const keys = Object.keys(changes) as (keyof WalkState)[];
  return keys.every((k) => Object.is(state[k], changes[k])) ? state : { ...state, ...changes };
}

const outcome = (state: WalkState, parts: Partial<Omit<Outcome, 'state'>>): Outcome => ({
  state,
  memory: 'keep',
  resumeAsk: 'keep',
  resetScreen: false,
  clearAcceptedAi: false,
  held: null,
  replaceStep: null,
  ...parts,
});

/** The five intents of section 4, each with its own keep/clear policy. */
export function transition(state: WalkState, intent: WalkIntent): Outcome {
  switch (intent.kind) {
    case 'continue':
      // Everything is still in state: a closed wizard renders null rather than unmounting, so
      // only the step it was left on is put back.
      return outcome({ ...state, step: state.lastStep }, { held: false });

    case 'restore': {
      const walk = intent.walk;
      // The editor door saves nothing, so its walk recorded no library record. If the reader
      // saved it themselves before coming back, the working document is still linked to that
      // record and this walk should write over it rather than mint a twin under one name.
      let made = walk.made;
      if (made && !made.graphicId && intent.live && intent.live.name === made.name) {
        made = { ...made, graphicId: intent.live.id };
      }
      const back: FinishedWalk = made === walk.made ? walk : { ...walk, made };
      // A walk that ENDED in a production comes back POINTING at it. The warning promises the
      // copy in that rundown is replaced, and Finish's picker defaults to the oldest production
      // when nothing points it anywhere, so a second finish would otherwise append a copy to a
      // show the reader never named.
      const landed = made?.landedOn;
      const next = reached(state, {
        ...state,
        draft: walk.draft,
        mode: walk.mode,
        step: walk.step,
        browseFilters: walk.browseFilters,
        aiResult: walk.aiResult,
        aiThread: walk.aiThread,
        importedFile: walk.importedFile,
        importedFileError: null,
        contextProductionId: landed?.view === 'production' ? landed.id : walk.contextProductionId,
        brandChoices: walk.brandChoices,
        brandId: walk.brandId,
        ...noKit(),
      });
      return outcome(next, {
        memory: { finished: back, made },
        // Nothing is restored silently: re-entering REGENERATES, so the warning naming what that
        // writes over goes up with it.
        resumeAsk: back,
        resetScreen: true,
        held: false,
        // The step the walk ENDED on, not the one the history entry happens to name: leaving the
        // URL on an earlier step would make the rail and the address bar disagree.
        replaceStep: walkOf(walk.mode, false).slugs[walk.step] ?? '',
      });
    }

    case 'fresh': {
      // A `#/new/step/<name>` open starts on the step the URL names - a reload three steps in,
      // or a link somebody was sent. Resolved against the walk this reset installs (template, no
      // kit), the only walk a cold open can be on; a name it does not have degrades to Entry.
      const named = intent.routeStep ? slugIndex(walkOf('template', false), intent.routeStep) : -1;
      const step = named > 0 ? named : 0;
      // Every saved brand, offered by name. NONE is selected: matching is an explicit act. Opened
      // FOR a production, the wizard pre-applies that production's look. The REFERENCE wins over
      // the captured copy (model/shows.ts `brandId`); a production that only ever captured a look
      // is offered it under a synthetic entry, so the chooser names what the graphic is made in.
      let start = initialDraft();
      let brandChoices = intent.looks;
      let brandId: string | null = null;
      const show = intent.productionId ? intent.show : undefined;
      const namedBrand = show?.brandId ? intent.looks.find((b) => b.id === show.brandId) : undefined;
      const chosen: BrandChoice | null =
        namedBrand ?? (show?.look ? { id: PRODUCTION_LOOK_ID, name: `${show.name} (this production's look)`, brand: show.look } : null);
      if (chosen) {
        if (!namedBrand) brandChoices = [chosen, ...intent.looks];
        brandId = chosen.id;
        start = mergeDraft(start, brandPatch(chosen.brand));
      }
      return outcome(
        {
          ...state,
          draft: start,
          mode: 'template',
          step,
          browseFilters: NO_BROWSE_FILTERS,
          aiResult: null,
          aiThread: null,
          // A dropped template file is this walk's material like the draft: kept, it held an
          // empty walk (`walkHasWork` counts it) and the guard asked about nothing.
          importedFile: null,
          importedFileError: null,
          contextProductionId: intent.productionId,
          brandChoices,
          brandId,
          ...noKit(),
          startDraft: start,
          lastStep: step,
        },
        // A plain open discards a finished walk: only a step URL offers it back.
        { memory: 'forget', resumeAsk: 'clear', resetScreen: true, clearAcceptedAi: true, held: false },
      );
    }

    case 'rewind': {
      // The draft is DISCARDED except the PROJECT FORMAT, a property of the thing being made and
      // not of the route taken to make it. A rewind is a fresh start: what it keeps is not work,
      // and nor is a brand the open had pre-applied, which it drops - the chooser WRITES the
      // brand into the draft, so leaving it selected over a cleared draft would name a look the
      // graphic no longer carries. The production the wizard opened for stays its destination.
      const { aspectId, resolutionId, fps, formatTouched } = state.draft;
      return outcome(
        {
          ...state,
          draft: { ...initialDraft(), aspectId, resolutionId, fps, formatTouched },
          mode: 'template',
          step: 0,
          browseFilters: NO_BROWSE_FILTERS,
          aiResult: null,
          aiThread: null,
          importedFile: null,
          importedFileError: null,
          brandId: null,
          ...noKit(),
          startDraft: null,
          lastStep: 0,
        },
        // THE WALK THIS REWIND DISCARDS IS NOT A WALK TO COME BACK TO: a graphic built after it
        // under the same default name would otherwise write OVER the record the rewound walk made.
        { memory: 'forget', resetScreen: true },
      );
    }

    case 'close':
      // Left with work in it? Then hold it. And back to Entry on close too: this component stays
      // mounted and renders null when closed, so a stale step would be pushed into the URL by
      // the route sync at the NEXT open.
      return outcome({ ...state, step: 0 }, { held: intent.left && walkHasWork(state, intent.made) });
  }
}

/** The shell's moves over the walk. */
export type WalkAction =
  | { type: 'transition'; intent: WalkIntent }
  /** To another step of this walk. */
  | { type: 'go'; step: number }
  /** Into another walk (a mode), on `step` or where the reader stands. */
  | { type: 'walk'; mode: WizardMode; step?: number }
  | { type: 'patch'; patch: DraftPatch }
  | { type: 'pickDesign'; variant: TemplateVariant }
  /** A `#/new/<id>` link: a fresh walk's draft with that design picked, straight on Fields. */
  | { type: 'deepLink'; variant: TemplateVariant }
  | { type: 'chooseBrand'; id: string | null }
  /** A React state action, so Browse's chip toggles compose as functional updates. */
  | { type: 'filters'; update: BrowseFilters | ((prev: BrowseFilters) => BrowseFilters) }
  | { type: 'ai'; result?: AiResultState; thread?: AiThread | null }
  | { type: 'file'; file?: ImportedTemplateResult | null; error?: string | null }
  | { type: 'buildMode'; buildMode: BuildMode }
  | { type: 'kitPick'; pack?: TemplatePack | null; selected: string[] }
  /** The kit plan, and with it the draft in hand and the step, when the move changes them. */
  | { type: 'kit'; kit: KitPlan | null; draft?: WizardDraft; step?: number };

export function reduce(state: WalkState, action: WalkAction): WalkState {
  switch (action.type) {
    case 'transition':
      return transition(state, action.intent).state;
    case 'go':
      return reached(state, { ...state, step: action.step });
    case 'walk':
      return reached(state, { ...state, mode: action.mode, step: action.step ?? state.step });
    case 'patch':
      return { ...state, draft: mergeDraft(state.draft, action.patch) };
    case 'pickDesign':
      return { ...state, draft: mergeDraft(state.draft, pickPatch(action.variant, brandOf(state))) };
    case 'deepLink': {
      // The link chose this design, not the reader in this walk: it is where the walk starts. It
      // carries the brand in force exactly as a Browse pick does.
      const start = mergeDraft(initialDraft(), pickPatch(action.variant, brandOf(state)));
      return reached(state, {
        ...state,
        mode: 'template',
        draft: start,
        startDraft: start,
        step: stepIndex(walkOf('template', false), 'fields'),
      });
    }
    case 'chooseBrand': {
      // A brand writes exactly the fields None clears, so switching needs no unwinding pass.
      const next = action.id ? state.brandChoices.find((b) => b.id === action.id)?.brand ?? null : null;
      const brandId = next ? action.id : null;
      // THE BRAND REACHES EVERY GRAPHIC OF A KIT, not only the one on screen: the set is built up
      // front, so every graphic's answers take it - and None hands each one back the kit's own
      // palette rather than no palette at all (wizard/kitPlan.ts).
      // A kit held while another walk is on screen takes the brand too, and the draft in hand
      // stays that walk's.
      const draft = mergeDraft(state.draft, next ? brandPatch(next) : brandClearPatch());
      if (state.kit && state.buildMode === 'kit') {
        const open = activeKit(state);
        const plan = rebrandKit(committedKit(state, state.kit), next ? brandPatch(next) : null);
        return { ...state, brandId, kit: plan, draft: open ? plan.drafts[plan.current] : draft };
      }
      return { ...state, brandId, draft };
    }
    // The plain setters keep the record when nothing changed, as a React state setter bails out:
    // AiStep reports its thread on mount, and that must not cost the shell a render.
    case 'filters':
      return settle(state, {
        browseFilters: typeof action.update === 'function' ? action.update(state.browseFilters) : action.update,
      });
    case 'ai':
      return settle(state, {
        ...(action.result !== undefined ? { aiResult: action.result } : {}),
        ...(action.thread !== undefined ? { aiThread: action.thread } : {}),
      });
    case 'file':
      return settle(state, {
        ...(action.file !== undefined ? { importedFile: action.file } : {}),
        ...(action.error !== undefined ? { importedFileError: action.error } : {}),
      });
    case 'buildMode':
      return settle(state, { buildMode: action.buildMode });
    case 'kitPick':
      return settle(state, { ...(action.pack !== undefined ? { kitPack: action.pack } : {}), kitSelected: action.selected });
    case 'kit':
      return reached(state, {
        ...state,
        kit: action.kit,
        ...(action.draft ? { draft: action.draft } : {}),
        ...(action.step !== undefined ? { step: action.step } : {}),
      });
  }
}

/** Snapshot the walk before a door acts on it, so the reader can step back into it. */
export function rememberWalk(memory: WalkMemory, state: WalkState): void {
  memory.finished = snapshotWalk(state);
}

/** What the door actually produced, once it has: the warning names it, and a second pass down
 *  the same walk writes over it. */
export function noteMade(memory: WalkMemory, made: MadeGraphic): void {
  if (memory.finished) memory.finished.made = made;
  memory.made = made;
}

/** The library as the save sees it: the name index, the effect rule, and the two writes. */
export interface LibraryIo {
  index(): LibraryNameEntry[];
  effect: typeof librarySaveEffect;
  /** Link the working document to record `id`, so the next save writes over it. */
  linkTo(id: string): void;
  /** Save the working document over its linked record, under `name`. */
  saveCurrent(name: string): Promise<'saved' | 'needs-name' | 'failed'>;
  /** Mint a new record under `name`. */
  saveAs(name: string): Promise<{ ok: boolean; error: string | null }>;
}

/**
 * Save the built graphic — into the record THIS WALK already made, over the record that already
 * carries this name, or as a new one (spec R2). It returns a failure and never throws one.
 *
 * A saved graphic's name is its identity. `saveGraphicAs` always mints, so without this the
 * wizard is a duplicate factory: the walk that made "Match Score" and the walk that re-imports
 * the student's second version of it left TWO records under one name, and the production's pool
 * copy — which replaces by name — quietly re-pointed its back-link at the new one, detaching the
 * graphic the cues were prepared against. Measured 2026-09-08 through all four import doors
 * (e2e/import-name-collision.spec.ts). Writing over the record keeps its id, so every production
 * pooling it keeps pointing at the same graphic.
 *
 * It is NOT a silent overwrite: the production door confirms every press, and the Finish step's
 * warning says which of the four things this one does before it happens — both read
 * `librarySaveEffect`, so the sentence and the write cannot disagree.
 *
 * A RENAME mid-walk moves the record THIS WALK MADE onto the new name. It never resolves the new
 * name against the library, because that reaches across to whatever graphic already carries it
 * and overwrites artwork this walk never opened (`librarySaveEffect` carries the reasoning and
 * the measurement). Ending the walk with the ✕ is what says "a different graphic": the rewind
 * forgets the record, and the next save resolves by name again.
 */
export async function saveBuiltGraphic(
  memory: WalkMemory,
  name: string,
  lib: LibraryIo,
): Promise<{ ok: boolean; error: string | null }> {
  const effect = lib.effect(lib.index(), name, memory.made?.graphicId ?? null);
  const over = effect.targetId;
  if (!over) return lib.saveAs(name);
  lib.linkTo(over);
  const result = await lib.saveCurrent(name);
  if (result === 'saved') return { ok: true, error: null };
  // 'needs-name' means the record went between the check above and the write (deleted on
  // another device or tab). Minting is then the right answer, not an error - the work is what
  // matters, and there is no longer anything to write over.
  if (result === 'needs-name') return lib.saveAs(name);
  return {
    ok: false,
    error:
      effect.kind === 'over'
        ? `The graphic could not be saved over the “${name}” already in your library.`
        : `“${name}” could not be saved to your library.`,
  };
}
