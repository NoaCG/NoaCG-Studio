---
v: 2
source: owner
kind: ask
raised: 2026-09-04
state: advanced
asked: "Because we are RAM-constrained could the orchestrator start cloud sessions for those
  worktrees and branches that don't need anything from the local computer, like .env files? Would
  this speed up work or would everything still be as slow because it doesn't speed up merging,
  which has been the slow part?"
note: 2026-09-23 a claude.ai/code cloud session built, tested, published and landed a whole branch (pull request 390) and landed its own follow-up; cloud-queue-merge.yml is the bridge into the merge queue, so what is left is routing wave rows to cloud sessions, not proving they work
---
# Run wave rows that need nothing local as cloud sessions, and bridge their branches into the queue

**Filed:** 2026-09-04. **Source:** owner question, answered with a measurement of the job queue.

## Why

The premise behind the question turned out to be wrong in a useful direction: **merging is not the
slow part.** Over the three days to 2026-09-04 the machine-wide job slot was occupied 34% of the
wall clock. Merge jobs took 25% of the day and local verification jobs 9%. The median job started
0.6 minutes after it was enqueued. The queue sits idle two thirds of the time and backs up only in
bursts, which is what makes it feel slower than it is.

So the thing capping the day is upstream of landing. Roughly 1 GB of RAM per session on a 16 GB
laptop puts the ceiling at three or four concurrent sessions ([[ram-management]]), and three or four
sessions is how much finished work exists to land. Landings currently run at 22 a day. At the
measured mean gate duration there is about **2.5x to 3x of headroom** before the single job slot
becomes the binding constraint instead.

Cloud sessions lift a second local limit that gets less attention than RAM: the rule that only one
browser-driving job runs per machine, which serializes verification across every session at once. A
cloud session verifies in its own container and never touches that budget.

Most work qualifies. Only 11 of 305 scripts under `scripts/` read a secret, and only 3 of 147 specs
under `e2e/` touch `process.env`. AI benches, hosted-key work and Supabase admin need the local
`.env`; nearly everything else does not.

## What it would take

The landing queue is the only real blocker, and the hard half of it already exists.

**The gap.** The queue directory is `gitCommonDir()/noacg-jobs` on this laptop's disk
(`scripts/jobs-store.mjs`, `jobsDir`), drained by a runner process here. A cloud session running
`npm run queue:merge` writes into its own container's empty queue, which has no runner, so nothing
lands. The pin is also the local ref, `git rev-parse <branch>` (`scripts/jobs.mjs`, `branchTip`),
and a branch that exists only on `origin` cannot be pinned.

**What is already built.** `auto-merge.mjs` lands a branch that has no local worktree by minting a
temporary one and removing it afterwards, with a prune-and-retry for the stale-registration case
(`createTemporaryWorktree`). That was the expensive part and it is done. The bridge is therefore
small: fetch the cloud branch, create the local ref, enqueue it.

**The design question inside it** is who declares the work finished. `queue-merge.md` is explicit
that queueing IS that declaration, made by the session that owns the branch, because a branch can
be green, clean and `clear` while its author is still deciding what to do next. A cloud session
needs some way to say it. A pushed tag or ref that a local watcher picks up is the obvious shape,
and it must carry the same meaning, not merely the same effect.

**Keep the merge queue local and serial.** Nothing here argues for changing it. If volume later
pushes the single slot past saturation, the split to make is merge jobs against verification jobs,
since only the merges have to be serialized.

## What would actually eat the gain

Not RAM and not the merge slot. The owner's own 2026-09-01 ruling, after two orchestrator waves
collided, is that the cost of parallelism here has been collisions in shared prose: `AGENTS.md`,
`docs/`, the instruction-chain byte budget. Cloud sessions raise the session ceiling without
touching that. Triple the sessions and the collisions triple on exactly the files every row wants
to edit. The mechanism worth building alongside this is file-territory separation, not more
capacity.

A smaller one: 25 of 103 merge jobs in the same three days failed or timed out, and each burns slot
time and forces a re-run. At 25% occupancy that is affordable. At 75% it is not.

## Evidence

Measured 2026-09-04 from 555 job records in `.git/noacg-jobs` and 222 rows of `landed.jsonl`.

- Three-day slot occupancy: merge 18.2 h, verification 6.3 h, total 24.6 h of 72 h = 34%.
- Wait to start, all kinds: median 0.6 min, p90 19.3 min.
- Merge gate duration: median 7.4 min, p90 22.7 min, max 45.1 min.
- Landings: 22 in one day, 59 in two, 151 in seven.
- Merge job outcomes over three days: 78 done, 25 failed, 8 timed out, 1 cancelled.
- Secrets: 11 of 305 `scripts/*.mjs` read an API key or service credential; 3 of 147 `e2e/*.spec.ts`
  read `process.env`.
- Session count at the time of measuring: 4 interactive local sessions, against the 3 to 4 ceiling
  in [[ram-management]].

## The blocker found by probe: there is no cloud session to start yet

**Probed 2026-09-04, and this is the finding that gates the whole item.** An Agent tool call with
`isolation: "remote"` was accepted at launch and then ran on the laptop anyway. The probe reported
hostname `Legion-001`, Windows 10 Enterprise 10.0.19045, and a working directory of
`.claude/worktrees/agent-<id>`, which is an ordinary local worktree. It was not a container and it
was not remote.

The failure mode is the dangerous kind: **it degraded silently.** The launch returned success, the
agent worked, and nothing anywhere said the requested isolation had not been honoured. A wave that
routed half its rows to "cloud" on that parameter would run every one of them on the laptop, spend
the RAM it was trying to save, and report as though it had not.

So the sequence is fixed by this. The bridge described above is worth building and small, but it
buys nothing until there is a real remote executor to feed it. Settle that first:

1. Establish whether remote isolation is available on this account at all, and if it is gated, what
   ungates it.
2. Whatever the answer, make the silent degradation loud. A run that asked for remote and got local
   must say so, or the failure returns invisibly every time it is used.
3. Only then build the fetch-ref-and-enqueue bridge.

## The answer to step 1 (2026-09-04): the Agent tool's `remote` is a no-op, and the cloud door is a different one

**Reproduced, not inferred.** A throwaway agent was launched with `isolation: "remote"` whose only
job was `node scripts/agent-isolation.mjs --json`. The launch reported success. It ran on
`Legion-001`, win32, in `C:\claude\NoaCG-Studio\.claude\worktrees\agent-<id>`, against
`C:/claude/NoaCG-Studio/.git` - 13 worktrees and 562 landing-queue records, both of which git never
clones. Verdict `local`, confident. That is the second independent reproduction of the same
degradation, so it is the behaviour rather than one bad launch.

**It is not gated in any sense anyone can act on: it is undocumented.** A search of the Claude Code
and Agent SDK documentation on 2026-09-04 found `isolation: "worktree"` documented and
`isolation: "remote"` documented nowhere - no plan or subscription tier, no org or account setting,
no feature flag, no `settings.json` key, no environment variable, no repository connection, no CLI
version. Nor is there any supported way to notice the drop: no field in the launch result, no
marker inside the agent, no command that reports where a session is running. So there is no step
that ungates it, and the honest finding is that the parameter is accepted and ignored.

**But cloud sessions exist here, through the CLI rather than through the Agent tool.** `claude`
2.1.251 on this machine carries three flags the Agent tool has no equivalent of:

| flag | what its own `--help` says |
|---|---|
| `--cloud [description\|session_id\|url]` | create a cloud session, or attach to an existing one by id or claude.ai/code URL |
| `--environment <ccpool_...>` | create a new cloud session that runs on the given self-hosted environment |
| `--teleport [session]` | resume a teleport session |

That reframes the item rather than closing it. **Cloud is a SESSION-level mechanism, not a
subagent-level one**, so an orchestrator cannot route one row of a wave to the cloud by passing a
parameter - it would have to start the session differently. What has been verified is that the
flags exist in the installed CLI. **Whether `claude --cloud` actually creates a working cloud
session on this account is untested**, and it is the next probe: run `claude --cloud "isolation
probe"` interactively, have it run `node scripts/agent-isolation.mjs --expect remote`, and record
the exit code. Do not run it unattended - it is an interactive session and it may cost money.

So the sequence stands, with step 1 answered: the Agent tool cannot deliver a cloud row, the CLI
might, and the fetch-ref-and-enqueue bridge is still worth building but still buys nothing until a
real remote executor exists to feed it.

Step 2 is done: `node scripts/agent-isolation.mjs` answers "where am I running" from facts git
cannot clone, and `--expect remote` turns a dropped isolation into exit 1 instead of silence. It is
named in `docs/VERIFICATION.md`.

**Meanwhile the second local limit named above - the one browser-driving job per machine - has been
lifted for the catalog battery without waiting for any of this.**
`.github/workflows/catalog-gates.yml` runs what `npm run catalog:affected` names on GitHub's
runners, so gating a catalog change costs the laptop nothing. That is the part of the owner's
question that had an answer available today.

## 2026-09-23: a cloud session, end to end, and the bridge that exists now

**Proven, not probed.** A session started on claude.ai/code (a Linux container, 4 cores, 15 GB,
`CLAUDE_CODE_REMOTE=true`) did a whole branch with the laptop closed: the Downloads page, Playout
Back/Home and settings, a Supabase migration rehearsed read-only against production, about 140
Playwright tests run in the container, pull request 390 through the merge queue, the production
deploy checked, and `@noacg/cli` 0.4.1 published through `release-cli.yml`. The owner's hands
were needed once, to post the first `noacg/reviewed` stamp, because the door below did not exist
on `main` yet. `node scripts/agent-isolation.mjs --expect remote` now reads that variable and
answers remote with confidence there; before, an empty container could only get the weak verdict.

**The bridge is not the one sketched above.** Nothing is fetched into the laptop's queue: the
landing queue is GitHub's merge queue now, and `.github/workflows/cloud-queue-merge.yml` makes a
cloud session's declaration from the GitHub side. The session pushes, opens its pull request and
dispatches the workflow with the reviewed sha and a one-line verdict; the workflow stamps, labels,
turns auto-merge on and re-runs a `Reviewed` that gave up before the stamp existed
(`.agent-workflows/queue-merge.md`, "From a cloud session"). Three traps found while landing it,
all answered in pull request 392, and all one lesson - **every run on the tip counts, and a
red or cancelled required check in any of them holds the pull request out of the queue, however
green another run is**: the workflow token needs `contents: write` or
enablePullRequestAutoMerge refuses it; a `Reviewed` that gave up before the stamp stays red in
the pull request's own run until that job is re-run; and a dispatched ci.yml run on the branch
shares the push run's concurrency group (`ci-<ref>`), so it cancels the push run and leaves a
cancelled `CI gate` behind - which is why the workflow no longer dispatches one when a
pull-request run exists.

**What a cloud session still cannot do, measured the same day:** push a tag or any branch but its
own (the git proxy refuses; `workflow_dispatch` is the way round, as `release-cli.yml` shows); run
`gh`; reach noacg.studio from a shell (the egress policy refuses it; the Vercel tools can fetch
it); drive CasparCG, the Bridge exe or anything on the studio network; or show its dev server to
a person, since branch previews are ignored by this repository's Vercel build step. The pinned
Playwright wanted Chromium 1228 and the image carried 1194; `scripts/hooks/cloud-session-setup.mjs`
links the one to the other at session start, with `npm ci`, so the next session starts ready.

**So the item's open half is routing, not capability:** starting a wave row as a cloud session
(the CLI's `--cloud`, or claude.ai/code) instead of a local worktree, for rows that need no `.env`
and no hardware. The file-territory point above is unchanged by any of this.
