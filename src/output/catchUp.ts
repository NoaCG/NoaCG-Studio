// WHEN A HIDDEN BOOT CATCH-UP IS OVER (docs/CLOUD_PLAYOUT.md §3).
//
// The renderer replays every command it missed off air and has to know when that replay has
// finished before it comes back. A fixed timer cannot know: the replay only starts once the
// documents have loaded, and how long it takes is whatever the log happens to hold. Guessing
// short is what put a rehearsal's entrances and exits on air a second after a CasparCG browser
// source loaded - the whole output flashing on load, reported by the owner on 2026-09-22.
//
// So the renderer asks. Each document answers `motion` on its ordinary state reply
// (preview/previewProtocol.ts) - the summed playhead of everything GSAP is holding - and this
// walk waits for two asks in a row that come back ANSWERED with the same number from every
// graphic. It lives here, out of main.ts, because it is the one part of the boot a spec can
// drive without a backend (e2e/output-first-paint.spec.ts).

/** What this walk needs of an OutputStage — nothing that needs a backend to exist. */
export interface SettleableStage {
  graphics: string[];
  requestState(graphic: string): void;
  motion: ReadonlyMap<string, number>;
  replies: ReadonlyMap<string, number>;
  whenLoaded(): Promise<void>;
  setVisible(visible: boolean): void;
}

export interface CatchUpTiming {
  /** No reveal before this, measured from the moment the documents have loaded and the replay
   *  can actually run. It covers the fonts wait every entrance goes through (composeDocument's
   *  live-control `waitFonts`, capped at 400 ms), so a graphic whose entrance has not started
   *  yet is never read as one that has finished. */
  floorMs: number;
  /** And no later than this. A graphic that never stops moving - a ticker, a clock - would hold
   *  a renderer off air for ever otherwise. Reaching it is the old fixed-timer behaviour, and
   *  the only case where a replay can still be seen finishing. */
  capMs: number;
  /** How often to ask. */
  pollMs: number;
}

export const CATCH_UP_TIMING: CatchUpTiming = { floorMs: 1200, capMs: 6000, pollMs: 150 };

/** Whether the walk ended because everything stood still, or because it ran out of patience. */
export type CatchUpEnding = 'settled' | 'cap';

/**
 * Wait for the replay to stand still, then put the stage back on air. Resolves with which of the
 * two ended it, which is what the debug overlay says out loud.
 */
export async function airWhenSettled(
  stage: SettleableStage,
  timing: CatchUpTiming = CATCH_UP_TIMING,
  now: () => number = Date.now,
): Promise<CatchUpEnding> {
  await stage.whenLoaded();
  const floor = now() + timing.floorMs;
  const deadline = now() + timing.capMs;
  /** What one graphic last said: how many times it has answered, and its playhead. */
  const read = (graphic: string) => ({
    replies: stage.replies.get(graphic) ?? 0,
    motion: stage.motion.get(graphic) ?? -1,
  });
  let previous = new Map(stage.graphics.map((g) => [g, read(g)]));
  let stillFor = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
    // Ask, then read what the PREVIOUS ask brought back: the answers are messages, so they land
    // between turns of this loop. A graphic counts as still only when it ANSWERED again with the
    // playhead it had before - a document working through the replay answers nothing at all, and
    // reading that silence as stillness is how this waited on the wrong thing.
    stage.graphics.forEach((g) => stage.requestState(g));
    const reading = new Map(stage.graphics.map((g) => [g, read(g)]));
    const still = stage.graphics.every((g) => {
      const now_ = reading.get(g);
      const was = previous.get(g);
      return Boolean(now_ && was) && now_!.replies > was!.replies && now_!.motion === was!.motion;
    });
    previous = reading;
    stillFor = still ? stillFor + timing.pollMs : 0;
    // Two still readings, because the first one only says the graphics agreed with an ask that
    // may have been answered before the replay even started.
    const settled = now() >= floor && stillFor >= timing.pollMs * 2;
    if (settled || now() >= deadline) {
      stage.setVisible(true);
      return settled ? 'settled' : 'cap';
    }
  }
}
