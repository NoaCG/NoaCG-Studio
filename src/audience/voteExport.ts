// A VOTE'S VOTES AS A FILE (docs/work-specs/live-production-reliability/spec.md, P1 AC-3).
//
// The operator downloads a round's votes so a result can be checked after the show: each vote's
// time, the option it chose, where it came from, and a short key for the voter. The key is never
// the device token: the server makes it from the round and the token (0127's
// `audience_votes_export`), so one device reads as one voter within a round and cannot be followed
// from round to round. The local provider makes its own key the same way (`localVoterKey`).
//
// Pure and Node-runnable (scripts/vote-export.test.mjs).

import type { AudienceRound, RoundVote } from './audienceTypes.ts';

/** An option's letter, as the phone and a chat vote name it: A, B, C... */
const letter = (index: number): string => String.fromCharCode(65 + index);

/** One CSV cell: quoted when it holds a comma, quote or line break, and a cell a spreadsheet would
 *  run as a formula (starting with =, +, - or @) is kept as text. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The CSV for one round's votes, oldest first: Time (UTC, ISO), Option (letter), Answer (the
 *  option's words as asked), Source (phone or chat), Voter. Lines end in CRLF (RFC 4180). */
export function votesCsv(round: Pick<AudienceRound, 'options'>, votes: readonly RoundVote[]): string {
  const rows = [['Time (UTC)', 'Option', 'Answer', 'Source', 'Voter']];
  for (const v of [...votes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    rows.push([new Date(v.at).toISOString(), letter(v.option), round.options[v.option] ?? '', v.source, v.voter]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The file's name: the question's words and the day the count started, safe on every system. */
export function votesFileName(round: Pick<AudienceRound, 'question' | 'openedAt'>): string {
  const words = round.question
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .toLowerCase();
  const day = Number.isFinite(Date.parse(round.openedAt)) ? new Date(round.openedAt).toISOString().slice(0, 10) : 'votes';
  return `votes-${words || 'question'}-${day}.csv`;
}

/** The local provider's voter key: ten hex digits of a 53-bit hash of the round and the device, the
 *  same shape as the server's. Not a secret (a rehearsal has no voters to protect); it only has to
 *  keep the device token out of the file and differ from round to round. */
export function localVoterKey(roundId: string, device: string): string {
  const text = `${roundId}:${device}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0').slice(0, 10);
}
