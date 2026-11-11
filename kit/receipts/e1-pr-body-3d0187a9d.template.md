The editor keeps cue flags readable at their stored times, copies timeline keys with their cue ownership, and animates pivots on eligible artwork. New SVG groups use a stable frame while older groups preserve their source and playback, and imported static font weights and rotated Illustrator plates match the artwork.

The main risk is a cue edit could alter the painted pivot or timing in a saved graphic or browser export.

Closes #1749

<details>
<summary>Details</summary>

Windows Chromium j-5156 passed six integrated pivot, raw-track and shared-renderer cases. j-5157 passed eight Illustrator, static-anchor and group cases. Exact-main control j-5158 passed. After CI exposed a missing undo for Center anchor at an already-centered default, j-5165 and j-5167 verified the restored static base write and the armed-anchor control. All 359 affected offline tests, changed-file lint and TypeScript passed. Final independent review {FINAL_REVIEW_GRADE} on 3d0187a9d64d2edc3683ce6277c65728622c18d6. Native file and actual Chrome 125% receipts keep their recorded revisions. Revised ruler captures show responsive Windows Chromium. The account check uses an isolated simulation.
GitHub runs the build and every test this change can affect before the queue merges it.

- Resolve real artwork weights for bundled SVG font aliases
- Inventory remaining R1.5 editor acceptance evidence
- Record outstanding Windows editor checks at the E1 checkpoint
- Document key-side easing and verify Windows editor file handling
- Define the timeline key clipboard rules
- Pin clipboard source and cue boundaries
- Keep timeline flags separate and support copying keys
- Define animated anchor behavior and record Windows authoring results
- Measure rotated SVG plates by their transformed area
- Specify anchor cue ownership and preservation checks
- Key the pivot of supported artwork without moving Position
- Define keyed SVG group pivot ownership and cue behavior
- and 17 more

</details>


## Rules

- Timeline copy and paste use one document revision and the resolved cue side. Same-track collisions, ambiguous owners and interpreter changes refuse the whole paste, while an accepted batch is one undo.
- Flag labels get separate hit areas when the ruler is crowded. Markers stay at their stored times, including coincident In, Step and Out. Pointer and keyboard inspection use the selected cue.
- An anchor key requires a proven editable source and playback owner. First enable keeps the painted pivot, and removing the last key keeps the observed pose in the base. Refusals preserve the document, history and selection.
- New SVG groups keep one fixed frame from creation through playback, edits and removal of the last pivot key. Older groups preserve their source and paint. Carried motion, reveals, interrupted Out and replay use the existing cue paths.
- Pivot variables form one paired ownership boundary. Other authored paint must be independent or locally shielded. Unproven CSS and SVG copies refuse the new keying path. Static legacy paths and unrelated raw-track edits retain their existing source and admission.
- Each owned track uses its graphic's local target adapter. Co-loaded raw graphics preserve their own values, CSS and interpreter through both load orders, interrupted Out and remount. Authored track names and the shared GSAP registry remain independent.

The Windows raw catalog check j-5159 fails on jc01 JavaScript. Exact-main control j-5160 found identical fingerprints for all 539 variants, including the same jc01 line-ending difference from the committed fingerprint. GitHub runs the raw catalog and configured checks for this head. [Windows and browser playback receipts](https://github.com/NoaCG/NoaCG-Studio/blob/3d0187a9d64d2edc3683ce6277c65728622c18d6/docs/work-specs/editor-r1-5/e1-notes.md)

The non-loop timeline and easing work advances #774. Loop playback remains E2 and Linux #775 remains E6.
