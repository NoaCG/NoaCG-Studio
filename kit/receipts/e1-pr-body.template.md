The editor keeps cue flags readable at their stored times, copies timeline keys without changing cue ownership, and animates pivots on eligible artwork. New SVG groups use a stable frame while older groups keep their source and playback, and imported static font weights and rotated Illustrator plates match the artwork.

Risk: A cue edit could alter the painted pivot or timing in a saved graphic or browser export.

Closes #1749

<details>
<summary>Details</summary>

Windows Chromium passed cue flag hit areas, clipboard and easing, ordinary and canonical SVG pivots, mixed raw and owned Out playback, shared-renderer isolation, and isolated account recovery in jobs j-5140 through j-5143 and j-5146 through j-5148. All 358 affected offline tests, changed-file lint and TypeScript passed on 46c7165b6. Final independent review {FINAL_REVIEW_GRADE} at that exact head. Native file and Chrome 125% receipts apply to their recorded revisions. Responsive Chromium checks cover the revised ruler layout. The account check uses an isolated simulation.
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
- and 10 more

</details>

## Rules

- Timeline copy and paste use one document revision and the resolved cue side. Same-track collisions, ambiguous owners and interpreter changes refuse the whole paste, while an accepted batch is one undo.
- Flag labels get separate hit areas when the ruler is crowded. Markers stay at their stored times, including coincident In, Step and Out. Pointer and keyboard inspection use the selected cue.
- An anchor key requires a proven editable source and playback owner. First enable keeps the painted pivot, and removing the last key keeps the observed pose in the base. Refusals preserve the document, history and selection.
- New SVG groups keep one fixed frame from creation through playback, edits, and removal of the last pivot key. Older groups preserve their existing source and paint. Carried motion, reveals, interrupted Out and replay use the existing cue paths.
- Unknown or competing transform source refuses where an edit would replace it. Grouping also refuses when its new wrapper values would replace CSS inherited by a moved member. Authored fields, raw legacy tracks and unmarked playback stay as saved.

The Windows raw catalog check j-5149 fails on jc01 JavaScript. Exact-main control j-5150 found identical fingerprints for all 539 variants, including the same jc01 line-ending difference from the committed fingerprint. GitHub runs the raw catalog and configured checks for this head. [Windows and browser playback receipts](https://github.com/NoaCG/NoaCG-Studio/blob/46c7165b618d569f0f44ce5a0f012e4a3d912b2b/docs/work-specs/editor-r1-5/e1-notes.md)

The non-loop timeline and easing work advances #774. Loop playback remains E2 and Linux #775 remains E6.

<!-- noacg:queue-merge -->
