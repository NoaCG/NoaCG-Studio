// WORD QUESTIONS (docs/work-specs/interaction/spec.md, D5 and AC-14; the Rules W1 to W9 in its
// phase 6 notes).
//
// A Word question takes ONE short word from each phone. The words become a word cloud the operator
// approves: Interaction lists them by frequency, the operator hides any that must not air, and
// "Add word cloud to rundown" writes a snapshot of the rest onto a word cloud cue
// (control/wordStaging.ts). Nothing here airs anything.
//
// Pure and Node-runnable (scripts/word-cloud.test.mjs), shared by the phone page, both audience
// providers and the panel, so a word the phone accepts is a word the server accepts.

/** The most characters (code points, as Postgres counts them) one word may have. */
export const WORD_MAX = 25;

/** The most words a cue carries: the word cloud draws this many at most. */
export const WORD_CLOUD_MAX = 30;

/** One word as the phone sends it: trimmed, no space inside, 1 to WORD_MAX characters, no line
 *  divider. Null when it is not one word. */
export function cleanWord(input: string): string | null {
  const word = input.trim().normalize('NFC');
  if (!word || /[\s|]/u.test(word) || /\p{Cc}/u.test(word)) return null;
  if (Array.from(word).length > WORD_MAX) return null;
  return word;
}

/** What makes two words the same word in the count: case does not matter. */
export function wordKey(word: string): string {
  return word.trim().normalize('NFC').toLowerCase();
}

export interface WordCount {
  /** As shown: the spelling most phones used (of equals, the first to arrive). */
  word: string;
  key: string;
  count: number;
  hidden: boolean;
}

/** How many phones sent one exact spelling: what a provider counts per round (0114's
 *  `audience_word_counts`), in the order it first arrived. */
export interface WordTally {
  word: string;
  count: number;
}

/**
 * The words of a question by frequency (most first, then alphabetically), with the operator's
 * hidden ones marked. `bodies` are the answers in arrival order; one that is not a word is skipped.
 */
export function countWords(bodies: readonly string[], hidden: readonly string[] = []): WordCount[] {
  return countWordTallies(bodies.map((word) => ({ word, count: 1 })), hidden);
}

/** The same, from counts per exact spelling. */
export function countWordTallies(tallies: readonly WordTally[], hidden: readonly string[] = []): WordCount[] {
  const hide = new Set(hidden);
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const t of tallies) {
    const word = cleanWord(t.word);
    const n = Number.isFinite(t.count) && t.count > 0 ? Math.floor(t.count) : 0;
    if (!word || !n) continue;
    const key = wordKey(word);
    const g = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    g.count += n;
    g.spellings.set(word, (g.spellings.get(word) ?? 0) + n);
    groups.set(key, g);
  }
  const out: WordCount[] = [];
  for (const [key, g] of groups) {
    let word = '';
    let most = 0;
    for (const [spelling, n] of g.spellings) if (n > most) [word, most] = [spelling, n];
    out.push({ word, key, count: g.count, hidden: hide.has(key) });
  }
  return out.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The cue's Words value: the shown words, most first, at most WORD_CLOUD_MAX, one `word | count`
 *  line each. A hidden word is never in it. */
export function wordLines(counts: readonly WordCount[]): string {
  return counts
    .filter((w) => !w.hidden)
    .slice(0, WORD_CLOUD_MAX)
    .map((w) => `${w.word} | ${w.count}`)
    .join('\n');
}

type Field = { field: string; title?: string };

/** The LAST field titled one of `wanted` (imported artwork puts its own fields after the designer's
 *  layers; control/messageStaging.ts `lastTitled` is the same rule). */
function lastTitled(fields: readonly Field[], wanted: readonly string[]): string | null {
  let found: string | null = null;
  for (const f of fields) if (wanted.includes((f.title ?? '').trim().toLowerCase())) found = f.field;
  return found;
}

/** A word cloud's question and words fields, by title, or null when the graphic is not one. */
export function wordCloudFields(fields: readonly Field[]): { question: string; words: string } | null {
  const question = lastTitled(fields, ['question']);
  const words = lastTitled(fields, ['words']);
  return question && words ? { question, words } : null;
}

/** A cue's Words value without the word whose key is `key` (W6: a word hidden after the press leaves
 *  the cue it was staged onto). Lines that are not `word | count` stay as they are. */
export function wordsWithout(value: string, key: string): string {
  return value
    .split('\n')
    .filter((line) => {
      const at = line.lastIndexOf('|');
      return at < 0 || wordKey(line.slice(0, at)) !== key;
    })
    .join('\n');
}
