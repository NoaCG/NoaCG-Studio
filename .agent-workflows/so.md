# so - second opinion

Shared canonical procedure for the `so` workflow - invoked as `/so` in Claude Code, `$so` in
Codex. Cross-references to other workflows below use their plain names (e.g. "the queue-merge
workflow"); translate as `/queue-merge` in Claude Code, `$queue-merge` in Codex.

An **independent second opinion** on work another session produced in **NoaCG Studio**: a plan,
an implementation, a benchmark round, or a decision. This workflow runs in a FRESH session on
purpose - the reviewer inherits none of the original session's framing, so it can catch what
that session talked itself into. It judges and recommends; it **never implements anything**.

Optional focus from the user, if one was given at invocation: a branch name, a commit or commit
range, a worktree, a plan/report file (e.g. under `docs/` or `benchmarks/`), or a short
description of the work. If none was given, discover the subject (below) and say plainly what
you chose to review before reviewing it.

## Locate the work (when no subject was given)

- `node scripts/worktree-activity.mjs` lists every other worktree's uncommitted and
  not-yet-merged files, plus branches ahead of `main` with no worktree.
- `git log --all --oneline -20` and `git branch -a --sort=-committerdate` show what moved most
  recently.
- Prefer the most recently active line of work. If two candidates are genuinely equally
  plausible, ask the user which one to review rather than guessing; that is the one question
  this workflow is allowed to stop for.

## Ground it (read-only evidence)

Do this work for yourself - most of it never reaches the response. Evidence is repository
state and repository documentation, nothing else: do not ask for, reconstruct, or rely on the
other session's chat transcript or any tool-private memory.

- **What actually changed** - `git diff main...<branch>` (or the named commits/files), read in
  full for anything small enough, sampled deliberately for anything large. Never check out or
  switch branches to read it: `git show <branch>:<file>` and `git diff` see everything without
  touching the working tree.
- **What it claims** - commit messages and any plan/report/doc the work added or updated.
  Keep claims and evidence separate: a commit message saying "verified" is a claim, not
  evidence.
- **The problem it is meant to solve** - state the underlying problem in your own words BEFORE
  weighing the work against it. If you cannot name the problem from repo state and docs, that
  is itself a finding.
- **The binding contracts it touches** - the non-negotiables in the root `AGENTS.md`, the
  nested `AGENTS.md` for each area the diff enters, `docs/ARCHITECTURE.md` for layer/import
  edges, `docs/DESIGN_LANGUAGE.md` and `docs/GOALS.md` where taste or priority is in question,
  and the relevant `docs/` reference for the format it changes.
- **The surroundings** - does the change collide with other in-flight worktrees
  (`node scripts/worktree-activity.mjs`), and does it conflict with another unqueued branch
  (`node scripts/merge-order.mjs`)?

## Judge

Answer these, in this order of importance:

1. **Does it solve the underlying problem?** Not "does the code do what the commit message
   says" - does the stated problem actually go away, or did the work fix a symptom, an
   adjacent problem, or a problem nobody has?
2. **Does it fit the existing architecture?** Layer and import-edge rules, code as the single
   source of truth, deterministic transforms, the validation gate, versioned
   persisted formats with same-commit migrations. A change that works but fights the
   architecture is a finding even when green.
3. **Is it the best next step?** Check against `docs/GOALS.md` and the repo's current state:
   is something else more valuable, or blocking this from mattering?
4. **Which assumptions are unsupported?** Name each claim the work rests on that repo evidence
   does not back - a "verified" with no test or gate touched, a benchmark conclusion drawn
   from too few samples, a fix with no reproduction, a schema change whose consumers were
   never checked.
5. **What blocks it?** Unapplied migrations, missing env, unrun gates (build, affected e2e,
   catalog gates where the catalog changed), collisions with other worktrees, a doc or
   contract the change makes wrong.
6. **What was actually verified?** Distinguish verified-by-evidence from asserted. Do not
   re-run heavy gates to find out; name what still needs running and by whom.

Independence cuts both ways: your value is catching what the involved session missed, but a
manufactured objection is worse than none. When the work is right, say AGREE plainly and stop.

## Output

Lead with exactly one verdict, verbatim, then the reasoning:

- `AGREE` - the work solves the problem, fits the architecture, and is the right next step.
- `AGREE WITH CORRECTIONS` - the direction is right; specific, bounded corrections are needed
  before or shortly after it lands.
- `DISAGREE` - the direction itself is wrong: wrong problem, wrong layer, or wrong next step.
  Say what the right move is.
- `CANNOT JUDGE` - the evidence in the repository is insufficient to review. Say exactly what
  is missing.

Then, in order:

1. **The problem, in your own words** - one or two lines, and whether the work solves it.
2. **Findings, most important first** - each tied to concrete evidence (file, diff hunk, doc
   section), never to vibes. Skip empty sections; three sharp findings beat ten padded ones.
3. **The smallest appropriate correction** - what to change, where, and why that is enough.
   Recommend the targeted fix over the rewrite unless the direction itself is wrong, and then
   say so plainly instead of dressing a rewrite up as a tweak.
4. **Still unverified** - the checks that remain and the command or spec that would settle
   each one.

## Rules

- **Read, don't write.** Never edit, commit, stash, merge, push, check out branches, switch
  the working tree, or touch other worktrees. Recommend corrections; never apply them, even
  trivial ones - the fix belongs to a session that owns the work.
- **Create or update no files** - the entire second opinion is delivered in the response.
- **Judge the work, not the narrative.** The other session's summaries and commit messages
  tell you what to check, never what to conclude.
- **Be specific enough to act on** - every correction names its file or doc; every unverified
  claim names the check that would verify it.
