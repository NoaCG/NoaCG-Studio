// A GRAPHIC THAT JOINS AN OBS SCENE GOES ON AIR (#2489; docs/work-specs/obs-scenes/spec.md D2 and
// Behaviour "Scenes"): making a scene, or adding a graphic to one, takes it, with no extra click.
//
// The page that published does it, once the publish has landed (model/obsScenes.ts
// `joinedSceneCues` says which), with the operator's own Take: the same command a Take press sends,
// so the ordinary link airs it too, as a pressed Take of a scene graphic always has.
//
// A scene link reads a command for a graphic of another scene past (OS1a R6) until it holds the
// publish that moved the graphic into its scene. So the Take waits until every open link of those
// scenes reports that version, or until JOIN_WAIT_MS, after which it goes anyway: a link that has
// still not taken the publish then has the Take in the log, and its next boot recovers it (R7).
// A link not open at all boots from the log the same way. Pure: scripts/scene-join.test.mjs.

import type { SceneJoin } from '../model/obsScenes';
import type { LiveEntry } from './livePath';

/** Longer than an output's spacing between two preparations (output/prepare.ts, 15 s). */
export const JOIN_WAIT_MS = 20_000;
const POLL_MS = 250;

/** Every open link of these scenes holds publish `n` or newer, or is preparing it (it has read the
 *  publish, so its scene's graphics are in scope). A link with no READY answer yet does not. */
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
  /** Whether the graphic is on air already: then it is left as it is. */
  onAir: (graphic: string) => boolean;
  /** The operator's Take of a cue, by id; a cue gone meanwhile is skipped by the page. */
  take: (cueId: string) => Promise<void>;
  /** False once the page has moved to another production. */
  live: () => boolean;
  now: () => number;
  wait: (ms: number) => Promise<void>;
}

/** Take each joined graphic once its scene's open links hold publish `n` (see above). */
export async function takeJoined(io: SceneJoinIo, joins: readonly SceneJoin[], n: number, limitMs = JOIN_WAIT_MS): Promise<void> {
  if (joins.length === 0) return;
  const scenes = new Set(joins.map((j) => j.scene));
  const start = io.now();
  while (io.live() && !sceneLinksHold(io.entries(), scenes, n) && io.now() - start < limitMs) await io.wait(POLL_MS);
  for (const j of joins) {
    if (!io.live()) return;
    if (io.onAir(j.graphic)) continue;
    await io.take(j.cueId);
  }
}
