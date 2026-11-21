// NORMALIZE (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.5): the level that makes a cue air at the
// production's loudness target, from the Bridge's measurement of the part that airs, and whether a
// cue's stored result still describes it. Pure, so it runs in Node (scripts/loudness.test.mjs).
//
// The level only ever changes when somebody presses Normalize or Normalize all: a result that no
// longer matches the cue's file, trim or level is shown as stale, and the level that plays stays.

import type { CuePlayback, ShowCue } from '../model/shows';
import { MAX_LEVEL_DB, MIN_LEVEL_DB } from './cuePlayback.ts';
import type { AudioMeasure } from './playoutProtocol';

/** EBU R128, the default for a production that names none (owner, 2026-11-20). */
export const DEFAULT_LOUDNESS_TARGET = -23;
/** The loudest true peak Normalize lets a cue reach. */
export const TRUE_PEAK_CEILING = -1;
/** The targets offered by name; any other number can be typed. */
export const LOUDNESS_PRESETS: { value: number; word: string }[] = [
  { value: -23, word: 'EBU R128' },
  { value: -24, word: 'ATSC A/85' },
  { value: -18, word: '' },
  { value: -16, word: 'Streaming' },
  { value: -14, word: 'Streaming' },
];
/** The range a typed target is kept in. */
export const MIN_TARGET = -40;
export const MAX_TARGET = -5;

export type Normalized = NonNullable<CuePlayback['normalized']>;

/** `−23 LUFS`. */
export function lufsText(v: number): string {
  return `${v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)} LUFS`;
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/**
 * The level for a measured part: target minus measured, held so the true peak stays at or under
 * -1 dBTP and inside the Level range. `airsAt` is the loudness it will air at; `limit` says which
 * bound held it back from the target.
 */
export function normalizeLevel(target: number, integrated: number, truePeak: number): { levelDb: number; airsAt: number; limit: 'peak' | 'range' | null } {
  let levelDb = tenth(target - integrated);
  let limit: 'peak' | 'range' | null = null;
  const peakRoom = Number.isFinite(truePeak) ? Math.floor((TRUE_PEAK_CEILING - truePeak) * 10) / 10 : Infinity;
  if (levelDb > peakRoom) {
    levelDb = peakRoom;
    limit = 'peak';
  }
  if (levelDb > MAX_LEVEL_DB) {
    levelDb = MAX_LEVEL_DB;
    limit = 'range';
  }
  if (levelDb < MIN_LEVEL_DB) {
    levelDb = MIN_LEVEL_DB;
    limit = 'range';
  }
  return { levelDb, airsAt: tenth(integrated + levelDb), limit };
}

/**
 * What Normalize keeps on the cue for a measurement: the level, and enough to tell later whether it
 * still describes the cue. Null, with the reason, when the part has nothing to normalize.
 */
export function normalizeCue(
  target: number,
  measure: AudioMeasure,
  part: { trimIn?: number; trimOut?: number },
  fileKey?: string,
): { levelDb: number; normalized: Normalized } | { refused: string } {
  if (measure.kind === 'no-audio') return { refused: 'This file has no sound to normalize.' };
  if (measure.kind === 'silent') return { refused: 'This part is silent: nothing above −70 LUFS to normalize.' };
  if (measure.kind === 'too-short') return { refused: 'This part is shorter than 0.4 s, too short to measure.' };
  const { levelDb, airsAt, limit } = normalizeLevel(target, measure.integrated, measure.truePeak);
  return {
    levelDb,
    normalized: {
      target,
      measured: measure.integrated,
      truePeak: measure.truePeak,
      levelDb,
      airsAt,
      layout: measure.layout,
      ...(limit ? { limit } : {}),
      ...(part.trimIn !== undefined ? { trimIn: part.trimIn } : {}),
      ...(part.trimOut !== undefined ? { trimOut: part.trimOut } : {}),
      ...(fileKey ? { fileKey } : {}),
    },
  };
}

/**
 * Whether a cue's Normalize result still describes it: `current` while its level and trim are the
 * ones it was measured with (and, when the server's listing is known, the same file), `stale`
 * otherwise, null when it was never normalized.
 */
export function normalizedState(cue: Pick<ShowCue, 'playback'>, listedFileKey?: string | null): 'current' | 'stale' | null {
  const p = cue.playback;
  const n = p?.normalized;
  if (!n) return null;
  if ((p.levelDb ?? 0) !== n.levelDb) return 'stale';
  if (p.trimIn !== n.trimIn || p.trimOut !== n.trimOut) return 'stale';
  if (listedFileKey && n.fileKey && listedFileKey !== n.fileKey) return 'stale';
  return 'current';
}

/** A level somebody set by hand: not 0 dB, and not the level Normalize set (a cue normalized and then
 *  trimmed still carries Normalize's level, so it is normalized again). Normalize all leaves these
 *  alone unless asked (a music bed kept low on purpose stays low). */
export function levelSetByHand(cue: Pick<ShowCue, 'playback'>): boolean {
  const p = cue.playback;
  return !!p?.levelDb && p.normalized?.levelDb !== p.levelDb;
}

/** One sentence for a current result: the target, or what it airs at and which limit held it. */
export function normalizedWords(n: Normalized): string {
  if (!n.limit) return `Normalized to ${lufsText(n.target)}`;
  return `Airs at ${lufsText(n.airsAt)}, ${n.limit === 'peak' ? 'peak limited' : 'at the level limit'} (target ${lufsText(n.target)})`;
}
