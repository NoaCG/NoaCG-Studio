import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import {
  ANIM_DECLARATION,
  parseAnimData,
  serializeAnimData,
  TRANSITION_STYLES,
  type AnimData,
  type AnimGroup,
  type AnimTransition,
} from '../../blocks/animData';
import {
  deriveMachine,
  spxSteps,
  stateById,
  stateProblems,
  timelineKind,
  timelineLayer,
  type StateProblem,
  type TimelineKind,
} from '../../blocks/animMachine';
import { addStep, deleteStep, renameStep } from '../../blocks/animEdit';
import { createStepFromLayer } from '../../blocks/layerTimeline';
import { getTemplateParts } from '../../model/structure';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { EASINGS } from '../../model/easings';
import {
  addGroup,
  addState,
  addTransition,
  deleteState,
  removeGroup,
  removeTransition,
  renameOffPathState,
  setStatePosition,
  setTransitionAfter,
  setTransitionEvent,
  setTransitionStyle,
  setTransitionStyleDuration,
  setTransitionStyleEase,
  setStateTimeline,
  setTransitionTrigger,
} from '../../blocks/machineEdit';
import { emptyStateTimeline } from '../../blocks/timelineLens';
import { writeAnimData } from '../../templates/shared/animRuntime';
import { postPreviewCmd, PREVIEW_STATE_TYPE, type PreviewStateMessage } from '../../preview/previewProtocol';

// Phase 4 (docs/noacg-master-goals.md): the node editor's read-first surface. The machine
// GRAPH beneath the canvas — states as boxes, transitions as arrows, the default path as the
// amber spine, the live current state highlighted — toggling with the step timeline in
// TimelineDock (Rive-style). One generic editor for every graphic: a template without an
// explicit machine shows its DERIVED linear machine (exactly what next() really does), so
// the view is never empty and never lies. Rendering + snap-to-state only; structural editing
// arms in later steps of the phase.

interface StateBox {
  groupId: string;
  id: string;
  name: string;
  /** ▶ » ■ for default-path waypoints (the timeline's cue vocabulary), ○ for the rest state. */
  badge: string | null;
  poseOnly: boolean;
  initial: boolean;
  /** The state's default-path position (steps[pathIndex] is its timeline), or null off-path. */
  pathIndex: number | null;
  /** What the state's content IS (derived, animMachine timelineKind): a LAYER timeline
   *  (one element's animation — Name In), a GRAPHIC timeline (a complete look), or a pose. */
  kind: TimelineKind;
  /** The layer a 'layer' timeline animates (its registry selector), for the tooltip. */
  layerSelector: string | null;
  /** What validateMachine says about THIS state (animMachine `stateProblems`), if anything.
   *  Marked here rather than left to the Export panel: a branch can carry a whole hand-built
   *  timeline and still never be entered, and this is the surface that let you build it. */
  problem: StateProblem | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Arrow {
  key: string;
  groupId: string;
  /** The transition behind an authored arrow; null for the walk's synthetic edges. */
  t: AnimTransition | null;
  /** Its index in group.transitions — the mutators' handle; null for synthetic edges. */
  tIndex: number | null;
  kind: 'walk' | 'walk-stop' | 'operator' | 'timer' | 'reserved';
  label: string;
  path: string;
  labelX: number;
  labelY: number;
}

interface LaneModel {
  group: AnimGroup;
  y: number;
  h: number;
  /** Where the group label sits — the group's topmost box, so it follows dragged boxes. */
  labelY: number;
}

interface GraphModel {
  boxes: StateBox[];
  arrows: Arrow[];
  lanes: LaneModel[];
  /** True once any box carries a persisted position — the auto lane bands stop meaning
   *  anything, so their separator lines are not drawn. */
  freeform: boolean;
  width: number;
  height: number;
}

const BOX_H = 34;
const COL_GAP = 72; // room between boxes for arrowheads + labels
const ROW_GAP = 58; // the off-path row sits well clear of below-box bows
const LANE_PAD_TOP = 40; // lane label + above-box bows
const LANE_PAD_BOTTOM = 34; // below-box bows
const PAD_X = 26;

// Room for the cue badge + the ▤/◇ kind icon + the name — sized so "Name In" and
// "Title In" read whole, not as "Na…" (the acceptance screenshots caught exactly that).
/** `flagged` = the box also carries a problem dot, which takes room from the name span; without
 *  the allowance a two-word state ellipsizes the moment it is marked, exactly when its name
 *  matters most. */
const boxWidth = (name: string, flagged = false) =>
  Math.min(200, Math.max(96, 44 + name.length * 7.5)) + (flagged ? 17 : 0);

/** Cubic bezier path + its midpoint (t = 0.5) for the label. */
function bezier(
  x1: number,
  y1: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x2: number,
  y2: number,
): { path: string; mx: number; my: number } {
  return {
    path: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
    mx: (x1 + 3 * cx1 + 3 * cx2 + x2) / 8,
    my: (y1 + 3 * cy1 + 3 * cy2 + y2) / 8,
  };
}

/** Route one arrow between two boxes. `bow` lifts parallel/branch arrows clear of the
 *  straight spine: positive bows below the boxes, negative above. */
function route(from: StateBox, to: StateBox, bow: number): { path: string; mx: number; my: number } {
  if (from.id === to.id && from.groupId === to.groupId) {
    // Self-transition: a loop arced well clear of the box (a ticker's cycle beat).
    const x1 = from.x + from.w * 0.18;
    const x2 = from.x + from.w * 0.62;
    const y = from.y;
    return bezier(x1, y, x1 - 22, y - 52, x2 + 22, y - 52, x2, y);
  }
  const sameRow = Math.abs(from.y - to.y) < 1;
  if (sameRow && bow === 0) {
    // The spine: straight, right edge to left edge.
    const y = from.y + BOX_H / 2;
    const x1 = from.x + from.w;
    const x2 = to.x;
    return bezier(x1, y, x1 + (x2 - x1) * 0.4, y, x2 - (x2 - x1) * 0.4, y, x2, y);
  }
  if (sameRow) {
    // A branch on the same row: bow below (forward) or above (backward) the boxes.
    const below = bow > 0;
    const y1 = below ? from.y + BOX_H : from.y;
    const y2 = below ? to.y + BOX_H : to.y;
    const x1 = from.x + from.w / 2;
    const x2 = to.x + to.w / 2;
    return bezier(x1, y1, x1, y1 + bow, x2, y2 + bow, x2, y2);
  }
  // Across rows: leave the lower edge of the upper box, arrive at the upper edge of the
  // lower box (or the reverse). `bow` bends the curve sideways so parallel arrows between
  // the same pair (locked → reveal on both "judge" and "next") stay apart.
  const down = to.y > from.y;
  const x1 = from.x + from.w / 2;
  const y1 = down ? from.y + BOX_H : from.y;
  const x2 = to.x + to.w / 2;
  const y2 = down ? to.y : to.y + BOX_H;
  const dy = (y2 - y1) * 0.5;
  return bezier(x1, y1, x1 + bow, y1 + dy, x2 + bow, y2 - dy, x2, y2);
}

/** Lay the machine out: one lane per group (main first), the default path as the top row
 *  left to right, off-path states on a second row beneath — then a state's persisted `at`
 *  overrides its auto slot (the drag's parking spot). Deterministic — same machine, same
 *  picture. */
function buildModel(data: AnimData): GraphModel {
  const machine = data.machine ?? deriveMachine(data);
  // Judged against the machine the graph actually DRAWS, so a template whose machine is still
  // derived is checked as what it will become the moment its first edit materializes it.
  const problems = new Map<string, StateProblem>();
  for (const p of stateProblems({ ...data, machine })) {
    // An error outranks a warning on the same box — one mark, the worse news.
    const key = `${p.groupId}/${p.stateId}`;
    if (p.severity === 'error' || !problems.has(key)) problems.set(key, p);
  }
  const boxes: StateBox[] = [];
  const arrows: Arrow[] = [];
  const lanes: LaneModel[] = [];
  let laneY = 0;
  let width = 0;

  machine.groups.forEach((group, gi) => {
    const isMain = gi === 0;
    const path = isMain ? (group.defaultPath ?? []) : [];
    const row0: string[] = [group.initial, ...path.filter((id) => id !== group.initial)];
    if (!isMain) {
      for (const s of group.states) if (!row0.includes(s.id)) row0.push(s.id);
    }
    const row1 = group.states.map((s) => s.id).filter((id) => !row0.includes(id));

    const byId = new Map<string, StateBox>();
    const layRow = (ids: string[], y: number) => {
      let x = PAD_X;
      for (const id of ids) {
        const state = group.states.find((s) => s.id === id);
        if (!state) continue;
        const name = state.name ?? state.id;
        const pi = path.indexOf(id);
        // ○ marks a state that does nothing on entry — the rest state, and equally any
        // off-path POSE. Only the rest state used to wear it, so a freshly added branch was
        // the one box in the graph with no mark at all, reading as "still loading" rather
        // than "holds the look it arrives with". A branch that HAS a timeline says so with
        // its ▤/◇ kind glyph instead.
        const badge =
          pi < 0
            ? id === group.initial || !state.timeline
              ? '○'
              : null
            : pi === 0
              ? '▶'
              : pi === path.length - 1
                ? '■'
                : '»';
        const timeline = isMain && pi >= 0 ? data.steps[pi] : state.timeline ?? null;
        const problem = problems.get(`${group.id}/${id}`) ?? null;
        const box: StateBox = {
          groupId: group.id,
          id,
          name,
          badge,
          poseOnly: pi < 0 && !state.timeline,
          initial: id === group.initial,
          pathIndex: isMain && pi >= 0 ? pi : null,
          kind: timelineKind(timeline),
          layerSelector: timelineLayer(timeline),
          problem,
          x,
          y,
          w: boxWidth(name, problem !== null),
          h: BOX_H,
        };
        boxes.push(box);
        byId.set(id, box);
        x += box.w + COL_GAP;
      }
      width = Math.max(width, x - COL_GAP + PAD_X);
    };
    const rowY0 = laneY + LANE_PAD_TOP;
    layRow(row0, rowY0);
    if (row1.length > 0) layRow(row1, rowY0 + BOX_H + ROW_GAP);

    // A dragged box parks where it was left — the persisted `at` wins over the auto slot
    // (applied BEFORE the arrows route, so they follow the box).
    for (const state of group.states) {
      const box = byId.get(state.id);
      if (box && state.at) {
        box.x = state.at[0];
        box.y = state.at[1];
        width = Math.max(width, box.x + box.w + PAD_X);
      }
    }

    // The walk's own edges: play into the first waypoint, then waypoint to waypoint. The
    // runtime walks the path POSITIONALLY, so the spine is drawn whether or not each edge is
    // authored — and since the play and final-stop edges are MATERIALISED as lifecycle
    // transitions (deriveMachine emits them, parseAnimData injects them into older explicit
    // machines), every spine arrow is normally selectable. On the entrance pair the
    // lifecycle edge IS the spine (play() enters regardless of other arrows); into the
    // final waypoint an authored operator arrow wins the spine (the next-drives-out opt-in
    // is how that step is then reached — walkEntry's rule) and the stop edge bows beside it.
    const onPair = (from: string, to: string) =>
      group.transitions.filter((t) => t.from === from && t.to === to && t.trigger !== 'data-condition');
    const spineDrawn = new Set<AnimTransition>();
    const walkPairs: Array<[string, string]> = [];
    if (path.length > 0 && group.initial !== path[0]) walkPairs.push([group.initial, path[0]]);
    for (let i = 0; i + 1 < path.length; i++) walkPairs.push([path[i], path[i + 1]]);
    walkPairs.forEach(([fromId, toId], wi) => {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (!from || !to) return;
      const pair = onPair(fromId, toId);
      const lifecycle = pair.find((t) => t.trigger === 'lifecycle') ?? null;
      const other = pair.find((t) => t.trigger !== 'lifecycle') ?? null;
      const intoFinal = toId === path[path.length - 1] && path.length > 1;
      const isPlay = wi === 0 && fromId === group.initial;
      const authored = (isPlay ? lifecycle ?? other : other ?? lifecycle) ?? null;
      if (authored) spineDrawn.add(authored);
      const kind: Arrow['kind'] = intoFinal && (!authored || authored.trigger === 'lifecycle') ? 'walk-stop' : 'walk';
      const styled = authored?.style !== undefined ? ' ≈' : '';
      const label =
        (isPlay
          ? 'play'
          : authored?.trigger === 'lifecycle'
            ? 'stop'
            : authored?.trigger === 'timer'
              ? `⏱ ${authored.after ?? 0}s`
              : authored?.event ?? (intoFinal ? 'stop' : 'next')) + styled;
      const r = route(from, to, 0);
      arrows.push({
        key: `${group.id}-walk-${wi}`,
        groupId: group.id,
        t: authored,
        tIndex: authored ? group.transitions.indexOf(authored) : null,
        kind,
        label,
        path: r.path,
        labelX: r.mx,
        labelY: r.my - 6,
      });
    });

    // Authored branch arrows (everything the walk didn't draw — including a second arrow on
    // a walk pair, like the stop edge beside an authored next-drives-out arrow). Parallel
    // arrows between the same pair bow at increasing depths so they never overlap; a bow
    // below the lane's LAST row widens the lane so nothing clips at the dock's edge.
    const bowCount = new Map<string, number>();
    const lastRowY = row1.length > 0 ? rowY0 + BOX_H + ROW_GAP : rowY0;
    let belowDepth = 0;
    group.transitions.forEach((t, ti) => {
      if (spineDrawn.has(t)) return; // already on the spine
      const from = byId.get(t.from);
      const to = byId.get(t.to);
      if (!from || !to) return;
      const pairKey = [t.from, t.to].sort().join('|');
      const n = bowCount.get(pairKey) ?? 0;
      bowCount.set(pairKey, n + 1);
      const self = from.id === to.id;
      const sameRow = !self && Math.abs(from.y - to.y) < 1;
      const backward = sameRow && to.x < from.x;
      const bow = self ? 0 : (backward ? -1 : 1) * (30 + 16 * n);
      if (sameRow && bow > 0 && Math.abs(from.y - lastRowY) < 1) {
        belowDepth = Math.max(belowDepth, bow + 20);
      }
      const r = route(from, to, bow);
      const kind: Arrow['kind'] =
        t.trigger === 'operator'
          ? 'operator'
          : t.trigger === 'timer'
            ? 'timer'
            : t.trigger === 'lifecycle'
              ? 'walk-stop' // the stop edge bowed beside an authored next-drives-out spine
              : 'reserved';
      const label =
        (t.trigger === 'operator' || t.trigger === 'lifecycle'
          ? (t.event ?? '')
          : t.trigger === 'timer'
            ? `⏱ ${t.after ?? 0}s`
            : 'reserved') + (t.style !== undefined ? ' ≈' : '');
      arrows.push({
        key: `${group.id}-t-${ti}`,
        groupId: group.id,
        t,
        tIndex: ti,
        kind,
        label,
        path: r.path,
        labelX: r.mx,
        // Same-row bows label outside the curve; cross-row parallels stagger vertically.
        labelY: self ? r.my - 10 : sameRow ? r.my + (bow < 0 ? -6 : 12) : r.my - 4 + n * 14,
      });
    });

    const laneH =
      LANE_PAD_TOP +
      BOX_H +
      (row1.length > 0 ? ROW_GAP + BOX_H : 0) +
      Math.max(LANE_PAD_BOTTOM, belowDepth);
    const groupBoxes = boxes.filter((b) => b.groupId === group.id);
    const labelY = Math.min(laneY + 8, ...groupBoxes.map((b) => b.y - 26));
    lanes.push({ group, y: laneY, h: laneH, labelY });
    laneY += laneH;
  });

  const freeform = machine.groups.some((g) => g.states.some((s) => s.at));
  const maxBottom = boxes.reduce((a, b) => Math.max(a, b.y + b.h), 0);
  return {
    boxes,
    arrows,
    lanes,
    freeform,
    width: Math.max(width, 320),
    height: Math.max(laneY, maxBottom + 64),
  };
}

/** Operator-facing names for the arrow styles ('cut' is the broadcast hard cut). */
const STYLE_LABELS: Record<string, string> = {
  cut: 'Cut — instant',
  fade: 'Fade',
  'push-left': 'Push left',
  'push-right': 'Push right',
  'push-up': 'Push up',
  'push-down': 'Push down',
  'wipe-left': 'Wipe left',
  'wipe-right': 'Wipe right',
};

const ARROW_CLASS: Record<Arrow['kind'], string> = {
  walk: 'mg-arrow-walk',
  'walk-stop': 'mg-arrow-walk mg-arrow-stop',
  operator: 'mg-arrow-op',
  timer: 'mg-arrow-timer',
  reserved: 'mg-arrow-reserved',
};

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  data: AnimData;
  /** Open the step timeline parked at a default-path state's step (the dock swaps surface). */
  onOpenStep: (stepIndex: number) => void;
  /** Open a BRANCH state's own inline timeline — the same door, the other kind of state. */
  onOpenStateTimeline: (groupId: string, stateId: string) => void;
}

type Selection =
  | { kind: 'state'; groupId: string; id: string }
  | { kind: 'arrow'; groupId: string; tIndex: number }
  | null;

/** The machine graph (Phase 4). Click a state to SNAP the preview there — instant, parked
 *  (no timers), exactly the schema's "preview without playback" — and to inspect it; click
 *  an authored arrow to inspect and edit the transition (trigger, event, timer delay). A
 *  DERIVED machine is read-only: its graph is a description of the steps, and editing it
 *  first materializes an explicit machine (a later step of the phase). */
export default function MachineGraph({ iframeRef, data, onOpenStep, onOpenStateTimeline }: Props) {
  const template = useTemplateStore((s) => s.template);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const sendSnap = useTemplateStore((s) => s.sendSnap);
  const model = useMemo(() => buildModel(data), [data]);
  const derived = !data.machine;

  const [sel, setSel] = useState<Selection>(null);
  // A structural change can invalidate the selection (an arrow index past the end, a state
  // gone) — drop it rather than pointing the card at the wrong thing.
  useEffect(() => {
    setSel((s) => {
      if (!s) return s;
      const group = (data.machine ?? deriveMachine(data)).groups.find((g) => g.id === s.groupId);
      if (!group) return null;
      if (s.kind === 'state') return group.states.some((st) => st.id === s.id) ? s : null;
      return s.tIndex < group.transitions.length ? s : null;
    });
  }, [data]);

  /** Make a machine edit real: the ONE undoable apply through the pairing-rule writer. */
  const applyData = (next: AnimData | null) => {
    if (!next) return false;
    const js = writeAnimData(template.js, next);
    if (!js) return false;
    applyTemplate({ ...template, js });
    return true;
  };

  /** A STRUCTURAL step edit from the graph (add/delete a waypoint): the same write plus the
   *  SPX `steps` definition sync the timeline's own structural edits perform. */
  const applyStepData = (next: AnimData | null) => {
    if (!next) return false;
    const js = writeAnimData(template.js, next);
    if (!js) return false;
    const settings = { ...template.settings, steps: String(spxSteps(next)) };
    const html = replaceDefinitionInHtml(template.html, settings, template.fields);
    applyTemplate({ ...template, js, html, settings });
    return true;
  };

  const parts = useMemo(() => getTemplateParts(template.html, template.fields), [template.html, template.fields]);
  const channelOf = (selector: string) => parts.find((p) => p.selector === selector)?.channel ?? ('rise' as const);

  /** Delete a default-path waypoint = delete its bound STEP (the positional binding). The
   *  entrance and Out never go; a revealed layer folds back into the entrance. */
  const deleteWaypoint = (pathIndex: number) => applyStepData(deleteStep(data, pathIndex, channelOf));

  /** "Create timeline from layer": a new waypoint named after the layer, whose reveal the
   *  layer moves into — the composed transform shared with the Inspector. */
  const addStepFromLayer = (selector: string) => {
    const next = createStepFromLayer(template, parts, selector);
    if (next) applyTemplate(next);
    return !!next;
  };

  // Keyboard: Delete removes the selection (arrow, off-path state, or a waypoint via its
  // step) — never while typing in one of the cards' inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!sel) return;
      const machine = data.machine ?? deriveMachine(data);
      const group = machine.groups.find((g) => g.id === sel.groupId);
      if (!group) return;
      e.preventDefault();
      if (sel.kind === 'arrow') {
        if (applyData(removeTransition(data, sel.groupId, sel.tIndex))) setSel(null);
        return;
      }
      const pathIndex = group === machine.groups[0] ? (group.defaultPath ?? []).indexOf(sel.id) : -1;
      if (pathIndex > 0 && pathIndex < (group.defaultPath ?? []).length - 1) {
        if (deleteWaypoint(pathIndex)) setSel(null);
      } else if (pathIndex < 0 && sel.id !== group.initial) {
        if (applyData(deleteState(data, sel.groupId, sel.id))) setSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The live current-state pointers — the same cheap poll the simulator's chip uses (the
  // sandboxed iframe has no subscription surface). null until the runtime answers, which
  // also tells us whether snap-on-click can work (a saved template's frozen interpreter may
  // predate the machine engine — the graph still renders, clicks just don't snap).
  const [current, setCurrent] = useState<Record<string, string> | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as PreviewStateMessage | undefined;
      if (!msg || msg.type !== PREVIEW_STATE_TYPE) return;
      const next = msg.state && msg.state.groups ? msg.state.groups : null;
      const prev = currentRef.current;
      if (JSON.stringify(next) !== JSON.stringify(prev)) setCurrent(next);
    };
    window.addEventListener('message', onMessage);
    const tick = () => postPreviewCmd(iframeRef.current?.contentWindow, { cmd: 'state' });
    tick();
    const handle = setInterval(tick, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(handle);
    };
  }, [iframeRef, data]);

  const selectState = (box: StateBox) => {
    if (suppressClickRef.current) return; // the click after a drag is the drag's echo
    setSel({ kind: 'state', groupId: box.groupId, id: box.id });
    if (current) sendSnap({ [box.groupId]: box.id }); // no machine runtime → inspect only
  };

  // ── The two pointer gestures. MOVE: drag a box body, park it (one setStatePosition
  //    apply on release — the model shows the live position through a temporary `at`).
  //    CONNECT: drag from a box's port to another box of the SAME group, and the released
  //    arrow becomes a real operator transition, selected for immediate renaming.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [moveDraft, setMoveDraft] = useState<{ groupId: string; id: string; x: number; y: number } | null>(null);
  const [wireDraft, setWireDraft] = useState<{ groupId: string; fromId: string; x: number; y: number } | null>(null);
  /** The open "+ state" menu (the main lane's three-way add), placed in FRAME coordinates
   *  measured off its button. It renders beside the detail card rather than inside the
   *  scrolling viewport, so it can size against the dock — a lower third's menu is taller
   *  than its own diagram — and so panning never drags it away from what it belongs to. */
  const [addMenu, setAddMenu] = useState<{ laneId: string; x: number; y: number } | null>(null);

  /** Where a lane-head control sits inside the frame — the popover's anchor. */
  const framePoint = (el: HTMLElement) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return frame ? { x: r.left - frame.left, y: r.bottom - frame.top + 6 } : { x: 0, y: 0 };
  };

  const canvasPoint = (e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };

  const startMove = (box: StateBox, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const start = canvasPoint(e);
    const offset = { x: start.x - box.x, y: start.y - box.y };
    let last: [number, number] | null = null;
    const onMove = (ev: PointerEvent) => {
      const p = canvasPoint(ev);
      if (!last && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      last = [Math.max(4, p.x - offset.x), Math.max(4, p.y - offset.y)];
      setMoveDraft({ groupId: box.groupId, id: box.id, x: last[0], y: last[1] });
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      setMoveDraft(null);
      if (commit && last) {
        // The click that follows this pointerup is the drag's echo, not a selection.
        suppressClickRef.current = true;
        setTimeout(() => (suppressClickRef.current = false), 0);
        applyData(setStatePosition(data, box.groupId, box.id, last));
      }
    };
    const onUp = () => finish(true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
  };

  const startWire = (box: StateBox, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // the port is ON the box — this gesture is not a move
    e.preventDefault();
    const p = canvasPoint(e);
    setWireDraft({ groupId: box.groupId, fromId: box.id, x: p.x, y: p.y });
    const onMove = (ev: PointerEvent) => {
      const q = canvasPoint(ev);
      setWireDraft((d) => (d ? { ...d, x: q.x, y: q.y } : d));
    };
    const finish = (ev?: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      setWireDraft(null);
      if (!ev) return;
      const q = canvasPoint(ev);
      const target = model.boxes.find(
        (b) => b.groupId === box.groupId && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h,
      );
      if (!target) return;
      const next = addTransition(data, box.groupId, box.id, target.id);
      if (next && applyData(next)) {
        // Select the drawn arrow so its card opens for the rename. Its index must be the
        // PERSISTED one — the canonical serializer sorts transitions, so a serialize →
        // parse round trip is the honest way to know where the new arrow landed.
        const group = next.machine!.groups.find((g) => g.id === box.groupId)!;
        const minted = group.transitions[group.transitions.length - 1];
        const applied = parseAnimData(`${ANIM_DECLARATION} = ${serializeAnimData(next)};`);
        const sorted = applied?.machine?.groups.find((g) => g.id === box.groupId)?.transitions ?? [];
        const tIndex = sorted.findIndex(
          (t) => t.from === minted.from && t.to === minted.to && t.trigger === 'operator' && t.event === minted.event,
        );
        if (tIndex >= 0) setSel({ kind: 'arrow', groupId: box.groupId, tIndex });
      }
    };
    const onUp = (ev: PointerEvent) => finish(ev);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        finish();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
  };

  // While a box is being dragged, the graph renders from data with its `at` overridden —
  // so every arrow touching it follows live, through the exact layout the release persists.
  const displayModel = useMemo(() => {
    if (!moveDraft) return model;
    const patched: AnimData = JSON.parse(JSON.stringify(data)) as AnimData;
    if (!patched.machine) patched.machine = deriveMachine(patched);
    const state = patched.machine.groups
      .find((g) => g.id === moveDraft.groupId)
      ?.states.find((s) => s.id === moveDraft.id);
    if (state) state.at = [moveDraft.x, moveDraft.y];
    return buildModel(patched);
  }, [model, data, moveDraft]);

  const wireFrom = wireDraft
    ? displayModel.boxes.find((b) => b.groupId === wireDraft.groupId && b.id === wireDraft.fromId) ?? null
    : null;

  const selectedBox =
    sel?.kind === 'state'
      ? displayModel.boxes.find((b) => b.groupId === sel.groupId && b.id === sel.id) ?? null
      : null;
  const selectedArrow =
    sel?.kind === 'arrow'
      ? displayModel.arrows.find((a) => a.groupId === sel.groupId && a.tIndex === sel.tIndex) ?? null
      : null;

  const model_ = displayModel;

  /** A pose-only branch state, parked below the group's lowest box: never under the detail
   *  card (top-right), and visibly "a branch" rather than another waypoint. Shared by a
   *  parallel lane's "+ state" and the main lane's menu entry. */
  const addPoseState = (laneId: string, laneY: number) => {
    const groupBoxes = model_.boxes.filter((b) => b.groupId === laneId);
    const x = groupBoxes.reduce((a, b) => Math.min(a, b.x), PAD_X);
    const bottom = groupBoxes.reduce((a, b) => Math.max(a, b.y + b.h), laneY + LANE_PAD_TOP);
    const next = addState(data, laneId, 'New state', [x, bottom + ROW_GAP]);
    if (next && applyData(next)) {
      const group = next.machine!.groups.find((g) => g.id === laneId)!;
      setSel({ kind: 'state', groupId: laneId, id: group.states[group.states.length - 1].id });
    }
  };

  const menuLane = addMenu ? model_.lanes.find((l) => l.group.id === addMenu.laneId) ?? null : null;

  return (
    // The FRAME fills the dock and the viewport scrolls the canvas inside it; the overlays
    // (detail card, foot chips, "+ state" menu) are siblings of the viewport so they size
    // against the dock. While the DIAGRAM sized the surface instead, a two-state lower third
    // made the detail card 104px tall around 211px of content, hiding the whole Cut/Fade
    // picker below an invisible fold.
    <div className="machine-graph" ref={frameRef} data-testid="machine-graph">
      <div
        className="mg-viewport"
        data-testid="mg-viewport"
        onPointerDown={(e) => {
          // Empty canvas clears the selection, like the stage — and closes the add menu, the
          // way a press outside dismisses any popover. The wires SVG covers the whole canvas,
          // so a press on it (not on a hit path/label, which stop at their own handlers)
          // counts as empty too, as does the viewport's own slack now that the frame is
          // taller than the diagram.
          const t = e.target as Element;
          if (t === e.currentTarget || t.classList.contains('mg-canvas') || t.classList.contains('mg-wires')) {
            setSel(null);
            setAddMenu(null);
          }
        }}
      >
        <div
          ref={canvasRef}
          className="mg-canvas"
          style={{ width: model_.width, height: model_.height }}
        >
          <svg className="mg-wires" width={model_.width} height={model_.height}>
            <defs>
              <marker id="mg-head-walk" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" className="mg-head-walk" />
              </marker>
              <marker id="mg-head-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" className="mg-head-dim" />
              </marker>
            </defs>
            {!model_.freeform &&
              model_.lanes.length > 1 &&
              model_.lanes.slice(1).map((lane) => (
                <line key={lane.group.id} x1="0" y1={lane.y} x2={model_.width} y2={lane.y} className="mg-lane-line" />
              ))}
            {model_.arrows.map((a) => {
              const selectable = a.tIndex !== null;
              const isSel = selectedArrow === a;
              return (
                <g key={a.key} className={`${ARROW_CLASS[a.kind]}${isSel ? ' mg-arrow-selected' : ''}`}>
                  <path
                    d={a.path}
                    fill="none"
                    markerEnd={`url(#${isSel || a.kind === 'walk' || a.kind === 'walk-stop' ? 'mg-head-walk' : 'mg-head-dim'})`}
                  />
                  <text
                    x={a.labelX}
                    y={a.labelY}
                    textAnchor="middle"
                    className={selectable ? 'mg-label-hit' : undefined}
                    onClick={selectable ? () => setSel({ kind: 'arrow', groupId: a.groupId, tIndex: a.tIndex! }) : undefined}
                  >
                    {a.label}
                  </text>
                  {selectable && (
                    <path
                      d={a.path}
                      fill="none"
                      className="mg-hit"
                      onClick={() => setSel({ kind: 'arrow', groupId: a.groupId, tIndex: a.tIndex! })}
                      data-testid={`mg-arrow-${a.key}`}
                    />
                  )}
                </g>
              );
            })}
            {wireFrom && wireDraft && (
              <path
                className="mg-wire-draft"
                d={`M ${wireFrom.x + wireFrom.w} ${wireFrom.y + wireFrom.h / 2} L ${wireDraft.x} ${wireDraft.y}`}
                markerEnd="url(#mg-head-walk)"
              />
            )}
          </svg>
          {model_.lanes.map((lane, li) => (
            <span key={lane.group.id} className="mg-lane-head" style={{ top: lane.labelY }}>
              <span className="mg-lane-label">{lane.group.id}</span>
              <button
                type="button"
                className="mg-lane-btn"
                title={
                  li === 0
                    ? 'Add a state — a branch pose, a step on the path, or a layer’s own timeline'
                    : 'Add a state to this group'
                }
                onClick={(e) => {
                  if (li === 0) {
                    const at = framePoint(e.currentTarget);
                    setAddMenu((open) => (open?.laneId === lane.group.id ? null : { laneId: lane.group.id, ...at }));
                    return;
                  }
                  addPoseState(lane.group.id, lane.y);
                }}
                data-testid={`mg-add-state-${lane.group.id}`}
              >
                + state
              </button>
              {li > 0 && (
                <button
                  type="button"
                  className="mg-lane-btn"
                  title="Delete this parallel group (undo with Ctrl+Z)"
                  onClick={() => applyData(removeGroup(data, lane.group.id))}
                  data-testid={`mg-del-group-${lane.group.id}`}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {model_.boxes.map((box) => (
            <button
              key={`${box.groupId}/${box.id}`}
              type="button"
              className={[
                'mg-state',
                box.initial ? 'mg-initial' : '',
                current && current[box.groupId] === box.id ? 'mg-current' : '',
                selectedBox === box ? 'mg-selected' : '',
                wireDraft && wireDraft.groupId !== box.groupId ? 'mg-dim' : '',
                wireDraft && wireDraft.groupId === box.groupId && wireDraft.fromId !== box.id ? 'mg-target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onClick={() => selectState(box)}
              onPointerDown={(e) => startMove(box, e)}
              title={
                current
                  ? `Snap the preview to "${box.name}" — instant, no animation replay`
                  : 'This preview was emitted before the machine engine — re-emit via any timeline edit to enable snapping'
              }
              data-testid={`mg-state-${box.groupId}-${box.id}`}
            >
              {box.badge && <span className="mg-badge">{box.badge}</span>}
              {box.kind !== 'pose' && (
                <span
                  className={`mg-kind mg-kind-${box.kind}`}
                  title={
                    box.kind === 'layer'
                      ? `Layer timeline — animates one layer${box.layerSelector ? ` (${box.layerSelector})` : ''}`
                      : 'Graphic timeline — a complete look (several layers together)'
                  }
                >
                  {box.kind === 'layer' ? '▤' : '◇'}
                </span>
              )}
              <span className="mg-name">{box.name}</span>
              {box.problem && (
                <span
                  className={`mg-problem mg-problem-${box.problem.severity}`}
                  title={box.problem.message}
                  data-testid={`mg-problem-${box.groupId}-${box.id}`}
                >
                  {box.problem.severity === 'error' ? '✕' : '!'}
                </span>
              )}
              <span
                className="mg-port"
                title="Drag to another state of this group to draw a transition"
                onPointerDown={(e) => startWire(box, e)}
                data-testid={`mg-port-${box.groupId}-${box.id}`}
              />
            </button>
          ))}
        </div>
      </div>
      {addMenu && menuLane && (
        <span className="mg-add-menu" style={{ left: addMenu.x, top: addMenu.y }} data-testid="mg-add-menu">
          <button
            type="button"
            onClick={() => {
              setAddMenu(null);
              addPoseState(menuLane.group.id, menuLane.y);
            }}
            title="A branch state that holds the look it arrives with — entering it changes nothing on its own (Off, Paused, a hold)"
            data-testid="mg-add-pose"
          >
            ○ Pose state
          </button>
          <button
            type="button"
            onClick={() => {
              setAddMenu(null);
              applyStepData(addStep(data));
            }}
            title="A new » step on the default path, just before Out — a graphic timeline to fill with keyframes"
            data-testid="mg-add-step"
          >
            ◇ Step on the path
          </button>
          <span className="mg-add-menu-sep" />
          <span className="mg-add-menu-label">▤ Timeline from layer:</span>
          {parts
            .filter((p) => p.kind !== 'root')
            .map((p) => (
              <button
                key={p.selector}
                type="button"
                onClick={() => {
                  setAddMenu(null);
                  addStepFromLayer(p.selector);
                }}
                title={`A new step named "${p.label} In" that this layer's reveal moves into — its own separately editable timeline on the path`}
                data-testid={`mg-add-layer-${p.selector.replace(/[^a-z0-9-]/gi, '')}`}
              >
                ▤ {p.label}
              </button>
            ))}
        </span>
      )}
      <span className="mg-foot-chips">
        <button
          type="button"
          className="mg-lane-btn"
          title="Add a PARALLEL group — an independent small graph (a flag, an alert, a clock), the way big graphics stay simple"
          onClick={() => applyData(addGroup(data))}
          data-testid="mg-add-group"
        >
          + parallel group
        </button>
        {derived && (
          <span
            className="mg-derived-chip"
            title="This template has no authored machine — the graph shown is the implicit linear walk derived from its steps (exactly what play/next/stop do). The first graph edit writes it into the code."
          >
            derived from the steps
          </span>
        )}
      </span>
      {selectedBox && (
        <StateCard
          key={`${selectedBox.groupId}/${selectedBox.id}`}
          box={selectedBox}
          data={data}
          onOpenStep={onOpenStep}
          onOpenStateTimeline={onOpenStateTimeline}
          applyData={applyData}
          onDeleteWaypoint={deleteWaypoint}
          onDeleted={() => setSel(null)}
        />
      )}
      {selectedArrow && sel?.kind === 'arrow' && (
        <TransitionCard
          key={`${sel.groupId}/${sel.tIndex}/${selectedArrow.t?.trigger}`}
          arrow={selectedArrow}
          groupId={sel.groupId}
          tIndex={sel.tIndex}
          data={data}
          applyData={applyData}
          onDeleted={() => setSel(null)}
        />
      )}
    </div>
  );
}

/**
 * A state problem said as the NEXT MOVE. `stateProblems` writes for the export report, where a
 * finding is a verdict on a finished document; here the author is mid-edit and the useful
 * sentence is what to do about it. Unknown shapes fall back to the report's own words rather
 * than swallowing news the graph does not recognise.
 */
function problemAdvice(problem: StateProblem): string {
  if (problem.message.includes('unreachable')) {
    return 'No arrow leads here, so this state can never play. Drag from another state’s port (its right edge) to draw one in.';
  }
  if (problem.message.includes('never ends')) {
    return 'Its timer can never fire: this state’s timeline never ends (an endless loop, or measured motion). Retime the transition, or end the loop.';
  }
  return problem.message;
}

/**
 * What the card says a state's content IS: two facts — what ENTERING it does, and WHERE its
 * timeline lives — composed so they can never contradict each other. They used to be glued
 * together from a kind word and a suffix, which is how a quiz board's `Answer selected` came
 * to describe itself as "pose only — entering plays nothing · its own inline timeline".
 */
function stateContent(box: StateBox): string {
  const does =
    box.kind === 'layer'
      ? `▤ animates one layer${box.layerSelector ? ` (${box.layerSelector})` : ''}`
      : box.kind === 'graphic'
        ? '◇ changes the whole graphic'
        : 'holds the look it arrives with — entering changes nothing';
  // The rest state gets no "where": the card already says what it is on its own line, and
  // calling the graphic's off-air state "a branch" would be the next small lie.
  if (box.initial) return does;
  const where =
    box.pathIndex !== null
      ? `step ${box.pathIndex + 1} of the default path`
      : box.poseOnly
        ? 'a branch off the path'
        : box.kind === 'pose'
          ? 'its own timeline, still empty'
          : 'its own timeline, off the path';
  return `${does} · ${where}`;
}

/** The selected state's detail card: identity, what its content is, and the way into its
 *  timeline (a default-path state's step). Renaming an off-path state edits its label; a
 *  path state's name IS its step's name, renamed through the same mutator the timeline uses
 *  so the two can never fork. Waypoints are added and deleted on the TIMELINE (the
 *  positional binding: the state and its clip are one thing); the graph deletes only
 *  off-path states. */
function StateCard({
  box,
  data,
  onOpenStep,
  onOpenStateTimeline,
  applyData,
  onDeleteWaypoint,
  onDeleted,
}: {
  box: StateBox;
  data: AnimData;
  onOpenStateTimeline: (groupId: string, stateId: string) => void;
  onOpenStep: (stepIndex: number) => void;
  applyData: (next: AnimData | null) => boolean;
  /** Delete a default-path waypoint (its bound step) — the graph's Delete on the spine. */
  onDeleteWaypoint: (pathIndex: number) => boolean;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(box.name);
  const commitName = () => {
    if (name.trim() === box.name || !name.trim()) {
      setName(box.name);
      return;
    }
    const next =
      box.pathIndex !== null
        ? renameStep(data, box.pathIndex, name.trim())
        : renameOffPathState(data, box.groupId, box.id, name);
    if (!applyData(next)) setName(box.name);
  };
  const content = stateContent(box);
  const deletable = box.pathIndex === null && !box.initial;
  // The entrance and Out anchor the walk; the middle waypoints can go (their bound step
  // goes with them — the positional binding, same as the clip's Delete on the timeline).
  const waypointDeletable =
    box.pathIndex !== null && box.pathIndex > 0 && box.pathIndex < data.steps.length - 1;
  return (
    <div className="mg-card" data-testid="mg-state-card">
      <div className="mg-card-title">
        {box.badge && <span className="mg-badge">{box.badge}</span>} State
      </div>
      <input
        className="mg-card-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setName(box.name);
        }}
        data-testid="mg-state-name"
      />
      <div className="mg-card-row">{content}</div>
      {box.initial && <div className="mg-card-row">the rest state (off air, and after reset)</div>}
      {/* The same finding validateTemplate would give at EXPORT time, said here instead —
          where it is still cheap to fix, and phrased as the next move rather than a verdict. */}
      {box.problem && (
        <div
          className={`mg-card-problem mg-card-problem-${box.problem.severity}`}
          data-testid="mg-state-problem"
        >
          {problemAdvice(box.problem)}
        </div>
      )}
      {box.pathIndex !== null && (
        <button type="button" className="mg-card-action" onClick={() => onOpenStep(box.pathIndex!)} data-testid="mg-open-step">
          ≡ Open its timeline
        </button>
      )}
      {/* A BRANCH state's own timeline — the thing that lets it look different from the state
          before it. Attaching one is an explicit act: a pose-only state is a legitimate thing
          (Off, a hold), so `addState` keeps making one and this is how it grows content. */}
      {box.pathIndex !== null || box.initial ? null : box.poseOnly ? (
        <button
          type="button"
          className="mg-card-action"
          onClick={() => {
            const step = emptyStateTimeline(box.name);
            if (applyData(setStateTimeline(data, box.groupId, box.id, step))) {
              onOpenStateTimeline(box.groupId, box.id);
            }
          }}
          title="Give this branch its own timeline, then open it. Until it has one the state holds whatever look it arrives with — which is why a branch could only ever look like the state before it."
          data-testid="mg-add-state-timeline"
        >
          + Add a timeline
        </button>
      ) : (
        <button
          type="button"
          className="mg-card-action"
          onClick={() => onOpenStateTimeline(box.groupId, box.id)}
          data-testid="mg-open-state-timeline"
        >
          ≡ Open its timeline
        </button>
      )}
      {waypointDeletable && (
        <button
          type="button"
          className="mg-card-action"
          onClick={() => {
            if (onDeleteWaypoint(box.pathIndex!)) onDeleted();
          }}
          title="Delete this step from the default path (its timeline goes with it; a revealed layer folds back into the entrance). Undo with Ctrl+Z — or press Delete."
          data-testid="mg-delete-waypoint"
        >
          ✕ Delete step
        </button>
      )}
      {deletable && (
        <button
          type="button"
          className="mg-card-action"
          onClick={() => {
            if (applyData(deleteState(data, box.groupId, box.id))) onDeleted();
          }}
          title="Delete this state and every arrow touching it (undo with Ctrl+Z — or press Delete)"
          data-testid="mg-delete-state"
        >
          ✕ Delete state
        </button>
      )}
    </div>
  );
}

/** The selected transition's card — the arrow's own settings. Trigger, the operator event
 *  name, and a timer's delay edit here (each commit is ONE undoable apply); the reserved
 *  style fields arrive with the transition-styles step of the phase. */
function TransitionCard({
  arrow,
  groupId,
  tIndex,
  data,
  applyData,
  onDeleted,
}: {
  arrow: Arrow;
  groupId: string;
  tIndex: number;
  data: AnimData;
  applyData: (next: AnimData | null) => boolean;
  onDeleted: () => void;
}) {
  const t = arrow.t!;
  // The card names the two ends the way the BOXES do. A state's id deliberately never follows
  // a rename (transitions, snap assignments and an exported control page all reference it),
  // which is right — but it left this card reading "enter → step-3" beside a box labelled
  // "Step 2". The ids stay one hover away, where the machine's own vocabulary belongs.
  const group = (data.machine ?? deriveMachine(data)).groups.find((g) => g.id === groupId) ?? null;
  const stateName = (id: string) => (group ? stateById(group, id)?.name ?? id : id);
  const [event, setEvent] = useState(t.event ?? '');
  const [after, setAfter] = useState(String(t.after ?? ''));
  const [styleDur, setStyleDur] = useState(String(t.duration ?? ''));
  const commitEvent = () => {
    if (event.trim() === (t.event ?? '')) return;
    if (!applyData(setTransitionEvent(data, groupId, tIndex, event))) setEvent(t.event ?? '');
  };
  const commitAfter = () => {
    const n = Number(after);
    if (n === t.after) return;
    if (!(n > 0) || !applyData(setTransitionAfter(data, groupId, tIndex, n))) setAfter(String(t.after ?? ''));
  };
  const commitStyleDur = () => {
    const n = Number(styleDur);
    if (n === t.duration || styleDur.trim() === '') return;
    if (!(n > 0) || !applyData(setTransitionStyleDuration(data, groupId, tIndex, n))) {
      setStyleDur(String(t.duration ?? ''));
    }
  };
  return (
    <div className="mg-card" data-testid="mg-transition-card">
      <div className="mg-card-title">Transition</div>
      <div className="mg-card-name" title={`${t.from} → ${t.to}`}>
        {stateName(t.from)} → {stateName(t.to)}
      </div>
      {t.trigger === 'data-condition' ? (
        <div className="mg-card-row">reserved data-condition trigger — it never fires in this version</div>
      ) : (
        <>
          {/* The lifecycle edges ARE ▶ Play and ■ Stop — the walk's own entrance and exit,
              materialised so they can carry a style. Their trigger and event are what they
              are; the style rows below are their one editable aspect. */}
          {t.trigger === 'lifecycle' && (
            <div className="mg-card-row" data-testid="mg-lifecycle-note">
              {t.event === 'play'
                ? 'the entrance — plays on ▶ Play'
                : 'the exit — plays on ■ Stop, from any state'}
            </div>
          )}
          {t.trigger !== 'lifecycle' && (
            <label className="mg-card-row">
              fires on
              <select
                value={t.trigger}
                onChange={(e) => applyData(setTransitionTrigger(data, groupId, tIndex, e.target.value as 'operator' | 'timer'))}
                data-testid="mg-trigger"
              >
                <option value="operator">operator event</option>
                <option value="timer">timer</option>
              </select>
            </label>
          )}
          {t.trigger === 'operator' && (
            <label className="mg-card-row">
              event
              <input
                className="mg-card-input mono"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                onBlur={commitEvent}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEvent(t.event ?? '');
                }}
                data-testid="mg-event"
              />
            </label>
          )}
          {t.trigger === 'timer' && (
            <label className="mg-card-row">
              after (s)
              <input
                className="mg-card-input mono"
                type="number"
                min="0.1"
                step="0.1"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                onBlur={commitAfter}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setAfter(String(t.after ?? ''));
                }}
                data-testid="mg-after"
              />
            </label>
          )}
          <label className="mg-card-row stacked">
            change
            <select
              value={t.style ?? ''}
              onChange={(e) => applyData(setTransitionStyle(data, groupId, tIndex, e.target.value || null))}
              title="What the change looks like: the target state's own timeline, an instant cut, or the arrow's styled change (fade / push / wipe between the two poses)"
              data-testid="mg-style"
            >
              <option value="">state timeline (animated)</option>
              {TRANSITION_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          {t.style !== undefined && t.style !== 'cut' && (
            <>
              <label className="mg-card-row">
                duration (s)
                <input
                  className="mg-card-input mono"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="0.6"
                  value={styleDur}
                  onChange={(e) => setStyleDur(e.target.value)}
                  onBlur={commitStyleDur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setStyleDur(String(t.duration ?? ''));
                  }}
                  data-testid="mg-style-duration"
                />
              </label>
              <label className="mg-card-row">
                easing
                <select
                  value={t.ease ?? 'power2.inOut'}
                  onChange={(e) => applyData(setTransitionStyleEase(data, groupId, tIndex, e.target.value))}
                  data-testid="mg-style-ease"
                >
                  <option value="power2.inOut">Smooth (default)</option>
                  {EASINGS.map((e2) => (
                    <option key={e2.id} value={e2.gsapIn}>
                      {e2.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {/* Play and stop always exist — "deleting" their edge is meaningless, and the
              mutator refuses it; clearing the style is the edit that means something. */}
          {t.trigger !== 'lifecycle' && (
            <button
              type="button"
              className="mg-card-action"
              onClick={() => {
                if (applyData(removeTransition(data, groupId, tIndex))) onDeleted();
              }}
              title="Delete this arrow (undo with Ctrl+Z). The only arrow behind a default-path edge cannot go — that would disconnect the walk next() follows."
              data-testid="mg-delete-transition"
            >
              ✕ Delete transition
            </button>
          )}
        </>
      )}
    </div>
  );
}
