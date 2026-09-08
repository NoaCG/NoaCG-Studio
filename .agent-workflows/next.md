# next - plan what to do next in this session

Shared canonical procedure for the `next` workflow - invoked as `/next` in Claude Code, `$next`
in Codex. Cross-references to other workflows below use their plain names (e.g. "the queue-merge
workflow"); translate the same way: `/queue-merge` in Claude Code, `$queue-merge` in Codex, and
likewise for "the handoff workflow" / "the queue-merge workflow".

Mid-session planning for **NoaCG Studio**. The user wants to decide what to do next in THIS
session and expects real, choosable options - or an honest "we're done". This workflow only
plans and presents; implementation starts after the user picks.

Optional focus from the user, if one was given at invocation.

## The honesty rule (overrides everything below)

**Never invent work to have something to offer.** If the session's line of work is complete,
verified, and committed, and nothing actionable is outstanding, the correct output is one short
paragraph saying exactly that - and, if true, that the natural next step is the queue-merge
workflow or the handoff workflow, not more work here. A padded option list is a failure of this
workflow. "Nothing more to be done in this session" is a fully valid, complete answer.

This never waives the clickable pick (section 2b): an honest "nothing left" still ends in a
choice offered to the user, not invented work.

Do not downgrade real gaps to reach that answer either: uncommitted changes, a failing check, a
bug found but not fixed, or a step the work implies (migration, env var, doc now wrong) mean the
session is NOT done, and fixing that is option one.

## How to ground it (read-only, a couple of minutes max)

Do this for yourself; almost none of it reaches the response. Never write, commit, or fix
anything while grounding. Stop researching once you have enough for good options - this is a
quick scan, not an audit.

- **This chat first.** The best options come from the session itself: work started but not
  finished, a bug or smell noticed in passing, a decision made but not built, a review finding
  deferred, something the user said earlier and dropped. Re-read the conversation before
  touching git. Skip anything the user already declined this session.
- **Repo state.** `git branch --show-current`, `git status --porcelain=v1 --branch`,
  `git log --oneline -5`, untracked files worth keeping. Uncommitted verified work is always a
  candidate option; unverified work makes verification the option.
- **What the rest of the checkout is already doing.** Run `node scripts/worktree-activity.mjs` -
  a LIVE scan (the session-start snapshot is stale by now) in two parts: every other WORKTREE
  with work in flight (its branch, its last commit and how long ago, the files it has
  uncommitted or committed-but-not-yet-merged), then every BRANCH ahead of `main` that no
  worktree has checked out - unmerged work from a closed session, still a collision even though
  nobody is in it. This is what tells you an option is already someone else's job, and which
  files an option would collide on. Several worktrees are normally active at once.
- **Collisions, whenever landing this branch is a plausible option.** Run
  `node scripts/merge-order.mjs --branch <this branch>` - read-only, a couple of seconds. The
  worktree scan says who ELSE is in flight; this says which of them this branch CONFLICTS with,
  measured with a real three-way merge rather than a guess. Order is the queue's - pull requests
  land in the order they were queued - so the only question is whether a conflict with `main` is
  waiting, and section 2 says what to do with the answer.
- **Verification gap.** Was `npm run build` run after the last code change? Is there observable
  behaviour that was never checked in the browser or with a focused `e2e/` spec? A green build
  alone does not close a UI-visible change. But absence of a test is a gap, not a bug - never
  claim something is broken without evidence it is.
- **Evidence in the work area** - `TODO`/`FIXME`/`HACK` markers and open questions in the files
  this session touched, plus the nested `AGENTS.md`/`CLAUDE.md` and `docs/` contracts that govern
  them.
- **The backlog, only if the session's own work is exhausted:** `docs/GOALS.md` (unchecked
  milestones). Do not consult tool-private memory as shared project truth.
- **Verify before you list.** Backlog entries, memory notes, old TODOs, and handoff prompts go
  stale: before offering one, spend the thirty seconds to confirm in the current code/git that
  it is still open and not already done. A completed item offered as work is this workflow's
  worst failure mode after invented work.

## Output

**Write the whole response telegram-short: bullets and fragments, no prose paragraphs, no
headers, phone-glanceable.** Terse wording never excuses vague content - every fact below
still lands, in fewer words.

### 0. Pending question / obvious next step comes first

The user may have missed that the conversation already contains an unanswered question, a
choice waiting on them, or one obvious next action. Check for that before anything else. If it
exists, restate it in 1-2 compact lines at the very top and make it option 1 (or the whole
answer) - never bury it under new options, and never invent new work while it is open.

### 1. Where this session stands

ONE line: what the session set out to do; done/verified/committed or not.

### 2. The options

**Numbered 1..N (max 5), best first**, so the user can answer "1" or "do option 2" from a
phone. Each option 1-2 lines, fragment style:

- **`N. Imperative title`** - what + size (must fit rest of session; bigger item = its first
  well-defined slice, said so). Why now + evidence citing something specific in THIS repo (a
  file, commit, doc line, chat moment) - an option that would read true in any repository is
  banned. Real risk/blocker appended only if one exists; no ritual fields.

Sources rank in this order: session leftover > verification gap > landing the work (the
queue-merge workflow) > backlog (`docs/GOALS.md`). Prefer product-meaningful work
over easy filler - a test or doc task earns its place only by closing a real risk, not by being
convenient. Every option must fit the product pillars and the governing nested
`AGENTS.md`/`CLAUDE.md`/`docs/` contracts.

When the session's work is committed and verified, **"queue the branch for landing" is a
first-class option** - often the recommended one. That is the queue-merge workflow, and it is
the only landing action this workflow ever offers: the queue lands one branch at a time, gated
on CI, so nothing here waits on the user to merge anything. What it does wait on is the user
saying the work is FINISHED, because queueing is that declaration and a branch can be green and
clean while this session is still mid-conversation. So offer it, never queue off this workflow
unasked - and once the user PICKS it, run it (section 2c).

**Say what `merge-order.mjs --branch <this branch>` found beside the queue option**, so the user
picks it knowing the cost. It measures this branch against the OTHER branches ahead of `main`,
never against `main` itself - that probe is `git merge-tree --write-tree origin/main <branch>`,
section 2 of the queue-merge workflow:

- **no collision** - offer it normally, no caveat.
- **conflicted files with an unqueued branch** - still offerable and still recommendable; append
  the cost in a fragment (`costs <branch> N conflicted files`). Whichever lands second integrates
  `main` - the queue bounces a conflicting pull request to its session, it never holds it.
- **this branch contains another branch that has not landed** (the tool exits 3) - do NOT offer
  queueing: the pull request would carry that session's commits without its declaration. The
  option becomes rebasing onto `origin/main`, or waiting for that branch to land.
- **a conflict with `main` itself**, from the merge-tree probe - the option becomes that work
  first: integrate `main` here, resolve, re-run the build, then queue - and it says in the same
  line what forced it: the rename, the duplicated migration number, the conflict count.

Never turn this into an option to go merge the OTHER branch: that is another worktree's
business, and this workflow reports collisions rather than acting on them. Name it, and stop.

**Run every candidate option past the worktree scan before listing it:**

- **Already under way elsewhere** (another worktree's branch and files plainly cover that job) -
  do NOT offer it. Say so instead in one line below the options: what, which branch, how recent.
- **Overlaps files in flight elsewhere without being the same job** - still offerable, but the
  option must name the collision (`files X, Y also in flight on <branch>`) and say what to do
  about it: land that branch first, take the slice that misses those files, or do it in that
  worktree instead. Pick one and recommend it - never just flag the clash.
- **Stale overlap** (that worktree's last commit is old and nothing is uncommitted) - name it as
  a caution, not a blocker.
- **Overlaps a worktree-less branch** - the same rules apply; nobody is in that branch right
  now, so the usual answer is to land it (or say it must be landed) before touching those files.
- **Landing this branch** while another worktree is in flight on the same files - still a fine
  option, but say in one line which branch will have to take main afterwards.
- The scan is evidence, not permission: two worktrees touching one file is often fine. Never
  suppress a genuinely good option over an incidental overlap - flag it and move on.

**Optionally add ONE wildcard**: a creative improvement just outside the current scope, clearly
labelled **(speculative)** and pitched as a maybe, not a need - grounded options never get this
label. At most one; zero is fine and usually right.

Mark exactly one option as **recommended**, why in a few words. If only one honest option
exists, list only that one - do not pad.

### 2b. ALWAYS end with a clickable pick - no exceptions

**Every single run of this workflow MUST finish with a way for the user to choose by pressing a
button or typing a short reply.** In Claude Code that is an AskUserQuestion call; in Codex,
present the same numbered choice and ask the user to reply with a number. The user reads this
on a phone and should be able to answer in one tap or one digit - never make them type a
paragraph. A run that ends in prose alone is a failed run, *including* the "nothing left to do"
run.

- Recommended option first, its label suffixed `(Recommended)`.
- In Claude Code, the AskUserQuestion tool takes **2-4 options**. If you wrote 5 numbered
  options, carry the top 4 - the auto-added "Other" covers the rest.
- Labels must match the numbered options above so "option 2" and the button (or typed digit)
  agree.
- Never skip this because the answer feels obvious, because there is only one real option, or
  because there is no work left. Those cases still get a pick - see section 3.

### 2c. A picked option is an invocation - including the landing one

**When the user picks the landing option, RUN it.** Do not answer the pick by asking them to
type the command themselves. The option named a branch, this workflow offered it, and the user
chose it - that is a user decision about a specific branch, which is exactly what "explicitly
invoked" means. Refusing a pick you just offered is a bug, not caution.

Mechanically: read `.agent-workflows/queue-merge.md` and follow it in full for the branch named
in the option. It hands the branch to the machine-wide queue, which does the merging; this
session never merges into `main` itself.

There is no manual landing to offer. Nothing but GitHub's merge queue writes `main` - the ruleset
refuses any other push - so a request to "just merge it" is answered with the queue option and the
reason, never with git.

The authorization is exactly as narrow as the option was: that branch, that turn. It does not
extend to a second branch, to cleanup, or to a later turn - each needs its own invocation.

The same holds for every other option: the pick is the go-ahead for THAT option only.

### 3. If the answer is "nothing"

Skip the numbered list. 1-2 lines: session complete, the evidence (build/e2e/commit state), and
the natural close. No consolation backlog list.

**Then still offer a pick** - the close is a choice too. Build it from whichever of these are
genuinely available, recommended one first:

- **The queue-merge workflow** - only when this session's branch is committed, verified, and
  actually landable, with no unresolved conflict against `main`. Picking it is what declares the
  work finished; never queue unasked, and always run it once picked (section 2c).
- **The handoff workflow** - write the handoff note and close out.
- **Stop here** - nothing further, leave the session as is.
- **Start something new** - open the backlog (`docs/GOALS.md`)
  and plan fresh work outside this session's line.

Two of those is enough to satisfy the minimum; the handoff workflow plus **Stop here** is the
honest floor when nothing else applies.

### 4. Then stop

Present the options, offer the pick, and END THE TURN. Do not start any option, "get a head
start", or stage changes. The user approves with the button/number (or a title, "do the
recommended one") - only then begin, and do only the picked option (section 2c).

## Rules

- **Read, don't write.** The planning turn changes nothing. No commits, fixes, file creation, or
  memory writes.
  The one thing a PICK may then do is start the option the user chose - including landing.
- **Options must be about THIS session's line of work.** Offering to queue this session's branch
  for landing is in scope; never queue it unasked, and never queue another session's branch. Never offer
  repo/workspace cleanup (leftover worktrees, stale branches, node_modules pruning, etc.) - the
  user handles those deliberately elsewhere. Same for other worktrees' business or work that
  plainly belongs in a fresh session - name that separately in one line if it exists.
- **Never act on a collision.** Reporting one is the whole job here: do not merge, rebase, pull,
  stash, or edit anything in another worktree, and never suggest doing it for them silently.
- **Respect the user's focus argument** - filter options through it; if it filters everything
  out, say so rather than stretching.
- **Be fast and cheap.** Grounding is a couple of minutes of reads. Never run the full e2e suite
  or anything that spends tokens/money to generate options.
