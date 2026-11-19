# fix-2536: wait for the Prepare step's baked-text scan before answering it

Owner-requested scoped fix during the cicd-followup run (#1967). Issue #2536 and its comment.

## The defect

On arrival the Prepare step shows the "Baked-in text?" question and starts an asynchronous scan
(`proposeEraseRect`). The scan ends in exactly one of two states (`src/assets/eraseRegion.ts`
returns a proposal or a refusal, never neither):

- a **proposal**: `erase-proposal` is drawn and the question is removed (`marking` becomes true);
- a **refusal**: `erase-scan-refusal` is named under the question, which stays.

Both specs decided from a snapshot taken while the scan could still run:

- `e2e/import-canvas.spec.ts` `eraseRect`: `if (await ask.count()) await ask.click()`;
- `e2e/import-prepare.spec.ts:351-355`: `expect(dismiss.or(bakedYes)).toBeVisible()` settles at once
  on the question, then `count()` of the proposal can be 0 and `bakedYes.click()` waits on a button
  the scan removes.

The question alone is not a settled state: it is on screen both before the scan ends and after a
refusal. So the specs now settle on the proposal or the refusal, rule out the refusal that means
the artwork could not be read ("could not be read/measured"), then take one branch. Both buttons
they click are stable once the scan has ended. `import-canvas` drops its `// runs on: dev server`
header and runs on the e2e build again. No `// covers:` line changed.

## Miss audit: run 43581128114 (culprit 44afe7c0a)

That failure is this race. Job "E2E 3/15 (full)", `import-prepare.spec.ts:335`:

```
Error: locator.click: Test timeout of 60000ms exceeded.
  - waiting for getByTestId('baked-yes')
    - locator resolved to <button class="primary" data-testid="baked-yes">Yes, mark it</button>
  - element was detached from the DOM, retrying
> 355 |   else await bakedYes.click();
```

## Fault injection (2026-11-19, local, not committed)

Injection: `proposeEraseRect` computes its result, then holds it until the next `pointermove` (or
1.5 s), and `PrepareDesignStep` applies the result inside `flushSync`. The scan therefore ends at
the moment a click's pointer reaches the page, the window the CI runs hit by chance.

| Code | Tests | Result |
| --- | --- | --- |
| old specs (origin/main c003897) | REAL typeset text, mixed-background mark | 2 failed: `locator.click` timeout, "element was detached from the DOM, retrying" (the CI message) |
| fixed specs | all of import-canvas and import-prepare | 17 passed |

A first injection without `flushSync` let the click land before React rendered, and the old specs
passed; it was discarded as not reproducing the window.

## Verification

- Fixed specs, no injection, dev server: `--repeat-each=3`, 51 passed.
- `npm run check:e2e-dev-server`: ok (28 dev-server specs; import-canvas no longer among them).
- `node scripts/check-e2e-protection.mjs --changed origin/main`: OK, test counts unchanged (7, 10).
- On the build: CI. A cloud worker may not build (`jobs.mjs`: no build risk in this diff).
- `e2e/import-prepare.spec.ts` stays quarantined; it leaves only through its 20 passes.
