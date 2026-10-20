# Fill, Connect and recovery

**Fill copies now. Connect follows a source.** Start at the selected graphic field or cue, not at a catalogue category. The source owns acquisition; the graphic owns presentation; only the operator owns playout actions.

## Proposed custom mapper

1. Choose Fill from Sheet… or Connect to Sheet… on the selected card/field. Existing general Sheet-link screens remain the baseline.
2. Pick the tab, then choose Values, List or keyed row. Promote Values alongside List. Show the actual header row; confirm headers and stable key explicitly.
3. Match columns to declared field IDs: `Player → f0`, `TeamLogo → f1`, `Score → f2`, `Status → f3`. Show a sample, expected type, image preview and ownership for each. No fallback by column position. Equal labels suggest, never commit.
4. For Fill, select a row and copy the mapped fields into this cue. For Connect, preview the selected source leaves and every affected graphic. A multi-column list needs distinct fixed slots or a declared repeater; the mapper must not claim a plain list recipe understands arbitrary tables.
5. Confirm. A collision with prepared message fields refuses the operation and offers a separate card or deliberate ownership switch; the same refusal occurs when preparing a message into a connected destination. Advanced bindings cannot bypass it.
6. Display ownership badges and source freshness on the card. Bound lists are read-only. Manual/cue fields stay editable. Reordering the source leaves filled cues unchanged and keyed connections attached to their ID.

## Ownership and actions

| State / action | What is written | What the operator sees | Status |
|---|---|---|---|
| Manual or Fill snapshot | ShowCue.values | Cue badge; source provenance can be inspected | Existing model; mapper proposal |
| Connected Sheet scalar | Source reader writes only changed cells into Show.data; bindings fan out | Linked field, checked/changed timestamps | PR1390 agreed reader behavior |
| ±, set or typing on connected Sheet scalar | Shared Show.data; all graphics bound to that path follow; Sheet itself is untouched | Override badge and current source value | D4 preserved |
| Unrelated Sheet cell changes | Only that cell's path changes | Scalar override remains | D4 preserved |
| The overridden source cell changes | New source value replaces the override | Override badge clears | D4 preserved |
| Return to Sheet value | Explicit shared write of latest valid source cell, even if unchanged externally | Both connected graphics return; badge clears | New affordance; requires known-good source value |
| Connected list | Source owns the full list | “Edit in the source, or Disconnect to edit here” | DS19 preserved |
| API absolute push | Next write to that leaf wins | Last received status; no persistent D4 override lock promised | Existing API semantics |
| Sheet Pause | Reader/sink suppresses writes and retains source baseline/current values | Paused, values remain on air | Agreed C1/C2 |
| Sheet Resume | Apply only cells changed while paused; don't revert unrelated overrides | Resumed with change count | Agreed D4 |
| API Pause | C5 suppress-and-diff proposal or “Stop sender to freeze” fallback | Only offer a functioning Pause control | Conditional, not available by assumption |
| Disconnect | Remove selected binding, copy last resolved value into affected cue ownership | Editable field; preview actual affected cues before confirming | Agreed behavior; multi-cue policy must be tested |
| Reconnect | Validate mapping and preview current source before an explicit write | Difference preview; warning if live | Proposed custom mapping detail |

## Update timing and output

Sheets: the agreed active browser reader checks every 5 seconds; target edit-to-visible is 10 seconds subject to Q qualification. With all production pages closed, server tick is about a minute and actual latency must be measured. Stale is three missed active-reader cycles: approximately 15 seconds in-browser or three minutes under the tick. “Checked” is not “changed”. A successful unchanged read refreshes health without writing output.

API: the sender chooses its cadence and only sends coherent current state. Five-second snapshots are a **rehearsal setting**, not a provider SLA. NoaCG documents changed-field fan-out and rate limits; size cadence for number of changed graphic rows, not only HTTP requests. Back off on 429, stop/re-authorize on 401, retry transient failures without duplicating increments. Our four-graphic sample is deliberately small.

Connected data reaches both the graphic's preview/current values and an already-on-air instance through normal field updates. Off-air graphics remain off air. A prepared cue that contains filled fields stays a snapshot even while other fields follow live values. For an editorial freeze of an entire result screen, prepare an explicitly disconnected snapshot graphic; do not promise that selecting a cue freezes its still-connected fields.

## Failure and recovery specification

| Input / incident | Output behavior | Diagnostic and recovery |
|---|---|---|
| Valid empty text/list | Write empty string; clear that field | “Empty”, not “Cannot read”. Numeric missing data is not silently zero. |
| HTTP error, timeout, quota or unreadable Sheet | Write nothing; preserve last good values | Failed since + last successful check. Backoff, repair access or stop sender. |
| Missing keyed row | Preserve affected last-good fields | Name missing key; choose a replacement explicitly or disconnect. Never follow the row now at its old index. |
| Renamed/deleted column | Preserve affected fields; do not write empty placeholders | Field-level “Score column missing”; Remap shows old/new sample and type. |
| Incompatible type | Reject affected update (whole dependent group for coupled values) | Expected number/image/text, received sample; fix source. |
| Missing logo / bad image | Proposed host resolver retains validated asset; use approved fallback if none exists | Asset name, reason, retry/choose asset. Current setFieldValue alone does not guarantee this. |
| Expired OAuth / API key | Stop unauthorized source writes; preserve output | Reconnect/replace credential off air. Existing shared-link Sheet route is not falsely described as OAuth. |
| Source returns empty while broken | Do not confuse parser failure with legitimate emptiness | Successful read + valid schema required before clear. |
| Field schema changed after publication | Published version remains known-good | Show compatible/incompatible IDs; repair mappings and republish. Today's published binding updates also require republish until C2. |
| Late/out-of-order provider snapshot | Adapter rejects older sequence | Retain current state; audit received/accepted revision. A newer corrected lower vote count is allowed. |

A deliberate recovery never triggers Take, Continue, Reset or a machine event. All four scenarios reuse these rules; visual screens 03–06 make the proposed controls observable.
