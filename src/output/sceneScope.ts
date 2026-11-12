// A SCENE LINK'S SCOPE (docs/work-specs/obs-scenes/spec.md OS1a R4, R5): `/output?production=<slug>
// &scene=<id>` builds only the graphics the payload's scene `<id>` names. Everything else about the
// payload stays: the stage resolution (so a publish never asks a scene link to reload for another
// one), the version stamp (one production, one version), the cues of its graphics. An id the payload
// does not know builds nothing; it never falls back to the whole production.
//
// Pure and DOM-free: scripts/obs-scenes.test.mjs runs it in Node, and the output loads it in
// CasparCG 2.3's Chromium 71.

import type { OutputPayload } from '../control/hostedControl';
import { SCENE_ID } from '../model/obsScenes.ts';

/** The scene a link names: absent (null, the ordinary link), or the id as written. A malformed id
 *  is still a scene link (`known` is then false): it must never read as the whole production. */
export function sceneParam(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.has('scene') ? (params.get('scene') ?? '') : null;
}

/** The payload a scene link builds, and whether the payload knows its scene. */
export function scopePayload(payload: OutputPayload, scene: string): { payload: OutputPayload; keys: Set<string>; known: boolean } {
  const found = SCENE_ID.test(scene) ? payload.scenes?.find((s) => s.id === scene) : undefined;
  const keys = new Set(found ? found.graphics : []);
  return {
    payload: {
      ...payload,
      graphics: payload.graphics.filter((g) => keys.has(g.key)),
      cues: payload.cues.filter((c) => keys.has(c.graphic)),
    },
    keys,
    known: !!found,
  };
}

/** Where OBS has the browser source, from its own events (docs/OBS_ON_A_REAL_HOST.md §3, §5):
 *  `obsSourceActiveChanged` says program, `obsSourceVisibleChanged` preview or program,
 *  `obsSceneChanged` names the program scene. Nothing is known before the first event. */
export interface ObsWhere {
  visible?: boolean;
  active?: boolean;
  /** The program scene OBS last named. */
  current?: string;
  /** The program scene this source was last on program in. */
  last?: string;
}

/** One OBS event folded in. A source on program while OBS names a scene was on program in it. */
export function obsEvent(where: ObsWhere, event: { type: 'visible'; on: boolean } | { type: 'active'; on: boolean } | { type: 'scene'; name: string }): ObsWhere {
  const next: ObsWhere = { ...where };
  if (event.type === 'visible') next.visible = event.on;
  else if (event.type === 'active') next.active = event.on;
  else next.current = event.name.slice(0, 80);
  if (next.active && next.current !== undefined) next.last = next.current;
  return next;
}

/** The Presence word for it: unknown (undefined) until OBS has said anything. */
export function obsState(where: ObsWhere): 'program' | 'preview' | 'hidden' | undefined {
  if (where.active === undefined && where.visible === undefined) return undefined;
  if (where.active) return 'program';
  return where.visible ? 'preview' : 'hidden';
}
