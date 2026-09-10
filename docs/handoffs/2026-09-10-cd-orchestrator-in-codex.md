# CD - the orchestrator, run in the other harness

**Branch:** `claude/cd-orchestrator-in-codex`, queued. **Commits:** `5ed1be97` (the measurement and
the adapter fix), `c7ad7ff3` (the delegate's plan committed as evidence), `1d4474ec` (the check's
five findings). **Check stamp:** `1d4474ec` PASS - review `delegated` 5/5 fixed, simplify `inline`,
verify `inline`, taste not applicable. **CI:** run 34529551230 green; Build, Factory gates, E2E plan
and CI gate ran, the E2E shards skipped because nothing under `src/` changed.
`check:shared-instructions` ran inside Build and passed.

## What landed

`docs/metrics/2026-09-10-orchestrator-in-codex.md` is the deliverable: the owner's 5 September ask
answered by a measurement instead of by documentation. Codex `$orchestrator` planned the same night
wave from the same commit `0634d6bd`, the same window and the same inputs as the live Claude plan,
and both documents were scored by the same exported `checkPlan()` - Claude 4 rows and 0 problems,
Codex 3 rows and 4 problems. Thirteen differences, each classified. The delegate's own plan is
committed beside it as `docs/metrics/2026-09-10-orchestrator-in-codex-plan.md` so the diff can be
re-derived without spending another Codex window.

Both Codex adapters were eleven lines of pointer naming no harness fact at all.
`.agents/skills/orchestrator/SKILL.md` now names the four mechanisms the shared procedure assumes -
no Agent tool, no Monitor, no network, writes confined to the session's own directory - and routes
each to the arm that already exists. The `$o` alias points at that file rather than repeating it.
The orchestrator common path is unchanged at 640/640.

## What needs the owner

Nothing. `needs: none`.

## The five proposed shared-contract edits, NOT applied

The orchestrator session owned `.agent-workflows/orchestrator.md` and its module directory that
night, so these are written down rather than made. They are also in the receipt
(`docs/backlog/orchestrator-runs-the-same-in-codex.md`), which is the durable copy; this section
carries the evidence a reader would want beside each one.

**Before touching any of them: the core is at 199/200 lines and the common path at 640/640.** None
of these has room to be answered by adding a paragraph, and `check:shared-instructions` prints both
numbers on every run.

1. **The core says the session launches its own rows, with no Codex arm.** The line is *"This
   session LAUNCHES its own rows (`launch.md`) - the user pastes nothing and starts nothing"*, in
   the always-loaded core, where it fires before `launch.md` is read. There is no Agent tool in
   Codex. `night.md` line 84 carves out the Monitor and `report.md` line 63 the morning report;
   nothing carves out the launch, which is the larger of the three because it decides whether an
   unattended night is possible there at all. Evidence: the delegate's plan ends *"Launch status
   for this measurement: not launched"*, and its section 5 opens with a run order for rows nobody
   can start. **Proposed:** one clause on that core line, of the same shape as `night.md`'s -
   *"in Codex there is no Agent tool, so section 5's prompts are what the user pastes"*.
2. **The wave-state store is unreachable from Codex.** It resolves to
   `C:\claude\NoaCG-Studio\.git\noacg-jobs\wave-plans\` - I ran `wave-plan-store.mjs --path` to
   confirm - and a Codex session writes only inside `[workdir, /tmp, $TMPDIR]`. From the
   orchestrator home or any worktree that path is outside the sandbox; the one checkout it is
   inside is `main`'s, which core exception 4 forbids the orchestrator from occupying. **Proposed,
   and it is a decision rather than a wording fix:** either the store moves somewhere a sandboxed
   session can reach, or `wave-plan-check.mjs` grows a mode that scores a plan sitting in the
   workdir and says in its verdict that the plan is not durable yet. The second is smaller and does
   not move a file the whole orchestration depends on.
3. **`gh` cannot run in the Codex sandbox.** The delegate's plan says the GitHub query *"failed at
   the sandbox network boundary"* and correctly declines to call `main` red or green on a stale
   local file. But core section 3 says a landing refusal *"is on the pull request (`gh pr view
   <n>`)"* and `grounding.md` sends the session to `gh run view <id> --json jobs` for the morning
   verdict. Neither runs there. **Proposed:** section 3 gains the arm the delegate invented on its
   own - report it UNCHECKED and name the command, rather than asserting from a local file.
4. **`prompts.md`'s block template has no slot for the delegation content `routing.md` requires.**
   `routing.md` step 3 demands the prompt declare the delegate's tool set, give absolute paths,
   enumerate the files and write the acceptance conditions first. The template in `prompts.md` has
   no line for any of it. Both planners invented a placement and they invented different ones:
   Codex minted a `DELEGATE` line in every block, Claude folded it into `POOL` and the `DO` steps.
   **Proposed:** add `DELEGATE` to the template. Cheap, and it can travel with any wave that
   touches that file.
5. **The `MODEL` line means two different things.** Claude wrote `MODEL opus high`, a rung
   `launch.md` maps to an agent definition; Codex wrote `MODEL agy-gemini / gemini-3.7-flash-high`.
   With no Agent tool there is no definition for a rung to name. Downstream of 1 and it disappears
   when 1 is answered - do not fix it separately.

## Traps that exist in no repo file

- **A delegation that must produce a file needs `--write`, and the classifier will not give it to
  you.** The first launch was read-only, so `apply_patch` was denied and nothing came back; the
  resume with `--write` was refused by the auto-mode classifier. The way through, and it is the
  better way, is to resume the same thread read-only and tell it to PRINT the artifact as its final
  reply - `codex-rescue.mjs result <id> --json` carries the whole thing at
  `.storedJob.result.rawOutput`, 33 KB here with no truncation. The thread keeps all its grounding,
  so the second call is cheap.
- **A comparison run against a live wave is contaminated by git refs.** The three sibling rows'
  branches already existed at the merge base, and the delegate read the letters and the slugs
  straight off them. Both plans landing on CA/CB/CC is therefore not independent agreement, and the
  write-up says so. Anyone repeating this should either run it before the wave's branches exist, or
  give the delegate a checkout whose refs do not carry the answer.
- **`checkPlan()` is the way to score a plan that is not in the store.** The CLI refuses one and
  that refusal reads as "the gate cannot run here", which is what I believed until the code review
  caught it. The exported function is pure, its inputs (`handoffFiles`, `readReceipts`,
  `alignmentState().pending`, `weeklyCandidates`, an `exists` probe) all come from the repository
  root, and a twenty-line runner scores anything. On Windows the dynamic imports need
  `pathToFileURL(...).href` or node refuses the `c:` scheme.
- **`ALLOW_AI_MENTION=1` is required to commit anything about the agent harnesses**, and the guard
  hook only tells you after it has refused the commit.
- **A worktree-isolated session cannot run compound shell commands that mention git**, and it also
  refused a plain `node scripts/... ; node scripts/...` pair here. Run them one per call.

## What is left, and why

- **The five edits above.** They are the whole remainder of the owner's ask. The receipt is
  `advanced`, not `done`, and its `note:` says exactly that.
- **The effort question is untouched.** This ran at `--effort high`; the owner's own
  `~/.codex/config.toml` sets `model_reasoning_effort = "low"`, silently. Re-running the same
  comparison at low is the cheapest remaining experiment and nobody has done it.
- **The write half of the workflow was never exercised.** A read-only delegate cannot write the
  wave-state file, record a launch or append a heartbeat, so those arms were read rather than run.
- **No owner-queue item was filed.** Nothing here is observable in the product - the route to this
  work is reading two files - and row CB held the owner-queue drain that night, so adding to that
  folder would have fought it.

## Cost, measured

The Codex 5-hour window read 1% used at 20:05 UTC and 42% at 20:25. Three other rows were
delegating into the same subscription over that window and this session's was one of the two
largest of fifteen, so an orchestrator plan in Codex is on the order of fifteen to twenty points of
a five-hour window. Two ledger lines are recorded: the first launch `unusable / prompt` (ours, the
missing `--write`), the resume `reviewed` with 4 review findings.

## Pointers

- The measurement: `docs/metrics/2026-09-10-orchestrator-in-codex.md`
- The delegate's plan, verbatim: `docs/metrics/2026-09-10-orchestrator-in-codex-plan.md`
- The receipt, now `advanced`: `docs/backlog/orchestrator-runs-the-same-in-codex.md`
- The adapters: `.agents/skills/orchestrator/SKILL.md`, `.agents/skills/o/SKILL.md`
- The Claude side of the comparison, for as long as the store holds it:
  `C:\claude\NoaCG-Studio\.git\noacg-jobs\wave-plans\2026-09-10-night-wave-plan.local.md`
