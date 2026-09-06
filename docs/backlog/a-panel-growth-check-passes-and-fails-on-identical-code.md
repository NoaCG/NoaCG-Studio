# A panel-growth assertion in import-svg passes and fails on byte-identical code

**Filed:** 2026-09-06. **Source:** measurement, while verifying an unrelated branch.

## Why

`e2e/import-svg.spec.ts:3313` ("svg import: the too-long mode answers the same however the reader
got there") is bimodal on CI. It is not slow, not racy in the usual way, and not fixed by a retry:
it fails **deterministically inside a run** and passes in the next one, on the same commit's code.
That makes it the worst kind of red, because every property a reader uses to dismiss a flake is
absent - it looks exactly like a real regression in whatever branch happened to meet it.

The measurement, 2026-09-06:

| | run | verdict |
|---|---|---|
| `main` at `31ffe42f` | [34026859619](https://github.com/miwco/NoaCG-Studio/actions/runs/34026859619), full, 9 shards | **passed** |
| `claude/relay-cold-boot-hosted-teardown` at `ea8f5274` | [34027483173](https://github.com/miwco/NoaCG-Studio/actions/runs/34027483173), full, 9 shards | **failed**, 1 failed / 195 passed in shard 4 |
| the same run, same sha, `--failed` re-run of shard 4 alone | 34027483173 (re-run) | **passed** |

Twenty-nine minutes apart, and the third row is the same job on the same commit half an hour after
the second - which is the whole finding in one line. The branch's only commits change
`e2e/configured/relay-cold-boot.spec.ts` and `e2e/AGENTS.md`, and `git diff 296df0ef origin/main
-- src/ e2e/import-svg.spec.ts` is **empty**: the two runs executed the same product code and the
same spec, byte for byte. Playwright recorded it as `1 failed`, not `1 flaky`, so it also failed
its retry within the losing run.

It has already cost a red `main` once. The test's own comment records the previous occurrence on
2026-09-05, and the numbers this time are identical to the ones written there:

```
Expected: > 1246
Received:   1238
```

`fixed.w` is 1238 and `wide.w` is 1238. The panel did not grow **at all** under `grow-x` - this is
not the assertion being a few pixels too tight, which is what the `ROTATION_SLACK` of 8 was added
for. The fix applied on 2026-09-05 (ask for width with `'W'.repeat(140)`, one unbreakable token, so
wrapping cannot absorb the growth) is on `main` as `9a907209` and the failure reproduces past it
with the same numbers. **So that fix did not address the cause**, and the comment above the
assertion currently tells the next reader that it did.

## What it would take

Find out what makes the panel not grow, rather than widening the slack again. Two candidates, in
the order worth testing:

1. **A font that had not loaded when the measurement was taken.** Both rungs measuring 1238 is what
   a fallback face gives if `apply()` reads geometry before the real face lands - it would explain
   bimodality across runs and determinism within one, since the face is either warm in that
   runner's cache or it is not. Test by asserting `document.fonts.ready` (or that the drawn text's
   measured width matches the real face) before the first `apply()`.
2. **A clamp the grown panel is hitting.** If some max width lands on 1238 for this board, both
   rungs would saturate there and the difference would be exactly zero, which is what was measured.
   Test by reading the panel's computed max-width alongside the two numbers.

Whatever the cause, the assertion should fail with the two widths and the resolved font in its
message, so the next occurrence diagnoses itself instead of costing an afternoon. And the comment
claiming the 2026-09-05 fix settled it needs correcting either way.

## Evidence

- Failing shard: run [34027483173](https://github.com/miwco/NoaCG-Studio/actions/runs/34027483173),
  `E2E 4/9 (full)`, `e2e/import-svg.spec.ts:3404`.
- Passing run on the same code: [34026859619](https://github.com/miwco/NoaCG-Studio/actions/runs/34026859619).
- The previous red main and the fix that was believed to settle it: `9a907209`, and the comment
  block above `e2e/import-svg.spec.ts:3404`.
- `docs/CI_STABILITY.md` is the standing argument for why a red that nobody can attribute is more
  expensive than the defect behind it.
