# PR #2573 account-switch recovery handoff

Windows job `j-5318` reproduced the account-switch race on product commit `ed5c59b7d577514097ff0e68c46c1bb208e1f37b`. Playwright exited 1. The account switch completed and the old signed-out library held `Owed at switch` where the test expected `Alpha`.

- [ed5c59b7-account-switch-probe.txt](ed5c59b7-account-switch-probe.txt) contains the diagnostic test appended to `e2e/rundown-history.spec.ts` for this job.
- [windows-j-5318.log](windows-j-5318.log) contains the Windows queue output, Playwright assertion and exit result.
- [windows-j-5318-trace.zip](windows-j-5318-trace.zip) is the Playwright trace. It contains 998,878 bytes. SHA-256 is `a367ffc9fafd9ca3b889ef452ef65aa7a54fa404c878af2805664545760d13ac`.

## Reproduce through the Windows queue

In an isolated checkout containing the product commit, append the fixture if the named test is absent.

```powershell
$evidence = 'docs/work-specs/live-publishing/evidence/fix-2572-handoff'
Add-Content -LiteralPath e2e/rundown-history.spec.ts -Value (Get-Content -Raw -LiteralPath "$evidence/ed5c59b7-account-switch-probe.txt")
node scripts/jobs.mjs add 'npm run test:e2e -- e2e/rundown-history.spec.ts --grep=tracked.recovery.preserves.the.old.library --trace retain-on-failure --workers 1' --cap 5
```

The shared queue runs this command.

```powershell
npm run test:e2e -- e2e/rundown-history.spec.ts --grep=tracked.recovery.preserves.the.old.library --trace retain-on-failure --workers 1
```

Open the captured trace with `npx playwright show-trace docs/work-specs/live-publishing/evidence/fix-2572-handoff/windows-j-5318-trace.zip`.

## Account-switch sequence

1. Seed the signed-out library with a production whose cue is named `Alpha`, then return to Home. Record a tracked, retired owed edit in local storage that would rename the cue to `Owed at switch`. Its original baseline is `Alpha`, and the fixture gives it no prior commit receipt.
2. Open the production. Recovery starts a read-write IndexedDB transaction. The test intercepts the first read of `spx-gfx-shows` and calls the real `bindLibraryToAccount` on that request's success event, before the recovery decision reads both the saved cue and its receipt.
3. The account switch requests a general authoring flush and waits for pending durable writes before reloading. At the reproduced head the old library remains loaded during that wait, so the recovery transaction applies the owed edit to the old library.
4. After reload, check that the new fixture account is selected, read the old signed-out record directly from IndexedDB, and inspect the old owed edit. The expected old label is `Alpha` and the owed label remains `Owed at switch`. The run reached the old-label check and failed because IndexedDB held `Owed at switch`.

Use an account-switch-specific signal to revoke waiting recovery when the switch starts. Ordinary sync flushes should continue to work. Request Windows verification by posting the exact candidate SHA on [PR #2573](https://github.com/NoaCG/NoaCG-Studio/pull/2573).
