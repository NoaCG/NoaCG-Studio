// THE PRODUCTION'S QUESTION LIST (docs/work-specs/interaction/spec.md, D1, D5 and "Question
// lifecycle"; the Rules in its phase 1 notes).
//
// An operator writes the show's questions before air and, during the show, picks which one the
// phones answer now. The LIST lives here, on the production record (`Show.questions`), so it is
// saved and synced like the rundown. What phones are answering, and the answers themselves, live
// with the audience provider: a question's one result is a round keyed by the question's id
// (migration 0111), and going live sends a snapshot of the text and options.
//
// Pure and Node-runnable (scripts/interaction-questions.test.mjs). Every edit returns a NEW list
// and leaves the old one alone, so a surface can compose two edits without either seeing a list
// the other half-changed.
//
// VERSIONING (`root/version-every-persisted-format-ship-breaking`): `Show.questions` is additive
// optional. A question of a type this build does not know (Word arrives in phase 6) is read and
// written back exactly as it was, and is read-only here: it is shown, never edited or put live.

/** The types this build can ask. Multiple choice is `choice`; Open lands as a message; Word takes one
 *  short word per phone and makes a word cloud (model/wordCloud.ts). */
export type QuestionType = 'open' | 'choice' | 'word';

export interface ShowQuestion {
  /** Made once, never reused: the server keys the question's one result by it (R2, R11). */
  id: string;
  /** Never changes after creation (R8). A type this build does not know is kept as it came. */
  type: QuestionType | (string & {});
  text: string;
  /** Multiple choice only: 2 to 8, each at most 60 characters. */
  options?: string[];
  /** Multiple choice only: false makes each phone's first vote final (owner, 2026-11-23). Absent
   *  means a vote can be changed while the question is live, as before; true is never stored. Part
   *  of what was asked, so locked with the words. */
  allowChange?: false;
  /** Word only: the words the operator hid, by `wordKey` (model/wordCloud.ts). A hidden word stays
   *  in the count but never reaches a cue. Not part of what was asked, so never locked. */
  hidden?: string[];
}

/** The server's own caps (0035's round guard), so a question never goes live trimmed. */
export const QUESTION_LIMITS = { text: 200, option: 60, minOptions: 2, maxOptions: 8 } as const;

/** The id shape the server accepts (0111's `question_id` check). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether `id` can name a question on the server. */
export function isQuestionId(id: string): boolean {
  return ID.test(id);
}

/** What Go live sends for a question this build can ask (audienceTypes `QuestionLive`). */
export function toLive(q: ShowQuestion & { type: QuestionType }): { id: string; type: QuestionType; text: string; options?: string[]; allowChange?: boolean } {
  return q.type === 'choice'
    ? { id: q.id, type: 'choice', text: q.text, options: q.options ?? [], allowChange: q.allowChange !== false }
    : { id: q.id, type: q.type, text: q.text };
}

export function isKnownType(type: string): type is QuestionType {
  return type === 'open' || type === 'choice' || type === 'word';
}

/** One option as the server takes it: trimmed and capped. */
const cleanOption = (line: string): string => line.trim().slice(0, QUESTION_LIMITS.option);

/** One option per line, trimmed, blank lines dropped, capped as the server caps them. */
export function cleanOptions(lines: readonly string[]): string[] {
  return lines.map(cleanOption).filter(Boolean).slice(0, QUESTION_LIMITS.maxOptions);
}

/** An option's letter, as phones, chat votes and the composer name it: A, B, C... */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// THE OPTION ROWS of the composer (live-production-reliability P3, owner 2026-11-23): one row per
// option as the operator is typing them, blanks included; `cleanOptions` makes what is saved. Each
// edit returns a new list, or null where the limits refuse it.

/** A vote's rows: its options, then empty rows up to the fewest a vote takes. */
export function startOptionRows(options: readonly string[] = []): string[] {
  const rows = [...options];
  while (rows.length < QUESTION_LIMITS.minOptions) rows.push('');
  return rows;
}

/** An empty row after `at`, or null at the most a vote takes. */
export function addOptionRow(rows: readonly string[], at: number): string[] | null {
  if (rows.length >= QUESTION_LIMITS.maxOptions) return null;
  const next = [...rows];
  next.splice(Math.max(0, Math.min(at + 1, rows.length)), 0, '');
  return next;
}

/** Without row `at`, or null at the fewest a vote takes. */
export function removeOptionRow(rows: readonly string[], at: number): string[] | null {
  if (rows.length <= QUESTION_LIMITS.minOptions || at < 0 || at >= rows.length) return null;
  return rows.filter((_, i) => i !== at);
}

/** Move the item at `from` to `to` (clamped): an option row, or a question in the list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= list.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Text with line breaks pasted into row `at` becomes rows there, each cleaned as `cleanOptions`
 * cleans it. `text` is the row's whole text with the paste in it. The empty rows go (they were room
 * to type), the other options keep their places, and the pasted lines take the room that is left:
 * `dropped` counts the lines that did not fit, `focus` is the last row pasted. Null when the text
 * has no line break, so a plain paste stays a plain paste.
 */
export function pasteOptionRows(rows: readonly string[], at: number, text: string): { rows: string[]; focus: number; dropped: number } | null {
  if (!/[\r\n]/.test(text)) return null;
  const lines = text.split(/\r\n|\r|\n/).map(cleanOption).filter(Boolean);
  const before = rows.slice(0, at).filter((r) => r.trim() !== '');
  const after = rows.slice(at + 1).filter((r) => r.trim() !== '');
  const kept = lines.slice(0, Math.max(0, QUESTION_LIMITS.maxOptions - before.length - after.length));
  return { rows: startOptionRows([...before, ...kept, ...after]), focus: Math.max(0, before.length + kept.length - 1), dropped: lines.length - kept.length };
}

/** Why a question cannot be saved as written, or null when it can. */
export function questionProblem(type: string, text: string, options: readonly string[] = []): string | null {
  if (!text.trim()) return 'Write the question first.';
  if (type === 'choice' && cleanOptions(options).length < QUESTION_LIMITS.minOptions) return 'A vote needs two options at least.';
  return null;
}

/**
 * The stored list as this build reads it. Damaged entries (no id, no text) are dropped rather than
 * handed to a panel that would throw on them; a duplicate id keeps its first entry, because the
 * server would otherwise file two questions' answers under one result.
 */
export function readQuestions(raw: unknown): ShowQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ShowQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    if (typeof q.id !== 'string' || !ID.test(q.id) || seen.has(q.id)) continue;
    if (typeof q.type !== 'string' || typeof q.text !== 'string') continue;
    seen.add(q.id);
    // An unknown type is kept whole, so writing the list back loses nothing a newer build stored.
    if (!isKnownType(q.type)) {
      out.push({ ...(q as unknown as ShowQuestion) });
      continue;
    }
    // Additive optional fields a newer build stored stay on the question (the spread), so a list
    // edit here never drops them.
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : [];
    const { options: _options, hidden: _hidden, allowChange: _allowChange, ...rest } = q;
    const hidden = Array.isArray(q.hidden) ? [...new Set(q.hidden.filter((w): w is string => typeof w === 'string' && w.length > 0))] : [];
    if (q.type === 'choice') out.push({ ...rest, options, ...(q.allowChange === false ? { allowChange: false } : {}) } as unknown as ShowQuestion);
    else if (q.type === 'word' && hidden.length > 0) out.push({ ...rest, hidden } as unknown as ShowQuestion);
    else out.push({ ...rest } as unknown as ShowQuestion);
  }
  return out;
}

/** A new question, or the reason it cannot be one. */
export function makeQuestion(
  id: string,
  type: QuestionType,
  text: string,
  options: readonly string[] = [],
  allowChange = true,
): { question: ShowQuestion } | { error: string } {
  if (!ID.test(id)) return { error: 'That question id cannot be used.' };
  const problem = questionProblem(type, text, options);
  if (problem) return { error: problem };
  const clean = text.trim().slice(0, QUESTION_LIMITS.text);
  if (type !== 'choice') return { question: { id, type, text: clean } };
  return { question: { id, type, text: clean, options: cleanOptions(options), ...(allowChange ? {} : { allowChange: false as const }) } };
}

/**
 * Whether a question's words are locked (R8): while it is live, and once its result has an answer
 * or a vote, so the result always matches what was asked. A type this build does not know is
 * locked too: it is not this build's to change.
 */
export function questionLocked(question: ShowQuestion, state: { live: boolean; answers: number }): boolean {
  return state.live || state.answers > 0 || !isKnownType(question.type);
}

export function addQuestion(list: readonly ShowQuestion[], question: ShowQuestion): ShowQuestion[] {
  if (list.some((q) => q.id === question.id)) return [...list];
  return [...list, question];
}

/** Change the text, options or change policy of a question that is not locked. The type is not
 *  editable here or anywhere (R8): a changed type is a new question. */
export function editQuestion(
  list: readonly ShowQuestion[],
  id: string,
  patch: { text?: string; options?: readonly string[]; allowChange?: boolean },
  locked: boolean,
): { list: ShowQuestion[] } | { error: string } {
  const at = list.findIndex((q) => q.id === id);
  if (at < 0) return { error: 'That question is no longer in the list.' };
  if (locked) return { error: 'This question is live or has answers, so its words stay as they were asked. Duplicate it to ask a changed version.' };
  const was = list[at];
  if (!isKnownType(was.type)) return { error: 'This question was made by a newer version of NoaCG.' };
  const made = makeQuestion(was.id, was.type, patch.text ?? was.text, patch.options ?? was.options ?? [], patch.allowChange ?? was.allowChange !== false);
  if ('error' in made) return made;
  const next = [...list];
  // The policy is written whole by `made`: switching changes back on must not leave the old false.
  const { allowChange: _allowChange, ...kept } = was;
  next[at] = { ...kept, ...made.question };
  return { list: next };
}

/** Hide a word of a Word question from its cue, or show it again (`key` is the word's `wordKey`).
 *  Hiding changes nothing that was asked or answered, so it is allowed while live and with answers. */
export function setWordHidden(list: readonly ShowQuestion[], id: string, key: string, hide: boolean): ShowQuestion[] {
  return list.map((q) => {
    if (q.id !== id || q.type !== 'word' || !key) return q;
    const now = new Set(q.hidden ?? []);
    if (hide === now.has(key)) return q;
    if (hide) now.add(key);
    else now.delete(key);
    const { hidden: _hidden, ...rest } = q;
    return now.size > 0 ? { ...rest, hidden: [...now] } : rest;
  });
}

/** Move a question to `to` (clamped), for drag and for the keyboard's up and down. */
export function moveQuestion(list: readonly ShowQuestion[], id: string, to: number): ShowQuestion[] {
  return moveItem(list, list.findIndex((q) => q.id === id), to);
}

/** A copy under a NEW id, right after the original. It has no result yet, so it starts from zero
 *  (R11). */
export function duplicateQuestion(list: readonly ShowQuestion[], id: string, newId: string): ShowQuestion[] {
  const at = list.findIndex((q) => q.id === id);
  if (at < 0 || !ID.test(newId) || list.some((q) => q.id === newId)) return [...list];
  // The words hidden on the original were hidden from its answers; the copy has none yet.
  const { hidden: _hidden, ...was } = list[at];
  const copy: ShowQuestion = { ...was, id: newId, ...(was.options ? { options: [...was.options] } : {}) };
  const next = [...list];
  next.splice(at + 1, 0, copy);
  return next;
}

/** Remove a question from the list. Its result, answers and votes stay with the provider (R10). */
export function removeQuestion(list: readonly ShowQuestion[], id: string): ShowQuestion[] {
  return list.filter((q) => q.id !== id);
}
