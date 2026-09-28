import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PlayoutItem, ShowCue } from '../../model/shows';
import { slotAddress } from '../../control/playoutLink';
import type { ServerPlayoutStore, ServerTiming, StorePart } from '../../control/serverPlayoutStore';
import { clipClock, clockedClip, clockText, remainingAt, type ClipClock as ClockData } from '../../control/serverState';

/**
 * The time now, re-read every `ms` while `on`: what a number that counts between two readings of
 * the server needs. Only the component that draws the number re-renders with it, never the page
 * (docs/CLIP_PLAYBACK_PLAN.md §18, case 15).
 */
function useNow(on: boolean, ms = 250): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    setNow(performance.now());
    const t = window.setInterval(() => setNow(performance.now()), ms);
    return () => window.clearInterval(t);
  }, [on, ms]);
  return now;
}

/** The number, the word before it when there is one (HOLDING, PAUSED), and the line under it
 *  (plan §6.4, for phase 2's two endings: hold and loop). */
export function clockWords(c: ClockData): { label?: string; number: string; then: string } {
  const left = c.remaining === null ? '?:??' : clockText(c.remaining);
  switch (c.phase) {
    case 'holding':
      return { label: 'HOLDING', number: `+${clockText(c.over, 'down')}`, then: 'the last frame stays up' };
    case 'paused':
      return { label: 'PAUSED', number: `-${left}`, then: c.end === 'loop' ? 'loops until Out' : 'then holds the last frame' };
    case 'looping':
      return { number: `-${left}`, then: 'loops until Out' };
    default:
      return { number: `-${left}`, then: 'then holds the last frame' };
  }
}

/**
 * THE CLIP CLOCK (docs/CLIP_PLAYBACK_PLAN.md §6.4): one clear number for the server clip on air,
 * under the verbs and beside PROGRAM, never taller than the room that column has left.
 *
 * It reads the store's two parts and nothing else, so it is the one thing on the page that redraws
 * as the clip plays. What it shows is `clipClock` in control/serverState.ts - plain data a hardware
 * panel can read the same way (docs/backlog/companion-and-stream-deck.md).
 *
 * The last ten seconds turn it red and the last five pulse it; the digits count too, so colour is
 * never the only signal. At the end of a clip that holds it turns amber and counts up. `estimated`
 * says when the number is this page's own count rather than the server's.
 */
export default function ClipClock({
  store,
  items,
  cues,
}: {
  store: ServerPlayoutStore;
  items: readonly PlayoutItem[];
  cues: readonly ShowCue[];
}) {
  const ownership = useSyncExternalStore(store.ownership.subscribe, store.ownership.get);
  const timing = useSyncExternalStore(store.timing.subscribe, store.timing.get);
  // A clip or an audio file is up - never a still, which has nothing to count (control/serverState.ts
  // `hasClock`).
  const followed = clockedClip(ownership, timing, items);
  const paused = !!followed && !!timing[slotAddress(followed.live.slot)]?.paused;
  // Ten times a second while it plays: the number an operator counts a director out by changes on
  // the second, within a tenth of when the server's does (measured against a real 2.5.0 at four a
  // second, it could show a second late for up to a quarter of one). Paused, the number stands
  // still, and once a second is enough to notice the readings stopping (`estimated`).
  const now = useNow(!!followed, paused ? 1000 : 100);
  /** Its own render count, published beside the page's: the spec proves this one moves and that
   *  one does not. */
  const renders = useRef(0);
  renders.current += 1;
  const c = followed ? clipClock(ownership, timing, items, cues, now) : null;
  if (!c) return null;
  const words = clockWords(c);
  const said = words.label ? `${words.label} ${words.number}` : words.number;
  // How many digit-widths the line needs: the number is sized to fit the column's width, and a
  // word before it is drawn at a little under half the number's size.
  const fit = words.number.length + (words.label ? words.label.length * 0.45 + 0.6 : 0);
  return (
    <div
      className={`pd-clipclock pd-clipclock--${c.phase}`}
      role="timer"
      aria-label={`${c.label} on ${c.slot}: ${said}, ${words.then}${c.estimated ? ', estimated' : ''}`}
      data-testid="clip-clock"
      data-phase={c.phase}
      data-estimated={c.estimated ? 'true' : 'false'}
      data-renders={renders.current}
    >
      {/* The container is the box; this is what is laid out inside it, so a container query can
          fold it to one thin row when the column has little height left. */}
      <div className="pd-clipclock-in">
        <div className="pd-clipclock-head">
          <span className="pd-dot" aria-hidden="true" />
          <span className="pd-clipclock-where">ON AIR {c.slot}</span>
          <span className="pd-clipclock-name" title={c.file}>
            {c.label}
          </span>
          {c.estimated && (
            <span
              className="pd-clipclock-est"
              title="This page's own count: the playout server has not reported this clip's position in the last few seconds."
              data-testid="clip-clock-estimated"
            >
              estimated
            </span>
          )}
        </div>
        <div className="pd-clipclock-time" style={{ ['--clk-fit' as string]: fit }} data-testid="clip-clock-time">
          {words.label && <span className="pd-clipclock-label">{words.label} </span>}
          <span className="pd-clipclock-num">{words.number}</span>
        </div>
        <div className="pd-clipclock-then" data-testid="clip-clock-then">
          {words.then}
        </div>
      </div>
    </div>
  );
}

/**
 * A rundown row's REMAINING TIME while its clip is on air (plan §6.2): `-0:09` in the length
 * column, counting between readings. It subscribes to the one slot's timing, so only this cell
 * redraws as the clip plays; the rundown around it does not.
 */
export function SlotRemaining({ timing, slot, fallback }: { timing: StorePart<ServerTiming>; slot: string; fallback: string }) {
  const t = useSyncExternalStore(timing.subscribe, () => timing.get()[slot]);
  const now = useNow(!!t?.segment && !t.paused);
  const left = remainingAt(t, now);
  // A clip that has reached its end holds there: no time is left, and "-0:00" would read as a sign.
  return <>{left === null ? fallback : left <= 0 && !t?.loop ? '0:00' : `-${clockText(left)}`}</>;
}
