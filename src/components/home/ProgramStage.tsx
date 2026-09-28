import { forwardRef, useEffect, useState } from 'react';
import { buildOutputPayload, type OutputPayload } from '../../control/hostedControl';
import PayloadStage, { type PayloadStageHandle } from './PayloadStage';
import type { GraphicDoc } from '../../model/library';
import type { Show } from '../../model/shows';

/**
 * The in-app PROGRAM monitor: a PayloadStage over the production's own output payload, built
 * from the LOCAL show (the authoring cockpit renders what it is about to publish).
 *
 * This was the rehearsal stage. Rehearsal is gone (docs/PLAYOUT_DASHBOARD.md §6): preview is
 * local and always available, so a separate practise mode was a second way to do what the
 * surface already does — and the one mistake it could cause, believing you were rehearsing
 * while you were live, went with it.
 */
export type ProgramStageHandle = PayloadStageHandle;

const ProgramStage = forwardRef<
  ProgramStageHandle,
  {
    show: Show;
    library: GraphicDoc[];
    empty: boolean;
    /** What an empty monitor says; "Nothing on air" unless the page knows better. */
    emptyLabel?: string;
    /** Machine-state replies from the monitor's documents, with the values that did not fit —
     *  see PayloadStage. */
    onState?: (
      graphic: string,
      state: { groups?: Record<string, string> } | null,
      overflow: string[],
    ) => void;
    /** A fresh stage exists and knows nothing about air — see PayloadStage.onReady. */
    onReady?: () => void;
  }
>(
  function ProgramStage({ show, library, empty, emptyLabel, onState, onReady }, ref) {
    const [payload, setPayload] = useState<OutputPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Rebuild only when the pool's own content changes. The show object gets a new identity on
    // every store write (renaming a cue, typing a field), and rebuilding here re-inlines every
    // asset as a data URL and reloads every iframe — which would restart the monitor under the
    // operator on a keystroke. Cue VALUES deliberately do not appear in the signature: they ride
    // each take as `update` data, so a rebuild is never needed to pick them up. The LAYER does:
    // it is the stage's paint order.
    const poolSignature = show.graphics.map((g) => `${g.id}:${g.savedAt}:${g.layer ?? ''}`).join('|');
    useEffect(() => {
      let alive = true;
      setError(null);
      void buildOutputPayload(show, library)
        .then((p) => {
          if (alive) setPayload(p);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poolSignature, library]);

    return (
      <PayloadStage
        ref={ref}
        payload={payload}
        error={error}
        emptyLabel={empty ? (emptyLabel ?? 'Nothing on air') : undefined}
        onState={onState}
        onReady={onReady}
      />
    );
  },
);

export default ProgramStage;
