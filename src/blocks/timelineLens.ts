// THE TIMELINE LENS — which timeline the step surface is editing.
//
// A graphic's motion lives in two places: the default path's `steps`, and a branch state's
// own `state.timeline` (docs/STATE_MACHINE_SCHEMA.md §2). The step timeline and the Inspector
// were written against the first — every mutator in animEdit.ts takes a step INDEX, and both
// surfaces read `data.steps[i]`.
//
// Teaching each of those a second address would mean touching every mutator. Instead we
// PROJECT: reading a branch target hands the surfaces an AnimData whose single step IS that
// state's timeline, so animEdit, animEval, the keyframe drags and the Inspector all keep
// working unchanged; writing folds the edited step back into the state it came from.

import type { AnimData, AnimStep } from './animData';

export type TimelineTarget =
  /** The default path — the ordinary surface, and what every existing template opens on. */
  | { kind: 'path' }
  /** One off-path state's own inline timeline. */
  | { kind: 'state'; groupId: string; stateId: string };

export const PATH_TARGET: TimelineTarget = { kind: 'path' };

/** An empty timeline for a state that has none yet — the shape "+ Add a timeline" writes. */
export function emptyStateTimeline(name: string): AnimStep {
  return { name, duration: 0.45, ease: 'power2.out', layers: {} };
}

function findState(data: AnimData, groupId: string, stateId: string) {
  const group = data.machine?.groups.find((g) => g.id === groupId);
  return group?.states.find((s) => s.id === stateId) ?? null;
}

/**
 * The AnimData the step surface edits for this target.
 *
 * For a state: a ONE-STEP projection carrying that state's timeline. `machine` is dropped so
 * the surface's machine-aware helpers (the walk's cue markers, `spxSteps`) see a plain
 * document and cannot describe a branch as if it sat on the path.
 *
 * Returns null when the target no longer resolves — a deleted state, a template swapped
 * underneath — so the caller can fall back to the path rather than render a lie.
 */
export function lensRead(data: AnimData, target: TimelineTarget): AnimData | null {
  if (target.kind === 'path') return data;
  const state = findState(data, target.groupId, target.stateId);
  if (!state?.timeline) return null;
  const { machine: _machine, ...rest } = data;
  return { ...rest, steps: [state.timeline] };
}

/**
 * Fold an edited projection back into the document.
 *
 * Everything TOP-LEVEL comes from the edit (speed, root — a change made while a branch was
 * open is still a change to the graphic), `steps` is restored from the original document,
 * and the single edited step becomes the state's timeline.
 *
 * `reveals` and `hides` are stripped: they are the ordered walk's pre-hide and early-exit
 * mechanics and the shape gate REFUSES them on an inline timeline (animData `isAnimStepShape`
 * with revealsAllowed false). The surface hides those affordances in branch mode anyway; this
 * is the belt to that braces, so a stray write can never produce a document the parser would
 * reject.
 */
export function lensWrite(data: AnimData, target: TimelineTarget, edited: AnimData): AnimData | null {
  if (target.kind === 'path') return edited;
  const step = edited.steps[0];
  if (!step) return null;
  const next: AnimData = { ...edited, steps: data.steps, machine: data.machine };
  if (!next.machine) return null;
  const { reveals: _reveals, hides: _hides, ...clean } = step;
  next.machine = {
    ...next.machine,
    groups: next.machine.groups.map((g) =>
      g.id !== target.groupId
        ? g
        : { ...g, states: g.states.map((s) => (s.id === target.stateId ? { ...s, timeline: clean } : s)) },
    ),
  };
  return next;
}

/**
 * The scrub phase for whichever timeline is open.
 *
 * The preview's scrub protocol addresses the WALK's phases ('in' / 'out' / 'step-N'), and a
 * branch state is on none of them — so a branch used to send nothing at all, and its timeline
 * was authored blind: the playhead moved, the preview did not. Worse, the surfaces that
 * compute a phase from a step INDEX would each have called the branch's only step 'in' and
 * jumped the preview to the graphic's entrance.
 *
 * One rule, every caller: a branch answers `state:<groupId>:<stateId>`, which the preview simulator runtime
 * resolves through the graphic's own `noacgEnterTimeline`. `pathPhase` is what the caller
 * would have sent on the default path (phaseIdOf).
 */
export function scrubPhase(target: TimelineTarget, pathPhase: string): string {
  return target.kind === 'state' ? `state:${target.groupId}:${target.stateId}` : pathPhase;
}

/** Read a `state:` phase back into its two ids; null for a walk phase. */
export function parseStatePhase(phase: string): { groupId: string; stateId: string } | null {
  if (!phase.startsWith('state:')) return null;
  // Ids come from the machine, which the shape gate keeps free of ':' — but split from the
  // LEFT on exactly two fields so a stray one can never silently re-target another group.
  const [, groupId, ...rest] = phase.split(':');
  const stateId = rest.join(':');
  return groupId && stateId ? { groupId, stateId } : null;
}

/** The state a branch target points at, for the surfaces that need to name it. */
export function targetState(data: AnimData, target: TimelineTarget): { id: string; name: string } | null {
  if (target.kind === 'path') return null;
  const state = findState(data, target.groupId, target.stateId);
  return state ? { id: state.id, name: state.name ?? state.id } : null;
}
