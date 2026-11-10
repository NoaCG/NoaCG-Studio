// A WORD QUESTION'S WORD CLOUD TO THE RUNDOWN (docs/work-specs/interaction/spec.md, AC-14; the
// Rules W1 to W9 in its phase 6 notes).
//
// The words a Word question gathered become an ordinary cue's field VALUES on a word cloud graphic:
// its Question, and its Words as `word | count` lines, most first. The operator takes that cue like
// any other. It is a SNAPSHOT: words that arrive later reach the cue only on the next press, and a
// word the operator hid is never in it (W6).
//
// It rides the same rebased write and the same one-question-one-cue map as a vote's result
// (model/shows.ts `stageShowResult`, model/resultCues.ts, S1 to S6, S15): a second press, a reload,
// another tab or a synced second operator updates the same cue; a deleted cue or a graphic without
// the fields gets a new cue and the note says why. The remembered graphic is `Show.wordTarget`, kept
// apart from a vote's `resultTarget` because a word cloud and a vote board take different fields.
//
// It reaches no command log and sends nothing (W8): the `deps` are record writers only.
// Pure and Node-importable (scripts/word-cloud.test.mjs).

import type { Show } from '../model/shows';
import { planResultCue, type ResultPlan } from '../model/resultCues';
import { WORD_CLOUD_MAX, wordCloudFields, wordLines, type WordCount } from '../model/wordCloud';

type Field = { field: string; title?: string };

/** The word clouds the catalog offers when the production has none (src/templates/audience). */
export const WORD_CLOUDS: readonly { id: string; name: string }[] = [{ id: 'wc01', name: 'House Word Cloud' }];

/** The values a word cloud's fields get, or null when the graphic is not one. Only these two. */
export function wordCloudValues(fields: readonly Field[], question: string, counts: readonly WordCount[]): Record<string, string> | null {
  const map = wordCloudFields(fields);
  return map ? { [map.question]: question, [map.words]: wordLines(counts) } : null;
}

export interface WordDestination {
  graphicId: string;
  name: string;
}

const takesWords = (fields: readonly Field[]) => wordCloudFields(fields) !== null;

/** The production's word clouds, in pool order. */
export function wordDestinations(show: Pick<Show, 'graphics'>): WordDestination[] {
  return show.graphics.filter((g) => takesWords(g.template.fields ?? [])).map((g) => ({ graphicId: g.id, name: g.name }));
}

/** Where a press of "Add word cloud to rundown" would write for this question, as the button names
 *  it: its cue's graphic while that can take words, else the remembered word cloud, else null (the
 *  press asks). The planner the write uses, so the button never names one graphic and writes another. */
export function wordDestinationOf(show: Pick<Show, 'graphics' | 'cues' | 'resultCues' | 'wordTarget'>, questionId: string): WordDestination | null {
  const plan = planResultCue(show, questionId, takesWords, null, 'wordTarget');
  if (plan.kind === 'choose') return null;
  const g = show.graphics.find((x) => x.id === plan.graphicId);
  return g ? { graphicId: g.id, name: g.name } : null;
}

/** What staging writes through: the record writer and the durable commit. Nothing that sends. */
export interface WordStagingDeps {
  stage: (
    showId: string,
    questionId: string,
    opts: {
      valuesFor: (fields: readonly Field[]) => Record<string, string> | null;
      label: string;
      chosen?: string | null;
      adopt?: string | null;
      target: 'wordTarget';
    },
  ) => { shows: Show[]; error: string | null; outcome: () => { plan: ResultPlan | null; cueId: string | null } };
  commit: () => Promise<string | null>;
  setShows: (shows: Show[]) => void;
  /** The productions as stored, read after the write landed. */
  reread: () => Show[];
}

export type WordOutcome =
  | { ok: true; kind: 'updated' | 'added'; cueId: string; graphic: string; message: string }
  | { ok: false; choose: boolean; message: string };

/**
 * Put a snapshot of a Word question's shown words on its word cloud cue. `chosen` is a graphic the
 * operator just picked; `adopt` a catalog word cloud's seeded cue on it. The ✓ is said only once the
 * durable write landed, and it reports what the stored write did; a refused write says so.
 */
export async function stageWords(
  show: Pick<Show, 'id' | 'graphics'>,
  input: { questionId: string; question: string; counts: readonly WordCount[]; label: string; chosen?: string | null; adopt?: string | null },
  deps: WordStagingDeps,
): Promise<WordOutcome> {
  const valuesFor = (fields: readonly Field[]) => wordCloudValues(fields, input.question, input.counts);
  const made = deps.stage(show.id, input.questionId, { valuesFor, label: input.label, chosen: input.chosen, adopt: input.adopt, target: 'wordTarget' });
  deps.setShows(made.shows);
  if (made.error) return { ok: false, choose: false, message: `No word cloud was written: ${made.error}` };
  const asked = made.outcome().plan;
  if (!asked || asked.kind === 'choose') return { ok: false, choose: true, message: asked?.replaced ? replacedWords(asked.replaced) : 'Choose where the word cloud goes.' };
  const failure = await deps.commit();
  const stored = deps.reread();
  deps.setShows(stored);
  const after = stored.find((s) => s.id === show.id) ?? show;
  const { plan: landed, cueId } = made.outcome();
  if (!failure && (!landed || landed.kind === 'choose' || !cueId)) {
    return { ok: false, choose: true, message: landed?.kind === 'choose' && landed.replaced ? replacedWords(landed.replaced) : 'Choose where the word cloud goes.' };
  }
  const plan = landed && landed.kind !== 'choose' ? landed : asked;
  const graphic = after.graphics.find((g) => g.id === plan.graphicId)?.name ?? 'the graphic';
  if (failure || !cueId) {
    return {
      ok: false,
      choose: false,
      message: plan.kind === 'update' ? `The word cloud cue on “${graphic}” was not updated: ${failure}` : `No word cloud cue was added for “${graphic}”: ${failure}`,
    };
  }
  const shown = Math.min(input.counts.filter((w) => !w.hidden).length, WORD_CLOUD_MAX);
  const words = `${shown} ${shown === 1 ? 'word' : 'words'}`;
  if (plan.kind === 'update') {
    return { ok: true, kind: 'updated', cueId, graphic, message: `✓ Updated the word cloud cue on “${graphic}” with ${words}. Take or Update it to change what is on air.` };
  }
  const why = plan.replaced ? `${replacedWords(plan.replaced)} ` : '';
  return { ok: true, kind: 'added', cueId, graphic, message: `✓ ${why}Added a word cloud cue on “${graphic}” with ${words}. It airs when you Take it. Nothing has gone out.` };
}

function replacedWords(replaced: 'deleted' | 'no-fields' | 'moved'): string {
  if (replaced === 'deleted') return 'The earlier word cloud cue was deleted, so this is a new one.';
  if (replaced === 'no-fields') return 'The earlier word cloud cue’s graphic no longer has the word fields, so this is a new one.';
  return 'The earlier word cloud cue stays in the rundown as an ordinary cue.';
}
