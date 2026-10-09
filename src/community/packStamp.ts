// The community pack STAMP on a library graphic (docs/work-specs/community-packs/spec.md D7, AC-5):
// what the design lock reads and what the production's credit line says. Pure, no storage.
//
// The lock is the studio's: a stamped graphic offers no door to the editor, while its fields and
// cues work as for any graphic. It is not a rights control. CC BY 4.0 permits adaptations, and the
// exported files are plain templates anyone can edit elsewhere.

import type { PackStamp } from '../model/graphicDoc';
import { packStampFor, type GraphicDoc } from '../model/library';
import type { Show } from '../model/shows';

/** The shelf id a shared pack's installs are stamped with (`fromPack.id`, spec D7): its lineage,
 *  one id for every version, beside the stamp's `version`. A seed's id is its slug. */
export const sharedPackId = (lineage: string): string => `community:${lineage}`;
const isSharedPackId = (id: string): boolean => id.startsWith(sharedPackId(''));

/** The credit a pack's graphics carry: "From Pub Quiz by NoaCG", and a shared pack's licence. A
 *  stamp written before stamps carried the pack's name says "a community pack" in its place. */
export function packCredit(stamp: PackStamp): string {
  const shared = isSharedPackId(stamp.id);
  return `From ${stamp.name || 'a community pack'} by ${stamp.author}${shared ? ', CC BY 4.0' : ''}`;
}

/** One credit per pack the production's graphics came from, in pool order. */
export function productionCredits(show: Pick<Show, 'graphics'>, library: GraphicDoc[]): string[] {
  const credits = show.graphics.flatMap((g) => {
    const stamp = packStampFor(g, library);
    return stamp ? [packCredit(stamp)] : [];
  });
  return [...new Set(credits)];
}
