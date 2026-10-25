// HELD LIVE CANDIDATES, said off air (docs/work-specs/playout-election-package/spec.md, E7.1,
// AC-3): a card on air whose candidate cannot be resolved keeps its picture
// (control/selectionAir.ts `reduceSelection`), and the operator reads here what is held, why, and
// how old it is, until they decide. A readout: it decides nothing. It subscribes to the session's
// `selections` part itself, so a capture or a landing renders this line and not the page.

import { airedOf, type SelectionAir } from '../../control/selectionAir';
import type { StorePart } from '../../control/storePart';
import { useStorePart } from './useStorePart';
import { useNow } from './ClipClock';

const age = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

const keyText = (key: readonly (string | number)[]) => key.join(' · ');

/** `nextOf`: the key an Update of that cue would air now, when it resolves: an Update takes the
 *  cue's current selection, which may no longer be the one held. */
export default function SelectionHolds({ part, labelOf, nextOf }: {
  part: StorePart<SelectionAir>;
  labelOf: (cueId: string) => string | null;
  nextOf: (cueId: string, graphic: string) => readonly (string | number)[] | null;
}) {
  const aired = useStorePart(part);
  const held = Object.keys(aired).flatMap((graphic) => {
    const inst = airedOf(aired, graphic);
    return inst?.held ? [{ graphic, inst, held: inst.held }] : [];
  });
  const holding = held.length > 0;
  const now = useNow(holding, 1000, Date.now);
  if (!holding) return null;
  return (
    <div className="pd-unsent-note" role="status" data-testid="selection-holds">
      {held.map(({ graphic, inst, held: h }) => {
        const next = inst.known ? nextOf(inst.cueId, graphic) : null;
        const moves = next && keyText(next) !== keyText(inst.selection.key);
        return (
          <p key={graphic} data-testid="selection-hold" data-graphic={graphic}>
            Holding {(inst.known && labelOf(inst.cueId)) || graphic}
            {inst.known ? ` (${keyText(inst.selection.key)})` : ''} on air: {h.reason}.
            {inst.showing ? ` Showing revision ${inst.showing.revision}, ${age(now - inst.showing.at)} old.` : ` For ${age(now - h.since)}.`}
            {moves ? ` Update would take ${keyText(next)}.` : ''}
          </p>
        );
      })}
    </div>
  );
}
