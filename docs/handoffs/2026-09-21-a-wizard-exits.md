# Handoff: row A, wizard exits (2026-09-21)

Branch `claude/a-wizard-exits`. Commits `172bca9f` (the change) and `ff2a13a4` (a rename from
the simplify pass), with this handoff on top.

## What landed

In the default studio no wizard control opens the old code editor (AppShell) any more.

- **Design, SVG and import walks.** The footer "Create project" opened AppShell and saved
  nothing. In the default studio it is now "Skip to finish" (`wz-skip-to-finish`), the same
  control template mode already had. Advanced mode keeps "Create project".
- **"Open as code" on the Create with AI card.** In the default studio it now sets the file as
  `importedFile`, switches to `file` mode and jumps to its Finish, the same Finish the Import
  graphic card gives a template file. Advanced mode keeps the byte-faithful jump to AppShell.
- **Finish.** The Advanced-only door is renamed "Open in the code editor" and has lost its Alpha
  tag, so Advanced mode no longer shows two doors that are both an "editor" with an Alpha tag.
- **Entry.** Nothing needed to change. Its one editor link already went to
  `#/editor-foundation`, and the Blank card is Advanced-only. A test now pins both.
- **Trap from the prompt, checked.** The new editor opens an imported SVG. The new spec clicks
  Finish's "Edit this graphic" on the Illustrator fixture and sees its 4 text layers as fields in
  `#/editor-foundation`, so I routed the SVG road to Finish and left the choice of new editor to
  that door.

I made one design decision. The shortcut goes to Finish, not straight into the new editor.
Finish is where the production and export doors save. The new editor is Alpha, and Finish
already offers it as "Edit this graphic".

## Old-editor doors still reachable in the default studio (outside this row's files)

1. `src/components/home/GraphicControlPage.tsx` around line 640: the control page's
   `control-open-editor` button ("Open this graphic in the editor") is NOT gated on Advanced
   mode. It goes to `#/graphic/<id>`, which is AppShell. Every saved graphic opens onto this
   page in the default studio, so this is the most visible remaining door. It matters most for
   Friday.
2. `src/components/editorFoundation/EditorFoundation.tsx:51`: the new editor's header has an
   "Existing editor" button that goes to `{ view: 'editor' }`. The front page's "Open editor
   Alpha" link reaches it in two clicks.
3. `src/components/video/VideoAppShell.tsx:216`: the "back-to-graphics" button goes to
   `{ view: 'editor' }`.
4. `src/components/home/HomePage.tsx:436`: the Looks section's `onDone` goes to
   `{ view: 'editor' }`. I did not check whether Looks is reachable in the default studio.

## Traps no repo file holds

- About 20 specs walked the default wizard and used "Create project" to reach AppShell. They
  now call `switchToAdvancedMode(page)` (new, in `e2e/_create.ts`) just before the click. That
  flips the Settings toggle at runtime, so AppShell mounts under the open wizard for a moment.
  The reviewer noted that a real Advanced session boots with the toggle already on. All 305
  tests in the affected specs pass anyway. A new spec that needs the code editor after an
  import should do the same, or call `enableAdvancedMode` before its first `goto`.
- In the default studio, Back from the Finish that "Open as code" reaches goes to the Import
  card's file step, where the file is still shown, and not to the AI card. The AI card's thread
  and uploads are dropped when the mode switches. I accepted that, because a person who pressed
  "Open as code (no AI)" has left the AI road. The review flagged it as low severity.
- The docs guide (`docs.html` #first-finish) said "Create project opens the code editor ... does
  not save". It now names "Skip to finish", and `e2e/docs.spec.ts` pins the new sentence.

## Records

- Rule `wizard/offer-footer-shortcut-finish-every-step` supersedes
  `wizard/stand-footer-quiet-create-project-shortcut` (recorded with `npm run learn`).
- `docs/backlog/create-project-is-a-door-that-saves-nothing.md` now notes that the question is
  settled for the default studio. Only the Advanced half is still open.
- Owner walk: `docs/acceptance/owner-queue/2026-09-21-a-wizard-exits.md`.

## Check

- review: delegated (code-review skill, medium; scope matched base `bde57a83` plus the
  generated files and two docs files). One low finding, the Back target above, which I
  accepted and did not change.
- simplify: inline. One rename (`importCanFinishEarly`), nothing else needed.
- verify: inline. `npm run build` exit 0. The queued Playwright run (job j-1585) covered all
  changed specs plus wizard-finish, advanced-mode, editor-foundation, editor-alpha-entry,
  project-format and text-tools: 305 passed. The six new "wizard exits" tests passed on their
  own first (j-1580).
- taste: not applicable. No graphic's look changes.

## For the owner

Nothing is needed. Decide whether the control page's "Open in the editor" button (item 1
above) should go before Friday. It is a one-line gate on Advanced mode, in a file this row did
not own.
