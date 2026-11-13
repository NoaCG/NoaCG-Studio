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
// A scene link reads a command for a graphic of another scene past (OS1a R6) until it has read the
// publish that moved the graphic into its scene. So the Take waits until every open link of those
// scenes reports that publish, or JOIN_WAIT_MS, after which it goes anyway: such a link has the
// Take in the log, and its next boot recovers it (R7), as does a link that was not open at all.
// Pure: scripts/scene-join.test.mjs.

import type { SceneJoin } from '../model/obsScenes';
import type { LiveEntry } from './livePath';

/** Longer than an output's spacing between two preparations (output/prepare.ts, 15 s). */
export const JOIN_WAIT_MS = 20_000;
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
  /** The production's Presence entries as they stand now. */
  entries: () => readonly Pick<LiveEntry, 'kind' | 'scene' | 'ready'>[];
  /** The operator's Take of the scene's first cue of the graphic, as the record is now; nothing
   *  when the scene no longer holds it. */
  take: (join: SceneJoin) => Promise<void>;
  /** Said on the note line when a Take threw: the other joins still go. */
  failed: (join: SceneJoin, error: unknown) => void;
  /** False once the page has gone. */
  live: () => boolean;
  now: () => number;
  wait: (ms: number) => Promise<void>;
}

/** Take each joined graphic once its scene's open links have read publish `n` (see above). */
export async function takeJoined(io: SceneJoinIo, joins: readonly SceneJoin[], n: number, limitMs = JOIN_WAIT_MS): Promise<void> {
  if (joins.length === 0) return;
  const scenes = new Set(joins.map((j) => j.scene));
  const start = io.now();
  while (io.live() && !sceneLinksHold(io.entries(), scenes, n) && io.now() - start < limitMs) await io.wait(POLL_MS);
  for (const j of joins) {
    if (!io.live()) return;
    try {
      await io.take(j);
    } catch (e) {
      io.failed(j, e);
    }
  }
}
