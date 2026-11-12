# Landing hold

The landing hold stops every landing on `main` for as long as it is on. Use it when nothing may
change in production, for example while a live production depends on it.

While it is on, the `CI gate` check fails on every pull request and every merge group, with an
error that starts "Landing hold" and names who set it, why, and the hold issue. Because the merge
queue needs a green `CI gate`, nothing reaches `main`. A pull request already in the queue leaves
it when its merge group's gate fails. With nothing landing, production does not redeploy and no
migration applies (both follow pushes to `main`).

If the gate cannot read the hold's state, it fails as if the hold were on. Re-run the job once
GitHub answers again.

## The state

The hold is on while any open issue carries the `landing-hold` label. The Landing hold workflow
opens and closes that issue, and records who did it and why. Rules R1 to R10 under "OS0" in
`docs/work-specs/obs-scenes/spec.md` are the exact behaviour; `scripts/landing-hold.mjs` reads and
writes the state.

## Set it and lift it

Run the **Landing hold** workflow (`.github/workflows/landing-hold.yml`) from the Actions tab, or:

    gh workflow run landing-hold.yml -f state=on -f reason="<why>"
    gh workflow run landing-hold.yml -f state=off -f reason="<why>"

In a cloud session, trigger the same workflow with the GitHub tools. Anyone with write access can
run it. The run reads the hold back and fails unless it took effect, so a green run is the
confirmation.

The reason is public. Name no event, date, place or person in it. A scheduled set or lift uses a
fixed neutral reason ("scheduled hold", "scheduled lift"), so the schedule never shows anywhere.
Schedules live outside this repository and only dispatch the workflow.

Lift it only with the workflow. Closing the issue or removing its label by hand also lifts it, but
records no reason, and is never a way to get a red gate green.

## While it is on

- A red gate whose only error is "Landing hold" is not a fault. Do not repair it, push to it or
  spend a repair attempt on it. The red-PR alarm (`scripts/repair-wake.mjs`) ignores it.
- After the lift, re-run the failed `CI gate` job of each held pull request (re-running the failed
  jobs re-runs only the gate, which reads the hold again), then queue it again.
- The automatic quarantine and revert landings are held too. If `main` needs a revert during a
  hold, whoever owns the hold decides: lift it, land the revert, set it again.

## What it does not cover

- A manual production deploy (the Vercel dashboard or CLI) or a rollback there.
- A migration applied by hand to a database.
- An administrator bypassing the branch rules to push or merge.
- Releases that never touch `main` (the CLI, Bridge and Companion releases).
- A merge group whose gate had already passed when the hold turned on: it may still land. Set the
  hold well before the time it must hold from.
