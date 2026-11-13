// THE OBS SCENE ROWS (docs/work-specs/obs-scenes/spec.md OS3, rules M2 to M6): one row per scene of
// the production, read from the Presence entries of its scene links (livePath.ts `SceneReport`) and
// from what this page has heard of them since it opened. Pure: scripts/obs-scene-rows.test.mjs runs
// it in Node against an oracle written from the Rules.

import { SCENE_SEEN_MAX, sceneLinkName, type LiveEntry, type LivePresenceStatus } from './livePath';
import { NOT_ANSWERING_MS, ageWords, oneEntryPerOutput, presentLine, type ExpectedOutput, type HeldVersion, type ReadyTone } from './readiness';

/** A scene as the rows need it (model/obsScenes.ts `ObsScene`). */
export interface RowScene {
  id: string;
  name: string;
  graphics: string[];
}

/** What this page has heard of scene links since it opened (M3, M5, M6). Nothing persists it. */
export interface SceneWatch {
  /** Per scene id: when a link of it was last present (this page's clock), and the OBS scenes its
   *  links reported being on program in. Maps, not objects: the ids come off the wire, and an id
   *  such as `constructor` or `__proto__` must never read or write an object's own machinery. */
  scenes: ReadonlyMap<string, { at: number; seen: string[] }>;
  /** Every scene link instance heard, by instance id: its scene id. */
  links: ReadonlyMap<string, string>;
  /** The scene ids with a link present at the last update. */
  present: string[];
}

export const EMPTY_WATCH: SceneWatch = { scenes: new Map(), links: new Map(), present: [] };

/** The first OBS scene names seen, as the link keeps them. */
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].slice(0, SCENE_SEEN_MAX);

/**
 * The watch after a Presence update. A scene that was present at the last update and is not now was
 * last seen now, when it left (as readiness.ts `rememberOutputs` dates a gone output); while present
 * its time is not read (`sceneRows`). Nothing changed, the same watch comes back, so the page does
 * not render again for it.
 */
export function watchScenes(watch: SceneWatch, peers: readonly LiveEntry[], now: number): SceneWatch {
  const scenes = new Map(watch.scenes);
  const links = new Map(watch.links);
  const here = new Set<string>();
  let changed = false;
  for (const p of oneEntryPerOutput(peers)) {
    if (!p.scene) continue;
    const id = p.scene.id;
    here.add(id);
    if (links.get(p.id) !== id) {
      links.set(p.id, id);
      changed = true;
    }
    const held = scenes.get(id);
    const seen = union(held?.seen ?? [], p.scene.seen ?? []);
    if (!held || seen.length !== held.seen.length) {
      scenes.set(id, { at: held?.at ?? now, seen });
      changed = true;
    }
  }
  for (const id of watch.present) {
    const held = scenes.get(id);
    if (here.has(id) || !held) continue;
    scenes.set(id, { ...held, at: now });
    changed = true;
  }
  if (!changed && here.size === watch.present.length) return watch;
  return { scenes, links, present: [...here] };
}

/** The watch without a scene's links (the row's Dismiss): a link the operator took out of OBS on
 *  purpose stops reading "Not answering". */
export function forgetScene(watch: SceneWatch, sceneId: string): SceneWatch {
  const scenes = new Map(watch.scenes);
  scenes.delete(sceneId);
  const links = new Map([...watch.links].filter(([, scene]) => scene !== sceneId));
  return { scenes, links, present: watch.present.filter((id) => id !== sceneId) };
}

export type ObsPosition = 'program' | 'preview' | 'hidden' | 'unknown';

/** One scene, as the panel draws it. */
export interface SceneRow {
  id: string;
  name: string;
  tone: ReadyTone;
  /** The load state, in the panel's words (M3). */
  state: string;
  /** Where OBS has its source (M4); null while nothing is loaded or nothing can be known. */
  obs: ObsPosition | null;
  /** The OBS scenes it has been on program in (M5): empty reads "Not yet seen". */
  seen: string[];
  /** Instances of its link present now. */
  loaded: number;
  /** Remembered outputs that are this scene's links and have gone away: Dismiss forgets them. */
  gone: string[];
  /** Its link was loaded and is gone: the row offers Dismiss. */
  lost?: true;
  /** The longer account, for the tooltip. */
  detail: string[];
}

const RANK: Record<ObsPosition, number> = { program: 3, preview: 2, hidden: 1, unknown: 0 };

export function obsWords(obs: ObsPosition): string {
  return obs === 'program' ? 'Program' : obs === 'preview' ? 'Preview' : obs === 'hidden' ? 'Hidden' : 'OBS: unknown';
}

/**
 * The rows, in the scenes' order, and the output ids they speak for (`claimed`, M6): every scene link
 * present whose scene has a row, and every remembered output that has gone away and is placed on a
 * row, by the instance this page heard or by the scene's name. Those leave the generic Outputs list.
 */
export function sceneRows(input: {
  scenes: readonly RowScene[];
  peers: readonly LiveEntry[];
  presence: LivePresenceStatus;
  watch: SceneWatch;
  expected: readonly ExpectedOutput[];
  published: HeldVersion | null;
  now: number;
}): { rows: SceneRow[]; claimed: Set<string> } {
  const { scenes, watch, now } = input;
  const joined = input.presence === 'joined';
  const present = joined ? oneEntryPerOutput(input.peers) : [];
  const presentIds = new Set(present.map((p) => p.id));
  const claimed = new Set<string>();
  const rows = scenes.map((scene): SceneRow => {
    const here = present.filter((p) => p.scene?.id === scene.id);
    for (const p of here) claimed.add(p.id);
    const seen = union(watch.scenes.get(scene.id)?.seen ?? [], here.flatMap((p) => p.scene?.seen ?? []));
    const base = { id: scene.id, name: scene.name, seen, loaded: here.length, gone: [] as string[] };
    // Unpublished (or no backend): no link can be loaded, so there is nothing to not know.
    if (input.presence === 'off') return { ...base, tone: 'idle', state: 'Not loaded', obs: null, detail: ['Publish the production to get the scene links.'] };
    if (!joined) {
      return { ...base, tone: 'idle', state: 'Not known', obs: null, detail: ['This page is not connected to the live channel, so it cannot see the scene links.'] };
    }
    if (here.length === 0) {
      // A link that went away (stale presence): the instance this page heard, or a remembered output
      // called by the scene's name, each with the moment it left.
      const named = sceneLinkName(scene.name);
      const gone = input.expected.filter((e) => !presentIds.has(e.id) && (watch.links.get(e.id) === scene.id || e.name === named));
      for (const e of gone) claimed.add(e.id);
      const heard = watch.scenes.get(scene.id);
      // Present at the watch's last update and not now: it is leaving on this very render, before
      // the watch has dated it.
      const leftAt = watch.present.includes(scene.id) ? now : Math.max(heard?.at ?? -1, ...gone.map((e) => (e.seen > 0 ? e.seen : 0)));
      if (heard || gone.length > 0) {
        const age = leftAt > 0 ? now - leftAt : NOT_ANSWERING_MS;
        const late = age >= NOT_ANSWERING_MS;
        return {
          ...base,
          gone: gone.map((e) => e.id),
          lost: true,
          tone: late ? 'bad' : 'idle',
          state: `Not answering${leftAt > 0 ? ` (${ageWords(age)})` : ''}`,
          obs: null,
          detail: [
            late
              ? 'Its browser source was loaded and is gone. Check that OBS is running and the source is there, then refresh it.'
              : 'It has just left; a refreshed source is back in a few seconds.',
          ],
        };
      }
      return { ...base, tone: 'idle', state: 'Not loaded', obs: null, detail: ['No browser source has this scene’s link open.'] };
    }
    const obs = here
      .map((p): ObsPosition => p.scene?.obs ?? 'unknown')
      .reduce((best, o) => (RANK[o] > RANK[best] ? o : best), 'unknown' as ObsPosition);
    if (here.length > 1) {
      return {
        ...base,
        tone: 'warn',
        state: here.length === 2 ? 'Loaded twice' : `Loaded ${here.length} times`,
        obs,
        detail: ['Several browser sources load this link. Keep one, and add it to other OBS scenes with Add Existing. Just after OBS restarts, an old entry can show here for a short while.'],
      };
    }
    const link = here[0];
    if (!link.scene?.known) {
      return { ...base, tone: 'warn', state: 'Publish to load', obs, detail: ['The link loaded before this scene was published. Publish, and it builds the scene’s graphics.'] };
    }
    const line = presentLine(link, scene.name, input.published);
    return { ...base, tone: line.tone, state: line.state === 'Ready for playout' ? 'Ready, connected' : line.state, obs, detail: line.detail };
  });
  return { rows, claimed };
}

/** How many OBS scenes go empty if the switch goes off (M8): the distinct scene ids among the scene
 *  links present now, whether or not the record still has a row for them (a folder unflagged since
 *  the last publish still airs there). Null when this page cannot know. */
export function loadedScenes(peers: readonly LiveEntry[], presence: LivePresenceStatus): number | null {
  if (presence === 'off') return 0;
  if (presence !== 'joined') return null;
  return new Set(oneEntryPerOutput(peers).flatMap((p) => (p.scene ? [p.scene.id] : []))).size;
}
