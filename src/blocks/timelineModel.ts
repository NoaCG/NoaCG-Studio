// The LEGACY-REGION READER. Parses a marked ANIMATION region into tracks. Parsing BY
// CONSTRUCTION, not heuristics: these regions were emitted by our own presets, so the shapes
// are known — sequential tl.set / tl.to / tl.fromTo calls with `X / animSpeed` durations and
// optional position args, plus tl.call hooks and tl.add measured segments. A hand-edited region
// that no longer parses returns null and the UI says so — the code always outranks the view.
//
// Phase 8 (docs/TIMELINE_V2_PLAN.md) removed the other half of this module: the ~450 lines of
// literal PATCHERS (splitTween, patchTweenTiming/Ease/Vars, patchStep*, insertPart*, setObj*)
// that let the old strip rewrite a region in place. Nothing writes legacy regions any more —
// motion is edited as DATA (blocks/animEdit.ts) — so what survives is READING, for exactly two
// callers:
//   - blocks/animImport.ts — the legacy → NOACG_ANIM converter (this is the reader it converts
//     through, which is why one hand-written region can still become an editable data block);
//   - components/LegacyTimeline.tsx — the read-only chart of a region the importer REFUSES
//     (measured motion written inline). It can never be auto-converted and regenerating it would
//     discard the owner's tuning, so it must still render truthfully (DYNAMIC_MOTION_SCOPE §8.1).

export interface TimelineTween {
  /** Target list as written, cleaned for display (e.g. ".lower-third-box" or "#f0, #f1"). */
  targets: string[];
  kind: 'set' | 'to' | 'fromTo';
  /** Animated property names (duration/stagger/ease bookkeeping stripped). */
  props: string[];
  /** Seconds, with the animSpeed knob applied. set() tweens are 0. */
  duration: number;
  /** Per-target stagger in seconds (0 when absent). */
  stagger: number;
  /** Computed start/end on the phase's clock, in seconds. */
  start: number;
  end: number;
  /**
   * T2: whether the timeline can rewrite this tween's timing — a real tween whose duration
   * is the emitted `N / animSpeed` literal. set() ticks and measured/computed durations
   * (e.g. a marquee's width-derived speed) stay read-only.
   */
  editable: boolean;
  /**
   * T2.5: this tween's OWN ease literal (e.g. "back.out(1.6)"), or null when it inherits
   * the phase knob (the `ease: easeIn/easeOut` variables or the timeline defaults).
   */
  ease: string | null;
  /** EVERY animated value in the FROM/TO objects (numbers and
   *  quoted strings, bookkeeping stripped) — the legacy→data converter reads these. */
  fromAll?: Record<string, number | string>;
  toAll?: Record<string, number | string>;
  /** A repeating tween's loop spec (GSAP repeat/yoyo/repeatDelay), or null. Times are in
   *  phase seconds (animSpeed applied, like `duration`). The converter turns a loop with
   *  finite literal values into step data; a DOM-measured loop stays read-only. */
  loop?: { repeat: number; yoyo: boolean; repeatDelay: number } | null;
  /** Whether the first argument was a target list this parser could READ — a quoted selector
   *  or an array literal. False means a variable or an element reference, which carries no
   *  selector into the data block; `targetsConvertible` refuses the template on it. An empty
   *  but readable list (`tl.fromTo([], …)`) is true: it animates nothing, deliberately. */
  targetsRead: boolean;
}

/** Timeline v2 importer: one `tl.call(fnName)` lifecycle hook found in a phase, resolved to
 *  its start time on the phase's clock (docs/TIMELINE_V2_PLAN.md §3b). Zero-duration — it
 *  never advances the phase, exactly as GSAP treats a call. */
export interface TimelineCall {
  /** The named global function invoked (a bare identifier — `startClock`). */
  name: string;
  /** Start on the phase's clock, in seconds (position math shared with tweens). */
  start: number;
}

/** Timeline v2 importer: one `tl.add(builderName('#target'))` MEASURED motion segment found
 *  in a phase (docs/DYNAMIC_MOTION_SCOPE.md). The builder lives outside the marked region
 *  (design-owned runtime) and returns a GSAP object; the region only references it by name,
 *  which is what lets the importer carry a marquee or a credits roll into the data model. */
export interface TimelineDynamic {
  /** The named global builder invoked (a bare identifier — `tickerMarquee`). */
  name: string;
  /** The selector argument, when the emit passes one. */
  target?: string;
  /** Start on the phase's clock, in seconds (position math shared with tweens). */
  start: number;
}

export interface TimelinePhase {
  id: 'in' | 'out';
  label: string;
  /** Total phase length in seconds (the last tween's end). */
  duration: number;
  tweens: TimelineTween[];
  /** Timeline v2: the phase's `tl.call(fnName)` lifecycle hooks (clock start/stop), in
   *  document order with their resolved positions. Empty for motion-only phases. */
  calls: TimelineCall[];
  /** Timeline v2: the phase's `tl.add(builder(target))` measured-motion segments, in
   *  document order with their resolved positions. Empty for fully-keyframed phases. */
  dynamics: TimelineDynamic[];
  /** True when the phase contains an endless loop (repeat: -1) — tickers, holds. */
  infinite: boolean;
  /** True when every `repeat:` in the phase is a `tl` loop tween with finite literal values
   *  the keyframe converter can carry (an ambient breath), false when a repeat lives on a
   *  nested timeline or a DOM-measured tween (a marquee) the importer must refuse. */
  loopsConvertible: boolean;
  /** True when every `tl.add(...)` in the phase is a recognizable `builder(target)` segment.
   *  A hand-written `tl.add(someLocalTimeline)` carries motion this model cannot name, so
   *  the importer refuses the template outright rather than silently dropping it. */
  dynamicsConvertible: boolean;
  /** True when every tween named a target this parser could read. A tween whose first argument
   *  is not a quoted selector — a variable, an element reference, a template string — has no
   *  selector to write into the data block, and inventing one produces a graphic that throws on
   *  air (see `parseCall`). False refuses the whole template, which is the honest outcome: the
   *  region stays the author's code and the timeline reads it read-only. */
  targetsConvertible: boolean;
}

/** T3 — one Continue press: which line GROUP reveals, how long, with which ease. */
export interface TimelineStep {
  targets: string[];
  /** Seconds per line, with the animSpeed knob applied (multi-line groups stagger). */
  duration: number;
  /** Per-line stagger in seconds (0 in the legacy one-line shape). */
  stagger: number;
  /** The step's own ease literal, or null when it inherits the easeIn knob. */
  ease: string | null;
  /** T3.3: whether the group arrays exist in the region (regrouping is patchable). */
  groupable: boolean;
}

export interface TimelineModel {
  animSpeed: number;
  easeIn: string;
  easeOut: string;
  phases: TimelinePhase[];
  /** T3 — the Continue chain between In and Out (empty when the template has no steps,
   *  or when its steps block predates the per-step knob arrays). */
  steps: TimelineStep[];
}

// ── The cue-segmented overview (Era 6 T4.2) ─────────────────────────────────
// One strip, the whole playout in order: In · each » press · the hold · Out. Every
// segment keeps its own REAL local clock (holds and presses wait for operator cues, so a
// single global time axis would fabricate times that don't exist on air). Rows are the
// template's parts; a multi-target tween expands onto each member's row at its true
// stagger offset. Pure derivation from the parsed model — the view stays declarative.

export interface OverviewSection {
  id: string; // 'in' | 'step-N' | 'hold' | 'out'
  kind: 'in' | 'step' | 'hold' | 'out';
  stepIndex?: number;
  /** Local-clock length in seconds (0 for the hold — it waits, it has no clock). */
  duration: number;
  infinite: boolean;
}

export interface OverviewBar {
  sectionId: string;
  /** The part/selector row this bar sits on. */
  rowKey: string;
  /** Tween index within its phase (the patchers' handle), or the step index for reveals. */
  tweenIndex: number;
  kind: 'set' | 'to' | 'fromTo' | 'reveal';
  /** Start/span on the section's local clock, member stagger applied. */
  start: number;
  span: number;
  editable: boolean;
  ease: string | null;
  props: string[];
  /** This bar's index within its tween's target list (0 = first). Splitting a joint tween
   *  by target needs it; reveal testids count it (r0, r1 …). */
  member: number;
  /** True on the tween's first target row — owns the ease chip. */
  firstMember: boolean;
}

export interface OverviewModel {
  sections: OverviewSection[];
  /** Row keys in display order: real bars first (registry order decided by the caller),
   *  set()-only targets dropped. */
  rowKeys: string[];
  bars: OverviewBar[];
}

/**
 * Flatten the parsed timeline into the overview matrix. `partOrder` (the registry's
 * selector order) sorts known rows first; unknown tween targets follow in first-seen
 * order. Rows whose only bars are set() ticks are dropped (bookkeeping, not choreography);
 * `alwaysRows` (e.g. assignable parts) survive even without bars.
 */
export function buildOverview(model: TimelineModel, partOrder: string[], alwaysRows: string[] = []): OverviewModel {
  const sections: OverviewSection[] = [
    { id: 'in', kind: 'in', duration: model.phases[0]?.duration ?? 0, infinite: model.phases[0]?.infinite ?? false },
    ...model.steps.map((s, k) => ({
      id: `step-${k + 2}`,
      kind: 'step' as const,
      stepIndex: k,
      duration: s.duration + s.stagger * Math.max(0, s.targets.length - 1),
      infinite: false,
    })),
    { id: 'hold', kind: 'hold', duration: 0, infinite: true },
    {
      id: 'out',
      kind: 'out',
      duration: model.phases[model.phases.length - 1]?.duration ?? 0,
      infinite: model.phases[model.phases.length - 1]?.infinite ?? false,
    },
  ];

  const bars: OverviewBar[] = [];
  for (const phase of model.phases) {
    phase.tweens.forEach((tw, tweenIndex) => {
      tw.targets.forEach((t, m) => {
        bars.push({
          sectionId: phase.id,
          rowKey: t,
          tweenIndex,
          kind: tw.kind,
          start: tw.start + m * tw.stagger,
          span: tw.kind === 'set' ? 0 : tw.duration,
          editable: tw.editable,
          ease: tw.ease,
          props: tw.props,
          member: m,
          firstMember: m === 0,
        });
      });
    });
  }
  model.steps.forEach((s, k) => {
    s.targets.forEach((t, m) => {
      bars.push({
        sectionId: `step-${k + 2}`,
        rowKey: t,
        tweenIndex: k,
        kind: 'reveal',
        start: m * s.stagger,
        span: s.duration,
        editable: true,
        ease: s.ease,
        props: [],
        member: m,
        firstMember: m === 0,
      });
    });
  });

  // Row order: registry parts first, then unknown targets as encountered.
  const withRealBars = new Set(bars.filter((b) => b.kind !== 'set').map((b) => b.rowKey));
  const keep = new Set([...withRealBars, ...alwaysRows]);
  const seen = new Set<string>();
  const rowKeys: string[] = [];
  for (const key of [...partOrder, ...bars.map((b) => b.rowKey), ...alwaysRows]) {
    if (keep.has(key) && !seen.has(key)) {
      seen.add(key);
      rowKeys.push(key);
    }
  }
  return { sections, rowKeys, bars: bars.filter((b) => keep.has(b.rowKey)) };
}

const BOOKKEEPING_PROPS = new Set(['duration', 'stagger', 'ease', 'transformOrigin', 'clearProps', 'repeat', 'yoyo', 'repeatDelay', 'delay', 'onComplete']);

const REGION_RE = /\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//;
// The full call surface parsePhase walks in document order — tweens PLUS the zero-advance
// members (`tl.call` hooks and `tl.add` measured-motion segments) — so their position math
// sees the timeline end at the point each appears. Neither shifts a tween's INDEX.
const PHASE_CALL_RE = /tl\.(set|to|fromTo|call|add)\(([\s\S]*?)\);/g;

function fnBodyRe(name: string): RegExp {
  return new RegExp(`function ${name}\\(\\) \\{([\\s\\S]*?)\\n\\}`);
}

/** Parse one tl.<kind>(...) call's argument text into a tween (position math done later). */
function parseCall(kind: TimelineTween['kind'], args: string, animSpeed: number) {
  // Targets: the first argument — a quoted selector or an array of quoted selectors. BOTH quote
  // styles, because both are ordinary JavaScript and the authoring grammar never named one: the
  // catalog happens to be written in single quotes, so a double-quoted selector went unread until
  // a model wrote one (2026-09-06, docs/AI_ATTEMPTS.md).
  const arr = args.match(/^\s*\[([^\]]*)\]/);
  const single = args.match(/^\s*(?:'([^']+)'|"([^"]+)")/);
  // AN UNREADABLE TARGET IS NOT AN EMPTY ONE, and the difference decides whether the whole
  // template converts. `tl.fromTo([], …)` is a real, readable instruction - the emitters write
  // it for a design with no lines to stagger, and it correctly animates nothing. A first
  // argument that is a VARIABLE or an element reference is the other thing: there is no
  // selector to carry into the data block at all.
  //
  // That case used to fall back to the literal string `'?'`, which reads as a selector the whole
  // way through the importer, survives `parseAnimData`, and then throws `'?' is not a valid
  // selector` inside GSAP the first time the graphic plays - the converter failing OPEN, in the
  // one place whose contract is to keep the author's code byte-identical when it gains nothing.
  // `targetsConvertible` below turns it back into the refusal it should always have been.
  const targetsRead = Boolean(arr || single);
  const targets = arr
    ? arr[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean)
    : single
      ? [single[1] ?? single[2]]
      : [];

  // The animated props come from the LAST object literal (fromTo's "to" vars).
  const objects = args.match(/\{[^{}]*\}/g) ?? [];
  const vars = objects[objects.length - 1] ?? '';
  const props = [...vars.matchAll(/(\w+)\s*:/g)].map((m) => m[1]).filter((p) => !BOOKKEEPING_PROPS.has(p));

  // Capture every `key: number` / `key: 'string'` pair of an object literal (bookkeeping
  // stripped) — the full from/to values the converter turns into keyframes.
  const allPairs = (obj: string | undefined): Record<string, number | string> => {
    const out: Record<string, number | string> = {};
    if (!obj) return out;
    for (const m of obj.matchAll(/(\w+)\s*:\s*(?:'([^']*)'|(-?[\d.]+))/g)) {
      if (BOOKKEEPING_PROPS.has(m[1])) continue;
      out[m[1]] = m[2] !== undefined ? m[2] : Number(m[3]);
    }
    return out;
  };
  const fromAll = kind === 'fromTo' && objects.length >= 2 ? allPairs(objects[0]) : undefined;
  const toAll = kind !== 'set' ? allPairs(vars) : allPairs(objects[objects.length - 1]);

  const durationMatch = vars.match(/duration:\s*([\d.]+)\s*\/\s*animSpeed/);
  const staggerMatch = vars.match(/stagger:\s*([\d.]+)\s*\/\s*animSpeed/);
  // A quoted ease is a per-tween override; `ease: easeIn/easeOut` inherits the phase knob.
  const easeMatch = vars.match(/ease:\s*'([^']+)'/);

  // A repeating tween (repeat/yoyo/repeatDelay). repeatDelay is stored in phase seconds like
  // duration (divided by animSpeed when the emit writes `/ animSpeed`).
  const repeatMatch = vars.match(/repeat:\s*(-?\d+)/);
  const repeatDelayMatch = vars.match(/repeatDelay:\s*([\d.]+)\s*(\/\s*animSpeed)?/);
  const loop = repeatMatch
    ? {
        repeat: Number(repeatMatch[1]),
        yoyo: /yoyo:\s*true/.test(vars),
        repeatDelay: repeatDelayMatch ? Number(repeatDelayMatch[1]) / (repeatDelayMatch[2] ? animSpeed : 1) : 0,
      }
    : null;

  // The position argument sits after the LAST object literal: '-=N' (overlap) or an
  // absolute `N / animSpeed` / bare number (what T2 writes). Inline comments between the
  // object and the position arg are stripped first — mask-wipe's exit writes
  // `{...},  // …and wipe closed\n  '-=0.1');` and the overlap must still be seen.
  const tail = args.slice(args.lastIndexOf('}') + 1).replace(/\/\/[^\n]*/g, '');
  const overlapMatch = tail.match(/,\s*'-=([\d.]+)'/);
  const absoluteMatch = tail.match(/,\s*([\d.]+)(\s*\/\s*animSpeed)?/);

  return {
    targets,
    targetsRead,
    kind,
    props,
    duration: kind === 'set' ? 0 : durationMatch ? Number(durationMatch[1]) / animSpeed : 0,
    stagger: staggerMatch ? Number(staggerMatch[1]) / animSpeed : 0,
    overlap: overlapMatch ? Number(overlapMatch[1]) : 0,
    absolute: !overlapMatch && absoluteMatch
      ? Number(absoluteMatch[1]) / (absoluteMatch[2] ? animSpeed : 1)
      : null,
    editable: kind !== 'set' && !!durationMatch,
    ease: easeMatch ? easeMatch[1] : null,
    fromAll,
    toAll,
    loop,
  };
}

/**
 * Parse a `tl.call(...)` hook's argument text into { name, start }. Handles the two shapes
 * the presets emit: `tl.call(fnName)` (appended at the current timeline end) and
 * `tl.call(fnName, null, position)` (an explicit `'-=N'` overlap or `N / animSpeed`
 * absolute). Returns null for anything else — an inline function, a computed callback — so
 * an unrecognized call is dropped rather than guessed (the honest fallback). `phaseEnd` is
 * the timeline end at the point the call appears, for the default append position.
 */
function parseCallHook(args: string, animSpeed: number, phaseEnd: number): TimelineCall | null {
  // Callbacks carry no eases or nested-comma objects, so a plain split is safe here.
  const parts = args.split(',').map((s) => s.trim());
  const nameMatch = parts[0]?.match(/^'?([A-Za-z_$][\w$]*)'?$/);
  if (!nameMatch) return null; // an inline/anonymous callback — not a named hook we can carry
  const name = nameMatch[1];

  // GSAP signature: call(callback, params, position). Default = append at the current end.
  let start = phaseEnd;
  const posTok = parts[2];
  if (posTok) {
    const overlap = posTok.match(/^'-=([\d.]+)'$/);
    if (overlap) {
      start = Math.max(0, phaseEnd - Number(overlap[1]));
    } else {
      const abs = posTok.match(/^([\d.]+)\s*(\/\s*animSpeed)?$/);
      if (abs) start = Number(abs[1]) / (abs[2] ? animSpeed : 1);
    }
  }
  return { name, start };
}

/**
 * Parse a `tl.add(...)` argument text into a measured-motion segment. The one shape the
 * presets emit is `tl.add(builderName('#target'))` — optionally with an explicit position,
 * `tl.add(builderName('#target'), 0.5 / animSpeed)`. The builder itself lives OUTSIDE the
 * marked region (design-owned runtime), so the region stays fully parseable and the segment
 * can be carried into the data model as a `dynamics` entry.
 *
 * Returns null for any other shape (a bare local variable, an inline timeline) — the caller
 * then refuses the whole template rather than dropping motion it cannot name.
 */
function parseAddSegment(args: string, animSpeed: number, phaseEnd: number): TimelineDynamic | null {
  const m = args.match(/^\s*([A-Za-z_$][\w$]*)\s*\(\s*(?:'([^']*)')?\s*\)\s*(?:,\s*([\s\S]+))?$/);
  if (!m) return null; // not a named builder call — unnameable motion
  const [, name, target, posTok] = m;

  // GSAP signature: add(child, position). Default = append at the current timeline end.
  let start = phaseEnd;
  if (posTok) {
    const tok = posTok.trim();
    const overlap = tok.match(/^'-=([\d.]+)'$/);
    if (overlap) {
      start = Math.max(0, phaseEnd - Number(overlap[1]));
    } else {
      const abs = tok.match(/^([\d.]+)\s*(\/\s*animSpeed)?$/);
      if (abs) start = Number(abs[1]) / (abs[2] ? animSpeed : 1);
    }
  }
  return { name, ...(target ? { target } : {}), start };
}

/** Parse one build function's body into positioned tweens (GSAP position semantics), plus
 *  the zero-advance members — `tl.call` lifecycle hooks and `tl.add` measured-motion
 *  segments — in the same document-ordered pass, so their positions see the timeline end at
 *  the point each appears. */
function parsePhase(id: TimelinePhase['id'], body: string, animSpeed: number): TimelinePhase {
  const tweens: TimelineTween[] = [];
  const calls: TimelineCall[] = [];
  const dynamics: TimelineDynamic[] = [];
  let unnamedAdds = 0;
  let phaseEnd = 0;
  const re = new RegExp(PHASE_CALL_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] === 'call') {
      // A zero-duration hook: record it, never advance the phase (its index among tweens is
      // untouched — the patchers still count only set/to/fromTo).
      const hook = parseCallHook(m[2], animSpeed, phaseEnd);
      if (hook) calls.push(hook);
      continue;
    }
    if (m[1] === 'add') {
      // A measured segment. Its LENGTH is unknown here (the builder measures the DOM at play
      // time), so like a call it never advances the phase — the phase's duration stays the
      // length of its authored, keyframeable motion.
      const seg = parseAddSegment(m[2], animSpeed, phaseEnd);
      if (seg) dynamics.push(seg);
      else unnamedAdds++;
      continue;
    }
    const parsed = parseCall(m[1] as TimelineTween['kind'], m[2], animSpeed);
    const span = parsed.duration + parsed.stagger * Math.max(0, parsed.targets.length - 1);
    // GSAP position semantics: default = append at the timeline's current end; '-=N' starts
    // N seconds before that end; an absolute number is a fixed start time.
    const start = parsed.absolute !== null ? parsed.absolute : Math.max(0, phaseEnd - parsed.overlap);
    const end = start + span;
    phaseEnd = Math.max(phaseEnd, end);
    tweens.push({
      targets: parsed.targets,
      targetsRead: parsed.targetsRead,
      kind: parsed.kind,
      props: parsed.props,
      duration: parsed.duration,
      stagger: parsed.stagger,
      start,
      end,
      editable: parsed.editable,
      ease: parsed.ease,
      fromAll: parsed.fromAll,
      toAll: parsed.toAll,
      loop: parsed.loop,
    });
  }
  // Every `repeat:` in the body must be a `tl` loop tween with finite literal values for the
  // keyframe converter to carry it. A repeat that lives on a nested gsap.timeline (ticker's
  // item flip) or a DOM-measured tween (a marquee's x:-width) can't be described as data —
  // the importer refuses those templates and they stay legacy (the honest fallback).
  const rawRepeats = (body.match(/repeat:\s*-?\d+/g) ?? []).length;
  const tlLoops = tweens.filter((t) => t.loop);
  const loopsConvertible =
    rawRepeats === tlLoops.length &&
    tlLoops.every((t) => {
      const to = t.toAll ?? {};
      const keys = Object.keys(to);
      return keys.length > 0 && keys.every((p) => typeof to[p] === 'number' && Number.isFinite(to[p] as number));
    });
  return {
    id,
    label: id === 'in' ? 'In' : 'Out',
    duration: phaseEnd,
    tweens,
    calls,
    dynamics,
    infinite: /repeat:\s*-1/.test(body),
    loopsConvertible,
    // One unrecognizable `tl.add` is enough to refuse: the phase carries motion this model
    // cannot name, and a partial conversion would silently lose it.
    dynamicsConvertible: unnamedAdds === 0,
    // Same rule for a tween whose target could not be READ - refuse the template rather than
    // convert it into one that throws the first time an operator presses Take. A tween that
    // readably targets nothing (`tl.fromTo([], …)`, what the emitters write for a design with
    // no lines) is not that: it converts, and animates nothing, exactly as it always did.
    targetsConvertible: tweens.every((t) => t.targetsRead),
  };
}

/** Parse template.js into the timeline model, or null when the region isn't recognizable. */
export function parseTimeline(js: string): TimelineModel | null {
  const region = js.match(REGION_RE)?.[0];
  if (!region) return null;

  const animSpeed = Number(region.match(/var animSpeed = ([\d.]+)/)?.[1] ?? NaN);
  // Both quote styles, for the same reason as the selectors in `parseCall`.
  const easeIn = region.match(/var easeIn = (?:'([^']+)'|"([^"]+)")/)?.slice(1).find(Boolean);
  const easeOut = region.match(/var easeOut = (?:'([^']+)'|"([^"]+)")/)?.slice(1).find(Boolean);
  if (!animSpeed || !easeIn || !easeOut) return null;

  const phases: TimelinePhase[] = [];
  for (const [id, name] of [['in', 'buildInTimeline'], ['out', 'buildOutTimeline']] as const) {
    const body = region.match(fnBodyRe(name))?.[1];
    if (!body) return null;
    const phase = parsePhase(id, body, animSpeed);
    if (phase.tweens.length === 0) return null; // not a shape we recognize
    phases.push(phase);
  }

  return { animSpeed, easeIn, easeOut, phases, steps: parseSteps(region, animSpeed) };
}

/** Parse the multi-step block's knob arrays (emitted by stepsBlock in animPresets).
 *  Reads the T3.3 `stepGroups` shape; falls back to the earlier one-line `stepLines` shape
 *  (regrouping unavailable there until any Motion-panel apply re-emits the region). */
function parseSteps(region: string, animSpeed: number): TimelineStep[] {
  const durations = region.match(/var stepDurations = \[([^\]]*)\]/)?.[1];
  const eases = region.match(/var stepEases = \[([^\]]*)\]/)?.[1];
  if (!durations || !eases) return [];
  const durs = durations.split(',').map((s) => Number(s.trim()));
  const easeTokens = eases.split(',').map((s) => s.trim());
  // The group reveal's per-part stagger (one value for the whole steps block). The current
  // emit positions each part at `i * N / animSpeed`; older emits used a stagger: var.
  const stagger = Number(
    region.match(/function revealNextStep[\s\S]*?i \* ([\d.]+) \/ animSpeed/)?.[1] ??
      region.match(/function revealNextStep[\s\S]*?stagger:\s*([\d.]+)\s*\/\s*animSpeed/)?.[1] ??
      0,
  );
  const step = (targets: string[], i: number, groupable: boolean): TimelineStep => ({
    targets,
    duration: (Number.isFinite(durs[i]) ? durs[i] : 0.45) / animSpeed,
    stagger: groupable ? stagger / animSpeed : 0,
    ease: easeTokens[i]?.startsWith("'") ? easeTokens[i].slice(1, -1) : null,
    groupable,
  });

  const groupsText = region.match(/var stepGroups = \[([\s\S]*?)\];/)?.[1];
  if (groupsText) {
    const groups = [...groupsText.matchAll(/\[([^\]]*)\]/g)].map((m) =>
      m[1].split(',').map((s) => s.replace(/['\s]/g, '')).filter(Boolean),
    );
    return groups.map((targets, i) => step(targets, i, true));
  }
  const lines = region.match(/var stepLines = \[([^\]]*)\]/)?.[1];
  if (!lines) return [];
  const targets = lines.split(',').map((s) => s.replace(/['\s]/g, '')).filter(Boolean);
  return targets.map((t, i) => step([t], i, false));
}
