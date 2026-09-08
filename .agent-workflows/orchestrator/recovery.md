# Repair, or rewind and redo

**Ratified by the owner 2026-09-01:** *"When an agent makes a substantial mistake, do not
automatically keep patching the broken implementation… if restarting is cheaper, cleaner, and less
risky than accumulating corrective patches and context, restart the task."*

The instinct this replaces is sunk cost. A wrong attempt feels expensive because you can see what
it cost; the redo feels expensive because you cannot yet see what it saves. **The redo is cheaper
more often than it feels**, and the reason is structural: in this workflow a wrong attempt lives on
an unlanded branch in its own worktree, so discarding it costs exactly the tokens already spent and
nothing else. Nothing downstream has consumed it.

## The line that decides everything: has it landed?

**Not landed - the normal case.** The branch is private to its worktree. A rewind costs one new
worktree and one new prompt, and no other session, gate or tree has ever seen the work. This is
where the rule below applies.

**Landed on `main`.** Never rewind by rewriting history; `main` is shared and other branches have
already integrated it. The instrument is a revert commit through the queue like any other change,
and only when the landed work is actively harmful - a red gate, a broken surface. Otherwise it is
repaired forward. A landed mistake is a normal wave row, not a recovery decision.

## The test

**Rewind when a correct redo is cheaper than the remaining repairs.** Three signals; **any two
mean rewind:**

1. **The fix list is growing, not shrinking.** Two consecutive repair rounds each surfaced new
   defects of the same class. One round finding nine issues and fixing eight is `/check` working
   exactly as designed; the second round finding nine more is a design that is wrong.
2. **A repair needs to know why the first attempt did what it did.** If you cannot state the
   defect without referring to the previous attempt's reasoning, you are patching a design, not a
   bug.
3. **More than half the session's window went into corrections.** Its remaining context is mostly
   argument with its own earlier work, and the next patch is being written against a summary of a
   summary.

And one signal that is **sufficient alone: the assignment was misread.** A perfectly-built wrong
thing is never repaired into the right thing - every patch after that inherits the misreading.

**Repair when the design is right and the defects are local and enumerable.** That is the ordinary
case and stays the default. Nothing here licenses discarding work that merely has bugs in it.

## What a rewind IS, mechanically

- **Keep the FINDINGS, discard the CODE.** The first attempt almost always established real facts
  - what the repro is, which file actually owns the behaviour, which route does not work. Those go
  into the redo prompt. The diff does not.
- **The branch is abandoned, never destroyed.** `git branch -m <branch> <branch>-abandoned` and
  leave it: git is the archive, and the abandoned branch is the evidence the outcome ledger and
  the morning report both cite. `git branch -d` (never `-D`) only once its lessons are written
  down elsewhere, and worktree removal still goes through the cleanup workflow's own rules.
- **The redo runs in a FRESH worktree off current `main`**, on a new branch. It never inherits the
  old tree, and it never inherits the old session's context.
- **The redo gets a BETTER prompt, never the same one.** Handing back the same prompt invites the
  same misreading. **A corrected assignment is the one required artifact of a rewind** - if you
  cannot say what the new prompt says differently, you have not diagnosed anything and the rewind
  will produce the same result more expensively.
- **One rewind per assignment.** A second rewind means the assignment itself is wrong, not the
  attempts. That goes to the owner as a section-4 item, never to a third attempt.

## Who may do it

- **A session may rewind its OWN unlanded work without asking anyone.** It is inside its own
  branch; that is what a branch is for.
- **The orchestrator may direct a rewind for a row it launched**, and this stays inside the core's
  never-acts rule because the action is the only verb this session has: write a corrected
  assignment and launch a fresh row in a fresh worktree. **It never reaches into the failed
  worktree** - not to reset it, not to rename its branch, not to remove it. The abandoned branch
  is reported in the morning; the person or the cleanup workflow disposes of it.
- **A rewind is never a launch this session invents work for.** It replaces a row that already
  existed, keeps a NEW letter (letters never move and never come back), and names the letter it
  replaces.

## Recording it

Every rewind is one line in the morning report's loop vitals (`report.md` §7): the row, the
abandoned branch, which signals fired, and what the corrected assignment says differently. That
line is the only defence against the failure this rule can cause - a loop that rewinds whenever
work gets hard, and shows nothing for the night. A wave with two rewinds and nothing landed is a
planning defect, and the report is where it becomes visible.
