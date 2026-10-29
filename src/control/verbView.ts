// THE VERB BAR'S AND THE PANEL'S FACTS: from what the production page's render holds - the
// selection, the live map, the SPACE mode, the folder held and its step - what each verb would do and
// whether it may go (production-page refactor spec §2 and §4.2, phase 12). The bar greys its buttons
// with `verbView`, the dispatcher (./verbDispatch.ts) decides a press with it, and a hardware panel's
// keys light from `panelSnapshot` over the SAME view, so a key can never say "go" where the button
// beside it is grey (docs/work-specs/hardware-panel-control/ protocol.md §8).
//
// Moved out of ProductionPage with its rules unchanged. Runtime imports carry `.ts` so Node resolves
// them (scripts/verb-view.test.mjs); everything else is a type.

import type { ShowCue } from '../model/shows';
import type { LiveCueMap } from './liveCue';
import type { PanelClip, PanelRow, PanelSnapshot } from './panelFeedback';
import type { VerbSelection } from './graphicVerbs';
import { SPACE_FACES, spaceAction, type SpaceAction, type SpaceMode } from './spaceMode.ts';
import { stepFace, type FolderStep } from './folderStep.ts';
import { casparOffRefusal } from './takeBlockers.ts';

/** A held folder row, as the render sees it. */
interface HeldFolder {
  name: string;
  /** Any of it on air, or its Take still being sent. */
  up: boolean;
  /** A One-by-one folder's step has been taken in this page (its step memory is a cue id). */
  stepped: boolean;
  /** A One-by-one folder's step; null for a Play-through or All-together folder. */
  step: FolderStep | null;
  /** Why the step's next cue would not go, or null. */
  stepBlocked: string | null;
  /** Why a Take of the folder would not go, or null (read when it has no step). */
  takeBlocked: string | null;
  /** A server cue is among its cues. */
  serverMembers: boolean;
  labelOf: (cueId: string) => string;
}

/** What the render holds. */
export interface VerbInputs {
  spaceMode: SpaceMode;
  published: boolean;
  cues: readonly ShowCue[];
  selectedCue: ShowCue | null;
  selectedGraphic: string | null;
  /** The live map this render drew. */
  liveCue: LiveCueMap;
  /** The selected server cue is one this page has up, and what kind its item is. */
  selectedPlayoutLive: boolean;
  selectedItemKind: string | null;
  editTarget: 'preview' | 'air';
  /** The cue on PREVIEW. */
  previewCueId: string | null;
  casparOn: boolean;
  /** The Bridge has answered, and not with ok. */
  bridgeDown: boolean;
  /** Why the selected cue's Take would not go, or null. */
  takeBlocked: string | null;
  /** A graphic is selected and its machine can advance from where it reports. */
  advances: boolean;
  folder: HeldFolder | null;
  clearing: boolean;
  /** Something this page has up or is sending: a graphic layer, a server cue, a folder's Take. */
  anyUp: boolean;
  /** Something plays on a slot this rundown uses with no cue to name it (asked only when needed). */
  unnamedUp: () => boolean;
}

interface TakeButton {
  space: SpaceAction;
  disabled: boolean;
  title: string;
  /** A One-by-one folder's own words for the step, when the held folder has one. */
  step?: { text: string; title: string; tone: 'take' | 'off' | 'still' };
}

export interface VerbView extends VerbSelection {
  /** What is on air on the selected cue's layer: its own cue, another cue, or null. */
  selectedLayerCueId: string | null;
  /** The selected cue is the one on air: what SPACE toggles off, and what Re-take replays. */
  selectedCueIsLive: boolean;
  /** The selected cue is the one on PREVIEW. */
  selectedCueStaged: boolean;
  /** The selected cue is a clip this page has up on the server: what Pause and Resume act on. */
  selectedClipUp: boolean;
  /** What SPACE, and the TAKE button that IS the key, does next for a cue. */
  spaceNext: SpaceAction;
  /** A cue is selected and, if it is a server cue, the server can be reached. */
  canTake: boolean;
  /** The Bridge has answered, and not with ok. */
  bridgeDown: boolean;
  /** » Next would move the selected layer. */
  nextMoves: boolean;
  /** The held folder: up, why its press would not go, under way, what SPACE does, whether it waits on the Bridge. */
  folderHeld: boolean;
  folderUp: boolean;
  folderBlocked: string | null;
  heldStarted: boolean;
  folderSpace: SpaceAction;
  folderCanTake: boolean;
  take: TakeButton;
  /** Which of the bar's verbs may go: what a key or a panel's key may do, and, read backwards,
   *  which of its buttons are grey. */
  allowed: { retake: boolean; update: boolean; next: boolean; out: boolean; pause: boolean; resume: boolean };
  disabled: { retake: boolean; update: boolean; next: boolean; out: boolean };
  allOutEnabled: boolean;
}

export function verbView(input: VerbInputs): VerbView {
  const { selectedCue, selectedGraphic, liveCue, selectedPlayoutLive, folder } = input;
  const selectedClipUp = !!selectedCue && selectedPlayoutLive && input.selectedItemKind === 'media';
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedLayerLive = !!selectedLayerCueId || selectedPlayoutLive;
  /** The cue the editor is actually pointed at: the previewed one, or the live one. */
  const airCue = selectedLayerCueId ? input.cues.find((c) => c.id === selectedLayerCueId) ?? null : null;
  const editingCue = input.editTarget === 'air' && airCue ? airCue : selectedCue;
  const editingIsLive =
    (!!editingCue && !!selectedGraphic && liveCue[selectedGraphic] === editingCue.id) || (selectedPlayoutLive && editingCue === selectedCue);
  const selectedCueIsLive = (!!selectedCue && selectedLayerCueId === selectedCue.id) || selectedPlayoutLive;
  const selectedCueStaged = !!selectedCue && input.previewCueId === selectedCue.id;
  const spaceNext = spaceAction(input.spaceMode, { live: selectedCueIsLive, previewed: selectedCueStaged });
  /** A server cue cannot be taken while the server is off or the Bridge says it is not there. */
  const canTake = !!selectedCue && !(casparOffRefusal(selectedCue, input.casparOn) || (selectedCue.source === 'playout' && input.bridgeDown));
  const nextMoves = input.advances || (selectedPlayoutLive && input.selectedItemKind === 'template');

  const folderUp = !!folder && folder.up;
  const step = folder?.step ?? null;
  /** Why the held folder's press would not go: a One-by-one folder's is its next cue's. */
  const folderBlocked = !folder
    ? null
    : step
      ? step.kind === 'none'
        ? stepFace(step, folder.name, folder.labelOf, true).title
        : step.kind === 'take'
          ? folder.stepBlocked
          : null
      : folder.takeBlocked;
  const heldStarted = !!folder && folder.stepped;
  /** A folder is never previewed: SPACE takes it, or takes it off. */
  const folderSpace = spaceAction(input.spaceMode, { live: folderUp, previewed: true });
  /** A folder with a server cue in it waits while the Bridge says the server is not there; a
   *  One-by-one folder's step asks it of the cue it takes. */
  const folderCanTake = !!step || !folder?.serverMembers || !input.bridgeDown;

  let take: TakeButton;
  if (folder && step) {
    const words = stepFace(step, folder.name, folder.labelOf, folder.stepped || folder.up);
    const space: SpaceAction = words.tone === 'off' ? 'take-off' : words.tone === 'still' ? 'preview' : 'take';
    const blocked = step.kind === 'take' ? !folderCanTake || !!folderBlocked : step.kind === 'none';
    take = { space, disabled: blocked, title: step.kind === 'take' ? (folderBlocked ?? words.title) : words.title, step: words };
  } else if (folder) {
    take = {
      space: folderSpace,
      disabled: folderSpace === 'take-off' ? false : !folderCanTake || !!folderBlocked,
      title: folderSpace === 'take-off' ? `Take all of ${folder.name} off` : (folderBlocked ?? `Take ${folder.name}`),
    };
  } else {
    const blocked = input.takeBlocked;
    take = {
      space: spaceNext,
      disabled: selectedCueIsLive ? !selectedLayerLive : !canTake || (spaceNext === 'take' && !!blocked),
      title: spaceNext === 'take' && blocked ? blocked : SPACE_FACES[spaceNext].title,
    };
  }

  const allowed = {
    retake: selectedCueIsLive,
    update: editingIsLive,
    next: selectedLayerLive && nextMoves,
    out: folder ? folderUp || heldStarted : selectedLayerLive,
    pause: selectedClipUp,
    resume: selectedClipUp,
  };
  // A folder's Take still being sent counts: All out is what stops it before any of it lands.
  // Published, always: the page's own list is not the authority on what is on (AC-13, D11).
  const allOutEnabled = !input.clearing && (input.published || input.anyUp || input.unnamedUp());

  return {
    selectedCue,
    selectedGraphic,
    selectedLayerLive,
    selectedPlayoutLive,
    editingCue,
    editingIsLive,
    airCue,
    selectedLayerCueId,
    selectedCueIsLive,
    selectedCueStaged,
    selectedClipUp,
    spaceNext,
    canTake,
    bridgeDown: input.bridgeDown,
    nextMoves,
    folderHeld: !!folder,
    folderUp,
    folderBlocked,
    heldStarted,
    folderSpace,
    folderCanTake,
    take,
    allowed,
    disabled: { retake: !allowed.retake, update: !allowed.update, next: !allowed.next, out: !allowed.out },
    allOutEnabled,
  };
}

/** What the panel's snapshot reads besides the view, at each publish and each press. */
export interface PanelFacts {
  title: string;
  /** The held folder's header row, when a folder is held. */
  cursorRow: string | null;
  cues: readonly { id: string }[];
  /** The cues on air now, and those whose own Take would be refused. */
  live: ReadonlySet<string>;
  refused: ReadonlySet<string>;
  /** The rundown's folder rows: a folder's own Take key is always refused. */
  folderRows: readonly string[];
  clip: PanelClip | null;
  /** NoaCG Bridge is set up for this studio. */
  configured: boolean;
  /** The rundown's rows as drawn (the walk keys go over them), and as the panel lists them. */
  rowCount: number;
  rows: PanelRow[];
}

/** What a panel's keys show (protocol.md §8), from the same view the verb bar greys with. */
export function panelSnapshot(view: VerbView, facts: PanelFacts): PanelSnapshot {
  return {
    title: facts.title,
    // The row the verbs act on: a held folder's header, else the selected cue itself, even while its
    // folder is collapsed, since the panel's rows list a collapsed folder's cues.
    selected: view.folderHeld ? facts.cursorRow : (view.selectedCue?.id ?? null),
    space: view.folderHeld || view.selectedCue ? view.take.space : null,
    live: [...facts.live],
    allowed: {
      // The dispatcher's Take of a cue also waits for `canTake` (a server cue while the Bridge is down).
      take: !view.take.disabled && (view.folderHeld || view.canTake),
      ...view.allowed,
      'select-prev': facts.rowCount > 0,
      'select-next': facts.rowCount > 0,
      'pause-toggle': facts.clip !== null,
      'all-out': view.allOutEnabled,
    },
    // A cue's own Take key is refused when its Take would not go; taking one off air never is.
    blocked: [...facts.folderRows, ...facts.cues.filter((c) => !facts.live.has(c.id) && facts.refused.has(c.id)).map((c) => c.id)],
    clip: facts.clip,
    bridge: !facts.configured ? 'off' : view.bridgeDown ? 'down' : 'ok',
    rows: facts.rows,
  };
}
