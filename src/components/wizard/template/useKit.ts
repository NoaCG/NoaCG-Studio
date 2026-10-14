/**
 * THE KIT, as operations over the walk (docs/work-specs/wizard-structure/spec.md D6).
 *
 * A kit is BUILT when it starts: leaving the Kit step creates every ticked graphic in the kit's
 * Style and lands on the kit's Finish step, which is its HUB - every graphic laid out, any of
 * them one click from editing, and the production doors below. Editing is not a walk: the
 * ordinary Fields/Style/Animation steps configure whichever graphic is open, the tray jumps
 * between graphics on the same step, and each graphic keeps its own answers (wizard/kitPlan.ts).
 * `kit.built` is always the whole set - the tray, the hub and the save all read it.
 *
 * The kit's picker and plan are the walk's (shell/walkState.ts); this hook owns only what is on
 * screen for a moment: the two questions a kit asks, the production name on its hub, and the set
 * save's busy and error lines. Where a move goes is decided by the pure functions below, tested
 * in Node (scripts/wizard-kit-moves.test.mjs); the hook dispatches what they answer.
 */
import { useCallback, useState, type Dispatch } from 'react';
import type { ProjectBrand } from '../../../model/brand';
import type { KitItem } from '../../../templates/kit';
import type { TemplatePack } from '../../../templates/packs';
import { brandPatch, type DraftPatch } from '../draft';
import {
  applyStyleToKit,
  buildKit,
  commitKitGraphic,
  defaultSelectionFor,
  kitKeys,
  reconcileKit,
} from '../kitPlan';
import type { makeDoors, SaveSet } from '../shell/doors';
import { activeKit, committedKit, isKitEditStep, type WalkAction, type WalkState } from '../shell/walkState';
import { stepAfter, type WalkSpec } from '../shell/walks';
import type { BuildMode } from '../steps/BrowseStep';

/** Where Back (-1) or Next (+1) goes. Forward and Back mean something different for a kit at
 *  three points: leaving the Kit step BUILDS the set and opens the hub ('build'); Back from a
 *  graphic's first editing step and Next from its last both return to the hub, because a kit is
 *  edited graphic by graphic in any order, not walked; Back from the hub is the Kit step, whose
 *  contents are what a reader goes back to change. Everything else is an ordinary step. */
export function kitStepTarget(state: WalkState, walk: WalkSpec, delta: number): number | 'build' {
  const { step } = state;
  const kit = activeKit(state);
  if (delta > 0 && state.mode === 'template' && state.buildMode === 'kit' && step === 1) return 'build';
  if (kit && ((delta < 0 && step === 2) || (delta > 0 && step === walk.animStep))) return walk.finishStep;
  if (kit && delta < 0 && step === walk.finishStep) return 1;
  return stepAfter(walk, step, delta);
}

/**
 * THE ONE WAY A KIT CHANGES STEP. Leaving the editing steps records the graphic in hand first,
 * so the hub, the Kit step and the save always see it as it was left.
 *
 * FORWARD FROM THE KIT STEP means the picker's answer, whichever control was used: a rail click
 * has to build or re-shape the set exactly as Next does ('build'), or ticks made there are
 * silently dropped. And a kit left for ONE graphic is over - its tray and hub would otherwise
 * stay wrapped around a design that is not part of it.
 */
export function kitMove(state: WalkState, target: number): WalkAction | 'build' {
  const { step } = state;
  const kit = activeKit(state);
  if (step === 1 && target > 1) return state.buildMode === 'one' ? { type: 'kit', kit: null, step: target } : 'build';
  const leaving = kit && isKitEditStep(state, step) && !isKitEditStep(state, target);
  return { type: 'kit', kit: leaving ? commitKitGraphic(kit, state.draft) : kit, step: target };
}

/**
 * The set `items` of `pack`, built around the draft in hand and opened on `target`. The same kit
 * coming back from the Kit step keeps every graphic it still holds exactly as edited
 * (`reconcileKit`); a different kit starts over (`fresh`). The kit's palette leads each graphic
 * it is drawn for, and the footer brand outranks it. The draft in hand becomes the open
 * graphic's, so a rail click into Fields from the hub opens a real graphic.
 */
export function kitBuilt(
  state: WalkState,
  pack: TemplatePack,
  items: KitItem[],
  brand: DraftPatch | null,
  target: number,
): { action: WalkAction; fresh: boolean } {
  const kit = activeKit(state);
  const same = !!kit && kit.pack.id === pack.id;
  const plan = kit && same ? reconcileKit(kit, items, state.draft, brand) : buildKit(pack, items, state.draft, brand);
  return { action: { type: 'kit', kit: plan, draft: plan.drafts[plan.current], step: target }, fresh: !same };
}

/** What the footer's buttons say where a kit gives them another meaning, else null. */
export function kitLabels(state: WalkState, walk: WalkSpec): { back: string | null; next: string | null } {
  const { kitPack, step } = state;
  const kit = activeKit(state);
  let next: string | null = null;
  if (state.mode === 'template' && state.buildMode === 'kit' && step === 1 && kitPack) {
    const n = state.kitSelected.length;
    next = kit && kit.pack.id === kitPack.id ? 'Back to the kit →' : `Build ${n} graphic${n === 1 ? '' : 's'} →`;
  } else if (kit && step === walk.animStep) {
    next = 'Done →';
  }
  return { back: kit && step === 2 ? '← All graphics' : null, next };
}

export interface KitArgs {
  state: WalkState;
  dispatch: Dispatch<WalkAction>;
  /** The walk on screen. */
  walk: WalkSpec;
  /** The footer brand in force, for graphics built now. */
  brand: ProjectBrand | null;
}

/** The kit's operations and its transient UI. Called on every render, the wizard closed too. */
export function useKit({ state, dispatch, walk, brand }: KitArgs) {
  /** The two questions a kit asks before acting: switching to another kit over an edited one,
   *  and applying the open graphic's Style to the rest. Both answer in `KitConfirms`. */
  const [switchAsk, setSwitchAsk] = useState(false);
  const [applyAsk, setApplyAsk] = useState(false);
  /** The production's name on the hub (the graphic name field's counterpart). */
  const [productionName, setProductionName] = useState('');
  // Saving a set writes N library records plus a production, so it reports progress and any
  // failure reason inline rather than failing silently. A Pro package's set save shares them.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** What an open, a rewind and a restore reset beside the walk. The busy line is the save's,
   *  cleared by its own end in every intent. */
  const resetScreen = useCallback(() => {
    setSwitchAsk(false);
    setApplyAsk(false);
    setProductionName('');
    setError(null);
  }, []);
  // Stable, as the shell held them: BrowseStep's chips report through them.
  const onBuildMode = useCallback((next: BuildMode) => dispatch({ type: 'buildMode', buildMode: next }), [dispatch]);
  const onKitSelected = useCallback((selected: string[]) => dispatch({ type: 'kitPick', selected }), [dispatch]);

  // A kit acts only in the template walk; another walk holds it untouched.
  const kit = activeKit(state);
  const { kitPack, kitSelected, step } = state;

  const build = async (pack: TemplatePack, keys: string[], target: number) => {
    // The kit module is already loaded by the Kit step that asks for this, so this is a tick.
    const { kitSelection } = await import('../../../templates/kit');
    const items = kitSelection(pack, keys);
    if (items.length === 0) return;
    const { action, fresh } = kitBuilt(state, pack, items, brand ? brandPatch(brand) : null, target);
    if (fresh) setProductionName('');
    setError(null);
    dispatch(action);
  };

  /** Leave the Kit step forward to `target`. Switching to ANOTHER kit discards the edited one,
   *  so that is asked first (and the answer lands on the hub). */
  const buildFromKitStep = (target: number) => {
    if (!kitPack) return;
    if (kit && kit.pack.id !== kitPack.id && kit.edited) setSwitchAsk(true);
    else void build(kitPack, kitSelected, target);
  };

  /** Every move to a step, the shell's included: a kit's goes through `kitMove`. */
  const moveTo = (target: number) => {
    const move = kit ? kitMove(state, target) : ({ type: 'go', step: target } as const);
    if (move === 'build') buildFromKitStep(target);
    else dispatch(move);
  };

  /** Open kit graphic `index` on `target` (Fields by default, or the step already on screen when
   *  the tray jumps), recording the one being left. */
  const openGraphic = (index: number, target: number = 2) => {
    if (!kit) return;
    const plan = committedKit(state, kit);
    dispatch({ type: 'kit', kit: { ...plan, current: index }, draft: plan.drafts[index], step: target });
  };

  const labels = kitLabels(state, walk);

  return {
    resetScreen,
    /** The kit picker's half of the Browse step. */
    picker: {
      buildMode: state.buildMode,
      onBuildMode,
      kitPack,
      kitSelected,
      // A new kit brings its OWN starter. Picking the kit that is already built brings back
      // the contents it was built with, not the starter again.
      onKitPack: (pack: TemplatePack) =>
        dispatch({ type: 'kitPick', pack, selected: kit && kit.pack.id === pack.id ? kitKeys(kit) : defaultSelectionFor(pack) }),
      onKitSelected,
    },
    moveTo,
    /** Back (-1) or Next (+1), as a kit means them. */
    stepBy: (delta: number) => {
      const target = kitStepTarget(state, walk, delta);
      if (target === 'build') buildFromKitStep(walk.finishStep);
      else moveTo(target);
    },
    backLabel: labels.back,
    nextLabel: labels.next,
    /** The tray on the open graphic's editing steps; the hub lays the whole set out itself. */
    tray:
      kit && isKitEditStep(state, step)
        ? {
            plan: kit,
            onOpen: (index: number) => openGraphic(index, step),
            onHub: () => moveTo(walk.finishStep),
            onApplyStyle: kit.items.length > 1 ? () => setApplyAsk(true) : undefined,
          }
        : null,
    /** The hub's own half of KitFinishStep; the shell adds the productions and the doors. */
    hub: kit
      ? {
          name: productionName,
          namePlaceholder: kit.pack.name,
          onName: setProductionName,
          built: kit.built,
          onOpen: (index: number) => openGraphic(index),
          onEditContents: () => moveTo(1),
          busy,
          error,
        }
      : null,
    /**
     * SAVE THE WHOLE SET: every graphic to the library, pooled into one new PRODUCTION - the unit
     * that airs (docs/GOALS_ARCHIVE.md "Student release" step 3) - through the doors' `saveSet`,
     * which gates every member first.
     */
    save: (saveSet: ReturnType<typeof makeDoors>['saveSet']): SaveSet => async (dest) =>
      kit ? saveSet(committedKit(state, kit).built, kit.pack.name, dest, 'kit') : null,
    /** The set doors' busy and error lines, which a Pro package's set save shares. */
    busy,
    error,
    setBusy,
    setError,
    /** The switch question's answers: start the new kit, or keep the edited one, which puts the
     *  picker back on it as it was built. */
    switchAsk: switchAsk && kit && kitPack ? { from: kit.pack.name, to: kitPack.name } : null,
    confirmSwitch: () => {
      setSwitchAsk(false);
      if (kitPack) void build(kitPack, kitSelected, walk.finishStep);
    },
    keepKit: () => {
      setSwitchAsk(false);
      if (kit) dispatch({ type: 'kitPick', pack: kit.pack, selected: kitKeys(kit) });
    },
    /** "Apply this Style to all": the open graphic's Style reaches every other graphic in the kit
     *  through the `:root` contract (wizard/kitPlan.ts `applyStyleToKit`). */
    applyAsk: applyAsk && kit ? { kit: kit.pack.name, others: kit.items.length - 1 } : null,
    applyStyle: () => {
      setApplyAsk(false);
      if (kit) dispatch({ type: 'kit', kit: applyStyleToKit(committedKit(state, kit), state.draft) });
    },
    cancelApply: () => setApplyAsk(false),
  };
}

export type KitOps = ReturnType<typeof useKit>;
