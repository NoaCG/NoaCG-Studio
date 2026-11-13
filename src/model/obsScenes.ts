// OBS SCENES (docs/work-specs/obs-scenes/spec.md D1, OS1a R1 to R3): a rundown folder marked as an
// OBS scene is a scene, its id is the folder's, and its graphics are the ones its cues use. This is
// the one reading of that, shared by the publish (control/hostedControl.ts) and the production
// page. Pure: scripts/obs-scenes.test.mjs runs it in Node.

import type { Show } from './shows';
import { membersByFolder } from './showFolders.ts';
import { freeName, isOwnPictureGraphic } from './poolIdentity.ts';
import { readShowProfile, withGraphicArrange } from './profile.ts';
import { deterministicUuid } from './id.ts';
import { typedReadOnly } from './ografTyped.ts';

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
  const names = new Map(show.graphics.map((g) => [g.id, g.name] as const));
  const folders = new Map((show.folders ?? []).map((f) => [f.id, f.name] as const));
  return sceneMembers(show).map(([id, cues]) => ({ id, name: folders.get(id) ?? '', graphics: [...new Set(cues.map((c) => names.get(c.sourceId)!))] }));
}

/** A scene's own output link: the production's output link with `&scene=<id>` (OS1a R5). */
export function sceneLink(outputUrl: string, sceneId: string): string {
  const url = new URL(outputUrl);
  url.searchParams.set('scene', sceneId);
  return url.toString();
}

// ── One graphic, one scene (OS1b C1 to C6) ─────────────────────────────────────────────────────

type SceneRecord = Pick<Show, 'obsScenes' | 'folders' | 'cues' | 'graphics' | 'bindings' | 'profile'>;

/** C1, the one reading of it: each scene's graphic and picture cues, by folder id, in rundown
 *  order (the first cue of a folder places it). A server cue, or one over a graphic the pool does
 *  not hold, is not one. None while the switch is off. */
function sceneMembers(show: Pick<Show, 'obsScenes' | 'folders' | 'cues' | 'graphics'>): [string, NonNullable<Show['cues']>][] {
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

/** What a write's separation reads of the record as it was before the write: which scene held
 *  each pool graphic (the first in rundown order that used it, C2's "the scene that used it
 *  before"), and each scene cue's scene and graphic, so a cue the write did not touch is known. */
export interface SceneSnapshot {
  owners: ReadonlyMap<string, string>;
  cues: ReadonlyMap<string, string>;
}

export function sceneSnapshot(show: SceneRecord): SceneSnapshot {
  const owners = new Map<string, string>();
  const cues = new Map<string, string>();
  for (const [scene, members] of sceneMembers(show)) {
    for (const c of members) {
      if (!owners.has(c.sourceId)) owners.set(c.sourceId, scene);
      cues.set(c.id, `${scene}|${c.sourceId}`);
    }
  }
  return { owners, cues };
}

/** The folders that are OBS scenes while the switch is on: All out leaves their runs and steps. */
export function sceneFolderIds(show: SceneRecord): Set<string> {
  return new Set(obsScenesOf(show).map((s) => s.id));
}

/** The pool graphic names that are some scene's graphics: what All out leaves as they are (C9). */
export function sceneGraphicNames(show: SceneRecord): Set<string> {
  return new Set(obsScenesOf(show).flatMap((s) => s.graphics));
}

/** What a write may not do to a cue (C10, C11): a sentence when the cue must not move to a copy. */
export type SceneCopyGuard = (cue: NonNullable<Show['cues']>[number]) => string | null;

/** C10, C11: why a cue may not move to an OBS scene's copy, in the operator's words. `onAir` says
 *  whether a page has it on air. A live candidate's selection names a recipe made for its graphic,
 *  so the copy could not take it; typed data a newer version wrote cannot be rewritten here. */
export function sceneCopyRefusal(cue: NonNullable<Show['cues']>[number], onAir: boolean): string | null {
  if (onAir) return `Take "${cue.label}" off air before you put its graphic in a second OBS scene.`;
  if (cue.selection !== undefined) return `"${cue.label}" shows a live candidate chosen for its graphic, so it cannot be put in a second OBS scene.`;
  if (cue.typed !== undefined && typedReadOnly(cue)) return `"${cue.label}" was saved by a newer version, so its graphic cannot be put in a second OBS scene here.`;
  return null;
}

/** C3: the pool id of a scene's `n`th copy of a graphic, the same on every pass and every device
 *  that makes it, so the rebased pass and a team merge meet one copy. */
export function sceneCopyId(sourceId: string, sceneId: string, n: number): string {
  return deterministicUuid(`obs-scene-copy|${sourceId}|${sceneId}|${n}`);
}

/**
 * C2 to C5 and C10, C11 on a record a write just changed, in place: each pool graphic ends used by
 * one scene at most, except the production's own picture graphic, which is never copied. `before`
 * is `sceneSnapshot` of the record before the write. Every other scene's cues of a graphic move to
 * that scene's copy of it, made here when it has none. Answers whether anything changed, or the
 * guard's sentence for a cue that may not move, and then changes nothing. Never runs with the
 * switch off, and never touches a cue outside a scene.
 */
export function separateSceneGraphics(
  show: SceneRecord,
  before: SceneSnapshot,
  deps: { freeLayer: (graphics: Show['graphics']) => number; guard?: SceneCopyGuard; leaveHeld?: boolean },
): boolean | string {
  const members = sceneMembers(show);
  const own = new Set(show.graphics.filter((g) => isOwnPictureGraphic(g)).map((g) => g.id));
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
    const was = before.owners.get(id);
    owner.set(id, was !== undefined && scenes.includes(was) ? was : scenes[0]);
  }
  const candidates = members.flatMap(([scene, cues]) => cues.filter((c) => owner.get(c.sourceId) !== scene && !own.has(c.sourceId)).map((c) => [scene, c] as const));
  // A cue the guard holds (C10, C11) refuses the write when the write put it where it is; one the
  // write did not touch (a record that came shared, from a sync or an older build) stays as it is,
  // and so does every held cue of a merge (`leaveHeld`), which nobody is there to refuse.
  const moving: (typeof candidates)[number][] = [];
  for (const [scene, c] of candidates) {
    const refused = deps.guard?.(c);
    if (!refused) moving.push([scene, c]);
    else if (!deps.leaveHeld && before.cues.get(c.id) !== `${scene}|${c.sourceId}`) return refused;
  }
  if (moving.length === 0) return false;
  const used = new Set((show.cues ?? []).map((c) => c.sourceId));

  const names = new Map((show.folders ?? []).map((f) => [f.id, f.name] as const));
  // The scene's copy: the first of its stable ids that is free, or held by a copy of this graphic
  // that this scene uses or no cue at all does (one left behind under C6 is taken up again; one a
  // cue outside the scenes uses stays that cue's, C5).
  const copyFor = (sourceId: string, scene: string): string => {
    for (let n = 0; ; n += 1) {
      const id = sceneCopyId(sourceId, scene, n);
      const held = show.graphics.find((g) => g.id === id);
      if (!held) {
        addSceneCopy(show, sourceId, id, names.get(scene) ?? scene, deps);
        return id;
      }
      if (held.sceneCopyOf === sourceId && (owner.get(id) === scene || !used.has(id))) return id;
    }
  };
  const repoint = new Map<string, string>();
  const chosen = new Map<string, string>();
  for (const [scene, c] of moving) {
    const key = `${c.sourceId}|${scene}`;
    const copy = chosen.get(key) ?? copyFor(c.sourceId, scene);
    chosen.set(key, copy);
    repoint.set(c.id, copy);
  }
  show.cues = (show.cues ?? []).map((c) => (repoint.has(c.id) ? { ...c, sourceId: repoint.get(c.id)! } : c));
  return true;
}

/** C4: a scene's own copy of a pool graphic, placed after it in the pool. */
function addSceneCopy(
  show: SceneRecord,
  sourceId: string,
  id: string,
  sceneName: string,
  deps: { freeLayer: (graphics: Show['graphics']) => number },
): void {
  const at = show.graphics.findIndex((g) => g.id === sourceId);
  const source = show.graphics[at];
  const name = freeName(show.graphics.map((g) => g.name), `${source.name} · ${sceneName}`);
  const copy = structuredClone(source);
  copy.id = id;
  copy.name = name;
  copy.template = { ...copy.template, name };
  copy.layer = deps.freeLayer(show.graphics);
  copy.sceneCopyOf = source.id;
  show.graphics = [...show.graphics.slice(0, at + 1), copy, ...show.graphics.slice(at + 1)];
  const bound = show.bindings && Object.prototype.hasOwnProperty.call(show.bindings, source.name) ? show.bindings[source.name] : undefined;
  if (bound) show.bindings = Object.fromEntries([...Object.entries(show.bindings!), [name, { ...bound }]]);
  // Only a profile this build reads: one a newer build wrote stays byte for byte.
  const profile = readShowProfile(show.profile);
  const arranged = profile.status === 'ok' && Object.prototype.hasOwnProperty.call(profile.profile.arrange, source.name) ? profile.profile.arrange[source.name] : undefined;
  if (arranged) show.profile = withGraphicArrange(profile.status === 'ok' ? profile.profile : undefined, name, arranged);
}
