// A GRAPHIC THAT JOINS AN OBS SCENE GOES ON AIR (#2489; docs/work-specs/obs-scenes/spec.md D2 and
// Behaviour "Scenes"): making a scene, or adding a graphic to one, takes it, with no extra click.
//
// The page that published does it once the publish has landed. Which graphics joined comes from
// the publish itself (control/hostedControl.ts `PublishedCapabilities.scenes`: the scenes of the
// row it replaced and the ones it wrote, model/obsScenes.ts `joinedScenes`), so a teammate's
// publish in between, or an edit made while the publish ran, cannot shift it. The Take is the
// operator's own, so the ordinary link airs it too, as a pressed Take of a scene graphic always
// has. A graphic already up on the page is taken again: it may be up in another link only (moved
// from another scene, or taken by hand outside any scene), and a scene link draws a re-Take settled
// (OS1a R9).
//
// The Take waits for the page's own sender to be the published one (a first publish lands
// before the page renders its slug). A scene link reads a command for a graphic of another scene
// past (OS1a R6) until it has read the publish that moved the graphic into its scene. So the Take
// also waits until every open link of those scenes reports that publish, or JOIN_WAIT_MS, after
// which it goes anyway: such a link has the Take in the log, and its next boot recovers it (R7),
// as does a link that was not open at all.
// Plain, with the page through `io`: scripts/scene-join.test.mjs.

import { sceneCuesOf, type SceneJoin } from '../model/obsScenes';
import type { Show } from '../model/shows';
import type { LiveEntry } from './livePath';

/** Longer than an output's spacing between two preparations (output/prepare.ts, 15 s). */
export const JOIN_WAIT_MS = 20_000;

type SceneRecord = Pick<Show, 'obsScenes' | 'folders' | 'cues' | 'graphics'>;
type SceneCue = NonNullable<Show['cues']>[number];
const POLL_MS = 250;

/** Every open link of these scenes has read publish `n` or newer. Its READY holds it (`v`), or a
 *  change prepares towards it (`chg`, whatever its state): either way the link scoped that publish's
 *  scenes when it read it (output/main.ts `scoped`), so its scene's graphics are in its scope.
 *  A link with no READY answer yet has not. */
export function sceneLinksHold(entries: readonly Pick<LiveEntry, 'kind' | 'scene' | 'ready'>[], scenes: ReadonlySet<string>, n: number): boolean {
  return entries.every((p) => {
    if (p.kind !== 'output' || !p.scene || !scenes.has(p.scene.id)) return true;
    const r = p.ready;
    return !!r && ((r.v?.n ?? -1) >= n || (r.chg?.v.n ?? -1) >= n);
  });
}

export interface SceneJoinIo {
  /** The page's sender writes to the published log now. A first publish lands before the page
   *  renders its slug, and a Take sent before that would reach this page's PROGRAM only. */
  published: () => boolean;
  /** The production's Presence entries as they stand now. */
  entries: () => readonly Pick<LiveEntry, 'kind' | 'scene' | 'ready'>[];
  /** The production record as it is now: each join takes its scene's cue there, read again
   *  before each Take. */
  record: () => SceneRecord | undefined;
  /** The cue this page has up for a graphic now, or null: what air the operator sees. */
  airOf: (graphic: string) => string | null;
  /** The operator's Take of a cue. */
  take: (cue: SceneCue) => Promise<void>;
  /** The joins that did not go, each with why, said once on the note line. */
  failed: (failures: { join: SceneJoin; error: unknown }[]) => void;
  /** False once the page has gone. */
  live: () => boolean;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/** Take each joined graphic once its scene's open links have read publish `n` (see above). */
export async function takeJoined(io: SceneJoinIo, joins: readonly SceneJoin[], n: number): Promise<void> {
  // Nothing joined (most publishes): not even a read of the record.
  if (joins.length === 0) return;
  const now = io.now ?? Date.now;
  const wait = io.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const scenes = new Set(joins.map((j) => j.scene));
  // What each graphic's air was as the publish landed: a Take or Out of it by anyone after that is
  // the operator's word on it, and its join is not sent over it.
  const atPublish = new Map(joins.map((j) => [j.graphic, io.airOf(j.graphic)] as const));
  const start = now();
  const due = () => io.published() && sceneLinksHold(io.entries(), scenes, n);
  while (io.live() && !due() && now() - start < JOIN_WAIT_MS) await wait(POLL_MS);
  if (!io.live()) return;
  // Never sent as an unpublished Take: it would air on this page alone and never reach the log.
  if (!io.published()) {
    io.failed(joins.map((join) => ({ join, error: new Error('the page did not take the publish in time') })));
    return;
  }
  const failures: { join: SceneJoin; error: unknown }[] = [];
  for (const j of joins) {
    if (!io.live()) return;
    if (io.airOf(j.graphic) !== atPublish.get(j.graphic)) continue;
    // Read again before each Take: a scene left, or the switch turned off, while an earlier Take
    // was being sent takes this one out of the scene, and then it is not taken.
    const record = io.record();
    const cue = record ? sceneCuesOf(record, [j])[0] : null;
    if (!cue) continue;
    try {
      await io.take(cue);
    } catch (e) {
      failures.push({ join: j, error: e });
    }
  }
  if (failures.length > 0) io.failed(failures);
}
