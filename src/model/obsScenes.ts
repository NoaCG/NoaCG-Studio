// OBS SCENES (docs/work-specs/obs-scenes/spec.md D1, OS1a R1 to R3): a rundown folder marked as an
// OBS scene is a scene, its id is the folder's, and its graphics are the ones its cues use. This is
// the one reading of that, shared by the publish (control/hostedControl.ts) and the production
// page. Pure: scripts/obs-scenes.test.mjs runs it in Node.

import type { Show } from './shows';

/** One scene as a publish carries it: the graphics are pool graphic names (the wire key). */
export interface ObsScene {
  id: string;
  name: string;
  graphics: string[];
}

/** What a scene id may look like on a link: a folder id, never anything a URL could smuggle. */
export const SCENE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The production's OBS scenes, in rundown order, while its switch is on; none while it is off.
 * A scene's graphics are the pool graphics its graphic and picture cues use, each once, in the
 * order its cues name them. A folder no cue is in is not a scene (a folder is never empty).
 */
export function obsScenesOf(show: Pick<Show, 'obsScenes' | 'folders' | 'cues' | 'graphics'>): ObsScene[] {
  if (!show.obsScenes) return [];
  const names = new Map(show.graphics.map((g) => [g.id, g.name] as const));
  const scenes = new Map<string, ObsScene>();
  const flagged = new Map((show.folders ?? []).filter((f) => f.obsScene && SCENE_ID.test(f.id)).map((f) => [f.id, f] as const));
  for (const cue of show.cues ?? []) {
    const folder = cue.folderId ? flagged.get(cue.folderId) : undefined;
    if (!folder) continue;
    let scene = scenes.get(folder.id);
    if (!scene) {
      scene = { id: folder.id, name: folder.name, graphics: [] };
      scenes.set(folder.id, scene);
    }
    const name = cue.source === 'playout' ? undefined : names.get(cue.sourceId);
    if (name !== undefined && scene.graphics.indexOf(name) < 0) scene.graphics.push(name);
  }
  return [...scenes.values()];
}

/** A scene's own output link: the production's output link with `&scene=<id>` (OS1a R5). */
export function sceneLink(outputUrl: string, sceneId: string): string {
  const url = new URL(outputUrl);
  url.searchParams.set('scene', sceneId);
  return url.toString();
}
