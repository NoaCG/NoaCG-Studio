// The Import-graphic road's option shapes (docs/SVG_IMPORT_PLAN.md,
// docs/GRAPHIC_BEHAVIOUR_PLAN.md): the imported SVG with its bound layers, behaviours, extras and
// layout rules, and the raster road's DesignArt / DesignStretch. They exist for the Import-graphic
// road alone; the template contract (templates/contract.ts) carries them only as the `designSvg`
// and `designArt` members of WizardOptions.

import type { CustomFont } from '../../model/fonts';

/**
 * An imported SVG graphic: the sanitized markup (candidates tagged with
 * data-noacg-candidate — assets/svgImport.ts) plus the text layers the user chose to bind
 * as operator fields. The markup is inlined VERBATIM into the template; binding adds
 * id="fN" to the chosen nodes and nothing else, which is what keeps the pixels exactly the
 * designer's (plan §1, architecture B).
 */
export interface DesignSvg {
  /** Sanitized SVG markup from assets/svgImport.ts, candidate markers still in place. */
  markup: string;
  /** Design-space size in px — the viewBox size, fitted to the frame when larger. */
  width: number;
  height: number;
  /** The text layers becoming operator fields, in field order (index i binds as fN). */
  fields: DesignSvgField[];
  /** The `<image>` layers becoming picture fields (filelist), numbered after the text
   *  fields. update() swaps the node's href; an empty value restores the drawn picture. */
  images: DesignSvgImage[];
  /** Outlined-text groups the user chose to REPLACE (plan §1.A): the generator hides each
   *  one; the HTML field that stands in for it is placed afterwards through the raster
   *  flow's placed-line transform (components/wizard/draft.ts withSvgOutlineFields), which
   *  is why only the identity travels here — the placement is a draft concern. */
  outlines: DesignSvgOutline[];
  /**
   * Text layers the author said should COME OFF the artwork (owner walk, 2026-09-02: "what
   * should we do?"). Unticking a layer means it stays as the designer drew it and the operator
   * cannot retype it; this is the other answer, and it is only ever reached by saying so. The
   * shapes stay in the file and are hidden by one CSS rule, exactly like a replaced outline
   * group, so nothing the designer exported is thrown away.
   */
  hidden?: DesignSvgHidden[];
  /** Every font family the SVG references, with how each one was resolved. */
  fonts: DesignSvgFont[];
  /** The BEHAVIOUR the author bound to this artwork, if any (docs/GRAPHIC_BEHAVIOUR_PLAN.md).
   *  Absent means the ordinary in/out graphic the importer has always produced. */
  behaviour?: DesignSvgBehaviour;
  /**
   * The SWITCHES and CHOICES bound to the artwork beside (or instead of) a behaviour
   * (docs/SVG_BEHAVIOUR_PLAN.md §7c): a hidden layer the operator shows and hides, or a set of
   * hidden layers of which one shows at a time. Any number; each compiles as its own parallel
   * group under its own name. Absent = none, which every import before this had.
   */
  extras?: DesignSvgExtra[];
  /**
   * THE LAYOUT RELATIONSHIPS (plan §6c): which elements may grow, which way, and what travels
   * with them. Absent or empty = the graphic declares a STAGE and nothing moves, which is
   * every board, every scorebug, and everything the importer produced before this existed.
   *
   * `stretch` is the ONE-RECTANGLE, always-horizontal shape this replaced (plan §3, the hug).
   * It is still read so a draft or a saved wizard option from before this change still builds
   * the graphic it described - `layoutRules` normalizes the two into one shape, and nothing
   * downstream sees the old one.
   */
  growth?: DesignSvgGrowth[];
  /** @deprecated The hug's original one-rectangle form; read through `layoutRules`. */
  stretch?: DesignSvgStretch;
}

/**
 * ONE LAYOUT RELATIONSHIP: an element that may grow, which way, how far, and what travels
 * with its moving edge (docs/SVG_IMPORT_PLAN.md §6c).
 *
 * **Never universally elastic** (owner, 2026-08-23): the author says which element may grow.
 * A board and any deliberately fixed composition carry no rules at all, which is every graphic
 * the importer produced before this existed.
 */
/** @deprecated The hug's original shape: one rectangle, always widening, followers derived.
 *  Superseded by `DesignSvgGrowth[]`; `layoutRules` reads it as one axis-'x' rule. */
export interface DesignSvgStretch {
  candidateId: string;
}

export interface DesignSvgGrowth {
  /** The element's data-noacg-candidate marker value in the markup. */
  candidateId: string;
  /** Which way it grows. 'x' widens it (the lower third's banner, the hug of plan §3);
   *  'y' makes it taller so a wrapped value has somewhere to go. Absent = 'x'. */
  axis?: 'x' | 'y';
  /**
   * What travels with the moving edge, DECLARED. Absent = derived from geometry at runtime
   * ("anything past the growing edge"), which is what the horizontal hug has always done and
   * is usually right sideways. It is NOT right downwards: below a panel sits a mix of things
   * that should move, things that should stretch, and things pinned to the frame that must
   * stay - and no geometry rule separates them, so a vertical rule declares its set and the
   * derivation is only ever the proposal the author edited (plan §6c).
   */
  followers?: DesignSvgFollower[];
}

/** One declared follower of a growth rule. */
export interface DesignSvgFollower {
  /** The element's data-noacg-candidate marker value in the markup. */
  candidateId: string;
  /** 'move' translates it by the growth; 'grow' stretches it by the same amount instead,
   *  which is what a background band behind a growing block wants. Absent = 'move'. */
  mode?: 'move' | 'grow';
}

/**
 * A behaviour bound to imported artwork: the QUIZ (the 2026-08-22 pilot), the POLL
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12), the SCORE tracker and the TIMER (§13). The union is the
 * discriminated seam the pilot left behind, and adding the second, third and fourth members cost
 * nothing above this type — which is the evidence §6 asked for before anything more general is
 * built.
 */
export type DesignSvgBehaviour =
  | DesignSvgQuizBehaviour
  | DesignSvgPollBehaviour
  | DesignSvgScoreBehaviour
  | DesignSvgTimerBehaviour
  | DesignSvgRecipeBehaviour;

/**
 * Any OTHER recipe without rows (docs/SVG_BEHAVIOUR_PLAN.md §7): the meter, the alert, and every
 * recipe after them. One shape for all of them - the recipe's id, its layer roles as candidate
 * ids, and its options - so a new recipe never grows this union again. The four members above
 * are the shapes the wizard grew one at a time and still holds.
 */
export interface DesignSvgRecipeBehaviour {
  kind: 'recipe';
  recipe: string;
  /** Layer role -> the candidate id bound to it; a per-row role maps the row's key to it. */
  layers: Record<string, string | Record<string, string>>;
  /** Field role -> index into `DesignSvg.fields` (what the operator types); per row, key -> index.
   *  ADDITIVE: a recipe whose roles are all layers (the meter) carries none. */
  fields?: Record<string, number | Record<string, number>>;
  /** The row keys in row order, for a recipe with rows (a survey's answers, a lineup's guests).
   *  Positional - numbers or letters as the recipe spells them - exactly as the quiz's are. */
  rows?: string[];
  /** The recipe's structural options as chosen (a checkbox each). */
  options?: Record<string, boolean>;
}

/**
 * The quiz binding: which text layers are the question and the answers, and which DRAWN layers
 * show each state (model L2 — the designer says what a state looks like, NoaCG says when).
 *
 * Every layer here is optional. A board with no drawn states still works: it selects, locks and
 * reveals as machine states, and simply shows nothing extra while it does. That is what keeps
 * the beginner path honest — bind two answers and press the buttons, then draw the looks later.
 */
export interface DesignSvgQuizBehaviour {
  kind: 'quiz';
  /** The quiz recipe's options as chosen: `lock` (require lock before reveal, on by default),
   *  `autoReveal` (a timer reveals a few seconds after the lock, off). */
  options?: Record<string, boolean>;
  /** Index into `DesignSvg.fields` of the question line. */
  question: number;
  /** Indices into `DesignSvg.fields` of the answer lines, in row order — A, B, C, … */
  answers: number[];
  /** Per answer row (parallel to `answers`), the drawn states as candidate ids. */
  rows: DesignSvgQuizRow[];
  /** The board-level "locked in" drawing, as a candidate id. */
  locked?: string;
}

/**
 * The poll binding: which drawn layers the live vote paints into
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12).
 *
 * EVERY MEMBER IS A CANDIDATE ID, NEVER A FIELD INDEX, and that is the difference from the quiz
 * above. A quiz's answers are things an operator TYPES, so they are operator fields; a poll's
 * question, options and figures all come from the round the operator opened, so the artwork's
 * layers are DISPLAY TARGETS the runtime writes into — the same posture as a countdown's drawn
 * readout, which is also driven rather than typed. The content itself rides three behaviour-owned
 * fields (`Question`, `Options`, `Vote count`), which is the wire the audience plane already
 * writes (`tallyValues` in ProductionAudienceWorkspace).
 *
 * Every layer is optional. A board with nothing bound still opens, closes and shows a result —
 * it simply paints nothing, which is what keeps the beginner path honest.
 */
export interface DesignSvgPollBehaviour {
  kind: 'poll';
  /** The drawn question line. */
  question?: string;
  /** One row per option, in the order the artwork draws them. */
  rows: DesignSvgPollRow[];
  /** The drawn "1,204 votes" line. */
  total?: string;
  /** The drawn VOTE NOW badge — shown while voting is open, hidden the moment it closes.
   *  This one IS the quiz's drawn-state model (plan §4, L2) reused unchanged. */
  badge?: string;
}

/** One option row of a poll board. */
export interface DesignSvgPollRow {
  /** The drawn option label ("Kyllä"). Written from the round's own options. */
  label?: string;
  /**
   * The drawn BAR, whose length is this option's share.
   *
   * The bar is the piece no drawn state can express (plan §4): a bar has one pose per possible
   * share, so the designer draws it at its FULL length and the runtime interpolates. That is a
   * different answer to §4 from the quiz's, and it is the finding the third behaviour was for.
   */
  bar?: string;
  /** The drawn figure beside the bar ("43%"). Appears with the result, not before it. */
  value?: string;
  /** The drawn winner mark for this row — shown only once a winner is called, and never on a
   *  tie. A drawn state, exactly like the quiz's. */
  winner?: string;
}

/**
 * The SCORE binding: which text layers are each team's name and figure, and which drawn layer
 * flashes when that team scores (docs/backlog/scoreboard-behaviour.md).
 *
 * IT IS THE THIRD SHAPE, AND THE FIRST MIXED ONE. A quiz's answers are things an operator TYPES,
 * so they are field INDICES; a poll's layers are things the audience plane WRITES, so they are
 * candidate ids. A score board is both at once: the team name and the score figure are typed and
 * bumped by the operator, so they are the artwork's own fields, while the flash and the full-time
 * mark are moments the designer drew, so they are candidate ids. Nothing had to be invented for
 * that — the seam already carried both vocabularies, one per behaviour, and this is the first
 * module to want them together.
 *
 * TWO OR MORE TEAMS, NEVER TWO (owner, 2026-09-03: *"a simple score tracker with two or more
 * teams"*). A row is a name and a score, and the count is how many the designer drew: a quiz show
 * with four contestants, a class split into six groups and a two-team match are one graphic with a
 * different row count.
 */
export interface DesignSvgScoreBehaviour {
  kind: 'score';
  /** One row per team, in the order the artwork draws them. */
  rows: DesignSvgScoreRow[];
  /** The board-level FULL TIME drawing, as a candidate id — a drawn state, like the quiz's lock. */
  final?: string;
}

/** One team's row of a score board. */
export interface DesignSvgScoreRow {
  /** Index into `DesignSvg.fields` of the team NAME line — what the operator types. */
  name: number;
  /** Index into `DesignSvg.fields` of the SCORE figure. A number field, which is what lets one
   *  press carry `current + 1` with the event (`adjust`, templates/types/scoreboard.ts). */
  score: number;
  /** The drawn flash for this row — the GOAL! plate, shown while this team's point is the one
   *  that just landed. Optional: a board that drew none still scores, it simply plays nothing. */
  flash?: string;
}

/** The drawn states of one answer row, each a `SvgGroupCandidate` id. */
export interface DesignSvgQuizRow {
  /** Shown while this row is the contestant's pick. */
  selected?: string;
  /** Shown on this row by the reveal when it is the correct answer. */
  correct?: string;
  /** Shown on this row by the reveal when it is NOT the correct answer. */
  wrong?: string;
}

/**
 * The TIMER binding: which drawn layers a countdown shows at each moment
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13).
 *
 * IT BINDS NO CLOCK, AND THAT IS THE POINT. The clock is already a field: a text layer whose
 * sample reads as `M:SS` can be bound as a COUNTDOWN in the mapping step, which makes that node
 * the readout and its field the length in minutes (`DesignSvgField.countdown`, and the shared
 * runtime in templates/shared/clock.ts). The behaviour finds it rather than asking for it a
 * second time, so there is one answer to "which layer is the clock" and no way for two to
 * disagree. What it does ask for is the moments, and every one of them is optional: a board that
 * drew none still counts, pauses, resumes and resets — it simply shows nothing extra while it
 * does, which is the beginner path all three earlier behaviours keep.
 *
 * THE BAR IS THE VOTE BOARD'S MODEL, REACHING A SECOND BEHAVIOUR (§12's L4). A drain bar has one
 * pose per remaining second, so there is nothing to draw and nothing to pick: the designer draws
 * it at its FULL length and the runtime reads that as the whole duration.
 */
export interface DesignSvgTimerBehaviour {
  kind: 'timer';
  /** The drawn bar whose length is the time left, as a candidate id. Drawn FULL. */
  bar?: string;
  /** The drawn last-stretch look — shown once the count is inside the warning threshold. */
  warning?: string;
  /** The drawn HELD mark, shown while the operator has the clock paused. */
  paused?: string;
  /** The drawn TIME UP plate, shown once the count reaches zero. */
  expired?: string;
}

/** A switch or a choice on the artwork's own hidden layers (docs/SVG_BEHAVIOUR_PLAN.md §7c). */
export type DesignSvgExtra =
  | {
      kind: 'switch';
      /** The operator's word for it - the button reads "Show <name>". */
      name: string;
      /** The hidden layer, as a group candidate id. */
      layer: string;
    }
  | {
      kind: 'choice';
      /** The operator's word for the set - the buttons' section. */
      name: string;
      /** Two or more options, each a hidden layer with the word the operator presses. */
      options: { label: string; layer: string }[];
    };

/** One outlined-text group hidden in favour of a placed HTML field. */
export interface DesignSvgOutline {
  /** The group's data-noacg-candidate marker value in the markup. */
  candidateId: string;
}

/** One text layer the author asked to have taken off the artwork. */
export interface DesignSvgHidden {
  /** The layer's data-noacg-candidate marker value in the markup. */
  candidateId: string;
}

/** One SVG picture layer bound as a filelist field. */
export interface DesignSvgImage {
  /** The node's data-noacg-candidate marker value in the markup. */
  candidateId: string;
  /** Operator-facing field label. */
  title: string;
}

/** One SVG text layer bound as an operator field. */
export interface DesignSvgField {
  /** The node's data-noacg-candidate marker value in the markup. */
  candidateId: string;
  /** Operator-facing field label. */
  title: string;
  /** The layer's own text — the sample/default value. */
  sample: string;
  /** True emits ftype "number" (a score, a count) instead of "textfield". */
  numeric: boolean;
  /** True binds the layer as a COUNTDOWN (plan P2 "clock ftype"): the node becomes the
   *  clock display (templates/shared/clock.ts drives it) and the field is the count's
   *  length in minutes, held in a hidden data source. The first such field wins - the
   *  shared runtime drives one clock; any later one binds as plain text. */
  countdown?: boolean;
}

/** How one referenced font family resolves (plan §4). Exactly one of the two sources is
 *  set when resolved; neither means UNRESOLVED — emitted with a warning, never blocked,
 *  because the designer may know the playout machine has the face installed. */
export interface DesignSvgFont {
  /** The family name exactly as the SVG references it. */
  family: string;
  /** A bundled face whose family name matches — its @font-face ships with the template. */
  fontId?: string;
  /** A fetched (Google) or uploaded face, embedded as an asset like any custom font.
   *  Its `family` must equal the SVG's family name for the @font-face to apply. */
  customFont?: CustomFont;
}

/** The imported artwork a design is built on, with the natural size measured at import. */
export interface DesignArt {
  /** Relative asset path, e.g. "images/lower-third.png". */
  path: string;
  /** The design-space size everything positions against. For artwork larger than the frame
   *  (a 2× / retina export is the common case) this is the size scaled down to FIT the frame -
   *  the file keeps its full resolution; only the display size shrinks. */
  width: number;
  height: number;
  /** The file's real pixel size, kept when it differs from the fitted width/height above. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** How the artwork meets text longer than it was drawn for. Absent = fixed (the image
   *  renders exactly as drawn — today's behaviour, and the default). */
  stretch?: DesignStretch;
}

/**
 * The imported artwork's scaling mode, per axis so more modes can be added later without
 * migrating anything: absent = fixed; `horizontal` = a 9-slice whose middle band stretches
 * with the widest text field (lower thirds, straps, name tags); `vertical` is reserved for
 * growing panels. All values are DESIGN px from the artwork's top-left.
 */
export interface DesignStretch {
  /** `left` = where the left cap ends, `right` = where the right cap starts. */
  horizontal?: { left: number; right: number };
  /** Reserved — the vertical axis lands here later with no data migration. */
  vertical?: { top: number; bottom: number };
}
