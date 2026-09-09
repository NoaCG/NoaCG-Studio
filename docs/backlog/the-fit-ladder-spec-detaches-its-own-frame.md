# The fit-ladder corpus spec intermittently reads a frame that has already detached

**Filed:** 2026-09-09. **Source:** measurement - CI run 34289872217, `E2E 8/9 (subset)`.

## Why

Same sha, opposite verdicts. `E2E 8/9` went red on `fc06fc2b` and green on the re-run of that
exact commit, which is this repo's own definition of a flake. It is not the port-registry race
that `docs/handoffs/2026-09-09-v-port-registry-race.md` closed - that one is fixed and proven -
so it is a second, independent intermittent living in the E2E tier.

It matters for the same reason the first one did: a night branch whose session has finished can
be reddened by it with nobody left to press re-run. Every session that meets it pays for the
diagnosis again, and the cheapest wrong conclusion - "E2E is flaky, re-run it" - is how a real
regression gets waved through later.

## What it would take

The failure is one iteration of one spec:

```
[chromium] e2e/import-svg-corpus.spec.ts:594 corpus: the fit ladder spends its rungs in order,
  on every option and every length  ->  shrink / short
Error: locator.evaluate: Frame was detached
  at readLadder (e2e/import-svg-corpus.spec.ts:535)
```

`readLadder` reaches into the preview iframe with `frame.locator('.imported-design-art').evaluate`.
The spec walks a matrix of options and lengths, and somewhere in that walk the iframe is replaced
between the locator resolving and the evaluate landing - a re-import or a re-render swapping the
frame under the read. The fix is on the spec side: wait for the frame the current iteration owns
rather than the one the previous rung left, or re-resolve the frame inside a retrying assertion so
a swap costs a retry instead of a failure. Small, once somebody has the reproduction; expect the
reproduction to be the work, since 77 of 78 tests in that shard passed against the same server.

## Evidence

- CI run 34289872217 on `fc06fc2b`: `E2E 8/9 (subset)` FAILURE, then SUCCESS on `gh run rerun
  --failed` against the unchanged sha. Every other shard green both times.
- The same shard was green on `fe64ba73`, the commit before, on a tree differing only in
  `scripts/port-registry.mjs` and its test - no product code.
- Failure text and stack above, from the job log.
