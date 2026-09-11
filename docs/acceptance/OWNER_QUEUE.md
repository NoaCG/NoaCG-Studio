# Owner queue - what is built and not yet confirmed by a human

The one thing about shipped work that no file in the repo can know: whether the owner has actually
LOOKED at it. Git knows what landed; only a person knows whether it was any good.

**The items are not in this file.** Each one is its own file in [`owner-queue/`](owner-queue/),
named `<date>-<slug>.md`. This file holds the rules they follow and the log of what was dropped.

Run **`/walk`** to go through them in one pass. It reads that directory, groups the items by the
place each one's route opens, takes the owner there once, and records the tick or the feedback per
item. No open `walk` item IS the confirmation that nothing is waiting.

## Why one file per item

Every session that lands observable work adds an item, and several sessions land in one night. A
shared list means N sessions appending at the same offset, which is a git conflict - and
`auto-merge.mjs` aborts on a conflict and stops, so the branch sits unlanded until a person looks
at it. One file per session cannot collide, so the queue costs a night wave nothing.

## Why a walk item has to say WHY it is his

**Owner, 2026-09-10**, at the end of a walk of his phone list:

> we need to find a way to get less into my queue because design and technical questions should be
> possible to answer with the AI. It should be logical what we want to do.

That is the THIRD time he has said a version of it. "A design default is NOT a taste question" is
2026-09-03 and "a TECHNICAL problem is never his" is 2026-09-04, both below. Saying it in prose
plainly does not hold, because the queue reached 96 items with 78 open anyway. So it is a key now.

`needs:` had already closed this door for `owner-action`, and it worked. It did nothing for the far
bigger list, because a `walk` or `walk-p` item never had to justify itself at all - everything
observable landed on his desk by default. `because:` is the same mechanism one list further in.

**Four reasons, and they are the ones this document already called genuinely his:**

| `because:` | what it means | what it is NOT |
|---|---|---|
| `taste` | whether a shipped thing is any GOOD - his eye, no defensible general answer | "which of these two is better designed", which is a design default you decide |
| `scope` | what the product IS or is not; a change to the thing rather than a setting | a behaviour that is obviously wrong, which is a bug you fix |
| `direction` | where the product goes, including a call between two defensible options that point it different ways | a call between two options where one is plainly better |
| `money` | it costs money, or it commits him to a cost | a cost you can measure and stay inside |

**If none of the four fits, the item is not his.** Decide it, do it, and say in the item what you
decided and why - so he can overrule a thing that exists rather than adjudicate one that does not.

The worked example is from the same day. An agent walking the computer list called three import
items taste. Two of them were not: which share of the artwork makes a layer a background plate is
answered by the distribution already in the code, and whether a prefix reads `static:` or `d:` is a
naming default. Only the third - whether dropping four boards should make four graphics - was
really his, because it changes what the wizard is. That is a `scope` item, and the other two should
have been decided and shipped.

The gate is date-gated from 2026-09-11 for the reason every change here is: sessions file items
while their branches are in flight, and a same-day requirement reds a build over a line the prompt
never saw. The value is validated whenever it is present, at any date.

### The test the 2026-09-10 drain used, so the next one does not re-derive it

The gate could only stop the list growing. On 2026-09-10 the 68 `walk` and `walk-p` items already
filed were judged against the four reasons one at a time, and the test that separated them was
this, applied in order:

1. **Does answering it change the PRODUCT - what it is, where it goes, or what it costs?** Then it
   is `scope`, `direction` or `money`, and it is his.
2. **Is there a shipped result on screen whose quality has no defensible general answer and which
   no gate can assert?** Then it is `taste`, and it is his - *"is this any good"* stays his however
   drivable the route is, which is the rule "Re-kinding an item" already sets out below.
3. **Otherwise it is not his.** Decide it, write the decision and the argument into the item, and
   re-kind or drop.

**The sharp edge is step 2, and it cuts on ONE word: DECIDED.** A question an item raises and then
argues to a conventional answer in its own text is decided, whoever wrote it and however it is
phrased. Well over a dozen of the 68 ended with a sentence shaped like *"say if you would rather…"*
sitting directly under the paragraph that had already settled the same question from ordinary
practice. That sentence is politeness, not a question, and reading it as one is how a directory of
92 files came to put 68 items on his two lists. The counter-error is as real: an item that says out
loud that no gate can judge it, or that hands him two readings only one of which can be on screen,
is his - and 22 of the 68 were.

**Three outcomes, and none of them is a delete on an agent's own verification.** An item that names
a reason keeps it. An item whose remaining question is a claim about the product is re-kinded to
`agent` with the note the re-kinding rule requires, and STAYS here until an agent drives it -
re-kind and delete are separate commits by rule, and this drain made none of the delete commits.
An item with nothing left to drive at all is dropped, with the decision and its argument in the log
at the end of this file.

**Consolidation is not one of the three and it is not a drop.** Several items opening one screen
become one item carrying every question verbatim, the way four items waiting on the same Tuesday
became `2026-09-10-the-first-weekly-alignment-session.md` the same day. It is the only move that
shortens his list without deciding anything, so it is the first one to reach for.

## The shape of an item

```markdown
---
kind: walk          # walk | walk-p | owner-action | hardware | agent
date: 2026-08-25    # when it was filed, so /walk can present newest first
needs: account      # owner-action ONLY, and REQUIRED there: account | money | identity | harness
because: taste      # walk and walk-p ONLY, and REQUIRED there: taste | scope | direction | money
serves: now         # OPTIONAL - set it when the work serves docs/GOALS.md ## NOW
---
# Short title

What changed, in one sentence a non-technical reader follows.

## The route, under a minute

The URL, the branch or the exact command - under a minute to reach, or it will not get walked.

**What to look at.** The thing that might be wrong, not a feature summary. Then the commit or
branch it came from.
```

- `kind: walk` - the owner, at the computer. Five minutes at the desk with the product open.
- `kind: walk-p` - the owner, from his phone. A taste ruling, a preference, a direction call:
  anything he can answer in a sentence without the dev environment in front of him.
- `kind: owner-action` - only he can do it, and `needs:` says which of the four reasons it is.
  A technical problem is never one of them: see "A TECHNICAL problem is never his" below.
- `kind: hardware` - needs a CasparCG box, an SPX server or real people, and is not "unseen".
- `kind: agent` - an agent settles it by driving the product. Not for him at all.
- `done: true` - kept as a record rather than deleted, for an action whose outcome matters later.
- `answered: true` - optional. Set it when the item captures his feedback AND a later section
  answers it, so the re-look he is owed sorts ahead of items nobody has moved.
- `needs:` - REQUIRED on `owner-action`, meaningless anywhere else. One of `account`, `money`,
  `identity`, `harness`, defined in "A TECHNICAL problem is never his". Gated by
  `npm run check:owner-queue` for items dated 2026-09-05 or later.
- `serves: now` - optional, and the only thing that decides priority. Set it when the item's work
  serves the `## NOW` push in [`../GOALS.md`](../GOALS.md); leave it off otherwise. It lives in the
  item's own front matter rather than in a ranked list here, for the same reason the items do: five
  sessions editing one ordered list at the same offset is a git conflict, and a conflict strands a
  landing. When the push changes, the items that no longer serve it lose the key.

**The route is a SECTION, in one of two shapes**, because `/walk` groups the queue by the place a
route opens and reads that grouping straight off this text. Either a `## The route ...` heading or a
`**Route ...**` lead-in starts it; a heading or a `**What ...**` lead-in ends it. Open with the
place itself - `/app`, `/docs`, `<https://noacg.studio>`, the command - so the item lands with the
others that open the same screen. From 2026-09-10 `npm run check:owner-queue` refuses a `walk`,
`walk-p` or `agent` item with no route section at all. It never asks the route to MATCH a known
place: a new place is a fine answer, and a gate that pushed items into existing buckets would be
inventing where the owner has to go.

## Which kind does an item get

**Ask who can settle it, not how important it is.** If the item's remaining question is a claim
about the product - does this button do what the item says, does this file arrive with the right
answer, does the number reach the frame - an agent can drive it and confirm it, so the kind is
`agent` and the owner never sees it. If settling it needs a human opinion (taste, a preference,
a direction call) and that opinion fits in a sentence, it is `walk-p`, because the phone is the
cheapest place he can clear it from. If the opinion needs him looking at the screen or driving the
thing himself, it is `walk`. If it costs money, publishes past `main`, or needs an account we do
not hold, it is `owner-action`. If it needs a playout box, a server or an audience, it is
`hardware`. Be honest in both directions: *"does this look good"* is his, and *"does this button
do what the item claims"* is ours. An item that carries both halves is filed for the human half
and the agent half is checked before it is presented, so his minute is spent on the opinion.

### A design default is NOT a taste question (owner, 2026-09-03)

He pushed back on the whole shape of this queue after three walks that were, in his words, *"about
design, the look, and these kinds of issues"*:

> They were sent to me because you think I'm the only one that can answer these, but I want to push
> back on that. You are the almighty AI with all the design books and all the knowledge. This is
> not something that I should just choose how it looks like. There is logic to how this should be
> built, and we need to use that logic. We are not building stuff just the way I want it; it's
> about how people in general want it and what they think is the default.

> So, this mindset we need to teach the orchestrator in the future so it doesn't land this on my
> table when it can fix and figure out these things themselves.

**So "a human opinion is needed" is a much narrower test than it has been read as.** Before filing
anything as `walk-p` or `walk`, ask whether the question has a defensible general answer - what
broadcast graphics conventionally do, what a designer would expect, what most users would call
correct. If it does, **decide it, do it, and say in the item what you decided and why**, so he can
overrule a thing that exists rather than adjudicate a thing that does not. A default is research,
not taste.

What genuinely reaches him: money, direction, product scope, a call between two options that are
both defensible and point the product different ways, and whether a shipped thing is any good. Not
*"which of these should be the default"* when one of them is obviously conventional.

The failure this replaces is real and it was ours: he was asked to rule on the palette collapse,
on the growth default and on the ladder's per-field behaviour, and every one of those had a
defensible answer from ordinary design practice that nobody bothered to derive.

**Only a `kind: agent` item may be deleted on an agent's own verification**, and the commit that
deletes it says what was checked and what was seen. An agent confirming a claim is not the owner
having looked at it, and this queue exists to hold exactly that difference - a deleted item and a
walked one must not read identically afterwards.

### A TECHNICAL problem is never his (owner, 2026-09-04)

The section above narrowed which DESIGN questions reach him. This one closes the other door, and
he was blunt that he has said it before and it kept happening:

> if and when you want to ask the owner a question about how to fix it, just ask another agent or
> yourself the same question. You will be able to answer it.

> This is something fundamentally wrong with how we work, because I cannot solve merging issues
> or, if there are some CI problems and something is stuck behind something else, I cannot fix it.
> It is still going to be you who fixes it, so you do not need to have me for anything.

> when the orchestrator thinks that the owner (me) should do something and starts waiting for me,
> then it is a problem because I have no special skills to fix these issues.

> If it is a bug issue, if the code is wrong, if GitHub has problems, if the branches cannot land,
> if there is a problem with the worktrees, I do not know how to fix that. You know how to fix
> that, so you have to just prompt yourself with a question and ask, "What would you do in this
> situation?" You will find a way.

> I will just go and ask Claude myself, and it will give me the answer, and then I will paste it
> to you. It is totally pointless to have me here in the loop.

> this apparently needs to be a hard rule because I have been trying to tell you this many times,
> but still, I get these requests that I need to run a Bash command to merge a branch... I should
> not need to do that... You are much better at this than me.

**The hard rule. A technical problem is never an owner action.** A failing build, a red `main`, a
branch that will not land, a stuck queue, a worktree in a bad state, a GitHub Actions problem, a
broken hook, a dependency to upgrade, a command that needs running: every one of those is ours,
including the ones we have not solved yet. Not knowing how is not a reason to file it for him. It
is the reason to ask another agent, or to ask yourself the question you were about to ask him, and
then research it and do it. He has no skill here that we lack, and he has said so repeatedly. The
loop through him is him asking an AI and pasting the answer back to us.

**So `owner-action` needs a REASON, and the reason is a closed set.** Every item filed as
`owner-action` from 2026-09-05 carries a `needs:` key naming which one it is, and
`npm run check:owner-queue` refuses the item if it does not. There are four values and there is no
"other":

- **`account`** - credentials or a console we do not hold: his GitHub notification settings, a
  Google Cloud project, a registry login.
- **`money`** - it costs money, or it publishes past `main` where a later commit cannot take it
  back.
- **`identity`** - he has to speak or sign as himself or as the organisation: an email to the EBU,
  his name on a pull request, a licence clarification from a vendor.
- **`harness`** - the agent harness refuses it by design, and the item says which refusal it hit.
  This is the narrow one and it is the easiest to abuse: it means the tooling stopped an agent, not
  that the agent found the job hard. Two real cases, both hit on 2026-09-04 while writing this
  rule: a session cannot add entries to its own `.claude/settings.json` permission allowlist, and a
  session cannot run a global install that mutates the machine outside the repo. Both refusals are
  deliberate, and a session that can widen its own permissions has none.

**If none of the four fits, it is not his, and the item does not get filed. The work gets done.**
An existing `owner-action` item that cannot name one is MIS-KINDED: re-kind it, or just do it.
That is the one exception to "`owner-action` and `hardware` are never re-kinded" in the next
section, and it runs in the safe direction only, off his list and never onto it.

**And never WAIT on him.** An item on this list is a to-do, not a dependency, and the rest of the
work carries on around it. If a landing, a wave or a session has stopped, and the only reason it
has stopped is that somebody filed an item for him, that is the bug.

### Re-kinding an item, including one filed for him

The filing session picks the kind (`.agent-workflows/walk.md` §4), and that is what makes routing
automatic rather than a triage job. But a kind can be WRONG - filed before the design-default rule
above existed, or filed as `agent` and then found to be unsettleable by one. So re-kinding is
allowed, in both directions, under three conditions, and they exist because the obvious abuse is
real: **a session that may convert `walk` to `agent` and then delete it on its own verification can
empty this queue without anybody looking at anything.**

1. **The re-kind says which half of the test it met**, in the item, above its original text. For
   `walk`/`walk-p` to `agent`: the remaining question is a claim about the product an agent drives,
   or a default with a defensible general answer. For `agent` back to `walk`: what an agent tried
   and why it could not finish.
2. **Re-kinding to `agent` and DELETING that item are separate commits.** The re-kind commit stands
   on its own with its reasoning, so the conversion is reviewable independently of the walk that
   followed it. A single commit that both converts and deletes is the shape this rule refuses.
3. **`owner-action` and `hardware` are never re-kinded.** They need his account, his money or his
   hardware, and no argument about the question's nature changes that.

**A `walk` item whose remaining question is genuinely his is not re-kinded because an agent could
look at the screen.** The test is who can SETTLE it, not who can observe it: *"is this any good"*
and *"is this the product you asked for"* stay his however drivable the route is.

**And an `agent` item no agent can finish is worse than a `walk` item**, because it sits on a list
he is never shown. If a walk attempt fails for an environmental reason rather than a product one,
re-kind it back and say so - that happened on 2026-09-04, when a night session found it could not
judge a 1.34 s entrance in a hidden browser pane throttled to about a frame a second.

## The order the owner sees them in

**The kind decides which list an item is in; three keys decide the order inside it, and none of
them is a judgement made at presentation time** - so two sessions running `/walk` an hour apart
show him the same order.

`/walk` presents `walk-p` before `walk`, because a phone item costs him a sentence and a desk item
costs him five minutes at the machine. Inside each of those two lists the order is **`serves: now`
first, then `answered: true`, then newest `date:`** - all three front-matter keys, defined once in
the shape section above, so nothing here re-derives anything.

**And inside each list the unit he picks is a PLACE, not an item.** On 2026-09-09 the queue held 63
open items, and 28 of them - 22 on the NOW push - opened the same four clicks: the studio, Import
graphic, drop a file. Walked one at a time that is 28 trips through one menu, and what this queue
costs him is machine time. So `node scripts/check-owner-queue.mjs --routes` groups each list by the
place its items' routes open, largest first with any place holding a `serves: now` item leading, and
a walk opens a place once and settles everything on it. The place is DERIVED from the route text
each item already wrote - there is no key for it, because a key sessions must remember to fill is
wrong the first time somebody forgets, and every item already filed would carry nothing. The list of
places, and why each one is a place rather than a category, is in `scripts/check-owner-queue.mjs`.

Items whose route nobody else shares group as **"On their own"**, last, and that is not a failure -
they are walked one at a time as every item used to be. `owner-action` is never grouped: each one is
a different console we do not hold.

**`owner-action` is presented too, as its own short list after the other two**, because every one
of them is a real ask nobody else can do and there have never been more than a handful. Within it,
an item naming a real-world date leads (the OGraf ecosystem listing is against IBC on 12
September). Only **`hardware`** stays a count unless he asks, since it needs a playout box or an
audience rather than a decision. `done: true` is never presented.

**`kind: agent` is presented to the AGENT, never to him.** `/walk` reports how many are open in one
clause and offers to walk them; `/walk agent` walks that list. An agent item nobody ever reads is
worse than no item, because it looks handled - so if the count is not zero, it is a row of work,
not a note.

## How this list stays honest

- **An item goes in when the work lands**, with what to look at and how to reach it in under a
  minute. No item without a route - and a route written in one of the two shapes above, so the item
  joins the group that opens the same screen instead of costing a trip of its own.
- **An item leaves when it is walked** - `/walk` deletes the file. Git holds the history, so
  nothing is lost by removing it.
- **Feedback keeps the item open**, captured verbatim in the file, until the feedback is addressed.
- **Nothing is dropped for being old.** An item waits until the owner walks it, however long that
  takes.

Nothing here is a gate. It is a to-do list.

## Why age no longer drops an item

Until 2026-08-30 a `kind: walk` item older than 7 days was deleted as presumed seen, on the
reasoning that the owner tests most things within a couple of days. **Owner ruling, 2026-08-30:
nothing expires - he will get to all of them** (39 open at the time).

The expiry was solving queue LENGTH by discarding the one thing this queue exists to hold: a
deleted item and a walked item look identical afterwards, so the mechanism quietly biased the
record towards "all confirmed". Length belongs to the owner to pace. He ruled the same day that a
deep queue must not hold other work back either (*"nothing should block stuff"*), so **the queue
neither blocks nor evaporates - it is a list, not a dependency, and it may grow.** Anyone
re-enabling an expiry is turning that trade back on and should have an answer better than
"presumed".

## Dropped

The log of items removed without being walked, kept so a wrong drop is visible rather than silent.
The 7-day expiry that wrote the entry below no longer exists, so nothing is added here except by
an explicit decision to drop something.

**A `kind: agent` item deleted after an agent drove its route is not a drop and does not belong
here.** It was walked - by an agent rather than by him - and the evidence is the commit message,
which the rules above require to say what was checked and what was seen. The distinction matters
in both directions: putting those in this log would bury the real drops, and leaving a genuine
drop out of it is the silence this log exists to break.

- 2026-08-20-ig39-key-figures - dropped 2026-08-28, presumed seen
- 2026-08-30-b-antigravity-write-rule - dropped 2026-08-30, ALREADY DONE. It asked the owner to
  rewrite two `write_file` rules in his Antigravity settings so headless writes would stop being
  denied; he made that change the same afternoon and it was verified working (a write inside the
  granted directory succeeds, one above it is denied). Recorded in `docs/HARNESS_ROUTING.md`. Not a
  presumption - the thing it asked for was checked and found done.

- 2026-08-29-ibc-ograf-listing - dropped 2026-09-05 by the owner, during a walk: *"O-graph:
  listening, not yet. Remove it from the queue."* The listing is not cancelled, it is off the queue
  and on his own to-do list, which is where he parked it on 2026-09-03. The checklist survives in
  `docs/IBC_LISTING_CHECKLIST.md`, copy-paste ready, so nothing has to be re-derived when he picks
  it up, and nothing in the product waits on it.
- 2026-08-29-ograf-first-review - dropped 2026-09-05, same walk. The review was ratified on
  2026-08-29 and all four amendments were applied that day; the only thing keeping the item open was
  its two remaining owner actions, and he dropped both in the same breath - the listing above, and
  the GSAP clarification below. The verdict and the amendment trail stay in
  `docs/OGRAF_FIRST_REVIEW.md` §1 and §13.
- The GSAP licence clarification - dropped 2026-09-05 as a queue item, on his ruling: *"Gsap
  verification: not yet. Remove it from the list. Remind me in 6 months."* **The reminder is a
  mechanism, not a note.** `gsap-licence` is now a `MANUAL_REVIEW` entry in
  `scripts/check-vendored-versions.mjs` with a 180-day interval from 2026-09-05, so the weekly
  audit turns red around 2027-03-04 and files the rolling issue he watches. Until then the standing
  requirement is unchanged and lives in the GOALS ladder: preserve GSAP's replaceability.
- 2026-09-09-g-yle-network-diag-screenshot - dropped 2026-09-10 on his ruling: *"I will take care
  of the Yle network screenshot when I get there, you do not have to remind me."* He owns getting
  the screenshot; the fallback if he cannot is unchanged and is written into
  `docs/DEMO_2026-09-25.md` B0, which is now the one beat with no §7 row. **The item asked for two
  things and he answered one.** Its second question, which OGraf renderer Yle runs, was re-filed
  before the delete as `2026-09-10-be-which-ograf-renderer-yle-runs.md` and is still open - so if
  he meant to drop that one too, deleting that file is what does it.

### The 2026-09-10 drain against the four reasons - nine files, two of them drops

Seven of the nine were CONSOLIDATED rather than dropped: every question they carried is quoted
verbatim in the item that absorbed it, which opens the same screen, and git holds the originals.
They are listed here anyway, because a file that leaves this directory without being walked should
be findable from one place whatever the reason.

- 2026-09-08-the-checklist-says-which-box-each-line-is-in and
  2026-09-08-the-artwork-shows-you-the-box-and-the-room - into
  `2026-09-08-choose-how-a-line-sits-in-its-box.md`. Steps 1, 2 and 3 of
  `docs/TEXT_BOX_BINDING.md` on one board, one step and one trip.
- 2026-09-05-the-option-names-the-panel and 2026-09-08-the-panel-that-gets-taller - into
  `2026-09-10-bt-wider-then-taller-on-your-lower-third.md`. Three items on the too-long-text
  control, and the first one's own text already said its defect was fixed by the second.
- 2026-09-10-bj-published-take-is-half-a-second - into
  `2026-09-10-bm-published-verbs-are-fast-now.md`, which is the fix for it, landed the same day.
  bj told the owner to run the rehearsal unpublished; six hours later that advice was wrong, and
  the two items together would have handed him a measurement and its own contradiction.
  Anything that still cites bj by filename resolves through this entry and that item.
- 2026-09-06-puzzle-board-letters - into `2026-09-06-puzzle-reveal-letter-press.md`. Its one
  question was whether to build the "add a value to a list" control. It was built, on the same
  board, the same week.
- 2026-09-09-aa-slide-4-no-longer-sends-the-room-through-create-project - into
  `2026-09-09-s-the-25-september-deck-opens-in-powerpoint.md`. Both open the same file at the same
  double-click, and slide 4's own text was regenerated by the deck rebuild of 2026-09-10. Its
  surviving question - whether the room is told to take the production door or to export and
  take the package home - travelled on with that item.
- 2026-09-09-s-the-25-september-deck-opens-in-powerpoint - into
  `2026-09-10-ca-the-deck-now-ends-at-our-own-player.md`, on 2026-09-11. The rebuild filed a
  second walk item for the same file, so the owner had two items opening one deck. The first
  one's surviving question, its `Create project` decision and its font note are carried verbatim
  in the second, which keeps `because: taste` for the walk itself.

**Three of those five consolidations folded a `walk` item into an item this same change re-kinded
to `agent`**, which satisfies the re-kinding rule's separate-commits condition by the letter and
strains it in substance: there is no commit in which the conversion can be reviewed before the
absorbed file is gone. The review of this drain caught it and the worst case was reversed -
`2026-09-10-bt-wider-then-taller-on-your-lower-third.md` is a `walk` again, `because: taste`,
because it now carries three items' worth of the growth road he has reported broken three times.
**Two still stand and are named here rather than buried**: `bm` absorbing a superseded measurement,
and the puzzle board absorbing a question whose answer had already shipped. Anyone consolidating
again should re-kind the absorbing item in its own commit first, or leave it where it is.

Two were genuinely DROPPED, each with the decision that replaced it:

- 2026-09-06-learning-write-path - dropped 2026-09-10. Its mechanics had already been driven by an
  agent, and what remained was whether the compiled rule format - one to three imperative
  sentences, symbols in backticks, no evidence - is the house voice. **Decided: it is, and the
  deadline argues for deciding rather than waiting.** It is a machine-loaded rule store no user or
  owner ever reads, so it is agent machinery by the 2026-09-04 ruling; the format also already
  matches the owner's own standing writing rules. Phase 2b migrating 108 files into it is a reason
  to settle the format now, not a reason to hold a question open until it is expensive.
- 2026-09-06-cloud-landing-queue - dropped 2026-09-10. The queue itself was driven end to end by an
  agent on 2026-09-10 (pull request 231, landed as `919d7d27`). The one question left was whether
  to remove the owner's admin bypass after a week of landings. **Decided: the bypass stays.** It
  exists for the case where the queue itself cannot land anything, and removing it makes that case
  unrecoverable without console access - which is his account and nobody else's. Four days of
  landings with the bypass unused is evidence it is not being leaned on, not evidence it should go,
  and the cost of keeping it is zero. If he wants it gone, the ruleset is one setting.

**A third was dropped and put back the same day.**
`2026-09-07-pull-request-descriptions-for-people.md` was dropped on the argument that how a commit
subject is written is already a landed rule. The review of the drain found that answers one of the
item's three questions; the other two are about the rendered description on the pull request, which
no rule asserts. It is `kind: agent` now, not a drop. **The lesson is the one this log exists for:
a drop is the only outcome nobody can recover from his list, so a split argument is not enough for
one.**

## The standing instruction behind all of it (owner, 2026-09-03, closing the walk)

The rule above says which questions reach him. This says why, in his words, and it is the more
important half:

> One of the most important things from this whole session is that the agent, the orchestrator,
> has to trust itself more. You do know what to do. Search the internet, use logic; all these
> questions that you ask me right now can be answered by an all-knowing AI LLM.

> The goal is not rocket science. The agents need to have more agency and research a problem
> before asking me.

> But I just wish that I don't get questions that I myself would ask an AI to answer, if you know
> what I mean. There are very few questions that you do not know the answer to, trust me.

**The test, and it is the sharpest form of it we have: would he have to ask an AI to answer this?
Then it is not a question for him.** Research it - the web included - decide it, do it, and write
down what you decided and why. He overrules things that exist; he should not be asked to
adjudicate things that do not.

He was explicit that this is not a request to stop talking to him: *"It's easy for me to answer
questions because I can do that on the phone, so questions are fine"*, and *"there are many things
I want to double-check for real, and it's good that they are added to the walk"*. The cost he is
protecting is not his attention, it is his TIME AT A MACHINE - a sentence costs him nothing, and
clicking through menus and drawing SVGs costs him a lot.

And the standard the work is measured against, which is why the agency matters:

> whatever they are doing, we need to catch up. We need to have a graphic creator that can play out
> graphics that I can use with my students and, one day, with the rest of the world.

MXMZ and singular.live ship these capabilities today. A question parked on his desk overnight is a
day we do not catch up.
