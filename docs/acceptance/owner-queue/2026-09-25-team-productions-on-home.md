---
kind: walk
date: 2026-09-25
because: taste
---
# Somebody invited to a team finds the team and everything it shares on Home, straight away

## What changed

Joining a team used to change nothing you could see: a team was reachable only from a production's
Share button, and a new member owns no production to open one from. Now:

- **Productions** splits into **My productions** and **Shared with my teams**. Each team has its own
  band, headed by the team's name, how many people are in it and whether it is yours, with its
  productions under it. Each team production wears the team's chip and "edited by Anna, 12:03".
- **Teams** appears in Home's left nav as soon as you are in a team: one card per team with who is
  in it, what it holds, and its join code.
- **Share -> Move to team** now works. The production leaves your own list and appears in the
  team's band for every member, with the same id and the same published links. Only the team owner
  can delete it or unpublish it; any member can edit, publish and operate it.
- Joining from a link lands on Home with the team's band already there. No reload, no search.
- Two people editing the same team production at once both keep their edits. If both change the
  same cue, the page says whose version stood.

A user who is in no team sees Home exactly as before, without the word "team" anywhere.

## The route, under a minute

Two accounts, A and B, on the same build (a second browser or a private window for B).

1. As A: Home -> Productions -> make a production -> **Share** -> **New team** -> create -> **Back**
   -> **Move to team**. Copy the join link.
2. As B: open the join link, type a name, **Join team**, **Done**.

## What to look at

- B's Productions page: is the team's band where you would look for it, and does
  "Shared with my teams" read clearly as "not mine"?
- B's **Teams** nav entry: is that the place you would expect to find "which teams am I in"?
- As A, the production page header: the Share button is now the team's button (people icon, the
  team's name on wide screens). Is that enough to tell a team production from your own?

From branch `claude/trusting-gauss-lvmbqw`. The two-account walk is also pinned by
`e2e/configured/teams.spec.ts` ("an invited teammate finds the team and its production on Home").
