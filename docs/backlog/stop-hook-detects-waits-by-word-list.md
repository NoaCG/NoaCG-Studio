# The stop hook decides whether a turn ends on a wait by matching a word list

**Filed:** 2026-09-04. **Source:** measured during the 2026-09-04 wave - one row stalled twice on a
sentence the hook was built to catch.

## Why

`scripts/stop-wait.mjs` exists because a session that ends its turn saying it will wait for a CI
run, a landing job or a watcher has quietly stopped with its branch unqueued - nothing can wake it.
It is the right mechanism in the right place: it fires at the one moment the mistake is made.

It decides by matching the words the session chose against a list of things that cannot wake it.
The list named `watcher` and none of the ordinary synonyms, so this sentence did not match:

> I'll wait for the monitor rather than polling.

That is not an exotic phrasing. It is the plain word for the thing, and one row wrote it twice on
2026-09-04, costing roughly forty minutes of that night's rehearsal. **The gap itself is fixed** -
the observer half of the list is now enumerated as a class (watchers, monitors, pollers, ticks,
background tasks) and paired with an exclusion for a wait on a PERSON, which is a correct stop and
was firing falsely on `land` and `the run`. Tests in `scripts/stop-wait.test.mjs` pin all of it.

What is not fixed is the shape. A list of nouns loses to whichever noun the next session picks, and
the failure is silent in the expensive direction: nothing says the hook stayed quiet. Every future
gap costs about what this one did, and the only signal is a person noticing hours later that a
session ended on a wait.

## What it would take

Three options, cheapest first, and the first may well be enough:

1. **Measure the miss rate before designing anything.** The hook already sees every turn end. Have
   it record - locally, gitignored - the last assistant message of any turn that ended WITHOUT a
   queued branch and without matching, and read the file after a week. If the list is missing one
   sentence a fortnight, the answer is to add words when they turn up and stop here.
2. **Invert the test.** What separates a wait that must be refused from one that is correct is not
   the noun, it is whether a PERSON is the thing being waited on. Detecting "the object of this
   wait is the owner" is a much smaller class than "the object is any machine", and it is already
   half-written as `NOT_A_PERSON` in `scripts/stop-wait.mjs`. Inverting carries a real cost: the
   false positives land on ordinary turn ends, which is the failure the test file's negatives exist
   to prevent, so this needs the measurement from step 1 first.
3. **Stop reading words at all.** The durable fact is not the sentence, it is the state: this
   session has a branch, the branch is ahead of main, and it is not queued. `landingStateFor`
   already answers that, and the hook already calls it. The reason it is gated behind the message
   is cost and noise - it would fire at every mid-work turn end. `docs/ORCHESTRATION_NEXT.md`
   section 3, item 5 rejected exactly that for the neighbouring "green but unqueued" shape, and
   `wave-tick.mjs` covers the crashed session the hook cannot see. Re-argue it only with numbers.

## One more miss, in the cheap direction

`declaresWait` strips fenced blocks, inline code spans and blockquote lines before matching,
because quoting the queue's own sentence for a capped landing ("killed at its 45 min cap - probably
still waiting on CI") otherwise reads as the session declaring a wait. That covers every marked-up
paste and nothing else. A session that pastes a bare night report or a job log into its wrap-up
still gets one extra turn. It is the cheap direction of the failure, which is why it shipped, and
option 1 above decides whether it is worth anything: have the hook record its misses for a week
before writing a stripper for unmarked report-shaped lines. (Found 2026-09-04, carried here when
that handoff was drained.)

## The opposite error: it refuses a session that does hold its wake-up

Added 2026-09-11. The same matcher also fires on a session that is RIGHT to end its turn. The
orchestrator's night loop holds a live persistent Monitor, and `.agent-workflows/orchestrator/night.md`
defines that loop as a turn that ends on the Monitor's events: they are "the only wake-up". A
session that says it is waiting on its Monitor is describing the one wake-up that works, yet
`monitor` sits in the observer class at `scripts/stop-wait.mjs` line 39, the list of things that
cannot wake a session. It fired twice on 2026-09-11 on the orchestrator's night session, after the
Monitor had already woken that session about a dozen times.

So the word list is wrong in both directions: it misses a wait on an observer whose noun is not
listed, and it refuses a wait on an observer that really does wake the session. Adding an
exception for the word would reopen the 2026-09-04 miss, where "the monitor" meant nothing that
could wake anyone. Option 3 above answers both errors, because the durable fact is state. For this
direction the state is "this session holds a live Monitor task", which the hook cannot see today.
Until it can, this error costs one extra turn per fire, which is the cheap direction.

## Evidence

- `scripts/stop-wait.mjs` - the patterns, the quoted-span stripper, and the header recording the
  four sessions on 2026-08-30 and 2026-09-01 that produced the hook.
- `scripts/stop-wait.test.mjs` - "declaresWait catches every observer a session believes will wake
  it, not only watcher" is the case that failed, and the person tests are the false positives that
  were live and unnoticed until the widening forced them into view.
- `docs/ORCHESTRATION_NEXT.md` section 3, item 5 - why an unconditional stop hook was rejected.
