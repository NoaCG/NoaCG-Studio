# A simpler orchestrator - the 2026-10-08 rethink

What the orchestrator is for: the owner gives one prompt and a time window, and comes back to
verified work that is merged and live, plus a short report. Nobody watches over it. It works through
the whole window, the prompt's work first and then `docs/backlog/` in `docs/GOALS.md` rank, does
each piece like a clean session of its own, checks finished work, learns from each wave without
growing its docs, runs on Claude Code and Codex, and stays simple enough for the owner to change.

This rewrites the 2026-09-05 review (git keeps it). Evidence: the 2026-10-07 night wave (plan, log
and report in the wave-plan store, the coordinator transcript and its 20 subagent transcripts, the
job store, PRs #724-#733), the 2026-10-03 Codex night wave, today's day wave, git history on `main`
and probes of both harnesses on this machine (Claude Code 2.1.293, Codex 0.162).

## 1. Findings

**F1. The work was good; the system around it is heavy.** 9 rows, 9 landed, 0 refused, 0 conflicts.
The nine rows spent 444 minutes: 58 reading, 19 editing, 49 actively verifying, and 258 (58%)
waiting, 174 of those on full builds that took 6-19 minutes each with six rows building at once.

**F2. The coordinator reads everything first.** The routing table says to load a module when its
phase starts. The 2026-10-07 coordinator read 11 files (1,204 lines, 92K chars) in the first 15
seconds, including `hosts.md` (for Codex) and the launch and night modules; today's read the core
and four modules up front. The Codex coordinator on 2026-10-03 read 12 files, 106K chars. A modular contract is read as one
file by a model that wants to be thorough, so the module split saves nothing.

**F3. Planning is fast; watching is mostly noise.** Planning took 6.7 minutes. The watch took 233
minutes, 113 turns and 27.4M tokens: 14 Monitor arms (they expire every 30 minutes), 39 events,
58 turns with no tool call, and 5 events that led to an action. Every action came from a row
finishing (native notification) or a branch landing (two chained launches). The CI watch replayed
known reds, and GitHub's quarantine had already handled the one flake.

**F4. The window was not used.** The last row landed at 03:25 and the wave closed at 03:55 with two
hours left, while 58 owner asks stood open. The refill draws only on a hand-written candidates
table, which ran dry. The 2026-09-05 review found the same failure (40% of that night unused); the
fix then was more machinery (`candidates.mjs`, `wave-horizon.mjs`, the refill rules), and the
failure came back. The Codex wave of 2026-10-03 also stopped early, at 04:15 of a 06:00 window.

**F5. Review value is concentrated.** `/check` cost 140 row-minutes (31%), 75% of it waiting on a
second build. It found 21 items and fixed 13; the 3 material defects all came from an independent
`code-review` pass on the two largest UI diffs (A and C). The six inline self-reviews found 4 minor
items. Row E's 15-second review missed a regression that its e2e run caught; row F skipped `/check`.
Other gates caught 8 real problems: e2e, `check:copy`, `check:client-neutral`, the spec-mapping test.

**F6. Verification is scoped too wide and evidence goes nowhere.** A site-chrome change ran 795 e2e
tests (vite.config.ts counts as core) and held the one browser slot for 18 minutes, stalling another
row for 10. A copy change ran 652. Rows took about 425 screenshots, looked at 52, and attached none
to a PR. 9 of 23 builds failed or were aborted and only 4 of those were real catches; the rest
were our own tooling: temporary specs left in `e2e/` and a full dev-port registry.

**F7. Fixed context and friction.** Every row turn carries about 44K tokens before any task file:
48K chars of it are Browser and PowerShell tool schemas no row used. 37 tool calls were refused,
26 by the worktree-isolation guard on compound commands. 10 of 41 `wave-launch progress` calls were
refused because the prompt never listed the valid states. A hook told rows 18 times to use the
Browser pane the plan forbade. `merge-order` told all nine rows to land a dead branch first.

**F8. What the owner had to read.** A 96-line morning report, and a 491-line, 47 KB plan if he
wanted to know what started. The plan check forced the coordinator to list 58 owner asks by slug
(`wave-plan-check.mjs`, check 12); only 4 of its 15 checks guard a real failure.

**F9. The docs grow because creation has mechanisms and deletion has prose.** In 14 days `main`
added 77 research docs and 789 non-Markdown research files (74 MB in 30 days), 125 backlog files
(66 deleted), 159 work-spec files, 44 rule records and 40 rule files. The instruction surface went
from 699 files and 17,244 lines to 960 and 19,766 in 30 days. Causes, each with its instruction:
evidence is committed (`verify.md` §4, 19 e2e specs write into `docs/research/`); surfaced work
must become a file (`orchestrator.md:59`, `report.md:77-94`, the `spawn-task-guard` hook); plans
assign new research docs (rows F and G on 2026-10-07, row L today) and evidence screenshots get
committed (row K today); `npm run learn` writes a rule file plus a record file, and retired rules
are never deleted (86 retired, kept by `contracts/README.md`); work-specs, research and records
have no retention rule at all.

**F10. Learning adds; nothing subtracts.** The ladder in `coherence.md` says fix the cause first and
add text last, and the incident log shows it mostly worked: 20 of 31 incidents now have a mechanism
and 6 are obsolete. But the prose stayed after its mechanism arrived, so the contract kept both.
The contract took 50 commits in 30 days; 96% of the 466 active rules are prose only.
Only 2 observation records exist, so the weekly synthesis has nothing to synthesise.

**F11. Safeguards: two of seven are mechanisms.** One browser job per machine (hook and job queue,
about 150 refusals in 14 days) and the 24-hour cap (plan check) are enforced. One orchestrator, a
gate landing alone, never touching another worktree, and `docs/private` staying private are prose.
"Only the merge queue writes main" is enforced by GitHub for everyone except admins, the agents run
as an admin with bypass "always", the main checkout's local settings allow `git push origin main`,
and no hook refuses it.

**F12. Both harnesses now do the hard part natively.** Claude Code: background subagents in their
own worktrees, a notification when each finishes, SendMessage, Monitor, wakeups, the desktop PR
monitor. Codex: `spawn_agent` and `wait_agent`, thread heartbeats, `codex exec`. The 2026-10-03
Codex wave spawned 8 rows and landed 7. What no harness does: know this machine's RAM and browser
slot, enforce our landing policy, or keep one plan file both can read.

## 2. The seven questions, answered

1. **Do we need an orchestrator?** A thin one. Rows in parallel landed 9 PRs in 3.5 hours where one
   agent in sequence would have needed most of a night; a coordinator also picks the next work and
   writes the report. Agent teams are experimental and share one checkout; the Workflow tool and
   Claude Projects are Claude-only. Native subagents plus a short skill is the simplest fit.
2. **Over-engineered:** the watch loop and its scripts, the launch ledger, the plan check's citation
   rules, the candidates table, handoff classification, the weekly parsers, the Codex plugin route,
   the incident log inside the workflow folder, and about 1,800 lines of contract.
3. **Attention goes to:** reading the whole contract, re-arming watches, no-op turns, waiting on
   contended builds, and over-wide e2e. Owner attention goes to a long report and a longer plan.
4. **Safeguards:** keep all seven; make the four prose ones mechanisms where cheap (section 4).
5. **Check and retro:** an independent review per code row, verification proportional to the change,
   one integration check per wave, one retro per wave. No self-review leg, no second build.
6. **Learning without files:** section 3.
7. **Load:** always, root `AGENTS.md` and skill descriptions only. On invocation, the one skill.
   Rows load their prompt, the row definition and the area contract they edit. Everything else goes.

## 3. The design

**One skill, both harnesses, one file.** `.agent-workflows/orchestrator.md`, about 150 lines (a
target, never a reason to drop a reliability guarantee), no modules. Host differences are a few lines: Claude launches rows with the Agent tool (`wave-row*`
definitions, background, worktree isolation) and is woken when each finishes; Codex adds a worktree
per row with `git worktree add`, spawns with `spawn_agent` and waits with `wait_agent`, with a
thread heartbeat as the fallback wake.

**The loop.**
1. Start: claim the wave in the store (one live wave per machine, window at most 24 hours).
2. Pick: the prompt's items first, then backlog items by GOALS rank, skipping what needs the owner
   or touches files a live worktree holds (`worktree-activity.mjs`). Two items on one file or one
   user flow become one row. A row that adds or tightens a build gate runs with nothing beside it.
3. Launch up to four rows at once (a docs-only row counts half), each with a short prompt: goal,
   why, acceptance, pointers.
4. On each finished row: one line in the wave file; launch the next item while the window still
   fits one; a PR that went red after its row ended gets a fresh repair row.
5. End: when nothing fits, wait for the landings, confirm `main` CI is green, check the changed
   surfaces on production, write the report and the retro.

**Rows** do research, plan, build, verify and land as now, with these changes: verification runs the
specs that cover the change, not the affected-everything set; screenshots go to the PR, never to
git; a code row gets one independent review (the review skill in a fresh context) and a docs row
none; a row finishes its agreed scope, verification included, and writes a new doc only when the
doc is its goal.

**The backlog** is one prioritized list, ordered by GOALS rank. Genuine unfinished work and
worthwhile follow-up go into it, linked from the PR; speculative or low-value suggestions do not.
There are no handoff files per session: a minimal checkpoint is written only when work is genuinely
interrupted and cannot be resumed from the backlog item, branch, PR and repository. The owner chose
GitHub Issues as its future home (2026-10-08); until he has reviewed the audit of today's backlog
files, handoffs and owner asks, nothing is migrated or deleted and `docs/backlog/` stays the source.

**The report** is at most 25 lines: what shipped (one line per PR, with how it was verified), what
needs the owner, what was not checked. The plan stays in the store and nobody has to read it.

**The retro** is part of the report: at most three findings from the night, each closed in one of
three ways, never by a new file: fixed now by a row (a mechanism), an edit that replaces text in
the skill or the row template, or dropped as a one-off. The next wave reads only the last retro's
fixes and checks they worked.

**Stale guidance leaves** because the skill and row definition have line budgets in
`check-shared-instructions`, so a lesson that needs words must usually displace words, and every retro asks
which instruction did nothing or caused waste that night and removes it. Incident history lives in
git, not in the workflow folder.

## 4. Each part of today's system

| Part | Verdict | Why, and the expected gain |
| --- | --- | --- |
| `orchestrator.md` + 14 modules (2,036 lines) | Replace | One skill of at most 150 lines; reads drop from 1,204 lines to under 150 |
| Native subagent rows, `wave-row*` definitions | Keep, simplify | Already native; drop the unused Browser and PowerShell tools (48K chars a turn) |
| Wave-plan store | Keep, extend | One short plan file per wave; `--open` refuses a second open wave and a window over 24 hours |
| `wave-plan-check.mjs` (572 lines) | Replace | The two boundary checks move to `--open`; the launch guard keeps its path parser until the old scripts go |
| `wave-tick`, `wave-watch`, `ci-watch`, Monitor re-arms | Delete | Row notifications and `wait_agent` wake the coordinator; GitHub quarantines flakes |
| `wave-launch` ledger, `candidates`, `wave-horizon`, `collision-check`, `wave-recover` | Delete | Refill becomes "next item by rank while the window fits"; median row time is in the wave file |
| Handoff files and `handoff-drain`, `handoff-trace` | Replace | Leftovers go to the one backlog with a PR link; a checkpoint only for a genuine interruption; `/handoff` for live sessions stays |
| `orchestrator-week` + `weekly-candidates`, `alignment-answers` | Simplify | Keep the owner's weekly alignment read; the per-wave retro replaces the machine's self-review; drop the parsers the plan check enforces |
| `relay`, `blocked-sessions`, `claude-agents`, `claude-run`, `resume-dispatch`, `agent-isolation`, `harness-reprobe`, `delegation-outcome`, unused metrics | Delete | Native messaging and agent status replace them, or unused in 14 days |
| `incidents.md` (458 lines) | Delete | 26 of 31 covered or obsolete; git is the archive |
| `/check` | Simplify | Independent review for code, none for docs, no self-review leg |
| `/queue-merge`, GitHub merge queue, quarantine, revert, alarms | Keep | They land work and keep `main` green without an agent |
| Job queue | Simplify | Keep the browser slot and RAM floor; the landing mirror copies GitHub |
| Guard hooks, `stop-wait` | Keep | Add a refusal for pushes to `main` |
| The other four orchestration review docs (1,387 lines) | Delete | This file replaces them |

## 5. The 2026-10-07 lesson, and where it goes

"Every row took before/after screenshots but none reached a PR; copy-only rows ran wide e2e and
lost time to load-only flakes; 59 worktrees exhausted the 60 dev ports." None of it needs a new
file. Screenshots: PR bodies now take an image (#738); the row template says screenshots go there
and never into git. Wide e2e: a mechanism fix in `e2e-affected.mjs` so a CSS or copy change does not
escalate to the core set, plus the row template's "run the specs that cover the change". Dev ports:
today's row L owns worktree self-cleanup.

## 6. Changeover

1. This findings file (docs only).
2. A push-to-`main` refusal in the command guard (contained, independent).
3. After today's wave ends, as a gate change landing alone: the new skill replaces the contract and
   modules; adapters and row definitions shrink; `check-shared-instructions` pins the new limit;
   `wave-plan-store.mjs --open` enforces one open wave and the 24-hour cap. The old scripts stay,
   unreferenced, so one revert restores the old orchestrator.
4. Proof: representative night waves on Claude Code and on Codex, compared with 2026-10-07 on rows
   merged, refusals, share of the window used, lines the owner read, and procedure the coordinator
   read. The old safeguards stay until both pass.
5. The backlog: the owner reviews the audit in a separate session; only then are approved items
   created as GitHub Issues and the old files retired.
6. After the proof: delete the dormant scripts, `incidents.md`, the old review docs and the wave
   handoff machinery; trim `/queue-merge`'s relay and receipt coupling and the job queue's landing
   half once no wave owns them.

**Measured as** verified, merged PRs per window hour, share of the window with rows running, lines
the owner reads per wave, and procedure lines the coordinator reads. 2026-10-07 baseline: 9 PRs in a
6.2-hour window (1.5 an hour), rows running for 3.2 hours (51%), 96 report lines, 1,204 procedure
lines.
