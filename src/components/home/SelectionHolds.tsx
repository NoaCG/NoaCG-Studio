// HELD LIVE CANDIDATES, said off air (docs/work-specs/playout-election-package/spec.md, E7.1,
// AC-3): a card on air whose candidate cannot be resolved keeps its picture
// (control/selectionAir.ts `followSelection`), and the operator reads here what is held, why, and
// how old it is, until they decide. A readout: it decides nothing. It subscribes to the session's
// `selections` part itself, so a capture or a landing renders this line and not the page.

import type { SelectionAir } from '../../control/selectionAir';
import type { StorePart } from '../../control/storePart';
import { useStorePart } from './useStorePart';
import { useNow } from './ClipClock';

const age = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export default function SelectionHolds({ part, labelOf }: { part: StorePart<SelectionAir>; labelOf: (cueId: string) => string | null }) {
  const aired = useStorePart(part);
  const held = Object.entries(aired).flatMap(([graphic, inst]) => (inst.held ? [{ graphic, inst, held: inst.held }] : []));
  const holding = held.length > 0;
  const now = useNow(holding, 1000, Date.now);
  if (!holding) return null;
  return (
    <div className="pd-unsent-note" role="status" data-testid="selection-holds">
      {held.map(({ graphic, inst, held: h }) => (
        <p key={graphic} data-testid="selection-hold" data-graphic={graphic}>
          Holding {labelOf(inst.cueId) ?? graphic} on air: {h.reason}. Showing revision {inst.revision}, {age(now - inst.at)} old.
        </p>
      ))}
    </div>
  );
}
