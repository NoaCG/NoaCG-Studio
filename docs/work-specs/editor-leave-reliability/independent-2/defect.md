# Remaining autosave-drain defect

[Issue #1147](https://github.com/NoaCG/NoaCG-Studio/issues/1147). Fresh [run 38486709664](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38486709664), disposable commit `39a900183`, fails `e2e/leave-second-checker.spec.ts:135`: Home should remain absent after a newer edit, but it mounts. [Snapshot summary](autosave-failure.json). The CI artifact retains the complete synthetic source snapshot, screenshot and trace.

The task starts with the normal Riverlight ZIP-import wizard and a drawn rectangle. Home opens the decision over the editor. An accepted layer command followed by Discard in the same turn leaves the autosave pending. The probe holds that real IndexedDB transaction's completion callback. A second layer command then succeeds through `activeEditorCommands`, after Discard was requested. Releasing the autosave and replacement confirmations mounts Home, without a refusal, and replaces the newer source with the clean default. Recorded HTML lengths are 2613 before the second command, 2680 after it, and 1796 after discard; the accepted newer command had left three Undo entries.

This fault injection proves a concurrent command-edit window. It does not claim that an ordinary pointer can edit through the modal. The command surface shares the editor's source/session operations and is within the existing cumulative preservation contract.

`discardCurrentGraphic` flushes pending autosave and awaits `commitDurableWrites` before capturing `before`. The later equality check therefore protects the replacement-write interval but not the preceding autosave wait. The repair receipt promised that a source change while waiting refuses stale completion. Preserve the confirmation's editing context across both waits, keeping durable-before-live replacement, quota-refusal history preservation, successful discard and wizard/export continuations. No product repair was attempted by this checker.

The new failure is distinct from the repaired original refusal: the unchanged original three independent cases pass in run 38485907485. No assertion, maintained test, skip, timeout, quarantine or budget exception was changed to alter either result.

This is the second failed product check. Stop the editor plan run before Phase 3 and let the coordinator obtain the next direction. The notes pull request records evidence only and does not resolve the defect.
