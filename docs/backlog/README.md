# docs/backlog/ - the shelf

Ideas queue here instead of jumping the line. **One file per idea**, named by a stable slug
(`copy-tells-drain.md`), so anything else in the repo can point at it and keep pointing at it.

This folder exists because a good idea arriving mid-sprint has exactly two honest destinations:
the roadmap, or a shelf. Without the shelf it takes the third one, which is derailing whatever is
in flight. Nothing here is scheduled. Nothing here is a commitment.

## What a backlog file must contain

```markdown
# <what it is, in one line>

**Filed:** <date>. **Source:** <owner ruling / handoff / measurement / build feedback>

## Why
<Why this is worth doing AT ALL. Mandatory. An item with no Why is deleted, not filed.>

## What it would take
<Rough shape. Enough that a fresh session can judge the size without re-deriving it.>

## Evidence
<Numbers, quotes, the doc that measured it. Link rather than re-argue.>
```

**A defect report naming a file is checked against the RULE STORE for that file's scope before it
is filed.** One `npm run rules -- <path>` (or a grep of `contracts/rules/`) - a claim that
contradicts a landed rule is usually the claim that is wrong, and the check costs seconds at filing
against a whole row later. Paid for on 2026-09-09: a row was planned off a backlog file that was
itself planned off an unverified delegate claim, and only reproducing before fixing stood between
it and a shipped regression. The file even recorded that the claim's author had been measured wrong
on two of six claims in the same review, and it still became a row. More review of the claim is not
the guard; reading what the repository already says about that file is.

**`## Why` is mandatory and it is the whole point.** An idea without a stated reason cannot be
compared against anything, so it never wins a slot and never gets deleted either - it just sits
there making the folder look like work. If you cannot write the Why, the idea is not ready to be
filed.

## Owner receipts

**An idea the OWNER raised carries a receipt**: a front matter block above the shape above, so the
ask survives a forgetful planner - who raised it, when, what was actually said, and where it stands.
`node scripts/owner-receipts.mjs` lists every receipt with its age, standing asks oldest first and
findings in their own section; `--check` runs in `npm run build` and fails on a file that credits
the owner without one, or on a receipt missing the field its state needs; the orchestrator's plan
check refuses a plan that never mentions a standing ASK.

```markdown
---
v: 2                         # the receipt format version; a NEWER one refuses, an OLDER one migrates on read
source: owner                # owner | derived - `derived` says out loud that this is NOT his ask
kind: ask                    # ask | finding - see "An ask is not a finding" below
raised: 2026-09-01           # the day the owner said it
state: unstarted             # unstarted | advanced | active | parked | superseded
branch: claude/x-thing       # required while active
note: what landed, or why it waits   # required when advanced, parked or superseded
asked: "the owner's own words, or a paraphrase marked as one"   # `found:` instead, on a finding
serves: NOW                  # optional: NOW, a programme id (P6), or a receipt slug - the frontier it is on
size: standard               # optional: small | standard | large - launch-to-land estimate class
touches: src/x.ts, src/y/    # optional: files/globs the work owns (what collision-check reads)
covered-by: x.spec.ts        # optional: covering e2e specs (what collision-check reads for a shared flow)
needs-owner: none            # optional: none, or account | money | identity | harness if it needs a person
---
```

### An ask is not a finding

**`kind: ask`** is a thing the owner wants. **`kind: finding`** is a bug or a question that turned
up while serving one - real work, and never his requirement. Version 1 printed both under the
heading `asked:`, so a defect he mentioned in passing read as an instruction he had issued, and once
a number is written under his name nobody argues with it again. Owner, 2026-09-03:

> distinguish between things I explicitly asked for and bugs/findings that arose while pursuing
> those asks. Those can absolutely remain work, but don't turn them into owner requirements
> retroactively.

So a finding is quoted under **`found:`**, and `--check` refuses a finding that carries `asked:` at
all. When it is genuinely unclear which one a receipt is, file it as an **ask**: printing our own
bug under his name costs an argument nobody has, while losing a real ask costs the thing this whole
mechanism exists to prevent.

Only asks are what a wave plan must account for by name. A finding takes its turn through the drain
order below, like every other item on the shelf.

**A file that quotes him without being his ask carries `source: derived`.** That answers the
owner-credit net out loud. Before it existed the net fired on the very correction that said an ask
had been invented, and the only way past was to bury the correction below line fifteen.

### The states

- **`unstarted`** - nothing has happened.
- **`advanced`** - work landed against this receipt and the ask still stands, with no branch owning
  it. `note:` says what landed (name the commit) and what is still missing. This word exists because
  `cloud-sessions-for-stateless-rows` had real measurement landed against it and an untouched ask,
  and counted as `unstarted` beside a genuinely untouched item - the one number a planner steers by
  was drifting in the direction that manufactures work.
- **`active`** - a branch owns it, named in `branch:`.
- **`parked`** / **`superseded`** - `note:` says why, or by what.

**A receipt still on version 1 is NOTED, never refused.** It migrates on read - no `kind:` means
`ask`, which is how everything in version 1 was written - and the check prints one line asking for
the rewrite. A session files a backlog item while its branch is in flight, so failing the build for
a shape that landed after it was launched reds somebody else's work for a line their prompt never
saw. `scripts/check-owner-queue.mjs` states the same rule for its own directory, and it is the
reason both gates only ever widen.

**The five optional fields feed the refill loop.** `serves`, `size`, `touches`, `covered-by` and
`needs-owner` are what a night-wave planner copies into the `## Candidates` table
(`orchestrator/night.md`), so `candidates.mjs` can decide the next launch mechanically - collision
against the running rows, fit against the window - rather than the planner re-deriving it in prose.
They are OPTIONAL and absent from most items; a `needs-owner` other than `none` keeps an item off
the unattended frontier entirely. Fill them on an item a night wave might refill from.

**`asked:` and the FILENAME are evidence of intent, never a specification.** Both are paraphrase -
the field says so itself, and a slug is a slug. A number, a wording or an implementation sketch in
either binds only where the owner made that detail the point; a session that serves the intent
better by other means does so and reports it, and never files the difference as a decision he must
make (`.agent-workflows/orchestrator.md`, "INTENT BINDS, THE DETAIL DOES NOT"; paid for 2026-09-03,
when `agents-md-warning-fails-at-99` turned a slug into a requirement he had never stated).

**Landed is not a state.** The file is deleted in the change that lands the work, exactly as the
graduate-or-die rule below says, and `node scripts/owner-receipts.mjs --closed` reads those
deletions back out of git - so a landed ask is still findable, from the repository alone.

**And that only stays true if it happens at the moment.** On 2026-09-05 six receipts on this shelf
had already been served - `scoreboard-behaviour` by `84cd2e47` two days earlier, with an
owner-queue walk filed for it - because the session that knew is the only one that ever knows, and
each had already ended. So `/queue-merge` asks the question while that session is still there, and
`node scripts/owner-receipts.mjs --serves <branch>` answers it from the branch's own diff: a receipt
that names this branch in `branch:` and that the branch does not touch refuses the landing until
somebody says what happened to it. It never guesses from a branch NAME, so a receipt nobody marked
`active` stays outside its reach - which is why marking one `active` when you start it is worth the
one line it costs.

## Graduate or die

An item leaves this folder one of two ways:

- **It graduates** into `docs/GOALS.md` "NOW", into a stage of a programme in `docs/PROGRAMMES.md`
  (or into a handoff that a session picks up), and the file is deleted in the same commit that
  schedules it. The backlog never holds a copy of live work.
- **It dies.** Anything that has sat here through a full push without being picked is re-read and
  either re-argued or deleted. A shelf that only accumulates is a landfill, and a landfill gets
  ignored, which costs exactly as much as never writing the idea down.

Nothing is kept for sentiment. Git remembers deleted files.

**Code cites these files, and the citations survive the deletion.** Roughly twenty comments in
`src/`, `e2e/` and `docs/` name a `docs/backlog/<slug>.md` as the WHY of the code they sit beside,
and the shelf is designed to lose that file the day the work lands. That is not a broken link, and
`check-contract-freshness.mjs` exempts this directory for exactly that reason. To read one:

    node scripts/owner-receipts.mjs --closed          # which commit closed which receipt
    git log --diff-filter=D -1 -- docs/backlog/<slug>.md
    git show <that sha>^:docs/backlog/<slug>.md

A new citation is better written the way the rule above says - state the fact, then name the commit
or the code - but an existing one is not a defect to chase.

## Never cite a file that is designed to disappear

**An item here outlives `docs/handoffs/` and `docs/acceptance/owner-queue/`, both of which are
consumed on purpose** - handoffs are swept once acted on, owner-queue items are emptied one at a
time by `/walk`. An item that leans on one of those paths for a fact stops making sense as soon as
that file is consumed, silently: the sentence still reads fine, and the thing it promises to
explain is gone. Measured 2026-08-30 - four dead citations in this folder and in `docs/`, all of
them into those two directories.

So **state the fact, then cite the durable thing**: the doc, the script, the commit, the code.
Naming a swept file as history ("filed to the owner queue on 2026-08-26 as …") is fine; making a
reader open it is not.

## Drain order

When a session asks "what should I do next", the order is:

1. **Owner feedback** - something the owner said, that is not yet true in the product.
2. **`docs/handoffs/`** - work a finished session handed over, already scoped.
3. **`docs/GOALS.md` "NOW"** - the binding roadmap of the current push.
4. **The next stages of ACTIVE programmes in `docs/PROGRAMMES.md`.**
5. **This folder.**

The backlog is LAST on purpose. It is where an idea waits for the day the first three are empty, or
for the day it becomes the answer to something above it.
