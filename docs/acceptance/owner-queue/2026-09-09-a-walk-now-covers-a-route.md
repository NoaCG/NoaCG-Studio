---
kind: walk
date: 2026-09-09
---
# A walk now covers a route, not an item

**Date:** 2026-09-09 · **Branch:** `claude/w-walk-covers-a-route`

## What changed

`/walk` used to take you through the queue one item at a time, and each item opened its own route.
That was 64 open items and 64 trips. Reading what those items actually say, 28 of them - 22 of them
on the current push - start with the same four clicks: open the studio, Import graphic, drop a file.

So a walk now offers you a PLACE rather than an item: "Import graphic (28), the studio (12), a
checkout (9), then /docs, GitHub and the public site". You pick one, it gets opened once, and every
item on it is settled without going back to the front page in between. Each item is still ticked or
answered on its own - the group is a way of arriving, not one verdict over 28 things.

Nothing was added to the items to make this work. The place is read off the route line each item
already wrote, so nothing had to be back-filled and no session has a new key to remember.

## The route, under a minute

```bash
node scripts/check-owner-queue.mjs --routes
```

That is exactly what a walk now reads. Or just run `/walk` and look at what it offers you first.

**What to look at.** Whether the groups match how you would actually sit down and do this. Three
specific things:

- **Is "Import graphic" one job or 28?** The bet is that dropping 28 files onto the same wizard in
  one sitting is far cheaper than 28 separate walks. If it instead reads as a wall you would never
  start, the grouping is wrong for you and the fix is to cap what a place offers in one go.
- **The order.** Places holding NOW items lead, then the biggest. Not the newest.
- **"A checkout" (9 items)** puts commands to run and documents to read in one place. Those two
  might not belong together for you.

Items nobody else shares a route with are grouped last as "On their own" and walked exactly as
before.
