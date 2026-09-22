import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  moveShowCue,
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
  addPlayoutItem,
  playoutItemOf,
  removePlayoutItem,
  setPlayoutItemFields,
  setPlayoutItemLayer,
  type PlayoutItem,
  type Show,
  type ShowCue,
} from '../../model/shows';
import {
  act,
  loadPlayoutSettings,
  playoutConfigured,
  slotAddress,
  slotOf,
  subscribeTargetStatus,
  type PlayoutResult,
} from '../../control/playoutLink';
import type { PlayoutAction } from '../../control/playoutProtocol';
import { graphicKindLabel, type Resolution } from '../../model/types';
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
} from '../playoutKeys';
import { SpaceModeToggle } from '../SpaceModeToggle';
import { PREVIEW_EMPTY_LABEL } from '../../control/spaceMode';
import { cueDataRows, hasSideFields, nextRow, rowsForSide } from '../../control/cueData';
import { groupCueFields, groupHeading } from '../../control/cueFieldGroups';
import {
  emptyProfile,
  readPublishedProfile,
  readShowProfile,
  withGraphicArrange,
  type ArrangeEntry,
  type CombinedControl,
} from '../../model/profile';
import {
  askSteps,
  combineBlocked,
  CombineScheduler,
  planCombine,
  stepWords,
  type CombineNow,
  type StepGroup,
  type StepNames,
} from '../../control/combine';
import { commandBatches, resolveCombineSend, type CombineWorld } from '../../control/combineSend';
import CombinedButton from '../control/CombinedButton';
import ProductionControlsPanel, { type CombineTarget } from './ProductionControlsPanel';
import ProductionDataWorkspace from './ProductionDataWorkspace';
import ProductionAudienceWorkspace from './ProductionAudienceWorkspace';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import {
  adjustWords,
  adjustedValue,
  arrangeControls,
  arrangeFor,
  eventButtons,
  canAdvance,
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
  outputPageUrl,
  publishControlShow,
  sendControlVerb,
  takeCueItems,
  unpublishControlShow,
  verbAired,
  withLiveCue,
  type ControlEventRow,
  type ControlFollowStatus,
  type ControlSendItem,
  type LiveCueMap,
  type ResolvedControlShow,
} from '../../control/hostedControl';
import { createAppliedOnce } from '../../control/commandRoads';
import { appendLogEntries, describeLogRow, eventLogLabel, type LogEntry } from '../../control/eventLog';
import {
  clockRowEffect,
  clockSpecFromHtml,
  clockValueAfterUpdate,
  fastEventGraphics,
  speakingClockRowEffect,
  speakingClocksFromHtml,
  type ClockSpec,
  type SpeakingClockPair,
} from '../../control/matchClockWire';
import ProgramStage, { type ProgramStageHandle } from './ProgramStage';
import { composeDocument } from '../../preview/composeDocument';
import { postPreviewCmd, PREVIEW_STATE_TYPE, type PreviewStateMessage } from '../../preview/previewProtocol';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import { useAuthUi } from '../auth/authUi';
import ActionLog from './ActionLog';
import CueOverflowNote, { cueOverflowKeys } from './CueOverflowNote';
import ProductionExportDialog from './ProductionExportDialog';
import ProductionLinks from './ProductionLinks';
import PlayoutItemPicker from './PlayoutItemPicker';
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
import LibMenu from './LibMenu';
import { copyLink } from './copyLink';
import { IconDownload, IconTv, IconUsers } from '../icons';
import { useTeamsUi } from '../teams/teamsUi';
import { useTeamsAvailable } from '../teams/useTeamsAvailable';

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

/** "A, B and C" — a warning an operator reads under pressure has to be a sentence. */
function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
export default function ProductionPage({ id, sub }: { id: string; sub?: ProductionSub | null }) {
  const navigate = useRouter((s) => s.navigate);
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
  const { needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);

  const [note, setNote] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
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
  const [linksOpen, setLinksOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | 'join' | 'presenter' | null>(null);
  /** The readable audience name being typed, and what the database said about the last claim. */
  const [nameDraft, setNameDraft] = useState('');
  const [nameNote, setNameNote] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  /**
   * THE CUE ON PREVIEW in the 'preview-then-take' SPACE mode (docs/PLAYOUT_DASHBOARD.md §2,
   * "Two Space modes"). In 'take' mode the selection IS the preview and this is unused; in the
   * other mode the selection is only a cursor and SPACE is what puts a cue here. Page state,
   * never stored: PREVIEW is a check of what is about to air, and a check does not survive a
   * reload.
   */
  const [stagedCueId, setStagedCueId] = useState<string | null>(null);
  const [spaceMode, setSpaceMode] = useSpaceMode();
  const [addPick, setAddPick] = useState('');
  /** The hidden file input behind "＋ Add pictures…". */
  const pictureInput = useRef<HTMLInputElement>(null);
  const [menuCueId, setMenuCueId] = useState<string | null>(null);
  /** Which removal in the open row menu is ARMED (`cue` / `graphic`). A cue holds values somebody
   *  typed and there is no undo behind the rundown, so a removal that also takes uploaded
   *  pictures or a whole graphic's rows asks twice — the same two-step Home's delete uses. */
  const [armedRemove, setArmedRemove] = useState<'cue' | 'graphic' | null>(null);
  /** Which cue the editor is pointed at: the one on PREVIEW (the default — edits air on Take),
   *  or the one already ON AIR on that layer, where ✎ Update pushes edits live (§2). */
  const [editTarget, setEditTarget] = useState<'preview' | 'air'>('preview');
  /** Per cue, the last data row loaded into it (`datasetId:rowId`) — what ↷ Next advances from. */
  const [lastLoaded, setLastLoaded] = useState<Record<string, string>>({});
  /** Which side of a two-team board the next data-row load fills. */
  const [loadSide, setLoadSide] = useState<'A' | 'B'>('A');

  // ── Live status: the renderer heartbeat + which cue is on air ON EACH LAYER. Several
  // graphics are up at once by design, so this is a map keyed by graphic name. ──
  const [liveCue, setLiveCueState] = useState<LiveCueMap>({});
  /** What this page believes is up on the PLAYOUT SERVER, by playout item id -> cue id
   *  (docs/BRIDGE.md §5). Page state, like the log-free half of `liveCue` before publishing:
   *  a server cue is one command through NoaCG Bridge, and nothing reports back what the
   *  server holds - so the row says ON AIR from the moment the command was accepted, and a
   *  refused one never marks it. */
  const [livePlayout, setLivePlayout] = useState<Record<string, string>>({});
  /** The Bridge's last word on the playout server, polled while this production has server
   *  cues: what the editor shows beside a server cue, and what disables its Take. */
  const [bridgeStatus, setBridgeStatus] = useState<PlayoutResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // ── COMBINED CONTROLS, the surface's half (src/control/combine.ts, plan §6b) ──
  /** Which `ask` ticks the operator has moved, by `<control id>\0<step index>`. A step the
   *  operator has not touched reads its DECLARED default, so an absence here is not "off". */
  const [combineTicks, setCombineTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  /** Bumped whenever a run arms, fires or is cancelled, and by the countdown's own interval.
   *  The scheduler holds no React, so this is how a wait repaints. */
  const [combineTick, setCombineTick] = useState(0);
  const schedulerRef = useRef<CombineScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new CombineScheduler({ onChange: () => setCombineTick((t) => t + 1) });
  }
  const scheduler = schedulerRef.current;
  /** How a fired group reaches the wire, REASSIGNED on every render. A group can fire seconds
   *  after the press, and a closure captured at press time would send against the production as
   *  it was — the same staleness `airedRef` and `cuesRef` below exist for. */
  const fireCombineRef = useRef<(control: CombinedControl, due: StepGroup[]) => void>(() => {});
  // A tab that goes away takes its waits with it. That is §6d's accounting rather than a leak
  // being tidied: the wait lives in the surface that pressed, and nothing is retried elsewhere.
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  // `combineTick` is the dependency that matters: the scheduler is a mutable object, so the only
  // thing that says "its runs changed" is the counter its own `onChange` bumps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anyArmed = useMemo(() => scheduler.armed().length > 0, [scheduler, combineTick]);
  useEffect(() => {
    if (!anyArmed) return;
    // Four times a second, which is what makes a whole-second countdown land on the second it
    // means rather than up to a second late.
    const t = setInterval(() => setCombineTick((v) => v + 1), 250);
    return () => clearInterval(t);
  }, [anyArmed]);

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
        // 'staged' is another operator typing and 'live' is the renderer REPORTING - neither is
        // a command and the stage has no meaning for either.
        else if (msg.t !== 'staged' && msg.t !== 'live') {
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
  const graphicByPoolId = useMemo(() => new Map((show?.graphics ?? []).map((g) => [g.id, g] as const)), [show]);
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  /** What the PREVIEW monitor shows: the selection in 'take' mode, the staged cue otherwise -
   *  and nothing at all in that mode until SPACE has put something there. A staged cue that
   *  has since been deleted reads as nothing rather than as a dangling id. */
  const previewCue =
    spaceMode === 'take' ? selectedCue : (cues.find((c) => c.id === stagedCueId) ?? null);
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
  // The server's state is re-asked every few seconds while there is a server cue to take -
  // one loopback request, so the editor can say "connected" or name the hop before a press.
  useEffect(() => {
    const settings = loadPlayoutSettings();
    if (playoutItems.length === 0 || !playoutConfigured(settings)) {
      setBridgeStatus(null);
      return;
    }
    return subscribeTargetStatus(settings, setBridgeStatus);
  }, [playoutItems.length]);

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
      // Read BEFORE the await: if a verb moves the live map while this round trip is in
      // flight, the answer below is older than the screen and must not overwrite it.
      const movesAtRequest = liveCueMoves.current;
      const resolved = await controlShowBySlug(hostedSlug);
      if (!alive || !resolved) return;
      setOutputSeenAt(resolved.outputSeenAt);
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
        // Reported on every status change AND on every poll tick, so this stays true rather
        // than recording only the first answer.
        onStatus: (s) => {
          if (alive) setFollow(s);
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
  const previewIframe = useRef<HTMLIFrameElement>(null);
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
  const settlePreview = useCallback((data: string) => {
    postPreviewCmd(previewIframe.current?.contentWindow, { cmd: 'settle', data });
  }, []);
  useEffect(() => {
    if (!previewDoc || !settleData) return;
    const t = setTimeout(() => settlePreview(settleData), 150);
    return () => clearTimeout(t);
  }, [previewDoc, settleData, settlePreview]);
  /**
   * WHICH OF THE VALUES BEING TYPED DO NOT FIT — the warn half of the owner's fit ruling
   * (docs/SVG_IMPORT_PLAN.md §3). The graphic on PREVIEW has already settled with exactly the
   * values a Take would air, so asking IT is asking the only thing that knows: whether the copy
   * fits is a measurement of the rendered artwork, not a property of the string.
   *
   * Same request/reply round trip the machine state uses, for the same reason — this iframe
   * carries no `allow-same-origin`, so nothing here can read the document directly. It is
   * polled rather than answered once because the answer moves without any command: a webfont
   * arriving re-measures every budget, and the ladder re-runs.
   */
  const [previewOverflow, setPreviewOverflow] = useState<string[]>([]);
  useEffect(() => {
    if (!previewDoc) {
      setPreviewOverflow([]);
      return;
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== previewIframe.current?.contentWindow) return;
      const msg = ev.data as PreviewStateMessage | undefined;
      if (!msg || msg.type !== PREVIEW_STATE_TYPE) return;
      const next = Array.isArray(msg.overflow) ? msg.overflow.map(String) : [];
      setPreviewOverflow((prev) => (prev.join(',') === next.join(',') ? prev : next));
    };
    window.addEventListener('message', onMessage);
    const tick = () => postPreviewCmd(previewIframe.current?.contentWindow, { cmd: 'state' });
    const handle = window.setInterval(tick, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(handle);
    };
  }, [previewDoc]);
  // The frame sizes itself in CSS from the graphic's own aspect ratio; the measurement drives
  // ONE number, the inner scale. (Sizing the frame from the measurement made the observed box
  // depend on the value it produced — a late observer left a right-sized frame around a
  // wrongly scaled graphic.) Keyed on the NODE, not the document: the Data tab unmounts this
  // subtree, and an effect keyed on the unchanged previewDoc never measured the remounted
  // frame — the observer's last tick on the detaching node had left stageW at 0, so the
  // returning preview rendered a 1920px document unscaled and showed its empty corner.
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stageEl) return;
    const measure = () => setStageBox({ width: stageEl.clientWidth, height: stageEl.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

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
  const stageAspect = `${stage.width} / ${stage.height}`;

  /**
   * EVERY POOL GRAPHIC'S MACHINE, not just the selected one.
   *
   * The ⚡ block above reads one graphic — the cue in the editor — because that is what an action
   * acts on. A COMBINED control does not: its steps name their own graphics, and the proof case's
   * one press reveals on one board and adds points on another (plan §6c). So the whole pool is
   * parsed here, once per resolution, and the combined half reads this rather than asking again
   * per step. Keyed by NAME because that is the routing key the log, `staged` and `live` use, and
   * a Map because a pool graphic's name is somebody's typed text.
   */
  const poolMachines = useMemo(() => {
    const out = new Map<
      string,
      { buttons: ControlButton[]; legality: Record<string, Record<string, string[]>>; js: string }
    >();
    for (const g of pool ?? []) {
      const tpl = templateForSavedGraphic(g, library);
      // `js` rides along for the Next verb, which asks the same machine whether a press would
      // move anything (`canAdvance`).
      out.set(g.name, { buttons: eventButtons(tpl.js), legality: eventLegality(tpl.js), js: tpl.js });
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
  // CONTAIN, not width-fill (`Math.min`, the same arithmetic as src/output/stage.ts): the frame
  // is the production's shape now, so a cue of another shape has to fit inside it rather than
  // overflow its height.
  const fit =
    previewTemplate && stageBox.width && stageBox.height
      ? Math.min(
          stageBox.width / previewTemplate.resolution.width,
          stageBox.height / previewTemplate.resolution.height,
        )
      : 0;

  const selectCue = useCallback(
    (cueId: string) => {
      flushDraft();
      setDraft(null);
      setSelectedCueId(cueId);
      setEditTarget('preview');
    },
    [flushDraft],
  );
  /**
   * Switching modes keeps the picture still. Into 'preview-then-take', what the operator was
   * looking at (the selection) stays on PREVIEW rather than the monitor going blank under
   * them; back into 'take' the selection is the preview again and the staged cue is moot.
   */
  const changeSpaceMode = useCallback(
    (mode: SpaceMode) => {
      if (mode === 'preview-then-take') setStagedCueId(selectedCue?.id ?? null);
      setSpaceMode(mode);
    },
    [selectedCue, setSpaceMode],
  );

  // ── The verbs. ONE place a verb's commands go somewhere: the wire when published, the local
  // PROGRAM monitor always, so the two can never drift into two behaviours. ──
  const runVerb = useCallback(
    async (batches: ControlSendItem[][], label: string): Promise<boolean> => {
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
        return true;
      }
      try {
        // BOTH ROADS, from this one press (src/control/commandRoads.ts). `applyHere` moves this
        // page's own monitor in zero hops - it used to wait for the whole round trip, because
        // applying locally as well as off the log would have doubled every command it sent, and
        // the minted id is what makes doing both safe. Every other surface gets the database's
        // own broadcast on the production's private topic, with the durable row behind it, and
        // applies whichever won.
        for (const batch of batches) {
          await sendControlVerb({
            slug: hostedSlug,
            showId,
            items: batch,
            applyHere: applyCommand,
            fastEvents: (graphic) => fastEventGraphicsRef.current.has(graphic),
          });
        }
        return true;
      } catch (e) {
        // A verb whose picture MOVED HERE and then failed to send is a different sentence from
        // one that never happened, and an operator has to be told which they are looking at: this
        // monitor applied the commands before the round trip, so what is in front of them is not
        // what any other screen is showing. The broadcast and the row are written together, so a
        // refused verb aired nowhere else - and a send that failed on the way BACK may have aired
        // everywhere, which is why this says "may".
        setNote(
          verbAired(e)
            ? `${label} is on this monitor only. It may not have reached the screens or the log (${(e as Error).message}). Send it again.`
            : `${label} failed: ${(e as Error).message}`,
        );
        return false;
      }
    },
    [hostedSlug, showId, cueLabel, eventLabel, rememberAired, applyProgram, applyCommand],
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

  if (!show) {
    return (
      <div className="app home-page" data-testid="production-page">
        <header className="topbar">
          <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
            <BrandLogo size={24} />
          </button>
          <span className="tpl-name">Production not found</span>
        </header>
        <main className="home-content" style={{ padding: 24 }}>
          <p className="hint">This production no longer exists.</p>
          <button onClick={() => navigate({ view: 'home', section: 'productions' })}>← Back to productions</button>
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
  const unpublishedChanges = !!show.publishedAt && show.updatedAt > show.publishedAt;
  const rendererFresh = outputSeenAt ? now - Date.parse(outputSeenAt) < 90_000 : false;
  const clashes = duplicateLayers(show.graphics);

  /**
   * Claim the readable audience name. The database owns every rule (0035's shape constraint,
   * reserved list and unique index), so this only asks and reports - and on success it adopts
   * the name locally, because `joinUrl` is built from the stored slug and would otherwise keep
   * showing the old one until a republish.
   */
  const claimName = async () => {
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
      setNote(`This production already holds ${MAX_PICTURES} pictures — remove one before adding another.`);
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
    const { shows: afterPool, error } = addGraphicToShow(show.id, template, {});
    setShows(afterPool);
    if (error) {
      setNote(error);
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

  const publish = async () => {
    if (needsSignIn) {
      openSignIn('Publishing a production needs an account — the hosted pages live in your cloud space.');
      return;
    }
    flushDraft();
    setBusy(true);
    try {
      const current = loadShows().find((s) => s.id === show.id);
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
        setLinksOpen(true);
        setNote('✓ Published. Load the output URL in your browser source once — it stays the same across re-publishes.');
      } else {
        setNote('Publishing needs the cloud backend — this build runs offline.');
      }
    } catch (e) {
      setNote(`Publish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
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
      setNote('Production unpublished — its links stop working until you publish again, and come back unchanged when you do.');
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
  /** The server cues this page has put up, front to back - named on the PROGRAM header and
   *  cleared by All out, but never drawn: they play on the server, not in a browser. */
  const livePlayoutLayers = playoutItems
    .map((item) => ({ item, cue: cues.find((c) => c.id === livePlayout[item.id]) ?? null }))
    .filter((l): l is { item: PlayoutItem; cue: ShowCue } => !!l.cue)
    .map((l) => ({ layer: l.item.layer, name: l.item.name, cue: l.cue, label: l.cue.label }))
    .sort((a, b) => b.layer - a.layer);

  const selectedGraphic = selectedCue ? cueGraphicName(selectedCue) : null;
  /** A cue over the playout server's library, and whether THIS cue is what this page last put
   *  up on its item (docs/BRIDGE.md §5). */
  const selectedPlayoutItem = selectedCue ? playoutItemFor(selectedCue) : null;
  const selectedPlayoutLive = !!selectedPlayoutItem && !!selectedCue && livePlayout[selectedPlayoutItem.id] === selectedCue.id;
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
  const unsentFields =
    editingIsLive && selectedGraphic && editingCue
      ? Object.entries(cueView(editingCue).values)
          .filter(([field, value]) => (airedData[selectedGraphic]?.[field] ?? '') !== value)
          .map(([field]) => field)
      : [];
  const hasUnsent = unsentFields.length > 0;

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
   * ONE VERB ON THE PLAYOUT SERVER (docs/BRIDGE.md §5). A cue over the server's own library is
   * one command through NoaCG Bridge - a template is CG-added with its values as JSON, a clip
   * is played - and never a row in the command log: nothing renders it, the /output page would
   * have nothing to do with it, and a phone cannot reach the operator's Bridge. The action
   * carries no page state, so the same object is what a log row would carry later.
   *
   * The outcome is reported as itself: a server that refused, a file that is gone, a Bridge
   * that is not running each get their own sentence in the note line, and nothing marks the
   * row ON AIR on anything but an accepted take.
   */
  const playoutVerb = async (
    cue: ShowCue,
    verb: 'take' | 'update' | 'next' | 'out' | 'pause' | 'resume',
    label: string,
  ): Promise<boolean> => {
    const item = playoutItemFor(cue);
    if (!item) return false;
    flushDraft();
    const settings = loadPlayoutSettings();
    const slot = slotOf(settings, item.layer);
    const itemRef = { kind: item.kind, name: item.name };
    const values = cueView(cue).values;
    const action: PlayoutAction =
      verb === 'take'
        ? { verb, item: itemRef, slot, ...(item.kind === 'template' ? { data: values } : {}) }
        : verb === 'update'
          ? { verb, slot, data: values }
          : { verb, slot, item: itemRef };
    const result = await act(settings, action);
    if (result.state !== 'ok') {
      setNote(`${label} did not reach the playout server: ${result.detail}`);
      return false;
    }
    setNote(`✓ ${label}: ${item.name} on ${slotAddress(slot)}`);
    if (verb === 'take') setLivePlayout((m) => ({ ...m, [item.id]: cue.id }));
    if (verb === 'out') {
      setLivePlayout((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
    return true;
  };

  const takeCue = async (cue: ShowCue) => {
    if (cue.source === 'playout') {
      await playoutVerb(cue, 'take', 'Take');
      return;
    }
    const graphic = cueGraphicName(cue);
    if (!graphic) return;
    flushDraft();
    // Bound fields come from the LIVE tree, not from what this cue stored when it was prepared
    // (plan §2.7) — otherwise taking an old cue would re-air a stale score.
    const values = withBoundValues(graphic, cueView(cue).values);
    if (await runVerb([takeCueItems({ id: cue.id, graphic, values })], 'Take')) {
      setLiveCue((m) => withLiveCue(m, graphic, cue.id));
    }
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
    // OUT IS THE STOP. An operator taking a graphic off air has ended whatever was running, so
    // any combined control still counting down loses its tail rather than firing into a screen
    // that is now empty (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b).
    cancelCombines('Out');
    if (await runVerb([clearCueItems(selectedGraphic)], 'Out')) {
      setLiveCue((m) => withLiveCue(m, selectedGraphic, null));
    }
  };

  /**
   * Play a named graphic off air, if it is up. Removal goes through this first: the output page
   * follows the LOG, not the payload, so a pool graphic deleted while live would keep rendering
   * on its layer with nothing left on this surface able to take it off.
   */
  const takeOffAir = async (graphic: string) => {
    if (!liveCue[graphic]) return;
    cancelCombines('Out');
    if (await runVerb([clearCueItems(graphic)], 'Out')) {
      setLiveCue((m) => withLiveCue(m, graphic, null));
    }
  };

  /** Remove one cue. When it is its graphic's LAST cue the graphic goes with it (shows.ts
   *  removeShowCue): the rundown is the only list of what a production holds, so nothing may
   *  survive out of sight of it. */
  const removeCue = async (cue: ShowCue) => {
    const entry = graphicByPoolId.get(cue.sourceId);
    const isLast = cues.filter((c) => c.sourceId === cue.sourceId).length === 1;
    if (isLast && entry) await takeOffAir(entry.name);
    // A server cue that is up goes off with its row, the same courtesy a graphic gets.
    if (cue.source === 'playout' && livePlayout[cue.sourceId] === cue.id) await playoutVerb(cue, 'out', 'Out');
    setDraft(null);
    setShows(removeShowCue(show.id, cue.id));
  };

  /** Remove a graphic and every cue prepared against it — the one gesture for getting a graphic
   *  out of the production without deleting its rows one by one. */
  const removeGraphic = async (poolId: string) => {
    const entry = graphicByPoolId.get(poolId);
    if (!entry) {
      // The same gesture over a playout item: its cues go, and whatever is up goes off first.
      const live = cues.find((c) => c.id === livePlayout[poolId]);
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
   *  apart from the others, in the header. */
  const outAll = async () => {
    for (const l of livePlayoutLayers) await playoutVerb(l.cue, 'out', 'All out');
    if (liveLayers.length === 0) return;
    cancelCombines('All out');
    const cleared = liveLayers.map((l) => l.graphic);
    if (await runVerb(clearAllCueBatches(cleared), 'All out')) {
      setLiveCue((m) => cleared.reduce((acc, g) => withLiveCue(acc, g, null), m));
    }
  };

  const descriptors = editorTemplate ? fieldDescriptors(editorTemplate.fields) : [];
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
  /** A server cue cannot be taken while the Bridge says the server is not there: the editor
   *  names the hop, and the key stays quiet rather than sending a command that will fail. */
  const canTake = !!selectedCue && !(selectedCue.source === 'playout' && bridgeStatus !== null && bridgeStatus.state !== 'ok');

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
  /** Load one row into the edited cue's DRAFT (never air), remembering it per cue so ↷ Next
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
  const writeArrange = (graphic: string, entries: Record<string, ArrangeEntry>) => {
    const { shows: next, refused } = setShowProfile(id, withGraphicArrange(show.profile, graphic, entries));
    if (refused) setNote('This production’s control profile was written by a newer build, so it cannot be changed here.');
    else setShows(next);
  };
  const deleteProfile = () => {
    const { shows: next, refused } = deleteShowProfile(id);
    if (refused) setNote('This production’s control profile was written by a newer build, so it cannot be deleted here.');
    else setShows(next);
  };
  /** Write the production's whole list of COMBINED controls. It rebases onto the profile as
   *  STORED rather than onto `renderProfile`, so a write never carries a half-read copy back —
   *  and `setShowProfile` still owns the read-only refusal, exactly as ARRANGE's door does. */
  const writeCombine = (combine: CombinedControl[]) => {
    const read = readShowProfile(show.profile);
    const base = read.status === 'ok' ? read.profile : emptyProfile();
    const { shows: next, refused } = setShowProfile(id, { ...base, combine });
    if (refused) {
      setNote('This production’s control profile was written by a newer build, so it cannot be changed here.');
      return;
    }
    setShows(next);
    // EVERY TICK GOES BACK TO ITS DECLARED DEFAULT when the composer is used. A tick is held by
    // its step's POSITION, so moving or deleting a step would otherwise leave the operator's
    // answer sitting on whichever step took that place — the checkbox reading as they left it
    // while the press awarded a different panelist. Authoring is not an operating gesture, so
    // resetting the ticks costs nothing and makes that impossible.
    setCombineTicks(new Map());
  };

  // Grouped and ordered by the SHARED helper (controlModel `arrangeControls`), so the hosted
  // page's ⚡ block, the exported controller's and this one can never sort the author's sections
  // or this production's arrangement differently. With no profile it is the generated panel,
  // byte for byte as it was before ARRANGE existed.
  const arranged = arrangeControls(events, arrangeFor(show.profile, selectedGraphic));

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
    if (await runVerb([[{ graphic: selectedGraphic, msg }]], `Event ${button.event}`)) {
      await patchBoundValues(tree);
    }
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

  // ── COMBINED CONTROLS (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b; the runtime is control/combine.ts)
  //
  // One press, several rows, some of them later. Everything about WHICH and WHEN is in the
  // resolver; everything about WHAT RIDES is the same `eventPayload` the ⚡ buttons use, computed
  // here — a second opinion about what a "+1" carries is how two surfaces come to disagree.
  //
  // The list comes from `renderProfile` (the version gate applied at the READER, HE's lesson):
  // a profile a newer build wrote renders no combined controls at all rather than a sequence this
  // build only half understands.

  /** A user-named key, read safely. A pool graphic's name is somebody's typed text, so a bare
   *  `map[name]` answers a function for one called `constructor`. */
  const own = <T,>(map: Record<string, T>, key: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

  const combineControls = renderProfile?.combine ?? [];

  /** The production as a press finds it — every pool graphic's liveness and legality, and which
   *  graphic each cue belongs to. Rebuilt each render; it is a handful of graphics. */
  const combineNow: CombineNow = {
    graphics: new Map(
      [...poolMachines].map(([name, machine]) => [
        name,
        {
          live: !!own(liveCue, name),
          legal: new Map(
            machine.buttons.map((b) => [b.event, isEventLegal(machine.legality, b.event, own(machineStates, name) ?? null)]),
          ),
        },
      ]),
    ),
    cues: new Map(
      cues
        .map((c) => [c.id, cueGraphicName(c)] as const)
        .filter((pair): pair is readonly [string, string] => pair[1] !== null),
    ),
  };

  /**
   * How a step's target is SPELLED on this surface.
   *
   * A control wears the production's own word for it when ARRANGE renamed it, and otherwise its
   * declared label. The author's SECTION is prefixed only when the label alone would be
   * AMBIGUOUS — when another control of the same graphic reads the same. That is the case the
   * prefix exists for: the proof case's totals board labels all five of its controls "+1", so a
   * press's five ticks would read "+1" five times with nothing to tell the panelists apart. A
   * label that is already unique keeps its own words, because prefixing unconditionally produced
   * "Podiums Spotlight podium" on the first graphic it met.
   */
  const combineNames: StepNames = {
    control: (graphic, control) => {
      const buttons = poolMachines.get(graphic)?.buttons ?? [];
      const button = buttons.find((b) => b.event === control);
      const arrangement = arrangeFor(show.profile, graphic);
      const renamed = arrangement ? own(arrangement, control)?.name : undefined;
      const label = renamed || button?.label || control;
      const shared = buttons.filter((b) => b.label === button?.label).length > 1;
      return shared && button?.section ? `${button.section} ${label}` : label;
    },
    cue: (cueId) => cueLabel(cueId) ?? 'a cue',
  };

  /** Everything a step can point at, for the composer: every pool graphic with the controls it
   *  declares, then every cue. Built here because only this page knows the whole production, and
   *  a panel that had to work it out would be a second opinion about what a production offers. */
  const combineTargets: CombineTarget[] = [
    ...[...poolMachines].map(([name, machine]) => ({
      kind: 'graphic' as const,
      id: name,
      label: name,
      controls: machine.buttons.map((b) => ({ id: b.event, label: combineNames.control(name, b.event) })),
    })),
    ...cues.map((c) => ({ kind: 'cue' as const, id: c.id, label: c.label, controls: [] })),
  ];

  /**
   * HOW THIS SURFACE READS THE PRODUCTION when a group fires (`control/combineSend.ts`).
   *
   * Rebuilt every render and reached through `fireCombineRef`, never captured at press time: a
   * group can fire seconds later, and a closure from the press would send against the production
   * as it WAS — the wrong score, a cue that has since been taken, a graphic somebody took off.
   *
   * A cue's SEND values carry the production's bound values (`withBoundValues`), exactly as this
   * page's own ⟳ TAKE does; an event step's READ values are the cue as the operator currently
   * sees it, draft and all.
   */
  const combineWorld: CombineWorld = {
    buttons: (graphic) => poolMachines.get(graphic)?.buttons ?? [],
    cueSendValues: (cueId) => {
      const cue = cues.find((c) => c.id === cueId);
      if (!cue) return null;
      const graphic = cueGraphicName(cue);
      return graphic ? withBoundValues(graphic, cueView(cue).values) : null;
    },
    onAir: (graphic) => {
      const cue = airCueOf(graphic);
      return cue ? { cueId: cue.id, values: cueView(cue).values } : null;
    },
    aired: (graphic) => own(airedData, graphic),
    bound: (graphic, field) => {
      const path = own(bindings ?? {}, graphic)?.[field];
      return path ? { path, current: resolvedRef.current[graphic]?.[field] } : null;
    },
  };

  /** One line of the activity feed that is NOT a command row — a step the machine dropped, or a
   *  tail an Out cancelled. Both are things the operator asked for that did not happen, and the
   *  feed is the only place on this surface that says so. */
  const feedNote = (text: string, graphic: string) => {
    setWireLog((l) =>
      appendLogEntries(l, [
        { id: (localLogId.current -= 1), at: new Date().toISOString(), graphic, kind: 'note', text },
      ]),
    );
  };

  /** The cue on air for one graphic — where an event step's payload reads from, and where its
   *  moved figures are mirrored back so ⟳ Take and ✎ Update cannot regress them. */
  const airCueOf = (graphic: string): ShowCue | null => {
    const cueId = own(liveCue, graphic);
    return cueId ? cues.find((c) => c.id === cueId) ?? null : null;
  };

  const tickKey = (controlId: string, index: number) => `${controlId}\u0000${index}`;
  /** Whether one `ask` step's tick is on: what the operator moved it to, else its declared
   *  default. An absence here means "untouched", never "off". */
  const tickOn = (controlId: string, index: number, declared: boolean) =>
    combineTicks.get(tickKey(controlId, index)) ?? declared;
  /** The step indices a press would actually send, ticks applied. The greying reads this too, so
   *  a control whose first step the operator has un-ticked is judged by the step that WOULD go. */
  const tickedSet = (control: CombinedControl) =>
    new Set(
      askSteps(control)
        .filter((a) => tickOn(control.id, a.index, a.on))
        .map((a) => a.index),
    );

  /**
   * SEND THE STEPS THAT ARE DUE — called at the moment they fire, which is what makes a delayed
   * `adjust` count from what the audience is looking at rather than from the press.
   *
   * It is assigned to a ref on every render rather than captured at press time, because a group
   * can fire seconds later and a closure from the press would send against the production as it
   * WAS: the wrong score, a cue that has since been taken, a graphic somebody took off air.
   *
   * EVERYTHING DUE IS RESOLVED IN ONE PASS. The scheduler hands over every group whose wait has
   * run out, which on a throttled background tab can be several at once, and they share the
   * `ahead` overlay below. Resolving them one call at a time would have each read the same
   * unchanged surface state — React has not re-rendered between two synchronous calls — so five
   * delayed `+1`s on one field would all send the same figure and the score would move by one.
   *
   * A step the machine would drop is dropped ALONE and the feed says which; the rest proceed (§6b).
   */
  fireCombineRef.current = (control, due) => {
    const { steps, mirrors, liveAfter, dropped, tree } = resolveCombineSend(due, combineNow, combineWorld);

    for (const drop of dropped) {
      feedNote(
        `“${control.name}” skipped ${stepWords(drop.step, combineNames)}, because ${drop.why}`,
        drop.graphic,
      );
    }
    // The cue keeps the figure air shows, so the next ⟳ Take or ✎ Update cannot regress it —
    // the same write-back a single ⚡ press does, once per cue rather than once per step. The
    // PATCH carries only the moved fields: merging a whole `{...cue.values, ...adjusted}` read
    // from this render would put back every other field as it stood before the pass.
    for (const { cueId, values } of mirrors) {
      if (editingCue?.id === cueId) editDraft({ values });
      else setShows(updateShowCue(id, cueId, { values }));
    }
    if (steps.length === 0) {
      // A press whose every step moved only SHARED values still has work to do: those figures
      // never rode the wire as fields, and their rows come out of the patch road instead.
      void patchBoundValues(tree);
      return;
    }
    void runVerb(commandBatches(steps), `“${control.name}”`).then((sent) => {
      if (!sent) return;
      for (const [graphic, cueId] of liveAfter) setLiveCue((m) => withLiveCue(m, graphic, cueId));
      void patchBoundValues(tree);
    });
  };

  /** Cancel every armed tail, and say so. What an operator's Out means (§6b: "any Out ... cancels
   *  what has not been sent"). A step's OWN Out does not come through here — a combined control
   *  that ends on Out must not cancel its own tail. */
  const cancelCombines = (why: string) => {
    for (const { controlId, steps } of scheduler.cancelAll()) {
      const control = combineControls.find((c) => c.id === controlId);
      feedNote(
        `${why} cancelled ${steps} unsent step${steps === 1 ? '' : 's'} of “${control?.name ?? 'a combined control'}”`,
        '',
      );
    }
  };

  /** Press a combined control — or, while it is counting down, cancel what it has not sent. The
   *  countdown IS the cancel, which is what makes the armed wait visible and stoppable with one
   *  control rather than with a second one beside it. */
  const pressCombine = (control: CombinedControl) => {
    if (scheduler.waiting(control.id)) {
      const dropped = scheduler.cancel(control.id);
      if (dropped > 0) {
        feedNote(`“${control.name}” cancelled, ${dropped} step${dropped === 1 ? '' : 's'} not sent`, '');
      }
      return;
    }
    const ticked = tickedSet(control);
    if (combineBlocked(control, combineNow, ticked)) return;
    // A production that binds ANYTHING waits for its tree before a combined press, rather than
    // this asking which of the steps would move a shared value: a step's figures are resolved when
    // it FIRES, seconds later, so a question asked here would be about the wrong moment. A
    // production with no bindings - which is most of them - never waits at all.
    if (bindings && Object.keys(bindings).length > 0 && !boundPressReady()) return;
    flushDraft();
    scheduler.press(control.id, planCombine(control, ticked), (due) => fireCombineRef.current(control, due));
  };

  /** One combined button, with its tick list beside it and its countdown on it — the component
   *  the hosted control page draws too, so the two surfaces cannot present one production's
   *  combined controls two ways. */
  const combinedButton = (control: CombinedControl) => (
    <CombinedButton
      key={control.id}
      control={control}
      now={combineNow}
      names={combineNames}
      wait={scheduler.waiting(control.id)}
      tickOn={(index, declared) => tickOn(control.id, index, declared)}
      onTick={(index, on) => setCombineTicks((m) => new Map(m).set(tickKey(control.id, index), on))}
      onPress={() => pressCombine(control)}
    />
  );

  /** One ⚡ button. Written once because the block draws the same button in three places now —
   *  pinned above the fold, inside its section, and under the collapsed "More" — and three copies
   *  of a tooltip this careful would drift apart by the second edit. The DECLARATION decides
   *  everything the press does; the arrangement decides only the word and where it sits. */
  const actionButton = ({ button: b, label }: ArrangedControl) => {
    const legal = isEventLegal(legality, b.event, machineState);
    // Empty when everything the press moves is a hidden holder, which is the reported-field
    // pattern: the hint then falls through to the payload.
    const moved = adjustWords(b, (key) => descriptors.find((d) => d.key === key)?.label);
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
                  `Fires "${b.event}" on air and moves ${moved} with it`
                : b.payload?.length
                  ? // The payload in the OPERATOR'S words, not as `f7`. This is what makes an
                    // action self-explanatory: the acceptance pass could not tell what "Show
                    // audience result" would do, and the answer is "it shows the Audience results
                    // field, which you type above" — a field id says none of that.
                    `Fires "${b.event}" on air, carrying this cue's ${b.payload
                      .map((key) => descriptors.find((d) => d.key === key)?.label ?? key)
                      .join(', ')}`
                  : `Fires "${b.event}" on air`
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
  const onVerb = (key: PlayoutVerb) => {
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
    // Walk the rundown. Selecting a cue is the same act as clicking it - in 'take' mode it
    // goes to PREVIEW and in the other mode it does not, and nothing airs either way - so an
    // operator can line the next item up and take it without touching the mouse.
    if (key === 'select-prev' || key === 'select-next') {
      const next = stepSelection(cues, selectedCue?.id ?? null, key === 'select-next' ? 1 : -1);
      if (!next) return;
      selectCue(next.id);
      revealCue(`cue-${next.id}`);
    }
  };

  return (
    <ProductionShell
      show={show}
      now={now}
      openedAt={openedAt}
      hostedSlug={hostedSlug}
      rendererFresh={rendererFresh}
      outputSeenAt={outputSeenAt}
      liveLayers={liveLayers}
      follow={follow}
      onHome={() => navigate({ view: 'home', section: null })}
      onBack={() => navigate({ view: 'home', section: 'productions' })}
      onAllOut={() => void outAll()}
      allOutEnabled={liveLayers.length > 0 || livePlayoutLayers.length > 0}
      onExport={() => setExportOpen(true)}
      onKey={onVerb}
      sub={sub ?? null}
      onTab={() => navigate({ view: 'production', id: show.id })}
      links={
        <ProductionLinks
          show={show}
          open={linksOpen}
          onToggle={() => setLinksOpen((o) => !o)}
          onClose={() => setLinksOpen(false)}
          backendConfigured={backendConfigured}
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
          unpublishedChanges={unpublishedChanges}
          onCopy={copy}
          embedFileName={outputEmbedFileName(show.name)}
          onDownloadEmbed={downloadEmbed}
          onPublish={() => void publish()}
          onUnpublish={() => void unpublish()}
        />
      }
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
        {/* THE STAGE HEAD: the monitors and the verbs that act on them, as ONE sticky block.
            Two things came out of the 2026-08-21 owner read (docs/PLAYOUT_DASHBOARD.md §2). The
            verb bar used to scroll away under the sticky monitors - "a bit scary that you scroll
            the monitors on top of the take buttons" - and what must never leave the screen is
            sticky, not small, which TAKE and Out plainly are. And above 1366px the bar moves
            into the empty column beside PROGRAM, which spends that width and gives the monitors
            back the height the bar was using. Below it, the bar returns underneath. */}
        <div className="pd-stagehead">
        <div
          className="pd-monitors"
          style={{ ['--pd-ar' as string]: stage.width / stage.height }}
        >
          <div className="pd-monitor pd-pvw">
            <h2>
              <span className="pd-dot" aria-hidden="true" />
              PREVIEW
              <span className="pd-what" data-testid="preview-what">
                {previewCue
                  ? cueView(previewCue).label
                  : spaceMode === 'preview-then-take'
                    ? PREVIEW_EMPTY_LABEL
                    : 'nothing selected'}
              </span>
            </h2>
            <div className="pd-screen">
              {previewDoc && previewTemplate ? (
                <div
                  className="pd-frame"
                  ref={setStageEl}
                  style={{ aspectRatio: stageAspect }}
                  data-testid="production-preview"
                >
                  <iframe
                    ref={previewIframe}
                    title="Cue preview"
                    sandbox="allow-scripts"
                    srcDoc={previewDoc}
                    onLoad={() => settlePreview(settleData)}
                    style={{
                      position: 'absolute',
                      // CENTRED IN THE STAGE, the same way src/output/stage.ts centres its own:
                      // origin at the frame's middle, then translated back by half the SCALED
                      // size. Percentage translates would compound with the scale.
                      left: '50%',
                      top: '50%',
                      width: previewTemplate.resolution.width,
                      height: previewTemplate.resolution.height,
                      border: 0,
                      transformOrigin: '0 0',
                      transform: `translate(${(-previewTemplate.resolution.width * (fit || 1)) / 2}px, ${
                        (-previewTemplate.resolution.height * (fit || 1)) / 2
                      }px) scale(${fit || 1})`,
                    }}
                  />
                </div>
              ) : (
                <div className="pd-frame pd-frame-empty" style={{ aspectRatio: stageAspect }}>
                  <p className="hint">
                    {cues.length === 0
                      ? 'Add a cue to preview it here.'
                      : 'SPACE on the selected cue shows it here.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pd-monitor pd-pgm">
            <h2>
              <span className="pd-dot" aria-hidden="true" />
              PROGRAM — ON AIR
              {/* The names can run past the monitor's width and end in an ellipsis, so the title
                  carries them whole. The badge names EVERY live layer, in the names' order: with a
                  quiz and a score both up it used to show one layer beside two names. */}
              <span className="pd-what" title={liveLayers.map((l) => `${l.label} (layer ${l.layer})`).join(', ')}>
                {liveLayers.length === 0 ? 'nothing on air' : liveLayers.map((l) => l.label).join(' · ')}
              </span>
              {liveLayers.length > 0 && (
                <span className="pd-layer-badge">{liveLayers.map((l) => `L${l.layer}`).join(' · ')}</span>
              )}
              {/* Server cues are up on the playout box, not in this monitor - named, never drawn. */}
              {livePlayoutLayers.length > 0 && (
                <span
                  className="pd-layer-badge pd-server-badge"
                  title="Playing on the playout server through NoaCG Bridge - not shown on this monitor"
                  data-testid="playout-on-air"
                >
                  server: {livePlayoutLayers.map((l) => `${l.label} (L${l.layer})`).join(' · ')}
                </span>
              )}
            </h2>
            <div className="pd-screen">
              <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: stageAspect }}>
                <ProgramStage
                  ref={programRef}
                  show={show}
                  library={library}
                  empty={liveLayers.length === 0}
                  onState={noteMachineState}
                  onReady={restoreProgram}
                />
              </div>
            </div>
          </div>
        </div>

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
          <button
            className={face.className}
            disabled={selectedCueIsLive ? !selectedLayerLive : !canTake}
            onClick={() => onVerb('take')}
            title={face.title}
            data-testid="verb-take"
          >
            {face.text} <kbd>SPACE</kbd>
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
            className="pd-verb"
            disabled={!selectedLayerLive || !nextMoves}
            onClick={() => void nextLive()}
            title={
              !selectedGraphic
                ? 'Advance the layer'
                : selectedLayerLive && !nextMoves
                  ? `${selectedGraphic} is on its last step - Out takes it off, Re-take starts it again`
                  : `Advance ${selectedGraphic} to its next step`
            }
            data-testid="verb-next"
          >
            » Next <kbd>N</kbd>
          </button>
          <button
            className="pd-verb"
            disabled={!selectedLayerLive}
            onClick={() => void outLive()}
            title={selectedGraphic ? `Play ${selectedGraphic} off — the other layers stay up` : 'Play this layer off'}
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
            <span className="pd-onair-line" data-testid="live-cue-chip">
              {liveLayers.length === 0 ? (
                <span className="muted">○ nothing on air</span>
              ) : (
                <>
                  on air: <span className="pd-onair">● {liveLayers.map((l) => l.label).join(' · ')}</span>
                </>
              )}
            </span>
            <SpaceModeToggle mode={spaceMode} onChange={changeSpaceMode} testId="space-mode" />
          </span>
        </div>
        </div>

        {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="production-note">{note}</p>}

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
                    : `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet - press ✎ Update`
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
                      title="Load the next row"
                      data-testid="cue-load-next"
                    >
                      ↷ Next
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
                                ? 'Pictures come from this production — add more with ＋ Add pictures.'
                                : "Pictures come from the graphic itself — add one in the editor's Assets tab."
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CUE SETTINGS, under a rule and not in the content grid. The note is the cue's and
                the layer is the graphic's; neither is something the graphic SHOWS, and flowing
                them in beside the content fields is what left "Playout layer" alone on a second
                row looking like a field nobody finished (owner, 2026-08-21). The layer stays
                here rather than moving to a settings screen - it belongs where the operator
                already is when they decide a graphic needs its own (§5). */}
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
              <label className="pd-field pd-field-layer">
                <span>Playout layer</span>
                <input
                  type="number"
                  min={MIN_PLAYOUT_LAYER}
                  max={MAX_PLAYOUT_LAYER}
                  value={graphicLayer(poolGraphic)}
                  onChange={(e) => setShows(setShowGraphicLayer(show.id, poolGraphic.id, Number(e.target.value)))}
                  data-testid="graphic-layer"
                />
              </label>
            </div>

            {clashes.has(graphicLayer(poolGraphic)) && (
              <p className="status-warn pd-layer-clash" data-testid="layer-clash">
                {nameList(clashes.get(graphicLayer(poolGraphic))!.map((g) => g.name))} share layer{' '}
                {graphicLayer(poolGraphic)} — on air they replace each other.
                <button
                  onClick={() => setShows(setShowGraphicLayer(show.id, poolGraphic.id, nextFreeLayer(show.graphics)))}
                  data-testid="layer-clash-fix"
                >
                  Move to layer {nextFreeLayer(show.graphics)}
                </button>
              </p>
            )}
          </div>
        )}

        {/* A cue over the PLAYOUT SERVER'S OWN LIBRARY (docs/BRIDGE.md §5): a template or a clip
            that lives on the CasparCG box and airs through NoaCG Bridge. Its editor is the same
            shape as a graphic's - the title, the fields, the note and the layer - with the
            server's state where the unsent line would be, because "connected" or "not answering"
            is the fact an operator needs before pressing Take on something nothing here shows. */}
        {editingCue && editingView && selectedPlayoutItem && (
          <div className={`pd-editor${editingIsLive ? ' live' : ''}`} data-testid="playout-cue-editor">
            <div className="pd-editor-head">
              <span className="pd-editor-kicker">
                {selectedPlayoutItem.kind === 'media' ? 'SERVER CLIP' : 'SERVER TEMPLATE'}
                {editingIsLive ? ' · ON AIR' : ''}
                {editingCueNo > 0 ? ` · ${editingCueNo}` : ''}
              </span>
              <input
                className="pd-cue-title"
                value={editingView.label}
                onChange={(e) => editDraft({ label: e.target.value })}
                aria-label="Cue name"
                data-testid="cue-label"
              />
              <span
                className={bridgeStatus && bridgeStatus.state !== 'ok' ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
                data-testid="playout-cue-status"
                data-state={bridgeStatus?.state ?? 'pending'}
              >
                {bridgeStatus === null
                  ? 'asking the playout server…'
                  : bridgeStatus.state === 'ok'
                    ? `CasparCG${bridgeStatus.version ? ` ${bridgeStatus.version}` : ''} · connected`
                    : bridgeStatus.detail}
              </span>
            </div>
            <p className="hint pd-server-where" data-testid="playout-cue-where">
              <code>{selectedPlayoutItem.name}</code> plays on the playout server, on{' '}
              <code>{slotAddress(slotOf(loadPlayoutSettings(), selectedPlayoutItem.layer))}</code>, through NoaCG
              Bridge. It is not shown on the PROGRAM monitor here.
            </p>
            {selectedPlayoutItem.kind === 'template' && (
              <div className="pd-band-fields" data-testid="playout-cue-fields">
                {(selectedPlayoutItem.fields ?? []).map((f) => (
                  <FieldRow
                    key={f.field}
                    descriptor={{ key: f.field, label: `${f.field.toUpperCase()} · ${f.title}`, kind: 'text', defaultValue: f.value }}
                    value={String(editingView.values[f.field] ?? f.value)}
                    onChange={(v) => editDraft({ values: { [f.field]: String(v) } })}
                    testIdPrefix="cue-field"
                  />
                ))}
                <AddFieldRow
                  onAdd={(id) =>
                    setShows(
                      setPlayoutItemFields(show.id, selectedPlayoutItem.id, [
                        ...(selectedPlayoutItem.fields ?? []).filter((f) => f.field !== id),
                        { field: id, title: id.toUpperCase(), value: '' },
                      ]),
                    )
                  }
                />
              </div>
            )}
            {selectedPlayoutItem.kind === 'media' && editingIsLive && (
              <div className="row pd-clip-transport" data-testid="playout-clip-transport">
                <button onClick={() => void playoutVerb(editingCue, 'pause', 'Pause')} data-testid="playout-pause">
                  ⏸ Pause
                </button>
                <button onClick={() => void playoutVerb(editingCue, 'resume', 'Resume')} data-testid="playout-resume">
                  ▶ Resume
                </button>
              </div>
            )}
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
              <label className="pd-field pd-field-layer">
                <span>Playout layer</span>
                <input
                  type="number"
                  min={MIN_PLAYOUT_LAYER}
                  max={MAX_PLAYOUT_LAYER}
                  value={selectedPlayoutItem.layer}
                  onChange={(e) => setShows(setPlayoutItemLayer(show.id, selectedPlayoutItem.id, Number(e.target.value)))}
                  data-testid="playout-layer"
                />
              </label>
            </div>
          </div>
        )}

        {/* GRAPHIC ACTIONS — the machine's own verbs, rendered from the metadata that travels
            inside the template (docs/CONTROL_LAYER.md; the region docs/PLAYOUT_DASHBOARD.md §8
            reserves). Deliberately OUTSIDE the editor's frame: fields up there edit a CUE and
            air on ⟳ Take / ✎ Update, while these act on the LIVE graphic the moment they are
            pressed — so they follow Update's legality and say so in their own header.

            COMBINED controls sit in this block under a section of their own (plan §6e), which is
            why the block now renders for a production that has them even when the selected cue's
            graphic declares no controls of its own: a combined control spans graphics, so it is
            the PRODUCTION's row rather than this graphic's, and hiding it behind whichever cue
            happens to be selected would make it disappear at the worst moment. */}
        {(events.length > 0 || combineControls.length > 0) && selectedGraphic && (
          <div className="pd-actions" data-testid="cue-actions">
            <div className="pd-actions-head">
              <span className="pd-actions-kicker">
                ⚡ GRAPHIC ACTIONS <b className="pd-actions-air">act on air</b>
              </span>
              <span
                className="pd-state-chip"
                data-testid="machine-state-chip"
                // A multi-group graphic's label is longer than the chip, so the full text has
                // to stay reachable on hover — the chip truncates rather than reflowing.
                title={
                  !selectedLayerLive
                    ? "The live graphic's current state — what the greying is judged against"
                    : `${stateLabel ?? 'no state reported yet'} — the live graphic's current state, what the greying is judged against`
                }
              >
                {!selectedLayerLive ? 'not on air' : stateLabel ?? 'no state reported yet'}
              </span>
              <div className="spacer" />
              {stateGroups.length > 0 && (
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
                  title={
                    'RECOVERY. Jumps the live graphic straight to a state with no animation, ' +
                    'and re-sends this cue’s values with it — use it when air and the dashboard ' +
                    'have got out of step (a renderer restart, a missed press). It is not how a ' +
                    'graphic is normally driven: that is the ⚡ actions and » Next.'
                  }
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
              )}
            </div>
            {/* INLINE HELP, because two of these controls were unreadable to their first real
                operator (acceptance pass, 2026-08-06). It is one line and it says what the
                block IS — a documented control the user has to leave the surface to understand
                is a control they will not use. */}
            <p className="hint pd-actions-help" data-testid="cue-actions-help">
              These fire the graphic’s own beats on the layer that is on air, immediately —
              they carry values from this cue, so type them above first.
              {stateGroups.length > 0 && ' “Snap to state…” is for RECOVERY: it jumps straight to a state with no animation.'}
            </p>
            {/* PINNED, above the fold and above the section headings: the handful this show
                actually presses. Unsectioned on purpose — a pinned row that carried headings
                would be the sections again, one fold higher. */}
            {arranged.pinned.length > 0 && (
              <div className="pd-actions-row pd-actions-pinned" data-testid="cue-actions-pinned">
                {arranged.pinned.map(actionButton)}
              </div>
            )}
            {arranged.sections.map(([section, controls]) => (
              <div key={section} className="pd-actions-section">
                {(arranged.sections.length > 1 || section !== 'Actions') && <h4>{section}</h4>}
                <div className="pd-actions-row">{controls.map(actionButton)}</div>
              </div>
            ))}
            {/* HIDDEN, behind one disclosure. A production hiding a control is saying "not in my
                way", which is not the same as "gone": the machine still accepts it, and an
                operator who needs it mid-show must not have to open the authoring panel. */}
            {arranged.more.length > 0 && (
              <details className="pd-actions-more" data-testid="cue-actions-more">
                <summary>More ({arranged.more.length})</summary>
                <div className="pd-actions-row">{arranged.more.map(actionButton)}</div>
              </details>
            )}
            {/* COMBINED, this production's own buttons (§6b). LAST in the block on purpose: the
                controls above are what the graphic itself declares and are the same on every
                surface, and these are what this show made out of them. */}
            {combineControls.length > 0 && (
              <div className="pd-actions-section pd-combined-section" data-testid="cue-actions-combined">
                <h4>Combined</h4>
                <div className="pd-actions-row">{combineControls.map(combinedButton)}</div>
              </div>
            )}
          </div>
        )}

        {/* LIVE NUMBERS — one press changes a figure on the live graphic (a score, a goal
            total, a stock count). The same doctrine as the ⚡ actions above: fields in the
            editor edit a CUE and air on ⟳ Take / ✎ Update, these act on AIR the moment they
            are pressed — a partial update carrying just the bumped field, mirrored into the
            cue so the two never drift. Derived from the template's own `number` fields, so
            every scoreboard, podium board and goal meter gets it with no per-graphic code. */}
        {liveNumberFields.length > 0 && selectedGraphic && (
          <div className="pd-actions pd-live-numbers" data-testid="live-numbers">
            <div className="pd-actions-head">
              <span className="pd-actions-kicker">
                ± LIVE NUMBERS <b className="pd-actions-air">act on air</b>
              </span>
            </div>
            <p className="hint pd-actions-help">
              One press changes the figure on the live graphic and keeps this cue in step — no
              ✎ Update needed. Typing a value above still stages it for ✎ Update instead.
            </p>
            <div className="pd-actions-row">
              {liveNumberFields.map((d) => {
                const disabled = !selectedLayerLive || !editingIsLive;
                const title = !selectedLayerLive
                  ? 'The graphic is not on air. Take the cue first.'
                  : !editingIsLive
                    ? 'Another cue is on air — select the live cue to bump its numbers'
                    : `Changes "${d.label}" on air immediately`;
                return (
                  <span key={d.key} className="pd-live-number" data-testid={`live-number-${d.key}`}>
                    <span className="pd-live-number-label">{d.label}</span>
                    <button
                      disabled={disabled}
                      title={title}
                      onClick={() => void bumpLive(d.key, -1)}
                      data-testid={`live-number-${d.key}-down`}
                    >
                      −
                    </button>
                    <button
                      disabled={disabled}
                      title={title}
                      onClick={() => void bumpLive(d.key, 1)}
                      data-testid={`live-number-${d.key}-up`}
                    >
                      +
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* THE CONTROLS PANEL — where this production arranges what the ⚡ block above shows
            (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e). It sits directly under the block it
            authors, collapsed, so a change lands in front of the eye that made it. */}
        {selectedGraphic && (
          <ProductionControlsPanel
            // Keyed on the graphic: the panel holds a half-typed rename and a drag in its own
            // state, and stepping to another graphic's cue must not carry either across - two
            // graphics can declare a control with the same id, so the draft would land on it.
            key={selectedGraphic}
            graphic={selectedGraphic}
            buttons={events}
            profile={renderProfile}
            readOnly={profileRead.status === 'read-only'}
            targets={combineTargets}
            onArrange={(entries) => writeArrange(selectedGraphic, entries)}
            onCombine={writeCombine}
            onDeleteProfile={deleteProfile}
          />
        )}

        <ActionLog entries={wireLog} published={!!hostedSlug && backendConfigured} />
      </section>

      <aside className={`pd-rail${sub ? ' pd-offstage' : ''}`}>
        <div className="pd-rail-head">
          <h2>Cue rundown</h2>
          <span className="muted">{cues.length}</span>
          <div className="spacer" />
          <button
            className="pd-icon"
            title="Add a cue on the selected graphic"
            disabled={!poolGraphic}
            onClick={() => {
              if (!poolGraphic) return;
              const { shows: next, cueId } = addShowCue(show.id, poolGraphic.id);
              setShows(next);
              if (cueId) selectCue(cueId);
            }}
            data-testid="add-cue"
          >
            ＋
          </button>
        </div>

        {cues.length === 0 && (
          <p className="hint" data-testid="no-cues">
            No cues yet — add a graphic below, then add cues on it.
          </p>
        )}

        <div className="pd-cues" data-testid="cue-list">
          {cues.map((cue, i) => {
            const view = cueView(cue);
            const cueGraphic = cueGraphicName(cue);
            const poolEntry = graphicByPoolId.get(cue.sourceId);
            const playoutItem = playoutItemFor(cue);
            const cueIsLive =
              (!!cueGraphic && liveCue[cueGraphic] === cue.id) || (!!playoutItem && livePlayout[playoutItem.id] === cue.id);
            const isSelected = cue.id === (selectedCue?.id ?? '');
            // The amber tally is the cue ON PREVIEW - the selection in 'take' mode, and in
            // 'preview-then-take' mode the cue SPACE put there, which the cursor may have left.
            const isPreviewed = cue.id === (previewCue?.id ?? '');
            // Removal wording, decided per row. How many cues the graphic has says whether this
            // one takes the graphic with it (shows.ts removeShowCue) and whether removing the
            // graphic outright is a distinct gesture at all; pictures live ONLY in their pool
            // graphic, so losing it loses the uploads and the operator has to be told.
            const siblingCues = cues.filter((c) => c.sourceId === cue.sourceId).length;
            const pictures = poolEntry?.type === 'picture' ? poolEntry.template.assets.length : 0;
            const clashWith = poolEntry
              ? (clashes.get(graphicLayer(poolEntry)) ?? []).filter((g) => g.id !== poolEntry.id)
              : [];
            return (
              <div
                key={cue.id}
                className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isPreviewed ? ' on-pvw' : ''}`}
                data-testid={`cue-${cue.id}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/noacg-cue', cue.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData('text/noacg-cue');
                  const fromIndex = cues.findIndex((c) => c.id === from);
                  if (fromIndex < 0 || fromIndex === i) return;
                  flushDraft();
                  // moveShowCue steps by one, so walk it to the drop position — the store keeps
                  // one mutation shape and the drag stays a pure view concern.
                  let next = shows;
                  const step = fromIndex < i ? 1 : -1;
                  for (let k = fromIndex; k !== i; k += step) next = moveShowCue(show.id, from, step);
                  setShows(next);
                }}
              >
                <span className="pd-grip" aria-hidden="true">⣿</span>
                <span className="pd-cue-no">{cueIsLive ? '●' : i + 1}</span>
                {/* aria-current, not aria-selected: this is a list of cues the operator moves a
                    cursor through, and "the one I am holding" is exactly what current means. It
                    is also the non-visual half of the ring the CSS draws — a tally colour tells a
                    screen reader nothing. */}
                <button
                  className="pd-cue-label"
                  onClick={() => selectCue(cue.id)}
                  data-testid="select-cue"
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <strong>{view.label}</strong>
                  <span className="muted">
                    {/* The LAYER, and the one place a shared layer is announced now that the
                        layer list is gone (§5): two graphics on one number replace each other on
                        air, so both rows wear the warning colour where the operator is already
                        looking. The repair — the editor's one-click "Move to layer N" — stays
                        beside the number itself. */}
                    {poolEntry && (
                      <span
                        className={`pd-cue-layer${clashWith.length ? ' clash' : ''}`}
                        title={
                          clashWith.length
                            ? `Shares layer ${graphicLayer(poolEntry)} with ${nameList(clashWith.map((g) => g.name))} — on air they replace each other`
                            : `${poolEntry.name} airs on layer ${graphicLayer(poolEntry)}`
                        }
                        data-testid="cue-layer"
                      >
                        L{graphicLayer(poolEntry)}
                      </span>
                    )}
                    {/* A server item wears its layer the same way; the kind word says where it
                        lives, since the label is the operator's and the name is the server's. */}
                    {playoutItem && (
                      <span className="pd-cue-layer" title={`${playoutItem.name} plays on the playout server, layer ${playoutItem.layer}`} data-testid="cue-layer">
                        L{playoutItem.layer}
                      </span>
                    )}
                    {poolEntry || playoutItem ? ' · ' : ''}
                    {/* The KIND beside the name: the label above is the operator's own word for
                        the cue, so this is what says "that one is the scoreboard" at a glance. */}
                    {poolEntry ? `${graphicKindLabel(poolEntry.type)} · ` : ''}
                    {playoutItem ? `${playoutItem.kind === 'media' ? 'Server clip' : 'Server template'} · ` : ''}
                    {view.note || cueGraphic || playoutItem?.name || 'missing graphic'}
                  </span>
                </button>
                {cueIsLive ? (
                  <span className="pd-tag air">ON AIR</span>
                ) : isPreviewed ? (
                  <span className="pd-tag pvw">PVW</span>
                ) : null}
                <div className="pd-cue-menu-host">
                  <button
                    className="pd-icon pd-cue-more"
                    onClick={() => {
                      setArmedRemove(null);
                      setMenuCueId((m) => (m === cue.id ? null : cue.id));
                    }}
                    title="More"
                    aria-label={`More actions for ${view.label}`}
                    data-testid="cue-menu"
                  >
                    ⋯
                  </button>
                  {/* The rundown SCROLLS, so the last cue's ⋯ is at the bottom of the rail by
                      arithmetic — the same defect the library's bulk bar had, on the surface an
                      operator uses live. The shell measures which way to open. */}
                  <LibMenu
                    open={menuCueId === cue.id}
                    onClose={() => {
                      setArmedRemove(null);
                      setMenuCueId(null);
                    }}
                    testid="cue-actions-menu"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        flushDraft();
                        const v = cueView(cue);
                        const { shows: next, cueId } = addShowCue(show.id, cue.sourceId, {
                          label: `${v.label} copy`,
                          values: v.values,
                          note: v.note || undefined,
                        });
                        setShows(next);
                        setMenuCueId(null);
                        if (cueId) selectCue(cueId);
                      }}
                    >
                      Duplicate
                    </button>
                    {/* Removing the LAST cue removes the graphic too, so the label says so
                        rather than letting it be discovered. A picture graphic carries the
                        uploads themselves, which is the one removal that destroys content
                        with no copy in the library — it asks twice, naming the count. */}
                    <button
                      role="menuitem"
                      onClick={() => {
                        if (siblingCues === 1 && pictures > 0 && armedRemove !== 'cue') {
                          setArmedRemove('cue');
                          return;
                        }
                        void removeCue(cue);
                        setArmedRemove(null);
                        setMenuCueId(null);
                      }}
                      title={
                        siblingCues === 1
                          ? `The last cue on ${cueGraphic ?? playoutItem?.name ?? 'this graphic'} — the graphic leaves the production with it`
                          : 'Remove this cue; the graphic and its other cues stay'
                      }
                      data-testid="delete-cue"
                    >
                      {armedRemove === 'cue'
                        ? `Also deletes ${pictures} picture${pictures === 1 ? '' : 's'} — confirm?`
                        : siblingCues === 1
                          ? 'Remove cue and graphic'
                          : 'Remove cue'}
                    </button>
                    {/* One gesture for getting a graphic out of the production. Offered only
                        where it differs from the item above: with a single cue, that one
                        already takes the graphic. */}
                    {siblingCues > 1 && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          if (armedRemove !== 'graphic') {
                            setArmedRemove('graphic');
                            return;
                          }
                          void removeGraphic(cue.sourceId);
                          setArmedRemove(null);
                          setMenuCueId(null);
                        }}
                        title={`Remove ${cueGraphic ?? playoutItem?.name ?? 'this graphic'} from the production, with every cue prepared against it`}
                        data-testid="delete-graphic"
                      >
                        {armedRemove === 'graphic'
                          ? `Remove ${siblingCues} cues${pictures > 0 ? ` and ${pictures} pictures` : ''} — confirm?`
                          : `Remove graphic and its ${siblingCues} cues`}
                      </button>
                    )}
                  </LibMenu>
                </div>
              </div>
            );
          })}
        </div>

        {/* The foot is how graphics GET IN. It used to carry a layer list as well — a second
            list of the same graphics, in a corner the rundown wanted for itself. The layer is
            typed beside the graphic's content, every rundown row wears its number, and removal
            lives in the row's ⋯ menu, so the rundown is the only list (§5). */}
        <div className="pd-rail-foot">
          <div className="row">
            <select value={addPick} onChange={(e) => setAddPick(e.target.value)} data-testid="add-graphic-pick">
              <option value="">Add a graphic from your library…</option>
              {library.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              disabled={!addPick}
              onClick={() => {
                const doc = library.find((g) => g.id === addPick);
                if (!doc) return;
                const { shows: next } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
                setShows(next);
                setAddPick('');
              }}
              data-testid="add-graphic"
            >
              ＋ Add
            </button>
          </div>
          <button
            className="pd-new-graphic"
            onClick={() => {
              useTemplateStore.setState({ pendingProductionId: show.id });
              navigate({ view: 'new' });
            }}
            title="Create a new graphic for this production - the wizard uses its look and adds it here"
            data-testid="production-new-graphic"
          >
            ＋ New graphic for this production…
          </button>
          {/* Pictures, straight into the rundown — one still per cue, on the production's own
              picture layer. The editor is never opened for this, which is the whole point.
              A real <button> driving a hidden input, so it is the same control as its sibling
              rather than a label wearing a button's clothes. */}
          <button
            className="pd-new-graphic"
            onClick={() => pictureInput.current?.click()}
            title={`Add pictures to this production — each one becomes a cue (up to ${MAX_PICTURES})`}
            data-testid="add-pictures"
          >
            ＋ Add pictures…
          </button>
          {/* The playout server's own library - templates and clips already on the CasparCG box,
              through NoaCG Bridge (docs/BRIDGE.md §5). Present only once a server is configured
              under Settings -> Playout: a dead door on the busiest surface would be worse than none. */}
          {playoutConfigured(loadPlayoutSettings()) && (
            <div className="pd-links-host">
              <button
                className="pd-new-graphic"
                onClick={() => setPickerOpen((o) => !o)}
                title="Add a template or a clip that is already on the playout server"
                data-testid="add-from-server"
              >
                ＋ From the playout server…
              </button>
              <PlayoutItemPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                library={library}
                onAdd={(item) => {
                  const { shows: next, cueId } = addPlayoutItem(show.id, { adapter: 'casparcg', ...item });
                  setShows(next);
                  if (cueId) selectCue(cueId);
                }}
              />
            </div>
          )}
          <input
            ref={pictureInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              // COPIED out of the live FileList first: clearing `value` empties that list in
              // place, so reading it afterwards hands the handler nothing at all.
              const files = Array.from(e.target.files ?? []);
              // Cleared so choosing the SAME file again still fires a change event.
              e.target.value = '';
              void uploadPictures(files);
            }}
            data-testid="add-pictures-input"
          />
        </div>
      </aside>
      </>)}
      {exportOpen && <ProductionExportDialog show={show} onClose={() => setExportOpen(false)} />}
    </ProductionShell>
  );
}

/** The shell: header + the two-column body, plus the keyboard verbs. Split out so the page body
 *  above reads as the surface it is rather than as chrome wrapped around a surface. */
/**
 * The browser-output renderer's health, in the operator's words plus what to do about it.
 *
 * The WORD and the SENTENCE are chosen together, in one place, because they are one statement:
 * a status line nobody can act on is decoration, and two parallel ternaries are how the label
 * and its explanation come to describe different states.
 *
 * The three states are the only ones reachable, and the header decides SEPARATELY whether to ask
 * at all - see its own comment. `outputSeenAt` is the renderer's last heartbeat
 * (docs/CLOUD_PLAYOUT.md §3), `rendererFresh` that heartbeat inside the staleness window.
 */
function outputHealth(rendererFresh: boolean, outputSeenAt: string | null): { label: string; why: string } {
  if (rendererFresh) {
    return {
      label: '● output connected',
      why: 'A browser source is loading the output URL and reporting in. What you take goes on air.',
    };
  }
  if (outputSeenAt) {
    return {
      label: '○ output not answering',
      why: 'The output URL was loading, but nothing has reported in for over a minute. Check the browser source (OBS, vMix, CasparCG) is still open on it.',
    };
  }
  return {
    label: '○ output not loaded yet',
    why: 'Nobody has loaded the output URL yet. Open it once in your browser source and it stays connected.',
  };
}

function ProductionShell({
  show,
  now,
  openedAt,
  hostedSlug,
  rendererFresh,
  outputSeenAt,
  liveLayers,
  follow,
  sub,
  onTab,
  onHome,
  onBack,
  onAllOut,
  allOutEnabled,
  onExport,
  onKey,
  links,
  children,
}: {
  show: Show;
  now: number;
  openedAt: number;
  hostedSlug: string | null;
  rendererFresh: boolean;
  outputSeenAt: string | null;
  liveLayers: { layer: number }[];
  follow: ControlFollowStatus | null;
  sub: ProductionSub | null;
  /** Back to Playout IN THIS TAB. The workspaces are links now, never calls into here. */
  onTab: () => void;
  onHome: () => void;
  onBack: () => void;
  onAllOut: () => void;
  /** Whether anything is up to clear - the graphics on the log, or a server cue through the
   *  Bridge, which `liveLayers` does not count. */
  allOutEnabled?: boolean;
  onExport: () => void;
  onKey: (key: PlayoutVerb) => void;
  links: React.ReactNode;
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

  return (
    <div className="app playout-dashboard" data-testid="production-page">
      <header className="pd-header">
        <button className="brand brand-home" onClick={onHome} title="Home">
          <BrandLogo size={22} />
        </button>
        {/* The wizard door, in the SHARED LEFT ORDER every shell uses (owner walk, 2026-08-29:
            "it should be in the same place on every page") - logo, Home, ＋ New graphic. Here
            the logo IS the Home door, so the trio is two controls; what matters is that the
            door is the first thing after Home rather than adrift in the right cluster, where
            the owner found it. It is the SAME door as the rail's "＋ New graphic for this
            production…" - both carry this production, so a graphic made from here joins the
            show you are standing in. Moving it left also puts the width of the whole header
            between it and ■ All out: a hand reaching for the panic control must never land on
            navigation. */}
        <NewGraphicButton productionId={show.id} />
        <button className="pd-back" onClick={onBack} data-testid="production-back">
          ←
        </button>
        <h1><IconTv /> {show.name}</h1>
        <span className={`pd-mode pd-mode-${hostedSlug ? 'show' : 'idle'}`} data-testid="production-mode">
          {hostedSlug ? '● SHOW' : '○ NOT PUBLISHED'}
        </span>
        <span className="pd-clock mono">{elapsed(now - openedAt)}</span>
        {/* NOT JOINED, AND ONLY THEN. A healthy production says nothing new here: the line
            appears when the log's channel has never joined, which is the state that used to
            be invisible. Commands do still arrive - the durable road polls every 30 s - so
            this says SLOW rather than broken, and it is deliberately not an error colour. */}
        {follow && !follow.everJoined && (
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
                title={`Open ${label} in a new tab — this one keeps Playout on screen`}
                data-testid={`tab-${tab}`}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <div className="spacer" />
        {/* The renderer heartbeat — only once published, and only once there IS an output to
            ask about (owner walk, 2026-08-29: he had no browser source set up anywhere and
            still read "output not seen lately", which sounds like something has gone wrong).
            Publishing mints the output slug whether or not anybody wants an output, so the slug
            cannot answer the question; `outputOpenedAt` (the operator took the URL) and
            `outputSeenAt` (a renderer has reported in) can, and either is enough.
            Unpublished the mode chip already says so, and a second "not published" beside it is
            noise, not status.
            The words say what the state IS, and the tooltip says what to do about it — one line
            each, because a status nobody can act on is decoration. */}
        {hostedSlug && (outputSeenAt || show.outputOpenedAt) && (
          <span
            className={`pd-status${rendererFresh ? ' ok' : ''}`}
            data-testid="renderer-status"
            title={outputHealth(rendererFresh, outputSeenAt).why}
          >
            {outputHealth(rendererFresh, outputSeenAt).label}
          </span>
        )}
        {/* The team door (docs/TEAMS_PLAN.md §6), beside the other two "hand this to someone
            else" controls and a header's width away from ■ All out. It is absent offline and
            signed out - `useTeamsAvailable` is the one gate, and this surface asks it rather
            than testing the auth state itself. */}
        {teamsAvailable && (
          <button
            onClick={() => openShare(show.id, show.name)}
            title="Share this production with a team, so everyone works in their own account"
            data-testid="share-with-team"
          >
            <IconUsers /> Share with a team…
          </button>
        )}
        {links}
        <button onClick={onExport} title="Export this production as a package" data-testid="export-production">
          <IconDownload /> Export…
        </button>
        <button
          className="pd-allout"
          disabled={!(allOutEnabled ?? liveLayers.length > 0)}
          onClick={onAllOut}
          title="Play every live layer off — clear the frame"
          data-testid="verb-out-all"
        >
          ■ All out
        </button>
      </header>
      <main className="pd-body">{children}</main>
    </div>
  );
}

/** One box to name a field a server template takes when NoaCG did not make it - the id on the
 *  wire, as FIELDS.md or the template's author names it. */
function AddFieldRow({ onAdd }: { onAdd: (id: string) => void }) {
  const [id, setId] = useState('');
  const submit = () => {
    const clean = id.trim();
    if (!clean) return;
    onAdd(clean);
    setId('');
  };
  return (
    <div className="field-row pd-add-field">
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Add a field id, e.g. f2"
        spellCheck={false}
        aria-label="Field id"
        data-testid="playout-add-field"
      />
      <button onClick={submit} disabled={!id.trim()} data-testid="playout-add-field-go">
        ＋ Field
      </button>
    </div>
  );
}
