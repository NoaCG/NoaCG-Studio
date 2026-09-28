// HOW A SERVER CLIP PLAYS, as its cue says (docs/CLIP_PLAYBACK_PLAN.md §6.5, §6.6, §6.9 and §7):
// the cue's settings read back as what the operator chose, turned into what goes to NoaCG Bridge,
// and checked against what the running Bridge and its server can do.
//
// PLAIN FUNCTIONS OVER PLAIN DATA that import nothing but types, so scripts/server-playout.test.mjs
// runs every rule here in Node without a browser (plan §10). Keep it that way: the store, the link
// and React stay out of this file.

import type { MediaPlayback, TargetCapability } from '../control/playoutProtocol';
import type { ClipFade, CuePlayback, PlayoutItem, PlayoutMediaKind, ShowCue } from './shows';

/** What a clip does at its end, as the operator chooses it. */
export type ClipEnd = NonNullable<CuePlayback['end']>;

/** Short is half a second and Long one second; the Bridge converts them to the channel's frames.
 *  They are not settings (plan §6.5). */
export const FADE_SECONDS: Record<ClipFade, number> = { short: 0.5, long: 1 };

/** The Level slider's range, in dB (plan §6.5). */
export const MIN_LEVEL_DB = -60;
export const MAX_LEVEL_DB = 6;

/** The shortest clip that may follow another in a sequence: the Bridge queues each next file
 *  while the one before it plays, reading four times a second (cli/src/playout/runner.ts). */
export const MIN_SEQUENCE_MEMBER_S = 2;

/** The server's list word (`MOVIE`, `STILL`, `AUDIO`) as the record keeps it, or nothing. */
export function mediaKindOf(word: string | undefined): { mediaKind?: PlayoutMediaKind } {
  const w = word?.toLowerCase();
  return w === 'movie' || w === 'still' || w === 'audio' ? { mediaKind: w } : {};
}

/**
 * THE LOOP RULE (plan §7): the cue's own ending when it has one, else `loop` when the legacy
 * `PlayoutItem.loop` says so, else hold. A still never ends (§4), so an ending that waits for its end
 * - Clear, Play next - is Hold on a still.
 */
export function effectiveEnd(cue: Pick<ShowCue, 'playback'>, item: Pick<PlayoutItem, 'loop' | 'mediaKind'>): ClipEnd {
  const end = cue.playback?.end ?? (item.loop ? 'loop' : 'hold');
  if (item.mediaKind === 'still' && (end === 'clear' || end === 'next')) return 'hold';
  return end;
}

/** A level in dB as the linear gain the clip's audio filter takes: 10^(dB/20). */
export function levelGain(db: number): number {
  return 10 ** (db / 20);
}

/** The file's whole length in seconds from the server's list, when it gave one. */
export function fileSeconds(item: Pick<PlayoutItem, 'frames' | 'fps'>): number | undefined {
  if (!item.frames || !item.fps || item.frames <= 0 || item.fps <= 0) return undefined;
  return item.frames / item.fps;
}

/** How long the cue plays its file: the trim when it has one, within the file's length. */
export function segmentSeconds(cue: Pick<ShowCue, 'playback'>, item: Pick<PlayoutItem, 'frames' | 'fps'>): number | undefined {
  const whole = fileSeconds(item);
  const start = cue.playback?.trimIn ?? 0;
  const end = cue.playback?.trimOut ?? whole;
  if (end === undefined) return undefined;
  return Math.max(0, Math.min(end, whole ?? end) - start);
}

/** Why a trim cannot be kept, or null: the start comes before the end, and both lie in the file
 *  when its length is known (plan §6.5, §18 case 6). */
export function trimProblem(trim: { trimIn?: number; trimOut?: number }, item: Pick<PlayoutItem, 'frames' | 'fps'>): string | null {
  const whole = fileSeconds(item);
  const { trimIn, trimOut } = trim;
  if (trimIn !== undefined && (!Number.isFinite(trimIn) || trimIn < 0)) return 'The start is a time from 0:00.';
  if (trimOut !== undefined && (!Number.isFinite(trimOut) || trimOut <= 0)) return 'The end is a time after 0:00.';
  if (trimIn !== undefined && trimOut !== undefined && trimOut <= trimIn) return 'The end comes after the start.';
  if (whole !== undefined && trimIn !== undefined && trimIn >= whole) return `The start lies past the end of the ${clockOf(whole)} file.`;
  if (whole !== undefined && trimOut !== undefined && trimOut > whole + 0.001) return `The end lies past the end of the ${clockOf(whole)} file.`;
  return null;
}

/** `1:05.5` - seconds as a trim reads them, tenths only when there are any. */
export function clockOf(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const whole = Math.floor(tenths / 10);
  const m = Math.floor(whole / 60);
  const s = String(whole % 60).padStart(2, '0');
  return `${m}:${s}${tenths % 10 ? `.${tenths % 10}` : ''}`;
}

/** A time the operator typed (`1:05.5`, `65.5`, `0:03`) in seconds, or null when it is not one. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const seconds = (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
  return Number.isFinite(seconds) ? seconds : null;
}

/** The fade a cue's Out uses: its fade out, in seconds, or none (a cut). */
export function outFade(cue: Pick<ShowCue, 'playback'> | null | undefined): number | undefined {
  const f = cue?.playback?.fadeOut;
  return f ? FADE_SECONDS[f] : undefined;
}

/**
 * What a Take of this cue carries (plan §9). A cue with no setting of its own - every cue saved
 * before this build - sends exactly the action it always sent: the legacy `loop`, nothing else. So
 * does a cue whose only setting is a loop, which every Bridge understands. Only what a newer Bridge
 * must honour goes in `playback`: Clear at the end with its fade, a fade in, a level other than
 * 0 dB, and a trim. A fade out on a clip that holds is Out's, not the Take's.
 */
export function takePlayback(cue: Pick<ShowCue, 'playback'>, item: Pick<PlayoutItem, 'loop' | 'mediaKind'>): { loop: boolean; playback?: MediaPlayback } {
  const p = cue.playback;
  const end = effectiveEnd(cue, item);
  const out: MediaPlayback = {};
  if (end === 'clear') {
    out.end = 'clear';
    if (p?.fadeOut) out.fadeOut = FADE_SECONDS[p.fadeOut];
  }
  if (p?.fadeIn) out.fadeIn = FADE_SECONDS[p.fadeIn];
  if (p?.levelDb) out.gain = levelGain(p.levelDb);
  if (p?.trimIn !== undefined || p?.trimOut !== undefined) {
    out.trim = { ...(p.trimIn !== undefined ? { in: p.trimIn } : {}), ...(p.trimOut !== undefined ? { out: p.trimOut } : {}) };
  }
  return { loop: end === 'loop', ...(Object.keys(out).length ? { playback: out } : {}) };
}

/** One thing a cue asks of the Bridge and its server, and how the operator can do without it. */
export interface PlaybackNeed {
  feature: 'playback' | 'sequence';
  capability: TargetCapability;
  /** "clears at its end", as the sentence "This cue … " goes on. */
  what: string;
  /** "set it to Hold", as "…, or …" goes on. */
  undo: string;
}

/** What this cue needs beyond a plain Take (plan §6.9). None for a legacy cue or a Loop. */
export function playbackNeeds(cue: Pick<ShowCue, 'playback'>, item: Pick<PlayoutItem, 'loop' | 'mediaKind'>): PlaybackNeed[] {
  const p = cue.playback;
  const end = effectiveEnd(cue, item);
  const needs: PlaybackNeed[] = [];
  if (end === 'clear') needs.push({ feature: 'playback', capability: 'end', what: 'clears at its end', undo: 'set it to Hold' });
  if (end === 'next') needs.push({ feature: 'sequence', capability: 'sequence', what: 'plays the next clip', undo: 'set it to Hold' });
  if (p?.fadeIn || p?.fadeOut) needs.push({ feature: 'playback', capability: 'fade', what: 'fades', undo: 'set its fades to Cut' });
  if (p?.levelDb) needs.push({ feature: 'playback', capability: 'level', what: `plays at ${p.levelDb > 0 ? '+' : ''}${p.levelDb} dB`, undo: 'reset its level' });
  if (p?.trimIn !== undefined || p?.trimOut !== undefined) needs.push({ feature: 'playback', capability: 'trim', what: 'is trimmed', undo: 'clear its start and end' });
  return needs;
}

/** What the Bridge and its server said they can do: `/health` features, `/status` capabilities. */
export interface PlaybackAbility {
  state: string;
  features?: readonly string[];
  capabilities?: readonly string[];
  version?: string;
}

const listed = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * Why a cue with these needs cannot be taken with this Bridge and server, or null when it can
 * (plan §6.9): a cue that carries a setting the Bridge or its server cannot honour is never taken
 * the old way in silence. `ability` is null while the Bridge has not answered yet; a Bridge that is
 * not reachable at all is the server cue's own sentence, not this one.
 */
export function playbackBlocker(needs: readonly PlaybackNeed[], ability: PlaybackAbility | null): string | null {
  if (!needs.length) return null;
  if (!ability) return 'Asking NoaCG Bridge what it can play…';
  if (ability.state !== 'ok') return null;
  const noFeature = needs.filter((n) => !ability.features?.includes(n.feature));
  if (noFeature.length) {
    return `This cue ${listed(noFeature.map((n) => n.what))}. Update NoaCG Bridge to take it, or ${listed([...new Set(noFeature.map((n) => n.undo))])}.`;
  }
  const noCapability = needs.filter((n) => !ability.capabilities?.includes(n.capability));
  if (noCapability.length) {
    const server = ability.version ? `CasparCG ${ability.version.split(' ')[0]}` : 'This playout server';
    return `This cue ${listed(noCapability.map((n) => n.what))}, which ${server} cannot do. To take it, ${listed([...new Set(noCapability.map((n) => n.undo))])}.`;
  }
  return null;
}

/**
 * Why a control that adds this need is off, or null when the Bridge and its server can both honour
 * it (plan §6.9: the page offers a control only when both say yes). Going back to a default is never
 * off: that is how a cue with a setting nobody here can play is made takeable again.
 */
export function offerBlocked(ability: PlaybackAbility | null, feature: PlaybackNeed['feature'], capability: TargetCapability): string | null {
  if (!ability) return 'Asking NoaCG Bridge what it can play…';
  if (ability.state !== 'ok') return 'Connect NoaCG Bridge and the playout server to set this.';
  if (!ability.features?.includes(feature)) return 'Update NoaCG Bridge to set this.';
  if (!ability.capabilities?.includes(capability)) {
    return `${ability.version ? `CasparCG ${ability.version.split(' ')[0]}` : 'This playout server'} cannot do this.`;
  }
  return null;
}
