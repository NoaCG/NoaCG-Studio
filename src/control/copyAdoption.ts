// ADOPTION (live-publishing O5, docs/work-specs/live-publishing/designs/G1.md section 5).
//
// Once the production-copies switch is on, no page built before copy truth can save beside this
// one, and each production's unstamped copies are settled once: a published production keeps what
// is published now, a production never published takes the library's current design. Adoption
// writes design members only, outside the undo history, and stamps every copy it settles, so it
// never runs again for that copy. Safety does not depend on it: the send-time settle
// (model/copySettle.ts) protects every send without it.
//
// The rule per unstamped copy, candidates in order (the copy, then the library record it links to),
// each taken whole:
//   - published (the record's `hostedSlug`), the stamp readable and naming the graphic: the first
//     candidate whose digest equals the stamp's `g[name]`, else whose edit time equals `t[name]`,
//     settled at the later of its own time and `t[name]`, so G3 never reads the design on air as
//     older than air;
//   - published otherwise (nothing matches, the graphic not named, the stamp unreadable): the copy,
//     stamped with its own time. A published production never takes a library design here;
//   - never published: the library record's current design when this browser holds it, otherwise
//     the copy.
//
// `digest` is injected (control/hostedControl.ts `copyDigest` in the app), so the rule runs in Node
// (scripts/copy-adoption.test.mjs).

import type { Show } from '../model/shows';
import type { GraphicDoc } from '../model/library';
import type { SavedGraphic } from '../model/packets';
import type { SpxTemplate } from '../model/types';
import { stamped } from '../model/copySettle';
import type { PayloadVersion } from './payloadVersion';

/** The design members adoption gives one copy. */
export interface AdoptedDesign {
  template: SpxTemplate;
  savedAt: string;
  graphicId?: string;
}

interface Candidate extends AdoptedDesign {
  /** When this candidate's design was last edited. */
  time: string;
}

const later = (a: string, b: string | undefined): string => (b && Date.parse(b) > Date.parse(a) ? b : a);

/**
 * What adoption writes for `show`, by copy id: only unstamped copies appear. `published` is the
 * stamp read from the published row (null when unpublished, unreadable, or published before stamps).
 */
export async function adoptionPlan(
  show: Show,
  library: readonly GraphicDoc[],
  published: PayloadVersion | null,
  digest: (show: Show, index: number, template: SpxTemplate) => Promise<string>,
): Promise<Record<string, AdoptedDesign>> {
  const plan: Record<string, AdoptedDesign> = {};
  for (const [index, g] of show.graphics.entries()) {
    if (stamped(g)) continue;
    const own: Candidate = { template: g.template, savedAt: g.savedAt, graphicId: g.graphicId, time: g.savedAt };
    const doc = g.graphicId ? library.find((d) => d.id === g.graphicId) : undefined;
    const fromLibrary: Candidate | null = doc ? { template: doc.template, savedAt: doc.updatedAt, graphicId: doc.id, time: doc.updatedAt } : null;
    if (show.hostedSlug) {
      const onAir = published?.g[g.name];
      const editedAt = published?.t?.[g.name];
      let chosen: Candidate | null = null;
      if (onAir) {
        for (const c of [own, fromLibrary]) {
          if (c && (await digest(show, index, c.template)) === onAir) { chosen = c; break; }
        }
        if (!chosen && editedAt) chosen = [own, fromLibrary].find((c) => c && c.time === editedAt) ?? null;
      }
      plan[g.id] = chosen
        ? { template: chosen.template, savedAt: later(chosen.time, editedAt), graphicId: chosen.graphicId }
        : { template: own.template, savedAt: own.time, graphicId: own.graphicId };
    } else {
      const c = fromLibrary ?? own;
      plan[g.id] = { template: c.template, savedAt: c.time, graphicId: c.graphicId };
    }
  }
  return plan;
}

/** The copies of `graphics` that adoption still owes (unstamped). */
export function owesAdoption(graphics: readonly SavedGraphic[]): boolean {
  return graphics.some((g) => !stamped(g));
}
