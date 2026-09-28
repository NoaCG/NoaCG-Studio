// THE POLL OF THE PLAYOUT SERVER'S STATE (docs/CLIP_PLAYBACK_PLAN.md §6.7, phase 2): when the page
// asks NoaCG Bridge what each channel holds. Its own file, with nothing but types imported, so a
// Node test runs it with a fake reader and a fake clock (scripts/server-playout.test.mjs), as the
// rules beside it in ./serverState.ts are run.

import type { PlayoutResult } from './playoutLink';
import type { StateReply } from './playoutProtocol';

export interface ServerStatePoll {
  stop: () => void;
  /** Read now: after an action, or when the tab comes back into view. */
  wake: () => void;
}

/**
 * THE POLL (plan §6.7): each channel in turn, then a pause - never a second round while one is
 * still out, so a slow Bridge slows the readings rather than stacking them. Twice a second while
 * `busy()` says something is up on a rundown slot, every few seconds otherwise.
 *
 * It only READS. What a reading changes is the caller's, and nothing in here can send a command:
 * no timer on the page ever fires or queues a clip.
 */
export function pollServerState(options: {
  read: (channel: number) => Promise<{ result: PlayoutResult; reply?: StateReply }>;
  channels: () => number[];
  busy: () => boolean;
  onReading: (channel: number, reply: StateReply, receivedAt: number) => void;
  busyMs?: number;
  idleMs?: number;
}): ServerStatePoll {
  const busyMs = options.busyMs ?? 500;
  const idleMs = options.idleMs ?? 3000;
  let alive = true;
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const round = async () => {
    timer = undefined;
    running = true;
    const started = performance.now();
    try {
      for (const channel of options.channels()) {
        const { reply } = await options.read(channel);
        if (!alive) return;
        // A failed reading changes nothing: the clock goes on counting, and says `estimated` once
        // no reading has landed for a while (./serverState.ts `isEstimated`).
        if (reply) options.onReading(channel, reply, performance.now());
      }
    } catch {
      // Nor does one that cannot be read or folded (a Bridge answering a shape this page does not
      // know): the round ends here and the next one asks again, rather than the poll stopping for
      // the rest of the show with nothing on screen to say so.
    }
    running = false;
    if (!alive) return;
    if (again) {
      again = false;
      void round();
      return;
    }
    const pace = options.busy() ? busyMs : idleMs;
    timer = setTimeout(() => void round(), Math.max(0, pace - (performance.now() - started)));
  };
  void round();
  return {
    stop: () => {
      alive = false;
      if (timer) clearTimeout(timer);
    },
    wake: () => {
      if (!alive) return;
      if (running) {
        again = true;
        return;
      }
      if (timer) clearTimeout(timer);
      void round();
    },
  };
}
