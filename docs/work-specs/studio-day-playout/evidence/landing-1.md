# Landing 1: Channel and Layer up front, the output slot guarded, Settings without purposes, changes judged by content, header controls fixed (AC-1, AC-2, AC-3, AC-5, AC-6)

2026-10-01, the owner's Windows laptop, branch `claude/studio-day-playout`. Nothing on production.

## Automated

- **Node.** `node --test scripts/server-playout.test.mjs`: 37 pass, among them the guard's own test
  (`outputSlotRefusal` refuses only the output's slot, names it, and leaves 1-10, 1-21, 1-5 and
  2-20 alone). The full build gate (`npm run build`): 2314 tests, 2312 pass, 2 skipped, then
  `tsc`, ESLint with no warnings, the dependency check and the production build.
- **Offline e2e** (`npx playwright test e2e/playout-cues.spec.ts e2e/playout-folders.spec.ts
  e2e/bridge-connect.spec.ts`): 99 passed. New in `playout-cues.spec.ts`: "nothing replaces the
  NoaCG output" - with the output on 1-21, a new server template defaults to 1-22; a clip moved
  to 1-21 reads "Layer 21 on Channel 1 is the NoaCG output. Choose another layer for this." in its
  editor, Take is disabled with that title and nothing is sent; on 1-22 it takes. The channel test
  now finds a clip's Channel and Layer visible with nothing opened, and a new template stores its
  channel as `1` rather than none.
- **Configured e2e on a local Supabase stack** (a fresh stack under its own project id from a
  scratch copy of `supabase/`, all 72 migrations applied, the two throwaway accounts the
  `configured-suite` workflow mints):
  - `e2e/configured/teams.spec.ts`: 5 passed, among them the two-account walk, which now measures
    the x position of Playout, Export… and ■ All out on a personal production (Share in the
    header) and again after the production moves into a team (the team's button there): equal.
  - `e2e/configured/live-prepare.spec.ts`: 1 passed. Its new AC-5 step: the production's graphic
    is a library record; after v2 the record is edited in the library (its CSS, as the editor's
    save writes it) and the production record's `updatedAt` stays the same, yet the panel says
    "Your unpublished changes will be published and included", Prepare for Live reads "Published
    your changes as v3", and the open output reports v3 (it prepared the change and moved onto
    it). **Mutation:** with the content check removed from the page (only the record's timestamp
    deciding, as before), the same run fails at that step with "Nothing changed since v2" - the
    studio-day symptom - so the step proves the fix.

## By hand, on a real CasparCG 2.5.0

The scratch server of `server-media-routing.md` (two 720p channels, AMCP 5350) with its media
scanner on the scratch media folder, this branch's Bridge on port 8898 with a scratch `APPDATA`,
and this checkout's dev server offline (`npm run dev:worktree`, port 5286) in the built-in
browser at 1366x800. Settings seeded with the scratch Bridge's token, the server, channels 1 and
2, the output on 1-20 and new media on Channel 2.

- From **+ From the playout server…** (the server's real list): `NORMAL_CLIP`, `PREMUL_PRORES`,
  `ALPHA_STILL` and `TONE` arrived as `2-10`, `2-10`, `2-10` and `2-5`.
- The alpha clip's editor showed **Operator note · Channel · Layer** in one row under its ending,
  fade and level, with Advanced reading only "whole clip". One pick of **Channel 1**: the row read
  `1-10`; Take: "✓ Take: PREMUL_PRORES on 1-10", and `INFO 1` on the server showed layer 10
  holding the ffmpeg producer.
- Layer set to 20 on Channel 1: the editor read "Layer 20 on Channel 1 is the NoaCG output.
  Choose another layer for this." and Take was disabled with that title.
- Settings at 1366: **Channels** (Channel 1, Channel 2, a name optional), **NoaCG output**
  (Channel 1, 20, "NoaCG's own graphics play on 1-20. No server item may use that slot.") and
  **New media** (Channel 2). No "Graphics" or "Clips" label.
- At 390x844 the editor stacks note, Channel and Layer full width; the page is 390 px wide with
  no sideways scroll.

## Not checked

- The production page's header positions in a signed-out or offline build are not measured: the
  team control is absent there, so nothing is left of Playout to move it.
- The monitor still reads PROGRAM · ON AIR on an unpublished production; that is landing 2 (AC-9).
