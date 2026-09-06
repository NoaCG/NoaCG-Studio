# noacg-task - start a scoped piece of work with standing conventions applied

Shared canonical procedure for the `noacg-task` workflow - invoked as `/noacg-task` in Claude
Code, `$noacg-task` in Codex.

Start a scoped piece of work in NoaCG Studio with the repo's standing conventions already
applied, so they don't have to be restated each session.

Task: the argument given at invocation.

Do not just print a plan for the user to execute - carry out the setup yourself, report
what you find, and stop whenever reality disagrees with the happy path.

## 1. Land on a feature branch

- `git rev-parse --abbrev-ref HEAD` and `git worktree list`. **If the session starts on
  `main`, branch first** - `main` is only ever touched when the user asks for it in that
  message, from any checkout.
- **Work in a worktree of your own**, and make it first:
  `git worktree add -b <branch> .claude/worktrees/<name> main`. The checkout that holds `main`
  belongs to the landing queue, which checks out, merges, builds and resets that tree during
  every integration - a read taken there mid-landing can be wrong with nothing saying so, and a
  build run there gates `main` while still reporting green.
- Several sessions are typically active at once, so run `node scripts/worktree-activity.mjs`
  before starting something that could collide. It prints every other worktree's uncommitted
  and not-yet-merged files. Never act on another worktree's files.
- Report the branch and checkout you settled on, and this checkout's dev port
  (`node scripts/dev-port.mjs`).

## 2. Read the contracts that govern the work

The root `AGENTS.md` (imported by `CLAUDE.md` for Claude; read directly by Codex) carries the
product identity and the non-negotiables. The binding per-area detail lives in nested
`AGENTS.md` files - **read the ones covering the areas this task touches before editing them**,
including from outside that directory:

| Touching | Read |
| --- | --- |
| template/SPX types, fields, element identity | `src/model` |
| the wizard catalog, `:root` style contract, easings | `src/templates` |
| `applyTemplate`, undo, editor UI state | `src/store` |
| blocks, the timeline engine, animation data | `src/blocks` |
| the SPX generation harness, prompts, routing | `src/ai` |
| export targets and packaging | `src/export` |
| render manifests, schedules, tier limits | `src/render` |
| the landing page's motion system | `src/landing` |
| the React app, docks, inspector, wizard, video shell | `src/components` |
| a Playwright spec, or running the suite | `e2e` |
| a serverless route | `api` |
| a schema change or a migration | `supabase` |

**Read the LEAF contract, not only the one this table names.** Every template category, and
most `src/components` and `src/ai` subdirectories, carries its own `AGENTS.md`, and that is
where the rule that governs the file you are editing usually lives.

Also binding before generating or judging any template: `docs/DESIGN_LANGUAGE.md` (taste and
motion) and `docs/GOALS.md` - where only `## NOW` is the current push. Everything under
`## NEXT`, `## THEN` and `## Parking lot` is parked, and parked work is not started because a
doc describes it well.

State which ones you read, and name any contract in them that constrains this task.

## 3. Say what the work serves, then decide it yourself

- `node scripts/owner-receipts.mjs` lists the owner's standing asks. **If this task is one of
  them, mark that receipt `active` with this `branch:` now** - picking the work up is the only
  moment anyone can say so, and the landing preflight never guesses from a branch name.
- Give a short plan: what changes, which files, what could break, and how it will be verified.
- **Then start.** A design question, a merge conflict, which of two options, when - consult the
  strongest model available, decide, and record the decision where the owner can revert it.
  A question reaches him only when it names its own reason in its own text - `needs: account`,
  `money`, `identity`, `harness` or `alignment` - and a technical problem is never one of them.

## 4. Verify - a green build is not enough

- `npm run build` (typecheck + lint + build) is the CI gate; the tree stays lint-clean, so
  fix findings properly instead of adding eslint-disable comments.
- **If the behaviour is observable, observe it.** There is no unit-test suite. Use the E2E
  suite for user-facing flows, and add a spec for any new flow in the same commit or it only
  ever runs at night. `npm run test:e2e:focus:queued` is the inner loop; once this branch has
  taken `main` in, `npm run test:e2e:integration:queued` instead - a clean merge is not proof
  the integration worked, because both sides were verified against a tree that no longer exists.
- **One browser-driving job per MACHINE, not per worktree.** A suite, a catalog sweep and a
  bench are the same RAM-bound workload. Don't sit and wait for a slot: `npm run queue`
  takes the command and returns a job id at once, and `npm run jobs` says what is running and
  why anything waits. The `:queued` scripts are for when a gate needs the verdict now.
- **After a catalog change run `npm run catalog:affected`.** It names the designs the change
  can move and prints the catalog gates already scoped to them. A single category still sweeps
  with `node scripts/l3-sweep.mjs <shots-dir> <category>`.
- **If the change moves what a graphic LOOKS like, render it and look at it**: queue
  `node scripts/taste-frame-review.mjs --affected`, then answer `docs/VISUAL_TASTE_REVIEW.md`
  in writing. Every source-level gate passes a visibly broken graphic.
- Never mark work done on a green build alone.

## 5. File what a human still has to see

Work that is observable in the product adds its **own file** under
`docs/acceptance/owner-queue/` in the same commit: front matter carrying `kind:` and `date:`,
then what changed, the route to it in under a minute, and what to look at. One file per item -
a shared list conflicts between parallel sessions, and a conflict stops a landing job dead.
`docs/acceptance/OWNER_QUEUE.md` owns the shape; an item with no route is not an item.

## 6. Commit, then hand the branch to the queue

- Commit each completed, verified step to the **feature branch** with a message that explains
  the actual change and reads as human-written - no chat/session language, no planning
  codenames, no agent or AI mentions, and never a `Co-Authored-By` trailer. Don't commit
  `dist/`.
- The `check` workflow runs the pre-merge chain - review, simplify, verify - over this branch.
- **When the work is FINISHED, run the `queue-merge` workflow.** Landing is serialized, not
  permissioned: the queue lands one branch at a time, gated on CI, and merging never waits on
  the user. Queueing IS the declaration that the work is done, and only this session can make
  it - so queue it when you mean it, never merge into `main` by hand, and never queue a branch
  another session owns.
- Then run the `handoff` workflow if the session is finished, so the owner knows which sessions
  are done and which still want a look.
