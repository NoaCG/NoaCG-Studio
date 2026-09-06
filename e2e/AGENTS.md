# e2e - the Playwright suite

Loaded alongside the root `AGENTS.md` when working in this directory (Claude reads it via this
directory's `CLAUDE.md` import; Codex reads it directly). Keep it accurate. The suite's plan, the
sharding and the queue rules are the root contract's "Verifying changes"; the full procedure is
**docs/VERIFICATION.md**.

Split out of the root `AGENTS.md` on 2026-08-22: these are the traps a SPEC falls into, so they
belong where specs are written rather than in the contract every session loads.

## Gotchas when writing a spec

- The e2e suite pins **offline mode** via `webServer.env`, but `reuseExistingServer: true` means a
  dev server already running on THIS checkout's port (started by hand, with the real `.env`) gets
  reused - backend-sensitive specs then fail confusingly. Kill any manual server on this
  checkout's port first. Other worktrees' servers are harmless.
- The dev server can serve a **stale module** after many edits (HMR lag) - restart it. Worse,
  `import('/src/store/…')` in an eval context can then resolve a **different module instance** than
  the running app (a "ghost store"): if state reads disagree with visible UI, restart and reload
  before trusting the assertion. Monaco also isn't fully interactive headless and GSAP doesn't
  visibly tick (rAF) - assert on DOM/state there.
- In Playwright specs, **never clear localStorage via `addInitScript`** - it also runs in the
  same-origin srcdoc preview iframe, so every rebuild wipes the key (this silently deleted the
  project brand). Fresh browser contexts already isolate storage per test.
- The preview rebuilds on a debounce after `applyTemplate` - 350 ms when authoring, **50 ms under
  the e2e suite** (`VITE_PREVIEW_DEBOUNCE_MS`, pinned in playwright.config.ts). Never sleep out
  either number; a spec that hard-codes one is wrong at the other. Use
  `awaitPreviewRebuild` (`e2e/_preview.ts`) before clicking Play or asserting inside the iframe.
- **A spec that saves off the UI and then reloads must WAIT for the disk.** A durable write is
  accepted synchronously and lands a moment later (durableStore.ts), so a `reload`/`goto` fired
  the instant a mutator returns aborts what has not committed, and the next page is missing the
  last write or two - which one varies. `settleDurableWrites` before tearing the page down;
  `awaitDurableReady` after a reload whose read is an `evaluate` (`e2e/_durable.ts`). A UI
  assertion needs neither: the shell cannot render before hydration resolves.
  **The WRITE has the same hazard, and it is the half that reads as a product bug.** `page.goto`
  resolves on `load`, which can precede hydration, so a SEED written there is a
  read-modify-WHOLE-RECORD write (model/AGENTS.md) against a list that is not yet the list - and
  the record can be gone after the reload. Measured 2026-09-06 seeding a brand: the reloaded page
  read `loadLooks()` as `[]` in 2 of 5 tests on one run and 0 of 5 on the next, and the wizard
  then honestly showed no chooser, which looks exactly like the feature being broken.
  `awaitDurableReady` BEFORE the seed is the fix.
- **A spec that presses Space (or Enter) must first say where FOCUS is.** Clicking a control leaves
  it focused, and Space belongs to a focused button by design (spaceKey.ts) - so the press lands on
  that button, not on the surface under test. Call `parkFocusOffControls` (`e2e/_keys.ts`) rather
  than inheriting whatever the bootstrap left behind.
- **A route installed to watch a RELOAD also catches the page it is replacing.** The document
  still on screen keeps its timers until the navigation commits, so a poller (the relay receiver
  polls every 400 ms) fires straight into the recorder and its request is indistinguishable, by
  URL, from the boot request under test. `local-relay.spec.ts` recorded a live cursor of 7 as the
  boot read of 4 that way - green on this laptop, red on CI, green again on a re-run of the same
  commit. Waiting before the reload does not help; the window narrows and never closes. Separate
  the two by something the NEW document does first (the receiver pings once, at the top of a fresh
  document, before it reads the log) and record only what follows it - then leave a poll interval
  of slack before the reload so the separation is exercised rather than merely written.
- A wizard-created VIDEO project auto-runs its first generation, which lands as its own undoable
  snapshot ~0.1-2.6 s after `video-shell` appears (unbounded: the validation probe waits on the
  player host with no timeout). A spec that makes an undoable change before that lands is racing
  it. Wait for the assistant reply first (`waitForGeneration`, `.ai-msg.assistant`), never a fixed
  timeout.
- **The VIDEO preview needs `awaitVideoPreview` (`e2e/_video.ts`) before anything is read off
  the stage or the transport.** A composition load there ends in `autoplay`, so a reading taken
  while one is owed is not merely early - it is about to be undone, and the state it reports is
  the one the player is leaving. `scrubbing seeks the composition deterministically` failed that
  way about one run in three: it read the transport as paused, which was TRUE, skipped its
  conditional pause click, and the reload the assistant reply had just triggered autoplayed
  before the next line - so it waited out its budget for a Play button the player would never
  show again. Two waits are needed and the first does not imply the second: `.ai-msg.assistant`
  says the result was APPLIED, and the debounced reload that mounts it has not started yet.
  VideoPlayerFrame stamps `data-player-pending`/`data-player-rev` for this, the same two-halves
  contract as PreviewFrame's `data-doc-pending`/`data-doc-rev`. A reload, a `setSource`, an
  asset add and an image-input change all owe one; a live scalar field edit (set-props /
  set-vars) does not. And once it has settled, the player is PLAYING - assert that, never a
  conditional `if (await pause.isVisible())`, which can only ever mean "whatever it happened to
  be doing when I looked". `reloadVideoShell` is the other half: the boot picks the video shell
  by reading a DURABLE slot (model/docKind.ts), so a bare `page.reload()` can abort the write it
  is about to look for and land in the SPX shell with no `video-shell` at all.
- **Inside `page.evaluate`, an `import('/src/…')` MUST carry the `.ts` extension.** Vite serves
  both URLs and gives each its own module registry, so the extensionless form sometimes resolves a
  SECOND instance - `useTemplateStore.getState()` then answers from a store nobody drove. The
  symptom is not an error but a plausible empty answer: `template.assets` came back `[]` for a
  graphic whose artwork was visible in the failure screenshot. Both forms often work, so the same
  spec file can have one passing extensionless evaluate and one failing one.
- **A guard fix needs the assertion written backwards, then mutation-tested.** When two handlers
  both fire and only one should, asserting that the right thing happened proves nothing - the bug
  IS the extra thing happening alongside it. Assert that the stood-down handler stayed quiet, then
  break the guard on purpose and watch the spec go red. If it still passes, the spec is vacuous.
  A pre-existing pan spec passed for MONTHS while Space-pan-also-plays was live, because a play
  tween touches none of what it asserted. For a HELD key use real auto-repeat
  (`e2e/_keys.ts holdKeyRepeats`, CDP `autoRepeat: true`); `keyboard.down()` sends one keydown and
  never repeats, so it cannot exercise the gesture at all.
- **A DUPLICATE renderer command has to be asserted as ARITHMETIC, never as a picture.** A
  replayed `play` settles on the picture that was already there, so asserting on the rendered
  frame passes the bug under mutation testing while `data-plays` (the entrance count
  `home/PayloadStage` publishes) reads `Expected "1" Received "2"`.
  `e2e/configured/hosted-control-recovery.spec.ts` is the live half of the hosted control page: a
  capability URL resolves signed-out, a first take reaches the durable log and comes back round
  the follower, the layer is still on air with the monitor holding it, and the PROGRAM monitor has
  played exactly ONE entrance - the gate on the boot replay re-firing when a returning cue row
  moved `liveCue`. Mutation-test both halves when touching either.
- **An assertion on rendered TEXT geometry needs a BOUND, and usually only one side of it is a
  guarantee.** `import-svg.spec.ts` pinned the gap left at a grown banner's end to the inset the
  designer drew, within half a pixel. It measured 50 on this laptop and 51 on CI's Linux fonts and
  took a shard red with nothing wrong: the assertion was tighter than the thing it asserted. Half
  that geometry genuinely IS exact and font-free - the panel edge is a computed cap - but where
  the TEXT lands inside it belongs to the fit's size search, which stops as soon as the block fits
  its budget rather than landing on it, so the last step leaves a remainder that depends on the
  face's own metrics. **A local pass is no evidence here**, because this machine only ever
  rasterises one of the two platforms. So: bound it, decide which DIRECTION is the defect (here a
  gap SMALLER than the inset is text eating its own margin, while larger is only unspent slack,
  so only the small side is asserted hard), and mutation-test the bound - otherwise it is a number
  that happened to hold rather than a test. The same caution applies to any expected value derived
  from `getComputedTextLength`, a text node's `getBoundingClientRect`, or a font-size the fit
  chose.
- **A race you cannot reproduce is FAULT-INJECTED, never repeated harder.** `--repeat-each=20`
  proves nothing when it passes: the window is narrower on this laptop than on a loaded runner,
  so the honest report is "not reproduced in 20 runs" and the next move is to widen the window on
  purpose. Find the code path that could produce the EXACT failure signature, force its condition
  with a temporary source patch, and check the signature matches down to the line and column.
  `import-svg.spec.ts:1207` red-mained main for ~7h (issue #40) and then went green with no fix;
  20 repeats could not reproduce it, and one run with the preview's rect delivery delayed by 4s
  reproduced it exactly - `toContainText` failing at `1207:51`, the same assertion, after the
  marquee assertion above it had passed. That is a measurement; a green repeat-each is not.
  Revert the patch before doing anything else, and mutation-test the fix by re-injecting it.
- **A gesture a handler can silently DISCARD makes an intermittent spec, and no assertion fixes
  it.** When a drop, click or key is guarded by state that arrives asynchronously
  (`if (!measuredRect) return`), the failure is a missing result rather than an error: every
  assertion above it passes and the spec fails somewhere that describes the symptom, never the
  cause. **Fix the handler, not the spec** - hold the gesture until it can be honoured. And do
  not then try to write a spec for the window: it opens and closes on the document's own
  schedule, nothing a spec can do holds it open, and the drag itself outlives it, so the mouseup
  under test lands after the window has closed. One was attempted for
  `wz-preview-draw`/`data-measured` and reverted - `toHaveAttribute` sampled it 18 times across
  7s on CI without once catching the state it existed to catch, which is a coin flip that reads
  like a guard. Verify that class of path by FAULT INJECTION, and say so in the spec file where
  the missing test would otherwise look like an oversight.
- **An `.or()` settle-wait must name EVERY settled state, the ERROR one included, and then rule
  it out.** A screen that fetches settles into three shapes rather than two - the empty answer,
  the loaded answer, and the failed fetch - so a wait naming only the two happy ones spends its
  whole budget and then reports "element(s) not found" about a screen that is fully drawn.
  `configured/teams.spec.ts` did that on 2026-09-02: the `teams` table was missing (PGRST205),
  `ShareWithTeamDialog` rendered `teams-load-error`, and finding the real cause needed a trace
  download. Measured on the same page, 20009 ms and the wrong cause before, 29 ms and the state's
  own name after. Settle on all three, then read the error state's `count()` and assert it is 0
  with a message saying what its presence means: the plain count fails at once, where a second
  `toHaveCount` would wait out its own timeout on every healthy run. Two things to get right in
  the message. Name EVERY fetch that can raise the error state, not the one you were thinking of -
  `ShareWithTeamDialog` sets `loadError` from the members fetch as well, so a message blaming the
  `teams` table alone sends the reader to the wrong table. And a count is a SNAPSHOT of whatever
  settled: a second, independent fetch failing later reads as 0. That direction is a miss rather
  than a false red, so it is the one to accept - say so where you take it.

## Traps when RUNNING the suite

- **A suite that skips itself exits 0.** `npm run test:e2e:live` with `E2E_EMAIL`/`E2E_PASSWORD`
  unset prints `32 skipped` and exits 0, so any job checking only the exit code is permanently,
  silently green. Worse, the JSON report's `.specs[].ok` is **true for a skipped spec**, so a
  summary built on `.ok` reports all 32 as passed on a run where none executed. Read
  `.specs[].tests[].results[].status`, and make an env-gated job a verdict by asserting on
  `.stats`: `skipped == 0` and `expected + unexpected + flaky >= <declared count>`.
- **A wholesale local red can be green on CI, with no code fault.** 42 failed / 7 passed across
  the AI specs locally while the same commit passed CI's full 8-shard run - the checkout, not the
  code. Before attributing a big local red to your change, `git stash push src scripts` and re-run
  the SAME spec files; equal failure counts mean pre-existing. The pre-merge gate belongs to CI on
  a clean checkout anyway.
- **A worktree with no `npm install` deadlocks against itself.** A linked worktree lives inside
  the primary checkout, so Node's upward `node_modules` walk reaches the PARENT's - Playwright
  resolves from there, `e2e-runs.mjs` records the queue ticket under the parent's root, and the
  run's own globalSetup then waits for itself. The message reads exactly like normal contention.
  Tells: the queue names a root you are not in, the blocking pid's command line points at the
  parent's `node_modules\.bin` and chains back to your own shell, and CPU is near zero for the
  whole wait. Fix: `npm install` here, kill the stuck pid, and kill the orphaned Vite it left on
  this checkout's port (Playwright starts `webServer` BEFORE globalSetup, so the server survives).
  The same missing install makes `npm run build` fail on `check-workflows` with
  `Cannot find module '@action-validator/cli/cli.mjs'` - usually the first sign.
- **Do not edit `src/` while a bench, spike or sweep is in flight.** Those runners drive the dev
  server, so a save triggers a Vite full reload and the measured page navigates out from under
  them: `page.evaluate: Execution context was destroyed`. One run died on item 9 of 11 and the
  ledger is written at the END, so everything already measured was lost with screenshots still on
  disk. Docs, memory and scratchpad files are safe - they are not in the module graph.
- **Stopping a background bench does not stop the bench.** Killing the shell leaves the npm/node
  descendants reparented and alive - one measured 198 minutes later with 2.4 s of CPU, wedged,
  holding a headless browser. It keeps the one paid concurrency slot (later cells fail
  `already_running` at $0.0000, which looks like a free wholesale failure) and `e2e-runs.mjs`
  cannot see it. After stopping any bench or eval, check `Get-CimInstance Win32_Process -Filter
  "Name='node.exe'"` for a surviving runner and stop the whole chain. Tell an orphan by CPU:
  seconds of CPU over hours of wall clock.
- **`l3-sweep <category>` writes its screenshots into `./<category>/` in the CWD** - untracked and
  invisible until a `git add -A` sweeps ~90 PNGs into the commit. Delete the directory, or pass an
  out-dir outside the repo, before committing.
- **`pro-spike --control` does not start a dev server.** Start one for the checkout you are
  measuring with **`npm run dev:worktree`**, which serves the tree it ships in on that checkout's
  reserved port and refuses if the port is busy. The byte-comparison dance this entry used to
  prescribe - serve from another worktree, prove both trees are identical, run with
  `DEV_PORT=<the other port>` - is no longer needed, and `preview_start` is no longer the answer
  in a worktree: it serves whatever checkout the harness process sits in and reports a port from
  somewhere else again (measured 2026-09-01, docs/DEV_PORTS.md "Starting a dev server"). If you
  ever do drive a server you did not start, trust Vite's own banner in `preview_logs` over any
  reported port, and remember that a measurement against someone else's source is not a
  measurement.
- **A dev server on this checkout's port blocks this checkout's e2e runs** until it is stopped -
  the guard's port check refuses them, on purpose, because Playwright would otherwise adopt that
  server along with its env instead of starting one with the offline-pinned vars. So a sweep
  session and a suite session in the same worktree are mutually exclusive; stop the server before
  running specs.
