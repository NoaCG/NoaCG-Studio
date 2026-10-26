import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, type ProductionSub } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  deleteShowProfile,
  duplicateLayers,
  graphicLayer,
  loadShows,
  setShowOutputSetup,
  setShowProfile,
  setGraphicCopyScript,
  setOwnReaderStops,
  publishedReaderStops,
  productionsContaining,
  updateShowCue,
  updateShowCueChecked,
  playoutItemOf,
  fillPlayoutItemFacts,
  renameFolderChecked,
  setFolderMode,
  setFolderPlayback,
  setCueAuto,
  type PlayoutItem,
  type SheetShowSource,
  type FeedShowSource,
  fillsFields,
  type Show,
  type ShowCue,
  type ShowFolder,
} from '../../model/shows';
import { folderMode } from '../../model/showFolders';
import { cursorRowId, folderName, rangeCueIds, rowCueIds, rowTestId, rundownView, type RundownRow } from '../../model/rundownRows';
import { canAuthorAccount, commitDurableWrites } from '../../model/durableStore';
import { accountCasparDefault, casparSwitch, destinationUrl, readOutputSetup, routeColor, withCasparSwitch } from '../../model/outputSetup';
import { readDefaultOutput } from '../../backend/auth';
import { CueAccentControl } from './RundownColors';
import {
  act,
  folderSlot,
  itemSlot,
  listLibrary,
  loadPlayoutSettings,
  playoutConfigured,
  readState,
  slotAddress,
  slotOf,
  stateReadable,
  subscribeTargetStatus,
  syncStudio,
  type PlayoutResult,
} from '../../control/playoutLink';
import type { Slot } from '../../control/playoutProtocol';
import {
  playNextTarget,
  serverCueLive,
  takeBlocker,
  serverLayers,
  throughPlaces,
  type ThroughRole,
  type ServerVerb,
  type ServerVerbOutcome,
} from '../../control/serverPlayout';
import { createServerPlayoutStore, type ServerPlayoutStore } from '../../control/serverPlayoutStore';
import { createPlayoutSession, type AirPart, type DraftPart, type LogPart, type PlayoutSession } from '../../control/playoutSession';
import { createCueDraft, unsentNow, type CueDraft, type CueDraftAdapters, type CueEdit, type CueText } from '../../control/cueDraft';
import type { StorePart } from '../../control/storePart';
import { claimAndApply, loggedHere, moveLiveCue, programItems, rememberAired, restoreItems, type ClockSpecs } from '../../control/airState';
import { startSessionWire, type SessionWireIo, type SessionWirePage } from '../../control/sessionWire';
import { createProductionDataSession } from '../../control/productionDataSession';
import type { FieldDescriptor } from '../../model/fieldModel';
import { createSheetReader, connectedFields, createSourceStatusStore, latestWriter, pathValue, type SheetLease, type SheetReader, type SheetReaderOptions } from '../../control/sheetSource';
import { FEED_LEASE_MS, createFeedReader } from '../../control/feedSource';
import { useStorePart } from './useStorePart';
import { applyClearedSlot, clipClock, followedClip } from '../../control/serverState';
import { segmentSeconds } from '../../control/cuePlayback';
import { cueOnAir, folderAir } from '../../control/folderAir';
import { folderStep, type FolderStep, type StepMember } from '../../control/folderStep';
import { startBridgeWatch, writeBridge, type BridgeWatch, type BridgeWatchIo } from '../../control/bridgeWatch';
import { casparOffRefusal as casparOff, directBlocker as directBlockerOf, stepBlocker as stepBlockerOf, takeBlockerFor as takeBlockerOf, type SlotRules, type TakeContext } from '../../control/takeBlockers';
import { runAndRecord } from '../../control/serverVerbs';
import { createGraphicVerbs, type GraphicPage, type GraphicVerbIo, type VerbSender } from '../../control/graphicVerbs';
import { decideVerb } from '../../control/verbDispatch';
import { panelSnapshot, verbView } from '../../control/verbView';
import ClipClock from './ClipClock';
import type { Resolution, SpxTemplate } from '../../model/types';
import { resolveBindings, selectedFields, selectionReadOnly, sourcePaths, SELECTION_VERSION, type CollectionRecipe, type CueSelection, type ResolvedValues } from '../../model/productionData';
import { loadLiveData, loadSelectionAir, saveLiveData, saveSelectionAir, PRODUCTION_DATA_KEY } from '../../model/productionState';
import { CANDIDATE_READ_MS, actionCarriesValues, airedOf as airedSelectionOf, airedValues, watchSettling, followAired, followsCandidates, protectedFields, foreignSelection, protectedSelections, pressSelection, readSelectionAir, selectionTake, staleSelection, writeSelectionAir, type SelectionAir, type SelectionAirIo, type SelectionFacts, type SelectionTake } from '../../control/selectionAir';
import { collectionEntities, readCollectionRecipe, selectionCheck, selectionGate } from '../../control/sourceMapping';
import SelectionHolds from './SelectionHolds';
import {
  fetchProductionData,
  patchProductionData,
  patchProductionDataBySlug,
  productionDataKey,
} from '../../control/productionDataApi';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../../model/projectFormat';
import {
  revealCue,
  stepSelection,
  takeFace,
  useSpaceMode,
  type PlayoutVerb,
  type SpaceMode,
  type VerbPress,
} from '../playoutKeys';
import { useRundownHistory } from './useRundownHistory';
import { liveRundownRefusal, type RundownSlice } from '../../model/rundownHistory';
import { SpaceModeToggle } from '../SpaceModeToggle';
import { UnorderedSends } from '../UnorderedSends';
import { PREVIEW_EMPTY_LABEL } from '../../control/spaceMode';
import { cueDataRows, hasSideFields, rowsForSide } from '../../control/cueData';
import { groupCueFields } from '../../control/cueFieldGroups';
import { PROFILE_VERSION, pinnedGraphicsOf, profileIsEmpty, readPublishedProfile, readShowProfile, serializeShowProfile, withGraphicArrange, withPinnedGraphic, type ArrangeEntry, type ShowProfile } from '../../model/profile';
import ProductionDataWorkspace from './ProductionDataWorkspace';
import SourcesLine, { ownSheetReader, ownSheetReaders } from './SourcesLine';
import ProductionAudienceWorkspace, { pollFieldMap, useMessageSources } from './ProductionAudienceWorkspace';
import { useAudienceInbox, useMessagesBackend } from './useAudienceInbox';
import { createSheetInbox } from '../../audience/sheetMessages';
import { loadGraphics, templateForSavedGraphic, resolveSavedGraphicDoc, updateGraphic } from '../../model/library';
import type { SavedGraphic } from '../../model/packets';
import { appearanceEquals, IDENTITY, measureId, withAnchor, type AppliedLooks, type Measurement } from '../../control/cueAdjust';
import { createMeasurer, cueAdjustState, measured, type MeasureJob } from '../../control/adjustGeometry';
import { measureCue } from '../../preview/measureCue';
import { promoteCueAdjust, setCueAdjust, setGraphicAdjust, stepAdjust } from '../../model/shows';
import type { AdjustPatch } from '../../model/adjust';
import CueAdjust from './CueAdjust';
import { formerReaders as storedFormerReaders, setFormerReaders as setStoredFormerReaders, setOwnReaderHolds } from '../../model/ownReaderHolds';
import { hasLiveData, ownReaderRemoval, stripLiveData } from '../../control/liveData';
import { canonical } from '../../model/publishedRecord';
import { setCueSelection, setGraphicSounds } from '../../model/shows';
import ProductionSounds from './ProductionSounds';
import { soundTopology } from '../../assets/productionSounds';
import {
  arrangeControls,
  continueEvents,
  arrangeFor,
  eventButtons,
  advanceLabel,
  canAdvance,
  hasSteps,
  eventLegality,
  fieldDescriptors,
  formatMachineState,
  isEventLegal,
  machineStateGroups,
  machineStateNames,
  movedStateNames,
  adjustedValue,
  movedKeys,
  pressSend,
  type ControlButton,
} from '../../control/controlModel';
import { withLiveLabels } from '../../blocks/controlLabels';
import {
  clearAllCueBatches,
  headsSay,
  headsStillOn,
  controlOutputSeenAt,
  controlPageUrl,
  controlShowBySlug,
  followControlLog,
  bootMonitorReplay,
  hostedControlTail,
  joinPageUrl,
  presenterPageUrl,
  controlPingSeq,
  outputPageUrl,
  publishedLeaseDoor,
  firstPublishedSources,
  sendControlVerbs,
  untilAnswered,
  sendsInOrder,
  sentHere,
  verbAired,
  verbStale,
  verbsLanded,
  verbsSkipped,
  verbSentItems,
  writePublishedSources,
  type ControlEventRow,
  type ControlFollowStatus,
  type ControlSendItem,
  type LiveCueMap,
} from '../../control/hostedControl';
import type { ReplayItem } from '../../control/outputRecovery';
import { createSendDebts } from '../../control/failedSends';
import { appendLogEntries, autoEntry, describeLogRow, eventLogLabel, noteEntry, type LogEntry } from '../../control/eventLog';
import {
  clockSpecFromHtml,
  fastEventGraphics,
  speakingClocksFromHtml,
  type ClockSpec,
  type SpeakingClockPair,
} from '../../control/matchClockWire';
import { type ProgramStageHandle } from './ProgramStage';
import PlayoutMonitors from './PlayoutMonitors';
import { composeDocument } from '../../preview/composeDocument';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import SignInPrompt from '../auth/SignInPrompt';
import { productionWhenSynced } from '../../backend/graphicWhenSynced';
import { useAuthUi } from '../auth/authUi';
import ActionLog from './ActionLog';
import { cueOverflowKeys } from './CueOverflowNote';
import ProductionExportDialog from './ProductionExportDialog';
import { BrowserSourceRow, CasparSection, DueActions, PanelProblems, RendererRows } from './PlayoutPanel';
import { ProductionLinksDialog } from './ProductionLinks';
import { PlayoutStatusControl } from './PlayoutStatusControl';
import CueRundown, { nameList } from './CueRundown';
import AccountAuthoringGate, { useAccountAuthoring } from '../AccountAuthoringGate';
import ServerDiagnostics from './ServerDiagnostics';
import { CueEndsRow, ProgramAutoChip } from './CueTiming';
import {
  chipLane,
  nextGraphicCue,
  readAuto,
  takesNext,
} from '../../control/cueAuto';
import { createCueArmWire, type CueArmWire } from '../../control/cueArmWire';
import { createFolderPlayout, type FolderPage, type FolderPlayoutIo } from '../../control/folderPlayout';
import { startCueArmEngine, type CueArmEngine, type CueArmEngineIo, type CueArmPage } from '../../control/cueArmEngine';
import { CUE_ARM_RPC } from '../../control/cueArmRpc';
import CueEditor, { useCueView, type CandidatePicker, type CueCandidate, type OwnReader } from './CueEditor';
import { actionButtonFor } from './CueActions';
import LiveControls, { type LiveBlockView } from './LiveControls';
import { liveBlocks, liveNumberFields as liveNumbersOf, liveSelection, pickFields, pickOptions } from '../../control/liveControls';
import ProductionShell from './ProductionShell';
import ServerCueEditor from './ServerCueEditor';
import FolderEditor from './FolderEditor';
import { isImageAsset } from '../../assets/assetUtils';
import BrandLogo from '../BrandLogo';
import { publishActions, publishFacts, useProductionPublish } from './useProductionPublish';
import { rundownActions, useRundownAuthoring } from './useRundownAuthoring';
import PlayoutSettingsDialog from '../PlayoutSettingsDialog';
import { PanelDialog, usePanelAnswer } from '../control/PanelControl';
import { PANEL_VERBS, panelClip, rundownPanelRows, type PanelVerb } from '../../control/panelFeedback';
import { useTeamsAvailable } from '../teams/useTeamsAvailable';
import { teamShowsStatus } from '../../model/teamShows';
import { announcedExpected, useExpectedOutputs, useLivePresence, useReadinessView } from '../control/OutputHealth';
import { usePublishDrift } from './usePublishDrift';
import { type PayloadVersion } from '../../control/payloadVersion';
import { clockWords, type HeldVersion, type ReadyStamp } from '../../control/readiness';
import { commandPathsOf, type PrepRequest } from '../../control/prepareLive';
import { casparOutputTarget, describePlayoutStatus, programAir, relevantPlayout, takeTargets, type StatusFacts } from '../../control/playoutStatus';
import { gatherBridgeFacts } from '../../control/prepareBridge';
import { loadReadyMemory, saveReadyMemory } from '../../model/readyMemory';
import { usePrepareForLive } from '../control/PrepareForLive';

/** The draft's browser moments (control/cueDraft.ts): the page hidden or closing, or the account
 *  pausing, saves at once; the account asking for a save flushes. */
const DRAFT_ADAPTERS: CueDraftAdapters = {
  onPageHide: (run) => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') run();
    };
    window.addEventListener('noacg-account-authoring-pausing', run);
    window.addEventListener('pagehide', run);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('noacg-account-authoring-pausing', run);
      window.removeEventListener('pagehide', run);
      document.removeEventListener('visibilitychange', hidden);
    };
  },
  onFlushAsked: (run) => {
    window.addEventListener('noacg-account-authoring-flush', run);
    return () => window.removeEventListener('noacg-account-authoring-flush', run);
  },
};
/** Where an item and a Play-through folder play, for the Take refusals and the server verbs. */
const PLAYOUT_SLOTS: SlotRules = { itemSlot, folderSlot };
/** The Bridge watch's browser half (control/bridgeWatch.ts): the link, storage, timers and the tab. */
const BRIDGE_IO: BridgeWatchIo = {
  loadSettings: loadPlayoutSettings,
  configured: playoutConfigured,
  readable: stateReadable,
  subscribeTargetStatus,
  readState,
  listLibrary,
  syncStudio,
  rememberOutput: (showId, target) => saveReadyMemory(showId, { ...loadReadyMemory(showId), casparOutput: target }),
  every: (ms, run) => {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
  onVisible: (run) => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  },
};

/**
 * THE PLAYOUT DASHBOARD (route `#/production/<id>`) — the surface an operator runs a production
 * from. Its design contract is **docs/PLAYOUT_DASHBOARD.md**; the hosted control page and the
 * exported controller render the same one, and a change here that is not in that doc is a
 * divergence.
 *
 * The job, in one line: **choose a cue → look at it on PREVIEW → TAKE**. Selecting a cue in the
 * rundown IS the preview gesture; nothing about it touches air. Take airs what is on preview.
 *
 * Two monitors, both real: PREVIEW composes the selected cue's graphic locally and settles the
 * cue's values into it; PROGRAM is the actual output renderer (ProgramStage), fed every command
 * that reaches air — this operator's and, on a published production, everyone else's off the
 * shared log.
 *
 * Every graphic is a LAYER holding its OWN on-air cue, so several are up at once and Take never
 * clears another layer. That is why `liveCue` is a MAP and why every verb but Take addresses the
 * selected cue's layer. The layer is a NUMBER the operator types (§5), defaulting to 20.
 */
/** A production with no folders, as one stable empty list. */
const NO_FOLDERS: readonly ShowFolder[] = [];
/** A hardware panel runs every panel verb here (docs/work-specs/hardware-panel-control/spec.md D5). */
const PRODUCTION_PANEL_VERBS: ReadonlySet<PanelVerb> = new Set<PanelVerb>(PANEL_VERBS);
/** The clip clock as a panel counts it, read at a publish: the store's times are the page's
 *  `performance.now()`, the panel's are wall-clock milliseconds (protocol.md §7.4). */
const panelClipNow = (store: ServerPlayoutStore, items: readonly PlayoutItem[], cues: readonly ShowCue[]) =>
  panelClip(clipClock(store.ownership.get(), store.timing.get(), items, cues, performance.now()), Date.now());

/** This machine's clock (ms): what timed cues count in, and when the log last took a send. */
const wallClock = () => Date.now();
/** The unpublished timed-cue engine's browser half (control/cueArmEngine.ts): the time it counts in,
 *  this machine's own (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0), its timer and the tab. */
const CUE_ARM_IO: CueArmEngineIo = {
  wallClock,
  setTimer: (run, ms) => window.setTimeout(run, ms),
  clearTimer: (timer) => window.clearTimeout(timer as number),
  onVisible: BRIDGE_IO.onVisible,
};

/** A folder's Take's browser half (control/folderPlayout.ts): the clock a server take is stamped with. */
const FOLDER_IO: FolderPlayoutIo = { now: () => performance.now() };
/** The verbs' browser half (control/graphicVerbs.ts): the wire's doors, the press rules of
 *  control/controlModel.ts (which Node cannot load), the clock and the bound presses' timer. */
const GRAPHIC_VERB_IO: GraphicVerbIo = {
  sendControlVerbs,
  verbStale,
  verbAired,
  verbsLanded,
  verbsSkipped,
  verbSentItems,
  headsSay,
  headsStillOn,
  adjustedValue,
  movedKeys,
  pressSend,
  nameList,
  now: wallClock,
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
/** What a published production's wire calls (control/sessionWire.ts): the backend's, and the timer. */
const SESSION_WIRE_IO: SessionWireIo = {
  controlShowBySlug,
  untilAnswered,
  bootMonitorReplay,
  hostedControlTail,
  followControlLog,
  controlOutputSeenAt,
  createCueArmWire,
  appendLog: appendLogEntries,
  armRpc: CUE_ARM_RPC,
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
};

/**
 * A SESSION PART DRAWN AT REACT'S ORDINARY PACE: a subscription in an effect sets page state, so a
 * write from async code renders when React's scheduler next runs, as the page state it replaced
 * did, and not synchronously as `useStorePart` would (the `folderMemory` note says what that broke).
 * The page only reads what this returns; the part's folds are its writers. `select` is a module
 * function, so the subscription never restarts for it; an unchanged selection renders nothing.
 */
function usePacedPart<T, S>(part: StorePart<T>, select: (value: T) => S): S {
  const [value, setValue] = useState(() => select(part.get()));
  useEffect(() => {
    const read = () => setValue(() => select(part.get()));
    read();
    return part.subscribe(read);
  }, [part, select]);
  return value;
}
/**
 * WHAT THE PAGE DRAWS OF THE DRAFT, AND NOTHING MORE (production-page refactor D12). The answer
 * is `draw`, called in the render from the render's own inputs, and remembered; a draft write
 * renders the page only when `draw`, with the newest inputs, answers something else, compared by
 * value. Typing into a field that already differs from air redraws the editor, the rundown and
 * PREVIEW, which subscribe to the draft themselves, and not the page.
 */
interface DrawnDraft {
  /** The edited cue's unsent fields, and the on-air cues with any (control/cueDraft.ts). */
  unsent: { fields: string[]; cues: string[] };
  /** The countdown chip's cue label, as typed. */
  chipLabel: string | null;
}
function useDrawnDraft(part: StorePart<DraftPart | null>): (draw: () => DrawnDraft) => DrawnDraft {
  const latest = useRef<(() => string) | null>(null);
  const drawn = useRef('');
  const [, redraw] = useState(0);
  useEffect(() => {
    const check = () => {
      if (latest.current && latest.current() !== drawn.current) redraw((n) => n + 1);
    };
    check();
    return part.subscribe(check);
  }, [part]);
  return (draw) => {
    const answer = draw();
    latest.current = () => JSON.stringify(draw());
    drawn.current = JSON.stringify(answer);
    return answer;
  };
}
const wholePart = <T,>(value: T) => value;
/** The cue's text as it is typed, for an editor that takes it as a prop (home/ServerCueEditor): this
 *  child redraws with the draft, the page does not (production-page refactor D12). */
function DraftView({ draft, cue, children }: { draft: Pick<CueDraft, 'part'>; cue: ShowCue; children: (view: CueText) => ReactNode }) {
  return <>{children(useCueView(draft, cue))}</>;
}
const liveCueOf = (air: AirPart) => air.liveCue;

/** The Live candidate menu's people per tree and recipe, so a render that did not change the tree
 *  reads them again rather than walking and sorting the collection. */
const listedPeople = new WeakMap<object, Map<string, ReturnType<typeof collectionEntities>>>();
function entitiesIn(recipe: CollectionRecipe, tree: object): ReturnType<typeof collectionEntities> {
  let byRecipe = listedPeople.get(tree);
  if (!byRecipe) listedPeople.set(tree, (byRecipe = new Map()));
  const key = JSON.stringify(recipe);
  if (!byRecipe.has(key)) byRecipe.set(key, collectionEntities(recipe, tree));
  return byRecipe.get(key)!;
}
const airedOf = (air: AirPart) => air.aired;
const NO_LOOKS: AppliedLooks = {};
/** The unsent entry a waiting place-and-size change adds: no field has this id. */
const PLACE_UNSENT = '@place';
/** How long Publish waits for the adjusted cues to be measured. */
const PUBLISH_MEASURE_CAP_MS = 8_000;
const looksOf = (air: AirPart) => air.looks ?? NO_LOOKS;
/** What the background measurer composes for one cue. */
interface MeasureInput {
  template: SpxTemplate;
  values: Record<string, string>;
}
const bootLiveOf = (air: AirPart) => air.bootLive;
const entriesOf = (log: LogPart) => log.entries;

/** A Sheet source's reader lease and memory, shared by this browser's tabs (control/sheetSource.ts).
 *  Runtime state like the live tree: localStorage, never the show record. */
const SHEET_LEASE_KEY = 'spx-gfx-sheet-reader:';
/** How soon a published production's sources are written again after a write failed. */
const SOURCES_RETRY_MS = 10_000;
function readSheetLease(key: string): SheetLease | null {
  try {
    const raw = localStorage.getItem(SHEET_LEASE_KEY + key);
    return raw ? (JSON.parse(raw) as SheetLease) : null;
  } catch {
    return null;
  }
}
function writeSheetLease(key: string, lease: SheetLease): boolean {
  try {
    localStorage.setItem(SHEET_LEASE_KEY + key, JSON.stringify(lease));
    return true;
  } catch {
    // Quota or a private-mode refusal: the reader keeps its lease in memory and still reads.
    return false;
  }
}

/** A source's reader as the page builds it: its id, kind and config, and whether it feeds Messages. */
/** One pool graphic's machine and fields, parsed once per pool resolution: what the activity feed
 *  names, what Next asks, and what a pinned block draws and greys by. */
interface PoolMachine {
  buttons: ControlButton[];
  js: string;
  descriptors: FieldDescriptor[];
  /** The events Continue walks: a payload riding one of these is preparation, never a pick. */
  path: Set<string>;
  legality: Record<string, Record<string, string[]>>;
  stateGroups: ReturnType<typeof machineStateGroups>;
  stateNames: Record<string, Record<string, string>>;
}

type ReaderPlan = [string, Pick<SheetShowSource, 'kind' | 'config'> | Pick<FeedShowSource, 'kind' | 'config'>, boolean];

export default function ProductionPage({ id, sub }: { id: string; sub?: ProductionSub | null }) {
  const navigate = useRouter((s) => s.navigate);
  const goBack = useRouter((s) => s.goBack);
  // The mutators return the fresh list — holding it in state (the ControlPanel pattern) keeps
  // an edit from re-parsing every store on every render.
  const [shows, setShows] = useState<Show[]>(() => loadShows());

  /**
   * ANOTHER TAB CHANGED THIS PRODUCTION - re-read it.
   *
   * The workspaces open in their own browser tab, so the ordinary case is now two tabs on one
   * production: the bank is typed on Data over there and loaded into a cue over here. The
   * durable store keeps their MIRRORS honest across tabs (model/durableStore.ts announces every
   * landed write), but a mirror nobody re-reads changes nothing on screen - this surface seeded
   * `shows` once and would go on offering a rundown with no data rows in it.
   *
   * Deliberately a RE-READ of the record and nothing else. The cue DRAFT, the selection and the
   * playhead are this tab's own state and are untouched, so a table appearing in the other tab
   * cannot move what this operator is holding. Re-reading after this tab's OWN write is
   * harmless: it reads back what it just wrote.
   */
  useEffect(() => {
    const onDataChanged = () => setShows(loadShows());
    window.addEventListener('spx-data-changed', onDataChanged);
    return () => window.removeEventListener('spx-data-changed', onDataChanged);
  }, []);
  /** Bumped when this page changes a library design itself (the own-reader migration, data-sources
   *  C6), so the monitors rebuild on the design the production now plays. */
  const [libraryRev, setLibraryRev] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only when this page changed a design
  const library = useMemo(() => loadGraphics(), [libraryRev]);
  // Fresh picker choices must not replace the library identity held by running monitor frames.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- data-change events refresh shows and the library together
  const pickerLibrary = useMemo(() => loadGraphics(), [shows]);
  const show: Show | null = shows.find((s) => s.id === id) ?? null;

  const backendConfigured = isBackendConfigured();
  const { needsSignIn, status: authStatus, user } = useAuthState();
  /**
   * A PRODUCTION LINK OPENED COLD. `noacg save --production` prints `#/production/<id>`, so the
   * reader is very often a browser that has not pulled the record yet, or one nobody has signed
   * into. "Not in this browser" is then not "no such production": ask the cloud first, as the
   * graphic link does (backend/graphicWhenSynced.ts). Offline there is nowhere else to look.
   */
  const hasShow = !!show;
  const [lookup, setLookup] = useState<'looking' | 'unknown' | 'needs-sign-in'>(() =>
    backendConfigured ? 'looking' : 'unknown',
  );
  useEffect(() => {
    if (hasShow || !backendConfigured) return;
    setLookup('looking');
    let live = true;
    void productionWhenSynced(id).then((found) => {
      if (!live) return;
      if (found.status === 'found') setShows(loadShows());
      else setLookup(found.status);
    });
    return () => {
      live = false;
    };
    // authStatus re-asks once the session resolves, and after a sign-in from the prompt below.
  }, [id, hasShow, backendConfigured, authStatus]);
  const [accentPreview, setAccentPreview] = useState<{ productionId: string; cueId: string; color: string } | null>(null);
  /** The account's "Use CasparCG in new productions": it decides the CasparCG switch of a new
   *  production until the operator sets it (model/outputSetup.ts), so only a production whose
   *  output was never set asks for it. Undefined until it has answered; null for no default. */
  const [accountCaspar, setAccountCaspar] = useState<boolean | null | undefined>(undefined);
  const wantsAccountDefault = !!show?.outputSetup && !readOutputSetup(show.outputSetup)?.destinations.length;
  useEffect(() => {
    setAccountCaspar(undefined);
    if (!user?.id || !wantsAccountDefault) return;
    let alive = true;
    void readDefaultOutput(user.id).then((r) => {
      if (alive) setAccountCaspar(accountCasparDefault(r.setup));
    });
    return () => {
      alive = false;
    };
  }, [user?.id, wantsAccountDefault]);
  const teamsOn = useTeamsAvailable();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const signInOpen = useAuthUi((s) => s.signInOpen);
  const publishState = useProductionPublish({ authStatus, signInOpen });
  const {
    statusOpen, setStatusOpen, linksOpen, setLinksOpen, busy, publishing, copied, nameDraft, setNameDraft, nameNote,
    setNameNote, setReplaceAsk, slotBusy,
  } = publishState;

  const [note, setNote] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /** The header's Playout settings dialog (components/PlayoutSettingsDialog.tsx). Closing it bumps
   *  `playoutSettingsRev`, which re-reads the settings for the connection poll below. */
  const [playoutSettingsOpen, setPlayoutSettingsOpen] = useState(false);
  const [playoutSettingsRev, setPlayoutSettingsRev] = useState(0);
  /** Whether a Bridge is paired and a server named - what the header's Playout control shows
   *  before any answer comes back. Re-read with the rev, on the dialog's close. */
  const [playoutIsConfigured, setPlayoutIsConfigured] = useState(() => playoutConfigured(loadPlayoutSettings()));
  // THE KIT WIZARD'S EXPORT DOOR (templateStore `pendingProductionExport`): a kit is exported
  // without the editor ever opening, and the target picker + validation gate it needs are this
  // page's own dialog - so the wizard asks for that surface instead of growing a second one.
  // One-shot, and cleared as it is read, like every other `pending*` in the store.
  useEffect(() => {
    const pending = useTemplateStore.getState().pendingProductionExport;
    if (!pending || pending !== id) return;
    useTemplateStore.setState({ pendingProductionExport: null });
    setExportOpen(true);
  }, [id]);
  /** All out is on its way and the server's heads have not yet said each graphic is off (AC-13). */
  const [clearing, setClearing] = useState(false);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  /**
   * THE FOLDER ROW the cursor is on, when it is on one (docs/CLIP_PLAYBACK_PLAN.md §6.6, phase 4):
   * beside `selectedCueId`, never in it. While it is set and its folder is there, SPACE, TAKE and Out
   * act on the folder and `selectedCue` reads null, so every cue verb stands down by its null path;
   * `selectedCueId` keeps the folder's first cue, so the cursor stays where the folder stood if it goes.
   */
  const [selectedFolderRow, setSelectedFolderRow] = useState<{ folderId: string; rowId: string } | null>(null);
  const authoring = useRundownAuthoring({ id, userId: user?.id });
  const { rangeIds, setRangeIds, setRangeEnd, rundownNote, setRundownNote, rundownFeedback, refreshingRundown } = authoring;
  /**
   * THE CUE ON PREVIEW in the 'preview-then-take' SPACE mode (docs/PLAYOUT_DASHBOARD.md §2,
   * "Two Space modes"). In 'take' mode the selection IS the preview and this is unused; in the
   * other mode the selection is only a cursor and SPACE is what puts a cue here. Page state,
   * never stored: PREVIEW is a check of what is about to air, and a check does not survive a
   * reload.
   */
  const [stagedCueId, setStagedCueId] = useState<string | null>(null);
  const [spaceMode, setSpaceMode] = useSpaceMode();
  /** Which cue the editor is pointed at: the one on PREVIEW (the default — edits air on Take),
   *  or the one already ON AIR on that layer, where ✎ Update pushes edits live (§2). */
  const [editTarget, setEditTarget] = useState<'preview' | 'air'>('preview');
  /** Per cue, the last data row loaded into it (`datasetId:rowId`) — what Load next row advances from. */
  const [lastLoaded, setLastLoaded] = useState<Record<string, string>>({});
  /** Which side of a two-team board the next data-row load fills. */
  const [loadSide, setLoadSide] = useState<'A' | 'B'>('A');

  /**
   * PUBLISHED (phase 2, migration 0075): the same countdowns, kept by the database so every
   * operator page and every reload counts the same second, and run by control/cueArmWire.ts on
   * every page that follows the log. `armsServer` says whether this production's backend keeps
   * them: `missing` on a server without 0075, where a published production does not time its cues.
   */
  const armWire = useRef<CueArmWire | null>(null);
  const [armsServerState, setArmsServer] = useState<'pending' | 'on' | 'missing'>('pending');
  /** What this page believes is up on the PLAYOUT SERVER (control/serverPlayout.ts says what
   *  it is and why the slot is remembered), in the store's OWNERSHIP part, with what the server
   *  itself reports (control/serverState.ts). One store per page, so it lives exactly as long as
   *  the state it replaced. The page never reads the TIMING part: a clock ticking twice a second
   *  must not re-render the whole surface (control/serverPlayoutStore.ts) - the clip clock and the
   *  rows' remaining times subscribe to it themselves. */
  const [serverPlayout] = useState(createServerPlayoutStore);
  /** This production's playout session (control/playoutSession.ts): one per production id, ended
   *  when the id changes or the page goes. The route already keys the page by production
   *  (src/App.tsx), so in practice that is the unmount. The end waits one task and a re-run of the
   *  effect cancels it: StrictMode's extra cleanup in development (src/main.tsx) must not end the
   *  session, because effects that never restart (the log follower) keep the one they first saw. */
  const session = useMemo(() => createPlayoutSession(id), [id]);
  const sessionEnd = useRef<{ session: PlayoutSession; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    if (sessionEnd.current?.session === session) clearTimeout(sessionEnd.current.timer);
    return () => {
      sessionEnd.current = { session, timer: setTimeout(() => session.dispose()) };
    };
  }, [session]);
  // ── Live status: which cue is on air ON EACH LAYER, and what each graphic was last sent. Several
  // graphics are up at once by design, so the marker is a map keyed by graphic name. Both live in
  // the session's `air` part, written only by the folds of control/airState.ts. The page draws them
  // at React's pace, and the reads after a wait (`liveCueRef`, `airedRef`) take the render's copy,
  // so a press, its checks and the modules it calls all see the one map the render drew. ──
  const liveCue = usePacedPart(session.air, liveCueOf);
  /** The live map the last render drew, for the verbs and the modules that read it after a wait. */
  const drawnLiveCue = useRef(liveCue);
  drawnLiveCue.current = liveCue;
  // A getter, so the publish flow and the modules hold one stable `{ current }` (the compiler lint
  // reads a plain ref handed to the render-time publish call as read during render).
  const liveCueRef = useMemo(() => ({ get current() { return drawnLiveCue.current; } }), []);
  const airedData = usePacedPart(session.air, airedOf);
  const airedRef = useRef(airedData);
  airedRef.current = airedData;
  /** What the WIRE said was live when this page resolved the production - null until it seeded,
   *  and never written by anything this operator does. The boot recovery below is keyed on it. */
  const bootLive = usePacedPart(session.air, bootLiveOf);
  /** The action log's lines (the session's `log` part): the wire's rows and this page's own. */
  const wireLog = usePacedPart(session.log, entriesOf);
  /**
   * TIMED CUES' COUNTDOWNS, one per graphic layer (control/cueAuto.ts; docs/RUNDOWN_AUTOMATION_PLAN.md
   * §2.0), in the session's `arms` part. Unpublished, this page is the one surface and its PROGRAM
   * monitor the one output, and control/cueArmEngine.ts runs them: they move with the cue markers
   * this page sends, start when PROGRAM says it holds the cue, and fire through `sendVerb` like a
   * press. Page memory, as everything unpublished is. The engine reads the page through `armPage`,
   * set every render, so the send path reads this rundown and never a stale one.
   */
  const cueArms = useStorePart(session.arms);
  const armPage = useRef<CueArmPage | null>(null);
  const armEngine = useRef<CueArmEngine | null>(null);
  useEffect(() => {
    const engine = startCueArmEngine(session, CUE_ARM_IO, () => armPage.current!);
    armEngine.current = engine;
    return () => {
      engine.stop();
      armEngine.current = null;
    };
  }, [session]);
  /**
   * A FOLDER'S TAKE, OUT AND STEP (control/folderPlayout.ts): one per session, with what the folders
   * remember - where each One-by-one folder's step stands, why the last folder Take missed each cue,
   * and which folders are still being sent - in the session's `folders` part. It reads this page
   * through `folderPage`, set every render, so a press sees the render it was made from.
   *
   * The page draws the part at React's ordinary pace, as the page state it replaced did, and not
   * through `useStorePart`, whose updates render synchronously: a second SPACE one task after a
   * folder's Take must still meet the render the first press met, which ignores it (the run is
   * already registered), rather than one that reads the folder as up and takes it off
   * (e2e/playout-air-contract.spec.ts S3).
   */
  const folderMemory = usePacedPart(session.folders, wholePart);
  const { folderSteps, takeMisses, sending: sendingFolders } = folderMemory;
  const folderPage = useRef<FolderPage | null>(null);
  const folderPlayout = useMemo(() => createFolderPlayout(session, FOLDER_IO, () => folderPage.current!), [session]);
  const serverOwnership = useStorePart(serverPlayout.ownership);
  const serverOnAir = serverOwnership.onAir;
  /** How many times this page has rendered - published on its root as `data-renders`, which is how
   *  e2e/playout-clock.spec.ts proves the server's readings do not re-render it. */
  const renders = useRef(0);
  renders.current += 1;
  /** What NoaCG Bridge last said: the server's status, the output's slot, the server files and
   *  whether this session saw its output on the slot (control/bridgeWatch.ts asks, below). */
  const { status: bridgeStatus, outputSlot, serverFiles, slotSeenOurs } = useStorePart(session.bridge);
  /** The Bridge watch, while it runs: an output action and a server verb reach it here. */
  const bridgeWatch = useRef<BridgeWatch | null>(null);
  /** Bumped by the Playout panel's Check again: the server and the slot are asked again at once. */
  const [checkAgainRev, setCheckAgainRev] = useState(0);
  /** Bumped by Put on air and Take off: only the slot changed, so only the slot is read again. */
  const [slotRev, setSlotRev] = useState(0);
  /** A graphic Take went out while nothing that could air it was reporting (AC-2 "No output"). */
  const [noOutputTake, setNoOutputTake] = useState(false);
  /**
   * THE ONE MARKER WRITE (control/airState.ts `moveLiveCue`), and why every write is counted in the
   * `air` part's `moves`.
   *
   * The boot resolve (control/sessionWire.ts) reads the production over the wire and then SEEDS
   * this map with the answer (control/airState.ts `seedFromResolve`). That read is a round trip - about a millisecond against a local stack and
   * ~170 ms from a runner to hosted staging - and a Take pressed while it is in flight moves
   * the map first. The answer then lands carrying the picture from BEFORE that press and
   * replaces it, so the dashboard says nothing is on air about a graphic that is.
   *
   * Nothing recovers it. The take's own rows come back through `applyCommand`, which claims
   * each message once and already claimed these at send time (`applyHere`), so the row that
   * would restore the marker is dropped as a duplicate - correctly, for its own purpose.
   * The page stays wrong until it is reloaded, with Out, Update and Next all greyed because
   * they are gated on this map, so the operator cannot even take the graphic off.
   *
   * Measured on hosted staging 2026-09-20: `relay-cold-boot` hung for its whole 300 s budget
   * on a disabled Out button, and the page snapshot at that moment read "PROGRAM - ON AIR
   * nothing on air" while the server's `live_cue` held the take the spec had just asserted.
   * Only the hosted tier ever saw it, which is what that tier is for.
   */
  const setLiveCue = useCallback(
    (next: LiveCueMap | ((map: LiveCueMap) => LiveCueMap)) => session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, next) })),
    [session],
  );
  /** Lines only this page writes into the action log (an unpublished send, a timed cue, a note). */
  const logHere = useCallback(
    (lines: ((id: number) => LogEntry | null)[]) => session.apply((parts) => ({ ...parts, log: loggedHere(parts.log, lines, appendLogEntries) })),
    [session],
  );
  /**
   * HAS THE LIVE LOG CONNECTION EVER JOINED, and what Realtime last said about it.
   *
   * `followControlLog` has reported this since it was written, for a surface willing to show
   * it - and until now no surface asked. That is why a production whose channel never joins
   * looks exactly like a quiet one: commands still arrive, on the durable road, whenever the
   * 30-second poll comes round, and nothing on screen says the fast road is missing.
   *
   * It is the question three hosted failures on 2026-09-20 left open and nobody could answer
   * from the artifact, because the answer was never rendered. Null until the follower reports
   * anything, which is also the offline and unpublished case - there is no channel to judge.
   */
  const [follow, setFollow] = useState<ControlFollowStatus | null>(null);
  /** WHAT IS KNOWN OF THE LAST GRAPHIC COMMAND (data-sources C6, AC-16; control/playoutStatus.ts
   *  `programAir`): sends still waiting for the log's answer, whether a failed one is still owed
   *  (`sendDebts`, the one record of that), and when the log last took one. Published only; an
   *  unpublished Take never leaves this page. */
  const [sendingNow, setSendingNow] = useState(0);
  const [sendOwed, setSendOwed] = useState(false);
  const [loggedAt, setLoggedAt] = useState<number | null>(null);
  /** The browser has no network: nothing from the server reaches this page. */
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  /** The FAST road's own join status (null until it reports), for this page's Presence entry. */
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  /** The follow's resolve has FAILED and is being asked again (a database or PostgREST outage).
   *  Before this the follow gave up on one failure and the page stayed silent until a reload. */
  const [resolveWaiting, setResolveWaiting] = useState(false);
  /** This page's sends have no per-graphic order (protocol 1, hostedControl.ts `sendsInOrder`). */
  const [unordered, setUnordered] = useState(false);
  /** Each graphic's last reported MACHINE state, keyed by pool name. Two sources converge on
   *  the same answer: the local PROGRAM monitor's own state replies (fresh — the stage posts
   *  one after every applied command), and the wire's {t:'live'} report rows, which also cover
   *  what happened before this page opened. The event buttons grey against this. */
  const [machineStates, setMachineStates] = useState<Record<string, { groups?: Record<string, string> } | null>>({});
  /** Per graphic, the field ids the PROGRAM monitor last reported as too long to fit
   *  (`noacgTextOverflow()`). This is the ON-AIR answer, which is why it is kept apart from the
   *  preview's below: the editor pointed at the live cue must warn about what air is showing,
   *  not about the cue sitting on preview. Only the monitor can answer it - the fit ladder is a
   *  measurement of the rendered graphic, and no source check can stand in for it. */
  const [programOverflow, setProgramOverflow] = useState<Record<string, string[]>>({});
  const noteMachineState = useCallback(
    (graphic: string, state: { groups?: Record<string, string> } | null, overflow?: string[]) => {
      setMachineStates((m) => {
        if (JSON.stringify(m[graphic] ?? null) === JSON.stringify(state)) return m;
        return { ...m, [graphic]: state };
      });
      // The wire's `live` rows carry no overflow (a report row is the renderer naming its
      // state), so those callers pass nothing and the last monitor answer stands.
      if (!overflow) return;
      setProgramOverflow((m) => {
        if ((m[graphic] ?? []).join(',') === overflow.join(',')) return m;
        return { ...m, [graphic]: overflow };
      });
    },
    [],
  );
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;
  // Another production, or the same one published or unpublished: the last answer was not its.
  useEffect(() => {
    setSendOwed(false);
    setLoggedAt(null);
  }, [hostedSlug]);
  /** The graphics whose PUBLISHED payload still reads a Sheet in its own code, as this page last saw
   *  it (its resolve, its own successful Publish): what the output runs, not what the copy says, so
   *  a Publish that failed after refreshing the copy unlocks nothing (C6). */
  const [publishedReaders, setPublishedReaders] = useState<ReadonlySet<string>>(() => new Set());
  /** Every graphic this browser has seen with a reader (design, copy or published payload) and not
   *  yet seen gone from every output: the ones whose outputs must be wholly on the published version
   *  before Connect (C6). Kept across a reload (model/ownReaderHolds.ts), because a reloaded page
   *  sees only clean scripts while an output may still run an old on-air frame. */
  const [formerReaders, setFormerReadersState] = useState<ReadonlySet<string>>(() => new Set());
  /** The production's live state is recovered from the wire (its resolve and the rows after it):
   *  until then an empty on-air map is not evidence that a graphic is off air. */
  const [liveRecovered, setLiveRecovered] = useState(false);
  useEffect(() => {
    setLiveRecovered(false);
    setPublishedReaders(new Set());
    setFormerReadersState(show ? storedFormerReaders(show.id) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per production, not per record write
  }, [hostedSlug, show?.id]);
  // Timed cues on a published production need a backend that keeps their arms (0075); with none
  // at all, nothing does.
  const armsServer = hostedSlug && !backendConfigured ? 'missing' : armsServerState;
  /** This page on the production's live topic, and the outputs it hears there (the health line). */
  const livePresence = useLivePresence(hostedSlug && isBackendConfigured() ? (show?.id ?? null) : null, 'production', {
    log: follow ? follow.status === 'SUBSCRIBED' : null,
    cmd: commandStatus === null ? null : commandStatus === 'SUBSCRIBED',
  });
  /** READY (components/control/OutputHealth.tsx): the published version this page knows (its
   *  resolve, then each of its own publishes), and the outputs it expects, remembered per production
   *  in this browser and announced on the live topic so the hosted page and the phone count the
   *  same ones. */
  const [publishedStamp, setPublishedStamp] = useState<PayloadVersion | null>(null);
  const publishedVer = useMemo<HeldVersion | null>(() => (hostedSlug && publishedStamp ? { n: publishedStamp.n, h: publishedStamp.h } : null), [hostedSlug, publishedStamp]);
  /** Changed since the last publish: the record itself, or what the outputs would render (a graphic
   *  edited in the library, which never touches the record) - usePublishDrift. */
  const authoringAllowed = useAccountAuthoring();
  const { unpublished: unpublishedChanges, requiresPreparation, check: checkUnpublished } = usePublishDrift(show, publishedStamp?.g ?? null);
  // EXPECTED FOR THIS SESSION ONLY (playout-workflow-simplification D4): an output seen since this
  // page opened and then gone is lost, in red; yesterday's OBS is never expected today, so a page
  // opened before the studio is up stays quiet.
  const { expected: expectedOutputs, forget: forgetOutput } = useExpectedOutputs(
    hostedSlug && isBackendConfigured() ? (show?.id ?? null) : null,
    livePresence,
    false,
  );
  /** PREPARE FOR LIVE (components/control/PrepareForLive.tsx): the last stamp, kept per production
   *  in this browser, and the request to the outputs while a run is out. Both are announced. */
  const [readyStamp, setReadyStamp] = useState<ReadyStamp | null>(null);
  const [prepRequest, setPrepRequest] = useState<PrepRequest | null>(null);
  useEffect(() => {
    setReadyStamp(show?.id ? loadReadyMemory(show.id).stamp : null);
    setPrepRequest(null);
  }, [show?.id]);
  /** Take out request `id`, and only that one: Prepare for Live and every publish each put one in,
   *  and the newer stays when the older one's time is up. */
  const dropPrep = useCallback((id: string) => setPrepRequest((cur) => (cur?.id === id ? null : cur)), []);
  const relevanceSettings = loadPlayoutSettings();
  const casparTarget = casparOutputTarget(relevanceSettings);
  const onAirChanged = (what: 'air' | 'stop', result: PlayoutResult, target: string) => {
    bridgeWatch.current?.slotActed();
    if (show && result.state === 'ok') {
      saveReadyMemory(show.id, { ...loadReadyMemory(show.id), casparOutput: what === 'air' ? target : undefined });
      // Unloading on purpose is not losing the slot.
      if (what === 'stop') writeBridge(session, { slotSeenOurs: false });
    }
    setSlotRev((n) => n + 1);
  };
  /** THE CASPARCG SWITCH (playout-workflow-simplification AC-4): what the operator set, else what
   *  this production already does (model/outputSetup.ts `casparSwitch`). Everything CasparCG on
   *  this page follows it: the Bridge poll, the slot, the add actions, Load and the status. */
  /** Where this production was last put on its CasparCG slot from this browser (model/readyMemory). */
  const casparOutputMemory = show ? loadReadyMemory(show.id).casparOutput : undefined;
  const casparOn = !!show && casparSwitch({
    setup: show.outputSetup,
    serverCues: (show.cues ?? []).some((c) => c.source === 'playout'),
    legacyActivity: casparOutputMemory === casparTarget,
    accountDefault: accountCaspar ?? null,
  });
  const playoutRelevance = relevantPlayout({ configured: playoutConfigured(relevanceSettings), casparOn });
  /** Prepare for Live's own publish, set once `publishNow` exists below. */
  const preparePublishRef = useRef<() => Promise<HeldVersion | null>>(async () => null);
  const prepareFlow = usePrepareForLive({
    showId: show?.id ?? null,
    presence: livePresence,
    expected: expectedOutputs,
    published: publishedVer,
    unpublishedChanges,
    recheckChanges: checkUnpublished,
    publish: () => preparePublishRef.current(),
    onPrep: (prep, endOf) => (prep ? setPrepRequest(prep) : endOf ? dropPrep(endOf) : setPrepRequest(null)),
    onStamp: (stamp) => {
      if (!show) return;
      setReadyStamp(stamp);
      saveReadyMemory(show.id, { ...loadReadyMemory(show.id), stamp });
    },
    bridge: () => {
      if (playoutRelevance.bridge) setCheckAgainRev((n) => n + 1);
      return gatherBridgeFacts(loadPlayoutSettings(), show ?? {}, playoutRelevance);
    },
    ping: (id) => (hostedSlug ? controlPingSeq(hostedSlug, id) : Promise.resolve({ ok: false, unavailable: true, detail: 'not published' })),
  });
  const { announce } = livePresence;
  useEffect(() => {
    announce({ pub: publishedVer, exp: announcedExpected(expectedOutputs, livePresence), stamp: readyStamp, prep: prepRequest });
  }, [announce, publishedVer, expectedOutputs, livePresence, readyStamp, prepRequest]);
  /** READY as this page reads it (components/control/OutputHealth.tsx): rolled into the one playout
   *  status, with its output cards listed in the Playout panel. */
  const readiness = useReadinessView({
    presence: livePresence,
    seenAt: outputSeenAt,
    heartbeatLive: true,
    known: !!show?.outputOpenedAt,
    now,
    published: publishedVer,
    expected: expectedOutputs,
    stamp: readyStamp,
    onForget: forgetOutput,
  });
  /** WHAT THIS PAGE HAS SEEN THE PUBLISHED OUTPUT RUN, for the own-reader gate (C6): the payload's
   *  readers, and the graphics an output keeps on an earlier frame until they are cleared (its
   *  per-graphic replacement report, `chg.w`). */
  // An output that reports anything still pending (preparing, failed, waiting for clear), or that
  // holds another version than the published one, has not taken it wholly.
  const outputsBehind = livePresence.peers.some(
    (p) => p.kind === 'output' && !!p.ready && (!!p.ready.chg || (!!publishedVer && p.ready.v?.h !== publishedVer.h)),
  );
  // A stop recorded on the production (`ownReaderStops`, by whichever browser published it) holds
  // here too: this browser may never have seen the reader the output still runs.
  const stopsKey = show ? publishedReaderStops(show).join('\n') : '';
  const stops = useMemo(() => (stopsKey ? stopsKey.split('\n') : []), [stopsKey]);
  const outputObservations = useMemo(() => ({ reads: publishedReaders, former: formerReaders, stops }), [publishedReaders, formerReaders, stops]);
  const ownReaders = useMemo(
    () => (show ? ownSheetReaders(show.graphics, library, !!hostedSlug, outputObservations) : []),
    [show, library, hostedSlug, outputObservations],
  );
  // What Connect data… holds back, recorded for the binding write path and the Data view's tab
  // (model/ownReaderHolds.ts), so no door binds a field the old reader may still write.
  useEffect(() => {
    if (!show) return;
    setOwnReaderHolds(show.id, show.graphics.filter((g) => ownSheetReader(g, library, !!hostedSlug, outputObservations).gate !== 'none').map((g) => g.name));
  }, [show, library, hostedSlug, outputObservations]);
  useEffect(() => {
    if (!show) return;
    const seen = [...publishedReaders, ...ownReaders.map((r) => r.graphic)].filter((name) => !formerReaders.has(name));
    // Gone only on positive evidence, never on an output's absence (one can drop out of Presence and
    // keep its frames): the graphic is off air, so every output still following the log has taken
    // its Out and swaps it to the published version (output/swapPlan.ts); presence has joined and no
    // output reports anything pending or another version; and nothing reads in the design, the copy
    // or the published payload. An output that connects later loads the published version afresh.
    // An empty on-air map before the live state is recovered is not evidence (a page reopened
    // onto a graphic that is still up), so nothing clears until the resolve has answered.
    const verified = !!hostedSlug && liveRecovered && livePresence.status === 'joined' && !outputsBehind;
    const gone = verified
      ? [...new Set([...formerReaders, ...stops])].filter((name) => !liveCue[name] && !publishedReaders.has(name) && !ownReaders.some((r) => r.graphic === name))
      : [];
    // The production's own record clears on the same evidence, for every browser.
    const stopsGone = gone.filter((name) => stops.includes(name));
    if (stopsGone.length > 0) {
      // A background write: a refused one keeps the hold, and the app-level dialog reports it.
      const cleared = setOwnReaderStops(show.id, { clear: stopsGone });
      if (!cleared.error) setShows(cleared.shows);
    }
    const formerGone = gone.filter((name) => formerReaders.has(name));
    if (seen.length === 0 && formerGone.length === 0) return;
    const next = new Set([...formerReaders, ...seen].filter((name) => !gone.includes(name)));
    setFormerReadersState(next);
    setStoredFormerReaders(show.id, next);
  }, [show, hostedSlug, liveRecovered, publishedReaders, ownReaders, formerReaders, stops, livePresence.status, outputsBehind, liveCue]);
  /** Something that can air a graphic is reporting right now: a renderer, or this production on its
   *  CasparCG slot. Read by the send path, which decides "No output" (AC-2). */
  const usableOutput =
    readiness.outputs.some((line) => line.present) ||
    (readiness.summary.source !== 'ready' && readiness.summary.outputs > 0) ||
    outputSlot?.holds === 'ours';
  const usableOutputRef = useRef(usableOutput);
  usableOutputRef.current = usableOutput;
  useEffect(() => {
    if (usableOutput || !hostedSlug) setNoOutputTake(false);
  }, [usableOutput, hostedSlug]);
  /** The production's row id — the command channel's key on the fast road. Read out here rather
   *  than inside the verbs so a send depends on the ID and not on the whole show record. */
  const showId = show?.id ?? null;

  const programRef = useRef<ProgramStageHandle>(null);
  /**
   * What each graphic was last SENT (`airedData`, the `air` part's `aired`) is the input to
   * rebuilding the PROGRAM monitor after it is unmounted (the Data-workspace round trip): the wire
   * report is a snapshot taken when this page resolved the published show and never moves again,
   * and an unpublished production has no report at all, so after the first take it is the only
   * current answer to "what is on air". It also answers whether the values in front of the
   * operator have actually been SENT: an on-air cue whose draft has moved past what air is showing
   * has to say so rather than wait to be noticed. control/airState.ts `rememberAired` merges it.
   */
  /** The graphics a failed send left on this monitor alone, so its notice comes down once they
   *  have all been sent again (failedSends.ts `createSendDebts`). Per production: the page stays
   *  mounted across a switch, and a graphic's name is only unique within one production. */
  const sendDebts = useRef(createSendDebts());
  useEffect(() => {
    sendDebts.current = createSendDebts();
  }, [showId]);

  /**
   * THE MATCH CLOCK ON THE LOCAL PROGRAM MONITOR (docs/SPORTS_PACK.md, control/matchClockWire.ts).
   *
   * This monitor follows the same commands air does but never ran `clockRowEffect`, so it let
   * the runtime mint its OWN origin when `clockStart` arrived: it could sit a second off the
   * published renderer, and — the part that actually showed — a stage remount rebuilt it from
   * the last SENT value, so a running clock came back at its seed. It now makes the same
   * decision the hosted renderer makes, against the LOCAL receive instant rather than a server
   * row's `created_at`: the two therefore agree within delivery skew rather than exactly, which
   * is the honest ceiling for a monitor. **It is a monitor, not air** — nothing here reaches a
   * production's renderers.
   *
   * The clock is read out of each graphic's own published markup, keyed by the name the wire
   * uses (`buildOutputPayload` keys the payload by `g.name`, and so does every command), and
   * read through a ref so the ONE entry point (`applyProgram`) is stable: the log follower binds
   * it once and must still see a pool the operator has changed since.
   */
  const clockSpecs = useMemo(() => {
    const out = new Map<string, ClockSpec>();
    for (const g of show?.graphics ?? []) {
      const spec = clockSpecFromHtml(templateForSavedGraphic(g, library).html);
      if (spec) out.set(g.name, spec);
    }
    return out;
  }, [show, library]);
  const clockSpecsRef = useRef(clockSpecs);
  clockSpecsRef.current = clockSpecs;
  /** …and the debate boards' PAIRS of speaking clocks, read the same way off the same markup.
   *  A graphic carries one kind or the other, never both. */
  const speakingClocks = useMemo(() => {
    const out = new Map<string, SpeakingClockPair>();
    for (const g of show?.graphics ?? []) {
      const pair = speakingClocksFromHtml(templateForSavedGraphic(g, library).html);
      if (pair) out.set(g.name, pair);
    }
    return out;
  }, [show, library]);
  const speakingClocksRef = useRef(speakingClocks);
  speakingClocksRef.current = speakingClocks;
  /**
   * The graphics whose machine EVENTS may ride the fast road like a Take: every one that runs no
   * clock, so needs no server instant (matchClockWire `eventsNeedServerTime`, and
   * SLOW_AFTER_EVENT_MS in hostedControl.ts for why a clock's events stay slow). This is what
   * lets a quiz's Select and Reveal reach air as quickly as an Update.
   *
   * READ OFF THE PUBLISHED PAYLOAD, not the library, because the renderer runs the published
   * snapshot: a clock edited away in the editor and not republished would otherwise send the
   * still-published clock's events fast and put this laptop's skew on air. Empty until the
   * published show is in hand, so the slow road is what an unanswered question gets. The hosted
   * page derives the same set from the same payload.
   */
  const fastEventGraphicsRef = useRef<Set<string>>(new Set());
  /**
   * The clocks the production's graphics carry, as control/airState.ts reads them. The monitor's
   * clock memory (each clock field's value ON THE WIRE, stamped with its origin, and a debate
   * board's pair) is the `air` part's `clocks` and `speaking`: deliberately NOT folded into
   * `airedData`, which also answers "are the operator's values on air yet", and a stamped clock
   * value differs from the cue's plain one forever.
   */
  const clockSpecsOf = useCallback((): ClockSpecs => ({ clocks: clockSpecsRef.current, pairs: speakingClocksRef.current }), []);
  /**
   * The ONE way a command reaches the PROGRAM monitor, so the clock cannot be handled on one
   * route and missed on the other (the wire follower and the offline verbs both come here).
   * control/airState.ts `programItems` writes each clock's value around its verb, against the
   * LOCAL receive instant, and the stage is handed what that fold returns. `remember` also
   * records the items as aired, in the same write (an unpublished send).
   */
  const foldProgram = useCallback(
    (fold: (air: AirPart, specs: ClockSpecs, now: number) => { air: AirPart; out: ControlSendItem[] }) => {
      let out: ControlSendItem[] = [];
      session.apply((parts) => {
        const run = fold(parts.air, clockSpecsOf(), Date.now());
        out = run.out;
        return { ...parts, air: run.air };
      });
      programRef.current?.apply(out);
    },
    [session, clockSpecsOf],
  );
  const applyProgram = useCallback(
    (items: ReplayItem[], remember = false) =>
      foldProgram((air, specs, now) => programItems(remember ? rememberAired(air, items) : air, items, specs, now)),
    [foldProgram],
  );

  /**
   * WHAT THE OPERATOR SEES, from whichever road the command arrived on.
   *
   * A published verb travels twice (src/control/commandRoads.ts): the database's broadcast on the
   * production's private topic, about 100 ms after the press, and the durable row behind it at
   * 130-650 with a slow mode past 600. This page also presses the verbs itself, so
   * there is a third arrival that is faster than either - its own send. All three end up here and
   * the session's `applied` decides which one counts, on the id the press minted
   * (control/airState.ts `claimAndApply`, which also moves the ON AIR marker on the same road as
   * the picture: split across the two, the graphic would be up for a third of a second while the
   * rundown still said the layer was clear).
   *
   * Getting that wrong is invisible. A second `play` re-runs an entrance and settles on the
   * picture that was already there, which is why `PayloadStage` counts them and why
   * e2e/configured/playout-both-roads.spec.ts reads the count rather than the screen.
   *
   * The DURABLE half of a row - the action log line, the renderer's own reports, the signal that
   * the data API wrote - stays in the wire's `onRow` (control/sessionWire.ts), because that half
   * must happen once per ROW and is not what an operator is waiting for.
   */
  const applyCommand = useCallback(
    (items: { graphic: string; msg: ControlEventRow['msg'] }[]) =>
      foldProgram((air, specs, now) => claimAndApply(air, items, session.applied, specs, now)),
    [session, foldProgram],
  );
  /** Another screen's commands, told to the live candidates (control/selectionAir.ts
   *  `foreignSelection`); set below, once the layers' io exists. */
  const heardFromOthers = useRef<(items: { graphic: string; msg: ControlEventRow['msg'] }[]) => void>(() => {});
  /** What the sender makes of commands heard back (control/graphicVerbs.ts `heard`): a marker press
   *  that got no answer landing after all, and this page's own markers left to it. Set below, once
   *  the verbs exist. */
  const heardMarkers = useRef<
    (items: { graphic: string; msg: ControlEventRow['msg'] }[], applied: (msg: unknown) => boolean) => { graphic: string; msg: ControlEventRow['msg'] }[]
  >((items) => items);
  /** Commands the server sent back, on either road. One of a send that failed here landed after
   *  all, so the notice about it comes down (failedSends.ts `heard`). */
  const hearCommand = useCallback(
    (items: { graphic: string; msg: ControlEventRow['msg'] }[]) => {
      const settle = sendDebts.current.heard(items);
      if (settle) {
        setNote(settle);
        // A failed send landed after all: the log has it now.
        setSendOwed(sendDebts.current.owed() > 0);
        setLoggedAt(Date.now());
        // A folder Take keeps each member's failure beside its cue; one that landed is no miss.
        folderPlayout.settleMisses(settle);
      }
      // Each command once, on whichever road came first.
      heardFromOthers.current(items.filter((item) => !session.applied.has(item.msg)));
      // This page's own markers are the sender's to write (control/graphicVerbs.ts `heard`).
      applyCommand(heardMarkers.current(items, (msg) => session.applied.has(msg)));
    },
    [applyCommand, folderPlayout, session],
  );

  const cues = useMemo(() => show?.cues ?? [], [show]);
  const folders = useMemo(() => show?.folders ?? NO_FOLDERS, [show]);
  /** The rundown as it is drawn: a header for each run of a folder, its cues under it unless it is
   *  collapsed (model/rundownRows.ts). It only reads: nothing reorders here. */
  const rundown = useMemo(() => rundownView({ cues, folders }), [cues, folders]);
  const graphicByPoolId = useMemo(() => new Map((show?.graphics ?? []).map((g) => [g.id, g] as const)), [show]);
  /** The folder the operator holds, while it is there: a folder that has gone reads as none. */
  const selectedFolder = selectedFolderRow ? (rundown.folders.get(selectedFolderRow.folderId) ?? null) : null;
  // THE ONE GATE: a held folder row reads as "no cue selected", so every cue-derived value - the
  // Take check, SPACE's decision, Re-take, Update, Next, the editor, the ⚡ actions - stands down by
  // the null path the empty rundown already proves.
  const selectedCue = selectedFolder ? null : (cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null);
  /** Where the keyboard stands: the held header, or the row showing the selected cue - its folder's
   *  header while it is collapsed. */
  const cursorRow = cursorRowId(rundown, selectedFolder ? selectedFolderRow : null, selectedCue?.id ?? null);
  /** The range as it stands: a cue removed since reads as not in it. */
  const range = useMemo(() => new Set(rangeIds.filter((id) => rundown.rowOf.has(id))), [rangeIds, rundown]);
  const heldMembers = selectedFolder ? (rundown.members.get(selectedFolder.id) ?? []) : [];
  const cueGraphicName = useCallback(
    (cue: ShowCue) => graphicByPoolId.get(cue.sourceId)?.name ?? null,
    [graphicByPoolId],
  );
  /** The playout server's item a cue drives, when it is that kind of cue (null for a graphic). */
  const playoutItems = useMemo(() => show?.playoutItems ?? [], [show]);
  const playoutItemFor = useCallback(
    (cue: ShowCue): PlayoutItem | null => playoutItemOf({ playoutItems }, cue),
    [playoutItems],
  );
  /** What is on air of each folder - every state its header, or a hardware button standing for it,
   *  lights (control/folderAir.ts). From the OWNERSHIP part and liveCue only, never the timing part,
   *  so a reading that moves only a clip's position does not re-render the page. */
  const folderStates = useMemo(
    () => folderAir({ folders, cues, items: playoutItems, ownership: serverOwnership, liveCue, graphicName: cueGraphicName, graphicsAir: !!hostedSlug }),
    [folders, cues, playoutItems, serverOwnership, liveCue, cueGraphicName, hostedSlug],
  );
  /** A One-by-one folder's cues as its step reads them: a pool graphic or a server template is a
   *  graphic the step takes off, a clip, audio file or still is not (control/folderStep.ts). */
  const stepMembersOf = useCallback(
    (folderId: string): StepMember[] =>
      (rundown.members.get(folderId) ?? []).map((c) => {
        const item = playoutItemFor(c);
        return item ? { id: c.id, graphic: item.kind === 'template', replaces: `item:${item.id}` } : { id: c.id, graphic: true, replaces: `pool:${c.sourceId}` };
      }),
    [rundown, playoutItemFor],
  );
  /** What one press on a One-by-one folder's header does, from what this render shows. The press
   *  itself decides again from the store as it stands then (`stepFolder`). */
  const stepOf = (folderId: string): FolderStep => {
    const members = stepMembersOf(folderId);
    const up = new Set(members.filter((m) => folderStates[folderId]?.onAir.includes(m.id)).map((m) => m.id));
    return folderStep(members, folderSteps[folderId], up);
  };
  /** The held header's step, when it is a One-by-one folder's. */
  const heldStep = selectedFolder && folderMode(selectedFolder) === 'manual' ? stepOf(selectedFolder.id) : null;
  /** What the PREVIEW monitor shows: the selection in 'take' mode, the staged cue otherwise -
   *  and nothing at all in that mode until SPACE has put something there. A staged cue that
   *  has since been deleted reads as nothing rather than as a dangling id. A held folder shows the
   *  cue that airs first: a Play-through or All-together folder's first, a One-by-one folder's next. */
  const previewCue =
    spaceMode === 'take'
      ? selectedFolder
        ? heldStep
          ? heldStep.kind === 'take'
            ? (cues.find((c) => c.id === heldStep.cueId) ?? null)
            : null
          : (heldMembers[0] ?? null)
        : selectedCue
      : (cues.find((c) => c.id === stagedCueId) ?? null);
  /** Every One-by-one folder's next cue, marked NEXT on its row once the folder has been started (or
   *  while its header is held, when PREVIEW shows it too). */
  const stepNext = new Set<string>();
  for (const folder of rundown.folders.values()) {
    if (folderMode(folder) !== 'manual') continue;
    const started = typeof folderSteps[folder.id] === 'string' || (folderStates[folder.id]?.onAir.length ?? 0) > 0;
    if (!started && selectedFolder?.id !== folder.id) continue;
    const step = stepOf(folder.id);
    if (step.kind === 'take') stepNext.add(step.cueId);
  }
  /** Every clip's place in its Play-through folder, worked out once per rundown: what its row, its
   *  panel and the two-slot check read. */
  const places = useMemo(() => throughPlaces(cues, playoutItems, folders), [cues, playoutItems, folders]);
  // EVERYTHING THIS PAGE ASKS NOACG BRIDGE ON ITS OWN (control/bridgeWatch.ts): whether the server
  // answers, the studio setup the Bridge keeps, what the output's slot holds, whether the rundown's
  // server files are there, what an older clip is, and what each channel the rundown uses holds.
  // One watch per session; after each render it is handed what the page knows, and each poll
  // restarts on its own key (the module lists them), with the status read from the `bridge` part.
  // The status is asked only while a playout server is SET UP and this production's CasparCG switch
  // is on - one loopback request every few seconds, so a browser never paired with a Bridge meets
  // no local-network prompt (playout-workflow-simplification AC-4). It restarts only when WHERE it
  // asks changes - the Bridge, its token, the server - or on Check again.
  const linkSettings = loadPlayoutSettings();
  const statusTarget = casparOn && playoutConfigured(linkSettings)
    ? [linkSettings.agentUrl, linkSettings.agentToken, linkSettings.host.trim(), linkSettings.amcpPort].join(' ')
    : null;
  const slotReadable = stateReadable(bridgeStatus);
  const bridgeOk = bridgeStatus?.state === 'ok';
  const serverFileItems = playoutItems.filter(i => cues.some(c => c.source === 'playout' && c.sourceId === i.id));
  const serverFileKey = JSON.stringify({ show: show?.id, target: statusTarget, items: serverFileItems.map(i => ({ id: i.id, kind: i.kind, name: i.name })), refs: cues.filter(c => c.source === 'playout').map(c => c.sourceId) });
  const needsServerFiles = cues.some(c => c.source === 'playout');
  const rundownRef = useRef({ cues, playoutItems, folders });
  rundownRef.current = { cues, playoutItems, folders };
  useEffect(() => {
    const watch = startBridgeWatch(session, BRIDGE_IO, {
      rundown: () => rundownRef.current,
      slots: { itemSlot, folderSlot },
      serverPlayout,
      settingsChanged: () => setPlayoutSettingsRev((n) => n + 1),
      learnt: (showId, facts) => setShows(fillPlayoutItemFacts(showId, facts)),
    });
    bridgeWatch.current = watch;
    return () => {
      watch.stop();
      bridgeWatch.current = null;
    };
  }, [session, serverPlayout]);
  useEffect(() => {
    bridgeWatch.current?.update({
      target: statusTarget,
      hostedSlug,
      casparOn,
      outputSlug: show?.outputSlug ?? null,
      showId,
      casparTarget,
      serverFiles: needsServerFiles ? serverFileKey : null,
      playoutItems,
      checkAgain: checkAgainRev,
      settingsRev: playoutSettingsRev,
      slotRev,
    });
  });

  // ── THE CUE DRAFT (control/cueDraft.ts): the selected cue's UNSAVED edits, in the session's
  // `draft` part. Local echo for instant typing, flushed to the record on a 300 ms idle (a keystroke
  // must not parse + rewrite the whole shows store — the store embeds full template snapshots, so
  // that is a visible input-lag class of cost), on a switch, before a verb reads it and when the page
  // may go. The editor, the rundown and the PREVIEW monitor subscribe to the part themselves; the page
  // only to whether anything is unsent (D12), so typing does not re-render it. ──
  /** The production this render is of: what the rundown's long-lived writes check before they land. */
  const draftOwner = useRef(id); draftOwner.current = id;
  const historyRef = useRef<ReturnType<typeof useRundownHistory> | null>(null);
  const historySafety = useRef<(expected: RundownSlice, replacement: RundownSlice) => string | null>(() => 'Wait for the production to finish loading.');
  /** The rundown's cues as the last render held them: the record a draft falls back to. */
  const cuesRef = useRef<readonly ShowCue[]>([]);
  const cueDraft = useMemo(
    () =>
      createCueDraft(session, {
        canWrite: canAuthorAccount,
        editing: (group) => {
          window.dispatchEvent(new CustomEvent('spx-account-edit-pending'));
          historyRef.current?.beginGroup(group);
        },
        // The history is the page's, which moves on with the page: a draft of a production the
        // page has left is not written through it, and is saved at its session's end instead.
        writeCue: (cueId, fields) =>
          draftOwner.current === session.key ? historyRef.current!.writeDraft(() => updateShowCueChecked(session.key, cueId, fields)) : Promise.resolve(false),
        retainCue: (cueId, fields) => !updateShowCueChecked(session.key, cueId, fields).error,
        record: (cueId) => cuesRef.current.find((c) => c.id === cueId),
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      }),
    [session],
  );
  const { flush: flushDraft, cancel: cancelDraft } = cueDraft;
  const drawnDraft = useDrawnDraft(cueDraft.part);
  const history = useRundownHistory(show ?? null, setShows, setRundownNote, (a, b) => historySafety.current(a, b), cancelDraft);
  historyRef.current = history;
  useEffect(() => cueDraft.listen(DRAFT_ADAPTERS), [cueDraft]);
  useEffect(() => { void flushDraft(); void historyRef.current?.closeGroup(); }, [sub, flushDraft]);

  // ── PRODUCTION DATA: the tree, and what it resolves to (docs/PRODUCTION_DATA_PLAN.md) ────
  // The tree, its key and its two write roads are the session's `data` part, written only by
  // control/productionDataSession.ts, which says the rules. The page hands it the browser doors,
  // enters the mode the show is in, and reads the part. The DISPATCH sits further down, beside
  // `runVerb`, the sender it is handed.
  const dataSession = useMemo(
    () =>
      createProductionDataSession(session, {
        backendConfigured,
        loadLiveData,
        saveLiveData,
        productionDataKey,
        fetchProductionData,
        patchProductionData,
        patchProductionDataBySlug,
        every: (ms, run) => {
          const timer = window.setInterval(run, ms);
          return () => window.clearInterval(timer);
        },
        onStorage: (listener) => {
          const onStorage = (e: StorageEvent) => {
            if (e.key === null || e.key === PRODUCTION_DATA_KEY) listener();
          };
          window.addEventListener('storage', onStorage);
          return () => window.removeEventListener('storage', onStorage);
        },
        note: setNote,
      }),
    [session, backendConfigured],
  );
  useEffect(() => dataSession.published(hostedSlug), [dataSession, hostedSlug]);
  const { liveData, dataKey, treeRead } = useStorePart(session.data);
  const { setLiveData, patchBoundValues } = dataSession;

  /** Refuse a press on a shared value this page cannot count from yet, and say why. Bound presses
   *  are the only thing that has to wait: everything else on this surface reads the cue. */
  const boundPressReady = (): boolean => {
    if (!hostedSlug || treeRead) return true;
    setNote('This production’s shared values are still loading. Try that again in a moment.');
    return false;
  };

  const bindings = show?.bindings;
  /** What every bound field SHOULD be showing right now. */
  const resolved = useMemo(() => resolveBindings(liveData, bindings), [liveData, bindings]);
  const resolvedRef = useRef<ResolvedValues>(resolved);
  resolvedRef.current = resolved;
  /** One graphic's bound values from the newest tree: the ref a press's write moves at once, where
   *  `resolved` waits for the next render. */
  const boundNow = (graphic: string): Record<string, string> => resolveBindings(session.data.get().liveData, bindings)[graphic] ?? {};


  /**
   * The values a Take, an Update or the PREVIEW must carry for one graphic — bound fields
   * overlaid on the cue's own.
   *
   * THE RULE (plan §2.7): a bound field is never a stored cue value, so taking a cue prepared
   * at 1–0 while the tree says 3–2 airs 3–2. Read through a ref so long-lived callbacks do not
   * need this render's closure.
   */
  const withBoundValues = useCallback(
    (graphic: string, values: Record<string, string>): Record<string, string> => ({
      ...values,
      ...(resolvedRef.current[graphic] ?? {}),
    }),
    [],
  );

  // ── SHEET SOURCES: one browser reader per source while this page is open, under a lease, writing
  // through the session's source writer (control/sheetSource.ts says the rules). A reader is made
  // per source, tab and world (unpublished, or the published slug), and reads the bindings and
  // Pause at every read, so connecting a field or pausing needs no new reader.
  // The route keys this page by production (S4, #1566), so both live exactly as long as it does.
  const [sourceStatus] = useState(createSourceStatusStore);
  const [readerTab] = useState(() => `tab-${Math.random().toString(36).slice(2, 10)}`);
  const sourcesRef = useRef(show?.sources);
  sourcesRef.current = show?.sources;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const graphicsRef = useRef(show?.graphics);
  graphicsRef.current = show?.graphics;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  /** A pool graphic's fields as the editor draws them: its library version, not the snapshot. */
  const fieldsOf = useCallback((name: string): FieldDescriptor[] | null => {
    const graphic = graphicsRef.current?.find((g) => g.name === name);
    return graphic ? fieldDescriptors(templateForSavedGraphic(graphic, libraryRef.current).fields) : null;
  }, []);

  // ── LIVE CANDIDATES (E7.1; control/selectionAir.ts): what a cue's selection resolves to in the
  // newest tree, and the instances this page aired, kept in this browser across a reload. ──
  const collectionsRef = useRef(show?.collections);
  collectionsRef.current = show?.collections;
  const publishedRef = useRef(!!hostedSlug);
  publishedRef.current = !!hostedSlug;
  const hostedSlugRef = useRef(hostedSlug);
  hostedSlugRef.current = hostedSlug;
  /** The newest tree and records a selection resolves against; a published tree still unread is
   *  not one to take or judge from (control/selectionAir.ts `readable`). */
  const selectionFacts = useCallback(
    (): SelectionFacts => {
      const data = session.data.get();
      const slug = publishedRef.current ? hostedSlugRef.current : null;
      return { collections: collectionsRef.current, bindings: bindingsRef.current, tree: data.liveData, fieldsOf, readable: !publishedRef.current || data.treeRead, ordered: !slug || sendsInOrder(slug) };
    },
    [session, fieldsOf],
  );
  /** The fields of a cue nothing typed or pressed here may move (E7.1): its candidate's, and every
   *  field of a cue this build reads only (a later version's selection). */
  const candidateFields = (cue: ShowCue): string[] =>
    selectionReadOnly(cue, collectionsRef.current) ? (fieldsOf(cueGraphicName(cue) ?? '') ?? []).map((d) => d.key) : selectedFields(cue, collectionsRef.current);
  useEffect(() => session.selections.set(readSelectionAir(loadSelectionAir(id))), [session, id]);
  const keepSelections = useCallback(
    (next: SelectionAir) => {
      if (next === session.selections.get()) return;
      session.selections.set(next);
      saveSelectionAir(id, writeSelectionAir(next));
    },
    [session, id],
  );
  /** The follow pass, as the effect below runs it; set every render so it reads this render's facts. */
  const followRef = useRef<() => void>(() => {});
  // A layer whose sends' answers are lost (restored, or a press with no answer) waits out its
  // settling before it decides or sends: one follow pass when it ends, so a quiet tree still gets one.
  useEffect(
    () =>
      watchSettling(session.selections, {
        now: () => Date.now(),
        follow: () => followRef.current(),
        setTimeout: (run, ms) => window.setTimeout(run, ms),
        clearTimeout: (timer) => window.clearTimeout(timer),
      }),
    [session, id],
  );
  const selectionIo = useMemo<SelectionAirIo>(
    () => ({ part: session.selections, keep: keepSelections, now: () => Date.now(), followNow: () => followRef.current(), alive: session.alive }),
    [session, keepSelections],
  );
  heardFromOthers.current = (items) => foreignSelection(selectionIo, items, sentHere);
  /** A Take or an Update put this cue's selection on the layer (control/selectionAir.ts). */
  const selectionAired = useCallback(
    (graphic: string, cueId: string, take: SelectionTake, moves?: boolean) => pressSelection(selectionIo, graphic, cueId, take, moves),
    [selectionIo],
  );
  /** Every candidate cue's resolution in this render's tree, made once: the rundown, PREVIEW, the
   *  editor and the Take refusals all read it. A press resolves again from the newest tree. */
  const candidates = useMemo(() => {
    const facts = selectionFacts();
    return new Map(cues.filter((c) => c.selection !== undefined).map((c) => [c.id, selectionTake(c, cueGraphicName(c), facts)] as const));
    // The facts are read through refs; these are what they move with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues, liveData, treeRead, hostedSlug, show?.collections, bindings, selectionFacts, cueGraphicName]);
  const candidateTake = (cue: ShowCue): SelectionTake => candidates.get(cue.id) ?? selectionTake(cue, cueGraphicName(cue), selectionFacts());
  /** The edited cue's live candidate as the editor shows it (E7.1). */
  const candidateOf = (cue: ShowCue | null): CueCandidate | null => {
    if (!cue || cue.selection === undefined) return null;
    const fields = new Set(selectedFields(cue, show?.collections));
    const gate = selectionGate(cue, show?.collections, cueGraphicName(cue), bindings);
    if (gate.status === 'read-only') return { readOnly: gate.reason, label: '', fields, values: {}, notReady: null };
    const take = candidateTake(cue);
    const label = gate.status === 'ok' ? `Live candidate: ${gate.recipe.key.map((path, i) => `${path} ${String(gate.selection.key[i])}`).join(', ')}` : 'Live candidate';
    return { readOnly: null, label, fields, values: take.status === 'ok' ? take.values : {}, notReady: take.status === 'refused' ? take.reason : null };
  };
  /** The writer's menu for the edited cue (E7.2a): the people each of its graphic's recipes
   *  offers in this render's tree, and the cue's pick. Null for a cue no recipe serves, or one this
   *  build reads only. */
  const candidatePicker = (cue: ShowCue | null): CandidatePicker | null => {
    const graphic = cue ? cueGraphicName(cue) : null;
    if (!cue || !graphic || cue.source === 'playout' || selectionReadOnly(cue, show?.collections)) return null;
    const recipes = (show?.collections ?? []).flatMap((raw) => {
      const read = readCollectionRecipe(raw);
      return read.status === 'ok' && read.recipe.graphic === graphic && read.recipe.key.length >= 2 ? [read.recipe] : [];
    });
    if (recipes.length === 0) return null;
    const gate = selectionGate(cue, show?.collections, graphic, bindings);
    const pick = gate.status === 'ok' ? JSON.stringify([gate.selection.recipe, gate.selection.key]) : null;
    return {
      // This cue on air with another person than it now picks: the picture changes at ✎ Update.
      // Read by the editor from the session's own part, so a capture landing redraws the note.
      waitsForUpdate:
        liveCue[graphic] === cue.id
          ? {
              part: session.selections,
              differs: (air) => {
                const aired = airedSelectionOf(air, graphic);
                return !!aired?.known && aired.cueId === cue.id && JSON.stringify([aired.selection.recipe, aired.selection.key]) !== pick;
              },
            }
          : null,
      options: recipes.map((recipe) => {
        const listed = entitiesIn(recipe, liveData);
        return { recipe: recipe.id, ...('problem' in listed ? { entities: [], problem: listed.problem } : { entities: listed.entities, problem: null }) };
      }),
      value: pick ?? (cue.selection === undefined ? '' : 'invalid'),
      onPick: (recipe, key) => void pickCandidate(cue, recipe && key ? { v: SELECTION_VERSION, recipe, key } : null),
    };
  };
  /** THE SELECTION WRITER's one door from this page (model/shows.ts `setCueSelection`): the
   *  record is checked by the reader inside the write, on the record each door writes. Detaching
   *  (Fill) keeps what the candidate shows now as the cue's own values. A cue on air keeps its
   *  captured candidate until ✎ Update. */
  const pickCandidate = async (cue: ShowCue, selection: CueSelection | null) => {
    if (!show) return;
    const take = selection === null ? candidateTake(cue) : null;
    const snapshot = take?.status === 'ok' ? take.values : undefined;
    // A rundown edit like any other: one undoable step, said only once it lands.
    const saved = await writeRundown(
      () => setCueSelection(show.id, cue.id, selection, selectionCheck, snapshot),
      'Live candidate',
      'The live candidate was not saved',
    );
    // Nothing resolved to hold: the cue keeps the values it had, and says so.
    if (saved && cue.selection !== undefined && selection === null && !snapshot) setNote('Fixed values: the candidate could not be read, so the cue keeps its own values.');
  };
  /** `text` in the one form every field connected to `path` takes ("TRUE" is "1" for a toggle), or
   *  null when one cannot hold it or they need different forms (control/sheetSource.ts). */
  const sourceAccept = useCallback(
    (path: string, text: string): string | null => pathValue(connectedFields(bindingsRef.current, path, fieldsOf), text),
    [fieldsOf],
  );
  // A message Sheet's rows go to the production's inbox through the operator door (data-sources C3).
  const messages = useMessagesBackend(show ?? null).backend;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Its YouTube live chat keeps reading while the page is open, and reconnects on reload.
  useMessageSources(show ?? null, messages);
  // Sheet tabs and news feeds (data-sources C4) each have one reader; a feed's reads go through
  // the guarded feed route, every 5 minutes (control/feedSource.ts).
  // Only what a reader is built from, so a rename or a Pause never restarts one.
  const readerPlan = JSON.stringify(
    (show?.sources ?? []).filter(fillsFields).map((s) => [s.id, { kind: s.kind, config: s.config }, Boolean(s.inbox)] as ReaderPlan),
  );
  useEffect(() => {
    const plan = JSON.parse(readerPlan) as ReaderPlan[];
    const world = hostedSlug ?? 'local';
    const inboxes = new Map(
      plan
        .filter(([, , inbox]) => inbox)
        .map(([sourceId]) => [
          sourceId,
          createSheetInbox({
            sourceId,
            label: () => sourcesRef.current?.find((s) => s.id === sourceId)?.label ?? 'Messages',
            backend: () => messagesRef.current,
            holds: (): boolean => readers.get(sourceId)?.holds() ?? false,
            // The note is this Sheet's only while the problem lasts.
            onProblem: (problem) =>
              setNote((prev) => (problem ? `Message Sheet: ${problem}.` : prev?.startsWith('Message Sheet:') ? null : prev)),
          }),
        ]),
    );
    const readers: Map<string, SheetReader> = new Map(
      plan.map(([sourceId, source]) => {
        const common: Omit<SheetReaderOptions, 'shape'> = {
          key: `${id}:${sourceId}`,
          sourceId,
          tab: readerTab,
          world,
          io: {
            now: Date.now,
            setTimer: (run, ms) => setTimeout(run, ms),
            clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
            fetch: (url, init) => fetch(url, init),
            readLease: readSheetLease,
            writeLease: writeSheetLease,
            // Published, the lease lives on the row, shared with the other pages and the tick.
            door: hostedSlug
              ? publishedLeaseDoor({
                  slug: hostedSlug,
                  sourceId,
                  owner: readerTab,
                  hold: dataSession.holdServerTree,
                  note: setNote,
                  leaseMs: source.kind === 'feed' ? FEED_LEASE_MS : undefined,
                })
              : undefined,
          },
          connected: () => new Set(sourcePaths(bindingsRef.current, sourceId).map((p) => p.path)),
          accept: sourceAccept,
          paused: () => Boolean(sourcesRef.current?.find((s) => s.id === sourceId)?.paused),
          write: dataSession.applySourcePatch,
          onStatus: (status) => sourceStatus.set(sourceId, status),
        };
        const reader =
          source.kind === 'feed'
            ? createFeedReader({ ...common, url: source.config.url })
            : createSheetReader({
                ...common,
                link: { sheetId: source.config.sheetId, gid: source.config.gid, published: source.config.published },
                shape: source.config.shape,
                inbox: inboxes.get(sourceId)?.take,
              });
        return [sourceId, reader];
      }),
    );
    sourceStatus.onPoke((sourceId) => readers.get(sourceId)?.poke());
    // A reload or a closed tab runs no cleanup: let the leases go as the page leaves, so the
    // next page (or, published, the tick) reads at once instead of waiting the lease out.
    const leave = () => {
      for (const reader of readers.values()) reader.release();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      for (const inbox of inboxes.values()) inbox.stop();
      for (const [sourceId, reader] of readers) {
        reader.stop();
        sourceStatus.set(sourceId, undefined);
      }
    };
  }, [readerPlan, hostedSlug, id, readerTab, dataSession, sourceStatus, sourceAccept]);
  // PUBLISHED, a connection, a disconnection and a Pause reach the row at once (data-sources C2):
  // the operator door then takes the new path, the tick honours the Pause with every page closed,
  // and nothing waits for the next publish. One writer per published production, one write at a
  // time with the newest value last (control/sheetSource.ts `latestWriter`). The value the page
  // opens with (or publishes) is not written, so a page holding an older copy cannot overwrite
  // newer sources, unless the row has never had any (published before migration 0097); every
  // change after it is, a return to that first value included.
  // Keys sorted: a record read back from the server (jsonb reorders keys) is not a change.
  const sourcesPlan = hostedSlug ? canonical([bindings ?? {}, show?.sources ?? []]) : null;
  const sourcesPlanRef = useRef(sourcesPlan);
  sourcesPlanRef.current = sourcesPlan;
  const sourcesWriter = useRef<ReturnType<typeof latestWriter<string>> | null>(null);
  useEffect(() => {
    if (!hostedSlug) return;
    let noted = false;
    const writer = latestWriter(
      async (plan: string) => {
        const [planBindings, planSources] = JSON.parse(plan) as [Show['bindings'], Show['sources']];
        await writePublishedSources(id, { bindings: planBindings, sources: planSources });
        for (const source of planSources ?? []) sourceStatus.poke(source.id);
      },
      {
        setTimer: (run, ms) => setTimeout(run, ms),
        clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
        retryMs: SOURCES_RETRY_MS,
        failed: (error) => {
          if (!noted) setNote(`The change has not reached the published production: ${error.message}`);
          noted = true;
        },
      },
    );
    sourcesWriter.current = writer;
    // A row published before migration 0097 has no sources yet: this page's become its first, by a
    // write that lands only while the row is still without them, retried as the same condition.
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const first = () => {
      const plan = sourcesPlanRef.current;
      if (!live || !plan) return;
      const [planBindings, planSources] = JSON.parse(plan) as [Show['bindings'], Show['sources']];
      if (!planSources?.length) return;
      firstPublishedSources(id, { bindings: planBindings, sources: planSources })
        .then((wrote) => {
          if (live && wrote) for (const source of planSources) sourceStatus.poke(source.id);
        })
        .catch(() => {
          if (live) retry = setTimeout(first, SOURCES_RETRY_MS);
        });
    };
    first();
    return () => {
      live = false;
      clearTimeout(retry);
      writer.stop();
      if (sourcesWriter.current === writer) sourcesWriter.current = null;
    };
  }, [hostedSlug, id, sourceStatus]);
  /** The first value seen for this slug, and whether the page has changed it since: the first
   *  value seen again before any change is no change (an effect run twice, as React does in
   *  development, or a reload), and after one it is (Resume back to it). */
  const firstFor = useRef<{ slug: string; plan: string; changed: boolean } | null>(null);
  useEffect(() => {
    if (!sourcesPlan || !hostedSlug) return;
    const first = firstFor.current;
    if (first?.slug !== hostedSlug) {
      firstFor.current = { slug: hostedSlug, plan: sourcesPlan, changed: false };
      return;
    }
    if (!first.changed && first.plan === sourcesPlan) return;
    first.changed = true;
    sourcesWriter.current?.push(sourcesPlan);
  }, [sourcesPlan, hostedSlug]);
  /** A Connect review's values, shown on the PREVIEW monitor while the review is open. */
  const [connectPreview, setConnectPreview] = useState<{ graphic: string; values: Record<string, string> } | null>(null);

  /** The paths this production has bound, per graphic — what the cue editor greys out. */
  const boundFields = useCallback(
    (graphic: string | null): Record<string, string> => (graphic ? (bindings?.[graphic] ?? {}) : {}),
    [bindings],
  );

  cuesRef.current = cues;
  /** The cue as the operator currently sees it — draft over the latest mounted record, read from the
   *  part at the call: what a verb reads after its wait (control/cueDraft.ts). */
  const cueView = cueDraft.view;

  // The log names cues by the LABEL the operator wrote, the draft's while one is typed. It is read
  // from long-lived callbacks, so it reads the part and the record at the call.
  const cueLabel = cueDraft.label;
  // A ⚡ press is logged by its BUTTON's name, not the machine's event id (control/eventLog.ts).
  // Read through a ref for the same reason as the cue names: the log callbacks are long-lived.
  // Filled from `poolMachines` below, which parses every graphic in the production once.
  const poolButtonsRef = useRef(new Map<string, ControlButton[]>());
  // A button naming a player ("+1 ANNA") is logged by the name on air when the row arrives.
  const eventLabel = useCallback(
    (graphic: string, event: string) =>
      eventLogLabel(withLiveLabels(poolButtonsRef.current.get(graphic) ?? [], airedRef.current[graphic] ?? null), event),
    [],
  );

  // ── Live tracking (control/sessionWire.ts): resolve the production, seed the marker from the
  // wire's answer, then follow the log on both roads. Rows also drive the PROGRAM monitor, so it
  // shows what is really on air — including another operator's take. The wire reads this page
  // through `wirePage`, set every render; it writes the `air` and `log` parts itself. ──
  const wirePage = useRef<SessionWirePage | null>(null);
  wirePage.current = {
    resolveWaiting: setResolveWaiting,
    // The page is reused when the route moves to another production: the previous show's answer
    // must not decide this one's road while the round trip is in flight. Graphic keys are
    // per-production layer names and collide freely.
    starting: () => {
      fastEventGraphicsRef.current = new Set();
    },
    resolved: (resolved) => {
      // Protocol 1 is the whole document's for good (hostedControl.ts `seqRoad`), so the mark is
      // never cleared, not even while a reconnect's resolve waits.
      if (!resolved.seq) setUnordered(true);
      setOutputSeenAt(resolved.outputSeenAt);
      setPublishedStamp(resolved.output?.ver ?? null);
      fastEventGraphicsRef.current = fastEventGraphics(resolved.output?.graphics ?? []);
      setPublishedReaders(new Set((resolved.output?.graphics ?? []).filter((g) => hasLiveData(g.js)).map((g) => g.key)));
    },
    recovered: (resolved) => {
      // What air holds is now known here: the wire's own answer and the rows after it.
      setLiveRecovered(true);
      // Seed each graphic's machine state from its last published report — the page may be
      // opening onto a production another operator drove mid-sequence.
      for (const [graphic, report] of Object.entries(resolved.live)) {
        if (report && typeof report === 'object' && 'state' in report) {
          noteMachineState(graphic, (report as { state?: { groups?: Record<string, string> } | null }).state ?? null);
        }
      }
    },
    cues: () => cuesRef.current,
    clocks: clockSpecsOf,
    armWire: (wire) => {
      armWire.current = wire;
    },
    armsServer: setArmsServer,
    fire: (graphic, arm) => armEngine.current?.fire(graphic, arm),
    note: setNote,
    // Reported on every status change AND on every poll tick, so this stays true rather than
    // recording only the first answer.
    follow: setFollow,
    commandStatus: setCommandStatus,
    hear: hearCommand,
    // A 'live' row is the renderer REPORTING what it applied — machine state included, which is
    // what keeps the action buttons' greying honest about air.
    machineState: (graphic, state) => noteMachineState(graphic, state),
    // THE TREE MOVED SERVER-SIDE: re-read it, rather than subscribing to `control_shows` a second
    // time. Any `src`, not `api` alone: this page's own `withBoundValues` airs the tree on the next
    // Take, so missing a hosted press would put its figure back the moment somebody took a cue.
    refreshData: () => void dataSession.refresh(),
    describe: (row) => describeLogRow(row, cueLabel, eventLabel),
    seenAt: setOutputSeenAt,
    tick: () => setNow(wallClock()),
  };
  useEffect(() => {
    if (!hostedSlug || !backendConfigured || !show) return;
    return startSessionWire(session, SESSION_WIRE_IO, { slug: hostedSlug, showId: show.id, page: () => wirePage.current! });
  }, [session, hostedSlug, backendConfigured, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // RECOVERY for the PROGRAM monitor (docs/CLOUD_PLAYOUT.md's recovery discipline). The log
  // follower only sees rows that arrive AFTER this page opened, so reopening a production that
  // has been on air showed an empty PROGRAM box beside a rundown row marked ON AIR — the surface
  // contradicting itself. Replay each live layer with the full recipe — data, snap to the
  // reported state, data again — never a bare play(): the bare replay left the monitor at the
  // entrance while air sat mid-sequence, and its state reply then OVERWROTE the wire-seeded
  // truth, so the chip claimed the entrance state and greyed the one legal recovery event.
  // (The trailing data write is what lets call-painted looks repaint — the G9 rule.)
  // It drives nothing but the local monitor, which is why this is safe here and was not in an
  // exported package.
  //
  // THIS IS NOT ONLY A BOOT CONCERN, which is what the acceptance pass of 2026-08-06 found:
  // switching to the Data workspace unmounts the monitors, and coming back builds a BLANK
  // stage — so the graphic disappeared from PROGRAM while it was still live on CasparCG. It
  // is the same shape as the Phase 2 defect on this exact round trip (the preview came back
  // unscaled because the measurement was keyed on the unchanged document): the state lives
  // outside the remounted thing and nothing re-established it. So the replay is keyed on the
  // STAGE being fresh, not on the page being new.
  // Read through the part and a ref: the replay must use the FRESHEST answer at the moment a stage
  // comes up, and it must not re-run every time a take changes either of them.
  const machineStatesRef = useRef(machineStates);
  machineStatesRef.current = machineStates;
  /** Rebuild a fresh PROGRAM stage from what air holds (control/airState.ts `restoreItems`): at
   *  boot the reports and the rows after them, later what this page aired. */
  const restoreProgram = useCallback(
    () =>
      foldProgram((air, specs, now) => {
        const restore = restoreItems(air, machineStatesRef.current, specs);
        return programItems(restore.air, restore.items, specs, now);
      }),
    [foldProgram],
  );
  // The boot half: the wire resolve lands after the stage is already up, so the first time the
  // WIRE says a layer is live there is nothing to have signalled.
  //
  // It is keyed on the wire's own answer (`bootLive`), NOT on `liveCue`, and that is the whole
  // point rather than a refactor. `liveCue` also moves when THIS operator takes a cue, so the
  // recovery used to fire on the first Take of every session: it replayed `snap` to the machine
  // state last reported — "off", because the stage reports that once a second and the reply to
  // the play in flight had not landed yet — and put the graphic straight back off air. The
  // monitor went black, the state chip read Off and every ⚡ action greyed, with nothing said.
  // Offline it was every take, since with no wire `liveCue` can only ever move locally. Every
  // spec took a cue and asserted immediately, inside the window before the first state poll, so
  // the whole suite stayed green over it (`e2e/production-controls.spec.ts` now waits first).
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current || !bootLive) return;
    recoveredRef.current = true;
    if (!Object.values(bootLive).some(Boolean)) return;
    restoreProgram();
  }, [bootLive, restoreProgram]);

  // The header clock ticks on its own — the heartbeat poll above is every 30 s, far too slow
  // for a running timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── PREVIEW: the previewed cue's graphic, composed ONCE per template, its values pushed as
  // settle commands (rebuilding the document per edit re-parses GSAP and reloads every asset on
  // the most common gesture a rundown has). Local by construction; it never touches the wire.
  //
  // TWO TEMPLATES. The editor, the ⚡ actions and the cue settings are the SELECTED cue's on
  // every surface (the exported controller has always edited the selection), while the monitor
  // shows the PREVIEW cue. In 'take' mode those are one cue; in 'preview-then-take' mode they
  // differ whenever the operator has walked on from what is on PREVIEW. ──
  const poolGraphic = selectedCue ? graphicByPoolId.get(selectedCue.sourceId) ?? null : null;
  const editorKey = poolGraphic ? `${poolGraphic.id}:${poolGraphic.savedAt}` : '';
  const previewGraphic = previewCue ? graphicByPoolId.get(previewCue.sourceId) ?? null : null;
  const previewKey = previewGraphic ? `${previewGraphic.id}:${previewGraphic.savedAt}` : '';
  /* eslint-disable react-hooks/exhaustive-deps */
  const editorTemplate = useMemo(
    () => (poolGraphic ? templateForSavedGraphic(poolGraphic, library) : null),
    [editorKey, library],
  );
  // The same shape as the editor's: `templateForSavedGraphic` is a library lookup, not a parse,
  // so there is nothing to save by sharing the object when the two cues are one graphic.
  const previewTemplate = useMemo(
    () => (previewGraphic ? templateForSavedGraphic(previewGraphic, library) : null),
    [previewKey, library],
  );
  const previewDoc = useMemo(
    () => (previewTemplate ? composeDocument(previewTemplate, { liveControl: true }) : ''),
    [previewTemplate],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  // The machine's side of the selected graphic (docs/CONTROL_LAYER.md): its ⚡ buttons, the
  // structural guard they grey by, and its states for the recovery snap picker. All parsed
  // from the same live template the editor's fields come from, so the panel can never describe
  // a different graphic than the fields do. Empty on a template with no explicit machine.
  const events = useMemo(() => (editorTemplate ? eventButtons(editorTemplate.js) : []), [editorTemplate]);
  const legality = useMemo(() => (editorTemplate ? eventLegality(editorTemplate.js) : {}), [editorTemplate]);
  const stateGroups = useMemo(() => (editorTemplate ? machineStateGroups(editorTemplate.js) : []), [editorTemplate]);
  // The NAMES for the chip come from their own resolver rather than from `stateGroups`: that
  // list is the snap PICKER's and is empty without an explicit machine by design, while a
  // machine-less graphic's `enter` still has to read "Enter" (controlModel.ts says why).
  const stateNames = useMemo(() => (editorTemplate ? machineStateNames(editorTemplate.js) : {}), [editorTemplate]);
  /** What a cue's live candidate puts on PREVIEW: its resolved values, or its fields blank while
   *  it is not ready, so a preview never shows another candidate's values, or a stale prepared one. */
  const candidateOverlay = (cue: ShowCue): Record<string, string> => {
    const fields = selectedFields(cue, show?.collections);
    if (!fields.length) return {};
    const take = candidateTake(cue);
    return take.status === 'ok' ? take.values : Object.fromEntries(fields.map((f) => [f, '']));
  };
  // The PREVIEW settles with bound fields overlaid too, for the same reason Take does: the
  // monitor has to show what a Take would actually put on air, not the cue's prepared value. The
  // monitor reads the cue's values from the draft itself (D12) and settles them through this.
  const settleOf = (cue: ShowCue, values: Record<string, string>) =>
    JSON.stringify({
      ...withBoundValues(cueGraphicName(cue) ?? '', values),
      ...candidateOverlay(cue),
      ...(connectPreview && connectPreview.graphic === cueGraphicName(cue) ? connectPreview.values : {}),
    });
  /** Which of the values being typed PREVIEW says do not fit - measured by the monitor
   *  (PlayoutMonitors), read here by the editor's field marks. */
  const [previewOverflow, setPreviewOverflow] = useState<string[]>([]);
  const notePreviewOverflow = useCallback((next: string[]) => {
    setPreviewOverflow((prev) => (prev.join(',') === next.join(',') ? prev : next));
  }, []);
  /**
   * THE STAGE THE PRODUCTION DRAWS ON - both monitors' shape, and never the selected cue's.
   *
   * Derived exactly as `buildOutputPayload` derives it (and as the exported controller bakes it
   * from the payload), so all three surfaces agree on one canvas. The monitor cap is a grid
   * TRACK WIDTH scaled by this ratio, which is why it has to be the production's: keyed on the
   * PREVIEWED graphic it re-sized both monitors every time an operator selected a differently
   * shaped cue - the "monitors don't jump between scales depending on what graphic we are
   * looking at" rule (docs/PLAYOUT_DASHBOARD.md §2), broken by the mechanism enforcing the cap.
   * A cue that is not this shape is LETTERBOXED into it below, which is what the /output
   * renderer has always done with the same payload.
   */
  const pool = show?.graphics;
  const poolResolutionKey = (pool ?? []).map((g) => `${g.id}:${g.savedAt}`).join('|');
  const stage = useMemo(
    () =>
      (pool ?? []).reduce<Resolution>((r, g) => {
        const res = templateForSavedGraphic(g, library).resolution;
        return { width: Math.max(r.width, res.width), height: Math.max(r.height, res.height), label: r.label };
      }, DEFAULT_GRAPHICS_RESOLUTION),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poolResolutionKey, library],
  );

  // ── PLACE AND SIZE (docs/work-specs/playout-adjustments/spec.md, phase 1). The records live on the
  // show (model/shows.ts setGraphicAdjust, setCueAdjust, promoteCueAdjust), written through the
  // rundown history so Ctrl+Z reverts a press; what the page measured lives in the session's
  // `geometry` part (control/adjustGeometry.ts), what each graphic holds applied in the `air` part's
  // `looks`; one answer per cue comes from `cueAdjustState`. ──
  // Subscribed so a measurement draws the block and PREVIEW again; read through `get()` below.
  useStorePart(session.geometry);
  const appliedLooks = usePacedPart(session.air, looksOf);
  const [adjustOpen, setAdjustOpen] = useState(false);
  /** The cue whose "Only this cue" is on before it has a record of its own. */
  const [onlyThisCue, setOnlyThisCue] = useState<string | null>(null);
  const frameOf = (g: SavedGraphic) => templateForSavedGraphic(g, library).resolution;
  /** The values a Take of the cue settles and airs, which name its measurement. */
  const airedValuesOf = (cue: ShowCue): Record<string, string> => JSON.parse(settleOf(cue, cueDraft.view(cue).values)) as Record<string, string>;
  const adjustStateOf = (cue: ShowCue, record: Show | null = show ?? null) => {
    const g = record?.graphics.find((x) => x.id === cue.sourceId);
    if (!g || cue.source === 'playout') return null;
    const elsewhere = (record?.cues ?? []).some((c) => c.sourceId === g.id && c.id !== cue.id && c.adjust !== undefined);
    return cueAdjustState(g, cue, frameOf(g), stage, airedValuesOf(cue), session.geometry.get(), session.air.get().looks?.[g.name], elsewhere);
  };
  /** One document at a time measures the adjusted cues PREVIEW has not shown (preview/measureCue.ts). */
  const measurer = useMemo(
    () => createMeasurer(session.geometry, { measure: (input) => measureCue((input as MeasureInput).template, (input as MeasureInput).values) }, session.alive),
    [session],
  );
  const measureJobs = (record: Show): MeasureJob[] =>
    (record.cues ?? []).flatMap((cue) => {
      const g = record.graphics.find((x) => x.id === cue.sourceId);
      if (!g || cue.source === 'playout' || (g.adjust === undefined && cue.adjust === undefined)) return [];
      const values = airedValuesOf(cue);
      return [{ cueId: cue.id, graphicId: g.id, id: measureId(g.id, g.savedAt, cue.id, values, stage), input: { template: templateForSavedGraphic(g, library), values } satisfies MeasureInput }];
    });
  useEffect(() => {
    if (show) measurer.want(measureJobs(show));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, library, stage, measurer]);

  /**
   * EVERY POOL GRAPHIC'S MACHINE, not just the selected one.
   *
   * The ⚡ block above reads one graphic — the cue in the editor — because that is what an action
   * acts on. The activity feed names whichever graphic a row is for, so the whole pool is parsed
   * here, once per resolution. Keyed by NAME because that is the routing key the log, `staged` and `live` use, and
   * a Map because a pool graphic's name is somebody's typed text.
   */
  const poolMachines = useMemo(() => {
    const out = new Map<string, PoolMachine>();
    for (const g of pool ?? []) {
      const tpl = templateForSavedGraphic(g, library);
      // `js` rides along for the Next verb, which asks the same machine whether a press would
      // move anything (`canAdvance`). The rest is what a PINNED block of this graphic draws and
      // greys by (home/LiveControls.tsx), read from the same template the editor reads.
      out.set(g.name, {
        buttons: eventButtons(tpl.js),
        js: tpl.js,
        descriptors: fieldDescriptors(tpl.fields),
        path: continueEvents(tpl.js),
        legality: eventLegality(tpl.js),
        stateGroups: machineStateGroups(tpl.js),
        stateNames: machineStateNames(tpl.js),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolResolutionKey, library]);
  poolButtonsRef.current = new Map([...poolMachines].map(([name, m]) => [name, m.buttons]));

  /**
   * DOES THIS BROWSER TAB OWN A PLAYOUT SURFACE?
   *
   * The workspaces open in their own tab now, so "am I on a sub-route" stopped being the same
   * question as "should the playout column exist". A tab that STARTED on Playout keeps it
   * mounted behind Data forever, because unmounting restarts every live graphic. A tab that
   * OPENED onto Data never had one, and building it there would put a SECOND renderer on a
   * production that already has one - the same log followed twice, every asset re-inlined, and
   * a PROGRAM monitor nobody is looking at.
   *
   * A ref rather than state: it only ever latches ON, and re-rendering when it does would be a
   * render for a value this same render already read.
   */
  const ownsPlayout = useRef(sub === null);
  if (sub === null) ownsPlayout.current = true;
  const keepPlayout = ownsPlayout.current;

  const selectCue = useCallback(
    (cueId: string) => {
      void flushDraft(); void historyRef.current?.closeGroup();
      cancelDraft();
      setSelectedCueId(cueId);
      setSelectedFolderRow(null);
      setRangeIds([]);
      setEditTarget('preview');
    },
    [flushDraft, cancelDraft, setRangeIds],
  );
  /** Hold a folder's header: its panel opens, and SPACE, TAKE and Out act on the folder. Its first cue
   *  becomes the selected cue behind it, so if the folder goes the cursor stays where it stood. */
  const selectFolder = useCallback(
    (folderId: string, rowId: string) => {
      void flushDraft(); void historyRef.current?.closeGroup();
      cancelDraft();
      const first = rundown.members.get(folderId)?.[0];
      if (first) setSelectedCueId(first.id);
      setSelectedFolderRow({ folderId, rowId });
      setRangeIds([]);
      setEditTarget('preview');
    },
    [flushDraft, rundown, cancelDraft, setRangeIds],
  );
  /** A row clicked in the rundown. With shift, the range runs from the cursor to it and nothing else
   *  moves: not the cursor, not PREVIEW, not what SPACE takes. */
  /** Cue ids in the order the rundown plays them. */
  const inRundownOrder = (ids: Iterable<string>) => [...ids].sort((a, b) => (rundown.indexOf.get(a) ?? 0) - (rundown.indexOf.get(b) ?? 0));
  const clickRow = (row: RundownRow, shift: boolean, toggle = false) => {
    if (shift) {
      setRangeIds(rangeCueIds(rundown, cursorRow, row.id));
      setRangeEnd(row.id);
      return;
    }
    // Ctrl (Cmd on a Mac) adds the row to the selection, or drops it; a first one takes the cursor's
    // row with it, as a shift-click's range does. Nothing else moves.
    if (toggle) {
      const own = rowCueIds(rundown, row);
      setRangeIds((ids) => {
        const at = cursorRow ? rundown.rows.find((r) => r.id === cursorRow) : undefined;
        const set = new Set(ids.length ? ids : at ? rowCueIds(rundown, at) : []);
        const all = own.every((id) => set.has(id));
        for (const id of own) {
          if (all) set.delete(id);
          else set.add(id);
        }
        return inRundownOrder(set);
      });
      setRangeEnd(row.id);
      return;
    }
    if (row.kind === 'cue') selectCue(row.cue.id);
    else selectFolder(row.folder.id, row.id);
  };
  /** The graphic whose editor has its Advanced part (the playout layer) open by the operator's
   *  hand, if any: every other graphic's editor shows it closed unless its layer clashes. */
  const [advancedFor, setAdvancedFor] = useState<string | null>(null);
  /** The graphics (pool ids) whose SETUP FIELDS the operator folded away under the live actions.
   *  Per graphic rather than per cue, because a scorebug's team names are set once for the game
   *  and every cue of it reads the same; page memory, because a fold is a working posture, not
   *  production data. Only a graphic with ⚡ actions offers the fold: with none, the fields ARE
   *  the panel. */
  const [foldedFields, setFoldedFields] = useState<ReadonlySet<string>>(() => new Set());
  /** The graphic whose ⚡ block is in its ARRANGE posture (home/ActionArranger): its buttons are
   *  chips that pin, hide and rename, and nothing fires until Done. Keyed on the graphic, so
   *  selecting another graphic's cue never lands on a block whose buttons do not fire. */
  const [arrangingFor, setArrangingFor] = useState<string | null>(null);
  /** Bumped by a rundown row's clash badge, so the repair is brought into view once it renders. */
  const [repairAsk, setRepairAsk] = useState(0);
  const clashFix = useRef<HTMLButtonElement>(null);
  /** THE CLASH BADGE'S DOOR (docs/CLIP_PLAYBACK_PLAN.md §6.5): select the cue, and its editor opens
   *  Advanced by itself because the layer clashes; then the repair is scrolled to and focused. */
  const openLayerRepair = useCallback(
    (cueId: string) => {
      selectCue(cueId);
      setRepairAsk((n) => n + 1);
    },
    [selectCue],
  );
  useEffect(() => {
    if (!repairAsk) return;
    clashFix.current?.scrollIntoView({ block: 'nearest' });
    clashFix.current?.focus({ preventScroll: true });
  }, [repairAsk]);
  /**
   * Switching modes keeps the picture still. Into 'preview-then-take', what the operator was
   * looking at (the selection) stays on PREVIEW rather than the monitor going blank under
   * them; back into 'take' the selection is the preview again and the staged cue is moot.
   */
  const changeSpaceMode = (mode: SpaceMode) => {
    if (mode === 'preview-then-take') setStagedCueId(previewCue?.id ?? null);
    setSpaceMode(mode);
  };

  // ── The verbs (control/graphicVerbs.ts): the ONE sender, the wire when published and the local
  // PROGRAM monitor always, and the operator's verbs over it. They read this page through
  // `verbSender` (what a send needs, set here, before the production may still be opening) and
  // `verbPage` (the rest, set below), both set every render, so a press reads the render it was
  // made from, as the page's closures did. ──
  const verbSender = useRef<VerbSender | null>(null);
  verbSender.current = {
    published: hostedSlug,
    showId,
    here: (batch) => {
      applyProgram(batch, true);
      // A cue marker moves its layer's countdown (control/cueArmEngine.ts `onMarker`).
      armEngine.current?.onMarker(batch);
    },
    logSent: (items) => {
      const at = new Date().toISOString();
      logHere(items.map((item) => (id: number) => describeLogRow({ id, graphic: item.graphic, msg: item.msg, created_at: at }, cueLabel, eventLabel)));
    },
    armSpecFor: (cueId) => armEngine.current?.specFor(cueId) ?? null,
    applyHere: applyCommand,
    fastEvent: (graphic) => fastEventGraphicsRef.current.has(graphic),
    debts: () => sendDebts.current,
    outputUsable: () => usableOutputRef.current,
    sending: (delta) => setSendingNow((n) => Math.max(0, n + delta)),
    owed: setSendOwed,
    loggedAt: setLoggedAt,
    noOutput: () => setNoOutputTake(true),
    note: setNote,
  };
  const verbPage = useRef<GraphicPage | null>(null);
  const verbs = useMemo(() => createGraphicVerbs(session, GRAPHIC_VERB_IO, () => verbSender.current!, () => verbPage.current!), [session]);
  heardMarkers.current = (items, applied) => verbs.heard(items, applied);
  const { send: sendVerb, run: runVerb, runSent } = verbs;

  /** PRODUCTION DATA, the dispatch half: the tree's changes go out through this page's sender,
   *  unpublished only (control/productionDataSession.ts `dispatch` says why). */
  useEffect(() => {
    dataSession.dispatch(resolved, liveData, runVerb);
  }, [dataSession, resolved, liveData, dataKey, runVerb]);

  /** LIVE CANDIDATES ON AIR follow their captured selector (control/selectionAir.ts): a newer
   *  revision goes out as one update of every mapped field, anything else holds the picture. An
   *  instance is forgotten when its layer airs another cue, or is off air once the page knows. */
  // A production not loaded yet (a team production before its first fetch) knows nothing of air.
  const selectionSeeded = !!show && (!hostedSlug || bootLive !== null);
  // A collection nothing binds moves the tree without a row, so a published production with live
  // candidates reads its tree on the connector's own cadence too.
  // Asked at each tick, from the session's own part, so a capture never renders the page.
  useEffect(
    () => (hostedSlug ? dataSession.poll(CANDIDATE_READ_MS, () => followsCandidates(cuesRef.current, session.selections.get())) : undefined),
    [dataSession, hostedSlug, session],
  );
  // What is live is read from the session's part, never the render's paced copy, which can trail a
  // marker a Take has just moved and would forget the card it took.
  followRef.current = () =>
    followAired(selectionIo, {
      liveCue: session.air.get().liveCue,
      seeded: selectionSeeded,
      facts: selectionFacts(),
      send: (graphic, values) => runSent([[{ graphic, msg: { t: 'update', data: values } }]], 'Live candidate'),
      markersOut: verbs.markersOut(),
    });
  useEffect(() => {
    followRef.current();
  }, [selectionIo, liveData, treeRead, liveCue, selectionSeeded, show?.collections, bindings, selectionFacts, runSent]);

  // A hardware panel (docs/work-specs/hardware-panel-control/): fed below, once the page knows what it
  // shows. A server clip's clock moves in its store without re-rendering this page, so the answer
  // hears that part directly; it publishes only when a key would show a difference.
  const panel = usePanelAnswer({ slug: hostedSlug, where: 'production', label: 'Production page', runs: PRODUCTION_PANEL_VERBS, auto: true });
  const [panelOpen, setPanelOpen] = useState(false);
  const audienceInbox = useAudienceInbox(show);
  // While answering, the panel also hears the timing part, after the whole fold: a reading moves
  // timing and then ownership, and a state pairing the two halves must never go out. What moves
  // with time alone (a counted clip reaching its end, a count turning estimated) is caught by the
  // render the header clock causes every second.
  useEffect(() => {
    if (!panel.on) return;
    return serverPlayout.timing.subscribe(() => queueMicrotask(panel.changed));
  }, [panel.on, serverPlayout, panel.changed]);
  const panelRows = useMemo(() => rundownPanelRows(rundown.rows), [rundown]);

  // TIMED CUES. Unpublished, control/cueArmEngine.ts runs them on this page: one timer, to whatever
  // is next due, and a catch-up when the window comes back from hiding. Published,
  // control/cueArmWire.ts runs them with every other page. Where timed cues do not run (a
  // published production whose server keeps no arms), whatever this page held goes.
  const timedCues = !hostedSlug || armsServer === 'on';
  useEffect(() => {
    armEngine.current?.update({ published: !!hostedSlug, timedCues });
  }, [session, hostedSlug, timedCues]);

  if (!show) {
    // A TEAM production opened cold - a teammate's link, a reload - arrives with the first team
    // fetch, a moment after this page. Saying "no longer exists" for that moment, or while the
    // cloud is still being asked, tells somebody their work is gone.
    // No session token while the auth state is still resolving is not yet an answer either.
    const opening =
      lookup === 'looking' || teamShowsStatus() === 'loading' || (lookup === 'needs-sign-in' && authStatus === 'loading');
    const signIn = !opening && lookup === 'needs-sign-in';
    return (
      <div className="app home-page" data-testid="production-page">
        <header className="topbar">
          <a className="brand brand-home" href="/" title="NoaCG Studio front page">
            <BrandLogo size={24} />
          </a>
          <span className="tpl-name">{opening ? 'Opening production…' : signIn ? 'Production' : 'Production not found'}</span>
        </header>
        <main className="home-content" style={{ padding: 24 }}>
          {opening ? (
            <p className="hint" data-testid="production-loading">Looking for this production in your account…</p>
          ) : signIn ? (
            <SignInPrompt
              feature="Sign in to open this production"
              reason="This production is saved in an account. Sign in and it opens here."
            />
          ) : (
            <>
              <p className="hint" data-testid="production-missing">
                {teamsOn
                  ? 'This production no longer exists, or it belongs to a team you are not in.'
                  : backendConfigured
                    ? 'This production no longer exists, or it lives in another account.'
                    : 'This production no longer exists.'}
              </p>
              {/* Which account this is, never anything about the production. */}
              {backendConfigured && user?.email && (
                <p className="hint" data-testid="production-missing-account">You are signed in as {user.email}.</p>
              )}
            </>
          )}
          <div className="row">
            <button onClick={() => goBack({ view: 'home', section: 'productions' })} data-testid="production-back">
              ← Back
            </button>
            <button onClick={() => navigate({ view: 'home', section: null })} data-testid="production-home">
              Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const outputUrl = show.outputSlug ? outputPageUrl(show.outputSlug) : null;
  const chosenOutput = readOutputSetup(show.outputSetup);
  const browserDestination = chosenOutput?.destinations.find(d => d.profile !== 'casparcg');
  const browserOutputUrl = destinationUrl(outputUrl, browserDestination?.id);
  const casparDestination = chosenOutput?.destinations.find(d => d.profile === 'casparcg')?.id;
  const managedOutputUrl = destinationUrl(outputUrl, casparDestination);
  /** The PUBLIC audience URL. Only a production published against a server carrying migration
   *  0035 has one, so it stays absent rather than showing a link that would not resolve. */
  const joinUrl = show.joinSlug ? joinPageUrl(show.joinSlug) : null;
  /** The PRESENTER's own page — a third capability, minted at publish beside the join slug and
   *  absent for the same reason when the server predates 0035. */
  const presenterUrl = show.presenterSlug ? presenterPageUrl(show.presenterSlug) : null;
  const controlUrl = show.hostedSlug ? controlPageUrl(show.hostedSlug) : null;
  const clashes = duplicateLayers(show.graphics);

  const { claimName, downloadEmbed, copy, loadOnSlot, unloadFromSlot, clearThroughBridge, publishNow, publish } = publishActions(
    publishState,
    {
      show, setShows, setNote, backendConfigured, authStatus, needsSignIn, openSignIn, user, outputUrl, browserOutputUrl,
      hostedSlug, slotReadable, outputSlot, onAirChanged, flushDraft, history, casparOn, accountCaspar, publishedReaders,
      setPublishedReaders, setPublishedStamp, fastEventGraphicsRef, liveCueRef, prepareFlow,
      // Each adjusted cue measured for the copy being published, then resolved (capped: a cue the
      // measurer has not answered for publishes its last placement).
      appearanceFor: async (latest) => {
        if (!latest.graphics.some((g) => g.adjust !== undefined) && !(latest.cues ?? []).some((c) => c.adjust !== undefined)) return undefined;
        measurer.want(measureJobs(latest));
        await Promise.race([measurer.drain(), new Promise((resolve) => setTimeout(resolve, PUBLISH_MEASURE_CAP_MS))]);
        return (cue) => adjustStateOf(cue, latest)?.send;
      },
      // REHEARSAL ENDS AT THE FIRST PUBLISH: the live map and PROGRAM stay this page's.
      onFirstPublish: (rehearsed) => {
        applyProgram(clearAllCueBatches(rehearsed).flat());
        setLiveCue({});
      },
    },
  );

  preparePublishRef.current = () => publishNow();

  /** The layers that are up, each with the cue that put it there, front to back. */
  const liveLayers = show.graphics
    .map((g) => ({ layer: graphicLayer(g), graphic: g.name, cueId: liveCue[g.name] ?? null }))
    .filter((l): l is { layer: number; graphic: string; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }))
    .sort((a, b) => b.layer - a.layer);
  /** The studio's playout settings as they stand: read on render, like the door below, so the
   *  channel names follow Settings -> Playout the moment it closes. One localStorage read. */
  const playoutSettings = loadPlayoutSettings();
  /** The server cues this page has put up, by channel and then front to back. */
  const livePlayoutLayers = serverLayers(serverOnAir, playoutItems, cues);

  const selectedGraphic = selectedCue ? cueGraphicName(selectedCue) : null;
  /** A cue over the playout server's library, and whether THIS cue is what this page last put
   *  up on its item (docs/BRIDGE.md §5). */
  const selectedPlayoutItem = selectedCue ? playoutItemFor(selectedCue) : null;
  const selectedPlayoutLive = serverCueLive(serverOnAir, selectedPlayoutItem, selectedCue);
  /** What the Bridge and its server can do, for a cue's settings: null while it is still being
   *  asked, and a studio with no Bridge set up says so rather than being asked forever. */
  const playbackAbility = bridgeStatus ?? (playoutIsConfigured ? null : { state: 'config' as const });
  /** Where a server item plays on its own, `2-10`. */
  const addressOfItem = (i: PlayoutItem) => slotAddress(itemSlot(playoutSettings, i));
  /** A graphic cue's pool graphic, for an All-together folder's refusals. */
  const graphicOfCue = (c: ShowCue) => {
    const g = graphicByPoolId.get(c.sourceId);
    return g ? { name: g.name, layer: graphicLayer(g) } : null;
  };
  const bridgeDown = bridgeStatus !== null && bridgeStatus.state !== 'ok';
  /** This render's facts for the Take refusals (control/takeBlockers.ts). */
  const takeContext: TakeContext = {
    cues,
    items: playoutItems,
    folders,
    members: rundown.members,
    places,
    ownership: serverOwnership,
    settings: playoutSettings,
    ability: playbackAbility,
    casparOn,
    bridgeDown,
    itemOf: playoutItemFor,
    graphicOf: graphicOfCue,
    slots: PLAYOUT_SLOTS,
    selectionBlocker: (cue) => {
      const take = candidateTake(cue);
      return take.status === 'refused' ? take.reason : null;
    },
  };
  const casparOffRefusal = (cue: ShowCue): string | null => casparOff(cue, casparOn);
  const takeBlockerFor = (target: ShowCue | ShowFolder | null): string | null => takeBlockerOf(target, takeContext);
  const selectedTakeBlocked = takeBlockerFor(selectedCue);
  const directBlocker = (cue: ShowCue): string | null => directBlockerOf(cue, takeContext, loadPlayoutSettings());
  /** Up, for SPACE and the verbs: any of it on air, or its Take still being sent. */
  const folderUp = (folderId: string) => (folderStates[folderId]?.onAir.length ?? 0) > 0 || folderPlayout.running(folderId) || sendingFolders.has(folderId);
  /** A held One-by-one header's next cue, the one its press takes. */
  const heldStepCue = heldStep?.kind === 'take' ? (cues.find((c) => c.id === heldStep.cueId) ?? null) : null;
  const stepBlocker = (next: ShowCue): string | null => stepBlockerOf(next, takeContext);
  /** What plays on a slot this rundown uses now - an item's, or a Play-through folder's - with no cue
   *  of this page to take it off: an unidentified item, or what replaced a cue's clip. A slot the
   *  rundown no longer uses is left alone, whatever the page last heard about it. */
  const unnamedSlots = (own: typeof serverOwnership): Map<string, Slot> => {
    const used = new Set([
      ...playoutItems.map((i) => slotAddress(itemSlot(playoutSettings, i))),
      ...folders.filter((f) => folderMode(f) === 'through').map((f) => slotAddress(folderSlot(playoutSettings, f))),
    ]);
    const taken = new Set(livePlayoutLayers.map((l) => slotAddress(l.slot)));
    const out = new Map<string, Slot>();
    for (const s of [...own.unidentified.map((u) => u.slot), ...Object.values(own.replaced).map((r) => r.slot)]) {
      const a = slotAddress(s);
      if (used.has(a) && !taken.has(a)) out.set(a, s);
    }
    return out;
  };
  const machineState = selectedGraphic ? machineStates[selectedGraphic] ?? null : null;
  /** Would » Next move the selected layer's graphic? False on its last step (a quiz on its Reveal),
   *  where the press used to do nothing on air while the log still wrote "Next step". */
  const advances = !!selectedGraphic && canAdvance(poolMachines.get(selectedGraphic)?.js ?? '', machineState);
  /** THE VERB BAR'S FACTS (control/verbView.ts): what each verb would do and whether it may go, from
   *  this render. The bar greys with it, the dispatcher decides with it, the panel lights from it,
   *  and the verbs take it as the selection they act on. */
  const view = verbView({
    spaceMode,
    published: !!hostedSlug,
    cues,
    selectedCue,
    selectedGraphic,
    liveCue,
    selectedPlayoutLive,
    selectedItemKind: selectedPlayoutItem?.kind ?? null,
    editTarget,
    previewCueId: previewCue?.id ?? null,
    casparOn,
    bridgeDown,
    takeBlocked: selectedTakeBlocked,
    advances,
    folder: selectedFolder
      ? {
          name: folderName(selectedFolder),
          up: folderUp(selectedFolder.id),
          stepped: typeof folderSteps[selectedFolder.id] === 'string',
          step: heldStep,
          stepBlocked: heldStepCue ? stepBlocker(heldStepCue) : null,
          takeBlocked: heldStep ? null : takeBlockerFor(selectedFolder),
          serverMembers: heldMembers.some((c) => c.source === 'playout'),
          labelOf: (id) => cues.find((c) => c.id === id)?.label ?? 'a cue',
        }
      : null,
    clearing,
    anyUp: liveLayers.length > 0 || livePlayoutLayers.length > 0 || sendingFolders.size > 0,
    unnamedUp: () => unnamedSlots(serverOwnership).size > 0,
  });
  const { selectedLayerLive, airCue, editingCue, editingIsLive, selectedCueStaged, nextMoves } = view;
  /** Its place in the rundown, 1-based - the only thing that tells two cues of the same graphic
   *  apart, since they share a name and a tally. 0 when there is no cue to name. */
  const editingCueNo = editingCue ? cues.findIndex((c) => c.id === editingCue.id) + 1 : 0;
  /**
   * UNSENT CHANGES on the cue that is on air (acceptance pass, 2026-08-06: "there needs to be
   * an alert when something changes and you need to send that update - I had problems with my
   * CasparCG output but only because I hadn't sent an update").
   *
   * It compares the edited values against what was last SENT, never against the stored cue: the
   * whole point of staged-vs-take is that those legitimately differ, and data still does NOT
   * air by itself - this only says so out loud. A cue that has never been taken is not
   * "unsent"; it is simply not on air, which the rundown already says. A BOUND field is never
   * unsent (control/cueDraft.ts `unsentFields`; the review's S4).
   *
   * The ON-AIR cues with unsent values are said on their rundown row, where the operator looks,
   * and not only in the editor that has to be showing the cue (the review's S1: edit the on-air
   * cue, click another row, and the only sign was gone). A graphic this page has sent nothing for
   * (a reload, another operator's take) is not judged: there is no record of what air shows to
   * compare with.
   *
   * With the countdown chip's cue label, this is ALL the page draws of the draft (D12), so a
   * keystroke renders the page only when one of them reads differently.
   */
  const chipGraphic = chipLane(cueArms);
  const { unsent, chipLabel } = drawnDraft(() => ({
    unsent: unsentNow(
      cueDraft,
      editingIsLive && selectedGraphic && editingCue ? { cue: editingCue, graphic: selectedGraphic } : null,
      Object.entries(liveCue).flatMap(([graphic, cueId]) => {
        const cue = airedData[graphic] && cues.find((c) => c.id === cueId);
        return cue ? [{ cue, graphic }] : [];
      }),
      airedData,
      // A live candidate's fields come from its source, like a bound field: never "unsent".
      (graphic, cue) => {
        const candidate = selectedFields(cue, show?.collections);
        return candidate.length ? { ...boundFields(graphic), ...Object.fromEntries(candidate.map((f) => [f, 'candidate'])) } : boundFields(graphic);
      },
    ),
    chipLabel: chipGraphic ? (cueLabel(cueArms[chipGraphic].cue) ?? chipGraphic) : null,
  }));
  /** A cue's place and size differ from what its graphic holds applied (playout adjustments): a
   *  waiting change like an unsent value, counted by the fate line and the rundown row. */
  const placeUnsent = (cue: ShowCue, graphic: string) => {
    const state = adjustStateOf(cue);
    return !!state?.send && !appearanceEquals(state.send, appliedLooks[graphic] ?? IDENTITY);
  };
  const unsentFields = editingIsLive && selectedGraphic && editingCue && placeUnsent(editingCue, selectedGraphic) ? [...unsent.fields, PLACE_UNSENT] : unsent.fields;
  const hasUnsent = unsentFields.length > 0;
  const unsentOnAir = new Set([
    ...unsent.cues,
    ...Object.entries(liveCue).flatMap(([graphic, cueId]) => {
      const cue = cueId ? cues.find((c) => c.id === cueId) : undefined;
      return cue && placeUnsent(cue, graphic) ? [cue.id] : [];
    }),
  ]);

  /** A removal drops the draft as the page state it replaced went: after this task, so the save
   *  the removal waits for first (`writeRundown` flushes in the same tick) still writes it. */
  const dropDraft = () => {
    setTimeout(cancelDraft);
  };

  /** Type into the edited cue (control/cueDraft.ts `edit`). */
  const editDraft = (patch: CueEdit) => {
    if (editingCue) cueDraft.edit(editingCue, patch);
  };

  /**
   * ONE VERB ON THE PLAYOUT SERVER, reporting nothing: control/serverPlayout.ts decides what it sends
   * and how the on-air map moves, through NoaCG Bridge with the settings as they stand now. The
   * outcome carries the note line's sentence; `playoutVerb` below says it, and a folder's Take says
   * all of its cues' at once. Null when the cue has no item to play.
   *
   * A clip of a Play-through folder is taken by the folder's rules (docs/CLIP_PLAYBACK_PLAN.md §6.6):
   * from itself to the folder's end - round again with Loop the folder - on the folder's slot.
   */
  const serverVerb = async (
    cue: ShowCue,
    verb: ServerVerb,
    label: string,
    options: { cut?: boolean; takenAt?: number; direct?: boolean } = {},
  ): Promise<ServerVerbOutcome | null> => {
    const item = playoutItemFor(cue);
    if (!item) return null;
    return runAndRecord(
      serverPlayout,
      {
        act,
        loadSettings: loadPlayoutSettings,
        now: () => performance.now(),
        wake: () => bridgeWatch.current?.wake(),
        flush: async () => { await flushDraft(); await history.closeGroup(); },
        cueView,
      },
      {
        cue,
        item,
        verb,
        label,
        options,
        blocked: verb === 'take' ? (options.direct ? directBlocker(cue) : takeBlockerFor(cue)) : null,
        readable: stateReadable(bridgeStatus),
        rundown: takeContext,
      },
    );
  };
  /** One verb on the playout server, and the note line says how it went, whichever way that was. */
  const playoutVerb = async (cue: ShowCue, verb: ServerVerb, label: string, options: { cut?: boolean } = {}): Promise<boolean> => {
    const outcome = await serverVerb(cue, verb, label, options);
    if (!outcome) return false;
    setNote(outcome.note);
    return outcome.ok;
  };

  /** Forget why these cues' last folder Take missed them: they were taken since, or taken off. */
  const { clearMisses } = folderPlayout;

  /** A graphic cue's Take, reporting nothing: its sentence comes back, for one cue or a folder's
   *  whole Take to say. Null when its graphic is gone. */
  const takeGraphicCue = verbs.takeGraphic;

  /** A cue of a One-by-one folder went on air, by whatever route: the folder's step stands on it, so
   *  the next press continues after it (docs/CLIP_PLAYBACK_PLAN.md §20.1). */
  const { noteStep } = folderPlayout;

  // ── TIMED CUES, the unpublished engine (control/cueArmEngine.ts; docs/RUNDOWN_AUTOMATION_PLAN.md
  // §2.0, phase 1) reads this page through `armPage`: what it sends with, the rundown, the cue as the
  // operator sees it, and the lines it writes. ──────────────────────────────────────────────────
  const logAuto = (graphic: string, text: string) => logHere([(id) => autoEntry(id, graphic, text)]);
  armPage.current = {
    published: !!hostedSlug,
    timedOff: !!hostedSlug && armsServer === 'missing',
    cues,
    send: sendVerb,
    cueView,
    withBoundValues,
    graphicOf: cueGraphicName,
    liveCueOf: () => liveCueRef.current,
    setLiveCue,
    took: (cue) => {
      clearMisses([cue.id]);
      noteStep(cue);
    },
    flush: () => {
      void flushDraft(); void history.closeGroup();
    },
    log: logAuto,
    note: setNote,
    wire: () => armWire.current,
    selectionAired,
  };
  /** H, or a chip: hold a counting lane, or resume a held one. */
  const toggleHold = (graphic: string | null) => armEngine.current?.hold(graphic);
  /** Manual: the timed end is dropped for this airing, and the cue stays on air as a manual one. A
   *  missed lane is cleared the same way. */
  const manualLane = (graphic: string) => armEngine.current?.manual(graphic);
  /** PROGRAM said what a graphic holds: a countdown waiting for air starts now (§2.0's anchor). Any
   *  reply counts. A graphic still loading in the monitor is never asked (the stage drops a state
   *  ask for an unloaded document), so its first reply follows its queued Take; one already loaded
   *  applies the Take at once, so a poll answer crossing it is a few milliseconds early at most. */
  const noteProgramState = (graphic: string, state: { groups?: Record<string, string> } | null, overflow?: string[]) => {
    noteMachineState(graphic, state, overflow);
    armEngine.current?.onProgramState(graphic);
  };

  /**
   * A GRAPHIC'S OWN SHEET READER, as Connect data… meets it (sheet-data-flow AC-10, data-sources
   * C6): whether its code still reads a Sheet where it plays, and the explicit migration that
   * removes it (control/liveData.ts says where the block goes and why).
   */
  const ownReaderOf = (graphic: SavedGraphic): OwnReader => {
    const { gate, url } = ownSheetReader(graphic, library, !!hostedSlug, outputObservations);
    const doc = gate === 'reader' ? resolveSavedGraphicDoc(graphic, library) : undefined;
    return {
      gate,
      url,
      // Read from every stored production, so only when the migration is on offer.
      elsewhere: doc ? productionsContaining(doc.id).filter((s) => s.id !== show?.id).length : 0,
      remove: async () => {
        if (!show) return 'This production is no longer open.';
        const fresh = resolveSavedGraphicDoc(graphic, loadGraphics());
        const plan = ownReaderRemoval({ library: !!fresh, published: !!hostedSlug });
        if (!plan) return `${graphic.name} has no library record here, so Publish could not take the change to the output. Keep its own reader.`;
        if (plan.library && fresh && hasLiveData(fresh.template.js)) {
          const saved = updateGraphic(fresh.id, { template: { ...fresh.template, js: stripLiveData(fresh.template.js) } });
          if (saved.error) return saved.error;
        }
        let refused: string | null = null;
        if (plan.copy && hasLiveData(graphic.template.js)) {
          const copied = setGraphicCopyScript(show.id, graphic.id, graphic.template.js, stripLiveData(graphic.template.js));
          setShows(copied.shows);
          refused = copied.error;
        }
        // The library write above stands whether or not the copy's did: land it and show it, so
        // the gate and the monitors read the design as it now is.
        const failure = await commitDurableWrites();
        setLibraryRev((n) => n + 1);
        return failure ? `Not saved: ${failure}` : refused;
      },
    };
  };
  // The operator's verbs on the selection this render drew (`view`); control/graphicVerbs.ts says
  // what each sends, waits on and reads after the wait. ✎ Update sends the cue's whole value set;
  // ± bumps one number field on air (a bound field moves the production tree instead).
  const takeCue = verbs.take;
  const updateLive = () => verbs.update(view);
  const bumpLive = (fieldKey: string, delta: number) => verbs.bump(view, fieldKey, delta);
  const nextLive = () => verbs.next(view);
  const outLive = () => verbs.out(view);

  /** Play a named graphic off air, if it is up (a removal goes through this first). */
  const takeOffAir = verbs.takeOff;
  /** Clear the screen — the one an operator reaches for under pressure, which is why it sits apart
   *  from the others, in the header, and a named verb a hardware panel can press (`all-out`). A layer
   *  this rundown does not use is never touched (control/graphicVerbs.ts `allOut`). */
  const outAll = verbs.allOut;
  /**
   * All out's second half (docs/CLIP_PLAYBACK_PLAN.md §20.1): what plays on a slot this rundown uses
   * with no cue of this page to take it off - an unidentified item, or what replaced a cue's clip.
   * After a NoaCG Bridge restart this page's own clip reads as unidentified, and the panic control
   * must stop it. Each is cut, as All out cuts, and the server is read again at once.
   */
  const outUnnamed = async () => {
    const slots = unnamedSlots(serverPlayout.ownership.get());
    if (!slots.size) return;
    const settings = loadPlayoutSettings();
    const failed: string[] = [];
    for (const [address, slot] of slots) {
      const r = await act(settings, { verb: 'out', slot });
      if (r.state !== 'ok') failed.push(`${address} did not clear: ${r.detail}`);
    }
    bridgeWatch.current?.wake();
    if (failed.length) setNote(`All out: ${failed.join(' ')}`);
  };
  verbPage.current = {
    graphics: show.graphics,
    liveCue,
    liveLayers,
    livePlayoutLayers,
    graphicOf: cueGraphicName,
    cueView,
    resolvedOf: (graphic) => resolvedRef.current[graphic] ?? {},
    // Read after the wait (this object is the render's): the place and size a Take or Update carries.
    appearanceOf: (cue) => adjustStateOf(cuesRef.current.find((c) => c.id === cue.id) ?? cue)?.send,
    flush: async () => {
      await flushDraft(); await history.closeGroup();
    },
    boundFields,
    selectionFor: (cue, graphic) => selectionTake(cue, graphic, selectionFacts()),
    selectionAired,
    candidateFields,
    airedCandidateFields: (graphic) => {
      const live = session.air.get().liveCue[graphic];
      return [
        ...new Set([
          ...protectedSelections(session.selections.get(), graphic, live).flatMap((selection) => selectedFields({ selection }, show.collections)),
          ...protectedFields(session.selections.get(), graphic, live),
        ]),
      ];
    },
    airedCandidate: (graphic, cueId) => airedValues(session.selections.get(), graphic, cueId),
    selectionStale: (graphics) => staleSelection(selectionIo, graphics),
    boundNow,
    boundReady: boundPressReady,
    patchBound: patchBoundValues,
    writeCue: (cueId, values) => setShows(updateShowCueChecked(id, cueId, { values }).shows),
    savedValues: (cueId) => cuesRef.current.find((c) => c.id === cueId)?.values,
    writeLive: (cueId, values) => {
      if (canAuthorAccount()) setShows(updateShowCue(id, cueId, { values }));
    },
    playoutVerb,
    clearMisses,
    noteStep,
    stopFolders: () => folderPlayout.stopAll('all-out'),
    outUnnamed,
    clearThroughBridge,
    clearing: setClearing,
  };
  const clearSlot = async (slot: Slot) => {
    const result = await act(loadPlayoutSettings(), { verb: 'clear', slot });
    if (result.state === 'ok') serverPlayout.apply(parts => applyClearedSlot(parts, { slot, generation: result.generation, session: result.session }));
    setNote(result.state === 'ok' ? `✓ Stop/Clear ${slotAddress(slot)} accepted. Check program to confirm it is clear.` : `Stop/Clear ${slotAddress(slot)} failed: ${result.detail}`);
    bridgeWatch.current?.wake();
  };

  const descriptors = editorTemplate ? fieldDescriptors(editorTemplate.fields) : [];
  /** The edited graphic's layer, and who else is on it when two graphics share it. */
  const editedLayer = poolGraphic ? graphicLayer(poolGraphic) : 0;
  const sharingLayer = poolGraphic ? clashes.get(editedLayer) : undefined;
  const layerClash = !!sharingLayer;
  const advancedOpen = layerClash || (!!poolGraphic && advancedFor === poolGraphic.id);
  // The graphic's own picture assets, so an IMAGE field is actually pickable here. Without
  // them the control renders a select whose only option is "None" — which is how a match
  // board's two crest slots came to be unreachable from the cockpit while the hosted page
  // could set them, exactly the divergence docs/PLAYOUT_DASHBOARD.md forbids. Derived the same
  // way the published panel derives its own list (control/hostedControl.ts), so the two
  // surfaces offer the same pictures.
  // Uploading is deliberately NOT offered: an upload has to land in the saved graphic's
  // assets, which is the editor's job, and adding it here would be a second write path into a
  // document the production only references.
  const cueImages = editorTemplate
    ? editorTemplate.assets.filter((a) => isImageAsset(a.path)).map((a) => ({ value: a.path }))
    : [];
  /** Where Play next goes from a server clip, by the rundown as it stands (plan §6.6). */
  const playNextFor = (cue: ShowCue | null) => {
    const item = cue ? playoutItemFor(cue) : null;
    return cue && item?.kind === 'media' ? playNextTarget(cues, playoutItems, cue.id, addressOfItem, folders) : null;
  };
  /** Where a Play-through folder plays: its own slot, else layer 10 on the clip channel. */
  const folderSlotOf = (folder: ShowFolder) => slotAddress(folderSlot(playoutSettings, folder));
  const throughRoleOf = (cue: ShowCue): { folder: ShowFolder; role: ThroughRole } | null => places.get(cue.id) ?? null;

  // ── A FOLDER'S TAKE AND OUT (docs/CLIP_PLAYBACK_PLAN.md §6.6, phase 4): the `take` and `out` verbs
  // with a folder row held. ──
  historySafety.current = (expected, replacement) => {
    const ownership = serverPlayout.ownership.get();
    const liveIds = new Set([...Object.values(liveCueRef.current).filter((cue): cue is string => !!cue), ...Object.values(ownership.onAir).map(item => item.cueId)]);
    const sources = new Set(expected.cues.filter(c => liveIds.has(c.id)).map(c => c.sourceId));
    for (const itemId of Object.keys(ownership.onAir)) sources.add(itemId);
    return liveRundownRefusal(expected, replacement, { cues: liveIds, sources, folders: new Set(folders.filter(f => folderUp(f.id)).map(f => f.id)), unidentifiedServer: ownership.unidentified.length > 0 });
  };
  /** The TAKE button, which IS the key: with a folder held its face, state and title are the
   *  folder's, from the same decision SPACE runs. */
  /** REHEARSAL (playout-workflow-simplification D12): before the first publish a graphic's Take
   *  plays on this page only, so TAKE is not the red of air and the editor never says on air. A
   *  server cue airs through NoaCG Bridge either way and keeps its on-air looks. */
  const rehearsing =
    !hostedSlug &&
    (selectedFolder
      ? (rundown.members.get(selectedFolder.id) ?? []).every((c) => c.source !== 'playout')
      : !selectedPlayoutItem);
  const takeButton = {
    ...view.take,
    face: view.take.step ? { ...view.take.step, className: takeFace(view.take.space).className } : takeFace(view.take.space),
  };

  /** WHERE TAKE SENDS THE SELECTION (C6): a server cue to its slot, a graphic to the outputs and
   *  the CasparCG slot this production's output is set to, or this page only before Publish. */
  const takeTarget = (() => {
    const held = selectedFolder ? (rundown.members.get(selectedFolder.id) ?? []) : [];
    const serverOnly = selectedFolder ? held.length > 0 && held.every((c) => c.source === 'playout') : !!selectedPlayoutItem;
    return takeTargets({
      published: !!hostedSlug,
      outputs: readiness.outputs.filter((line) => line.present).length,
      caspar: casparOn ? `${playoutSettings.channel}-${playoutSettings.layer}` : null,
      casparLoaded: outputSlot?.holds === 'ours',
      server: serverOnly
        ? selectedFolder && folderMode(selectedFolder) === 'through'
          ? folderSlotOf(selectedFolder)
          : [...new Set((selectedFolder ? held : selectedCue ? [selectedCue] : []).map((c) => playoutItemFor(c)).filter((i): i is PlayoutItem => !!i).map(addressOfItem))].join(', ') || null
        : null,
      serverToo: !!selectedFolder && !serverOnly && held.some((c) => c.source === 'playout'),
    });
  })();

  folderPage.current = {
    selectionAired,
    cues,
    folders: rundown.folders,
    members: rundown.members,
    items: playoutItems,
    itemOf: playoutItemFor,
    graphicOf: cueGraphicName,
    folderSteps,
    stepMembers: stepMembersOf,
    folderName,
    takeBlocker: takeBlockerFor,
    stepBlocker,
    together: { items: playoutItems, addressOf: addressOfItem, graphicOf: graphicOfCue, ability: playbackAbility, blockerOf: (c) => (casparOffRefusal(c) ? null : takeBlockerFor(c)) },
    ownership: serverPlayout.ownership.get,
    liveCueOf: () => liveCueRef.current,
    setLiveCue,
    serverVerb,
    takeGraphic: takeGraphicCue,
    takeCue,
    send: sendVerb,
    flush: async () => {
      await flushDraft(); await history.closeGroup();
    },
    note: setNote,
  };
  const { take: takeFolder, out: outFolder, step: stepFolder, off: stepOff } = folderPlayout;
  /** Whether a cue is on air now, from the store as it stands and liveCue as last set. */
  const cueOnAirNow = (cue: ShowCue) =>
    cueOnAir(cue, { items: playoutItems, ownership: serverPlayout.ownership.get(), liveCue: liveCueRef.current, graphicName: cueGraphicName });

  // ── AUTHORING THE RUNDOWN (home/useRundownAuthoring.ts): its edits, the clipboard, the pictures and
  // the refresh. Nothing there airs; a removal takes its graphic or server cue off through these verbs. ──
  const {
    refreshRundown, uploadPictures, removeCue, removeGraphic, writeRundown, editIds, removeCues, cutIds,
    newFolder, duplicateCues, takeOutOfFolders, removeFolderOf, moveRundown, toggleFolder, editVerb,
  } = rundownActions(authoring, {
    id, show, setShows, setNote, setDraft: dropDraft, library, cues, graphicByPoolId, playoutItems, serverOnAir, playoutItemFor, rundown, range,
    cursorRow, selectedCue, selectedFolder, heldMembers, inRundownOrder, selectCue, history, flush: flushDraft, draftOwner,
    backendConfigured, user, openSignIn, offAir: takeOffAir,
    serverOut: (cue) => playoutVerb(cue, 'out', 'Out'),
  });

  // The number fields the ± LIVE NUMBERS block bumps: operator-visible `number` fields that no
  // ⚡ event carries as payload. A payload field (the spotlight index, a focused row) is set by
  // its own action — a second road to it would air a value without the state that gives it
  // meaning. Derived from the template alone, like everything else here: any graphic with a
  // number field gets the block, and no category is ever consulted.
  // A live candidate's fields come from its source, so they get no ± (E7.1).
  const liveNumberFields = liveNumbersOf(descriptors, events, editingCue ? candidateFields(editingCue) : []);

  /** Rows the edited cue can load (D3's binding) — the SHARED matcher, `control/cueData.ts`,
   *  so the hosted control page offers exactly the rows this page does. Live here (a dataset
   *  edited a second ago is loadable); published for the hosted page. */
  const dataRows = cueDataRows(descriptors, show.datasets ?? []);
  const hasSides = hasSideFields(descriptors);
  /** The editor's BANDS (control/cueFieldGroups.ts): one per side on a two-sided board, one for
   *  everything both sides share, and a single unlabelled band - today's flat flow - on every
   *  graphic the rule is not confident about. */
  /** A one-press pick's field leaves the boxes for ▸ Advanced, where it stays editable for the
   *  hidden-choice flow (pinned live controls D8); its pick group is in LIVE. */
  // A field bound to production data or shown by a live candidate keeps its read-out in the bands.
  const pickKeys = new Set(
    [...pickFields(events, descriptors, poolMachines.get(selectedGraphic ?? '')?.path ?? new Set<string>())].filter(
      (key) => !(selectedGraphic && boundFields(selectedGraphic)[key]) && !(editingCue && candidateFields(editingCue).includes(key)),
    ),
  );
  const fieldGroups = groupCueFields(descriptors)
    .map((group) => ({ ...group, keys: group.keys.filter((key) => !pickKeys.has(key)) }))
    .filter((group) => group.keys.length > 0);
  const pickedFields = descriptors.filter((d) => pickKeys.has(d.key));
  const descriptorByKey = new Map(descriptors.map((d) => [d.key, d]));
  /** Which of the edited cue's values the monitors say do not fit — see CueOverflowNote. */
  const overflowKeys = cueOverflowKeys({
    editingIsLive,
    selectedGraphic,
    programOverflow,
    // The PREVIEW monitor measures the cue ON it. In 'preview-then-take' mode that is not
    // always the cue being edited, and a warning about another cue's words would be a lie
    // beside this one's fields.
    previewOverflow: selectedCueStaged ? previewOverflow : [],
    known: descriptorByKey,
  });
  const overflowSet = new Set(overflowKeys);
  const loadableRows = rowsForSide(dataRows, loadSide);
  /** Load one row into the edited cue's DRAFT (never air), remembering it per cue so Load next row
   *  walks the bank in order. */
  const loadRow = (id: string) => {
    const row = dataRows.find((r) => r.id === id);
    if (!row || !editingCue) return;
    editDraft({ values: row.values });
    setLastLoaded((m) => ({ ...m, [editingCue.id]: id }));
  };

  // ── Graphic-specific ACTIONS (the ⚡ buttons — docs/PLAYOUT_DASHBOARD.md §8). They act ON
  // AIR the moment they are pressed, like ✎ Update, so they follow Update's legality: live
  // only while the selected cue's graphic is up on its layer. ──
  const stateLabel = formatMachineState(stateNames, machineState);
  /** The states ✎ Update will KEEP on the live layer, in the author's words ("Reveal", "Final").
   *  Update is data only by design, so after a reveal it airs new words under the old verdict;
   *  the surface names what stays and points at ⟳ Re-take (controlModel `movedStateNames`).
   *  `stateNames` is the edited cue's graphic, which is the selected layer whenever Update is
   *  live. */
  const keptStates = editingIsLive
    ? movedStateNames(poolMachines.get(selectedGraphic ?? '')?.js ?? '', stateNames, machineState).join(' and ')
    : '';
  /** What the stored profile turned out to be. READ-ONLY is a profile a newer build wrote: every
   *  write door refuses it, so the authoring panel has to say so rather than offer controls that
   *  would quietly do nothing. */
  const profileRead = readShowProfile(show.profile);
  /** The profile this build may RENDER from — null both for "none" and for one it cannot read,
   *  because a panel arranged by rules this build does not understand is worse than the generated
   *  one. The ⚡ block does not need this: `arrangeFor` applies the same gate itself. The Controls
   *  panel does, because whether there is a profile to DELETE is a different question from what
   *  it says. */
  const renderProfile = readPublishedProfile(show.profile);
  /** Write ONE graphic's arrangement. `withGraphicArrange` owns the key guard and the canonical
   *  form; `setShowProfile` owns the read-only refusal, and reports it rather than swallowing it
   *  (the surface that showed "Saved" over a write that never happened is the worse bug). */
  const profileWritten = ({ shows: next, refused }: { shows: Show[]; refused: boolean }) => {
    if (refused) setNote('This production’s control profile was written by a newer build, so it cannot be changed here.');
    else setShows(next);
  };
  const poolNames = show.graphics.map((g) => g.name);
  /** The LAST arrangement or pin cleared removes the key rather than storing an empty profile, so
   *  "no profile" stays one state: a production that never had one and one whose every
   *  arrangement was cleared are byte-identical, and every surface downstream recognises a single
   *  "none". Both writes drop a pin whose graphic left the pool (pinned live controls D7). */
  const writeProfile = (profile: ShowProfile) => profileWritten(profileIsEmpty(profile) ? deleteShowProfile(id) : setShowProfile(id, profile));
  const writeArrange = (graphic: string, entries: Record<string, ArrangeEntry>) => writeProfile(withGraphicArrange(show.profile, graphic, entries, poolNames));
  /** Pin or unpin one graphic's live controls, from its block head or its rundown row. */
  const writePin = (graphic: string, pinned: boolean) => {
    if (readOnlyProfile) {
      setNote('This production’s control profile was written by a newer build, so it cannot be changed here.');
      return;
    }
    writeProfile(withPinnedGraphic(show.profile, graphic, pinned, poolNames));
  };
  /** Every graphic's arrangement at once, including one for a graphic no longer in the pool,
   *  which no block can reach any more. Pins are not arrangements and stay; with none, the profile
   *  key goes, as it does for the last reset. */
  const clearAllArrangements = () => {
    writeProfile(serializeShowProfile({ v: PROFILE_VERSION, arrange: {}, pinnedGraphics: pinnedGraphicsOf(show.profile) }, poolNames));
  };

  // Grouped and ordered by the SHARED helper (controlModel `arrangeControls`), so the hosted
  // page's ⚡ block, the exported controller's and this one can never sort the author's sections
  // or this production's arrangement differently. With no profile it is the generated panel,
  // byte for byte as it was before ARRANGE existed.
  // A label naming a field ("+1 {f0|P1}") reads it from what the layer was last SENT, never from
  // the editor: the press acts on air, so the button names the player the audience sees.
  const selectedPath = poolMachines.get(selectedGraphic ?? '')?.path ?? new Set<string>();
  const arranged = arrangeControls(
    withLiveLabels(events, selectedGraphic && selectedLayerLive ? (airedData[selectedGraphic] ?? null) : null),
    arrangeFor(show.profile, selectedGraphic),
    (b) => pickOptions(b, descriptors, selectedPath, events),
  );
  /** What » Next will do, in words, on the button itself: the declared control it is ("Reveal
   *  correct") or the state it enters, and "last step" when it would do nothing. Only while the
   *  layer is live and the graphic has reported where it is - a guess would be worse than none. */
  const nextLabel =
    selectedLayerLive && selectedGraphic && !selectedPlayoutLive
      ? nextMoves
        ? advanceLabel(poolMachines.get(selectedGraphic)?.js ?? '', machineState, arranged, stateNames)
        : hasSteps(poolMachines.get(selectedGraphic)?.js ?? '')
          ? 'last step'
          : null
      : null;

  /** Fire a machine event on the live graphic, or snap it straight to a state (control/graphicVerbs.ts
   *  `event`, `snap`): payload values ride from the ON-AIR cue, and a press moving a bound field
   *  waits for the one before it on its graphic. */
  const fireEvent = (button: ControlButton): Promise<void> => verbs.event(view, button);
  const snapTo = (groupId: string | null, stateId: string) => verbs.snap(view, groupId, stateId);

  /** The selected graphic's ⚡ button (home/CueActions.tsx `actionButtonFor`), greyed against
   *  the machine state PROGRAM reports for it and pressed with the page's own selection. */
  const actionButton = actionButtonFor({
    live: selectedLayerLive,
    legal: (event) => isEventLegal(legality, event, machineState),
    labelOf: (key) => descriptors.find((d) => d.key === key)?.label,
    aired: selectedGraphic ? (airedData[selectedGraphic] ?? null) : null,
    fire: (b) => void fireEvent(b),
  });

  /**
   * ONE dispatcher for the verbs, from a key or from the button that wears the key.
   *
   * SPACE IS THE TOGGLE, and so is the button under it (acceptance pass 2026-08-06: "it
   * should go in and out with space"; operator feedback 2026-08-07: the key and the button
   * disagreed - SPACE took a live cue OFF while the button beside it re-took). One control,
   * one gesture, the SPX way: the selected cue goes on, and the same control takes it off.
   * RE-TAKE is a SECONDARY action with its own key, never the primary control wearing a
   * different meaning while a cue happens to be live - that is the state an operator is least
   * able to check before pressing. `0` still means Out, from either state.
   *
   * TWO SPACE MODES (owner, 2026-09-10; docs/PLAYOUT_DASHBOARD.md §2). The decision is the
   * shared table in components/playoutKeys.ts; this only carries it out. In
   * 'preview-then-take' mode a cue taken off air LANDS ON PREVIEW - the mixer cut - and a cue
   * not yet on PREVIEW goes there first, airing nothing.
   */
  const onVerb = (key: PlayoutVerb, press?: VerbPress) => {
    // Editing the rundown (docs/CLIP_PLAYBACK_PLAN.md §20.2): its keys are the editor's, and air nothing.
    if (editVerb(key)) return;
    const decision = decideVerb(key, press, {
      ...view,
      cues,
      items: playoutItems,
      rows: rundown.rows,
      rowOf: rundown.rowOf,
      folderId: selectedFolder?.id ?? null,
      step: heldStep,
      onAirNow: cueOnAirNow,
      stepBlocked: stepBlocker,
      directBlocked: directBlocker,
      ownership: serverPlayout.ownership.get,
      timing: serverPlayout.timing.get,
    });
    switch (decision.do) {
      case 'trigger': {
        window.dispatchEvent(new CustomEvent('noacg-direct-cue'));
        const { cue, label, refused } = decision;
        if (refused) setNote(refused);
        else if (cue.source === 'playout') void serverVerb(cue, 'take', label, { direct: true }).then((r) => r && setNote(r.note));
        else void takeGraphicCue(cue, label, true).then((r) => r && setNote(r.note));
        return;
      }
      case 'hold':
        toggleHold(chipGraphic);
        return;
      case 'all-out':
        void outAll();
        return;
      case 'select-folder':
        selectFolder(decision.folderId, decision.rowId);
        revealCue(decision.reveal);
        return;
      case 'select-cue':
        selectCue(decision.cueId);
        revealCue(decision.reveal);
        return;
      case 'take-off':
        void stepOff([decision.cue]);
        return;
      case 'take':
        void takeCue(decision.cue);
        return;
      case 'folder-step':
        void stepFolder(rundown.folders.get(decision.folderId)!);
        return;
      case 'folder-out':
        void outFolder(rundown.folders.get(decision.folderId)!);
        return;
      case 'folder-take':
        void takeFolder(rundown.folders.get(decision.folderId)!);
        return;
      case 'note':
        setNote(decision.text);
        return;
      case 'out-and-stage':
        void outLive();
        setStagedCueId(decision.cueId);
        return;
      case 'stage':
        setStagedCueId(decision.cueId);
        return;
      case 'update':
        void updateLive();
        return;
      case 'next':
        void nextLive();
        return;
      case 'out':
        void outLive();
        return;
      case 'server':
        void playoutVerb(decision.cue, decision.verb, decision.label);
        return;
      case 'walk': {
        const next = stepSelection(rundown.rows, cursorRow, decision.step);
        if (!next) return;
        if (next.kind === 'cue') selectCue(next.cue.id);
        else selectFolder(next.folder.id, next.id);
        revealCue(rowTestId(next));
        return;
      }
    }
  };


  // What a panel's keys show (protocol.md §8), from the same values the verb bar greys with. Read
  // only while the page answers a panel, at each publish and each press.
  /** Which cues' own Take would be refused, worked out once per render: a timing reading publishes
   *  between renders, and only the clock can have moved then. */
  let takeRefused: Set<string> | null = null;
  panel.feed(
    () => {
      const live = new Set(cues.filter(cueOnAirNow).map((c) => c.id));
      takeRefused ??= new Set(cues.filter((c) => !!stepBlocker(c)).map((c) => c.id));
      return panelSnapshot(view, {
        title: show.name,
        cursorRow,
        cues,
        live,
        refused: takeRefused,
        folderRows: rundown.rows.filter((r) => r.kind === 'folder').map((r) => r.id),
        // The clip the clock follows: what the panel counts down, and what its pause-toggle key names.
        clip: panelClipNow(serverPlayout, playoutItems, cues),
        configured: playoutIsConfigured,
        rowCount: rundown.rows.length,
        rows: panelRows,
      });
    },
    // A key that names a row or a clip carries it as `cue`; the verbs that act on the selection never read it.
    (verb, target) => onVerb(verb, { repeat: false, cue: target || undefined }),
    // A refused press is a note in the activity feed, not a command row: nothing was sent.
    (text) => logHere([(id) => noteEntry(id, text)]),
  );

  /** LIVE ACTIONS FIRST (docs/research/control-surfaces-review-2026-10-02 slice 4; owner,
   *  2026-10-02: "live actions before setup"). A graphic that declares ⚡ actions is OPERATED
   *  through them - a scorebug's clock and goals, a quiz's beats - so they sit straight under the
   *  monitors, and the setup fields come after them and can fold away. A graphic with no actions
   *  keeps the order it always had, because its fields are the whole panel. */
  const readOnlyProfile = profileRead.status === 'read-only';
  /** PINNED LIVE CONTROLS (docs/work-specs/pinned-live-controls/spec.md): one block per pinned pool
   *  graphic, then the selected cue's graphic. A pinned block presses with a selection built for
   *  its own graphic's on-air cue (control/liveControls.ts `liveSelection`), never the page's. */
  const pinned = pinnedGraphicsOf(show.profile);
  const { blocks: liveOrder } = liveBlocks(pinned, poolNames, selectedGraphic);
  const stacked = liveOrder.some((b) => b.pinned);
  const liveFirst = (events.length > 0 && !!selectedGraphic) || stacked;
  const fieldsFolded = liveFirst && !!poolGraphic && foldedFields.has(poolGraphic.id) && !layerClash;
  const arranging = !!selectedGraphic && arrangingFor === selectedGraphic;
  const shared = { readOnlyProfile, setArrangingFor, renderProfile, writeArrange, clearAllArrangements };
  const pinnedBlock = (graphic: string): LiveBlockView['actions'] | null => {
    const m = poolMachines.get(graphic);
    if (!m) return null;
    const sel = liveSelection(graphic, cues, liveCue);
    const live = sel.selectedLayerLive;
    const state = machineStates[graphic] ?? null;
    const aired = live ? (airedData[graphic] ?? null) : null;
    return {
      ...shared,
      events: m.buttons,
      arranging: arrangingFor === graphic,
      stateLabel: formatMachineState(m.stateNames, state),
      selectedLayerLive: live,
      stateGroups: m.stateGroups,
      snapTo: (groupId, stateId) => verbs.snap(sel, groupId, stateId),
      selectedGraphic: graphic,
      arranged: arrangeControls(withLiveLabels(m.buttons, aired), arrangeFor(show.profile, graphic), (b) => pickOptions(b, m.descriptors, m.path, m.buttons)),
      actionButton: actionButtonFor({
        live,
        // A layer holding a cue this page cannot see has no values to carry: such presses wait.
        legal: (event) => isEventLegal(m.legality, event, state) && (!!sel.airCue || !actionCarriesValues(m.buttons.find((b) => b.event === event) ?? { payload: [] })),
        labelOf: (key) => m.descriptors.find((d) => d.key === key)?.label,
        aired,
        fire: (b) => void verbs.event(sel, b),
      }),
      liveNumberFields: liveNumbersOf(m.descriptors, m.buttons, sel.editingCue ? candidateFields(sel.editingCue) : []),
      editingIsLive: sel.editingIsLive,
      bumpLive: (key, delta) => verbs.bump(sel, key, delta),
    };
  };
  const blockViews: LiveBlockView[] = liveOrder.flatMap((b) => {
    const actions =
      // A pinned block always presses its graphic's on-air cue, even while another cue of it is
      // selected for preparing; only an unpinned selected block uses the page's selection.
      b.selected && !b.pinned
        ? {
            ...shared,
            events,
            arranging,
            stateLabel,
            selectedLayerLive,
            stateGroups,
            snapTo,
            selectedGraphic: b.graphic,
            arranged,
            actionButton,
            liveNumberFields,
            editingIsLive,
            bumpLive,
          }
        : pinnedBlock(b.graphic);
    // A graphic with no live controls draws no block, pinned or not.
    if (!actions || (actions.events.length === 0 && actions.liveNumberFields.length === 0)) return [];
    const cueId = liveCue[b.graphic];
    return [{ graphic: b.graphic, pinned: b.pinned, selected: b.selected, cue: cueId ? (cues.find((c) => c.id === cueId)?.label ?? null) : null, actions }];
  });
  const liveBlock = blockViews.length > 0 && <LiveControls blocks={blockViews} onPin={writePin} readOnly={readOnlyProfile} />;

  /** THE ONE PLAYOUT STATUS (control/playoutStatus.ts): whether this production can air, worst
   *  first, from what this page already knows - published or not, changed since, the Bridge and the
   *  server, what the output's slot holds, and READY's reading of the outputs. */
  const started = !!hostedSlug;
  /** What is on air, and what is up on this page only: not started, a graphic's Take reaches no
   *  output, while a server cue airs through NoaCG Bridge either way (studio-day-playout D16). */
  const airingLayers = started ? [...liveLayers, ...livePlayoutLayers] : livePlayoutLayers;
  const upHereLayers = started ? [] : liveLayers;
  const readySummary = readiness.summary.show ? readiness.summary : null;
  const unsupportedCue = bridgeOk ? cues.filter(c => c.source === 'playout').map(c => ({ cue: c, reason: takeBlocker(c, cues, playoutItems, addressOfItem, playbackAbility, folders, graphicOfCue) })).find(c => c.reason) : null;
  const bridgeFact: StatusFacts['bridge'] = playoutRelevance.bridge
    ? playoutIsConfigured
      ? (bridgeStatus ?? { state: 'pending', detail: '' })
      : { state: 'config', detail: '' }
    : null;
  const slotWhere = slotAddress(slotOf(playoutSettings));
  // The renderer on the CasparCG slot, which tags itself with the CasparCG destination it was loaded
  // with: OBS reporting is not CasparCG drawing (D3). A production whose CasparCG output was never
  // tagged (from before destinations) has nothing to tell them apart by.
  const casparReporting = casparDestination
    ? livePresence.peers.some((p) => p.kind === 'output' && p.destinationId === casparDestination && !!p.ready)
    : undefined;
  /** Lost, not merely empty: this session saw it there (`slotSeenOurs`). */
  const slotLost = slotSeenOurs && !!outputSlot && (outputSlot.holds === 'empty' || outputSlot.holds === 'other');
  const playoutStatus = describePlayoutStatus({
    started,
    publishing,
    casparOn,
    bridge: bridgeFact,
    slot: playoutRelevance.slot && outputSlot ? { where: slotWhere, channel: playoutSettings.channel, ...outputSlot, reporting: casparReporting } : undefined,
    slotLost,
    ready: readySummary,
    noOutputTake,
    fileCheck: needsServerFiles && bridgeOk ? serverFiles?.key === serverFileKey ? serverFiles.check : { key: 'files', tone: 'warn', short: 'Checking server files…', label: 'Checking referenced CasparCG files…' } : null,
    playbackCheck: unsupportedCue ? { key: 'playback', tone: 'bad', short: 'Cue settings unavailable', label: `${unsupportedCue.cue.label}: cannot Take`, advice: unsupportedCue.reason! } : null,
  });
  const flowBusy = prepareFlow.phase === 'publishing' || prepareFlow.phase === 'preparing';
  const { headerAction, casparFacts } = publishFacts(publishState, {
    started, casparOn, playoutIsConfigured, bridgeOk, outputSlot, cues, backendConfigured, needsSignIn, slotWhere,
    outputUrl, requiresPreparation, authoringAllowed, playoutStatus, playoutSettings, casparOutputMemory, casparTarget,
    flowBusy, publish, loadOnSlot,
  });
  /** The panel's own lines for what went wrong where no row of its own says it. */
  const problemChecks = [
    ...playoutStatus.checks.filter((c) => (c.key === 'take' || c.key === 'files' || c.key === 'playback') && (c.tone === 'bad' || c.tone === 'warn')),
    // Of the readiness run's own lines only a failed publish has no row of its own; the Bridge,
    // the slot and the outputs say their state in their rows.
    ...(prepareFlow.phase === 'done' ? (prepareFlow.shown ?? []).filter((l) => l.tone === 'bad' && l.key === 'publish').map((l) => ({ key: l.key, tone: 'bad' as const, label: l.label, advice: l.advice })) : []),
  ];
  /** The CasparCG switch (AC-4): display metadata only, nothing airs or stops. */
  const setCaspar = async (on: boolean) => {
    const result = setShowOutputSetup(show.id, withCasparSwitch(show.outputSetup, on));
    setShows(result.shows);
    const failure = result.error ?? (await commitDurableWrites());
    if (failure) setNote(`The CasparCG switch was not saved: ${failure}`);
    if (!on) setReplaceAsk(false);
  };

  // WHICH VIEWS THE SWITCHER SHOWS (docs/PLAYOUT_DASHBOARD.md §2, owner 2026-10-03): Data and
  // Messages are views used live, so they stay views, but only on a production that uses them. A
  // plain production shows Playout alone and reaches both through Setup. Data is in use once
  // there is a table, a seed, a binding or a live value; Messages once the pool holds a graphic
  // made for it (a message card or a vote board) or anything is in its inbox.
  const views = {
    data:
      (show.datasets?.length ?? 0) > 0 ||
      Object.keys(show.data ?? {}).length > 0 ||
      Object.keys(show.bindings ?? {}).length > 0 ||
      Object.keys(liveData).length > 0,
    audience:
      audienceInbox.any ||
      show.pollLiveFigures === true ||
      show.graphics.some(
        (g) => g.template.type === 'audience' || g.template.type === 'poll' || pollFieldMap(g.template.fields ?? []) !== null,
      ),
    waiting: audienceInbox.waiting,
  };

  return (
    <ProductionShell
      show={show}
      status={
        <>
          <PlayoutStatusControl
            status={playoutStatus}
            started={started}
            open={statusOpen}
            onToggle={() => setStatusOpen((o) => !o)}
            onClose={() => setStatusOpen(false)}
            ready={readySummary}
            diagnostics={serverOwnership.unidentified.length}
          >
            <PanelProblems checks={problemChecks} />
            {started && (
              <RendererRows
                outputs={readiness.outputs}
                onDismiss={forgetOutput}
                onCheck={() => void prepareFlow.run({ publish: false })}
                checking={flowBusy}
                checked={readiness.newestStamp ? `Checked ${clockWords(readiness.newestStamp.at)}` : undefined}
                paths={commandPathsOf(prepareFlow.shown ?? [])}
              />
            )}
            <BrowserSourceRow
              url={browserOutputUrl}
              copied={copied === 'output'}
              onCopy={() => browserOutputUrl && copy('output', browserOutputUrl)}
              onTemplate={downloadEmbed}
            />
            <CasparSection
              facts={casparFacts}
              onToggle={(on) => void setCaspar(on)}
              onLoad={() => outputUrl && void loadOnSlot(outputUrl)}
              onUnload={() => void unloadFromSlot()}
              onReplace={() => outputUrl && void loadOnSlot(outputUrl, true)}
              onCancelReplace={() => setReplaceAsk(false)}
              onPair={() => setPlayoutSettingsOpen(true)}
              onSettings={() => {
                setStatusOpen(false);
                setPlayoutSettingsOpen(true);
              }}
            />
            {serverOwnership.unidentified.length > 0 && <ServerDiagnostics ownership={serverOwnership} timing={serverPlayout.timing} cues={cues} folders={folders} clear={slot => void clearSlot(slot)} />}
            <DueActions>
              {!started && (
                <button className="primary" onClick={() => void publish()} disabled={busy || flowBusy || !backendConfigured} data-testid="panel-publish">
                  Publish
                </button>
              )}
              {started && unpublishedChanges && (
                <button onClick={() => void publish()} disabled={busy || flowBusy} data-testid="panel-publish-changes">
                  Publish changes
                </button>
              )}
            </DueActions>
          </PlayoutStatusControl>
          <span className="pd-action-slot" data-testid="playout-action-slot">
            {headerAction && (
              <button
                className={headerAction.primary ? 'primary' : 'pd-action-due'}
                onClick={headerAction.run}
                disabled={busy || flowBusy || slotBusy || headerAction.unavailable}
                title={headerAction.title}
                data-testid={headerAction.testId}
              >
                {headerAction.label}
              </button>
            )}
          </span>
        </>
      }
      liveLayers={liveLayers}
      follow={follow}
      resolveWaiting={resolveWaiting}
      onHome={() => navigate({ view: 'home', section: null })}
      // BACK is where you came from - the dashboard, the list, the graphic being made - and the
      // productions list only when this page was opened cold (a bookmark, a new tab), where there
      // is nowhere to go back to. Home, beside it, always goes to the dashboard.
      onBack={() => goBack({ view: 'home', section: 'productions' })}
      onAllOut={() => void outAll()}
      allOutEnabled={view.allOutEnabled}
      allOutClearing={clearing}
      panel={panel}
      onPanel={() => setPanelOpen(true)}
      panelDialog={panelOpen && <PanelDialog slug={hostedSlug} answer={panel} onClose={() => setPanelOpen(false)} />}
      onPlayoutSettings={() => setPlayoutSettingsOpen(true)}
      // A build that cannot publish has no links to show, unless the record already holds some.
      onLinks={backendConfigured || hostedSlug ? () => setLinksOpen(true) : undefined}
      views={views}
      onExport={() => setExportOpen(true)}
      onKey={onVerb}
      onEditKey={key => {
        if (!canAuthorAccount()) return false;
        if (key === 'delete') {
          const ids = editIds();
          if (!ids.length) return false;
          void removeCues(ids); return true;
        }
        return history.press(key, () => {
          window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
          return flushDraft();
        });
      }}
      renders={renders.current}
      sub={sub ?? null}
      onTab={() => navigate({ view: 'production', id: show.id })}
    >
      {sub === 'data' && (
        <AccountAuthoringGate>
        <ProductionDataWorkspace
          show={show}
          setShows={setShows}
          liveData={liveData}
          setLiveData={setLiveData}
          resolved={resolved}
          dataKey={dataKey ?? null}
          sourceStatus={sourceStatus}
          publish={started ? null : { run: () => void publish(), unavailable: backendConfigured ? null : 'Publishing needs the cloud backend, and this build runs offline' }}
        />
        </AccountAuthoringGate>
      )}
      {sub === 'audience' && <AccountAuthoringGate><ProductionAudienceWorkspace show={show} setShows={setShows} /></AccountAuthoringGate>}
      {/* THE PLAYOUT SURFACE STAYS MOUNTED behind a sub-page, hidden rather than unmounted.
          Unmounting it destroyed the PROGRAM monitor's iframes, so a trip to Data or Audience
          RELOADED every live graphic: a running match clock came back at its seed, and anything
          else with runtime state came back from the top. Nothing on this page is a reason to
          restart a graphic that is on air. `display: none` costs the monitors their measured
          width while they are away, which the ResizeObserver hands straight back. */}
      {keepPlayout && (<>
      <section className={`pd-main${sub ? ' pd-offstage' : ''}`}>
        {/* `--pd-ar` is the PREVIEW graphic's aspect ratio as a bare number. The monitor cap is
            a height and CSS cannot derive a width from `aspect-ratio`, so the grid turns the cap
            into a track width with this (docs/PLAYOUT_DASHBOARD.md §2). A portrait graphic
            therefore caps at the same HEIGHT as a 16:9 one rather than the same width. */}
        {/* THE STAGE HEAD: the monitors and the verbs that act on them, as ONE fixed block
            that sits outside the control area's scroller, so nothing moves it.
            Two things came out of the 2026-08-21 owner read (docs/PLAYOUT_DASHBOARD.md §2). The
            verb bar used to scroll away under the monitors - "a bit scary that you scroll the
            monitors on top of the take buttons" - and TAKE and Out must never leave the screen
            any more than the pictures may. And above 1366px the bar moves
            into the empty column beside PROGRAM, which spends that width and gives the monitors
            back the height the bar was using. Below it, the bar returns underneath. */}
        <SelectionHolds
          part={session.selections}
          labelOf={(cueId) => cues.find((c) => c.id === cueId)?.label ?? null}
          nextOf={(cueId, graphic) => {
            const cue = cues.find((c) => c.id === cueId);
            const take = cue ? selectionTake(cue, graphic, selectionFacts()) : null;
            return take?.status === 'ok' ? take.selection.key : null;
          }}
        />
        <div className="pd-stagehead">
        <PlayoutMonitors
          // Server media goes through NoaCG Bridge whether or not the production is started, so
          // with a clip up the monitor is showing air even offline (studio-day-playout D16).
          live={started || livePlayoutLayers.length > 0}
          graphicsAir={started}
          stage={stage}
          previewDoc={previewDoc}
          previewTemplate={previewTemplate}
          previewCue={previewCue}
          draft={cueDraft}
          previewLabel={(label) =>
            label !== null
              ? selectedFolder && spaceMode === 'take'
                ? `${label} · ${heldStep ? 'next' : 'first'} in ${folderName(selectedFolder)}`
                : label
              : spaceMode === 'preview-then-take'
                ? PREVIEW_EMPTY_LABEL
                : selectedFolder
                  ? folderName(selectedFolder)
                  : 'nothing selected'
          }
          settleOf={settleOf}
          previewLook={previewCue ? (adjustStateOf(previewCue)?.look ?? null) : null}
          guides={adjustOpen && !!previewCue && previewCue.id === editingCue?.id}
          measure={(() => {
            const g = previewCue && previewCue.source !== 'playout' ? graphicByPoolId.get(previewCue.sourceId) : undefined;
            if (!previewCue || !g || (!adjustOpen && g.adjust === undefined && previewCue.adjust === undefined)) return null;
            const cueId = previewCue.id;
            return {
              keyOf: (data: string) => measureId(g.id, g.savedAt, cueId, JSON.parse(data) as Record<string, string>, stage),
              onMeasured: (key: string, m: Measurement) => session.geometry.set((part) => measured(part, cueId, g.id, key, m)),
            };
          })()}
          hasCues={cues.length > 0}
          emptyHint={
            selectedFolder && spaceMode === 'take' && !previewCue && heldStep
              ? heldStep.kind === 'top'
                ? `${folderName(selectedFolder)} has no cue left to take: SPACE goes back to its first cue.`
                : `Everything in ${folderName(selectedFolder)} is on air.`
              : undefined
          }
          liveLayers={liveLayers}
          serverLayers={livePlayoutLayers}
          previewServer={previewCue ? playoutItemFor(previewCue) : null}
          previewSeconds={(() => {
            const item = previewCue ? playoutItemFor(previewCue) : null;
            return previewCue && item ? segmentSeconds(previewCue, item) : undefined;
          })()}
          programClip={followedClip(serverOwnership, playoutItems)?.item ?? null}
          show={show}
          library={library}
          programRef={programRef}
          onState={noteProgramState}
          onReady={restoreProgram}
          onOverflow={notePreviewOverflow}
          air={programAir({ published: !!hostedSlug, sending: sendingNow, owed: sendOwed, loggedAt, lost: !!hostedSlug && (offline || resolveWaiting) })}
          serverLost={casparOn && (bridgeStatus?.state === 'bridge' || bridgeStatus?.state === 'server') ? bridgeStatus.state : null}
          programChip={
            chipGraphic ? (
              <ProgramAutoChip
                arm={cueArms[chipGraphic]}
                label={chipLabel ?? chipGraphic}
                onToggle={() => toggleHold(chipGraphic)}
                onManual={() => manualLane(chipGraphic)}
              />
            ) : null
          }
        />

        {/* THE VERB COLUMN: the verbs, and under them the clip clock while a server clip is on
            air (docs/CLIP_PLAYBACK_PLAN.md §6.4). The clock takes only the height the column has
            left beside PROGRAM; on a phone this wrapper stands down so the verbs stay pinned to
            the bottom and the clock sits in the stacked column. */}
        <div className="pd-verbcol">
        {/* The verbs, with the keys that fire them. All out lives in the header — it is the
            panic control and must not sit beside the ones used every minute. */}
        <div className="pd-verbs" data-testid="production-verbs">
          {/* There is no → Preview button (2026-08-22). PREVIEW here is a local stage that
              already follows the selection, so the verb re-selected the cue that was on it and
              nothing else — while sitting second-loudest on a bar where every other control
              changes air. Selecting a cue in the rundown IS previewing it. */}
          {/* THE TOGGLE. The button IS the key: on when the cue is off, off when it is on.
              It used to re-take here while SPACE took the cue off air — one surface, two
              behaviours, and the button's own label ("RE-TAKE") was what an operator read
              while their finger was on the key that did the opposite. */}
          {/* Its three faces come from the SAME decision the key runs (`spaceNext`), which is
              the only way "the button IS the key" survives a second mode: → PREVIEW (amber,
              airs nothing) exists only in 'preview-then-take' mode, on a cue not yet on PREVIEW. */}
          {/* A held folder row wears the folder's face: TAKE starts it by how it plays, TAKE OFF takes
              all of it off. One by one's steps: each press names the cue it takes. */}
          <button
            className={`${takeButton.face.className}${rehearsing && takeButton.space !== 'preview' ? ' pd-verb-rehearsal' : ''}`}
            disabled={takeButton.disabled}
            onClick={() => onVerb('take')}
            title={takeButton.title}
            data-testid="verb-take"
          >
            {takeButton.face.text} <kbd>SPACE</kbd>
          </button>
          {/* RE-TAKE is secondary: replaying the entrance of a cue that is already on air. It
              never becomes the primary button. It is always PRESENT and greys out when it does
              not apply, like every other verb on this bar — a control that appears and
              disappears would move Update, Next and Out sideways at the exact moment a cue
              goes live, which is when an operator is least looking at the bar. */}
          <button
            className="pd-verb pd-verb-secondary"
            disabled={view.disabled.retake}
            onClick={() => selectedCue && void takeCue(selectedCue)}
            title="Re-take: play this cue’s entrance again from the start"
            data-testid="verb-retake"
          >
            ⟳ Re-take <kbd>R</kbd>
          </button>
          <button
            className={`pd-verb pd-verb-update${hasUnsent ? ' pd-unsent' : ''}`}
            disabled={view.disabled.update}
            onClick={() => void updateLive()}
            title={
              keptStates
                ? `Sends the values. Stays on ${keptStates}.`
                : hasUnsent
                  ? `${unsentFields.length} edited value${unsentFields.length === 1 ? '' : 's'} has not been sent yet - air still shows the previous one`
                  : 'Send the edited values to the live layer, without replaying it'
            }
            data-testid="verb-update"
          >
            ✎ Update <kbd>U</kbd>
            {/* The DOT is the whole point of §3c: nothing here airs by itself, so the only way
                an operator learns that air is behind their screen is if the surface says so. */}
            {hasUnsent && <span className="pd-unsent-dot" aria-hidden="true" />}
          </button>
          <button
            className={`pd-verb${nextLabel ? ' pd-verb-named' : ''}`}
            disabled={view.disabled.next}
            onClick={() => void nextLive()}
            title={
              selectedGraphic && selectedLayerLive && !nextMoves
                ? `${selectedGraphic} is on its last step - Out takes it off, Re-take starts it again`
                : undefined
            }
            data-testid="verb-next"
          >
            {/* Unnamed, the button is drawn exactly as it always was. */}
            {nextLabel ? (
              <>
                <span className="pd-verb-main">» Next <kbd>N</kbd></span>
                <span className="pd-verb-target" data-testid="verb-next-target">
                  {nextLabel}
                </span>
              </>
            ) : (
              <>
                » Next <kbd>N</kbd>
              </>
            )}
          </button>
          <button
            className="pd-verb"
            disabled={view.disabled.out}
            onClick={() => onVerb('out')}
            data-testid="verb-out"
          >
            {/* SPACE belongs to the toggle above, and only there. This button is about the
                selected LAYER, which is not always the selected cue's. */}
            ■ Out <kbd>0</kbd>
          </button>
          {selectedPlayoutItem && <button className="pd-verb pd-verb-secondary" data-testid="verb-clear-slot" onClick={() => void clearSlot(serverOnAir[selectedPlayoutItem.id]?.slot ?? itemSlot(playoutSettings, selectedPlayoutItem))} title="Immediately clear this CasparCG slot, including queued media. Other slots keep playing.">Stop/Clear slot</button>}
          {/* The bar's small print, as ONE block: the on-air chip and, under it, THE OPERATOR'S
              CHOICE of what SPACE does (owner, 2026-09-10: "a checkbox for this so the operator
              can choose for themselves") - here beside the key, not on a settings screen. One
              container so the two stack at the bar's end below 1366px instead of the checkbox
              wrapping alone to the far left. */}
          <span className="pd-verb-aside">
            {/* What is up, graphics and server cues alike: a clip on the playout server is on air
                too, and "nothing on air" beside its running clock would be the one untrue line.
                Not started, a graphic plays on this page only, so it is "up, not live" in the
                monitor's grey while a server cue beside it still airs (studio-day-playout D16). */}
            <span className="pd-onair-line" data-testid="live-cue-chip">
              {airingLayers.length === 0 && upHereLayers.length === 0 ? (
                <span className="muted">○ nothing on air</span>
              ) : (
                <>
                  {airingLayers.length > 0 && (
                    <>
                      on air: <span className="pd-onair">● {airingLayers.map((l) => l.label).join(' · ')}</span>
                    </>
                  )}
                  {upHereLayers.length > 0 && (
                    <span className="pd-up-here-part" data-testid="live-cue-up-here">
                      up, not live: <span className="pd-up-here">○ {upHereLayers.map((l) => l.label).join(' · ')}</span>
                    </span>
                  )}
                </>
              )}
            </span>
            {unordered && <UnorderedSends testId="unordered-sends" />}
            {/* Where TAKE sends the selection (C6, AC-16): the outputs, or this page only. */}
            <span className="pd-onair-line pd-target-line" data-testid="verb-target">
              {takeTarget}
            </span>
            <SpaceModeToggle mode={spaceMode} onChange={changeSpaceMode} testId="space-mode" />
          </span>
        </div>
        <ClipClock store={serverPlayout} items={playoutItems} cues={cues} />
        </div>
        </div>

        {/* THE CONTROL AREA, the ONE scroll container on this page (docs/PLAYOUT_DASHBOARD.md
            §2). Everything an operator edits lives in here - the note, the cue editor, the
            actions, the controls panel and the activity log - and only this box scrolls, so
            the stage head above it and the rundown beside it never move. */}
        <div className="pd-control-area" data-testid="control-area">
        {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="production-note">{note}</p>}
        <div ref={rundownFeedback} className="pd-rundown-feedback" />
        {/* Every data source's health and Pause, whichever cue is selected (home/SourcesLine). */}
        <SourcesLine show={show} setShows={setShows} store={sourceStatus} ownReaders={ownReaders} />

        {/* A held folder row: its panel (home/FolderEditor), where a cue's editor would be. */}
        {selectedFolder &&
          (() => {
            const slot = folderSlot(playoutSettings, selectedFolder);
            const id = selectedFolder.id;
            return (
              <AccountAuthoringGate><FolderEditor
                key={`${show.id}:${id}`}
                folder={selectedFolder}
                members={heldMembers}
                items={playoutItems}
                air={folderStates[id]}
                misses={takeMisses}
                graphicsAir={!!hostedSlug}
                ability={playbackAbility}
                playoutSettings={playoutSettings}
                slot={{ channel: slot.channel, layer: slot.layer, set: selectedFolder.slot?.channel !== undefined || selectedFolder.slot?.layer !== undefined }}
                hasServerCue={cues.some((c) => c.source === 'playout')}
                takeBlocked={view.folderBlocked}
                addressOf={(c) => {
                  const item = playoutItemFor(c);
                  const g = graphicByPoolId.get(c.sourceId);
                  return item ? addressOfItem(item) : g ? `L${graphicLayer(g)}` : '';
                }}
                onRename={(name, closing) => {
                  if (closing) {
                    // Account pause and teardown cannot await the history queue. Its history
                    // is discarded at this boundary; preserve the captured production's text.
                    const result = renameFolderChecked(show.id, id, name);
                    setShows(result.shows);
                    if (result.error) setRundownNote(`The folder was not saved: ${result.error}`);
                  } else void writeRundown(() => renameFolderChecked(show.id, id, name), 'Rename folder', 'The folder was not saved');
                }}
                onMode={(mode) => {
                  const r = setFolderMode(show.id, id, mode);
                  if (r.error) return r.error;
                  setShows(r.shows);
                  return null;
                }}
                onEnd={(end) => setShows(setFolderPlayback(show.id, id, { end }))}
                onSlot={(patch) => setShows(setFolderPlayback(show.id, id, patch))}
              /></AccountAuthoringGate>
            );
          })()}

        {liveFirst && liveBlock}

        {/* The editor. It edits the PREVIEW cue by default and says so; the switch points it at
            the cue already on air on that layer, where ✎ Update pushes edits live. */}
        {editingCue && poolGraphic && (
          <CueEditor
            show={show}
            setShows={setShows}
            poolGraphic={poolGraphic}
            editingCue={editingCue}
            draft={cueDraft}
            editingCueNo={editingCueNo}
            editingIsLive={editingIsLive}
            rehearsing={rehearsing}
            selectedCue={selectedCue}
            selectedCueStaged={selectedCueStaged}
            selectedGraphic={selectedGraphic}
            airCue={airCue}
            editTarget={editTarget}
            setEditTarget={setEditTarget}
            authoringAllowed={authoringAllowed}
            editDraft={editDraft}
            flushDraft={flushDraft}
            rundownHistory={history}
            updateLive={updateLive}
            hasUnsent={hasUnsent}
            unsentFields={unsentFields}
            keptStates={keptStates}
            overflowKeys={overflowKeys}
            overflowSet={overflowSet}
            descriptors={descriptors}
            descriptorByKey={descriptorByKey}
            fieldGroups={fieldGroups}
            pickedFields={pickedFields}
            boundFields={boundFields}
            resolved={resolved}
            cueImages={cueImages}
            liveFirst={liveFirst}
            fieldsFolded={fieldsFolded}
            setFoldedFields={setFoldedFields}
            dataRows={dataRows}
            loadableRows={loadableRows}
            hasSides={hasSides}
            loadSide={loadSide}
            setLoadSide={setLoadSide}
            lastLoaded={lastLoaded}
            loadRow={loadRow}
            layerClash={layerClash}
            sharingLayer={sharingLayer}
            editedLayer={editedLayer}
            advancedOpen={advancedOpen}
            setAdvancedFor={setAdvancedFor}
            clashFix={clashFix}
            sourceStatus={sourceStatus}
            fieldsOf={fieldsOf}
            onConnectPreview={(values) => setConnectPreview(values ? { graphic: poolGraphic.name, values } : null)}
            ownReader={ownReaderOf(poolGraphic)}
            candidate={candidateOf(editingCue)}
            picker={candidatePicker(editingCue)}
            adjust={(() => {
              const g = graphicByPoolId.get(editingCue.sourceId);
              const state = adjustStateOf(editingCue);
              if (!g || !state) return null;
              const mine = (show.cues ?? []).filter((c) => c.sourceId === g.id);
              const scope = state.eff.own.length > 0 || onlyThisCue === editingCue.id ? 'cue' : 'graphic';
              const write = (patch: AdjustPatch) => {
                const anchored = withAnchor(state.eff, state.m, frameOf(g), patch);
                void history.write(
                  () => (scope === 'cue' ? setCueAdjust(show.id, editingCue.id, anchored) : setGraphicAdjust(show.id, g.id, anchored)),
                  `Adjust ${g.name}`,
                );
              };
              return (
                <CueAdjust
                  graphicName={g.name}
                  cueCount={mine.length}
                  exceptions={mine.filter((c) => c.id !== editingCue.id && c.adjust !== undefined).length}
                  scope={scope}
                  onlyThisCue={onlyThisCue === editingCue.id}
                  setOnlyThisCue={(on) => setOnlyThisCue(on ? editingCue.id : null)}
                  state={state}
                  category={g.type}
                  open={adjustOpen}
                  setOpen={setAdjustOpen}
                  write={write}
                  step={(by) => {
                    const anchored = withAnchor(state.eff, state.m, frameOf(g), {});
                    void history.write(() => stepAdjust(show.id, editingCue.id, scope, by, anchored), `Adjust ${g.name}`);
                  }}
                  reset={(at) => {
                    if (at === 'cue') setOnlyThisCue(null);
                    void history.write(() => (at === 'cue' ? setCueAdjust(show.id, editingCue.id, null) : setGraphicAdjust(show.id, g.id, null)), `Reset ${g.name}`);
                  }}
                  promote={() => {
                    setOnlyThisCue(null);
                    void history.write(() => promoteCueAdjust(show.id, editingCue.id), `Adjust ${g.name}`);
                  }}
                />
              );
            })()}
            endsRow={() => {
              const auto = readAuto(editingCue);
              const nextId = nextGraphicCue(cues, editingCue.id);
              const nextCue = nextId ? cues.find((c) => c.id === nextId) : undefined;
              const counting = !!selectedGraphic && cueArms[selectedGraphic]?.cue === editingCue.id;
              const nextHint = counting
                ? 'It is counting now: a new length or end applies from its next Take.'
                : !auto || !takesNext(auto.then)
                ? null
                : !nextCue
                  ? 'Nothing comes after this cue in the rundown, so Next cue has nothing to take.'
                  : auto.then === 'out-next' && cueGraphicName(nextCue) === selectedGraphic
                    ? `Next cue takes “${cueView(nextCue).label}”, on this same layer: its entrance cuts the Out short, and Next cue alone already replaces this one.`
                    : `Next cue takes “${cueView(nextCue).label}”.`;
              return (
                <CueEndsRow
                  key={editingCue.id}
                  auto={auto}
                  refused={
                    hostedSlug && armsServer === 'missing'
                      ? 'This production’s server does not keep timed cues yet, so here they air as manual cues.'
                      : null
                  }
                  nextHint={nextHint}
                  onChange={(next) => {
                    setShows(setCueAuto(show.id, editingCue.id, next));
                    // Made manual while it counts: the countdown goes too, as Manual's does. A new
                    // length or end applies from the next Take, which is when a cue is armed.
                    if (!next && selectedGraphic && cueArms[selectedGraphic]?.cue === editingCue.id) manualLane(selectedGraphic);
                  }}
                />
              );
            }}
            sounds={(editingView) => (
              <ProductionSounds
                key={`${show.id}:${poolGraphic.id}:${poolGraphic.type === 'picture' ? String(editingView.values.f0 ?? '') : 'graphic'}`}
                template={resolveSavedGraphicDoc(poolGraphic,library)?.template ?? poolGraphic.template}
                config={poolGraphic.soundConfig}
                assets={show.graphics.flatMap(g=>g.soundConfig?.assets ?? [])}
                visual={poolGraphic.type === 'picture' ? `picture:${String(editingView.values.f0 ?? '')}` : 'graphic'}
                onSave={async (config,expected,source)=>{
                  const current = loadShows().find(s=>s.id === show.id)?.graphics.find(g=>g.id === poolGraphic.id);
                  const template = current && (resolveSavedGraphicDoc(current,loadGraphics())?.template ?? current.template);
                  if (!current || !template || template.js !== source.js || soundTopology(template) !== source.topology) throw new Error('The visual changed while the sound was preparing. Choose the trigger again.');
                  const result = setGraphicSounds(show.id,poolGraphic.id,config,expected);
                  setShows(result.shows);
                  const failure = result.error ?? await commitDurableWrites();
                  if (failure) throw new Error(failure);
                }}
              />
            )}
          />
        )}

        {/* A cue over the PLAYOUT SERVER'S OWN LIBRARY: its editor (home/ServerCueEditor). */}
        {editingCue && selectedPlayoutItem && (
          <DraftView key={editingCue.id} draft={cueDraft} cue={editingCue}>{(editingView) => (
          <ServerCueEditor
            showId={show.id}
            item={selectedPlayoutItem}
            cue={editingCue}
            view={editingView}
            live={editingIsLive}
            cueNo={editingCueNo}
            bridgeStatus={bridgeStatus}
            ability={playbackAbility}
            playoutSettings={playoutSettings}
            takeBlocked={editingCue.id === selectedCue?.id ? selectedTakeBlocked : takeBlockerFor(editingCue)}
            playNext={playNextFor(editingCue)}
            through={(() => {
              const place = throughRoleOf(editingCue);
              return place ? { folderName: folderName(place.folder), slot: folderSlotOf(place.folder), role: place.role } : null;
            })()}
            onEdit={editDraft}
            onTransport={onVerb}
            setShows={setShows}
          />
          )}</DraftView>
        )}

        {editingCue && <CueAccentControl key={`${show.id}:${editingCue.id}`} show={show} cue={editingCue} setShows={setShows} onPreview={color => setAccentPreview(color ? { productionId: show.id, cueId: editingCue.id, color } : null)} fallback={routeColor(show.rundownColors, selectedPlayoutItem ? throughRoleOf(editingCue) ? folderSlot(playoutSettings, throughRoleOf(editingCue)!.folder).channel : itemSlot(playoutSettings, selectedPlayoutItem).channel : undefined)} />}
        {!liveFirst && liveBlock}

        <ActionLog entries={wireLog} published={!!hostedSlug && backendConfigured} />
        </div>
      </section>

      <CueRundown
        pinnedGraphics={pinned}
        onPin={writePin}
        candidateValues={(cue) => (cue.selection === undefined ? null : candidateOverlay(cue))}
        accentPreview={accentPreview?.productionId === show.id ? accentPreview : null}
        onAccentPreview={(cueId, color) => setAccentPreview(color ? { productionId: show.id, cueId, color } : null)}
        show={show}
        cues={cues}
        rundown={rundown}
        graphicByPoolId={graphicByPoolId}
        library={pickerLibrary}
        playoutSettings={playoutSettings}
        liveCue={liveCue}
        started={started}
        casparOn={casparOn}
        unsentOnAir={unsentOnAir}
        serverOwnership={serverOwnership}
        serverTiming={serverPlayout.timing}
        selectedCueId={selectedCue?.id ?? null}
        previewCueId={previewCue?.id ?? null}
        selectedGraphicId={poolGraphic?.id ?? null}
        heldFolderRowId={selectedFolder ? (selectedFolderRow?.rowId ?? null) : null}
        cursorRowId={cursorRow}
        range={range}
        cutIds={cutIds}
        folderAir={folderStates}
        takeMisses={takeMisses}
        cueArms={timedCues ? cueArms : null}
        toggleHold={toggleHold}
        manualLane={manualLane}
        stepNext={stepNext}
        rundownNote={rundownNote}
        feedbackTarget={rundownFeedback}
        clashes={clashes}
        offstage={!!sub}
        draft={cueDraft}
        cueGraphicName={cueGraphicName}
        playoutItemFor={playoutItemFor}
        folderSlotOf={folderSlotOf}
        throughRoleOf={throughRoleOf}
        selectCue={selectCue}
        clickRow={clickRow}
        clearRange={() => setRangeIds([])}
        onLayerRepair={openLayerRepair}
        removeCue={removeCue}
        removeCues={removeCues}
        removeGraphic={removeGraphic}
        newFolder={newFolder}
        duplicateCues={duplicateCues}
        takeOutOfFolders={takeOutOfFolders}
        removeFolder={removeFolderOf}
        moveRundown={moveRundown}
        toggleFolder={toggleFolder}
        setRundownNote={setRundownNote}
        uploadPictures={uploadPictures}
        refreshRundown={refreshRundown}
        refreshing={refreshingRundown}
        setShows={setShows}
      />
      </>)}
      {exportOpen && <ProductionExportDialog show={show} onClose={() => setExportOpen(false)} />}
      {linksOpen && (
        <ProductionLinksDialog
          busy={busy}
          controlUrl={controlUrl}
          joinUrl={joinUrl}
          presenterUrl={presenterUrl}
          nameDraft={nameDraft}
          nameNote={nameNote}
          onNameDraft={(v) => { setNameDraft(v); setNameNote(null); }}
          onClaimName={() => void claimName()}
          copied={copied}
          onCopy={copy}
          onClose={() => setLinksOpen(false)}
        />
      )}
      {playoutSettingsOpen && (
        <PlayoutSettingsDialog
          show={show}
          setShows={setShows}
          casparOn={casparOn}
          outputUrl={managedOutputUrl}
          onOutputOnAir={(result, target) => onAirChanged('air', result, target)}
          onClose={() => {
            setPlayoutSettingsOpen(false);
            setPlayoutSettingsRev((n) => n + 1);
            setPlayoutIsConfigured(playoutConfigured(loadPlayoutSettings()));
          }}
        />
      )}
    </ProductionShell>
  );
}
