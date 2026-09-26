import { useState, type ReactNode, type RefObject } from 'react';
import type { DraftPatch, WizardDraft } from '../draft/core';
import type {
  SvgBehaviourDraft,
  SvgExtraDraft,
  SvgPollDraft,
  SvgQuizDraft,
  SvgRecipeDraft,
  SvgRecipeRow,
  SvgScoreDraft,
  SvgTimerDraft,
} from './draft';
import {
  armTimerClock,
  behaviourBindingGaps,
  disarmTimerClock,
  emptyPollRow,
  emptyRecipeRow,
  emptyScoreRow,
  emptyTimerDraft,
  extraLayerName,
  scoreDrawnPool,
} from './draft';
import { SCORE_MAX_ROWS } from '../../../templates/behaviours/score';
import { BEHAVIOUR_WORDS, rolesOf, type RecipeRole } from '../../../templates/behaviours/recipe';
import { BEHAVIOUR_RECIPES, recipeById } from '../../../templates/behaviours/registry';
import {
  clearFill,
  fillGap,
  nameHint,
  pickersOf,
  proposeFill,
  recipeIdOf,
  rowKeysOf,
  withFill,
  type FillBox,
  type FillLayer,
  type FillPick,
} from './fieldAutoMap';
import { measureLayers } from './stageMeasure';
import type { SvgImportResult } from '../../../assets/svgImport';
import SectionHead from '../SectionHead';

/** The two empty choices every behaviour picker offers, written once. One string rather than
 *  fifteen literals: the quiz and the vote ask the same two questions of the same inventory, and
 *  a picker whose empty option read differently from its neighbour's would look like it meant
 *  something different. */
const NOT_DRAWN = 'Not drawn';
/** The quiz's moments fall back to NoaCG's own neutral look (docs/SVG_STATES_FROM_ARTWORK.md, the
 *  ladder's rung 1); every other behaviour's undrawn moment shows nothing extra. */
const DEFAULT_LOOK = 'Not drawn: NoaCG’s own look';
const PICK_A_LAYER = 'Pick a text layer';

/** The four recipes the wizard holds in shapes of their own (draft.ts); every other one is the
 *  generic draft and is listed from the registry. */
const LEGACY_RECIPES = new Set(['quiz', 'score', 'countdown', 'vote']);

/** How many answer rows a quiz board may carry, and the least it can carry. Written once
 *  because the SEED reads off the artwork now (one question, the rest answers) and a seed the
 *  count picker could not display would open the section on a value nobody can get back to. */
const MIN_QUIZ_ANSWERS = 2;
const MAX_QUIZ_ANSWERS = 6;
const QUIZ_ANSWER_COUNTS = Array.from(
  { length: MAX_QUIZ_ANSWERS - MIN_QUIZ_ANSWERS + 1 },
  (_, i) => MIN_QUIZ_ANSWERS + i,
);

/** A picker's label is the ROLE'S OWN WORD (words.json), so the box, the docs' table and the
 *  name hint under the box all say the same thing - the vocabulary ruling in
 *  docs/SVG_STATES_FROM_ARTWORK.md §7: the operator's word and the designer's word are one word. */
function roleLabel(recipeId: string, roleId: string): string {
  const label = rolesOf(recipeId).find((r) => r.id === roleId)?.label ?? roleId;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** THE LINE UNDER A PICKER (docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md,
 *  ask 1): under an EMPTY box, the layer name that would have filled it, read off the matcher;
 *  under a box the fill-them-in press chose, why it chose that layer. Nothing under a box the
 *  reader filled or the drop matched - those need no explaining. */
function NameHint({ hint, filled, testid }: { hint: string | null; filled?: string; testid: string }) {
  if (filled) {
    return (
      <span className="map-svg-name-hint filled" data-testid={`${testid}-why`}>
        filled: {filled}
      </span>
    );
  }
  if (!hint) return null;
  return (
    <span className="map-svg-name-hint" data-testid={`${testid}-hint`}>
      {hint}
    </span>
  );
}

/** What a behaviour is CALLED and what it DOES, in the section summary's two voices - read from
 *  the one word list every recipe declares itself in (templates/behaviours/words.json). */
function behaviourNoun(b: SvgBehaviourDraft): string {
  const words = BEHAVIOUR_WORDS[recipeIdOf(b)];
  return words ? `a ${words.name.toLowerCase().replace(/^the /, '')}` : recipeIdOf(b);
}
function behaviourSummaryLine(b: SvgBehaviourDraft): string {
  const words = BEHAVIOUR_WORDS[recipeIdOf(b)];
  return words ? `${behaviourNoun(b)}: ${words.verbs}` : recipeIdOf(b);
}

/** A recipe's OPTIONS as checkboxes - the first customization rung (docs/SVG_BEHAVIOUR_PLAN.md
 *  §7e): each is a structural variant an expert authored, so ticking one adds or removes arrows
 *  and nothing else. */
function RecipeOptions({
  recipeId,
  values,
  onChange,
}: {
  recipeId: string;
  values: Record<string, boolean>;
  onChange: (values: Record<string, boolean>) => void;
}) {
  const options = recipeById(recipeId)?.options ?? [];
  if (options.length === 0) return null;
  return (
    <div className="map-svg-row" data-testid="map-svg-options">
      {options.map((o) => (
        <label key={o.key} className="save-field" title={o.hint}>
          <input
            type="checkbox"
            checked={values[o.key] ?? o.default}
            onChange={(e) => onChange({ ...values, [o.key]: e.target.checked })}
            data-testid={`map-svg-option-${o.key}`}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * ONE PICKER OVER THE DRAWN LAYERS - a labelled select of every group and rectangle in the file,
 * with "not drawn" first because leaving a moment out is a valid board.
 *
 * The countdown asks this same question four times over the same inventory, differing only in the
 * label and where the answer goes, so it is one component rather than four near-identical blocks
 * of markup. The quiz's and the score board's own pickers are NOT folded in here: theirs sit
 * inside per-row layouts and read the field list as well, so a shared component would have to grow
 * a shape for each of them, which is the abstraction-on-a-sample-of-two this whole area is written
 * to avoid (docs/GRAPHIC_BEHAVIOUR_PLAN.md §6).
 */
function DrawnPicker({
  label,
  value,
  drawn,
  onPick,
  onHover,
  testid,
  hint,
}: {
  label: string;
  value: string;
  drawn: { id: string; label: string; hidden?: boolean }[];
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  testid: string;
  /** The line under the box (NameHint). */
  hint?: ReactNode;
}) {
  return (
    <label className="save-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        onFocus={() => onHover(value || null)}
        data-testid={testid}
      >
        <option value="">{NOT_DRAWN}</option>
        {drawn.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
            {g.hidden ? ' (hidden)' : ''}
          </option>
        ))}
      </select>
      {hint}
    </label>
  );
}

/**
 * WHAT THE ARTWORK DOES, BEYOND SHOWING WHAT IS TYPED INTO IT
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md, docs/SVG_BEHAVIOUR_PLAN.md �7c).
 *
 * The recipe pickers - which layer is the question, which are the answers, which drawn moment
 * is "selected" - plus the fill-them-in guess with its one Undo, and the switches and choices
 * offered for every hidden layer no recipe claimed. It is the largest question the mapping step
 * asks and the only one with five shapes behind it, which is why it is a section of its own.
 *
 * IT OWNS THE FILL EXPLANATION AND NOTHING ELSE. `fill` is an explanation OF the draft rather
 * than part of it - Undo puts `before` back, and a pick is marked under its box only while the
 * box still holds what the fill chose - so it is state here rather than in the draft, and here
 * rather than in the step, because no other section reads it. Everything else arrives as a prop:
 * `textLayers` and `pollDriven` because the checklist above reads them too, and the stage and
 * its measurements because the fill guess measures the step's own render.
 */
export default function BehaviourSection({
  draft,
  onDraft,
  textLayers,
  pollDriven,
  stageRef,
  layerBoxes,
  artworkInk,
  setHoverId,
}: {
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** Every text layer the file draws, ticked or not - the poll picks display targets from all
   *  of them, so this is not the same list as the fields that are ON. */
  textLayers: SvgImportResult['candidates'];
  /** The layers a vote writes, which are display targets rather than operator fields. */
  pollDriven: Set<string>;
  /** The step's off-screen artwork render, for the fill guess's one measurement. */
  stageRef: RefObject<HTMLDivElement | null>;
  layerBoxes: Map<string, FillLayer['box']>;
  /** The artwork's own ink bounds, which is what tells the fill guess whether a layer it is
   *  about to pick is a plate rather than a line (fieldAutoMap `isPlate`). Measured once per
   *  file by the step, because it is a fact about the DRAWING and not about the bindings. */
  artworkInk: FillBox | null;
  /** Point the preview's highlight at a layer while a picker names it. */
  setHoverId: (id: string | null) => void;
}) {
  const [fill, setFill] = useState<{ before: SvgBehaviourDraft; picks: FillPick[] } | null>(null);
  // THE QUIZ's pickers work on the rows that are ON — an answer has to be a real field before it
  // can be an answer, and the list re-reads itself as rows are ticked. THE POLL's do not, and
  // that difference is the behaviour's own (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12): a vote's
  // question, options and figures come from the round rather than from an operator's typing, so
  // its layers are display targets picked out of every text layer the artwork has.
  const onFields = draft.svgFields.filter((f) => f.on);
  const behaviour = draft.svgBehaviour;
  const quiz = behaviour?.kind === 'quiz' ? behaviour : null;
  const poll = behaviour?.kind === 'poll' ? behaviour : null;
  // THE SCORE BOARD'S PICKERS WORK ON THE ROWS THAT ARE ON, like the quiz's and unlike the poll's:
  // a team's name and figure are things the OPERATOR types and bumps, so each has to be a real
  // field before it can be a row (docs/backlog/scoreboard-behaviour.md).
  const score = behaviour?.kind === 'score' ? behaviour : null;
  // THE COUNTDOWN'S PICKERS ARE ALL DRAWN LAYERS, so none of them reads the field rows at all: the
  // clock itself is chosen one section up, by setting a clock-shaped row's kind to Countdown, and
  // asking a second time here would be a second answer to one question
  // (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13).
  const timer = behaviour?.kind === 'timer' ? behaviour : null;
  // ANY OTHER RECIPE WITHOUT ROWS - the meter, the alert - is held generically and its pickers are
  // read off the recipe's own roles, so a recipe added tomorrow needs no new block here.
  const generic = behaviour?.kind === 'recipe' ? behaviour : null;
  const genericRecipe = generic ? recipeById(generic.recipe) : null;
  const genericRoles = genericRecipe?.roles ?? [];
  const genericRows = generic?.rows ?? null;
  const patchGeneric = (patch: Partial<SvgRecipeDraft>) => {
    if (generic) onDraft({ svgBehaviour: { ...generic, ...patch } });
  };
  const patchGenericRow = (at: number, patch: Partial<SvgRecipeRow>) =>
    patchGeneric({ rows: (genericRows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove a row of a generic recipe, keeping every other row's picks beside it. */
  const setGenericRowCount = (want: number) => {
    if (!genericRows) return;
    const rows = [...genericRows];
    while (rows.length < want) rows.push(emptyRecipeRow());
    patchGeneric({ rows: rows.slice(0, want) });
  };
  // ONE POOL FOR THE PICKER AND THE PROPOSAL (draft.ts `scoreDrawnPool`). A moment drawn as a
  // single rectangle - a coloured bar behind a team's row is the ordinary shape of a point flash -
  // is proposable, so it has to be selectable, or the row shows "not drawn" for a layer it really
  // is bound to and touching the select loses that binding.
  const scoreDrawn = scoreDrawnPool(draft.designSvg ?? { groups: [], shapes: [] });

  const patchQuiz = (patch: Partial<SvgQuizDraft>) => {
    if (quiz) onDraft({ svgBehaviour: { ...quiz, ...patch } });
  };
  const patchQuizRow = (at: number, patch: Partial<SvgQuizDraft['rows'][number]>) =>
    patchQuiz({ rows: (quiz?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove an answer row, keeping its drawn states beside it. */
  const setAnswerCount = (want: number) => {
    if (!quiz) return;
    const n = Math.min(Math.max(want, MIN_QUIZ_ANSWERS), MAX_QUIZ_ANSWERS);
    const answers = [...quiz.answers];
    const rows = [...quiz.rows];
    while (answers.length < n) {
      answers.push('');
      rows.push({ selected: '', correct: '', wrong: '' });
    }
    patchQuiz({ answers: answers.slice(0, n), rows: rows.slice(0, n) });
  };

  const patchPoll = (patch: Partial<SvgPollDraft>) => {
    if (poll) onDraft({ svgBehaviour: { ...poll, ...patch } });
  };
  /** The text layers the VOTE drives, so they stop being operator fields. `draftToOptions` drops
   *  them from the field list; this is the same set, read out, so nobody has to discover it by
   *  noticing a field went missing. */
  const pollDrivenNames = draft.svgFields
    .filter((f) => f.on && pollDriven.has(f.candidateId))
    .map((f) => f.title.trim() || 'Text');
  const patchPollRow = (at: number, patch: Partial<SvgPollDraft['rows'][number]>) =>
    patchPoll({ rows: (poll?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove an option row, keeping its bar and figure beside it. */
  const setOptionCount = (n: number) => {
    if (!poll) return;
    const rows = [...poll.rows];
    while (rows.length < n) rows.push(emptyPollRow());
    patchPoll({ rows: rows.slice(0, n) });
  };

  const patchScore = (patch: Partial<SvgScoreDraft>) => {
    if (score) onDraft({ svgBehaviour: { ...score, ...patch } });
  };
  const patchScoreRow = (at: number, patch: Partial<SvgScoreDraft['rows'][number]>) =>
    patchScore({ rows: (score?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove a team row, keeping its flash beside it. */
  const setTeamCount = (n: number) => {
    if (!score) return;
    const rows = [...score.rows];
    while (rows.length < n) rows.push(emptyScoreRow());
    patchScore({ rows: rows.slice(0, n) });
  };

  const patchTimer = (patch: Partial<SvgTimerDraft>) => {
    if (timer) onDraft({ svgBehaviour: { ...timer, ...patch } });
  };

  /** What the artwork ALREADY gives the operator, and what the binding still owes — both read
   *  out so the "What it does" section can be true rather than merely short. */
  const numberFields = onFields.filter((f) => f.numeric && f.kind !== 'countdown');
  const steppers =
    numberFields.length === 0
      ? ''
      : numberFields.length === 1
        ? 'one number, with + and −'
        : `${numberFields.length} numbers, each with + and −`;
  const behaviourGaps = behaviourBindingGaps(draft);

  // ── THE STEP EXPLAINS ITSELF, AND OFFERS TO DO THE REST (fieldAutoMap.ts) ──
  // The inventories the fill may draw on are EXACTLY what the pickers below offer, for the same
  // reason `scoreDrawnPool` gives: a guess that picks something a box cannot show is a binding
  // the reader cannot correct. The quiz's and the score board's text is the ticked rows; the
  // vote's and any generic recipe's is every text layer; the quiz's drawings are groups only.
  const recipeId = behaviour ? recipeIdOf(behaviour) : null;
  const fillText: FillLayer[] =
    quiz || score
      ? onFields.map((f) => ({ id: f.candidateId, label: f.title, numeric: f.numeric }))
      : textLayers.map((c) => ({ id: c.id, label: c.label, numeric: c.numeric }));
  const fillDrawn: FillLayer[] = quiz
    ? (draft.designSvg?.groups ?? []).map((g) => ({ id: g.id, label: g.label, hidden: g.hidden }))
    : scoreDrawn.map((g) => ({ id: g.id, label: g.label, hidden: g.hidden }));
  // A hidden group already declared a switch or a choice is in use, whatever the pickers say.
  const fillTaken = draft.svgExtras.map((e) => e.candidateId);
  const fillPickers = behaviour ? pickersOf(behaviour, fillText) : [];
  /** Each row's key as the hints and the fill speak it - the key the row's own layer carries. */
  const rowKeyAt = behaviour ? rowKeysOf(behaviour, fillText) : [];
  /** A layer with the box the artwork was measured at, so the count can tell the board's own
   *  plate from something drawn on it. Before the measurement lands every box is absent, which
   *  is the count this notice had before geometry reached it. */
  const withBox = (l: FillLayer): FillLayer => ({ ...l, box: layerBoxes.get(l.id) ?? null });
  const gap =
    behaviour && recipeId
      ? fillGap(recipeId, fillPickers, fillText.map(withBox), fillDrawn.map(withBox), fillTaken, artworkInk)
      : { empty: 0, spare: 0 };
  // The fill's marks belong to the recipe they were made on; a change of behaviour orphans
  // them, and an orphaned mark would explain a box that no longer exists.
  const fillShown = fill && behaviour && recipeIdOf(fill.before) === recipeId ? fill : null;
  /** The reason under a box, while the box still holds what the fill chose. */
  const filledWhy = (role: string, key: string | undefined, value: string): string | undefined =>
    fillShown?.picks.find((p) => p.role === role && p.key === key && p.candidateId === value)?.reason;
  const hintFor = (role: string, key: string | undefined, value: string, testid: string) => (
    <NameHint hint={!value && recipeId ? nameHint(recipeId, role, key) : null} filled={filledWhy(role, key, value)} testid={testid} />
  );
  /** One picker of a generic recipe, whichever pool its role reads from. Shared by the
   *  graphic-level and the per-row boxes so the two cannot offer different inventories. */
  const genericPicker = (role: RecipeRole, value: string, key: string | undefined, testid: string, set: (id: string) => void) =>
    role.kind === 'field' ? (
      <label className="save-field" key={testid}>
        <span>{role.label}</span>
        <select value={value} onChange={(e) => set(e.target.value)} onFocus={() => setHoverId(value || null)} data-testid={testid}>
          <option value="">{PICK_A_LAYER}</option>
          {onFields.map((f) => (
            <option key={f.candidateId} value={f.candidateId}>
              {f.title}
            </option>
          ))}
        </select>
        {hintFor(role.id, key, value, testid)}
      </label>
    ) : role.pool === 'text' ? (
      <label className="save-field" key={testid}>
        <span>{role.label}</span>
        <select value={value} onChange={(e) => set(e.target.value)} onFocus={() => setHoverId(value || null)} data-testid={testid}>
          <option value="">{NOT_DRAWN}</option>
          {textLayers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {hintFor(role.id, key, value, testid)}
      </label>
    ) : (
      <DrawnPicker key={testid} label={role.label} value={value} drawn={scoreDrawn} onPick={set} onHover={setHoverId} testid={testid} hint={hintFor(role.id, key, value, testid)} />
    );
  const fillThemIn = () => {
    if (!behaviour || !recipeId) return;
    const stage = stageRef.current;
    const measured = stage
      ? measureLayers(stage, [...fillText, ...fillDrawn].map((l) => l.id))
      : new Map<string, Pick<FillLayer, 'box' | 'color'>>();
    const withGeometry = (l: FillLayer): FillLayer => ({ ...l, ...(measured.get(l.id) ?? {}) });
    // The ink is the step's own standing measurement of EVERY candidate, never this press's:
    // the press reads only what the two pools offer, and a picture or an outlined title is ink
    // a reader sees.
    const picks = proposeFill(
      recipeId,
      fillPickers,
      fillText.map(withGeometry),
      fillDrawn.map(withGeometry),
      fillTaken,
      artworkInk,
    );
    setFill({ before: behaviour, picks });
    if (picks.length > 0) onDraft({ svgBehaviour: withFill(behaviour, picks, fillText) });
  };
  // UNDO EMPTIES THE BOXES THE FILL FILLED and nothing else: a box the reader changed since, a
  // row they added, an option they ticked all stay - the press is taken back, not the minutes
  // after it.
  const undoFill = () => {
    if (behaviour && fillShown && fillShown.picks.length > 0) onDraft({ svgBehaviour: clearFill(behaviour, fillShown.picks, fillText) });
    setFill(null);
  };

  // THE SWITCHES AND CHOICES (docs/SVG_BEHAVIOUR_PLAN.md §7c): every hidden group the behaviour
  // above did not claim is offered the same two answers. A hidden layer is a moment the designer
  // drew; the recipe's pickers take the ones it has words for, and this is the road for every
  // other one - an award's winner name, a sponsor tag, a map's highlight.
  const claimed = new Set<string>();
  if (behaviour) {
    const collect = (value: unknown) => {
      if (typeof value === 'string') claimed.add(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(behaviour);
  }
  const hiddenUnclaimed = (draft.designSvg?.groups ?? []).filter((g) => g.hidden && !claimed.has(g.id));
  /** A type with drawn MOMENTS to bind (a look shown and hidden, never a bar drawn full, which
   *  is visible by design), in a file with no hidden layer to bind them to. */
  const noHiddenLayers =
    !!behaviour &&
    rolesOf(recipeIdOf(behaviour)).some(
      (r) => r.kind === 'layer' && (r.pool ?? 'drawn') === 'drawn' && !!r.paint?.includes('look'),
    ) &&
    !(draft.designSvg?.groups ?? []).some((g) => g.hidden);
  const extraOf = (id: string): SvgExtraDraft | undefined => draft.svgExtras.find((e) => e.candidateId === id);
  const patchExtra = (g: { id: string; label: string }, patch: Omit<Partial<SvgExtraDraft>, 'use'> & { use?: SvgExtraDraft['use'] | '' }) => {
    const rest = draft.svgExtras.filter((e) => e.candidateId !== g.id);
    if (patch.use === '') return onDraft({ svgExtras: rest });
    const current = extraOf(g.id) ?? { candidateId: g.id, use: 'switch' as const, name: extraLayerName(g.label) };
    const { use, ...fields } = patch;
    const next: SvgExtraDraft = { ...current, ...fields, ...(use ? { use } : {}) };
    if (next.use === 'choice' && !next.group) next.group = 'Choice';
    if (next.use === 'switch') delete next.group;
    onDraft({ svgExtras: [...rest, next] });
  };
  const extraCounts = (() => {
    const switches = draft.svgExtras.filter((e) => e.use === 'switch' && hiddenUnclaimed.some((g) => g.id === e.candidateId)).length;
    const choiceNames = new Set(draft.svgExtras.filter((e) => e.use === 'choice' && hiddenUnclaimed.some((g) => g.id === e.candidateId)).map((e) => e.group ?? ''));
    const parts = [
      switches > 0 ? `${switches} ${switches === 1 ? 'switch' : 'switches'}` : '',
      choiceNames.size > 0 ? `${choiceNames.size} ${choiceNames.size === 1 ? 'choice' : 'choices'}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'none - the hidden layers stay as drawn';
  })();

  return (
    <>
      {(textLayers.length > 0 || (draft.designSvg?.groups.length ?? 0) > 0) && (
        <div className="panel-section" data-testid="map-svg-behaviour">
          <SectionHead
            title="What it does"
            summary={
              behaviour
                ? behaviourGaps.length > 0
                  ? `${behaviourNoun(behaviour)}, once you say ${behaviourGaps[0]}`
                  : behaviourSummaryLine(behaviour)
                : steppers || 'it just comes on and off'
            }
            testid="map-svg-why-behaviour"
          >
            {/* THE LIST BELOW ALREADY SAYS WHAT EACH ONE DOES, one line each, so a paragraph
                naming all three again was the step reading itself out loud (owner walk,
                2026-09-03: "it needs to be shorter and just what it does"). */}
            <p>Pick one and the operator gets real buttons on the control page for it.</p>
            <p>
              Your artwork does not change. You say which drawn layer shows at each moment. Leave
              a quiz moment undrawn and NoaCG paints its own neutral look for it; every other
              behaviour shows nothing extra there, and still works.
            </p>
            {/* SAY WHAT THE ARTWORK ALREADY EARNED. A scoreboard is the case that made this
                necessary: a layer holding a plain figure becomes a number field and every control
                surface draws one as a ± stepper. The step offered "Nothing. It comes on and off.",
                the reader read the whole list as "there is no scoreboard here", and nothing
                anywhere said their scores were already drivable. It used to end "that is the whole
                of a scoreboard", which stopped being true the day the score tracker shipped: the
                steppers are still a real road, and they play nothing and reset nothing. */}
            {numberFields.length > 0 && (
              <p data-testid="map-svg-behaviour-steppers">
                {numberFields.length === 1 ? 'One layer holds' : `${numberFields.length} layers hold`}{' '}
                a plain figure ({numberFields.map((f) => f.title).join(', ')}), so the operator
                already gets a + and a − for {numberFields.length === 1 ? 'it' : 'each'}, with no
                behaviour chosen. The score tracker adds the flash you drew and a reset between
                games.
              </p>
            )}
          </SectionHead>
          <label className="save-field">
            <span>Behaviour</span>
            <select
              value={behaviour ? (behaviour.kind === 'recipe' ? behaviour.recipe : behaviour.kind) : 'none'}
              onChange={(e) => {
                const want = e.target.value;
                // LEAVING THE COUNTDOWN PUTS BACK THE CLOCK ROW IT ARMED, and nothing else
                // (draft.ts `disarmTimerClock`). Nothing downstream reads the BEHAVIOUR to decide
                // whether a layer ticks - it reads the ROW - so an arming left behind would ship a
                // graphic counting down on air under an author who had changed their mind.
                const svgFields = want === 'timer' ? draft.svgFields : disarmTimerClock(draft.svgFields);
                if (want === 'none') return onDraft({ svgBehaviour: null, svgFields });
                if (want === 'quiz') {
                  // ONE QUESTION, AND THE REST ARE ANSWERS (owner walk, 2026-09-03: "it defaults
                  // to two answers when you can clearly identify five text boxes, where one is
                  // the question. It should just default to four answers"). The count is read
                  // off the ticked text rows instead of being fixed at two, so a five-row board
                  // opens with four answers already bound. Asking a reader to add the rows their
                  // own artwork draws is asking a question the file answered.
                  // Bounded by the count picker's own range, so the seed is always a value that
                  // select can show, and never below the two the behaviour needs.
                  const seeded = Math.min(
                    Math.max(onFields.length - 1, MIN_QUIZ_ANSWERS),
                    MAX_QUIZ_ANSWERS,
                  );
                  return onDraft({
                    svgBehaviour: quiz ?? {
                      kind: 'quiz',
                      question: onFields[0]?.candidateId ?? '',
                      answers: Array.from({ length: seeded }, (_, i) => onFields[i + 1]?.candidateId ?? ''),
                      rows: Array.from({ length: seeded }, () => ({ selected: '', correct: '', wrong: '' })),
                      locked: '',
                    },
                    svgFields,
                  });
                }
                if (want === 'timer') {
                  // NOTHING IS GUESSED ABOUT THE DRAWINGS - the pickers are the road, and the
                  // proposal is the only shortcut. What the seed DOES do is bind the clock, using
                  // the same rule the drop applies to a PROPOSED timer (`armTimerClock`): a reader
                  // who picks "Countdown" and is then told to go back up the page and change a
                  // row's kind has been given homework by the step that asked the question.
                  const seeded = timer ?? emptyTimerDraft();
                  return onDraft({ svgBehaviour: seeded, svgFields: armTimerClock(svgFields, seeded) });
                }
                if (want === 'score') {
                  // Two empty team rows, for the poll's reason: the pickers are the road, and
                  // guessing which of somebody's fifteen layers is team one would put a team's
                  // points on the wrong figure without saying so.
                  return onDraft({ svgBehaviour: score ?? { kind: 'score', rows: [emptyScoreRow(), emptyScoreRow()], final: '' }, svgFields });
                }
                const wanted = recipeById(want);
                if (wanted && !wanted.instanced) {
                  // Any other recipe is held generically. A recipe with rows opens on its minimum,
                  // every picker empty, for the poll's reason: guessing which of somebody's
                  // fifteen layers is row one would bind the wrong drawing without saying so.
                  const seeded: SvgRecipeDraft = {
                    kind: 'recipe',
                    recipe: want,
                    layers: {},
                    ...(wanted.rows ? { rows: Array.from({ length: wanted.rows.min }, emptyRecipeRow) } : {}),
                    options: {},
                  };
                  return onDraft({ svgBehaviour: generic?.recipe === want ? generic : seeded, svgFields });
                }
                // A fresh vote starts with two empty option rows and nothing else picked. Empty
                // rather than seeded from the first layers in the file: a poll's layers are
                // display targets, and guessing which of somebody's fifteen layers is option one
                // would put the count on the wrong drawing without saying so.
                onDraft({ svgBehaviour: poll ?? { kind: 'poll', question: '', rows: [emptyPollRow(), emptyPollRow()], total: '', badge: '' }, svgFields });
              }}
              data-testid="map-svg-behaviour-kind"
            >
              <option value="none">
                {numberFields.length > 0
                  ? 'Nothing extra. The number layers already get + and −.'
                  : 'Nothing. It comes on and off.'}
              </option>
              <option value="quiz">Quiz. Select an answer, lock it in, reveal it.</option>
              <option value="poll">Live vote. The room votes; the bars move; you show the result.</option>
              <option value="score">Score tracker. A point per press, per team, and a new game.</option>
              <option value="timer">Countdown. It starts on air; you hold it, let it go, reset it.</option>
              {/* Every other recipe, from the registry: a recipe added tomorrow is offered here
                  with no new line, in the words its declaration carries. */}
              {BEHAVIOUR_RECIPES.filter((r) => !r.instanced && !LEGACY_RECIPES.has(r.id)).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}. {r.description}
                </option>
              ))}
            </select>
          </label>
          {/* THE HIDDEN LAYERS DID NOT ARRIVE. Illustrator's Export As writes no hidden layer at
              all (measured on 30.1, docs/backlog/illustrator-export-as-drops-hidden-layers.md), so
              a quiz drawn with twelve moments arrives as a quiz with none and every picker reads
              "NoaCG's own look" - and nothing said a thing. Said once, on a file that is a type
              with drawn moments and holds NO hidden layer, in the words the docs use. A file whose
              moments really were not drawn reads the same sentence and loses nothing by it. */}
          {behaviour && noHiddenLayers && (
            <p className="map-svg-note" data-testid="map-svg-hidden-missing">
              This file has no hidden layers. If you drew some, Illustrator&rsquo;s Export As left
              them out: save with File &gt; Save a Copy &gt; SVG instead and drop the file again.
            </p>
          )}
          {/* A binding that will be DROPPED says so here rather than at create time. Same rule
              as `svgBehaviourOption`'s, read from one function, so the sentence cannot drift
              from the decision. */}
          {behaviourGaps.length > 0 && (
            <p className="map-svg-note" data-testid="map-svg-behaviour-missing">
              Still to say: {behaviourGaps.join(', ')}. Until then this graphic just comes on and
              off.
            </p>
          )}
          {/* A LOT DID NOT MATCH (backlog ask 2). THREE is the line: one or two empty boxes are
              what the line under each box already answers, three with unused layers in the file
              is where clicking through starts being the chore the owner named, and the file
              having layers nothing is using is what says the names, not the drawing, are what
              fell short. A board with nothing drawn shows nothing here: its boxes are empty
              because there is nothing to put in them, which is a valid board. */}
          {behaviour && !fillShown && gap.empty >= 3 && gap.spare > 0 && (
            <p className="map-svg-note" data-testid="map-svg-unmatched">
              {gap.empty} boxes below are still empty, and the file has {gap.spare}{' '}
              {gap.spare === 1 ? 'layer' : 'layers'} nothing is using. Their names did not say what
              they are. Name them as the line under each box says and drop the file again, pick
              them by hand, or press Fill them in and check what it chose.
            </p>
          )}
          {/* ONE PRESS FOR THE REST (backlog ask 3). What it chose is shown under each box and
              can be undone as one step, because a silent fill is worse than sixteen boxes. */}
          {behaviour && (fillShown || (gap.empty > 0 && gap.spare > 0)) && (
            <div className="map-svg-fill" data-testid="map-svg-fill">
              {fillShown ? (
                <>
                  <span className="hint" data-testid="map-svg-fill-result">
                    {fillShown.picks.length === 0
                      ? 'Nothing filled: no unused layer sits where an empty box would need it. Pick them by hand.'
                      : `Filled ${fillShown.picks.length} ${fillShown.picks.length === 1 ? 'box' : 'boxes'} from the names and from where each layer sits. The line under each says why; check them.`}
                  </span>
                  <button type="button" onClick={undoFill} data-testid="map-svg-fill-undo">
                    {fillShown.picks.length === 0 ? 'OK' : 'Undo'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={fillThemIn} data-testid="map-svg-fill-button">
                  Fill them in
                </button>
              )}
            </div>
          )}
          {poll && (
            <>
              {/* WHERE THE NUMBERS COME FROM, said once and plainly. A reader who has just picked
                  "Live vote" is owed the shape of the thing: the counts are not typed, and
                  nothing a viewer sends reaches air on its own. */}
              <p className="hint" data-testid="map-svg-poll-how">
                Open a vote from the production’s Audience tab and the room votes at your join
                link. The counts land on this graphic as an ordinary cue, which you still Take,
                so nothing a viewer sends can reach air by itself.
              </p>
              {/* A field that will VANISH says so here rather than being noticed missing on the
                  control page — the same "say what the thing has and what it lacks" rule
                  `missingParts` follows on the catalog side. The NAMES are not repeated here: each
                  of those rows now says it on itself, in place of the boxes it used to offer. */}
              {pollDrivenNames.length > 0 && (
                <p className="map-svg-note" data-testid="map-svg-poll-driven">
                  The vote writes {pollDrivenNames.length} of the layers you ticked above, so there
                  is nothing to type into {pollDrivenNames.length === 1 ? 'it' : 'them'}. Those rows
                  are marked, and they fill from the round you open on the production’s Audience
                  tab. Everything else stays a field.
                </p>
              )}
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Question</span>
                  <select
                    value={poll.question}
                    onChange={(e) => patchPoll({ question: e.target.value })}
                    onFocus={() => setHoverId(poll.question || null)}
                    data-testid="map-svg-poll-question"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {textLayers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {hintFor('question', undefined, poll.question, 'map-svg-poll-question')}
                </label>
                <label className="save-field">
                  <span>Options</span>
                  <select
                    value={String(poll.rows.length)}
                    onChange={(e) => setOptionCount(Number(e.target.value))}
                    data-testid="map-svg-poll-count"
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} options
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Per option: the layer holding its wording, the bar whose length is its share, the
                figure beside it, and a winner mark if you drew one. The bar is measured at the
                length you drew it, and that length is 100%.
              </p>
              {/* The row layout is the quiz's, reused rather than restated: a marker, one wide
                  picker and a group of three that wraps as one. Same shape, same problem. */}
              {poll.rows.map((row, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-poll-row-${at}`}>
                  <span className="map-svg-quiz-letter">{at + 1}</span>
                  <label className="save-field grow">
                    <span>Option text</span>
                    <select
                      value={row.label}
                      onChange={(e) => patchPollRow(at, { label: e.target.value })}
                      onFocus={() => setHoverId(row.label || null)}
                      data-testid={`map-svg-poll-label-${at}`}
                    >
                      <option value="">{NOT_DRAWN}</option>
                      {textLayers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {hintFor('option', rowKeyAt[at], row.label, `map-svg-poll-label-${at}`)}
                  </label>
                  <div className="map-svg-quiz-states">
                    <label className="save-field">
                      <span>Bar</span>
                      <select
                        value={row.bar}
                        onChange={(e) => patchPollRow(at, { bar: e.target.value })}
                        onFocus={() => setHoverId(row.bar || null)}
                        data-testid={`map-svg-poll-bar-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {(draft.designSvg?.shapes ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                        {(draft.designSvg?.groups ?? []).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('bar', rowKeyAt[at], row.bar, `map-svg-poll-bar-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Figure</span>
                      <select
                        value={row.value}
                        onChange={(e) => patchPollRow(at, { value: e.target.value })}
                        onFocus={() => setHoverId(row.value || null)}
                        data-testid={`map-svg-poll-value-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {textLayers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      {hintFor('percent', rowKeyAt[at], row.value, `map-svg-poll-value-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Winner</span>
                      <select
                        value={row.winner}
                        onChange={(e) => patchPollRow(at, { winner: e.target.value })}
                        onFocus={() => setHoverId(row.winner || null)}
                        data-testid={`map-svg-poll-winner-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {(draft.designSvg?.groups ?? []).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('winner', rowKeyAt[at], row.winner, `map-svg-poll-winner-${at}`)}
                    </label>
                  </div>
                </div>
              ))}
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Vote count</span>
                  <select
                    value={poll.total}
                    onChange={(e) => patchPoll({ total: e.target.value })}
                    onFocus={() => setHoverId(poll.total || null)}
                    data-testid="map-svg-poll-total"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {textLayers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {hintFor('total', undefined, poll.total, 'map-svg-poll-total')}
                </label>
                <label className="save-field grow">
                  <span>VOTE NOW badge</span>
                  <select
                    value={poll.badge}
                    onChange={(e) => patchPoll({ badge: e.target.value })}
                    onFocus={() => setHoverId(poll.badge || null)}
                    data-testid="map-svg-poll-badge"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {(draft.designSvg?.groups ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                        {g.hidden ? ' (hidden)' : ''}
                      </option>
                    ))}
                  </select>
                  {hintFor('badge', undefined, poll.badge, 'map-svg-poll-badge')}
                </label>
              </div>
            </>
          )}
          {score && (
            <>
              {/* WHAT THE OPERATOR WILL GET, said once and plainly - a reader who has just picked
                  "Score tracker" is owed the shape of the thing before they fill in five pickers.
                  The verbs are the surveyed ones (docs/SCORE_CONTROL_SURVEY.md). */}
              <p className="hint" data-testid="map-svg-score-how">
                Each team gets a +1 and a −1 button on the control page. The +1 plays that team’s
                flash if you drew one; the −1 takes the point and the flash back. “New game” puts
                every score to zero.
              </p>
              <div className="map-svg-row">
                <label className="save-field">
                  <span>Teams</span>
                  <select
                    value={String(score.rows.length)}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
                    data-testid="map-svg-score-count"
                  >
                    {Array.from({ length: SCORE_MAX_ROWS - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n} teams
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Per team: its name layer, its score layer, and the flash you drew for a point if
                you drew one. The score layer has to hold a plain figure.
              </p>
              {score.rows.map((row, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-score-row-${at}`}>
                  <span className="map-svg-quiz-letter">{at + 1}</span>
                  <label className="save-field grow">
                    <span>Team name</span>
                    <select
                      value={row.name}
                      onChange={(e) => patchScoreRow(at, { name: e.target.value })}
                      onFocus={() => setHoverId(row.name || null)}
                      data-testid={`map-svg-score-name-${at}`}
                    >
                      <option value="">{PICK_A_LAYER}</option>
                      {onFields.map((f) => (
                        <option key={f.candidateId} value={f.candidateId}>
                          {f.title}
                        </option>
                      ))}
                    </select>
                    {hintFor('team', rowKeyAt[at], row.name, `map-svg-score-name-${at}`)}
                  </label>
                  <div className="map-svg-quiz-states">
                    <label className="save-field">
                      <span>Score</span>
                      <select
                        value={row.score}
                        onChange={(e) => patchScoreRow(at, { score: e.target.value })}
                        onFocus={() => setHoverId(row.score || null)}
                        data-testid={`map-svg-score-figure-${at}`}
                      >
                        <option value="">{PICK_A_LAYER}</option>
                        {onFields.map((f) => (
                          <option key={f.candidateId} value={f.candidateId}>
                            {f.title}
                            {f.numeric ? '' : ' (not a number)'}
                          </option>
                        ))}
                      </select>
                      {hintFor('score', rowKeyAt[at], row.score, `map-svg-score-figure-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Flash</span>
                      <select
                        value={row.flash}
                        onChange={(e) => patchScoreRow(at, { flash: e.target.value })}
                        onFocus={() => setHoverId(row.flash || null)}
                        data-testid={`map-svg-score-flash-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {scoreDrawn.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('team.flash', rowKeyAt[at], row.flash, `map-svg-score-flash-${at}`)}
                    </label>
                  </div>
                </div>
              ))}
              <label className="save-field">
                <span>Full time</span>
                <select
                  value={score.final}
                  onChange={(e) => patchScore({ final: e.target.value })}
                  onFocus={() => setHoverId(score.final || null)}
                  data-testid="map-svg-score-final"
                >
                  <option value="">{NOT_DRAWN}</option>
                  {scoreDrawn.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                      {g.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
                {hintFor('final', undefined, score.final, 'map-svg-score-final')}
              </label>
            </>
          )}
          {timer && (
            <>
              {/* WHAT THE OPERATOR WILL GET, said once and plainly, exactly as the score board's
                  and the vote's sections say it. The verbs are the surveyed ones
                  (docs/BEHAVIOUR_SURVEY.md); "starts on air" is the owner ruling this behaviour
                  was built to (the retired owner rulings, operator-stories-2026-08-27). */}
              <p className="hint" data-testid="map-svg-timer-how">
                The count starts when you Take the graphic, and holds at 0:00 until you take it
                out. The control page gets Start, Pause and Reset, and the length in minutes is a
                field you can correct on air.
              </p>
              <p className="hint">
                Every layer below is optional. Leave one out and nothing extra shows, and the
                clock still starts, holds and resets.
              </p>
              <DrawnPicker
                label={roleLabel('countdown', 'bar')}
                value={timer.bar}
                drawn={scoreDrawn}
                onPick={(bar) => patchTimer({ bar })}
                onHover={setHoverId}
                testid="map-svg-timer-bar"
                hint={hintFor('bar', undefined, timer.bar, 'map-svg-timer-bar')}
              />
              {/* THE ONE SENTENCE A DESIGNER HAS TO READ. A bar is the layer with no separate
                  looks - it has one length per second left - so it is drawn at the extreme and
                  interpolated, which is the vote board's L4 model reaching a second behaviour
                  (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). Drawn half-length it would read as half
                  the time from the first frame. */}
              <p className="hint" data-testid="map-svg-timer-bar-note">
                Draw the bar at its FULL length. That length is the whole count, and NoaCG
                shortens it as the time goes.
              </p>
              <DrawnPicker
                label={roleLabel('countdown', 'warning')}
                value={timer.warning}
                drawn={scoreDrawn}
                onPick={(warning) => patchTimer({ warning })}
                onHover={setHoverId}
                testid="map-svg-timer-warning"
                hint={hintFor('warning', undefined, timer.warning, 'map-svg-timer-warning')}
              />
              <DrawnPicker
                label={roleLabel('countdown', 'paused')}
                value={timer.paused}
                drawn={scoreDrawn}
                onPick={(paused) => patchTimer({ paused })}
                onHover={setHoverId}
                testid="map-svg-timer-paused"
                hint={hintFor('paused', undefined, timer.paused, 'map-svg-timer-paused')}
              />
              <DrawnPicker
                label={roleLabel('countdown', 'expired')}
                value={timer.expired}
                drawn={scoreDrawn}
                onPick={(expired) => patchTimer({ expired })}
                onHover={setHoverId}
                testid="map-svg-timer-expired"
                hint={hintFor('expired', undefined, timer.expired, 'map-svg-timer-expired')}
              />
            </>
          )}
          {generic && (
            <>
              <p className="hint" data-testid="map-svg-recipe-how">
                {behaviourSummaryLine(generic)}. The operator gets {BEHAVIOUR_WORDS[generic.recipe]?.buttons ?? 'its buttons'}.
              </p>
              {/* GRAPHIC-LEVEL ROLES, one picker each, read off the declaration: a field role
                  from the ticked rows (it becomes what the operator types), a written text
                  role from every text layer, a drawing from the drawn pool. */}
              {genericRoles
                .filter((role) => !role.perRow && !role.countdown)
                .map((role) => {
                  const value = (role.kind === 'field' ? generic.fields?.[role.id] : generic.layers[role.id]) ?? '';
                  const testid = `map-svg-recipe-${role.id}`;
                  const set = (id: string) =>
                    role.kind === 'field'
                      ? patchGeneric({ fields: { ...(generic.fields ?? {}), [role.id]: id } })
                      : patchGeneric({ layers: { ...generic.layers, [role.id]: id } });
                  return genericPicker(role, value, undefined, testid, set);
                })}
              {genericRows && genericRecipe?.rows && (
                <>
                  <label className="save-field">
                    <span>{genericRecipe.rows.role.charAt(0).toUpperCase() + genericRecipe.rows.role.slice(1)} rows</span>
                    <select
                      value={String(genericRows.length)}
                      onChange={(e) => setGenericRowCount(Number(e.target.value))}
                      data-testid="map-svg-recipe-count"
                    >
                      {Array.from({ length: genericRecipe.rows.max - genericRecipe.rows.min + 1 }, (_, i) => genericRecipe.rows!.min + i).map((n) => (
                        <option key={n} value={n}>
                          {n} rows
                        </option>
                      ))}
                    </select>
                  </label>
                  {genericRows.map((row, at) => (
                    <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-recipe-row-${at}`}>
                      <span className="map-svg-quiz-letter">{rowKeyAt[at] ?? at + 1}</span>
                      <div className="map-svg-quiz-states">
                        {genericRoles
                          .filter((role) => role.perRow)
                          .map((role) => {
                            const value = (role.kind === 'field' ? row.fields[role.id] : row.layers[role.id]) ?? '';
                            const testid = `map-svg-recipe-${role.id}-${at}`;
                            const set = (id: string) =>
                              patchGenericRow(at, role.kind === 'field' ? { fields: { ...row.fields, [role.id]: id } } : { layers: { ...row.layers, [role.id]: id } });
                            return genericPicker(role, value, rowKeyAt[at], testid, set);
                          })}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <RecipeOptions recipeId={generic.recipe} values={generic.options} onChange={(options) => patchGeneric({ options })} />
            </>
          )}
          {quiz && (
            <>
              <RecipeOptions recipeId="quiz" values={quiz.options ?? {}} onChange={(options) => patchQuiz({ options })} />
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Question</span>
                  <select
                    value={quiz.question}
                    onChange={(e) => patchQuiz({ question: e.target.value })}
                    data-testid="map-svg-quiz-question"
                  >
                    <option value="">{PICK_A_LAYER}</option>
                    {onFields.map((f) => (
                      <option key={f.candidateId} value={f.candidateId}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                  {hintFor('question', undefined, quiz.question, 'map-svg-quiz-question')}
                </label>
                <label className="save-field">
                  <span>Answers</span>
                  <select
                    value={String(quiz.answers.length)}
                    onChange={(e) => setAnswerCount(Number(e.target.value))}
                    data-testid="map-svg-quiz-count"
                  >
                    {QUIZ_ANSWER_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n} answers
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Each answer needs its text layer. The selected, correct and wrong drawings are
                yours to leave out.
              </p>
              {quiz.answers.map((answerId, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-quiz-row-${at}`}>
                  <span className="map-svg-quiz-letter">{String.fromCharCode(65 + at)}</span>
                  <label className="save-field grow">
                    <span>Answer text</span>
                    <select
                      value={answerId}
                      onChange={(e) =>
                        patchQuiz({
                          answers: quiz.answers.map((a, i) => (i === at ? e.target.value : a)),
                        })
                      }
                      data-testid={`map-svg-quiz-answer-${at}`}
                    >
                      <option value="">{PICK_A_LAYER}</option>
                      {onFields.map((f) => (
                        <option key={f.candidateId} value={f.candidateId}>
                          {f.title}
                        </option>
                      ))}
                    </select>
                    {hintFor('answer', rowKeyAt[at], answerId, `map-svg-quiz-answer-${at}`)}
                  </label>
                  {/* The three drawn states travel together: they either sit beside the answer
                      or take their own line as a set of three. Individually wrapped, the
                      narrow column left "Wrong" alone under the other two. */}
                  <div className="map-svg-quiz-states">
                  {(['selected', 'correct', 'wrong'] as const).map((state) => (
                    <label className="save-field" key={state}>
                      <span>{roleLabel('quiz', `answer.${state}`)}</span>
                      <select
                        value={quiz.rows[at]?.[state] ?? ''}
                        onChange={(e) => patchQuizRow(at, { [state]: e.target.value })}
                        onFocus={() => setHoverId(quiz.rows[at]?.[state] || null)}
                        data-testid={`map-svg-quiz-${state}-${at}`}
                      >
                        <option value="">{DEFAULT_LOOK}</option>
                        {draft.designSvg?.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor(`answer.${state}`, rowKeyAt[at], quiz.rows[at]?.[state] ?? '', `map-svg-quiz-${state}-${at}`)}
                    </label>
                  ))}
                  </div>
                </div>
              ))}
              <label className="save-field">
                <span>Locked in</span>
                <select
                  value={quiz.locked}
                  onChange={(e) => patchQuiz({ locked: e.target.value })}
                  data-testid="map-svg-quiz-locked"
                >
                  <option value="">{DEFAULT_LOOK}</option>
                  {draft.designSvg?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                      {g.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
                {hintFor('locked', undefined, quiz.locked, 'map-svg-quiz-locked')}
              </label>
            </>
          )}
        </div>
      )}

      {hiddenUnclaimed.length > 0 && (
        <div className="panel-section" data-testid="map-svg-extras">
          <SectionHead title="Switches and choices" summary={extraCounts} testid="map-svg-why-extras">
            <p>
              A hidden layer can be a SWITCH the operator shows and hides, or one option of a
              CHOICE, where one layer of the set shows at a time. Each gets its own buttons on the
              control page. Name a layer <code>show:Sponsor</code> or <code>choice:Status/Live</code>{' '}
              in your design app and it arrives set; otherwise pick here.
            </p>
          </SectionHead>
          {hiddenUnclaimed.map((g) => {
            const extra = extraOf(g.id);
            return (
              <div className="map-svg-row" key={g.id} data-testid={`map-svg-extra-${g.id}`}>
                <label className="save-field grow">
                  <span>Hidden layer</span>
                  <input
                    value={extra?.name ?? extraLayerName(g.label)}
                    disabled={!extra}
                    onChange={(e) => patchExtra(g, { name: e.target.value })}
                    onFocus={() => setHoverId(g.id)}
                    data-testid={`map-svg-extra-name-${g.id}`}
                    aria-label={`What the operator calls ${g.label}`}
                  />
                </label>
                <label className="save-field">
                  <span>Use</span>
                  <select
                    value={extra?.use ?? ''}
                    onChange={(e) => patchExtra(g, { use: e.target.value as SvgExtraDraft['use'] | '' })}
                    onFocus={() => setHoverId(g.id)}
                    data-testid={`map-svg-extra-use-${g.id}`}
                  >
                    <option value="">Leave as drawn</option>
                    <option value="switch">A switch: Show / Hide</option>
                    <option value="choice">One option of a choice</option>
                  </select>
                </label>
                {extra?.use === 'choice' && (
                  <label className="save-field">
                    <span>Choice</span>
                    <input
                      value={extra.group ?? ''}
                      onChange={(e) => patchExtra(g, { group: e.target.value })}
                      data-testid={`map-svg-extra-group-${g.id}`}
                      aria-label={`Which choice ${g.label} belongs to`}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
