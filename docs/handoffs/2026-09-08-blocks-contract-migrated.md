# src/blocks moved into the rule store, and answered the owner's third question

Branch `claude/migrate-agents-contract-rules-5ab9fc`, from `origin/main` at `39835021`, landed as
`cefaed86` through [#124](https://github.com/NoaCG/NoaCG-Studio/pull/124). Phase 2b's row for
`src/blocks`, read under `docs/backlog/are-the-big-contracts-still-worth-loading.md` - three
outcomes per paragraph rather than two. Every measurement and the full report:
`docs/metrics/2026-09-07-blocks-migrated.md`.

## What landed

`src/blocks/AGENTS.md` was 40,894 bytes and every session opening any of the directory's modules
loaded all of it, including the parts describing modules it would never touch. It is now 29,804
bytes compiled from **69 rules** - 24 invariants, 11 traps, 34 rules. `CLAUDE.md` is gone,
`.gitattributes` is generated, and the replaced contract is kept verbatim in
`contracts/records/blocks/2026-09-07-the-contract-this-replaced.md`.

Claude Code now loads 904 bytes on any file in the directory and the rest arrives with the file it
names: 65 of the 69 rules name exactly one module. The chain went from 67,045 to 56,907 bytes of its
110,000 ceiling.

## Three claims were false

Each is quoted with the code that disagrees in the metrics file. In short:

1. **"The stub applies `fullscreen` and nothing else, so an entry here is only as alive as its
   callers."** `StubProvider.modify` reaches eight block ids through a regex table. Believing the
   contract licenses deleting seven live entries, under the rule three lines later that an
   unreachable block is deleted rather than repaired.
2. **"Fixed contracts … keep the definition-only add."** There is no definition-only add;
   `SampleDataPanel.addField` refuses with the reason. The sentence appeared four times - twice in
   this contract and once each in the doc comments of `blocks/edit.ts` and `blocks/designLayout.ts`.
   Both comments were corrected on the way in.
3. **"presetRegistry.ts … Two callers, one shape."** Three. The AI harness emits a preset region
   into the model's worked example, which makes it the caller most worth naming: it decides what
   every generated graphic imitates.

## Thirteen were true but not worth loading - the owner has not ruled

Six are the file's own refactor history: the Phase 8 inventory of deleted modules, the 33-test
classic-strip suite it replaced, the countdown autopsy, `stepAssign`'s three old code paths, a
heading naming a live module after a dead one, and the plan-phase labels. The rest are pointers,
measurements, and a rule another area already owns.

**Nothing is deleted** - all thirteen are in the replaced-contract record, and the owner can ask for
any of it back. Where `src/components` had become an index for the contracts beneath it, this file
had become a changelog for itself. Two areas, two different reasons, one missing mechanism.

## What is next

- **`src/model` is the obvious next row.** Two rules from this row scope into it, and it is now
  among the largest hand-written contracts with a real multiplier. Domain row 1 was mid-flight
  there with 619 importers behind a shim - check that has settled first.
- **The retired-name mechanism still does not exist.** `docs/WORKFLOW_ARCHITECTURE.md` §5.3 designs
  `contracts/retired.json` plus a freshness check that refuses a retired name. Three false claims
  and four stale doc comments on this row were all one class: prose naming a mechanism that had been
  removed. The `src/components` row flagged the same gap from its own side. Nobody has built it, and
  it is now the highest-yield thing left in phase 2b.
- **Four modules in `src/blocks` have no rule at all** - `behaviourData.ts`, `designFields.ts`,
  `layerTimeline.ts`, and `animationRegion.ts`, which landed while this row ran. They were never in
  the contract, so no audit would have noticed. A hand-written contract goes stale in both
  directions and only one of them leaves a trace.

## Filed, not fixed

Two findings outside the branch's scope, both with the mechanism identified:

- `docs/backlog/stub-provider-crashes-on-lower-third.md` - `block('lower-third')` returns
  `undefined` and the non-null assertion throws, so the offline provider crashes on the most likely
  thing a first-time user types. Found by checking the false reachability claim above; `src/ai` was
  held by another session.
- `docs/backlog/armed-delete-disarms-on-blur.md` - a production data table's armed delete disarms on
  blur, so a second click can re-arm instead of confirming. Surfaced as an e2e flake; the spec then
  passed twice in isolation and again after taking main in.

## Verification

`npm run build` exit 0, read directly rather than through a pipe. The migration audit
(`node scripts/contract-migrate.mjs audit --contract src/blocks/AGENTS.md --since origin/main --area
blocks`) reported every token surviving with no written drops. `npm run test:e2e:integration:queued`
after taking main in: 1003 passed plus the catalog gate's 35, none failed.

One trap worth repeating, because it nearly hid a red suite: a background `npm run … ; echo $?` is
reported by the harness with the WRAPPER's exit code, so a failing suite arrives as "completed (exit
code 0)". The suite's own last line said `Overall: FAILED`. `root/read-build-own-exit-code-never`
covers the piped case; this is the same rule for a backgrounded one.

## Session

Nothing is left open. The worktree `new-session-db1287` and the branch are landed and safe to
remove; this handoff was written from a separate worktree because a queued branch is frozen until
its landing is terminal.
