// HIDDEN WORDS NEVER ON A CUE (docs/work-specs/interaction/spec.md AC-14; Rules W6 and W11 in its
// phase 6 notes).
//
// A Word question's hidden words live on the question (`Show.questions[].hidden`). This is the one
// rule that keeps them off every cue that carries that question's words, applied INSIDE every write
// that can put a word on a cue or hide one, on the record that write lands on: a press (its rebased
// pass included), Hide, and a team merge. A tab's own earlier reading never decides, so a word
// hidden in another tab or by a teammate stays off the cue whatever order the writes land in.
//
// A cue carries a question's words when it is the question's result cue (`Show.resultCues`): a
// mapped cue belongs to that one question and no other. A word cloud cue that no question maps (the
// cue left behind by Change, a duplicate of a result cue) carries the words of the one Word question
// whose text its Question holds; when two Word questions share that text (Duplicate keeps it), it is
// nobody's and is left as it is. Only the Words lines go; nothing else on a cue changes.
//
// Pure and Node-runnable (scripts/word-cloud.test.mjs).

import type { Show } from './shows';
import { readQuestions } from './questions.ts';
import { readResultCues } from './resultCues.ts';
import { wordCloudFields, wordsWithout } from './wordCloud.ts';

/** Take every hidden word of every Word question off the cues that carry that question's words.
 *  Changes `show` in place; true when a cue changed. */
export function scrubHiddenWords(show: Pick<Show, 'questions' | 'cues' | 'graphics' | 'resultCues'>): boolean {
  const words = readQuestions(show.questions).filter((q) => q.type === 'word');
  const questions = words.filter((q) => (q.hidden?.length ?? 0) > 0);
  if (!questions.length || !show.cues?.length) return false;
  const mapped = readResultCues(show.resultCues);
  const mappedCues = new Set(Object.values(mapped));
  const sameText = (text: string) => words.filter((w) => w.text.trim() === text.trim()).length;
  let changed = false;
  for (const cue of show.cues) {
    const graphic = show.graphics.find((g) => g.id === cue.sourceId);
    const map = graphic ? wordCloudFields(graphic.template.fields ?? []) : null;
    const words = map ? cue.values?.[map.words] : undefined;
    if (!map || typeof words !== 'string') continue;
    let next = words;
    for (const q of questions) {
      const own = mapped[q.id] === cue.id;
      const orphan = !mappedCues.has(cue.id) && (cue.values[map.question] ?? '').trim() === q.text.trim() && sameText(q.text) === 1;
      if (!own && !orphan) continue;
      for (const key of q.hidden ?? []) next = wordsWithout(next, key);
    }
    if (next !== words) {
      cue.values = { ...cue.values, [map.words]: next };
      changed = true;
    }
  }
  return changed;
}
