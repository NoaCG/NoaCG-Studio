# U - the wave plan now outlives the session that wrote it

Branch `claude/u-wave-plan-survives`, queued. Row U of the 2026-09-08 night wave, from section 5 of
`docs/handoffs/2026-09-08-orchestrator-week.local.md`.

## What the weekly script could not see, and why

Reproduced before anything was changed. `node scripts/orchestrator-week.mjs` reported 0 waves, 0
rows and 0 `DECIDED:` for a week in which nine lettered rows landed on 2026-09-05 alone.

A `find` over the whole repository tree turns up exactly two wave plans on this machine, both dated
2026-09-08, both in `.claude/worktrees/orchestrator/docs/handoffs/`. The plans for 09-05, 09-06 and
09-07 do not exist anywhere. Three things together caused that:

- A plan is `docs/handoffs/*.local.md`, gitignored at `.gitignore:237`. Git archives every other
  handoff and not this one, which is the exception that made the loss easy to miss.
- `wave-tick.mjs`'s `newestWavePlan(now, root)` read `<root>/docs/handoffs`, and `root` is the
  checkout the caller happens to be in. So the plan's location was "whichever worktree the
  orchestrator session occupied", and a plan in a throwaway worktree dies with it.
- The orchestrator's home worktree, which the contract has called permanent since 2026-08-30 and
  which `cleanup-worktrees.mjs` exempts by name, has a birth time of **2026-09-08 19:09**. It did
  not exist for the eight days after `orchestrator-home.mjs` landed. Nothing deleted it; sessions
  simply did not run the script that creates it. The script's own header predicted this: prose gets
  skipped.

The counting half landed first and on its own (`bb172b9a`), because it is the half that cannot be
wrong. The page now names every directory it searched and what each held, marks the rows, pools and
`DECIDED:` counts UNMEASURED, and distinguishes three cases that all used to print as zero: nothing
searched, plans on disk but outside the window, and no plan anywhere.

## Where plans live now, and the argument

`<git-common-dir>/noacg-jobs/wave-plans/<date>-<day|night>-wave-plan.local.md`, printed by
`node scripts/wave-plan-store.mjs --path <date> <day|night>`.

The two candidates the weekly review named were "make the home a durable home" and "write the plan
outside any worktree, beside the job store". I took a blocking second opinion (Fable) with the
evidence and it argued for the store's location with the home option's enforcement, which is what
landed. The argument that decides it is a lifetime question, not a location one:

- A worktree exists only if a session remembered to run a script, and the repo's tooling reasons
  about deleting worktrees every day. The home's own record is the proof: declared permanent,
  exempted by name, and absent for eight days anyway.
- `.git/noacg-jobs/` was born 2026-08-25 and still holds files written 2026-08-26, through every
  worktree removal, every `git clean` and every rewrite the landing queue made of the primary tree.
  It is not remembered into existence; it is there because the repository is.
- Putting human-authored markdown under `.git/` is not a new idea here. `relay.mjs` already keeps
  `<git-common-dir>/noacg-jobs/relay/<branch>.md` for the same durability reason, and `pruneJobs`
  only ever removes `<id>.json` and `logs/<id>.log`, so a sibling folder is outside its reach.

Two things I decided against the consult's shape, and why. I kept the `.local.md` suffix rather
than dropping it: it still means "not tracked by git", and keeping it means one glob matches a plan
in the store and a plan in the old location, which is what lets the weekly review read across the
move without a second pattern to keep in step. And I did not make `--plan` required on
`wave-launch.mjs record`: `launch.md` and `night.md` both spell that command without it, so
requiring it would break every launch until those files change, and `night.md` belongs to row S
tonight. Omitting `--plan` now means "the plan the store holds" instead of "no plan", which gets
the ledger its provenance without touching a caller.

**There is deliberately no fallback in the resolver.** A fallback would find a plan written into a
worktree, let the wave launch on it, and lose it exactly as before. `wave-tick.mjs` resolves the
store and nothing else, so the plan check, the handoff drain, the candidates loop and the
session-start hook all followed with no edit of their own. Reading the old location is the
archive's job and only `orchestrator-week.mjs` still does it, with a comment dating that sweep for
removal.

Two refusals keep a plan from being written elsewhere: `wave-plan-check.mjs`, which the contract
makes the gate on every launch, and `wave-launch.mjs record`, which is the code choke point every
launch passes through whether or not anyone ran the check.

## What I traded out of the instruction chain

`check:shared-instructions` is gated on LINES here, not bytes, and the common path was at 640/640
with the core at 198/200.

- Added one line to the core: the wave-state file's path phrase became two lines instead of one.
  The refusal list on the same paragraph absorbed "a plan outside the store" by shortening "a
  scarce slot minted twice" and "a path that does not exist" - no new line.
- Removed two lines from `orchestrator/grounding.md`: the sentence saying "the tick, the drain and
  the plan check all read the checkout they run in, so a session that plans from a branch worktree
  leaves its state where the next orchestrator will not look." After this change that is false, so
  it is a deletion rather than a trade of live text for live text.
- Net: core 199/200, common path 640/640 unchanged. **No ceiling was raised.**

`.agent-workflows/orchestrator/report.md` was NOT touched. It names the wave-state file only
abstractly and carries no path, so nothing in it went stale, and the live orchestrator writes its
morning report from it in a few hours. `night.md` was left alone for row S.

## Is tonight's plan findable

Yes, both halves tested rather than assumed.

- Tonight's plan is still in the home at `docs/handoffs/2026-09-08-night-wave-plan.local.md`, and
  `orchestrator-week.mjs` counts it through the legacy sweep. Verified: the page listed it with
  its five rows.
- A plan written to the store is found end to end. Against a throwaway store
  (`NOACG_JOBS_DIR`), `newestWavePlan` resolved it, `wave-plan-check.mjs` accepted its location,
  `wave-launch.mjs record` accepted it, and the weekly page counted it alongside the legacy one.
- The review's high finding was reproduced and re-derived after the fix: `harness-usage.mjs --wave`
  had been left reading `docs/handoffs/` alone, which would have made the spend section of every
  wave report exit 2. With a plan in the real store it now returns a window; the probe plan was
  removed afterwards so the store is empty again.

## The cutover, and what could still bite

Tonight's wave is safe: the live orchestrator runs pinned scripts from a home detached at an older
`origin/main`, and nothing in the night loop fast-forwards it. Tomorrow's day wave runs
`orchestrator-home.mjs` at grounding, picks up the new code and the new contract together, and
writes its plan to the store. The old plans stay where they are and the weekly sweep still reads
them.

The one hazard: **if some session fast-forwards the orchestrator home mid-wave tonight**, the
loop's bare `node scripts/wave-tick.mjs` would stop finding tonight's plan in the home and would
warn instead of appending. The cost is the remaining heartbeat lines, not the plan; the fix in the
moment is `--wave-plan <path>`, which `wave-tick.mjs` still honours without a location check
precisely so it stays a recovery path.

The residue worth writing down honestly: durability of the file does not make decisions get
written into it. A wave whose session records no `DECIDED:` lines still counts zero - but zero now
means "nothing was decided" rather than "the file was lost", which is a count the weekly report can
act on. That is the whole point of the counting half.

No owner-queue item was filed. Nothing here is observable in the product; the only human-facing
surface is next Tuesday's weekly page, and "run this node script and look" is the shape
`OWNER_QUEUE.md` calls a technical problem, which is never his.

## Needs the owner

Nothing.

## The check

- `review: delegated` - the code-review skill, level `high`, ran and handed its findings back. It
  scope-checked correctly against `origin/main...HEAD` (local `main` in this worktree is stale, so
  the true fork point is `2a0d4b85`, not what `git merge-base main HEAD` prints). Eight findings,
  all eight fixed. The two that mattered were consumers I had missed entirely - `harness-usage.mjs`
  and `handoff-trace.mjs`, the second of which feeds `warn-edit.mjs` and `warn-command.mjs` and
  would have flagged every legitimate handoff drain as untraced within one wave.
- `simplify: inline` - the skill returned fan-out instructions rather than a result, so the leg ran
  in this context per `check.md`'s four-branch rule. Two findings, both fixed: my own path
  comparison re-implemented `samePath` from `worktree-cleanup-lib.mjs`, and the no-plan block
  printed a "looked nowhere" bullet inside a "Looked in:" list.
- `verify: inline` - `npm run build` green, exit code read directly, not through a pipe. 101 test
  files, 1346 tests, 1345 pass, 0 fail, 1 skipped (pre-existing). `test:e2e:affected` not run and
  not required: the diff is scripts and workflow documents, no product code.
- `taste: not applicable` - nothing here can move what a graphic looks like.

## Pointers

- `scripts/wave-plan-store.mjs` - the store, its CLI and the argument for its location, in the header.
- `scripts/wave-tick.mjs`, `newestWavePlan` - the single resolver every consumer shares.
- `scripts/wave-plan-check.mjs` `main()` and `scripts/wave-launch.mjs record` - the two refusals.
- `scripts/orchestrator-week.mjs`, `noPlansBlock` - the loud no-plan page and the legacy sweep.
- `.agent-workflows/orchestrator.md` "The wave-state file" and exception 4;
  `orchestrator/grounding.md` "Before any read: the home".

## What the next session should know

The instruction chain is gated on LINES for the orchestrator core and its every-plan modules, and
the common path has been sitting exactly at its 640 ceiling. Any row that wants to add a sentence
to that chain has to find a sentence that has become false and delete it. That is a healthier
constraint than it looks - this row found its two lines by noticing that a rule describing a
mechanism had outlived the mechanism - but it means "add a note to the contract" is never the cheap
option, and a row that plans on it will stall.
