# Phase 5 (row 17): takeBlockers.ts and serverVerbs.ts

Gating acceptance: AC-2, AC-3, AC-8, phase 5's matrix row, assessment A. Built on `main`
`ab9b5e485c9e1d80eb3ce0f55e7e70a87c0a069e`. Candidate code sha: `413f9e47` (after it only this directory changes). The e2e runs are on
`2d04ef7d`; `413f9e47` adds one Node test case and nothing else.

## What moved

- `src/control/takeBlockers.ts`: `takePlans`, `casparOffRefusal`, `takeBlockerFor`,
  `directBlocker` and `stepBlocker`, as plain functions over a `TakeContext` the page builds
  each render (`cues`, `items`, `folders`, `members`, `places`, `ownership`, `settings`,
  `ability`, `casparOn`, `bridgeDown`, `itemOf`, `graphicOf`, `slots`). The
  page keeps one-line wrappers under the old names, so every caller is unchanged.
- `src/control/serverVerbs.ts`: `runAndRecord(store, io, intent)`, the body of the page's
  `serverVerb` after its item check, with `LOCAL_SAVE_HEAD_START_MS`. The page's `serverVerb`
  keeps the item check, asks the Take refusal at the press and hands `io` (`act`,
  `loadSettings`, `now`, `wake`, and the temporary `flush` and `cueView`) and the intent in.

Decisions, traps and every non-mechanical change: `phase-notes.md`, row 17.

## Reproduce the move check

The old text, renamed to the modules' vocabulary by the substitutions below, against the new
modules (`diff -w`, since the bodies lose one indent level). Every line it prints is listed as a
non-mechanical change in the phase notes.

```sh
#!/bin/sh
# Normalised identity check for phase 5: the old page text, renamed to the modules' vocabulary,
# against the new modules. What it prints is every remaining difference.
M=${1:-ab9b5e4}
git show $M:src/components/home/ProductionPage.tsx > /tmp/p5-main.tsx
echo '== serverVerb body (page 2810-2890) vs serverVerbs.ts runAndRecord'
sed -n '2811,2890p' /tmp/p5-main.tsx | sed -E \
  -e 's/playoutItemFor\(member\)/intent.rundown.itemOf(member)/' \
  -e 's/rundown\.members/intent.rundown.members/' \
  -e 's/flushDraft\(\); await history\.closeGroup\(\);/X/' \
  -e 's/loadPlayoutSettings\(\)/io.loadSettings()/' \
  -e 's/itemSlot\(settings/intent.rundown.slots.itemSlot(settings/g' -e 's/folderSlot\(settings/intent.rundown.slots.folderSlot(settings/' \
  -e 's/serverPlayout\.(ownership|apply)/store.\1/g' \
  -e 's/act\(settings, action\)/io.act(settings, action)/g' \
  -e 's/performance\.now\(\)/io.now()/g' -e 's/stateReadable\(bridgeStatus\)/readable/g' \
  -e 's/statePoll\.current\?\.wake\(\)/io.wake()/' -e 's/cueView\(cue\)/io.cueView(cue)/' \
  > /tmp/p5-old-verb.txt
sed -n '/^  if (verb === .take.) {$/,/^  return outcome;$/p' src/control/serverVerbs.ts > /tmp/p5-new-verb.txt
diff -w /tmp/p5-old-verb.txt /tmp/p5-new-verb.txt
echo '== takePlans..takeBlockerFor, directBlocker, stepBlocker (page 3329-3397, 3399-3408, 3430-3442) vs takeBlockers.ts'
{ sed -n '3329,3397p' /tmp/p5-main.tsx; sed -n '3399,3408p' /tmp/p5-main.tsx; sed -n '3430,3442p' /tmp/p5-main.tsx; } | sed -E \
  -e 's/^  const (\w+) = /export const \1 = /' -e 's/^    /  /' -e 's/^  (\s*)/\1/' \
  -e 's/playoutItemFor\(/ctx.itemOf(/g' -e 's/rundown\.members/ctx.members/' \
  -e 's/casparOffRefusal\((\w+)\)/casparOffRefusal(\1, ctx.casparOn)/g' -e 's/!casparOn/!casparOn/' \
  -e 's/takePlans\(target\)/takePlans(target, ctx)/' -e 's/takeBlockerFor\(next\)/takeBlockerFor(next, ctx)/g' \
  -e 's/playoutSettings\)/ctx.settings)/' -e 's/serverOwnership, cues,/ctx.ownership, ctx.cues,/' \
  -e 's/takeBlocker\(target, cues, playoutItems, addressOfItem, playbackAbility, folders, graphicOfCue\)/takeBlocker(target, ctx.cues, ctx.items, addressOfItem, ctx.ability, ctx.folders, ctx.graphicOf)/' \
  -e 's/takeBlocker\(cue, \[cue\], playoutItems, addressOfItem, playbackAbility, \[\], graphicOfCue\)/takeBlocker(cue, [cue], ctx.items, addressOfItem, ctx.ability, [], ctx.graphicOf)/' \
  -e 's/itemSlot\(settings, item\)/ctx.slots.itemSlot(settings, item)/' -e 's/!cueGraphicName\((\w+)\)/!ctx.graphicOf(\1)?.name/g' -e 's/: bridgeDown$/: ctx.bridgeDown/' \
  > /tmp/p5-old-block.txt
sed -n '/^export const casparOffRefusal/,$p' src/control/takeBlockers.ts | sed -E 's/^  (\s*)/\1/' > /tmp/p5-new-block.txt
diff -w /tmp/p5-old-block.txt /tmp/p5-new-block.txt
```

Result on the candidate: the verb half prints the refusal read from `intent.blocked` instead of
asked in place, `io.flush()` in place of the inline `flushDraft`/`closeGroup` closure,
`readable` captured once at the press instead of computed twice from the same render's
`bridgeStatus`, one comment word ("render" to "press") and the three comment lines that now sit
above the check. The blocker half prints the `ctx` parameters, the three helpers rebuilt from
`ctx` (`addressOfItem`, `folderSlotOf`, `throughFolderIdOf`), `casparOffRefusal` moved to the
top and taking `casparOn`, and `directBlocker` taking `settings` (the page passes
`loadPlayoutSettings()` at the call, as before) with one comment line added.

## AC-2, AC-3, AC-8 and the matrix row

| Item | Command | Result |
| --- | --- | --- |
| Phase 5 row (offline, local) | `npm run test:e2e -- e2e/playout-cues.spec.ts e2e/playout-clock.spec.ts e2e/playout-sequence.spec.ts` and `npm run test:e2e -- e2e/playout-folders.spec.ts` (queue, two jobs) | 39 passed (j-0002) and 52 passed (j-0003) on `2d04ef7d`. A first single job on `262006aa` (all four) passed 57 of 57 before its time cap stopped it; not counted. |
| Node (the row) | `node --test scripts/take-blockers.test.mjs scripts/server-verbs.test.mjs` | 30 of 30 pass on `413f9e47` |
| Node (neighbours, unchanged) | `node --test scripts/server-playout.test.mjs scripts/folder-playout.test.mjs` | pass, unchanged |
| Configured dispatch | not required by the row ("no") | not run |
| e2e diff (AC-2) | `git diff origin/main...HEAD -- e2e \| grep '^[-+]' \| grep -v '^+++\|^---\|^+// covers: src/control/takeBlockers.ts, src/control/serverVerbs.ts'` | empty: 10 specs gain one `// covers:` line each; no assertion or selector changes |
| AC-3 | `// guards:` first line of both test files; runtime imports in both modules are `.ts` control/model modules; `npm run depcruise` | both modules load in Node; no dependency violations (1357 modules), `.dependency-cruiser.cjs` unchanged |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | `src/components/home/ProductionPage.tsx`, `src/control/serverVerbs.ts`, `src/control/takeBlockers.ts` |
| Covers | `node scripts/e2e-affected.mjs --list --files src/control/takeBlockers.ts` | selects the four specs of the row plus `bridge-connect`, `publish-output-setup`, `studio-evening-reliability`, `studio-release-completion`, `playout-air-contract` (before the covers lines: a 13-spec fallback with none of them) |
| Assessment A | a fresh read-only `/so` session on `2d04ef7d` | **AGREE WITH NOTES**, nothing blocking: identity confirmed line by line, every difference listed, §4.1-4.2 order kept, AC-2/3/8 hold; 18 mutants of its own, 14 red, 2 equivalent, 2 gaps. One gap (a Play-through clip's air check over the rest of its run) is now pinned in `413f9e47`; the other (the fold's sequence on a non-Take verb) is an equivalent mutant (see below). Its other note: the `graphicOf` swap also calls the pure `graphicLayer`, no effect. |
| `/check` | review delegated (8 findings: 2 fixed, the placeholders filled, 5 left with reasons in the pull request); simplify delegated (4 angles: 4 applied, the rest left) | pass |
| Types, lint, gates | `npx tsc --noEmit -p .`, `npx eslint` on the changed files, `node scripts/gates.mjs run --changed origin/main` | clean; gates exit 0 |

## Mutation check

Each mutant alone in the module, its test file run (`node --test`): 56 mutants, 55 red, 1 equivalent.

- `scripts/take-blockers.test.mjs` against `takeBlockers.ts`, 24 mutants, all red: caspar off skipped in takeBlockerFor; casparOff inverted; casparOff for every cue; output slot check removed; output slot checked after takeBlocker; takeBlocker dropped; airClash dropped; throughFolderIdOf blind; through cue on its own slot; Play-through run cueIds only the cue; chain cueIds only the cue; through folder judged by members; manual folder plans none; through folder plan without folderId; direct graphic check inverted; direct caspar dropped; direct no-file before caspar; direct uses render settings; direct uses neighbours; direct uses full take check; step bridge check dropped; step file check dropped; step server skips take check; step graphic check inverted.
- `scripts/server-verbs.test.mjs` against `serverVerbs.ts`, 32 mutants, 31 red: blocked ignored; blocked for every verb; settings read before the wait; no head start (waits for the save); no wait at all; flush failure not caught; head start longer; live read at the press; wake always; wake dropped; wake before the folds; outcome not folded; move-off dropped; move-off with the fade; move-off refusal ignored; move-off not folded; move-off for another cue; move-off on the same slot; move-off for a direct trigger; fold clock not the page; fold readable always; takenAt dropped; sequence not folded; loop dropped; fold length dropped; fold end loop dropped; values not from the view; run refusal ignored; chain ignored; cut ignored; folder slot ignored.
- Equivalent, survives: the fold's sequence passed on every accepted verb, not only the Take. The only other verb a run with `members` folds is the re-take's Out, and `applyAccepted` drops a slot's sequence on an Out whatever it is given.
- Survivors that tightened the tests: a longer head start (now: the Take goes at 250 ms on mocked timers while the save still runs), a Play-through folder's own slot ignored (now: a folder on 4-12), a mutant that read the store at the press without using it (rewritten to use it; red), and, from assessment A, a Play-through clip's air check limited to itself (now: a later run member up elsewhere refuses it).

## Before and after

No visible change: the moved code holds no markup and the page's JSX is unchanged. No
screenshots taken.
