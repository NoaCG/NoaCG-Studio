// WHAT A NEW TRIM WOULD BREAK (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.6): before the timeline or
// the typed boxes keep a cue's start and end, the page's own Take checks (./takeBlockers.ts) run on
// the rundown as it would stand with it. A cue or folder whose Take would go now and would not
// after is named with the reason, so a 1.9-second part that disqualifies a Play next follower, or a
// clip of a looping folder cut under two seconds, is said before air rather than found at Take. A
// trim valid on its own is still kept: this only tells the operator what it costs.

import type { ShowCue, ShowFolder } from '../model/shows';
import { takeBlockerFor, type TakeContext } from './takeBlockers.ts';

export interface TrimCandidate {
  trimIn?: number;
  trimOut?: number;
}

/** The rundown with one cue's trim replaced. */
function withTrim(ctx: TakeContext, cueId: string, trim: TrimCandidate): TakeContext {
  const swap = (c: ShowCue): ShowCue => {
    if (c.id !== cueId) return c;
    const { trimIn: _in, trimOut: _out, ...rest } = c.playback ?? {};
    const playback = { ...rest, ...(trim.trimIn !== undefined ? { trimIn: trim.trimIn } : {}), ...(trim.trimOut !== undefined ? { trimOut: trim.trimOut } : {}) };
    return { ...c, playback };
  };
  const cues = ctx.cues.map(swap);
  const members = new Map([...ctx.members].map(([id, list]) => [id, list.map(swap)] as const));
  return { ...ctx, cues, members };
}

/**
 * The first cue or folder this trim would stop from being taken, as one sentence, or null. The cue
 * itself is judged too: a trim that makes its own Play next chain fail is named as this cue.
 */
export function trimBreaks(ctx: TakeContext, cueId: string, trim: TrimCandidate): string | null {
  const after = withTrim(ctx, cueId, trim);
  const targets: (ShowCue | ShowFolder)[] = [...ctx.cues, ...ctx.folders];
  for (const target of targets) {
    if (takeBlockerFor(target, ctx)) continue;
    const moved = 'sourceId' in target ? after.cues.find((c) => c.id === target.id) ?? target : target;
    const why = takeBlockerFor(moved, after);
    if (!why) continue;
    const who = target.id === cueId ? 'This cue' : 'sourceId' in target ? target.label : `The folder ${(target as ShowFolder).name}`;
    return `${who} could no longer be taken: ${why}`;
  }
  return null;
}
