# Harness verdict, 2026-09-09

**Who this is for:** the owner, before he decides whether to pay for more Codex capacity. He asked
for the honest truth about whether Codex can be used through the Claude Code orchestrator, and
whether Antigravity has any use or whether it just fails every task we give it.

**Everything below was measured tonight**, between 20:20 and 20:35 UTC, on this laptop, from a
session sitting in `.claude/worktrees/agent-a1122c442ea77070f`. Nine Codex invocations and two
Antigravity calls paid for it. The raw tables are in
`docs/metrics/2026-09-09-harness-verdict-tables.md` (written by Codex) and
`docs/metrics/2026-09-09-agy-spend-appendix.md` (written by Antigravity). Both were checked number
by number against an independent pass, and everywhere a number did not reproduce there is an
editor's note in place saying so rather than a quiet deletion.

## Read this part first

**More Codex quota would not buy more finished work right now, because capacity is not what is
limiting us.** Of the nine delegated tasks on the outcome ledger in the last 24 hours, seven
failed on our own prompt or invocation and only two are evidence about the worker at all. The
meter's own words: worker quality is 1 of 2 accepted, "that is 2 rows - an anecdote, not a rate".
Spending money to remove a limit we have not yet hit buys nothing.

**Codex capacity is being consumed far faster than anyone has been reading.** Tonight's nine
invocations, all of them small, moved the 5-hour window from 18 percent used to 62 percent in
thirteen minutes. That is one session doing one evaluation. Any night with three sessions
delegating would exhaust the window, and nobody would see it coming, because the snapshot is only
written when Codex itself runs.

**Each Codex delegation leaves about four node processes and roughly 195 MB resident after it
finishes, and nothing was cleaning them up.** That, not startup cost, is why Codex feels slow.
The owner's own Codex Desktop session at 19:34 UTC tonight, in a folder he named
`codex-is-very-slow-for-me`, blames "an orchestrator who is creating those and not closing them".
He is right. Four of my own delegations left sixteen processes and 778 MB behind, which I reaped
by hand at the end of this session.

**One thing is better than the file said.** Antigravity did not fail. Given a bounded spec it
produced 63 numbers in a single sixty-second call and made **no arithmetic error at all**. One
column of 13 cells is nevertheless wrong, because my spec told it to count the wrong field and it
counted that field perfectly. That is the shape of its failures, and the shape of its value.

## Question 1: can this orchestrator drive Codex to finish real work?

**Yes, and the rule is exact: a delegation may only write inside the directory the launching
session is sitting in, plus the machine's temp directory.** Nothing else.

I re-derived this rather than trusting the entry already in `scripts/harness-capabilities.json`.
Two delegations, same session, same flags, four minutes apart.

**Probe A, writing here.** Launched 20:21:58 UTC with `--write`, asked to create
`docs/metrics/probe-a-writable-root.md` with four lines: its own writable root, a count read out
of a JSON file, an id read out of the same file, and the word OK. The worker finished in 26.2
seconds and the file was there:

```text
C:/claude/NoaCG-Studio/.claude/worktrees/agent-a1122c442ea77070f
12
codex-writable-root-is-the-launching-session-cwd
OK
```

Both facts check out. At the moment it read the file, `scripts/harness-capabilities.json` held 14
entries, 12 of them with `kind: "observation"`, and the last id was the one it named. This change
adds a fifteenth entry, so the file reads 15 and 13 today; the probe's answer was right when the
probe ran.

**Probe B, writing elsewhere.** Same launcher, same flags, two independent targets. Writing to a
sibling worktree was refused, and this is the refusal verbatim:

```text
New-Item : Access to the path 'C:\claude\NoaCG-Studio\.claude\worktrees\new-session-db1287\.codex-probe-b.txt' is
denied.
```

Nothing was created there; I checked. Writing to
`C:/Users/ahonemi/AppData/Local/Temp/codex-probe-b/.codex-probe-b.txt` in the same run **succeeded**,
and that file exists with the content it was told to write.

**The mechanism, in Codex's own words.** A plain `codex exec` prints its sandbox on startup:

```text
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
```

So this is not a quirk to be discovered by trial. It is the documented sandbox, printed on every
run, and the writable set is the working directory plus the two temp paths.

**This corrects the ledger.** The existing observation says the writable root is the launching
session's working directory "and nothing else". The temp directory is also writable, which is why
a delegation can stage a file it cannot place. The negative half of the rule stands exactly as
written: pre-creating a worktree does not help, because the root follows the launcher.

**The invocation that works**, run as one Bash call from the session whose working directory is
the worktree the result belongs in:

```text
node scripts/codex-rescue.mjs launch "<the task>" --write --effort <e>
node scripts/codex-rescue.mjs poll <jobId> --timeout-seconds 240
node scripts/codex-rescue.mjs result <jobId>
```

**The invocation that does not work** is the same launch naming an absolute path in any other
worktree. It does not warn, it does not partially apply, and on this Codex build the refusal
arrives as a filesystem access error from PowerShell rather than a sandbox policy message, so a
session that only reads the summary can easily record the task as attempted and never notice that
nothing moved.

## Question 2: is Antigravity worth giving tasks to?

**Yes, for bounded literal work, and the evidence is better than I expected.** It does not fail
every task. It fails the tasks whose specs leave anything to be worked out.

**The re-probe first.** The ledger's `agy-headless-auto-denies-ungranted-tools` entry says a
headless call with no `command` grant silently auto-denies and returns an empty response. On the
installed 1.1.28 that is false. `npm run agy:read` with no command grant, asked to list a
directory, returned a complete listing in 6.5 seconds: 16 files with their sizes. I checked it
against the filesystem. The count is right and the sizes are right, including a file 120 bytes
long that had been created four minutes earlier.

**Then a real write.** One call, `--write`, spec handed over as a prompt file of absolute paths
with the tool set declared and no shell, asked to turn a 33-line JSON ledger into a per-model
table and a per-day table. It finished in 60.4 seconds and wrote the file where it was told.
I re-derived every cell: six model rows including a total, across calls, failures, wall clock and
four separate token columns, plus a seven-row daily table. That is **63 numbers, and 50 of them
match to the digit**, including a wall-clock total of 3473.9511605 seconds. The 13 that do not are
the whole failed-call column, and they are wrong because my spec defined failure by the wrong
field. See the next paragraph.

**Its one flaw was mine.** My spec defined a failed call as one whose "recorded status is anything
other than success". It obeyed that exactly and reported 4 failures. The truthful number is 11,
because seven runs return status SUCCESS with an empty response and the wrapper records those as
`ok: false`. Codex, given a looser spec on the same file, chose the `ok` field on its own and got
11 right. That contrast is the routing fact worth keeping:

- **Antigravity is literal.** It will execute a wrong instruction perfectly, which means a defect
  in the spec passes straight through into the artifact with nothing to catch it.
- **Codex exercises judgement.** That fixes gaps in a spec, and it also fills gaps you did not
  want filled (see question 3's table 1).

**The counter-evidence, because it exists.** At 20:27 UTC tonight, while I was working, another
session recorded an Antigravity doc-sweep as `unusable`. Its cause is `prompt`. So the failures
are real, they are recent, and so far every one of them is attributed to our side of the
conversation rather than the model's.

**Use it for:** one file in, one file out, absolute paths, a declared tool set, no shell, and
arithmetic or transcription rather than judgement. On that shape it is cheap, fast and exact.
**Do not use it for:** anything where the right answer depends on noticing that the instruction is
wrong.

## Question 3: what more Codex quota would buy

**The rate, measured tonight rather than estimated.** Three readings of the same snapshot:

| Time (UTC) | 5-hour window used | Weekly window used | Codex sessions in last 24 h | Tokens in last 24 h |
|---|---|---|---|---|
| 20:20:05 | 18% | 24% | 14 | 4,770,074 |
| 20:25:46 | 41% | 27% | 19 | 5,386,958 |
| 20:33:55 | 62% | 31% | 25 | 6,486,495 |

In thirteen minutes, nine Codex invocations from this one session moved the 5-hour window 44
points and the weekly window 7 points, for about 1.7 M tokens. Two caveats, both real: other
sessions on this machine may have run Codex in the same window, so 44 points is an upper bound on
what I spent; and a rate limit window is not linear in tokens, so the arithmetic below is a
scale, not a forecast.

**What the arithmetic says.** At tonight's mix, one percentage point of the weekly window costs
roughly 1.3 delegations or about 245 K tokens. A whole weekly window is therefore worth on the
order of 130 delegations, or 18 a day. Doubling the plan would buy roughly another 18 delegations
a day.

**And that is why the answer is no, not yet.** Look at what those delegations currently return.
Over the last 24 hours the outcome ledger holds nine tasks: one accepted as delivered, five
repaired after review, three unusable. Seven of the nine are attributed to our own prompt or
invocation, which leaves two rows that say anything at all about the worker, and one of those two
was accepted. The meter refuses to call that a rate, and so do I.

**What effort costs, and a correction to my own first draft.** I measured low against high because
I believed the delegation channel injects `--effort high` when a launch names none. **It does
not.** `scripts/codex-rescue.mjs` sets `DEFAULT_EFFORT = 'medium'`, by your own ruling of
2026-09-09 that runs until 2026-09-16 - spend the subscription hard this week at medium on
`gpt-6-astra` and see what the throughput buys. I read that from `.claude/commands/rescue.md`,
which still says high, rather than from the code. The stale line is corrected in this change.

So the pair below never tested the default actually in force, and it is reported for what it is:

| Effort | Wall clock | Tokens |
|---|---|---|
| low | 15.75 s | 12,962 |
| high | 14.86 s | 17,822 |

Same task, same correct answer both times. High cost **37 percent more tokens**. On wall clock high
was 0.89 s quicker, which is one sample apiece and well inside the noise of a 15-second run, so the
honest reading is that **high bought 37 percent more tokens and no measurable improvement** - not
that it was slower. This says nothing about medium, and nothing about long work.

**What that means for the trial you have running.** The medium week expires 2026-09-16 and the
wrapper's own comment names what settles it: read the delegation ledger for model, effort, outcome
and cause per task class, then either extend it with the evidence or put it back to high. On
tonight's ledger that reading is not yet possible, because seven of nine rows measure our spec
rather than the worker. **Getting the spec discipline right is therefore the prerequisite for
both decisions** - the effort trial and the quota upgrade - and it costs nothing.

**So: fix the spec discipline first, and re-read this table in a week.** If the ledger then shows
delegations failing because the window is exhausted, rather than because we wrote the spec badly,
the upgrade buys something real. Today it would buy more of the same failures, faster.

## Question 4: why Codex feels slow through the orchestrator

**The named suspect is innocent, and the real cause is memory, not startup.**

The suspicion going in was the MCP fleet that the Codex app-server spawns: two `@playwright/mcp`
servers pulled with `npx`, a `cua_node` runtime, a staging runtime, `./mcp/server.mjs` and
`./server.mjs`. All of them were resident tonight. I timed them out of the picture:

| What was timed | Wall clock | Tokens |
|---|---|---|
| Plain `codex exec`, trivial prompt | 8.19 s, then 7.90 s on a repeat | 12,443 |
| Same, with `-c mcp_servers="{}"` | 6.78 s | 12,443 |
| Through the wrapper: launch | 1.59 s | - |
| Through the wrapper: poll to completion | 10.13 s | - |
| The worker's own record for that job (`startedAt` to `completedAt`) | 8.46 s | - |

**The whole MCP fleet is worth about 1.1 to 1.4 seconds of startup and exactly zero tokens** - the
token count is identical with the servers configured and with them removed, so they contribute no
tool definitions to an `exec` run. **The orchestrator's channel adds about 3 seconds** to an
8-second job, most of it the poll loop's sampling interval. Neither is what anyone means by slow.

**What is actually happening.** Every `codex exec` starts a fresh fleet of node processes, and
they do not exit when the run does. I measured my own session's leavings:

- Baseline before any delegation: **10 node processes, 619 MB**.
- After four wrapper delegations and five plain `codex exec` runs: **40 node processes, 2,554 MB**,
  and `codex.exe` had gone from one process to three. That is +30 processes and +1,935 MB across
  nine invocations, so **not every invocation leaves a whole family behind** - some reuse an
  existing one. Take the per-invocation figure from the reap below, not by dividing this.
- The survivors group by creation time into families of five to seven processes, each family about
  330 to 430 MB **as observed at creation**. Five such families were on screen at once, and each
  was still resident long after its own job had completed; the oldest was 40 minutes past the end
  of the work that created it.
- The parents are not dead. **One `codex.exe`, PID 4264, was holding four separate MCP fleets at
  once**, one per session it had served, none torn down. That is the mechanism: the app-server
  outlives the session, and the fleet outlives the app-server's use of it.
- **The firm number is the reap.** I killed the sixteen processes belonging to my own four
  delegations and measured before and after: **778 MB freed, which is four processes and about
  195 MB per delegation.** That is what a reaper actually recovers, and it is lower than the
  families' size at creation because the processes shrink once they go idle. Budget RAM on 195 MB
  per delegation; treat 330-430 MB as the peak, not the residue.

**This is not the wrapper's doing.** Two of the leaked families came from plain `codex exec` runs
with no wrapper involved. The three MCP servers are declared globally in `~/.codex/config.toml`,
so every Codex invocation on this machine pays for them, including the owner's own. The
orchestrator's only contribution is calling Codex far more often than a person does.

**And that matches what the owner saw.** His Codex Desktop session tonight at 19:34 UTC asked why
Codex was slow and looked like it was about to crash, and by his third message he had worked out
the answer himself: node processes that an orchestrator creates and does not close. The fix is
already in hand on another branch, which measured 30 processes and 1.4 GB from three delegations
that had ended hours earlier. My numbers are an independent confirmation of the same leak from a
different session on the same night.

**One thing worth doing cheaply, separately from that fix:** `~/.codex/config.toml` declares
`mcp_servers.playwright` as `npx @playwright/mcp@latest`. Nothing in this repository's Codex work
uses a browser. Removing that one entry would take the two heaviest processes, about 175 MB, out
of every fleet before any reaper has to chase them. That is the owner's own configuration file,
so it is his call and not a change I made.

## What changed in the repository tonight

- `scripts/harness-capabilities.json`: two observations re-probed and their `measuredOn` moved -
  the Antigravity grant behaviour onto 1.1.28, and the Codex writable-root claim onto
  0.154.0-alpha.11, corrected to include the temp directory with the sandbox banner as its
  evidence. One new observation added for the leaked MCP fleet. The other entries stay pinned to
  the builds they were measured on and will keep printing as UNVERIFIED, which is correct: I did
  not re-probe them.
- `.claude/commands/rescue.md`: two stale facts corrected - the injected effort default, which is
  `medium` and not `high`, and the claim that `gpt-5.6-sol` is the only model the subscription
  accepts. The first of those sent this document's own first draft down the wrong path.
- `docs/backlog/agy-warns-about-a-grant-1-1-28-no-longer-needs.md`: the wrapper still warns about
  a grant this build does not need, and only one ungranted action was probed, so the fix needs
  the other probes first.
- `docs/HARNESS_ROUTING.md`: a dated section carrying this verdict.
- `docs/metrics/2026-09-09-harness-verdict-tables.md`: the Codex-written tables, annotated where
  one row could not be reproduced.
- `docs/metrics/2026-09-09-agy-spend-appendix.md`: the Antigravity-written tables, annotated where
  my own spec made it undercount.
- Two lines on the delegation outcome ledger, one per worker, both `repaired` with cause `prompt`.

## What is still unmeasured, and should not be guessed

- **Whether high effort pays off on long work.** I measured it only on a short retrieval, where it
  cost 37 percent more tokens for nothing. A four-minute task might tell a different story, and it
  would take a matched pair to find out.
- **Whether the 44-point burn was all mine.** Other sessions run Codex on this machine and the
  snapshot cannot attribute. The honest reading is an upper bound.
- **Codex all-time token consumption.** Two independent aggregations of the same 152 rollout files
  disagree by 10 percent (133 sessions / 19,198 turns / 2.81 B tokens against 120 / 18,865 /
  2.55 B). Nothing here depends on it, and nobody should quote it until one of the two is
  reconciled.
- **Whether the orchestrator itself produces the same wave plan when run inside Codex.** That is
  the owner's standing ask from 2026-09-05 and it is still untested; see
  `docs/backlog/orchestrator-runs-the-same-in-codex.md`.
