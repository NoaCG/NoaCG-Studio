# Phase 2 maintenance review

**Source pin** `9496e84e1e6a7703ec6d7a217f27e80178ef4f03` (main, 2026-11-08).
This purposive sample applies the [Phase 1 ownership map](../spec.md#ownership-at-the-phase-1-pin)
to three ordinary changes and one planned move. Each pair below is the actual first parent and
landed merge. Run `git diff --find-renames <parent> <merge>` to read the integration and
`git diff --numstat <parent> <merge> -- <path>` to reproduce the selected line deltas.

| Change | First parent | Merge |
|---|---|---|
| Bridge reload leadership [#2259](https://github.com/NoaCG/NoaCG-Studio/pull/2259) | `cac694063910ff0bcd2cf07f74ef7b4220a18041` | `34d2497371a55dcbbf16ad3d2e2f2e84c386cd79` |
| Wizard Finish clock fix [#2135](https://github.com/NoaCG/NoaCG-Studio/pull/2135) | `5284d4b6e2775a501f1ae25b4b7883dd06a76ffd` | `20052b7e0557247191a6959343507e9106ef633b` |
| Wizard kit folder move, S8 [#1240](https://github.com/NoaCG/NoaCG-Studio/pull/1240) | `1deb161a440707e858a7148be68ab861afd0b83c` | `6e44a0abe0612fd10940f8f42e2a28806c5ec467` |
| Local file source [#2197](https://github.com/NoaCG/NoaCG-Studio/pull/2197) | `7495bdc78530079a18267ba9c4cc09ad35a0b884` | `ba68c05e53531dae70f5bed4af424e542148c3af` |

## Ordinary production fix

**Intent and owner.** In #2259 a hidden tab already holding the reload lock can yield on a quiet
reading to a tab that started waiting later. `bridgeWatch.ts` owns when to offer the lock and
rechecks that it is still the same lead, the tab is still hidden and no reload is in flight when
the asynchronous answer comes back. `webLockLead.ts` owns the browser lock and the same-key
waiter query. This uses the existing Bridge session state and adds no authored production write.

**Wiring and proof.** `ProductionPage.tsx` adds one line to supply current document visibility
through the existing adapter. The watch grows by 27 lines for the handoff and its guards.
`scripts/bridge-watch.test.mjs` owns the two-tab handoff and visible-leader case.
`scripts/web-lock-lead.test.mjs` owns same-key wait detection and the fallback without Web
Locks. `docs/BRIDGE.md` records the new timing. Reflow of adjacent unchanged prose could have
been omitted. **Review action.** Check the handoff guards in the watcher and the lock key in
the adapter against those two tests. Accept the visibility adapter line as necessary wiring.
The production follow-up explicitly leaves physical background-tab throttling unexercised.
[#1553 follow-up](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6693921888)

## Wizard maintenance and migration

**Ordinary Finish fix (#2135).** An undated clock whose next occurrence is skipped by a daylight
saving time change needs a valid new time before Finish builds. The import capability owns the
gap detection and wake calculation in `import/draft.ts` and the correction and readback in
`import/ClockFold.tsx`. The input is local until it resolves and the hook patches the wizard
draft. The shell uses that existing draft and adds the target readback to Finish with a
one-line replacement. `scripts/clock-target.test.mjs` covers the gap decision and
`e2e/playout-clock.spec.ts` covers a gap reached while Finish is open and a door press that must
recheck before building. No avoidable collateral identified. **No action.** The clock behavior stays
in the capability and the shell supplies the presentation wiring.

**Planned kit move (#1240).** S8 gave the kit a capability folder used by its walk. It moved
`kitPlan.ts` and `KitTray.tsx` into `template/` (97% and 98% rename similarity). The walk reducer
in `shell/walkState.ts` still owns picker and plan state. `template/kitPlan.ts` owns the
per-graphic draft transforms, and `template/useKit.ts`
owns which graphic is open. The tray still renders the kit. Shell, reducer, picker and hook
import updates follow the move. The existing kit proof stays in `scripts/wizard-kit-plan.test.mjs`,
`scripts/wizard-kit-moves.test.mjs`, `scripts/wizard-walk-state.test.mjs` and
`e2e/wizard-kit.spec.ts`. Test loader paths change and the browser assertions stay in place.
The existing dependency check gained `wizard-template-only-from-the-walk` and the kit rules
followed their owners. No avoidable runtime collateral identified. **Review action.** Verify
that these are moves with the same state owners and that the dependency fence still rejects
a caller from another capability. The [S8 receipt](../../wizard-structure/evidence/phase-s8.md)
records the rejected import probe and the existing kit checks. Treat its cross-file edits as
migration work. The single ordinary Finish example supplies no estimate of post-split coupling
or budget friction.

## Separate model concern

**Ordinary source capability (#2197).** Connecting a local CSV or workbook lets edits reach
bound fields without another Take. The persisted production records the file kind, name, format
and shape in `shows.ts` (+27/−5). Its existing source and binding operations persist the authored
changes. `model/productionData.ts` owns the data path prefix. `control/fileHandles.ts` keeps the
browser-local handle in IndexedDB by source ID. `control/fileSource.ts` supplies the file read and
availability check to the shared reader in `control/sheetSource.ts`. The shared reader coordinates
the lease and missed or stale read status. It uses the page's existing live writer,
`dataSession.applySourcePatch` in `control/productionDataSession.ts`. The page selects the file
reader alongside the other readers. `CueEditor.tsx` supplies the connection UI. The cue, source
list and `ProductionDataPanel.tsx` reuse `SourcesLine.tsx`'s permission recovery button.
`scripts/file-source.test.mjs` covers parsing, mapping, permissions and the two-reader case where
a page without the file cannot keep the lease. The local-file case in `e2e/production-data.spec.ts`
covers connect, live update and permission recovery. No avoidable collateral identified.
**Review action.** Check that source configuration follows the existing production write path,
the browser keeps the handle, and a page unable to read it gives up the lease. Use the
two-reader test and the connect and live update journey named above. This is the browser work
described in the production closeout.

**Leave the write envelope intact.** `shows.ts` is broad because it contains persisted shapes,
domain mutations and the common write path. In this sample the new source adds a record variant
and classification helpers without changing routing. At the source pin, `readEditable` filters
personal records shadowed by a team record. `patchShowChecked` applies write checks and stamps
successful edits, and `saveAll` preserves hidden personal tombstones while routing personal
records to `durableStore.ts` and team records to `teamShows.ts`. The team backend owns
revision-checked persistence in `backend/teamProductions.ts`. Personal and team undo use their
existing conditional writers via `useRundownHistory.ts`. The selected diff exposes no
independent defect in that seam. Splitting by source type would add import and review work
without addressing an observed write problem.

| Existing responsibility at the pin | Proof location inspected |
|---|---|
| `showFolders.ts` owns folder contiguity and placement. `shows.ts` applies results through its mutations. | `scripts/show-folders.test.mjs` checks that moves and writers preserve whole folders. |
| `cueClipboard.ts` owns the copy/paste transform. `shows.ts` commits the new rundown entries. | `scripts/cue-clipboard.test.mjs` checks remapped identities, order and typed data. |
| `rundownHistory.ts` owns inverse calculation and refusals. The personal durable writer and team backend check the expected rundown before persisting. | `scripts/rundown-history.test.mjs`, `e2e/rundown-history-storage.spec.ts` and `e2e/rundown-history.spec.ts` cover exact inverses, stale personal storage and conflicting team edits. |
| `publishedRecord.ts` computes the digest. `hostedControl.ts` computes it on publish, `shows.ts` stores it and `usePublishDrift.ts` reads it. | `scripts/published-record.test.mjs` checks that undoing a change reads clean and publish bookkeeping does not trigger drift. |

## Coordination and verification

The production [owner closeout](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6686105172)
leaves its formal evidence gaps as recorded. The [CI/CD allocation](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6693962369)
exempts documentation from the measurement hold. The active [#2261](https://github.com/NoaCG/NoaCG-Studio/pull/2261)
file list, its run's recovery checkpoint `d67cbcdaa5aa270220c9711a81ba62ccb36faa1e` and the other
open PR file lists showed no overlap with these three paths at admission.

This is a source and existing test-inventory review. The November sample supplements the
[October research](research.md) at its original pin. It establishes specific review checks
and a supported decision to leave the model intact. Production and browser flows were skipped
for this documentation phase. The PR records the changed-file gates, and the run's independent
checker verifies acceptance on the landed revision.
