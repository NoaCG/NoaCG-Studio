# Shared agent instructions and workflows

This repository supports Claude Code and Codex from one set of project rules and workflow
procedures. The build fails when their adapters drift.

## Canonical sources

- `AGENTS.md` is the authoritative project-instruction file. Nested `AGENTS.md` files add
  binding rules for their directory trees.
- Each sibling `CLAUDE.md` is a thin `@AGENTS.md` import. It may add genuinely Claude-specific
  rules, but it must not copy the shared contract.
- `.agent-workflows/<name>.md` contains the complete, tool-neutral procedure for a reusable
  workflow.
- A workflow too large to be read in full on every invocation may be **modular**: the canonical
  file stays the entry point and becomes an always-loaded core with a routing table, and the rest
  moves to `.agent-workflows/<name>/*.md`, loaded only when the phase that needs it starts. The
  core carries a hard LINE LIMIT declared in `MODULAR_WORKFLOW_LINE_LIMITS`
  (`scripts/check-shared-instructions.mjs`), and the gate also refuses a module nothing links to
  and a link to a module that does not exist. Core and modules are ONE contract to every other
  check: pinned markers and `scripts/` references may live in either. `orchestrator` is the first,
  split on 2026-09-01 after the single file reached 924 lines. **The core is not the always-loaded
  context**: the modules the routing table marks *every plan* load beside it on every invocation,
  so the gate also sums that COMMON PATH against `MODULAR_WORKFLOW_PATH_LIMITS` (a budget that only
  ratchets down) and refuses an `npm run` script a contract names that `package.json` lacks - a
  stale command name is a cached fact wearing an instruction's clothes.

## Tool adapters

- Claude Code exposes a workflow through `.claude/commands/<name>.md` or
  `.claude/skills/<name>/SKILL.md`.
- Codex exposes the same workflow through `.agents/skills/<name>/SKILL.md`.
- An adapter contains only metadata, invocation policy, argument translation, and a pointer to
  the canonical workflow. Behavioral changes belong in `.agent-workflows/<name>.md`, so they
  reach both tools in the same commit.
- Shared workflows must use repository state and repository documentation as evidence. Do not
  make tool-private memory or a user-specific home-directory path part of the shared contract.
- Destructive workflows must be explicit-only in both tools. Claude uses
  `disable-model-invocation: true`; Codex uses
  `agents/openai.yaml` with `policy.allow_implicit_invocation: false`.

Codex project skills use `.agents/skills`, not the legacy `.codex/skills` location. The
repository's `.codex/config.toml` is still used for trusted project configuration.

## Short aliases

A workflow may have a short invocation alias - `/n` and `$n` for `next`, `/o` and `$o` for
`orchestrator`. An alias is nothing but
a second pair of adapters (`.claude/commands/<alias>.md` and `.agents/skills/<alias>/SKILL.md`)
pointing at the target's canonical workflow, so a shortcut can never grow its own copy of the
procedure. `WORKFLOW_ALIASES` in `scripts/check-shared-instructions.mjs` is the registry; the
check fails if either adapter is missing, thick, or points somewhere else. A destructive
(explicit-only) workflow must never be aliased - a one-keystroke command must not be able to
land anything.

## Permissions

**The allowlist is `.claude/settings.json`, which is TRACKED, and that is the whole point.**
Claude Code also reads `.claude/settings.local.json`, and until 2026-08-30 every approval in this
repo went there - which is why the list stayed tiny and reactive while the same commands kept
prompting. That file is gitignored (a `**/.claude/settings.local.json` line in the user's global
git ignore), `git worktree add` never copies ignored files, and `cleanup-worktrees.mjs` lists it
under `REGENERABLE_IGNORED` and deletes it with the worktree. So an approval given in a worktree -
which is where nearly all work happens - is thrown away when that worktree goes, and the next
session is asked the same question. Entries that belong to the PROJECT go in the tracked file,
where they land on `main` and reach every checkout afterwards. `settings.local.json` is for one
person's one machine, and nothing else.

**What may be added.** One test: could this command, with any arguments that match the pattern,
destroy or exfiltrate something? Read-only inspection is the easy yes - the repo's own reporters
(`jobs.mjs`, `merge-order.mjs`, `worktree-activity.mjs`, `blocked-sessions.mjs`, the `check:`
scripts), the build and lint gates, a typecheck. The `check:` scripts are listed one by one
rather than as a `check:*` prefix, because `check:advisors` reads a Supabase management token out
of `.env` and sends it to `api.supabase.com` - a blanket prefix would have swept that in, and
would silently sweep in whatever `check:` script is written next. Prefix patterns are safer than they look for
compound commands, because Claude Code splits on `&&`/`;`/`|` and every segment must be allowed
on its own - but they are NOT safe within one segment, where trailing arguments still match. That
is what keeps `git push` behind a prompt: no prefix can exclude `--force`, `--delete`, or a `main`
refspec appended to it. Same reasoning bars anything taking a payload the machine later executes
(`npm run queue -- "<command>"`, `jobs.mjs add`), anything that spends money (`bench:*`, `eval:*`,
`gh workflow run`), anything that deletes, and anything holding credentials.

**The delegation channel is allowlisted on purpose (2026-09-01),** because a wave must never
depend on a permission prompt being answered and every delegated launch was one - and every entry
is paired Bash + PowerShell, because the primary shell here is PowerShell and a Bash-only entry
leaves the exact prompt it was written to remove. The reasoning, entry by entry: `wave-tick.mjs`,
`harness-usage.mjs` and `delegation-outcome.mjs` observe or append one validated line to a
home-directory ledger - nothing to destroy. **Antigravity's read door is `npm run agy:read`**,
whose `--read-only` armor makes the wrapper itself refuse a trailing `--write` - a prefix pattern
cannot exclude a trailing argument (the `git push` reasoning above), so the refusal lives in code
instead.

**The WRITE door was opened on 2026-09-03** (owner: Antigravity should be a real implementation
worker, with its writes scoped to the assigned worktree and landed the way everything else lands).
It had been left prompting because agy's grants are machine-global, so an auto-approved write
channel could let one session's delegate edit another session's branch mid-flight. That objection
is now answered where it can be, in the wrapper rather than in the pattern: a `--write` run is
refused outside a LINKED WORKTREE, refused on `main` and on a detached HEAD, and prints the files
it changed so the owning session reviews a list rather than a claim. What is **not** answered, and
is stated here rather than implied: agy can still reach a sibling worktree once it is running, so
a write delegation is made from the row that owns the work, with absolute paths into that row's
own worktree, and the reviewer treats an unexpected path in the printed list as the incident it
would be.

`codex-rescue.mjs` is allowed for `launch`/`poll`/`status`/`result` only - `cancel` kills
processes and stays behind a prompt. What none of these can do is land, push, or spend money,
which is where the prompts remain.

**Putting a dead landing back is allowlisted; declaring one is not (2026-09-04).** `node
scripts/jobs.mjs requeue <branch>` and `npm run requeue <branch>` are allowed, paired Bash and
PowerShell. `jobs.mjs add-merge` stays behind a prompt, and the split is the whole point of there
being two verbs. Against the test above: `add-merge` takes `--accept <kind>` and `--onto-red-main`,
each of which the landing script documents as a flag a person types rather than a condition it
infers - one waives a named merge-order collision, the other lands onto a main whose own CI is red.
No prefix pattern can exclude a trailing argument (the `git push` reasoning above), so allowlisting
`add-merge` allowlists both, and "everything it triggers is the fully gated landing path" stops
being true. It also DECLARES: a branch at whatever commit it is at now is finished, which only that
branch's own session may say.

`requeue` can express neither. It takes a branch name, refuses every flag outright rather than
dropping one silently, and refuses any branch with no landing to re-run - so it cannot invent a
declaration. It copies the dead job's own command, which carries forward a judgement a person once
made and cannot add one. And it re-pins by the same rule an automatic retry uses: the pin may only
move over commits provably the previous landing's own integration of `main`, so a commit that
arrived after the work was declared finished refuses and is sent to `add-merge`. What it can spend
is a CI run on a branch that refuses again - against a night that stops on a prompt nobody is awake
to answer. Five finished branches waited on the owner to paste five commands on 2026-09-03, and the
session that had verified every pin was the one party that could not act.

**Bypass mode is not the fix.** A command that prompts nightly is either an allowlist entry
somebody has not written down yet, or a mechanism that should not need the command; turning the
check off machine-wide answers neither, and it answers them for every session at once.

**`node scripts/blocked-sessions.mjs`** names any session that has been waiting on a tool call for
30+ minutes, by reading transcripts rather than branch tips, and says for each whether a process
still holds it - `scripts/claude-agents.mjs` reads Claude Code's own live-session inventory
(`claude agents --json`), which is the third liveness signal and the only one that sees a PROCESS
rather than a file. It is a capability probe, never a version check: where the inventory does not
answer, every row reads `unknown` and the script reports exactly what it reported before the
signal existed. Its header explains what a wait can and cannot tell you; the orchestrator's watch
loop runs it each tick, and `scripts/session-liveness.mjs` uses the same inventory's POSITIVE
verdict to stop the cleanup sweep touching a worktree somebody is sitting in.

**Three more read-only reporters are allowlisted since 2026-09-02**, paired Bash + PowerShell like
the rest: `owner-receipts.mjs` (the owner's asks and their age, from `docs/backlog/` front matter),
`handoff-drain.mjs` (which handoff files the newest wave plan has classified) and
`wave-plan-check.mjs` (whether a wave-state file is ready to launch from). Each reads files and
git, and writes nothing.

**A `Stop` and `SubagentStop` hook, `scripts/hooks/stop-wait.mjs`, refuses a turn that ends
WAITING on something that cannot wake a stopped session** - a CI run, a landing job, a background
watcher - and tells the session what to do instead. Four sessions ended that way on 2026-08-30 and
2026-09-01 with their branches green and unqueued. It reads only the last assistant message, so an
ordinary turn end costs nothing and a session that has already queued its branch is never
interrupted; the patterns and the decision are in `scripts/stop-wait.mjs` with their tests.

**A `PreToolUse` hook on `mcp__ccd_session__spawn_task`, `scripts/hooks/spawn-task-guard.mjs`,
refuses a background-task chip** and names the two places the work actually goes: fix it here on
this branch, or file it as `docs/backlog/<slug>.md`. The tool stays ALLOWLISTED - the barrier is
the hook, not the permission system, so a declared chip does not also collect a prompt the owner
would have to answer. The declaration is an `OWNER-DECISION: <reason>` line in the prompt, for the
one case `.agent-workflows/orchestrator/launch.md` keeps: a start that is genuinely his call,
meaning real money, a model pick worth his judgement, or a scope decision. `NOACG_ALLOW_TASK_CHIPS=1`
turns it off for a session or a machine. Why it is a hook rather than a fourth restatement of the
rule, and what it deliberately does not try to judge, are in `docs/MISTAKE_TRIGGERS.md`.

## Tool-specific exceptions

`/rescue` is intentionally Claude-only. It delegates a long-running task from Claude Code to
the Codex companion plugin, so invoking it from Codex would have no coherent meaning. Every
other repository-owned Claude command or skill must have a canonical workflow and Codex
adapter.

Its mechanics live in `scripts/codex-rescue.mjs`, not in the command file, because the plugin
lives in a version-keyed cache that a plugin upgrade replaces wholesale - a fix written there
would silently disappear. The wrapper launches the plugin's own companion script through a relay
so the Codex worker is never a live descendant of the calling session, reconciles pid liveness
against job status so a killed job stops reporting as running, and cancels with argv that Git
Bash cannot rewrite. `scripts/codex-rescue.test.mjs` pins all three; the defects they replace are
written out in that script's own header, which is where the record lives - the first delegation
trial's handoff was a working note and has since been swept.

## What a harness actually cost

`npm run harness:usage` prints, for any time window, what each harness spent - Claude Code, Codex
and Antigravity side by side. `--since <iso>`, `--hours <n>` or `--wave` (since the newest
`docs/handoffs/*wave-plan*.local.md` was written) pick the window; with no flags it is the last 24
hours, and `--json` gives the same numbers to a script. It reads only local files, calls no API,
and writes nothing.

It exists because "am I paying for the Codex subscription for nothing" was unanswerable, and
because every routing decision - which harness gets which work - otherwise rests on impressions.
The first delegation trial is the reason that matters: it felt like ten minutes of Codex working,
and Codex had written nothing.

**What it reads.** Codex: `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl` **and**
`~/.codex/archived_sessions/*.jsonl` - archiving is a move, so reading only the first tree loses
the finished work, which is most of it. Claude Code: `~/.claude/projects/<encoded-cwd>/*.jsonl`,
one directory per cwd, plus `<that directory>/<session-id>/subagents/*.jsonl` for every agent a
session launches - which is where a wave's work actually lives.

**Antigravity is the exception, and it is why `npm run agy` exists.** `agy` writes NO cumulative
usage anywhere on disk - its per-run usage is printed on stdout once and is then gone, there is no
`agy usage` subcommand, and no headless surface reports a remaining quota. So the third source is
not a transcript the harness wrote but a ledger this repo keeps: **`scripts/agy-run.mjs` is the one
way to call `agy`**, and it appends one JSON line per call to `~/.noacg/agy-usage.jsonl`
(`NOACG_AGY_LEDGER` overrides). The ledger sits outside the repository because a worktree is
disposable and ignored files die with it, and because spend is per machine rather than per
checkout.

```bash
npm run agy:read -- --model gemini-3.7-flash-high --label export-target-map "list every export target and its id"
```

`--model` is required: agy's result never names the model that answered, so an unpinned call is a
cost nobody can attribute afterwards. `--label` is required too (2026-09-01): a ledger line that
does not say what the call was for cannot feed outcome routing. `agy:read` is the pre-approved
read-only door; a writing call is `npm run agy -- --write ...` and deliberately still prompts. **A call made any other way leaves no trace anywhere and
cannot be recovered** - the report says so under its own table, because a small number there can
equally mean the harness was cheap or that its calls bypassed the wrapper.

**Antigravity's four token counts are never added.** agy's own `total_tokens` is input + output
only; it excludes thinking and cache reads, and cache reads are routinely several times larger than
everything else together. The report prints the four and stops.

**A failed call is counted.** `agy` answers a run that produced nothing with `status: SUCCESS`, exit
code 0 and an empty response - so the wrapper treats an empty response as a failure and records it
anyway. Two causes are known and need different fixes, and the wrapper's message names both: every
tool call auto-denied (there is no prompt to answer in print mode), or `--print-timeout` reached
mid-task. Neither is free - on 2026-08-30 the timed-out run alone spent 202 K input and 1.56 M
cache-read tokens and returned an empty string.

**What it cannot know: Claude Code's own 5-hour window percentage**, and Antigravity's quota at
all. There is no rate-limit event anywhere in `~/.claude/projects/**`; the transcripts carry token
usage and nothing else, and `agy` publishes no allowance headlessly either. The script therefore
prints the tokens and says so, rather than estimating a percentage of an allowance nobody has
published. Codex has the percentages only because Codex writes its own `rate_limits` payload into
the rollout.

**A percentage is a snapshot, not a rate.** `primary.used_percent` (the 5-hour window) and
`secondary` (weekly) describe a rolling window shared by every session, so two sessions'
percentages never add and a reading from four hours ago is not a reading about now. Exactly one
pair is ever reported, stamped with the time it was taken. A quiet window has no snapshot at all,
which is not the same as 0% used.

Three counting traps are handled and pinned in `scripts/harness-usage.test.mjs`. Claude Code
writes the same assistant record two or three times (and a resumed session copies earlier records
into its new file), so requests are deduped on message id plus request id across every file.
Codex's `last_token_usage` does not sum to its own session total, so the meter walks the
cumulative `total_token_usage` and takes deltas instead. And **`sessionId` does not identify a
session**: every agent a wave launches inherits the parent's `sessionId` AND the parent's
`gitBranch`, so counting those would report six agents in six worktrees as one session on one
branch. The transcript file is the session, and the cwd its first record names is the worktree -
which is why the "by project" table is the one to read for a wave, and the report says so under
the branch table.

## Google's harness is Antigravity CLI, not Gemini CLI

Verified 2026-08-30 on this machine. **Gemini CLI is retired** - Google announced the
consolidation at I/O on 2026-05-19 and individual accounts (AI Pro, Ultra, free Code Assist) lost
the legacy CLI on **2026-06-18**, with no grace period and no automatic migration. Only purchased
Gemini Code Assist enterprise licences may still run it. So Gemini CLI is not a harness to build
anything on.

**The IDE at `AppData\Local\Programs\antigravity` genuinely has no headless entry** - it is an
Electron app plus `resources/bin/language_server.exe`, with no `bin/`, no `.cmd` and no
command-line surface. That was never where the headless path lived. **Antigravity CLI is a
separate product**: a single Go binary called `agy`, installed to
`C:\Users\<user>\AppData\Local\agy\bin` (`~/.local/bin/agy` on macOS/Linux), and it does ship
headless mode. On this machine `agy` is already installed and already authenticated - `agy models`
answers with the model list without prompting for anything, and `agy --version` says which build
is answering.

The headless surface is whatever `agy --help` prints, and it is read from there rather than copied
here - the shape has been stable across the releases measured so far, and the flags this repo
depends on are the ones `scripts/agy-run.mjs` passes: `-p` with `--output-format json` for the
receipt, `--model`, `--effort`, `--mode plan` unless the call is a write, and `--print-timeout`.
`agy changelog` says what moved between two builds. That is a delegation channel of the same shape
as the Codex one.

**That step is done on this machine** (checked 2026-09-02): `agy` answers from
`C:\Users\ahonemi\.local\bin\agy.cmd` and `agy models` returns the model list with no prompt. It
had to be the owner's, because `agy install` edits shell settings. On a machine that does not have
it yet, the install and login commands are in `docs/HARNESS_ROUTING.md` under the Antigravity
section.

## Instruction size

Codex limits the bytes it loads from the root-to-current-directory `AGENTS.md` chain.
`.codex/config.toml` raises that limit for this trusted repository because its nested contracts
are intentionally detailed. `scripts/check-shared-instructions.mjs` calculates every chain and
**fails the build once one has less than 4 KB free**, not only when it goes over. That reserve is
in BYTES rather than a percentage of the limit, because the limit is a ratchet that only ever goes
down, and banking room by lowering it makes every chain's percentage WORSE, so a percentage gate
punishes the one move it exists to reward. Measured 2026-09-03, in two steps: cutting 11,343 bytes
took the wizard chain 99.7% -> 89.5%, then ratcheting the ceiling 112,000 -> 110,000 took it back
up to 91.2% with nothing written. The reserve
measures what a chain can still grow by, and it does not move when the ceiling does. The failure
names the chain, every file in it with its byte count, and the two ways out - a pointer, or a
split - and says that raising the limit is not one of them. On a GREEN run the check prints the
tightest chains with their remaining headroom, and marks any past 80% of the limit; that mark
stays advisory and stays a percentage, because it answers a different question - what share of the
budget one area is claiming. Printing on green matters because a chain a few hundred bytes under
budget is otherwise indistinguishable from a comfortable one, and since the limit only ratchets
DOWN (`.codex/config.toml`), "lower it until it fails" is not a way to find out.

When a chain runs short, RELOCATE rather than delete: move a section that describes one directory
into that directory's own `AGENTS.md` (plus the thin `CLAUDE.md` importing it) and leave a pointer
behind. The content still loads for the people editing that code, and it leaves every OTHER chain.
`src/components/` is the worked example - `wizard/`, `canvas/`, `video/`, `home/`, `fields/`,
`style/` and `auth/` all carry their own contract, so a session editing the wizard no longer loads
the video shell's; `src/templates/` did the same for `types/`, `pack4/` and ALL TWENTY categories
(the last eight on 2026-09-02, which ended the "small categories stay a paragraph in the parent"
rule - a category mints its pair on its first commit), `src/ai/` for `spec/`, `importAnalysis/`,
`spike/` and `creative/`, and `e2e/` owns the traps a SPEC falls into.

**A move is only free while the rule keeps firing where it is read.** A section can name one
directory and still bind outside it - `shared/clock.ts`'s "every design that emits `clockRuntimeJs`
owes that call in its `update()`" fires in three CATEGORY folders, so relocating it into
`src/templates/shared/` would buy bytes by hiding a rule from the people it is addressed to. When a
section splits that way, the established shape is a POINTER plus the bullets that bind from
outside, verbatim (`src/ai/AGENTS.md`'s Lite, Pro and `creative/` sections are the pattern). Bytes
bought by breaking where a rule fires are not headroom, they are a future defect.

Two things that look like relocation and are not. **Moving a section DEEPER on the same path buys
nothing** - a chain is measured to its leaf, so pushing `wizard/`'s detail into `wizard/steps/`
only moves which leaf is tightest. The saving comes from moving content OFF a shared ancestor into
ONE branch, so the siblings stop paying for it. And **when the files a section describes are loose
in the parent folder, moving THEM into a directory is the fix**, not shorter prose: that is how
`src/components/canvas/` came to exist on 2026-08-22, after the wizard chain had 297 bytes left and
every session editing a wizard step was loading the whole canvas gesture contract.

**And a contract can be past relocating.** `src/components/wizard/AGENTS.md` is the standing case:
its step rules and its shell rules share `draft.ts`, `WizardPreview` and `CreationWizard` state
throughout, so every candidate section binds both in `wizard/` and in `wizard/steps/` - and the
files are not loose, they are already in `steps/`, where moving them deeper buys nothing. That
chain had 1470 bytes free on 2026-09-02 with no move left in it. When relocation is exhausted the
next lever is a DELETION, which is the owner's ruling to make: file the proposed cuts and what
each loses under `docs/acceptance/owner-queue/` rather than taking them.

## Adding or changing a workflow

1. Add or edit `.agent-workflows/<name>.md`. For a modular workflow, put the change in the module
   that owns the rule and link any new module from the core's routing table - the core changes
   only for something every invocation must load, and only against its line limit.
2. Add or update the thin Claude adapter.
3. Add or update the thin Codex adapter and valid `name` / `description` frontmatter.
4. For a destructive workflow, configure explicit-only invocation in both adapters.
5. Add any repository-owned skill name to the `.gitignore` exceptions.
6. For a short alias, register it in `WORKFLOW_ALIASES` and add both thin adapters - never a
   second copy of the procedure.
7. Run `npm run check:shared-instructions`, the relevant focused tests, and `npm run build`.

Never put a second copy of the procedure in a tool adapter.

## Three traps in the tooling itself

- **A personal command silently outranks the project's.** Claude Code's precedence is personal >
  project, so `~/.claude/commands/<name>.md` always wins over `.claude/commands/<name>.md` for a
  colliding name - with no error and no warning. Confirmed live 2026-07-25 for `/safe-merge` and
  `/handoff`, which expanded to repo-agnostic personal versions while the correct project files
  sat on disk unused. (`next` and `cleanup-worktrees` have no personal counterpart;
  Codex has no equivalent collision - `~/.codex/skills/` and `~/.codex/prompts/` are clean.) Both
  personal files now open by checking for `.agent-workflows/<name>.md` in the invoking repo and
  deferring to it, so the collision is handled rather than avoided. **Do not assume a project
  command file's content is what runs** - `ls ~/.claude/commands/` for collisions first.
- **Codex writes ONLY to the session's worktree.** Delegating while the session sits in worktree A
  and the work lives in worktree B fails: the sandbox root comes from the session cwd, not from
  the path in the prompt, so restating the target path does not help. It refuses with "the
  requested worktree is read-only" and writes nothing - correctly, since editing another checkout
  would corrupt a parallel session. Move the SESSION (`EnterWorktree` at that path), then
  relaunch. **It fails intermittently**, which is what makes it dangerous: one batch of three got
  through and two were blocked from the identical cwd. Diagnose by comparing live processes
  against files on disk, not by waiting. A Codex task can also `git checkout` and DETACH HEAD in a
  shared worktree - it cannot commit (index.lock), but a later commit then lands off-branch.
- **Never round-trip a source file through PowerShell.** Windows PowerShell 5.1 is the only
  edition here, and it defaults to UTF-8 on neither side: `Get-Content` decodes as the system ANSI
  codepage and `Set-Content -Encoding utf8` re-encodes WITH a BOM. A quick sed-style patch
  therefore glues `EF BB BF` to the first token and mojibakes every non-ASCII character - and this
  repo's comment style is full of em dashes and arrows, so one round-trip of a single spec file
  turned a one-line change into a 42-insertion diff. **The tests still pass afterwards**, because
  mojibake in comments and a BOM before `import` are both legal. Use the editing tools.
