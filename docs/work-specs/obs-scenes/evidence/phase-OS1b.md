# OS1b: Take, Out and copies per scene, evidence

Acceptance AC-2 and AC-3 (`docs/work-specs/obs-scenes/spec.md`). Rules C1 to C12 are in the spec's
phase notes. Simulated checks only: nothing here is OBS hardware proof (that is OS7).

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| AC-2: Take and Out of a scene graphic change only that scene's link | Each scene has its own pool graphic (C2 to C4), so a Take or Out names that graphic alone; OS1a R6 reads every other graphic past on a scene link | `e2e/playout-folders.spec.ts` "OBS scenes: a graphic added to a second scene...": Take of the Desk's copy leaves Gameplay's graphic up, and its Out leaves it up too. `e2e/output-scene-link.spec.ts` "Take and Out of one scene graphic...": two scene links side by side; an Out of Gameplay's graphic and a Take of the Desk's copy each change only their own link, and neither link reports the other's graphic |
| AC-2: reloading the link restores the same on and off state | OS1a R7's boot catch-up over the link's own rows (C8) | `e2e/output-scene-link.spec.ts` same test: both links reloaded; each graphic comes back on or off as the log says, link by link |
| AC-2: All out leaves scene graphics as they were | `allOutTargets` takes a `keep` set (the scene graphics of the page's record) from the page's list, the server's heads and the every-graphic fallback; scene folders keep their One-by-one step, and a run still being sent stops as every folder's does (C9) | `scripts/all-out.test.mjs` "OBS scenes C9"; `scripts/folder-playout.test.mjs` "All out keeps an OBS scene's step... still stops every run"; the journey above: a hand-taken cue goes off, the scene graphic that was up stays up, the one that was out stays out |
| AC-3: a named pool copy, a number on a name clash | `separateSceneGraphics` in the write envelope (`src/model/shows.ts` `separateAfterWrite`, called in `patchShowChecked`) and after a team save's merge (`separateMergedScenes`) | `scripts/obs-scene-copies.test.mjs` (name, "· Gameplay 2" on a clash, placed after its source, a stable id); the journey (the dragged duplicate drives "Hairline · Desk", on a layer of its own) |
| AC-3: same bindings, its own placement | Bindings and the control arrangement copied under the copy's name; `adjust` cloned | `scripts/obs-scene-copies.test.mjs` first test (a placement change to the copy leaves the source's) and the random walk |
| AC-3: survives save, reload, publish and export | A copy is an ordinary pool graphic | The journey: after a reload the pool and every cue's graphic read back the same; `buildOutputPayload` names it in the Desk scene and builds it; `buildShowZip` writes `hairline_desk/hairline_desk.html` |
| AC-3: a placement change in one scene moves nothing in the other | Two pool graphics, two `adjust` records | `scripts/obs-scene-copies.test.mjs` first test |
| Rules beyond the clauses | C10 a cue on air is never moved to a copy; C11 neither is a cue with a live candidate or a newer version's typed data; C12 the own picture graphic is never copied; re-adding a library graphic replaces the original | The journey (the on-air duplicate's drag is refused in words and nothing moves); `scripts/obs-scene-copies.test.mjs` (C10, C11 with the refusal words, C12, untouched held cue, reuse, re-add, two teammates merged into two scenes) |

The random walk in `scripts/obs-scene-copies.test.mjs` runs 300 seeds of 25 random edits (new cue,
move, flag, switch, repoint) and checks after each, from an oracle written from the Rules: each
graphic in one scene at most, nothing changes with the switch off, no graphic removed, names unique,
only scene cues move and only to a copy of what they had, the scene that held a graphic keeps it,
and a new copy has its source's bindings and a layer of its own.

## Mutation checks run locally

- The owner rule replaced by "first in rundown order": two Node tests fail (C2 and the walk). Restored.
- A held copy reused even when another scene uses it: the walk and the reuse test fail. Restored.
- All out's `keep` removed (`src/control/graphicVerbs.ts`): the journey fails, Gameplay's graphic
  goes off. Restored.

## Checks run

- Node: every test whose `guards:` names a changed module, plus `scripts/team-save.test.mjs`,
  619 pass.
- Browser, on this cloud machine through the job queue: `e2e/playout-folders.spec.ts` and
  `e2e/output-scene-link.spec.ts` whole, 59 pass.
- `tsc --noEmit` and ESLint on the changed files: clean.

## Not checked here

- OBS itself: the owner's rehearsal (OS7).
- The configured suite and the full e2e suite: CI.
