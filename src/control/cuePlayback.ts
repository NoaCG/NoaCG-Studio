// HOW A SERVER CLIP PLAYS, as its cue says (docs/CLIP_PLAYBACK_PLAN.md §6.5, §6.6, §6.9 and §7):
// the cue's settings read back as what the operator chose, turned into what goes to NoaCG Bridge,
// and checked against what the running Bridge and its server can do.
//
// PLAIN FUNCTIONS OVER PLAIN DATA that import nothing but types and the protocol's own pure rules,
// so scripts/server-playout.test.mjs runs every rule here in Node without a browser (plan §10). Keep
// it that way: the store, the link and React stay out of this file. The `.ts` on the one runtime
// import is what lets Node resolve it.

import { MIN_SEQUENCE_MEMBER_S, playedSeconds, type BridgeFeature, type MediaPlayback, type TargetCapability } from './playoutProtocol.ts';
import type { ClipFade, CuePlayback, PlayoutItem, PlayoutMediaKind, ShowCue } from '../model/shows';

/** What a clip does at its end, as the operator chooses it. */
export type ClipEnd = NonNullable<CuePlayback['end']>;

/** Short is half a second and Long one second; the Bridge converts them to the channel's frames.
 *  They are not settings (plan §6.5). */
export const FADE_SECONDS: Record<ClipFade, number> = { short: 0.5, long: 1 };

/** The Level slider's range, in dB (plan §6.5). */
export const MIN_LEVEL_DB = -60;
export const MAX_LEVEL_DB = 6;

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
function levelGain(db: number): number {
  return 10 ** (db / 20);
}

/** `−12 dB`, `+3 dB`, `0 dB`: a level as the slider and every sentence about it read it. */
export function dbText(db: number): string {
  return `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db)} dB`;
}

/** The file's whole length in seconds from the server's list, when it gave one. */
export function fileSeconds(item: Pick<PlayoutItem, 'frames' | 'fps'>): number | undefined {
  if (!item.frames || !item.fps || item.frames <= 0 || item.fps <= 0) return undefined;
  return item.frames / item.fps;
}

/** How long the cue plays its file: the trim when it has one, within the file's length (the
 *  protocol's `playedSeconds`, the rule the Bridge counts with too). */
export function segmentSeconds(cue: Pick<ShowCue, 'playback'>, item: Pick<PlayoutItem, 'frames' | 'fps'>): number | undefined {
  return playedSeconds(fileSeconds(item), cue.playback?.trimIn, cue.playback?.trimOut);
}

/** Why a cue's clip cannot play in a sequence (docs/CLIP_PLAYBACK_PLAN.md §6.10): a still, a kind
 *  or a file length the server's list has not given, or - after the first - too short to queue the
 *  next in time. The Bridge refuses an entry by the same rule (cli/src/playout/server.ts `readEntry`). */
export type MemberProblem = 'still' | 'kind' | 'length' | 'short';

export function memberProblem(
  cue: Pick<ShowCue, 'playback'>,
  item: Pick<PlayoutItem, 'mediaKind' | 'frames' | 'fps'>,
  first: boolean,
): MemberProblem | null {
  if (item.mediaKind === 'still') return 'still';
  if (!item.mediaKind) return 'kind';
  const whole = fileSeconds(item);
  const length = whole === undefined ? undefined : playedSeconds(whole, cue.playback?.trimIn, cue.playback?.trimOut);
  if (!length) return 'length';
  if (!first && length < MIN_SEQUENCE_MEMBER_S) return 'short';
  return null;
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

/** One thing a cue - or a folder - asks of the Bridge and its server, and how the operator can do
 *  without it. */
export interface PlaybackNeed {
  feature: Exclude<BridgeFeature, 'state'>;
  capability: TargetCapability;
  /** "clears at its end", as the sentence "This cue … " goes on. */
  what: string;
  /** "set it to Hold", as "…, or …" goes on. */
  undo: string;
}

/** What each setting asks of the Bridge and its server: the one table both the editor's controls
 *  (`offerBlocked`) and the Take's check (`playbackNeeds`) read, so they can never disagree. */
export const NEEDS = {
  imageFit: { feature: 'image-fit', capability: 'image-fit', what: 'fits its picture with black bars', undo: 'choose Stretch' },
  clear: { feature: 'playback', capability: 'end', what: 'clears at its end', undo: 'set it to Hold' },
  next: { feature: 'sequence', capability: 'sequence', what: 'plays the next clip', undo: 'set it to Hold' },
  fade: { feature: 'playback', capability: 'fade', what: 'fades', undo: 'set its fades to Cut' },
  level: { feature: 'playback', capability: 'level', what: 'plays at a level of its own', undo: 'reset its level' },
  trim: { feature: 'playback', capability: 'trim', what: 'is trimmed', undo: 'clear its start and end' },
  // A Play-through folder's own (plan §6.6): its clips one after another, and Loop the folder.
  through: { feature: 'sequence', capability: 'sequence', what: 'plays its clips one after another', undo: 'set How it plays to One by one' },
  folderLoop: { feature: 'sequence-loop', capability: 'sequence', what: 'starts over after its last clip', undo: 'set At the end to As the last clip says' },
} as const satisfies Record<string, PlaybackNeed>;

/** What this cue needs beyond a plain Take (plan §6.9). None for a legacy cue or a Loop. */
export function playbackNeeds(cue: Pick<ShowCue, 'playback' | 'imageFit'>, item: Pick<PlayoutItem, 'loop' | 'mediaKind'>): PlaybackNeed[] {
  const p = cue.playback;
  const end = effectiveEnd(cue, item);
  const needs: PlaybackNeed[] = [];
  if (item.mediaKind === 'still' && cue.imageFit !== 'stretch') needs.push(NEEDS.imageFit);
  if (end === 'clear') needs.push(NEEDS.clear);
  if (end === 'next') needs.push(NEEDS.next);
  if (p?.fadeIn || p?.fadeOut) needs.push(NEEDS.fade);
  if (p?.levelDb) needs.push({ ...NEEDS.level, what: `plays at ${dbText(p.levelDb)}` });
  if (p?.trimIn !== undefined || p?.trimOut !== undefined) needs.push(NEEDS.trim);
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
export function playbackBlocker(needs: readonly PlaybackNeed[], ability: PlaybackAbility | null, subject = 'This cue'): string | null {
  if (!needs.length) return null;
  if (!ability) return 'Asking NoaCG Bridge what it can play…';
  if (ability.state !== 'ok') return null;
  const noFeature = needs.filter((n) => !ability.features?.includes(n.feature));
  if (noFeature.length) {
    return `${subject} ${listed(noFeature.map((n) => n.what))}. Update NoaCG Bridge to take it, or ${listed([...new Set(noFeature.map((n) => n.undo))])}.`;
  }
  const noCapability = needs.filter((n) => !ability.capabilities?.includes(n.capability));
  if (noCapability.length) {
    const server = ability.version ? `CasparCG ${ability.version.split(' ')[0]}` : 'this playout server';
    return `${subject} ${listed(noCapability.map((n) => n.what))}, which ${server} cannot do. To take it, ${listed([...new Set(noCapability.map((n) => n.undo))])}.`;
  }
  return null;
}

/**
 * Why a control that adds this need is off, or null when the Bridge and its server can both honour
 * it (plan §6.9: the page offers a control only when both say yes). Going back to a default is never
 * off: that is how a cue with a setting nobody here can play is made takeable again.
 */
export function offerBlocked(ability: PlaybackAbility | null, need: Pick<PlaybackNeed, 'feature' | 'capability'>): string | null {
  if (!ability) return 'Asking NoaCG Bridge what it can play…';
  if (ability.state !== 'ok') return 'Connect NoaCG Bridge and the playout server to set this.';
  if (!ability.features?.includes(need.feature)) return 'Update NoaCG Bridge to set this.';
  if (!ability.capabilities?.includes(need.capability)) {
    return `${ability.version ? `CasparCG ${ability.version.split(' ')[0]}` : 'This playout server'} cannot do this.`;
  }
  return null;
}

/**
 * A CLIP AS ITS PLAY-THROUGH FOLDER PLAYS IT (plan §6.5 and §6.6). A clip before the last - and every
 * clip of a folder that loops - plays into the next file, so its own ending gives way: Clear with its
 * fade out, Loop (the legacy item.loop too) and Play next all read as Hold, and its fade in, trim and
 * level stay. The last clip of a folder that ends keeps its own ending, except Play next, which never
 * leaves its folder and so reads as Hold. The record is never rewritten.
 */
export function asFolderMember<C extends Pick<ShowCue, 'playback'>>(cue: C, item: Pick<PlayoutItem, 'loop' | 'mediaKind'>, ownEnding: boolean): C {
  if (ownEnding && effectiveEnd(cue, item) !== 'next') return cue;
  return { ...cue, playback: { ...cue.playback, end: 'hold' } };
}
