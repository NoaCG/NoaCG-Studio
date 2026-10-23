// ONE DISPATCHER FOR THE VERBS, from a key, from the button that wears the key, or from a hardware
// panel's key: what a press does, decided from the render's view (./verbView.ts) and nothing else
// (production-page refactor spec §2 and §4.2, phase 12). The page carries the decision out with the
// verbs of ./graphicVerbs.ts, the folder module and the selection it owns.
//
// SPACE IS THE TOGGLE, and so is the button under it (acceptance pass 2026-08-06; operator feedback
// 2026-08-07): the selected cue goes on, and the same control takes it off. RE-TAKE is a secondary
// action with its own key. `0` means Out from either state. In 'preview-then-take' mode a cue taken
// off air lands on PREVIEW, and a cue not yet on PREVIEW goes there first, airing nothing
// (docs/PLAYOUT_DASHBOARD.md §2; the decision is ./spaceMode.ts). The keyboard's map from a key to a
// verb is components/playoutKeys.ts.
//
// The rundown's editing keys (copy, cut, paste, Escape, extend, folders) are the editor's own
// (components/home/useRundownAuthoring.ts `editVerb`), which the page asks before this; none of
// them is a verb here.
//
// Moved out of ProductionPage's `onVerb` with its order and rules unchanged. Runtime imports carry
// `.ts` so Node resolves them (scripts/verb-dispatch.test.mjs); everything else is a type.

import type { PlayoutItem, ShowCue } from '../model/shows';
import type { RundownRow } from '../model/rundownRows';
import type { ServerOwnership, ServerTiming } from './serverState';
import type { VerbView } from './verbView';
import type { FolderStep } from './folderStep';
import { rowTestId } from '../model/rundownRows.ts';
import { directCue } from '../model/cueShortcuts.ts';
import { pauseTarget } from './serverState.ts';

/** What the dispatcher reads besides the verb bar's view: the rundown as drawn, the held folder, and
 *  the checks a per-row key asks at the press. */
export interface DispatchView extends VerbView {
  cues: readonly ShowCue[];
  items: readonly PlayoutItem[];
  /** The rundown's rows as drawn, and every cue id to the row that shows it. */
  rows: readonly RundownRow[];
  rowOf: ReadonlyMap<string, string>;
  /** The held folder's id, and its step when it is a One-by-one folder. */
  folderId: string | null;
  step: FolderStep | null;
  /** A cue is on air now, from the store as it stands and the live map as last drawn. */
  onAirNow: (cue: ShowCue) => boolean;
  /** Why a cue's own Take would not go, or null (a step's refusal: control/takeBlockers.ts). */
  stepBlocked: (cue: ShowCue) => string | null;
  /** Why a direct trigger of a cue would not go, or null. */
  directBlocked: (cue: ShowCue) => string | null;
  /** The server store as it stands at the press: what `P` pauses. */
  ownership: () => ServerOwnership;
  timing: () => ServerTiming;
}

/** A verb (components/playoutKeys.ts `PlayoutVerb`, which this layer does not import) and how it
 *  was pressed: `repeat` for a key's auto-repeat, `cue` for the row or clip a panel's key named. */
export type VerbKey = string;
export interface Press {
  repeat: boolean;
  cue?: string;
}

/** What one press does. */
export type VerbDecision =
  | { do: 'none' }
  | { do: 'note'; text: string }
  /** A cue's direct trigger: sent as a server Take or a graphic Take, or refused with `refused`. */
  | { do: 'trigger'; cue: ShowCue; label: string; refused: string | null }
  | { do: 'hold' }
  | { do: 'all-out' }
  /** Move the cursor to a row: a folder header holds the folder; airs nothing. */
  | { do: 'select-folder'; folderId: string; rowId: string; reveal: string }
  | { do: 'select-cue'; cueId: string; reveal: string }
  /** Take a cue off as a step does (a panel's `take-cue` on a cue that is on air). */
  | { do: 'take-off'; cue: ShowCue }
  | { do: 'take'; cue: ShowCue }
  | { do: 'folder-step' | 'folder-out' | 'folder-take'; folderId: string }
  /** SPACE on a cue on air: Out, and it lands on PREVIEW. */
  | { do: 'out-and-stage'; cueId: string }
  | { do: 'stage'; cueId: string }
  | { do: 'update' }
  | { do: 'next' }
  | { do: 'out' }
  | { do: 'server'; cue: ShowCue; verb: 'pause' | 'resume'; label: 'Pause' | 'Resume' }
  /** Walk the rundown one row, as clicking it would. */
  | { do: 'walk'; step: 1 | -1 };

const NONE: VerbDecision = { do: 'none' };
/** The verbs a held folder row answers: SPACE, TAKE and Out act on the folder; the rest have nothing to act on. */
const FOLDER_KEYS = new Set<VerbKey>(['take', 'retake', 'update', 'next', 'out', 'pause', 'resume']);

export function decideVerb(key: VerbKey, press: Press | undefined, view: DispatchView): VerbDecision {
  if (key === 'trigger-cue') {
    if (press?.repeat) return NONE;
    const original = view.cues.find((c) => c.id === press?.cue);
    if (!original) return NONE;
    const cue = directCue(original);
    const blocked = view.directBlocked(cue) ?? (cue.source === 'playout' && view.bridgeDown ? 'NoaCG Bridge is not connected.' : null);
    return { do: 'trigger', cue, label: `Trigger ${cue.label}`, refused: blocked ? `Trigger ${cue.label} was not sent: ${blocked}` : null };
  }
  // H holds or resumes the chip's countdown, whatever is selected (docs/RUNDOWN_AUTOMATION_PLAN.md §2.8).
  if (key === 'hold') return press?.repeat ? NONE : { do: 'hold' };
  if (key === 'all-out') return press?.repeat ? NONE : { do: 'all-out' };
  // A hardware panel's per-row keys (docs/work-specs/hardware-panel-control/spec.md D4), with the row
  // in `press.cue`. Select moves the cursor there and airs nothing: a folder row holds the folder.
  // Take airs that cue whatever the SPACE mode, or takes it off when it is the one on air, and leaves
  // the cursor where the operator put it.
  if (key === 'select-cue') {
    // The drawn row: the cue's own, its collapsed folder's header, or the header pressed.
    const shown = press?.cue ? view.rows.find((r) => r.id === (view.rowOf.get(press.cue!) ?? press.cue)) : undefined;
    if (!shown) return NONE;
    if (shown.kind === 'folder' && shown.id === press!.cue) return { do: 'select-folder', folderId: shown.folder.id, rowId: shown.id, reveal: rowTestId(shown) };
    return { do: 'select-cue', cueId: press!.cue!, reveal: rowTestId(shown) };
  }
  if (key === 'take-cue') {
    const cue = press?.repeat ? undefined : view.cues.find((c) => c.id === press?.cue);
    if (!cue) return NONE;
    if (view.onAirNow(cue)) return { do: 'take-off', cue };
    return view.stepBlocked(cue) ? NONE : { do: 'take', cue };
  }
  // A HELD FOLDER ROW: a held key fires once, since a folder's Take is several actions.
  if (view.folderId && FOLDER_KEYS.has(key)) {
    if (press?.repeat) return NONE;
    if (key === 'take') {
      // One by one steps: each press takes the next cue (docs/CLIP_PLAYBACK_PLAN.md §20.1).
      if (view.step) return { do: 'folder-step', folderId: view.folderId };
      if (view.folderSpace === 'take-off') return { do: 'folder-out', folderId: view.folderId };
      if (!view.folderCanTake) return NONE;
      if (view.folderBlocked) return { do: 'note', text: `Take was not sent: ${view.folderBlocked}` };
      return { do: 'folder-take', folderId: view.folderId };
    }
    if (key === 'out' && (view.folderUp || view.heldStarted)) return { do: 'folder-out', folderId: view.folderId };
    return NONE;
  }
  const { selectedCue } = view;
  // Staging REPLACES what was on PREVIEW; a replaced cue that is on air stays on air, because PREVIEW
  // is a check and never a tally. A cue taken off lands on PREVIEW in both modes.
  if (key === 'take') {
    if (!view.canTake || !selectedCue) return NONE;
    if (view.spaceNext === 'take-off') return { do: 'out-and-stage', cueId: selectedCue.id };
    if (view.spaceNext === 'preview') return { do: 'stage', cueId: selectedCue.id };
    return { do: 'take', cue: selectedCue };
  }
  // Re-take: play a live cue's entrance again from the start. Only on a cue that IS live.
  if (key === 'retake') return view.selectedCueIsLive && selectedCue ? { do: 'take', cue: selectedCue } : NONE;
  if (key === 'update') return view.editingIsLive ? { do: 'update' } : NONE;
  if (key === 'next') return view.selectedLayerLive && view.nextMoves ? { do: 'next' } : NONE;
  if (key === 'out') return view.selectedLayerLive ? { do: 'out' } : NONE;
  // A server clip's transport. Only the cue this page has up on the server.
  if (key === 'pause' || key === 'resume') {
    return selectedCue && view.selectedClipUp ? { do: 'server', cue: selectedCue, verb: key, label: key === 'pause' ? 'Pause' : 'Resume' } : NONE;
  }
  // P: pause the clip on air, or resume it - the selected cue's when it is the one up, else the one
  // the clip clock follows (control/serverState.ts `pauseTarget`). Read from the store at the press.
  // A panel's key names the clip its clock follows (protocol.md §7.3); P names none.
  if (key === 'pause-toggle') {
    const target = pauseTarget(view.ownership(), view.timing(), view.items, press?.cue || (selectedCue?.id ?? null));
    const cue = target ? view.cues.find((c) => c.id === target.cueId) : undefined;
    if (!target || !cue) return NONE;
    return target.paused ? { do: 'server', cue, verb: 'resume', label: 'Resume' } : { do: 'server', cue, verb: 'pause', label: 'Pause' };
  }
  // Walk the rundown over the rows as drawn: selecting is the same act as clicking.
  if (key === 'select-prev' || key === 'select-next') return { do: 'walk', step: key === 'select-next' ? 1 : -1 };
  return NONE;
}
