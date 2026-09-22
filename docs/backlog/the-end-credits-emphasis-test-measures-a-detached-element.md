# The end-credits emphasis test can measure an element the preview has already replaced

**Filed:** 2026-09-22. **Source:** a full `npm run test:e2e:affected` run on branch
`claude/t-caspar-load-flash` (job j-1766, 1443 passed, this one failed; the same spec passed on
its own a minute later, job j-1767).

## Why

It is a flake in the merge gate, and a flake costs every branch that trips it a re-run and a
session's worth of doubt about whether it broke the credits designs. The failure also reads as a
product bug - "the name is not bigger than the role" - which is the expensive kind of red.

## What it would take

`e2e/end-credits.spec.ts:194` asserts the `.credits-box` emphasis class (auto-waiting, so it
resolves against the document of that moment) and then makes two more round trips into the preview
iframe to read `getComputedStyle(...).fontSize` off `.credits-role` and `.credits-name`. A rebuild
between those calls leaves the element detached, and a detached element's computed style is empty,
so `parseFloat('')` is `NaN`:

    expect(nameSize).toBeGreaterThan(roleSize)
    Expected: > NaN   Received: 43

Read both sizes in ONE `evaluate` inside the frame and wrap it in `expect.poll`, or call
`awaitPreviewRebuild` (`e2e/_preview.ts`) after the paste, which `e2e/AGENTS.md` already
prescribes for exactly this hazard. Worth checking the sibling reads in the same file for the same
shape. Verify with several queued runs of the spec rather than one.

## Evidence

Job j-1766 on this laptop, 2026-09-22: `e2e/end-credits.spec.ts:194 › the Style step picks which
line of a credit is the loud one`, failing at line 221 with `Expected: > NaN`. Job j-1767, the
same spec alone on the same tree: 10 passed in 25.8 s. Nothing in that branch touches the credits
designs, the wizard or the preview rebuild path.
