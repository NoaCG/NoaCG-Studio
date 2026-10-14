/**
 * THE WIZARD OPENING AND CLOSING, as IO only (docs/work-specs/wizard-structure/spec.md phase S5).
 *
 * The decision of what an open or a close does to the walk is `transition`'s (walkState.ts),
 * tested in Node. This hook reads what that decision needs from the studio - the route, the
 * guard's one-shot Continue, the production a door opened the wizard for, the saved looks, the
 * working document's record - names the intent, dispatches it once, and carries out the parts of
 * the outcome that live outside the walk record: the walk memory, the walk-back warning, the
 * screen state, the held-walk flag and the URL.
 */
import { useEffect, useRef, type Dispatch, type MutableRefObject } from 'react';
import { useRouter } from '../../../app/router';
import { graphicById } from '../../../model/library';
import { loadLooks } from '../../../model/packets';
import { loadShows } from '../../../model/shows';
import type { TemplateVariant } from '../../../model/wizard';
import { useSaveUi } from '../../../store/saveActions';
import { useTemplateStore } from '../../../store/templateStore';
import { transition, type FinishedWalk, type Outcome, type WalkAction, type WalkIntent, type WalkMemory, type WalkState } from './walkState';

export interface WalkLifecycle {
  open: boolean;
  state: WalkState;
  dispatch: Dispatch<WalkAction>;
  memory: MutableRefObject<WalkMemory>;
  /** True when the wizard closed ITSELF (a door, ✕ on Entry, a declined walk-back): a close it
   *  did not make is the reader LEAVING, and a walk left with work in it is held. */
  closedByWizard: MutableRefObject<boolean>;
  /** The catalog once loaded (a `#/new/<id>` link resolves through it), else null. */
  catalog: { variantById(id: string): TemplateVariant | undefined } | null;
  /** The one-shot design a `#/new/<id>` link asked for. */
  pendingDesignId: string | null;
  /** The screen state an intent resets beside the walk (the stretch demo, the kit's asks, its
   *  production name and error line), the accepted AI generation, and the walk-back warning. */
  resetScreen(): void;
  clearAcceptedAi(): void;
  setResumeAsk(walk: FinishedWalk | null): void;
}

/** Runs the open and close of the wizard; returns the rewind, the one intent a control asks. */
export function useWalkLifecycle(args: WalkLifecycle): { rewind(): void } {
  // The open effect keeps its `[open]` dependencies rather than re-running on every keystroke,
  // so it reads the walk as it stands through this ref.
  const latest = useRef(args);
  latest.current = args;

  const run = (intent: WalkIntent): Outcome => {
    const { state, dispatch, memory, resetScreen, clearAcceptedAi, setResumeAsk } = latest.current;
    const out = transition(state, intent);
    dispatch({ type: 'transition', intent });
    if (out.memory === 'forget') memory.current = { finished: null, made: null };
    else if (out.memory !== 'keep') memory.current = out.memory;
    if (out.resumeAsk === 'clear') setResumeAsk(null);
    else if (out.resumeAsk !== 'keep') setResumeAsk(out.resumeAsk);
    if (out.resetScreen) resetScreen();
    if (out.clearAcceptedAi) clearAcceptedAi();
    if (out.held !== null) useSaveUi.setState({ heldWalk: out.held });
    return out;
  };

  const { open, dispatch, catalog, pendingDesignId } = args;
  useEffect(() => {
    const { memory, closedByWizard } = latest.current;
    if (!open) {
      const left = !closedByWizard.current;
      closedByWizard.current = false;
      run({ kind: 'close', left, made: memory.current.made });
      return;
    }
    closedByWizard.current = false;
    const { resumeWalk } = useSaveUi.getState();
    useSaveUi.setState({ resumeWalk: false });
    if (resumeWalk) {
      run({ kind: 'continue' });
      return;
    }
    // A re-open onto a STEP url with a finished walk in memory is the reader coming BACK: browser
    // Back off the production page (or the editor) lands on the step entry the walk itself
    // pushed. "+ New graphic" goes to the plain `#/new`, which is how the two are told apart.
    const route = useRouter.getState().route;
    const walk = memory.current.finished;
    if (walk && route.view === 'new' && route.step) {
      const id = useTemplateStore.getState().saved.graphicId;
      const out = run({ kind: 'restore', walk, live: id ? { id, name: graphicById(id)?.name ?? null } : null });
      if (out.replaceStep !== null) useRouter.getState().replace({ view: 'new', step: out.replaceStep });
      return;
    }
    // PRODUCTION CONTEXT: opened FOR a production (its page's "+ New graphic"). One-shot, like
    // `pendingDesignId`.
    const productionId = useTemplateStore.getState().pendingProductionId;
    useTemplateStore.setState({ pendingProductionId: null });
    run({
      kind: 'fresh',
      routeStep: route.view === 'new' ? route.step ?? null : null,
      looks: loadLooks().map((l) => ({ id: l.id, name: l.name, brand: l.brand })),
      productionId,
      show: productionId ? loadShows().find((s) => s.id === productionId) : undefined,
    });
    // `run` reads everything through `latest`, so the effect runs on `open` alone.
  }, [open]);

  // A `#/new/<designId>` deep link (docs/PRERENDER.md's template-page CTA) preselects that
  // catalog design and drops straight to Fields WITHOUT creating a project; Finish is still the
  // only door that does. Keyed on `pendingDesignId` itself because a first-ever visit opens the
  // wizard by default before the router's `openGallery(designId)` reaches the store, so `open`
  // never flips in that race. It clears the one-shot the moment it runs, so it fires once per
  // link. Imported designs create through their own setup walk, never through a pick, and an id
  // that does not resolve leaves the wizard where the open put it: Entry.
  useEffect(() => {
    if (!open || !pendingDesignId || !catalog) return;
    const pending = catalog.variantById(pendingDesignId);
    useTemplateStore.setState({ pendingDesignId: null });
    if (!pending || pending.category === 'imported-design') return;
    dispatch({ type: 'deepLink', variant: pending });
  }, [open, pendingDesignId, catalog, dispatch]);

  return { rewind: () => void run({ kind: 'rewind' }) };
}
