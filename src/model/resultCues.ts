// WHICH CUE A QUESTION'S RESULT IS STAGED ONTO (docs/work-specs/interaction/spec.md, "Results to
// the rundown"; the Rules S1 to S11 in its phase 3 notes).
//
// `Show.resultCues` maps a question's id to its one result cue, and it is saved with the
// production: a reload, another tab and another operator read the same mapping, so "Add results to
// rundown" pressed again updates that cue rather than adding a second (S1, S2). The decision is
// made here, on the production as it is stored when the write runs (model/shows.ts
// `stageShowResult` calls this inside its rebased write, S4), and nothing here airs anything.
//
// Pure and Node-runnable (scripts/result-staging.test.mjs): type imports only.

import type { Show } from './shows';

type Field = { field: string; title?: string };

/** Why a question with a mapped cue gets a new one: its cue is gone, its graphic can no longer
 *  take results (S3), or the operator chose another graphic after Change (S16). */
export type ResultReplaced = 'deleted' | 'no-fields' | 'moved';

export type ResultPlan =
  /** The mapped cue exists and its graphic has the result fields: write into it (S2). */
  | { kind: 'update'; cueId: string; graphicId: string }
  /** Add one cue on `graphicId` and map it (S3). */
  | { kind: 'add'; graphicId: string; replaced: ResultReplaced | null }
  /** No graphic to add on: the operator chooses one (S5). */
  | { kind: 'choose'; replaced: ResultReplaced | null };

/** The production's mapping, read defensively: only string to string entries count. */
export function readResultCues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

/**
 * Decide where a question's result goes.
 *
 * - The mapped cue, while it exists and its graphic still `takes` results (S2), unless the operator
 *   just chose another graphic (`chosen`, after Change: S16).
 * - Otherwise `chosen` (the graphic the operator just picked), else the remembered result graphic
 *   while it still takes results, else the operator is asked (S3, S5). Nothing is picked by
 *   elimination.
 */
export function planResultCue(
  show: Pick<Show, 'graphics' | 'cues' | 'resultCues' | 'resultTarget'>,
  questionId: string,
  takes: (fields: readonly Field[]) => boolean,
  chosen?: string | null,
): ResultPlan {
  const graphicTakes = (id: string | undefined | null) => {
    const g = id ? show.graphics.find((x) => x.id === id) : undefined;
    return g ? takes(g.template.fields ?? []) : false;
  };
  const mapped = readResultCues(show.resultCues)[questionId];
  let replaced: ResultReplaced | null = null;
  if (mapped) {
    const cue = (show.cues ?? []).find((c) => c.id === mapped);
    if (!cue) replaced = 'deleted';
    else if (!graphicTakes(cue.sourceId)) replaced = 'no-fields';
    else if (chosen && chosen !== cue.sourceId && graphicTakes(chosen)) replaced = 'moved';
    else return { kind: 'update', cueId: cue.id, graphicId: cue.sourceId };
  }
  if (chosen && graphicTakes(chosen)) return { kind: 'add', graphicId: chosen, replaced };
  if (graphicTakes(show.resultTarget)) return { kind: 'add', graphicId: show.resultTarget!, replaced };
  return { kind: 'choose', replaced };
}
