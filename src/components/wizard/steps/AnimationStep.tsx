import { useEffect, useMemo, useState } from 'react';
import { SLIDE_FAMILY, isSlidePreset } from '../../../templates/lowerThirds/animPresets';
import type { SpxTemplate } from '../../../model/types';
import { EASINGS, type EasingId } from '../../../model/easings';
import { ALL_PRESETS, presetMovesSomething, type AnimPhase } from '../../../blocks/presetRegistry';
import type { AnimPresetId, AnimSpeed, AssemblerId, TemplateVariant } from '../../../model/wizard';
import { isWholeUnitPreset, universalPick, usesUniversalMotion, type DraftPatch, type WizardDraft } from '../draft';
import {
  MOTION_PRESETS,
  easingLegalForMotions,
  easingsForMotions,
  type MotionPhaseName,
  type MotionPresetId,
} from '../../../blocks/motionPresets';
import MotionPresetPicker from '../../MotionPresetPicker';
import SectionHead from '../SectionHead';

interface Props {
  variant: TemplateVariant;
  draft: WizardDraft;
  /** The draft built as real template code — the same object the live preview renders. The
   *  universal bank's offer is a STRUCTURAL question about this design (has it a unit to
   *  move?), so it is asked of the built markup rather than of the category. */
  template: SpxTemplate | null;
  onDraft: (patch: DraftPatch) => void;
  /** Replays the animation in the live preview (for re-clicking the active preset). */
  onReplay: () => void;
}

// MEASURED, 2026-08-26 (GOALS goal 6 - the owner: "the speed does not change, at least in the
// preview"). The knob was never broken: the emitted NOACG_ANIM carried 0.75/1/1.5 and the
// interpreter divides every duration by it, so a slide's 0.8s entrance ran 1.07/0.8/0.53s.
// What failed is PERCEPTION: two replays of a smooth power-out entrance are compared from
// memory seconds apart, and a ±33% step is below that threshold - which is also why the owner
// could see it with BOUNCE (the bounce COUNT changes, a rhythm rather than a duration). His
// hypothesis "you need an ease on it to adjust the speed" was measurably half-right: the knob
// always worked, but only an ease with rhythm made it readable. The honest fix keeps the
// button and widens the steps to ±80% (1.33/0.8/0.44s on that slide), which is unmistakable
// across separate replays; a matcher for the old values stays in AnimSpeed.
const SPEEDS: { label: string; value: AnimSpeed }[] = [
  { label: 'Slower', value: 0.6 },
  { label: 'Normal', value: 1 },
  { label: 'Faster', value: 1.8 },
];

const DIRECTIONS: { id: AnimPhase; label: string; hint: string }[] = [
  { id: 'both', label: 'In and out', hint: 'One matched style animates the graphic on and off air.' },
  { id: 'in', label: 'In only', hint: 'Pick the entrance. The exit keeps its current style.' },
  { id: 'out', label: 'Out only', hint: 'Pick the exit. The entrance keeps its current style.' },
];

/** The categories whose presets share the standard in/out structure (mixable phases). */
const PHASE_CATEGORIES = ['lower-third', 'info-card', 'scoreboard', 'corner-bug', 'imported-design'];

/** The categories whose create reads `o.animation.steps` — see `stepsApply` below for how this
 *  list is derived and what went wrong when it was stated the other way round. */
const STEP_CATEGORIES: AssemblerId[] = ['lower-third', 'info-card', 'corner-bug', 'alert', 'public-info'];

/** The Slide family's direction picker: arrows point the way the graphic travels in. */
const SLIDE_DIRS: { id: AnimPresetId; arrow: string; hint: string }[] = [
  { id: 'slide-up', arrow: '↑', hint: 'Up, enters from below' },
  { id: 'slide-down', arrow: '↓', hint: 'Down, enters from above' },
  { id: 'slide-left', arrow: '←', hint: 'Left, enters from the right edge' },
  { id: 'slide-right', arrow: '→', hint: 'Right, enters from the left edge' },
];

/** Step 5 — motion: direction, preset, speed, easing, and multi-step mode. */
export default function AnimationStep({ variant, template, draft, onDraft, onReplay }: Props) {
  // The "Simple motion" fold, when the design leads with its own cards: open from the start if
  // the graphic already holds a universal motion, so re-entering the step shows the live pick
  // rather than hiding it behind a closed summary.
  const [moreOpen, setMoreOpen] = useState(
    draft.animation.motionIn !== null || draft.animation.motionOut !== null,
  );
  // EVERY design that has a unit to move picks from the UNIVERSAL bank (blocks/motionPresets.ts)
  // beside its own cards — the six families below stand in for the category's own whole-unit
  // motions, and the choreographies that animate PARTS (a line out of its mask, an accent
  // drawing, an SVG's layers staggering) stay beside them. Same engine as the saved graphic's
  // control page, so what is picked here is what that page reads back.
  const universal = useMemo(() => usesUniversalMotion(template), [template]);
  const motion = universal ? universalPick(draft, variant) : {};
  // The slide family renders as ONE card with a direction picker: a variant that lists
  // any member offers all four (the standard structure takes any direction).
  // A CARD THAT CANNOT MOVE THIS ARTWORK IS NOT OFFERED (owner, 2026-09-03 import walk;
  // presetRegistry.presetMovesSomething carries the rule and the reasoning). The layer
  // stagger is the case that raised it: an SVG whose shapes all sit in one unnamed group -
  // every Figma frame export - has no layers to stagger, so the preset emits a plain fade
  // while its card still promises "the design's layers rise into place one after another".
  // Hidden rather than greyed: a disabled card still asks to be understood, and the universal
  // bank beside it already offers every motion this artwork can actually perform.
  //
  // MEMOIZED ON THE BUILT MARKUP, for the reason the Style step memoizes `cssPaintsWith`: the
  // answer can only change when the preview is rebuilt, and asking it parses the whole
  // document - on an imported SVG that document IS the artwork.
  const moving = useMemo(
    () =>
      new Set(
        // No built template yet (the first render of the step) offers everything: erring this
        // way costs a card that is briefly there, the other way hides one that works.
        variant.animationPresets.filter((id) => !template || presetMovesSomething(template.html, id)),
      ),
    [template, variant],
  );
  const presets = ALL_PRESETS.filter(
    (p) =>
      variant.animationPresets.includes(p.id) &&
      !isSlidePreset(p.id) &&
      !(universal && isWholeUnitPreset(p.id)) &&
      moving.has(p.id),
  );
  const hasSlide = variant.animationPresets.some(isSlidePreset);
  const presetName = (id: AnimPresetId) => ALL_PRESETS.find((p) => p.id === id)?.name ?? id;
  // Is the universal bank this design's MAIN picker, or an extra beside its own cards? A
  // property of the DESIGN, never of the current pick, so the step's layout does not rearrange
  // itself under a click: the bank leads when the design has no choreographies of its own, or
  // when the ones it does have are the whole-unit kind the bank stands in for (the imported
  // design, whose four design-* presets map straight onto it).
  const universalPrimary =
    universal && (!(hasSlide || presets.length > 0) || isWholeUnitPreset(variant.animationPresets[0]));

  // A PICK THE STEP NO LONGER OFFERS IS GIVEN BACK, never left standing. The artwork can change
  // under a pick: choose the layer stagger, go back to the mapping step and replace the named
  // groups with live fields, and the design has no layers left. Without this the card is gone,
  // nothing renders as chosen, and the summary and the created graphic still say "Layer stagger"
  // while a plain fade plays - the same lie this filter exists to remove, inverted. The draft
  // is what create reads (`draftToOptions`), so the draft is what has to be corrected.
  useEffect(() => {
    if (!template) return;
    // Only a pick this design OFFERS but cannot perform. A pick carried over from another
    // design is a different question, answered where it always was (the build falls back to
    // the variant's own first preset), and this effect leaves it alone.
    const dead = (id: AnimPresetId | null) => !!id && variant.animationPresets.includes(id) && !moving.has(id);
    const patch: Partial<WizardDraft['animation']> = {};
    if (dead(draft.animation.presetId)) patch.presetId = null;
    // null = the exit follows the entrance, which is the honest fallback for a dead exit pick.
    if (dead(draft.animation.outPresetId)) patch.outPresetId = null;
    if (Object.keys(patch).length > 0) onDraft({ animation: patch });
  }, [template, moving, variant.animationPresets, draft.animation.presetId, draft.animation.outPresetId, onDraft]);

  // The entrance preset; the exit matches it unless the user mixed a different one in.
  const inActive = draft.animation.presetId ?? variant.animationPresets[0];
  const outActive = draft.animation.outPresetId ?? inActive;
  const mixed = universal ? (motion.in ?? inActive) !== (motion.out ?? outActive) : inActive !== outActive;
  /** What a phase holds now, for the "Now: In X · Out Y" line - a universal motion or a card. */
  const phaseName = (ph: MotionPhaseName) => {
    const m = ph === 'in' ? motion.in : motion.out;
    if (m) return MOTION_PRESETS.find((p) => p.id === m)?.name ?? m;
    return presetName(ph === 'in' ? inActive : outActive);
  };

  // Direction only applies where presets share the standard in/out structure —
  // continuous formats (credits, tickers) and clocks are one motion, not two phases.
  const phaseApply = PHASE_CATEGORIES.includes(variant.category);
  const direction = phaseApply ? draft.animation.direction : 'both';
  const activeDirection = DIRECTIONS.find((d) => d.id === direction)!;

  // The Slide family's state, read by BOTH its card and the Travel box beside it — the two
  // are separate grid cells now, so this can no longer live inside the card's own render.
  const isInSlide = isSlidePreset(inActive);
  const isOutSlide = isSlidePreset(outActive);
  const activeForPhase = direction === 'out' ? outActive : inActive;
  const slideActive = isSlidePreset(activeForPhase) ? activeForPhase : null;
  const slideSelected =
    direction === 'in' ? isInSlide
    : direction === 'out' ? isOutSlide
    : isInSlide && isOutSlide && inActive === outActive;

  const pickPreset = (id: AnimPresetId) => {
    // A category card picked under the universal bank takes its phases back from it.
    const clearMotion = (phases: MotionPhaseName[]): Partial<WizardDraft['animation']> =>
      universal ? Object.fromEntries(phases.map((ph) => [ph === 'in' ? 'motionIn' : 'motionOut', null])) : {};
    if (direction === 'both') {
      if (inActive === id && outActive === id && !motion.in && !motion.out) return onReplay();
      // One style for both phases (the default): the exit follows the entrance.
      onDraft({ animation: { presetId: id, outPresetId: null, ...clearMotion(['in', 'out']) } });
    } else if (direction === 'in') {
      if (inActive === id && !motion.in) return onReplay();
      // Pin the exit to its current style so only the entrance changes.
      onDraft({ animation: { presetId: id, outPresetId: outActive, ...clearMotion(['in']) } });
    } else {
      if (outActive === id && !motion.out) return onReplay();
      onDraft({ animation: { outPresetId: id, ...clearMotion(['out']) } });
    }
  };

  /** A universal card: write the motion on the phases the direction names. */
  const pickMotion = (id: MotionPresetId, phases: MotionPhaseName[]) => {
    const patch: Partial<WizardDraft['animation']> = {};
    if (phases.includes('in')) patch.motionIn = id;
    if (phases.includes('out')) patch.motionOut = id;
    // A curve the new motion cannot show falls back to Auto rather than staying set and doing
    // nothing — the dropdown that "feels like it doesn't change the easing" is exactly what an
    // invisibly-kept choice produces.
    const next: [MotionPresetId | null, MotionPresetId | null] = [
      (phases.includes('in') ? id : motion.in) ?? null,
      (phases.includes('out') ? id : motion.out) ?? null,
    ];
    if (!easingLegalForMotions(next, draft.animation.easing)) patch.easing = 'auto';
    onDraft({ animation: patch });
  };

  // WHICH GRAPHICS ACTUALLY REVEAL A LINE PER PRESS — the categories whose create passes the
  // flag through, listed rather than the ones that ignore it.
  //
  // Steps fit line-based graphics: continuous formats (credits, tickers), clock formats
  // (starting-soon, game timers), a board that enters whole (scoreboard, versus, infographic)
  // and an imported design (ONE picture, its text placed inside artwork) have no line-by-line
  // reveal. Those creates say so themselves, each passing a FIXED `steps` to `baseSettings`
  // and `steps: false` to its preset config, so the checkbox's value never reaches the graphic
  // — measured 2026-09-04 on "House Match-up": ticking it left the built template byte-identical
  // (`grep -rn "baseSettings(\|steps: false" src/templates/*/shared.ts` re-derives the list).
  //
  // Stated the POSITIVE way after that measurement, because the exclusion list had drifted:
  // it named seven categories and twenty ignore the flag, so the checkbox was offered dead on
  // scoreboards, versus cards, the whole competition pack, polls, audience graphics, frames,
  // transitions and stream notifications. Only these five reach `standardTemplate`, which is
  // the one create that reads `o.animation.steps` (templates/shared/standard.ts). A design
  // there can still opt out with `disableSteps`; none does today.
  const stepsApply = draft.lines.length > 1 && STEP_CATEGORIES.includes(variant.category);

  // THE EASING LIST REACTS TO THE MOTION (the owner, 2026-08-23: "How can you do a back ease
  // or bounce ease with a fade? … the list wouldn't be that long and the options could make
  // sense"). The rule and the measurement behind it are in blocks/motionPresets.ts
  // easingsForMotions: a curve is offered only where its character can be rendered. One easing
  // setting drives both phases, so both are asked.
  const easePhases = [motion.in ?? null, motion.out ?? null] as const;
  const easeOptions = easingsForMotions(easePhases);
  const activeEasing = EASINGS.find((e) => e.id === draft.animation.easing);

  // THE DESIGN'S OWN CARDS — its category choreographies, plus the Slide family as one card
  // with its Travel arrows. Built once and rendered in whichever grid the branch below picks,
  // so the two layouts can never drift into showing different sets.
  const ownCards = [
    hasSlide ? (
      <button
        key="slide"
        className={`wz-anim ${universalPrimary ? 'motion-card ' : ''}${slideSelected ? 'selected' : ''}`}
        onClick={() => pickPreset(slideActive ?? SLIDE_FAMILY[0])}
      >
        <strong>
          Slide
          {mixed && (isInSlide || isOutSlide) && (
            <span className="muted" style={{ fontWeight: 400 }}>
              {' '}· {isInSlide && isOutSlide ? 'in + out' : isInSlide ? 'in' : 'out'}
            </span>
          )}
        </strong>
        <span className="hint">Glides in from one side and slips back out the same way.</span>
      </button>
    ) : null,
    ...presets.map((p) => {
      const isIn = inActive === p.id && !motion.in;
      const isOut = outActive === p.id && !motion.out;
      const selected = direction === 'in' ? isIn : direction === 'out' ? isOut : isIn && isOut;
      return (
        <button
          key={p.id}
          className={`wz-anim ${universalPrimary ? 'motion-card ' : ''}${selected ? 'selected' : ''}`}
          onClick={() => pickPreset(p.id)}
          title={p.description}
          data-testid={`wz-anim-${p.id}`}
        >
          <strong>
            {p.name}
            {mixed && (isIn || isOut) && (
              <span className="muted" style={{ fontWeight: 400 }}>
                {' '}· {isIn && isOut ? 'in + out' : isIn ? 'in' : 'out'}
              </span>
            )}
          </strong>
          <span className="hint">{p.description}</span>
        </button>
      );
    }),
    // TRAVEL is its own cell (re-design/handoff.md §2e), not a strip hanging under the Slide
    // card. The preset grid leaves a hole — five presets in two columns — and the arrows were
    // spending vertical room beside it while that hole sat empty, on a step measured at 235px
    // of overflow with Speed, Easing and "Reveal in steps" below the fold. Rendered last so it
    // falls into the hole; it only exists when the design offers Slide at all, and clicking an
    // arrow still PICKS Slide in that direction, exactly as it did under the card.
    hasSlide ? (
      <div key="travel" className="wz-anim-travel" role="group" aria-label="Slide direction">
        <p className="dlg-caption">Travel</p>
        <div className="wz-anim-dirs">
          {SLIDE_DIRS.map((d) => (
            <button
              key={d.id}
              className={slideActive === d.id ? 'active' : ''}
              onClick={() => pickPreset(d.id)}
              title={d.hint}
            >
              {d.arrow}
            </button>
          ))}
        </div>
      </div>
    ) : null,
  ].filter(Boolean);

  return (
    <div>
      {/* ONE LINE PER THING, AND AN ⓘ FOR THE REST (docs/GOALS.md NOW goal 4): each section
          head is a title, one muted line, and the why behind the dot. */}
      {phaseApply && (
        <div className="panel-section">
          <SectionHead
            title="Direction"
            summary="what your style choice applies to"
            testid="wz-anim-why-direction"
          >
            <p>
              A graphic animates twice, ON air and OFF again, and the two need not match. A
              confident slide in can leave with a quiet fade. This chooses which of the two
              your next style pick changes. Most graphics keep one style for both, which is why
              “In and out” is the default.
            </p>
          </SectionHead>
          <div className="row" style={{ gap: 6 }}>
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                className={direction === d.id ? 'active' : ''}
                onClick={() => onDraft({ animation: { direction: d.id } })}
                title={d.hint}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {activeDirection.hint}
            {mixed && (
              <>
                {' '}Now: <strong>In</strong> {phaseName('in')} · <strong>Out</strong>{' '}
                {phaseName('out')}.
              </>
            )}
          </p>
        </div>
      )}

      <div className="panel-section">
        <SectionHead
          title="Animation style"
          summary="click a preset to watch it in the preview"
          testid="wz-anim-why-style"
        >
          <p>
            How the graphic arrives and leaves. Every card is a finished, broadcast-tuned
            motion. Click one and the preview plays it
            {phaseApply && direction !== 'in' ? ', entrance then exit' : ''}; click the active
            card again to replay. Nothing here changes your content or layout, only the way it
            moves.
          </p>
        </SectionHead>
        {universalPrimary ? (
          <MotionPresetPicker
            hideDirection
            inId={motion.in ?? null}
            outId={motion.out ?? null}
            direction={direction}
            onDirection={(d) => onDraft({ animation: { direction: d } })}
            onPick={pickMotion}
            onReplay={onReplay}
          >
            {ownCards}
          </MotionPresetPicker>
        ) : (
          <>
            <div className="wz-anim-grid">{ownCards}</div>
            {universal && (
              // SECOND, AND FOLDED. This design has choreographies of its own, and they are
              // the taste it was drawn with - a measurement of every catalog preset (the
              // classification behind blocks/motionPresets.ts) found that not one of them is a
              // whole-unit motion the universal bank duplicates: they all move a box AND
              // stagger what is inside it. So the universal six are an ADDITION here, not a
              // replacement, and burying six extra cards in the same grid would have made the
              // step longer for everyone to serve the student who wants "just slide the whole
              // thing on". One fold keeps both true. It opens by itself once a universal
              // motion is what the graphic holds.
              <details
                className="wz-anim-universal"
                data-testid="wz-anim-universal"
                open={moreOpen}
                onToggle={(e) => setMoreOpen(e.currentTarget.open)}
              >
                <summary>
                  Simple motion <span className="muted">move the whole graphic as one block</span>
                </summary>
                <MotionPresetPicker
                  hideDirection
                  inId={motion.in ?? null}
                  outId={motion.out ?? null}
                  direction={direction}
                  onDirection={(d) => onDraft({ animation: { direction: d } })}
                  onPick={pickMotion}
                  onReplay={onReplay}
                />
              </details>
            )}
          </>
        )}
      </div>

      {/* Speed beside Easing, and WRAPPING: the form column halves the moment a design is
          picked, leaving this row 448 px, and at the old widths the two sections asked for more
          than that - measured with the Easing select running off the right edge, a poor place
          for the control this step was rebuilt around. They fit side by side now (228 + 24 +
          the 180 below); the wrap is the backstop for anything narrower, and it drops Easing
          under Speed rather than clipping it. */}
      <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div className="panel-section">
          <SectionHead title="Speed" summary="entrance and exit" testid="wz-anim-why-speed">
            <p>
              How long the entrance and the exit take: the same motion, on a faster or slower
              clock. It scales the graphic everywhere it plays: the preview here, the editor,
              and on air.
            </p>
          </SectionHead>
          <div className="row" style={{ gap: 6 }}>
            {SPEEDS.map((s) => (
              <button
                key={s.value}
                className={draft.animation.speed === s.value ? 'active' : ''}
                onClick={() => onDraft({ animation: { speed: s.value } })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 180, not 260: at 260 the pair asked for more than the row had and the wrap above
            pushed Easing onto its own row, below the fold - the one control this step exists to
            make usable, out of sight. Measured: Speed takes 228 of the row's 448, so 200 still
            missed by 4 px. 180 fits, and the select grows into whatever is left. The wrap above
            still catches anything narrower. */}
        <div className="panel-section" style={{ minWidth: 180, flex: '1 1 180px' }}>
          <SectionHead title="Easing" summary="the feel of the motion" testid="wz-anim-why-easing">
            <p>
              The same travel can arrive mechanically or with character. It can settle softly, pop
              past and snap back, bounce. That curve is the easing. The list only offers curves
              the current motion can actually show, and Auto is each motion&rsquo;s hand-tuned
              pair, which is why it is the recommendation.
            </p>
          </SectionHead>
          <select
            value={draft.animation.easing}
            onChange={(e) => onDraft({ animation: { easing: e.target.value as EasingId } })}
          >
            {/* Short enough to READ BACK inside a 196 px select — the longer wording was
                truncated mid-word, which is the wrong place to hide what "Auto" means. The
                hint under the select carries the sentence. */}
            <option value="auto">Auto (recommended)</option>
            {easeOptions.map((e) => (
              <option key={e.id} value={e.id} title={e.description}>{e.plain}</option>
            ))}
            {/* A curve the draft still holds from a motion that CAN show it: keep it selectable
                so switching back and forth does not silently rewrite the pick. Picking a motion
                that cannot show it is what drops it to Auto (pickMotion below). */}
            {draft.animation.easing !== 'auto' && !easeOptions.some((e) => e.id === draft.animation.easing) && (
              <option value={draft.animation.easing}>
                {EASINGS.find((e) => e.id === draft.animation.easing)?.plain ?? draft.animation.easing}
              </option>
            )}
          </select>
          <p className="hint" style={{ marginTop: 6 }}>
            {activeEasing
              ? activeEasing.description
              : 'Each motion arrives on the curve it was tuned with: quick in, settling softly.'}
          </p>
        </div>
      </div>

      {stepsApply && (
        <div className="panel-section">
          {/* The one checkbox row, by the one rule (re-design/handoff.md §6): box first, cap
              aligned with the title, description stacked under it, whole label clickable. */}
          <label className="dlg-check">
            <input
              type="checkbox"
              checked={draft.animation.steps ?? variant.defaultSteps ?? false}
              onChange={(e) => onDraft({ animation: { steps: e.target.checked } })}
            />
            <span className="dlg-check-text">
              <span className="dlg-check-title">Reveal in steps</span>
              <span className="dlg-check-desc">
                ▶ Play shows only the first line; each press of » Next
                reveals one more. Test it with the » Next button after creating.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
