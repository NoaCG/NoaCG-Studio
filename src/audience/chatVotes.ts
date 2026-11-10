// CHAT VOTES (interaction spec, "Chat votes"; phase 4, AC-10; Rules C1 to C10 in the phase notes).
//
// While a Multiple choice question is live, a YouTube or Twitch chat line that is only an option's
// number or letter (`2`, `B`, `b`, ` 2 `) is a vote. This module holds the pure rules: what a vote
// is, who cast it, and whether it falls inside the question's window. The intake (chatIntake.ts)
// applies them; the server (migration 0113, `audience_operator_votes`) applies the window and the
// per-voter order again, so a page that got them wrong still cannot count a vote twice or late.

import type { AudienceRound } from './audienceTypes.ts';

/** The most votes one call to the operator door carries (0113's bound). */
export const CHAT_VOTES_MAX = 500;

/**
 * The clock allowance before the question went live. Measured, not guessed: the recorded YouTube
 * live-chat page (scripts/fixtures/youtube/chat-later-page.json) gives `publishedAt` in whole
 * seconds, so a message said in the same second as Go live can read up to 999 ms earlier; Twitch's
 * `tmi-sent-ts` carries milliseconds. `scripts/chat-votes.test.mjs` re-reads that step from the
 * fixtures. 0113 uses the same second.
 */
export const CHAT_VOTE_ALLOWANCE_MS = 1_000;

/** One counted chat vote, as the operator door takes it. */
export interface ChatVote {
  /** `yt:<channel id>` or `tw:<user id>`: the platform's own id, never the display name (C2). */
  voter: string;
  /** The option's index. */
  option: number;
  /** ISO: the platform's own time of the message (C4). */
  at: string;
}

/** What the door answered. `closed`: the round is no longer the open one (C5). */
export interface ChatVoteOutcome {
  counted: number;
  closed?: boolean;
}

/** A line that is only a number or a single letter, ignoring case and spaces. */
const VOTE_SHAPE = /^\s*(?:([1-9])|([A-Za-z]))\s*$/;

/** The option a line names on a question with `optionCount` options, or null when it names none
 *  (C1): `1`..`8` or `A`..`H`, only up to the number of options. */
export function voteOption(text: string, optionCount: number): number | null {
  const m = VOTE_SHAPE.exec(text);
  if (!m) return null;
  const index = m[1] ? Number(m[1]) - 1 : m[2].toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < optionCount ? index : null;
}

/** The voter identity for a platform user id, or null when the id cannot be one (C2). */
export function chatVoter(platform: 'youtube' | 'twitch', userId: string | null | undefined): string | null {
  const id = (userId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  return (platform === 'youtube' ? 'yt:' : 'tw:') + id;
}

/** Whether a message at `at` (ms) may vote on `round` (C6): said no earlier than the round last went
 *  live, less the allowance, and not after it closed. */
export function inVoteWindow(at: number, round: Pick<AudienceRound, 'openedAt' | 'closedAt'>): boolean {
  if (!Number.isFinite(at)) return false;
  if (at < Date.parse(round.openedAt) - CHAT_VOTE_ALLOWANCE_MS) return false;
  return !round.closedAt || at <= Date.parse(round.closedAt);
}

/** Per voter, the vote with the latest platform time; of equal times, the one that arrived last
 *  (C3, C4). Order of the result: by voter's first appearance. */
export function latestPerVoter(votes: readonly ChatVote[]): ChatVote[] {
  const kept = new Map<string, ChatVote>();
  for (const vote of votes) {
    const held = kept.get(vote.voter);
    if (!held || Date.parse(vote.at) >= Date.parse(held.at)) kept.set(vote.voter, vote);
  }
  return [...kept.values()];
}
