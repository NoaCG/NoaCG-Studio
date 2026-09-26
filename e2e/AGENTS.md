# e2e - the Playwright suite

The suite's plan, sharding, queue rules and procedure are in **docs/VERIFICATION.md**.
The traps of RUNNING it (quarantine, a suite that skips itself exits 0, cloud containers, benches,
sweeps) are in its "Running the suite: traps".

## Gotchas when writing a spec

- **Offline mode and a reused server.** The suite pins offline mode via `webServer.env`, but
  `reuseExistingServer: true` adopts a dev server already running on THIS checkout's port, with
  the real `.env`. Kill that server first. Other worktrees' servers are harmless.
- **Stale modules.** After many edits the dev server can serve a stale module (HMR lag). If state
  reads disagree with the visible UI, restart it and reload before trusting them.
- **Inside `page.evaluate`, an `import('/src/…')` MUST carry the `.ts` extension.** Vite gives the
  extensionless URL its own module registry, so it can resolve a second instance (a "ghost store")
  that nobody drove. The symptom is a plausible empty answer, not an error.
- **Headless limits.** Monaco is not fully interactive headless, and GSAP does not visibly tick
  (rAF). Assert on DOM or state there.
- **Never clear localStorage via `addInitScript`.** It also runs in the same-origin srcdoc preview
  iframe, so every rebuild wipes the key. Fresh browser contexts already isolate storage.
- **Wait for the preview rebuild, never sleep.** The preview rebuilds on a debounce after
  `applyTemplate`, and the suite pins a shorter one than authoring (`VITE_PREVIEW_DEBOUNCE_MS` in
  `playwright.config.ts`), so a hard-coded sleep is wrong at one of them. Use `awaitPreviewRebuild`
  (`e2e/_preview.ts`) before clicking Play or asserting inside the iframe.
- **A spec that saves off the UI and then reloads must WAIT for the disk.** A durable write is
  accepted at once and lands a moment later (`src/model/durableStore.ts`), so a `reload` or `goto`
  right after a mutator can lose the last write or two. Call `settleDurableWrites` before tearing
  the page down, and `awaitDurableReady` after a reload whose read is an `evaluate`
  (`e2e/_durable.ts`). A UI assertion needs neither: the shell cannot render before hydration.
- **A seed has the same hazard, and it reads as a product bug.** `page.goto` resolves on `load`,
  which can precede hydration. A seed written then rewrites the whole record (`src/model/AGENTS.md`)
  from a list that is not yet loaded, so it can be gone after the reload. Call `awaitDurableReady`
  BEFORE the seed.
- **A spec that presses Space (or Enter) must first say where FOCUS is.** Clicking a control leaves
  it focused, and Space belongs to a focused button by design (`src/components/spaceKey.ts`). Call
  `parkFocusOffControls` (`e2e/_keys.ts`) first.
- **A route installed to watch a RELOAD also catches the page it is replacing.** The old document
  keeps its timers until the navigation commits, so a poller's request can look, by URL, like the
  new boot request. Waiting before the reload does not help. Mark the boundary with something the
  NEW document does first (the relay receiver pings once at the top of a fresh document), record
  only what follows it, and leave a poll interval of slack before the reload so the separation is
  exercised.
- **A wizard-created VIDEO project runs its first generation by itself.** It lands as its own
  undoable snapshot at no fixed time after `video-shell` appears. Before an undoable change, wait
  for `.ai-msg.assistant` (the local `waitForGeneration` in `e2e/video-project.spec.ts`), never a
  fixed timeout.
- **Read the VIDEO preview only after `awaitVideoPreview` (`e2e/_video.ts`).** A load there ends in
  autoplay, so a reading taken while one is owed is about to be undone. `.ai-msg.assistant` means
  applied, not reloaded, so both waits are needed. A reload, `setSource`, asset add or image-input
  change owes a load (`data-player-pending` / `data-player-rev`); a live scalar edit (set-props /
  set-vars) does not. Once settled the player is PLAYING: assert that, never
  `if (await pause.isVisible())`. Reload with `reloadVideoShell`, not a bare `page.reload()`: the
  boot picks the shell from a durable slot (`src/model/docKind.ts`), so a bare reload can land in
  the SPX shell.
- **A guard fix needs the assertion written backwards, then mutation-tested.** When two handlers
  fire and only one should, assert that the stood-down handler stayed quiet. Then break the guard
  on purpose: if the spec stays green, it is vacuous. For a HELD key use real auto-repeat
  (`holdKeyRepeats` in `e2e/_keys.ts`): `keyboard.down()` sends one keydown and never repeats.
- **A DETACHED element's computed style is EMPTY, and `Number('')` is 0.** A stale reference then
  reads as a passing zero. A runtime that re-renders its rows (`rebuildCredits` in the credits
  family) invalidates earlier references. Query after the build, and prefer an assertion whose
  passing value is not 0.
- **A DUPLICATE renderer command has to be asserted as ARITHMETIC, never as a picture.** A replayed
  `play` settles on the same picture, so count entrances with `data-plays`
  (`src/components/home/PayloadStage.tsx`). `e2e/configured/hosted-control-recovery.spec.ts` is the
  live half of the hosted control page. Mutation-test both halves when touching either.
- **An assertion on rendered TEXT geometry needs a BOUND, and usually only one side of it is a
  guarantee.** Where text lands depends on the platform's font metrics, and the fit stops once the
  block fits, so the remainder varies. A local pass is no evidence: this machine rasterises one
  platform only. Decide which DIRECTION is the defect and assert that side hard. Where a hinting
  renderer sizes glyphs in whole pixels, ask whether one more pixel of type would fit rather than
  bounding the leftover. Mutation-test the bound. Likewise for values from
  `getComputedTextLength`, a text node's `getBoundingClientRect`, or a font-size the fit chose.
- **A race you cannot reproduce is FAULT-INJECTED, never repeated harder.** A passing
  `--repeat-each` proves nothing, because the window is narrower here than on a loaded runner.
  Find the code path that could produce the exact failure signature, force it with a temporary
  source patch, and check the signature matches to line and column. Revert the patch first, then
  mutation-test the fix by re-injecting it.
- **A gesture a handler can silently DISCARD makes an intermittent spec, and no assertion fixes
  it.** When a drop, click or key is guarded by state that arrives asynchronously
  (`if (!measuredRect) return`), the failure is a missing result, reported far from its cause. Fix
  the handler so it holds the gesture until it can be honoured. Do not write a spec for the window:
  nothing a spec does holds it open. Verify by fault injection and say so in the spec file.
- **An `.or()` settle-wait must name EVERY settled state, the ERROR one included, and then rule it
  out.** A fetching screen settles empty, loaded or failed, so a wait naming only the happy two
  spends its budget and reports "not found". Settle on all three, then assert the error state's
  `count()` is 0 with a message saying what it means (a second `toHaveCount` would wait out its
  timeout on every healthy run). Name every fetch that can raise the error state
  (`ShareWithTeamDialog` sets it from the members fetch too). The count is a snapshot, so a later
  failure reads as 0: accept that miss and say so.
- **A route handler that awaits the `request` fixture must be taken down before the test ends.**
  Playwright disposes `request` on test end, so a proxied call still in flight fails with "Request
  context disposed" after every assertion passed. Close a polling page where its assertions
  finish, and call `await page.unrouteAll({ behavior: 'ignoreErrors' })` before `close()`. A
  handler that only calls `route.fulfill` is not exposed. It shows only where the proxied call is
  slow (the hosted tier), so a local green proves nothing.
