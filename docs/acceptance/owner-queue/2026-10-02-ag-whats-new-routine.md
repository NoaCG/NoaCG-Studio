---
kind: desktop
date: 2026-10-02
because: money
answered: false
---
# Create the twice-weekly What's new routine

The public page `/whats-new` is built from notes in `docs/whats-new/`, and it only stays alive if
somebody writes one about twice a week. A scheduled task can do it cheaply: one command gathers what
landed, the session writes a dozen bullets at most, and the build refuses a note that reads like a
pull request list. Agents may not create scheduled tasks, so this one is yours to create, or to
decline.

## What it costs and what it changes

- One short Claude Code run on Mondays and Thursdays, on this machine, while the app is open.
- It writes a tracked file on a branch and queues it, like the monthly quality review does. That is
  a second exception to "routines report; sessions write" in `docs/ROUTINES.md`. If you create the
  routine, the next session that touches `docs/ROUTINES.md` adds it to the table and names the
  exception, limited to `docs/whats-new/`. If you decline, the notes are written by hand from the
  same draft command, and nothing else changes.

## The route, about five minutes

In the Claude desktop app, create a scheduled task with the id `whats-new-twice-weekly`, on Mondays
and Thursdays at 08:30, in the NoaCG Studio repository, with exactly this prompt:

```text
Write this week's What's new update for NoaCG Studio, and land it.

1. Work in a fresh worktree on a new branch named claude/whats-new-<today's date>, cut from a
   freshly fetched origin/main. Never write in the primary checkout.
2. Run: npm run whats-new:draft
   It prints what landed on origin/main since the newest note in docs/whats-new/, grouped by
   area, and what the CLI and Bridge changelogs already say. It is raw material, not the note.
3. If nothing in it is a change a user would notice, stop and say "No What's new update: nothing
   big landed." Write nothing.
4. Otherwise write docs/whats-new/<today's date>.md following docs/whats-new/README.md: only the
   biggest changes, areas in the fixed order and an empty area left out, short plain bullets about
   what changed for the user. Every claim must be true today: check it against the current state
   in docs/GOALS.md, and count a CLI or Bridge change only once that version is released. Public
   text: nothing from docs/private/, no partner, customer or show names, no people, no dates, no
   hype and no em dashes.
5. Run: npm run check:whats-new
   Fix every line it refuses, and run it again until it passes. Then run
   node --test scripts/whats-new.test.mjs
6. Commit the one new file with a plain message such as "Add the What's new update for
   <date>", then run /queue-merge as your last action. Touch no other file.
```

## Done when

The task exists with that prompt and schedule, or you have said no here. Either answer closes this
item.
