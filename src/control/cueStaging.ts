/**
 * THE HOSTED CONTROL PAGE'S STAGED EDITS, SCOPED TO THE CUE THEY WERE TYPED FOR.
 *
 * The shared staging buffer (`control_stage`, `control_shows.staged`) is keyed by GRAPHIC on the
 * server, and several cues share one graphic: three guests on one lower third is the normal case.
 * Laying the whole graphic's buffer over every cue put a name corrected on one guest on every
 * later guest of that lower third, on air and with no warning (issue #1036). So the page stages
 * each edit under its cue inside the graphic's buffer: the key is `<cue id><US><field id>`, US
 * being the ASCII unit separator, which neither a cue id nor a field id carries. The server merges
 * the keys as it always has, every open page still follows the others' typing, and no migration
 * is needed. `docs/CLOUD_PLAYOUT.md` §4 has the rule this serves: Take airs the cue as prepared.
 *
 * Imports types only, so `scripts/hosted-cue-staging.test.mjs` loads it with one transpile.
 */
import type { ResolvedValues } from '../model/productionData';
import type { OutputCue } from './hostedControl';

const CUE_FIELD = '\u001f';
/** The field-shaped name a staged Adjust record goes under in its graphic's buffer
 *  (control/hostedAdjust.ts): no field id starts with '@', so it is never read as a value. */
export const STAGED_ADJUST = '@adjust';

/** A key of the shared buffer that is a staged Adjust record, never a field value. */
export const isStagedAdjustKey = (key: string) => key.endsWith(CUE_FIELD + STAGED_ADJUST);

/** The keys `data`, typed for one cue, is staged under in its graphic's shared buffer. */
export function cueStageData(cueId: string, data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(data).map(([field, value]) => [cueId + CUE_FIELD + field, value]));
}

/**
 * THE VALUES THE HOSTED PAGE'S OPERATOR SEES FOR ONE CUE: the published cue with the edits staged
 * for THAT cue over them, so another operator typing into it is part of what a Take would send,
 * and typing into a sibling cue of the same graphic is not.
 *
 * One function because the page's ⟳ TAKE, ✎ Update, the snap's trailing write and the cue editor
 * all have to send the same values; two readings of "the cue as it stands" is how one
 * production's Take comes to mean two things. `e2e/hosted-control.spec.ts` measures it too, since
 * the page itself needs a configured backend.
 *
 * A key with no cue in it was staged by a build before cue scoping, and the buffer keeps it for the
 * life of the production. It counts only on a graphic with one cue, where graphic and cue are the
 * same thing: with several, nobody can tell which cue it was typed for. A caller that passes no
 * `cues` is asking about a graphic with this one cue.
 */
export function hostedCueValues(
  cue: OutputCue,
  staged: Record<string, Record<string, string>>,
  resolved: ResolvedValues,
  cues: readonly OutputCue[] = [cue],
): Record<string, string> {
  const own = (map: Record<string, Record<string, string>>, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  const buffer = own(staged, cue.graphic) ?? {};
  const prefix = cue.id + CUE_FIELD;
  const alone = !cues.some((c) => c.graphic === cue.graphic && c.id !== cue.id);
  const graphicWide: Record<string, string> = {};
  const mine: Record<string, string> = {};
  for (const [key, value] of Object.entries(buffer)) {
    if (isStagedAdjustKey(key)) continue;
    if (key.startsWith(prefix)) mine[key.slice(prefix.length)] = value;
    else if (alone && !key.includes(CUE_FIELD)) graphicWide[key] = value;
  }
  // BOUND VALUES SIT ON TOP OF BOTH (plan §2.7): a bound field is never a cue value, so taking a
  // cue prepared at 1-0 while the tree says 3-2 airs 3-2, and neither the published cue nor an
  // operator typing into the shared buffer can push it back. Without this the page's own ± press
  // moved the shared value and the very next ⟳ Take put the old figure back on air.
  return { ...cue.values, ...graphicWide, ...mine, ...(own(resolved, cue.graphic) ?? {}) };
}
