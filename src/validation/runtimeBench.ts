// The runtime bench: load a template in a hidden same-origin iframe and EXERCISE it the way
// playout will - update() with real data, play(), Continue presses, stop(), replay - then
// measure the settled layout (overlap, overflow, canvas escape, double-length stress text).
//
// This is the deterministic half of the AI harness's quality guarantee: validateTemplate
// checks the code's structure, this bench checks its observable behaviour. Every finding is
// a teaching message (the exact text is fed back to the model in a repair round), and the
// whole catalog must pass its own bench - e2e/catalog/catalog-bench.spec.ts runs it over every
// variant, so the thresholds are calibrated against the house's own artifacts.
//
// Browser-only (needs a live DOM); the AI provider never imports it - the UI injects it as
// an SpxValidator (src/ai/provider.ts), the same seam the video harness uses.

import { composeDocument } from '../preview/composeDocument';
import { parseAnimData } from '../blocks/animData';
import { allOperatorArrows, allTimelines, type OperatorArrow } from '../blocks/animMachine';
import { detectPrefix } from '../model/structure';
import type { SpxTemplate } from '../model/types';
import type { ValidationIssue, ValidationResult } from './validateTemplate';
import { unreachableFields } from './fieldPaint';
import { markLegibilityFindings, markLegibilityMessage } from './markLegibility';
import { designRulesWarnings } from './designRulesWarnings';
import { measureOcclusion, OCCLUSION_ERROR, OCCLUSION_WARN } from './occlusion';
import type { ProjectLegibility } from '../model/designRules';

export interface RuntimeBenchOptions {
  /** Hard cap on the whole bench run (iframe load + every phase). */
  timeoutMs?: number;
  /**
   * Enforce the house editability contract (root class prefix, readable NOACG_ANIM data
   * block, :root style vars) as ERRORS. On by default - the harness promises AI output is
   * timeline/Style-panel editable like wizard output. Pass false when benching a foreign
   * template (an import being modified) where that promise doesn't apply yet.
   */
  houseContract?: boolean;
  /**
   * Field ids whose element must render on ONE line - identity metadata (a person's role, an
   * organization, a location), never a headline.
   *
   * Off unless a caller names fields, because wrapping is not a defect in general: a two-line
   * headline over a one-line kicker is correct broadcast practice, and a hand-written template
   * may wrap anything it likes. It IS a defect when the line carries identity, and the first
   * production Lite round shipped a five-line "lower third" that way (docs/AI_LITE_PLAN.md §1).
   *
   * No other check can see it. A wrapped line does not escape its frame, so the overflow and
   * clip checks below both pass it; the panel simply grows downward.
   */
  singleLineFields?: readonly string[];
  /**
   * Smallest font size, in CSS pixels at 1920x1080, that a text-bearing FIELD may render at.
   *
   * Off unless a caller names one, because a hand-written template may set any size it likes.
   * It matters on the AI path for a reason no other gate covers: scripts/type-floor.mjs
   * certifies every catalog design AS AUTHORED, and `designAdjust` then rewrites those exact
   * font sizes afterwards - so the certified number is not the number that reaches air. This
   * measures the ADJUSTED, rendered result (src/validation/typeFloor.ts).
   */
  typeFloorPx?: number;
  /**
   * Drive every text-bearing field to a sentinel in the settled on-air state and re-read the
   * frame: which declared fields reach no pixels at all (src/validation/fieldPaint.ts).
   *
   * Off unless a caller asks, and NOT because it is expensive - because of what it can and
   * cannot answer. It reads ONE state, the settled default path, so a field a later operator
   * event reveals would read as unpainted; the harness path asks the same question through
   * `structuralIntentCheck`, which knows the intent and can be told what to expect. NoaCG Lite
   * turns it on because it ships single-step lower thirds, where the settled state IS the
   * graphic - and because it is the one gate that would have caught the 2026-08-08 round's
   * worst frame: a strap whose second field painted nothing, `update()` with fresh data
   * changing nothing, and every rule code silent (benchmarks/lite/ROUND-2026-08-08-QUALITY.md
   * §4). Widening Lite past one-step categories has to revisit this note before trusting it.
   *
   * A WARNING, like the two above: nothing in the pipeline can act on it, and a Lite grounded
   * assembly has no repair loop, so refusing the result would spend a user's generation on a
   * defect they can see and we cannot fix for them.
   */
  fieldPaints?: boolean;
  /**
   * The project's legibility settings (viewing target + size-floor tri-state) the design
   * rules are computed under. Absent = the defaults (TV viewing, standard floors) - the
   * checks still run, because they are WARNINGS on every product surface (the ratified R4
   * severity policy, docs/DESIGN_RULES_PLAN.md §5) and a template with no project context
   * still airs on a TV. Pass `false` to skip them entirely (a caller measuring something
   * else, e.g. a fixture bench that would drown in them).
   */
  legibility?: ProjectLegibility | null | false;
}

/** Merge validation results: errors and warnings concatenate, ok = no errors anywhere. */
export function mergeResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return { ok: errors.length === 0, errors, warnings };
}

// The bench renames the preview error channel inside its composed document so a bench
// iframe's errors can never reach PreviewFrame's unfiltered 'spx-preview-error' listener
// and show up as a phantom preview error in the editor.
const BENCH_ERROR_TYPE = 'noacg-bench-error';

/** The whole-run cap. It has to clear the SUM of the phase budgets a thoroughly broken
 *  template can burn (fonts 1.5 s + entrance 2 s + exit 2 s + replay 2 s + the settles), or
 *  the run dies with one vague 'bench-timeout' instead of the three precise findings that
 *  were about to be reported - the diagnosis a repair round actually needs. */
const DEFAULT_TIMEOUT_MS = 15_000;
/** GSAP acceleration while benching: a 0.8 s entrance settles in ~40 ms of real time. */
const TIME_SCALE = 20;
/** Real-time wait that equals TIME_SCALE× that much animation time. */
const SETTLE_MS = 300;
/** How long the on-air check keeps looking before calling a graphic invisible. Generous on
 *  purpose: it costs nothing when the graphic is already up (the poll returns immediately),
 *  and it is what keeps a starved rAF from being reported as a broken entrance. */
const ON_AIR_BUDGET_MS = 2_000;
/** The mirror budget for the graphic LEAVING. Sampling once after a fixed settle looks safe
 *  here - 300 ms of real time is ~6 s of animation time at TIME_SCALE - but that margin is
 *  measured in animation time, and animation time only advances when rAF actually ticks. A
 *  hidden iframe on a loaded machine can be starved for the whole window, and then the fade
 *  has barely moved and a perfectly good catalog template is reported as "still visible after
 *  stop()". Poll instead, symmetrically with the entrance: leaving promptly costs nothing,
 *  and only a graphic that NEVER leaves inside the budget is a real finding. */
const OFF_AIR_BUDGET_MS = 2_000;
/**
 * How many of a machine's operator ARROWS the bench presses.
 *
 * A ceiling exists for one reason and it is not tidiness: the whole run has a hard cap
 * (DEFAULT_TIMEOUT_MS, or whatever the caller passes - 20 s from the CLI), and blowing it turns
 * every precise finding the bench was about to report into one vague `bench-timeout`. Each arrow
 * costs a snap, a data re-drive and a settle, so the ceiling is the arrow budget that still
 * leaves room for the phases after it.
 *
 * 24 is the largest real machine plus a little air, and the cost is measured: the proof case's
 * totals board declares 22 arrows (eleven controls, each legal from both of its `flash` states -
 * docs/CONTROL_PANEL_ANY_GRAPHIC.md §3b) and walking all 22 took the whole bench run from 2.6 s
 * to 4.5 s, against a 15 s cap that still has to hold a failing entrance, exit and replay poll at
 * 2 s each. Past the ceiling the skipped arrows are NAMED
 * (`bench-events-skipped`) rather than silently dropped, because gate 3's promise is that the
 * bench walks every operator arrow and a promise the instrument cannot keep has to say so.
 *
 * Exported for `e2e/lite-field-paint.spec.ts`, which measures the catalog's real maximum against
 * it - the same guard `MAX_WALKED_STATES` carries, so the ceiling cannot quietly start biting as
 * machines grow.
 */
export const MAX_BENCH_ARROWS = 24;
/** Title-safe margin (fraction of the canvas each side) - escaping it is a warning. */
const TITLE_SAFE = 0.035;
/** Overlap thresholds: intersection as a fraction of the SMALLER element's rect. */
const OVERLAP_ERROR = 0.25;
const OVERLAP_WARN = 0.05;

// A long real-world name: the classic lower-third breaker (~60 chars).
const STRESS_NAME = 'Alexandra Konstantopoulos-Vandermeulen, Senior Correspondent';
/**
 * The stress value for a NUMBER field: one more digit than the design was authored around,
 * never fewer than three, written as a 1 followed by 8s ("188", "1888888").
 *
 * A number widens by digit COUNT, so the default has to be REPLACED, not doubled — the text
 * branch's `${v} ${v}` turns "0" into "0 0", which is a wider string but not a wider NUMBER,
 * and it is not what breaks a scorebug.
 *
 * The three-digit floor is the scoreboard calibration, kept exactly: a score's default is "0",
 * and three digits is an ordinary basketball score and about as far as any sport's headline
 * figure goes. Four was tried there and rejected — it makes sb10's doubled club name clip,
 * while no match produces a four-digit score, so the gate would have charged every design
 * width for a value that cannot occur.
 *
 * A FIXED three digits is only right for a field whose default carries no magnitude. A
 * fundraiser's total is authored at "124213" and a milestone figure at "18400"; stressing
 * those to "188" would test a value three digits NARROWER than the design already shows, so
 * converting them to number fields would have quietly relaxed the gate instead of tightening
 * it. One extra digit is the honest ceiling for a figure like that — the campaign that passes
 * ten times its sample — and it lands back on "188" for every field whose default is a single
 * digit, which is why the scoreboard measurement above still holds.
 */
function stressNumber(value: string): string {
  const digits = (value.match(/\d/g) ?? []).length;
  return '1'.padEnd(Math.max(3, digits + 1), '8');
}

interface TemplateGlobals {
  play?: () => void;
  stop?: () => void;
  update?: (data: string) => void;
  next?: () => void;
  gsap?: { globalTimeline?: { timeScale: (v: number) => void } };
}

/** The machine engine's globals (src/templates/shared/animRuntime.ts). All optional: a template
 *  whose FROZEN interpreter predates the machine carries none of them, which is why every use is
 *  guarded and why `readGroupState` has an answer for "would not say". */
interface MachineGlobals {
  noacgDispatch?: (event: string) => void;
  noacgSnap?: (assignments: Record<string, string> | null, opts: { timers: boolean }) => void;
  noacgMachineState?: () => { groups: Record<string, string> };
}

const issue = (rule: string, message: string): ValidationIssue => ({ rule, message });

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll a condition until it holds or the budget runs out. Returns whether it held. */
async function waitFor(condition: () => boolean, budgetMs: number, stepMs = 50): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += stepMs) {
    if (condition()) return true;
    await wait(stepMs);
  }
  return condition();
}

/** Where one group's pointer is, or null when the interpreter is too old to say (the machine
 *  globals arrived together, so a template without one has none of them). */
function readGroupState(win: MachineGlobals, groupId: string): string | null {
  try {
    return win.noacgMachineState?.().groups[groupId] ?? null;
  } catch {
    return null;
  }
}

/**
 * One arrow the bench did not press. `restedAt` is the whole story: absent means the arrow was
 * past the ceiling, present means the bench could not put the machine in front of it and this is
 * where the machine reported itself instead (null = the interpreter would not say).
 */
interface UnpressedArrow {
  arrow: OperatorArrow;
  restedAt?: string | null;
}

/**
 * The unpressed arrows, as a sentence.
 *
 * Capped at twelve: a machine large enough to overrun the ceiling by more than that has a bigger
 * problem than which arrow came last, and the finding is fed to a model that pays for every word
 * of it. The cap is why the order matters. An arrow whose from-state the bench could NOT ENTER is
 * a defect - nobody can ever press it - while one past the ceiling is only a budget, so the
 * defects are named first and a machine with forty arrows cannot push them out of the sentence
 * behind twelve merely-skipped ones.
 */
function listArrows(unpressed: UnpressedArrow[]): string {
  const ordered = [...unpressed].sort((a, b) => Number('restedAt' in b) - Number('restedAt' in a));
  const shown = ordered.slice(0, 12);
  const named = shown
    .map(({ arrow, restedAt }) => {
      const why =
        restedAt === undefined
          ? `past the bench's ceiling of ${MAX_BENCH_ARROWS} arrows`
          : `the bench could not enter ${arrow.from}: the machine reported "${restedAt ?? 'nowhere'}"`;
      return `"${arrow.event}" from ${arrow.groupId}/${arrow.from} (${why})`;
    })
    .join(', ');
  const rest = unpressed.length - shown.length;
  return rest > 0 ? `${named}, and ${rest} more` : named;
}

/** '#id', '.first-class', or the tag name - how findings name an element. */
function labelFor(el: Element): string {
  if (el.id) return `#${el.id}`;
  const cls = el.getAttribute('class')?.trim().split(/\s+/)[0];
  return cls ? `.${cls}` : el.tagName.toLowerCase();
}

/** Computed opacity multiplied up the ancestor chain (autoAlpha hides via both). */
function effectiveOpacity(el: Element, win: Window): number {
  let o = 1;
  for (let node: Element | null = el; node && node !== win.document.body; node = node.parentElement) {
    const cs = win.getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    o *= parseFloat(cs.opacity) || 0;
    if (o <= 0) return 0;
  }
  return o;
}

function isVisible(el: Element, win: Window): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  return effectiveOpacity(el, win) > 0.1;
}

/**
 * The elements the layout checks measure: visible elements that OWN text (a non-empty direct
 * text node) plus content images. Panels/boxes without their own text are containers -
 * text deliberately sits on them, so they are not collected.
 *
 * Exported for `scripts/occlusion-sweep.mjs`, which calibrates a rule this bench runs: a
 * calibration that collected its own idea of "a leaf" would be measuring a different frame than
 * the gate it is meant to set a number for.
 */
export function collectLeaves(win: Window): Element[] {
  const all = win.document.body.querySelectorAll<Element>('*');
  const leaves: Element[] = [];
  for (const el of all) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const ownsText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
    );
    const isImage = el.tagName === 'IMG';
    if ((ownsText || isImage) && isVisible(el, win)) leaves.push(el);
  }
  return leaves;
}

/** Roots of measured motion (NOACG_ANIM dynamics targets): they and their subtrees travel
 *  by data-derived magnitudes (marquees, rolls), so off-canvas positions are by design - and,
 *  since 2026-08-20, so are positions BEHIND something: a ticker's items crawl past a fixed
 *  label and pass under it every lap, which is the construction, not a defect. Exported for the
 *  occlusion calibration, same reason as `collectLeaves`. */
export function dynamicsRoots(template: SpxTemplate, win: Window): Element[] {
  const data = parseAnimData(template.js);
  if (!data) return [];
  const roots: Element[] = [];
  // Every timeline the graphic can play, branch states included — a branch's measured motion
  // travels off-canvas by design just as a default-path step's does.
  for (const step of allTimelines(data)) {
    for (const d of step.dynamics ?? []) {
      if (!d.target) continue;
      try {
        win.document.querySelectorAll(d.target).forEach((el) => roots.push(el));
      } catch {
        /* an exotic selector - leave it to the author */
      }
    }
  }
  return roots;
}

const isExempt = (el: Element, roots: Element[]) => roots.some((r) => r === el || r.contains(el));

function intersection(a: DOMRect, b: DOMRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Resolve a computed `clip-path` to the region it actually paints, in viewport
 *  coordinates. `clip-path` cuts painted output WITHOUT any `overflow` property, so the
 *  overflow-ancestor walk alone never sees it — a panel clipped to `inset(0 60% 0 0)`
 *  silently loses 60% of its text and every geometry check still passes.
 *
 *  Percentages resolve against the border box (the `border-box` default reference).
 *  Shapes that can't be resolved cheaply (`path()`, `url()`, keyword radii like
 *  `closest-side`) return null: the bench reports nothing rather than guessing, because a
 *  false clip error would block a valid export. */
function clipBoxFor(el: Element, cs: CSSStyleDeclaration, target: DOMRect): DOMRect | null {
  const raw = (cs.clipPath || '').trim();
  if (!raw || raw === 'none') return null;
  // Strip the optional trailing geometry-box keyword (`inset(...) border-box`).
  const shape = raw.replace(/\s+(border|padding|content|margin|fill|stroke|view)-box\s*$/, '').trim();
  const open = shape.indexOf('(');
  if (open < 0 || !shape.endsWith(')')) return null;
  const fn = shape.slice(0, open).toLowerCase();
  const args = shape.slice(open + 1, -1).trim();
  const box = el.getBoundingClientRect();

  // A length token against the relevant extent. Computed clip-path keeps percentages and
  // resolves other lengths to px, so those two units are the whole vocabulary.
  const len = (tok: string, extent: number): number | null => {
    const n = parseFloat(tok);
    if (!Number.isFinite(n)) return null;
    if (tok.endsWith('%')) return (n / 100) * extent;
    if (tok.endsWith('px')) return n;
    return null;
  };

  if (fn === 'inset' || fn === 'rect' || fn === 'xywh') {
    // `round <radius>` only rounds the corners - it never moves the edges.
    const parts = args.split(/\s+round\s+/i)[0].trim().split(/\s+/);
    const nums = parts.map((p, i) => len(p, i % 2 === 0 ? box.height : box.width));
    if (nums.some((n) => n === null)) return null;
    const v = nums as number[];
    if (fn === 'xywh') {
      if (v.length < 4) return null;
      // x y w h - x/w are horizontal, so re-resolve against the correct extents.
      const x = len(parts[0], box.width);
      const w = len(parts[2], box.width);
      const y = len(parts[1], box.height);
      const h = len(parts[3], box.height);
      if (x === null || y === null || w === null || h === null) return null;
      return new DOMRect(box.left + x, box.top + y, w, h);
    }
    // inset/rect take top right bottom left, with the usual 1-4 value shorthand.
    const [t, r = t, b = t, l = r] = v;
    if (fn === 'rect') {
      // rect() edges are offsets from the top/left, not insets from each side.
      return new DOMRect(box.left + l, box.top + t, Math.max(0, r - l), Math.max(0, b - t));
    }
    return new DOMRect(
      box.left + l,
      box.top + t,
      Math.max(0, box.width - l - r),
      Math.max(0, box.height - t - b),
    );
  }

  if (fn === 'polygon') {
    // Optional leading fill-rule, then `x y` pairs.
    const pts: Array<[number, number]> = [];
    for (const pt of args.replace(/^(nonzero|evenodd)\s*,\s*/i, '').split(',')) {
      const [xt, yt] = pt.trim().split(/\s+/);
      const x = len(xt ?? '', box.width);
      const y = len(yt ?? '', box.height);
      if (x === null || y === null) return null;
      pts.push([x, y]);
    }
    if (pts.length < 3) return null;
    const ys = pts.map((p) => p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // A SHEARED bar (the skewed-accent idiom) is far narrower than its bounding box at
    // any given height, so the bbox would wave through text that visibly loses glyphs.
    // Measure the shape's horizontal extent across the BAND the text actually occupies:
    // every vertex inside the band, plus every edge crossing its boundaries.
    const top = Math.max(minY, target.top - box.top);
    const bottom = Math.min(maxY, target.bottom - box.top);
    if (!(bottom > top)) return new DOMRect(box.left, box.top + minY, box.width, maxY - minY);
    let minX = Infinity;
    let maxX = -Infinity;
    const note = (x: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); };
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if (y1 >= top && y1 <= bottom) note(x1);
      for (const edge of [top, bottom]) {
        if ((y1 < edge && y2 > edge) || (y1 > edge && y2 < edge)) {
          note(x1 + ((edge - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    if (!Number.isFinite(minX)) return null;
    return new DOMRect(box.left + minX, box.top + top, maxX - minX, bottom - top);
  }

  if (fn === 'circle' || fn === 'ellipse') {
    const [radii, center] = args.split(/\s+at\s+/i);
    const rt = radii.trim().split(/\s+/);
    // The reference for a circle radius is the diagonal-derived extent; percentages on an
    // ellipse resolve per axis. Keyword radii (closest-side, …) are not resolvable here.
    const diag = Math.sqrt(box.width ** 2 + box.height ** 2) / Math.sqrt(2);
    const rx = fn === 'circle' ? len(rt[0], diag) : len(rt[0], box.width);
    const ry = fn === 'circle' ? rx : len(rt[1] ?? rt[0], box.height);
    if (rx === null || ry === null) return null;
    const ct = (center ?? '50% 50%').trim().split(/\s+/);
    const cx = len(ct[0], box.width);
    const cy = len(ct[1] ?? ct[0], box.height);
    if (cx === null || cy === null) return null;
    return new DOMRect(box.left + cx - rx, box.top + cy - ry, rx * 2, ry * 2);
  }

  return null;
}

/** Two copies of the SAME text stacked near-coincidentally are deliberate layering — a
 *  karaoke wipe's accent fill over its base line, a glow copy. An OFFSET duplicate is a
 *  misaligned wipe, which is a real bug (the same rule the compare rig's sampler uses). */
function isDeliberateLayer(a: Element, b: Element, ra: DOMRect, rb: DOMRect, inter: number): boolean {
  if ((a.textContent ?? '').trim() !== (b.textContent ?? '').trim()) return false;
  const union = ra.width * ra.height + rb.width * rb.height - inter;
  const iou = union > 0 ? inter / union : 0;
  const dx = Math.abs((ra.left + ra.right) / 2 - (rb.left + rb.right) / 2);
  const dy = Math.abs((ra.top + ra.bottom) / 2 - (rb.top + rb.bottom) / 2);
  return iou > 0.8 && dx < 6 && dy < 6;
}

/**
 * Text a PANEL is painted over - the defect `overlapIssues` is structurally unable to see.
 *
 * That check pairs LEAVES, and a leaf owns text. A panel owns none, so a panel is never in a
 * pair, and text can disappear under one completely while every geometry check here passes.
 * Found 2026-08-20 (docs/NOACG_PRO_PLAN.md §26.1). `occlusion.ts` carries the method and the
 * two false positives it must not have; the bands here mirror `OVERLAP_ERROR`/`OVERLAP_WARN`
 * so one defect family reads one way, and the shipped catalog reads ZERO under both of them -
 * 502 designs at their own values and again with every text doubled
 * (`scripts/occlusion-sweep.mjs`, ledgers beside it).
 */
function occlusionIssues(
  win: Window,
  leaves: Element[],
  exempt: Element[],
  phase: string,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const reading of measureOcclusion(win, leaves, exempt)) {
    const pct = Math.round(reading.coveredShare * 100);
    const message = `${reading.el} ("${reading.snippet}") is ${pct}% painted over by `
      + `${reading.coveredBy.join(', ')} ${phase} - text hidden under a panel cannot be read at `
      + 'all. Give the panel a row of its own, or move the text out from under it; a panel that '
      + 'must sit on top belongs behind the text, not over it.';
    if (reading.coveredShare >= OCCLUSION_ERROR) errors.push(issue('bench-occluded', message));
    else if (reading.coveredShare >= OCCLUSION_WARN) warnings.push(issue('bench-occluded', message));
  }
  return { errors, warnings };
}

/** Pairwise overlap among leaves (ancestor/descendant pairs excluded - text on its own
 *  panel is design, two unrelated texts on top of each other is the #1 broadcast defect). */
function overlapIssues(
  leaves: Element[],
  exempt: Element[],
  phase: string,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (isExempt(a, exempt) || isExempt(b, exempt)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const inter = intersection(ra, rb);
      if (inter < 4) continue;
      if (isDeliberateLayer(a, b, ra, rb, inter)) continue;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      const ratio = smaller > 0 ? inter / smaller : 0;
      if (ratio >= OVERLAP_ERROR) {
        errors.push(
          issue(
            'bench-overlap',
            `${labelFor(a)} and ${labelFor(b)} overlap by ${Math.round(ratio * 100)}% ${phase} - ` +
              `two text/image elements must never collide. Stack them in a flex column with a gap ` +
              `(or size the panel to its content); never absolutely position two siblings where long text can reach each other.`,
          ),
        );
      } else if (ratio >= OVERLAP_WARN) {
        warnings.push(
          issue(
            'bench-overlap',
            `${labelFor(a)} and ${labelFor(b)} touch (${Math.round(ratio * 100)}% overlap) ${phase} - ` +
              `add breathing room between them (DESIGN_LANGUAGE: cramped spacing is the #1 tell of a bad graphic).`,
          ),
        );
      }
    }
  }
  return { errors, warnings };
}

/** Mid-line clipping, canvas escape, and title-safe escape for every leaf. */
/** Does this style actually paint, rather than merely declare a background? A fully
 *  transparent colour and `none` are declarations; everything else puts pixels down. */
function paintsSurface(cs: CSSStyleDeclaration): boolean {
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  const bg = cs.backgroundColor;
  if (!bg || bg === 'transparent') return false;
  const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(bg);
  return alpha ? Number(alpha[1]) > 0.05 : true;
}

/**
 * The nearest thing painted behind this element, or null when nothing is.
 *
 * A PSEUDO-ELEMENT COUNTS HERE, and that is the opposite of the rule in the creative style
 * gate, on purpose. There, the question is whether the design supplied a reading surface at
 * all, and `::before` is usually an accent motif beside the words. Here the question is
 * geometric - is anything painted behind THIS text - and a `::after` scrim is the commonest way
 * a design paints one. The frame that prompted this check painted its surface exactly that way.
 *
 * The ancestor's own border box is used as the surface geometry even when the paint came from
 * its pseudo-element, because a pseudo's box is not directly measurable. That is conservative
 * in the safe direction: an inset scrim is smaller than the box, so this under-reports rather
 * than inventing an escape that is not there.
 */
function paintedAncestor(el: Element, win: Window): Element | null {
  for (let anc: Element | null = el; anc && anc !== win.document.body; anc = anc.parentElement) {
    if (paintsSurface(win.getComputedStyle(anc))) return anc === el ? null : anc;
    for (const pseudo of ['::before', '::after']) {
      const ps = win.getComputedStyle(anc, pseudo);
      if (ps.content && ps.content !== 'none' && paintsSurface(ps)) return anc === el ? null : anc;
    }
  }
  return null;
}

function overflowIssues(
  leaves: Element[],
  exempt: Element[],
  win: Window,
  canvas: { width: number; height: number },
  phase: string,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const safe = {
    left: canvas.width * TITLE_SAFE,
    top: canvas.height * TITLE_SAFE,
    right: canvas.width * (1 - TITLE_SAFE),
    bottom: canvas.height * (1 - TITLE_SAFE),
  };
  for (const el of leaves) {
    if (isExempt(el, exempt)) continue;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area <= 0) continue;

    // (a) Clipped mid-line by an overflow-hidden or clip-path'd ancestor that is NOT a
    // reveal mask. Reveal masks (`*-mask`) clip on purpose during the entrance; at the
    // settled state the text must still fit - but the mask is sized by the text, so a real
    // clip shows up against a FIXED-size ancestor (a panel with overflow hidden).
    // The element ITSELF is checked too: `clip-path` on the text node cuts its own glyphs.
    for (let anc: Element | null = el; anc && anc !== win.document.body; anc = anc.parentElement) {
      const cls = anc.getAttribute('class') ?? '';
      if (/-mask\b/.test(cls)) continue;
      const cs = win.getComputedStyle(anc);
      const ar = anc.getBoundingClientRect();
      // A clip-path cuts on BOTH axes and applies to the element carrying it; overflow
      // only clips descendants, on the axes it hides.
      const clip = clipBoxFor(anc, cs, rect);
      const overflows = anc !== el;
      const clipsX = overflows && (cs.overflowX === 'hidden' || cs.overflowX === 'clip');
      const clipsY = overflows && (cs.overflowY === 'hidden' || cs.overflowY === 'clip');
      const cutX =
        (clipsX && (rect.left < ar.left - 2 || rect.right > ar.right + 2)) ||
        (!!clip && (rect.left < clip.left - 2 || rect.right > clip.right + 2));
      const cutY =
        (clipsY && (rect.top < ar.top - 2 || rect.bottom > ar.bottom + 2)) ||
        (!!clip && (rect.top < clip.top - 2 || rect.bottom > clip.bottom + 2));
      if (cutX || cutY) {
        const how = clip
          ? `its clip-path paints only part of it`
          : `the text is cut mid-line`;
        errors.push(
          issue(
            'bench-overflow',
            `${labelFor(el)} is clipped by ${labelFor(anc)} ${phase} - ${how}. ` +
              `Use the auto-fit pattern: width: fit-content with a max-width cap and overflow-wrap so long values wrap instead of clipping.`,
          ),
        );
        break;
      }
    }

    // (a2) The words leave the surface that backs them. Check (a) above only fires when an
    // ancestor CLIPS - overflow hidden, or a clip-path - because that is the case where the
    // text is visibly cut. Text that simply spills past a painted panel is not cut, sits
    // inside the canvas, and can sit inside title-safe, so every branch here used to miss it:
    // observed as a name running ~30px past its own plate, judged unusable by eye while the
    // bench reported the template clean.
    //
    // WARNING, not error, and deliberately so. Text breaking out of its panel is a real
    // technique - a headline overhanging its bar is a designed look, not a defect - and this
    // gate runs over the whole catalog. A rule that cannot tell the two apart may report, but
    // must not block.
    const surface = paintedAncestor(el, win);
    if (surface) {
      const sr = surface.getBoundingClientRect();
      const escapes =
        rect.left < sr.left - 2 || rect.right > sr.right + 2 ||
        rect.top < sr.top - 2 || rect.bottom > sr.bottom + 2;
      if (escapes) {
        warnings.push(
          issue(
            'bench-unbacked-text',
            `${labelFor(el)} extends past ${labelFor(surface)}, the nearest thing painted behind it, ${phase} - ` +
              `part of the text reads straight against the video. Either let the surface follow the ` +
              `content (width: fit-content, padding) or keep the text inside it.`,
          ),
        );
      }
    }

    // (b) Canvas escape: a meaningful fraction of the element renders off the canvas.
    const canvasRect = new DOMRect(0, 0, canvas.width, canvas.height);
    const onCanvas = intersection(rect, canvasRect);
    if (1 - onCanvas / area > 0.05) {
      errors.push(
        issue(
          'bench-overflow',
          `${labelFor(el)} extends off the ${canvas.width}×${canvas.height} canvas ${phase} - ` +
            `it will be cut off on air. Keep the graphic inside the frame (anchor with bottom/left offsets, cap widths).`,
        ),
      );
      continue;
    }

    // (c) Title-safe: fully on canvas but outside the 3.5% broadcast-safe margin.
    if (rect.left < safe.left - 1 || rect.top < safe.top - 1 || rect.right > safe.right + 1 || rect.bottom > safe.bottom + 1) {
      warnings.push(
        issue(
          'bench-overflow',
          `${labelFor(el)} sits outside the ${Math.round(TITLE_SAFE * 100 * 10) / 10}% title-safe margin ${phase} - ` +
            `some broadcast chains crop close to the edge; consider pulling it inside the safe area.`,
        ),
      );
    }
  }
  return { errors, warnings };
}

/** Build an update() payload from the template's fields. `mode` picks the values. */
function fieldValues(template: SpxTemplate, mode: 'marker' | 'default' | 'stress'): Record<string, string> {
  const values: Record<string, string> = {};
  let firstText = true;
  for (const f of template.fields) {
    let v = f.value ?? '';
    if (mode === 'marker' && (f.ftype === 'textfield' || f.ftype === 'textarea')) {
      v = `Bench ${f.field} marker`;
    } else if (mode === 'stress') {
      if (f.ftype === 'textfield') {
        // The first text field carries the classic 60-char name; the rest double.
        v = firstText ? STRESS_NAME : v ? `${v} ${v}` : STRESS_NAME;
        firstText = false;
      } else if (f.ftype === 'number') {
        // A NUMBER field is stressed by digit COUNT, which doubling cannot do — doubling "0"
        // gives "0 0", and once a score stopped being a textfield the stress pass quietly
        // stopped widening it at all. That failure is invisible in the worst way: the gate
        // gets GREENER while covering less, and no other catalog gate fills the hole
        // (type-floor measures font size, overflow-sweep runs at design defaults, and
        // numerals.mjs substitutes digits without ever changing how many there are).
        v = stressNumber(v);
      } else if (f.ftype === 'textarea') {
        // Line-based data (credits, tickers, quiz options): double every line's length.
        v = v
          .split('\n')
          .map((line) => (line.trim() ? `${line} ${line}` : line))
          .join('\n');
      }
    }
    values[f.field] = v;
  }
  return values;
}

/** The house editability contract, checked statically (no iframe needed). */
function editabilityIssues(template: SpxTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!detectPrefix(template.html)) {
    issues.push(
      issue(
        'bench-editability',
        'No recognizable root element - the canvas, timeline and Style panel find the graphic through ' +
          'its structure contract, and this template has no "-box" element. Pick one prefix for the ' +
          'design (e.g. "lower-third") and wrap it in <div class="PREFIX"> holding ' +
          '<div class="PREFIX-box">: that exact -box class, ALONE on the element, is what the editor ' +
          'looks for. Prefix every other class with the same PREFIX.',
      ),
    );
  }
  if (!template.js.includes('var NOACG_ANIM')) {
    issues.push(
      issue(
        'bench-editability',
        'The marked ANIMATION region must declare its choreography as the NOACG_ANIM data block ' +
          '(strict JSON, version 1) plus the standard interpreter - hand-rolled GSAP there is not editable by the timeline.',
      ),
    );
  } else if (!parseAnimData(template.js)) {
    issues.push(
      issue(
        'bench-editability',
        'The NOACG_ANIM block is not readable as animation data (strict JSON, version 1, root/speed/steps) - ' +
          'the timeline and Inspector would treat this template as hand-crafted code.',
      ),
    );
  }
  const missingVars = ['--accent', '--scale'].filter((v) => !template.css.includes(`${v}:`));
  if (missingVars.length) {
    issues.push(
      issue(
        'bench-editability',
        `The :root style contract is incomplete - missing ${missingVars.join(', ')}. ` +
          'Declare --accent, --text-color, --text-dim, --panel-bg, --font-heading and --scale on :root so the Style panel can edit the look.',
      ),
    );
  }
  return issues;
}

/**
 * Load the template in a hidden iframe and exercise its full lifecycle, measuring the
 * settled layout with default AND stress data. Never throws; a harness-level failure
 * (no DOM, iframe never loaded) degrades to a warning so callers fall back to static
 * validation rather than blocking on the bench itself.
 */
export async function benchTemplateRuntime(
  template: SpxTemplate,
  opts: RuntimeBenchOptions = {},
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (opts.houseContract !== false) errors.push(...editabilityIssues(template));

  if (typeof document === 'undefined') {
    warnings.push(issue('bench-skipped', 'The runtime bench needs a browser DOM and was skipped.'));
    return { ok: errors.length === 0, errors, warnings };
  }

  const { width, height } = template.resolution;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;visibility:visible;`;

  // Runtime errors surface two ways: synchronous throws from the entry points we call
  // (caught directly below) and async errors from GSAP callbacks/timeouts, which the
  // composed document's capture script posts to the parent. The bench renames that
  // channel (see BENCH_ERROR_TYPE) and filters by source so nothing cross-talks.
  const asyncErrors: string[] = [];
  let phase = 'load';
  const onMessage = (ev: MessageEvent) => {
    if (ev.source === iframe.contentWindow && ev.data && ev.data.type === BENCH_ERROR_TYPE) {
      asyncErrors.push(`${phase}: ${String(ev.data.message)}`);
    }
  };
  window.addEventListener('message', onMessage);

  const run = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('the bench iframe failed to load'));
      iframe.srcdoc = composeDocument(template).split('spx-preview-error').join(BENCH_ERROR_TYPE);
      document.body.appendChild(iframe);
    });

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) throw new Error('the bench iframe has no document');
    const g = win as unknown as TemplateGlobals;

    // Fonts change every measurement - wait for them (capped: a missing font must not hang
    // the bench), then two frames so layout is current.
    await Promise.race([doc.fonts.ready.then(() => undefined), wait(1500)]);
    await new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));

    // Accelerate GSAP so entrance/exit settle in tens of milliseconds of real time.
    try {
      g.gsap?.globalTimeline?.timeScale(TIME_SCALE);
    } catch {
      /* no gsap - the runtime checks below still apply */
    }

    /** Call one of the template's entry points. Returns false when it threw, so a caller that
     *  would otherwise call it again in a loop can stop: the throw is already reported, and
     *  twenty more copies of it differ only in the phase they name. */
    const call = (name: 'play' | 'stop' | 'update' | 'next', arg?: string): boolean => {
      const fn = g[name];
      if (typeof fn !== 'function') return false;
      try {
        (fn as (a?: string) => void).call(win, arg);
        return true;
      } catch (e) {
        errors.push(
          issue('bench-runtime', `${name}() threw during ${phase}: ${e instanceof Error ? e.message : String(e)}`),
        );
        return false;
      }
    };

    // ── Binding: every text field must land in its element ──────────────────────────
    // Numeric-looking text fields are exempt: data-driven runtimes legitimately REFORMAT
    // them (a count-up adds thousand separators, a clock renders M:SS), so an exact match
    // would be a false positive. For the rest, a rebuild may transform the value too -
    // "landed" means the element contains the marker OR its content visibly changed.
    phase = 'update';
    const numericLike = (v: string) => /\d/.test(v) && /^[\s\d.,%+:-]*$/.test(v);
    const bindable = template.fields.filter(
      (f) => (f.ftype === 'textfield' || f.ftype === 'textarea') && !numericLike(f.value ?? ''),
    );
    const before = new Map(bindable.map((f) => [f.field, doc.getElementById(f.field)?.textContent ?? null]));
    call('update', JSON.stringify(fieldValues(template, 'marker')));
    await wait(30);
    for (const f of bindable) {
      const el = doc.getElementById(f.field);
      if (!el) continue; // validateTemplate already warns about the missing id
      const text = el.textContent ?? '';
      if (!text.includes(`Bench ${f.field} marker`) && text === before.get(f.field)) {
        errors.push(
          issue(
            'bench-binding',
            `update() did not land field ${f.field} ("${f.title}") in its element - ` +
              `write each field's value into the element with the same id (setFieldValue / getElementById('${f.field}')).`,
          ),
        );
      }
    }
    call('update', JSON.stringify(fieldValues(template, 'default')));
    await wait(30);

    // ── Identity lines stay on one line ─────────────────────────────────────────────
    // Measured HERE, before play(): the root starts CSS-hidden at opacity 0, which preserves
    // layout, so this is the settled geometry without racing an entrance that scales or clips
    // its own lines mid-flight.
    for (const field of opts.singleLineFields ?? []) {
      const el = doc.getElementById(field);
      if (!el) continue; // validateTemplate already warns about a missing id
      const cs = win.getComputedStyle(el);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const rect = el.getBoundingClientRect();
      if (!lineHeight || rect.height <= 0) continue;
      // Line COUNT rather than a wrap detector: getClientRects() answers per fragment, and a
      // design that pads its own line would report a number unrelated to what a viewer sees.
      const lines = Math.round(rect.height / lineHeight);
      if (lines > 1) {
        // A WARNING, and the severity is measured rather than chosen. Raised as an error it
        // flagged 11 of 18 generations in the 2026-08-07 comparison round - Lite has no repair
        // loop on the grounded path, so that would have refused two thirds of requests outright
        // for a graphic that is mediocre but airable. Nothing can currently ACT on this finding;
        // it becomes an error the day something can (docs/AI_LITE_PLAN.md §1).
        warnings.push(
          issue(
            'bench-line-wrap',
            `Field ${field} carries identity (a name, role, organization or location) and wrapped ` +
              `onto ${lines} lines at its own sample values - the graphic stops reading as a strap. ` +
              `Choose a chassis whose stated character capacity holds this copy, or shorten it.`,
          ),
        );
      }
    }

    // ── Text is big enough to read on air ───────────────────────────────────────────
    // Measured at the same settled, pre-play moment as the wrap check above, and for the same
    // reason: an entrance that scales its own lines would report a size nobody ever sees.
    //
    // Scoped to FIELDS, not to every text node. A field is operator-facing copy that must be
    // legible at broadcast distance; a design's own decorative micro-label is a deliberate
    // authored choice the catalog gate already passed. Widening this to all text would flag
    // designs that are correct.
    if (opts.typeFloorPx) {
      for (const field of template.fields) {
        const el = doc.getElementById(field.field);
        if (!el || !(el.textContent ?? '').trim()) continue;
        const cs = win.getComputedStyle(el);
        // Hidden holders carry values, not type - an input-only field (a countdown duration)
        // legitimately renders at whatever size, because it renders nowhere.
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const px = parseFloat(cs.fontSize);
        if (!px || px >= opts.typeFloorPx) continue;
        warnings.push(
          issue(
            'bench-type-floor',
            `Field ${field.field} renders at ${Math.round(px)}px, under the ${opts.typeFloorPx}px `
              + `floor for this category - it is too small to read on air at broadcast distance. `
              + `The design was authored above the floor; a size adjustment took it below.`,
          ),
        );
      }
    }

    // ── Entrance + settled measurement with the field defaults ──────────────────────
    phase = 'play';

    // The design-unit ARTWORK (`.{prefix}-art`, the imported-design contract) is exempt
    // from the layout checks alongside the dynamics roots: placed text sits ON the artwork
    // by construction - it is the design's canvas, not a sibling that can collide. It still
    // counts for onAir() above, so an art-only design keeps a measurable entrance. Field
    // images (a logo slot's <img id="fN">) are NOT exempt - those are content.
    const prefix = detectPrefix(template.html);
    const artElements = prefix
      ? Array.from(win.document.querySelectorAll(`.${prefix}-art`))
      : [];
    const exempt = [...dynamicsRoots(template, win), ...artElements];
    const parsedData = parseAnimData(template.js);

    // "On air" is measured by what a viewer can see: at least one visible text/image leaf
    // intersecting the canvas. (A root box can legitimately have zero height when all its
    // children are absolutely positioned, so the root's own rect proves nothing.)
    const canvasRect = new DOMRect(0, 0, width, height);
    const onAir = () =>
      collectLeaves(win).some((el) => intersection(el.getBoundingClientRect(), canvasRect) > 0);

    // ── Cleared before the cue ───────────────────────────────────────────────────────
    // A keyed graphic must render NOTHING until it is cued: the template loads in
    // CasparCG/OBS/vMix long before the operator hits play, so anything visible at rest
    // is on the programme output the moment the page loads. The root starts CSS-hidden
    // and only the entrance reveals it - checked here at the exact rest state playout
    // sees (fields updated, play() not yet called).
    if (onAir()) {
      errors.push(
        issue(
          'bench-preplay',
          'Before play() the graphic already renders visible content - the root must start ' +
            'CSS-hidden (opacity 0) so the frame is completely clear until the entrance reveals it.',
        ),
      );
    }

    call('play');

    // THE ENTRANCE CHECK LOOKS WHILE THE ENTRANCE IS PLAYING, not after everything settles.
    //
    // Sampling once after a fixed wait would make this a race, not a check: an entrance that
    // fades in reads as invisible until enough of it has played, and a starved rAF in a hidden
    // iframe can stretch that out. So it polls, and the moment the graphic is up we move on.
    //
    // It polls BEFORE the settle wait because a graphic is not obliged to stay. A transition
    // covers the frame, holds for its cut, and clears ITSELF on a timer (docs/STATE_MACHINE_
    // SCHEMA.md; the transition type is the one that does it) - and the bench accelerates GSAP
    // 20x, which accelerates that timer too, so by the end of a 300 ms settle the stinger is
    // long gone. Checking afterwards would report "never appeared" for a graphic that appeared
    // exactly as designed. Asking the question at the right moment costs nothing for every
    // other template: they are on air by then and stay there.
    if (!(await waitFor(onAir, ON_AIR_BUDGET_MS))) {
      errors.push(
        issue(
          'bench-entrance',
          'After play() the graphic is not visible on the canvas - the entrance must reveal the root ' +
            '(the root starts CSS-hidden and play() shows it).',
        ),
      );
    }
    await wait(SETTLE_MS);

    const presses = Math.max(0, (parseInt(template.settings.steps, 10) || 1) - 1);
    phase = 'next';
    for (let i = 0; i < presses; i++) {
      call('next');
      await wait(80);
    }

    phase = 'settled (default data)';
    const leaves = collectLeaves(win);
    const lap = overlapIssues(leaves, exempt, 'with the default field values');
    errors.push(...lap.errors);
    warnings.push(...lap.warnings);
    const flow = overflowIssues(leaves, exempt, win, { width, height }, 'with the default field values');
    errors.push(...flow.errors);
    warnings.push(...flow.warnings);
    const hidden = occlusionIssues(win, leaves, exempt, 'with the default field values');
    errors.push(...hidden.errors);
    warnings.push(...hidden.warnings);

    // ── The design rules, as plain-language warnings (R4: warn-first, never blocking) ──
    // Measured here, on the settled default look with the whole path walked - the frame
    // that goes to air. Size vs role, contrast + protection, safe area for field-bound
    // text, and the ticker-margin rule where a crawl exists; each warning states the
    // viewing profile it was computed under.
    if (opts.legibility !== false) {
      phase = 'design rules';
      warnings.push(...designRulesWarnings(win.document, template, opts.legibility ?? null));
    }

    // ── Can the brand mark be SEEN where the design puts it? ─────────────────────────
    // Here, on the settled default look, for the same reason the field-paint drive is: this is
    // the frame that goes to air. NOT opt-in, unlike `fieldPaints` - that one has a false
    // positive the caller has to rule out (a field only a later state paints), and this one has
    // none: an image is either readable against its own surface or it is not, and the check
    // skips anything it cannot measure. A WARNING, because the two available repairs were both
    // ruled out as worse than the defect (§3.7) - so the honest act is to say so, not to block
    // an author who knows their mark sits over video.
    phase = 'mark legibility';
    for (const finding of markLegibilityFindings(doc, win)) {
      warnings.push(issue('bench-mark-unreadable', markLegibilityMessage(finding)));
    }

    // ── Every declared field reaches the screen ──────────────────────────────────────
    // Here rather than at the end, because this is where the question starts: the settled
    // on-air look with the whole default path walked. It does not END there - the drive snaps
    // through the machine's other states and unions what each shows, so a field only a later
    // branch paints counts as reachable (fieldPaint.ts says why). It restores the machine
    // itself; the DATA half is ours, and the defaults go straight back before anything else is
    // measured - the branch, exit, replay and stress phases below must see exactly what they
    // saw before this existed.
    if (opts.fieldPaints) {
      phase = 'field paint';
      const unpainted = await unreachableFields(win.document, win as Window & { update?: (d: string) => void }, template, SETTLE_MS);
      call('update', JSON.stringify(fieldValues(template, 'default')));
      await wait(SETTLE_MS);
      for (const name of unpainted) {
        warnings.push(
          issue(
            'bench-field-unpainted',
            `Field ${name} is declared and operator-editable, but its value reaches no pixels in `
              + 'ANY of the graphic\'s states - typing into it changes nothing on air, whatever the '
              + 'operator presses. Either the design draws it nowhere, or a colour or size decision '
              + 'made it invisible.',
          ),
        );
      }
    }

    // ── Branch states: the default path is only half a machine ───────────────────────
    // A branching graphic's alert badge or selection highlight only ever appears after an
    // operator EVENT, so walking play/next/stop never renders it and its layout is never
    // measured. Press each authored ARROW and check the pose it produces, then put the default
    // path back so the stress phase still measures the default look.
    //
    // ONE PRESS PER (FROM-STATE, EVENT) PAIR, and each press is made FROM THE ARROW'S OWN
    // FROM-STATE. Both halves were missing until 2026-09-15, and each made gate 3's promise
    // ("the bench walks every operator arrow", docs/CONTROL_PANEL_ANY_GRAPHIC.md §2c) quietly
    // false. `allOperatorEvents` folds by event NAME, so a scoreboard's `+1` - one button, five
    // arrows - was one dispatch and four unmeasured poses. And the dispatches ran in sequence
    // from wherever the last one left the machine, so an arrow out of a state the walk had
    // already left was dropped by structural guarding, silently, with the bench reporting the
    // pose it was standing in as though it had measured the press. Measured on the proof case:
    // `validate` reported 0 errors and 0 warnings on the totals board having pressed 8 of its 22
    // arrows (https://github.com/NoaCG/NoaCG-Studio/blob/285c936ebb0b8b7ab0761501e64e434d27c1876e/docs/handoffs/2026-09-15-hb-release-and-first-walk.md).
    //
    // So each press snaps first. `noacgSnap` enters a state by replaying its canonical route
    // with callbacks suppressed (docs/STATE_MACHINE_SCHEMA.md §3), which is also why the DATA
    // goes back in behind it: a state whose look is painted by a call composes empty otherwise.
    // That is the recovery sequence's own trailing `update()`, not a special case - the same
    // pairing `fieldPaint.ts` uses for its own walk. Groups the arrow does not name keep the
    // state they are in, so a parallel graphic is measured as a whole graphic.
    const machine = parsedData?.machine;
    if (machine) {
      const arrows = allOperatorArrows(machine);
      const walked = arrows.slice(0, MAX_BENCH_ARROWS);
      /** Arrows the bench did NOT press - the `bench-events-skipped` list. Seeded with the ones
       *  past the ceiling; the ones it could not reach are appended as the walk finds them. */
      const unpressed: UnpressedArrow[] = arrows.slice(MAX_BENCH_ARROWS).map((arrow) => ({ arrow }));
      const machineWin = win as unknown as MachineGlobals;
      const defaults = JSON.stringify(fieldValues(template, 'default'));
      /** Cleared the first time `update()` throws or turns out not to exist. Either way the
       *  phases above have already said so, and re-driving the data once per arrow would add one
       *  more copy of that same finding per press. */
      let dataDrivable = true;
      for (const arrow of walked) {
        const at = `${arrow.groupId}/${arrow.from}`;
        phase = `event "${arrow.event}" from ${at}`;
        try {
          machineWin.noacgSnap?.({ [arrow.groupId]: arrow.from }, { timers: false });
        } catch {
          // A throwing snap is the template's own exception; the runtime-error channel has it.
        }
        if (dataDrivable) dataDrivable = call('update', defaults);
        // 30 ms is 0.6 s of animation time at TIME_SCALE, and the frame is not read for another
        // 80 ms after the press - the same budget the stress phase gives an update before it
        // measures. Deliberately NOT `fieldPaint.ts`'s 300 ms: that walk waits for a rebuild
        // runtime to re-fit text it is about to read as a string, and 22 arrows at 300 ms would
        // cost 6 s of a 15 s run. Measured across every machine-bearing catalog family on
        // 2026-09-15 - 108 variants, quiz to matchup - and none of them measured a torn frame.
        await wait(30);

        // IS THE MACHINE WHERE THE PRESS NEEDS IT? Dispatching from anywhere else presses a
        // DIFFERENT arrow, or none, while this loop goes on to measure the pose and report it
        // under this arrow's name - which is the defect being fixed, not a smaller version of it.
        // So the answer is read back, and an arrow the bench could not stand in front of is NAMED
        // rather than claimed. One check covers every way that happens: an unreachable from-state,
        // a snap that threw, a machine that moved under the data (which `update()` must never do -
        // docs/STATE_MACHINE_SCHEMA.md §3, "Data never transitions"), and an interpreter with no
        // machine globals at all, which answers null and is treated as a state it could not reach.
        // Pressing blind is not the lesser evil here: blind IS the defect.
        const landed = readGroupState(machineWin, arrow.groupId);
        if (landed !== arrow.from) {
          unpressed.push({ arrow, restedAt: landed });
          continue;
        }

        machineWin.noacgDispatch?.(arrow.event);
        await wait(80);
        const branchLeaves = collectLeaves(win);
        const where = `after the "${arrow.event}" event from ${at}`;
        const bLap = overlapIssues(branchLeaves, exempt, where);
        errors.push(...bLap.errors);
        warnings.push(...bLap.warnings);
        const bFlow = overflowIssues(branchLeaves, exempt, win, { width, height }, where);
        errors.push(...bFlow.errors);
        warnings.push(...bFlow.warnings);
      }
      if (unpressed.length > 0) {
        warnings.push(
          issue(
            'bench-events-skipped',
            `The bench pressed ${arrows.length - unpressed.length} of this machine's ${arrows.length} ` +
              `operator arrows and left ${unpressed.length} unwalked: ${listArrows(unpressed)}. Nothing ` +
              'here measured the pose those presses produce - press them by hand before air, or give ' +
              'the graphic fewer arrows (a control surface an operator can actually read is smaller ' +
              'than this one).',
          ),
        );
      }
      if (arrows.length > 0) {
        phase = 'restore (default path)';
        machineWin.noacgSnap?.(null, { timers: false });
        call('play');
        for (let i = 0; i < presses; i++) call('next');
        await wait(SETTLE_MS);
      }
    }

    // ── Exit: the graphic must actually leave ────────────────────────────────────────
    phase = 'stop';
    call('stop');
    if (!(await waitFor(() => !onAir(), OFF_AIR_BUDGET_MS))) {
      errors.push(
        issue(
          'bench-hidden',
          'After stop() the graphic is still visible - the Out step must hide the root completely ' +
            '(fade/slide it out and end at opacity 0).',
        ),
      );
    }

    // ── Replay: play after stop must reach the same on-air state (the doctrine's own
    //    replay-safety promise, enforced) ───────────────────────────────────────────────
    phase = 'replay';
    call('play');
    if (!(await waitFor(onAir, ON_AIR_BUDGET_MS))) {
      errors.push(
        issue(
          'bench-replay',
          'play() after stop() does not bring the graphic back - reset transient state at the top of ' +
            'the entrance so the graphic replays cleanly (a leaked exit end-state is the usual cause).',
        ),
      );
    }

    // ── Stress: double-length text must survive (the #1 rejection reason, mechanical) ──
    phase = 'stress';
    call('update', JSON.stringify(fieldValues(template, 'stress')));
    await wait(120);
    for (let i = 0; i < presses; i++) {
      call('next');
      await wait(80);
    }
    await wait(80);
    const stressLeaves = collectLeaves(win);
    const stressLap = overlapIssues(stressLeaves, exempt, 'once every text value is doubled in length');
    errors.push(...stressLap.errors.map((e) => ({ ...e, rule: 'bench-stress' })));
    warnings.push(...stressLap.warnings.map((w) => ({ ...w, rule: 'bench-stress' })));
    const stressFlow = overflowIssues(
      stressLeaves,
      exempt,
      win,
      { width, height },
      'once every text value is doubled in length',
    );
    errors.push(...stressFlow.errors.map((e) => ({ ...e, rule: 'bench-stress' })));
    warnings.push(...stressFlow.warnings.map((w) => ({ ...w, rule: 'bench-stress' })));
    // A panel grown by long text is the likeliest way a graphic comes to cover its own line, so
    // this belongs in the stress pass as much as in the settled one - remapped to `bench-stress`
    // like its two neighbours, because what failed is the doubled value, not the design at rest.
    const stressHidden = occlusionIssues(win, stressLeaves, exempt,
      'once every text value is doubled in length');
    errors.push(...stressHidden.errors.map((e) => ({ ...e, rule: 'bench-stress' })));
    warnings.push(...stressHidden.warnings.map((w) => ({ ...w, rule: 'bench-stress' })));

    // Let any trailing async errors arrive before we detach.
    await wait(50);
  };

  try {
    await Promise.race([
      run(),
      wait(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS).then(() => {
        throw new Error('timed out');
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'timed out') {
      errors.push(
        issue(
          'bench-timeout',
          `The template did not finish its lifecycle within ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms - ` +
            'check for blocking work at load time (all setup must be event-driven, never a busy wait).',
        ),
      );
    } else {
      warnings.push(issue('bench-skipped', `The runtime bench could not run (${msg}) - static validation only.`));
    }
  } finally {
    window.removeEventListener('message', onMessage);
    iframe.remove();
  }

  // Async runtime errors (GSAP callbacks, delayed code) collected across all phases.
  for (const msg of [...new Set(asyncErrors)].slice(0, 3)) {
    errors.push(issue('bench-runtime', `Runtime error during ${msg}`));
  }

  return { ok: errors.length === 0, errors, warnings };
}
