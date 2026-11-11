// A TAKE'S PRESET, RESOLVED ON THE OUTPUT FROM ITS OWN BOX (live-publishing spec W1, phase 3).
//
// A Take never waits for the production page to measure the values it airs. When the page's box is
// for other values, the Take's `update` carries a place hint (control/cueAdjust.ts `PlaceHint`)
// beside `appearance`, the place that older box gives. A stage that reads the hint holds that
// graphic's commands, measures the values in a frame of its own (preview/measureDocument.ts), and
// then applies the update with its frame resolved from its own measurement, and every command held
// behind it in order. So the graphic is first seen at the preset's place. A measurement that fails
// or runs past its cap leaves `appearance` as sent, which is what an older output applies.
//
// Other graphics never wait on it, and nothing else changes: a command for a graphic not being
// placed goes straight through. The stage decides where a hint may be read (`canPlace`): a NoaCG
// graphic's frame on a stage that is on air. Node-tested with fakes (scripts/place-on-output.test.mjs).

import { placedAppearance, readAppearance, readPlaceHint, type AppliedAppearance, type Measurement } from '../control/cueAdjust.ts';

/** How long an output holds a Take for its own measurement before it applies the place as sent:
 *  what the production page's own wait for a measurement was capped at. */
export const PLACE_CAP_MS = 2_000;

/** A command as the stage takes it (the log's `msg`). */
type Msg = { t: string; data?: Record<string, string>; appearance?: unknown; place?: unknown; typed?: unknown };

export interface PlacerIo<M extends Msg> {
  /** Apply one command to the graphic now (the stage's own `apply`). */
  apply: (graphic: string, msg: M) => void;
  /** Whether a hint for this graphic may be resolved here now. */
  canPlace: (graphic: string) => boolean;
  /** Measure the graphic settled with `values` in `look`'s style; null when it cannot, by the cap. */
  measure: (graphic: string, values: Record<string, string>, look: AppliedAppearance | null) => Promise<Measurement | null>;
  /** Start work after the current task: the page's own monitor applies a Take before its send. */
  defer: (run: () => void) => void;
}

export function createPlacer<M extends Msg>(io: PlacerIo<M>) {
  /** Per graphic being placed, the update with the hint first, then what came behind it. */
  const holding = new Map<string, M[]>();
  const apply = (graphic: string, msg: M): void => {
    const queue = holding.get(graphic);
    if (queue) {
      queue.push(msg);
      return;
    }
    const hint = msg.t === 'update' && msg.typed === undefined && msg.place !== undefined ? readPlaceHint(msg.place) : null;
    if (!hint || !io.canPlace(graphic)) return io.apply(graphic, msg);
    const held: M[] = [msg];
    holding.set(graphic, held);
    const sent = msg.appearance === undefined ? null : readAppearance(msg.appearance);
    const values = msg.data ?? {};
    io.defer(() => {
      void io
        .measure(graphic, values, sent)
        .catch(() => null)
        .then((m) => {
          // Dropped meanwhile (the graphic left the stage, the stage went): nothing to apply.
          if (holding.get(graphic) !== held) return;
          holding.delete(graphic);
          const look = placedAppearance(sent, hint, m);
          const [first, ...rest] = held;
          io.apply(graphic, look ? ({ ...first, appearance: look } as M) : first);
          for (const next of rest) apply(graphic, next);
        });
    });
  };
  return {
    apply,
    /** The graphics whose commands wait for a measurement now. */
    placing: (graphic: string) => holding.has(graphic),
    /** Forget a graphic's held commands: it has left the stage. */
    drop: (graphic: string) => void holding.delete(graphic),
    /** Forget every held command: the stage is gone. */
    clear: () => holding.clear(),
  };
}
