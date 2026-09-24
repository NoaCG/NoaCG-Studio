---
kind: walk
date: 2026-09-24
because: taste
---
# A coding agent sends a whole graphics package; it waits on Home with an Install button

**Date:** 2026-09-24 · **Branch:** `claude/funny-mccarthy-nt1jb1`

## What changed

A coding agent (Claude Code, Codex, or anything running the NoaCG CLI) can now send a whole
graphics package - several graphics, their playout layers and a prepared cue rundown - straight
to your NoaCG Home: `noacg pack ./a ./b ./c --name "…" --save`. It appears on Home and on
Productions under **Waiting to install**. **Install** creates the production and opens its
rundown. The trash button dismisses it without installing. It works from any machine, a cloud
agent included, with the key `noacg login` already gave you; nothing to re-authorise. The skill
tells agents to do this whenever you ask for a package rather than one graphic.

## The route, under a minute

Needs: signed in on the deployed studio, and a key (`noacg login`). Until CLI 0.4.1 is on npm,
run it from this repository's build: `npm --prefix cli run build`, then use
`node cli/dist/index.js` wherever `noacg` appears.

1. `noacg pack ./graphic-a ./graphic-b --name "Walk test" --layer 10 --save` (any two package
   folders; `noacg scaffold --type lower-third --design neutral --out ./graphic-a` makes one).
   It prints "waiting on Home → Productions".
2. Open `/app` - the Home dashboard shows **Waiting to install: Walk test · 2 graphics**.
3. Press **Install**: the production page opens with both graphics and their cues.
4. Send it again and press the trash button, then **Dismiss?**: the row goes, nothing is created.

## What to look at

- **Whether the waiting row reads as "something arrived for me".** It sits above the production
  cards with an accent edge, on the dashboard as well as the full Productions page.
- **Whether Install should skip the click** and create the production directly. It was kept as a
  click on purpose (see below); say if you want it gone.

## Decided, so you can overrule a thing that exists

- **The package waits; the server never creates the production.** Install runs the studio's own
  installer, the same one a package file uses, so validation, layers and rundown are one piece of
  code. `docs/AGENT_SAVE.md` §7 has the reasoning.
- **No new permission.** A package only becomes a production when you press Install, so it rides
  the existing "create graphics" permission; its consent wording now names packages too.
- **At most 25 packages wait at once**; the 26th is refused with "install or dismiss some first".
