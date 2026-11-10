// RESULTS TO THE RUNDOWN (docs/work-specs/interaction/spec.md, "Results to the rundown"; AC-9;
// the Rules S1 to S11 in its phase 3 notes).
//
// A multiple-choice question's counts become an ordinary cue's field VALUES on a result graphic,
// and the operator takes that cue like any other. The renderer never learns votes exist: a vote
// board draws whatever numbers are in its fields, exactly as it does for a hand-typed rehearsal.
//
// What it guarantees:
//  - One question, one result cue (S1). Which cue is saved with the production
//    (`Show.resultCues`), and update-or-add is decided on the record as stored when the write runs
//    (model/shows.ts `stageShowResult`, model/resultCues.ts), so a second press, a reload, another
//    tab or a synced second operator updates the same cue (S2, S4).
//  - A deleted cue, or one whose graphic lost the result fields, gets a new cue and the note says
//    why (S3). Nothing is picked without the operator's choice (S5).
//  - It reaches no command log and sends nothing (S8): it writes the record. The `deps` handed in
//    are record writers only, which scripts/result-staging.test.mjs checks.
//
// Pure and Node-importable: the stores it writes through are handed in by the caller.

import type { Show } from '../model/shows';
import type { ResultPlan } from '../model/resultCues';
import { lastTitled, voteBoardFields } from './messageStaging';
import { POLL_LIVE_ON, POLL_LIVE_TITLE, POLL_STATUS_CLOSED, POLL_STATUS_OPEN, POLL_STATUS_TITLE } from '../templates/behaviours/voteFields';

type Field = { field: string; title?: string };

/** The live vote boards the catalog offers when the production has no result graphic (S5), by
 *  catalog id and the name the operator reads (src/templates/poll/index.ts). */
export const RESULT_BOARDS: readonly { id: string; name: string }[] = [
  { id: 'pl01', name: 'House Vote' },
  { id: 'pl02', name: 'Volt Vote' },
  { id: 'pl03', name: 'Frost Vote' },
  { id: 'pl04', name: 'Clean Vote' },
  { id: 'pl05', name: 'Floor Vote' },
];

export interface PollFieldMap {
  question: string;
  options: string;
  count: string | null;
  status: string | null;
  live: string | null;
}

/**
 * Which of a graphic's fields hold a vote, matched BY TITLE (the spec's field contract: Question,
 * Options, and optional Vote count, Vote status and Live figures). `null` means this graphic is not
 * one: staging a tally into a name strap would be worse than saying there is nowhere to put it.
 *
 * THE LAST MATCH WINS: on imported artwork the vote's own fields sit after the designer's layers,
 * and a designer's unbound "Question" layer must not take the round's question.
 */
export function pollFieldMap(fields: readonly Field[]): PollFieldMap | null {
  const board = voteBoardFields(fields);
  if (!board) return null;
  return {
    question: board.question,
    options: board.options,
    count: lastTitled(fields, ['vote count', 'votes', 'count', 'total']),
    // The status is a machine-readable token and the live switch a fact the board obeys; both
    // titles come from the module that emits the fields (templates/behaviours/vote.ts).
    status: lastTitled(fields, [POLL_STATUS_TITLE.toLowerCase()]),
    live: lastTitled(fields, [POLL_LIVE_TITLE.toLowerCase()]),
  };
}

export interface ResultRound {
  question: string;
  options: readonly string[];
}

export interface ResultTally {
  counts: readonly number[];
  total: number;
}

/**
 * A round's counts as field values: the board's own `Label | count` lines, the count line (a
 * sentence for a human), the status (a token for the board) and whether the figures run live. The
 * live value is written on every stage, so unticking the switch takes the figures back off.
 */
export function tallyValues(round: ResultRound, tally: ResultTally, map: PollFieldMap, closed: boolean, liveFigures: boolean): Record<string, string> {
  const values: Record<string, string> = {
    [map.question]: round.question,
    [map.options]: round.options.map((label, i) => `${label} | ${tally.counts[i] ?? 0}`).join('\n'),
  };
  if (map.count) values[map.count] = `${tally.total} ${tally.total === 1 ? 'vote' : 'votes'} · voting ${closed ? 'closed' : 'open'}`;
  if (map.status) values[map.status] = closed ? POLL_STATUS_CLOSED : POLL_STATUS_OPEN;
  if (map.live) values[map.live] = liveFigures ? POLL_LIVE_ON : '';
  return values;
}

export interface ResultDestination {
  graphicId: string;
  name: string;
}

/** The production's result graphics, in pool order. */
export function resultDestinations(show: Pick<Show, 'graphics'>): ResultDestination[] {
  return show.graphics.filter((g) => pollFieldMap(g.template.fields ?? [])).map((g) => ({ graphicId: g.id, name: g.name }));
}

/** The remembered result graphic while it can still take results. Never a guess. */
export function rememberedResultTarget(show: Pick<Show, 'graphics' | 'resultTarget'>): ResultDestination | null {
  if (!show.resultTarget) return null;
  return resultDestinations(show).find((d) => d.graphicId === show.resultTarget) ?? null;
}

/** What staging writes through: the record writer and the durable commit. Nothing that sends. */
export interface ResultStagingDeps {
  stage: (
    showId: string,
    questionId: string,
    opts: {
      valuesFor: (fields: readonly Field[]) => Record<string, string> | null;
      label: string;
      chosen?: string | null;
      adopt?: string | null;
      closeOnly?: boolean;
    },
  ) => { shows: Show[]; error: string | null; outcome: () => { plan: ResultPlan | null; cueId: string | null } };
  commit: () => Promise<string | null>;
  setShows: (shows: Show[]) => void;
  /** The productions as stored, read after the write landed. */
  reread: () => Show[];
}

export type ResultOutcome =
  | { ok: true; kind: 'updated' | 'added' | 'none'; cueId: string | null; graphic: string; message: string }
  | { ok: false; choose: boolean; message: string };

/**
 * Stage (or, with `closed` on Stop, finalise) a question's result. `chosen` is a graphic the
 * operator just picked; `adopt` a catalog board's seeded cue on it. The ✓ is said only once the
 * durable write landed; a refused write says so (S6).
 */
export async function stageResults(
  show: Pick<Show, 'id' | 'graphics'>,
  input: {
    questionId: string;
    round: ResultRound;
    tally: ResultTally;
    closed: boolean;
    liveFigures: boolean;
    /** The cue's name when one is added (the caller's words, so they stay where copy is checked). */
    label: string;
    chosen?: string | null;
    adopt?: string | null;
    closeOnly?: boolean;
  },
  deps: ResultStagingDeps,
): Promise<ResultOutcome> {
  const valuesFor = (fields: readonly Field[]) => {
    const map = pollFieldMap(fields);
    return map ? tallyValues(input.round, input.tally, map, input.closed, input.liveFigures) : null;
  };
  const made = deps.stage(show.id, input.questionId, { valuesFor, label: input.label, chosen: input.chosen, adopt: input.adopt, closeOnly: input.closeOnly });
  deps.setShows(made.shows);
  if (made.error) return { ok: false, choose: false, message: `No result was written: ${made.error}` };
  // This tab's run: when it found nowhere to write, nothing was written and the operator chooses.
  // Stop's close-only write always reaches the stored record, whose link this tab may not have
  // heard of yet (S13), so it is judged only after it landed.
  const asked = made.outcome().plan;
  if (!input.closeOnly && (!asked || asked.kind === 'choose')) {
    return { ok: false, choose: true, message: asked?.replaced ? replacedWords(asked.replaced) : 'Choose where results go.' };
  }
  const failure = await deps.commit();
  // What the STORED write decided, which can differ from this tab's guess (S4, S15).
  const stored = deps.reread();
  deps.setShows(stored);
  const after = stored.find((s) => s.id === show.id) ?? show;
  const { plan: landed, cueId } = made.outcome();
  if (!failure && input.closeOnly && (!landed || landed.kind !== 'update' || !cueId)) return { ok: true, kind: 'none', cueId: null, graphic: '', message: '' };
  // The stored record had nowhere to write (another tab removed the graphic or its fields): no
  // result was written, and the operator chooses again.
  if (!failure && (!landed || landed.kind === 'choose' || !cueId)) {
    return { ok: false, choose: true, message: landed?.kind === 'choose' && landed.replaced ? replacedWords(landed.replaced) : 'Choose where results go.' };
  }
  const plan = landed && landed.kind !== 'choose' ? landed : asked && asked.kind !== 'choose' ? asked : null;
  if (!plan) return { ok: false, choose: false, message: `No result was written: ${failure}` };
  const graphic = after.graphics.find((g) => g.id === plan.graphicId)?.name ?? 'the graphic';
  if (failure) {
    return {
      ok: false,
      choose: false,
      message: plan.kind === 'update' ? `The result cue on “${graphic}” was not updated: ${failure}` : `No result cue was added for “${graphic}”: ${failure}`,
    };
  }
  const votes = `${input.tally.total} ${input.tally.total === 1 ? 'vote' : 'votes'}`;
  if (plan.kind === 'update') {
    return {
      ok: true,
      kind: 'updated',
      cueId,
      graphic,
      message: input.closed
        ? `✓ The result cue on “${graphic}” now carries the final ${votes}. Take it when you want them on air.`
        : `✓ Updated the result cue on “${graphic}” with ${votes}. Take or Update it to move the numbers on air.`,
    };
  }
  const why = plan.replaced ? `${replacedWords(plan.replaced)} ` : '';
  return { ok: true, kind: 'added', cueId, graphic, message: `✓ ${why}Added a result cue on “${graphic}”. It airs when you Take it. Nothing has gone out.` };
}

function replacedWords(replaced: 'deleted' | 'no-fields' | 'moved'): string {
  if (replaced === 'deleted') return 'The earlier result cue was deleted, so this is a new one.';
  if (replaced === 'no-fields') return 'The earlier result cue’s graphic no longer has the result fields, so this is a new one.';
  return 'The earlier result cue stays in the rundown as an ordinary cue.';
}
