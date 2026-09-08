---
v: 2
source: derived
kind: finding
raised: 2026-09-08
state: parked
note: "the entries it was raised to add would not have prevented a single measured stoppage, and an autonomous agent may not widen the machine's permission posture anyway - the same edge as docs/backlog/git-push-allow-hook.md. The paste-ready shapes are below for the day the owner wants them."
found: "git add stopped two rows dead at 17:59Z tonight and cost the wave six minutes - diagnosed, not assumed (the row K brief, 2026-09-08). Nineteen thousand tool calls of transcript say it did not happen."
needs-owner: harness
---
# The allowlist is not what stops a row at night. The classifier is

**Filed:** 2026-09-08. **Source:** measurement, on branch `claude/k-allowlist-friction`, which was
launched to add the missing `git add` entry and found there was nothing to fix.

## Why

A wave may not depend on a permission prompt being answered, because at 03:00 nobody answers one
(`.agent-workflows/orchestrator/launch.md`). So a row that stops on a prompt is not slow, it is
lost. That makes "which command stopped a row" a question worth measuring rather than recalling,
and this is the measurement. It matters because the wrong answer was about to be acted on: the
brief that launched this row named `git add` and named a time, and both are wrong.

## What was measured

Every Claude Code transcript on this machine, 2026-09-04T00:00Z to 2026-09-08T23:00Z. **19,456
tool calls. 28 did not return a normal result.**

| what came back | count |
|---|---|
| `Permission for this action was denied by the Claude Code auto mode classifier` | 26 |
| a person answering no (`npm run build 2>&1 \| tail -25`, 2026-09-05T13:10Z) | 1 |
| still in flight while the scan ran (this row's own calls) | 2 |
| **an allowlist prompt nobody answered** | **0** |

Git specifically, over four days: **2,135 git-shaped shell calls, and every one of them returned.**
373 were `git add`. 311 were `git commit`. 698 `git log`, 498 `git status`, 437 `git diff`. Not one
went unanswered.

The named window is empty too. Between 17:30Z and 18:30Z on 2026-09-08 there were **537 tool calls
and zero refusals or unanswered calls**, and every session whose transcript ends between 16:30Z and
19:30Z ends on an assistant TEXT message - the shape of a session that finished, not one that
stopped on a call (`scripts/blocked-sessions.mjs` explains why the difference is readable).

**The blocker that is real is the auto mode classifier, and an allowlist entry does not lift it.**
It is a separate layer that runs on commands the allowlist has already passed. Of its 26 refusals,
most were on genuinely consequential commands and it was right: `git tag && git push`, a global
`npm install -g @anthropic-ai/claude-code`, `cleanup-worktrees.mjs --apply --acknowledge-risks`,
`gh pr merge 149 --auto`, `jobs.mjs add-merge`, a `grep` of `E2E_EMAIL`/`E2E_PASSWORD` out of
`.env`, and a heredoc writing a job stamp into `.git/noacg-jobs/`. Three were read-only inspections
it should have allowed - a `grep -n` over a script, `git config core.fsmonitor`, a `grep -A 18` of
`queue-merge.md` - and each of those sat in a session where consequential calls had just been
refused, which is worth knowing before writing one off as random.

**Two of the 26 are this row's own change, already refused twice.** On 2026-09-04 at 07:31:18Z a
session rewrote `.claude/settings.json` through `node -e` and was refused; nineteen seconds later
it tried again through the Edit tool and was refused again. That is the same edge
`docs/backlog/git-push-allow-hook.md` records from 2026-08-30, and the reason there is still the
reason here: an autonomous agent widening the machine's permission posture is what the check exists
to stop, and no instruction from a planning agent reaches past it. This row did not re-word the
change to get through. It measured instead, and the measurement is the more useful result.

## The one real gap, which is not a stoppage

`.claude/settings.local.json` on this machine carries `Bash(git add *)`, `Bash(git commit *)` and
`Bash(git checkout *)`. That file is gitignored and `git worktree add` never copies ignored files
(`docs/AGENT_WORKFLOWS.md`, "Permissions"), so **10 of the 16 worktrees present tonight have one and
6 do not**. The same `git add` is pre-approved in some rows and not in others, which is exactly the
reactive drift that paragraph was written to end. Nothing stopped because of it - auto mode is
answering these calls without a prompt - but it is a coin flip sitting under the thing a row does
after every phase, and the tracked file is where it belongs.

The tracked file also has an unpaired set. Lines 124-128 allow `PowerShell(git status *)`,
`PowerShell(git log *)`, `PowerShell(git diff *)`, `PowerShell(git show *)` and
`PowerShell(git fetch *)` with no Bash twin, while `Bash(git fetch)` allows no arguments at all -
and the doctrine says an entry is paired Bash and PowerShell or it leaves the prompt it was written
to remove. The obvious repair is to add the five Bash twins. **Do not**, and the next section is
why: four of those five patterns do not hold up when they are tried, so the pairing rule is not the
only thing they are failing.

## What it would take

Two entries, which is fewer than this row set out to write, because most of the obvious ones fail
the repo's own test the moment they are tried. `docs/AGENT_WORKFLOWS.md` asks whether a command,
with ANY arguments that match the pattern, could destroy or exfiltrate something, and says a prefix
cannot exclude a trailing argument within one segment. Run against git 2.55.0 in a worktree:

| pattern | what a trailing argument reaches | verdict |
|---|---|---|
| `git diff *` | `--output=<path>` writes the diff over any file on disk, exit 0, no output | **fails** |
| `git log *` | `--output=<path>`, the same | **fails** |
| `git show *` | `--output=<path>`, the same | **fails** |
| `git fetch *` | a `+refs/heads/x:refs/heads/main` refspec force-updates a local branch; `--prune` deletes tracking refs | **fails** |
| `git status *` | it has no `--output`, and nothing else it takes writes | passes |
| `git add *` | no flag writes anywhere but the index (`--pathspec-from-file` only reads one) | passes |

The three failures were measured, not reasoned: a file holding the word PRECIOUS was replaced by
`git diff --output=`, then again by `git log -1 --output=`, then again by `git show --output=`,
while `git status --output=` and `git add --output=` were both rejected with `unknown option`. The
fetch row is read off git's refspec documentation instead, because measuring it means
force-updating a branch on this machine.

**Which makes four entries already in the tracked file unsafe by that same test.**
`.claude/settings.json` lines 125-128 allow `PowerShell(git log *)`, `PowerShell(git diff *)`,
`PowerShell(git show *)` and `PowerShell(git fetch *)`, and a trailing `--output=` walks through
every one of them. Nothing suggests anybody has ever done it. The point is narrower and worse: the
test the doc states and the entries the file carries have drifted apart, and pairing those four
onto Bash - which is exactly what this row was launched to do - would have doubled the drift rather
than noticing it. That is the argument for measuring an entry instead of reasoning about it, made
against this row's own first draft.

So the entries worth adding are the two that nothing can turn into something else. The owner pastes
them into the `allow` array of the tracked `.claude/settings.json`, in a session he opens himself:

```json
"Bash(git status *)",
"Bash(git add *)",
"PowerShell(git add *)",
```

They go in without comments, because that file is strict JSON and carries none today; the reason
for an entry lives in `docs/AGENT_WORKFLOWS.md` prose, which is where these two belong. `git status`
prints and exits. `git add` writes the index and nothing else - unlike `git push` there is no
trailing argument a prefix would have to exclude, and no network path at all. `PowerShell(git
status *)` is already on line 124, which is why only the Bash twin is listed.

**Deliberately left out, each for a reason a prefix pattern cannot fix:**

- `git commit` - a trailing `--no-verify` skips the repo's own hooks and a trailing `--amend`
  rewrites the commit under them. No prefix excludes either, and "the gates ran" stops being true.
- `git push` - the owner's own parked receipt, `docs/backlog/git-push-allow-hook.md`. Untouched.
- `git checkout`, `git reset`, `git stash`, `git clean` - every one discards uncommitted work
  through a trailing argument, and uncommitted work is the only thing on this machine with no copy
  anywhere else.
- `git log`, `git diff`, `git show`, `git fetch` - the `--output=` table above. If these are wanted,
  they want the shape `git push` wants: a hook that parses the command, the one
  `docs/backlog/git-push-allow-hook.md` describes, extended to refuse an output redirect. That is a
  different and larger piece of work, and it would let the four entries already in the file be
  tightened at the same time.

## What would actually buy the night back

None of this would have saved a single minute in the last five days, and that is the finding. If a row is to stop stopping, the lever is the classifier, and the repo's only honest reach
into it is the shape of the commands it writes: plain, separate, short commands rather than a
compound one-liner carrying a `cd`, a heredoc, a redirect and three `;` chains. Two of the three
wrongly-refused reads above were that shape. `scripts/hooks/guard-command.mjs` already refuses the
same shape for its own reason - it cannot verify a complex line stays inside the agent's worktree -
so the repo is being told this twice by two different mechanisms.

## Evidence

The scan is `blocked-sessions.mjs`'s method widened from the tail to the whole file and from
pending calls to refusal text: for every transcript under `~/.claude/projects` modified in the
window, pair each `tool_use` with its `tool_result` and report the pairs that are missing or that
came back refused. Re-derivable in about twenty lines; the counts above are from the 2026-09-08
23:00Z run. `node scripts/blocked-sessions.mjs --minutes 5 --all` reported no waiting session at
the same moment.
