# A walk now covers a route, not an item

Branch `claude/w-walk-covers-a-route`, from `origin/main` at `70abb5e5`. Three files carry the
change: `.agent-workflows/walk.md` (the procedure), `scripts/check-owner-queue.mjs` (the grouping
and the gate) and `docs/acceptance/OWNER_QUEUE.md` (the contract). One queue item was filed for the
change itself, and nothing in the queue was walked, closed or edited.

## What the queue actually looked like, before designing anything for it

75 files on disk, 64 open (11 carry `done: true` and are records, not work). The route lines were
written by dozens of sessions over three weeks in their own words, so the first question was whether
there is enough shape in them to group by at all. There is, and it is lopsided:

| Place | walk | walk-p |
|---|---|---|
| Import graphic - the studio, Import graphic, drop a file | **28** (22 serve NOW) | - |
| The studio - `/app`: templates, browse, the editor, a production | 12 (6 NOW) | - |
| A checkout - a command to run or a file to read | 9 (3 NOW) | 2 |
| The docs site - `/docs`, hosted or local | 1 | 1 |
| GitHub | 1 | 1 |
| The public site - `noacg.studio` | 1 | 3 |
| On their own | 0 | 0 |

Plus one `owner-action` (never grouped - each one is a different console) and 4 `hardware`, which
carry no route by design and are the only open items that group nowhere.

**The distribution is the finding.** 28 of 52 desk items - 22 of them on the NOW push - open the
same four clicks, and walked one at a time that is 28 trips through one menu. `serves:` has stopped
sorting anything, exactly as the weekly review measured: 31 of the 64 open items claim `now`. Route
is the axis with information left in it, and the owner's own account of what this queue costs him
says why it is the right axis - *"the cost he is protecting is not his attention, it is his TIME AT
A MACHINE"* (`OWNER_QUEUE.md`, closing section).

The phrasing worry in the row's prompt did not survive contact with the files: this was never a
normalisation problem. The route sections are consistent enough that 60 of the 64 open items land in
a shared place with no editing at all, and the four that do not are the hardware ones.

## The grouping rule, and why it is derivable

`node scripts/check-owner-queue.mjs --routes` prints the queue grouped. Three steps:

1. **Find the route section.** Two shapes are in use and both are honoured: a `## The route ...`
   heading and a `**Route ...**` lead-in. The section ENDS at the next heading or at a line-start
   `**What ...**` lead-in.
2. **Match it against an ordered list of places**, first match wins. The order is the whole rule:
   `/docs` before the site that hosts it, the import wizard before the studio that contains it, the
   studio before a checkout - because half the studio routes start with `npm run dev`, and grouping
   those as "a terminal" would send him to the wrong screen.
3. **Anything unmatched groups as "On their own"**, last, and is walked one at a time as before.

**No new front-matter key**, deliberately. A key sessions have to remember is wrong the first time
somebody forgets, and all 64 existing items would carry nothing. The route is a thing the contract
has demanded since the beginning, so the grouping rides on an obligation that already exists.

Two bugs in that rule were found by reading its own output rather than by reasoning, and both are
now pinned by tests:

- **The route stopped too late.** The receipts item's route is one command in a terminal, and the
  "what to look at" paragraph under it mentions the editor and the studio while describing a list of
  bugs. Read as one blob it grouped as "the studio". Hence the `**What ...**` boundary.
- **The route started too early.** This change's own queue item is titled *"A walk now covers a
  route, not an item"*, and a heading pattern that merely CONTAINED the word read the title as the
  route section, stopped at the next heading, and grouped the item on three words of prose. The
  heading now has to OPEN with the word.

## What a walk looks like now

Step 2 offers PLACES, not items: *"At the computer - 52 items in 6 places. 1. Import graphic (28, 22
serve NOW). 2. The studio (12, 6 NOW). 3. A checkout (9, 3 NOW)..."*. He picks one, step 3 opens it
ONCE and settles everything on it. The three lists are untouched - phone, computer, only-you - and
so is the order inside a place (`serves: now`, then `answered: true`, then newest). Places are
ordered by any NOW item first, then by size.

**Each item is still ticked on its own.** A group is a way of arriving, never one verdict over 28
things, and the procedure says so in as many words.

**When an item turns out to need somewhere else**, the walk follows it to its end and then rewrites
that item's route line to name the place it really opens - in the same commit as whatever else the
walk changed. The known example is the CasparCG export item, which starts in the import wizard and
ends at a locally served folder. That repair costs one line and is what stops the same item being
misfiled next time. The explicit prohibition is on the alternative: never move an item by adding a
key that only the presentation reads.

## The gate

`check:owner-queue` now refuses a `walk`, `walk-p` or `agent` item with **no route section at all**,
from `2026-09-10` - date-gated for the same reason `needs:` was, since sessions file items here
while their branches are in flight and a tightening reds a build for a line their prompt never saw.
`owner-action` and `hardware` are exempt: one is a console we do not hold, the other is blocked on a
playout box and has nowhere to send anyone.

It never asks a route to MATCH a known place. A genuinely new place is a fine answer, and a gate
that pushed items into existing buckets would be inventing where the owner has to go.

Per row F's rule, the new mechanism reports what it measured:
`[measured] 60 open queue items grouped by route (of 64 open; 6 place(s))`. If the regexes ever stop
matching, that number collapses and the build says so instead of quietly presenting one flat list.

## What was traded out of the instruction chain

`.agent-workflows/walk.md` went 174 -> 212 lines. No ceiling was raised (`check:shared-instructions`
pins only `orchestrator`; the tightest byte chain is unchanged at 37,929 free). Five passages were
cut to pay for part of it, each because `docs/acceptance/OWNER_QUEUE.md` holds the same thing in
full and walk.md now points at it:

- the ten-line blockquote on why the 7-day expiry was removed, to four lines and a pointer;
- the "design default is NOT a taste question" paragraph, by two lines;
- the "TECHNICAL problem is never his" paragraph, by two lines;
- "Triage before volume", by three lines;
- the hidden-browser-pane trap, by four lines, keeping the evidence and the instruction.

Net +38 lines for a new command, a rewritten step 2, a rewritten step 3 and the route-shape rule in
step 4. I would not trade further: what is left in walk.md is the part that changes behaviour at the
moment of filing.

## Pointers

- `scripts/check-owner-queue.mjs` - `PLACES` (the list and the ordering argument), `routeTextOf`,
  `placeOf`, `ROUTE_REQUIRED_FROM`, and `--routes`.
- `scripts/check-owner-queue.test.mjs` - 40 tests, 11 of them new, including both route-boundary
  regressions and the date gate in both directions. Discovered by `scripts/gates.mjs` from disk, so
  it runs in `npm run build` with no wiring.
- `docs/acceptance/OWNER_QUEUE.md` - "The shape of an item" (the route section rule) and "The order
  the owner sees them in" (the grouping).
- `docs/acceptance/owner-queue/2026-09-09-a-walk-now-covers-a-route.md` - the item asking him
  whether the groups match how he would sit down and do this.

## What is left

**The one open question is his, and it is in the queue item:** whether "Import graphic (28)" reads
as one job or as a wall he would never start. If it is a wall, the fix is a cap on what a place
offers in one sitting, and that is a small change to `printList`.

Two smaller things I decided rather than filed. "A checkout" holds both commands to run and
documents to read; they are one opening (the machine, no product) and splitting them would make two
groups of four. And `owner-action` is not grouped at all, since every one of them is a different
console - grouping a list of one would only add a line.
