// HELD LIVE CANDIDATES, said off air (docs/work-specs/playout-election-package/spec.md, E7.1,
// AC-3): a card on air whose candidate cannot be resolved keeps its picture
// (control/selectionAir.ts `followSelection`), and the operator reads here what is held, why, and
// how old it is, until they decide. A readout: it decides nothing.

import { useEffect, useState } from 'react';

export interface HeldCandidate {
  graphic: string;
  label: string;
  reason: string;
  /** The aired values' revision, and when they were sent (ms). */
  revision: number;
  at: number;
}

const age = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export default function SelectionHolds({ held }: { held: HeldCandidate[] }) {
  const [now, setNow] = useState(() => Date.now());
  const holding = held.length > 0;
  useEffect(() => {
    if (!holding) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [holding]);
  if (!holding) return null;
  return (
    <div className="pd-unsent-note" role="status" data-testid="selection-holds">
      {held.map((h) => (
        <p key={h.graphic} data-testid="selection-hold" data-graphic={h.graphic}>
          Holding {h.label} on air: {h.reason}. Showing revision {h.revision}, {age(now - h.at)} old.
        </p>
      ))}
    </div>
  );
}
