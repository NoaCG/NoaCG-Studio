import type { PlayoutItem } from '../../model/shows';

/**
 * A clip's length as the operator reads it (`3:00`, `1:02:05`), or '' when the server gave none.
 * The whole length is rounded to seconds first, so 119.6 s reads 2:00 and never 1:60. Shared by
 * the rundown's length column and the playout server picker, which must not disagree about it.
 */
export function clipLength(item: Pick<PlayoutItem, 'frames' | 'fps'>): string {
  if (!item.frames || !item.fps || item.frames <= 0 || item.fps <= 0) return '';
  const total = Math.round(item.frames / item.fps);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
