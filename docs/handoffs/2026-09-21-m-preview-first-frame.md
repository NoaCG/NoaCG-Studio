# M - the wizard preview keeps its picture across a step change

Branch `claude/m2-preview-first-frame` (the name `claude/m-preview-first-frame` was taken by an
unpushed local branch from an earlier attempt), worktree
`.claude/worktrees/agent-a6f6dcf7190382a47`, forked from `17a51923`. Source: row E's finding in
`docs/handoffs/2026-09-21-e-demo-rehearsal.md` that the wizard preview went blank for three to
five seconds after every step change. Owner walk:
`docs/acceptance/owner-queue/2026-09-21-m-preview-first-frame.md`.

## What was wrong

`WizardPreview` mounted a new iframe per document, keyed on the generation. That removed the old
frame the moment the new document was committed, so the stage stayed empty until the new frame
had parsed its roughly 270 KB of inlined fonts and GSAP, waited for the fonts and started its
entrance. On a fast machine that gap hides inside the entrance's own fade. On a slow laptop it
is seconds long.

## What changed

- The work carried over from `agent-a26e64a088dffe1c7` was the afterimage. The outgoing frame
  is moved with `moveBefore` (so it does not reload) into a closed shadow root over the stage,
  and held there until the new document posts its first `spx-preview-box` message. That message
  is sent right after `play()` or `settle`. There is also a 1500 ms deadline after load. The
  frames are built by hand because React cannot own a node that gets moved. Where `moveBefore`
  is missing, the old frame is removed as before. I kept it because it measured as a clear win
  (below) and it leaves the entrance untouched: the new document plays from its first frame,
  exactly as before.
- Fixed on top of the carried work: a stray `}` that rendered as text on the stage, and the
  missing `useLayoutEffect` import. A commit whose text matched the previous one built no frame,
  so `data-doc-pending` never cleared (found by review). The commit is now an object with its
  generation.
- The spec (`e2e/wizard-preview.spec.ts`, "the preview keeps the artwork on the stage across a
  step change") was rebuilt. The carried version sampled by screenshot under a 4x slowdown. That
  was too coarse: one screenshot took longer than the gap. At 4x it read 190-530 ms before and
  78-454 ms after, which is mostly the entrance's own fade and could not tell the two apart. It
  now films the stage with the CDP screencast at a 12x slowdown, applied only around the step
  changes, and reads ink per painted frame.

## Measurements (12x slowdown, quiz.svg, Fields -> Animation and back)

| | Fields -> Animation | Animation -> Fields |
|---|---|---|
| Before (main's WizardPreview) | 1519, 1214 ms blank | 1151, 1196 ms blank |
| After | 41, 42, 40 ms | 52, 46, 52 ms |

What is left after the fix is the entrance's own first frames. They start from nothing on
purpose and cross the 3% ink line within two or three frames. The limit in the spec is 400 ms,
so main's code fails it. Before the fix, the old picture sat at 0.5% ink (only the dashed guide)
from the click until the new document loaded, about 1.3 s at 12x.

## Decided, and why

- A hard cut from the old picture to the start of the new entrance, not a cross-fade or a
  first-frame pose. The boundary was that the animation stays identical once it has painted, and
  both alternatives change it.
- The root cause of the long load itself, the inlined fonts, is untouched. A smaller document
  would change what gets embedded, which is not a change to make four days before the demo.

## Verification

- `npm run build`: exit 0 after the final change.
- Queue jobs: j-1701 (wizard-preview, import-svg, motion-presets, layout, adapt-first: 128
  passed), j-1702 (ai, import-svg-corpus: 55 passed), j-1703 after the review fixes
  (wizard-preview, import-svg, motion-presets: 115 passed). Before/after measurements: j-1699
  (after) and j-1700 (before, failing the limit as intended).
- check: review delegated (code-review, scope checked: base `17a51923`, the same three files; 2
  findings, 2 fixed), simplify inline (the skill returned fan-out instructions; nothing to
  change), verify inline (build plus the jobs above). taste: not applicable, because the graphic
  itself is unchanged and only the stage container changed.

## What is left

- The rule `wizard/never-let-anything-wizard-renders-navigate` still says the frame is "keyed on
  its generation". It is now built by hand per generation. The substance holds (a new frame per
  document, never a new `srcdoc`), but the wording is stale. Reword it with `npm run learn` when
  the contracts are next touched.
- On a browser without `moveBefore` (Firefox before 144, Safari before 26) the blank is exactly
  what it was. The demo runs Chromium.
- The first document of a walk has no afterimage to show, so it still appears only when loaded.

## Commits

- `cf326a73` Keep the wizard preview's last picture on the stage until the new one paints
- `25484b86` Build a fresh preview frame on every commit, and time an unended blank to the film's end
- this handoff
