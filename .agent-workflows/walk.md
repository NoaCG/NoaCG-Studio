# walk - go through what is waiting on the owner

Shared canonical procedure, invoked as `/walk` in Claude Code and `$walk` in Codex.

**The question this answers: is there anything the owner should look at or decide?** Items live
one per file in `docs/acceptance/owner-queue/`, each a `decision`, a `phone` look or a `desktop`
check. Older items carry old kinds that read as these. `docs/acceptance/OWNER_QUEUE.md` holds the
rules: the kinds, the keys, the order and how an item leaves.

Optional argument: a filter. Either a subject (walk only the items about it), or a kind: `phone`,
`desktop`, `decision`, or a legacy kind (`walk-p`, `walk`, `owner-action`, `hardware`, `agent`).

## 1. Read the queue, grouped by place

```bash
node scripts/check-owner-queue.mjs --routes           # his three lists, grouped by place
node scripts/check-owner-queue.mjs --routes desktop   # one kind, in either vocabulary
```

A kind filter goes straight to `--routes`. For a subject filter, run the plain `--routes` and keep
the items whose title or file name matches. Read the item files only for the place you are about
to walk. Never re-sort or regroup by eye: the script gives every session the same order, so he can
tell new work from a reshuffle.

If nothing is open, or nothing matches the filter, say so in one line and stop. An empty list is
a real answer.

## 2. Present the places, the phone list first

Three lists, in the script's order, never merged:

1. **From your phone**: quick looks he answers in a sentence. First, because they cost him least
   and he can clear them anywhere.
2. **At the computer**: desktop or production checks with the product on screen.
3. **Only you can decide these**: decisions, one flat list. Show `needs:` beside each, so a wrong
   reason is visible to him.

Inside the first two lists he picks a place, not an item. Give each place one line with its count
and how many serve NOW, and read out the items in a place only once he picks it:

```
From your phone: 8 items in 3 places
  1. A checkout (3, 1 NOW): a command to run or a file to read
  2. The public site (3): noacg.studio
  3. The studio (2): /app
```

Mention the open legacy `agent` and `hardware` counts in one clause. Hardware items are walked
only on `/walk hardware`. `done: true` items are never shown.

## 3. Walk a place: open it once, settle everything on it

For the place he picks, or the first one if he says "go":

1. Get him in front of it once: the URL, the screen or the file. For a local route, start this
   checkout's server with `npm run dev:worktree` if none is up. If an item's work sits on an
   unmerged branch, say so and name the branch. Do not switch anything.
2. Take its items in order. For each, say in one sentence what varies (the file to drop, the field
   to type into) and what to look at.
3. Wait. Do not narrate what he should see or judge it for him. His judgment is the point.
4. Record his answer item by item. A place is a way of arriving, never one verdict.
   - **Checked or OK**: delete the file at once, unless he names a follow-up. Never keep an item
     open because he has not reproduced every environment himself.
   - **A follow-up**: write it into the item word for word. The item stays.
   - **Feedback**: write it into the item word for word and turn it into work, a fix now if it is
     small and in scope, otherwise a `docs/backlog/` item. Say which. The item stays until that
     work lands. Then mark it `answered: true` if he should look again, or verify the fix yourself
     and delete the item if an agent can.
   - **A decision**: write it where the work that depends on it will read it (the plan doc, the
     backlog item or the commit), then delete the item.
   - **Not now**: leave the file exactly as it is.

When an item's route leads somewhere else, follow it to the end, then rewrite its route section
to name the place it really opens, in the same commit. The place is derived from the route text,
so that one line is the whole repair. Never add a key only the presentation reads.

Then the next item. When the place is empty, offer the next place.

Legacy `agent` items are not his: an agent settles each one by driving its route itself (front
the browser pane first, since a hidden pane renders no frames) and deleting the item, with a commit
that says what it checked and what it saw.

## 4. Filing is not this workflow's job

Whether an item is filed at all is decided in `.agent-workflows/verify.md`, step 5. Its kind and
shape are in `docs/acceptance/OWNER_QUEUE.md`.

## 5. Finish

One short report: which places were walked and what is left in each, which items were settled and
deleted, what feedback was captured and where it went (name the fix or the backlog file). Then the
ordinary wrap-up.
