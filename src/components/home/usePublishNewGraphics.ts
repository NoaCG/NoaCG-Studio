// NEW GRAPHICS REACH THE OUTPUTS BY THEMSELVES while automatic updates are off
// (live-production-reliability P2, AC-2). The rules and the scheduler are control/additivePublish.ts,
// one attempt is control/publishNewGraphics.ts; this hook hands them the page: which graphics the
// published stamp does not name, whether another publish runs, and what to do once one landed.
// Decides nothing about air.

import { useEffect, useRef, useState } from 'react';
import { loadShows, type Show } from '../../model/shows';
import { createAdditivePublisher, type AdditivePublisher, type AdditiveView } from '../../control/additivePublish';
import { publishNewGraphics } from '../../control/publishNewGraphics';
import type { CuePublished, OutputPayload } from '../../control/hostedControl';
import type { PayloadVersion } from '../../control/payloadVersion';

export function usePublishNewGraphics(o: {
  show: Show | null;
  /** Published, signed in with an account that may author, and automatic updates not running. */
  enabled: boolean;
  /** The pool's graphics the published stamp, as this page knows it, does not name. */
  names: readonly string[] | null;
  /** Another publish of this page is running. */
  busy: () => boolean;
  /** Each cue's appearance and adjust records for the payload, as a press's publish measures them. */
  appearanceFor: { readonly current: ((show: Show, base?: PayloadVersion | null) => Promise<CuePublished | undefined>) | undefined };
  /** The stamp stored now: written by this page (`output` given, with the record digest it now
   *  matches when adding was the record's only change), or read. */
  onStamp: (ver: PayloadVersion, output?: OutputPayload, record?: string | null) => void;
}): AdditiveView & { enabled: boolean } {
  const { show, enabled, names } = o;
  // A new graphic saved again (a gate fix, a design change) is a new attempt; nothing else is.
  const group = enabled && names?.length ? names.join('\n') : undefined;
  const key = enabled && names?.length && show ? show.graphics.filter((g) => names.includes(g.name)).map((g) => `${g.name}@${g.savedAt}`).join('\n') : null;
  const [view, setView] = useState<AdditiveView>({ running: false, refusal: null });
  const latest = useRef(o);
  latest.current = o;
  const publisher = useRef<AdditivePublisher | null>(null);
  const showId = show?.id ?? null;
  useEffect(() => {
    if (!showId || !enabled) return;
    const p = createAdditivePublisher({
      setTimer: (ms, run) => {
        const t = setTimeout(run, ms);
        return () => clearTimeout(t);
      },
      busy: () => latest.current.busy(),
      attempt: async () => {
        const record = loadShows().find((s) => s.id === showId);
        if (!record) return { kind: 'gone' };
        const measure = latest.current.appearanceFor.current;
        const result = await publishNewGraphics(record, measure ? (base) => measure(record, base) : undefined);
        if (result.ver) latest.current.onStamp(result.ver, result.output, result.record);
        return result;
      },
      changed: setView,
    });
    publisher.current = p;
    return () => {
      p.stop();
      publisher.current = null;
      setView({ running: false, refusal: null });
    };
  }, [showId, enabled]);
  useEffect(() => {
    publisher.current?.want(key, group);
  }, [key, group, showId, enabled]);
  return { ...view, enabled };
}
