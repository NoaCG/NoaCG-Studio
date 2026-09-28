import type { PlayoutItem } from '../../model/shows';

/** A clip's length in seconds from the server's list, or undefined when the server gave none: a
 *  still, a template, or an item saved before lengths were kept. */
export function itemSeconds(item: Pick<PlayoutItem, 'frames' | 'fps'>): number | undefined {
  if (!item.frames || !item.fps || item.frames <= 0 || item.fps <= 0) return undefined;
  return item.frames / item.fps;
}

/**
 * A clip's length as the operator reads it (`3:00`, `1:02:05`), or '' when the server gave none.
 * The whole length is rounded to seconds first, so 119.6 s reads 2:00 and never 1:60. Shared by
 * the rundown's length column, PREVIEW's corner and the playout server picker, which must not
 * disagree about it.
 */
export function clipLength(item: Pick<PlayoutItem, 'frames' | 'fps'>): string {
  const seconds = itemSeconds(item);
  if (seconds === undefined) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
