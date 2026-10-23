# Phase 5 (row 17): takeBlockers.ts and serverVerbs.ts

Gating acceptance: AC-2, AC-3, AC-8, phase 5's matrix row, assessment A. Built on `main`
`ab9b5e485c9e1d80eb3ce0f55e7e70a87c0a069e`. Candidate code sha: CANDIDATE.

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
RESULTS

## Mutation check

Each mutant alone in the module, its test file run (`node --test`). 54 of 54 fail their test.

- `scripts/take-blockers.test.mjs` against `takeBlockers.ts`, 23 mutants, all red: caspar off skipped in takeBlockerFor; casparOff inverted; casparOff for every cue; output slot check removed; output slot checked after takeBlocker; takeBlocker dropped; airClash dropped; throughFolderIdOf blind; through cue on its own slot; chain cueIds only the cue; through folder judged by members; manual folder plans none; through folder plan without folderId; direct graphic check inverted; direct caspar dropped; direct no-file before caspar; direct uses render settings; direct uses neighbours; direct uses full take check; step bridge check dropped; step file check dropped; step server skips take check; step graphic check inverted.
- `scripts/server-verbs.test.mjs` against `serverVerbs.ts`, 31 mutants, all red: blocked ignored; blocked for every verb; settings read before the wait; no head start (waits for the save); no wait at all; flush failure not caught; head start longer; live read at the press; wake always; wake dropped; wake before the folds; outcome not folded; move-off dropped; move-off with the fade; move-off refusal ignored; move-off not folded; move-off for another cue; move-off on the same slot; move-off for a direct trigger; fold clock not the page; fold readable always; takenAt dropped; sequence not folded; loop dropped; fold length dropped; fold end loop dropped; values not from the view; run refusal ignored; chain ignored; cut ignored; folder slot ignored.
- Three survived the first round and the tests were tightened: a longer head start (now: the Take must have gone 400 ms in while the save still runs), a Play-through folder's own slot ignored (now: a folder on 4-12), and a mutant that read the store at the press but never used it (rewritten to use it; red).

## Before and after

No visible change: the moved code holds no markup and the page's JSX is unchanged. No
screenshots taken.
