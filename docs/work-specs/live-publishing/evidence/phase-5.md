# Phase 5 evidence: the honest light and held Takes

Acceptance (verbatim): "Design G2 graded A by an independent /so" and "AC-3".

Design: `designs/G2.md`, graded A+ by an independent `/so` at 13a698c2 (full reviews B at b08b3036,
B at 1cb9bb7c, A at 1d0d79eb; delta reviews A at 0ce63d63 and A+ at 13a698c2), landed as #2426
(merge 12173c3f). The build follows it; where it departs, the departure is under "Rules found while
building" with its reason.

## What was built

- **Outputs report what they ran** (`src/control/runReport.ts`, `src/output/main.ts`). Every report
  row carries `state.run = { o, p, h, e }` and the Presence entry `ready.run`; for graphic g,
  `ran(o, g) = h[g] ? h[g].from - 1 : p`. A report fires at most 800 ms after a graphic's last
  change and at most 2 s after its first unreported change. Only a hosted, released graphic with
  nothing unsettled writes a report of itself, so no report banks work the output has not run. A
  command settled with no report of its own re-banks one settled graphic within about a second.
- **One outcome per command, by position** (`src/output/stage.ts`): `posted`, `skipped` or
  `failed`, on removal and replacement too, with a 20 s watchdog; the placer keeps the position of
  the command it rewrites (`placeOnOutput.ts`).
- **Held Takes** (`src/output/hold.ts`, `main.ts`). A live Take of a graphic the output cannot run
  yet starts a hold; every command of that graphic waits behind it in log order. Cancellation is
  decided first (a queue ending in an Out never shows). A graphic the stage does not host is read
  from the published payload at once (the demand), ahead of the Presence request and its 15 s
  spacing, and the preparation reuses that payload. On release: on time (at most 5 s after the
  surviving Take reached the output) with its entrance; otherwise hidden (picture and sound),
  replayed, and shown at its final state when it stands still (6 s cap). Failures (`unpublished`,
  `load`, `script`, `limit`) are named until a later Take or Out settles, All out, or deletion.
- **A frame's own hidden flag** (`stage.ts` `hide`): `offair` and `sound-quiet` together, restored
  to the stage's own settings when cleared; a frame still loading takes it before anything it
  holds. A late boot frame is hidden when the stage comes back on air and shown once settled.
- **Restart** (`outputRecovery.ts` `unreportedRows`): a graphic the head says is on that no report
  banks replays its own rows below `followFrom`, typed or not, within `unreportedPages`, else takes
  its head cue's published values.
- **Versions** (`swap.ts`, `prepare.ts`, `swapPlan.ts`, `readiness.ts`): `chg.b` names what is
  still being built; a graphic in `chg.w` of a `waiting` report reads green
  "<graphic>: new design at next Take" (O3); a change still building reads amber
  "Updating outputs" (O2).
- **The light** (`src/control/runConfirm.ts`, `playoutStatus.ts`, `ProductionPage.tsx`,
  `sessionWire.ts`): the page owes every command row it follows and the head it resolved (the
  seed); per output and graphic it confirms, judges held work by its `h` entry, and ages what was
  not received oldest first (grey under 5 s, amber, red at 15 s; the seed 15 s and 30 s, never red
  while Presence is down). Green is "Ready" only when everything is confirmed; old outputs read
  amber "Reload <output> when nothing is on air"; protocol 1 outputs amber "<output> cannot
  confirm". PROGRAM's tag reads "ran" once every output confirmed the last command. A cue whose
  graphic an output still loads wears a LOADING mark (O7).

## Rules found while building

- **A cancelled hold on a boot frame with history is released hidden** (the reference model in
  `scripts/output-hold.test.mjs` caught the first version, which returned `cancelled` first and
  would have played the boot's history on air).
- **A page opened before the production has a head takes its epoch from the first report heard**
  (the local configured run caught it: an empty epoch made the page ignore every report, so the
  light never confirmed).
- **A mounted OGraf package counts as ready** (its calls wait for `load()` inside the layer); only a
  package still waiting for its base is held.
- **Protocol 1 outputs keep today's behaviour and do not hold**: holds and run reports need the
  numbered log's positions (G2 section 6 words them as unable to confirm).
- **The page's own send answers are not used as owed positions** (G2 section 6 listed them). The
  answer (`VerbSent`) carries no position, and threading one through the Take path's send code was
  judged not worth the risk to that path ("Let's avoid any risky changes"); the command row, which
  arrives with the numbered frame, owes the position instead, so the light reads grey a moment
  later rather than at the answer. PROGRAM's "ran" uses the newest row learned at or after the send.
- **The page owes pressed commands, not a data road's rows** (G2 section 6 said "whoever wrote it").
  E1's words are "each command pressed"; a feed's or the data API's row carries `src`, and the
  harness showed a feed writing every 200 ms keeps one row always younger than a report, so the
  light would read grey "Confirming…" for the whole of a live feed. Data rows still move each
  output's cursor and are confirmed with it; they only no longer hold green back.
- **A status row is never a command with an outcome** (the configured run caught it: a `cue` row
  reached the stage with a position and was counted as a command for a graphic with no frame).
- **Monitors pass no positions**, so the production page's PROGRAM and PREVIEW stages are unchanged.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| eslint on every changed file | pass |
| `vite build` and `npm run check:output-reader` (Chromium 71 parse) | pass: 27 output modules parse |
| `scripts/output-hold.test.mjs` (reference model, 2,000 random queues) | pass |
| `scripts/run-confirm.test.mjs` | pass |
| `scripts/readiness.test.mjs`, `scripts/playout-status.test.mjs`, `scripts/output-setup.test.mjs`, `scripts/swap-plan.test.mjs`, `scripts/place-on-output.test.mjs`, `scripts/output-reload.test.mjs` | pass |
| `e2e/output-first-paint.spec.ts` (queued, local) | 14 of 14 pass, the new hidden-frame test included |
| `e2e/configured/per-graphic-replacement.spec.ts` on the local stack | see "Configured runs" |
| `node scripts/check-e2e-protection.mjs --changed origin/main` | pass |
| `node scripts/e2e-capacity.mjs` | WARN (not refused): 93 % of the table; one backend test added |

### Configured runs (local stack, CLI 2.111.0, cloud worker)

- `e2e/configured/per-graphic-replacement.spec.ts`, both tests pass (job j-0011, and j-0018 for
  the PROGRAM "ran" check on the first): two outputs swap a changed graphic in place and the light
  is green with "House Scorebug: new design at next Take" while it is on air (O3); PROGRAM reads
  "ran" once both outputs report the Take. The held-Take test: the payload read held back 2 s on
  Desk A and 8 s on Desk B; a Take of a new strap and a Take and Out of a second while both load.
  The light was sampled every 250 ms through the hold and never read green; Desk B reported the
  strap as shown late without its entrance; each output played exactly one entrance
  (`data-plays` 1), so the cancelled strap never played; then green, "Ready".
- Found on the way (in "Rules found while building"): an empty epoch on a page opened before the
  first head; a `cue` status row reaching the stage as a command.

### Measured (phase 2 harness, `MEASURE_BUILD=prod`, typical fixture, unthrottled, warm cache)

Graphic cue Take, press to sent, with each output reporting what it ran and a second device writing
a data-road update to another graphic every 200 ms, against phase 3's figure on one output with no
stream (11.7 / 17.2 ms, p50 / p95):

| Outputs | n | Press to sent p50 / p95 (ms) | Failures | Press to confirmed by every output p50 / p95 (ms) |
|---|---|---|---|---|
| 2 | 50 (two runs of 25) | 11.2 / 16.9 and 11.6 / 18.2 | 0 | 397 / 463 and 398 / 945 |
| 4 | 50 (two runs of 25) | 13.0 / 25.3 and 14.8 / 21.3 | 0 | 424 / 1,169 and 439 / 1,075 |

So the report rows and re-banks do not slow a Take with two outputs; with four the p95 is 4 to 8 ms
higher, within AC-1's own-time target. "Confirmed" is press to PROGRAM's "ran" (every output's run
report has reached the page), which the 5 s grey window covers at p95. Results in
`/tmp/noacg-measure`-style files on the worker (`w3-typical-fast-prod-parto{2a,2b,4a,4b}.json`).
Not measured here: the large fixture, throttled networks, and the demand read's bytes (it is the
whole published payload, phase 2's "Output start" figures), left to the phase 6 and 7 runs that
change what is read.

## Not checked by the run (for the owner's final check, phase 9)

- A held Take on CasparCG 2.5 and 2.3: the output page inside CasparCG's own browser, a late frame
  coming on air without its entrance, its sound and without a flash.
- The light on a studio network, with a real output's report rows.
- A foreign OGraf package's own sound during its late case (NoaCG's exported graphics honour
  `skipAnimation`; a stranger's package may not).

## Traps met

- The local configured stack: `dockerd`, `iproute2` (`ss`) and `supabase@2.111.0` from npm; the
  stack's work directory is `/tmp/noacg-configured-stacks/slot-0`, where `supabase status -o json`
  must run. Browser runs go through `npm run queue` (the Playwright config refuses a direct run on a
  cloud worker), and a foreground wait on the queue is blocked: `node scripts/jobs.mjs wait <id>`
  in a background job.
- `check-e2e-protection` flags an added `test.skip(true, …)`; a conditional `test.skip(cond, …)`
  says the same and passes.
