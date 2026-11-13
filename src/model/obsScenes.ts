// OBS SCENES (docs/work-specs/obs-scenes/spec.md D1, OS1a R1 to R3): a rundown folder marked as an
// OBS scene is a scene, its id is the folder's, and its graphics are the ones its cues use. This is
// the one reading of that, shared by the publish (control/hostedControl.ts) and the production
// page. Pure: scripts/obs-scenes.test.mjs runs it in Node.

import type { Show } from './shows';
import { membersByFolder } from './showFolders.ts';
import { freeName } from './poolIdentity.ts';
import { readShowProfile, serializeShowProfile } from './profile.ts';

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
  const scenes: ObsScene[] = [];
  const flagged = new Map((show.folders ?? []).filter((f) => f.obsScene && SCENE_ID.test(f.id)).map((f) => [f.id, f] as const));
  // In rundown order: the first cue of a folder places it (./showFolders.ts).
  for (const [id, cues] of membersByFolder(show.cues ?? [], show.folders)) {
    const folder = flagged.get(id);
    if (!folder) continue;
    const graphics: string[] = [];
    for (const cue of cues) {
      const name = cue.source === 'playout' ? undefined : names.get(cue.sourceId);
      if (name !== undefined && graphics.indexOf(name) < 0) graphics.push(name);
    }
    scenes.push({ id, name: folder.name, graphics });
  }
  return scenes;
}

/** A scene's own output link: the production's output link with `&scene=<id>` (OS1a R5). */
export function sceneLink(outputUrl: string, sceneId: string): string {
  const url = new URL(outputUrl);
  url.searchParams.set('scene', sceneId);
  return url.toString();
}

// ── One graphic, one scene (OS1b C1 to C6) ─────────────────────────────────────────────────────

type SceneRecord = Pick<Show, 'obsScenes' | 'folders' | 'cues' | 'graphics' | 'bindings' | 'profile'>;

/** A scene's graphic and picture cues, by folder id, in rundown order: what C1 calls its graphics.
 *  A server cue, or one over a graphic the pool does not hold, is not one. */
function sceneMembers(show: SceneRecord): [string, NonNullable<Show['cues']>][] {
  if (!show.obsScenes) return [];
  const pool = new Set(show.graphics.map((g) => g.id));
  const flagged = new Set((show.folders ?? []).filter((f) => f.obsScene && SCENE_ID.test(f.id)).map((f) => f.id));
  const out: [string, NonNullable<Show['cues']>][] = [];
  for (const [id, cues] of membersByFolder(show.cues ?? [], show.folders)) {
    if (!flagged.has(id)) continue;
    out.push([id, cues.filter((c) => c.source !== 'playout' && pool.has(c.sourceId))]);
  }
  return out;
}

/** Which scene holds each pool graphic (pool id to scene id) on a record: the first scene in
 *  rundown order that uses it. Read before a write, it is C2's "the scene that used it before". */
export function sceneOwners(show: SceneRecord): Map<string, string> {
  const owners = new Map<string, string>();
  for (const [scene, cues] of sceneMembers(show)) for (const c of cues) if (!owners.has(c.sourceId)) owners.set(c.sourceId, scene);
  return owners;
}

/** The pool graphic names that are some scene's graphics: what All out leaves as they are (C9). */
export function sceneGraphicNames(show: SceneRecord): Set<string> {
  return new Set(obsScenesOf(show).flatMap((s) => s.graphics));
}

/**
 * C2 to C5 on a record a write just changed, in place: each pool graphic ends used by one scene at
 * most. `before` is `sceneOwners` of the record as it was before the write. Every other scene's
 * cues of a graphic move to that scene's copy of it, made here when it has none. Answers whether
 * anything changed. Never runs with the switch off, and never touches a cue outside a scene.
 */
export function separateSceneGraphics(
  show: SceneRecord,
  before: ReadonlyMap<string, string>,
  deps: { mint: () => string; freeLayer: (graphics: Show['graphics']) => number },
): boolean {
  const members = sceneMembers(show);
  const users = new Map<string, string[]>();
  for (const [scene, cues] of members) {
    for (const c of cues) {
      const list = users.get(c.sourceId);
      if (!list) users.set(c.sourceId, [scene]);
      else if (!list.includes(scene)) list.push(scene);
    }
  }
  const owner = new Map<string, string>();
  for (const [id, scenes] of users) {
    const was = before.get(id);
    owner.set(id, was !== undefined && scenes.includes(was) ? was : scenes[0]);
  }
  if ([...users.values()].every((scenes) => scenes.length < 2)) return false;

  const names = new Map((show.folders ?? []).map((f) => [f.id, f.name] as const));
  const repoint = new Map<string, string>();
  for (const [scene, cues] of members) {
    // The copies this scene already has, by the graphic each was copied from (C3).
    const copyOf = new Map<string, string>();
    for (const c of cues) {
      const g = show.graphics.find((x) => x.id === c.sourceId);
      if (g?.sceneCopyOf && owner.get(g.id) === scene && !copyOf.has(g.sceneCopyOf)) copyOf.set(g.sceneCopyOf, g.id);
    }
    for (const c of cues) {
      if (owner.get(c.sourceId) === scene) continue;
      let copy = copyOf.get(c.sourceId);
      if (!copy) {
        copy = addSceneCopy(show, c.sourceId, names.get(scene) ?? scene, deps);
        copyOf.set(c.sourceId, copy);
      }
      repoint.set(c.id, copy);
    }
  }
  show.cues = (show.cues ?? []).map((c) => (repoint.has(c.id) ? { ...c, sourceId: repoint.get(c.id)! } : c));
  return true;
}

/** C4: a scene's own copy of a pool graphic, placed after it in the pool. Answers its id. */
function addSceneCopy(
  show: SceneRecord,
  sourceId: string,
  sceneName: string,
  deps: { mint: () => string; freeLayer: (graphics: Show['graphics']) => number },
): string {
  const at = show.graphics.findIndex((g) => g.id === sourceId);
  const source = show.graphics[at];
  const name = freeName(show.graphics.map((g) => g.name), `${source.name} · ${sceneName}`);
  const copy = structuredClone(source);
  copy.id = deps.mint();
  copy.name = name;
  copy.template = { ...copy.template, name };
  copy.layer = deps.freeLayer(show.graphics);
  copy.sceneCopyOf = source.id;
  show.graphics = [...show.graphics.slice(0, at + 1), copy, ...show.graphics.slice(at + 1)];
  const bound = show.bindings?.[source.name];
  if (bound) show.bindings = { ...show.bindings, [name]: { ...bound } };
  const profile = readShowProfile(show.profile);
  const arranged = profile.status === 'ok' ? profile.profile.arrange[source.name] : undefined;
  if (profile.status === 'ok' && arranged) {
    show.profile = serializeShowProfile({ ...profile.profile, arrange: { ...profile.profile.arrange, [name]: structuredClone(arranged) } });
  }
  return copy.id;
}
