// The IMPORT-GRAPHIC road's part of the draft (docs/WORKFLOW_ARCHITECTURE.md §5.5): the
// erase, placed-field and SVG mapping state the raster and SVG import steps hold, the
// behaviour bindings and their gap checks, and the build passes that turn all of it into
// real placed fields and DesignSvg options. The WizardDraft record that carries this state
// is ./core.ts, which is the one caller of the build passes.

import type { SpxTemplate } from '../../../model/types';
import { addPlacedLine } from '../../../blocks/designLayout';
import { applyPlacedFieldSpecs } from '../../../blocks/designFields';
import type {
  DesignSvgAlign,
  DesignSvgBehaviour,
  DesignSvgExtra,
  DesignSvgGrowth,
  DesignSvgRecipeBehaviour,
  DesignSvgHidden,
} from '../../../model/wizard';
import type { CustomFont } from '../../../model/fonts';
import type { EraseRect, RegionInk } from '../../../assets/eraseRegion';
import { looksNumeric, SVG_CANDIDATE_ATTR, type SvgImportResult } from '../../../assets/svgImport';
import { bestProposal, extraPrefixOf, proposeExtras, type ProposedBinding } from '../../../templates/behaviours/naming';
import { recipeById } from '../../../templates/behaviours/registry';
import { BEHAVIOUR_WORDS, rowKeys } from '../../../templates/behaviours/recipe';
import type { WizardDraft } from '../draft/core';

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
  /**
   * HOW THE BLOCK SITS IN ITS BOX, set on the row's nine-dot grid (docs/TEXT_BOX_BINDING.md,
   * "Alignment"). Absent = read from the drawing, which is what every row starts as and what a
   * draft from before the grid existed still means. Held in the runtime's own words so the value
   * travels to `DesignSvgField.align` unchanged; the row translates to left / centred / right.
   */
  align?: DesignSvgAlign;
  /**
   * KEEP THE NUDGE THE FILE RECORDED - the checkbox under the grid, offered only where the
   * drawing has one. Absent = false: the block snaps onto its anchor, the owner's default.
   */
  keepNudge?: boolean;
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
export type SvgBehaviourDraft = SvgQuizDraft | SvgPollDraft | SvgScoreDraft | SvgTimerDraft | SvgRecipeDraft;

/** Any other recipe, held generically (model/wizard.ts DesignSvgRecipeBehaviour): its roles are
 *  read off the declaration, so a recipe added tomorrow needs no new member here. Every value
 *  is a candidate id; indices are resolved at `svgBehaviourOption`, when the field order is known. */
export interface SvgRecipeDraft {
  kind: 'recipe';
  recipe: string;
  /** Graphic-level LAYER role -> candidate id; empty = not picked. */
  layers: Record<string, string>;
  /** Graphic-level FIELD role -> the candidate id of the ticked text row the operator types. */
  fields?: Record<string, string>;
  /** One entry per row, in row order, for a recipe with rows: that row's field and layer picks. */
  rows?: SvgRecipeRow[];
  options: Record<string, boolean>;
}

export interface SvgRecipeRow {
  fields: Record<string, string>;
  layers: Record<string, string>;
}

/** An empty row of a generic recipe - nothing picked yet. */
export function emptyRecipeRow(): SvgRecipeRow {
  return { fields: {}, layers: {} };
}

export interface SvgQuizDraft {
  kind: 'quiz';
  /** The recipe's options as ticked; absent = the recipe's defaults. */
  options?: Record<string, boolean>;
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
  // ANY recipe's WRITE targets are driven the same way: a meter's percent layer is written by the
  // runtime, so an operator field on it would be the two-writers graphic the vote avoids.
  if (behaviour?.kind === 'recipe') {
    const written = new Set(
      (recipeById(behaviour.recipe)?.roles ?? [])
        .filter((r) => r.kind === 'layer' && r.paint?.includes('write'))
        .map((r) => r.id),
    );
    const picks = [
      ...Object.entries(behaviour.layers),
      ...(behaviour.rows ?? []).flatMap((row) => Object.entries(row.layers)),
    ];
    return new Set(picks.filter(([role, id]) => written.has(role) && !!id).map(([, id]) => id));
  }
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
export function hiddenSvgLayers(draft: WizardDraft): DesignSvgHidden[] | undefined {
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
export function svgGrowthOptions(draft: WizardDraft): DesignSvgGrowth[] | undefined {
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
  /**
   * 'move' translates it by the growth; 'grow' stretches it by the same amount instead.
   *
   * THE WIZARD ONLY EVER WRITES 'move' (owner, 2026-09-05: "everything else should just move out
   * of the way"). The mapping step's per-row picker is gone - measured across the SVG corpus, it
   * asked 79 rows a question whose second answer was right on none of them, because a row in that
   * list is a layer drawn PAST the growing edge and a layer that must stretch is one drawn TO BOTH
   * of the panel's edges. The runtime finds and grows those itself (`svgCollectSpanners`).
   *
   * The FIELD stays, and stays two-valued, for the two readers that still need it: a template
   * saved while the picker existed carries 'grow' and must keep stretching, and a pro editing
   * `NOACG_LAYOUT` in the generated code writes it by hand - the road the removed control was
   * standing in front of. Neither is a shape change, so nothing here needs a migration.
   */
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

/**
 * The erased region's field (Import Graphic, Prepare step). An imported design creates BARE
 * — with ONE exception: erasing baked-in text is an explicit "editable text goes here", so
 * the erased rectangle seeds the first field, through the same addPlacedLine transform the
 * Data tab and canvas text tools use. The rect is in the artwork's SOURCE pixels; placement
 * is design px, so the fitToFrame ratio maps between them (the retina case).
 */
export function withEraseSeedFields(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
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
export function withStretchDemoLine(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
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
  if (behaviour.kind === 'recipe') return recipeBindingGaps(draft, behaviour);
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
 * A generic recipe asks for what its declaration marks REQUIRED and nothing more: a required
 * field role has to name a ticked text row (it becomes an operator field), a required layer role
 * has to be picked, per row where the role repeats, and a recipe with rows needs at least its
 * minimum. Everything optional stays the beginner path: a survey with no strikes drawn still
 * reveals and adds up.
 */
function recipeBindingGaps(draft: WizardDraft, behaviour: SvgRecipeDraft): string[] {
  const recipe = recipeById(behaviour.recipe);
  if (!recipe) return [`a behaviour NoaCG knows (“${behaviour.recipe}” is not one)`];
  const on = draft.svgFields.filter((f) => f.on);
  const ticked = (candidateId: string): boolean => on.some((f) => f.candidateId === candidateId);
  const gaps: string[] = [];
  const rows = behaviour.rows ?? [];
  if (recipe.rows && rows.length < recipe.rows.min) gaps.push(`at least ${recipe.rows.min} ${recipe.rows.role} rows`);
  for (const role of recipe.roles) {
    if (!role.required || role.countdown) continue;
    const label = role.label.toLowerCase();
    if (role.perRow) {
      const missing = rows.filter((row) => !(role.kind === 'field' ? ticked(row.fields[role.id] ?? '') : row.layers[role.id])).length;
      if (missing > 0) gaps.push(missing === 1 ? `the ${label} layer for one row` : `the ${label} layer for ${missing} rows`);
    } else {
      const picked = role.kind === 'field' ? behaviour.fields?.[role.id] ?? '' : behaviour.layers[role.id] ?? '';
      if (!(role.kind === 'field' ? ticked(picked) : picked)) gaps.push(`which layer is the ${label}`);
    }
  }
  // ONE LAYER, ONE JOB - the poll's rule, for the poll's reason: the second stamp is silent.
  const picked = [
    ...Object.values(behaviour.layers),
    ...Object.values(behaviour.fields ?? {}),
    ...rows.flatMap((row) => [...Object.values(row.fields), ...Object.values(row.layers)]),
  ].filter(Boolean);
  if (new Set(picked).size !== picked.length) gaps.push('one layer is picked for two things');
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

/** One hidden layer's use as a switch or as an option of a choice, as the mapping step holds it. */
export interface SvgExtraDraft {
  /** The group candidate id. */
  candidateId: string;
  use: 'switch' | 'choice';
  /** The switch's name, or the choice OPTION's label - the operator's word for it. */
  name: string;
  /** The choice's name (the section its buttons sit under). Switches carry none. */
  group?: string;
}

/** The switches and choices the drop proposes from the two prefixes, named by their layers. */
export function proposeSvgExtras(svg: SvgImportResult): SvgExtraDraft[] {
  return proposeExtras(svg).map(({ candidateId, prefix }) =>
    prefix.kind === 'switch'
      ? { candidateId, use: 'switch' as const, name: prefix.name }
      : { candidateId, use: 'choice' as const, name: prefix.option, group: prefix.group },
  );
}

/** A hidden layer's display name for the extras section: the prefix stripped, else the label. */
export function extraLayerName(label: string): string {
  const prefix = extraPrefixOf(label);
  if (!prefix) return label;
  return prefix.kind === 'switch' ? prefix.name : prefix.option;
}

/**
 * The switches and choices as the generator wants them. A switch needs its layer; a choice needs
 * a name and at least two options - one option is a switch spelled longer, and it is dropped
 * rather than compiled into a choice with one button. Absent when there are none, so an untouched
 * import builds the bytes it built before the question existed.
 */
export function svgExtrasOptions(draft: WizardDraft): DesignSvgExtra[] | undefined {
  const exists = (id: string) => draft.designSvg?.groups.some((g) => g.id === id) ?? false;
  const out: DesignSvgExtra[] = [];
  for (const e of draft.svgExtras) {
    if (e.use === 'switch' && exists(e.candidateId) && e.name.trim()) out.push({ kind: 'switch', name: e.name.trim(), layer: e.candidateId });
  }
  const groups = new Map<string, { label: string; layer: string }[]>();
  for (const e of draft.svgExtras) {
    if (e.use !== 'choice' || !exists(e.candidateId) || !e.group?.trim() || !e.name.trim()) continue;
    const list = groups.get(e.group.trim()) ?? [];
    list.push({ label: e.name.trim(), layer: e.candidateId });
    groups.set(e.group.trim(), list);
  }
  for (const [name, options] of groups) if (options.length >= 2) out.push({ kind: 'choice', name, options });
  return out.length > 0 ? out : undefined;
}

/** One line saying what the graphic DOES, for the Finish step and the mapping step's summary. */
export function behaviourSummary(draft: WizardDraft): string {
  const parts: string[] = [];
  const behaviour = draft.svgBehaviour;
  if (behaviour) {
    const recipeId = behaviour.kind === 'poll' ? 'vote' : behaviour.kind === 'timer' ? 'countdown' : behaviour.kind === 'recipe' ? behaviour.recipe : behaviour.kind;
    const words = BEHAVIOUR_WORDS[recipeId];
    parts.push(words ? `${words.name.toLowerCase()}: ${words.verbs}` : behaviour.kind);
    if (behaviour.kind === 'quiz') {
      // The moments a quiz can show, and how many the designer drew - the rest wear NoaCG's own
      // look (docs/SVG_STATES_FROM_ARTWORK.md §5.2 asked for exactly this row).
      const drawn = behaviour.rows.reduce((n, r) => n + [r.selected, r.correct, r.wrong].filter(Boolean).length, 0) + (behaviour.locked ? 1 : 0);
      const total = behaviour.rows.length * 3 + 1;
      parts.push(drawn === total ? 'every moment drawn' : `${drawn} of ${total} moments drawn, the rest use NoaCG’s own look`);
    }
  }
  const extras = svgExtrasOptions(draft) ?? [];
  const switches = extras.filter((e) => e.kind === 'switch');
  const choices = extras.filter((e) => e.kind === 'choice');
  if (switches.length > 0) parts.push(`${switches.length} ${switches.length === 1 ? 'switch' : 'switches'}`);
  for (const c of choices) if (c.kind === 'choice') parts.push(`a choice, ${c.name} (${c.options.map((o) => o.label).join(', ')})`);
  return parts.join(' · ');
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
export function svgBehaviourOption(draft: WizardDraft): DesignSvgBehaviour | null {
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
  if (behaviour.kind === 'recipe') {
    const recipe = recipeById(behaviour.recipe);
    const rows = behaviour.rows ?? [];
    // Positional keys, as the quiz's letters and the score's numbers are: the row's place in the
    // list is its key, whatever the layer was called.
    const keys = recipe?.rows ? rowKeys(recipe.rows.keys, rows.length) : [];
    const picked = (map: Record<string, string> | undefined): Record<string, string> =>
      Object.fromEntries(Object.entries(map ?? {}).filter(([, id]) => !!id));
    const perRow = <T,>(pick: (row: SvgRecipeRow) => Record<string, T>): Record<string, Record<string, T>> => {
      const out: Record<string, Record<string, T>> = {};
      rows.forEach((row, i) => {
        for (const [role, value] of Object.entries(pick(row))) {
          (out[role] ??= {})[keys[i]] = value;
        }
      });
      return out;
    };
    const fields: NonNullable<DesignSvgRecipeBehaviour['fields']> = {
      ...Object.fromEntries(Object.entries(picked(behaviour.fields)).map(([role, id]) => [role, indexOf(id)])),
      ...perRow((row) => Object.fromEntries(Object.entries(picked(row.fields)).map(([role, id]) => [role, indexOf(id)]))),
    };
    return {
      kind: 'recipe',
      recipe: behaviour.recipe,
      layers: { ...picked(behaviour.layers), ...perRow((row) => picked(row.layers)) },
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(keys.length > 0 ? { rows: keys } : {}),
      ...(Object.keys(behaviour.options).length > 0 ? { options: behaviour.options } : {}),
    };
  }
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
    ...(behaviour.options && Object.keys(behaviour.options).length > 0 ? { options: behaviour.options } : {}),
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
 * PROPOSE a behaviour from the layer names - the accelerator, never the requirement
 * (templates/behaviours/naming.ts: one tokenizer, one scorer over every recipe's words).
 *
 * The mapping step's pickers are the road anyone can walk; this is door B sitting behind them: a
 * designer who names layers the obvious way ("Question", "Answer A", "A selected", "Team 1",
 * "Bar 1") opens the step with every picker already filled and nothing to do. Naming NOTHING
 * costs a few clicks per row and no correctness, which is the line the MXMZ lesson draws - a
 * convention may pay you, it may never gate you (docs/COMPETITOR_MXMZ.md §3).
 *
 * Returns null when the names carry no distinctive evidence of any behaviour, so an ordinary
 * import is never nudged toward one it does not want. The four DRAFT shapes below are the mapping
 * step's own vocabulary; the proposal itself is one binding, whichever recipe won.
 */
export function proposeSvgBehaviour(svg: SvgImportResult): SvgBehaviourDraft | null {
  const best = bestProposal(svg);
  if (!best) return null;
  const one = (map: ProposedBinding['fields'], role: string): string => (typeof map[role] === 'string' ? (map[role] as string) : '');
  const per = (map: ProposedBinding['fields'], role: string, key: string): string => {
    const value = map[role];
    return value && typeof value === 'object' ? (value[key] ?? '') : '';
  };
  const keys = best.rows;
  if (best.recipe === 'quiz') {
    return {
      kind: 'quiz',
      question: one(best.fields, 'question'),
      answers: keys.map((key) => per(best.fields, 'answer', key)),
      rows: keys.map((key) => ({
        selected: per(best.layers, 'answer.selected', key),
        correct: per(best.layers, 'answer.correct', key),
        wrong: per(best.layers, 'answer.wrong', key),
      })),
      locked: one(best.layers, 'locked'),
    };
  }
  if (best.recipe === 'score') {
    return {
      kind: 'score',
      rows: keys.map((key) => ({
        name: per(best.fields, 'team', key),
        score: per(best.fields, 'score', key),
        flash: per(best.layers, 'team.flash', key),
      })),
      final: one(best.layers, 'final'),
    };
  }
  if (best.recipe === 'countdown') {
    return {
      kind: 'timer',
      bar: one(best.layers, 'bar'),
      warning: one(best.layers, 'warning'),
      paused: one(best.layers, 'paused'),
      expired: one(best.layers, 'expired'),
    };
  }
  if (best.recipe !== 'vote') {
    // Every other recipe is held generically - the meter, the survey board, whatever comes next:
    // its graphic-level picks by role, and one row per key the proposal found.
    const layers: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const [role, value] of Object.entries(best.layers)) if (typeof value === 'string') layers[role] = value;
    for (const [role, value] of Object.entries(best.fields)) if (typeof value === 'string') fields[role] = value;
    const rows: SvgRecipeRow[] = keys.map((key) => ({
      fields: Object.fromEntries(Object.entries(best.fields).flatMap(([role, value]) => (typeof value === 'object' && value[key] ? [[role, value[key]]] : []))),
      layers: Object.fromEntries(Object.entries(best.layers).flatMap(([role, value]) => (typeof value === 'object' && value[key] ? [[role, value[key]]] : []))),
    }));
    return {
      kind: 'recipe',
      recipe: best.recipe,
      layers,
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(rows.length > 0 ? { rows } : {}),
      options: {},
    };
  }
  return {
    kind: 'poll',
    question: one(best.layers, 'question'),
    rows: keys.map((key) => ({
      label: per(best.layers, 'option', key),
      bar: per(best.layers, 'bar', key),
      value: per(best.layers, 'percent', key),
      winner: per(best.layers, 'winner', key),
    })),
    total: one(best.layers, 'total'),
    badge: one(best.layers, 'badge'),
  };
}

/**
 * The Text step's placed fields, realized. Runs after the erase seeds so field numbering
 * reads top of the flow first; every spec goes through the editor's own transforms, which
 * is what keeps "the position shown in the wizard" and "the final editor/preview/export"
 * one and the same thing by construction.
 */
export function withDesignFieldSpecs(template: SpxTemplate, draft: WizardDraft): SpxTemplate {
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
export function withSvgOutlineFields(
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
