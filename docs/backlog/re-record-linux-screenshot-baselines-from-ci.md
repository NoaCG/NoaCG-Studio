# Re-record the Linux screenshot baselines with one CI job, not a failed run

**Filed:** 2026-09-27. **Source:** the pre-merge review of the clip playback plan's phase 0.

## Why

`e2e/playout-baseline.spec.ts` is the repository's first screenshot spec, and its Linux pictures
can only come from CI. Today that means pushing, letting an E2E shard fail on the old picture,
downloading the shard's `test-results` artifact and renaming every `*-actual.png` by hand - a red
CI round trip for every deliberate change to the production page's look. Phase 1 of
`docs/CLIP_PLAYBACK_PLAN.md` (the resizable rundown and one-line rows) changes that look on
purpose straight away, and phases 2 to 4 do again.

## What it would take

A `workflow_dispatch` workflow taking a branch (and a spec, defaulting to the baselines) that sets
up exactly as `ci.yml`'s E2E shards do (`./.github/actions/node-modules`,
`./.github/actions/playwright-chromium`), runs the spec offline with `--update-snapshots`, and
uploads the `*-linux.png` files under their final names. New workflows are gated
(`scripts/check-workflows.mjs`, `docs/VERIFICATION.md`), so read those first. Then replace the
procedure at the head of the spec with the one command.

## Evidence

Phase 0 needed it twice in one session: CI runs 36322859093 and 36325195220 existed only to fail
on missing or changed pictures so their actuals could be copied back.
