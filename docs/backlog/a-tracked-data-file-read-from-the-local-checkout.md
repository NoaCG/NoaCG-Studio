# A script answers a question about the repository by reading a tracked file out of its own checkout

**Filed:** 2026-09-09. **Source:** measurement, while pointing the daily tooling routine at the
capability report.

## Why

This repo has met one defect in three shapes now, and only two of them are gated.

1. **A ref.** A script asked "has this landed?" of the local `main` branch, which nothing moves any
   more. Five scripts were fixed one at a time, `scripts/main-ref.mjs` became the one answer, and
   `scripts/check-landed-ref.mjs` now refuses the shape in `scripts/**` and `cli/**`.
2. **A directory.** `alignmentState()` in `scripts/alignment-answers.mjs` reads `docs/handoffs/`
   under `REPO_ROOT`, so the refusal built to replace somebody remembering returns
   `{ source: null, pending: [] }` from every worktree but one
   (`docs/backlog/the-weekly-recap-reaches-no-wave-and-nothing-notices.md`).
3. **A tracked data file, which nothing gates.** `scripts/harness-usage.mjs` read
   `scripts/harness-capabilities.json` from `REPO_ROOT` and reported how many capability
   observations the installed builds no longer back. Measured on 2026-09-09 within one minute:

       this worktree, on the day's landed commit      0 unverified, 12 backed
       the orchestrator worktree, 8 commits behind    11 UNVERIFIED, 0 backed

   Same machine, same installed CLIs, same script. The second number is a false alarm produced
   entirely by which checkout the command ran in, and the daily tooling routine was about to be
   pointed at it - which would have raised that alarm every morning until somebody happened to
   check out that worktree.

**`check-landed-ref.mjs` cannot catch this one, and that is the point.** It looks for the literal
`main` handed to git as a REVISION. Shape 3 never mentions `main`, never runs git at all, and reads
the file through the filesystem, so it walks straight past the gate built for its own family.

`--landed` was added to `harness-usage.mjs` for the one caller that needed it now. That is a fix for
one script, not for the class.

## What it would take

The general question is: **which tracked files answer something about the REPOSITORY rather than
about this branch, and are any others read from `REPO_ROOT`?** A first sweep is
`grep -rn "REPO_ROOT" scripts/ cli/` against the list of tracked data files, and the judgement for
each hit is which of the two questions it is asking. A file a branch legitimately edits (a fixture,
a contract the branch is changing) SHOULD be read from the tree; one that reports on the repository
should not.

If the sweep finds more than one or two, the shape worth building is the same one `main-ref.mjs`
took: a single helper that reads a tracked path at the landed ref with a documented fallback, plus
an extension to `check-landed-ref.mjs` that refuses a `REPO_ROOT` join against a name on a small
list of repository-answering files. A gate that names its files is worth more here than a clever
one, because the wrong answer is silent in both directions.

Worth doing at the same time: decide whether `harness-usage.mjs` should default to `--landed`
instead of opting into it. The argument for is that almost every caller asks the repository
question; the argument against is that a session editing `harness-capabilities.json` wants to see
its own edit, and a flag that must be remembered is exactly how shape 1 happened.

## Evidence

- `scripts/harness-usage.mjs` - `landedCapabilitiesText`, and the comment above it carrying the
  0-versus-11 measurement.
- `scripts/harness-usage.test.mjs` - the case that pins `--landed` reading `origin/main` and
  falling back to the tree when there is no ref.
- `scripts/check-landed-ref.mjs` - the gate, and its own account of the five scripts fixed one at a
  time before it existed.
- `docs/ROUTINES.md` - the daily tooling routine now passes `--landed` and reports nothing at all if
  the flag is unrecognised.
