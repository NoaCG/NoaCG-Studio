# Section 5 - the prompts

One fenced block per session, in START order, handed to the verified host route (`launch.md`) and
printed so the owner can read what started. Compact - target ~20 lines. The pool decision each
block rests on is `routing.md`. Open the section with a **one-line run order** naming the letters
and nothing else: *"Start now: A, B, C, D. E follows on A landing. F held."*

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
       2. commit and queue only what is green and stands on its own. ONLY if meaningful work is
          left unfinished, leave it uncommitted and write docs/handoffs/<date>-a-<slug>.md: what
          remains, why, the GOALS outcome, what done means. Finished work writes none; a row that
          finishes a handoff's work deletes that handoff in its own branch;
       3. run /queue-merge. Do not commit after queueing: queueing pins the branch, and a later
          commit makes the landing job refuse. Never merge into main yourself.
       Never end a turn waiting on something that cannot wake you - a CI run, a landing, a
       watcher. Read it to a verdict now, or hand off.
```

## The line rules

- **`SESSION <letter>` is the first line, always**, before anything else: the same letter as the
  wave table and the branch name, for the user scrolling back later.
- **There is no `WAIT` line, because a wave is order-free.** `START` is `now` for every row this
  session launches at once; `on <branch> landing` and `on slot free` are fired by the loop itself.
- **No prompt ever contains a step for the user, and no session blocks on a question.** Not "ask
  the owner", not "wait for approval": the session decides with the WHY, or writes the question
  into its handoff and does the rest. The owner may drop in to talk to a running session, but a
  wave must finish identically without it. What genuinely needs the user is a note in section 4.
- **`<tool>` is whichever tool will run it** - `claude/…` or `codex/…`. Never hardcode one.
- **GOAL is a DEFINITION OF DONE, and the session self-checks against it before the handoff.** Write
  it as a claim a reader could test by observation - never "improve X". The session checks every
  claim against the evidence it holds (a number against its measurement, "works" against a run that
  showed it working); anything it cannot back is UNVERIFIED, never rounded up. A green build alone
  is never "done" for observable work.
- **THE WHY MUST BE TRUE, and function outranks cosmetics.** GOAL says what will be true; WHY says
  what breaks otherwise, so the session can TEST the assignment instead of obeying it. A session
  sensing a cosmetic why behind a functional cost keeps the function, does the rest, and puts the
  tension in the handoff.
- **WHY is a TARGET, not a route.** Workers own implementation. Assign GOAL + WHY + TOUCHES/MINTS +
  GATE, with pointers. DO is optional and reserved for a required constraint or reproduction, never
  a coding recipe. The worker checks assumptions against the repository, chooses the route, tests
  and repairs it. Scope expansion returns to the collision pass before touching another row's files.
- **READ points, it never summarizes**: the session reads the files at current HEAD. **TRAPS carries
  only what exists nowhere but a chat**; a trap already in a repo file gets a pointer, never a
  reprinted area contract.
- Confirm the assigned branch and worktree before editing. Rename only a harness-created
  temporary branch; native Codex worktrees already carry the assigned branch (`hosts.md`).
- The GATE line's progress reports (flags in `hosts.md`) are SHA-bound claims that feed the tick;
  `ready` never means independently verified.
- **A starting prompt is a bounded outcome**, possibly several related steps in one `TOUCHES`
  set. If discovery, implementation and verification cannot fit, split before dispatch using
  `specs.md`; size `large` is a decomposition signal, not a launchable SPEC task.
- **CORE is an independently verifiable stop**, not permission to drop required behaviour.
  Preserve unfinished acceptance in the ledger and gap work in the wave; a landed slice is not a done parent.
- **GATE is `npm run build` plus CI**; add a local browser job only for what CI cannot do. A queued
  run is written COMMAND FIRST, flags after:
  `node scripts/jobs.mjs add "npx playwright test <spec> --workers 1" --cost 0.5`. The flag-first
  form prints usage and adds nothing, quietly enough to read as a queue that refused.
- **QUEUE is mandatory on every prompt and is the last thing in it**, because the session running
  it may never see this file. Landing is serialized, not permissioned: a finished session queues
  itself and GitHub's merge queue lands it, gated on CI (`.agent-workflows/queue-merge.md`). The
  handoff FILE is written before `/queue-merge`, so the handoff is inside what lands.
- **/check runs in EVERY wave session, day or night.** The one carve-out stays honest rather than
  silent: a session out of time queues without it and its handoff says `check: not run`. The
  second-opinion workflow (`so`) runs in a fresh session by design, so a wave session can never get
  one on its own work - plan it as its own row.
- **A finished session leaves nothing running.** Before its last action it stops every background
  task it started - watchers, polls, queued waits - and whatever one was holding goes into the
  handoff file first. The Stop hook (`scripts/hooks/stop-wait.mjs`) refuses a turn that ends on a
  wait.
- **A continuation prompt printed only in chat does not exist.** The handoff FILE is the one
  channel the next orchestrator reads.
- A row that **delegates** says so and names its fallback pool (`routing.md`, step 4).
- **Delegates write findings and evidence to agreed FILES before returning.** Return only task,
  outcome, artifact paths, unresolved acceptance IDs and next action (target 200 words). Route
  stray notifications to the owner via the existing relay; do not paste investigation logs.

## The confirmation pass - one sweep, before the plan ships

- every path in a `TOUCHES` or `READ` line grepped (with a line range, never an open) and seen
  doing the thing its row is about - `node scripts/wave-plan-check.mjs` proves only existence;
- every command it names found where its kind lives - `package.json`, `scripts/`, or
  `.agent-workflows/` for a slash command;
- every rule it quotes copied from the file rather than from memory.

Neither a directory listing nor a plausible name is confirmation, and care is what runs out at the
end of a long grounding read, so this is a PASS. `TOUCHES` is the collision pass's instrument: rows
called disjoint on unconfirmed paths are unanalysed, **so a correction here sends those rows back
through the collision pass.**
