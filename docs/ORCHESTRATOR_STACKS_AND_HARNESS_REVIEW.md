# Stacked pull requests, and what the September harness releases change

Reviewed 2026-09-17, against the code and the running machine rather than against the plan
documents. Two questions the owner asked: should GitHub's native stacked pull requests be added
for dependent multi-agent work, and do the recent Claude Code, Codex and Antigravity releases
change anything about lifecycle, context, routing, worktrees, recovery, structured outcomes or
write-capable delegation.

Every number below was measured in this session. The installed builds are Claude Code 2.1.269,
Codex 0.155.0-alpha.16, Antigravity 1.2.5, `gh` 2.93.0.

## Decision

**Stacked pull requests: no as a wave mechanism, yes as a guard.** Keep `--base main` and keep
`START on <branch> landing` as the way dependent rows are sequenced. Adopt only the read side of
the feature - the `stack` field now on GitHub's pull request API - to close the finding in
`docs/backlog/a-stacked-branch-queues-its-parents-commits.md`, which native stacks turn from a
containment heuristic into a first-class query.

**Harness releases: two things to change, the rest already covered.** The Claude-hosted
orchestrator's row launches should move from the Agent tool to the background-session route that
`orchestrator/hosts.md` already documents for the Codex host, and all three delegation wrappers
should enforce their result shape with the schema flags every one of them now has. Everything
else the releases added is either already in the machinery or already refused for a stated reason.

One defect found and fixed in this branch: a quarter of the night loop's wake-ups were GitHub's
own merge-queue refs (below, "The tick was waking the orchestrator for GitHub's plumbing").

## 1. Stacked pull requests

### What GitHub shipped

Private preview 2026-04-13, public preview 2026-07-30, rolling out to all repositories. A stack is
an ordered chain of pull requests: the bottom targets `main`, each one above targets the branch
below. GitHub rebases the chain itself when the trunk moves or a lower branch is pushed to; merging
is bottom-up, and merging a middle pull request merges everything under it and retargets what is
above onto the stack base. Branch protections, required checks and CODEOWNERS are evaluated against
the stack base rather than the immediate parent, so the same two required checks apply to every
member. Merge queues are supported: the whole stack enters in order, a merge group may exceed its
configured size by half to keep a stack together, and a failure removes that pull request **and
every pull request above it**. Stacks cannot cross forks and are unsupported in GitHub Desktop.

The feature is live for this repository. `gh api graphql` resolves `pullRequest.stack` on
`NoaCG/NoaCG-Studio` today - it returned `null` for PR #323, which is a pull request not in a stack,
rather than a schema error. The `gh stack` extension is not installed here.

### What dependent work actually costs today

Fifteen of the 66 rows across the stored wave plans carry `START on <branch> landing`; the rest are
`now` or `on slot free`. The longest chain on record is the 2026-09-15 control-panel wave, eleven
rows deep, HA through HK. From the launch ledger and the landing ledger:

| | measured |
| --- | --- |
| chain wall clock, HA launch to HK land | ~19 h |
| the rows' own work (launch to queued), summed | 908 min |
| **idle between one row queueing and the next launching** | **177 min over 10 links, 17.7 min per link** |
| queue-to-land, median over 79 queued branches | 7 min |
| merge-group CI, median over the last 14 groups | 3 min (worst 11) |

So the friction in a chain is not rebasing and not the gate. It is the 17.7 minutes per link
between a row declaring itself finished and the next row starting, of which roughly 15 is the
landing and the rest is the three-minute tick plus the orchestrator's own turn.

A stack removes the landing wait, because the child cuts from the parent's branch instead of from
`main`. The ceiling on the saving is therefore about 150 of those 177 minutes - **13% of the wall
clock of the most chain-heavy wave ever run here**, assuming a stack costs nothing, which it does
not. On every other wave, where 51 of 66 rows start `now`, it saves nothing at all.

### What a stack would cost here

- **It inverts the landing invariant.** `root/land-through-run-session-owns-branch` says queueing IS
  the declaration that the work is done, and only the branch's own session can make it. In a stack,
  merging the child merges the parent. The backlog finding already describes this arriving by
  accident through an unnoticed `--base`; native stacks make it a supported one-click button.
- **Server-side rebasing bypasses this repository's merge drivers.** `AGENTS.md`,
  `.claude/rules/*.md`, `contracts/index.md` and `package.json` are resolved by
  `merge=noacg-contracts` and `merge=noacg-package`, registered in local git config and therefore
  present on this laptop and nowhere else. GitHub's cascading rebase cannot run them. The trap
  `landing/generated-file-merges-cleanly-still-comes` is exactly this failure. The build's
  `check:contracts` would catch the result, so the damage is a red check rather than silent
  corruption - but it is a red check on a machine nobody is sitting at, on a branch that did not
  cause it.
- **A stack couples landings that are currently independent.** One failure drops every pull request
  above it. Today a red check costs one branch a re-queue; in a stack it costs the tail of the
  chain. `night.md` already carries a repair for the accidental version of this.
- **Two queueing paths both hard-code the base.** `queueOnGitHub` in `scripts/jobs.mjs` and
  `queuePullRequest` in `scripts/queue-pr.mjs` are still the same sequence written twice, exactly as
  the backlog item warned, and both pass `--base main` to `gh pr create` and to the `gh pr list`
  that decides whether a pull request already exists. A stacked child would be invisible to
  `pullRequestFor` and get a duplicate pull request. Stacks cannot be adopted without merging those
  two first.
- **It adds a concept to 100% of the work to serve 23% of it.** All 50 most recently merged pull
  requests have base `main`. The tick, the landing ledger, `merge-order`, `worktree-activity`,
  `candidates` and the contract would each need stack-awareness.

### What to do instead

1. **Close the backlog finding with the API rather than with containment.** `cmdAddMerge` can ask
   GraphQL whether the tip's pull request is in a stack, and whether the branch contains another
   branch ahead of `origin/main` whose session has not declared it. Refuse with the branch named.
   This is the guard the finding asks for, and the `stack` field makes it exact where
   `merge-order.mjs`'s containment check was an inference. Merge the two queueing paths first, as
   the finding says, or the rule lands in one of them and the other keeps queueing the old way.
2. **Spend the 177 minutes on detection, not on stacking.** The tick already sees `QUEUED` before it
   sees `LANDED`. A follow-on whose trigger is its parent *queueing* rather than *landing* recovers
   most of the same time with no new branch topology, no server-side rebase and no change to the
   landing invariant - at the cost that the child builds on code the gate has not passed yet, which
   is the identical risk a stack takes and is the honest comparison to make. Worth one measured
   trial on the next chain-heavy wave, not a contract change on argument.
3. **Revisit when the module refactor lands.** `WORKFLOW_ARCHITECTURE.md` §5.5 says three of the
   chains exist because `ProductionPage.tsx`, `draft.ts` and `model/wizard.ts` are shared giants.
   Chained rows that exist only because two rows must edit one 2,629-line component are a code
   problem. Fix the code and the chain disappears; stack the pull requests and the chain is
   preserved in a new form.

## 2. The harness releases

`npm run harness:usage` reports 15 of 17 capability observations UNVERIFIED against the installed
builds - the freshness mechanism works, and nobody has re-probed since 2026-09-11. Re-probed here,
cheaply, with the results below. Routing on an unverified observation is routing on a memory.

### Already covered - verified, nothing to change

- **`claude agents --json` carries `status` again**, with `idle`/`busy` on interactive sessions and
  `status: "waiting"`, `waitingFor: "permission prompt"`, `state: "blocked"` on background ones.
  `scripts/claude-agents.mjs` probes the field's presence per run rather than per release and
  already prints it; `blocked-sessions.mjs` already consumes it; the tick already emits
  `its process is running (pid N, waiting: permission prompt)`. The observation
  `claude-agents-json-liveness` needs its `measuredOn` moved and nothing else.
- **`--permission-prompts none`** is present, as the file already records. Applying it to unattended
  rows turns a headless stall into a recorded denial; it is not applied at launch today.
- **Subagent notification routing** is unchanged in substance, and `scripts/relay.mjs` is the
  durable channel for a stray report either way. `--forward-subagent-text` exists for the headless
  path but only with `--output-format=stream-json`.
- **Antigravity's `--mode plan`** is already the wrapper's read-only default. `remote-control
  start|status|stop` is now a real subcommand; nothing in the wave depends on it, and the owner's
  Remote Control complaint is about Claude Code, not agy.
- **Codex `--cd`, `--add-dir`, `--worktree`, `resume`, `fork`, `queue`** all exist. `hosts.md`
  already routes Codex workers through worktree assignment and bounded waits.

### Change 1 - launch Claude rows as background SESSIONS, not Agent-tool subagents

`launch.md` says the primary launch path in Claude Code is the Agent tool with `isolation:
worktree`. `hosts.md` documents `claude --bg --name <letter> --model opus --effort high`, measured
on 2.1.268, complete with the `--bg --resume` copy-session caveat. That route is scoped to workers
launched *from Codex*. The same machine, the same binary, the same night - and the Claude-hosted
orchestrator does not use it.

What the Agent tool costs, all four of them recorded in this repository already:

| | Agent tool subagent | `claude --bg` session |
| --- | --- | --- |
| survives the orchestrator's death | no - `night.md`'s most load-bearing sentence is about this | yes, own pid |
| branch name | minted `worktree-agent-<id>`; the row's `BRANCH` line changes nothing | `--name`, and the row cuts its own branch |
| appears in the liveness inventory | never - not a process of its own | yes, with `waitingFor` and `state` |
| can be woken or adopted | recorded as impossible (`claude-agent-tool-cannot-adopt-or-wake-a-row`) | `attach`, `logs`, `stop`, `rm`, `respawn`, `--bg --resume <id>` |

Measured here: a background session launched into a scratch directory appeared in
`claude agents --json` as `{"pid":37796,"id":"3e2facef","kind":"background","status":"waiting",
"waitingFor":"permission prompt","state":"blocked"}`, and `claude stop` then `claude rm` removed it.
Interactive and background sessions both list; Agent-tool subagents do not list at all. Twelve of
the fourteen project rows in the last day's usage report are `.claude/worktrees/agent-<id>`
directories, so this is the dominant path, and 2,186 of 2,517 requests came from subagents.

Two capability observations are also now refutable in part, and should be re-measured rather than
asserted from this document: `SendMessage` IS reachable from a main session in 2.1.269 and
addresses another local session by name, with `notify_when_idle` as a push idle/exit signal; and
`EnterWorktree` takes a `path` to an existing worktree of the same repository, including from an
agent whose working directory was pinned at launch - which is the adoption the 2026-09-11 deck
rescue had to work around by copying files out by path.

The caution that keeps this honest: `--bg --resume` creates a COPY when the original process is
still running, `claude stop` acknowledges before the process exits, and cross-session messages are
held for approval when the receiver runs in a different permission mode. `hosts.md` already states
all three. Moving the launch path is a change to `launch.md`'s table, not a new mechanism, and it
should be trialled on one wave with the launch ledger as the comparison.

### Change 2 - make delegated results a shape, not a promise

All three harnesses now enforce a result schema on a headless run:

- Claude Code: `--json-schema <schema>` with `--output-format json`, plus `--max-budget-usd`
- Codex: `codex exec --output-schema <FILE>`, plus `--json` and `-o <FILE>`
- Antigravity: `--json-schema` with `--output-format json`

`agy-run.mjs` passes `--output-format json` and no schema. That is the direct fix for the recorded
defect `agy-plan-mode-answers-with-a-plan`, where a plan-mode call returned a `plan.md` instead of
the answer three times out of three and only a prompt saying "do not write a plan" got the answer -
a schema makes the shape the harness's problem rather than the prompt's.

It also finishes two designs that already exist in embryo. The `/check` verdict stamp
(`<git-common-dir>/noacg-jobs/checks/<branch>.json`, 40-odd files, written regularly) and the
delegation outcome ledger (`~/.noacg/delegation-outcomes.jsonl`, 52 lines) are both written by a
session that has to remember to write them. A schema-enforced final message makes them a product of
the run. Note the ledger's last line is 2026-09-12: five days without a delegation outcome recorded,
so the routing evidence `orchestrator/routing.md` reads at plan time is going stale on its own.

### Deliberately not changed

- **No second orchestrator, no daemon, no tracker.** `ORCHESTRATOR_SPEC_REVIEW.md` settled this on
  2026-09-14 against Symphony and Spec Kit and nothing in these releases reopens it.
- **`isolation: remote` stays unplanned-for.** The Agent tool's description now says availability is
  gated and `claude --cloud` / `--environment ccpool_...` exist, but
  `claude-remote-isolation-silently-runs-local` has not been re-probed on 2.1.269. The probe is one
  row whose first step is `node scripts/agent-isolation.mjs --expect remote`. Until it runs, do not
  plan capacity on it - the rule in `launch.md` stands as written.
- **`--exclude-dynamic-system-prompt-sections` and `--system-prompt-snapshot`** improve prompt-cache
  reuse, which matters at 560 M tokens a day of almost entirely cache reads - but they are
  command-line flags, so they reach only the headless and background routes, not Agent-tool rows.
  They are a reason to prefer change 1, not a separate change.
- **The watch loop's Monitor.** The Monitor tool expires after at most 30 minutes and must be
  re-armed; `night.md` says "arm as a persistent Monitor" and never names the timeout. The evidence
  says it survives anyway - 583 ticks about three minutes apart, unbroken from 20:20 to 00:17 on the
  2026-09-16 night - so this is worth pinning in the contract as a written `timeout_ms` and a re-arm
  sentence, and it is not a defect to chase.

## 3. The tick was waking the orchestrator for GitHub's plumbing

`branchInventory()` in `scripts/wave-tick.mjs` skipped `main`, `HEAD` and `refs/remotes/origin/HEAD`
and nothing else, so GitHub's merge-queue refs entered the inventory as branches. Each queued group
therefore produced two delta events - `NEW BRANCH ahead of main:
gh-readonly-queue/main/pr-320-...`, then `LANDED` for the same ref - and every delta event is a line
the watch Monitor delivers to the live orchestrator session.

Measured on `wave-tick-events.log`: **126 of 497 event lines, 25%, were queue refs.** A quarter of a
night's wake-ups of an Opus session, for refs that are not rows, have no session, and land whatever
is in them without anybody deciding to.

Fixed here: an exported `watchedBranch()` predicate, pinned by a test using the real ref names from
that log, and a tick that now reports zero events on a quiet repository instead of the queue's
bookkeeping. This matters more if stacks are ever adopted, since a stack is several queue entries.

## Limits of this review

The chain arithmetic comes from one wave, the deepest on record; a second chain-heavy wave would
make the 13% ceiling firmer. No stack was created, so the failure modes above are read from GitHub's
documentation and from this repository's merge drivers, not observed. The background-session
comparison is measured for listing, blocking and removal, not for a full row's launch-to-land, which
is what the trial in change 1 would settle. `isolation: remote` is unprobed on 2.1.269. The
capability file is not edited by this review: an observation moves when somebody runs its own
re-probe, which is the rule that keeps it worth reading.
