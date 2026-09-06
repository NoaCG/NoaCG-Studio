import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useRouter } from '../../app/router';
import { graphicById, newEntry, updateGraphic, type ControlEntry, type GraphicDoc } from '../../model/library';
import { commitDurableWrites } from '../../model/durableStore';
import {
  adjustWords as adjustWordsFor,
  fieldDescriptors,
  eventButtons,
  eventLegality,
  eventPayload,
  formatMachineState,
  isEventLegal,
  machineStateNames,
  movedKeys,
  overflowNote,
  sourceKeys,
  type ControlButton,
} from '../../control/controlModel';
import { renderControlPanelHtml } from '../../control/controlPanelHtml';
import { composeDocument } from '../../preview/composeDocument';
import {
  postPreviewCmd,
  PREVIEW_STATE_TYPE,
  type PreviewCmd,
  type PreviewMachineState,
} from '../../preview/previewProtocol';
import { addGraphicToShow, createShowNamedChecked } from '../../model/shows';
import { raiseStorageAlert } from '../../store/storageAlert';
import { openGraphicById, useSaveUi } from '../../store/saveActions';
import { setFieldDefault } from '../../blocks/edit';
import { parseAnimData } from '../../blocks/animData';
import {
  applyMotionPreset,
  currentMotionEasing,
  currentMotionPreset,
  easesForChoice,
  easingLegalForMotions,
  easingsForMotions,
  motionPresetById,
  motionTargets,
  type MotionPick,
  type MotionPresetId,
} from '../../blocks/motionPresets';
import { EASINGS, type EasingId } from '../../model/easings';
import { writeAnimData } from '../../templates/shared/animRuntime';
import type { AnimPhase } from '../../blocks/presetRegistry';
import MotionPresetPicker from '../MotionPresetPicker';
import { FieldRow } from '../fields/FieldControl';
import BrandLogo from '../BrandLogo';
import NewGraphicButton from '../NewGraphicButton';
import ProductionPicker from './ProductionPicker';
import { IconControl } from '../icons';
import { slug } from '../../model/slug';

/** The speed knob's three stops — the wizard's Animation step offers the same three
 *  (model/wizard.ts AnimSpeed: ±33% read as "no change" on the owner's walk, ±80% does not). */
const MOTION_SPEEDS: { label: string; value: number }[] = [
  { label: 'Slower', value: 0.6 },
  { label: 'Normal', value: 1 },
  { label: 'Faster', value: 1.8 },
];
const motionName = (id: MotionPresetId | null) => (id ? motionPresetById(id).name : 'its own');
const speedName = (speed: number) => MOTION_SPEEDS.find((s) => s.value === speed)?.label ?? `${speed}×`;

/**
 * The per-graphic CONTROL PANEL (route `#/control/<graphicId>`, docs/SAVED_CONTENT_MODEL.md §4):
 * the saved graphic's fields, its named ENTRIES (create / duplicate / edit / delete / select),
 * the state machine's event buttons, and a live preview to rehearse against. The active
 * entry's values feed Play here, the editor preview on open, and the downloadable standalone
 * controlpanel.html (entries baked in). Operating needs no account — this is local-first.
 *
 * This is the surface that AIRS a graphic, but the template it airs can still be AI-generated or
 * imported code, so its iframe carries no `allow-same-origin` like every other preview surface —
 * there is no reaching in via `contentWindow`/`contentDocument`. Every transport action (Play,
 * Update, Next, Stop, an event button) and the machine-state poll go through
 * preview/previewProtocol.ts's command channel instead (composeDocument's `liveControl` option);
 * `postCmd` below posts `{ type: 'spx-preview-cmd', cmd, ... }` and the document replies with its
 * machine pointers (`spx-preview-state`) for the poll to read.
 */
export default function GraphicControlPage({ id }: { id: string }) {
  const navigate = useRouter((s) => s.navigate);
  const requestSwitch = useSaveUi((s) => s.requestSwitch);
  const [doc, setDoc] = useState<GraphicDoc | null>(() => graphicById(id));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The entry whose ✕ is armed (two-step delete), or null. Cleared by any other entry's arm. */
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  /** The topbar's "+ Production" picker. */
  const [addProdOpen, setAddProdOpen] = useState(false);

  // Re-read when the route id changes (Back/Forward between two panels).
  useEffect(() => setDoc(graphicById(id)), [id]);

  // FIT THE GRAPHIC TO THE STAGE, like the editor canvas and the Home card do. A template's
  // elements are placed in px against its own resolution, so rendering a 1920×1080 document
  // into a ~1060px iframe would show a lower third at nearly twice its real share of frame -
  // an operator preview that lies about composition is worse than no preview. The iframe is
  // therefore sized to the template's OWN resolution and scaled down to fit.
  const [stage, setStage] = useState({ w: 0, h: 0 });
  /** Scale that fits the whole frame in the stage; 0 until measured, so nothing flashes at 1:1. */
  const fit =
    stage.w && stage.h && doc
      ? Math.min(stage.w / doc.template.resolution.width, stage.h / doc.template.resolution.height)
      : 0;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc?.id]);

  const descriptors = useMemo(
    () => (doc ? fieldDescriptors(doc.template.fields, { includeHidden: false }) : []),
    [doc],
  );
  const buttons = useMemo(() => (doc ? eventButtons(doc.template.js) : []), [doc]);
  // Grouped by the SECTION the type declared ("Answer", "Vote", "Flag", "Result", "Clock"),
  // in declared order — the same grouping the Rehearse panel, the exported panel and the
  // production page build. An undeclared event falls into "Events", as it does there.
  /** A payload named in the OPERATOR'S words, never as `f7` (docs/PLAYOUT_DASHBOARD.md §7b).
   *  The production page already words its ⚡ tooltips this way; this surface and the editor's
   *  Rehearse panel printed the raw ids, which says nothing about what pressing the button airs -
   *  "carrying Audience results" is the whole explanation, "carrying f7" is none of it. */
  const payloadWords = (b: ControlButton): string =>
    (b.payload ?? []).map((key) => descriptors.find((d) => d.key === key)?.label ?? key).join(', ');
  const adjustWords = (b: ControlButton): string => adjustWordsFor(b, (key) => descriptors.find((d) => d.key === key)?.label);
  const eventSections = useMemo(() => {
    const sections: [string, ControlButton[]][] = [];
    for (const b of buttons) {
      const name = b.section ?? 'Events';
      const bucket = sections.find(([s]) => s === name);
      if (bucket) bucket[1].push(b);
      else sections.push([name, [b]]);
    }
    return sections;
  }, [buttons]);
  // Keyed on the TEMPLATE, not the whole record: an entry edit rewrites `doc` on every
  // keystroke, and recomposing the document there only to hand React an identical string is
  // work done to be thrown away.
  const template = doc?.template ?? null;
  const srcdoc = useMemo(() => (template ? composeDocument(template, { liveControl: true }) : ''), [template]);

  /** Post a command into the live preview (no-op if the iframe hasn't loaded one yet). */
  const postCmd = useCallback((msg: PreviewCmd) => {
    postPreviewCmd(iframeRef.current?.contentWindow, msg);
  }, []);

  // THE MOTION SECTION — the no-code IN/OUT picker (blocks/motionPresets.ts) for a saved
  // graphic. The cards that light are READ BACK from the template's data block every render
  // (currentMotionPreset), never remembered here: the template is the source of truth, and a
  // graphic whose motion came from the catalog or a timeline edit honestly lights nothing.
  const anim = useMemo(() => (template ? parseAnimData(template.js) : null), [template]);
  const motionIn = useMemo(() => (template && anim ? currentMotionPreset(template, anim, 'in') : null), [template, anim]);
  const motionOut = useMemo(() => (template && anim ? currentMotionPreset(template, anim, 'out') : null), [template, anim]);
  const motionUnits = useMemo(() => (template && anim ? motionTargets(template, anim).length : 0), [template, anim]);
  // The CURVE is read back the same way — off the keyframes the last pick stamped it into, not
  // out of component state — so it survives a reload and an edit made anywhere else. It is a
  // modifier on a universal motion: with neither phase holding one (a catalog choreography, a
  // hand-keyed timeline) there is nothing for it to shape, and the control says so.
  const motionEasing = useMemo(
    () => (template && anim ? currentMotionEasing(template, anim, { in: motionIn, out: motionOut }) : 'auto'),
    [template, anim, motionIn, motionOut],
  );
  // The offer is what the picked motion can actually RENDER (blocks/motionPresets.ts —
  // an overshoot needs an unclamped property to overshoot into), asked of BOTH phases because
  // one setting drives both. Same rule, same list as the wizard's Animation step.
  const easeOptions = useMemo(() => easingsForMotions([motionIn, motionOut]), [motionIn, motionOut]);
  const easeSettable = motionIn !== null || motionOut !== null;
  const [motionDirection, setMotionDirection] = useState<AnimPhase>('both');
  const [motionOpen, setMotionOpen] = useState(false);
  /** Armed by a motion pick: the REBUILT document plays its new entrance once (then the exit,
   *  then parks on air again) instead of loading parked, so the operator sees what they chose.
   *  A plain reload — opening the page, switching entries — still lands parked. */
  const demoAfterLoad = useRef(false);
  const demoTimers = useRef<number[]>([]);
  const clearDemo = useCallback(() => {
    demoTimers.current.forEach((t) => clearTimeout(t));
    demoTimers.current = [];
  }, []);
  useEffect(() => clearDemo, [clearDemo]);

  /** The active entry's values over the graphic's own defaults — the merge `update()` performs
   *  live, and the same data the settled preview and Play both use. */
  const activeData = useMemo(() => {
    const entry = doc ? doc.entries.find((e) => e.id === doc.activeEntryId) ?? null : null;
    const merged: Record<string, string> = {};
    for (const d of descriptors) merged[d.key] = String(entry?.values[d.key] ?? d.defaultValue ?? '');
    return JSON.stringify(merged);
  }, [doc, descriptors]);

  // RE-SETTLE ON ENTRY SWITCH, without rebuilding the document. Selecting an entry must show
  // ITS data at rest — an operator picks the next row and looks at what they are about to air —
  // and this preview used to get there by KEYING the iframe on the active entry, so every
  // switch tore the graphic down and re-composed it: GSAP re-parsed, fonts re-fetched, the
  // whole document rebuilt to change a few strings, on the one gesture stepping a rundown is
  // made of. The 'settle' command drives the LIVE document through the same recipe the load path
  // uses. The dependency is the entry ID alone, deliberately: typing into the entry editor must
  // NOT reach the graphic, because this surface is the one that AIRS — pushing a half-typed name
  // is what the explicit ⟳ Update button exists to prevent.
  const activeEntryId = doc?.activeEntryId ?? null;
  const settleDataRef = useRef(activeData);
  useEffect(() => {
    settleDataRef.current = activeData;
  }, [activeData]);
  useEffect(() => {
    postCmd({ cmd: 'settle', data: settleDataRef.current });
  }, [activeEntryId, postCmd]);

  // WHERE THE GRAPHIC IS, and which presses the machine would actually accept. Every other
  // operator surface (the editor's Rehearse panel, the event strip, the hosted page) polls the
  // runtime's own pointers and greys an event with no arrow out of the current state; this
  // page shipped without either, so a live operator saw no on-air indication at all and every
  // button looked pressable whether or not the graphic would drop it. Same rule, same poll — but
  // over the command channel: a 'state' request/reply round trip in place of a direct
  // noacgMachineState() read, since the iframe carries no allow-same-origin.
  const legality = useMemo(() => (doc ? eventLegality(doc.template.js) : {}), [doc]);
  const [machineState, setMachineState] = useState<PreviewMachineState | null>(null);
  /** The field ids the graphic reported as too long to fit (`noacgTextOverflow()`). */
  const [overflow, setOverflow] = useState<string[]>([]);
  useEffect(() => {
    // EVERY template answers noacgMachineState() (a machine-less one through its derived
    // machine, kept honest by noacgTrackPath) — so the poll runs for all of them: the on-air
    // tally below needs it, not only the event buttons' greying.
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data;
      if (!msg || typeof msg !== 'object' || msg.type !== PREVIEW_STATE_TYPE) return;
      setMachineState(msg.state);
      // …and the same reply's other half: which values the graphic could not make fit (the
      // owner's warn ruling, docs/SVG_IMPORT_PLAN.md §3). This surface pushes values only on
      // ⟳ Update / ▶ Play by design, so the warning is about what was SENT — which is exactly
      // the claim worth making here: the graphic on air cannot hold that copy.
      const over = Array.isArray(msg.overflow) ? msg.overflow.map(String) : [];
      setOverflow((prev) => (prev.join(',') === over.join(',') ? prev : over));
    };
    window.addEventListener('message', onMessage);
    const tick = () => postCmd({ cmd: 'state' });
    tick();
    const handle = setInterval(tick, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(handle);
    };
  }, [buttons.length, doc?.id, postCmd]);
  // WORN AS WORDS, not as ids. The runtime reports `sealed` / `enter`; the operator has only
  // ever seen "Locked, choice hidden" and "Enter", and this chip is what every greyed button is
  // justified against. One formatter, shared with the production and hosted pages.
  const stateNames = useMemo(() => (doc ? machineStateNames(doc.template.js) : {}), [doc]);
  const stateLabel = formatMachineState(stateNames, machineState);
  const overflowSet = new Set(overflow.filter((key) => descriptors.some((d) => d.key === key)));
  const overflowMessage = overflowNote(
    [...overflowSet],
    Object.fromEntries(descriptors.map((d) => [d.key, d.label])),
  );
  /** The operator PLAYED something here and has not stopped it. Machine state alone cannot
   *  carry the tally: the load-time SETTLE parks the preview at its on-air pose, which walks
   *  the derived machine to its entered state — so "state ≠ off" is true before anyone
   *  pressed a thing (browser-verified). The tally therefore needs both halves: an operator
   *  action started it AND the machine has not returned to off (a stop press, a self-clear
   *  timer, or an exit event all land the machine back on off, clearing the tally). */
  const [aired, setAired] = useState(false);
  /** The figures an ⚡ `adjust` press put on air while NO entry was active (a goal's +1 on a
   *  graphic with no entries): the next press counts from here rather than from the default
   *  again. Cleared by anything that airs a whole value set (Play, ⟳ Update). */
  const [adjusted, setAdjusted] = useState<Record<string, string>>({});
  /** The lifecycle group is `main` on every template (a derived machine has only it); a
   *  parallel group's own state (an alert level, a language) says nothing about being up. */
  const machineOff = !!machineState && !!machineState.groups &&
    ('main' in machineState.groups
      ? machineState.groups.main === 'off'
      : Object.values(machineState.groups).every((s) => s === 'off'));
  const onAir = aired && !machineOff;

  if (!doc) {
    return (
      <div className="app home-page">
        <header className="topbar">
          <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
            <BrandLogo size={24} />
          </button>
          <span className="tpl-name">Control panel</span>
        </header>
        <div className="home-body">
          <main className="home-content">
            <h2>Graphic not found</h2>
            <p className="hint">It may have been deleted, or it lives in another browser profile.</p>
            <button className="primary" onClick={() => navigate({ view: 'home', section: null })}>← Home</button>
          </main>
        </div>
      </div>
    );
  }

  const active = doc.entries.find((e) => e.id === doc.activeEntryId) ?? null;

  /** Persist a library patch and mirror it into local state (the model layer is the store).
   *  The patch is computed from the LIBRARY's current record, not the render's `doc` — two
   *  mutations in one tick (double-click, batched handlers) must compose, not overwrite. */
  const patch = (make: (cur: GraphicDoc) => Parameters<typeof updateGraphic>[1]) => {
    const cur = graphicById(doc.id);
    if (!cur) return;
    const { doc: next, error } = updateGraphic(cur.id, make(cur));
    if (next) setDoc(next);
    if (error) setNote(error);
    // A refusal arrives after the call returns (model/durableStore.ts), so the note has to wait
    // for it. Entries are typed-in operator data with no undo behind them - a rename or a new
    // row that silently did not persist is exactly what this surface must not do.
    else void commitDurableWrites().then((failure) => failure && setNote(failure));
  };

  /** The values a push sends: the graphic's own defaults underlie the entry, exactly as
   *  update() merges live. */
  const mergedValues = (values: Record<string, string>) => {
    const merged: Record<string, string> = {};
    for (const d of descriptors) merged[d.key] = String(values[d.key] ?? d.defaultValue ?? '');
    return merged;
  };

  const sendUpdate = (values: Record<string, string>) => {
    postCmd({ cmd: 'update', data: JSON.stringify(mergedValues(values)) });
    setAdjusted({});
  };

  const playEntry = (entry: ControlEntry | null) => {
    postCmd({ cmd: 'play', data: JSON.stringify(mergedValues(entry?.values ?? {})) });
    setAdjusted({});
    setAired(true);
  };

  /** Fire a machine event. A payload rides from the ACTIVE ENTRY; an `adjust` field (a goal's
   *  +1) rides moved by its delta from what is on air - the entry's value, else the last figure
   *  a press here put up, else the graphic's default - and the new figure is written back into
   *  the entry (or remembered for the no-entry case) so the next press counts from it. */
  const fireEvent = (b: ControlButton) => {
    // A PAYLOAD ONLY RIDES WHEN THERE IS SOMETHING TO SEND. The values a payload carries live in
    // an ENTRY on this surface, and a freshly saved graphic has none - so building the payload
    // from `active?.values[key] ?? ''` sent an EMPTY string for every payload field, which the
    // machine then applied: pressing ⚡ Select answer on a graphic with no entries wiped the
    // pick instead of making one. The guard is about the EVENT, never about the value, so
    // nothing downstream was going to catch that. With no entry the event fires bare and the
    // graphic keeps the field values it already has on air - the same thing the exported panel
    // does, where the payload comes from field boxes that always hold a value.
    const descriptorByKey = new Map(descriptors.map((d) => [d.key, d]));
    // A field the press MOVES (an adjust's figure, an add's list) or READS (an add's source)
    // has a value here even with no entry: the last figure a press put up, else the default -
    // so a goal counts from something and a Reveal letter has a box to read.
    const counted = new Set([...movedKeys(b), ...sourceKeys(b)]);
    const payload = eventPayload(b, (key) => {
      const entryValue = active?.values[key];
      if (entryValue !== undefined) return String(entryValue);
      if (counted.has(key)) return adjusted[key] ?? descriptorByKey.get(key)?.defaultValue;
      return undefined;
    });
    postCmd({ cmd: 'dispatch', event: b.event, payload: payload ?? {} });
    for (const key of movedKeys(b)) {
      const value = payload?.[key];
      if (value === undefined) continue;
      if (active) setEntryValue(active, key, value);
      else setAdjusted((m) => ({ ...m, [key]: value }));
    }
    // An accepted event can be what airs the graphic (an arrow out of off); the machine-off
    // check above clears the tally if it was not.
    setAired(true);
  };

  const addEntry = () => {
    const values: Record<string, string> = {};
    for (const d of descriptors) values[d.key] = String(d.defaultValue ?? '');
    const entry = newEntry('', values);
    patch((cur) => ({
      entries: [...cur.entries, { ...entry, label: `Entry ${cur.entries.length + 1}` }],
      activeEntryId: entry.id,
    }));
  };

  const duplicateEntry = (entry: ControlEntry) => {
    const copy = newEntry(`${entry.label} copy`, entry.values);
    patch((cur) => {
      const i = cur.entries.findIndex((e) => e.id === entry.id);
      const entries = [...cur.entries];
      entries.splice(i + 1, 0, copy);
      return { entries, activeEntryId: copy.id };
    });
  };

  const deleteEntry = (entry: ControlEntry) => {
    patch((cur) => ({
      entries: cur.entries.filter((e) => e.id !== entry.id),
      activeEntryId: cur.activeEntryId === entry.id ? null : cur.activeEntryId,
    }));
  };

  const setEntryValue = (entry: ControlEntry, key: string, value: string) => {
    // The first field doubles as the label until the operator renames it explicitly.
    const firstKey = descriptors[0]?.key;
    const autoLabel = entry.label.startsWith('Entry ') && firstKey && key === firstKey;
    patch((cur) => ({
      entries: cur.entries.map((e) =>
        e.id === entry.id
          ? { ...e, values: { ...e.values, [key]: value }, label: autoLabel ? value || e.label : e.label, updatedAt: new Date().toISOString() }
          : e,
      ),
    }));
  };

  const renameEntry = (entry: ControlEntry, label: string) => {
    patch((cur) => ({ entries: cur.entries.map((e) => (e.id === entry.id ? { ...e, label } : e)) }));
  };

  /** Write the active entry's values into the template's field DEFAULTS, so every export
   *  (SPX, CasparCG, overlay…) carries this data out of the box. */
  const makeDefaultData = (entry: ControlEntry) => {
    patch((cur) => {
      let template = cur.template;
      for (const d of descriptors) {
        const v = entry.values[d.key];
        if (v !== undefined) template = setFieldDefault(template, d.key, v);
      }
      return { template };
    });
    setNote(`✓ "${entry.label}" is now the graphic's default data — exports start with it.`);
  };

  /** Show the motion once in the preview: the entrance, a hold, the exit, then park on air
   *  again the way the page loads (the wizard's preview demo, in this page's vocabulary). */
  const playMotionDemo = () => {
    clearDemo();
    postCmd({ cmd: 'play', data: activeData });
    demoTimers.current.push(
      window.setTimeout(() => postCmd({ cmd: 'stop' }), 1700),
      window.setTimeout(() => postCmd({ cmd: 'settle', data: settleDataRef.current }), 2800),
    );
  };

  /** Rewrite the entrance and/or exit with a universal motion — ONE deterministic data edit,
   *  saved through the same patch every entry edit takes; the rebuilt preview then plays it. */
  const pickMotion = (pick: MotionPick) => {
    let written = false;
    patch((cur) => {
      const data = parseAnimData(cur.template.js);
      if (!data) return {};
      // The pair the graphic will hold once this pick lands — which is what decides whether the
      // curve beside it still means anything.
      const ids = { in: pick.in ?? motionIn, out: pick.out ?? motionOut };
      const legal = easingLegalForMotions([ids.in, ids.out], motionEasing);
      // A curve the new motion cannot show drops to Auto rather than staying set and doing
      // nothing (the wizard's Animation step does exactly this). The phase that was NOT picked
      // is rewritten with it too — otherwise the data would keep a curve on the exit that this
      // control no longer offers, which is the invisible setting the fallback exists to end.
      const full: MotionPick = { ...pick };
      if (!legal) {
        for (const ph of ['in', 'out'] as const) if (full[ph] === undefined && ids[ph]) full[ph] = ids[ph]!;
      }
      const next = applyMotionPreset(cur.template, data, full, easesForChoice(legal ? motionEasing : 'auto'));
      const js = next && writeAnimData(cur.template.js, next);
      if (!js) return {};
      written = true;
      return { template: { ...cur.template, js } };
    });
    if (written) demoAfterLoad.current = true;
  };

  /** The curve the picked motion travels on — one setting for both phases, applied by rewriting
   *  every phase that holds a universal motion with the same motion and the new ease. */
  const setMotionEasing = (choice: EasingId) => {
    if (choice === motionEasing) return;
    const pick: MotionPick = {};
    if (motionIn) pick.in = motionIn;
    if (motionOut) pick.out = motionOut;
    if (pick.in === undefined && pick.out === undefined) return;
    let written = false;
    patch((cur) => {
      const data = parseAnimData(cur.template.js);
      const next = data && applyMotionPreset(cur.template, data, pick, easesForChoice(choice));
      const js = next && writeAnimData(cur.template.js, next);
      if (!js) return {};
      written = true;
      return { template: { ...cur.template, js } };
    });
    if (written) demoAfterLoad.current = true;
  };

  /** The speed knob (NOACG_ANIM.speed): every duration divides by it at playback. */
  const setMotionSpeed = (speed: number) => {
    if (anim?.speed === speed) return; // the active stop - no write, no rebuild
    let written = false;
    patch((cur) => {
      const data = parseAnimData(cur.template.js);
      if (!data || data.speed === speed) return {};
      const js = writeAnimData(cur.template.js, { ...data, speed });
      if (!js) return {};
      written = true;
      return { template: { ...cur.template, js } };
    });
    if (written) demoAfterLoad.current = true;
  };

  const downloadPanel = () => {
    const html = renderControlPanelHtml(doc.template, null, { entries: doc.entries });
    saveAs(new Blob([html], { type: 'text/html' }), `${slug(doc.name)}_controlpanel.html`);
    setNote('✓ Control panel downloaded — open it beside the exported graphic; entries included.');
  };

  /** "+ PRODUCTION" FROM HERE (owner walk 2026-08-23). This is where a graphic gets test-played,
   *  and the natural next thought after it works is "put it in the show" — which until now meant
   *  going back to Home and finding its row again. Same picker, same pooling verb as the library
   *  row's: a production holds a COPY with a graphicId back-link (docs/SAVED_CONTENT_MODEL.md §1),
   *  so adding from here is the same operation, not a second one. */
  const addToProduction = async (showId: string, showName: string): Promise<boolean> => {
    const { error: written } = addGraphicToShow(showId, doc.template, { graphicId: doc.id });
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Adding “${doc.name}” to “${showName}”`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      return false;
    }
    setNote(`✓ "${doc.name}" is in "${showName}".`);
    return true;
  };

  const addToNewProduction = async (rawName: string): Promise<boolean> => {
    const { show, error: written } = createShowNamedChecked(rawName);
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Creating the production “${show.name}”`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      return false;
    }
    const ok = await addToProduction(show.id, show.name);
    if (ok) navigate({ view: 'production', id: show.id });
    return ok;
  };

  return (
    <div className="app home-page control-page" data-testid="graphic-control-page">
      <header className="topbar">
        <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
          <BrandLogo size={24} />
        </button>
        {/* The logo goes Home too, but an operator page needs a control that SAYS so: this is
            a leaf surface reached from Home, from a package, and from a graphic, and the way
            back was previously a bare wordmark. */}
        <button
          onClick={() => navigate({ view: 'home', section: null })}
          title="Back to Home — your graphics, packages, control panels, and videos"
          data-testid="control-home"
        >
          ← Home
        </button>
        {/* The wizard door in the SHARED LEFT ORDER (owner walk, 2026-08-29): logo, Home,
            ＋ New graphic, the same trio every shell now opens with. It was in the right-hand
            cluster, one of the three surfaces where the owner could not find it twice in the
            same place. */}
        <NewGraphicButton testid="control-new-project" />
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name"><IconControl /> {doc.name}</span>
        <span className="topbar-meta mono muted">control panel</span>
        <div className="spacer" />
        <ProductionPicker
          open={addProdOpen}
          onOpenChange={setAddProdOpen}
          markGraphicId={doc.id}
          buttonTitle="Add this graphic to a production — the unit that airs"
          buttonTestid="control-add-production"
          menuTestid="control-production-menu"
          newNameTestid="control-new-production-name"
          newSubmitTestid="control-new-production"
          onAdd={addToProduction}
          onCreate={addToNewProduction}
        />
        <button
          onClick={() =>
            requestSwitch(
              () => {
                openGraphicById(doc.id);
                navigate({ view: 'graphic', id: doc.id });
              },
            )
          }
          title="Open this graphic in the editor"
          data-testid="control-open-editor"
        >
          ✎ Edit graphic
        </button>
        <button onClick={downloadPanel} title="A standalone operator page for the exported graphic (entries included)">
          ⬇ controlpanel.html
        </button>
      </header>

      <div className="control-page-body">
        <section className="control-page-preview">
          {/* Parked at the settled on-air state on load — a graphic is hidden until play(), so
              an unsettled preview is an empty black rectangle where the operator expects to see
              what they are about to air. Selecting an entry re-settles this SAME document (the
              effect above); the key is the GRAPHIC, so only opening a different one rebuilds. */}
          <div className={`control-page-stage${onAir ? ' on-air' : ''}`} ref={stageRef} data-testid="control-stage">
            {/* The red tally: unmissable while the graphic is up. This surface AIRS (the
                acceptance round called the old chip-only mark "a small off becomes enter"). */}
            {onAir && <span className="on-air-badge" data-testid="control-on-air">● ON AIR</span>}
            <iframe
              key={doc.id}
              ref={iframeRef}
              title="Graphic preview"
              srcDoc={srcdoc}
              sandbox="allow-scripts"
              onLoad={() => {
                if (!demoAfterLoad.current) return postCmd({ cmd: 'settle', data: activeData });
                demoAfterLoad.current = false;
                playMotionDemo();
              }}
              style={{
                width: doc.template.resolution.width,
                height: doc.template.resolution.height,
                // translate(-50%, -50%) re-centres the absolutely-placed frame; the scale then
                // fits it. Scale 0 until the stage is measured, so nothing flashes at 1:1.
                transform: `translate(-50%, -50%) scale(${fit})`,
              }}
            />
            {/* WHERE THE FRAME ENDS. The graphic is transparent over black here, so without an
                edge the operator is judging headroom against a void — they cannot see whether a
                lower third sits in safe area or is about to hang off the bottom. Sized to the
                SCALED frame and left untransformed, so the hairline stays one pixel at every
                zoom. Decorative: the iframe beside it carries the content. */}
            {fit > 0 && (
              <div
                className="control-page-frame"
                aria-hidden="true"
                style={{
                  width: Math.round(doc.template.resolution.width * fit),
                  height: Math.round(doc.template.resolution.height * fit),
                }}
              />
            )}
          </div>
          <div className="control-page-transport">
            <button className="primary" onClick={() => playEntry(active)} data-testid="control-play">
              ▶ Play{active ? ` “${active.label}”` : ''}
            </button>
            <button onClick={() => sendUpdate(active?.values ?? {})} title="Update fields without replaying" data-testid="control-update">
              ⟳ Update
            </button>
            {/* A bare "»" is not a label an operator can read under pressure — the glyph keeps
                the SPX vocabulary, the word says what pressing it does. */}
            <button onClick={() => postCmd({ cmd: 'next' })} title="Advance to the next step" data-testid="control-next">
              » Next
            </button>
            <button
              onClick={() => { postCmd({ cmd: 'stop' }); setAired(false); }}
              title="Take the graphic off air"
              data-testid="control-stop"
            >
              ■ Stop
            </button>
            {/* WHERE THE GRAPHIC IS — the fact the event buttons are greyed against, so the
                surface never greys a button without saying why. This page is the ON-AIR
                control surface (the editor's Rehearse tab is the preview-only one), so the
                chip names the graphic's state plainly rather than hedging it as a preview. */}
            {stateLabel && (
              <span
                className={`control-state-chip${onAir ? ' on-air' : ''}`}
                title="The graphic's current state — what the event buttons are greyed against"
                data-testid="control-state"
              >
                {onAir ? '●' : '◇'} {stateLabel}
              </span>
            )}
          </div>

          {/* THE GRAPHIC'S OWN EVENTS, IN THE SECTIONS THE TYPE DECLARED. They used to sit in
              the transport row above, so a quiz put nine controls in one flat line with no
              grouping and no order cue — while every other renderer of this vocabulary (the
              Rehearse panel, the exported panel, the production page) built the sections. The
              lifecycle row stays what it is: ▶ ⟳ » ■ are the four presses EVERY graphic has,
              and an event is the ones only this one has. */}
          {eventSections.length > 0 && (
            <div className="ctl-events control-page-events">
              {eventSections.map(([section, btns]) => (
                <div key={section} className="ctl-event-section">
                  <h4>{section}</h4>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {btns.map((b) => {
                      const legal = isEventLegal(legality, b.event, machineState);
                      return (
                        <button
                          key={b.event}
                          className={b.destructive ? 'ctl-event-destructive' : undefined}
                          disabled={!legal}
                          onClick={() => fireEvent(b)}
                          title={
                            !legal
                              ? `"${b.event}" has no arrow out of the current state, so the graphic would drop it`
                              : movedKeys(b).length > 0
                                ? `Fires "${b.event}" and moves ${adjustWords(b)} with it`
                                : b.payload?.length
                                  ? active
                                    ? `Fires "${b.event}" with ${payloadWords(b)} from “${active.label}”`
                                    : `Fires "${b.event}". ${payloadWords(b)} ride this event from the ACTIVE ENTRY — with none selected the graphic keeps its current values.`
                                  : `Fire "${b.event}"`
                          }
                          data-testid={`control-event-${b.event}`}
                        >
                          ⚡ {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MOTION — how the graphic comes on and goes off air, without the timeline. A
              disclosure, closed by default: the stage above shares this column's height, and
              the operator who came to play an entry should not find the preview a third
              shorter for a control they did not ask for. Open, it sits beside ▶ and ■ so a pick
              can be watched at once (the rebuilt document plays it). Absent entirely only when
              the graphic has no NOACG_ANIM block - hand-written motion is the editor's. */}
          {anim && (
            <details
              className="control-motion"
              open={motionOpen}
              onToggle={(e) => setMotionOpen((e.currentTarget as HTMLDetailsElement).open)}
              data-testid="control-motion"
            >
              <summary data-testid="control-motion-summary">
                <strong>Motion</strong>
                <span className="muted">
                  {' '}In: {motionName(motionIn)} · Out: {motionName(motionOut)} · {speedName(anim.speed)}
                  {motionEasing !== 'auto' &&
                    ` · ${EASINGS.find((e) => e.id === motionEasing)?.plain ?? motionEasing}`}
                </span>
              </summary>
              <div className="control-motion-body">
                <MotionPresetPicker
                  inId={motionIn}
                  outId={motionOut}
                  direction={motionDirection}
                  onDirection={setMotionDirection}
                  onPick={(id, phases) => {
                    const pick: MotionPick = {};
                    for (const ph of phases) pick[ph] = id;
                    pickMotion(pick);
                  }}
                  onReplay={playMotionDemo}
                  disabledReason={
                    motionUnits === 0
                      ? 'Nothing to move: this graphic’s root has no elements under it, so a motion has no unit to animate. Edit it in the editor.'
                      : null
                  }
                />
                <div className="row" style={{ gap: 6, marginTop: 10, alignItems: 'center' }} role="group" aria-label="Speed">
                  {/* One width for both labels, so Speed's buttons and Easing's select start on
                      the same left edge — at their natural widths they landed a pixel apart. */}
                  <span className="hint" style={{ marginRight: 4, width: 40 }}>Speed</span>
                  {MOTION_SPEEDS.map((s) => (
                    <button
                      key={s.value}
                      className={anim.speed === s.value ? 'active' : ''}
                      onClick={() => setMotionSpeed(s.value)}
                      data-testid={`control-speed-${s.value}`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <span className="hint">entrance, steps and exit together</span>
                </div>
                {/* EASING — the same control the wizard's Animation step offers, on the surface
                    that is supposed to share its engine: until now the curve was frozen at
                    creation here, because the pick wrote the motion's own tuned pair and nothing
                    else could be asked for. The list is what the picked motion can RENDER, and
                    with no universal motion on either phase there is nothing to shape - the
                    graphic's own choreography carries its curves, and that is the editor's. */}
                <div className="row" style={{ gap: 6, marginTop: 10, alignItems: 'center' }}>
                  <span className="hint" style={{ marginRight: 4, width: 40 }}>Easing</span>
                  <select
                    value={motionEasing}
                    disabled={!easeSettable}
                    // 180, like the wizard's own Easing select: a select in a flex row grows
                    // into everything left over, and at this column's width that was a 675 px
                    // control holding one short word.
                    style={{ flex: '0 0 180px' }}
                    onChange={(e) => setMotionEasing(e.target.value as EasingId)}
                    data-testid="control-easing"
                    title={
                      easeSettable
                        ? 'The feel of the motion — how it accelerates and settles'
                        : 'This graphic keeps its own choreography; pick a motion above to give it a curve'
                    }
                  >
                    <option value="auto">Auto — recommended</option>
                    {easeSettable &&
                      easeOptions.map((e) => (
                        <option key={e.id} value={e.id} title={e.description}>{e.plain}</option>
                      ))}
                    {/* A curve the data still holds that this list does not offer (a timeline
                        edit, an older pick): keep it selectable so the select shows what plays
                        rather than rendering blank. */}
                    {motionEasing !== 'auto' && !easeOptions.some((e) => e.id === motionEasing) && (
                      <option value={motionEasing}>
                        {EASINGS.find((e) => e.id === motionEasing)?.plain ?? motionEasing}
                      </option>
                    )}
                  </select>
                  <span className="hint" style={{ flex: '1 1 0', minWidth: 0 }}>
                    {EASINGS.find((e) => e.id === motionEasing)?.description ??
                      'Each motion arrives on the curve it was tuned with — quick in, settling softly.'}
                  </span>
                </div>
              </div>
            </details>
          )}
        </section>

        <aside className="control-page-side">
          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Entries</h3>
            <div className="spacer" />
            <button className="primary" onClick={addEntry} data-testid="add-entry">＋ Add entry</button>
          </div>
          {/* WHAT AN ENTRY IS, where the word is (owner walk 2026-08-23: he had to guess). The
              paragraph under it says what this SURFACE is; neither answers the other's
              question, and the definition is the one a first visit needs first. */}
          <p className="hint" data-testid="entries-explainer">
            <strong>An entry is one saved set of field values</strong> — “Anna Andersson ·
            Presenter”, “Michael Smith · Guest”. Select one and ▶ Play to take it on air, then
            switch and play the next. Edits save as you type.
          </p>
          <p className="hint">
            This is the on-air control surface — playing an entry here airs it (the editor’s
            Rehearse tab only drives the preview).
          </p>

          {doc.entries.length === 0 && (
            <p className="hint" data-testid="no-entries">No entries yet — add one to start building your rundown data.</p>
          )}

          <div className="control-entries">
            {doc.entries.map((entry) => (
              <div
                key={entry.id}
                className={`control-entry ${entry.id === doc.activeEntryId ? 'active' : ''}`}
                data-testid={`entry-${entry.id}`}
              >
                <button
                  className="control-entry-label"
                  onClick={() => patch(() => ({ activeEntryId: entry.id }))}
                  title="Make this the active entry"
                  data-testid="select-entry"
                >
                  {entry.id === doc.activeEntryId ? '●' : '○'} {entry.label}
                </button>
                <button onClick={() => playEntry(entry)} title="Play the graphic with this entry" data-testid="play-entry">▶</button>
                <button onClick={() => duplicateEntry(entry)} title="Duplicate">⧉</button>
                {/* ARMED, like Home's graphic delete. An entry is typed-in data with no undo
                    behind it, and this row sits between ▶ Play and the entry switcher on a
                    surface someone drives live — a single stray click cost the whole row. */}
                <button
                  className={deleteArmed === entry.id ? 'reset-armed' : ''}
                  onClick={() => {
                    if (deleteArmed === entry.id) {
                      setDeleteArmed(null);
                      deleteEntry(entry);
                    } else {
                      setDeleteArmed(entry.id);
                    }
                  }}
                  title={deleteArmed === entry.id ? `Click again to delete "${entry.label}"` : 'Delete this entry'}
                  data-testid="delete-entry"
                >
                  {deleteArmed === entry.id ? 'Delete?' : '✕'}
                </button>
              </div>
            ))}
          </div>

          {active && (
            <div className="panel-section" data-testid="entry-editor">
              <label className="save-field">
                <span>Entry label</span>
                <input
                  value={active.label}
                  onChange={(e) => renameEntry(active, e.target.value)}
                  data-testid="entry-label"
                />
              </label>
              {/* TOO LONG TO FIT, reported by the graphic in the preview above (the owner's
                  warn ruling, docs/SVG_IMPORT_PLAN.md §3). It describes what was last SENT,
                  which on this surface is what ⟳ Update / ▶ Play put there. */}
              {overflowMessage && (
                <p className="ctl-over-note" data-testid="entry-overflow">{overflowMessage}</p>
              )}
              {descriptors.map((d) => (
                <FieldRow
                  key={d.key}
                  descriptor={d}
                  value={String(active.values[d.key] ?? d.defaultValue ?? '')}
                  onChange={(v) => setEntryValue(active, d.key, String(v))}
                  overflow={overflowSet.has(d.key)}
                  testIdPrefix="entry-field"
                />
              ))}
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => makeDefaultData(active)} title="Exports will start with this entry's data">
                  ★ Make default data
                </button>
              </div>
            </div>
          )}

          {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'}>{note}</p>}
        </aside>
      </div>
    </div>
  );
}
