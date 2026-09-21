# D - live site ready for the Friday 2026-09-25 demo

Branch `claude/d-live-site-ready`, worktree `.claude/worktrees/agent-ab4b75196cfe4c648`, forked
from `bde57a83`. Docs only. It touches the cold-boot backlog finding and adds this file, with no
changes under `src/`.

## Verdict

**Ready. The live site, both backends and the hosted alarm all check out, and nothing in the
repository needed fixing.**

1. **noacg.studio serves current main.** At 15:50Z, `https://noacg.studio/version.json` reported
   `commit bde57a83`, `builtAt 2026-09-21T15:12:01Z` and `deployedCommitIsCurrent: true`, and
   `origin/main` was `bde57a83` at that time. `/` and `/docs` answered 200, and `/api/events`
   answered 405 to a GET, so the function is up.
2. **Production backend is awake and cannot idle-pause.** The Supabase project
   `kprolrchuldgfrzspthy` reads `ACTIVE_HEALTHY`, and its org `NoaCG` is on the `pro` plan. Pro
   projects do not pause for inactivity. The API routes run as Vercel functions, which have no
   idle pause either.
3. **Staging is awake and cannot pause before 2026-09-28.** `garafohbzmsybtysxphb` answered its
   gateway, and `post-land.yml` read its migration ledger at 15:11Z ("Staging holds all 60
   migration(s)"). The hosted run below signed in and queried it at about 15:52Z. A free project
   pauses after 7 idle days, and the scheduled run on Wednesday 09-23 02:40Z resets the clock
   again.
4. **Alarm #341 is closed.** I dispatched `hosted-latency.yml` on main
   ([35621780852](https://github.com/NoaCG/NoaCG-Studio/actions/runs/35621780852)). It was the
   first hosted run to contain PRs 347 and 349. It passed 50 of 50 with no flakes, at a staging
   round trip of about 182 ms, and the workflow closed #341 itself.
   **What the alarm meant for the demo:** the two red runs on 09-20 were "0 failed, N flaky". Each
   one was a production dashboard that had just been published and stuck on "nothing on air" with
   Out greyed. That happened only against the hosted database, the server always held the take,
   and a retry passed in about 28 s. The demo risk is exactly that picture. **The operator
   workaround is to reload the dashboard**, which re-reads the server's `live_cue`.

The root cause is still not proven. One clean run shows the symptom was absent on the demo's
code, not that it is gone for good, so the backlog finding stays `advanced` rather than closed.
The measurements are recorded in
`docs/backlog/hosted-cold-boot-specs-still-stick-for-their-whole-timeout.md`.

## What is left

- **If #341 reopens** on the 09-23 scheduled run, read that run's failure snapshot for the
  `not joined, polling` text before doing anything else. The backlog file's step 1 says why.
- **The self-heal option** is still undecided: re-read `live_cue` on the follower's 30-second
  tick. I did not start it. It changes live playout behaviour four days before a demo, and the
  alarm is now green.

## For the owner

Nothing: `needs: none`. No step here costs money or needs your account. Before the demo, the one
thing to know is the reload workaround above.

## Check

The review was delegated to the code-review skill and matched the branch's one-file scope. It
raised five findings about wording against the gh evidence, and I fixed all five. Simplify
returned fan-out instructions, so I did it inline, which reflowed one paragraph. Verify was
`npm run build` with exit 0. Taste is not applicable, because no graphic can change. The commits
are on this branch.
