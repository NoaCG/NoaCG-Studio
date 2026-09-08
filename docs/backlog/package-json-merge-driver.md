# `package.json` is the most hand-merged file in the repo, over one added script line at a time

**Filed:** 2026-09-08. **Source:** weekly quality review (measurement).

## Why

`node scripts/metrics/conflict-trace.mjs` over the last 45 days: 642 merge commits, 66 of them
carrying a resolution, and **`package.json` is the single most-resolved file at 16** - nearly a
quarter of every conflict a person has had to settle. The next four are `AGENTS.md` (4),
`docs/GOALS.md` (4), `scripts/e2e-affected.mjs` (4) and `docs/AI_LITE_BENCHMARK.md` (3).

Sampling those sixteen merges shows what they are: a branch adds one line to `"scripts"`, main adds
a different line to `"scripts"`, and git cannot place two insertions in the same region of a
164-entry block. Most resolutions in the sample carry one or two added lines. There is no judgement
in any of them - the correct answer is always both lines - and yet each one stops a landing until a
session reads a conflict, decides nothing, and writes both.

Merge latency is the stated bottleneck, so a conflict class with no decision content in it is the
cheapest latency there is to delete.

**The repo has already solved this shape once, on the second-place file.** `.gitattributes` gives
every compiled contract `merge=noacg-contracts` (`scripts/contracts-merge-driver.mjs`), because
merging the text of a generated file is meaningless when the right answer is the rendering of the
merged store. `package.json` is the same argument in a different key: merging two JSON objects
line-by-line is meaningless when the right answer is the union of their keys.

## What it would take

A session.

A `merge=noacg-package` driver registered the way `noacg-contracts` already is: parse ours, theirs
and the base as JSON, and take the union where a key exists on only one side. **Conflict properly on
a key both sides changed to different values** - a version bump, a dependency range, a rewritten
script body - because that one does need a person, and a driver that silently picked a side would be
worse than the conflict it removed. Key order has to come out deterministically or the file churns
on every landing; npm's own writer sorts predictably enough to copy.

Register it in the same place and the same way as the contracts driver, so there is one story for
"this file is merged by a program" rather than two.

**What could break:** a bad union silently resolves a real disagreement about a dependency version,
which is the one outcome worse than today. Proof it did not: the driver conflicts, loudly, on every
key present on both sides with different values, with a `node --test` file that feeds it the sixteen
real resolutions from the window above and checks it reproduces each committed result - the history
is right there and makes a free regression corpus.

**Considered and rejected:** splitting `"scripts"` into a separate file. npm has no include
mechanism, so it means a generator and a check, which is more machinery than the conflict costs.

## Evidence

- `node scripts/metrics/conflict-trace.mjs`, 2026-09-08: 642 merges / 66 resolutions in 45 days;
  `package.json` 16, `AGENTS.md` 4, `docs/GOALS.md` 4.
- `git log --since="45 days ago" --merges -- package.json`, sampled: most resolutions add one or two
  script lines.
- `package.json`: 164 scripts, 36 dependencies across both blocks.
- `.gitattributes`, the `merge=noacg-contracts` block - the precedent, and the reasoning to reuse.

## Trend

- 2026-09-08: 16 of 66 resolutions in 45 days (24%), 164 scripts.
