// The live vote's FIELD CONTRACT words, apart from the recipe so plain modules (the production's
// result staging, control/resultStaging.ts) can read them without loading the recipe machinery.
// templates/behaviours/vote.ts emits the fields and re-exports these.

/** The status field's title and vocabulary. An EMPTY value means "not stated" - what a board
 *  saved before this field existed reports. */
export const POLL_STATUS_TITLE = 'Vote status';
export const POLL_STATUS_OPEN = 'open';
export const POLL_STATUS_CLOSED = 'closed';

/** When the percentage figures appear (owner ruling, 2026-08-30): the RESULT's beat unless a
 *  production ticks the box, which rides this field as the one exact token. */
export const POLL_LIVE_TITLE = 'Live figures';
export const POLL_LIVE_ON = 'live';
