# The dev-port registry could hand one worktree two ports

Branch `claude/v-port-registry-race`, from `origin/main` at `70abb5e5`. It closes the race behind
the flake that reddened row P's branch on 2026-09-08: two CI runs of commit `7ccfe65e` disagreed,
run 34283361919 SUCCESS and run 34283357864 FAILURE, both on `AssertionError: a worktree must not
end up with two ports`.

The test was right and the registry was wrong. This is not a test-timing artefact.

## The window, in one sentence

`allocatePort` decided which of a root's tickets survived by re-reading the registry *after*
writing its own (`collapseToLowest`), so the window opened the moment one process finished that
read - having already committed to a port and returned it - and closed only when the last
same-root process had written its ticket, in which interval a later arrival could compute a
different "lowest" and delete the ticket for a port that had already been handed out.

The reason a later arrival can legitimately pick a *lower* port is the walk itself: it steps 7
slots at a time and wraps at 60, so a process pushed far enough along it reaches a candidate
numbered below the preferred port. On this laptop the fixture root prefers slot 24, so the wrap
lands on 5192 against a preferred 5228 - and that is exactly the pair the failures printed:

```
#0 ports=[5228, 5228, 5228, 5192, 5192, 5228, 5228, 5228] tickets=[5192]
```

Five tools were told 5228, two were told 5192, and the registry ended up holding a ticket for
5192 alone. In the product that is vite and playwright in one worktree on two different ports,
which is the thing the registry exists to prevent.

## Before and after

The reproduction needed more contention than the test carried. At the three concurrent tools the
test used, the case passed **0 failures in 130 local runs** and could not be made to fail; the
three never walk far enough to reach the wrapping candidate. At eight it failed immediately.

| | no lock | first lock | lock as landed |
| --- | --- | --- | --- |
| the test itself, 8 tools | **11 failed in 12** | **0 failed in 25** | covered by the suite runs below |
| whole `test:ports` suite | - | 0 failed in 25 | 0 failed in 20 |
| standalone harness, 8 tools | 8 failed in 30 | 0 failed in 90 | - |
| standalone harness, 16 tools | - | 0 failed in 25 | 0 failed in 30 |

The middle column is the first version of the lock and the right column is what landed; the
review sent me back over the takeover path (below), so both were measured rather than assuming
the second inherited the first's result.

So the test now runs **eight** concurrent tools instead of three. Its assertions are untouched and
unweakened; only the contention went up, with the reason recorded next to the number.

## What changed in the registry

`scripts/port-registry.mjs` now runs the whole read-decide-write under a **claim lock per
checkout**, `claim-<digest of the root>.lock`, next to the tickets. That makes the "already
assigned?" check at the top of `allocatePort` authoritative, so the walk simply returns the ticket
it just wrote and the after-the-fact reconciliation is gone. Two levels of exclusion on two
different keys: the per-port `wx` create still decides which *checkout* gets a given port, and
nothing serialises across checkouts - six worktrees race for ports at full speed, because each
holds a different lock while they do.

Three things worth knowing before touching it:

- **A lock names the PID that took it, and takeover is by liveness rather than a timer.** A
  Ctrl-C'd `dev:worktree` would otherwise wedge its checkout for good. It cannot be a deadline:
  a walk spawns a probe child per candidate and can honestly run for seconds, and any deadline
  short enough to reclaim a crash quickly is short enough to rob a slow walk - which puts two
  allocations for one checkout straight back inside the window this lock closes. An absolute
  two-minute cap covers PID reuse.
- **Takeover renames the dead lock away before deleting it.** Two waiters can both judge the same
  lock abandoned, but only one rename succeeds, so the loser finds nothing to delete rather than
  deleting the winner's fresh lock. The lock also carries a one-off token, and a holder releases
  only a lock still carrying its own.
- **On Windows an exclusive create against a file another process is deleting fails with EPERM,
  not EEXIST.** Measured here at sixteen concurrent tools; the first version of the fix crashed on
  it. The acquire loop treats it as contention, but only while there is no lock file to blame it
  on and only for a second, so a registry we genuinely may not write to still fails fast instead
  of hanging for a minute on every shell command.

## Pointers

- `scripts/port-registry.mjs` - the lock is the block above `ticketPath`; `allocateUnderClaim` is
  the old walk, unchanged apart from losing its trailing reconciliation.
- `scripts/port-registry.test.mjs` - the widened race case, plus four new cases for the lock: no
  lock outlives its allocation, a dead holder's lock is taken over, an ancient one is taken over
  even though its pid is alive, and a neighbour's live lock never blocks this checkout. The dead
  holder is staged with a pid no process can have rather than one from a process watched exiting,
  because both operating systems recycle pids and an unlucky recycle would hang the case for the
  full sixty-second wait. A test for a race must not have a race in it.
- `docs/DEV_PORTS.md` - the lock is now listed with the ticket under "Where the port is recorded",
  because somebody looking in that directory will see the file.

## What is not done

- `--prune` does not sweep leftover `claim-*.lock` or `*.dead` files. Neither can wedge anything -
  a lock is taken over by the next allocation for that checkout, and a `.dead` file is ignored by
  every reader - so this is tidiness, not a defect.
- **There is a second, unrelated intermittent still live in the E2E tier**, met on this branch's
  own CI: `E2E 8/9` went red on `fc06fc2b` and green on a re-run of that exact sha, on
  `import-svg-corpus.spec.ts:594` with `Frame was detached`. Not this race, and not fixed here -
  filed as `docs/backlog/the-fit-ladder-spec-detaches-its-own-frame.md` with the stack and the
  shape of the fix, because it can red a night branch whose session has already finished.
- The lock is not held by `releaseReservation`. An earlier draft did hold it; the review was right
  that it bought only ordering, while adding a way for `dev-port.mjs --release`, the documented
  recovery command, to hang behind a long walk and then throw.

## Landing, 2026-09-09 - the reconciliation this branch was held for was a phantom

The branch sat unlanded overnight and was handed to the next session with one instruction: merge
`main`, then reconcile `scripts/e2e-affected.mjs` by hand, because four rows had edited it and git
would union them cleanly into a file that decides which specs run. A wrong union there does not go
red; it quietly stops running something. That was the right thing to be afraid of and it was not
what happened here.

**This branch never touched that file.** Its only appearance in the branch's history is the merge
commit `fe64ba73`, which took `main` in. Measured against the fork point `70abb5e5`:

    git diff 70abb5e5 HEAD -- scripts/e2e-affected.mjs      # empty
    git log --oneline 70abb5e5..origin/main -- scripts/e2e-affected.mjs
    # 35523e29 only - row T's, and it has landed

Of the four branches named, only T ever edited it. After `git merge origin/main` the file is
byte-identical to `main`'s copy, so there is no union to audit and nothing to reconcile.

**Where the phantom came from, and it is already fixed.** `scripts/merge-order.mjs` measured each
candidate's file set against the local `main` ref rather than the landed one, and this checkout's
`main` was 43 commits stale. So this branch was credited with the files six rows had already
landed - including T's edit to `e2e-affected.mjs`. The file now carries that account in a comment
above the two lines, because row T fixed exactly this in `35523e29` and that fix is on `main`. Re-run
against the current ref, the verdict is `clear: conflicts with nothing in flight (5 commits, 5
files)`, and the five files are this branch's own.

The lesson is not that the hold was wrong. The hold was correct on the evidence available at the
time, and the evidence was produced by a tool that has since been fixed. What is worth carrying is
that a `hold` verdict older than the fix to the tool that issued it should be re-measured before it
is acted on, not inherited.

**One correction to the recipe that was handed over.** It said to run `node scripts/e2e-affected.mjs`
to re-derive the selection and read it. That script is a RUNNER: bare, it starts Playwright and ran
all 1297 tests here, taking the machine's single browser slot. The flag that prints the plan and
runs nothing is `--list` (`--json` for a machine). Re-derived properly, this branch's plan is:

    e2e-affected: INTEGRATION base 70abb5e5 - covers both sides of the merge
    e2e-affected: no mapping for these files (falling back to the full suite):
      - scripts/e2e-affected.mjs
    e2e-affected: core/unmapped change detected - running the FULL suite (133 changed files).
    e2e-affected: catalog/bench-affecting change detected - will also run npm run test:e2e:catalog.

That is the maximally conservative answer - the whole suite plus the catalog gate - so the failure
mode the hold was guarding against cannot occur on this landing even in principle. Nothing is
selected away.
