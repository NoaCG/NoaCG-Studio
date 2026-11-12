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
import { isFontAsset } from '../assets/assetUtils.ts';

/** The scene a link names: absent (null, the ordinary link), or the id as written. A malformed id
 *  is still a scene link (`known` is then false): it must never read as the whole production. */
export function sceneParam(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.has('scene') ? (params.get('scene') ?? '') : null;
}

/**
 * The payload a scene link builds, whether the payload knows its scene, and the font files of the
 * graphics it leaves out (`faces`): a production holds an imported face once, with one graphic
 * (control/productionLook.ts `withLookFaceIn`), and a style may name it for any graphic, so the
 * stage must still find it when that graphic is in another scene.
 */
export function scopePayload(
  payload: OutputPayload,
  scene: string,
): { payload: OutputPayload; keys: Set<string>; known: boolean; faces: Map<string, string> } {
  const found = SCENE_ID.test(scene) ? payload.scenes?.find((s) => s.id === scene) : undefined;
  const keys = new Set(found ? found.graphics : []);
  const faces = new Map<string, string>();
  for (const g of payload.graphics) {
    if (keys.has(g.key) || g.ograf) continue;
    for (const a of g.assets) if (isFontAsset(a.path) && !faces.has(a.path)) faces.set(a.path, a.data);
  }
  return {
    faces,
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
  /** When it last came onto program, while OBS has not named a scene since (ms). */
  arriving?: number;
}

/** OBS names the scene a source arrives in right after activating it, in the same burst; a name
 *  heard later while it is on program is a cut away. */
export const OBS_ARRIVAL_MS = 1000;

/**
 * One OBS event folded in. OBS's own order (docs/OBS_ON_A_REAL_HOST.md §5): coming onto program the
 * source hears visible, active, then the new scene's name; leaving it hears the new scene's name
 * first, then visible and active false. So the name that follows an activation is the scene the
 * source went on program in, and a name heard while it was already on program is the scene it is
 * leaving for, which says nothing about it. So a name counts only within OBS_ARRIVAL_MS of the
 * activation. Activated with no name following (shown inside the scene already on program), the
 * scene OBS last named is the one.
 */
export function obsEvent(
  where: ObsWhere,
  event: { type: 'visible'; on: boolean } | { type: 'active'; on: boolean } | { type: 'scene'; name: string },
  now: number,
): ObsWhere {
  const next: ObsWhere = { ...where };
  if (event.type === 'visible') next.visible = event.on;
  else if (event.type === 'active') {
    next.active = event.on;
    if (event.on) {
      next.arriving = now;
      if (next.current !== undefined) next.last = next.current;
    } else delete next.arriving;
  } else {
    next.current = event.name.slice(0, 80);
    if (next.active && next.arriving !== undefined && now - next.arriving <= OBS_ARRIVAL_MS) next.last = next.current;
    delete next.arriving;
  }
  return next;
}

/** The Presence word for it: unknown (undefined) until OBS has said anything. */
export function obsState(where: ObsWhere): 'program' | 'preview' | 'hidden' | undefined {
  if (where.active === undefined && where.visible === undefined) return undefined;
  if (where.active) return 'program';
  return where.visible ? 'preview' : 'hidden';
}
