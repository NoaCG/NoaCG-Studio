# A full e2e run rewrites tracked research pictures

**Filed:** 2026-09-28. **Source:** measurement, two full local runs on branch
`claude/clip-playback-phase-3-f625c8`.

## Why

A test run should leave the checkout as it found it. Three editor specs write their evidence
straight into tracked files under `docs/research/`, so every full local run ends with about fifteen
modified files that have nothing to do with the branch under test. A session that commits with
`git add -A`, or stages "what the suite changed", ships another project's pictures in its own
commit, and a session that notices has to restore them by hand before `/check` will stamp (twice
on 2026-09-28 alone).

## What it would take

The writers are `e2e/editor-keys.spec.ts` (editor-r1-1b `keys-*.png`), `e2e/editor-out.spec.ts`
(editor-r1-1c `choice-*`, `out-*`, `wizard-*.png`) and `e2e/editor-fidelity-trim.spec.ts`
(editor-r1-1d `built/*.png`, `built/trim-feedback.json`; its `baseline/` files are written only
when missing, so they are not the problem). Either send the captures to a gitignored folder and keep
the committed pictures as a deliberate snapshot, or write them only when asked (an env var such as
`RECORD_RESEARCH=1`). Read what links to those pictures first, to keep whatever they are evidence
for. Acceptance: on a clean checkout, running the three specs passes and leaves `git status`
empty.

## Evidence

After `npm run test:e2e:affected` escalated to the full suite (1078 passed), `git status --short`
listed `docs/research/editor-r1-1b/built/keys-{1093,1366,1920}.png`,
`editor-r1-1c/built/{choice,out}-{1093,1366,1920}.png`, `wizard-{manual,reverse}.png`, and
`editor-r1-1d/built/{child-animation,nested-1093,nested-1366}.png` and `trim-feedback.json` as
modified. An earlier run on the same day rewrote the editor-r1-1d files the same way.
