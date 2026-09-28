import type { PlayoutItem } from '../../model/shows';
import { fileSeconds } from '../../model/cuePlayback';

/**
 * A clip's length as the operator reads it (`3:00`, `1:02:05`), or '' when the server gave none.
 * The whole length is rounded to seconds first, so 119.6 s reads 2:00 and never 1:60. Shared by
 * the rundown's length column, PREVIEW's corner and the playout server picker, which must not
 * disagree about it.
 */
export function clipLength(item: Pick<PlayoutItem, 'frames' | 'fps'>): string {
  // The server's list length, by the model's one rule (none for a still or an older item).
  return lengthText(fileSeconds(item));
}

/** A length in seconds as the operator reads it, the same way; '' when it is not known. What a cue
 *  plays of its file (its trim) reads through this, so a trimmed clip shows its own length. */
export function lengthText(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
