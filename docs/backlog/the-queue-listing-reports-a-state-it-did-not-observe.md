# The queue listing prints `starting` for a job the runner never started

**Filed:** 2026-09-10. **Source:** measured during the real-CasparCG walk
(`docs/handoffs/2026-09-10-bh-caspar-real-server.md`).

## Why

On 2026-09-10 three landings sat in `waiting` for about 75 minutes while `node scripts/jobs.mjs`
printed `starting j-0907` on every read. A runner was live the whole time and had started none of
them. They eventually ran and completed, so nothing was lost - but for over an hour three sessions
had every reason to believe their branches were in flight, and one of them (this row) planned
around a queue it concluded was dead.

That is the defect `ensureRunner`'s own comment says the queue was rewritten to stop having: "the
queue reported a STATE and not whether the state was PROGRESSING". It came back through a
different door. The listing does not report what the runner decided; it calls `schedule()` again
with its **own** `freeMemMb` sample and prints that. Under memory pressure the runner's sample and
the listing's sample disagree, and the reader is shown a decision nobody made.

The second half is that nobody can tell which of the two candidate causes it was - the RAM gate
refusing on the runner's sample, or the loop blocked in an `await` and recovering on a timeout -
because `spawnJob` gives the runner `stdio: 'ignore'` and its reasons go nowhere. A queue whose
scheduler cannot be asked why it did nothing is a queue that gets diagnosed by guesswork every
time this happens.

## What it would take

Two changes, both small, and the first is worth more than the second.

**Make the runner record its decisions.** Each poll, write the reason it did or did not start each
pending job to a file in the queue directory (last decision per job is enough - this is a
heartbeat, not a log). The listing then prints what the runner observed, and a job showing
`starting` for two consecutive reads without a `startedAt` becomes visible as the anomaly it is.

**Stop the listing from inventing a schedule.** Where a runner is live, the listing's job is to
report; it should re-derive the plan only when nothing is draining the queue, and say which of the
two it is doing.

Optionally, escalate: a job in `waiting` whose `startedAt` is still null after N polls while a
runner is live is a defect, not a footnote, and the listing already knows how to say so loudly for
the no-runner case.

## Evidence

Queue directory `C:\claude\NoaCG-Studio\.git\noacg-jobs`, 2026-09-10:

| job | enqueued (UTC) | started (UTC) | held |
|---|---|---|---|
| j-0907 (PR 216) | 06:52:04 | 08:09:52 | 78 min |
| j-0908 (PR 218) | 06:52:40 | 08:09:58 | 77 min |
| j-0909 (PR 219) | 07:05:34 | 08:09:64 | 64 min |

Runner pid 23880 was created 06:36 local-of-record and had **no child processes** when inspected
at 07:20 and again later. During that window the listing read:

```
Job queue - budget 0/1 suite-equivalents in use, runner live
  starting j-0907  [0.15]  node scripts/land-watch.mjs --pr 216 …
  #1       j-0908  another landing is in flight  …
```

while the job files said `"state": "waiting"`, `"startedAt": null`.

One confounder to keep in the record: this session was running Playwright walks and full builds
outside the queue during part of that window, so it was itself contributing to memory pressure.
That is a reason to want the runner's own reasons written down, not a reason to assume the cause.
