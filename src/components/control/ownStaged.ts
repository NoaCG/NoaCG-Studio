/**
 * THIS OPERATOR'S STAGED EDITS THAT THE SHARED BUFFER HAS NOT SHOWN BACK YET.
 *
 * The hosted control page keeps a cue's working values in the production's SHARED staging buffer
 * (`control_stage`), so every open page follows another operator's typing. That buffer only
 * moves when the server's `staged` row comes back round the log: a typed edit waits out the 400 ms
 * typing debounce, then the round trip, then the follower. For that whole second the operator's
 * box already shows the new value, but a TAKE read the buffer and aired the old one.
 *
 * That is how a quiz went to air with the wrong key on the Friday-demo walk (configured run
 * 35633742370): the operator picked key C and pressed Take inside the window, the Take aired the
 * cue's stored key A, and Reveal correct later lit A while the test watched C. Every screen logged
 * the Reveal, so it looked like a Reveal that never reached air.
 *
 * So the page lays its OWN edits over the shared buffer until the buffer shows them. A `staged`
 * row always carries the whole merged buffer right after this page's write, so this page's own
 * row carries its own value and settles it. An edit another operator later overwrites has already
 * been settled by that earlier row, so this overlay never holds a value against somebody else's
 * newer one.
 */

/** Staged values per graphic, the shape of `control_shows.staged`. */
export type StagedMap = Record<string, Record<string, string>>;

/** The shared buffer with this page's unconfirmed edits laid over it. Returns `shared` itself
 *  when there is nothing to lay over, so a render with no pending edit allocates nothing. */
export function withOwnStaged(shared: StagedMap, own: StagedMap): StagedMap {
  const graphics = Object.keys(own);
  if (graphics.length === 0) return shared;
  const out: StagedMap = { ...shared };
  for (const graphic of graphics) out[graphic] = { ...shared[graphic], ...own[graphic] };
  return out;
}

/** Record edits this page has just made (typed, loaded, bumped). A later edit of a key replaces
 *  the earlier one. */
export function addOwnStaged(own: StagedMap, graphic: string, data: Record<string, string>): StagedMap {
  if (Object.keys(data).length === 0) return own;
  return { ...own, [graphic]: { ...own[graphic], ...data } };
}

/** Remove `graphic`'s entries for which `drop(key, value)` is true, and the graphic too once it
 *  has none left. Returns `own` itself when nothing was removed. */
function without(own: StagedMap, graphic: string, drop: (key: string, value: string) => boolean): StagedMap {
  const mine = own[graphic];
  if (!mine) return own;
  const kept = Object.entries(mine).filter(([key, value]) => !drop(key, value));
  if (kept.length === Object.keys(mine).length) return own;
  const next = { ...own };
  if (kept.length === 0) delete next[graphic];
  else next[graphic] = Object.fromEntries(kept);
  return next;
}

/** A `staged` row arrived carrying the graphic's whole shared buffer: every edit of ours it now
 *  shows is confirmed and leaves the overlay. An edit made AFTER the write this row answers holds
 *  a different value and stays until its own row arrives. */
export function settleOwnStaged(own: StagedMap, graphic: string, shared: Record<string, string>): StagedMap {
  return without(own, graphic, (key, value) => shared[key] === value);
}

/** A stage write FAILED. Its values will never come back round the log, so they leave the overlay.
 *  A key edited again since then keeps its newer value. */
export function dropOwnStaged(own: StagedMap, graphic: string, sent: Record<string, string>): StagedMap {
  return without(own, graphic, (key, value) => sent[key] === value);
}
