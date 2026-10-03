# Rundown undo and redo plan

Status: proposed implementation, 2026-10-04. This change contains documentation only.
Source baseline: `5f79c85a3b8ab118573fc186e1f2aa8c7fda5e85`.

## Short spec

Why: playout feedback reports that Ctrl+Z does nothing after an accidental rundown edit.
Goal: several reversible move, delete, duplicate and cue-edit steps in the production page,
with normal keyboard shortcuts and no reversal or replay of live commands.
Non-goals: graphic-editor history, a global command bus, persisted history, collaborative
operational transforms, hosted/exported-controller authoring, Data workspace history, new
playout controls, publication rollback, or product changes in this planning branch.

Decisions below are unattended engineering proposals, recorded here for review and reversal.
Implement in separate verified slices; concurrency and save acknowledgement are prerequisites,
not polish to postpone until after shipping keyboard undo.

## What exists

| Seam | Current behavior and consequence |
| --- | --- |
| `src/components/playoutKeys.ts` | `usePlayoutVerbKeys` handles Ctrl/Cmd+C/X/V. `MOD_MAP` has no Z/Y; modified keys otherwise return without prevention. `typingInto` preserves input, textarea, select and contenteditable handling. ProductionPage enables keys only when `sub === null`. No rundown history is connected here. `src/App.tsx` renders ProductionPage separately from the old AppShell, so its editor undo listener is not a rundown fallback. |
| `ProductionPage.tsx`: `writeRundown` | Flushes the cue draft, invokes a model write, reports `refused`/`error`, then awaits `commitDurableWrites()`. Drag, folder operations and paste reach this wrapper. This is the smallest page seam to extend. |
| `freshShow`, `pasteAt`, `duplicateCues` | Copy reads after flushing. Duplicate uses `copyClip` and `pasteInRundown`; copied cues receive fresh ids. Cut only marks ids until paste moves them. History should record successful paste, not copy or marking a cut. |
| `editDraft`, `flushDraft` | Label, note and values live in a `CueDraft`; a 300 ms idle timer or switch/take/unmount calls `updateShowCue`. Repeated idle saves are not separate user intentions. `flushDraft` currently neither clears the draft nor awaits durable acknowledgement. |
| `removeCue`, `removeCues`, `removeGraphic` | Page handlers may send `takeOffAir` or `playoutVerb(..., 'out', ...)` before model removal. Model deletion prunes the last source graphic/server item and empty folders. Undo must restore that data, without taking it back on air. |
| `src/model/shows.ts` | Private `patchShowChecked` reads current editable shows, guards tombstones, mutates one show, stamps `updatedAt`, and calls private `saveAll`. Some public APIs return only `Show[]` and conceal synchronous failure. `setShowCues` regenerates ids; `upsertShow(s)` replaces whole documents. Neither is an undo API. |
| `src/model/durableStore.ts` | `durable.setItem` updates a mirror and queues IndexedDB persistence. `queueWrite` rolls back the mirror on failure only if no newer write owns the key. `commitDurableWrites` drains pending writes and claims one global failure message; it is not a per-operation receipt. |
| Personal/cross-tab reads | `loadShows` joins personal durable documents with team cache. ProductionPage listens to `spx-data-changed` and rereads without moving draft, selection or playhead. BroadcastChannel adoption is asynchronous; the durable-store comment explicitly documents a remaining stale-mirror overwrite window. Personal cloud sync uses document LWW, not a server revision CAS. |
| Team reads/writes | `writeTeamShow` updates JSON copies in the in-memory cache and calls `onTeamShowEdit`. `applyServerTeamShow`/`applyServerTeamShows` adopt server data without triggering another edit. `getTeamState`/`subscribeTeamState` expose `heads`, `saving` and `notes`. |
| `src/backend/teamProductions.ts` | Private `scheduleSave`/`pushSave` debounce and retry saves. `saveTeamProduction` calls `team_production_save` with `p_expected`; a refusal merges using `mergeTeamShow`, including edits typed while saving. `commitDurableWrites` does not wait for this pump. No public per-edit team acknowledgement exists. |

This code explains the missing application handler; it does not reproduce the owner's browser
incident. No browser, Bridge, output, native-input undo, or two-member runtime was exercised for
this plan. Read `e2e/playout-cues.spec.ts` for command/reload contracts and the focused folder
cases described in [evidence.md](evidence.md). Existing tests are context, not new undo evidence.

## History ownership and boundaries

One in-memory controller belongs to a ProductionPage authoring session, keyed by production id,
team id and loaded account/workspace identity. Clear it on a production or ownership change,
sign-out, deletion, or unmount. A temporary switch to Data/Audience preserves the mounted
session's history but disables its shortcuts. A reload starts empty.

Use immutable before/after **rundown slices**, not whole Show documents: ordered `cues`,
`folders`, `graphics` and `playoutItems`. These include source records pruned by deletion and
stable ids needed to restore them. Omit folder `collapsed` from comparison/restoration; merge
current collapse state by folder id for surviving folders. Restored missing folders start open.
Never restore datasets, bindings, profile, slugs, publication stamps, membership, production
name, live data or runtime state. A change to source facts/template content conservatively
invalidates history because those records are part of its slice.

Each entry carries before, after, a plain action label and identity. Keep at most 50 entries
across both stacks and a total 20 MiB serialized-slice budget; deduplicate adjacent shared
snapshots. Evict oldest entries first. An operation larger than the budget still saves, then
clears history and says that the edit is too large to undo. Measure this with embedded assets.
Measure actual heap use separately; serialized bytes are a retention limit, not a 20 MiB heap cap.

| Record as one step | Do not record |
| --- | --- |
| Move one cue, range or folder; move into/out of folders, through `moveInRundown`/`takeCuesOutOfFolders` | Selection, preview, range extension, scrolling, folder collapse, copy, cut marking, Escape |
| Successful duplicate/copy paste/cut paste through `pasteInRundown` | Clipboard contents, hover/menu state, refused drop, no-op write |
| Cue/range/source deletion through `removeShowCue`, `removeShowCues`, `removeShowGraphic`, `removePlayoutItem` | The Out commands that preceded deletion |
| Cue label, note and prepared field values through `updateShowCue` | Take/Re-take, Update on air, Next, Out/All out, Pause/Resume, Hold, machine events, shared live-data adjustments, timers, publish/prepare/export |
| Create/remove/rename a folder using `addFolderFromSelection`, `removeFolder`, `renameFolder` | Playback/automation settings and source/layer configuration in the first slice; treat their writes as an external history boundary |

A live action remains independent even when it also saves prepared values. Record only explicit
cue authoring; `runVerb` and control-button updates never produce a history entry. Undoing cue
values changes preparation only. It may make the existing unsent indicator true; air stays as it
was until an operator deliberately updates it.

Undo/redo must call a data-only restore seam, never the page's delete handlers or live dispatcher.
Before restoring, refuse deletion of a live cue or removal/replacement of a source used by a live graphic,
and refuse changes to membership/settings of a running folder. Check server ownership too. Keep the
entry available and ask the operator to take it off first.
Restoring a deleted source is allowed but leaves it off air. Do not infer safety from selection;
use current `liveCue`, server ownership and folder-run state.

## Draft grouping and keys

Preserve native text undo: do not intercept Z/Y in `typingInto`, contenteditable descendants,
IME composition, a modal/menu that owns focus, or an event already prevented. Use Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z and Ctrl+Y outside those surfaces; ignore Alt and key repeat. Call preventDefault
only in the enabled production authoring surface. A disabled/empty stack changes nothing.
Keep rundown undo separate from `PlayoutVerb` so hardware/hosted live controls gain no new verb.

Open a draft group on a field's first actual change; retain its before slice across the existing
300 ms saves. Close on blur, changing field/cue, a structural edit, a live action, or leaving the
surface. A native undo changes the controlled draft and its saved after-state inside that same
group. Cancel the group if it returns to before. A future unfocused application undo first
closes and awaits that group, then reverses it as the newest step. Clear draft/ref/timer on
restore so an old timer or unmount cannot write the reverted value back. Capture production id
before an await; reject completions from an old identity. Do not flush an old cue draft into a
new production when the reused page changes route.

## Save and concurrent-change guards

Use one serial page authoring queue for forward edits, group commits and history restore. Disable
undo/redo while a write is pending; do not pop/push stacks until its outcome is known. A new
successful edit after undo clears redo. A refused, failed or no-op edit leaves redo intact.

Before restore, read fresh `loadShows()` and compare the semantic slice with the entry's expected
side (after for undo, before for redo). Preserve unrelated current Show metadata when applying
the replacement. Do not use `updatedAt` as identity or sole guard: unrelated saves bump it and
two writes can share a millisecond. Remote changes to the slice, removed entities, or changed
team/account clear both stacks and report: "The rundown changed elsewhere. Undo history was
cleared." Unrelated dataset/publication/collapse changes preserve history and survive restore.

The page's own `spx-data-changed` is not a remote-edit signal. Track before/optimistic/accepted
slices for the current operation. A reread matching one is expected; anything else requires
reconciliation. Subscribe to `subscribeTeamState` too. While a save is pending, defer stack
changes; reread after acknowledgement. Do not treat another save's success or absence of a
`pending` flag as proof this operation landed.

Smallest required additions, named here as proposals rather than existing APIs:

1. A pure `model/rundownHistory.ts` controller for slice projection, bounded stacks and equality.
   No persistence, editor-store dependency or live effects.
2. A checked `shows.ts` data restore API, e.g. `restoreRundownChecked(showId, expected, replacement)`.
   Validate source references, ids, folder contiguity and Play-through restrictions with existing
   `showFolders` helpers. Apply exactly the slice, timestamp once, preserve other records and
   fields, and return a changed/refused/error result. Add checked variants for cue edits/deletes
   or route their existing mutations through the same checked envelope.
3. A personal conditional durable write: inside one IndexedDB read/write transaction, read the
   latest `spx-gfx-shows` array, compare the target slice, patch only that production and commit.
   Refresh the mirror from the accepted result and announce it through the existing invalidation
   road. Drain this tab's earlier writes first. Return a per-operation receipt, not the global
   `commitDurableWrites` failure claim. This closes undo's read/await/write race and preserves
   other productions. In the degraded localStorage path, refuse history restore because it has
   no atomic comparison/write. Existing ordinary personal edits and cloud LWW can still race;
   do not claim this plan makes all collaboration lossless. A later legacy stale write can still
   replace a restored document and must invalidate history when observed.
4. An explicit team save receipt/await seam around the existing pump, carrying operation identity,
   final slice and conflict outcome. History restore uses strict `team_production_save` CAS:
   conflict adopts/reloads the server document and compares its slice. A changed slice clears
   history; a metadata-only change may retry once from the fresh head and document. Never merge
   the stale inverse through `mergeTeamShow`. Normal forward edits keep their existing merge.
   Sharing the pump prevents competing saves; disable restore on pending/failed team saves.
   A forward save that changed the slice while merging externally clears older history; record
   its new step only if the exact intended slice landed unchanged. Permission/network failures
   keep it pending or failed, with history disabled until settled, rather than claiming it saved.
5. A page hook owning the serial queue/draft groups and local keys, extending `writeRundown` and
   checked deletion/edit paths. Preserve the source API's refusal and save messages.

A local failure restores UI from the real store and adds no entry. If a failed inverse leaves
the expected slice intact, keep its stack entry for retry; if rollback/reconciliation changed
it, clear history. With per-operation outcomes, successful unrelated saves cannot mask failures.
Revalidate live-source safety and identity immediately before the conditional write.

## Observable acceptance and implementation order

A. Prove the persistence seams first: inject quota/network/CAS failures, concurrent writes,
   route switches and rollback while newer work is pending. Confirm an inverse cannot overwrite
   teammate edits or another production. No usable history is advertised before these pass.
B. Implement the pure bounded history and checked restore, then route move/paste/delete and
   cue draft grouping through it. Preserve ids across redo; do not call UUID-producing paste
   again. Verify deletion restores last-source records and pruned folders without an orphan.
C. Wire local shortcuts and verify the rendered production page. Plan focused Playwright cases
   in a new `e2e/rundown-undo.spec.ts`, queued on the assigned dev port. Inspect `--list` counts
   before executing a bounded selection; broad affected/integration suites remain CI gates.

| Case to observe | Required result |
| --- | --- |
| Move, duplicate, delete, edit, then four undos and four redos | Exact order, ids, source records, folders and values at each step; after reload the final saved rundown remains, history starts empty |
| Multi-cue deletion removes last source and folder | Undo restores original ids/data/order; redo removes once; no Bridge/output command from either inverse |
| Undo creation/duplicate while its source is now live | Removal refused; current air and stack unchanged; after deliberate Out the data-only inverse works |
| Several idle saves while typing, native Ctrl+Z inside field, then blur and application undo | Native typing remains usable, one semantic group, no stale draft/timer overwrite after undo |
| Undo then a successful new move; repeat with refused drop/save failure | New successful edit clears redo; refusal/failure does not |
| External cue edit/delete/reorder during or before undo | Safe refusal/invalidation, no silent overwrite; unrelated Data/publication/collapse edit survives |
| Team save conflict/failure/retry and personal IndexedDB failure | No false success/stack advance; operation-specific outcome; exact final store reread |
| Ctrl/Cmd+Z, Shift+Z, Ctrl+Y; IME, modal, input and Data/Audience focus | History keys only on visible enabled authoring surface; native focus/keys retain control |
| Take, Update, Next, Out, Hold, live adjust and timer between editing steps | No history entry and no reverse/replay; live wire/ownership unchanged by a permitted inverse |
| 51 small steps and an asset-heavy step over the budget | Oldest eviction and bounded serialized retention; oversized edit still saves and explains lost history |

Risks: snapshot assets consume memory; strict slice equality clears history on unrelated source
changes; team acknowledgements currently cannot identify an edit; personal LWW is still not
lossless collaboration. The first implementation review should reassess transaction integration
and live-source refusals before expanding beyond this scope. Runtime implementation, browser
acceptance and owner production judgment remain future work.
