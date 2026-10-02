import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { saveAs } from 'file-saver';
import { routeHash, useRouter, type ProductionSub } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  addGraphicToShow,
  addShowCue,
  deleteShowProfile,
  duplicateLayers,
  graphicLayer,
  loadShows,
  MAX_PLAYOUT_LAYER,
  MIN_PLAYOUT_LAYER,
  nextFreeLayer,
  noteShowOutputOpened,
  removeShowCue,
  removeShowGraphic,
  setShowGraphicLayer,
  setShowAudienceSlugs,
  setShowHostedSlug,
  setShowOutputSlug,
  setShowProfile,
  updateShowCue,
  playoutItemOf,
  removePlayoutItem,
  fillPlayoutItemFacts,
  addFolderFromSelection,
  moveInRundown,
  pasteInRundown,
  removeShowCues,
  takeCuesOutOfFolders,
  removeFolder,
  renameFolder,
  setFolderCollapsed,
  setFolderMode,
  setFolderPlayback,
  type PlayoutItem,
  type PlayoutMediaKind,
  type Show,
  type ShowCue,
  type ShowFolder,
} from '../../model/shows';
import { folderMode, type Movable, type Place } from '../../model/showFolders';
import { cursorRowId, folderName, rangeCueIds, rowCueIds, rowTestId, rundownView, type RundownRow } from '../../model/rundownRows';
import { clipSize, copyClip, cutClip, type CueClip } from '../../model/cueClipboard';
import { commitDurableWrites } from '../../model/durableStore';
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
  outputSlotRefusal,
  stateReadable,
  subscribeTargetStatus,
  syncStudio,
  type PlayoutResult,
  type PlayoutSettings,
} from '../../control/playoutLink';
import type { Slot } from '../../control/playoutProtocol';
import {
  clockRank,
  folderRun,
  playNextTarget,
  runServerVerb,
  runTogether,
  sequenceAction,
  sequenceMembers,
  serverCueLive,
  takeBlocker,
  serverLayers,
  throughPlaces,
  type ThroughRole,
  togetherNote,
  togetherPlan,
  type GraphicMember,
  type MemberResult,
  type MemberTake,
  type SequenceMember,
  type ServerVerb,
  type ServerVerbOutcome,
} from '../../control/serverPlayout';
import { createServerPlayoutStore, type ServerPlayoutStore } from '../../control/serverPlayoutStore';
import { airClash, applyAccepted, applyReading, clipClock, followedClip, pauseTarget } from '../../control/serverState';
import { effectiveEnd, mediaKindOf, segmentSeconds } from '../../control/cuePlayback';
import { cueOnAir, folderAir } from '../../control/folderAir';
import { folderStep, stepFace, type FolderStep, type StepMember } from '../../control/folderStep';
import { pollServerState, type ServerStatePoll } from '../../control/serverStatePoll';
import ClipClock from './ClipClock';
import type { Resolution } from '../../model/types';
import {
  diffResolved,
  replacementPatch,
  resolveBindings,
  withTreeWrites,
  type JsonObject,
  type ResolvedValues,
  type TreeWrite,
} from '../../model/productionData';
import { loadLiveData, saveLiveData, PRODUCTION_DATA_KEY } from '../../model/productionState';
import {
  fetchProductionData,
  patchProductionData,
  patchProductionDataBySlug,
  productionDataKey,
} from '../../control/productionDataApi';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../../model/projectFormat';
import { outputEmbedFileName, outputEmbedHtml } from '../../export/outputEmbed';
import {
  revealCue,
  spaceAction,
  stepSelection,
  takeFace,
  usePlayoutVerbKeys,
  useSpaceMode,
  type PlayoutVerb,
  type SpaceMode,
  type VerbPress,
} from '../playoutKeys';
import { SpaceModeToggle } from '../SpaceModeToggle';
import { PREVIEW_EMPTY_LABEL, type SpaceAction } from '../../control/spaceMode';
import { cueDataRows, hasSideFields, nextRow, rowsForSide } from '../../control/cueData';
import { groupCueFields, groupHeading } from '../../control/cueFieldGroups';
import { readPublishedProfile, readShowProfile, withGraphicArrange, type ArrangeEntry } from '../../model/profile';
import ActionArranger from './ActionArranger';
import ProductionDataWorkspace from './ProductionDataWorkspace';
import ProductionAudienceWorkspace from './ProductionAudienceWorkspace';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import {
  adjustWords,
  controlName,
  labelCarriesDelta,
  adjustedValue,
  arrangeControls,
  arrangeFor,
  eventButtons,
  advanceLabel,
  canAdvance,
  hasSteps,
  eventLegality,
  fieldDescriptors,
  formatMachineState,
  illegalEventTitle,
  isEventLegal,
  machineStateGroups,
  machineStateNames,
  movedStateNames,
  movedKeys,
  pressSend,
  type ArrangedControl,
  type ControlButton,
} from '../../control/controlModel';
import {
  clearAllCueBatches,
  clearCueItems,
  controlOutputSeenAt,
  controlPageUrl,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  joinPageUrl,
  presenterPageUrl,
  claimJoinName,
  controlPingSeq,
  outputPageUrl,
  publishControlShow,
  sendControlVerbs,
  staleSentence,
  takeCueItems,
  unpublishControlShow,
  untilAnswered,
  verbAired,
  verbStale,
  verbsLanded,
  leftAlone,
  withLiveCue,
  type ControlEventRow,
  type ControlFollowStatus,
  type ControlSendItem,
  type LiveCueMap,
  type ResolvedControlShow,
  type VerbSent,
} from '../../control/hostedControl';
import { createAppliedOnce } from '../../control/commandRoads';
import { createSendDebts } from '../../control/failedSends';
import { appendLogEntries, describeLogRow, eventLogLabel, noteEntry, type LogEntry } from '../../control/eventLog';
import {
  clockRowEffect,
  clockSpecFromHtml,
  clockValueAfterUpdate,
  fastEventGraphics,
  plainClockValue,
  speakingClockRowEffect,
  speakingClocksFromHtml,
  type ClockSpec,
  type SpeakingClockPair,
} from '../../control/matchClockWire';
import { type ProgramStageHandle } from './ProgramStage';
import PlayoutMonitors from './PlayoutMonitors';
import { composeDocument } from '../../preview/composeDocument';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import { useAuthUi } from '../auth/authUi';
import ActionLog from './ActionLog';
import CueOverflowNote, { cueOverflowKeys } from './CueOverflowNote';
import ProductionExportDialog from './ProductionExportDialog';
import { ProductionLinkRows, PublishActions, StartProductionButton } from './ProductionLinks';
import { PlayoutPanelSection, PlayoutStatusControl } from './PlayoutStatusControl';
import CueRundown, { nameList } from './CueRundown';
import RailResizer, { useRailWidth } from './RailResizer';
import ServerCueEditor from './ServerCueEditor';
import FolderEditor from './FolderEditor';
import { FieldRow } from '../fields/FieldControl';
import { isImageAsset } from '../../assets/assetUtils';
import { importImageFile } from '../../assets/imageImport';
import {
  addPictureToTemplate,
  createPictureTemplate,
  MAX_PICTURES,
  PICTURE_FIELD,
  PICTURE_GRAPHIC_NAME,
  pictureLabel,
} from '../../templates/picture';
import BrandLogo from '../BrandLogo';
import NewGraphicButton from '../NewGraphicButton';
import { copyLink } from './copyLink';
import { IconDownload, IconTv, IconUsers } from '../icons';
import PlayoutSettingsDialog from '../PlayoutSettingsDialog';
import { PanelButton, PanelDialog, usePanelAnswer } from '../control/PanelControl';
import { PANEL_VERBS, panelClip, rundownPanelRows, type PanelVerb } from '../../control/panelFeedback';
import { useTeamsUi } from '../teams/teamsUi';
import { useTeamsAvailable } from '../teams/useTeamsAvailable';
import { useTeamState } from '../teams/useTeamState';
import { editedWhen } from '../teams/teamLabels';
import { teamShowsStatus } from '../../model/teamShows';
import { dismissTeamNote, teamMemberName } from '../../backend/teamProductions';
import { ReadyOutputList, announcedExpected, useExpectedOutputs, useLivePresence, useReadinessView } from '../control/OutputHealth';
import { usePublishDrift } from './usePublishDrift';
import { versionLabel, type PayloadVersion } from '../../control/payloadVersion';
import type { HeldVersion, ReadyStamp } from '../../control/readiness';
import { requestId, slotHolds, PREPARE_WAIT_MS, type PrepRequest } from '../../control/prepareLive';
import { describePlayoutStatus, type SlotReading } from '../../control/playoutStatus';
import { gatherBridgeFacts } from '../../control/prepareBridge';
import { loadReadyMemory, saveReadyMemory } from '../../model/readyMemory';
import { PrepareForLive, usePrepareForLive } from '../control/PrepareForLive';

/** The selected cue's UNSAVED edits: local echo for instant typing, flushed to the record on a
 *  300 ms idle (a keystroke must not parse + rewrite the whole shows store — the store embeds
 *  full template snapshots, so that is a visible input-lag class of cost). */
interface CueDraft {
  cueId: string;
  label: string;
  note: string;
  values: Record<string, string>;
}

/** How far behind the log head the action log seeds its history. Global ids mean this is a
 *  ceiling on rows READ, not on rows shown — a busy instance yields fewer of this show's. */
const LOG_HISTORY_SPAN = 400;

/** Elapsed-time formatting for the header clock: how long this session has been in SHOW. */
function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * What the account gate says, in the dialog's first line. Plain words about what the press does
 * and why it needs an account: publishing creates hosted rows (the output, control and audience
 * links) that must belong to someone who can take them down again. Everything else on this page
 * works without one, and the dialog's own second line says so.
 */
const PUBLISH_NEEDS_ACCOUNT =
  'Starting a production puts it online, and that needs a free account. Sign in and it starts straight away.';
const UNPUBLISH_NEEDS_ACCOUNT =
  'Taking this production offline needs the account that published it. Sign in first, then unpublish.';
const CLAIM_NEEDS_ACCOUNT =
  'Changing the audience link needs the account that published this production. Sign in first.';

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
  const library = useMemo(() => loadGraphics(), []);
  const show: Show | null = shows.find((s) => s.id === id) ?? null;

  const backendConfigured = isBackendConfigured();
  const { needsSignIn, status: authStatus, user } = useAuthState();
  const teamState = useTeamState();
  const teamsOn = useTeamsAvailable();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const signInOpen = useAuthUi((s) => s.signInOpen);
  /**
   * Start production was pressed while signed out, and the sign-in dialog is up because of it.
   * Signing in from that dialog finishes what the press asked for, so the reader does not have to
   * find the button a second time; closing the dialog without signing in forgets the press, so a
   * sign-in much later (from the topbar, say) never puts a production online by surprise. If the
   * two auth updates ever arrive in separate renders, the press is forgotten and the button is
   * simply pressed again - the safe direction to fail in.
   */
  const publishAfterSignIn = useRef(false);
  const publishRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!publishAfterSignIn.current) return;
    if (authStatus === 'signed-in') {
      publishAfterSignIn.current = false;
      void publishRef.current();
    } else if (!signInOpen) {
      publishAfterSignIn.current = false;
    }
  }, [authStatus, signInOpen]);

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
  /** The Playout panel under the playout status (home/PlayoutStatusControl.tsx): opened by a press,
   *  and by itself right after a publish, where the next step is. */
  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | 'join' | 'presenter' | null>(null);
  /** The readable audience name being typed, and what the database said about the last claim. */
  const [nameDraft, setNameDraft] = useState('');
  const [nameNote, setNameNote] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  /**
   * THE FOLDER ROW the cursor is on, when it is on one (docs/CLIP_PLAYBACK_PLAN.md §6.6, phase 4):
   * beside `selectedCueId`, never in it. While it is set and its folder is there, SPACE, TAKE and Out
   * act on the folder and `selectedCue` reads null, so every cue verb stands down by its null path;
   * `selectedCueId` keeps the folder's first cue, so the cursor stays where the folder stood if it goes.
   */
  const [selectedFolderRow, setSelectedFolderRow] = useState<{ folderId: string; rowId: string } | null>(null);
  /** THE SHIFT-CLICK RANGE (owner, 2026-09-28), by cue id as it was when clicked: what New folder
   *  takes. No on-air verb reads it, so a stray shift-click changes nothing that airs. */
  const [rangeIds, setRangeIds] = useState<readonly string[]>([]);
  /** The far end of the range Shift with Up or Down walks, by row id; the cursor is the other end. */
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  /** THE RUNDOWN'S CLIPBOARD (docs/CLIP_PLAYBACK_PLAN.md §20.2): what Ctrl+C or Ctrl+X last took, in
   *  this page's memory only (model/cueClipboard.ts). */
  const [clip, setClip] = useState<CueClip | null>(null);
  /** What the rundown's authoring last said: a refused drop, or a folder write that did not land. */
  const [rundownNote, setRundownNote] = useState<string | null>(null);
  /** Why each cue of the last folder Take did not go on air, by cue id - until that cue is taken, the
   *  folder is taken again, or it is taken off. Page memory. */
  const [takeMisses, setTakeMisses] = useState<Readonly<Record<string, string>>>({});
  /** WHERE EACH ONE-BY-ONE FOLDER'S STEP STANDS (docs/CLIP_PLAYBACK_PLAN.md §20.1): its cue taken last
   *  in this page, by any route, or null once it went back to the top. A folder with no entry reads its
   *  step off the air (control/folderStep.ts). Page memory: never saved, never shared. */
  const [folderSteps, setFolderSteps] = useState<Readonly<Record<string, string | null>>>({});
  /** Folder Takes still being sent: what dispatch reads (a ref, never a stale render), and whether
   *  Out or All out has stopped each since. */
  const folderRuns = useRef(new Map<string, { stop: null | 'out' | 'all-out' }>());
  /** The same, for the verb bar to draw: a folder still being sent counts as up, so Out and SPACE can
   *  stop it even before anything of it has landed. */
  const [sendingFolders, setSendingFolders] = useState<ReadonlySet<string>>(() => new Set());
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

  // ── Live status: the renderer heartbeat + which cue is on air ON EACH LAYER. Several
  // graphics are up at once by design, so this is a map keyed by graphic name. ──
  const [liveCue, setLiveCueState] = useState<LiveCueMap>({});
  /** What this page believes is up on the PLAYOUT SERVER (control/serverPlayout.ts says what
   *  it is and why the slot is remembered), in the store's OWNERSHIP part, with what the server
   *  itself reports (control/serverState.ts). One store per page, so it lives exactly as long as
   *  the state it replaced. The page never reads the TIMING part: a clock ticking twice a second
   *  must not re-render the whole surface (control/serverPlayoutStore.ts) - the clip clock and the
   *  rows' remaining times subscribe to it themselves. */
  const [serverPlayout] = useState(createServerPlayoutStore);
  const serverOwnership = useSyncExternalStore(serverPlayout.ownership.subscribe, serverPlayout.ownership.get);
  const serverOnAir = serverOwnership.onAir;
  /** How many times this page has rendered - published on its root as `data-renders`, which is how
   *  e2e/playout-clock.spec.ts proves the server's readings do not re-render it. */
  const renders = useRef(0);
  renders.current += 1;
  /** The Bridge's last word on the playout server, polled while this production has server
   *  cues: what the editor shows beside a server cue, and what disables its Take. */
  const [bridgeStatus, setBridgeStatus] = useState<PlayoutResult | null>(null);
  /** What the NoaCG output's slot on the server holds (the effect beside the status poll below),
   *  undefined until read (control/playoutStatus.ts `SlotReading`). */
  const [outputSlot, setOutputSlot] = useState<SlotReading | undefined>(undefined);
  /** Bumped by the Playout panel's Check again: the server and the slot are asked again at once. */
  const [checkAgainRev, setCheckAgainRev] = useState(0);
  /** Bumped by Put on air and Take off: only the slot changed, so only the slot is read again. */
  const [slotRev, setSlotRev] = useState(0);
  /**
   * HOW MANY TIMES THE LIVE MAP HAS MOVED HERE, and the only reason it is counted.
   *
   * The boot resolve below reads the production over the wire and then SEEDS this map with
   * the answer. That read is a round trip - about a millisecond against a local stack and
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
  const liveCueMoves = useRef(0);
  const setLiveCue = useCallback<typeof setLiveCueState>((next) => {
    liveCueMoves.current += 1;
    setLiveCueState(next);
  }, []);
  /** What the WIRE said was live when this page resolved the production - null until it has
   *  answered, and never written by anything this operator does. The boot recovery below is
   *  keyed on it for exactly that reason. */
  const [bootLive, setBootLive] = useState<LiveCueMap | null>(null);
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
  /** The FAST road's own join status (null until it reports), for this page's Presence entry. */
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  /** The follow's resolve has FAILED and is being asked again (a database or PostgREST outage).
   *  Before this the follow gave up on one failure and the page stayed silent until a reload. */
  const [resolveWaiting, setResolveWaiting] = useState(false);
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
  const [openedAt] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;
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
  const publishedVer = useMemo<HeldVersion | null>(() => (publishedStamp ? { n: publishedStamp.n, h: publishedStamp.h } : null), [publishedStamp]);
  /** Changed since the last publish: the record itself, or what the outputs would render (a graphic
   *  edited in the library, which never touches the record) - usePublishDrift. */
  const { unpublished: unpublishedChanges, check: checkUnpublished } = usePublishDrift(show, publishedStamp?.g ?? null);
  const { expected: expectedOutputs, forget: forgetOutput } = useExpectedOutputs(
    hostedSlug && isBackendConfigured() ? (show?.id ?? null) : null,
    livePresence,
    true,
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
    bridge: () => gatherBridgeFacts(loadPlayoutSettings(), show ?? {}),
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
  /** The production's row id — the command channel's key on the fast road. Read out here rather
   *  than inside the verbs so a send depends on the ID and not on the whole show record. */
  const showId = show?.id ?? null;

  const programRef = useRef<ProgramStageHandle>(null);
  /**
   * What each graphic was last SENT locally — the input to rebuilding the PROGRAM monitor after
   * it is unmounted (the Data-workspace round trip). The wire report is a snapshot taken when
   * this page resolved the published show and never moves again, and an unpublished production
   * has no report at all, so after the first take this is the only current answer to "what is
   * on air". Declared up here because the log follower below writes to it.
   *
   * It is STATE as well as a ref, because the same fact answers a second question: whether the
   * values in front of the operator have actually been SENT. An on-air cue whose draft has
   * moved past what air is showing has to say so rather than wait to be noticed.
   */
  const [airedData, setAiredData] = useState<Record<string, Record<string, string>>>({});
  const airedRef = useRef(airedData);
  airedRef.current = airedData;
  const rememberAired = useCallback((items: ControlSendItem[]) => {
    setAiredData((prev) => {
      let next = prev;
      for (const item of items) {
        // MERGED, not replaced: an update may be PARTIAL (a ± live-number bump carries one
        // field on purpose), and replacing the baseline with it marked every other field as
        // unsent — an amber "3 changes not on air yet" about values that were on air.
        if (item.msg.t === 'update') next = { ...next, [item.graphic]: { ...next[item.graphic], ...item.msg.data } };
        // An accepted event's payload lands through the same field path (the hosted log merges
        // it the same way), so a goal's +1 is part of what air shows - and what the next press
        // counts from. (If the guard dropped the event this runs slightly ahead of the graphic;
        // the greyed buttons make that the rare case, and the log stays self-consistent.)
        else if (item.msg.t === 'event' && item.msg.payload) next = { ...next, [item.graphic]: { ...next[item.graphic], ...item.msg.payload } };
        else if (item.msg.t === 'stop' && next[item.graphic]) {
          // Taken off air: forget it, or the next rebuild would restore a graphic nobody is
          // running any more.
          next = { ...next };
          delete next[item.graphic];
        }
      }
      return next;
    });
  }, []);
  const [wireLog, setWireLog] = useState<LogEntry[]>([]);
  const localLogId = useRef(0);
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
   * The clock field's value ON THE WIRE per graphic — the monitor's own copy of what the
   * renderer keeps in `mergedData`. Deliberately NOT folded into `airedData`: that one also
   * answers "are the operator's values on air yet", and a stamped clock value differs from the
   * cue's plain one forever, which would light an amber "1 change not on air yet" for the whole
   * match. `restoreProgram` folds it back in at the one moment it is needed.
   */
  const clockValues = useRef<Record<string, string>>({});
  /** The same, per FIELD, for a debate board's two clocks — the monitor's copy of what the
   *  renderer keeps in `mergedData` for the pair. Kept out of `airedData` for the same reason. */
  const speakingValues = useRef<Record<string, Record<string, string>>>({});
  /**
   * A debate board's two clocks, put through the same decision the hosted renderer makes. The
   * pair is handled apart from the single match clock rather than folded in with it because the
   * two share nothing but the stamp: one clock verb settles one field, a `switch` settles both.
   */
  const applySpeakingClocks = useCallback(
    (out: ControlSendItem[], item: ControlSendItem, pair: SpeakingClockPair) => {
      const msg = item.msg;
      const held = speakingValues.current[item.graphic] ?? {};
      // A plain resend of the cue's own allowance must not erase a stamp, exactly as for the
      // match clock: the cue stores "05:00" forever and every Take mid-debate re-sends it.
      const carried = msg.t === 'update' ? msg.data : msg.t === 'event' ? msg.payload : undefined;
      for (const field of [pair.fieldA, pair.fieldB]) {
        const value = carried?.[field];
        if (value !== undefined) held[field] = clockValueAfterUpdate(held[field], value);
      }
      // The allowance and the penalty size ride the wire plain and are read back as themselves.
      for (const field of [pair.allowanceField, pair.penaltyField]) {
        const value = field ? carried?.[field] : undefined;
        if (field && value !== undefined) held[field] = value;
      }
      speakingValues.current[item.graphic] = held;
      // The monitor is sent what we now hold, not what the row carried — the same rule
      // `src/output/main.ts` states: once a clock has run away from the time the cue stores, a
      // resend of that stored time is no longer recognisable as a resend to the template.
      let staged = item;
      if (msg.t === 'update' && msg.data) {
        const forwarded = { ...msg.data };
        for (const field of [pair.fieldA, pair.fieldB]) {
          if (forwarded[field] !== undefined) forwarded[field] = held[field];
        }
        staged = { graphic: item.graphic, msg: { ...msg, data: forwarded } };
      }
      const effect = speakingClockRowEffect({ msg }, pair, held, Date.now());
      if (!effect) {
        out.push(staged);
        return;
      }
      speakingValues.current[item.graphic] = { ...held, ...effect.values };
      const clockItem: ControlSendItem = { graphic: item.graphic, msg: { t: 'update', data: effect.values } };
      if (effect.when === 'before') out.push(clockItem);
      out.push(staged);
      if (effect.when === 'after') out.push(clockItem);
    },
    [],
  );
  /**
   * The ONE way a command reaches the PROGRAM monitor, so the clock cannot be handled on one
   * route and missed on the other (the wire follower and the offline verbs both come here).
   * A clock verb gets its value written around it in the order `clockRowEffect` fixes: the
   * origin BEFORE a start, so the runtime adopts it instead of minting one; the banked time
   * AFTER a hold or a reset, because what is banked is what the graphic has just settled on.
   */
  const applyProgram = useCallback((items: ControlSendItem[]) => {
    const out: ControlSendItem[] = [];
    for (const item of items) {
      const pair = speakingClocksRef.current.get(item.graphic);
      if (pair) {
        applySpeakingClocks(out, item, pair);
        continue;
      }
      const clock = clockSpecsRef.current.get(item.graphic);
      if (!clock) {
        out.push(item);
        continue;
      }
      const msg = item.msg;
      // Track the clock field exactly as the renderer's own merged data does: an update writes
      // it, and an accepted event's payload rides the same field path.
      const carried =
        msg.t === 'update' ? msg.data?.[clock.field] : msg.t === 'event' ? msg.payload?.[clock.field] : undefined;
      // A plain resend of the cue's own time must not erase the origin (clockValueAfterUpdate):
      // the cue stores "10:00" forever, so every Take mid-match re-sends it.
      if (carried !== undefined) {
        clockValues.current[item.graphic] = clockValueAfterUpdate(clockValues.current[item.graphic], carried);
      }
      if (msg.t === 'stop') delete clockValues.current[item.graphic];
      const effect = clockRowEffect({ msg }, clock, clockValues.current[item.graphic], Date.now());
      if (!effect) {
        out.push(item);
        continue;
      }
      clockValues.current[item.graphic] = effect.value;
      const clockItem: ControlSendItem = {
        graphic: item.graphic,
        msg: { t: 'update', data: { [clock.field]: effect.value } },
      };
      if (effect.when === 'before') out.push(clockItem);
      out.push(item);
      if (effect.when === 'after') out.push(clockItem);
    }
    programRef.current?.apply(out);
  }, [applySpeakingClocks]);

  /**
   * WHAT THE OPERATOR SEES, from whichever road the command arrived on.
   *
   * A published verb travels twice (src/control/commandRoads.ts): the database's broadcast on the
   * production's private topic, about 100 ms after the press, and the durable row behind it at
   * 130-650 with a slow mode past 600. This page also presses the verbs itself, so
   * there is a third arrival that is faster than either - its own send. All three end up here and
   * `applied` decides which one counts, on the id the press minted.
   *
   * Getting that wrong is invisible. A second `play` re-runs an entrance and settles on the
   * picture that was already there, which is why `PayloadStage` counts them and why
   * e2e/configured/playout-both-roads.spec.ts reads the count rather than the screen.
   *
   * The DURABLE half of a row - the action log line, the renderer's own reports, the signal that
   * the data API wrote - stays in the follower's `onRow` below, because that half must happen
   * once per ROW and is not what an operator is waiting for.
   */
  const applied = useRef(createAppliedOnce());
  const applyCommand = useCallback(
    (items: { graphic: string; msg: ControlEventRow['msg'] }[]) => {
      for (const item of items) {
        if (!applied.current.claim(item.msg)) continue;
        const msg = item.msg;
        // The ON AIR marker rides the same road as the picture, deliberately: split across the
        // two, the graphic would be up for a third of a second while the rundown still said the
        // layer was clear.
        if (msg.t === 'cue') setLiveCue((m) => withLiveCue(m, item.graphic, msg.cue));
        // 'staged' is another operator typing, 'live' is the renderer REPORTING and 'ping' is
        // Prepare for Live's check of the command path - none is a command for the stage.
        else if (msg.t !== 'staged' && msg.t !== 'live' && msg.t !== 'ping') {
          rememberAired([{ graphic: item.graphic, msg }]);
          applyProgram([{ graphic: item.graphic, msg }]);
        }
      }
    },
    // `setLiveCue` is stable (a useCallback with no deps), but it is no longer React's own
    // setter identity, so it is declared rather than assumed.
    [applyProgram, rememberAired, setLiveCue],
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
    () => folderAir({ folders, cues, items: playoutItems, ownership: serverOwnership, liveCue, graphicName: cueGraphicName }),
    [folders, cues, playoutItems, serverOwnership, liveCue, cueGraphicName],
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
  // The server's state is re-asked every few seconds while a playout server is SET UP - one
  // loopback request, so the header's Playout control shows whether CasparCG answers, and the
  // editor can say "connected" or name the hop before a server cue's Take. Nothing is asked of a
  // browser that was never paired with a Bridge: that page says "not set up" without a request,
  // so nobody who only uses OBS or vMix ever meets a local-network prompt from this poll.
  useEffect(() => {
    const settings = loadPlayoutSettings();
    if (!playoutConfigured(settings)) {
      setBridgeStatus(null);
      return;
    }
    setBridgeStatus(null);
    return subscribeTargetStatus(settings, setBridgeStatus);
  }, [playoutSettingsRev, checkAgainRev]);
  // THE STUDIO SETUP NOACG BRIDGE KEEPS for this server (docs/work-specs/studio-day-playout D17):
  // read once as the page opens, so a channel, output slot or New media channel another browser set
  // is the one this page plays to. A change it brings re-reads the settings like the dialog's close.
  useEffect(() => {
    if (!playoutConfigured(loadPlayoutSettings())) return;
    let alive = true;
    void syncStudio().then((done) => {
      if (alive && done.changed) setPlayoutSettingsRev((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);
  // WHAT THE NOACG OUTPUT'S SLOT HOLDS on the server (docs/work-specs/studio-day-playout AC-7): this
  // production's output, another production's, or nothing - the fact that says whether a Take will
  // air on CasparCG at all, and that the studio day had to discover by looking at the programme.
  // Read through the Bridge every 10 s while the production is started and the server answers, and
  // at once after Put on air or Take off (`slotRev`); read-only (`/state`, an AMCP INFO). Check
  // again and a settings change restart the Bridge poll, whose answer restarts this. A Bridge too
  // old to say reads as `unreadable`, never as a fault.
  const bridgeAnswers = bridgeStatus?.state === 'ok';
  const slotReadable = stateReadable(bridgeStatus);
  const outputSlug = show?.outputSlug ?? null;
  useEffect(() => {
    const settings = loadPlayoutSettings();
    if (!hostedSlug || !bridgeAnswers || !playoutConfigured(settings)) {
      setOutputSlot(undefined);
      return;
    }
    if (!slotReadable) {
      setOutputSlot({ holds: 'unreadable' });
      return;
    }
    let alive = true;
    let reading = false;
    // The same reading again keeps the same object, so an unchanged slot renders nothing.
    const settle = (next: SlotReading | undefined) =>
      setOutputSlot((prev) => (prev && next && prev.holds === next.holds && prev.detail === next.detail ? prev : next));
    const read = () => {
      if (reading) return; // a slow Bridge: never stack reads
      reading = true;
      readState(settings, settings.channel)
        .then(
          (r) => {
            if (!alive) return;
            // A refused read is a fault the status names, never "Checking…" for ever.
            settle(
              r.reply
                ? { holds: slotHolds(r.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null, outputSlug) }
                : { holds: 'failed', detail: r.result.detail },
            );
          },
          () => alive && settle(undefined),
        )
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hostedSlug, bridgeAnswers, slotReadable, outputSlug, slotRev]);

  // ── WHAT AN OLDER CLIP IS (docs/CLIP_PLAYBACK_PLAN.md §7, §18 case 5). A clip saved before its kind
  // was kept - or its length, by a record made elsewhere - learns both from the server's own list,
  // once per production and Bridge, as soon as the Bridge answers: an audio file then plays as one,
  // a still keeps its Hold, and Play next can check a follower's length. Only a missing fact is
  // filled, and a file the list does not have stays unknown, which Play next says.
  const learntFacts = useRef<string | null>(null);
  const bridgeOk = bridgeStatus?.state === 'ok';
  // A SETUP CHANGE MADE WHILE NOACG BRIDGE WAS AWAY goes to it as soon as the status says it answers
  // again (D17), rather than waiting for the next page or Playout settings to open.
  useEffect(() => {
    if (bridgeOk && loadPlayoutSettings().studioPending) void syncStudio();
  }, [bridgeOk]);
  useEffect(() => {
    if (!bridgeOk || !show) return;
    // A still has no length to learn.
    const missing = playoutItems.filter((i) => i.kind === 'media' && (!i.mediaKind || (i.mediaKind !== 'still' && !(i.frames && i.fps))));
    const key = `${show.id} ${playoutSettingsRev}`;
    if (!missing.length || learntFacts.current === key) return;
    learntFacts.current = key;
    void (async () => {
      const { items } = await listLibrary(loadPlayoutSettings(), 'media');
      if (!items) return;
      const byName = new Map(items.map((x) => [x.name.toLowerCase(), x] as const));
      const facts = new Map<string, { mediaKind?: PlayoutMediaKind; frames?: number; fps?: number }>();
      for (const m of missing) {
        const found = byName.get(m.name.toLowerCase());
        if (found) facts.set(m.id, { ...mediaKindOf(found.kind), frames: found.frames, fps: found.fps });
      }
      if (facts.size) setShows(fillPlayoutItemFacts(show.id, facts));
    })();
  }, [bridgeOk, show, playoutItems, playoutSettingsRev]);

  // ── THE SERVER'S TRUTH (docs/CLIP_PLAYBACK_PLAN.md §6.7). While this production has server cues
  // and both the Bridge and the server can say what is playing, ask what each channel the rundown
  // uses holds - twice a second while something is up there, every few seconds otherwise, and at
  // once when the tab comes back into view - and fold each reading into the store. The page
  // re-renders only when OWNERSHIP moves (a clip ended or was replaced on the server); the clock
  // and the rows follow TIMING on their own. The poll only reads: nothing here can air a clip.
  const statePoll = useRef<ServerStatePoll | null>(null);
  const serverReadable = stateReadable(bridgeStatus);
  const hasServerItems = playoutItems.length > 0;
  const rundownRef = useRef({ cues, playoutItems, folders });
  rundownRef.current = { cues, playoutItems, folders };
  useEffect(() => {
    if (!serverReadable || !hasServerItems) return;
    /** Each Play-through folder's slot: it plays there, not on its clips' own slots, so a reload in
     *  the middle of one has to read it even when no item of the rundown uses that channel. */
    const folderSlots = (settings: PlayoutSettings) =>
      rundownRef.current.folders.filter((f) => folderMode(f) === 'through').map((f) => folderSlot(settings, f));
    const poll = pollServerState({
      read: (channel) => readState(loadPlayoutSettings(), channel),
      channels: () => {
        const settings = loadPlayoutSettings();
        const channels = new Set(rundownRef.current.playoutItems.map((i) => itemSlot(settings, i).channel));
        for (const s of folderSlots(settings)) channels.add(s.channel);
        for (const l of Object.values(serverPlayout.ownership.get().onAir)) if (l.slot.adapter === 'casparcg') channels.add(l.slot.channel);
        return [...channels].sort((a, b) => a - b);
      },
      busy: () => {
        const own = serverPlayout.ownership.get();
        return Object.keys(own.onAir).length > 0 || own.unidentified.length > 0;
      },
      onReading: (channel, reply, receivedAt) => {
        const settings = loadPlayoutSettings();
        const { cues: rundownCues, playoutItems: items } = rundownRef.current;
        serverPlayout.apply((parts) =>
          applyReading(parts, reply, { channel, now: receivedAt, cues: rundownCues, items, slotOf: (i) => itemSlot(settings, i), alsoSlots: folderSlots(settings) }),
        );
      },
    });
    statePoll.current = poll;
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll.wake();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      poll.stop();
      statePoll.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [serverReadable, hasServerItems, playoutSettingsRev, serverPlayout]);

  // ── The cue draft: edits echo locally, persist on idle / switch / take / unmount. ──
  const [draft, setDraft] = useState<CueDraft | null>(null);
  const draftRef = useRef<CueDraft | null>(null);
  draftRef.current = draft;
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraft = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const d = draftRef.current;
    if (!d) return;
    setShows(updateShowCue(id, d.cueId, { label: d.label, note: d.note || null, values: d.values }));
  }, [id]);
  useEffect(() => () => flushDraft(), [flushDraft]);

  // ── PRODUCTION DATA: the tree, and what it resolves to (docs/PRODUCTION_DATA_PLAN.md) ────
  // Held on THIS page rather than in the Data workspace, because the one sender lives here and
  // the Data tab unmounts the playout surface. Runtime state: it is read from and written to
  // productionState.ts, never to the show record, which syncs and would churn per tick. The
  // DISPATCH half sits further down, beside `runVerb`.
  const [liveData, setLiveDataState] = useState<JsonObject>({});
  /** The tree as it is RIGHT NOW, for callbacks that must not close over a stale render. */
  const liveDataRef = useRef<JsonObject>(liveData);
  liveDataRef.current = liveData;
  /** The server re-read, reachable from the log follower — which is declared above the callback
   *  it needs, because the follower must be in place before the wire's first row arrives. */
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  /** What was last put on the wire, per graphic per field — the diff baseline (see the effect). */
  const lastResolved = useRef<ResolvedValues>({});
  useEffect(() => {
    // The local tree seeds an UNPUBLISHED production only. Published, the server's copy is the
    // authority and arrives a moment later - seeding from localStorage first would show the
    // operator a stale tree and then swap it under them.
    setLiveDataState(id && !hostedSlug ? loadLiveData(id) : {});
    // A different production is a different tree AND a different baseline, so the next dispatch
    // reconciles the new production from scratch rather than against the old one's values.
    lastResolved.current = {};
  }, [id, hostedSlug]);

  /**
   * THE LIVE TREE, WRITTEN IN ANOTHER TAB.
   *
   * The Data workspace opens in its own browser tab, and an UNPUBLISHED production's tree lives
   * in localStorage (model/productionState.ts - deliberately not on the synced Show record).
   * This page is the ONE sender: it holds the tree, resolves the bindings and dispatches the
   * changes, precisely because the workspace has no route to air of its own. Split across tabs,
   * a value typed on Data reached storage and stopped there - the operator watched PROGRAM keep
   * the old score.
   *
   * `storage` fires in the OTHER tabs only, which is exactly the ones that need telling, and it
   * carries the key so an unrelated write costs nothing. Published productions are untouched:
   * there the server's copy is the authority and the API answer is what this page holds.
   */
  useEffect(() => {
    if (!id || hostedSlug) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PRODUCTION_DATA_KEY) return;
      setLiveDataState(loadLiveData(id));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [id, hostedSlug]);

  /**
   * PUBLISHED = the SERVER owns the tree. `control_shows.data` is what a feed writes and what
   * the patch RPC merges against, so keeping a second copy in localStorage would be two truths
   * with no tiebreak. The key is the owner's own, read over RLS (control/productionDataApi.ts
   * says why that is not the "never a web page" case the integrator doc warns about).
   *
   * `undefined` means NOT YET KNOWN, and that is load-bearing: until the key has resolved, this
   * page must not dispatch the local tree to air. A published production opened cold would
   * otherwise spend one render believing it was offline and push the last LOCAL tree - stale
   * values, briefly, on air.
   */
  const [dataKey, setDataKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!hostedSlug || !backendConfigured) {
      setDataKey(null);
      return;
    }
    void productionDataKey(id).then((key) => {
      if (alive) setDataKey(key);
    });
    return () => {
      alive = false;
    };
  }, [id, hostedSlug, backendConfigured]);

  /**
   * WHETHER THIS PAGE HOLDS THE PRODUCTION'S SHARED VALUES YET.
   *
   * Unpublished it is immediate: the tree comes out of localStorage in the effect above. Published
   * it takes a key read and then a fetch, and until both have landed `liveData` is an empty object
   * while `bindings` - which live on the show record - are already here.
   *
   * That gap is harmless for READING (a bound box shows nothing for a moment) and not harmless at
   * all for a PRESS, because a press computes an ABSOLUTE value from what the tree says (plan
   * §2.5). A `+1` fired in that window reads the score as missing, counts from zero, and writes 1
   * to every graphic bound to the path - so opening the playout tab mid-show and pressing + would
   * have put the whole production's score back to 1.
   */
  const [treeRead, setTreeRead] = useState(false);
  useEffect(() => {
    setTreeRead(false);
  }, [id, hostedSlug]);

  /** Pull the server's tree in - at mount, and whenever a FEED row says it moved. */
  const refreshServerData = useCallback(async () => {
    if (!dataKey) return;
    const current = await fetchProductionData(dataKey);
    if (current) {
      setLiveDataState(current.data as JsonObject);
      setTreeRead(true);
    }
  }, [dataKey]);
  refreshRef.current = refreshServerData;
  useEffect(() => {
    void refreshServerData();
  }, [refreshServerData]);

  /**
   * ONE CALL, ONE WRITE. This charges a persist - and, published, an HTTP PATCH against the
   * production's ingest budget - every time it is called, and it deliberately does not coalesce:
   * every caller it has is one deliberate gesture (a stepper, Apply JSON, Reset, Clear, Move
   * numbers, a finished edit). A CALLER THAT FIRES AT KEYSTROKE RATE IS THE BUG, not this
   * function's missing debounce. Deferring belongs at the box, because only the box knows which
   * text a person currently owns - the three paths that replace `liveData` (the cross-tab
   * `storage` listener, a PATCH answer, the failure handler's refresh) would otherwise land in
   * whatever is being typed. `components/home/useDeferredEdits.ts` is that mechanism.
   */
  const setLiveData = useCallback(
    (next: JsonObject) => {
      // Optimistic either way, so typing stays immediate.
      setLiveDataState(next);
      if (!dataKey) {
        saveLiveData(id, next);
        return;
      }
      // Published: say the change as a PATCH - including the removals, which a merge patch can
      // only express by naming them (model/productionData.ts replacementPatch). The ANSWER is
      // what we then hold: a feed tick that landed in the same moment is already merged into
      // it, so the operator's edit cannot silently overwrite the feed's.
      const patch = replacementPatch(liveDataRef.current, next);
      if (Object.keys(patch).length === 0) return;
      void patchProductionData(dataKey, patch)
        .then((server) => setLiveDataState(server as JsonObject))
        .catch((error: Error) => {
          setNote(`Production data not saved: ${error.message}`);
          void refreshServerData();
        });
    },
    [id, dataKey, refreshServerData],
  );

  /**
   * A PRESS MOVING THE SHARED VALUE — the ± stepper and an event's `adjust` on a BOUND field
   * (docs/PRODUCTION_DATA_PLAN.md §2.9's Phase 3, AC-7).
   *
   * It is a second door beside `setLiveData` rather than a flag on it, because the two are
   * different actors with different budgets. `setLiveData` is the OWNER editing the tree on the
   * Data tab, and it goes through the documented integrator endpoint with the owner's own data
   * key. This is the OPERATOR pressing a button on the dashboard, and it goes through
   * `control_data_patch_by_slug` (migration 0060) on the control slug they already hold — which
   * writes its rows without the `src:'api'` mark, so an operator's `+1` spends the production's
   * ordinary 50-per-5-s command budget and never the feed's 25-per-5-s ingest budget. "The
   * operator keeps priority" is the reason that second cap exists; routing a press through it
   * would have let a saturated feed refuse the operator's own score.
   *
   * WHICH WORLD WE ARE IN IS THE SLUG, not the key. A published production's tree lives on the
   * server whether or not this page has managed to read its data key, so testing the key would
   * have a failed key read (`productionDataKey` answers null on any error) quietly write a
   * published production's shared values into localStorage, where nothing would ever air them.
   * The unread case cannot reach here at all: `boundPressReady` below refuses the press first.
   */
  const patchBoundValues = useCallback(
    async (writes: TreeWrite[]): Promise<void> => {
      if (writes.length === 0) return;
      const before = liveDataRef.current;
      const next = withTreeWrites(before, writes);
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) return;
      // Optimistic on both roads, so the figure on screen moves with the press - and through the
      // ref as well as the state, because the NEXT press counts from it and a round trip is long
      // enough for several.
      liveDataRef.current = next;
      setLiveDataState(next);
      if (!hostedSlug) {
        saveLiveData(id, next);
        return;
      }
      try {
        // The ANSWER is what we hold: a feed tick that landed in the same moment is already
        // merged into it, so the press cannot silently overwrite the feed's write.
        const server = (await patchProductionDataBySlug(hostedSlug, patch)) as JsonObject;
        liveDataRef.current = server;
        setLiveDataState(server);
      } catch (error) {
        setNote(`The shared value did not move: ${(error as Error).message}`);
        void refreshServerData();
      }
    },
    [id, hostedSlug, refreshServerData],
  );

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

  /** The paths this production has bound, per graphic — what the cue editor greys out. */
  const boundFields = useCallback(
    (graphic: string | null): Record<string, string> => (graphic ? (bindings?.[graphic] ?? {}) : {}),
    [bindings],
  );

  /** The cue as the operator currently sees it — draft over record. */
  const cueView = useCallback(
    (cue: ShowCue): Pick<CueDraft, 'label' | 'note' | 'values'> => {
      const d = draftRef.current;
      return d && d.cueId === cue.id ? d : { label: cue.label, note: cue.note ?? '', values: cue.values };
    },
    [],
  );

  // The log names cues by the LABEL the operator wrote, and it is read from long-lived
  // callbacks, so the lookup goes through a ref rather than a dependency.
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const cueLabel = useCallback((cueId: string) => {
    // The DRAFT wins: a verb runs in the same tick as the `flushDraft()` before it, so reading
    // the record alone logged the name the cue had BEFORE the rename just made.
    const d = draftRef.current;
    if (d && d.cueId === cueId) return d.label;
    return cuesRef.current.find((c) => c.id === cueId)?.label ?? null;
  }, []);
  // A ⚡ press is logged by its BUTTON's name, not the machine's event id (control/eventLog.ts).
  // Read through a ref for the same reason as the cue names: the log callbacks are long-lived.
  // Filled from `poolMachines` below, which parses every graphic in the production once.
  const poolButtonsRef = useRef(new Map<string, ControlButton[]>());
  const eventLabel = useCallback(
    (graphic: string, event: string) =>
      eventLogLabel(poolButtonsRef.current.get(graphic) ?? [], event),
    [],
  );

  // ── Live tracking: recover the marker from the log's tail, then follow. Rows also drive the
  // PROGRAM monitor, so it shows what is really on air — including another operator's take. ──
  useEffect(() => {
    if (!hostedSlug || !backendConfigured || !show) return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    const tail = (after: number) => hostedControlTail(hostedSlug, after);
    void (async () => {
      // Read at the start of the round trip that ANSWERS: if a verb moves the live map while it
      // is in flight, the answer below is older than the screen and must not overwrite it.
      let movesAtRequest = 0;
      // BEFORE the await, because this page is reused when the route moves to another
      // production: the previous show's answer must not decide this one's road while the round
      // trip is in flight. Graphic keys are per-production layer names and collide freely.
      fastEventGraphicsRef.current = new Set();
      // A failed resolve is asked again on the renderer's backoff, and the header says so; only
      // an ANSWER decides.
      const answer = await untilAnswered(
        () => {
          movesAtRequest = liveCueMoves.current;
          return controlShowBySlug(hostedSlug);
        },
        { stop: () => !alive, onRetry: () => setResolveWaiting(true) },
      );
      if (!alive) return;
      setResolveWaiting(false);
      const resolved = answer.ok ? answer.value : null;
      if (!resolved) return;
      setOutputSeenAt(resolved.outputSeenAt);
      const ver = resolved.output?.ver;
      setPublishedStamp(ver ?? null);
      fastEventGraphicsRef.current = fastEventGraphics(resolved.output?.graphics ?? []);
      // The boot-recovery effect below replays each live layer's last REPORT into the local
      // monitor, so the reports must be in hand before the wire's picture commits and fires it.
      liveReportsRef.current = resolved.live;
      // THE SEED IS A WHOLESALE REPLACE, so it is skipped outright when this operator has
      // already acted. Merging the two was the other option and it is worse: the wire's map
      // is a snapshot, not a diff, so a layer this operator took OFF while the read was in
      // flight would come back on air. What is lost by skipping is the seeding of layers
      // another operator drove, and the follower's rows carry those in anyway.
      if (liveCueMoves.current === movesAtRequest) {
        setLiveCue(resolved.liveCue);
        // WHAT AIR IS SHOWING, for a desk that opens onto layers somebody else put there - a
        // teammate taking over, or the creator coming back (the three-member walk in
        // e2e/configured/teams.spec.ts found it). `airedData` is otherwise only what THIS page
        // sent, so a cold desk compared every on-air cue with nothing: its editor said "2 changes
        // not on air yet" about values that were on air, and the rebuilt PROGRAM monitor showed
        // the template's defaults. The renderer's own report is the best answer. A layer it has
        // not reported (the report trails a take, and no renderer need be open at all) falls
        // back to the live cue's values in the rundown, which is what its Take sent. The seed
        // REPLACES whatever the map held for that layer: this page has sent nothing since the
        // request (the guard above), and a value left from another production the page showed
        // before is not what this one's air holds. A clock's reported value carries its origin
        // stamp, which the baseline never holds (see `clockValues`), so the stamp goes back where
        // `restoreProgram` reads it and the baseline keeps the plain time.
        const seed: Record<string, Record<string, string>> = {};
        for (const [graphic, cueId] of Object.entries(resolved.liveCue)) {
          if (!cueId) continue;
          const reported = resolved.live[graphic]?.data;
          const values = {
            ...(reported && Object.keys(reported).length > 0
              ? reported
              : cuesRef.current.find((c) => c.id === cueId)?.values),
          };
          const clock = clockSpecsRef.current.get(graphic);
          const pair = speakingClocksRef.current.get(graphic);
          if (clock && values[clock.field] !== undefined) {
            clockValues.current[graphic] = values[clock.field];
            values[clock.field] = plainClockValue(values[clock.field]);
          }
          if (pair && values[pair.fieldA] !== undefined && values[pair.fieldB] !== undefined) {
            speakingValues.current[graphic] = { [pair.fieldA]: values[pair.fieldA], [pair.fieldB]: values[pair.fieldB] };
            values[pair.fieldA] = plainClockValue(values[pair.fieldA]);
            values[pair.fieldB] = plainClockValue(values[pair.fieldB]);
          }
          if (Object.keys(values).length > 0) seed[graphic] = values;
        }
        setAiredData((prev) => ({ ...prev, ...seed }));
        // …and the recovery is triggered by THE WIRE'S OWN ANSWER, never by `liveCue` moving —
        // see the effect below for what that distinction cost.
        setBootLive(resolved.liveCue);
      }
      // Seed each graphic's machine state from its last published report — the page may be
      // opening onto a production another operator drove mid-sequence.
      for (const [graphic, report] of Object.entries(resolved.live)) {
        if (report && typeof report === 'object' && 'state' in report) {
          noteMachineState(graphic, (report as { state?: { groups?: Record<string, string> } | null }).state ?? null);
        }
      }
      const history = await hostedControlTail(hostedSlug, Math.max(0, resolved.lastEventId - LOG_HISTORY_SPAN));
      if (!alive) return;
      setWireLog((l) =>
        appendLogEntries(
          l,
          history.map((r) => describeLogRow(r, cueLabel, eventLabel)).filter((e): e is LogEntry => !!e),
        ),
      );
      unsubscribe = await followControlLog({
        showId: show.id,
        from: resolved.lastEventId,
        tail,
        // The numbered log when the server has it (migration 0071); absent, today's id road.
        seq: resolved.seq,
        // Reported on every status change AND on every poll tick, so this stays true rather
        // than recording only the first answer.
        onStatus: (s) => {
          if (alive) setFollow(s);
        },
        onCommandStatus: (s) => {
          if (alive) setCommandStatus(s);
        },
        // THE FAST ROAD. The same verbs, broadcast by the database on the production's private
        // topic and here before their rows are - which is what moves this page's PROGRAM monitor
        // when the press came from another operator's phone.
        onCommand: applyCommand,
        onRow: (row) => {
          const msg = row.msg;
          // Mirror air locally: the PROGRAM monitor follows the wire, not just this page's own
          // buttons, so a take from another operator's phone shows here too. It is the SAME
          // door the broadcast above comes through, and `applyCommand` drops whichever copy is
          // second - a duplicate entrance would leave no trace on screen.
          applyCommand([{ graphic: row.graphic, msg }]);
          // A 'live' row is the renderer REPORTING what it applied — machine state included,
          // which is what keeps the action buttons' greying honest about air. Durable only: a
          // report is a row, not a verb, and it never travels the fast road.
          if (msg.t === 'live') noteMachineState(row.graphic, msg.state ?? null);
          // THE TREE MOVED SERVER-SIDE. Every row the patch RPC appends carries a `src` saying
          // who moved it - `api` for a feed, `operator` for a press on another dashboard (a
          // hosted control page's bound stepper, migration 0060) - and no other road writes one.
          // The row carries the resolved FIELD values, not the tree, so re-read it, and reuse
          // this signal rather than adding a second subscription on `control_shows` just to
          // learn the same fact. It is ANY src and not `api` alone because this page's own
          // `withBoundValues` airs the tree on the next Take: missing a hosted press here would
          // put that press's figure back where it was the moment somebody took a cue.
          // Durable only, and for a sharper reason: the patch RPC appends server-side and
          // broadcasts nothing.
          else if (msg.t !== 'staged' && msg.t !== 'cue' && typeof (msg as { src?: string }).src === 'string') {
            void refreshRef.current();
          }
          const entry = describeLogRow(row, cueLabel, eventLabel);
          if (entry) setWireLog((l) => appendLogEntries(l, [entry]));
        },
      });
    })();
    const seenTimer = setInterval(() => {
      setNow(Date.now());
      void controlOutputSeenAt(show.id).then((at) => {
        if (alive && at !== null) setOutputSeenAt(at);
      });
    }, 30_000);
    return () => {
      alive = false;
      setResolveWaiting(false);
      unsubscribe?.();
      clearInterval(seenTimer);
    };
  }, [hostedSlug, backendConfigured, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const liveReportsRef = useRef<ResolvedControlShow['live'] | null>(null);
  // Read through refs: the replay must use the FRESHEST answer at the moment a stage comes up,
  // and it must not re-run every time a take changes either of them.
  const liveCueRef = useRef(liveCue);
  liveCueRef.current = liveCue;
  const machineStatesRef = useRef(machineStates);
  machineStatesRef.current = machineStates;
  const restoreProgram = useCallback(() => {
    for (const [graphic, cueId] of Object.entries(liveCueRef.current)) {
      if (!cueId) continue;
      const report = (liveReportsRef.current?.[graphic] ?? null) as { data?: Record<string, string> } | null;
      const base = airedRef.current[graphic] ?? report?.data;
      // THE CLOCK'S WIRE VALUE OVERRIDES THE AIRED ONE. What this replays is what was SENT, and
      // a clock's sent value is a plain time — so without this a rebuilt monitor came back at
      // whatever the last Take carried and re-ran from there. The stamped value is kept apart
      // from `airedData` on purpose (see applyProgram) and is folded back in only here.
      const clock = clockSpecsRef.current.get(graphic);
      const stamped = clock ? clockValues.current[graphic] : undefined;
      let data = base && stamped !== undefined ? { ...base, [clock!.field]: stamped } : base;
      // A debate board's pair replays the same way, both fields at once — the running one
      // stamped, the held one plain, which is the whole state the floor was in.
      const pair = speakingClocksRef.current.get(graphic);
      const speaking = pair ? speakingValues.current[graphic] : undefined;
      if (base && pair && speaking) data = { ...base, ...speaking };
      const groups = machineStatesRef.current[graphic]?.groups;
      const items: ControlSendItem[] = [];
      if (data) items.push({ graphic, msg: { t: 'update', data } });
      if (groups) items.push({ graphic, msg: { t: 'snap', snap: groups } });
      else items.push({ graphic, msg: { t: 'play' } });
      if (data) items.push({ graphic, msg: { t: 'update', data } });
      applyProgram(items);
    }
  }, [applyProgram]);
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
  // The PREVIEW settles with bound fields overlaid too, for the same reason Take does: the
  // monitor has to show what a Take would actually put on air, not the cue's prepared value.
  const settleData = previewCue
    ? JSON.stringify(withBoundValues(cueGraphicName(previewCue) ?? '', cueView(previewCue).values))
    : '';
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

  /**
   * EVERY POOL GRAPHIC'S MACHINE, not just the selected one.
   *
   * The ⚡ block above reads one graphic — the cue in the editor — because that is what an action
   * acts on. The activity feed names whichever graphic a row is for, so the whole pool is parsed
   * here, once per resolution. Keyed by NAME because that is the routing key the log, `staged` and `live` use, and
   * a Map because a pool graphic's name is somebody's typed text.
   */
  const poolMachines = useMemo(() => {
    const out = new Map<string, { buttons: ControlButton[]; js: string }>();
    for (const g of pool ?? []) {
      const tpl = templateForSavedGraphic(g, library);
      // `js` rides along for the Next verb, which asks the same machine whether a press would
      // move anything (`canAdvance`).
      out.set(g.name, { buttons: eventButtons(tpl.js), js: tpl.js });
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
      flushDraft();
      setDraft(null);
      setSelectedCueId(cueId);
      setSelectedFolderRow(null);
      setRangeIds([]);
      setEditTarget('preview');
    },
    [flushDraft],
  );
  /** Hold a folder's header: its panel opens, and SPACE, TAKE and Out act on the folder. Its first cue
   *  becomes the selected cue behind it, so if the folder goes the cursor stays where it stood. */
  const selectFolder = useCallback(
    (folderId: string, rowId: string) => {
      flushDraft();
      setDraft(null);
      const first = rundown.members.get(folderId)?.[0];
      if (first) setSelectedCueId(first.id);
      setSelectedFolderRow({ folderId, rowId });
      setRangeIds([]);
      setEditTarget('preview');
    },
    [flushDraft, rundown],
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

  // ── The verbs. ONE place a verb's commands go somewhere: the wire when published, the local
  // PROGRAM monitor always, so the two can never drift into two behaviours. `sendVerb` reports its
  // outcome as its own sentence; `runVerb` below puts that on the note line, as every verb did. A
  // folder's Take sends through `sendVerb` and says once, at its end, how all of it went. ──
  const sendVerb = useCallback(
    async (
      batches: ControlSendItem[][],
      label: string,
      allOut = false,
    ): Promise<({ ok: true } & VerbSent) | { ok: false; note: string }> => {
      if (!hostedSlug) {
        // Not published: the verbs still drive the local PROGRAM monitor, which is what makes
        // the whole surface usable (and provable) offline. Nothing leaves the machine.
        for (const batch of batches) {
          rememberAired(batch);
          applyProgram(batch);
        }
        const at = new Date().toISOString();
        const entries = batches
          .flat()
          .map((item) =>
            describeLogRow(
              { id: (localLogId.current -= 1), graphic: item.graphic, msg: item.msg, created_at: at },
              cueLabel,
              eventLabel,
            ),
          )
          .filter((e): e is LogEntry => !!e);
        setWireLog((l) => appendLogEntries(l, entries));
        return { ok: true, skipped: [], superseded: [] };
      }
      try {
        // BOTH ROADS, from this one press (src/control/commandRoads.ts). `applyHere` moves this
        // page's own monitor in zero hops - it used to wait for the whole round trip, because
        // applying locally as well as off the log would have doubled every command it sent, and
        // the minted id is what makes doing both safe. Every other surface gets the database's
        // own broadcast on the production's private topic, with the durable row behind it, and
        // applies whichever won. Several batches are ONE press: numbered and based together, now.
        const sent = await sendControlVerbs({
          slug: hostedSlug,
          showId,
          batches,
          applyHere: applyCommand,
          fastEvents: (graphic) => fastEventGraphicsRef.current.has(graphic),
          allOut,
        });
        setNote(sendDebts.current.landed(batches.flat()));
        return { ok: true, ...sent };
      } catch (e) {
        // A verb whose picture MOVED HERE and then failed to send is a different sentence from
        // one that never happened, and an operator has to be told which they are looking at: this
        // monitor applied the commands before the round trip, so what is in front of them is not
        // what any other screen is showing. The broadcast and the row are written together, so a
        // refused verb aired nowhere else - and a send that failed on the way BACK may have aired
        // everywhere, which is why this says "may".
        // A press another screen had already overtaken was refused by the server, so it is its own
        // sentence rather than "send it again" (protocol 2, migration 0071).
        const note = verbStale(e)
          ? staleSentence(e as Error)
          : verbAired(e)
            ? `${label} is on this monitor only. It may not have reached the screens or the log (${(e as Error).message}). Send it again.`
            : `${label} failed: ${(e as Error).message}`;
        // Owed: the batch that failed and those after it. The ones before it landed.
        sendDebts.current.failed(batches.slice(verbsLanded(e)).flat(), note);
        return { ok: false, note };
      }
    },
    [hostedSlug, showId, cueLabel, eventLabel, rememberAired, applyProgram, applyCommand],
  );
  /** Send, and say so if it failed. What it came to when it landed, or null when it did not. */
  const runVerb = useCallback(
    async (batches: ControlSendItem[][], label: string): Promise<VerbSent | null> => {
      const sent = await sendVerb(batches, label);
      if (!sent.ok) setNote(sent.note);
      return sent.ok ? sent : null;
    },
    [sendVerb],
  );

  /**
   * PRODUCTION DATA, the dispatch half: put the CHANGES on the wire, and nothing else.
   *
   * Diffing is not an optimisation. The log caps a production at 50 commands per 5 s (migration
   * 0008) and every row fans out over Realtime to the renderer and to every open operator page,
   * so a tree with one moving value must cost ONE row rather than one per bound graphic per
   * tick. The baseline starts empty on purpose: the first pass after opening the page (or after
   * switching production) reconciles every bound field once, which is safe precisely because
   * these are absolute values and re-sending one changes nothing.
   */
  useEffect(() => {
    // PUBLISHED, the SERVER does this half: control_data_patch resolves the bindings and appends
    // the update rows itself, and the log follower above brings them back here. Dispatching
    // locally too would double every write - one row from the API, one from this page.
    // `undefined` = the key has not resolved yet, so we do not know which world we are in and
    // must not guess: guessing "offline" airs the stale local tree for a moment.
    if (dataKey !== null) return;
    const changes = diffResolved(lastResolved.current, resolved);
    const graphics = Object.keys(changes);
    if (graphics.length === 0) return;
    lastResolved.current = resolved;
    void runVerb(
      [graphics.map((graphic) => ({ graphic, msg: { t: 'update' as const, data: changes[graphic] } }))],
      'Data',
    );
  }, [resolved, runVerb, dataKey]);

  // A hardware panel (docs/work-specs/hardware-panel-control/): fed below, once the page knows what it
  // shows. A server clip's clock moves in its store without re-rendering this page, so the answer
  // hears that part directly; it publishes only when a key would show a difference.
  const panel = usePanelAnswer({ slug: hostedSlug, where: 'production', label: 'Production page', runs: PRODUCTION_PANEL_VERBS });
  const [panelOpen, setPanelOpen] = useState(false);
  // While answering, the panel also hears the timing part, after the whole fold: a reading moves
  // timing and then ownership, and a state pairing the two halves must never go out. What moves
  // with time alone (a counted clip reaching its end, a count turning estimated) is caught by the
  // render the header clock causes every second.
  useEffect(() => {
    if (!panel.on) return;
    return serverPlayout.timing.subscribe(() => queueMicrotask(panel.changed));
  }, [panel.on, serverPlayout, panel.changed]);
  const panelRows = useMemo(() => rundownPanelRows(rundown.rows), [rundown]);

  if (!show) {
    return (
      <div className="app home-page" data-testid="production-page">
        <header className="topbar">
          <a className="brand brand-home" href="/" title="NoaCG Studio front page">
            <BrandLogo size={24} />
          </a>
          <span className="tpl-name">{teamShowsStatus() === 'loading' ? 'Opening production…' : 'Production not found'}</span>
        </header>
        <main className="home-content" style={{ padding: 24 }}>
          {/* A TEAM production opened cold - a teammate's link, a reload - arrives with the
              first team fetch, a moment after this page. Saying "no longer exists" for that
              moment tells somebody their team's work is gone. */}
          <p className="hint" data-testid={teamShowsStatus() === 'loading' ? 'production-loading' : 'production-missing'}>
            {teamShowsStatus() === 'loading'
              ? 'Loading your team productions…'
              : teamsOn
                ? 'This production no longer exists, or it belongs to a team you are not in.'
                : 'This production no longer exists.'}
          </p>
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
  /** The PUBLIC audience URL. Only a production published against a server carrying migration
   *  0035 has one, so it stays absent rather than showing a link that would not resolve. */
  const joinUrl = show.joinSlug ? joinPageUrl(show.joinSlug) : null;
  /** The PRESENTER's own page — a third capability, minted at publish beside the join slug and
   *  absent for the same reason when the server predates 0035. */
  const presenterUrl = show.presenterSlug ? presenterPageUrl(show.presenterSlug) : null;
  const controlUrl = show.hostedSlug ? controlPageUrl(show.hostedSlug) : null;
  const clashes = duplicateLayers(show.graphics);

  /**
   * THE ACCOUNT GATE for the three verbs here that write hosted rows: publish, unpublish and
   * claiming the audience name. Row-level security only lets an account touch its own
   * `control_shows` row, and a signed-out write is not refused - it matches no row and reports
   * success. So without this, a signed-out Unpublish said "unpublished" while the output kept
   * running, and a claim said the new name was live when nothing had changed. Returns true when
   * the verb must stop. Offline (no backend) it never blocks: those verbs answer for themselves
   * there, and an offline build must grow no auth UI.
   */
  const accountBlocks = (reason: string): boolean => {
    if (!backendConfigured) return false;
    if (authStatus === 'loading') {
      setNote('Still checking your account. Try that again in a moment.');
      return true;
    }
    if (needsSignIn) {
      openSignIn(reason);
      return true;
    }
    return false;
  };

  /**
   * Claim the readable audience name. The database owns every rule (0035's shape constraint,
   * reserved list and unique index), so this only asks and reports - and on success it adopts
   * the name locally, because `joinUrl` is built from the stored slug and would otherwise keep
   * showing the old one until a republish.
   */
  const claimName = async () => {
    if (accountBlocks(CLAIM_NEEDS_ACCOUNT)) return;
    setBusy(true);
    try {
      const failure = await claimJoinName(show.id, nameDraft);
      if (failure) {
        setNameNote(failure);
        return;
      }
      const claimed = nameDraft.trim();
      setShows(setShowAudienceSlugs(show.id, { joinSlug: claimed, presenterSlug: show.presenterSlug }));
      setNameDraft('');
      setNameNote(`✓ The audience link is now /join/${claimed}`);
    } catch (e) {
      setNameNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The OUTPUT EMBED (export/outputEmbed.ts) - the output URL packaged as a template FILE.
   * It lives beside the URL rather than in the production's export dialog because it is not a
   * package of the graphics at all: it is the same live output the URL addresses, in the one
   * shape a host that lists template files (SPX, and CasparCG's own template folder) can load.
   * The resolution is the stage's, derived exactly as `buildOutputPayload` derives it, so the
   * size the file quotes to the operator is the size the renderer actually paints.
   */
  const downloadEmbed = () => {
    if (!outputUrl) return;
    const library = loadGraphics();
    const resolution = show.graphics.reduce<Resolution>((r, g) => {
      const res = templateForSavedGraphic(g, library).resolution;
      return { width: Math.max(r.width, res.width), height: Math.max(r.height, res.height), label: r.label };
    }, DEFAULT_GRAPHICS_RESOLUTION);
    const html = outputEmbedHtml({ production: show.name, outputUrl, resolution });
    saveAs(new Blob([html], { type: 'text/html' }), outputEmbedFileName(show.name));
    // The file IS the output URL, so downloading it sets an output up exactly as copying the
    // link does - and the header's heartbeat starts answering for both.
    setShows(noteShowOutputOpened(show.id));
    setNote('✓ Template file downloaded. Drop it into SPX ASSETS/templates (or your CasparCG template folder) and add it to a rundown.');
  };

  /**
   * Upload pictures into the production (the PICTURE graphic — src/templates/picture.ts).
   *
   * ONE picture graphic per production, holding every uploaded still, with one CUE per picture.
   * That is the cue model as designed: many cues over one pool graphic means taking picture 3
   * replaces picture 1 on the same layer instead of stacking a second still over it.
   *
   * It is deliberately NOT a library graphic. The production page may not write into a document
   * it only references (the rule the cue editor's image picker states), so the picture graphic
   * belongs to the pool instead — which also means `templateForSavedGraphic` resolves the POOL
   * copy, the one this handler updates. The name is made unique against the library because that
   * fallback resolves by NAME when there is no `graphicId`, and an unrelated library graphic
   * called "Pictures" would otherwise capture the production's own.
   */
  const uploadPictures = async (files: File[]) => {
    if (files.length === 0) return;
    const existing = show.graphics.find((g) => g.type === 'picture') ?? null;
    // The stage the pictures are drawn on, derived the way the output payload derives it, so an
    // upload into a 4K production keeps 4K pixels instead of being capped at 1080.
    const stage = show.graphics.reduce<Resolution>((r, g) => {
      const res = templateForSavedGraphic(g, library).resolution;
      return { width: Math.max(r.width, res.width), height: Math.max(r.height, res.height), label: r.label };
    }, DEFAULT_GRAPHICS_RESOLUTION);
    let template = existing ? existing.template : createPictureTemplate('', stage);
    if (!existing) {
      const taken = new Set(library.map((d) => d.name));
      let name = PICTURE_GRAPHIC_NAME;
      for (let n = 2; taken.has(name); n += 1) name = `${PICTURE_GRAPHIC_NAME} ${n}`;
      template = { ...template, name };
    }
    const room = MAX_PICTURES - template.assets.length;
    if (room <= 0) {
      setNote(`This production already holds ${MAX_PICTURES} pictures. Remove one before adding another.`);
      return;
    }
    const chosen = files.slice(0, room);
    const added: { path: string; label: string }[] = [];
    for (const file of chosen) {
      // Downscaled here, in the browser, before the bytes ever leave the tab: every picture is
      // base64'd into the published output row, so an untouched phone photo would cost megabytes
      // on every renderer AND operator page load.
      const { data } = await importImageFile(file, Math.max(stage.width, stage.height));
      const result = addPictureToTemplate(template, { fileName: file.name, data });
      template = result.template;
      added.push({ path: result.path, label: pictureLabel(file.name, added.length) });
    }
    // Replacing by NAME keeps the pool id, the layer and every cue already prepared against it.
    // Each step waits for its durable write, so no cue is written over a picture graphic that did
    // not land and the ✓ below is never said over a refused save
    // (components/never-report-save-storage-layer-has).
    const { shows: afterPool, error } = addGraphicToShow(show.id, template, {});
    setShows(afterPool);
    const poolFailure = error ?? (await commitDurableWrites());
    if (poolFailure) {
      setNote(`The pictures were not added: ${poolFailure}`);
      return;
    }
    const poolId = afterPool
      .find((s) => s.id === show.id)
      ?.graphics.find((g) => g.name === template.name)?.id;
    if (poolId) {
      // A NEW graphic arrives with one cue already seeded from its field defaults, and the first
      // picture IS that default — so only the pictures after it need cues of their own.
      const needCues = existing ? added : added.slice(1);
      let next = afterPool;
      if (!existing && added.length > 0) {
        // That seeded cue is labelled after the GRAPHIC ("Pictures"), which is the right default
        // for a lower third and the wrong one here: an operator scanning the rundown is looking
        // for the picture's own name.
        const seeded = next.find((s) => s.id === show.id)?.cues?.find((c) => c.sourceId === poolId);
        if (seeded) next = updateShowCue(show.id, seeded.id, { label: added[0].label });
      }
      for (const picture of needCues) {
        next = addShowCue(show.id, poolId, {
          label: picture.label,
          values: { [PICTURE_FIELD]: picture.path },
        }).shows;
      }
      setShows(next);
      const cueFailure = await commitDurableWrites();
      if (cueFailure) {
        setNote(`The pictures were added, but not all of their cues were saved: ${cueFailure}`);
        return;
      }
    }
    const skipped = files.length - chosen.length;
    setNote(
      `✓ ${chosen.length} picture${chosen.length === 1 ? '' : 's'} added` +
        (skipped > 0 ? `, ${skipped} skipped (${MAX_PICTURES} per production)` : '') +
        // Assets are pinned at publish, so a picture does not reach a running renderer until
        // the production is published again — said here rather than discovered on air. An
        // unpublished production has nothing to re-publish, so it is not told to.
        (show.outputSlug ? '. Publish again to put them on the output.' : '.'),
    );
  };

  const copy = (kind: 'output' | 'control' | 'join' | 'presenter', text: string) => {
    void copyLink(text).then((ok) => {
      if (!ok) return;
      // Taking the output URL is what turns "is the output connected?" into a question worth
      // asking on this header - see the heartbeat readout in ProductionShell.
      if (kind === 'output') setShows(noteShowOutputOpened(show.id));
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
    });
  };

  /** Publish; the version it wrote, or null when it did not (the note says why). `forPrepare`:
   *  Prepare for Live's own publish, which leaves the links panel shut and says what it did. */
  const publishNow = async (forPrepare = false): Promise<HeldVersion | null> => {
    if (accountBlocks(PUBLISH_NEEDS_ACCOUNT)) {
      // Only a real sign-in prompt is worth finishing; the "still checking" answer is not one.
      if (needsSignIn && !forPrepare) publishAfterSignIn.current = true;
      return null;
    }
    flushDraft();
    setBusy(true);
    try {
      const current = loadShows().find((s) => s.id === show.id);
      // Started before this press: then this is a re-publish, and open outputs are asked to prepare.
      const wasStarted = !!current?.hostedSlug;
      const published = current ? await publishControlShow(current) : null;
      if (published) {
        setShowHostedSlug(show.id, published.slug);
        // The audience capabilities are minted by the database and read back, never chosen
        // here. A server without migration 0035 hands back nulls, which clears them — the
        // production simply has no join link, and nothing else about publishing changes.
        setShowAudienceSlugs(show.id, {
          joinSlug: published.joinSlug,
          presenterSlug: published.presenterSlug,
        });
        setShows(setShowOutputSlug(show.id, published.outputSlug ?? undefined));
        if (published.version) setPublishedStamp(published.version);
        // A REPUBLISH PINS A NEW PAYLOAD, and the follow effect does not run again for it (the
        // slug is deliberately the same one). A graphic that has just gained a clock would
        // otherwise keep its events on the fast road for the rest of the session, so the answer
        // is recomputed here from the library this publish pinned.
        fastEventGraphicsRef.current = fastEventGraphics(
          (current?.graphics ?? []).map((g) => ({ key: g.name, ...templateForSavedGraphic(g, loadGraphics()) })),
        );
        if (forPrepare) {
          setNote(`✓ Published as v${published.version?.n ?? '?'} for Prepare for Live. Every output now prepares it.`);
        } else {
          // EVERY PUBLISH PREPARES (docs/work-specs/studio-day-playout AC-10; owner, 2026-10-01): the
          // same request Prepare for Live puts in this page's Presence entry, so each open output
          // builds what changed beside what it runs and moves onto it when nothing is on air there
          // (src/output/prepare.ts). Only this press sends it - no timer, no polling - and it is
          // taken out again once the outputs have had their time to answer.
          if (published.version && wasStarted) {
            const prep: PrepRequest = { id: requestId(), n: published.version.n, h: published.version.h };
            setPrepRequest(prep);
            setTimeout(() => dropPrep(prep.id), PREPARE_WAIT_MS);
          }
          setStatusOpen(true);
          setNote(
            wasStarted
              ? `✓ Published as v${published.version?.n ?? '?'}. Every open output prepares it and moves onto it when nothing is on air there.`
              : '✓ Started. Put it on air from the Playout panel, or load the output URL in a browser source once: it stays the same across publishes.',
          );
        }
        return published.version ? { n: published.version.n, h: published.version.h } : null;
      }
      setNote('Publishing needs the cloud backend, and this build runs offline.');
      return null;
    } catch (e) {
      setNote(`Publish failed: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    await publishNow();
  };
  preparePublishRef.current = () => publishNow(true);

  publishRef.current = publish;

  const unpublish = async () => {
    if (accountBlocks(UNPUBLISH_NEEDS_ACCOUNT)) return;
    // Taking a TEAM production off air is the team owner's call (migration 0054, ruling 3), and
    // the database refuses anybody else without saying so - the delete simply matches no row. So
    // it is said here, before the local record is told a publication ended that did not.
    const team = show.teamId ? teamState.teams.find((t) => t.id === show.teamId) : null;
    if (show.teamId && team?.ownerId !== user?.id) {
      setNote('Only the team owner can unpublish a team production. You can still republish it, and operate it.');
      return;
    }
    setBusy(true);
    try {
      await unpublishControlShow(show.id);
      setShowHostedSlug(show.id, undefined);
      // The AUDIENCE slugs are deliberately kept. Migration 0040 reserves every address a
      // production has ever had, so re-publishing hands the same four back — and the readable
      // join name is derived on the FIRST publish only, from `!show.joinSlug`. Clearing it here
      // made every re-publish look like a first one, so the name could be re-derived and MOVE
      // even though the database still had it. Nothing displays these while unpublished: the
      // whole Links block is gated on `hostedSlug`, which is cleared above.
      setShows(setShowOutputSlug(show.id, undefined));
      setLiveCue({});
      setNote('Production unpublished. Its links stop working until you publish again, and come back unchanged when you do.');
    } catch (e) {
      setNote(`Unpublish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

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
  /** The selected cue is a clip this page has up on the server: what Pause and Resume act on. */
  const selectedClipUp = !!selectedCue && selectedPlayoutLive && selectedPlayoutItem?.kind === 'media';
  /** What is on air on the SELECTED cue's layer — its own cue, another cue, or nothing. */
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedLayerLive = !!selectedLayerCueId || selectedPlayoutLive;
  /** The cue the editor is actually pointed at (§2): the previewed one, or the live one. */
  const airCue = selectedLayerCueId ? cues.find((c) => c.id === selectedLayerCueId) ?? null : null;
  const editingCue = editTarget === 'air' && airCue ? airCue : selectedCue;
  const editingIsLive =
    (!!editingCue && !!selectedGraphic && liveCue[selectedGraphic] === editingCue.id) ||
    (selectedPlayoutLive && editingCue === selectedCue);
  /** Its place in the rundown, 1-based - the only thing that tells two cues of the same graphic
   *  apart, since they share a name and a tally. 0 when there is no cue to name. */
  const editingCueNo = editingCue ? cues.findIndex((c) => c.id === editingCue.id) + 1 : 0;
  /** The SELECTED cue is the one on air (not merely something on its layer) - what SPACE
   *  toggles off, and what makes ⟳ TAKE a deliberate re-take rather than a first airing. */
  const selectedCueIsLive = (!!selectedCue && selectedLayerCueId === selectedCue.id) || selectedPlayoutLive;
  /** The SELECTED cue is the one on PREVIEW - always, in 'take' mode. In the other mode this
   *  is the difference between SPACE previewing and SPACE airing. */
  const selectedCueStaged = !!selectedCue && previewCue?.id === selectedCue.id;
  /** What SPACE - and the TAKE button, which IS the key - does next (components/playoutKeys.ts). */
  const spaceNext = spaceAction(spaceMode, { live: selectedCueIsLive, previewed: selectedCueStaged });
  const face = takeFace(spaceNext);
  /**
   * UNSENT CHANGES on the cue that is on air (acceptance pass, 2026-08-06: "there needs to be
   * an alert when something changes and you need to send that update - I had problems with my
   * CasparCG output but only because I hadn't sent an update").
   *
   * It compares the edited values against what was last SENT, never against the stored cue: the
   * whole point of staged-vs-take is that those legitimately differ, and data still does NOT
   * air by itself - this only says so out loud. A cue that has never been taken is not
   * "unsent"; it is simply not on air, which the rundown already says.
   */
  const unsentOf = (graphic: string, cue: ShowCue): string[] => {
    // A BOUND field is not a cue value (plan §2.7): Take and ✎ Update air the tree's figure for
    // it, so its stored value differing from air is not an edit anyone made and never "unsent"
    // (the review's S4: a bound scoreboard wore an amber that Update could not clear).
    const bound = boundFields(graphic);
    return Object.entries(cueView(cue).values)
      .filter(([field, value]) => !bound[field] && (airedData[graphic]?.[field] ?? '') !== value)
      .map(([field]) => field);
  };
  const unsentFields = editingIsLive && selectedGraphic && editingCue ? unsentOf(selectedGraphic, editingCue) : [];
  const hasUnsent = unsentFields.length > 0;
  /** The ON-AIR cues whose values differ from what air shows, by cue id - said on their rundown
   *  row, where the operator looks, and not only in the editor that has to be showing the cue
   *  (the review's S1: edit the on-air cue, click another row, and the only sign was gone). A
   *  graphic this page has sent nothing for (a reload, another operator's take) is not judged:
   *  there is no record of what air shows to compare with. */
  const unsentOnAir = new Set(
    Object.entries(liveCue)
      .filter(([graphic, cueId]) => {
        const cue = airedData[graphic] && cues.find((c) => c.id === cueId);
        return !!cue && unsentOf(graphic, cue).length > 0;
      })
      .map(([, cueId]) => cueId),
  );

  const editDraft = (patch: Partial<Pick<CueDraft, 'label' | 'note'>> & { values?: Record<string, string> }) => {
    if (!editingCue) return;
    setDraft((d) => {
      const base: CueDraft =
        d && d.cueId === editingCue.id
          ? d
          : { cueId: editingCue.id, label: editingCue.label, note: editingCue.note ?? '', values: { ...editingCue.values } };
      return { ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } };
    });
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushDraft, 300);
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
    options: { cut?: boolean; takenAt?: number } = {},
  ): Promise<ServerVerbOutcome | null> => {
    const item = playoutItemFor(cue);
    if (!item) return null;
    // A Take never goes the old way with a setting dropped (docs/CLIP_PLAYBACK_PLAN.md §6.9). SPACE,
    // the button and Re-take all come through here, so the check is made once, where it cannot be
    // stepped round; taking a cue OFF and staging it on PREVIEW are never held up by it.
    if (verb === 'take') {
      const blocked = takeBlockerFor(cue);
      if (blocked) return { ok: false, note: `${label} was not sent: ${blocked}`, accepted: [] };
    }
    flushDraft();
    const settings = loadPlayoutSettings();
    const through = verb === 'take' && item.kind === 'media' ? places.get(cue.id)?.folder : undefined;
    const run = through ? folderRun(through, cues, playoutItems, cue.id) : null;
    if (run && !run.ok) return { ok: false, note: `${label} was not sent: ${run.reason}`, accepted: [] };
    const first: SequenceMember = run?.ok ? run.run.members[0] : { cue, item };
    // Play next: the clips a Take plays one after another, found in the rundown as it stands NOW
    // (docs/CLIP_PLAYBACK_PLAN.md §6.6). The Take is off with the reason when they cannot be found.
    const chain =
      !run && verb === 'take' && item.kind === 'media' && effectiveEnd(cue, item) === 'next'
        ? sequenceMembers(cues, playoutItems, cue.id, (i) => slotAddress(itemSlot(settings, i)), folders)
        : null;
    const members = run?.ok ? (run.run.members.length > 1 ? run.run.members : undefined) : chain?.ok && chain.members.length > 1 ? chain.members : undefined;
    const loop = !!run?.ok && run.run.loop;
    const slotNow = through ? folderSlot(settings, through) : itemSlot(settings, item);
    if (through) {
      // The folder was moved to another slot while it played: its run there goes first, whichever of
      // its clips is up, so a move is a move and never a second run.
      const own = serverPlayout.ownership.get().onAir;
      for (const member of rundown.members.get(through.id) ?? []) {
        const m = playoutItemFor(member);
        const live = m ? own[m.id] : undefined;
        if (!m || !live || live.cueId !== member.id || slotAddress(live.slot) === slotAddress(slotNow)) continue;
        const off = await runServerVerb({ verb: 'out', cue: member, item: m, label, live, slotNow: live.slot, values: () => ({}), act: (action) => act(settings, action), cut: true });
        for (const a of off.accepted) serverPlayout.apply((parts) => applyAccepted(parts, { ...a, itemId: m.id, cueId: member.id, now: performance.now(), readable: stateReadable(bridgeStatus) }));
        if (!off.ok) return off;
      }
    }
    const outcome = await runServerVerb({
      verb,
      cue: first.cue,
      item,
      label,
      // Read from the store as it stands now, not from this render: a reading may have moved it
      // while the verb was waiting its turn.
      live: serverPlayout.ownership.get().onAir[item.id],
      slotNow,
      values: () => cueView(cue).values,
      act: (action) => act(settings, action),
      sequence: members,
      loop,
      ...(options.cut ? { cut: true } : {}),
    });
    const readable = stateReadable(bridgeStatus);
    for (const a of outcome.accepted) {
      serverPlayout.apply((parts) =>
        applyAccepted(parts, {
          ...a,
          itemId: item.id,
          cueId: cue.id,
          // The take's own count until the server's first reading: the part of the file it plays.
          length: segmentSeconds(first.cue, item),
          loop: effectiveEnd(first.cue, item) === 'loop',
          // What this take sent for its end, which the clock says until the next Take.
          end: effectiveEnd(first.cue, item),
          now: performance.now(),
          readable,
          ...(options.takenAt !== undefined && a.verb === 'take' ? { takenAt: options.takenAt } : {}),
          ...(a.verb === 'take' && members ? { sequence: { next: sequenceAction(members, a.slot, loop).entries.slice(1), ...(loop ? { loop: true } : {}) } } : {}),
        }),
      );
    }
    // Read the server at once rather than at the next half second: the clock and the rows then
    // show the server's own word for the clip that was just taken.
    if (outcome.accepted.length) statePoll.current?.wake();
    return outcome;
  };
  /** One verb on the playout server, and the note line says how it went, whichever way that was. */
  const playoutVerb = async (cue: ShowCue, verb: ServerVerb, label: string, options: { cut?: boolean } = {}): Promise<boolean> => {
    const outcome = await serverVerb(cue, verb, label, options);
    if (!outcome) return false;
    setNote(outcome.note);
    return outcome.ok;
  };

  /** Forget why these cues' last folder Take missed them: they were taken since, or taken off. */
  const clearMisses = (ids: readonly string[]) =>
    setTakeMisses((m) => (ids.some((id) => id in m) ? Object.fromEntries(Object.entries(m).filter(([id]) => !ids.includes(id))) : m));

  /** A graphic cue's Take, reporting nothing: its sentence comes back, for one cue or a folder's
   *  whole Take to say. Null when its graphic is gone. */
  const takeGraphicCue = async (cue: ShowCue, label: string): Promise<MemberTake | null> => {
    const graphic = cueGraphicName(cue);
    if (!graphic) return null;
    flushDraft();
    // Bound fields come from the LIVE tree, not from what this cue stored when it was prepared
    // (plan §2.7) — otherwise taking an old cue would re-air a stale score.
    const values = withBoundValues(graphic, cueView(cue).values);
    const sent = await sendVerb([takeCueItems({ id: cue.id, graphic, values })], label);
    if (!sent.ok) return { ok: false, note: sent.note };
    // Superseded: this page's later press on the graphic stands, and its own handler set the chip.
    if (!leftAlone(sent).includes(graphic)) setLiveCue((m) => withLiveCue(m, graphic, cue.id));
    clearMisses([cue.id]);
    return { ok: true, note: `✓ ${label}: ${cue.label}` };
  };

  /** A cue of a One-by-one folder went on air, by whatever route: the folder's step stands on it, so
   *  the next press continues after it (docs/CLIP_PLAYBACK_PLAN.md §20.1). */
  const noteStep = (cue: ShowCue) => {
    const folder = cue.folderId ? rundown.folders.get(cue.folderId) : undefined;
    if (folder && folderMode(folder) === 'manual') setFolderSteps((m) => (m[folder.id] === cue.id ? m : { ...m, [folder.id]: cue.id }));
  };

  const takeCue = async (cue: ShowCue) => {
    if (cue.source === 'playout') {
      if (await playoutVerb(cue, 'take', 'Take')) {
        clearMisses([cue.id]);
        noteStep(cue);
      }
      return;
    }
    const taken = await takeGraphicCue(cue, 'Take');
    if (taken && !taken.ok) setNote(taken.note);
    else if (taken?.ok) noteStep(cue);
  };

  const updateLive = async () => {
    if (editingCue?.source === 'playout') {
      if (selectedPlayoutLive) await playoutVerb(editingCue, 'update', 'Update');
      return;
    }
    if (!editingCue || !selectedGraphic || !editingIsLive) return;
    flushDraft();
    // Same overlay as Take: ✎ Update must not push a bound field back to its prepared value.
    const data = withBoundValues(selectedGraphic, cueView(editingCue).values);
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'update', data } }]], 'Update');
  };

  /**
   * One press bumps a number field ON AIR: a PARTIAL update carrying just that field, plus the
   * same value into the edited cue so the cue and the air cannot drift apart. Game-show points
   * and match scores change constantly, and stepper-then-✎-Update was two presses under
   * pressure — this is the one data write that airs immediately, which is why it renders with
   * the on-air controls rather than in the cue editor above.
   *
   * PARTIAL on purpose: ✎ Update sends the cue's whole value set, so riding it here would also
   * air every OTHER staged edit the operator has not sent yet — a bump must never publish a
   * half-typed name. Receivers write exactly the fields a message carries, and the logs merge
   * partial data, so recovery replays it correctly (docs/CONTROL_LAYER.md).
   *
   * A BOUND FIELD TAKES THE OTHER ROAD (plan §2.9's Phase 3). The figure is not this graphic's
   * to own — it is one shared value several graphics follow — so the press moves the production
   * tree and every bound graphic follows through the ordinary diff, and nothing is written into
   * this cue at all (§2.7: a bound field is never a cue value). It counts from the TREE and not
   * from the wire because the tree is the authority: the wire is only its last resolution, and a
   * feed that moved the value a moment ago has already changed what "+1" means.
   */
  const bumpLive = async (fieldKey: string, delta: number) => {
    if (!editingCue || !selectedGraphic || !editingIsLive) return;
    const path = boundFields(selectedGraphic)[fieldKey];
    if (path) {
      if (!boundPressReady()) return;
      const base = resolvedRef.current[selectedGraphic]?.[fieldKey];
      await patchBoundValues([{ path, text: adjustedValue(base, delta), verb: 'adjust' }]);
      return;
    }
    const base = airedData[selectedGraphic]?.[fieldKey] ?? cueView(editingCue).values[fieldKey] ?? '0';
    const next = adjustedValue(base, delta);
    editDraft({ values: { [fieldKey]: next } });
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'update', data: { [fieldKey]: next } } }]], 'Update');
  };

  const nextLive = async () => {
    if (selectedCue?.source === 'playout') {
      if (selectedPlayoutLive) await playoutVerb(selectedCue, 'next', 'Next');
      return;
    }
    if (!selectedGraphic || !selectedLayerLive) return;
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'next' } }]], 'Next');
  };

  const outLive = async () => {
    if (selectedCue?.source === 'playout') {
      if (selectedPlayoutLive) await playoutVerb(selectedCue, 'out', 'Out');
      return;
    }
    if (!selectedGraphic || !selectedLayerLive) return;
    const sent = await runVerb([clearCueItems(selectedGraphic)], 'Out');
    if (sent && !leftAlone(sent).includes(selectedGraphic)) setLiveCue((m) => withLiveCue(m, selectedGraphic, null));
  };

  /**
   * Play a named graphic off air, if it is up. Removal goes through this first: the output page
   * follows the LOG, not the payload, so a pool graphic deleted while live would keep rendering
   * on its layer with nothing left on this surface able to take it off.
   */
  const takeOffAir = async (graphic: string) => {
    if (!liveCue[graphic]) return;
    const sent = await runVerb([clearCueItems(graphic)], 'Out');
    if (sent && !leftAlone(sent).includes(graphic)) setLiveCue((m) => withLiveCue(m, graphic, null));
  };

  /** Remove one cue. When it is its graphic's LAST cue the graphic goes with it (shows.ts
   *  removeShowCue): the rundown is the only list of what a production holds, so nothing may
   *  survive out of sight of it. */
  const removeCue = async (cue: ShowCue) => {
    const entry = graphicByPoolId.get(cue.sourceId);
    const isLast = cues.filter((c) => c.sourceId === cue.sourceId).length === 1;
    if (isLast && entry) await takeOffAir(entry.name);
    // A server cue that is up goes off with its row, the same courtesy a graphic gets.
    if (serverCueLive(serverOnAir, playoutItemFor(cue), cue)) await playoutVerb(cue, 'out', 'Out');
    setDraft(null);
    setShows(removeShowCue(show.id, cue.id));
  };

  /** Remove a graphic and every cue prepared against it — the one gesture for getting a graphic
   *  out of the production without deleting its rows one by one. */
  const removeGraphic = async (poolId: string) => {
    const entry = graphicByPoolId.get(poolId);
    if (!entry) {
      // The same gesture over a playout item: its cues go, and whatever is up goes off first.
      const live = cues.find((c) => c.id === serverOnAir[poolId]?.cueId);
      if (live) await playoutVerb(live, 'out', 'Out');
      if (playoutItems.some((i) => i.id === poolId)) {
        setDraft(null);
        setShows(removePlayoutItem(show.id, poolId));
      }
      return;
    }
    await takeOffAir(entry.name);
    setDraft(null);
    setShows(removeShowGraphic(show.id, poolId));
  };

  /** Clear the screen — the one an operator reaches for under pressure, which is why it sits
   *  apart from the others, in the header, and a named verb a hardware panel can press
   *  (`all-out`). Every server cue this page put up goes off on the channel and layer it was
   *  taken to, so a rundown airing graphics on 1 and inserts on 2 clears both; and so does
   *  whatever plays on a slot this rundown uses that no cue here can name (below). A layer this
   *  rundown does not use is never touched, so another client's layers elsewhere on the same
   *  server stay where they are. */
  const outAll = async () => {
    // A folder's Take still being sent sends nothing more, and what of it lands after is cut too:
    // nothing airs after the panic control.
    for (const run of folderRuns.current.values()) run.stop = 'all-out';
    // Every One-by-one folder starts again from its first cue.
    setFolderSteps((m) => Object.fromEntries(Object.keys(m).map((id) => [id, null])));
    // The panic control cuts, as it always did, whatever fade out a clip is set to.
    for (const l of livePlayoutLayers) await playoutVerb(l.cue, 'out', 'All out', { cut: true });
    await outUnnamed();
    if (liveLayers.length === 0) return;
    const cleared = liveLayers.map((l) => l.graphic);
    const sent = await sendVerb(clearAllCueBatches(cleared), 'All out', true);
    if (!sent.ok) {
      setNote(sent.note);
      return;
    }
    // A graphic this page pressed again while the All out was on its way stays as that later press
    // left it (the server skipped it, protocol 2), so it is not marked off here.
    const off = cleared.filter((g) => !leftAlone(sent).includes(g));
    setLiveCue((m) => off.reduce((acc, g) => withLiveCue(acc, g, null), m));
  };
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
    statePoll.current?.wake();
    if (failed.length) setNote(`All out: ${failed.join(' ')}`);
  };

  const descriptors = editorTemplate ? fieldDescriptors(editorTemplate.fields) : [];
  /** The edited graphic's layer, and who else is on it when two graphics share it. */
  const editedLayer = poolGraphic ? graphicLayer(poolGraphic) : 0;
  const sharingLayer = poolGraphic ? clashes.get(editedLayer) : undefined;
  const layerClash = !!sharingLayer;
  const advancedOpen = layerClash || (!!poolGraphic && advancedFor === poolGraphic.id);
  const editingView = editingCue ? cueView(editingCue) : null;
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
  /** What the Bridge and its server can do, for a cue's settings: null while it is still being
   *  asked, and a studio with no Bridge set up says so rather than being asked forever. */
  const playbackAbility = bridgeStatus ?? (playoutIsConfigured ? null : { state: 'config' as const });
  /** Where a server item plays on its own, `2-10`. */
  const addressOfItem = (i: PlayoutItem) => slotAddress(itemSlot(playoutSettings, i));
  /** Where Play next goes from a server clip, by the rundown as it stands (plan §6.6). */
  const playNextFor = (cue: ShowCue | null) => {
    const item = cue ? playoutItemFor(cue) : null;
    return cue && item?.kind === 'media' ? playNextTarget(cues, playoutItems, cue.id, addressOfItem, folders) : null;
  };
  /** A graphic cue's pool graphic, for an All-together folder's refusals. */
  const graphicOfCue = (c: ShowCue) => {
    const g = graphicByPoolId.get(c.sourceId);
    return g ? { name: g.name, layer: graphicLayer(g) } : null;
  };
  /** Where a Play-through folder plays: its own slot, else layer 10 on the clip channel. */
  const folderSlotOf = (folder: ShowFolder) => slotAddress(folderSlot(playoutSettings, folder));
  const throughFolderIdOf = (cueId: string) => places.get(cueId)?.folder.id;
  const throughRoleOf = (cue: ShowCue): { folder: ShowFolder; role: ThroughRole } | null => places.get(cue.id) ?? null;
  /**
   * WHERE A TAKE OF THIS CUE - OR THIS FOLDER - LANDS on the server: one plan per slot it plays on,
   * with the cues that will hold it. A Play-through folder plays on its own slot; another folder's
   * server cues each on their own; a cue on its Play-through folder's slot when it is in one, else on
   * its own. The cues are worked out only when asked, since only the air-clash check needs them.
   */
  const takePlans = (target: ShowCue | ShowFolder): { slot: string; cueIds: () => readonly string[]; folderId?: string }[] => {
    if (!('sourceId' in target)) {
      const members = rundown.members.get(target.id) ?? [];
      if (folderMode(target) === 'through') return [{ slot: folderSlotOf(target), cueIds: () => members.map((c) => c.id), folderId: target.id }];
      return members.flatMap((c) => {
        const item = playoutItemFor(c);
        return item ? [{ slot: addressOfItem(item), cueIds: () => [c.id] }] : [];
      });
    }
    const item = playoutItemFor(target);
    if (!item) return [];
    const through = places.get(target.id)?.folder;
    if (through) {
      return [
        {
          slot: folderSlotOf(through),
          cueIds: () => {
            const run = folderRun(through, cues, playoutItems, target.id);
            return run.ok ? run.run.members.map((m) => m.cue.id) : [target.id];
          },
          folderId: through.id,
        },
      ];
    }
    return [
      {
        slot: addressOfItem(item),
        cueIds: () => {
          const chain = item.kind === 'media' && effectiveEnd(target, item) === 'next' ? sequenceMembers(cues, playoutItems, target.id, addressOfItem, folders) : null;
          return chain?.ok ? chain.members.map((m) => m.cue.id) : [target.id];
        },
      },
    ];
  };
  /**
   * WHY A TAKE OF THIS CUE - OR THIS FOLDER - WOULD NOT GO, or null (plan §6.9): a setting nobody here
   * can honour is never dropped on the way to air, a Play next whose clips cannot be found is never
   * taken as a Hold, a folder answers by how it plays, and a file this page already has up on another
   * slot is never taken onto a second. FIRST of all, nothing is taken onto the NoaCG output's own slot,
   * which would replace the output and every graphic on it - so that is the reason the operator reads.
   */
  const takeBlockerFor = (target: ShowCue | ShowFolder | null): string | null => {
    if (!target) return null;
    const plans = takePlans(target);
    for (const plan of plans) {
      const onOutput = outputSlotRefusal(plan.slot, playoutSettings);
      if (onOutput) return onOutput;
    }
    const blocked = takeBlocker(target, cues, playoutItems, addressOfItem, playbackAbility, folders, graphicOfCue);
    if (blocked) return blocked;
    for (const plan of plans) {
      const why = airClash({ slot: plan.slot, cueIds: plan.cueIds(), folderId: plan.folderId }, serverOwnership, cues, throughFolderIdOf);
      if (why) return why;
    }
    return null;
  };
  const selectedTakeBlocked = takeBlockerFor(selectedCue);
  /** A server cue cannot be taken while the Bridge says the server is not there: the editor
   *  names the hop, and the key stays quiet rather than sending a command that will fail. A setting
   *  this Bridge or server cannot honour holds up only the take itself (`playoutVerb`), never taking
   *  the cue off or staging it on PREVIEW. */
  const canTake = !!selectedCue && !(selectedCue.source === 'playout' && bridgeStatus !== null && bridgeStatus.state !== 'ok');

  // ── A FOLDER'S TAKE AND OUT (docs/CLIP_PLAYBACK_PLAN.md §6.6, phase 4): the `take` and `out` verbs
  // with a folder row held. ──
  /** Up, for SPACE and the verbs: any of it on air, or its Take still being sent. */
  const folderUp = (folderId: string) => (folderStates[folderId]?.onAir.length ?? 0) > 0 || folderRuns.current.has(folderId) || sendingFolders.has(folderId);
  const selectedFolderUp = !!selectedFolder && folderUp(selectedFolder.id);
  /** A held One-by-one header's next cue, the one its press takes. */
  const heldStepCue = heldStep?.kind === 'take' ? (cues.find((c) => c.id === heldStep.cueId) ?? null) : null;
  const bridgeDown = bridgeStatus !== null && bridgeStatus.state !== 'ok';
  /** Why a step's next cue cannot be taken, or null: its file or graphic gone, NoaCG Bridge not there
   *  for a server cue, or its own Take check. Asked before anything of the step is sent, so a press
   *  that cannot take its cue takes nothing else off either. */
  const stepBlocker = (next: ShowCue): string | null =>
    next.source === 'playout'
      ? !playoutItemFor(next)
        ? `${next.label} plays a file this production no longer lists.`
        : bridgeDown
          ? `${next.label} plays on the playout server, and NoaCG Bridge is not connected.`
          : takeBlockerFor(next)
      : !cueGraphicName(next)
        ? `${next.label} points at a graphic this production no longer has.`
        : takeBlockerFor(next);
  /** Why the held folder's press would not go: a One-by-one folder's is its next cue's. */
  const selectedFolderBlocked = !selectedFolder
    ? null
    : heldStep
      ? heldStep.kind === 'none'
        ? `Everything in ${folderName(selectedFolder)} is on air. 0 takes it off.`
        : heldStepCue
          ? stepBlocker(heldStepCue)
          : null
      : takeBlockerFor(selectedFolder);
  /** A One-by-one folder under way: a cue of it taken in this page. `0` on its header then sends it
   *  back to the top even when nothing of it is up any more. */
  const heldStarted = !!selectedFolder && typeof folderSteps[selectedFolder.id] === 'string';
  /** A folder is never previewed: SPACE takes it, or takes it off (the same decision as a cue already
   *  on PREVIEW, so `spaceAction` and the exported controller's table are untouched). */
  const folderSpace = spaceAction(spaceMode, { live: selectedFolderUp, previewed: true });
  /** Like a server cue's: a folder with a server cue in it waits while the Bridge says the server is
   *  not there. A One-by-one folder's step asks it of the cue it takes (`stepBlocker`). */
  const folderCanTake = !!heldStep || !heldMembers.some((c) => c.source === 'playout') || !bridgeDown;
  /** A One-by-one folder's TAKE face, from its step: what one press does, the cues named. */
  const stepButton = (folder: ShowFolder, step: FolderStep) => {
    const started = typeof folderSteps[folder.id] === 'string' || folderUp(folder.id);
    const words = stepFace(step, folderName(folder), (id) => cues.find((c) => c.id === id)?.label ?? 'a cue', started);
    const space: SpaceAction = words.tone === 'off' ? 'take-off' : words.tone === 'still' ? 'preview' : 'take';
    const face = { ...words, className: takeFace(space).className };
    const blocked = step.kind === 'take' ? !folderCanTake || !!selectedFolderBlocked : step.kind === 'none';
    return { face, space, disabled: blocked, title: step.kind === 'take' ? (selectedFolderBlocked ?? words.title) : words.title };
  };
  /** The TAKE button, which IS the key: with a folder held its face, state and title are the
   *  folder's, from the same decision SPACE runs. */
  const takeButton = selectedFolder
    ? heldStep
      ? stepButton(selectedFolder, heldStep)
      : {
          face: takeFace(folderSpace),
          space: folderSpace,
          disabled: folderSpace === 'take-off' ? false : !folderCanTake || !!selectedFolderBlocked,
          title:
            folderSpace === 'take-off'
              ? `Take all of ${folderName(selectedFolder)} off. SPACE does the same`
              : (selectedFolderBlocked ?? `Take ${folderName(selectedFolder)}. SPACE does the same`),
        }
    : {
        face,
        space: spaceNext,
        disabled: selectedCueIsLive ? !selectedLayerLive : !canTake || (spaceNext === 'take' && !!selectedTakeBlocked),
        title: spaceNext === 'take' && selectedTakeBlocked ? selectedTakeBlocked : face.title,
      };

  /** Run a folder's Take once at a time, and let Out and All out stop it. */
  const runFolder = async (folderId: string, work: (run: { stop: null | 'out' | 'all-out' }) => Promise<void>) => {
    const run: { stop: null | 'out' | 'all-out' } = { stop: null };
    folderRuns.current.set(folderId, run);
    setSendingFolders((set) => new Set(set).add(folderId));
    try {
      await work(run);
    } finally {
      folderRuns.current.delete(folderId);
      setSendingFolders((set) => {
        const next = new Set(set);
        next.delete(folderId);
        return next;
      });
    }
  };
  /** Take back off a member whose take landed after Out or All out stopped its folder's Take. */
  const offLate = async (m: SequenceMember | GraphicMember, cut: boolean) => {
    if ('item' in m) {
      const off = await serverVerb(m.cue, 'out', cut ? 'All out' : 'Out', cut ? { cut: true } : {});
      if (off && !off.ok) setNote(off.note);
      return;
    }
    const sent = await sendVerb([clearCueItems(m.graphic)], 'Out');
    if (!sent.ok) setNote(sent.note);
    else if (!leftAlone(sent).includes(m.graphic)) setLiveCue((lc) => withLiveCue(lc, m.graphic, null));
  };
  const takeFolder = async (folder: ShowFolder) => {
    const members = rundown.members.get(folder.id) ?? [];
    const blocked = takeBlockerFor(folder);
    if (blocked) {
      setNote(`Take was not sent: ${blocked}`);
      return;
    }
    if (folderRuns.current.has(folder.id)) return;
    flushDraft();
    await runFolder(folder.id, async (run) => {
      clearMisses(members.map((c) => c.id));
      if (folderMode(folder) === 'through') {
        const outcome = await serverVerb(members[0], 'take', `Take of ${folderName(folder)}`);
        if (!outcome) return;
        if (run.stop) {
          // Out came while the Take was on its way: what it put up goes back off.
          if (outcome.ok) for (const m of members) if (cueOnAirNow(m)) await offLate({ cue: m, item: playoutItemFor(m)! }, run.stop === 'all-out');
          return;
        }
        setNote(outcome.note);
        return;
      }
      const plan = togetherPlan(members, { items: playoutItems, addressOf: addressOfItem, graphicOf: graphicOfCue, ability: playbackAbility, blockerOf: (c) => takeBlockerFor(c) });
      if (!plan.ok) {
        setNote(`Take was not sent: ${plan.reason}`);
        return;
      }
      // The clock follows the longest file that ends: each take is stamped by its rank.
      const t0 = performance.now();
      const rank = clockRank(plan.server);
      const results: MemberResult[] = await runTogether(plan, {
        server: async (m) => (await serverVerb(m.cue, 'take', `Take of ${m.cue.label}`, { takenAt: t0 + (rank.get(m.cue.id) ?? 0) })) ?? { ok: false, note: `${m.cue.label} plays a file this production no longer lists.` },
        graphic: async (g) => (await takeGraphicCue(g.cue, `Take of ${g.cue.label}`)) ?? { ok: false, note: `${g.cue.label} points at a graphic this production no longer has.` },
        off: (m) => offLate(m, run.stop === 'all-out'),
        stopped: () => run.stop !== null,
      });
      if (run.stop) return;
      setTakeMisses((m) => ({ ...m, ...Object.fromEntries(results.filter((r) => !r.ok).map((r) => [r.cueId, r.note])) }));
      setNote(togetherNote(folderName(folder), results));
    });
  };
  /** Whether a cue is on air now, from the store as it stands and liveCue as last set. */
  const cueOnAirNow = (cue: ShowCue) =>
    cueOnAir(cue, { items: playoutItems, ownership: serverPlayout.ownership.get(), liveCue: liveCueRef.current, graphicName: cueGraphicName });
  /** Take these graphic cues' graphics off together, as one Out. The failure's sentence, or null. */
  const graphicsOff = async (graphicCues: readonly ShowCue[]): Promise<string | null> => {
    const graphics = [...new Set(graphicCues.map(cueGraphicName).filter((g): g is string => !!g))];
    if (!graphics.length) return null;
    const sent = await sendVerb(clearAllCueBatches(graphics), 'Out');
    if (!sent.ok) return sent.note;
    const off = graphics.filter((g) => !leftAlone(sent).includes(g));
    setLiveCue((m) => off.reduce((acc, g) => withLiveCue(acc, g, null), m));
    return null;
  };
  /** Out on a folder takes all of it off - each server cue with its own fade out, its graphics
   *  together - and nothing that is not in it. A Take of it still being sent stops. */
  const outFolder = async (folder: ShowFolder) => {
    const run = folderRuns.current.get(folder.id);
    if (run && !run.stop) run.stop = 'out';
    // A One-by-one folder taken off starts again from its first cue.
    setFolderSteps((m) => (m[folder.id] === null ? m : { ...m, [folder.id]: null }));
    const members = rundown.members.get(folder.id) ?? [];
    clearMisses(members.map((c) => c.id));
    const notes: string[] = [];
    for (const cue of members.filter((c) => c.source === 'playout' && cueOnAirNow(c))) {
      const off = await serverVerb(cue, 'out', `Out of ${cue.label}`);
      if (off && !off.ok) notes.push(off.note);
    }
    const graphicsFailed = await graphicsOff(members.filter((c) => c.source !== 'playout' && cueOnAirNow(c)));
    if (graphicsFailed) notes.push(graphicsFailed);
    setNote(notes.length ? `Out: ${folderName(folder)} did not take all of it off. ${notes.join(' ')}` : `✓ Out: ${folderName(folder)}`);
  };

  /** Take cues off for a step: a server template by its own Out, the graphics together. False, with
   *  the note said, when one did not go off - and then the step goes no further. */
  const stepOff = async (off: readonly ShowCue[]): Promise<boolean> => {
    for (const cue of off.filter((c) => c.source === 'playout')) {
      const out = await serverVerb(cue, 'out', `Out of ${cue.label}`);
      if (out && !out.ok) {
        setNote(out.note);
        return false;
      }
    }
    const failed = await graphicsOff(off.filter((c) => c.source !== 'playout'));
    if (failed) setNote(failed);
    return !failed;
  };
  /**
   * ONE PRESS ON A ONE-BY-ONE FOLDER (docs/CLIP_PLAYBACK_PLAN.md §20.1), decided again from the store
   * as it stands at the press: the folder's graphics that are up go off, then the next cue's own
   * Take; or, at the end, the graphics off and back to the top. A clip or audio file is never stopped.
   * Nothing at all is sent when the next cue could not be taken. Out and All out stop a press still
   * being sent, as they stop a folder's Take.
   */
  const stepFolder = async (folder: ShowFolder) => {
    if (folderRuns.current.has(folder.id)) return;
    const name = folderName(folder);
    const up = new Set((rundown.members.get(folder.id) ?? []).filter(cueOnAirNow).map((c) => c.id));
    const step = folderStep(stepMembersOf(folder.id), folderSteps[folder.id], up);
    if (step.kind === 'none') {
      setNote(`Everything in ${name} is on air. 0 takes it off.`);
      return;
    }
    const next = step.kind === 'take' ? cues.find((c) => c.id === step.cueId) : undefined;
    const blocked = next ? stepBlocker(next) : null;
    if (blocked) {
      setNote(`Take was not sent: ${blocked}`);
      return;
    }
    flushDraft();
    await runFolder(folder.id, async (run) => {
      const off = step.off.map((id) => cues.find((c) => c.id === id)).filter((c): c is ShowCue => !!c);
      if (!(await stepOff(off))) return;
      if (!next) {
        setFolderSteps((m) => ({ ...m, [folder.id]: null }));
        setNote(`✓ ${name}: back to its first cue`);
        return;
      }
      if (run.stop) return;
      await takeCue(next);
      // Out or All out came while the take was on its way: what it put up goes back off, and the
      // folder stays back at the top, where Out put it, whatever that take remembered.
      if (!run.stop) return;
      const item = playoutItemFor(next);
      if (item) {
        if (cueOnAirNow(next)) await offLate({ cue: next, item }, run.stop === 'all-out');
      } else {
        const graphic = cueGraphicName(next);
        if (graphic) await offLate({ cue: next, graphic, layer: 0 }, run.stop === 'all-out');
      }
      setFolderSteps((m) => ({ ...m, [folder.id]: null }));
    });
  };

  // ── THE RUNDOWN'S FOLDERS, as authored (plan §7). Making, moving and removing one tells the operator
  // only once the durable write has landed (components/never-report-save-storage-layer-has). ──
  /** One authoring write of the rundown, said only once it lands. True when it did. */
  const writeRundown = async (write: () => { shows: Show[]; error: string | null; refused?: string | null }, failed: string): Promise<boolean> => {
    flushDraft();
    const r = write();
    if (r.refused) {
      setRundownNote(r.refused);
      return false;
    }
    setShows(r.shows);
    const failure = r.error ?? (await commitDurableWrites());
    setRundownNote(failure ? `${failed}: ${failure}` : null);
    return !failure;
  };

  // ── EDITING THE RUNDOWN (docs/CLIP_PLAYBACK_PLAN.md §20.2): the selection's menu actions, and copy,
  // cut and paste. Nothing here airs, and none of it moves the cursor or PREVIEW. ──
  /** The production as saved once the edit being typed has landed: what a copy is made of. */
  const freshShow = () => {
    flushDraft();
    return loadShows().find((s) => s.id === show.id) ?? show;
  };
  /** The cues an edit takes: the selection, else the held folder's cues, else the cursor's cue. */
  const editIds = (): string[] =>
    range.size ? inRundownOrder(range) : selectedFolder ? heldMembers.map((c) => c.id) : selectedCue ? [selectedCue.id] : [];
  /** Where a paste lands: after the cursor's cue, joining its folder; last in a held folder; at the end. */
  const pastePlace = (): Place => (selectedFolder ? { into: selectedFolder.id } : selectedCue ? { after: selectedCue.id } : { end: true });
  /** Paste a clip at a place, one write; what landed becomes the selection. */
  const pasteAt = async (what: CueClip, place: Place, failed: string) => {
    let landed: string[] = [];
    const ok = await writeRundown(() => {
      const r = pasteInRundown(show.id, what, place);
      landed = r.cueIds;
      return r;
    }, failed);
    if (!ok) return;
    if (what.kind === 'cut') setClip(null);
    setRangeIds(landed);
    setRangeEnd(null);
  };
  const duplicateCues = async (ids: readonly string[]) => {
    const copies = copyClip(freshShow(), ids, (label) => `${label} copy`);
    const last = inRundownOrder(ids).pop();
    if (copies && last) await pasteAt(copies, { after: last }, 'The copies were not saved');
  };
  const takeOutOfFolders = async (ids: readonly string[]) => {
    await writeRundown(() => takeCuesOutOfFolders(show.id, ids), 'The move was not saved');
  };
  /** Remove several cues: each goes off air first as one removal would - a graphic whose last cue is
   *  among them, and any server cue that is up - then one write. */
  const removeCues = async (ids: readonly string[]) => {
    const gone = new Set(ids);
    const leaving = cues.filter((c) => gone.has(c.id));
    const staying = new Set(cues.filter((c) => !gone.has(c.id)).map((c) => c.sourceId));
    for (const sourceId of new Set(leaving.map((c) => c.sourceId))) {
      const entry = graphicByPoolId.get(sourceId);
      if (entry && !staying.has(sourceId)) await takeOffAir(entry.name);
    }
    for (const c of leaving) if (serverCueLive(serverOnAir, playoutItemFor(c), c)) await playoutVerb(c, 'out', 'Out');
    setDraft(null);
    setRangeIds([]);
    setShows(removeShowCues(show.id, ids));
  };
  /** The cues Ctrl+X marked, still in the rundown. */
  const cutIds = new Set(clip?.kind === 'cut' ? clip.ids : []);
  const newFolder = async (cueIds: readonly string[]) => {
    if (!cueIds.length) return;
    setRangeIds([]);
    await writeRundown(() => addFolderFromSelection(show.id, cueIds), 'The folder was not saved');
  };
  const removeFolderOf = (folderId: string) => writeRundown(() => removeFolder(show.id, folderId), 'The folder was not removed');
  const moveRundown = (what: Movable, place: Place) => writeRundown(() => moveInRundown(show.id, what, place), 'The move was not saved');
  /** Collapse or open a folder: a background write that reports nothing. */
  const toggleFolder = (folderId: string) => {
    const folder = rundown.folders.get(folderId);
    if (folder) setShows(setFolderCollapsed(show.id, folderId, folder.collapsed !== true));
  };

  // The number fields the ± LIVE NUMBERS block bumps: operator-visible `number` fields that no
  // ⚡ event carries as payload. A payload field (the spotlight index, a focused row) is set by
  // its own action — a second road to it would air a value without the state that gives it
  // meaning. Derived from the template alone, like everything else here: any graphic with a
  // number field gets the block, and no category is ever consulted.
  const eventPayloadKeys = new Set(events.flatMap((e) => e.payload ?? []));
  const liveNumberFields = descriptors.filter((d) => d.kind === 'number' && !eventPayloadKeys.has(d.key));

  /** Rows the edited cue can load (D3's binding) — the SHARED matcher, `control/cueData.ts`,
   *  so the hosted control page offers exactly the rows this page does. Live here (a dataset
   *  edited a second ago is loadable); published for the hosted page. */
  const dataRows = cueDataRows(descriptors, show.datasets ?? []);
  const hasSides = hasSideFields(descriptors);
  /** The editor's BANDS (control/cueFieldGroups.ts): one per side on a two-sided board, one for
   *  everything both sides share, and a single unlabelled band - today's flat flow - on every
   *  graphic the rule is not confident about. */
  const fieldGroups = groupCueFields(descriptors);
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
  /** What a band HEADING reads, resolved the way the field boxes under it resolve: the live tree
   *  for a bound field, then the cue's own value, then the authored default. */
  const headingValues = Object.fromEntries(
    descriptors.map((d) => [
      d.key,
      (boundFields(selectedGraphic)[d.key] ? resolved[selectedGraphic ?? '']?.[d.key] : undefined) ??
        editingView?.values[d.key] ??
        d.defaultValue ??
        '',
    ]),
  );
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
  const machineState = selectedGraphic ? machineStates[selectedGraphic] ?? null : null;
  const stateLabel = formatMachineState(stateNames, machineState);
  /** Would » Next move the selected layer? False on a graphic's last step (a quiz on its
   *  Reveal), where the press used to do nothing on air while the log still wrote "Next step". */
  const nextMoves =
    (!!selectedGraphic && canAdvance(poolMachines.get(selectedGraphic)?.js ?? '', machineState)) ||
    (selectedPlayoutLive && selectedPlayoutItem?.kind === 'template');
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
  const writeArrange = (graphic: string, entries: Record<string, ArrangeEntry>) => {
    const profile = withGraphicArrange(show.profile, graphic, entries);
    // The LAST arrangement cleared removes the key rather than storing an empty profile, so "no
    // profile" stays one state: a production that never had one and one whose every arrangement
    // was cleared are byte-identical, and every surface downstream recognises a single "none".
    profileWritten(Object.keys(profile.arrange).length === 0 ? deleteShowProfile(id) : setShowProfile(id, profile));
  };
  /** Every graphic's arrangement at once, including one for a graphic no longer in the pool,
   *  which no block can reach any more. The profile key goes, as it does for the last reset. */
  const clearAllArrangements = () => profileWritten(deleteShowProfile(id));

  // Grouped and ordered by the SHARED helper (controlModel `arrangeControls`), so the hosted
  // page's ⚡ block, the exported controller's and this one can never sort the author's sections
  // or this production's arrangement differently. With no profile it is the generated panel,
  // byte for byte as it was before ARRANGE existed.
  const arranged = arrangeControls(events, arrangeFor(show.profile, selectedGraphic));
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

  /** The data that belongs to AIR: the cue live on the selected layer, draft included when it
   *  is also the one being edited. Events and snaps act on the live graphic, so their values
   *  must come from ITS cue — sourcing them from the previewed cue would air unprepared
   *  content the operator never took (staged data airs only on an explicit take). */
  const airValues = (): Record<string, string> => (airCue ? cueView(airCue).values : {});

  /** Fire a machine event on the live graphic. Payload values ride from the ON-AIR cue, and
   *  land only if the machine accepts the event (the structural guard). An `adjust` field (a
   *  goal's +1 on that side's score) rides moved by its delta from what AIR shows - the same
   *  base the ± live-number bump counts from - and the new figure is mirrored into the on-air
   *  cue, so the cue and the air cannot drift apart and ⟳ Take / ✎ Update never regress it. */
  const fireEvent = async (button: ControlButton) => {
    if (!selectedGraphic || !selectedLayerLive) return;
    flushDraft();
    const values = airValues();
    const bound = boundFields(selectedGraphic);
    // A press that would move a SHARED value waits for the tree, and the EVENT waits with it: a
    // graphic playing its goal animation while the figure the production follows stayed put is
    // worse than a press that plainly did not happen.
    if (movedKeys(button).some((key) => bound[key]) && !boundPressReady()) return;
    // A field the press MOVES counts from what AIR shows (a goal's +1, a Reveal letter's list);
    // a field it only READS (the guess, the number to call) is the cue's own value. A BOUND
    // field is neither: it reads from the production tree, because that is the one figure every
    // graphic bound to the path is showing (plan §2.7).
    const moved = new Set(movedKeys(button));
    const { payload, fields: adjusted, tree } = pressSend(button, bound, (key) =>
      bound[key]
        ? resolvedRef.current[selectedGraphic]?.[key] ?? (moved.has(key) && button.adjust && key in button.adjust ? '0' : undefined)
        : moved.has(key)
          ? (airedData[selectedGraphic]?.[key] ?? values[key] ?? (button.adjust && key in button.adjust ? '0' : ''))
          : values[key],
    );
    if (Object.keys(adjusted).length > 0 && airCue) {
      // Into the draft when the on-air cue is the one being edited (its box repaints at once),
      // straight into the record otherwise - either way the cue holds the figure air shows.
      if (editingIsLive) editDraft({ values: adjusted });
      else setShows(updateShowCue(id, airCue.id, { values: { ...airCue.values, ...adjusted } }));
    }
    const msg = payload
      ? { t: 'event' as const, event: button.event, payload }
      : { t: 'event' as const, event: button.event };
    // THE SHARED VALUE MOVES ONLY IF THE EVENT WENT. The tree write is a separate row by
    // construction — it reaches graphics this event never touched — so nothing but this order
    // keeps the two in step, and a press that failed on the way to the log must not leave every
    // other bound graphic showing a figure this one never took.
    const sent = await runVerb([[{ graphic: selectedGraphic, msg }]], `Event ${button.event}`);
    if (sent && !leftAlone(sent).includes(selectedGraphic)) await patchBoundValues(tree);
  };

  /** Snap the live graphic straight to a state — recovery, never an animation. A null group
   *  resets EVERY group to its initial. Recovery is BOTH halves (docs/STATE_MACHINE_SCHEMA.md:
   *  reset is two operations), so the snap rides with an update of the ON-AIR cue's values:
   *  the snap replays intermediate states with suppressed callbacks, and it is the trailing
   *  data write that lets their call-painted looks (a quiz's selection under a lock) repaint
   *  from the fields. */
  const snapTo = async (groupId: string | null, stateId: string) => {
    if (!selectedGraphic || !selectedLayerLive) return;
    flushDraft();
    const snap = groupId === null ? null : { [groupId]: stateId };
    await runVerb(
      [
        [
          { graphic: selectedGraphic, msg: { t: 'snap' as const, snap } },
          { graphic: selectedGraphic, msg: { t: 'update' as const, data: airValues() } },
        ],
      ],
      'Snap',
    );
  };

  /** One ⚡ button. Written once because the block draws the same button in three places now —
   *  pinned above the fold, inside its section, and under the collapsed "More" — and three copies
   *  of a tooltip this careful would drift apart by the second edit. The DECLARATION decides
   *  everything the press does; the arrangement decides only the word and where it sits.
   *
   *  `section` is the heading DRAWN over this button, and only the middle of those three places
   *  has one. It names the button in the hover (`controlName`), so five presses all labelled
   *  "+1" are told apart by the word the operator can already see above them. */
  const actionButton = ({ button: b, label }: ArrangedControl, section?: string) => {
    const legal = isEventLegal(legality, b.event, machineState);
    const name = controlName(label, section);
    // Empty when everything the press moves is a hidden holder, which is the reported-field
    // pattern: the hint then falls through to the payload. The delta is dropped when the BUTTON
    // already carries it, so a "+1" press reads "moves Points 3 with it" rather than saying one
    // twice.
    const moved = adjustWords(b, (key) => descriptors.find((d) => d.key === key)?.label, {
      delta: !labelCarriesDelta(b, label),
    });
    return (
      <button
        key={b.event}
        className={`pd-action${b.destructive ? ' destructive' : ''}`}
        disabled={!selectedLayerLive || !legal}
        title={
          !selectedLayerLive
            ? 'The graphic is not on air. Take the cue first.'
            : !legal
              ? illegalEventTitle(label)
              : moved
                ? // An adjust press moves a figure WITH the event (a goal's +1), counted from
                  // what air shows; a `set` press puts one back to a declared figure (a reset);
                  // an `add` press puts a line on a list - the hint says which, and to what.
                  `Fires ${name} on the live graphic and moves ${moved} with it.`
                : b.payload?.length
                  ? // The payload in the OPERATOR'S words, not as `f7`. This is what makes an
                    // action self-explanatory: the acceptance pass could not tell what "Show
                    // audience result" would do, and the answer is "it shows the Audience results
                    // field, which you type above" — a field id says none of that.
                    `Fires ${name} on the live graphic, carrying this cue's ${b.payload
                      .map((key) => descriptors.find((d) => d.key === key)?.label ?? key)
                      .join(', ')}.`
                  : `Fires ${name} on the live graphic.`
        }
        onClick={() => void fireEvent(b)}
        data-testid={`cue-action-${b.event}`}
      >
        ⚡ {label}
      </button>
    );
  };

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
    if (key === 'all-out') {
      if (!press?.repeat) void outAll();
      return;
    }
    // A hardware panel's per-row keys (docs/work-specs/hardware-panel-control/spec.md D4), with the
    // row in `press.cue`. Select moves the cursor there and airs nothing: a folder row holds the
    // folder. Take airs that cue whatever the SPACE mode, or takes it off when it is the one on air,
    // and leaves the cursor where the operator put it.
    if (key === 'select-cue') {
      // The drawn row: the cue's own, its collapsed folder's header, or the header pressed.
      const shown = press?.cue ? rundown.rows.find((r) => r.id === (rundown.rowOf.get(press.cue!) ?? press.cue)) : undefined;
      if (!shown) return;
      if (shown.kind === 'folder' && shown.id === press!.cue) selectFolder(shown.folder.id, shown.id);
      else selectCue(press!.cue!);
      revealCue(rowTestId(shown));
      return;
    }
    if (key === 'take-cue') {
      const cue = press?.repeat ? undefined : cues.find((c) => c.id === press?.cue);
      if (!cue) return;
      if (cueOnAirNow(cue)) void stepOff([cue]);
      else if (!stepBlocker(cue)) void takeCue(cue);
      return;
    }
    // Editing the rundown (docs/CLIP_PLAYBACK_PLAN.md §20.2). Nothing here airs.
    if (key === 'copy' || key === 'cut') {
      const ids = editIds();
      const taken = key === 'copy' ? copyClip(freshShow(), ids) : ids.length ? cutClip(show.id, ids) : null;
      if (!taken) return;
      setClip(taken);
      const n = clipSize(taken);
      const what = `${n} cue${n === 1 ? '' : 's'}`;
      setNote(key === 'copy' ? `✓ ${what} copied. Ctrl+V pastes after the selected row.` : `✓ ${what} cut. Ctrl+V moves them after the selected row; Esc leaves them where they are.`);
      return;
    }
    if (key === 'paste') {
      if (clip) void pasteAt(clip, pastePlace(), 'The paste was not saved');
      return;
    }
    if (key === 'select-clear') {
      if (clip?.kind === 'cut') setClip(null);
      setRangeIds([]);
      setRangeEnd(null);
      return;
    }
    if (key === 'extend-prev' || key === 'extend-next') {
      const from = range.size && rangeEnd && rundown.rows.some((r) => r.id === rangeEnd) ? rangeEnd : cursorRow;
      const next = stepSelection(rundown.rows, from, key === 'extend-next' ? 1 : -1);
      if (!next) return;
      setRangeIds(rangeCueIds(rundown, cursorRow, next.id));
      setRangeEnd(next.id);
      revealCue(rowTestId(next));
      return;
    }
    // A rundown's folders. New folder takes the range, or the cue the cursor is on.
    if (key === 'folder-new') {
      void newFolder(range.size ? [...range] : selectedCue && !selectedCue.folderId ? [selectedCue.id] : []);
      return;
    }
    if (key === 'folder-toggle') {
      const row = cursorRow ? rundown.rows.find((r) => r.id === cursorRow) : undefined;
      const folderId = row?.kind === 'folder' ? row.folder.id : row?.kind === 'cue' ? row.folderId : undefined;
      if (folderId) toggleFolder(folderId);
      return;
    }
    // A HELD FOLDER ROW: SPACE, TAKE and Out act on the folder, and the cue verbs have nothing to act
    // on. A held key fires once: a folder's Take is several actions, never ten a second.
    if (selectedFolder && ['take', 'retake', 'update', 'next', 'out', 'pause', 'resume'].includes(key)) {
      if (press?.repeat) return;
      if (key === 'take') {
        // One by one steps: each press takes the next cue (docs/CLIP_PLAYBACK_PLAN.md §20.1).
        if (heldStep) void stepFolder(selectedFolder);
        else if (folderSpace === 'take-off') void outFolder(selectedFolder);
        else if (!folderCanTake) return;
        else if (selectedFolderBlocked) setNote(`Take was not sent: ${selectedFolderBlocked}`);
        else void takeFolder(selectedFolder);
      }
      if (key === 'out' && (selectedFolderUp || heldStarted)) void outFolder(selectedFolder);
      return;
    }
    // Staging REPLACES what was on PREVIEW; a replaced cue that is on air stays on air, because
    // PREVIEW is a check and never a tally. Editing follows the selection, so no draft moves.
    // A cue taken off lands on PREVIEW in both modes: in 'take' mode the id is never read.
    if (key === 'take' && canTake && selectedCue) {
      if (spaceNext === 'take-off') {
        void outLive();
        setStagedCueId(selectedCue.id);
      } else if (spaceNext === 'preview') setStagedCueId(selectedCue.id);
      else void takeCue(selectedCue);
    }
    // Re-take: play a live cue's entrance again from the start. Only meaningful on a cue
    // that IS live - on anything else it would just be Take under a second name.
    if (key === 'retake' && selectedCueIsLive && selectedCue) void takeCue(selectedCue);
    if (key === 'update' && editingIsLive) void updateLive();
    if (key === 'next' && selectedLayerLive && nextMoves) void nextLive();
    if (key === 'out' && selectedLayerLive) void outLive();
    // A server clip's transport. Only the cue this page has up on the server: nothing to pause
    // anywhere else, and a panel or a key pressing it on another cue must not reach the slot.
    if ((key === 'pause' || key === 'resume') && selectedCue && selectedClipUp) {
      void playoutVerb(selectedCue, key, key === 'pause' ? 'Pause' : 'Resume');
    }
    // P: pause the clip on air, or resume it - the selected cue's when it is the one up, else the
    // one the clip clock follows (control/serverState.ts `pauseTarget`). Read from the store at the
    // press, not from a render, since the page does not follow a clip's timing.
    // A panel's key names the clip its clock follows (protocol.md §7.3), and that clip is the one it
    // pauses, as the key showed it; P names none and goes by the selection.
    if (key === 'pause-toggle') {
      const target = pauseTarget(serverPlayout.ownership.get(), serverPlayout.timing.get(), playoutItems, press?.cue || (selectedCue?.id ?? null));
      const cue = target ? cues.find((c) => c.id === target.cueId) : undefined;
      if (target && cue) void playoutVerb(cue, target.paused ? 'resume' : 'pause', target.paused ? 'Resume' : 'Pause');
    }
    // Walk the rundown. Selecting a cue is the same act as clicking it - in 'take' mode it
    // goes to PREVIEW and in the other mode it does not, and nothing airs either way - so an
    // operator can line the next item up and take it without touching the mouse.
    // The walk goes over the rows as drawn: a folder's header is a stop, and a collapsed folder's
    // cues are not.
    if (key === 'select-prev' || key === 'select-next') {
      const next = stepSelection(rundown.rows, cursorRow, key === 'select-next' ? 1 : -1);
      if (!next) return;
      if (next.kind === 'cue') selectCue(next.cue.id);
      else selectFolder(next.folder.id, next.id);
      revealCue(rowTestId(next));
    }
  };

  // A folder's Take still being sent counts: All out is what stops it before any of it lands.
  const allOutEnabled = liveLayers.length > 0 || livePlayoutLayers.length > 0 || sendingFolders.size > 0 || unnamedSlots(serverOwnership).size > 0;

  // What a panel's keys show (protocol.md §8), from the same values the verb bar greys with. Read
  // only while the page answers a panel, at each publish and each press.
  /** Which cues' own Take would be refused, worked out once per render: a timing reading publishes
   *  between renders, and only the clock can have moved then. */
  let takeRefused: Set<string> | null = null;
  panel.feed(
    () => {
      const live = new Set(cues.filter(cueOnAirNow).map((c) => c.id));
      takeRefused ??= new Set(cues.filter((c) => !!stepBlocker(c)).map((c) => c.id));
      const refused = takeRefused;
      // The clip the clock follows: what the panel counts down, and what its pause-toggle key names.
      const clip = panelClipNow(serverPlayout, playoutItems, cues);
      return {
        title: show.name,
        // The row the verbs act on: a held folder's header, else the selected cue itself, even while
        // its folder is collapsed, since the panel's rows list a collapsed folder's cues.
        selected: selectedFolder ? cursorRow : (selectedCue?.id ?? null),
        space: selectedFolder || selectedCue ? takeButton.space : null,
        live: [...live],
        allowed: {
          // onVerb's Take of a cue also waits for `canTake` (a server cue while the Bridge is down).
          take: !takeButton.disabled && (!!selectedFolder || canTake),
          retake: selectedCueIsLive,
          update: editingIsLive,
          next: selectedLayerLive && nextMoves,
          out: selectedFolder ? selectedFolderUp || heldStarted : selectedLayerLive,
          'select-prev': rundown.rows.length > 0,
          'select-next': rundown.rows.length > 0,
          pause: selectedClipUp,
          resume: selectedClipUp,
          'pause-toggle': clip !== null,
          'all-out': allOutEnabled,
        },
        // A cue's own Take key is refused when its Take would not go; taking one off air never is.
        blocked: [
          ...rundown.rows.filter((r) => r.kind === 'folder').map((r) => r.id),
          ...cues.filter((c) => !live.has(c.id) && refused.has(c.id)).map((c) => c.id),
        ],
        clip,
        bridge: !playoutIsConfigured ? 'off' : bridgeDown ? 'down' : 'ok',
        rows: panelRows,
      };
    },
    // A key that names a row or a clip carries it as `cue`; the verbs that act on the selection never read it.
    (verb, target) => onVerb(verb, { repeat: false, cue: target || undefined }),
    // A refused press is a note in the activity feed, not a command row: nothing was sent.
    (text) => setWireLog((l) => appendLogEntries(l, [noteEntry((localLogId.current -= 1), text)])),
  );

  /** LIVE ACTIONS FIRST (docs/research/control-surfaces-review-2026-10-02 slice 4; owner,
   *  2026-10-02: "live actions before setup"). A graphic that declares ⚡ actions is OPERATED
   *  through them - a scorebug's clock and goals, a quiz's beats - so they sit straight under the
   *  monitors, and the setup fields come after them and can fold away. A graphic with no actions
   *  keeps the order it always had, because its fields are the whole panel. */
  const liveFirst = events.length > 0 && !!selectedGraphic;
  const fieldsFolded = liveFirst && !!poolGraphic && foldedFields.has(poolGraphic.id) && !layerClash;
  /** What a folded setup bar reads back: the words and figures the cue is set to, resolved the way
   *  the boxes resolve them (a bound field from the tree). Colours and pictures say nothing as
   *  text, so they stay out of it. */
  const setupSummary = fieldsFolded
    ? descriptors
        .filter((d) => d.kind !== 'color' && d.kind !== 'image')
        .map((d) => String(headingValues[d.key] ?? '').trim())
        .filter(Boolean)
        .join(' · ')
    : '';
  const readOnlyProfile = profileRead.status === 'read-only';
  const arranging = !!selectedGraphic && arrangingFor === selectedGraphic;
  const liveBlock = selectedGraphic && (
    <>
      {/* GRAPHIC ACTIONS - the machine's own verbs, rendered from the metadata that travels
          inside the template (docs/CONTROL_LAYER.md; docs/PLAYOUT_DASHBOARD.md §8). Its own
          frame, never the editor's: the fields edit a CUE and air on ⟳ Take / ✎ Update, while
          these act on the LIVE graphic the moment they are pressed, so they follow Update's
          legality and say so in their own header. */}
      {events.length > 0 && (
        <div className={`pd-actions${arranging ? ' arranging' : ''}`} data-testid="cue-actions">
          <div className="pd-actions-head">
            <span className="pd-actions-kicker">
              ⚡ GRAPHIC ACTIONS <b className="pd-actions-air">act on air</b>
            </span>
            <span
              className="pd-state-chip"
              data-testid="machine-state-chip"
              // The tooltip says what the chip is FOR; the full state is in it because a
              // multi-group graphic's label is longer than the chip, which truncates.
              title={
                selectedLayerLive && stateLabel
                  ? `Where the live graphic is now: ${stateLabel}. Greyed actions are judged against this.`
                  : 'Where the live graphic is now. Greyed actions are judged against this.'
              }
            >
              {!selectedLayerLive ? 'not on air' : stateLabel ?? 'no state reported yet'}
            </span>
            {/* ARRANGE, on the buttons themselves (home/ActionArranger). The separate Controls
                panel it replaced was a second block about this one, under it. */}
            <button
              type="button"
              className={`pd-arrange-toggle${arranging ? ' on' : ''}`}
              aria-pressed={arranging}
              disabled={readOnlyProfile && !arranging}
              title={
                readOnlyProfile
                  ? 'This production’s control profile was written by a newer build, so it is read-only here.'
                  : arranging
                    ? 'Back to operating: the buttons fire again'
                    : 'Pin, hide or rename these actions for this production. Nothing fires while arranging.'
              }
              onClick={() => setArrangingFor(arranging ? null : selectedGraphic)}
              data-testid="cue-actions-arrange"
            >
              {arranging ? 'Done' : 'Arrange'}
            </button>
          </div>
          {arranging ? (
            <ActionArranger
              // Keyed on the graphic: a half-typed rename must not carry to another graphic's
              // control of the same id.
              key={selectedGraphic}
              graphic={selectedGraphic}
              buttons={events}
              profile={renderProfile}
              onArrange={(entries) => writeArrange(selectedGraphic, entries)}
              onClearAll={clearAllArrangements}
            />
          ) : (
            <>
              {/* One line of inline help: a control the user has to leave the surface to
                  understand is a control they will not use (acceptance pass, 2026-08-06). */}
              <p className="hint pd-actions-help" data-testid="cue-actions-help">
                These fire the graphic’s own beats on the layer that is on air, immediately, with
                the on-air cue’s values.
              </p>
              {/* PINNED, at the top and above the section headings: the handful this show
                  actually presses. Unsectioned on purpose. */}
              {arranged.pinned.length > 0 && (
                <div className="pd-actions-row pd-actions-pinned" data-testid="cue-actions-pinned">
                  {arranged.pinned.map((c) => actionButton(c))}
                </div>
              )}
              {arranged.sections.map(([section, controls]) => {
                // ONE expression decides both whether the heading is drawn and whether the hover
                // borrows it, so a hover can never name a word that is not on screen.
                const heading = arranged.sections.length > 1 || section !== 'Actions' ? section : undefined;
                return (
                  <div key={section} className="pd-actions-section">
                    {heading && <h4>{heading}</h4>}
                    <div className="pd-actions-row">{controls.map((c) => actionButton(c, heading))}</div>
                  </div>
                );
              })}
              {/* HIDDEN, behind one disclosure. A production hiding a control is saying "not in
                  my way", which is not "gone": the machine still accepts it, and an operator who
                  needs it mid-show reaches it here. */}
              {arranged.more.length > 0 && (
                <details className="pd-actions-more" data-testid="cue-actions-more">
                  <summary>More ({arranged.more.length})</summary>
                  <div className="pd-actions-row">{arranged.more.map((c) => actionButton(c))}</div>
                </details>
              )}
              {/* RECOVERY, folded closed at the foot of the block: the snap is not how a graphic
                  is driven, and a list of every internal state does not belong among the presses
                  of the show (docs/research/control-surfaces-review-2026-10-02 slice 4). */}
              {stateGroups.length > 0 && (
                <details className="pd-actions-more pd-actions-recovery" data-testid="cue-actions-recovery">
                  <summary>Recovery</summary>
                  <p className="hint pd-actions-help">
                    Jumps the live graphic straight to a state with no animation and re-sends the
                    on-air cue’s values. For when air and this page are out of step (a renderer
                    restart, a missed press).
                  </p>
                  <select
                    className="pd-snap"
                    value=""
                    disabled={!selectedLayerLive}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === '::reset') void snapTo(null, '');
                      else {
                        const i = v.indexOf(':');
                        void snapTo(v.slice(0, i), v.slice(i + 1));
                      }
                    }}
                    title="RECOVERY. Jumps the live graphic straight to a state with no animation."
                    data-testid="machine-snap"
                  >
                    <option value="">Snap to state…</option>
                    <option value="::reset">⟲ Back to start (visual reset)</option>
                    {stateGroups.map((g) =>
                      g.states.map((s) => (
                        <option key={`${g.id}:${s.id}`} value={`${g.id}:${s.id}`}>
                          {stateGroups.length > 1 ? `${g.id}: ${s.name}` : s.name}
                        </option>
                      )),
                    )}
                  </select>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* LIVE NUMBERS - one press changes a figure on the live graphic (a score, a goal total,
          a stock count): a partial update carrying just the bumped field, mirrored into the cue
          so the two never drift. Derived from the template's own `number` fields. */}
      {liveNumberFields.length > 0 && (
        <div className="pd-actions pd-live-numbers" data-testid="live-numbers">
          <div className="pd-actions-head">
            <span className="pd-actions-kicker">
              ± LIVE NUMBERS <b className="pd-actions-air">act on air</b>
            </span>
          </div>
          <p className="hint pd-actions-help">
            One press changes the figure on the live graphic and keeps this cue in step, with no ✎
            Update needed. Typing a value in the cue&rsquo;s fields still stages it for ✎ Update
            instead.
          </p>
          <div className="pd-actions-row">
            {liveNumberFields.map((d) => {
              const disabled = !selectedLayerLive || !editingIsLive;
              const title = !selectedLayerLive
                ? 'The graphic is not on air. Take the cue first.'
                : !editingIsLive
                  ? 'Another cue is on air. Select the live cue to bump its numbers.'
                  : `Changes "${d.label}" on air immediately`;
              return (
                <span key={d.key} className="pd-live-number" data-testid={`live-number-${d.key}`}>
                  <span className="pd-live-number-label">{d.label}</span>
                  <button disabled={disabled} title={title} onClick={() => void bumpLive(d.key, -1)} data-testid={`live-number-${d.key}-down`}>
                    −
                  </button>
                  <button disabled={disabled} title={title} onClick={() => void bumpLive(d.key, 1)} data-testid={`live-number-${d.key}-up`}>
                    +
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  /** THE ONE PLAYOUT STATUS (control/playoutStatus.ts): whether this production can air, worst
   *  first, from what this page already knows - published or not, changed since, the Bridge and the
   *  server, what the output's slot holds, and READY's reading of the outputs. */
  const started = !!hostedSlug;
  const publishedLabel = versionLabel(publishedVer);
  const readySummary = readiness.summary.show ? readiness.summary : null;
  const playoutStatus = describePlayoutStatus({
    started,
    unpublished: unpublishedChanges,
    version: publishedLabel,
    bridge: playoutIsConfigured ? (bridgeStatus ?? { state: 'pending', detail: '' }) : null,
    slot: outputSlot && { where: slotAddress(slotOf(playoutSettings)), channel: playoutSettings.channel, ...outputSlot },
    ready: readySummary,
  });

  return (
    <ProductionShell
      show={show}
      now={now}
      openedAt={openedAt}
      status={
        <>
          <PlayoutStatusControl
            status={playoutStatus}
            started={started}
            version={publishedLabel}
            open={statusOpen}
            onToggle={() => setStatusOpen((o) => !o)}
            onClose={() => setStatusOpen(false)}
            ready={readySummary}
          >
            {/* Started only: offline, outputs remembered from an earlier publish would read as
                "not answering" under a grey Offline. */}
            {hostedSlug && readiness.outputs.length > 0 && (
              <PlayoutPanelSection title="Outputs" testId="playout-panel-outputs">
                <ReadyOutputList outputs={readiness.outputs} why={readiness.summary.why} onForget={forgetOutput} />
              </PlayoutPanelSection>
            )}
            <PlayoutPanelSection title="Actions" testId="playout-panel-actions">
              {hostedSlug ? (
                <PublishActions
                  busy={busy}
                  unpublishedChanges={unpublishedChanges}
                  outputUrl={outputUrl}
                  airNeeded={outputSlot?.holds === 'empty' || outputSlot?.holds === 'other'}
                  onPublish={() => void publish()}
                  onUnpublish={() => void unpublish()}
                  onAirChanged={() => setSlotRev((n) => n + 1)}
                />
              ) : (
                <p className="pd-ready-empty" data-testid="playout-panel-start-hint">
                  Press ▶ Start production beside the status to go live. Until then a Take plays only on this page.
                </p>
              )}
              {hostedSlug && (
                <PrepareForLive
                  flow={prepareFlow}
                  published={publishedVer}
                  unpublishedChanges={unpublishedChanges}
                  // This desk's own, or a newer one another production page announced.
                  stamp={readiness.newestStamp}
                />
              )}
              {playoutIsConfigured && (
                <div className="row pd-panel-check">
                  <button onClick={() => setCheckAgainRev((n) => n + 1)} data-testid="playout-check-again">
                    Check again
                  </button>
                  <span className="muted">Asks NoaCG Bridge, CasparCG and the output&rsquo;s layer again.</span>
                </div>
              )}
            </PlayoutPanelSection>
            {/* SETUP, folded once it works (owner, 2026-10-01): the studio's server, channels and
                the NoaCG output's slot, edited in the Playout settings dialog. Folded while a
                configured Bridge is answering OR being asked again, so Check again does not open
                and shut it; open when nothing is set up or the Bridge or server fails. */}
            <PlayoutPanelSection
              title="Setup"
              testId="playout-panel-setup"
              folded={playoutIsConfigured && (bridgeStatus === null || bridgeStatus.state === 'ok')}
            >
              <p className="pd-ready-empty" data-testid="playout-setup-summary">
                {playoutIsConfigured
                  ? `CasparCG ${playoutSettings.host}:${playoutSettings.amcpPort} · NoaCG output ${slotAddress(slotOf(playoutSettings))} · ${playoutSettings.channels.length} channel${playoutSettings.channels.length === 1 ? '' : 's'}`
                  : 'No CasparCG set up. Pair NoaCG Bridge to play on CasparCG, or use the output URL in OBS or vMix.'}
              </p>
              <button onClick={() => setPlayoutSettingsOpen(true)} data-testid="playout-settings-open">
                {playoutIsConfigured ? 'Server and channels…' : 'Set up CasparCG…'}
              </button>
            </PlayoutPanelSection>
            {hostedSlug && (
              <PlayoutPanelSection title="Links" testId="playout-panel-links">
                <ProductionLinkRows
                  busy={busy}
                  outputUrl={outputUrl}
                  controlUrl={controlUrl}
                  joinUrl={joinUrl}
                  presenterUrl={presenterUrl}
                  nameDraft={nameDraft}
                  nameNote={nameNote}
                  onNameDraft={(v) => { setNameDraft(v); setNameNote(null); }}
                  onClaimName={() => void claimName()}
                  copied={copied}
                  onCopy={copy}
                  embedFileName={outputEmbedFileName(show.name)}
                  onDownloadEmbed={downloadEmbed}
                />
              </PlayoutPanelSection>
            )}
          </PlayoutStatusControl>
          {!hostedSlug && (
            <StartProductionButton
              busy={busy}
              backendConfigured={backendConfigured}
              hasCues={cues.length > 0}
              needsSignIn={needsSignIn}
              onPublish={() => void publish()}
            />
          )}
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
      allOutEnabled={allOutEnabled}
      panel={
        <>
          <PanelButton answer={panel} onClick={() => setPanelOpen(true)} />
          {panelOpen && <PanelDialog slug={hostedSlug} answer={panel} onClose={() => setPanelOpen(false)} />}
        </>
      }
      onExport={() => setExportOpen(true)}
      onKey={onVerb}
      renders={renders.current}
      sub={sub ?? null}
      onTab={() => navigate({ view: 'production', id: show.id })}
    >
      {sub === 'data' && (
        <ProductionDataWorkspace
          show={show}
          setShows={setShows}
          liveData={liveData}
          setLiveData={setLiveData}
          resolved={resolved}
          dataKey={dataKey ?? null}
        />
      )}
      {sub === 'audience' && <ProductionAudienceWorkspace show={show} setShows={setShows} />}
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
        <div className="pd-stagehead">
        <PlayoutMonitors
          // Server media goes through NoaCG Bridge whether or not the production is started, so
          // with a clip up the monitor is showing air even offline (studio-day-playout D16).
          live={started || livePlayoutLayers.length > 0}
          stage={stage}
          previewDoc={previewDoc}
          previewTemplate={previewTemplate}
          previewLabel={
            previewCue
              ? selectedFolder && spaceMode === 'take'
                ? `${cueView(previewCue).label} · ${heldStep ? 'next' : 'first'} in ${folderName(selectedFolder)}`
                : cueView(previewCue).label
              : spaceMode === 'preview-then-take'
                ? PREVIEW_EMPTY_LABEL
                : selectedFolder
                  ? folderName(selectedFolder)
                  : 'nothing selected'
          }
          settleData={settleData}
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
          onState={noteMachineState}
          onReady={restoreProgram}
          onOverflow={notePreviewOverflow}
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
            className={takeButton.face.className}
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
            disabled={!selectedCueIsLive}
            onClick={() => selectedCue && void takeCue(selectedCue)}
            title="Re-take: play this cue’s entrance again from the start"
            data-testid="verb-retake"
          >
            ⟳ Re-take <kbd>R</kbd>
          </button>
          <button
            className={`pd-verb pd-verb-update${hasUnsent ? ' pd-unsent' : ''}`}
            disabled={!editingIsLive}
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
            disabled={!selectedLayerLive || !nextMoves}
            onClick={() => void nextLive()}
            title={
              !selectedGraphic
                ? 'Advance the layer'
                : selectedLayerLive && !nextMoves
                  ? `${selectedGraphic} is on its last step - Out takes it off, Re-take starts it again`
                  : nextLabel
                    ? `Advance ${selectedGraphic} to its next step: ${nextLabel}`
                    : `Advance ${selectedGraphic} to its next step`
            }
            data-testid="verb-next"
          >
            <span className="pd-verb-main">» Next <kbd>N</kbd></span>
            {nextLabel && (
              <span className="pd-verb-target" data-testid="verb-next-target">
                {nextLabel}
              </span>
            )}
          </button>
          <button
            className="pd-verb"
            disabled={selectedFolder ? !selectedFolderUp && !heldStarted : !selectedLayerLive}
            onClick={() => onVerb('out')}
            title={
              selectedFolder
                ? `Take all of ${folderName(selectedFolder)} off. Nothing outside it moves.`
                : selectedGraphic
                  ? `Play ${selectedGraphic} off. The other layers stay up.`
                  : 'Play this layer off'
            }
            data-testid="verb-out"
          >
            {/* SPACE belongs to the toggle above, and only there. This button is about the
                selected LAYER, which is not always the selected cue's. */}
            ■ Out <kbd>0</kbd>
          </button>
          {/* The bar's small print, as ONE block: the on-air chip and, under it, THE OPERATOR'S
              CHOICE of what SPACE does (owner, 2026-09-10: "a checkbox for this so the operator
              can choose for themselves") - here beside the key, not on a settings screen. One
              container so the two stack at the bar's end below 1366px instead of the checkbox
              wrapping alone to the far left. */}
          <span className="pd-verb-aside">
            {/* What is up, graphics and server cues alike: a clip on the playout server is on air
                too, and "nothing on air" beside its running clock would be the one untrue line. */}
            <span className="pd-onair-line" data-testid="live-cue-chip">
              {liveLayers.length === 0 && livePlayoutLayers.length === 0 ? (
                <span className="muted">○ nothing on air</span>
              ) : (
                <>
                  on air:{' '}
                  <span className="pd-onair">● {[...liveLayers, ...livePlayoutLayers].map((l) => l.label).join(' · ')}</span>
                </>
              )}
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

        {/* A held folder row: its panel (home/FolderEditor), where a cue's editor would be. */}
        {selectedFolder &&
          (() => {
            const slot = folderSlot(playoutSettings, selectedFolder);
            const id = selectedFolder.id;
            return (
              <FolderEditor
                key={id}
                folder={selectedFolder}
                members={heldMembers}
                items={playoutItems}
                air={folderStates[id]}
                missed={heldMembers.filter((c) => c.id in takeMisses).length}
                ability={playbackAbility}
                playoutSettings={playoutSettings}
                slot={{ channel: slot.channel, layer: slot.layer, set: selectedFolder.slot?.channel !== undefined || selectedFolder.slot?.layer !== undefined }}
                hasServerCue={cues.some((c) => c.source === 'playout')}
                takeBlocked={selectedFolderBlocked}
                addressOf={(c) => {
                  const item = playoutItemFor(c);
                  const g = graphicByPoolId.get(c.sourceId);
                  return item ? addressOfItem(item) : g ? `L${graphicLayer(g)}` : '';
                }}
                onRename={(name) => setShows(renameFolder(show.id, id, name))}
                onMode={(mode) => {
                  const r = setFolderMode(show.id, id, mode);
                  if (r.error) return r.error;
                  setShows(r.shows);
                  return null;
                }}
                onEnd={(end) => setShows(setFolderPlayback(show.id, id, { end }))}
                onSlot={(patch) => setShows(setFolderPlayback(show.id, id, patch))}
              />
            );
          })()}

        {liveFirst && liveBlock}

        {/* The editor. It edits the PREVIEW cue by default and says so; the switch points it at
            the cue already on air on that layer, where ✎ Update pushes edits live. */}
        {editingCue && editingView && poolGraphic && (
          <div className={`pd-editor${editingIsLive ? ' live' : ''}`} data-testid="cue-editor">
            <div className="pd-editor-head">
              {/* The cue's POSITION, not just its state. Two cues of the same graphic carry the
                  same name and the same tally, so "EDITING ON-AIR CUE" over an editable title
                  named them both identically — the operator's own report, 2026-09-05. The number
                  is the one thing that is unique per row and is already what the rundown shows. */}
              {/* "PREVIEW CUE" only while the cue IS on PREVIEW: in 'preview-then-take' mode
                  the editor follows the cursor, which walks on ahead of the monitor. */}
              <span className="pd-editor-kicker">
                EDITING {editingIsLive ? 'ON-AIR CUE' : selectedCueStaged ? 'PREVIEW CUE' : 'SELECTED CUE'}
                {editingCueNo > 0 ? ` · ${editingCueNo}` : ''}
              </span>
              {/* The cue's own title, editable HERE: mislabelling "Guest lower third" as "Host"
                  is a live-show mistake and must be fixable without leaving the surface. */}
              <input
                className="pd-cue-title"
                value={editingView.label}
                onChange={(e) => editDraft({ label: e.target.value })}
                aria-label="Cue name"
                data-testid="cue-label"
              />
              <span
                className={hasUnsent ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
                data-testid="cue-unsent"
              >
                {hasUnsent
                  ? keptStates
                    ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet. ✎ Update keeps ${keptStates} on air, ⟳ Re-take starts over with these values`
                    : `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet. Press ✎ Update`
                  : editingIsLive
                    ? 'changes push live on ✎ Update'
                    : 'changes air on ⟳ Take'}
              </span>
              <CueOverflowNote keys={overflowKeys} descriptors={descriptors} />
              {/* Phone only (the bottom bar carries TAKE/Next/Out): Update belongs beside the
                  line that names it rather than hidden from the operator entirely. */}
              {editingIsLive && (
                <button className="pd-editor-update" onClick={() => void updateLive()} data-testid="editor-update">
                  ✎ Update
                </button>
              )}
              <div className="spacer" />
              {airCue && airCue.id !== selectedCue?.id && (
                <button
                  className="pd-editor-switch"
                  onClick={() => setEditTarget((t) => (t === 'preview' ? 'air' : 'preview'))}
                  data-testid="cue-editor-switch"
                >
                  {editTarget === 'preview' ? 'switch to on-air cue ▾' : 'switch to preview cue ▾'}
                </button>
              )}
            </div>

            {/* THE SETUP FOLD, offered only under live actions: a scorebug's team names and a
                quiz's words are set before the cue airs, and once they are the operator works
                from the ⚡ block above. Folded, the bar reads back what is set, so nothing is out
                of sight that the operator cannot check at a glance; the unsent line and the
                too-long warning stay in the head above it. A layer clash keeps it open: that
                repair must never sit behind a closed fold. */}
            {liveFirst && !layerClash && (
              <button
                type="button"
                className="pd-fields-fold"
                aria-expanded={!fieldsFolded}
                aria-controls="pd-setup-fields"
                onClick={() =>
                  setFoldedFields((s) => {
                    const next = new Set(s);
                    if (next.has(poolGraphic.id)) next.delete(poolGraphic.id);
                    else next.add(poolGraphic.id);
                    return next;
                  })
                }
                title={fieldsFolded ? 'Show the setup fields' : 'Fold the setup fields away under the live actions'}
                data-testid="cue-fields-fold"
              >
                <span className="pd-advanced-caret" aria-hidden="true">{fieldsFolded ? '▸' : '▾'}</span>
                Setup fields
                {fieldsFolded && (
                  <span className="pd-fields-fold-sum" data-testid="cue-fields-summary">
                    {setupSummary}
                  </span>
                )}
              </button>
            )}

            {!fieldsFolded && (
            <div id="pd-setup-fields">
            <div className="pd-fields">
              {/* LOAD A DATA ROW (the Data workspace's other half): a table whose column names
                  match this graphic's field titles offers its rows here. Loading fills the
                  EDITED CUE's draft — data prepares, only Take (or ✎ Update, deliberately)
                  airs. Unmatched columns are skipped; untouched fields keep their values. */}
              {loadableRows.length > 0 && (
                <label className="pd-field pd-field-load">
                  <span>
                    Load data row
                    {/* THE SIDE PICKER. Only a board with A/B fields shows it, and it says
                        which side the next load fills — one row is one team, so without it a
                        teams table can only ever describe half the graphic. */}
                    {hasSides && (
                      <span className="pd-side-pick" data-testid="cue-load-side">
                        {(['A', 'B'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={loadSide === s ? 'active' : ''}
                            onClick={() => setLoadSide(s)}
                            title={`Load the picked row into side ${s}`}
                            data-testid={`cue-load-side-${s}`}
                          >
                            {s}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  <div className="row">
                    <select className="grow" value="" onChange={(e) => loadRow(e.target.value)} data-testid="cue-load-row">
                      <option value="">Pick a row from the production's data…</option>
                      {loadableRows.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    {/* The running-order gesture: next question, next name — one press. Loads
                        the row AFTER the one this cue last loaded (the first, before any). */}
                    <button
                      onClick={() => {
                        const next = nextRow(dataRows, loadSide, editingCue ? lastLoaded[editingCue.id] ?? null : null);
                        if (next) loadRow(next.id);
                      }}
                      disabled={
                        !editingCue ||
                        !nextRow(dataRows, loadSide, lastLoaded[editingCue.id] ?? null)
                      }
                      title="Load the next row of the table into this cue. Nothing airs until a Take."
                      data-testid="cue-load-next"
                    >
                      Load next row
                    </button>
                  </div>
                </label>
              )}
              {/* THE BANDS. One per side on a two-sided board, headed by the operator's own
                  word for that side; one unlabelled band - today's flat flow - on everything
                  else. The grouping is derived, never authored (control/cueFieldGroups.ts). */}
              {fieldGroups.map((group) => {
                // WHAT THE OPERATOR IS LOOKING AT, in the same order the field boxes resolve it:
                // a bound field shows the live tree's value, an unset one its authored default.
                // Reading `editingView.values` alone would head a band "Side A" while the box
                // under it plainly said HOME.
                const heading = groupHeading(group, headingValues);
                return (
                  <div
                    className={`pd-band${heading ? '' : ' pd-band-plain'}`}
                    key={group.id}
                    data-testid={`cue-band-${group.id}`}
                  >
                    {heading && (
                      <span className="pd-band-label" data-testid={`cue-band-label-${group.id}`}>
                        {heading}
                      </span>
                    )}
                    <div className="pd-band-fields">
                      {group.keys.map((key) => {
                        const d = descriptorByKey.get(key);
                        if (!d) return null;
                        // A BOUND field is not a cue value (plan §2.7): it takes the live tree's
                        // value at Take, at ✎ Update and in the preview, so an editable box here
                        // would show a number nothing will ever air. It reads out instead,
                        // wearing its path — the one override gesture is Unbind, on the Data tab.
                        const path = boundFields(selectedGraphic)[d.key];
                        if (path) {
                          // Built on `.field-row`/`.field-meta` - FieldRow's OWN structure -
                          // rather than on a hand-rolled label. The cue fields lay out in a grid,
                          // so a row of a different height sits its input a few pixels off its
                          // neighbour's; matching the real structure makes them line up by
                          // construction instead of by a number kept in step here.
                          return (
                            <div className="field-row pd-field-bound" key={d.key} data-testid={`cue-bound-${d.key}`}>
                              <div className="field-meta">
                                <label style={{ margin: 0 }}>
                                  {d.key.toUpperCase()} · {d.label}
                                </label>
                                <span className="pd-bound-mark" title={`Bound to production data: ${path}`}>
                                  🔗 {path}
                                </span>
                              </div>
                              <input value={resolved[selectedGraphic ?? '']?.[d.key] ?? ''} placeholder="not set yet" readOnly tabIndex={-1} />
                            </div>
                          );
                        }
                        return (
                          <FieldRow
                            key={d.key}
                            descriptor={{ ...d, label: `${d.key.toUpperCase()} · ${d.label}` }}
                            value={String(editingView.values[d.key] ?? d.defaultValue ?? '')}
                            onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                            overflow={overflowSet.has(d.key)}
                            testIdPrefix="cue-field"
                            images={cueImages}
                            imageHint={
                              poolGraphic.type === 'picture'
                                ? 'Pictures come from this production. Add more with ＋ Add pictures.'
                                : "Pictures come from the graphic itself. Add one in the editor's Assets tab."
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CUE SETTINGS, under a rule and not in the content grid. The note is the cue's; it is
                not something the graphic SHOWS, and flowing it in beside the content fields is
                what left settings alone on a second row looking like a field nobody finished
                (owner, 2026-08-21). */}
            <div className="pd-cue-meta" data-testid="cue-meta">
              <label className="pd-field pd-field-note">
                <span>Operator note</span>
                <input
                  value={editingView.note}
                  placeholder="e.g. after the intro"
                  onChange={(e) => editDraft({ note: e.target.value })}
                  data-testid="cue-note"
                />
              </label>
            </div>

            {/* ADVANCED: the graphic's PLAYOUT LAYER (docs/CLIP_PLAYBACK_PLAN.md §6.5). Closed by
                default with the number in its summary, because most productions never change it
                (§5 counts from 20, distinct by construction). WHEN IT CLASHES it is open and
                cannot be closed: two graphics on one layer replace each other on air, so the
                repair must never be one click away behind a closed disclosure. The rundown's
                clash badge lands here too (`openLayerRepair`). */}
            <div className={`pd-advanced${layerClash ? ' clash' : ''}`} data-testid="cue-advanced">
              <button
                type="button"
                className="pd-advanced-toggle"
                aria-expanded={advancedOpen}
                aria-controls="pd-advanced-graphic"
                disabled={layerClash}
                onClick={() => setAdvancedFor(advancedOpen ? null : poolGraphic.id)}
                title={layerClash ? 'Open while the layer is shared: two graphics on one layer replace each other on air' : undefined}
                data-testid="cue-advanced-toggle"
              >
                <span className="pd-advanced-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
                Advanced
                <span className="pd-advanced-sum" data-testid="cue-advanced-summary">
                  Layer {editedLayer}
                  {layerClash ? ' · shared' : ''}
                </span>
              </button>
              {advancedOpen && (
                <div className="pd-advanced-body" id="pd-advanced-graphic">
                  <label className="pd-field pd-field-layer">
                    <span>Playout layer</span>
                    <input
                      type="number"
                      min={MIN_PLAYOUT_LAYER}
                      max={MAX_PLAYOUT_LAYER}
                      value={editedLayer}
                      onChange={(e) => setShows(setShowGraphicLayer(show.id, poolGraphic.id, Number(e.target.value)))}
                      data-testid="graphic-layer"
                    />
                  </label>
                  {sharingLayer && (
                    <p className="status-warn pd-layer-clash" data-testid="layer-clash">
                      {nameList(sharingLayer.map((g) => g.name))} share layer {editedLayer}. On air
                      they replace each other.
                      <button
                        ref={clashFix}
                        onClick={() => setShows(setShowGraphicLayer(show.id, poolGraphic.id, nextFreeLayer(show.graphics)))}
                        data-testid="layer-clash-fix"
                      >
                        Move to layer {nextFreeLayer(show.graphics)}
                      </button>
                    </p>
                  )}
                </div>
              )}
            </div>
            </div>
            )}
          </div>
        )}

        {/* A cue over the PLAYOUT SERVER'S OWN LIBRARY: its editor (home/ServerCueEditor). */}
        {editingCue && editingView && selectedPlayoutItem && (
          <ServerCueEditor
            key={editingCue.id}
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
        )}

        {!liveFirst && liveBlock}

        <ActionLog entries={wireLog} published={!!hostedSlug && backendConfigured} />
        </div>
      </section>

      <CueRundown
        show={show}
        cues={cues}
        rundown={rundown}
        graphicByPoolId={graphicByPoolId}
        library={library}
        playoutSettings={playoutSettings}
        liveCue={liveCue}
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
        stepNext={stepNext}
        rundownNote={rundownNote}
        clashes={clashes}
        offstage={!!sub}
        cueView={cueView}
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
        flushDraft={flushDraft}
        setShows={setShows}
      />
      </>)}
      {exportOpen && <ProductionExportDialog show={show} onClose={() => setExportOpen(false)} />}
      {playoutSettingsOpen && (
        <PlayoutSettingsDialog
          outputUrl={outputUrl}
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

/** The shell: header + the two-column body, plus the keyboard verbs. Split out so the page body
 *  above reads as the surface it is rather than as chrome wrapped around a surface. */
function ProductionShell({
  show,
  now,
  openedAt,
  status,
  liveLayers,
  follow,
  resolveWaiting,
  sub,
  onTab,
  onHome,
  onBack,
  onAllOut,
  allOutEnabled,
  panel,
  onExport,
  onKey,
  renders,
  children,
}: {
  show: Show;
  now: number;
  openedAt: number;
  /** The one playout status and its panel (home/PlayoutStatusControl.tsx), plus ▶ Start
   *  production while the production is offline. */
  status: React.ReactNode;
  liveLayers: { layer: number }[];
  follow: ControlFollowStatus | null;
  /** The follow's resolve is failing and being retried - the server is not answering. */
  resolveWaiting?: boolean;
  sub: ProductionSub | null;
  /** Back to Playout IN THIS TAB. The workspaces are links now, never calls into here. */
  onTab: () => void;
  onHome: () => void;
  onBack: () => void;
  onAllOut: () => void;
  /** Whether anything is up to clear - the graphics on the log, or a server cue through the
   *  Bridge, which `liveLayers` does not count. */
  allOutEnabled?: boolean;
  /** The hardware panel door and its dialog (control/PanelControl.tsx). */
  panel?: React.ReactNode;
  onExport: () => void;
  onKey: (key: PlayoutVerb, press?: VerbPress) => void;
  /** The page's render count, for the spec that proves a clip's clock does not re-render it. */
  renders?: number;
  children: React.ReactNode;
}) {
  // The verb keys (docs/PLAYOUT_DASHBOARD.md §2) come from the SHARED keymap, so the hosted
  // control page cannot drift away from this one again — see components/playoutKeys.ts.
  //
  // ONLY WHILE PLAYOUT IS THE SURFACE ON SCREEN. This shell renders on Data and Audience too,
  // with the playout column hidden behind them, so bound-while-mounted meant SPACE ran Take
  // from a screen showing neither monitor. The hosted page has no workspaces and passes nothing.
  usePlayoutVerbKeys(onKey, sub === null);
  const teamsAvailable = useTeamsAvailable();
  const openShare = useTeamsUi((s) => s.openShare);
  const openTeam = useTeamsUi((s) => s.openTeam);
  const teamState = useTeamState();
  // A TEAM production says so in the header: its team's chip (the door to the team), who saved
  // it last, and whether this tab's own edit has reached the server yet (TEAMS_PLAN §6).
  const team = show.teamId ? teamState.teams.find((t) => t.id === show.teamId) ?? null : null;
  const head = teamState.heads[show.id];
  const saving = teamState.saving[show.id];
  const teamNote = teamState.notes[show.id];
  const edited = team && head ? `edited by ${teamMemberName(team.id, head.updatedBy)}, ${editedWhen(head.updatedAt)}` : '';
  // THE RUNDOWN'S WIDTH (home/RailResizer): the grid's second column and the handle on its edge
  // both read `--pd-rail-w`, so the two can never disagree about where the divider is.
  const body = useRef<HTMLElement>(null);
  const rail = useRailWidth(body);

  return (
    <div className="app playout-dashboard" data-testid="production-page" data-renders={renders}>
      <header className="pd-header">
        <a className="brand brand-home" href="/" title="NoaCG Studio front page">
          <BrandLogo size={22} />
        </a>
        {/* BACK AND HOME, two separate promises (owner, 2026-09-23). Back returns to wherever
            you came from - the dashboard, the list, the graphic being made - and falls back to
            the list only when this page was opened cold. Home always goes to the dashboard. Both are labelled
            words rather than a bare arrow, so neither is mistaken for the other, and Home is
            the word alone like every Home door (src/components/AGENTS.md). The logo before them
            is the site root, as on every surface, so Home is the word and not the logo. */}
        <button className="pd-back" onClick={onBack} title="Back to where you came from" data-testid="production-back">
          ← Back
        </button>
        <button className="pd-home" onClick={onHome} title="Your NoaCG home" data-testid="production-home">
          Home
        </button>
        {/* The wizard door, in the SHARED LEFT ORDER every shell uses (owner walk, 2026-08-29:
            "it should be in the same place on every page") - logo, Home, ＋ New graphic, so it
            is the first thing after Home rather than adrift in the right cluster, where the
            owner found it. It is the SAME door as the rail's "＋ New graphic for this
            production…" - both carry this production, so a graphic made from here joins the
            show you are standing in. Keeping it left also puts the width of the whole header
            between it and ■ All out: a hand reaching for the panic control must never land on
            navigation. */}
        <NewGraphicButton productionId={show.id} />
        <h1 title={show.name}><IconTv /> <span className="pd-name">{show.name}</span></h1>
        {/* THE ONE PLAYOUT STATUS, beside the production's name where its state has always been
            read (docs/work-specs/studio-day-playout AC-7, AC-8; owner, 2026-10-01): a colour and
            a short text, worst first, and a press opens the Playout panel with the checks behind
            it, the actions, the setup and the links. It replaced the SHOW / NOT PUBLISHED chip,
            the Output links button, the READY line and the CasparCG dot, which each knew a part.
            Its width is fixed, so a state that changes during a show never moves the tabs beside
            it. Offline, ▶ Start production follows it: the one action an offline production has. */}
        {status}
        {/* `pd-roomy`: shown only while the header has room (playout-dashboard.css, the laptop
            tier). The production's name outranks a session timer. */}
        <span className="pd-clock mono pd-roomy">{elapsed(now - openedAt)}</span>
        {/* NOT JOINED, AND ONLY THEN. A healthy production says nothing new here: the line
            appears when the log's channel has never joined, which is the state that used to
            be invisible. Commands do still arrive - the durable road polls every 30 s - so
            this says SLOW rather than broken, and it is deliberately not an error colour. */}
        {/* THE SERVER IS NOT ANSWERING. The follow cannot start without the resolve, so this is
            said instead of nothing, and it goes away by itself when the server answers. */}
        {resolveWaiting ? (
          <span
            className="pd-mode pd-mode-idle"
            data-testid="production-follow"
            title="The server is not answering, so this page cannot follow the production yet. It keeps asking and follows it as soon as the server answers."
          >
            ○ server not answering, retrying
          </span>
        ) : follow && !follow.everJoined && (
          <span
            className="pd-mode pd-mode-idle"
            data-testid="production-follow"
            title={`The live connection has not joined (last status: ${follow.status || 'none'}). Commands still arrive on the slower road, about every 30 seconds.`}
          >
            ○ not joined, polling
          </span>
        )}
        {/* The workspaces (docs/INTERACTIVE_PLAYOUT_PLAN.md D6): Playout is the operating
            surface, Data the production's own tables. One shared record underneath — a row
            typed on the Data tab is loadable into a cue the moment you switch back.

            THEY OPEN IN THEIR OWN BROWSER TAB, so Playout never leaves the screen. Owner,
            2026-08-21: "the buttons that we have and the side pages we have feel a bit
            dangerous to swap between. I think the playout should always be open." Data and
            Audience are AUTHORING surfaces, and authoring while the thing you are steering is
            off-screen is how a live mistake happens.
            This needed the durable store's CROSS-TAB INVALIDATION first (model/durableStore.ts):
            two tabs on one production used to overwrite each other, so shipping this before that
            would have made the losing path the default rather than an unlucky one.
            They are real routes with real history, so these are real links - middle-click and
            Ctrl-click start working, which they never did as buttons. The one already open is a
            plain marker rather than a link to itself, and Playout stays a button because it
            returns IN THIS TAB, where the monitors already are. */}
        <nav className="pd-tabs" aria-label="Production workspaces">
          <button className={sub === null ? 'on' : undefined} onClick={onTab} data-testid="tab-playout">
            Playout
          </button>
          {(['data', 'audience'] as const).map((tab) => {
            const label = tab === 'data' ? 'Data' : 'Audience';
            return sub === tab ? (
              <span key={tab} className="on" aria-current="page" data-testid={`tab-${tab}`}>
                {label}
              </span>
            ) : (
              <a
                key={tab}
                href={routeHash({ view: 'production', id: show.id, sub: tab })}
                target="_blank"
                rel="noopener"
                title={`Open ${label} in a new tab. This one keeps Playout on screen.`}
                data-testid={`tab-${tab}`}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <div className="spacer" />
        {/* THE TEAM DOOR (docs/TEAMS_PLAN.md §6) comes FIRST in the right cluster, because it is
            the one control here whose width changes with who is signed in, whether the production
            is a team's, and every save. The cluster is right-aligned, so whatever sits left of a
            control never moves it: Playout, Export… and ■ All out keep their places in every one
            of those states (owner, 2026-10-01: operators build muscle memory). It is absent
            offline and signed out - `useTeamsAvailable` is the one gate, and this surface asks it
            rather than testing the auth state itself. A team production's door is its team, in
            the Share button's place: the name gives way to the people icon under 1440px exactly
            as Share's word does, and "edited by" rides the tooltip. Saving… and Not saved are
            never hidden - they are the two states an operator must not miss. */}
        {teamsAvailable && team && (
          <button
            className="pd-team"
            onClick={() => openTeam(team.id)}
            title={`In team “${team.name}”${edited ? ` · ${edited}` : ''} - see its members and join code`}
            aria-label={`Team ${team.name}`}
            data-testid="production-team"
          >
            <IconUsers />
            <span className="pd-team-name">{team.name}</span>
            <span className={`pd-team-save${saving ? ` ${saving}` : ''}`} data-testid="production-team-save">
              {saving === 'pending' ? 'Saving…' : saving === 'failed' ? 'Not saved' : edited}
            </span>
          </button>
        )}
        {teamsAvailable && !show.teamId && (
          <button
            onClick={() => openShare(show.id, show.name)}
            title="Share this production with a team, so everyone works on it from their own account"
            aria-label="Share"
            data-testid="share-with-team"
          >
            <IconUsers /> <span className="pd-share-label">Share</span>
          </button>
        )}
        {/* THE PANEL DOOR (docs/work-specs/hardware-panel-control/), where the Playout settings door
            stood: answer a Stream Deck through Companion from this page, pair one, revoke one. Its
            words change width with its state, so it sits left of Export and ■ All out, which keep
            their places. */}
        {panel}
        <button
          onClick={onExport}
          title="Export this production as a package"
          aria-label="Export…"
          data-testid="export-production"
        >
          <IconDownload /> <span className="pd-roomy">Export…</span>
        </button>
        <button
          className="pd-allout"
          disabled={!(allOutEnabled ?? liveLayers.length > 0)}
          onClick={onAllOut}
          title="Play every live layer off and clear the frame"
          data-testid="verb-out-all"
        >
          ■ All out
        </button>
      </header>
      {/* A teammate's save changed this production under the operator, or a save failed. Said
          once, in words, and dismissable - never silent (TEAMS_PLAN §3). */}
      {teamNote && (
        <div className="pd-team-note" role="status" data-testid="production-team-note">
          <span>{teamNote}</span>
          <div className="spacer" />
          <button onClick={() => dismissTeamNote(show.id)}>OK</button>
        </div>
      )}
      <main className="pd-body" ref={body} style={{ '--pd-rail-w': `${rail.width}px` } as React.CSSProperties}>
        {children}
        {/* Only beside the playout surface: Data and Audience take the whole body and have no
            rundown to resize. The phone hides it, where the rundown is a row of the one column. */}
        {sub === null && <RailResizer {...rail} />}
      </main>
    </div>
  );
}
