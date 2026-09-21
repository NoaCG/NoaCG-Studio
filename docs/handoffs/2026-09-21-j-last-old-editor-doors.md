# 2026-09-21 - Row J: the last old-editor doors

Branch `claude/j-last-old-editor-doors`, one feature commit (`e59b50b4`) plus this handoff.

## What changed

The owner said on 2026-09-21 that nothing should link to the old editor. Row A closed the
wizard's doors and row C closed the control page's. This row closed the remaining three. All
three were reachable in the default studio before the change.

1. **The new editor's "Existing editor" button** (`EditorFoundation.tsx`). You reach it from the
   front page's "Open editor Alpha" link, the control page's "Edit graphic", or the wizard's
   "Edit this graphic". It now renders only in Advanced mode, as `data-testid="ef-open-code-editor"`.
   In the default studio the way out is the Home button in the same header.
2. **The video workspace's "◫ Graphics" button** (`VideoAppShell.tsx`). You reach it through
   `#/video` or Home's Videos section, both open in default mode. In the default studio it now
   lands on `#/home/graphics`. Advanced mode still returns to the code editor. I chose Home's
   Graphics list over hiding the button because the button promises "back to graphics", and
   that list is where every graphic opens onto its own page.
3. **Apply on a saved brand** (`HomePage.tsx`, the Brands section). This is reachable because
   the Home nav shows all four sections in default mode. Apply retints the working graphic, so
   in the default studio it now opens the new editor on that graphic, where the retint shows and
   can be saved. Advanced mode still goes to the code editor.

`src/components/editorFoundation/openNewEditor.ts` is the new shared door. It writes
`?editor=foundation` in place, then navigates to `#/editor-foundation`.

## Verification

- `npm run build` exited 0.
- Browser job `j-1623` ran `e2e/old-editor-doors.spec.ts` (new), `editor-foundation`,
  `library`, `brand-editor` and `video-project`. The log reads **55 passed (2.1m)**. The job
  store marks it `failed` with `reapedAsDead: true` and `exitCode: null`, so the runner lost the
  process after the run finished. The tests did not fail. Read `node scripts/jobs.mjs log j-1623`.
- `/check`: review `delegated`, 0 findings. I scope-checked it and its base `da821d84` and six
  files match `review-request.mjs`. Simplify came back as fan-out instructions, so that leg ran
  `inline` with no edits. Verify `inline`. Taste: not applicable, because no graphic's look can
  move.
- I took no screenshot. The change only removes one header button and retargets two
  navigations, and the spec asserts each landing.

## Open points (for the next row or the owner)

- **Duplicate door code.** `GraphicControlPage.tsx` (around line 656) and
  `CreationWizard.tsx` (around line 1330) still inline the same query-then-navigate code that
  `openNewEditor()` holds. I left them alone because they are outside this row's files. A
  follow-up can switch both to the helper.
- **A deeper fix.** App.tsx still renders AppShell for `{ view: 'editor' }` in every mode. A
  default-mode guard there would close any future door in one place. It needs care because deep
  links (`#/graphic/<id>`) and the unsaved-changes cancel path (App.tsx:239) use that route.
- **For the owner, taste only.** In the default video workspace, Home and "◫ Graphics" now sit
  close together and both go to Home. `docs/acceptance/owner-queue/2026-09-21-j-last-old-editor-doors.md`
  asks whether the Graphics button should go away there.
- **Apply with nothing open.** Apply retints whatever the working document is, which may be a
  blank starter. That behaviour predates this row.
