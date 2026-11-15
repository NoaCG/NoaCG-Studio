AGREE WITH CORRECTIONS

The intended outcome is an empty graphic that immediately supports ordinary text and drawing through existing authoring operations. Reusing the established placed-design scaffold is the smallest source-supported correction. Using its default options unchanged would not satisfy the empty-canvas contract.

Verified checkpoint SHA256 `20bf95a819ff067cc5d91692cf993b22c3e16f0e71322aec1f7ea6dfb32c29c0`; all nine recorded file hashes match the frozen worktree. I read the retained j231 log: six passes and two failures remain as recorded. No execution was performed.

**Confirmed source-family findings**

1. **The neutral factory lacks first-text capability.** `blank.ts:108–109` calls `neutralSpineFor([], { lines: []… })`. Its emitted box/stack has neither an art element nor an existing line mask (`types/neutralDesign.ts:506–516`). Consequently, both supported text-add branches refuse: `baseEdits.ts:620–623`, `designLayout.ts:441–449`, and `edit.ts:81–91`. This directly supports j231’s reported refusal. The neutral CSS also supplies padding and a panel background (`neutralDesign.ts:212–219`); an empty field list alone does not establish empty transparent paint.

2. **The placed-design alternative needs explicit factory policy.** The existing constructor legitimately supports absent artwork and zero lines:
   - `importedDesign/shared.ts:104–109` emits the established empty art container.
   - `:187–190` emits no field elements.
   - `:244–271` supplies the box/art structure and full-frame origin.
   - `:312–333` preserves resolution/FPS, derives empty field/layer arrays, carries only supplied assets and uses the existing runtime conversion.
   - `IMPORTED_DESIGN.create` already resolves public options (`:353–354`).

   Three details must be handled within the dedicated factory:
   - Explicit `lines: []`, empty artwork path/assets and transparent initial paint; omitted lines otherwise acquire suggestions (`contract.ts:513–537`).
   - Explicit unit coordinate scale. Full-frame dimensions select origin, but `computeScale` still multiplies by resolution factor (`shared/base.ts:56–58`). Merely passing 1280×720 or 3840×2160 artwork dimensions would scale them again. Existing `sizeScale` options can produce `--scale: 1`; no shared geometry change is needed.
   - Set the visible template name using the established top-level naming convention (`wizard/draft/core.ts:291–295`). The constructor itself hardcodes “Imported design” (`importedDesign/shared.ts:246,313–314`). Retain its honest existing source/type contract rather than inventing a new one.

3. **Transparent palette alone is insufficient for branded blank projects.** `ProjectStarter.tsx:36` applies the selected brand. `brandApplication.ts:102` calls `applyLookToTemplate`, which replaces `panel-bg` (`packets.ts:393–396`); the empty art consumes that variable (`importedDesign/shared.ts:139`). A branded blank could therefore regain a full-frame background.

   The dedicated factory must make its empty art nonpainting independently of palette changes. A narrow adjustment to that known, freshly generated background declaration is appropriate within `blank.ts`; leave ordinary future styling editable. Do not change the shared assembler, add a permanent cascade override that defeats later edits, or weaken a writer.

**Separate confirmed B1 implementation defect**

The wizard Escape listener stands down only for `wizardConfirmOpen()` (`CreationWizard.tsx:375–381`). The new helper’s `canLeave` permits requested-stage departure (`startBlankGraphic.ts:51–55`), while both shared dialogs independently consume Escape (`SaveDialogs.tsx:97–103,206–212`). Thus one key can close the shared question and Entry.

Correct this locally by deferring underlying wizard leave handling while either existing `confirmSwitch` or `saveDialog` owns the question. Cover both dialogs, including a busy Save dialog whose own Escape handler deliberately refuses cancellation. No Save/core/E4 repair is justified. The old ProjectStarter analogue remains pre-existing and nonblocking.

**Required Rules amendment**

Record these as **rules clarified after coding**, preserving the prior A−, amended A and every failed attempt:

- Replace B3’s neutral-spine prescription with an existing placed-design constructor whose freshly created output has zero authored fields/layers/art assets and zero initial painted content, including after optional branding.
- Require first text creation and editing through unchanged authoring handlers, plus drawing, exact Undo/Redo and preserved resolution/FPS with correct coordinates.
- Preserve exact legacy `createBlankTemplate` behavior; only the dedicated factory serving the two new doors changes.
- Clarify B1: shared confirmation/name dialogs exclusively own Escape while present; underlying Entry remains open, and busy shared operations retain their existing cancellation policy.

**Grade:** recommended source-family approach **A**, with the explicit corrections above. The frozen implementation remains below acceptance; its current B3 prescription is inadequate and needs an amended checkpoint before further code. No new product decision, identity framework, marker qualification, migration or synchronization mechanism is needed.

**Bounded proof plan after separate root admission**

- Prove unbranded and branded initial transparency, empty authored fields/layers/art assets, correct name, dimensions/FPS and unit coordinates. Distinguish existing structural registry rows from authored content.
- Drive first text from the actual blank UI, edit its wording, draw shapes, and verify painted results plus exact Undo/Redo.
- Complete Save/reload/reopen, second-blank independence and unchanged installed-production snapshots; execute representative existing export paths and compare actual rendered text/drawing.
- Re-run the two shared-dialog Escape instances and relevant busy behavior with the existing held-receipt oracle. Preserve j231’s six passing outcomes at their tested scope; do not relabel its failures or reset counts.
- Retain legacy emission and unchanged sound request-count proof on the actual built candidate, followed by normal final gates.

Stop if this requires shared writer/router/runtime/source-contract changes or budget expansion. No files, edits, tests, browser, builds, provider calls or mutations were performed. Reviewer identity: `/root/editor_blank_rules_first`.
