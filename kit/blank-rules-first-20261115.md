AGREE WITH CORRECTIONS

The problem is to let users begin real visual authoring from either blank door without choosing a starter, while retaining safe switching, durable work, independent graphics and useful optional starters. The seven-path isolation is the right approach, but one pending-creation lifecycle rule needs correction before implementation admission.

Reviewed source: current main `3b06afdf39905ea728d2fd846de3ed7b7bbb7dd0`, retained `6bcce0057951aa7f721e6292e71c431a94400f4e`, proposal SHA256 `1c9a400b0f913e4cc07ee2881cb58e5224d7aa0e4648edcdda04063bc73a59ee`. Saved brief SHA256 matches `7d7b3ad055835c2cdd30ef9e6ba56bede8cd6107e3fd77818b94e1a4c6844b63`.

**Finding — pending Blank creation can override an accepted departure.** This is a UI continuation/cancellation defect in the proposed new door, not evidence of source loss or an E4 persistence defect.

At retained `src/components/editorFoundation/startBlankGraphic.ts:9–10`, successful asynchronous creation unconditionally closes the wizard and navigates to the editor. Only Blank itself is disabled while busy (`src/components/wizard/steps/EntryStep.tsx:105`). Meanwhile:

- Escape still invokes the wizard’s leave action (`CreationWizard.tsx:378–391`).
- Entry’s × remains active and explicitly promises “Cancel (keep current project)” (`CreationWizard.tsx:908–913`).
- Home remains active (`CreationWizard.tsx:847–854`).
- Template, import and AI choices remain active (`EntryStep.tsx:169–194`).

A held durable receipt therefore permits this concrete ordering: press Blank, choose Home/Cancel or another walk, then receive successful confirmation. The old Blank callback subsequently forces editor navigation or closes the newly selected walk. `authoringProjects.ts:129–131` checks editing context, not route/gallery/walk state; these departures need not invalidate it. Its existing protection against newer document/source changes remains valid.

The proposal’s B1 (`blank-isolation-assessment-20261115.md:36`) and oracle plan (`:55`) cover guard decisions and persistence outcomes but omit this accepted-departure ordering.

The analogous ProjectStarter ×/late-navigation behavior already exists on main (`ProjectStarter.tsx:32–39`; retained counterpart `:35–42`). That instance is **pre-existing and nonblocking**. Do not turn it into a core recovery repair or silently classify it as newly introduced.

**Smallest correction:** amend B1 and the verification plan to specify when an accepted blank creation owns its navigation, what happens when its initiating surface is left or changes, and what durable work may remain after departure. Keep the correction within the new door’s local UI/continuation wiring. Use the established busy-control convention where appropriate; any accepted departure must not later be overridden by the stale close/navigation callback. No new identity, collaboration, migration or recovery framework is justified.

Add one deterministic held-receipt oracle covering the new door’s ×/Escape, Home/browser departure and selection of another Entry walk. Assert the declared route/walk outcome after receipt release, alongside existing source/history preservation. Do not claim that suppressing navigation cancels an already accepted durable write.

The remaining approach is supported by source:

- Both blank paths use the existing guard and confirmed `createAuthoringProject` seam. Persistence precedes restore (`authoringProjects.ts:93–118,160–176`); Save/Discard confirmation remains authoritative (`save/SaveDialogs.tsx:214–249`).
- Separate project/document UUIDs, fresh history and null library bindings already exist (`authoringProjects.ts:167–169`). Installation clones source and refuses newer target state (`model/projectInstallation.ts:27–41,50–68`).
- Retained `blank.ts:6–105` preserves the legacy factory; the dedicated authoring factory is additive (`:107–110`). Rejecting the historical global replacement is correct.
- Starter type/design labels and decorative-preview accessibility treatment are appropriately narrow (`ProjectStarter.tsx:50–52`; `MiniPreview.tsx:69–84,117–125`).
- Production-origin authoring must retain the existing explicit-install distinction: opening an authoring document is separate from finished production admission (`wizard/shell/doors.ts:203–216` versus `:116–184`). Verify production snapshots remain unchanged until explicit installation; do not invent automatic installation.
- Removing retained whole-graphic assertions from this isolation is correct. Preserve their coverage in the retained work; replace any blank-project usability dependence on those controls with ordinary drawing/text authoring.

**Grades:** approach **A**; Rules **A−**, because the new asynchronous continuation lacks an explicit departure outcome and corresponding oracle. This does **not** meet the Risky Rules-first admission bar yet. The bounded amendment can address it without changing the seven-product-path architecture.

**Still unverified:** all candidate execution. After corrected Rules receive the required grade and root admits implementation, verify both actual doors, guard Save/Discard/Cancel/Escape/failure/newer-edit outcomes, held creation receipts, retry identities, exact save/reload/reopen and installed-copy independence in the maintained project journey. Verify starter preview/name/focus behavior and Entry viewport/Tab bounds in the existing specs. Run candidate legacy-emission compatibility and unchanged sound request-count checks on the actual built candidate, followed by normal affected/static/catalog/capacity, final full SO and GitHub gates.

Historical reference evidence remains limited to equivalent same-machine blank/text/save/independent-scene/reopen behavior. Assistant #2555 and quiz #2569 remain preserved; hosted owner Edit/Apply/Undo, panels, whole graphic and full E5F acceptance remain separate and pending. Original failures, retained work and SVG/E4 stops remain unchanged.

No files, tests, browser, builds, provider calls or mutations were performed. Reviewer task identity: `/root/editor_blank_rules_first`; this runtime exposes no separate native session/thread identifier.
