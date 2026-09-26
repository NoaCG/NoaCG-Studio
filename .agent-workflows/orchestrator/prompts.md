# Section 5 - the prompts

One fenced block per session, in START order, handed to the verified host route (`launch.md`)
and printed so the owner can read what started. A user-opened session is the fallback for a
classifier-refused row, never the default. Compact - target ~20 lines.
The pool decision each block rests on is `routing.md`.

Open the section with a **one-line run order** naming the letters and nothing else, so the user sees
the shape before reading a prompt: *"Start now: A, B, C, D. E follows on A landing. F held."*

```
SESSION A - <three-word name>
BRANCH <tool>/a-<name>
MODEL  <available model and effort> - <what KIND of thinking this task rewards>
START  now
TOUCHES <files>   MINTS <slot, or ->
GOAL   One sentence: what is true when this is done.
WHY    The real problem it solves: the docs/GOALS.md outcome it moves, or the reliability need.
ACCEPT The observable acceptance criteria this row must make true (the outcome's done criteria).
READ   file, file, file.
SPEC   docs/work-specs/<slug>/work.json AC-1,AC-2 (substantial work only; omit otherwise)
SIZE   small or standard (substantial work; decompose large autonomously)
DELEGATE <if used: pool, tools/read-write mode, absolute worktree, result route; evidence in GOAL/GATE>
CORE   The coherent outcome that must stand on its own; optional tail only if time remains.
       Investigate, choose implementation, verify and repair within TOUCHES.
TRAPS  only what is written in no repo file
GATE   npm run build and the necessary focused checks. Commit the verified outcome; queueing starts CI.
       Report state changes via wave-launch progress with the returned worker ID (hosts.md).
QUEUE  Then, as your LAST THREE actions and in this order:
       1. run /check (review, simplify, verify) on the branch - name each leg's mode;
       2. ONLY if meaningful work is left unfinished, write docs/handoffs/<date>-a-<slug>.md: what
          remains, why, the GOALS outcome, what done means. Finished work writes none; a row that
          finishes a handoff's work deletes that handoff in its own branch;
       3. run /queue-merge. Do not commit after queueing: queueing pins the branch, and a later
          commit makes the landing job refuse. Never merge into main yourself.
       Never end a turn waiting on something that cannot wake you - a CI run, a landing, a
       watcher. Read it to a verdict now, or hand off.
```

## The line rules

- **`SESSION <letter>` is the first line, always**, before the branch and before anything else.
  Same letter as the wave table, same letter as the branch name. This line exists for the user
  scrolling back at 4pm, not for the session reading it.
- **There is no `WAIT` line, because a wave is order-free.** `START` is `now` for every row this
  session launches at once; `on <branch> landing` and `on slot free` are fired by the loop itself.
- **No prompt ever contains a step for the user, and no session blocks on a question.** Not "ask
  the owner", not "wait for approval". A session that stops to ask does nothing all night: it
  decides with the WHY, or writes the question into its handoff and does the rest. The owner
  dropping in to talk to a running session is always welcome and never required - a wave must
  finish identically with or without it. Anything that genuinely needs the user is a note in
  section 4, never a line in a prompt.
- **Only a prompt the USER opens carries a Remote Control reminder** - its first output tells him
  to type `/remote-control`, since a session cannot invoke a terminal built-in. A launched subagent
  has no terminal and gets none, so this now covers only a classifier-refused row. Temporary; the
  memory `remote-control-every-session` carries the exit test.
- **`<tool>` is whichever tool will run it** - `claude/…` or `codex/…`. Never hardcode one.
- **GOAL is a DEFINITION OF DONE, and the session self-checks against it before the handoff.**
  Write it as a claim a reader could test by observation - never "improve X". Before the handoff,
  the session checks every claim against the evidence it holds: a number against its measurement,
  "works" against a run that showed it working. Anything it cannot back is UNVERIFIED, never
  rounded up - a wave whose handoffs overclaim costs the owner a morning of re-checking. A green
  build alone is never "done" for observable work (root `AGENTS.md`, verification rules 1 and 7).
- **THE WHY MUST BE TRUE, and function outranks cosmetics.** GOAL says what will be true; WHY says
  what breaks otherwise, so the session can TEST the assignment instead of obeying it. A session
  sensing a cosmetic why behind a functional cost keeps the function, does the rest, and puts the
  tension in the handoff (`incidents.md` "the vanity rename").
- **WHY is a TARGET, not a route.** Workers own implementation. Assign GOAL + WHY + TOUCHES/MINTS + GATE, with pointers.
  DO is optional and reserved for a required constraint or reproduction, never a coding recipe.
  The worker checks assumptions against the repository, chooses the route, tests and repairs it.
  Scope expansion returns to the coordinator's collision pass before touching another row's files.
- **READ points, it never summarizes.** Name the files; the session reads them at current HEAD.
- **TRAPS carries only what exists nowhere but a chat.** A trap already in a repo file gets a
  pointer. Reprinting an area contract is how these get fat.
- Confirm the assigned branch and worktree before editing. Rename only a harness-created
  temporary branch; native Codex worktrees already carry the assigned branch (`hosts.md`).
- At meaningful state changes, use `wave-launch progress` from the assigned checkout with the
  recorded `--worker-id`, `--state`, `--next-action` and optional `--blocker` (see `hosts.md`).
  These SHA-bound claims feed the existing tick; ready never means independently verified.
- **A starting prompt is a bounded outcome**, possibly several related steps in one `TOUCHES`
  set. If discovery, implementation and verification cannot fit, split before dispatch using
  `specs.md`; size `large` is a decomposition signal, not a launchable SPEC task.
- **CORE is an independently verifiable stop**, not permission to drop required behaviour.
  Preserve unfinished acceptance in the ledger and gap work in the wave; a landed slice is not a done parent.
- **GATE is `npm run build` plus CI**; add a local browser job only for what CI cannot do. When a
  GATE spells out a queued run, the COMMAND comes FIRST and the flags after it -
  `node scripts/jobs.mjs add "npx playwright test <spec> --workers 1" --cost 0.5`. The
  flag-before-command form prints usage and adds nothing, quietly enough to read as a queue that
  refused; seven consecutive handoffs (HC to HJ, 2026-09-15 and -16) reported being given the
  wrong order, so write it out rather than leaving each row to rediscover `jobs.mjs`'s usage line.
- **QUEUE is mandatory on every prompt and is the last thing in it**, because the session running
  it may never see this file. Landing is serialized, not permissioned: a finished session queues
  itself and the machine-wide queue lands it - gated on CI, one branch at a time, pushing when it
  wins (`.agent-workflows/queue-merge.md`). The handoff FILE is written first, `/queue-merge`
  second, so the handoff is inside what lands. **Say what to do with unfinished work, once, in
  QUEUE**: commit and queue only what is green and stands on its own, leave the rest uncommitted
  and describe it in the handoff. Never queue a branch you have not gated to beat the morning.
- **/check runs in EVERY wave session, day or night.** The one carve-out stays honest rather than
  silent: a session out of time queues without it and its handoff says `check: not run`. The
  second-opinion workflow (`so`) is for big calls, and it runs in a fresh session by design, so a
  wave session can never get one on its own work - plan it as its own row.
- **Queue ONCE, at the true end.** Queueing pins the branch's commit, so a session that queues,
  then commits more, then queues again turns every earlier job into a stale-pin refusal
  (`warn-command.mjs` now says so at the commit). Batch the commits; the last action of the
  session is the one queue call.
- **Landing friction is a first-class defect.** The owner's measure of a good wave is hours spent
  building versus hours spent shepherding merges. The report counts refusals and re-queues as
  vitals, and every recurring refusal kind becomes a mechanism fix, never a habit.
- **A finished session leaves nothing running.** Before its last action it stops every background
  task it started - watchers, polls, queued waits - because a task nobody will ever read is not
  monitoring. Anything a running task was holding goes into the handoff file first. The Stop hook
  (`scripts/hooks/stop-wait.mjs`) refuses a turn that ends on a wait; the prompt line above is
  what it enforces.
- **A continuation prompt printed only in chat does not exist.** The handoff FILE is the one
  channel the next orchestrator reads. Chat is for the human watching; the file is for the system.
- A row that **delegates** says so and names its fallback pool, on `routing.md`'s terms (step 3).
- **Delegates write findings and evidence to agreed FILES before returning.** Return only task,
  outcome, artifact paths, unresolved acceptance IDs and next action (target 200 words). Route
  stray notifications to the owner via the existing relay; do not paste investigation logs.

## The confirmation pass - one sweep, before the plan ships

**One pass confirms assignment facts before dispatch:**

- every path in a `TOUCHES` or `READ` line grepped and seen doing the thing its row is about (a
  grep with a line range, never an open) - `node scripts/wave-plan-check.mjs` proves existence,
  and only the grep proves the file does what the row says;
- every command it names found where its kind lives - `package.json`, `scripts/`, or
  `.agent-workflows/` for a slash command;
- every rule it quotes copied from the file rather than from memory.

Neither a directory listing nor a plausible name is confirmation. It is a PASS not a virtue because
care is what runs out at the end of a long grounding read. The cost is not a wasted lookup:
`TOUCHES` is the collision pass's instrument, so two rows called disjoint on paths nobody confirmed
are not disjoint, they are unanalysed - a guessed path is a defective collision pass in the costume
of a typo, **so a correction here sends those rows back through the collision pass.**
