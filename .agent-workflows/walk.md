# walk - go through what is built and not yet confirmed by a human

Shared canonical procedure for the `walk` workflow - `/walk` in Claude Code, `$walk` in Codex.

**The question this answers: is there anything the owner should look at?**
The items live one per file in `docs/acceptance/owner-queue/`, each with a `kind:` saying WHO can
settle it - `walk-p` (him, from his phone), `walk` (him, at the computer), `owner-action`,
`hardware`, or `agent` (nobody needs him: an agent drives the product and confirms it).
`docs/acceptance/OWNER_QUEUE.md` holds the rules, the routing decision and the Dropped log. No
open `walk-p` or `walk` file is a real answer - say so in one line and stop.

Optional argument: a filter (an item's subject, `hardware` to walk the blocked list instead, or
`agent` to see what is queued for an agent rather than for him).

## Why this exists

Git records what landed. It cannot record whether a person looked at it and thought it was any
good - that is the one fact about shipped work no file in the repo can hold, and it used to be
smeared across forty memory entries as prose nobody re-checked. The queue holds it in one place,
and this workflow is how it empties.

## 1. Read the queue, grouped by where it sends you

```bash
node scripts/check-owner-queue.mjs --routes          # his three lists, grouped
node scripts/check-owner-queue.mjs --routes agent    # the agent list
```

That prints every open item under the PLACE its own route opens - the studio's import step, `/app`,
`/docs`, the public site, GitHub, a checkout - already in the order below. Read the files themselves
for the items you are about to walk; do not re-derive the grouping or the order by eye, because a
judgement made at presentation time gives him a different list every session and he cannot tell a
re-ordering from new work.

**Nothing is deleted for being old. Present every open item, however old, and delete one only when
the owner has actually walked it** (step 3) or told you to drop it. The 7-day expiry was removed by
owner ruling on 2026-08-30 - it was solving queue LENGTH by discarding the human look this queue
exists to hold, since a deleted item and a walked one read identically afterwards. The reasoning in
full, for anyone tempted to re-enable it: `docs/acceptance/OWNER_QUEUE.md`, "Why age no longer drops
an item".

The queue is therefore allowed to grow, and that is fine: the owner ruled the same day that a deep
queue must not hold work back either (*"nothing should block stuff"* - section 2 of
`.agent-workflows/orchestrator.md`). It is a LIST of what is waiting to be seen: it neither blocks
nor evaporates. What a growing queue costs is his TIME AT A MACHINE, which is why step 2 spends it
one route at a time rather than one item at a time.

## 2. Present the PLACES, not the items - the phone list first

**Three lists, in this order, and never one merged list.**

1. **From your phone** - every open `kind: walk-p`. These are taste rulings, preferences and
   direction calls: he answers each in a sentence, with nothing open in front of him. This list
   goes first because it is the cheapest for him to clear, and because he can clear it anywhere.
2. **At the computer** - every open `kind: walk`. These need the product on screen.
3. **Only you can do these** - every open `kind: owner-action`, short and always shown. Each one
   names its reason in `needs:` - an account, money, his identity, or a harness refusal - and there
   have never been more than a handful. Present the reason with the item, so a wrong one is visible
   to him rather than only to the gate.

**`hardware`** stays a count unless he asks or filters for it. **`done: true` is never presented.**

**`kind: agent` is not his list, and it is not a silent bucket either.** An agent settles those by
driving the product. Say how many are open in one clause, offer to walk them, and walk them on
`/walk agent` - by the same procedure as step 3, with the agent in the owner's chair. An agent item
nobody reads is worse than no item, because a queue that shows zero for him looks finished.

**Inside a list, the unit he picks is a PLACE, not an item.** On 2026-09-09 the queue held 63 open
items and 28 of them - 22 of those on the NOW push - opened the same four clicks: the studio, Import
graphic, drop a file. Walked one at a time that is 28 trips through the same menu, and the thing he
is spending is machine time, not attention. So each list is presented as its places, largest first:

```
At the computer - 51 items in 6 places
  1. Import graphic (28, 22 serve NOW) - drop a file, look at what it read
  2. The studio (12, 6 NOW) - /app: templates, browse, the editor, a production
  3. A checkout (8, 3 NOW) - commands to run and files to read
  ... then /docs (1), GitHub (1), the public site (1)
```

He picks a place; step 3 opens it once and settles everything in it. Name the place, its count and
its NOW count - the items inside it stay a list you read out only when he picks it, one line each:
what it is, and what varies for this one (the file to drop, the screen to open).

**The place is DERIVED from the route each item already wrote** - `--routes` matches the route
section against a short ordered list of places, first match wins, and `scripts/check-owner-queue.mjs`
holds both the list and the reasoning. There is no front-matter key for it: a key sessions have to
remember is a key that is wrong the first time somebody forgets, and the 63 items already filed
would all carry nothing. **"On their own"** is the last group and it is not a failure - it is the
items whose route nobody else shares, walked one at a time as they always were.

Order of the places: any place holding a `serves: now` item first, then by size. Order INSIDE a
place is the same three front-matter keys as ever, so two sessions an hour apart show him the same
list: **`serves: now`** first, then **`answered: true`** (the re-looks he is owed), then newest
`date:` first. Within the owner-action list - which is never grouped, since every one of them is a
different console - one naming a real-world date leads. Full rule and its reasoning:
`docs/acceptance/OWNER_QUEUE.md`, "The order the owner sees them in".

**Triage before volume** (owner, 2026-08-28: *"this takes too much time... we need to keep these
sessions short"*). The `serves: now` set IS the high-priority set. **Read that key; never re-derive
it by reading `docs/GOALS.md` yourself** - it is set when the item is FILED, which is what makes two
sessions agree. Several items that are fragments of one real walk get CONSOLIDATED into one item.

If the Open list is empty, say exactly that and stop. That IS the confirmation the owner is asking
for when they run this.

## 3. Walk a PLACE - open it once, settle everything on it

For the place picked (or the first, if the owner says "go"):

1. Get them in front of it, ONCE. Start the dev server through the preview tools if one is not
   already up (never a raw shell command - the guard hook refuses it, and for good reason).
   Navigate to the place, not to the first item. If an item in the group is on an unmerged branch,
   say so and name the branch rather than switching anything.
2. Then take its items in order. For each: say the one thing that varies - the file to drop, the
   field to type into - and its own "what to look at" line, in one sentence.
3. **Wait. Do not narrate what they should be seeing, and do not judge it for them.** The whole
   value of this list is a human opinion; an agent's account of the same screen is what the repo
   already has.
4. Record the answer, item by item - a group is a way of arriving, never a single verdict. Ticking
   a group is not a thing; each item is settled on its own:
   - **Good** -> delete the item's file. That is what "walked and fine" looks like; git holds the
     history, so nothing is lost by removing it.
     A `kind: agent` item is deleted the same way, by the AGENT, after driving the route itself -
     and its commit message says what was checked and what was seen, so the history can still tell
     an agent's confirmation apart from the owner's look. Nothing else may be deleted that way.
   - **Feedback** -> capture it VERBATIM in the item, then turn it into work: a task now if it is
     small and in scope, otherwise a line in `docs/GOALS.md` or an issue. Say which you did. The
     item stays open until the feedback is addressed, with the feedback under it.
   - **Not now** -> leave the file exactly as it is. It waits for the next walk; nothing removes
     it in the meantime.

**When an item turns out to need somewhere else, follow it and then FIX ITS ROUTE.** The group is
derived from what the item says, so an item that lands in the wrong one is an item whose route line
is wrong or incomplete - a CasparCG export that starts in the import wizard and ends at a local web
server is the honest example. Walk it to its end wherever it goes; then, in the same commit as
whatever else that walk changed, rewrite its route section to name the place it really opens. That
is the whole repair, it costs one line, and it is what stops the same item being misfiled on the
next walk. Never move an item by adding a key that only the presentation reads.

**The trap that has already produced one wrong item: a hidden browser pane freezes animation.** When
the preview pane an agent is driving is not composited - minimised, or behind another - the browser
stops calling `requestAnimationFrame` and every GSAP timeline stops with it. A counting figure then
sits at whatever frame it reached and reads exactly like a graphic that aired a zero. On 2026-09-04
an agent reported that about Rising Total; three instrumented routes could not reproduce it, and the
same route with the pane FRONTED counts normally. Front the tab and drive it again before writing
down that a graphic is frozen - and distrust the timing either way, since in that state a screenshot
is what advances the tween.

Then the next item in the place, and when the place is empty, offer the next place.

## 4. Adding to the queue

Any session that lands observable work adds ONE FILE in the same commit:
`docs/acceptance/owner-queue/<date>-<slug>.md`, with `kind:` and `date:` front matter. **One file
per item, never a shared list** - five sessions appending to one list at the same offset is a git
conflict, and a conflict makes the landing job abort and stop, which strands the branch until a
person looks at it.

**Before the kind comes the prior question: is this even his to answer?** **A design default is NOT
a taste question** (owner, 2026-09-03; the ruling and the three items that provoked it are in
`docs/acceptance/OWNER_QUEUE.md` under that heading). Where the question has a defensible general
answer - what broadcast graphics conventionally do, what a designer would expect - the session
DECIDES it, does it, and says in the item what it decided and why, so he can overrule a thing that
exists rather than adjudicate one that does not. What genuinely reaches him: money, direction,
product scope, a call between two defensible options that point the product different ways, and
whether a shipped thing is any good.

**And a TECHNICAL problem is never his** (owner, 2026-09-04). A red `main`, a branch that will not
land, a stuck queue, a bad worktree, a GitHub problem, a dependency to upgrade, a command that needs
running: all ours, including the ones we have not solved yet. Not knowing how is the reason to ask
another agent, not the reason to file it. So `owner-action` carries a `needs:` key naming which of
four real reasons it is (`account`, `money`, `identity`, `harness`), `npm run check:owner-queue`
refuses an item filed without one, and an item that cannot name one is not his: do the work. His
words are in `docs/acceptance/OWNER_QUEUE.md` under "A TECHNICAL problem is never his".

**The FILING session picks the kind**, which is what makes the routing automatic rather than a
triage job somebody does later. The decision rule is one paragraph in `docs/acceptance/
OWNER_QUEUE.md`, "Which kind does an item get": ask who can settle it. A claim about the product
an agent can drive is `agent`; an opinion that fits in a sentence is `walk-p`; an opinion that
needs the screen is `walk`. **Defaulting to `walk` is not the safe choice** - it is how a queue
of sixty-two accumulated, and a deep queue stops being read at all.

An item needs four things or it does not go in:

- what changed, one sentence a non-technical reader follows;
- **the route** - the URL, the branch, the exact command. Under a minute to reach, or it will
  not get walked;
- what specifically to look at - the thing that might be wrong, not a feature summary;
- the date and the commit or branch.

An item with no route is not an item. If you cannot say how the owner reaches it in a minute,
that is the work, not the note.

**Write the route in one of the two shapes the queue already uses**, because step 2's grouping is
read off it and an unreadable route puts the item on its own:

```markdown
## The route, under a minute          ...or...   **Route, under a minute.** Open ...
```

Open with the place - `/app`, `/docs`, `<https://noacg.studio>`, the command - and put "what to
look at" in its own heading or `**What to look at.**` lead-in, since that is where the route stops
being read. From 2026-09-10 `npm run check:owner-queue` refuses a `walk`, `walk-p` or `agent` item
with no route section at all; it never asks the route to match a known place, because a genuinely
new place is a fine answer and a gate that pushed items into existing buckets would be inventing
where he has to go.

## 5. Finish

One short report: which places were walked and what is left in each, what was ticked, what feedback
was captured and where it went. If feedback became a task, name it. Then the ordinary wrap-up.
