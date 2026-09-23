import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  adjustWords,
  controlName,
  labelCarriesDelta,
  arrangeControls,
  arrangeFor,
  eventButtons,
  eventLegality,
  adjustedValue,
  fieldDescriptors,
  formatMachineState,
  illegalEventTitle,
  isEventLegal,
  machineStateGroups,
  machineStateNames,
  overflowNote,
  pressSend,
  OVERFLOW_FIELD_HINT,
  OVERFLOW_FIELD_MARK,
  type ArrangedControl,
  type ArrangeRead,
  type ControlButton,
} from '../control/controlModel';
import {
  CombineScheduler,
  planCombine,
  stepWords,
  askSteps,
  combineBlocked,
  type StepGroup,
} from '../control/combine';
import { commandBatches, resolveCombineSend, type CombineMirror } from '../control/combineSend';
import {
  hostedCombineNames,
  hostedCombineNow,
  hostedCombineWorld,
  hostedCueValues,
  hostedPoolMachines,
  type HostedCombineInput,
} from '../control/hostedCombine';
import { fetchProductionDataBySlug, patchProductionDataBySlug } from '../control/productionDataApi';
import {
  replacementPatch,
  resolveBindings,
  withTreeWrites,
  type JsonObject,
  type ProductionBindings,
  type TreeWrite,
} from '../model/productionData';
import CombinedButton from './control/CombinedButton';
import {
  answerOwnStaged,
  noteOwnStaged,
  sendOwnStaged,
  settleOwnStaged,
  withOwnStaged,
  type OwnStaged,
  type StagedMap,
} from './control/ownStaged';
import type { CombinedControl } from '../model/profile';
import { nextRow, rowsForSide } from '../control/cueData';
import { groupCueFields, groupHeading } from '../control/cueFieldGroups';
import { createAppliedOnce } from '../control/commandRoads';
import { appendLogEntries, describeLogRow, eventLogLabel, logTime, type LogEntry } from '../control/eventLog';
import {
  clearAllCueBatches,
  clearCueItems,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  sendControlVerb,
  stageHostedData,
  takeCueItems,
  verbAired,
  withLiveCue,
  type ControlEventRow,
  type ControlSendItem,
  type LiveCueMap,
  type OutputCue,
  type PanelGraphicSpec,
  type ResolvedControlShow,
} from '../control/hostedControl';
import { isBackendConfigured } from '../backend/config';
import { fastEventGraphics as clockFreeGraphics } from '../control/matchClockWire';
import { detectPrefix } from '../model/structure';
import { graphicKindLabel } from '../model/types';
import { FieldControl } from './fields/FieldControl';
import PayloadStage, { type PayloadStageHandle } from './home/PayloadStage';
import {
  revealCue,
  spaceAction,
  stepSelection,
  takeFace,
  usePlayoutVerbKeys,
  useSpaceMode,
  type PlayoutVerb,
  type SpaceAction,
  type SpaceMode,
} from './playoutKeys';
import { SpaceModeToggle } from './SpaceModeToggle';
import { PREVIEW_EMPTY_LABEL } from '../control/spaceMode';

/**
 * The HOSTED control page — the operator surface at `<app-url>?control=<slug>`. No login, no
 * builder shell; the unguessable slug is the capability (the ?chat= pattern).
 *
 * It renders THE PLAYOUT DASHBOARD: docs/PLAYOUT_DASHBOARD.md is the binding design, shared with
 * the in-app production page and the exported controller. Before that contract this page was a
 * FORM — no monitors at all, one tall card per graphic stacked down a narrow column, so an
 * operator could neither see what they were about to air nor what was on it. A student who
 * learned the exported controller could not operate this.
 *
 * BOTH MONITORS ARE REAL, and neither needs anything new from the backend: the published payload
 * already carries every graphic's code, so PREVIEW is a local stage this page drives itself and
 * PROGRAM is a second local stage driven by the shared LOG — which means it shows what is really
 * on air, including a take from somebody else's device.
 *
 * Multi-operator by construction: field edits go to the SHARED staging buffer (every open page
 * follows them), a take publishes them as an update command, and each graphic reports what it
 * actually applied. All of it rides the one durable log, so a refresh of any participant
 * recovers.
 */
/** How far behind the log head the action log seeds its history — the in-app page's number. */
const LOG_HISTORY_SPAN = 400;

/** A graphic's machine state as a renderer reports it and as a monitor stage reads it. */
type MachineReport = { groups?: Record<string, string> } | null;

export default function HostedControlPage({ slug }: { slug: string }) {
  const [show, setShow] = useState<ResolvedControlShow | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  /**
   * EACH GRAPHIC'S MACHINE STATE, from whichever source spoke last: a renderer's report off the
   * log, or this page's own PROGRAM monitor, which follows the same log. The in-app dashboard
   * has always read its monitor this way (ProductionPage `noteMachineState`); this page read
   * ONLY renderer reports, so with no /output open yet - a class rehearsing on a phone - the
   * state chip never appeared and the ⚡ actions were judged against nothing at all.
   */
  const [machineState, setMachineState] = useState<Record<string, MachineReport>>({});
  const noteMachineState = useCallback((graphic: string, state: MachineReport) => {
    setMachineState((m) => (JSON.stringify(m[graphic] ?? null) === JSON.stringify(state) ? m : { ...m, [graphic]: state }));
  }, []);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  /** The cue on PREVIEW in 'preview-then-take' SPACE mode - see the in-app page's twin; the
   *  selection is only a cursor there and SPACE is what puts a cue here. */
  const [stagedCueId, setStagedCueId] = useState<string | null>(null);
  const [spaceMode, setSpaceMode] = useSpaceMode();
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  /** The operator ACTION LOG (control/eventLog.ts) — the same feed the in-app dashboard shows,
   *  and it matters more here: this is the multi-operator surface, where "who took that?" is a
   *  real question and the page was already reading every one of these rows to drive PROGRAM. */
  const [wireLog, setWireLog] = useState<LogEntry[]>([]);
  /**
   * What each graphic was last told to SHOW — the baseline the unsent-changes warning is judged
   * against. It follows the wire, not this page's own presses, so an edit somebody else aired
   * clears the warning here too.
   */
  const [airedData, setAiredData] = useState<Record<string, Record<string, string>>>({});
  /**
   * THIS PAGE'S OWN STAGED EDITS, until the shared buffer shows them back (control/ownStaged.ts).
   * Everything that reads "what a Take of this cue sends" reads the buffer with these laid over
   * it, so a key picked a moment before Take is the key that airs.
   */
  const [ownStaged, setOwnStaged] = useState<OwnStaged>({});
  /** The shared buffer as its rows have delivered it, written the moment a row arrives rather
   *  than at the next render: a write's answer can land between the two, and it has to see
   *  whether its own row already came back. */
  const sharedStaged = useRef<StagedMap>({});
  /** Ids for the feed lines this SURFACE writes (a dropped step, a cancelled tail). Negative, so
   *  they can never collide with a log row's own id. */
  const localLogId = useRef(0);

  // ── PRODUCTION DATA on the operator's surface (docs/PRODUCTION_DATA_PLAN.md §2.9, AC-7) ──
  //
  // One value many graphics follow. This page holds the TREE and the BINDINGS because it does
  // three things with them: it airs the shared figure on a Take rather than the cue's prepared
  // one (§2.7), it counts a ± press or an `adjust` from the tree, and it writes the tree back
  // through `control_data_patch_by_slug` so every OTHER bound graphic follows. It reads both on
  // the control slug it already holds - there is no data key here and there must never be one.
  //
  // Empty for a production that has bound nothing, and then every road below is the road this
  // page has always taken.
  const [dataTree, setDataTree] = useState<JsonObject>({});
  const [bindings, setBindings] = useState<ProductionBindings>({});
  /** The tree as it is RIGHT NOW, for a press whose render is already stale. */
  const dataTreeRef = useRef<JsonObject>(dataTree);
  dataTreeRef.current = dataTree;
  /** Pull the server's tree in - at load, and whenever a row says somebody else moved it. */
  const refreshData = useRef<() => void>(() => {});

  const previewRef = useRef<PayloadStageHandle>(null);
  const programRef = useRef<PayloadStageHandle>(null);

  // ── COMBINED CONTROLS, the surface's half (src/control/combine.ts, plan §6b) ──
  //
  // The same resolver, the same scheduler and the same button as the in-app production page. What
  // is this page's own is the plane underneath: a step's row goes out through the hosted batch
  // RPC every verb here uses, so it is attributed to this operator and lands on the one durable
  // log with everybody else's — and a moved figure is mirrored into the SHARED staging buffer
  // rather than into a stored cue, because on this surface that is where an operator's values
  // live (docs/CONTROL_LAYER.md, "Hosted control").
  /** Which `ask` ticks the operator has moved, by `<control id>\0<step index>`. An absence reads
   *  the step's DECLARED default, never "off". */
  const [combineTicks, setCombineTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  /** Bumped whenever a run arms, fires or is cancelled, and by the countdown's own interval. The
   *  scheduler holds no React, so this is how a wait repaints. */
  const [combineTick, setCombineTick] = useState(0);
  /** The fields a combined press just MOVED, handed to the cue editor so its boxes say what the
   *  board says. A fresh ARRAY per press, because two presses of one control carry the same
   *  values and the editor has to act on both. */
  const [combineMoved, setCombineMoved] = useState<CombineMirror[] | null>(null);
  const schedulerRef = useRef<CombineScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new CombineScheduler({ onChange: () => setCombineTick((t) => t + 1) });
  }
  const scheduler = schedulerRef.current;
  /** How a fired group reaches the wire, REASSIGNED on every render. A group can fire seconds
   *  after the press, and a closure captured at press time would send against the production as
   *  it was — the staleness the whole fire-time design exists to avoid. */
  const fireCombineRef = useRef<(control: CombinedControl, due: StepGroup[]) => void>(() => {});
  // A tab that goes away takes its waits with it. That is §6d's accounting rather than a leak
  // being tidied: the wait lives in the surface that pressed, and nothing is retried elsewhere —
  // which matters most here, because this is the page a show is really operated from.
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
   * WHAT THIS OPERATOR SEES, from whichever road the command arrived on.
   *
   * A published verb travels twice (src/control/commandRoads.ts): the database's broadcast on the
   * production's private topic, about 100 ms after the press, and the durable row behind it at
   * 130-650 with a slow mode past 600. This page also presses verbs of its own,
   * which arrive faster than either. `applied` decides which arrival counts, on the id the press
   * minted - and nothing else could, because a second `play` re-runs an entrance and settles on
   * the picture that was already there. `PayloadStage` counts them as `data-plays` and
   * e2e/configured/playout-both-roads.spec.ts reads that count on this very page.
   */
  const applied = useRef(createAppliedOnce());
  const applyCommand = useCallback((items: { graphic: string; msg: ControlEventRow['msg'] }[]) => {
    for (const item of items) {
      if (!applied.current.claim(item.msg)) continue;
      const msg = item.msg;
      // A cue row names its own graphic, so it only ever speaks for that ONE layer - and it
      // rides the same road as the picture, or the ON AIR marker and the monitor would disagree
      // for a third of a second.
      if (msg.t === 'cue') setLiveCue((m) => withLiveCue(m, item.graphic, msg.cue));
      // 'staged' is another operator typing and 'live' is the renderer REPORTING - neither is a
      // command, and both are the follower's business rather than the stage's.
      else if (msg.t !== 'staged' && msg.t !== 'live') {
        // A RENDERER command: mirror it onto the PROGRAM monitor, so this page shows what
        // actually reached air rather than only what its own buttons sent.
        programRef.current?.apply([{ graphic: item.graphic, msg }]);
        // …and remember what it put on air, which is what makes "not sent yet" honest.
        if (msg.t === 'update') {
          setAiredData((prev) => ({ ...prev, [item.graphic]: { ...prev[item.graphic], ...msg.data } }));
        } else if (msg.t === 'event' && msg.payload) {
          // AN ACCEPTED EVENT'S PAYLOAD IS ALSO WHAT AIR SHOWS. A goal's +1 rides moved through
          // the same field path an update takes, so leaving it out of this baseline was wrong
          // twice: the unsent-changes chip announced "1 change not on air yet" about a figure the
          // press had just aired, and a combined control's delayed step counts from this map —
          // so two presses of one `+1` both read the figure before the first and the score froze
          // one short. The in-app page has always merged it here (`rememberAired`); this page's
          // own ⚡ button quietly worked around the gap by counting from its staged echo instead.
          setAiredData((prev) => ({ ...prev, [item.graphic]: { ...prev[item.graphic], ...msg.payload } }));
        } else if (msg.t === 'stop') {
          // Off air: forget it, or the next take would compare against a stale baseline.
          setAiredData((prev) => {
            if (!prev[item.graphic]) return prev;
            const next = { ...prev };
            delete next[item.graphic];
            return next;
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured()) {
      setShow(null);
      return;
    }
    let live = true;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const resolved = await controlShowBySlug(slug);
      if (!live) return;
      setShow(resolved);
      if (!resolved) return;
      sharedStaged.current = { ...resolved.staged };
      const tail = (after: number) => hostedControlTail(slug, after);
      // The production's shared values and what follows them. Read separately from the panel
      // because the panel is AUTHORED state pinned at publish and the tree is what is true right
      // now - a feed may have moved it a second ago.
      refreshData.current = () => {
        void fetchProductionDataBySlug(slug).then((state) => {
          if (!live || !state) return;
          setDataTree(state.data as JsonObject);
          setBindings(state.bindings);
        });
      };
      refreshData.current();
      // Which cues were already on air comes off the ROW (0031's snapshot, per-layer since
      // 0034), seeded before following so old rows can never overwrite a newer fact.
      setLiveCue(resolved.liveCue);
      setMachineState(Object.fromEntries(Object.entries(resolved.live).map(([g, report]) => [g, report?.state ?? null])));
      // The unsent baseline starts at what each live graphic REPORTED applying — a page opened
      // mid-show must not announce changes against an empty baseline it never saw aired.
      setAiredData(
        Object.fromEntries(
          Object.entries(resolved.live)
            .map(([graphic, report]) => [graphic, report?.data ?? {}] as const)
            .filter(([, data]) => Object.keys(data).length > 0),
        ),
      );
      // A cue id means nothing to an operator; they wrote the NAME, so that is what the log
      // says. The cues are fixed until a republish, so closing over them here is exact.
      const cueLabel = (cueId: string) =>
        resolved.output?.cues.find((c) => c.id === cueId)?.label ?? null;
      // …and a ⚡ press by the name on its button, read off the published graphic's own machine
      // (control/eventLog.ts). Parsed once per graphic, lazily, since most rows are not events.
      const buttons = new Map<string, ControlButton[]>();
      const eventLabel = (graphic: string, event: string) => {
        if (!buttons.has(graphic)) {
          const js = resolved.panel.find((g) => g.name === graphic)?.js;
          buttons.set(graphic, js ? eventButtons(js) : []);
        }
        return eventLogLabel(buttons.get(graphic)!, event);
      };
      const history = await hostedControlTail(slug, Math.max(0, resolved.lastEventId - LOG_HISTORY_SPAN));
      if (!live) return;
      setWireLog((l) =>
        appendLogEntries(l, history.map((r) => describeLogRow(r, cueLabel, eventLabel)).filter((e): e is LogEntry => !!e)),
      );
      unsubscribe = await followControlLog({
        showId: resolved.id,
        from: resolved.lastEventId,
        tail,
        // THE FAST ROAD - the verbs, broadcast by the database and here before their rows are.
        onCommand: applyCommand,
        onRow: (row) => {
          const msg = row.msg;
          // The SAME door the broadcast comes through, so a command applies once whichever road
          // won it. What stays here is what is a property of the ROW rather than of the verb.
          applyCommand([{ graphic: row.graphic, msg }]);
          if (msg.t === 'staged') {
            setShow((s) => (s && s !== 'loading' ? { ...s, staged: { ...s.staged, [row.graphic]: msg.data } } : s));
            sharedStaged.current = { ...sharedStaged.current, [row.graphic]: msg.data };
            setOwnStaged((own) => settleOwnStaged(own, row.graphic, msg.data));
          } else if (msg.t === 'live') {
            noteMachineState(row.graphic, msg.state ?? null);
            setShow((s) =>
              s && s !== 'loading' ? { ...s, live: { ...s.live, [row.graphic]: { data: msg.data, state: msg.state } } } : s,
            );
          } else if (typeof (msg as { src?: string }).src === 'string') {
            // THE TREE MOVED SERVER-SIDE - a feed (`src:'api'`) or a press on another dashboard
            // (`src:'operator'`). The row carries the resolved FIELD values, never the tree, so
            // this page has to re-read it: the figures on air are already right, but the next
            // press has to count from the new value and the next Take has to air it.
            refreshData.current();
          }
          const entry = describeLogRow(row, cueLabel, eventLabel);
          if (entry) setWireLog((l) => appendLogEntries(l, [entry]));
        },
      });
    })();
    return () => {
      live = false;
      unsubscribe?.();
    };
    // `applyCommand` and `noteMachineState` are declared with no dependencies of their own, so
    // listing them re-runs nothing. `applyCommand` is here because the follow now hands it BOTH
    // roads and a silent capture would be the easiest way for the two to drift.
  }, [slug, applyCommand, noteMachineState]);

  const resolved = show && show !== 'loading' ? show : null;
  /** The staged values this page acts on: the shared buffer, with this page's own edits that
   *  have not come back round the log yet laid over it. */
  const staged = withOwnStaged(resolved?.staged ?? {}, ownStaged);
  const cues: OutputCue[] = useMemo(() => resolved?.output?.cues ?? [], [resolved]);
  const payload = resolved?.output ?? null;
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  /** What PREVIEW shows: the selection in 'take' mode, the staged cue - or nothing - otherwise. */
  const previewedCue =
    spaceMode === 'take' ? selectedCue : (cues.find((c) => c.id === stagedCueId) ?? null);
  const specByName = useMemo(
    () => new Map((resolved?.panel ?? []).map((g) => [g.name, g] as const)),
    [resolved],
  );
  /** Every published graphic's machine, parsed once (`control/hostedCombine.ts`): the ⚡ block
   *  below reads ONE graphic because that is what an action acts on, but a COMBINED control's
   *  steps name their own graphics, so the whole pool has to be parsed. */
  const poolMachines = useMemo(() => hostedPoolMachines(resolved?.panel ?? []), [resolved]);
  /**
   * The published graphics whose EVENTS may ride the fast road: every one that runs no clock
   * (matchClockWire `eventsNeedServerTime`). Positive, so a graphic this page cannot see keeps
   * the slow road. The production dashboard derives the same set from the same test.
   *
   * PINNED AT PAGE OPEN, like everything else this page reads: the payload is resolved once per
   * slug and a republish does not reach it. So a graphic that GAINS a clock mid-show keeps its
   * events on the fast road here until this page is reloaded, and that clock's origin would come
   * from the renderer rather than the row. Narrow and deliberate for now - the dashboard, which
   * republishes, recomputes its own answer at that moment.
   */
  const fastEventGraphics = useMemo(() => clockFreeGraphics(payload?.graphics ?? []), [payload]);
  const layerOf = useCallback(
    (graphic: string) => payload?.graphics.find((g) => g.key === graphic)?.layer ?? null,
    [payload],
  );
  /** Which graphics SHARE a layer with the named one. Two on one number replace each other on
   *  air, and with the layer list gone the rundown row is where that is said (§5). */
  const layerSharedWith = useCallback(
    (graphic: string) => {
      const layer = payload?.graphics.find((g) => g.key === graphic)?.layer ?? null;
      if (layer === null) return [];
      return (payload?.graphics ?? []).filter((g) => g.key !== graphic && (g.layer ?? 1) === layer).map((g) => g.key);
    },
    [payload],
  );
  /** The KIND word per graphic, derived from the published CODE (detectPrefix) — the payload
   *  predates any stored kind field, so deriving keeps every already-published production
   *  labelled without a republish. Null when the code carries no recognisable box prefix. */
  /** Cues over the playout server's library (docs/BRIDGE.md §5), as published. Listed so both
   *  dashboards read one rundown; not takeable here, because they go through NoaCG Bridge on
   *  the operator's own machine and this page may be a phone across the venue. */
  const playoutCues = payload?.playoutCues ?? [];
  const kindByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of payload?.graphics ?? []) {
      const prefix = detectPrefix(g.html);
      if (prefix) map.set(g.key, graphicKindLabel(prefix));
    }
    return map;
  }, [payload]);

  /** Show the selected cue on PREVIEW — local only, never the wire (§1: selection IS preview). */
  /**
   * WHICH VALUES DID NOT FIT, per graphic, from each monitor separately (the field ids the
   * runtime reports through `noacgTextOverflow()` once its fit ladder has run out of room -
   * owner ruling 2026-08-23, docs/SVG_IMPORT_PLAN.md §3).
   *
   * Two maps, because the two monitors are showing different things: PREVIEW carries the values
   * being typed here, PROGRAM carries what is on air. An editor pointed at the live cue must
   * warn about air; pointed at a staged cue, about what a TAKE would put up.
   */
  const [previewOverflow, setPreviewOverflow] = useState<Record<string, string[]>>({});
  const [programOverflow, setProgramOverflow] = useState<Record<string, string[]>>({});
  const noteOverflow = useCallback(
    (set: typeof setPreviewOverflow) => (graphic: string, _state: unknown, keys: string[]) =>
      set((m) => ((m[graphic] ?? []).join(',') === keys.join(',') ? m : { ...m, [graphic]: keys })),
    [],
  );
  const showOnPreview = useCallback(
    (cue: OutputCue | null, values?: Record<string, string>) => {
      if (!cue) return;
      previewRef.current?.apply([
        { graphic: cue.graphic, msg: { t: 'update', data: values ?? cue.values } },
        { graphic: cue.graphic, msg: { t: 'play' } },
      ]);
    },
    [],
  );

  // RECOVERY for the PROGRAM monitor. The log follower only sees rows that arrive AFTER this
  // page opened, so a production that has been on air all afternoon would show an empty PROGRAM
  // box beside a rundown row marked ON AIR - the surface contradicting itself. So every live
  // layer is replayed into the monitor with the in-app dashboard's recipe (`restoreProgram`):
  // data, a snap to the machine state last known, data again. A bare play() left the monitor at
  // the entrance while air sat mid-sequence, and since the state chip also reads this monitor,
  // its reply overwrote the renderer's "Locked in" with the entrance state - a quiz tab reloaded
  // while locked greyed Reveal correct, the one press the show needed next. The trailing data
  // write lets call-painted looks repaint after the snap (the G9 rule).
  //
  // Safe here in a way it was NOT in an exported package: this stage drives nothing but itself.
  // The round-1 bug was a baked log follower snapping a REAL playout graphic to its last
  // reported (off) state one round-trip after the host's play().
  //
  // IT RUNS WHEN A STAGE IS BUILT (`PayloadStage` `onReady`), never when `liveCue` moves. The
  // live map also moves when this operator's own take comes back round the log, and a recovery
  // keyed on it replayed the entrance the follower had just applied - the monitor playing the
  // graphic in twice. It used to run ONCE, from an effect, which missed the stage actually on
  // screen whenever the stage is built twice: React's development StrictMode builds, destroys
  // and rebuilds it on mount, so the replay went into the destroyed stage and the one left on
  // screen came up blank, reporting "Off" a second after the reload.
  //
  // Read through refs: a stage can come up long after the render that passed this callback.
  const liveCueRef = useRef(liveCue);
  liveCueRef.current = liveCue;
  const airedRef = useRef(airedData);
  airedRef.current = airedData;
  const machineStateRef = useRef(machineState);
  machineStateRef.current = machineState;
  const reportsRef = useRef<ResolvedControlShow['live']>({});
  reportsRef.current = resolved?.live ?? {};
  const restoreProgram = useCallback(() => {
    for (const [graphic, cueId] of Object.entries(liveCueRef.current)) {
      if (!cueId) continue;
      const data = airedRef.current[graphic] ?? reportsRef.current[graphic]?.data;
      const groups = machineStateRef.current[graphic]?.groups;
      const dataItem = data ? [{ graphic, msg: { t: 'update' as const, data } }] : [];
      programRef.current?.apply([
        ...dataItem,
        groups ? { graphic, msg: { t: 'snap' as const, snap: groups } } : { graphic, msg: { t: 'play' as const } },
        ...dataItem,
      ]);
    }
  }, []);

  /**
   * ONE effect drives the PREVIEW stage, from what the page has already derived: the cue on
   * PREVIEW and the values a Take of it would send RIGHT NOW - the cue's own, the SHARED staged
   * buffer over them and the bound values over both, the same reading `cueValues` below makes.
   * The stage used to be pushed from four places (arrival, selection, staging, the mode switch)
   * and the four did not cover every transition - unticking the box after walking on left the
   * monitor on the old cue while the label named the new one. Worse, the staged buffer is keyed
   * by GRAPHIC, so typing into a sibling cue moves what a Take of the previewed cue sends; the
   * monitor has to follow that too, or PREVIEW shows one name and air gets another. The values
   * ride as a key so the effect re-runs exactly when they move. A cue of another graphic leaving
   * PREVIEW is stopped, so the stage shows the one cue the label names rather than a stack.
   * Above the loading returns because it is a hook; it does nothing until the payload exists.
   */
  const previewValuesKey = previewedCue
    ? JSON.stringify(hostedCueValues(previewedCue, staged, resolveBindings(dataTree, bindings)))
    : '';
  const previewShown = useRef<{ arrived: boolean; graphic: string | null }>({ arrived: false, graphic: null });
  useEffect(() => {
    if (!payload) return;
    const graphic = previewedCue?.graphic ?? null;
    // The stage needs a moment to exist on arrival; after that every change lands at once.
    const t = setTimeout(() => {
      const was = previewShown.current.graphic;
      if (was && was !== graphic) previewRef.current?.apply([{ graphic: was, msg: { t: 'stop' } }]);
      previewShown.current = { arrived: true, graphic };
      if (previewedCue) showOnPreview(previewedCue, JSON.parse(previewValuesKey) as Record<string, string>);
    }, previewShown.current.arrived ? 0 : 400);
    return () => clearTimeout(t);
  }, [payload, previewedCue, previewValuesKey, showOnPreview]);

  if (show === 'loading') {
    return (
      <div className="sendin">
        <div className="sendin-card"><p className="muted">Loading…</p></div>
      </div>
    );
  }
  if (!show) {
    return (
      <div className="sendin">
        <div className="sendin-card">
          <div className="sendin-title">Control page not found</div>
          <p className="muted">
            {isBackendConfigured()
              ? 'This link is invalid or the page was unpublished.'
              : 'Hosted control needs the cloud backend, and this build runs offline.'}
          </p>
          {error && <p className="muted">{error}</p>}
        </div>
      </div>
    );
  }

  // A verb whose picture MOVED HERE and then failed to send is a different sentence from one that
  // never happened: this page applied it to its own monitor before the round trip, so an operator
  // is looking at something the other screens are not showing. That question is asked FIRST,
  // ahead of the rate limit - the log's 50-per-5-s cap is the likeliest way to reach this at all,
  // and "slow down a moment" would tell an operator whose graphic is up that nothing happened.
  const surfaceSendError = (e: Error) =>
    setError(
      verbAired(e)
        ? `That is on this monitor only. It may not have reached the screens or the log (${e.message}). Send it again.`
        : /slow down/i.test(e.message)
          ? 'Too many commands. Slow down a moment.'
          : `Send failed: ${e.message}`,
    );

  /**
   * ONE DOOR for every verb this page presses, on BOTH ROADS (src/control/commandRoads.ts): this
   * page's own monitor with no hop at all, and one send that both writes the durable row and has
   * the database broadcast the same commands to every other surface. It answers whether it LANDED,
   * so a caller sending several batches can stop at the first refusal rather than pressing on.
   */
  const sendVerb = (items: ControlSendItem[]): Promise<boolean> =>
    sendControlVerb({
      slug,
      showId: resolved?.id ?? null,
      items,
      applyHere: applyCommand,
      fastEvents: (graphic) => fastEventGraphics.has(graphic),
    }).then(
      () => true,
      (e: Error) => {
        surfaceSendError(e);
        return false;
      },
    );

  /** The layers that are up, front to back. */
  const liveLayers = (payload?.graphics ?? [])
    .map((g) => ({ graphic: g.key, layer: g.layer ?? 1, cueId: liveCue[g.key] ?? null }))
    .filter((l): l is { graphic: string; layer: number; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }))
    .sort((a, b) => b.layer - a.layer);

  const selectedGraphic = selectedCue?.graphic ?? null;
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedIsLive = !!selectedCue && selectedLayerCueId === selectedCue.id;
  /** The selected cue is the one on PREVIEW - always in 'take' mode; in the other mode it is
   *  what separates a SPACE that previews from a SPACE that airs. */
  const selectedIsPreviewed = !!selectedCue && previewedCue?.id === selectedCue.id;
  /** What SPACE - and the TAKE button wearing it - does next; one table, `playoutKeys.ts`. */
  const spaceNext = spaceAction(spaceMode, { live: selectedIsLive, previewed: selectedIsPreviewed });
  const spec: PanelGraphicSpec | null = selectedGraphic ? specByName.get(selectedGraphic) ?? null : null;

  /** What the production's bindings resolve to right now: the figure every bound field on every
   *  bound graphic is showing. One resolve per render, not one per cue. */
  const boundValues = resolveBindings(dataTree, bindings);

  /** The values the operator sees for the selected cue: the cue's own, with the SHARED staged
   *  buffer over them (another operator typing is visible here, by design) and the production's
   *  BOUND values over both (plan §2.7 - a bound field is never a cue value). The one reading,
   *  shared with a combined control's verb step so the two cannot send different Takes. */
  const cueValues = (cue: OutputCue) => hostedCueValues(cue, staged, boundValues);

  /**
   * STAGE values into the shared buffer. They count on this page AT ONCE (the overlay above), so
   * a Take pressed during the round trip airs them, and they leave the overlay once the buffer
   * shows them with nothing more of theirs on the way. A refused write leaves it too, or this
   * page would keep airing a value no other screen ever saw.
   */
  const noteStaged = (graphic: string, data: Record<string, string>) =>
    setOwnStaged((own) => noteOwnStaged(own, graphic, data));
  const stageShared = (graphic: string, data: Record<string, string>) => {
    if (Object.keys(data).length === 0) return;
    setOwnStaged((own) => sendOwnStaged(noteOwnStaged(own, graphic, data), graphic, data));
    const answered = (ok: boolean) =>
      setOwnStaged((own) => answerOwnStaged(own, graphic, data, ok, sharedStaged.current[graphic]));
    stageHostedData(slug, graphic, data).then(
      () => answered(true),
      (e: Error) => {
        answered(false);
        setError(e.message);
      },
    );
  };

  /**
   * A PRESS MOVING THE SHARED VALUE - the ± stepper and an event's `adjust` on a BOUND field.
   *
   * The write goes to the production tree and comes back out as ordinary `update` rows for every
   * graphic bound to that path, which is the whole point of AC-7: a score entered once shows
   * everywhere. It rides the control slug this page already holds (`productionDataApi.ts` says
   * why that is the honest credential and why the rows are not the feed's), and the ANSWER is
   * what we then hold, so a feed tick that landed in the same moment is already merged into it.
   */
  const patchBound = async (writes: TreeWrite[]): Promise<void> => {
    if (writes.length === 0) return;
    const before = dataTreeRef.current;
    const next = withTreeWrites(before, writes);
    const patch = replacementPatch(before, next);
    if (Object.keys(patch).length === 0) return;
    // OPTIMISTIC, and not as a nicety: the ref is what the NEXT press counts from, and an RPC is a
    // round trip. Four ± presses inside one of those all read the figure from before the first and
    // the score moved by one instead of by four - the unbound stepper beside this one never had the
    // problem because it echoes locally before sending.
    dataTreeRef.current = next;
    setDataTree(next);
    try {
      // The ANSWER is what we then hold: a feed tick that landed in the same moment is already
      // merged into it, so the press cannot silently overwrite the feed's write.
      const server = (await patchProductionDataBySlug(slug, patch)) as JsonObject;
      dataTreeRef.current = server;
      setDataTree(server);
    } catch (error) {
      setError(`The shared value did not move: ${(error as Error).message}`);
      refreshData.current();
    }
  };

  /** The production-data paths one graphic has bound, read safely off a user-typed name. */
  const boundFields = (graphic: string): Record<string, string> =>
    (Object.prototype.hasOwnProperty.call(bindings, graphic) ? bindings[graphic] : undefined) ?? {};

  // ── COMBINED CONTROLS (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b; the runtime is control/combine.ts
  // and control/combineSend.ts, both shared with the in-app production page)
  //
  // The list comes off the PUBLISHED profile column, which `controlShowBySlug` already ran
  // through `readPublishedProfile` — so a profile a newer build wrote renders no combined
  // controls at all here, exactly as it renders none of its arrangement.

  const combineControls = resolved?.profile?.combine ?? [];

  /**
   * WHAT THIS SURFACE CURRENTLY HOLDS, as `control/hostedCombine.ts` reads it: every published
   * graphic's liveness and legality, what each cue would send, and — the part that is this
   * page's own — what the WIRE last put on air.
   *
   * Built fresh every render and reached through `fireCombineRef`, never captured at press
   * time: a group can fire seconds later, and a closure from the press would send against the
   * production as it WAS. A delayed `+1` therefore counts from the figure another operator's
   * surface just put up, and two phones driving one show move the score by two.
   */
  const combineAt: HostedCombineInput = {
    panel: resolved?.panel ?? [],
    cues,
    liveCue,
    live: resolved?.live ?? {},
    staged,
    aired: airedData,
    profile: resolved?.profile ?? null,
    bindings,
    resolved: boundValues,
  };
  const combineNow = hostedCombineNow(poolMachines, combineAt);
  const combineNames = hostedCombineNames(poolMachines, combineAt);
  const combineWorld = hostedCombineWorld(poolMachines, combineAt);

  /** One line of the activity feed that is NOT a command row — a step the machine dropped, or a
   *  tail an Out cancelled. Both are things this operator asked for that did not happen, and the
   *  feed is the only place on this surface that says so. It is local to this page on purpose:
   *  another operator's screen has its own tails and its own drops. */
  const feedNote = (text: string, graphic: string) => {
    setWireLog((l) =>
      appendLogEntries(l, [
        { id: (localLogId.current -= 1), at: new Date().toISOString(), graphic, kind: 'note', text },
      ]),
    );
  };

  /**
   * SEND THE STEPS THAT ARE DUE — called at the moment they fire, so a delayed step reads the
   * wire as it stands then. Reassigned every render rather than captured at the press.
   *
   * The batches go out IN ORDER and stop at the first refusal: the likeliest refusal is the log's
   * 50-per-5-s cap, and pressing on past it spends the rest of the allowance on batches that will
   * be refused too — the same rule ■ All out already follows.
   */
  fireCombineRef.current = (control, due) => {
    const { steps, mirrors, dropped, tree } = resolveCombineSend(due, combineNow, combineWorld);

    for (const drop of dropped) {
      feedNote(
        `“${control.name}” skipped ${stepWords(drop.step, combineNames)}, because ${drop.why}`,
        drop.graphic,
      );
    }
    // THE MIRROR, on this surface, is the SHARED staging buffer: a moved figure has to become what
    // every open page counts from and what the next ⟳ TAKE re-sends, and here that is one row
    // rather than a write to a stored cue this page cannot author.
    //
    // …AND THE EDITOR'S OWN ECHO, which is not the same thing. The cue editor reads
    // `echo[key] ?? staged[key]`, so a field this operator has ever typed into keeps the typed
    // figure until the echo is corrected — the box would read 3 while the board reads 5, and the
    // next plain ⚡ press would count from 3 and send the board backwards. The single ⚡ button
    // does both writes for exactly this reason; a combined press cannot reach the editor's state
    // from here, so it hands the moved fields down instead.
    for (const mirror of mirrors) {
      stageShared(mirror.graphic, mirror.values);
    }
    if (mirrors.length > 0) setCombineMoved(mirrors);
    if (steps.length === 0) {
      // A press whose every step moved only SHARED values still has work to do: those figures
      // never rode the wire as fields, and their rows come out of the patch road instead.
      void patchBound(tree);
      return;
    }
    void (async () => {
      for (const batch of commandBatches(steps)) if (!(await sendVerb(batch))) return;
      // AFTER the steps went, never before: the figure the whole production follows must not move
      // for a press the log refused.
      await patchBound(tree);
    })();
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

  const tickKey = (controlId: string, index: number) => `${controlId}\u0000${index}`;
  const tickOn = (controlId: string, index: number, declared: boolean) =>
    combineTicks.get(tickKey(controlId, index)) ?? declared;

  /** Press a combined control — or, while it is counting down, cancel what it has not sent. The
   *  countdown IS the cancel, which is what makes an armed wait something one operator can stand
   *  down under pressure with the control already under their thumb. */
  const pressCombine = (control: CombinedControl) => {
    if (scheduler.waiting(control.id)) {
      const dropped = scheduler.cancel(control.id);
      if (dropped > 0) {
        feedNote(`“${control.name}” cancelled, ${dropped} step${dropped === 1 ? '' : 's'} not sent`, '');
      }
      return;
    }
    const ticked = new Set(
      askSteps(control)
        .filter((a) => tickOn(control.id, a.index, a.on))
        .map((a) => a.index),
    );
    if (combineBlocked(control, combineNow, ticked)) return;
    scheduler.press(control.id, planCombine(control, ticked), (due) => fireCombineRef.current(control, due));
  };

  const takeCue = (cue: OutputCue) =>
    sendVerb(takeCueItems({ id: cue.id, graphic: cue.graphic, values: cueValues(cue) }));
  const nextLayer = () => {
    if (selectedGraphic) void sendVerb([{ graphic: selectedGraphic, msg: { t: 'next' } }]);
  };
  const outLayer = () => {
    // OUT IS THE STOP. An operator taking a graphic off air has ended whatever was running, so
    // any combined control still counting down loses its tail rather than firing into a screen
    // that is now empty (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b). It runs BEFORE the send, so the
    // tail cannot go out during the round trip.
    cancelCombines('Out');
    if (selectedGraphic) void sendVerb(clearCueItems(selectedGraphic));
  };
  const updateLive = () => {
    if (selectedGraphic && selectedCue && selectedIsLive) {
      void sendVerb([{ graphic: selectedGraphic, msg: { t: 'update', data: cueValues(selectedCue) } }]);
    }
  };
  /**
   * Snap the live graphic straight to a state — RECOVERY, never an animation, and a null group
   * resets every group to its initial. Recovery is BOTH halves (docs/STATE_MACHINE_SCHEMA.md:
   * reset the visual state and reset the data are never conflated), so the snap rides with an
   * update of the cue's values: the snap replays intermediate states with suppressed callbacks,
   * and the trailing data write is what lets their call-painted looks repaint from the fields.
   *
   * This page had no way to do it at all, which is the wrong page to lack it: it is the one
   * being operated from a phone, away from the machine running the renderer, when air and the
   * dashboard get out of step.
   */
  const snapTo = (groupId: string | null, stateId: string) => {
    if (!selectedGraphic || !selectedLayerCueId || !selectedCue) return;
    void sendVerb([
      { graphic: selectedGraphic, msg: { t: 'snap', snap: groupId === null ? null : { [groupId]: stateId } } },
      { graphic: selectedGraphic, msg: { t: 'update', data: cueValues(selectedCue) } },
    ]);
  };
  const outAll = () => {
    cancelCombines('All out');
    // `control_send_many` takes at most 8 items, so a clear of more than four layers is more than
    // one verb - and each batch is its own press as far as the two roads are concerned. It STOPS
    // at the first refusal: the likeliest refusal is the command-rate cap, and pressing on past it
    // spends the rest of the allowance on batches that will be refused too.
    void (async () => {
      for (const batch of clearAllCueBatches(liveLayers.map((l) => l.graphic))) {
        if (!(await sendVerb(batch))) return;
      }
    })();
  };

  // Selecting moves the cursor and nothing else here: `previewedCue` derives what PREVIEW shows
  // (the selection in 'take' mode, the staged cue otherwise) and the effect above follows it.
  const selectCue = (cue: OutputCue) => setSelectedCueId(cue.id);
  /** Switching modes keeps the picture still: into 'preview-then-take' the selection stays on
   *  PREVIEW (it already is), back into 'take' the selection is the preview again. */
  const changeSpaceMode = (mode: SpaceMode) => {
    if (mode === 'preview-then-take') setStagedCueId(selectedCue?.id ?? null);
    setSpaceMode(mode);
  };

  /**
   * ONE dispatcher for the verbs, whether they arrive from a button or from a key — the same
   * shape the in-app dashboard uses, so the two surfaces cannot disagree about what a press
   * means. TAKE is the TOGGLE (docs/PLAYOUT_DASHBOARD.md §2): it airs the selected cue and, on
   * a cue that is already live, takes it off. Re-take is its own verb.
   *
   * TWO SPACE MODES (owner, 2026-09-10): the decision is `spaceAction` in playoutKeys.ts, the
   * same table the in-app page reads. In 'preview-then-take' mode a cue taken off air lands on
   * PREVIEW (the mixer cut) and a cue not yet on PREVIEW goes there first, airing nothing.
   */
  const runVerb = (verb: PlayoutVerb) => {
    // Staging REPLACES what was on PREVIEW; a replaced cue that is on air stays on air, because
    // PREVIEW is a check and never a tally. A cue taken off lands there in both modes: in 'take'
    // mode the staged id is simply never read.
    if (verb === 'take' && selectedCue) {
      if (spaceNext === 'take-off') {
        outLayer();
        setStagedCueId(selectedCue.id);
      } else if (spaceNext === 'preview') setStagedCueId(selectedCue.id);
      else void takeCue(selectedCue);
    }
    if (verb === 'retake' && selectedIsLive && selectedCue) void takeCue(selectedCue);
    if (verb === 'update' && selectedIsLive) updateLive();
    if (verb === 'next' && selectedLayerCueId) nextLayer();
    if (verb === 'out' && selectedLayerCueId) outLayer();
    // Walk the rundown. Selecting a cue is the same act as clicking it, to PREVIEW in 'take'
    // mode and a cursor move in the other, and nothing airs either way, so an operator can line
    // the next item up and take it without a mouse.
    if (verb === 'select-prev' || verb === 'select-next') {
      const next = stepSelection(cues, selectedCue?.id ?? null, verb === 'select-next' ? 1 : -1);
      if (!next) return;
      selectCue(next);
      revealCue(`hosted-cue-${next.id}`);
    }
  };

  const elapsedText = (() => {
    const total = Math.max(0, Math.floor((now - openedAt) / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  })();

  return (
    <div className="app playout-dashboard hosted-dashboard" data-testid="hosted-control-page">
      <header className="pd-header">
        <h1>{show.title}</h1>
        <span className="pd-mode pd-mode-show">● SHOW</span>
        <span className="pd-clock mono">{elapsedText}</span>
        <div className="spacer" />
        <button
          className="pd-allout"
          disabled={liveLayers.length === 0}
          onClick={outAll}
          title="Play every live layer off and clear the frame"
          data-testid="hosted-out-all"
        >
          ■ All out
        </button>
      </header>

      <main className="pd-body">
        <section className="pd-main">
          {/* The monitors and the verbs as ONE fixed block, and the bar beside PROGRAM above
              1366px - the same stage head the in-app page carries, out of the same stylesheet.
              docs/PLAYOUT_DASHBOARD.md §2; the parity contract is docs/CONTROL_PANEL_PARITY.md. */}
          <div className="pd-stagehead">
          <div className="pd-monitors">
            <div className="pd-monitor pd-pvw">
              <h2>
                <span className="pd-dot" aria-hidden="true" />
                PREVIEW
                <span className="pd-what" data-testid="hosted-preview-what">
                  {previewedCue?.label ??
                    (spaceMode === 'preview-then-take' ? PREVIEW_EMPTY_LABEL : 'nothing selected')}
                </span>
              </h2>
              <div className="pd-screen">
                <div className="pd-frame" style={{ aspectRatio: '16 / 9' }}>
                  <PayloadStage
                    ref={previewRef}
                    payload={payload}
                    emptyLabel={
                      spaceMode === 'preview-then-take' && !previewedCue ? 'Nothing in preview' : undefined
                    }
                    testId="hosted-preview-stage"
                    onState={noteOverflow(setPreviewOverflow)}
                  />
                </div>
              </div>
            </div>
            <div className="pd-monitor pd-pgm">
              <h2>
                <span className="pd-dot" aria-hidden="true" />
                PROGRAM · ON AIR
                {/* The names can run past the monitor's width and end in an ellipsis, so the title
                    carries them whole. The badge names EVERY live layer, in the names' order: with a
                    quiz and a score both up it used to show one layer beside two names. */}
                <span className="pd-what" title={liveLayers.map((l) => `${l.label} (layer ${l.layer})`).join(', ')}>
                  {liveLayers.length === 0 ? 'nothing on air' : liveLayers.map((l) => l.label).join(' · ')}
                </span>
                {liveLayers.length > 0 && (
                  <span className="pd-layer-badge">{liveLayers.map((l) => `L${l.layer}`).join(' · ')}</span>
                )}
              </h2>
              <div className="pd-screen">
                <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: '16 / 9' }}>
                  <PayloadStage
                    ref={programRef}
                    payload={payload}
                    emptyLabel={liveLayers.length === 0 ? 'Nothing on air' : undefined}
                    testId="hosted-program-stage"
                    onReady={restoreProgram}
                    onState={(graphic, state, over) => {
                      noteOverflow(setProgramOverflow)(graphic, state, over);
                      noteMachineState(graphic, state);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <HostedVerbs
            selectedIsLive={selectedIsLive}
            spaceNext={spaceNext}
            spaceMode={spaceMode}
            onSpaceMode={changeSpaceMode}
            hasSelection={!!selectedCue}
            layerLive={!!selectedLayerCueId}
            liveLabels={liveLayers.map((l) => l.label)}
            onKey={runVerb}
          />
          </div>

          {/* THE CONTROL AREA, the one scroll container on the page, exactly as on the in-app
              dashboard: the stage head above and the rundown beside it never move. */}
          <div className="pd-control-area" data-testid="control-area">
          {selectedCue && spec && (
            <HostedCueEditor
              cue={selectedCue}
              spec={spec}
              // The production's ARRANGE for this graphic, off the PUBLISHED row. It reaches this
              // page on the next publish, exactly as the bindings do — a change on the production
              // page is authored state, and authored state travels at publish.
              arrange={arrangeFor(resolved?.profile, selectedCue.graphic)}
              values={cueValues(selectedCue)}
              live={selectedIsLive}
              layerLive={!!selectedLayerCueId}
              layer={layerOf(selectedCue.graphic)}
              liveState={machineState[selectedCue.graphic] ?? null}
              // PREVIEW measures the cue ON it, which in 'preview-then-take' mode is not
              // always the cue being edited; a warning about another cue's words is no warning.
              overflow={
                selectedIsLive
                  ? (programOverflow[selectedCue.graphic] ?? [])
                  : selectedIsPreviewed
                    ? (previewOverflow[selectedCue.graphic] ?? [])
                    : []
              }
              airedValues={airedData[selectedCue.graphic] ?? null}
              // Typing refreshes PREVIEW only while this cue IS on it - the same rule the
              // exported controller's editor has always applied to its preview stream.
              onPreview={(values) => {
                if (selectedIsPreviewed) showOnPreview(selectedCue, values);
              }}
              onSnap={snapTo}
              onSend={(items) => sendVerb(items)}
              onStage={stageShared}
              onStageNote={noteStaged}
              moved={combineMoved}
              bound={boundFields(selectedCue.graphic)}
              boundOf={(field) => boundValues[selectedCue.graphic]?.[field]}
              onPatchBound={patchBound}
              // THE PRODUCTION'S OWN BUTTONS (§6b), drawn by the block they belong in. They are
              // passed down rather than built in the editor because a combined control is the
              // PRODUCTION's, not the selected graphic's: its steps name their own graphics, and
              // only the page knows the whole pool. For the same reason the block renders them
              // even when the SELECTED GRAPHIC DECLARES NO ⚡ ACTIONS of its own.
              //
              // What they do still depend on is a cue being selected at all, because the editor
              // is where the ⚡ block lives on both dashboards — the in-app page gates its block
              // the same way. That only bites a production with no cues or a cue whose graphic
              // never published a panel spec, neither of which can have a graphic on air for a
              // step to act on; if it ever bites something real, the block moves up a level on
              // both surfaces together rather than on one.
              combined={combineControls.map((control) => (
                <CombinedButton
                  key={control.id}
                  control={control}
                  now={combineNow}
                  names={combineNames}
                  wait={scheduler.waiting(control.id)}
                  tickOn={(index, declared) => tickOn(control.id, index, declared)}
                  onTick={(index, on) =>
                    setCombineTicks((m) => new Map(m).set(tickKey(control.id, index), on))
                  }
                  onPress={() => pressCombine(control)}
                  testPrefix="hosted-"
                />
              ))}
            />
          )}
          {error && <p className="status-bad" data-testid="hosted-error">{error}</p>}

          {/* THE ACTIVITY LOG, the in-app dashboard's feed on the multi-operator surface: every
              Take, Update, Next and Out, whoever sent it. The rows were already arriving here to
              drive PROGRAM — the page just threw them away, so "did that take go, or was that
              somebody else?" had no answer on the page being asked it. */}
          <details className="pd-activity" data-testid="hosted-action-log">
            <summary>
              Activity
              {wireLog[0] && (
                <span className="muted">
                  {' '}
                  {logTime(wireLog[0].at)} {wireLog[0].text}
                </span>
              )}
            </summary>
            {wireLog.length === 0 ? (
              <p className="hint">Nothing yet. Every Take, Update, Next and Out lands here, whoever sends it.</p>
            ) : (
              <ol className="prod-log-list">
                {wireLog.map((e) => (
                  <li key={e.id} className={`prod-log-row prod-log-${e.kind}`} data-testid="hosted-action-log-row">
                    <span className="prod-log-time">{logTime(e.at)}</span>
                    <span className="prod-log-text">{e.text}</span>
                    <span className="muted prod-log-graphic">{e.graphic}</span>
                  </li>
                ))}
              </ol>
            )}
          </details>
          </div>
        </section>

        <aside className="pd-rail">
          <div className="pd-rail-head">
            <h2>Cue rundown</h2>
            <span className="muted">{cues.length}</span>
          </div>
          {cues.length === 0 && <p className="hint">This production has no cues yet.</p>}
          <div className="pd-cues" data-testid="hosted-cues">
            {cues.map((cue, i) => {
              const cueIsLive = liveCue[cue.graphic] === cue.id;
              const isSelected = cue.id === (selectedCue?.id ?? '');
              // The amber tally is the cue ON PREVIEW, which the cursor may have walked on from.
              const isPreviewed = cue.id === (previewedCue?.id ?? '');
              const layer = layerOf(cue.graphic);
              const sharing = layerSharedWith(cue.graphic);
              return (
                <div
                  key={cue.id}
                  className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isPreviewed ? ' on-pvw' : ''}`}
                  data-testid={`hosted-cue-${cue.id}`}
                >
                  <span className="pd-cue-no">{cueIsLive ? '●' : i + 1}</span>
                  <button className="pd-cue-label" onClick={() => selectCue(cue)} data-testid="hosted-select-cue">
                    <strong>{cue.label}</strong>
                    <span className="muted">
                      {layer !== null && (
                        <span
                          className={`pd-cue-layer${sharing.length ? ' clash' : ''}`}
                          title={
                            sharing.length
                              ? `Shares layer ${layer} with ${sharing.join(', ')}. On air they replace each other.`
                              : `${cue.graphic} airs on layer ${layer}`
                          }
                        >
                          L{layer}
                        </span>
                      )}
                      {layer !== null ? ' · ' : ''}
                      {kindByKey.has(cue.graphic) ? `${kindByKey.get(cue.graphic)} · ` : ''}
                      {cue.note || cue.graphic}
                    </span>
                  </button>
                  {cueIsLive ? (
                    <span className="pd-tag air">ON AIR</span>
                  ) : isPreviewed ? (
                    <span className="pd-tag pvw">PVW</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {playoutCues.length > 0 && (
            <div className="pd-server-cues" data-testid="hosted-playout-cues">
              <h3>On the playout server</h3>
              {playoutCues.map((cue) => (
                <div key={cue.id} className="pd-cue pd-cue-server" data-testid={`hosted-playout-cue-${cue.id}`}>
                  <span className="pd-cue-no">·</span>
                  <span className="pd-cue-label">
                    <strong>{cue.label}</strong>
                    <span className="muted">
                      <span className="pd-cue-layer">L{cue.layer}</span> · {cue.kind === 'media' ? 'Server clip' : 'Server template'} ·{' '}
                      {cue.note || cue.name}
                    </span>
                  </span>
                </div>
              ))}
              <p className="hint">
                These play through NoaCG Bridge on the operator&rsquo;s own machine, from the production page
                there. This page cannot reach it.
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

/**
 * THE VERB BAR, with the keys that fire them — the in-app dashboard's bar, rendered for the page
 * an operator actually runs a show from. It is a component of its own so it can bind the shared
 * keymap: the hooks rule forbids binding it in the page body, which returns early while the show
 * is still resolving.
 *
 * The keys were MISSING here entirely until 2026-08-18 — the exported controller and the in-app
 * page both had them, so the surface a class operates from was the one where ↑/↓ did nothing and
 * SPACE did nothing, and TAKE re-took a live cue instead of taking it off. Both are §2 contracts.
 */
function HostedVerbs({
  selectedIsLive,
  spaceNext,
  spaceMode,
  onSpaceMode,
  hasSelection,
  layerLive,
  liveLabels,
  onKey,
}: {
  selectedIsLive: boolean;
  /** What SPACE does next - the button's face comes from the same decision the key runs. */
  spaceNext: SpaceAction;
  spaceMode: SpaceMode;
  onSpaceMode: (mode: SpaceMode) => void;
  hasSelection: boolean;
  layerLive: boolean;
  liveLabels: string[];
  onKey: (verb: PlayoutVerb) => void;
}) {
  usePlayoutVerbKeys(onKey);
  const face = takeFace(spaceNext);
  return (
    <div className="pd-verbs" data-testid="hosted-verbs">
      {/* No → Preview button here either — parity with the in-app bar, and for the same reason:
          this page's PVW monitor is a local stage that follows the selection on its own. In
          'preview-then-take' mode the TOGGLE itself wears → PREVIEW on a fresh cue. */}
      {/* THE TOGGLE: the button IS the key, on when the cue is off and off when it is on. */}
      <button
        className={face.className}
        disabled={!hasSelection}
        onClick={() => onKey('take')}
        title={face.title}
        data-testid="hosted-take-cue"
      >
        {face.text} <kbd>SPACE</kbd>
      </button>
      {/* RE-TAKE is secondary and always present, greying out like every other verb — a control
          that appeared only while a cue was live would move the bar sideways at the moment a
          graphic goes to air. */}
      <button
        className="pd-verb pd-verb-secondary"
        disabled={!selectedIsLive}
        onClick={() => onKey('retake')}
        title="Re-take: play this cue’s entrance again from the start"
        data-testid="hosted-retake-cue"
      >
        ⟳ Re-take <kbd>R</kbd>
      </button>
      <button
        className="pd-verb pd-verb-update"
        disabled={!selectedIsLive}
        onClick={() => onKey('update')}
        title="Push the staged values to air without replaying"
        data-testid="hosted-update-cue"
      >
        ✎ Update <kbd>U</kbd>
      </button>
      <button
        className="pd-verb"
        disabled={!layerLive}
        onClick={() => onKey('next')}
        title="Advance the on-air graphic one step"
        data-testid="hosted-next-cue"
      >
        » Next <kbd>N</kbd>
      </button>
      <button
        className="pd-verb"
        disabled={!layerLive}
        onClick={() => onKey('out')}
        title="Play this layer off. The other layers stay up."
        data-testid="hosted-out-cue"
      >
        ■ Out <kbd>0</kbd>
      </button>
      {/* The bar's small print as one block - the on-air chip and, under it, the operator's
          choice of what SPACE does - in the same place the in-app page carries it. */}
      <span className="pd-verb-aside">
        <span className="pd-onair-line" data-testid="hosted-live-chip">
          {liveLabels.length === 0 ? (
            <span className="muted">○ nothing on air</span>
          ) : (
            <>
              on air: <span className="pd-onair">● {liveLabels.join(' · ')}</span>
            </>
          )}
        </span>
        <SpaceModeToggle mode={spaceMode} onChange={onSpaceMode} testId="hosted-space-mode" />
      </span>
    </div>
  );
}

/**
 * The selected cue's editor. Field edits go to the SHARED staging buffer, so every operator's
 * page follows them; nothing airs until an explicit take (or ✎ Update on a live layer). The
 * graphic's saved ENTRIES ride the panel spec read-only — picking one stages its values exactly
 * as typing them would.
 */
function HostedCueEditor({
  cue,
  spec,
  arrange,
  values,
  live,
  layerLive,
  layer,
  liveState,
  overflow,
  airedValues,
  onPreview,
  onSnap,
  onSend,
  onStage,
  onStageNote,
  moved,
  combined,
  bound,
  boundOf,
  onPatchBound,
}: {
  cue: OutputCue;
  spec: PanelGraphicSpec;
  /** This graphic's entry in the production's control profile, or undefined for no profile —
   *  which renders the generated panel, exactly as deleting the profile does. */
  arrange: Record<string, ArrangeRead> | undefined;
  values: Record<string, string>;
  live: boolean;
  /** This cue's LAYER is up (its own cue may be a different one) — the ⚡/snap legality. */
  layerLive: boolean;
  layer: number | null;
  liveState: { groups?: Record<string, string> } | null;
  /** The field ids the monitor showing THIS cue reported as too long to fit - PROGRAM's answer
   *  when the cue is on air, PREVIEW's while it is staged. */
  overflow: string[];
  /** What the graphic was last told to show, or null when it is not on air. */
  airedValues: Record<string, string> | null;
  onPreview: (values: Record<string, string>) => void;
  onSnap: (groupId: string | null, stateId: string) => void;
  /** The page's one door for a verb - both roads, its own monitor, and the log. It answers
   *  whether the rows went, because a press that moves a SHARED value must not move it for an
   *  event the log refused: the other bound graphics would follow a figure this one never took. */
  onSend: (items: ControlSendItem[]) => Promise<boolean>;
  /** Stage values into the SHARED buffer now. They count on this page at once, so a Take pressed
   *  before the buffer's row comes back airs them rather than the older figure. */
  onStage: (graphic: string, data: Record<string, string>) => void;
  /** Count values on this page at once, with the write still to come: the typing debounce. */
  onStageNote: (graphic: string, data: Record<string, string>) => void;
  /** The fields a combined press just moved on air. The editor's own echo has to follow them, or
   *  a field the operator typed into would keep an older figure than the board shows. */
  moved: CombineMirror[] | null;
  /** This PRODUCTION's combined controls, already built by the page (§6b). Empty for a production
   *  that has composed none, which is most of them. */
  combined: ReactNode[];
  /** This graphic's BOUND fields: field id -> production-data path. Empty for a production that
   *  has bound nothing, and then every road in this component is the road it always took. */
  bound: Record<string, string>;
  /** What the tree currently says a bound field reads - the figure a ± or an `adjust` counts
   *  from, and the value a bound box shows however the cue was prepared (plan §2.7). */
  boundOf: (field: string) => string | undefined;
  /** Move the SHARED value. The rows come back for every graphic bound to the path, so this is
   *  the one write the editor makes that is not about this cue at all. */
  onPatchBound: (writes: TreeWrite[]) => Promise<void>;
}) {
  const descriptors = useMemo(() => fieldDescriptors(spec.fields), [spec.fields]);
  const fieldGroups = useMemo(() => groupCueFields(descriptors), [descriptors]);
  const descriptorByKey = useMemo(() => new Map(descriptors.map((d) => [d.key, d])), [descriptors]);
  const events = useMemo(() => eventButtons(spec.js), [spec.js]);
  /** Ordered, named, pinned and hidden by the SHARED rule (controlModel `arrangeControls`), so
   *  this page, the in-app one and the exported controller cannot present one production's
   *  controls three ways. No profile is the generated panel, unchanged. */
  const arranged = useMemo(() => arrangeControls(events, arrange), [events, arrange]);
  const legality = useMemo(() => eventLegality(spec.js), [spec.js]);
  const stateGroups = useMemo(() => machineStateGroups(spec.js), [spec.js]);
  /** Local echo for instant typing; the shared buffer reconciles it as its rows arrive. */
  const [echo, setEcho] = useState<Record<string, string>>({});
  const [entryId, setEntryId] = useState('');
  const [loadSide, setLoadSide] = useState<'A' | 'B'>('A');
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);
  useEffect(() => {
    setEcho({});
    setEntryId('');
    setLastLoaded(null);
  }, [cue.id]);
  /**
   * A COMBINED PRESS MOVED A FIGURE ON THIS GRAPHIC — take it into the echo, so the box says what
   * the board says.
   *
   * The single ⚡ button stages and echoes in one breath because it is inside this component; a
   * combined control is the PRODUCTION's and is drawn by the page, so its moved fields arrive
   * here instead. Without this a field the operator had ever typed into would keep the typed
   * figure (the echo wins over the staged buffer), and the next plain ⚡ press would count from it
   * and send the board backwards.
   *
   * Keyed on the ARRAY's identity, not on its contents: pressing the same control twice is two
   * events that happen to carry the same figures.
   */
  useEffect(() => {
    const mine = (moved ?? []).filter((m) => m.graphic === cue.graphic);
    if (mine.length === 0) return;
    const values = Object.assign({}, ...mine.map((m) => m.values)) as Record<string, string>;
    setEcho((v) => ({ ...v, ...values }));
    setEntryId('');
  }, [moved, cue.graphic]);

  // A BOUND FIELD READS THE TREE and nothing else (plan §2.7). `values` already carries the
  // resolved figure over the cue and the staging buffer, so this line is about the ECHO: the echo
  // is what this operator typed or what their last press put there, and neither is an answer
  // about a value the whole production shares. Leaving the echo in charge would let a bound box
  // sit on a figure a feed moved a second ago, and the next ± press would count from it.
  const valueOf = (key: string) => (bound[key] ? values[key] ?? '' : echo[key] ?? values[key] ?? '');
  const currentValues = () => {
    const out: Record<string, string> = {};
    for (const d of descriptors) out[d.key] = valueOf(d.key);
    return out;
  };
  /** What the band headings read, resolved ONCE per render rather than once per band. */
  const headingValues = currentValues();

  // Debounced shared staging: a typing operator sends a few rows, not one per keystroke. The
  // values count on this page from the keystroke (`onStageNote`), so the debounce delays only
  // what the OTHER screens see, never what this page's Take airs.
  const pending = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageSoon = (key: string, value: string) => {
    pending.current[key] = value;
    onStageNote(cue.graphic, { [key]: value });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      onStage(cue.graphic, batch);
    }, 400);
  };
  /** Stage NOW, taking any typing still inside the debounce along in the same write. Cancelling
   *  the timer without sending those edits left them on this screen and on no other. */
  const stageNow = (data: Record<string, string>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = { ...pending.current, ...data };
    pending.current = {};
    onStage(cue.graphic, batch);
  };
  const edit = (key: string, value: string) => {
    setEcho((v) => ({ ...v, [key]: value }));
    setEntryId('');
    stageSoon(key, value);
    // Typing refreshes the PREVIEW monitor — locally, so nothing near air moves.
    onPreview({ ...currentValues(), [key]: value });
  };
  const loadEntry = (id: string) => {
    setEntryId(id);
    const entry = spec.entries.find((e) => e.id === id);
    if (!entry) return;
    const data: Record<string, string> = {};
    for (const d of descriptors) if (entry.values[d.key] !== undefined) data[d.key] = entry.values[d.key];
    setEcho((v) => ({ ...v, ...data }));
    stageNow(data);
    onPreview({ ...currentValues(), ...data });
  };
  /** Load a production DATA ROW into the staged values — the same gesture as typing them, so
   *  nothing airs. The rows were matched at publish time by the shared matcher. */
  const loadDataRow = (id: string) => {
    const row = spec.dataRows.find((r) => r.id === id);
    if (!row) return;
    setLastLoaded(id);
    setEntryId('');
    setEcho((v) => ({ ...v, ...row.values }));
    stageNow(row.values);
    onPreview({ ...currentValues(), ...row.values });
  };
  const loadableRows = rowsForSide(spec.dataRows, loadSide);
  const hasSides = spec.dataRows.some((r) => r.side !== null);
  const followingRow = nextRow(spec.dataRows, loadSide, lastLoaded);

  /**
   * UNSENT CHANGES on a cue that is on air. Data never airs by itself — that is the staged-vs-
   * take rule and it does not change — so the surface has to say when what is on screen is
   * ahead of what is on air. Compared against what the wire says was last SENT, never against
   * the stored cue: those legitimately differ, which is the whole point of staging.
   */
  const unsentFields = live && airedValues
    ? descriptors.map((d) => d.key).filter((key) => (airedValues[key] ?? '') !== valueOf(key))
    : [];
  const hasUnsent = unsentFields.length > 0;

  // The chip names states the way the AUTHOR named them, exactly as every other operator
  // surface does — one formatter, `controlModel.ts formatMachineState`. This page used to
  // print the raw state ids off the wire, so the same graphic on the same dashboard design
  // read "sealed" here and "Locked, choice hidden" in the app — and this is the surface a
  // student operates WITHOUT the app, where the id is the one vocabulary nobody has seen. The
  // names travel inside the template already, so nothing new is fetched or published.
  const stateNames = useMemo(() => machineStateNames(spec.js), [spec.js]);
  const stateLabel = formatMachineState(stateNames, liveState);
  /** Only fields this surface actually draws a box for — a graphic may report an id the panel
   *  does not offer, and a warning about a box nobody can see is worse than none. */
  const overflowSet = new Set(overflow.filter((key) => descriptorByKey.has(key)));
  const overflowMessage = overflowNote(
    [...overflowSet],
    Object.fromEntries(descriptors.map((d) => [d.key, d.label])),
  );

  /**
   * A ⚡ button's hover, in the BUTTON'S OWN WORDS. A greyed one explains itself through the
   * shared `illegalEventTitle` (the wording row P landed on the in-app dashboard and the graphic
   * control page), so the enabled hover is free to say what the press DOES instead of hedging
   * about when it is allowed. It used to name the machine's event id and "where the graph allows
   * it" in both states - two vocabularies an operator meets nowhere else on this page, on the one
   * surface a student drives WITHOUT the app.
   *
   * It asks `isEventLegal` with the same three arguments the button's own `disabled` does, so the
   * greying and the sentence explaining it cannot disagree.
   *
   * `section` is the heading DRAWN over the button, which `controlName` folds into the name so
   * five presses labelled "+1" are told apart by the word above them. Empty `moved` words mean
   * everything the press moves is a hidden holder (the reported-field pattern), which has no
   * operator name and so gets no clause rather than its field id.
   */
  const eventHint = (e: ControlButton, label: string, section?: string) => {
    if (!isEventLegal(legality, e.event, liveState)) return illegalEventTitle(label);
    const name = controlName(label, section);
    const moved = adjustWords(e, (key) => descriptorByKey.get(key)?.label, {
      delta: !labelCarriesDelta(e, label),
    });
    return moved
      ? `Fires ${name} on the live graphic and moves ${moved} with it.`
      : `Fires ${name} on the live graphic.`;
  };

  /** One ⚡ button. The block draws the same button pinned, in its section and under "More", and
   *  three copies of this press would drift apart. The DECLARATION (`e`) decides what the press
   *  sends and whether it greys; the arrangement decides only the word and where it sits, and
   *  `section` is the heading over it where the block draws one. */
  const actionButton = ({ button: e, label }: ArrangedControl, section?: string) => (
    <button
      key={e.event}
      disabled={!isEventLegal(legality, e.event, liveState)}
      className={e.destructive ? 'ctl-event-destructive' : undefined}
      onClick={() => {
        const { payload, fields: staged, tree } = pressSend(e, bound, valueOf);
        // An `adjust` field (a goal's +1) rode moved by its delta: stage the new figure into the
        // shared buffer at once (the live-number bump's rule, so every open page follows and the
        // next press counts from it). A BOUND field is not among them - it is not this cue's.
        if (Object.keys(staged).length > 0) {
          setEcho((v) => ({ ...v, ...staged }));
          setEntryId('');
          stageNow(staged);
          onPreview({ ...currentValues(), ...staged });
        }
        void onSend([
          {
            graphic: cue.graphic,
            msg: payload ? { t: 'event', event: e.event, payload } : { t: 'event', event: e.event },
          },
          // THE SHARED VALUE MOVES ONLY IF THE EVENT WENT, the same order the in-app ⚡ button and
          // this page's own combined press already keep. The tree write is a separate row by
          // construction - it reaches graphics this event never touched - so nothing but this
          // order stops a refused press moving every other bound graphic.
        ]).then((sent) => { if (sent) void onPatchBound(tree); });
      }}
      title={eventHint(e, label, section)}
    >
      ⚡ {label}
    </button>
  );

  return (
    <div className={`pd-editor${live ? ' live' : ''}`} data-testid="hosted-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">EDITING {live ? 'ON-AIR CUE' : 'PREVIEW CUE'}</span>
        {/* Read-only here: cues are authored in the app and published with the production. */}
        <strong className="pd-cue-title-static">{cue.label}</strong>
        <span
          className={hasUnsent ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
          data-testid="hosted-cue-unsent"
        >
          {layer !== null ? `L${layer} · ` : ''}
          {hasUnsent
            ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet. Press ✎ Update`
            : live
              ? 'changes push live on ✎ Update'
              : 'changes air on ⟳ TAKE'}
        </span>
        {/* TOO LONG TO FIT — the same warning, in the same words, as the in-app cue editor
            (docs/CONTROL_PANEL_PARITY.md §4). The graphic on the monitor reports it; the copy
            is never cut and the artwork is never reshaped to hide it. */}
        {overflowMessage && (
          <span className="pd-editor-fate pd-over-note" data-testid="hosted-cue-overflow">
            {overflowMessage}
          </span>
        )}
        {stateLabel && <span className="hosted-state-chip" data-testid="hosted-state-chip">{stateLabel}</span>}
        <div className="spacer" />
        {spec.entries.length > 0 && (
          <select
            value={entryId}
            onChange={(e) => loadEntry(e.target.value)}
            title="Saved data rows published with this graphic"
            data-testid="hosted-entry-select"
          >
            <option value="">Entry…</option>
            {spec.entries.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="pd-fields">
        {/* LOAD A DATA ROW — the Data workspace's other half, on the surface a class operates
            from. The rows were matched at PUBLISH time (control/cueData.ts, the same matcher
            the in-app page runs live), so a dataset edited since needs a republish, exactly as
            a changed cue does. Loading stages the values like any typed edit; only Take airs. */}
        {loadableRows.length > 0 && (
          <label className="pd-field pd-field-load">
            <span>
              Load data row
              {/* THE SIDE PICKER, shown only by a board with A/B fields: one row is one team, so
                  without it a teams table can only ever describe half the graphic. */}
              {hasSides && (
                <span className="pd-side-pick" data-testid="hosted-load-side">
                  {(['A', 'B'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={loadSide === s ? 'active' : ''}
                      onClick={() => setLoadSide(s)}
                      title={`Load the picked row into side ${s}`}
                      data-testid={`hosted-load-side-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <div className="row">
              <select
                className="grow"
                value=""
                onChange={(e) => loadDataRow(e.target.value)}
                data-testid="hosted-load-row"
              >
                <option value="">Pick a row from the production&rsquo;s data…</option>
                {loadableRows.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
              {/* The running-order gesture: next question, next name — one press. */}
              <button
                onClick={() => followingRow && loadDataRow(followingRow.id)}
                disabled={!followingRow}
                title="Load the next row"
                data-testid="hosted-load-next"
              >
                ↷ Next
              </button>
            </div>
          </label>
        )}
        {/* THE BANDS, exactly as the in-app editor draws them (control/cueFieldGroups.ts) —
            docs/CONTROL_PANEL_PARITY.md §4: a two-sided board groups per side under the
            operator's own word for it, everything else keeps the flat flow. A class operating
            from this page reads the same surface they were taught on. */}
        {fieldGroups.map((group) => {
          const heading = groupHeading(group, headingValues);
          return (
            <div
              className={`pd-band${heading ? '' : ' pd-band-plain'}`}
              key={group.id}
              data-testid={`hosted-band-${group.id}`}
            >
              {heading && <span className="pd-band-label">{heading}</span>}
              <div className="pd-band-fields">
                {group.keys.map((key) => {
                  const d = descriptorByKey.get(key);
                  if (!d) return null;
                  // A BOUND field is not a cue value (plan §2.7): it takes the production tree's
                  // figure at Take, at ✎ Update and in the preview, so an editable box here would
                  // show a number nothing will ever air. It reads out instead, wearing its path -
                  // the same shape the in-app cue editor gives it, and the one override gesture is
                  // Unbind, which lives on the production page's Data tab.
                  const path = bound[d.key];
                  if (path) {
                    return (
                      <label className="pd-field pd-field-bound" key={d.key} data-testid={`hosted-bound-${d.key}`}>
                        <span className="pd-field-bound-label">
                          {d.key.toUpperCase()} · {d.label}
                          <span className="pd-bound-mark" title={`Bound to production data: ${path}`}>
                            {' '}🔗 {path}
                          </span>
                        </span>
                        <input value={boundOf(d.key) ?? ''} placeholder="not set yet" readOnly tabIndex={-1} />
                      </label>
                    );
                  }
                  return (
                    <label
                      key={d.key}
                      className={`pd-field${overflowSet.has(d.key) ? ' pd-field-over' : ''}`}
                    >
                      <span>
                        {d.key.toUpperCase()} · {d.label}
                        {/* The box wears the mark too: one line at the top of a six-field band
                            does not say which value to shorten. */}
                        {overflowSet.has(d.key) && (
                          <b
                            className="field-over"
                            title={OVERFLOW_FIELD_HINT}
                            data-testid={`hosted-over-${d.key}`}
                          >
                            {' '}⚠ {OVERFLOW_FIELD_MARK}
                          </b>
                        )}
                      </span>
                      <FieldControl
                        descriptor={d}
                        value={valueOf(d.key)}
                        onChange={(v: string | number) => edit(d.key, String(v))}
                        images={spec.images.map((i) => ({ value: i.value }))}
                        testId={`hosted-field-${d.key}`}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ⚡ GRAPHIC ACTIONS (docs/PLAYOUT_DASHBOARD.md §7b), in the in-app page's shape: a header
          saying these act ON AIR, the recovery snap beside it, the buttons GROUPED BY SECTION,
          and one line of inline help. They were a flat wall of buttons here — the author's own
          sections were published in `machine.controls` and thrown away by the surface with the
          smallest screen and the least room to guess. */}
      {/* The block also renders for a graphic with NO declared controls when the production has
          combined ones (§6e): they sit in a section of their own below, and a combined control
          belongs to the production rather than to whichever cue happens to be selected. */}
      {(events.length > 0 || combined.length > 0) && (
        <div className="pd-actions" data-testid="hosted-actions">
          <div className="pd-actions-head">
            <span className="pd-actions-kicker">
              ⚡ GRAPHIC ACTIONS <b className="pd-actions-air">act on air</b>
            </span>
            {stateGroups.length > 0 && (
              <select
                className="pd-snap"
                value=""
                disabled={!layerLive}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === '::reset') onSnap(null, '');
                  else {
                    const i = v.indexOf(':');
                    onSnap(v.slice(0, i), v.slice(i + 1));
                  }
                }}
                title={
                  'RECOVERY. Jumps the live graphic straight to a state with no animation, ' +
                  'and re-sends this cue’s values with it. Use it when air and this page have ' +
                  'got out of step (a renderer restart, a missed press). It is not how a ' +
                  'graphic is normally driven: that is the ⚡ actions and » Next.'
                }
                data-testid="hosted-snap"
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
          <p className="hint pd-actions-help">
            These fire the graphic’s own beats on the layer that is on air, immediately. They carry
            values from this cue, so type them above first.
            {stateGroups.length > 0 && ' “Snap to state…” is for RECOVERY: it jumps straight to a state with no animation.'}
          </p>
          {/* PINNED, above the fold and above the section headings — the in-app page's shape. */}
          {arranged.pinned.length > 0 && (
            <div className="pd-actions-row pd-actions-pinned" data-testid="hosted-actions-pinned">
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
          {/* HIDDEN, behind one disclosure. It matters most HERE: this is the surface a class
              drives from a phone, away from the app, so a control the production tucked away is
              still one tap from the operator who turns out to need it. */}
          {arranged.more.length > 0 && (
            <details className="pd-actions-more" data-testid="hosted-actions-more">
              <summary>More ({arranged.more.length})</summary>
              <div className="pd-actions-row">{arranged.more.map((c) => actionButton(c))}</div>
            </details>
          )}
          {/* COMBINED, this production's own buttons (§6b) — LAST in the block, same section and
              same stylesheet as the in-app page, because the two surfaces are one design and a
              class is taught on both. */}
          {combined.length > 0 && (
            <div className="pd-actions-section pd-combined-section" data-testid="hosted-actions-combined">
              <h4>Combined</h4>
              <div className="pd-actions-row">{combined}</div>
            </div>
          )}
        </div>
      )}

      {/* ± LIVE NUMBERS — the production page's quick-bump, on the surface a class actually
          operates from (the cloud-first door): one press sends a PARTIAL update carrying just
          the bumped field, stages the same value into the shared buffer (so every open page
          follows), and never touches the other staged edits — a bump must not publish a
          half-typed name. Number fields an ⚡ event carries as payload are excluded: those are
          set by their own action. */}
      {(() => {
        const payloadKeys = new Set(events.flatMap((e) => e.payload ?? []));
        const numberFields = descriptors.filter((d) => d.kind === 'number' && !payloadKeys.has(d.key));
        if (numberFields.length === 0) return null;
        const bump = (key: string, delta: number) => {
          // A BOUND FIELD TAKES THE OTHER ROAD (plan §2.9's Phase 3, AC-7): the figure belongs to
          // the production, not to this cue, so the press moves the shared value and every graphic
          // bound to it follows through the ordinary diff. Nothing is staged and nothing is
          // echoed - a bound field is never a cue value, and the new figure arrives the way a
          // feed's would.
          const path = bound[key];
          if (path) {
            void onPatchBound([{ path, text: adjustedValue(boundOf(key), delta), verb: 'adjust' }]);
            return;
          }
          const next = adjustedValue(valueOf(key), delta);
          setEcho((v) => ({ ...v, [key]: next }));
          setEntryId('');
          // Immediate, not the typing debounce: the value just aired, so the shared buffer
          // must say so now (the loadEntry precedent). Typing still in the debounce goes into
          // the buffer with it, never onto air: the update below carries the bumped field alone.
          stageNow({ [key]: next });
          onPreview({ ...currentValues(), [key]: next });
          onSend([{ graphic: cue.graphic, msg: { t: 'update', data: { [key]: next } } }]);
        };
        return (
          <div className="pd-editor-events pd-live-numbers" data-testid="hosted-live-numbers">
            {numberFields.map((d) => {
              // One sentence for both halves of the pair: they act on the same field, so a
              // hover that differed between − and + would be saying something that is not true.
              const stepTitle = live
                ? `Changes "${d.label}" on air immediately`
                : 'This cue is not on air. Take it first.';
              return (
                <span key={d.key} className="pd-live-number" data-testid={`hosted-live-number-${d.key}`}>
                  <span className="pd-live-number-label">{d.label}</span>
                  <button
                    disabled={!live}
                    title={stepTitle}
                    onClick={() => bump(d.key, -1)}
                    data-testid={`hosted-live-number-${d.key}-down`}
                  >
                    −
                  </button>
                  <button
                    disabled={!live}
                    title={stepTitle}
                    onClick={() => bump(d.key, 1)}
                    data-testid={`hosted-live-number-${d.key}-up`}
                  >
                    +
                  </button>
                </span>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
