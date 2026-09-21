// GROUPING A CUE'S FIELDS BY WHAT THEY BELONG TO - derived from the template, never authored.
//
// The playout cue editor used to flow every field, in field order, into whatever number of
// columns the window afforded. On a wide monitor a scoreboard therefore read as one long
// undifferentiated row: Team A, Score A, Team B, Score B, Period, Clock, two colours. Owner,
// 2026-08-21: "if we have a scoring system then everything that fits one team should be on one
// row or one column and the other team is in the next row. There would be some logic in how we
// build up the dashboard."
//
// THE CONSTRAINT IS THE SAME OWNER'S NEXT SENTENCE: "we have no idea what kinds of graphics we
// will have in the future… I don't know if we can make any hard rules about this." So this
// module may not know about scoreboards, or about any other type. It reads the SAME side tokens
// `cueData.ts` already reads to load a teams table into one half of a board - if that rule is
// good enough to decide which fields a data row fills, it is good enough to decide which fields
// belong beside each other - and when it is not confident it returns ONE unlabelled group, which
// renders exactly as the flat flow always did. A wrong grouping is worse than no grouping: it
// tells an operator two fields are related when they are not.
//
// docs/PLAYOUT_DASHBOARD.md §2d records the candidates this is the first of.

import { hasSideFields } from './cueData';

// A SECOND VOCABULARY ARRIVED WITH THE SCORE TRACKER (docs/backlog/scoreboard-behaviour.md). The
// owner's ask was "two or more teams", and a board with four of them titles its fields "Team 1",
// "Score 1", "Team 2", … - numbers, not the A/B a match uses. Everything below the token is
// unchanged: the same "does it mirror" test decides, and the same one-unlabelled-group answer is
// what a graphic gets when it does not. Only the alphabet is new.

/** The sides a two-sided board names in its field titles - `cueData.ts` owns the vocabulary. */
const SIDES = ['A', 'B'] as const;

/** How many numbered rows a board may be banded into. Past this the cue editor is a wall of
 *  headings rather than a layout, and the score tracker caps its own teams at the same number
 *  (templates/importedDesign/scoreBehaviour.ts SCORE_MAX_ROWS). Stated here rather than imported:
 *  this module reads TITLES and knows nothing about behaviours, which is what lets it band a
 *  hand-written template's fields too. */
const MAX_ROWS = 8;

/** The numbered rows a board could be describing: '1'..'8'. */
const ROWS: string[] = Array.from({ length: MAX_ROWS }, (_, i) => String(i + 1));

/** One band of the cue editor: a heading and the fields under it, in field order. */
export interface CueFieldGroup {
  /** Stable across renders and unique within the cue - React keys and test ids. */
  id: string;
  /**
   * The side token this band is, when it is one ('A' / 'B'). The band's visible heading is not
   * here: it depends on the cue's VALUES, which are not this module's business (see
   * `groupHeading`). Null on the shared band and on the single ungrouped band.
   */
  side: string | null;
  /** Field keys, in the order the template declares them. */
  keys: string[];
}

/** How many fields a side must claim before a band is worth drawing. */
const MIN_PER_SIDE = 2;

/** Does this title carry exactly one token from `tokens`? Returns it, or null for none/several. */
function soleToken(label: string, tokens: readonly string[]): string | null {
  const hits = tokens.filter((s) => new RegExp(`\\b${s}\\b`).test(label));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * A LETTERED LIST IS NOT A TWO-SIDED BOARD, and the A/B tokens alone cannot tell them apart.
 *
 * A quiz titles its fields "Answer A", "Answer B", "Answer C", "Answer D" - the same shape a
 * scoreboard uses for two teams, with the same first two letters. Grouping it would put Answer A
 * in one band, Answer B in another, and Answers C and D in a third called "Both", which is not a
 * layout so much as a lie about what the fields are.
 *
 * A single capital letter standing as its own word anywhere past B is the tell, and it is one a
 * two-sided board never has: the sides of a match are A and B and stop there. Bailing is the safe
 * direction anyway - the flat flow is what every graphic had until now.
 */
function looksLikeLetteredList(descriptors: { label: string }[]): boolean {
  return descriptors.some((d) => /\b[C-Z]\b/.test(d.label));
}

/** A field title with its side token removed - "Team A colour" -> "Team colour". */
function stripSide(label: string, side: string): string {
  return label.replace(new RegExp(`\\s*\\b${side}\\b`), ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase();
}

/**
 * The bands one vocabulary produces, or null when this board is not described by it.
 *
 * ONE FUNCTION FOR BOTH ALPHABETS, because the test is the same test. Whether the tokens are A/B
 * or 1..8, a band is worth drawing only when several of them claim `MIN_PER_SIDE` fields each AND
 * the stripped titles MIRROR each other - two teams are described by the same words ("Team",
 * "Score", "Team colour"), while fields that merely happen to carry a 1 and a 2 ("Camera 1",
 * "Sponsor 2") are not the same words at all. Sharing the test is what stops the second alphabet
 * being a second set of judgement calls to keep in step with the first.
 */
function bandsFor(
  descriptors: { key: string; label: string }[],
  tokens: readonly string[],
  idPrefix: string,
): CueFieldGroup[] | null {
  const byToken = new Map<string, string[]>(tokens.map((s) => [s, []]));
  const strippedBy = new Map<string, Set<string>>(tokens.map((s) => [s, new Set<string>()]));
  const shared: string[] = [];
  for (const d of descriptors) {
    const token = soleToken(d.label, tokens);
    if (!token) {
      shared.push(d.key);
      continue;
    }
    byToken.get(token)!.push(d.key);
    strippedBy.get(token)!.add(stripSide(d.label, token));
  }
  // The tokens this board actually uses, in the vocabulary's own order - a four-team board says
  // nothing about rows five to eight, and a band for a row nobody drew would be an empty heading.
  const used = tokens.filter((s) => byToken.get(s)!.length > 0);
  if (used.length < 2) return null;
  if (used.some((s) => byToken.get(s)!.length < MIN_PER_SIDE)) return null;
  // MIRRORED AGAINST THE FIRST, which is the same claim as before read across N rather than two:
  // every band has to be describing the same shape of thing.
  const first = strippedBy.get(used[0])!;
  for (const s of used.slice(1)) {
    const overlap = [...strippedBy.get(s)!].filter((label) => first.has(label)).length;
    if (overlap < MIN_PER_SIDE) return null;
  }
  const groups: CueFieldGroup[] = used.map((s) => ({ id: `${idPrefix}-${s}`, side: s, keys: byToken.get(s)! }));
  if (shared.length > 0) groups.push({ id: 'shared', side: null, keys: shared });
  return groups;
}

/**
 * The bands for one cue's CONTENT fields.
 *
 * Always returns at least one group covering every key exactly once, so a caller can render the
 * result without a second code path for the ungrouped case: a lone group with `side: null` and
 * no heading IS today's flat flow.
 *
 * A side band needs `MIN_PER_SIDE` fields of its own on BOTH sides. One "Team A" among eight
 * unrelated fields is a coincidence, not a structure, and drawing a band around it would state
 * a relationship the template never claimed.
 *
 * LETTERS ARE ASKED FIRST, and the numbered path is only reached when the lettered one declines.
 * A/B is the narrower claim - `cueData.ts` owns that vocabulary and the dataset loader speaks it -
 * so a board that reads as both is the two-sided one it has always been.
 */
export function groupCueFields(descriptors: { key: string; label: string }[]): CueFieldGroup[] {
  const one: CueFieldGroup[] = [{ id: 'all', side: null, keys: descriptors.map((d) => d.key) }];
  if (descriptors.length === 0) return one;
  if (hasSideFields(descriptors) && !looksLikeLetteredList(descriptors)) {
    const lettered = bandsFor(descriptors, SIDES, 'side');
    if (lettered) return lettered;
  }
  // NUMBERED ROWS. A score tracker for four teams, a results board, any graphic whose fields are
  // "<something> N" - the same relationship the A/B bands draw, said in the alphabet a board with
  // more than two rows has to use. There is no `looksLikeLetteredList` twin here: that guard
  // exists because a quiz's "Answer A".."Answer D" is a LIST wearing the two-sided board's
  // clothes, and the mirror test above already refuses a list - one field per number never
  // reaches MIN_PER_SIDE.
  return bandsFor(descriptors, ROWS, 'row') ?? one;
}

/**
 * Could this value be read as a NAME at a glance? Non-empty, short enough not to wrap (a heading
 * is a glance, and a wrapped one is worse than a generic one), carrying at least one letter so a
 * score, a clock ("10:00") or any other figure never qualifies, and neither a colour ("#e11d48")
 * nor a picture's path or address.
 */
function looksLikeName(value: string): boolean {
  if (value === '' || value.length > 20) return false;
  if (!/\p{L}/u.test(value)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return false;
  return !/[/\\]|\.(png|jpe?g|gif|webp|svg)$/i.test(value);
}

/**
 * What a band is CALLED on screen.
 *
 * A side band borrows the operator's own word for that side - the first of its values that reads
 * as a name, which on every two-sided board we ship is the team ("Team A", "Fighter A", "Party
 * A"). That is the whole reason the heading is computed from values rather than from titles:
 * "ARC" and "YLE12" say which half of the board you are editing in the language of the show,
 * where "SIDE A" and "SIDE B" only say that a split exists.
 *
 * THE FIRST NAME-LIKE VALUE, NOT THE FIRST FIELD. Which field comes first in a band is the
 * DESIGNER's document order, and a scorebug drawn "Home team, Home score, Away score, Away team"
 * hands the away band its score first. Reading only the first field headed that band "Side B"
 * beside a home band headed OTAVA (the demo walk of 2026-09-21): one side by its name and the
 * other by a placeholder, on one board. Every field of the band is asked in order and a figure,
 * a colour or a path is skipped, so both bands carry their team.
 *
 * The fallback is never a guess - `Side A` is exactly as much as we know when no value in the
 * band reads as a name (a team left blank), and on a numbered board `Row 3` is: a graphic with
 * four teams has no sides, and calling one "Side 3" would be inventing a word for something the
 * titles never said.
 */
export function groupHeading(group: CueFieldGroup, values: Record<string, unknown>): string | null {
  if (!group.side) return group.id === 'shared' ? 'Both' : null;
  for (const key of group.keys) {
    const value = String(values[key] ?? '').trim();
    if (looksLikeName(value)) return value;
  }
  return group.id.startsWith('row-') ? `Row ${group.side}` : `Side ${group.side}`;
}
