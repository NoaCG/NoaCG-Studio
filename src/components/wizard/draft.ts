// The wizard's working state (the "draft"): every choice the user makes across the steps.
// null means "use the variant's tasteful default" — draftToOptions() maps the draft onto
// WizardOptions, and resolveOptions() (model/wizard.ts) fills the rest.

import type { AssetFile, SpxTemplate } from '../../model/types';
import {
  DEFAULT_GRAPHICS_FORMAT,
  projectFormatById,
  resolutionForSelection,
  type ProjectFormatSelection,
  type Resolution,
} from '../../model/projectFormat';
import { addPlacedLine } from '../../blocks/designLayout';
import { getCssVariable, setCssVariable } from '../../blocks/cssVars';
import { FONTS, fontStack } from '../../model/fonts';
import { applyPlacedFieldSpecs } from '../../blocks/designFields';
import { anyPresetById, type AnimPhase } from '../../blocks/presetRegistry';
import { parseAnimData } from '../../blocks/animData';
import { writeAnimData } from '../../templates/shared/animRuntime';
import { applyPresetData, presetDonor } from '../../blocks/presetApply';
import {
  applyMotionPreset,
  motionPresetById,
  motionTargets,
  type MotionPick,
  type MotionPresetId,
} from '../../blocks/motionPresets';
import { resolveEasing } from '../../model/easings';
import type {
  AnimPresetId,
  AnimSpeed,
  DesignArt,
  DesignSvgBehaviour,
  DesignSvgGrowth,
  DesignSvgHidden,
  ExtraFieldSpec,
  LineSpec,
  Palette,
  AssemblerId,
  TemplateVariant,
  WizardOptions,
  Zone9,
} from '../../model/wizard';
import { PALETTES, paletteById } from '../../model/wizard';
import type { EasingId } from '../../model/easings';
import { ensureFontFace, fontByStack, type CustomFont } from '../../model/fonts';
import type { EraseRect, RegionInk } from '../../assets/eraseRegion';
import { looksNumeric, SVG_CANDIDATE_ATTR, type SvgImportResult } from '../../assets/svgImport';
import { SCORE_MAX_ROWS } from '../../templates/behaviours/score';
import type { ProjectLegibility } from '../../model/designRules';

/** ONE applied baked-text erase: the marked rectangle (in the artwork's SOURCE pixels) and
 *  the sampling verdict it ran with. Its measured ink seeds a real text field per LINE it
 *  held, at create. */
export interface DesignEraseState {
  rect: EraseRect;
  /** Whether every filled area had a clean background model — flat, or a smooth gradient
   *  (assets/eraseRegion FLAT_BG_TOLERANCE). */
  uniform: boolean;
  maxDeviation: number;
  /** True when any area was rebuilt with a fitted gradient rather than one colour. */
  gradient?: boolean;
  /** The applied fill colour — the seeded field contrasts against exactly this. */
  fill: { r: number; g: number; b: number; a: number };
  /** Where the erased text ACTUALLY sat, measured from the pixels (SOURCE px). The seeded
   *  field is built from this rather than from the loose rectangle the user drew. Absent on
   *  a region that held only background — and on drafts made before it was measured. */
  ink?: RegionInk;
  /** Per-text-area verdicts when the region held several (assets/eraseRegion): how many of
   *  them had a clean background model. Carried so a PARTIAL success stays reported per area
   *  after the fill is applied, not flattened into one "average fill". */
  segments?: { clean: number; total: number };
}

/**
 * ONE editable text field placed on the imported artwork in the wizard's Text step
 * (docs/IMPORT_MVP.md). Coordinates are DESIGN px (the fitted artwork space addPlacedLine
 * speaks); the step's canvas maps pointer positions into it. At create (and in the live
 * preview, which is the same build) each spec becomes a REAL placed field through the exact
 * transforms the editor uses — addPlacedLine + setLineTextStyle + setLineFit — so the
 * wizard's placement, the editor, the preview, and the export can never disagree.
 */
export interface DesignFieldSpec {
  /** Draft-local id (selection + list keys); the real fN id is minted at build. */
  id: string;
  /** The operator-facing field name ("Name", "Title") — the control panel's label. */
  title: string;
  /** Representative preview text, shown on the artwork and seeded as the field default. */
  text: string;
  /** The text anchor in design px (which edge depends on `align`, addPlacedLine's idiom). */
  x: number;
  y: number;
  /** 'point' = click-placed free line; 'area' = dragged box whose width wraps the text;
   *  'image' = a dragged PICTURE SLOT the operator drops a file into. */
  kind: 'point' | 'area' | 'image';
  /** The box's slot width in design px (area and image). */
  width?: number;
  /** The image slot's height in design px (image only). */
  height?: number;
  /** How a long value meets the slot; absent = 'wrap', the dragged box's own behaviour on
   *  RASTER artwork. An imported SVG asks for 'shrink' instead: that design runs ONE fit and
   *  the ladder measures a `data-fit="shrink"` line (docs/SVG_IMPORT_PLAN.md §6b), so a
   *  wrapping line there would be the one field the operator's too-long warning cannot see. */
  fit?: 'wrap' | 'shrink';
  /** A bundled font id, or null = the design's default font (--font-heading). */
  fontId: string | null;
  fontSize: number;
  weight: number | null;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number | null;
  /** Letter-spacing in design px; null = normal. */
  letterSpacing: number | null;
}

/** One detected SVG text layer in the mapping step (docs/SVG_IMPORT_PLAN.md §2). */
export interface SvgFieldDraft {
  /** The candidate's marker id in the sanitized markup (assets/svgImport.ts). */
  candidateId: string;
  /** Whether this layer becomes an operator field. */
  on: boolean;
  /** Operator-facing field label (editable; prefilled from the layer name). */
  title: string;
  /** The field's sample/default value (editable; prefilled from the layer's own text). */
  sample: string;
  /** A numeric-looking sample emits ftype "number". */
  numeric: boolean;
  /** A clock-shaped sample ("10:00") — the row then offers the countdown kind. */
  clock: boolean;
  /** How the layer binds: plain text (the default), or a COUNTDOWN — the node becomes the
   *  clock display and the operator field its length in minutes (plan P2 "clock ftype").
   *  One countdown per graphic: the shared clock runtime drives one display. */
  kind: 'text' | 'countdown';
  /**
   * This row's countdown kind was set FOR the author by `armTimerClock`, not by them.
   *
   * Draft-only bookkeeping - nothing downstream reads it, and `draftToOptions` never carries it
   * into the graphic. It exists so leaving the timer behaviour can undo exactly what picking it
   * did, and nothing an author chose themselves. Absent reads as false, so a draft from before
   * this existed behaves exactly as it did.
   */
  armedByTimer?: boolean;
  /**
   * WHAT UNTICKING THIS ROW MEANS FOR THE WORDS IT LEAVES BEHIND (owner walk, 2026-09-02:
   * "the logical thing here is to have a prompt that asks, what should we do?").
   *
   * 'keep' leaves the layer exactly as the designer drew it, unretypeable - the only thing
   * unticking used to mean, silently, which he found strange. 'remove' takes it off the
   * artwork. Never guessed: the step asks, and he was explicit that removal must not be the
   * automatic answer - "what if it's there for a reason anyway?" Absent means 'keep', so a
   * row that was never unticked and a draft from before this existed both read the same.
   */
  whenOff?: 'keep' | 'remove';
}

/**
 * The BEHAVIOUR the author bound to imported artwork, as the mapping step holds it
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md). Everything is a candidate id rather than a field index,
 * because the step lets rows be ticked and unticked underneath — indices are resolved once, at
 * `draftToOptions`, when the field order is finally known.
 *
 * Four members today: the QUIZ (the 2026-08-22 pilot), the POLL (plan §12), the SCORE tracker
 * (docs/backlog/scoreboard-behaviour.md) and the TIMER (plan §13). The discriminant was already
 * where it belonged, which is the whole reason adding the second, third and fourth ones touched
 * nothing above this type.
 */
export type SvgBehaviourDraft = SvgQuizDraft | SvgPollDraft | SvgScoreDraft | SvgTimerDraft;

export interface SvgQuizDraft {
  kind: 'quiz';
  /** Candidate id of the question text layer. Empty = not chosen. */
  question: string;
  /** Candidate ids of the answer text layers, in row order — A, B, C, … */
  answers: string[];
  /** Per answer row (parallel to `answers`), the DRAWN states as group candidate ids. Empty
   *  means the designer drew nothing for that moment, which is a valid board. */
  rows: { selected: string; correct: string; wrong: string }[];
  /** The board-level "locked in" drawing, as a group candidate id. */
  locked: string;
}

/**
 * The POLL binding, as the mapping step holds it (plan §12): which drawn layers a live audience
 * vote paints into.
 *
 * NOTHING HERE IS AN OPERATOR FIELD, and that is the difference from the quiz above. A quiz's
 * answers are text somebody types, so they are fields; a poll's question, options and figures all
 * come from the round the operator opened, so the artwork's layers are display targets and the
 * content rides three behaviour-owned fields instead. That is also why picking a layer here
 * UNTICKS it as a field in the step — two writers on one node is a graphic whose operator can see
 * their typing being ignored.
 */
export interface SvgPollDraft {
  kind: 'poll';
  /** Candidate id of the question text layer. Empty = not chosen. */
  question: string;
  /** One row per option, in the order the artwork draws them. */
  rows: SvgPollRowDraft[];
  /** Candidate id of the drawn "1,204 votes" line. */
  total: string;
  /** Group candidate id of the VOTE NOW badge — a drawn state, shown while voting is open. */
  badge: string;
}

/** One option row of a poll board, as the step holds it. Every member may be empty: a board with
 *  labels and no bars still reports the vote, and one with bars and no figures still shows it. */
export interface SvgPollRowDraft {
  /** Text candidate id of the option's label. */
  label: string;
  /** Shape or group candidate id of the bar whose length is this option's share. */
  bar: string;
  /** Text candidate id of the figure beside the bar. */
  value: string;
  /** Group candidate id of the winner mark for this row. */
  winner: string;
}

/** An empty option row — one place, so the step's "add a row" and the proposal agree. */
export function emptyPollRow(): SvgPollRowDraft {
  return { label: '', bar: '', value: '', winner: '' };
}

/**
 * The SCORE binding, as the mapping step holds it (docs/backlog/scoreboard-behaviour.md): which
 * text layers are each team's name and figure, and which drawn layer flashes when they score.
 *
 * TWO OR MORE TEAMS, discovered from the artwork. A row is a name and a score; the count is how
 * many the designer drew, capped where the poll caps its options.
 *
 * It is the MIXED binding, and the only one so far. The names and the figures stay operator
 * fields — a score board is a graphic somebody types into and bumps — so unlike the poll, picking
 * a layer here does not take it off the field list. The flashes are drawn moments, so they are
 * group candidate ids, exactly like the quiz's.
 */
export interface SvgScoreDraft {
  kind: 'score';
  /** One row per team, in the order the artwork draws them. */
  rows: SvgScoreRowDraft[];
  /** Group candidate id of the FULL TIME drawing — a drawn state, like the quiz's lock. */
  final: string;
}

/** One team's row of a score board, as the step holds it. */
export interface SvgScoreRowDraft {
  /** Text candidate id of the team's name. */
  name: string;
  /** Text candidate id of the team's figure. */
  score: string;
  /** Group or shape candidate id of the flash this team's point plays. */
  flash: string;
}

/** An empty team row — one place, so the step's team-count picker and the proposal agree. */
export function emptyScoreRow(): SvgScoreRowDraft {
  return { name: '', score: '', flash: '' };
}

/**
 * The TIMER binding, as the mapping step holds it (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13): which
 * drawn layers a countdown shows at each moment.
 *
 * IT HOLDS NO CLOCK, AND THAT IS THE POINT. The clock is chosen one section higher up, in the
 * layer list, by setting a clock-shaped row's kind to Countdown — which is what makes that node
 * the readout and its field the length in minutes. Asking again here would be a second answer to
 * one question, and the two could then disagree. `timerBindingGaps` reads the row instead.
 *
 * Every member may be empty. A card with nothing drawn still starts, holds, resumes and resets —
 * the beginner path all three earlier behaviours keep.
 */
export interface SvgTimerDraft {
  kind: 'timer';
  /** Shape or group candidate id of the bar whose length is the time left. Drawn FULL. */
  bar: string;
  /** Group candidate id of the look the last seconds wear. */
  warning: string;
  /** Group candidate id of the mark that says the clock is being held. */
  paused: string;
  /** Group candidate id of the plate for the moment it runs out. */
  expired: string;
}

/** An empty timer binding — one place, so the step's seed and the proposal agree. */
export function emptyTimerDraft(): SvgTimerDraft {
  return { kind: 'timer', bar: '', warning: '', paused: '', expired: '' };
}

/**
 * ARM THE CLOCK a countdown needs, if the artwork has exactly one and nothing is armed yet.
 *
 * The one thing a timer behaviour cannot run without is a layer bound as a COUNTDOWN, and that
 * choice lives in the field list rather than in the behaviour's own pickers — so both doors into
 * the behaviour have to make it, or one of them hands the reader a binding that reports a gap the
 * moment it appears. This is that rule, written once: the DROP applies it to what
 * `proposeSvgBehaviour` proposed, and the mapping step's own picker applies it when somebody
 * chooses Countdown by hand.
 *
 * TWO CONDITIONS, AND EACH REFUSES RATHER THAN GUESSES.
 *
 *  - **Nothing is armed yet.** A ticked countdown row is an answer the author already gave, and a
 *    graphic has one clock; theirs is the one that counts.
 *  - **The artwork draws exactly ONE clock-shaped layer.** Two is where guessing starts, and the
 *    guess would be wrong on the ordinary case rather than on an exotic one: a break card reading
 *    "Back at 22:40" above a 5:00 counter draws the time of day FIRST, so "the first one in
 *    document order" would make the wall clock the ticking readout and freeze the counter. With
 *    two, nothing is armed and `timerBindingGaps` asks - which is the same refusal every proposal
 *    here makes, for the same reason.
 *
 * IT MARKS WHAT IT ARMED (`armedByTimer`), so `disarmTimerClock` can undo exactly this and
 * nothing else.
 */
export function armTimerClock(fields: SvgFieldDraft[], behaviour: SvgBehaviourDraft | null): SvgFieldDraft[] {
  if (behaviour?.kind !== 'timer') return fields;
  if (fields.some((f) => f.on && f.kind === 'countdown')) return fields;
  const clocks = fields.filter((f) => f.on && f.clock);
  if (clocks.length !== 1) return fields;
  const only = clocks[0];
  return fields.map((f) =>
    f.candidateId === only.candidateId ? { ...f, kind: 'countdown' as const, armedByTimer: true } : f,
  );
}

/**
 * PUT BACK what `armTimerClock` armed, when the author leaves the countdown behind.
 *
 * The arming has to be symmetric or it is a trap. A designer who picks Countdown to see what it
 * offers, changes their mind back to "Nothing. It comes on and off." and ships would otherwise
 * ship a graphic whose clock layer ticks down on air and whose text field has silently become a
 * length in minutes - because nothing downstream reads the BEHAVIOUR to decide that, it reads the
 * row (`draftToOptions`, then `countdownIndex` in importedDesign/svg.ts).
 *
 * ONLY EVER A ROW THIS ARMED. That is what the marker is for: an author who chose Countdown
 * themselves before picking the behaviour keeps their choice, because taking it away would be the
 * same silent overrule in the other direction.
 */
export function disarmTimerClock(fields: SvgFieldDraft[]): SvgFieldDraft[] {
  const armed = (f: SvgFieldDraft): boolean => f.armedByTimer === true;
  if (!fields.some(armed)) return fields;
  // Still a countdown, or the author has since said otherwise on the row itself - and their answer
  // stands either way. The marker is cleared regardless, so a second pass has nothing to undo.
  return fields.map((f) =>
    armed(f) ? { ...f, kind: f.kind === 'countdown' ? ('text' as const) : f.kind, armedByTimer: false } : f,
  );
}

/**
 * The TEXT layers a bound poll writes into — the ones that must not also be operator fields.
 *
 * One function, read by the build (which drops them from the field list) and by the mapping step
 * (which says so out loud). Bars, winner marks and the badge are not here: they are shapes and
 * groups, and a shape was never a text field to begin with.
 */
export function pollDrivenLayers(behaviour: SvgBehaviourDraft | null): Set<string> {
  if (behaviour?.kind !== 'poll') return new Set();
  return new Set(
    [behaviour.question, behaviour.total, ...behaviour.rows.flatMap((r) => [r.label, r.value])].filter(Boolean),
  );
}

/** One `<image>` layer offered as a swappable picture field (docs/SVG_IMPORT_PLAN.md P2). */
export interface SvgImageDraft {
  candidateId: string;
  /** OFF by default — a picture is usually the artwork, not a slot. */
  on: boolean;
  title: string;
}

/** One group of glyph shapes offered as OUTLINED TEXT (docs/SVG_IMPORT_PLAN.md §1.A): ON
 *  hides the group and places an HTML field over its measured box — the raster flow's
 *  recovery, because outlines carry no type to bind. */
export interface SvgOutlineDraft {
  candidateId: string;
  /** OFF by default — a logo is also a group of paths; only the user can tell. */
  on: boolean;
  title: string;
  /** The field's starting text. Outlines carry no text, so it starts as the label. */
  sample: string;
  /** The shapes' box in DESIGN px (the artwork's own space), measured by the mapping step
   *  on its rendered artwork — DOMParser has no layout. `capHeight` is the cap-top-to-
   *  baseline run read off the glyph shapes (most glyph bottoms sit on the baseline; the
   *  tallest top is the cap/ascender line), which is what a font size is derived from.
   *  null until the step has measured it. */
  box: { x: number; y: number; width: number; height: number; capHeight: number } | null;
  /** The shapes' own fill colour, read off the rendered group — so the replacement text
   *  arrives in the colour the outlined text was. null = the design default. */
  color: string | null;
  /** Does the measured shape cluster READ as a line of type (several glyphs on one baseline in
   *  a wide box) rather than as a logo or an icon? Ranks the rows in the mapping step and
   *  badges the rest; it never hides one. null until measured. */
  looksLikeText: boolean | null;
}

/**
 * THE HUG (docs/SVG_IMPORT_PLAN.md §3), as the mapping step holds it: does one rectangle grow
 * so a longer value fits at full size, and which rectangle is it?
 *
 * **The ordinary lower third works with NOTHING chosen** (owner, 2026-08-25 - docs/GOALS.md
 * NOW goal 5: "of course that text should be able to become longer and the background should
 * grow with it"). The mapping step MEASURES the artwork and turns growth on by itself where
 * the geometry is unambiguous - one banner-shaped rectangle with stacked, start-anchored text
 * drawn inside it and room to grow before the safe margin. Where it is genuinely ambiguous
 * (side-by-side text on one plate, a quiz behaviour, a full-frame backplate) the default stays
 * shrink and the step asks, exactly as before. The earlier ruling that ARTBOARD SIZE cannot
 * separate a banner from a board still stands - the shipped lower third is a full-frame
 * artboard and the shipped scorebug a small floating object - which is why the rule below
 * measures containment and arrangement, never size against the frame.
 */
/**
 * The four rungs of the too-long ladder, as a person picks between them. `shrink` is the
 * ABSENCE of a growth rule rather than a fifth behaviour: text always wraps into the room its
 * own box offers and always shrinks last, so the only thing this chooses is whether the plate
 * behind the text may grow, and which way (owner's order, 2026-08-26: wider, then the next
 * line, and smaller last "because that changes the design more").
 *
 * Declared here rather than in the step because a `perPanel` answer is DRAFT state now.
 */
export type SvgStretchMode = 'grow-x' | 'grow-xy' | 'grow-y' | 'shrink';

export interface SvgStretchDraft {
  /** ON = the picked rectangle grows with its text; OFF = today's behaviour, nothing moves. */
  on: boolean;
  /** True once the AUTHOR has touched any growth control (mode, panel, a canvas gesture, a
   *  follower edit). While false the value is the measured proposal and the step may
   *  re-derive it as rows are ticked or a behaviour is attached; an authored answer is never
   *  recomputed. Session state only - the emitted graphic carries the growth rule, not this. */
  authored?: boolean;
  /** Candidate id ("sN") of the rectangle that grows. Null = none picked, which reads as off. */
  shapeId: string | null;
  /** Which way it grows (docs/SVG_IMPORT_PLAN.md §6c). 'x' widens it, so the type stays the
   *  size it was drawn - the lower third's banner. 'y' makes it taller, so a long value WRAPS
   *  into new height instead of shrinking - what a board or a card wants, where the panel has
   *  room below it and the type may not get smaller. 'xy' is the LADDER (owner, 2026-08-26:
   *  "first I want it to get wider, and then it should go to the next line") - both, in that
   *  order, because the runtime already spends width before it wraps. Absent = 'x', the hug as
   *  it shipped. */
  axis?: 'x' | 'y' | 'xy';
  /**
   * WHAT TRAVELS with the growing element (plan §6c). Absent/null = the author has not touched
   * the set, so the runtime's own geometric derivation stands and nothing is emitted - which is
   * exactly the behaviour the horizontal hug has always had. An ARRAY is the author's own
   * answer and is emitted verbatim, even when empty ("nothing travels" is a decision too).
   *
   * The first edit MATERIALIZES the whole proposal into this list, the idiom the node editor
   * already uses for a derived machine (docs/STATE_MACHINE_SCHEMA.md §6a): behaviourally a
   * no-op at the moment it happens, and from then on what the reader SEES is what ships.
   */
  followers?: SvgFollowerDraft[] | null;
  /**
   * WHERE ONE TEXT LAYER ANSWERS THE TOO-LONG QUESTION DIFFERENTLY (owner walk, 2026-09-03:
   * "What if you want it to react differently between the question and the answer? What's our
   * solution for that?").
   *
   * Absent or empty means every layer inherits the graphic-wide answer above, which is the
   * shape this had before overrides existed and the bytes an untouched import still emits.
   *
   * KEYED BY THE PLATE, PRESENTED PER LAYER. Growth is something a rectangle does, and the
   * runtime grows it for whatever text sits inside it - so two lines sharing one plate cannot
   * be given opposite answers, and a map keyed by layer would let a reader ask for that and
   * then silently pick one. The step lists a row per bound text layer and names the plate
   * beside it, so lines sharing a plate visibly share an answer.
   *
   * A key whose shape the current file no longer has is dropped on emit, exactly as the
   * graphic-wide `shapeId` is. An answer whose LAYER was merely unticked is KEPT: the plate has
   * no bound line to grow so the rule grants zero either way, and ticking the row back on brings
   * the answer back with it. Losing a ladder choice to an unrelated edit is the exact complaint
   * this feature was written under (owner walk, 2026-09-03, on the answer count).
   */
  perPanel?: Record<string, SvgStretchMode>;
}

/** Does this marker still name something in the file? A follower the reader declared and then
 *  dropped a NEW file over must not travel into the graphic as a rule pointing at nothing. */
export function svgCandidateExists(draft: WizardDraft, candidateId: string): boolean {
  const s = draft.designSvg;
  if (!s) return false;
  return [...s.candidates, ...s.images, ...s.outlines, ...s.groups, ...s.shapes].some(
    (c) => c.id === candidateId,
  );
}

/**
 * THE LAYERS THE AUTHOR TOOK OFF THE ARTWORK (owner walk, 2026-09-02).
 *
 * Only a row that is BOTH off and answered 'remove' - the step asks on every untick and keeping
 * the words is the safe default, so this is empty on every graphic where nobody said otherwise.
 * `undefined` rather than `[]` in that case, because an untouched import has to emit the bytes
 * it emitted before the question was ever asked.
 */
function hiddenSvgLayers(draft: WizardDraft): DesignSvgHidden[] | undefined {
  const gone = draft.svgFields
    .filter((f) => !f.on && f.whenOff === 'remove')
    .map((f) => ({ candidateId: f.candidateId }));
  return gone.length > 0 ? gone : undefined;
}

/**
 * THE GROWTH ROWS a draft emits (docs/SVG_IMPORT_PLAN.md §6c).
 *
 * One row per PLATE per AXIS, which is what makes the LADDER expressible without a second
 * format: the owner's order is wider, then wrap, then shrink, and the runtime already spends
 * width before the fit and height after it - so "both" is two ordinary rows on one element
 * rather than a new kind of rule.
 *
 * MORE THAN ONE PLATE CAN ANSWER DIFFERENTLY (owner walk, 2026-09-03, on his quiz board: "What
 * if you want it to react differently between the question and the answer?"). The graphic-wide
 * answer is the default, `svgStretch.perPanel` overrides it plate by plate, and the runtime has
 * always taken a LIST of rules - so this is more rows in a format that already held them, not a
 * new shape. Nothing is emitted where no plate ends up with a rule, which is every board, every
 * scorebug, and every import from before any of this existed.
 */
function svgGrowthOptions(draft: WizardDraft): DesignSvgGrowth[] | undefined {
  const shapes = draft.designSvg?.shapes ?? [];
  if (shapes.length === 0) return undefined;
  const graphicWide = draft.svgStretch.on ? draft.svgStretch.shapeId : null;
  // WHICH WAY EACH PLATE GROWS, one entry per plate. The graphic-wide answer writes first and a
  // per-plate override writes over it, which is what makes the section's promise true: the
  // dropdown at the top is the default every layer inherits until somebody overrides it.
  const axesOf = new Map<string, ('x' | 'y')[]>();
  const apply = (candidateId: string, mode: SvgStretchMode) => {
    if (!shapes.some((s) => s.id === candidateId)) return;
    // Shrink is the ABSENCE of a rule, so an override picking it takes the plate's rule away
    // rather than adding a fourth kind of row.
    if (mode === 'shrink') axesOf.delete(candidateId);
    else axesOf.set(candidateId, mode === 'grow-xy' ? ['x', 'y'] : mode === 'grow-y' ? ['y'] : ['x']);
  };
  if (graphicWide) apply(graphicWide, modeOfAxis(draft.svgStretch.axis));
  for (const [candidateId, mode] of Object.entries(draft.svgStretch.perPanel ?? {})) {
    apply(candidateId, mode);
  }
  if (axesOf.size === 0) return undefined;
  // Only a set the author actually EDITED travels as data. Untouched, the field is left off and
  // the runtime derives it, which is the behaviour every hugging graphic already shipped with.
  const followers = draft.svgStretch.followers
    ? {
        followers: draft.svgStretch.followers.filter((f) => svgCandidateExists(draft, f.candidateId)),
      }
    : {};
  // Emitted in the INVENTORY'S order rather than the map's, so the bytes depend on the artwork
  // and on the answers, never on which control the reader happened to touch first.
  // The declared FOLLOWERS ride exactly ONE row: the graphic-wide plate's, on the axis the step
  // measured them against (`growAxis` - the downward edge only where the plate grows downward
  // and nothing else, else the sideways one). A plate carrying BOTH rows derives its downward
  // travellers itself, which is what a caption under a panel wants either way.
  // Where an override has since changed that plate's AXIS, the set rides whatever row the plate
  // still has: it was measured against the PLATE, and dropping it because the axis moved would
  // stop a declared traveller travelling without saying so. Where an override has taken that
  // plate's rule away entirely, nothing carries the set and none is emitted - the plate does not
  // move, so there is nothing left for anything to travel with.
  const wideAxes = (graphicWide ? axesOf.get(graphicWide) : null) ?? [];
  const preferred = draft.svgStretch.axis === 'y' ? 'y' : 'x';
  const carrier = wideAxes.includes(preferred) ? preferred : wideAxes[0];
  const rows: DesignSvgGrowth[] = [];
  for (const shape of shapes) {
    for (const axis of axesOf.get(shape.id) ?? []) {
      const carries = shape.id === graphicWide && axis === carrier;
      rows.push({ candidateId: shape.id, axis, ...(carries ? followers : {}) });
    }
  }
  return rows;
}

/** The ladder rung a stored axis means. The draft has always held the axis; the rung is how a
 *  person picks, and a per-plate override is stored as the rung it was picked as. */
function modeOfAxis(axis: 'x' | 'y' | 'xy' | undefined): SvgStretchMode {
  return axis === 'y' ? 'grow-y' : axis === 'xy' ? 'grow-xy' : 'grow-x';
}

/** One layer declared to travel with a growing element. */
export interface SvgFollowerDraft {
  /** The layer's `data-noacg-candidate` marker. */
  candidateId: string;
  /** 'move' translates it by the growth; 'grow' stretches it by the same amount instead. */
  mode: 'move' | 'grow';
}

/** How one font family the SVG references resolves (plan §4). */
export interface SvgFontDraft {
  /** The family name the artwork asks for, verbatim — what every emitted `@font-face` is
   *  declared as, whatever file ends up behind it. */
  family: string;
  /** The same face as a real family name, for the bundled library and Google Fonts
   *  (assets/svgImport.ts `fontLookup`: "Archivo-Bold" looks up as "Archivo" at 700). */
  lookup: string;
  /** The weight the name implied, or null. Used when fetching, never when declaring. */
  weight: number | null;
  /** A bundled face whose family name matches. */
  fontId: string | null;
  /** A fetched (Google) or uploaded face — embedded like any custom font. */
  customFont: CustomFont | null;
}

export interface WizardDraft {
  /** What the finished graphic is CALLED (the Finish step). Empty = fall back to the design's
   *  own catalog name, which is what every project was called before this step existed. It
   *  matters most on the export branch: the name slugs the zip AND, for the SPX and CasparCG
   *  targets, the template FOLDER and FILE inside it — the name the operator reads in the
   *  playout server. Shipping `hairline/hairline.html` is the reason this field exists. */
  name: string;
  category: AssemblerId | null;
  variantId: string | null;
  aspectId: ProjectFormatSelection['aspectId'];
  resolutionId: ProjectFormatSelection['resolutionId'];
  fps: number;
  /** Session-only signal used when switching into video: untouched graphics defaults become
   * the video defaults, while an explicit choice is carried across creation routes. */
  formatTouched: boolean;
  lines: LineSpec[];
  /**
   * Extra definition-only fields. The wizard UI no longer offers these (the generated
   * design can't adapt to them yet — fields are added post-create via the Data tab + AI
   * editing), but the data model stays so WizardOptions.extraFields and future custom
   * fields keep working. Always [] from the wizard.
   */
  extraFields: ExtraFieldSpec[];
  /**
   * The graphic TYPE's setup values, by its own logical field keys (`{ correctAnswer: 'C' }`).
   * What a design SAYS is `lines`; this is the rest of what it is - which answer is correct,
   * the club colours, how long the countdown runs. Only a type-compiled design has any (see
   * `setupFields`), and every value is clamped at compile, so an untouched draft is `{}` and
   * changes nothing.
   */
  content: Record<string, string>;
  /**
   * Answers to the picked design's declared `styleChoices` (model/wizard.ts), by key. A design
   * decision the DESIGN owns and the user picks - cr01's role-or-name emphasis is the first.
   * Untouched is `{}` and changes nothing, and an answer the picked design does not offer is
   * dropped at resolve, so switching designs mid-wizard cannot carry a stale one across.
   */
  styleChoices: Record<string, string>;
  paletteId: string | null;
  /** User-defined colors (takes precedence over paletteId when set). */
  customPalette: Palette | null;
  /** Direct `:root` variable overrides beyond the four palette roles - the wizard's "All
   *  design colors" rows (docs/GOALS_ARCHIVE.md "Student release" step 5). Applied AFTER the variant
   *  builds, through the same setCssVariable patch the Style panel writes post-create, so
   *  every design color is editable without the editor. Keyed by var name (no `--`). */
  cssVarOverrides: Record<string, string>;
  /** 'custom' selects the imported font; a bundled id or null otherwise. */
  fontId: string | null;
  /** The user's imported font, kept even while a bundled font is selected. */
  customFont: CustomFont | null;
  sizeScale: number;
  /** Text-only size multiplier (--type-scale) on top of the whole-graphic sizeScale. */
  typeScale: number;
  zone: Zone9 | null;
  nudge: { x: number; y: number };
  animation: {
    /** The entrance preset (and the exit too while outPresetId is null). */
    presetId: AnimPresetId | null;
    /** A different exit preset, or null = the exit matches the entrance. */
    outPresetId: AnimPresetId | null;
    /** What a preset click changes: both phases (default), entrance, or exit. */
    direction: AnimPhase;
    /** The UNIVERSAL in/out motion (blocks/motionPresets.ts), per phase - the imported-design
     *  flow's Animation step picks these instead of the category's four whole-unit presets.
     *  null = undecided: the phase takes the mapped whole-unit default (see universalPick), or
     *  keeps its category preset when that one is not a whole-unit motion (the SVG layer
     *  stagger). Written at build through the same engine the control page uses after. */
    motionIn: MotionPresetId | null;
    motionOut: MotionPresetId | null;
    speed: AnimSpeed;
    easing: EasingId;
    /** SPX multi-step reveal. `null` = the user has not decided, so the picked design's own
     *  answer stands (`TemplateVariant.defaultSteps`) — the same "undecided" shape `zone` and
     *  `logoEnabled` use. A process card or a checklist is stepped by construction; a name
     *  strap is not, and a hard `false` here would have overridden every design that knows. */
    steps: boolean | null;
  };
  /** Images dropped in via the "Import graphics" entry (stored as data-URL assets). */
  importedImages: AssetFile[];
  /** Which imported image goes into the variant's logo slot (relative assets/ path). */
  logoAssetPath: string | null;
  /** The Fields step's logo toggle on an 'optional'-logo variant; null = undecided
   *  (falls back to "a logo image was provided"). */
  logoEnabled: boolean | null;
  /** The artwork the graphic IS, in the Import Graphic flow (measured at import). */
  designArt: DesignArt | null;
  /** The untouched upload, kept so an erase re-runs from clean pixels (never compounds). */
  designOriginal: AssetFile | null;
  /** The applied baked-text erases (Prepare step), in the order they were marked; [] = none.
   *  A design usually has more than one piece of baked text — a name AND a title, a scoreline
   *  AND a clock — so each marked region is its own erase, and each seeds its own field(s). */
  designErases: DesignEraseState[];
  /** The user's declared answer that the artwork's baked text is INTENTIONAL (a wordmark, a
   *  deliberate slogan) — or that there is none. It lives on the draft rather than in the
   *  Prepare step's state so the answer survives leaving the step: Prepare stops re-proposing
   *  and the Text step's still-baked note stands down. Cleared by a fresh drop and by
   *  answering "yes, mark it". */
  designKeepBakedText: boolean;
  /** The Text step's placed fields (Import Graphic). Ordered; each becomes a real placed
   *  field at build, AFTER the erase-seeded ones. */
  designFields: DesignFieldSpec[];
  /** The imported SVG (the SVG road, docs/SVG_IMPORT_PLAN.md): sanitized + inventoried at
   *  drop, width/height already fitted to the frame. null outside svg mode. */
  designSvg: SvgImportResult | null;
  /** The mapping step's working state, one row per detected text layer: which become
   *  operator fields, and their edited labels/samples. Initialized from the inventory
   *  (all ON — or only the `f:`-prefixed ones when any layer opted in by name). */
  svgFields: SvgFieldDraft[];
  /** The mapping step's picture rows, one per `<image>` layer: OFF by default (most
   *  pictures inside a design are the artwork, not a slot), ON = a filelist field whose
   *  value swaps the node's href. */
  svgImages: SvgImageDraft[];
  /** The mapping step's outlined-text rows, one per glyph-shaped group: OFF by default,
   *  ON = the group is hidden and a placed HTML field stands in for it (plan §1.A). */
  svgOutlines: SvgOutlineDraft[];
  /** The BEHAVIOUR bound to the artwork, or null for the ordinary in/out graphic the importer
   *  has always produced. Proposed from the layer names at drop, and freely re-picked. */
  svgBehaviour: SvgBehaviourDraft | null;
  /** Does the graphic HUG its text — one rectangle widening so a longer value fits at full
   *  size (plan §3)? Off is the graphic that declares a STAGE, which is every board and
   *  every scorebug; on is the lower third whose banner is as wide as the name on it. */
  svgStretch: SvgStretchDraft;
  /** Per referenced font family: how it resolves. Bundled faces auto-match by name at drop;
   *  the mapping step offers the Google fetch or an upload for the rest. An entry with
   *  neither source is UNRESOLVED — created anyway, with a warning. */
  svgFonts: SvgFontDraft[];
  /** The project's legibility settings (model/designRules.ts): viewing target + the two
   *  size-floor toggles. PROJECT METADATA, never template CSS — draftToOptions does not read
   *  it; the create paths land it on the store, which persists it with the project. An
   *  untouched draft is `{}` and serializes to nothing. */
  legibility: ProjectLegibility;
}

/** A draft update: top-level fields replace; `animation` and `nudge` deep-merge. */
export type DraftPatch = Partial<Omit<WizardDraft, 'animation' | 'nudge'>> & {
  animation?: Partial<WizardDraft['animation']>;
  nudge?: Partial<WizardDraft['nudge']>;
};

/** Merge a patch into the draft (nested animation/nudge merge instead of replace). */
export function mergeDraft(draft: WizardDraft, patch: DraftPatch): WizardDraft {
  return {
    ...draft,
    ...patch,
    animation: patch.animation ? { ...draft.animation, ...patch.animation } : draft.animation,
    nudge: patch.nudge ? { ...draft.nudge, ...patch.nudge } : draft.nudge,
  };
}

export function initialDraft(): WizardDraft {
  return {
    name: '',
    category: null,
    variantId: null,
    ...DEFAULT_GRAPHICS_FORMAT,
    formatTouched: false,
    lines: [],
    extraFields: [],
    content: {},
    styleChoices: {},
    paletteId: null,
    customPalette: null,
    cssVarOverrides: {},
    fontId: null,
    customFont: null,
    sizeScale: 1,
    typeScale: 1,
    zone: null,
    nudge: { x: 0, y: 0 },
    animation: { presetId: null, outPresetId: null, direction: 'both', motionIn: null, motionOut: null, speed: 1, easing: 'auto', steps: null },
    importedImages: [],
    logoAssetPath: null,
    logoEnabled: null,
    designArt: null,
    designOriginal: null,
    designErases: [],
    designKeepBakedText: false,
    designFields: [],
    designSvg: null,
    svgFields: [],
    svgImages: [],
    svgOutlines: [],
    svgBehaviour: null,
    svgStretch: { on: false, shapeId: null },
    svgFonts: [],
    legibility: {},
  };
}

export function draftResolution(draft: WizardDraft): Resolution {
  return resolutionForSelection(draftFormatSelection(draft));
}

export function draftFormatSelection(draft: WizardDraft): ProjectFormatSelection {
  const preset = projectFormatById(draft.resolutionId);
  if (preset?.aspectId === draft.aspectId) {
    return { aspectId: draft.aspectId, resolutionId: preset.id, fps: draft.fps };
  }
  return DEFAULT_GRAPHICS_FORMAT;
}

export function formatDraftPatch(selection: ProjectFormatSelection): DraftPatch {
  return { ...selection, formatTouched: true };
}

/** The DraftPatch that applies a saved project brand to the draft (the wizard's "Use current project's colors & typeface" toggle). */
export function brandPatch(brand: import('../../model/brand').ProjectBrand): DraftPatch {
  // ANYTHING THE CATALOG CANNOT NAME TRAVELS AS A CUSTOM PALETTE. A look CAPTURED off a
  // template (model/packets.ts captureLookFromTemplate) is minted with id 'captured', not
  // 'custom' - and `draftToOptions` resolves a non-custom palette through `paletteById`,
  // which knows neither id. Keying only on the literal 'custom' therefore sent 'captured'
  // down the lookup path, where `paletteById` SUBSTITUTES `PALETTES[0]` for anything it does
  // not recognise rather than admitting the miss - so the whole captured palette was replaced
  // by NoaCG Amber, silently. A graphic added through a production's "＋ New graphic for this
  // production…" door therefore came out in catalog colours beside the production it was
  // supposed to match, with only the typeface carrying. Measured on the Uutishuone pack:
  // production accent #6C4CF1, the new graphic emitted #f6a623.
  //
  // Membership, not the resolver: `paletteById` is total by design and can never report a
  // miss, so asking it whether an id is known is asking a question it cannot answer.
  const known = PALETTES.some((p) => p.id === brand.palette.id);
  return {
    customPalette: known ? null : brand.palette,
    paletteId: known ? brand.palette.id : null,
    fontId: brand.customFont ? 'custom' : brand.fontId,
    customFont: brand.customFont,
  };
}

/** Map the draft onto WizardOptions (nulls fall back to the variant's defaults). */
export function draftToOptions(variant: TemplateVariant, draft: WizardDraft): WizardOptions {
  return {
    resolution: draftResolution(draft),
    fps: draft.fps,
    // An imported design owns its lines OUTRIGHT — the wizard creates it BARE (fields are
    // added in the editor's Data tab), so its empty array must reach the assembler as-is.
    // Everywhere else an empty draft means "not decided yet" and falls back to suggestions.
    lines:
      variant.category === 'imported-design'
        ? draft.lines
        : draft.lines.length > 0
          ? draft.lines
          : undefined,
    extraFields: draft.extraFields.length > 0 ? draft.extraFields : undefined,
    content: Object.keys(draft.content).length > 0 ? draft.content : undefined,
    styleChoices: Object.keys(draft.styleChoices).length > 0 ? draft.styleChoices : undefined,
    palette: draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : undefined),
    fontId: draft.fontId && draft.fontId !== 'custom' ? draft.fontId : undefined,
    customFont: draft.fontId === 'custom' && draft.customFont ? draft.customFont : undefined,
    sizeScale: draft.sizeScale,
    typeScale: draft.typeScale,
    zone: draft.zone ?? undefined,
    nudge: draft.nudge,
    animation: {
      presetId: draft.animation.presetId ?? variant.animationPresets[0],
      speed: draft.animation.speed,
      easing: draft.animation.easing,
      // null = undecided; resolveOptions then uses the variant's own `defaultSteps`.
      steps: draft.animation.steps ?? undefined,
    },
    importedImages: draft.importedImages.length > 0 ? draft.importedImages : undefined,
    logoAssetPath: variant.logo !== 'none' ? draft.logoAssetPath ?? undefined : undefined,
    // null = the user hasn't decided; resolveOptions then falls back to "an image exists".
    logoEnabled: draft.logoEnabled ?? undefined,
    designArt: draft.designArt ?? undefined,
    designSvg: draft.designSvg
      ? {
          markup: draft.designSvg.markup,
          width: draft.designSvg.width,
          height: draft.designSvg.height,
          // A layer a POLL drives is a display target, not an operator field: the round writes
          // its wording, its figure and its count, and a second writer on the same node would
          // have the operator watching their typing be overwritten. Dropped HERE rather than by
          // unticking the row in the step, because the field ids are positions in exactly this
          // list — filtering it is the one place where the numbering, the markup binding and the
          // control page cannot disagree about which layers are fields.
          fields: draft.svgFields
            .filter((f) => f.on && !pollDrivenLayers(draft.svgBehaviour).has(f.candidateId))
            .map((f) => ({
              candidateId: f.candidateId,
              title: f.title.trim() || 'Text',
              sample: f.sample,
              numeric: f.numeric,
              countdown: f.kind === 'countdown',
            })),
          images: draft.svgImages
            .filter((f) => f.on)
            .map((f) => ({ candidateId: f.candidateId, title: f.title.trim() || 'Picture' })),
          // Only a MEASURED outline can be replaced: its field needs the box, and hiding the
          // shapes without a stand-in would simply lose the designer's text.
          outlines: draft.svgOutlines
            .filter((f) => f.on && f.box)
            .map((f) => ({ candidateId: f.candidateId })),
          // The layers the author said to take OFF the artwork. Left ABSENT where nobody said
          // so, rather than emitted empty: an untouched import must build the same bytes it
          // built before the question existed.
          hidden: hiddenSvgLayers(draft),
          behaviour: svgBehaviourOption(draft) ?? undefined,
          // A growth rule travels only when it is both ON and pointed at a shape that still
          // exists: a half-answered picker must never become a graphic that resizes at random.
          growth: svgGrowthOptions(draft),
          fonts: draft.svgFonts.map((f) => ({
            family: f.family,
            fontId: f.fontId ?? undefined,
            customFont: f.customFont ?? undefined,
          })),
        }
      : undefined,
  };
}

/**
 * Build the draft's real template. `variant.create` emits the animation data with the entrance
 * preset driving both phases; when the draft mixes a different exit in, that exit is applied
 * onto the Out step with the same generator the Inspector's Animations tab uses — so the wizard
 * preview and the created project are always the exact same code.
 */
/**
 * The erased region's field (Import Graphic, Prepare step). An imported design creates BARE
 * — with ONE exception: erasing baked-in text is an explicit "editable text goes here", so
 * the erased rectangle seeds the first field, through the same addPlacedLine transform the
 * Data tab and canvas text tools use. The rect is in the artwork's SOURCE pixels; placement
 * is design px, so the fitToFrame ratio maps between them (the retina case).
 */
function withEraseSeedFields(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
  const art = draft.designArt;
  if (!art || draft.designErases.length === 0) return template;
  const k = art.width / (art.sourceWidth ?? art.width);
  // Every line of every erased region becomes a field, in reading order: a user who marked a
  // name and a title got two pieces of text back, not one field over both.
  let next = template;
  let seeded = 0;
  for (const erase of draft.designErases) {
    // The field sits ON the erased fill, so contrast against exactly that: dark ink on a
    // light fill, white on a dark one (a transparent fill reads as the dark broadcast frame).
    const f = erase.fill;
    const luminance = f.a < 64 ? 0 : (0.2126 * f.r + 0.7152 * f.g + 0.0722 * f.b) / 255;
    const color = luminance > 0.5 ? '#16181c' : '#ffffff';
    // Build the replacement from what was MEASURED, not from the lasso the user drew: the
    // rectangle is deliberately loose (you draw it around text, with air), so its edges say
    // nothing about where the type sat. The ink does.
    //
    // Nothing here reconstructs the font — flattened pixels don't carry one. It reproduces the
    // things that ARE in the pixels: each line's bounds, which edge it was set from, how tall
    // it was, and where its top was. That is what makes the field land on the erased text
    // instead of near it; the user restyles from there.
    for (const line of erase.ink?.lines ?? []) {
      const box = { x: line.x * k, width: line.width * k };
      // Cap-top to baseline is ~0.72 em in every face the product bundles (and close to it in
      // anything a broadcast design is set in), which is why the measurement stops at the
      // baseline: the FULL ink run is 0.72 em for a word without descenders and 0.94 em for
      // one with them, so a size read off it would be right for "Riva" and 30% out for "Gray".
      // Verified against real typeset text, not a stand-in bar (e2e/import-canvas.spec.ts).
      // Bounded, too: a region marked over a logo has ink but no type in it at all.
      // …and never so large that the field arrives already overflowing its own slot. A region
      // marked over a LOGO or an illustration has ink as tall as it is wide, and cap height
      // read off that is type the width could never hold: the fit runtime floors its shrink at
      // 55% and then CLIPS, so the field would open showing "Tex". Roughly half an em per
      // glyph of the value it starts with is the bound that never binds on a real line of
      // text (which is many times wider than it is tall) and always binds on a block.
      const title = seedTitle(seeded);
      const fits = (line.width * k) / (0.55 * Math.max(4, title.length));
      const fontSize = Math.max(
        10,
        Math.min(Math.round((line.capHeight * k) / 0.72), Math.round(fits), Math.round(art.height * 0.5)),
      );
      // Which edge the type was set from. Centred is a real design decision (a title card, a
      // badge) and worth detecting: text whose middle sits on the artwork's middle was almost
      // certainly centred, and seeding it left-anchored would drift the moment the operator
      // types a name of a different length — the one thing this field exists to survive.
      const centre = box.x + box.width / 2;
      const align =
        Math.abs(centre - art.width / 2) <= art.width * 0.045 ? 'center' as const
        : centre < art.width / 2 ? 'left' as const
        : 'right' as const;
      const anchorX = align === 'center' ? centre : align === 'right' ? box.x + box.width : box.x;
      const added = addPlacedLine(next, {
        color,
        title,
        ftype: 'textfield',
        // line-height 1 makes the box exactly one em tall, so the glyphs land predictably
        // inside it: the ink starts about a tenth of an em below the box top.
        lineHeight: 1,
        at: { x: Math.round(anchorX), y: Math.round(line.top * k - fontSize * 0.1) },
        fontSize,
        align,
        // The slot is the room the erased text had, measured from its own anchor — plus the
        // side bearings, which is the difference between what type PAINTS and the width it
        // OCCUPIES. Without that margin the slot is a hair narrower than the very text it was
        // measured from, and the fit runtime shrinks the seed on arrival: the field would open
        // ~10% under the size the design was set in, every time.
        maxWidth: Math.max(64, Math.round((align === 'center' ? box.width * 2 : box.width) + fontSize * 0.12)),
      });
      if (added) {
        next = added.template;
        seeded++;
      }
    }
    // No measurable ink (a region marked over blank background): fall back to the rectangle,
    // sized from its box — ~72% of the height (the box wraps ascenders/descenders with air),
    // CAPPED by width/7, since a name is roughly a dozen glyphs at ~half an em each and a tall
    // script original would otherwise seed type twice the size the design was drawn with.
    if (!erase.ink) {
      const r = erase.rect;
      const added = addPlacedLine(next, {
        color,
        title: seedTitle(seeded),
        ftype: 'textfield',
        at: { x: Math.round(r.x * k), y: Math.round(r.y * k) },
        fontSize: Math.max(10, Math.round(Math.min(r.height * k * 0.72, (r.width * k) / 7))),
        maxWidth: Math.max(64, Math.round(r.width * k)),
      });
      if (added) {
        next = added.template;
        seeded++;
      }
    }
  }
  return next;
}

/** What a seeded field is called. The first two get the words a lower third actually uses —
 *  the overwhelmingly common shape is a name over a title — and anything past that is
 *  numbered. Every one is renamed in a click from the Inspector's Style tab. */
function seedTitle(index: number): string {
  return index === 0 ? 'Name' : index === 1 ? 'Title' : `Text ${index + 1}`;
}

/**
 * PREVIEW-ONLY: a sample line for the Prepare step's stretch demo. With stretch picked but
 * nothing erased, the created template is bare — there is no field for the content-width
 * slider to widen — so the preview build (and only it) places one demo line in the middle
 * band, through the same addPlacedLine transform as everything else. This is the ONE
 * sanctioned deviation from preview == created code (docs/IMPORT_MVP.md): the demo exists
 * exactly so the user can verify the guides before creating.
 */
function withStretchDemoLine(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
  const art = draft.designArt;
  const hz = art?.stretch?.horizontal;
  if (!art || !hz || draft.designErases.length > 0) return template; // the erase-seeded fields are the demo
  const added = addPlacedLine(template, {
    title: 'Sample',
    ftype: 'textfield',
    text: 'Alexandra Riva',
    at: { x: Math.round(hz.left + art.width * 0.03), y: Math.round(art.height * 0.4) },
    fontSize: Math.min(64, Math.max(12, Math.round(art.height * 0.12))),
  });
  return added ? added.template : template;
}

/**
 * WHAT THE BINDING IS STILL MISSING, in the reader's words — empty means it will run.
 *
 * The mapping step can leave a half-made binding lying around: untick an answer's row and the
 * answer it points at is gone. A half-made behaviour is worse than none, because the buttons
 * would appear on the control page and act on rows that are not there — so it is dropped. It
 * used to be dropped SILENTLY, which is the same failure `missingParts` exists to prevent on
 * the catalog side: the reader picks Quiz, walks on, and gets a graphic that comes on and off.
 * Naming the gap is the whole point of returning a list rather than a boolean.
 *
 * ONE DECIDER FOR BOTH BEHAVIOURS, because there is one rule: the step's sentence and
 * `svgBehaviourOption`'s refusal must never be able to disagree about what will happen.
 */
export function behaviourBindingGaps(draft: WizardDraft): string[] {
  const behaviour = draft.svgBehaviour;
  if (!behaviour) return [];
  if (behaviour.kind === 'poll') return pollBindingGaps(behaviour);
  if (behaviour.kind === 'score') return scoreBindingGaps(draft, behaviour);
  if (behaviour.kind === 'timer') return timerBindingGaps(draft, behaviour);
  const on = draft.svgFields.filter((f) => f.on);
  const bound = (candidateId: string): boolean => on.some((f) => f.candidateId === candidateId);
  const gaps: string[] = [];
  if (!bound(behaviour.question)) gaps.push('which layer is the question');
  const loose = behaviour.answers.filter((a) => !bound(a)).length;
  if (loose > 0) gaps.push(loose === 1 ? 'one answer layer' : `${loose} answer layers`);
  if (behaviour.answers.length < 2) gaps.push('at least two answers');
  return gaps;
}

/**
 * A poll asks for less than a quiz, and deliberately.
 *
 * The wire (`Question` / `Options` / `Vote count`) exists whatever is bound, so a board that
 * points at nothing still opens, closes and reaches its result — it simply paints nothing, which
 * is the same beginner path the quiz keeps. What it cannot be is a vote with fewer than two
 * options, or a row nothing can be shown ON: a row with neither a label nor a bar is a row the
 * counts have nowhere to go, and silently dropping it would misreport the vote by one option.
 */
function pollBindingGaps(poll: SvgPollDraft): string[] {
  const gaps: string[] = [];
  if (poll.rows.length < 2) gaps.push('at least two options');
  const blind = poll.rows.filter((r) => !r.label && !r.bar).length;
  if (blind > 0) {
    gaps.push(blind === 1 ? 'a label or a bar for one option' : `a label or a bar for ${blind} options`);
  }
  // ONE LAYER, ONE JOB. Every picker offers the same inventory, so the same layer can be chosen
  // for two roles - and a layer carries ONE id, so the second stamp overwrites the first and the
  // role that lost is simply never painted. Silently. Naming it is the same rule as every other
  // gap here: a half-made binding is worse than none.
  const picked = [
    poll.question,
    poll.total,
    poll.badge,
    ...poll.rows.flatMap((r) => [r.label, r.bar, r.value, r.winner]),
  ].filter(Boolean);
  if (new Set(picked).size !== picked.length) gaps.push('one layer is picked for two things');
  return gaps;
}

/**
 * A score board asks for exactly what a score board IS: two or more rows, each with a name and a
 * figure, and every one of them a real bound field.
 *
 * THE FIGURE IS THE STRICT ONE, and it is strict twice. It has to be BOUND, because a "+1" press
 * carries `current + 1` to an `fN` that has to exist; and it has to be a NUMBER field, because
 * `compileControls` refuses a delta on anything else - which would throw at create time rather
 * than degrade, so it is caught here, in the reader's own words, while the picker is still in
 * front of them. A layer holding "2 - 1" or "10 pts" is text however it looks, exactly as
 * docs/SVG_AUTHORING.md section 3 says.
 *
 * The flash and the full-time mark are not asked for at all: a board that drew neither still
 * scores, corrects and resets - it simply plays nothing while it does, which is the beginner path
 * the quiz and the poll both keep.
 */
function scoreBindingGaps(draft: WizardDraft, score: SvgScoreDraft): string[] {
  const gaps: string[] = [];
  const on = draft.svgFields.filter((f) => f.on);
  const field = (candidateId: string) => on.find((f) => f.candidateId === candidateId);
  if (score.rows.length < 2) gaps.push('at least two teams');
  const nameless = score.rows.filter((r) => !field(r.name)).length;
  if (nameless > 0) gaps.push(nameless === 1 ? 'one team’s name layer' : `${nameless} team name layers`);
  const scoreless = score.rows.filter((r) => !field(r.score)).length;
  if (scoreless > 0) gaps.push(scoreless === 1 ? 'one team’s score layer' : `${scoreless} team score layers`);
  const wordy = score.rows
    .map((r) => field(r.score))
    .filter((f) => f !== undefined && (!f.numeric || f.kind === 'countdown'))
    .map((f) => f!.title.trim() || 'that layer');
  if (wordy.length > 0) {
    gaps.push(
      wordy.length === 1
        ? `a plain figure in “${wordy[0]}” (a + and − button can only move a number)`
        : `plain figures in ${wordy.length} of the score layers (a + and − button can only move a number)`,
    );
  }
  // ONE LAYER, ONE JOB - the poll's rule, and it bites harder here: a layer picked as two rows'
  // score would take both teams' points, and the second stamp is silent.
  const picked = [score.final, ...score.rows.flatMap((r) => [r.name, r.score, r.flash])].filter(Boolean);
  if (new Set(picked).size !== picked.length) gaps.push('one layer is picked for two things');
  return gaps;
}

/**
 * A countdown asks for exactly one thing, and it is not one of its own pickers.
 *
 * THE CLOCK IS THE WHOLE REQUIREMENT. Every drawn moment is optional — a card with none still
 * starts, holds, resumes and resets, which is the beginner path the other three keep — but
 * without a layer bound as the COUNTDOWN there is nothing to start: no readout, no length, and
 * no runtime, because `assembleImportedSvg` emits the shared clock only when a field asks for it.
 * The buttons would appear on the control page and hold a clock that is not there.
 *
 * The gap is phrased as the CLICK that closes it rather than as the fact that is missing. The
 * choice is one section higher up, on the clock layer's own row, and a reader told "which layer
 * is the clock" would look for a picker in front of them that does not exist.
 */
function timerBindingGaps(draft: WizardDraft, timer: SvgTimerDraft): string[] {
  const gaps: string[] = [];
  const on = draft.svgFields.filter((f) => f.on);
  if (!on.some((f) => f.kind === 'countdown')) {
    gaps.push('which layer is the clock (set it to “Countdown” in the list above)');
  }
  // ONE LAYER, ONE JOB — the poll's rule, for the poll's reason: a layer carries ONE id, so the
  // second stamp overwrites the first and the role that lost is simply never painted. Silently.
  const picked = [timer.bar, timer.warning, timer.paused, timer.expired].filter(Boolean);
  if (new Set(picked).size !== picked.length) gaps.push('one layer is picked for two things');
  return gaps;
}

/**
 * The bound behaviour as the generator wants it.
 *
 * The quiz resolves its candidate ids to FIELD INDICES against the rows that are actually on; the
 * poll and the timer pass candidate ids straight through, because none of their layers is an
 * operator field.
 *
 * Returns null unless the binding is usable — `behaviourBindingGaps` is the one place that
 * decides, so the step can SAY what is missing with the same rule that drops it.
 */
function svgBehaviourOption(draft: WizardDraft): DesignSvgBehaviour | null {
  const behaviour = draft.svgBehaviour;
  if (!behaviour) return null;
  if (behaviourBindingGaps(draft).length > 0) return null;
  if (behaviour.kind === 'poll') {
    return {
      kind: 'poll',
      question: behaviour.question || undefined,
      rows: behaviour.rows.map((r) => ({
        label: r.label || undefined,
        bar: r.bar || undefined,
        value: r.value || undefined,
        winner: r.winner || undefined,
      })),
      total: behaviour.total || undefined,
      badge: behaviour.badge || undefined,
    };
  }
  if (behaviour.kind === 'timer') {
    return {
      kind: 'timer',
      bar: behaviour.bar || undefined,
      warning: behaviour.warning || undefined,
      paused: behaviour.paused || undefined,
      expired: behaviour.expired || undefined,
    };
  }
  const on = draft.svgFields.filter((f) => f.on);
  const indexOf = (candidateId: string): number => on.findIndex((f) => f.candidateId === candidateId);
  if (behaviour.kind === 'score') {
    return {
      kind: 'score',
      rows: behaviour.rows.map((r) => ({
        name: indexOf(r.name),
        score: indexOf(r.score),
        flash: r.flash || undefined,
      })),
      final: behaviour.final || undefined,
    };
  }
  const question = indexOf(behaviour.question);
  const answers = behaviour.answers.map(indexOf);
  return {
    kind: 'quiz',
    question,
    answers,
    rows: behaviour.rows.slice(0, answers.length).map((r) => ({
      selected: r.selected || undefined,
      correct: r.correct || undefined,
      wrong: r.wrong || undefined,
    })),
    locked: behaviour.locked || undefined,
  };
}

/**
 * PROPOSE a quiz binding from the layer names — the accelerator, never the requirement.
 *
 * The mapping step's pickers are the road anyone can walk (plan §5, door A). This is door B
 * sitting behind them: a designer who names layers the obvious way ("Question", "Answer A",
 * "A selected") opens the step with every picker already filled and nothing to do. Naming
 * NOTHING costs three clicks per row and no correctness, which is the line the MXMZ lesson
 * draws — a convention may pay you, it may never gate you (docs/COMPETITOR_MXMZ.md §3).
 *
 * Returns null when the file does not look like a quiz at all, so an ordinary import is
 * never nudged toward a behaviour it does not want.
 */
export function proposeQuizBinding(svg: SvgImportResult): SvgQuizDraft | null {
  const answers = svg.candidates.filter((c) => /^answer\b/i.test(c.label.trim()));
  if (answers.length < 2) return null;
  const question = svg.candidates.find((c) => /question/i.test(c.label));
  const letters = answers.map((_, i) => String.fromCharCode(65 + i));
  // "A selected" / "Answer A selected" / "selected A" all name the same drawing. The letter
  // and the state word both have to be there — a layer called "Selected" alone belongs to no
  // row, and guessing which would be worse than leaving the picker empty.
  const layer = (letter: string, state: string): string =>
    svg.groups.find((g) => {
      const label = g.label.toLowerCase();
      return new RegExp(`(^|\\W)${letter.toLowerCase()}(\\W|$)`).test(label) && label.includes(state);
    })?.id ?? '';
  return {
    kind: 'quiz',
    question: question?.id ?? '',
    answers: answers.map((a) => a.id),
    rows: letters.map((letter) => ({
      selected: layer(letter, 'select'),
      correct: layer(letter, 'correct'),
      wrong: layer(letter, 'wrong'),
    })),
    locked: svg.groups.find((g) => /lock/i.test(g.label))?.id ?? '',
  };
}

/**
 * PROPOSE a poll binding from the layer names — door B behind door A, exactly as the quiz's is.
 *
 * The signature is option rows WITH BARS. Option rows alone are not enough and the corpus proved
 * it: the student's quiz board (`student-illustrator-quiz.svg`) names its four answers "Option
 * 1".."Option 4", so a proposal keyed on the word `option` claimed a quiz as a vote — which is
 * worse than proposing nothing, because it puts a confident wrong answer in front of somebody who
 * came here to be helped. A BAR is what a vote board has and a quiz board does not, so two rows
 * must resolve one before anything is proposed at all.
 *
 * Everything else is matched WITHIN the row it belongs to, by the same number or letter, so a
 * file that names three things "Bar" proposes none of them rather than putting all three on row
 * one.
 */
export function proposePollBinding(svg: SvgImportResult): SvgPollDraft | null {
  // The row's number or letter, and it must NOT be the tail of a longer word: `\b` alone matches
  // the "s" of a heading layer called "Options", which would propose that heading as row 1 and
  // shift every real option one row off its own bar.
  const rowKey = (label: string): string | null => {
    const m = /^(?:option|choice|answer|vaihtoehto)\s*([0-9]+|[a-z])(?![a-z])/i.exec(label.trim());
    return m ? m[1].toUpperCase() : null;
  };
  const options = svg.candidates
    .map((c) => ({ c, key: rowKey(c.label) }))
    .filter((r): r is { c: (typeof svg.candidates)[number]; key: string } => r.key !== null)
    // A round carries at most eight options (AUDIENCE_LIMITS.options), so proposing a ninth row
    // would be a row no vote can ever fill - and the step's own count picker stops at eight, so
    // the select would render a number that is not the truth.
    .slice(0, 8);
  if (options.length < 2) return null;
  // The row's own number or letter has to appear in the layer's name as a WORD — "Bar 1" is
  // row 1's bar, "Bar 10" is not, and a layer called "Bar" alone belongs to no row. Guessing
  // which would be worse than leaving the picker empty (the quiz's own rule).
  const inRow = (key: string, label: string): boolean =>
    new RegExp(`(^|\\W)${key.toLowerCase()}(\\W|$)`).test(label.toLowerCase());
  const pick = (key: string, word: RegExp, pool: { id: string; label: string }[]): string =>
    pool.find((g) => word.test(g.label) && inRow(key, g.label))?.id ?? '';
  const drawn = [...svg.groups, ...svg.shapes];
  const rows = options.map(({ c, key }) => ({
    label: c.id,
    bar: pick(key, /\bbar\b|palkki/i, drawn),
    value: pick(key, /%|percent|share|osuus/i, svg.candidates),
    winner: pick(key, /winner|voittaja/i, svg.groups),
  }));
  if (rows.filter((r) => r.bar).length < 2) return null;
  return {
    kind: 'poll',
    question: svg.candidates.find((c) => /question|prompt|kysymys/i.test(c.label))?.id ?? '',
    rows,
    total: svg.candidates.find((c) => /total|votes|ääntä/i.test(c.label))?.id ?? '',
    badge: svg.groups.find((g) => /badge|vote now|äänestä/i.test(g.label))?.id ?? '',
  };
}

/**
 * PROPOSE a score binding from the layer names — door B behind door A, exactly as the other two.
 *
 * THE SIGNATURE IS A NUMBERED ROW WHOSE FIGURE IS A FIGURE. Two rows must resolve a team layer
 * AND a score layer whose sample reads as a plain number, or nothing is proposed. Each half is
 * there because of a wrong answer one of the earlier behaviours gave:
 *
 *  - the ROW KEY, because "Home" and "Away" alone say a board has two sides and nothing about
 *    what it does. A versus card, a head-to-head stat panel and a scoreboard all name their
 *    halves that way, and the poll's own lesson is that a confident wrong answer is worse than
 *    none — it puts a wrong binding in front of somebody who came here to be helped. A designer
 *    with a Home/Away board reaches the same place through the pickers, in one click per row.
 *  - the NUMERIC sample, because it is what a score board has that a quiz and a vote do not, and
 *    it is also the thing the binding actually needs: a "+1" press moves a `number` field, and a
 *    layer reading "2 - 1" is text however it looks (docs/SVG_AUTHORING.md section 3).
 *
 * Everything is matched WITHIN the row it belongs to, by the same number or letter, so a file
 * that names three things "Score" proposes none of them rather than putting all three on row one.
 */
export function proposeScoreBinding(svg: SvgImportResult): SvgScoreDraft | null {
  // The row's number or letter, and it must NOT be the tail of a longer word — the poll's rule,
  // for the poll's reason ("Teams" would otherwise propose the heading as row S).
  const rowKey = (label: string): string | null => {
    const m = /^(?:team|side|player|joukkue)\s*([0-9]+|[a-z])(?![a-z])/i.exec(label.trim());
    return m ? m[1].toUpperCase() : null;
  };
  const FIGURE_WORD = /\bscore\b|\bpoints?\b|\bgoals?\b|pisteet|maalit/i;
  const teams: { c: (typeof svg.candidates)[number]; key: string }[] = [];
  for (const c of svg.candidates) {
    const key = rowKey(c.label);
    // ONE TEAM PER KEY, and never the row's own FIGURE. `Team 1 Score` is an idiomatic name for
    // the figure and it starts with "team", so it reads as a second row 1 - which produced four
    // rows for a two-team board, with one layer standing as row 2's NAME and rows 1 and 2's
    // score. `scoreBindingGaps` then refused it for "one layer is picked for two things", so the
    // author got a wrong layout plus an error they did not cause.
    if (!key || FIGURE_WORD.test(c.label) || teams.some((t) => t.key === key)) continue;
    if (teams.length === SCORE_MAX_ROWS) break;
    teams.push({ c, key });
  }
  if (teams.length < 2) return null;
  const inRow = (key: string, label: string): boolean =>
    new RegExp(`(^|\\W)${key.toLowerCase()}(\\W|$)`).test(label.toLowerCase());
  const pick = <T extends { id: string; label: string }>(key: string, word: RegExp, pool: T[]): T | undefined =>
    pool.find((g) => word.test(g.label) && inRow(key, g.label));
  const rows = teams.map(({ c, key }) => {
    const figure = pick(key, FIGURE_WORD, svg.candidates);
    return {
      name: c.id,
      // A figure that is not a figure is not proposed at all. Left empty the reader is told what
      // is missing (`scoreBindingGaps`) instead of being handed a binding that cannot compile.
      score: figure?.numeric ? figure.id : '',
      flash: pick(key, /\bflash\b|\bgoal\b|\bscored\b|maali/i, scoreDrawnPool(svg))?.id ?? '',
    };
  });
  if (rows.filter((r) => r.score).length < 2) return null;
  return {
    kind: 'score',
    rows,
    final: scoreDrawnPool(svg).find((g) => /full[\s-]?time|final|game over|loppu/i.test(g.label))?.id ?? '',
  };
}

/**
 * The drawings a behaviour's moments may be picked from: named groups AND rectangles.
 *
 * THE NAME IS THE SCORE BOARD'S ONLY BECAUSE IT GOT HERE FIRST. The countdown's four pickers read
 * exactly this list too, and so would any behaviour after it: "every drawing in the file" is not
 * a score-board question. Left as it is rather than renamed in this pass, because the rename
 * would touch the mapping step in a dozen places while another session holds that file
 * (docs/handoffs/2026-09-05-s-more-behaviours.md).
 *
 * ONE POOL, READ BY BOTH DOORS. The mapping step's picker offers exactly this list and the
 * proposal above searches exactly this list, because a proposal that can pick something the
 * picker cannot show is a lie the author cannot correct: the row binds a layer, the select
 * renders "not drawn", and touching the select loses the binding for good. A point flash drawn as
 * one coloured `<rect>` is the ordinary case that hits it - the poll's bar picker offers both
 * inventories for the same reason.
 */
export function scoreDrawnPool(svg: Pick<SvgImportResult, 'groups' | 'shapes'>): { id: string; label: string; hidden?: boolean }[] {
  return [...svg.groups, ...svg.shapes];
}

/**
 * PROPOSE a timer binding from the layer names — door B behind door A, exactly as the other three.
 *
 * THE SIGNATURE IS A CLOCK PLUS A MOMENT THAT ONLY A COUNTDOWN HAS, and it takes both halves for
 * the reason the poll and the score board each paid for once: a confident wrong answer is worse
 * than none, because it puts a wrong binding in front of somebody who came here to be helped.
 *
 *  - a CLOCK-SHAPED text layer alone is not enough, and a scorebug is why. `docs/svg-samples/
 *    scorebug.svg` draws a match clock reading `12:00`, and that board is not a countdown - it is
 *    a scoreboard with a clock on it. Every corpus fixture with a match clock would otherwise
 *    open on a behaviour its designer never asked for.
 *  - so a DRAWN MOMENT of a countdown's own kind has to be there too: a bar, a paused mark, a
 *    warning look, a time-up plate. A scorebug draws none of those.
 *
 * NOTHING IS MATCHED BY ROW, because a countdown has no rows. That is the first proposal here
 * with no row key at all, and it is why this one is simple where the other three are careful.
 */
export function proposeTimerBinding(svg: SvgImportResult): SvgTimerDraft | null {
  const hasClock = svg.candidates.some((c) => c.clock);
  if (!hasClock) return null;
  const drawn = [...svg.groups, ...svg.shapes];
  const find = (word: RegExp): string => drawn.find((g) => word.test(g.label))?.id ?? '';
  const bar = find(/timer bar|time bar|\bdrain\b|aikapalkki/i);
  const warning = find(/\bwarn(ing)?\b|last (stretch|seconds)|\bhurry\b|varoitus/i);
  const paused = find(/\bpause[d]?\b|\bhold\b|\bheld\b|tauko|tauolla/i);
  const expired = find(/time.?s? up|\bexpired\b|\bfinished\b|aika loppu|^aika$/i);
  // At least one moment, or this file is a graphic with a clock on it rather than a countdown.
  if (!bar && !warning && !paused && !expired) return null;
  return { kind: 'timer', bar, warning, paused, expired };
}

/**
 * The proposal the mapping step opens with, whichever behaviour the file looks like — or null,
 * which is the common case and stays the default.
 *
 * ASKED STRICTEST FIRST. The quiz's signature ("Answer A" names a row of a board that has a right
 * answer) is the narrowest, then the score board's (a numbered team row whose figure is a plain
 * number), then the countdown's (a clock layer AND a moment only a countdown has), then the
 * vote's. The countdown sits after the score board deliberately: a scorebug draws a match clock,
 * so a file that satisfies both is a scoreboard with a clock on it rather than a countdown with
 * teams. Nothing here gates anything: every picker in the step is the road, and this is the
 * shortcut for a designer who happened to name layers the obvious way.
 */
export function proposeSvgBehaviour(svg: SvgImportResult): SvgBehaviourDraft | null {
  return (
    proposeQuizBinding(svg)
    ?? proposeScoreBinding(svg)
    ?? proposeTimerBinding(svg)
    ?? proposePollBinding(svg)
  );
}

/**
 * The Text step's placed fields, realized. Runs after the erase seeds so field numbering
 * reads top of the flow first; every spec goes through the editor's own transforms, which
 * is what keeps "the position shown in the wizard" and "the final editor/preview/export"
 * one and the same thing by construction.
 */
function withDesignFieldSpecs(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
  if (draft.designFields.length === 0) return template;
  // The shared applier (blocks/designFields.ts) - the same sequence the Pro reconstruction
  // compiler runs, so a placed spec means one thing everywhere.
  return applyPlacedFieldSpecs(template, draft.designFields);
}

/**
 * The outlined-text stand-ins of an imported SVG (docs/SVG_IMPORT_PLAN.md §1.A). The
 * generator has already hidden each chosen group; here the HTML field that replaces it is
 * placed over the group's measured box through the SAME addPlacedLine transform the erase
 * seeds and the Data tab use — so the field is an ordinary placed line (draggable, restylable,
 * fit-capped) and the preview, the editor and every export agree on it by construction.
 *
 * The measurements are the mapping step's (SvgOutlineDraft.box): the glyph shapes' bounds,
 * cap height and fill. Nothing reconstructs the typeface — outlines carry none — so the
 * text arrives in the project's heading face, at the size, place, colour and alignment the
 * shapes had. The sizing rules are withEraseSeedFields's, for the same reasons it states.
 */
function withSvgOutlineFields(
  template: SpxTemplate,
  draft: WizardDraft,
  // PREVIEW ONLY (see WizardOptions.previewMarkers): the stand-in wears the replaced group's
  // candidate marker, so the mapping step's hover highlight points at the live text rather
  // than at shapes the template has hidden. The group itself gives its marker up for this
  // (templates/importedDesign/svg.ts `bindSvgMarkup`), so exactly one node ever answers.
  markers = false,
): SpxTemplate {
  const svg = draft.designSvg;
  if (!svg) return template;
  let next = template;
  for (const row of draft.svgOutlines) {
    if (!row.on || !row.box) continue;
    const box = row.box;
    const title = row.title.trim() || 'Text';
    const sample = row.sample.trim() || title;
    // Cap-top to baseline is ~0.72 em; bounded by the width (a logo-shaped group would seed
    // type its slot could never hold) and by half the artwork's height. The width bound is
    // judged against the short field NAME, as the raster seed does — never the sample: a
    // long sample is the shrink runtime's business at play time, and sizing the design down
    // for it would make every real outlined title arrive small.
    const fits = box.width / (0.55 * Math.max(4, title.length));
    const fontSize = Math.max(
      10,
      Math.min(Math.round(box.capHeight / 0.72), Math.round(fits), Math.round(svg.height * 0.5)),
    );
    // Centred text drifts the moment a name of another length arrives unless it is anchored
    // at its middle — the centre rule withEraseSeedFields uses, against the artwork's width.
    const centre = box.x + box.width / 2;
    const align =
      Math.abs(centre - svg.width / 2) <= svg.width * 0.045 ? 'center' as const
      : centre < svg.width / 2 ? 'left' as const
      : 'right' as const;
    const anchorX = align === 'center' ? centre : align === 'right' ? box.x + box.width : box.x;
    const added = addPlacedLine(next, {
      title,
      // A sample the user typed as a plain figure (a score, a year) becomes a number field,
      // the same proposal a bound text layer gets from its own content.
      ftype: looksNumeric(sample) ? 'number' : 'textfield',
      text: sample,
      ...(row.color ? { color: row.color } : {}),
      // line-height 1 makes the box exactly one em tall; the ink starts ~0.1 em below its top.
      lineHeight: 1,
      at: { x: Math.round(anchorX), y: Math.round(box.y - fontSize * 0.1) },
      fontSize,
      align,
      // The slot is the room the outlined text had, from its own anchor, plus the side
      // bearings — type occupies a hair more than it paints.
      maxWidth: Math.max(64, Math.round((align === 'center' ? box.width * 2 : box.width) + fontSize * 0.12)),
    });
    if (!added) continue;
    next = added.template;
    if (markers) {
      const wrapperId = `fw${added.fieldId.slice(1)}`;
      next = {
        ...next,
        html: next.html.replace(
          `id="${wrapperId}"`,
          `id="${wrapperId}" ${SVG_CANDIDATE_ATTR}="${row.candidateId}"`,
        ),
      };
    }
  }
  return next;
}

/** The graphic's name: what the Finish step was given, else the design's own catalog name
 *  (which is what a project was called before that step existed). */
export function draftName(variant: TemplateVariant, draft: WizardDraft): string {
  return draft.name.trim() || variant.name;
}

export function buildDraftTemplate(
  variant: TemplateVariant,
  draft: WizardDraft,
  // The wizard PREVIEW passes stretchDemo; create() never does — see withStretchDemoLine.
  // `previewMarkers` rides the same way: the mapping step's hover highlight needs a handle on
  // the layer a row means, and only the preview carries the fit runtime (plan §6a step 1).
  opts: { stretchDemo?: boolean; previewMarkers?: boolean } = {},
): SpxTemplate {
  let template = variant.create({ ...draftToOptions(variant, draft), previewMarkers: opts.previewMarkers });
  // The name rides the built template, so it reaches the editor's topbar, the Save dialog's
  // prefill, and the export slug through ONE path rather than being applied per branch.
  const named = draftName(variant, draft);
  if (named !== template.name) template = { ...template, name: named };
  let css = template.css;
  if (draft.fontId) {
    const stack = draft.fontId === 'custom' && draft.customFont 
      ? `"${draft.customFont.family}"`
      : (draft.fontId ? fontStack(FONTS.find(f => f.id === draft.fontId)!) : '');
    if (stack) {
      const fontVars = ['font-body', 'font-numeric', 'font-label', 'font-kicker'];
      for (const v of fontVars) {
        if (getCssVariable(css, v) !== null && !(v in draft.cssVarOverrides)) {
          css = setCssVariable(css, v, stack);
        }
      }
    }
  }

  const overridden = Object.entries(draft.cssVarOverrides);
  if (overridden.length > 0 || draft.fontId) {
    // Only vars the built design DECLARES: switching designs mid-wizard must not graft the
    // previous design's variable names onto one that never reads them.
    for (const [name, value] of overridden) {
      if (getCssVariable(css, name) === null) continue;
      css = setCssVariable(css, name, value);
      // An override may point a variable at a TYPEFACE (the kicker face, the numeric face).
      // Setting the variable is only half of that: the face's bytes have to ship too, or the
      // export references a font file nothing wrote and `font-display: swap` hides it until
      // playout (model/fonts.ts ensureFontFace).
      css = ensureFontFace(css, fontByStack(value), `--${name} points at this face.`);
    }
    template = { ...template, css };
  }
  if (variant.category === 'imported-design') {
    template = withEraseSeedFields(template, draft);
    template = withSvgOutlineFields(template, draft, opts.previewMarkers);
    template = withDesignFieldSpecs(template, draft);
    if (opts.stretchDemo) template = withStretchDemoLine(template, draft);
  }
  const inId = draft.animation.presetId ?? variant.animationPresets[0];
  const outId = draft.animation.outPresetId;
  if (outId && outId !== inId) {
    const outPreset = anyPresetById(outId);
    const easeOut = resolveEasing(draft.animation.easing, outPreset.autoEase).easeOut;
    const data = parseAnimData(template.js);
    // No data block (a hand-written variant) — nothing to mix onto.
    const donor = data && presetDonor(template, data, outId, { easeOut });
    const mixed = data && donor && applyPresetData(data, donor, 'out', 'all');
    const js = mixed && writeAnimData(template.js, mixed);
    if (js) template = { ...template, js };
  }
  return withUniversalMotion(template, draft, variant);
}

/**
 * The whole-unit category presets an imported design creates from, and the universal motion
 * each one IS. The wizard's Animation step shows the universal bank for that category (ten
 * cards instead of four), so a design that has not picked one still has to land on the same
 * data the card it shows lit would write - otherwise the control page, reading the data back,
 * would light nothing for a graphic the wizard said was "Fade".
 */
const WHOLE_UNIT_AS_UNIVERSAL: Partial<Record<AnimPresetId, MotionPresetId>> = {
  'design-fade': 'fade',
  'design-slide': 'rise',
  'design-pop': 'pop',
  'design-blur': 'blur',
};

/** A category preset the universal bank stands in for (the Animation step hides its card). */
export function isWholeUnitPreset(id: AnimPresetId): boolean {
  return WHOLE_UNIT_AS_UNIVERSAL[id] !== undefined;
}

/**
 * Whether a design's Animation step can offer the universal bank (blocks/motionPresets.ts)
 * BESIDE its category's own choreographies.
 *
 * Asked of the BUILT TEMPLATE, not of the category. The universal bank's promise is structural
 * - it moves the root's drawn children as one unit - so the honest question is whether this
 * design has such a unit, which only the emitted markup and its data block can answer. That is
 * also why it is now every category's question rather than the imported design's: an imported
 * design was never special here, it was only the first one asked (the ten motions were already
 * proven to apply and read back on every catalog category that carries a data block -
 * e2e/motion-presets.spec.ts). A hand-written variant with no data block, or a design whose
 * root draws nothing directly, answers false and keeps its own cards alone.
 */
export function usesUniversalMotion(template: SpxTemplate | null): boolean {
  if (!template) return false;
  const data = parseAnimData(template.js);
  return !!data && motionTargets(template, data).length > 0;
}

/** The universal motion each phase of the draft resolves to: the explicit pick, else the
 *  mapped whole-unit default; undefined keeps the category preset (the SVG layer stagger). */
export function universalPick(draft: WizardDraft, variant: TemplateVariant): MotionPick {
  const inId = draft.animation.presetId ?? variant.animationPresets[0];
  const outId = draft.animation.outPresetId ?? inId;
  const pick: MotionPick = {};
  const mIn = draft.animation.motionIn ?? WHOLE_UNIT_AS_UNIVERSAL[inId];
  const mOut = draft.animation.motionOut ?? WHOLE_UNIT_AS_UNIVERSAL[outId];
  if (mIn) pick.in = mIn;
  if (mOut) pick.out = mOut;
  return pick;
}

/** Write the draft's universal motion onto the built template - the same engine the control
 *  page applies after creation, so the wizard preview, the created graphic and the picker
 *  that reads it back agree by construction. */
function withUniversalMotion(template: SpxTemplate, draft: WizardDraft, variant: TemplateVariant): SpxTemplate {
  // No structural gate here: `pick` is empty unless a universal card was actually clicked (or
  // the design's own default maps to one), and applyMotionPreset already answers null for a
  // template with no unit to move. Asking usesUniversalMotion again would only parse the same
  // data block a second time to reach the same conclusion.
  const pick = universalPick(draft, variant);
  if (!pick.in && !pick.out) return template;
  const data = parseAnimData(template.js);
  if (!data) return template;
  // 'auto' keeps each motion's tuned curve; a named easing overrides both phases, as it
  // does for the category presets.
  const tuned = (id: MotionPresetId) => {
    const m = motionPresetById(id);
    return { easeIn: m.in.ease, easeOut: m.out.ease };
  };
  const eases = {
    easeIn: pick.in ? resolveEasing(draft.animation.easing, tuned(pick.in)).easeIn : undefined,
    easeOut: pick.out ? resolveEasing(draft.animation.easing, tuned(pick.out)).easeOut : undefined,
  };
  const next = applyMotionPreset(template, data, pick, eases);
  const js = next && writeAnimData(template.js, next);
  return js ? { ...template, js } : template;
}
