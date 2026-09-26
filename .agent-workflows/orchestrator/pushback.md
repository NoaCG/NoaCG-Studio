# Sections 4 and 6 - what I would push back on, then the questions and one pick

**Mandatory. Never omit it, and never soften it to be agreeable**: flagging is this section's whole
value. **What does NOT belong here: a DESIGN DEFAULT** - how a thing looks, which of two behaviours
is conventional, what a designer would expect. The row DECIDES it and says what and why, so he can
overrule a thing that exists rather than adjudicate one that does not; it never becomes a section-4
flag, a `walk-p` item or a prompt step. What still reaches him is enumerated in
`docs/acceptance/OWNER_QUEUE.md`, "A design default is NOT a taste question". Say plainly, then:

- **Which tasks do not serve the current push** (the `(now)` outcomes, `grounding.md`). A task can
  be good and still be wrong for today.
- **Real money.** Any task spending API money is called out UP FRONT with an estimate, and waits
  for an explicit go-ahead. A key in `.env` is not permission.
- **Size.** A structural rewrite of a primary surface, started beside four other sessions,
  deserves the sentence "are you sure, today?".
- **Work that is not ready** - an undecided design decision, or a dependency still in flight.
- **Cheap-check-first.** Where a reported defect has a known one-line cause, say so and put that
  check at the top of the prompt rather than opening an investigation.
- **A task you cannot write a WHY for.** Hand it over anyway, and say exactly that here.
- **An ask that is a faster horse.** When the requested MECHANISM is not the best route to the
  stated why, say so here and offer the better route beside it.
- **A DETAIL this wave is serving by other means** (core, "INTENT BINDS, THE DETAIL DOES NOT"). It
  belongs HERE, as news, and **never in the owner queue as a decision he must ratify or overrule**:
  that queue records what he must SEE, it is not a ballot.
- **An owner ask that does not serve NoaCG.** A tentative opinion is not a requirement: his words
  are INPUT to the plan and the goals this session holds, so **the owner is inside this pushback,
  not above it**. Pushback is not refusal and never delays the work - the concern and its
  alternative go here, the prompt still goes in section 5, and the disagreement is recorded BEFORE
  the wave runs.
- **Anything a classifier refused**, with its full prompt and the reason, so the owner can start
  it himself (`launch.md`).
- **The owner-queue depth**, as a number (core: a record, never a gate).
- **Every standing owner ask this plan does not start**, by slug, with its age and the reason it
  waits (held for a wave of its own, parked on a ruling, deferred behind the push). "Deferred
  behind the push" holds only where a row would COST the push, and the reason is owed PER receipt.
  An owner ask neither planned nor named here has been forgotten.
- **A wave that carried no coherence session for over a week** - measured, not recalled:
  `git log -1 --format=%cs --grep=coherence` (`coherence.md`).

If there is genuinely nothing to push back on, one line saying so. Do not invent a concern.

## Section 6 - open questions, then one pick

The deferral test is the core's: ask only for what he alone holds; importance alone never
qualifies. **Answer it yourself first**: a question that passes only as taste is not asked - write
the recommendation, decide with it, and carry it to the wave-end questionnaire (`report.md`). End
with a short pick: what the wave IS DOING, so one word redirects it - never a menu he must choose
from.
