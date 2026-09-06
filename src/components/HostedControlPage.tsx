import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adjustWords,
  controlSections,
  eventButtons,
  eventLegality,
  eventPayload,
  fieldDescriptors,
  formatMachineState,
  isEventLegal,
  machineStateGroups,
  machineStateNames,
  movedKeys,
  overflowNote,
  OVERFLOW_FIELD_HINT,
  OVERFLOW_FIELD_MARK,
} from '../control/controlModel';
import { nextRow, rowsForSide } from '../control/cueData';
import { groupCueFields, groupHeading } from '../control/cueFieldGroups';
import { appendLogEntries, describeLogRow, logTime, type LogEntry } from '../control/eventLog';
import {
  clearAllCuesOnWire,
  clearCueOnWire,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  sendHostedControl,
  sendHostedControlBatch,
  stageHostedData,
  takeCueOnWire,
  withLiveCue,
  type LiveCueMap,
  type OutputCue,
  type PanelGraphicSpec,
  type ResolvedControlShow,
} from '../control/hostedControl';
import { isBackendConfigured } from '../backend/config';
import { detectPrefix } from '../model/structure';
import { graphicKindLabel } from '../model/types';
import { FieldControl } from './fields/FieldControl';
import PayloadStage, { type PayloadStageHandle } from './home/PayloadStage';
import { revealCue, stepSelection, usePlayoutVerbKeys, type PlayoutVerb } from './playoutKeys';

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

export default function HostedControlPage({ slug }: { slug: string }) {
  const [show, setShow] = useState<ResolvedControlShow | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
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

  const previewRef = useRef<PayloadStageHandle>(null);
  const programRef = useRef<PayloadStageHandle>(null);

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
      const tail = (after: number) => hostedControlTail(slug, after);
      // Which cues were already on air comes off the ROW (0031's snapshot, per-layer since
      // 0034), seeded before following so old rows can never overwrite a newer fact.
      setLiveCue(resolved.liveCue);
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
      const history = await hostedControlTail(slug, Math.max(0, resolved.lastEventId - LOG_HISTORY_SPAN));
      if (!live) return;
      setWireLog((l) =>
        appendLogEntries(l, history.map((r) => describeLogRow(r, cueLabel)).filter((e): e is LogEntry => !!e)),
      );
      unsubscribe = await followControlLog({
        showId: resolved.id,
        from: resolved.lastEventId,
        tail,
        onRow: (row) => {
          const msg = row.msg;
          if (msg.t === 'staged') {
            setShow((s) => (s && s !== 'loading' ? { ...s, staged: { ...s.staged, [row.graphic]: msg.data } } : s));
          } else if (msg.t === 'live') {
            setShow((s) =>
              s && s !== 'loading' ? { ...s, live: { ...s.live, [row.graphic]: { data: msg.data, state: msg.state } } } : s,
            );
          } else if (msg.t === 'cue') {
            // A cue row names its own graphic, so it only ever speaks for that ONE layer.
            setLiveCue((m) => withLiveCue(m, row.graphic, msg.cue));
          } else {
            // A RENDERER command: mirror it onto the PROGRAM monitor, so this page shows what
            // actually reached air rather than only what its own buttons sent.
            programRef.current?.apply([{ graphic: row.graphic, msg }]);
            // …and remember what it put on air, which is what makes "not sent yet" honest.
            if (msg.t === 'update') {
              setAiredData((prev) => ({ ...prev, [row.graphic]: { ...prev[row.graphic], ...msg.data } }));
            } else if (msg.t === 'stop') {
              // Off air: forget it, or the next take would compare against a stale baseline.
              setAiredData((prev) => {
                if (!prev[row.graphic]) return prev;
                const next = { ...prev };
                delete next[row.graphic];
                return next;
              });
            }
          }
          const entry = describeLogRow(row, cueLabel);
          if (entry) setWireLog((l) => appendLogEntries(l, [entry]));
        },
      });
    })();
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [slug]);

  const resolved = show && show !== 'loading' ? show : null;
  const cues: OutputCue[] = useMemo(() => resolved?.output?.cues ?? [], [resolved]);
  const payload = resolved?.output ?? null;
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  const specByName = useMemo(
    () => new Map((resolved?.panel ?? []).map((g) => [g.name, g] as const)),
    [resolved],
  );
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
  const previewCue = useCallback(
    (cue: OutputCue | null, values?: Record<string, string>) => {
      if (!cue) return;
      previewRef.current?.apply([
        { graphic: cue.graphic, msg: { t: 'update', data: values ?? cue.values } },
        { graphic: cue.graphic, msg: { t: 'play' } },
      ]);
    },
    [],
  );
  // The first cue previews as soon as the payload's stage exists, so the surface is never two
  // empty boxes on arrival.
  const previewedOnce = useRef(false);
  useEffect(() => {
    if (!payload || !selectedCue || previewedOnce.current) return;
    previewedOnce.current = true;
    const t = setTimeout(() => previewCue(selectedCue), 400);
    return () => clearTimeout(t);
  }, [payload, selectedCue, previewCue]);

  // BOOT RECOVERY for the PROGRAM monitor. The log follower only sees rows that arrive AFTER
  // this page opened, so a production that has been on air all afternoon would show an empty
  // PROGRAM box beside a rundown row marked ON AIR — the surface contradicting itself. Each
  // graphic's last REPORTED data is on the resolved row (what it says it actually applied), so
  // replay that for every layer the row says is up.
  //
  // Safe here in a way it was NOT in an exported package: this stage drives nothing but itself.
  // The round-1 bug was a baked log follower snapping a REAL playout graphic to its last
  // reported (off) state one round-trip after the host's play().
  //
  // It reads the layers THE RESOLVE reported, never the live `liveCue` state. That state also
  // moves when this operator's own take comes back round the log, so keyed on it the recovery
  // fired on the first take of a session and replayed the entrance the follower had just
  // applied - the monitor playing the graphic in twice. The cockpit had the same shape and a
  // worse ending (it snapped to a stale "off" and took the graphic off air); both are keyed on
  // the wire's own answer now.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (!payload || !resolved || recoveredRef.current) return;
    recoveredRef.current = true;
    const up = Object.entries(resolved.liveCue).filter(([, cueId]) => !!cueId);
    for (const [graphic] of up) {
      const data = resolved.live[graphic]?.data;
      programRef.current?.apply([
        ...(data ? [{ graphic, msg: { t: 'update' as const, data } }] : []),
        { graphic, msg: { t: 'play' as const } },
      ]);
    }
  }, [payload, resolved]);

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
              : 'Hosted control needs the cloud backend — this build runs offline.'}
          </p>
          {error && <p className="muted">{error}</p>}
        </div>
      </div>
    );
  }

  const surfaceSendError = (e: Error) =>
    setError(/slow down/i.test(e.message) ? 'Too many commands — slow down a moment.' : `Send failed: ${e.message}`);

  /** The layers that are up, front to back. */
  const liveLayers = (payload?.graphics ?? [])
    .map((g) => ({ graphic: g.key, layer: g.layer ?? 1, cueId: liveCue[g.key] ?? null }))
    .filter((l): l is { graphic: string; layer: number; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }))
    .sort((a, b) => b.layer - a.layer);

  const selectedGraphic = selectedCue?.graphic ?? null;
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedIsLive = !!selectedCue && selectedLayerCueId === selectedCue.id;
  const spec: PanelGraphicSpec | null = selectedGraphic ? specByName.get(selectedGraphic) ?? null : null;

  /** The values the operator sees for the selected cue: the cue's own, with the SHARED staged
   *  buffer over them (another operator typing is visible here, by design). */
  const cueValues = (cue: OutputCue): Record<string, string> => ({
    ...cue.values,
    ...(resolved?.staged[cue.graphic] ?? {}),
  });

  const takeCue = (cue: OutputCue) =>
    takeCueOnWire(slug, { id: cue.id, graphic: cue.graphic, values: cueValues(cue) }).catch(surfaceSendError);
  const nextLayer = () => {
    if (selectedGraphic) void sendHostedControl(slug, selectedGraphic, { t: 'next' }).catch(surfaceSendError);
  };
  const outLayer = () => {
    if (selectedGraphic) void clearCueOnWire(slug, selectedGraphic).catch(surfaceSendError);
  };
  const updateLive = () => {
    if (selectedGraphic && selectedCue && selectedIsLive) {
      void sendHostedControl(slug, selectedGraphic, { t: 'update', data: cueValues(selectedCue) }).catch(surfaceSendError);
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
    void sendHostedControlBatch(slug, [
      { graphic: selectedGraphic, msg: { t: 'snap', snap: groupId === null ? null : { [groupId]: stateId } } },
      { graphic: selectedGraphic, msg: { t: 'update', data: cueValues(selectedCue) } },
    ]).catch(surfaceSendError);
  };
  const outAll = () => void clearAllCuesOnWire(slug, liveLayers.map((l) => l.graphic)).catch(surfaceSendError);

  const selectCue = (cue: OutputCue) => {
    setSelectedCueId(cue.id);
    previewCue(cue, cueValues(cue));
  };

  /**
   * ONE dispatcher for the verbs, whether they arrive from a button or from a key — the same
   * shape the in-app dashboard uses, so the two surfaces cannot disagree about what a press
   * means. TAKE is the TOGGLE (docs/PLAYOUT_DASHBOARD.md §2): it airs the selected cue and, on
   * a cue that is already live, takes it off. Re-take is its own verb.
   */
  const runVerb = (verb: PlayoutVerb) => {
    if (verb === 'take') {
      if (selectedIsLive) outLayer();
      else if (selectedCue) void takeCue(selectedCue);
    }
    if (verb === 'retake' && selectedIsLive && selectedCue) void takeCue(selectedCue);
    if (verb === 'update' && selectedIsLive) updateLive();
    if (verb === 'next' && selectedLayerCueId) nextLayer();
    if (verb === 'out' && selectedLayerCueId) outLayer();
    // Walk the rundown. Selecting a cue is the same act as clicking it — it goes to PREVIEW,
    // nothing airs — so an operator can line the next item up and take it without a mouse.
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
          title="Play every live layer off — clear the frame"
          data-testid="hosted-out-all"
        >
          ■ All out
        </button>
      </header>

      <main className="pd-body">
        <section className="pd-main">
          {/* The monitors and the verbs as ONE sticky block, and the bar beside PROGRAM above
              1366px - the same stage head the in-app page carries, out of the same stylesheet.
              docs/PLAYOUT_DASHBOARD.md §2; the parity contract is docs/CONTROL_PANEL_PARITY.md. */}
          <div className="pd-stagehead">
          <div className="pd-monitors">
            <div className="pd-monitor pd-pvw">
              <h2>
                <span className="pd-dot" aria-hidden="true" />
                PREVIEW
                <span className="pd-what">{selectedCue?.label ?? 'nothing selected'}</span>
              </h2>
              <div className="pd-screen">
                <div className="pd-frame" style={{ aspectRatio: '16 / 9' }}>
                  <PayloadStage
                    ref={previewRef}
                    payload={payload}
                    testId="hosted-preview-stage"
                    onState={noteOverflow(setPreviewOverflow)}
                  />
                </div>
              </div>
            </div>
            <div className="pd-monitor pd-pgm">
              <h2>
                <span className="pd-dot" aria-hidden="true" />
                PROGRAM — ON AIR
                <span className="pd-what">
                  {liveLayers.length === 0 ? 'nothing on air' : liveLayers.map((l) => l.label).join(' · ')}
                </span>
                {liveLayers[0] && <span className="pd-layer-badge">L{liveLayers[0].layer}</span>}
              </h2>
              <div className="pd-screen">
                <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: '16 / 9' }}>
                  <PayloadStage
                    ref={programRef}
                    payload={payload}
                    emptyLabel={liveLayers.length === 0 ? 'Nothing on air' : undefined}
                    testId="hosted-program-stage"
                    onState={noteOverflow(setProgramOverflow)}
                  />
                </div>
              </div>
            </div>
          </div>

          <HostedVerbs
            selectedIsLive={selectedIsLive}
            hasSelection={!!selectedCue}
            layerLive={!!selectedLayerCueId}
            liveLabels={liveLayers.map((l) => l.label)}
            onKey={runVerb}
          />
          </div>

          {selectedCue && spec && (
            <HostedCueEditor
              slug={slug}
              cue={selectedCue}
              spec={spec}
              values={cueValues(selectedCue)}
              live={selectedIsLive}
              layerLive={!!selectedLayerCueId}
              layer={layerOf(selectedCue.graphic)}
              liveState={resolved?.live[selectedCue.graphic]?.state ?? null}
              overflow={
                (selectedIsLive ? programOverflow : previewOverflow)[selectedCue.graphic] ?? []
              }
              airedValues={airedData[selectedCue.graphic] ?? null}
              onPreview={(values) => previewCue(selectedCue, values)}
              onSnap={snapTo}
              onError={setError}
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
              const layer = layerOf(cue.graphic);
              const sharing = layerSharedWith(cue.graphic);
              return (
                <div
                  key={cue.id}
                  className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isSelected ? ' on-pvw' : ''}`}
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
                              ? `Shares layer ${layer} with ${sharing.join(', ')} — on air they replace each other`
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
                  ) : isSelected ? (
                    <span className="pd-tag pvw">PVW</span>
                  ) : null}
                </div>
              );
            })}
          </div>
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
  hasSelection,
  layerLive,
  liveLabels,
  onKey,
}: {
  selectedIsLive: boolean;
  hasSelection: boolean;
  layerLive: boolean;
  liveLabels: string[];
  onKey: (verb: PlayoutVerb) => void;
}) {
  usePlayoutVerbKeys(onKey);
  return (
    <div className="pd-verbs" data-testid="hosted-verbs">
      {/* No → Preview button here either — parity with the in-app bar, and for the same reason:
          this page's PVW monitor is a local stage that follows the selection on its own. */}
      {/* THE TOGGLE: the button IS the key, on when the cue is off and off when it is on. */}
      <button
        className={`pd-verb pd-verb-take${selectedIsLive ? ' pd-verb-live' : ''}`}
        disabled={!hasSelection}
        onClick={() => onKey('take')}
        title={selectedIsLive ? 'Take this cue OFF air — the same thing SPACE does' : 'Air the previewed cue'}
        data-testid="hosted-take-cue"
      >
        {selectedIsLive ? <>■ TAKE OFF <kbd>SPACE</kbd></> : <>⟳ TAKE <kbd>SPACE</kbd></>}
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
        title="Play this layer off — the others stay up"
        data-testid="hosted-out-cue"
      >
        ■ Out <kbd>0</kbd>
      </button>
      <span className="pd-onair-line" data-testid="hosted-live-chip">
        {liveLabels.length === 0 ? (
          <span className="muted">○ nothing on air</span>
        ) : (
          <>
            on air: <span className="pd-onair">● {liveLabels.join(' · ')}</span>
          </>
        )}
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
  slug,
  cue,
  spec,
  values,
  live,
  layerLive,
  layer,
  liveState,
  overflow,
  airedValues,
  onPreview,
  onSnap,
  onError,
}: {
  slug: string;
  cue: OutputCue;
  spec: PanelGraphicSpec;
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
  onError: (message: string) => void;
}) {
  const descriptors = useMemo(() => fieldDescriptors(spec.fields), [spec.fields]);
  const fieldGroups = useMemo(() => groupCueFields(descriptors), [descriptors]);
  const descriptorByKey = useMemo(() => new Map(descriptors.map((d) => [d.key, d])), [descriptors]);
  const events = useMemo(() => eventButtons(spec.js), [spec.js]);
  const eventSections = useMemo(() => controlSections(events), [events]);
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

  const valueOf = (key: string) => echo[key] ?? values[key] ?? '';
  const currentValues = () => {
    const out: Record<string, string> = {};
    for (const d of descriptors) out[d.key] = valueOf(d.key);
    return out;
  };
  /** What the band headings read, resolved ONCE per render rather than once per band. */
  const headingValues = currentValues();

  // Debounced shared staging: a typing operator sends a few rows, not one per keystroke.
  const pending = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageSoon = (key: string, value: string) => {
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      void stageHostedData(slug, cue.graphic, batch).catch((e: Error) => onError(e.message));
    }, 400);
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
    if (timer.current) clearTimeout(timer.current);
    void stageHostedData(slug, cue.graphic, data).catch((e: Error) => onError(e.message));
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
    if (timer.current) clearTimeout(timer.current);
    void stageHostedData(slug, cue.graphic, row.values).catch((e: Error) => onError(e.message));
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
            ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet — press ✎ Update`
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
        {stateLabel && <span className="hosted-state-chip">{stateLabel}</span>}
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
      {events.length > 0 && (
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
                  'and re-sends this cue’s values with it — use it when air and this page have ' +
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
            These fire the graphic’s own beats on the layer that is on air, immediately — they carry
            values from this cue, so type them above first.
            {stateGroups.length > 0 && ' “Snap to state…” is for RECOVERY: it jumps straight to a state with no animation.'}
          </p>
          {eventSections.map(([section, buttons]) => (
            <div key={section} className="pd-actions-section">
              {(eventSections.length > 1 || section !== 'Actions') && <h4>{section}</h4>}
              <div className="pd-actions-row">
                {buttons.map((e) => (
                  <button
                    key={e.event}
                    disabled={!isEventLegal(legality, e.event, liveState)}
                    className={e.destructive ? 'ctl-event-destructive' : undefined}
                    onClick={() => {
                      const payload = eventPayload(e, valueOf);
                      // An `adjust` field (a goal's +1) rode moved by its delta: stage the new
                      // figure into the shared buffer at once (the live-number bump's rule, so
                      // every open page follows and the next press counts from it).
                      const adjusted = movedKeys(e).filter((key) => payload?.[key] !== undefined);
                      if (adjusted.length > 0 && payload) {
                        const staged = Object.fromEntries(adjusted.map((key) => [key, payload[key]]));
                        setEcho((v) => ({ ...v, ...staged }));
                        setEntryId('');
                        if (timer.current) clearTimeout(timer.current);
                        void stageHostedData(slug, cue.graphic, staged).catch((err: Error) => onError(err.message));
                        onPreview({ ...currentValues(), ...staged });
                      }
                      void sendHostedControl(
                        slug,
                        cue.graphic,
                        payload ? { t: 'event', event: e.event, payload } : { t: 'event', event: e.event },
                      ).catch((err: Error) => onError(err.message));
                    }}
                    title={
                      movedKeys(e).length > 0
                        ? `Fires "${e.event}" and moves ${adjustWords(e, (key) => descriptorByKey.get(key)?.label)} with it — only where the graph allows it`
                        : `Fires "${e.event}" — only where the graph allows it`
                    }
                  >
                    ⚡ {e.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
          const next = String((parseInt(valueOf(key), 10) || 0) + delta);
          setEcho((v) => ({ ...v, [key]: next }));
          setEntryId('');
          // Immediate, not the typing debounce: the value just aired, so the shared buffer
          // must say so now (the loadEntry precedent).
          if (timer.current) clearTimeout(timer.current);
          void stageHostedData(slug, cue.graphic, { [key]: next }).catch((e: Error) => onError(e.message));
          onPreview({ ...currentValues(), [key]: next });
          void sendHostedControl(slug, cue.graphic, { t: 'update', data: { [key]: next } })
            .catch((err: Error) => onError(err.message));
        };
        return (
          <div className="pd-editor-events pd-live-numbers" data-testid="hosted-live-numbers">
            {numberFields.map((d) => (
              <span key={d.key} className="pd-live-number" data-testid={`hosted-live-number-${d.key}`}>
                <span className="pd-live-number-label">{d.label}</span>
                <button
                  disabled={!live}
                  title={live ? `Changes "${d.label}" on air immediately` : 'This cue is not on air — Take it first'}
                  onClick={() => bump(d.key, -1)}
                  data-testid={`hosted-live-number-${d.key}-down`}
                >
                  −
                </button>
                <button
                  disabled={!live}
                  title={live ? `Changes "${d.label}" on air immediately` : 'This cue is not on air — Take it first'}
                  onClick={() => bump(d.key, 1)}
                  data-testid={`hosted-live-number-${d.key}-up`}
                >
                  +
                </button>
              </span>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
