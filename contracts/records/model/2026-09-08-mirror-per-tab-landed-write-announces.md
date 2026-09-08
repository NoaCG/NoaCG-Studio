# model/mirror-per-tab-landed-write-announces

Rule: `model/mirror-per-tab-landed-write-announces`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`: reproduced 2026-08-21 - a table authored in a second tab was gone from the database after any cue edit in the first, and it needed no second person. `patchShow` is the shape of every mutator here: loadAllShows, then mutate, then save the lot. Removing the last window means writing through the DATABASE rather than the mirror, which every synchronous reader here is built against, so the hazard is closed rather than eliminated. Reading back in the first tab proves nothing, since its mirror never saw the write either way.

This rule was first written with `fires: test:e2e/cross-tab.spec.ts`, which is true and turned out to be the wrong declaration: the compiler treats a rule whose mechanism EXISTS as carried, and prints it only in `contracts/index.md` - not in the directory contract and not in `.claude/rules/`. The spec would have had to carry the sentence itself for that to be safe, and it does not. Declared `contract` so it loads beside the module it binds.
