---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: >-
  a queued branch is frozen against edits and against `git commit`, and against nothing else -
  `merge`, `rebase`, `reset`, `checkout -B` and `push` all move the tip a live landing is pinned
  to, and none of them is refused (2026-09-10)
serves: NOW
size: small
touches: scripts/hooks/guard-command.mjs
covered-by: scripts/hooks/frozen-branch.test.mjs
needs-owner: none
---
# The freeze does not cover the git verbs that move a tip

**Filed:** 2026-09-10. **Source:** measured on `claude/ay-per-job-cost` while landing pull request
216, after a session merged `main` into a branch that had a live landing pinned to its old sha and
nothing said a word.

## Why

A landing job is pinned: `land-watch.mjs --pr 216 --branch <b> --expect-sha <sha>`. If the tip
moves under it, the pin is stale and the landing can no longer reach a good verdict. The freeze
exists to stop exactly that, and `frozen-branch.mjs` states the rule plainly - queueing means the
work is finished, so a queued branch is read-only until the landing is terminal.

The enforcement is narrower than the rule. `liveLandingFor()` has exactly two callers:

- `scripts/hooks/guard-edit.mjs:40` - file edits, and
- `scripts/hooks/guard-command.mjs:134`, reached only through one predicate on line 129:

```js
const isCommit = /\bgit\b[^\n;|&]*\bcommit\b/.test(command);
```

So a commit is refused and an edit is refused. `git merge`, `git apply`, `git rebase`, `git reset`,
`git checkout -B` and `git push` are not commits, do not match that regex, and every one of them
changes the tree or the tip. `push` is the sharpest of them, because it moves the pull request's
head - which is the thing the landing is actually watching - without touching the local branch at
all. `git apply` is the quietest: it dirties a tracked file, which is the very state the edit guard
exists to prevent, and it does it through a verb the guard never looks at.

That is not a theoretical ordering. On 2026-09-10 a session merged `main` into
`claude/ay-per-job-cost` while j-0906 was live and pinned to `affa277a`. The merge was allowed, the
tip became `df981bd1`, and the landing went on waiting on a sha that was no longer the branch. It
sat in that state for an hour before reporting `CI gave no verdict on the integrated commit`, which
reads as an infrastructure flake and was in fact a pin nobody was allowed to invalidate but
everybody could.

The cost is not the failed landing, which retries. It is the diagnosis: a stale pin fails in the
language of CI trouble, so the session that reads it looks at CI.

## What it would take

Small, and mostly deleting a special case. Replace the single `isCommit` predicate with a set of
tip-moving verbs and route them all through the same `liveLandingFor` check that already exists:

- `commit` (as today), `merge`, `rebase`, `reset`, `checkout -B` / `switch -C`, `cherry-pick`,
  `revert`, and `push` of the frozen branch.
- `push` deserves its own refusal text, because the local tree is clean and the message currently
  talks about a dirty tree.

Two carve-outs are needed or the guard blocks its own recovery. The landing itself runs git verbs
against the branch it is landing, and a session must still be able to fetch and to push an
unrelated branch from the same checkout. Both are already distinguishable: `frozen-branch.mjs`
knows which branch is frozen, and `command-target.mjs` knows which checkout a command is about.

One more thing is worth doing at the same time, and it is cheaper than the guard. When a landing
finds its pin stale, say so: `expected affa277a, branch is now df981bd1 - the tip moved after this
was queued`. That turns the hour-long misdiagnosis into one line, whether or not the guard ever
grows the extra verbs.

## Evidence

- `scripts/hooks/guard-command.mjs:129` - the whole of the freeze's command coverage.
- `scripts/hooks/guard-edit.mjs:40` - the other, and only other, enforcement point.
- j-0906 on `claude/ay-per-job-cost`: queued at `affa277a`, tip moved to `df981bd1` by an
  unrefused `git merge`, verdict after an hour `LANDING FAILED - CI gave no verdict on the
  integrated commit - not this branch's fault`.
- `docs/handoffs/2026-09-09-ay-per-job-cost.md` - the row this was found on.
