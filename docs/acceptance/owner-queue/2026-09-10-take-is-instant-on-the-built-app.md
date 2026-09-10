---
kind: agent
date: 2026-09-10
---
# Take answers in 30 ms - on the app we ship, not on the dev server

You reported on 2026-09-05 that playing out your quiz graphics lagged: "It didn't play out
immediately, or it didn't stop immediately." That is now measured rather than argued about, and the
answer is not the one the note predicted. On the **built** app every gesture on the dashboard paints
in about 30 ms - Take, Out, and a Take pressed the instant after you move in the rundown - and the
page never drops a frame. On the **dev server**, at the same memory your laptop had that day, the
same gestures take 85-91 ms and drop three to four frames every single time. That is React's
development runtime, which the shipped bundle does not contain.

Nothing in the dashboard was changed, because nothing in it was slow. What landed is the instrument
that answers the question and the missing way to run the app the way it actually ships.

## The route, under a minute

```
npm run build
npm run dev:worktree -- --preview      # serves the BUILT app on this checkout's port
```

Open the printed `/app` URL, open any production with a few cues, and drive it: select cues up and
down the rundown, TAKE, Out, TAKE again. Then stop that server, start `npm run dev:worktree` (the
plain dev server) on the same production, and do exactly the same thing.

**What to look at.** The difference should be plain without a stopwatch - the built app answers on
the press; the dev server has a hesitation on every gesture. If you want the numbers instead of the
feel, the bench prints them:

```
node scripts/playout-lag-bench.mjs playout-lag-out --seed        # dev server up
node scripts/playout-lag-bench.mjs playout-lag-out --measure     # --preview up, same port
```

One caveat on `--preview`: it serves no `/api`, so render, AI and the Data workspace's server calls
fail silently there. It is for how the shipped bundle feels, not for reproducing an API bug. The
server prints that warning every time it starts.

## The one thing that needs you

**Run the 2026-09-12 rehearsal off a built app**, not off a dev server. That is the whole fix for
what you saw, and it costs one `npm run build`.

## The half nobody has measured

Everything above is the OFFLINE path. If your production was **published**, every verb goes to
Supabase and back before your own PROGRAM monitor moves - the code applies nothing locally on that
path on purpose, because the log echo would double it. On a venue's wifi that would look exactly
like what you described, and this checkout has no backend configured, so it could not be tested
here. It is written up in `docs/backlog/playout-lag-when-working-the-queue.md` with the experiment
to run and the trap in the obvious fix. If Friday is going to be published rather than local, that
measurement should happen first.

Branch `claude/bg-playout-lag`.
