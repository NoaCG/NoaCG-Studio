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
 * So the page lays its OWN edits over the shared buffer until the buffer shows them. An edit
 * leaves the overlay only when BOTH are true:
 *
 * - no write of that key is still waiting in the debounce or in flight, because an older row can
 *   carry the same value by coincidence (pick C, B, then C again: the first C's row must not
 *   settle the third C while the B row is still to come);
 * - the shared buffer shows the value, whichever of the write's answer and its row came first.
 *
 * A `staged` row always carries the whole merged buffer right after a write, so the last write's
 * row carries its own value. A refused write leaves the overlay once nothing else of that key is
 * in flight, or this page would keep airing a value no other screen ever saw.
 */

/** Staged values per graphic, the shape of `control_shows.staged`. */
export type StagedMap = Record<string, Record<string, string>>;

/** One edited field: the value this page shows, whether it is still waiting in the typing
 *  debounce, and how many writes of the key are on their way to the server. */
export interface OwnEdit {
  value: string;
  unsent: boolean;
  inflight: number;
}

/** This page's pending edits, per graphic and field. */
export type OwnStaged = Record<string, Record<string, OwnEdit>>;

/** The shared buffer with this page's pending edits laid over it. Returns `shared` itself when
 *  there is nothing to lay over, so a render with no pending edit allocates nothing. */
export function withOwnStaged(shared: StagedMap, own: OwnStaged): StagedMap {
  const graphics = Object.keys(own);
  if (graphics.length === 0) return shared;
  const out: StagedMap = { ...shared };
  for (const graphic of graphics) {
    const values = Object.fromEntries(Object.entries(own[graphic]).map(([key, edit]) => [key, edit.value]));
    out[graphic] = { ...shared[graphic], ...values };
  }
  return out;
}

/** Apply `change` to each named field of one graphic. A field `change` returns null for leaves
 *  the overlay, and so does a graphic with no field left. */
function edit(
  own: OwnStaged,
  graphic: string,
  keys: string[],
  change: (current: OwnEdit | undefined, key: string) => OwnEdit | null,
): OwnStaged {
  if (keys.length === 0) return own;
  const fields = { ...own[graphic] };
  for (const key of keys) {
    const next = change(fields[key], key);
    if (next) fields[key] = next;
    else delete fields[key];
  }
  const out = { ...own };
  if (Object.keys(fields).length === 0) delete out[graphic];
  else out[graphic] = fields;
  return out;
}

/** The operator typed or picked: the values count on this page at once and wait for the write. */
export function noteOwnStaged(own: OwnStaged, graphic: string, data: Record<string, string>): OwnStaged {
  return edit(own, graphic, Object.keys(data), (current, key) => ({
    value: data[key],
    unsent: true,
    inflight: current?.inflight ?? 0,
  }));
}

/** A write of these values has just gone to the server. */
export function sendOwnStaged(own: OwnStaged, graphic: string, data: Record<string, string>): OwnStaged {
  return edit(own, graphic, Object.keys(data), (current, key) => ({
    value: current?.value ?? data[key],
    // Still unsent only if the operator has typed something newer since this batch was taken.
    unsent: current ? current.unsent && current.value !== data[key] : false,
    inflight: (current?.inflight ?? 0) + 1,
  }));
}

/** Whether an edit is finished: nothing of it is still to be written, and the buffer shows it. */
function settled(edit: OwnEdit, shared: Record<string, string> | undefined, key: string): boolean {
  return !edit.unsent && edit.inflight === 0 && shared?.[key] === edit.value;
}

/**
 * A write came back. `ok` false means the server refused it: its value will never come round the
 * log, so an edit with nothing else on the way leaves the overlay. `shared` is the graphic's
 * buffer as this page has it right now, because the write's row may already have arrived.
 */
export function answerOwnStaged(
  own: OwnStaged,
  graphic: string,
  data: Record<string, string>,
  ok: boolean,
  shared: Record<string, string> | undefined,
): OwnStaged {
  return edit(own, graphic, Object.keys(data), (current, key) => {
    if (!current) return null;
    const next = { ...current, inflight: Math.max(0, current.inflight - 1) };
    if (!ok && !next.unsent && next.inflight === 0) return null;
    return settled(next, shared, key) ? null : next;
  });
}

/** A `staged` row arrived carrying the graphic's whole shared buffer: every finished edit it now
 *  shows leaves the overlay. */
export function settleOwnStaged(own: OwnStaged, graphic: string, shared: Record<string, string>): OwnStaged {
  const mine = own[graphic];
  if (!mine) return own;
  const done = Object.keys(mine).filter((key) => settled(mine[key], shared, key));
  return done.length === 0 ? own : edit(own, graphic, done, () => null);
}
